// --- C 模式：purr 微信风聊天页（js/modules/c_mode.js） ---
// 界面样式与交互参考开源项目 purr（https://github.com/2005selene2005-a11y/purr，MIT License）
// 页面外观与 purr 一致：聊天/朋友圈双 tab、☺表情面板、＋/发送切换、红包拆开弹窗、已读回执。
// 数据与收发完全走 B 的链路：chat.history 单一数据源，角色与聊天内容与 A / B 模式实时同步。
// 与 purr 的差异（按需求定制）：AI 回复不拆条（一条回复一个气泡）；回复由触发按钮手动发起。
(function () {
    'use strict';

    // ==================== 模式开关 ====================
    // URL 参数 ?mode=c 可临时强制 C 模式（不动数据库，调试用）
    const urlModeOverride = (() => {
        try {
            const m = new URLSearchParams(location.search).get('mode');
            return (m === 'c') ? m : null;
        } catch (e) { return null; }
    })();
    const isEnabled = () => {
        if (urlModeOverride) return true;
        return typeof db !== 'undefined' && db && db.uiMode === 'c';
    };

    function mirrorMode(mode) {
        try { localStorage.setItem('mie_ui_mode', mode); } catch (e) { /* ignore */ }
    }

    // 供设置页 / 空状态按钮调用：直接切到指定模式并刷新
    async function setMode(mode) {
        if (typeof db === 'undefined' || !db) return;
        if (mode !== 'mie' && mode !== 'a' && mode !== 'c') return;
        db.uiMode = mode;
        mirrorMode(mode);
        try { await saveData(); } catch (e) { console.error('[CMode] saveData failed:', e); }
        if (typeof showToast === 'function') {
            showToast(mode === 'mie' ? '已切换到原生模式，即将刷新' : ('已切换到 ' + mode.toUpperCase() + ' 模式，即将刷新'));
        }
        // 地址栏里的 ?mode= 优先级比数据库高，不清掉会刷新回原模式
        try {
            const u = new URL(location.href);
            if (u.searchParams.has('mode')) {
                u.searchParams.delete('mode');
                history.replaceState(null, '', u.href);
            }
        } catch (e) { /* ignore */ }
        setTimeout(() => location.reload(), 600);
    }

    // ==================== 小工具 ====================
    const chatOf = (id, type) => (type === 'private')
        ? (db.characters || []).find(c => c.id === id)
        : (db.groups || []).find(g => g.id === id);

    const displayName = (chat) => (chat && chat.remarkName) ? chat.remarkName : (chat ? chat.name : '');

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // 文本里的 [微笑] 这类微信短码换成真图；表情资源没加载时退回纯文本
    const wxEm = (s) => {
        const t = String(s == null ? '' : s);
        return (window.WxEmoji && window.WxEmoji.count()) ? window.WxEmoji.render(t) : esc(t);
    };

    function fmtTime(ts) {
        const d = new Date(ts), n = new Date();
        const hm = d.toTimeString().slice(0, 5);
        if (d.toDateString() === n.toDateString()) return hm;
        const y = new Date(n.getTime() - 864e5);
        if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    }

    function cleanText(raw) {
        let t = String(raw == null ? '' : raw);
        t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/^<thinking>[\s\S]*/i, '');
        t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^<think>[\s\S]*/i, '');
        t = t.replace(/\[system:.*?\]/g, '');
        return t.trim();
    }

    // B 模式不渲染的隐形消息（与 a_mode.js 同一份清单：转账/礼物回执、动态、私聊频道标记等）
    const C_INVISIBLE_RE = new RegExp([
        /\[.*?(?:接收|退回)[\s\S]*?的转账.*?\]/.source,
        /\[.*?已接收礼物\]/.source,
        /\[system:.*?\]/.source,
        /\[系统情景通知[:：].*?\]/.source,
        /\[.*?更新开屏语[:：].*?\]/.source,
        /\[.*?同意了.*?的代付请求\]/.source,
        /\[.*?拒绝了.*?的代付请求\]/.source,
        /\[(?:.*?)\s*(?:发布了一条(?:带图)?动态|评论了.*?|回复.*?|更新了个性签名)[:：][\s\S]+?\]/.source,
        /\[Private: [\s\S]*?\]/.source,
        /\[Private-End:.*?\]/.source
    ].join('|'));

    const IMG_URL_RE = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)|data:image\/[a-z]+;base64,)/i;

    // 消息解析（参照 a_mode 的 displayOf）→ { who: 'me'|'ai'|'sys'|'hide', text, imgs?, stk?, pk?, name? }
    function displayOf(msg, chat) {
        chat = chat || chatOf(currentChatId, currentChatType);
        const raw = String(msg.content == null ? '' : msg.content);
        if (msg.role === 'system') {
            const sm = raw.match(/\[system-display:([\s\S]+?)\]/);
            return { who: 'sys', text: sm ? sm[1].trim() : cleanText(raw) };
        }
        if (msg.isWithdrawn) {
            const nm = (chat && (chat.remarkName || chat.name)) || '';
            return { who: 'sys', text: msg.role === 'user' ? '你撤回了一条消息' : (nm ? nm + '撤回了一条消息' : '对方撤回了一条消息') };
        }
        let m;
        if ((m = raw.match(/\[system-display:([\s\S]+?)\]/))) return { who: 'sys', text: m[1].trim() };
        // 事件类消息 → 系统通知样式（与 B / A 一致）
        if ((m = raw.match(/\[(视频|语音)通话记录[：:](.*?)[；;](.*?)[；;](.*?)\]/)))
            return { who: 'sys', text: (m[1] === '视频' ? '视频通话结束 ' : '语音通话结束 ') + m[3] };
        if ((m = raw.match(/\[(.*?)邀请(.*?)加入了群聊\]/)))
            return { who: 'sys', text: m[1] + '邀请' + m[2] + '加入了群聊' };
        if ((m = raw.match(/\[(.*?)修改群名为[：:](.*?)\]/)))
            return { who: 'sys', text: m[1] + '修改群名为“' + m[2] + '”' };
        if (C_INVISIBLE_RE.test(raw)) return { who: 'hide', text: '' };

        // 转账：私聊 [xxx给你转账：5元；备注：xx]，群聊 [我 向 张三 转账：5元；备注：xx]
        if ((m = raw.match(/\[(.*?)给你转账[：:]([\d.]+)[元圆]?(?:[；;]\s*备注[：:](.*?))?\]/))) {
            return {
                who: msg.role === 'user' ? 'me' : 'ai', text: '',
                tr: { amount: parseFloat(m[2]) || 0, note: (m[3] || '').trim(), state: msg.transferStatus || '' }
            };
        }
        if ((m = raw.match(/\[(.+?)\s*向\s*(.+?)\s*转账[：:]([\d.]+)[元圆]?(?:[；;]\s*备注[：:](.*?))?\]/))) {
            return {
                who: msg.role === 'user' ? 'me' : 'ai', text: '',
                tr: { amount: parseFloat(m[3]) || 0, note: (m[4] || '').trim(), to: m[2].trim(), state: msg.transferStatus || '' }
            };
        }

        // 红包：新版消息对象（type='red-packet'，group_chat.js / chat_ai.js 生成，带 remark/pool）优先
        if (msg.type === 'red-packet') {
            return { who: msg.role === 'user' ? 'me' : 'ai', pk: { note: msg.remark || '恭喜发财', opened: !!msg.isRevealed }, text: '' };
        }
        // 旧版纯文本红包格式（兼容「个数」可缺省）
        if ((m = raw.match(/\[(.*?)发出了一个拼手气红包[：:](.*?)元(?:[；;]\s*个数[：:](\d+)\s*个)?[；;]留言[：:](.*?)\]/)))
            return { who: msg.role === 'user' ? 'me' : 'ai', pk: { note: m[4] || '恭喜发财' }, text: '' };

        // 照片/视频（URL 列表）
        if ((m = raw.match(/\[(?:.+?)发来的照片\/视频[：:]([\s\S]+?)\]/))) {
            const urls = String(m[1]).split(/[\s,，]+/).map(s => s.trim()).filter(s => IMG_URL_RE.test(s));
            if (urls.length) return { who: msg.role === 'user' ? 'me' : 'ai', imgs: urls };
        }

        // 语音：有真实录音就放录音，没有（角色写的）就把文字念出来
        if (msg.voiceAudio && msg.voiceAudio.data) {
            const vm = raw.match(/\[(?:.+?)的语音[：:]([\s\S]+?)\]/);
            return {
                who: msg.role === 'user' ? 'me' : 'ai', text: '',
                voice: {
                    data: msg.voiceAudio.data,
                    duration: msg.voiceAudio.duration || 1,
                    transcript: vm ? vm[1].trim() : ''
                }
            };
        }
        if ((m = raw.match(/\[(?:.+?)的语音[：:]([\s\S]+?)\]/))) {
            const t = m[1].trim();
            return {
                who: msg.role === 'user' ? 'me' : 'ai', text: '',
                voice: { duration: calculateVoiceDuration(t), transcript: t }
            };
        }
        // 表情包：消息自带 stickerData（B 的 sendSticker 会带），否则按名字解析 myStickers
        if ((m = raw.match(/\[(?:.+?)发送的表情包[：:]([\s\S]+?)\]/i)) ||
            (m = raw.match(/\[(?:.*?的)?表情包[：:]([\s\S]+?)\]/i))) {
            const val = m[1].trim();
            const who = msg.role === 'user' ? 'me' : 'ai';
            if (IMG_URL_RE.test(val)) return { who, stk: val };
            if (msg.stickerData) return { who, stk: msg.stickerData };
            const st = (db.myStickers || []).find(s => s.name === val);
            if (st && (st.data || st.url)) return { who, stk: st.data || st.url };
            return { who, text: '[表情包：' + val + ']' };
        }

        // B 的图片消息：content 直接是 base64，真正的说明在 parts 里
        if (Array.isArray(msg.parts) && msg.parts.some(p => p.type === 'image')) {
            const urls = msg.parts.filter(p => p.type === 'image' && p.data).map(p => p.data);
            if (urls.length) return { who: msg.role === 'user' ? 'me' : 'ai', imgs: urls };
        }

        let text = cleanText(raw);
        // [xxx的消息：yyy]（与 B 的 textRegex 一致）→ 只留正文
        // 整条就是这一个包裹时贪婪到最后一个 ]，否则正文里的 [微笑] 会把消息截断
        let wrapName = '';
        const wm = text.match(/^\s*\[(.+?)的消息[：:]([\s\S]+)\]\s*$/) ||
            text.match(/\[(.+?)的消息[：:]([\s\S]+?)\]/);
        if (wm) { wrapName = wm[1].trim(); text = wm[2].trim(); }
        text = text.replace(/\[发送时间[:：].*?\]/g, '').trim();
        if (!text && msg.parts) text = msg.parts.filter(p => p.type === 'text').map(p => p.text).join('');
        if (msg.role === 'user') return { who: 'me', text };
        // 开屏语指令不显示在聊天流里
        text = text.replace(/\[.*?更新开屏语[:：][\s\S]*?\]/g, '').trim();
        let name = '';
        if (chat && chat.members && msg.senderId) {
            const mem = chat.members.find(x => x.id === msg.senderId);
            if (mem) name = mem.groupNickname || mem.name || '';
        }
        if (!name && wrapName && chat && chat.members) name = wrapName;
        return { who: 'ai', text, name };
    }

    // ==================== 已读回执（C 界面内存态，不写进共享数据） ====================
    const readIds = new Set();
    function markAllRead(chat) {
        (chat && chat.history || []).forEach(msg => { if (msg.role === 'user') readIds.add(msg.id); });
    }

    // ==================== 外壳状态 ====================
    const C_TAB_TITLE = { chats: '微信', contacts: '通讯录', discover: '朋友圈', me: '我' };
    let cPage = 'chat';           // 'chat' 聊天页 / 'home' 微信式主页
    let cTab = 'chats';           // chats | contacts | discover | me
    let homeQuery = '';           // 主页搜索框内容
    let homeTabBuilt = '';        // 已建好外壳的 tab
    let homeHtml = '';            // 上一次的内容快照（变了才重绘）
    let pageCfg = null;           // 子页面配置
    let pageImg = '';             // 子页面里选的图
    let moSeenTs = (() => {
        try { return Number(localStorage.getItem('mie_c_mo_seen') || 0) || 0; } catch (e) { return 0; }
    })();

    // ==================== 图标（微信线稿风） ====================
    const IC = {
        // 微信底栏三件套：语音（喇叭+声波）/ 键盘 / 笑脸，都装在圆圈里
        wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.33"/><path d="M7.9 12 9.84 10.66v2.7Z" fill="currentColor" stroke-width=".3"/><path d="M11.13 9.14a4.62 4.62 0 0 1 0 5.72"/><path d="M13.13 7.1a7.82 7.82 0 0 1 0 9.8"/></svg>',
        keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><g fill="currentColor" stroke="none"><circle cx="8.4" cy="9.6" r=".9"/><circle cx="11" cy="9.6" r=".9"/><circle cx="13.6" cy="9.6" r=".9"/><circle cx="16.2" cy="9.6" r=".9"/><circle cx="8.4" cy="12.2" r=".9"/><circle cx="11" cy="12.2" r=".9"/><circle cx="13.6" cy="12.2" r=".9"/><circle cx="16.2" cy="12.2" r=".9"/><rect x="8" y="14.2" width="8" height="1.8" rx=".9"/></g></svg>',
        smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.33"/><g fill="currentColor" stroke="none"><circle cx="8.47" cy="8.97" r="1.51"/><circle cx="15.53" cy="8.97" r="1.51"/></g><path d="M6.71 13.13h10.58a5.29 4.67 0 0 1-10.58 0Z"/></svg>',
        // 表情面板分类行的爱心（微信线稿：宽 21 / 高 18.3 / 线宽 1.8）；和下面那个实心红心不是一回事
        heartLn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.55A4.8 4.8 0 1 0 3.78 11.92L12 20.25L20.22 11.92A4.8 4.8 0 1 0 12 8.55Z"/></svg>',
        keyboardPlain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2.4"/><g fill="currentColor" stroke="none"><circle cx="6.4" cy="9.6" r=".85"/><circle cx="9.4" cy="9.6" r=".85"/><circle cx="12.4" cy="9.6" r=".85"/><circle cx="15.4" cy="9.6" r=".85"/><circle cx="18" cy="9.6" r=".85"/><circle cx="6.4" cy="12.4" r=".85"/><circle cx="9.4" cy="12.4" r=".85"/><circle cx="12.4" cy="12.4" r=".85"/><circle cx="15.4" cy="12.4" r=".85"/><circle cx="18" cy="12.4" r=".85"/><rect x="8" y="14.6" width="8" height="1.7" rx=".85"/></g></svg>',
        del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.4 5.6h12.2v12.8H8.4L2.8 12Z"/><path d="m11.6 9.4 5 5.2M16.6 9.4l-5 5.2"/></svg>',
        // 语音气泡里的声波（不带圆圈）
        wavePlain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 7.6 5.6 12l3.8 4.4z" fill="currentColor" stroke="none"/><path d="M13 8.6a4.6 4.6 0 0 1 0 6.8"/><path d="M16.2 6a8.6 8.6 0 0 1 0 12"/></svg>',
        back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="15.5 5 8 12 15.5 19"/></svg>',
        chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9.5 5 16.5 12 9.5 19"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        dots3: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
        dots3h: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5.6" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.4" cy="12" r="1.9"/></svg>',
        star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.8 14.4 8.9 20 9.6 16 13.4 17 19 12 16.3 7 19 8 13.4 4 9.6 9.6 8.9Z"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="12" cy="12" r="9.33"/><path d="M12 7.58v8.84M7.58 12h8.84"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/></svg>',
        heart: '<svg viewBox="0 0 24 24" fill="#fa5151" stroke="none"><path d="M12 20s-7.4-4.6-7.4-9.3A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.4 2.6C19.4 15.4 12 20 12 20Z"/></svg>',
        cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.6 8.2h3.1l1.5-2h7.6l1.5 2h3.1v10.4H3.6Z"/><circle cx="12" cy="13.2" r="3.4"/></svg>',
        tabChats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 4.6c-3.8.3-6.8 2.9-6.8 6 0 1.9 1.1 3.6 2.8 4.7l-.7 2.2 2.4-1.3c.7.2 1.5.3 2.3.3"/><path d="M21.4 11.4c0-3-2.9-5.4-6.5-5.4s-6.5 2.4-6.5 5.4 2.9 5.4 6.5 5.4c.8 0 1.5-.1 2.2-.3l2.2 1.2-.6-1.9c1.7-1 2.7-2.5 2.7-4.4Z"/><circle cx="12.5" cy="10.9" r=".95" fill="currentColor" stroke="none"/><circle cx="16.3" cy="10.9" r=".95" fill="currentColor" stroke="none"/></svg>',
        tabContacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9.4" cy="8.6" r="3.3"/><path d="M3.8 19.4c.5-3 2.8-4.8 5.6-4.8s5.1 1.8 5.6 4.8"/><circle cx="17.2" cy="9.8" r="2.3"/><path d="M16.8 14.5c2 .4 3.3 1.9 3.6 3.9"/></svg>',
        tabDiscover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M15.6 8.4 13.7 13.7 8.4 15.6l1.9-5.3Z"/></svg>',
        tabMe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8.2" r="3.6"/><path d="M5.4 19.6c.7-3.4 3.4-5.4 6.6-5.4s5.9 2 6.6 5.4"/></svg>'
    };

    // ==================== 应用外壳：聊天页（全屏）+ 微信式主页（四底栏）+ 子页面 ====================
    function buildCApp() {
        if (document.getElementById('c-app')) return;
        const app = document.createElement('div');
        app.id = 'c-app';
        app.innerHTML = `
            <section class="c-view on" id="c-cv">
                <header class="c-header">
                    <button class="c-hbtn" id="c-back" title="返回">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="15.5 5 8 12 15.5 19"/></svg>
                    </button>
                    <div class="c-title"><span id="c-name">…</span><small id="c-state"></small></div>
                    <button class="c-hbtn c-right" id="c-more" title="更多">
                        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
                    </button>
                </header>
                <div id="c-list"></div>
                <div id="c-typing">对方正在输入…</div>
                <footer class="c-foot">
                    <button class="c-btn" id="c-voice" title="语音">${IC.wave}</button>
                    <div class="c-inpwrap">
                        <textarea id="c-inp" rows="1" placeholder=""></textarea>
                        <div class="c-hold" id="c-hold">按住 说话</div>
                        <button class="c-mic" id="c-mic" title="语音输入">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="10.1" y="6.9" width="3.8" height="7.6" rx="1.9"/><path d="M7.5 12.7a4.5 4.5 0 0 0 9 0"/><path d="M12 17.2v2.6"/></svg>
                        </button>
                    </div>
                    <button class="c-btn" id="c-stk" title="表情包">${IC.smile}</button>
                    <button class="c-btn" id="c-imgbtn" title="更多">${IC.plus}</button>
                    <button class="c-send" id="c-send">发送</button>
                </footer>
                <div class="c-sheet" id="c-panel">
                    <div class="c-sheet-in">
                        <div class="c-em-cats" id="c-em-cats"></div>
                        <div class="c-em-body" id="c-em-body"></div>
                        <div class="c-em-tools">
                            <button class="c-em-del" id="c-em-del" title="删除">${IC.del}</button>
                            <button class="c-em-send" id="c-em-send">发送</button>
                        </div>
                    </div>
                </div>
                <div class="c-sheet" id="c-fns">
                    <div class="c-sheet-in">
                        <div class="c-fn-scroll" id="c-fn-scroll"></div>
                        <div class="c-fn-dots" id="c-fn-dots"></div>
                    </div>
                </div>
                <div id="c-rec">
                    <div class="c-rec-bub"><div class="c-rec-wave" id="c-rec-wave"></div></div>
                    <div class="c-rec-arc">
                        <div class="c-rec-zone" id="c-rec-cancel">取消</div>
                        <div class="c-rec-zone" id="c-rec-txt">滑到这里 转文字</div>
                    </div>
                    <div class="c-rec-tip" id="c-rec-tip">松开 发送</div>
                </div>
            </section>
            <section class="c-view" id="c-hv">
                <header class="c-header">
                    <button class="c-hbtn" id="c-modebtn" title="切换界面">${IC.star}</button>
                    <div class="c-title"><span id="c-home-title">微信</span></div>
                    <button class="c-hbtn c-right" id="c-addbtn" title="添加">${IC.plus}</button>
                </header>
                <div id="c-home-body"></div>
                <nav class="c-tabbar">
                    <button class="c-tab on" data-tab="chats">${IC.tabChats}<span>微信</span><i class="c-bd" id="c-dot-chats"></i></button>
                    <button class="c-tab" data-tab="contacts">${IC.tabContacts}<span>通讯录</span></button>
                    <button class="c-tab" data-tab="discover">${IC.tabDiscover}<span>发现</span><i class="c-bd" id="c-dot-mo"></i></button>
                    <button class="c-tab" data-tab="me">${IC.tabMe}<span>我</span></button>
                </nav>
            </section>
            <section class="c-page" id="c-page">
                <header class="c-header">
                    <button class="c-hbtn" id="c-page-l" title="取消">${IC.close}</button>
                    <div class="c-title"><span id="c-page-title"></span></div>
                    <button class="c-hbtn c-right c-pgact" id="c-page-r">发送</button>
                </header>
                <div id="c-page-body"></div>
            </section>
            <div class="c-zoom" id="c-zoom"><img alt=""></div>
            <div class="c-modal" id="c-m-pk">
                <div class="c-pkopen">
                    <div id="c-pkfrom"></div><small id="c-pknote"></small>
                    <div class="amt" id="c-pkamt"></div><small id="c-pkbal"></small>
                </div>
            </div>
        `;
        document.body.appendChild(app);

        // --- 聊天页顶栏 ---
        document.getElementById('c-back').addEventListener('click', openCHome);
        document.getElementById('c-more').addEventListener('click', (e) => {
            openCMenu(e.currentTarget, [
                { t: '让 TA 回复', f: () => cTrigger() }
            ]);
        });

        // --- 主页：底栏 + 顶栏两颗按钮 + 列表点击（事件委托，重绘后仍有效） ---
        document.querySelectorAll('#c-hv .c-tab').forEach(btn => btn.addEventListener('click', () => setCTab(btn.dataset.tab)));
        document.getElementById('c-modebtn').addEventListener('click', (e) => modeMenu(e.currentTarget));
        document.getElementById('c-addbtn').addEventListener('click', (e) => {
            if (cTab === 'discover') { cComposeMoment(); return; }
            openCMenu(e.currentTarget, [
                { t: '发起聊天', f: () => setCTab('contacts') },
                { t: '切换界面', f: () => modeMenu(e.currentTarget) }
            ]);
        });
        const homeBody = app.querySelector('#c-home-body');
        homeBody.addEventListener('click', onHomeClick);
        homeBody.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'c-q') { homeQuery = e.target.value; renderCHome(true); }
        });

        // --- 子页面（转账 / 红包 / 发朋友圈 / 评论） ---
        document.getElementById('c-page-l').addEventListener('click', closeCPage);
        document.getElementById('c-page-r').addEventListener('click', () => {
            if (pageCfg && typeof pageCfg.onOk === 'function') {
                try { pageCfg.onOk(document.getElementById('c-page-body')); } catch (e) { console.error('[CMode] page ok failed:', e); }
            }
        });

        // --- 图片放大 ---
        const zoom = app.querySelector('#c-zoom');
        zoom.addEventListener('click', () => zoom.classList.remove('on'));

        // --- 输入栏（微信：语音 / 输入框+麦克风 / ☺ / ＋，有字时 ＋ 换成发送） ---
        const box = app.querySelector('#c-inp');
        const send = app.querySelector('#c-send');
        send.addEventListener('click', () => cSend());
        // Enter 发送（桌面端；移动端用发送键），Shift+Enter 换行；输入法组合中不触发
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) {
                e.preventDefault(); cSend();
            }
        });
        box.addEventListener('input', () => {
            syncSendBtn();
            box.style.height = '40px';
            box.style.height = Math.min(120, box.scrollHeight) + 'px';
        });
        // 点输入框＝收回底部面板（微信：键盘顶掉面板）
        box.addEventListener('pointerdown', closeSheets);
        app.querySelector('#c-stk').addEventListener('click', () => toggleSheet('em'));
        app.querySelector('#c-imgbtn').addEventListener('click', () => toggleSheet('more'));
        app.querySelector('#c-em-del').addEventListener('click', emBackspace);
        app.querySelector('#c-em-send').addEventListener('click', () => cSend());
        app.querySelector('#c-voice').addEventListener('click', () => setVoiceMode(!cVoiceMode));
        app.querySelector('#c-mic').addEventListener('click', toggleDictation);
        const holdBtn = app.querySelector('#c-hold');
        holdBtn.addEventListener('pointerdown', holdDown);
        holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());
        app.querySelector('#c-list').addEventListener('click', (e) => {
            const vb = e.target.closest('.c-bub.voice');
            if (vb) cPlayVoice(vb);
        });

        // --- 红包点击（事件委托，整列表重建后仍有效） ---
        app.querySelector('#c-list').addEventListener('click', (e) => {
            const pk = e.target.closest('.c-pk');
            if (!pk) return;
            const msg = findMsgById(pk.dataset.mid);
            if (msg) openPk(msg);
        });

        // --- 拆红包弹窗：点背景关闭（purr：onclick="hide('m-pk')"） ---
        app.querySelector('#c-m-pk').addEventListener('click', () => {
            app.querySelector('#c-m-pk').classList.remove('on');
        });
    }

    // ==================== 浮出小菜单（贴在按钮下面，不加遮罩） ====================
    let menuEl = null;
    function closeCMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
    function openCMenu(anchor, items) {
        closeCMenu();
        const app = document.getElementById('c-app');
        if (!app) return;
        menuEl = document.createElement('div');
        menuEl.className = 'c-menu';
        menuEl.innerHTML = items.map((it, i) => '<button data-i="' + i + '">' + esc(it.t) + '</button>').join('');
        app.appendChild(menuEl);
        const ar = anchor.getBoundingClientRect();
        const mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
        let top = ar.bottom + 6;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, ar.top - mh - 6);
        menuEl.style.top = top + 'px';
        menuEl.style.left = Math.max(8, Math.min(ar.right - mw, window.innerWidth - mw - 8)) + 'px';
        menuEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            const it = items[+b.dataset.i];
            closeCMenu();
            try { it.f(); } catch (e) { console.error('[CMode] menu action failed:', e); }
        }));
        // 点别处收起
        setTimeout(() => {
            const away = (ev) => {
                if (!menuEl) { document.removeEventListener('pointerdown', away, true); return; }
                if (menuEl.contains(ev.target) || anchor.contains(ev.target)) return;
                closeCMenu();
                document.removeEventListener('pointerdown', away, true);
            };
            document.addEventListener('pointerdown', away, true);
        }, 0);
    }

    // ==================== 发图片（走 B 的识图链路，自己带一个隐藏的选图框） ====================
    let imgInput = null;
    function pickCImage() {
        if (typeof sendImageForRecognition !== 'function') {
            if (typeof showToast === 'function') showToast('这个界面暂时发不了图片');
            return;
        }
        if (typeof isGenerating !== 'undefined' && isGenerating) {
            if (typeof showToast === 'function') showToast('对方正在回复，等一下再发');
            return;
        }
        if (!imgInput) {
            imgInput = document.createElement('input');
            imgInput.type = 'file';
            imgInput.accept = 'image/*';
            imgInput.style.display = 'none';
            document.body.appendChild(imgInput);
            imgInput.addEventListener('change', async () => {
                const f = imgInput.files && imgInput.files[0];
                imgInput.value = '';
                if (!f) return;
                try {
                    const url = (typeof compressImage === 'function')
                        ? await compressImage(f, { quality: 0.8, maxWidth: 1024, maxHeight: 1024 })
                        : await new Promise((res, rej) => {
                            const fr = new FileReader();
                            fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f);
                        });
                    await sendImageForRecognition(url);
                    scheduleSync(true);
                } catch (e) {
                    console.error('[CMode] image send failed:', e);
                    if (typeof showToast === 'function') showToast('图片没发出去');
                }
            });
        }
        imgInput.click();
    }

    // ==================== 语音：底栏切换 / 按住说话 / 框内麦克风转文字 ====================
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let cVoiceMode = false;   // false = 打字，true = 按住说话
    let hold = null;          // 按住说话的一次进行中状态
    let dict = null;          // 麦克风转文字的进行中状态
    let waveTimer = null;
    let cVoiceAudioEl = null;

    function setVoiceMode(on) {
        cVoiceMode = !!on;
        const foot = document.querySelector('#c-app .c-foot');
        if (!foot) return;
        foot.classList.toggle('voice', cVoiceMode);
        document.getElementById('c-voice').innerHTML = cVoiceMode ? IC.keyboard : IC.wave;
        if (cVoiceMode) {
            stopDictation();
            const box = document.getElementById('c-inp');
            if (box) box.blur();
        }
        syncSendBtn();
    }

    // ---- 录音浮层 ----
    function recEl() { return document.getElementById('c-rec'); }
    function startWave() {
        const w = document.getElementById('c-rec-wave');
        if (!w) return;
        if (w.children.length !== 26) {
            let bars = '';
            for (let i = 0; i < 26; i++) bars += '<i></i>';
            w.innerHTML = bars;
        }
        stopWave();
        const list = w.querySelectorAll('i');
        waveTimer = setInterval(() => {
            list.forEach(b => { b.style.height = (4 + Math.random() * 15) + 'px'; });
        }, 90);
    }
    function stopWave() { if (waveTimer) { clearInterval(waveTimer); waveTimer = null; } }
    function setRecTarget(t) {
        if (!hold) return;
        hold.target = t;
        const el = recEl();
        el.classList.toggle('cancel', t === 'cancel');
        el.classList.toggle('text', t === 'text');
        const cz = document.getElementById('c-rec-cancel');
        const tz = document.getElementById('c-rec-txt');
        if (cz) cz.classList.toggle('hot', t === 'cancel');
        if (tz) tz.classList.toggle('hot', t === 'text');
        document.getElementById('c-rec-tip').textContent =
            t === 'cancel' ? '松开 取消' : t === 'text' ? '松开 转文字' : '松开 发送';
    }
    function zoneAt(x, y) {
        const hit = (id) => {
            const r = document.getElementById(id).getBoundingClientRect();
            return x >= r.left - 14 && x <= r.right + 14 && y >= r.top - 26 && y <= r.bottom + 26;
        };
        if (hit('c-rec-cancel')) return 'cancel';
        if (hit('c-rec-txt')) return 'text';
        return 'send';
    }
    function holdMove(e) {
        if (!hold || hold.busy) return;
        const t = zoneAt(e.clientX, e.clientY);
        if (t !== hold.target) setRecTarget(t);
    }

    function holdDown(e) {
        if (hold) return;
        if (e.button) return;
        if (e.cancelable) e.preventDefault();
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) { cToast('先打开一个聊天'); return; }
        hold = { target: 'send', busy: false, t0: Date.now(), stream: null, mr: null, chunks: [],
            recog: null, keepDict: false, final: '', transcript: '', drop: false, noMic: '' };
        hold.maxT = setTimeout(() => holdUp(), 60000);   // 最长 60 秒，和微信一样自动发出去
        recEl().classList.add('on');
        setRecTarget('send');
        startWave();
        window.addEventListener('pointermove', holdMove, true);
        window.addEventListener('pointerup', holdUp, true);
        window.addEventListener('pointercancel', holdUp, true);
        holdStartRec();
    }

    async function holdStartRec() {
        const st = hold;
        if (!st) return;
        try {
            if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
                throw new Error('这个浏览器不支持录音');
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // 等麦克风期间可能已经松手了：直接把流还回去，不要留下野录音
            if (hold !== st) { stream.getTracks().forEach(t => t.stop()); return; }
            st.stream = stream;
            let mime = '';
            for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
                if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
            }
            st.mr = mime ? new MediaRecorder(st.stream, { mimeType: mime }) : new MediaRecorder(st.stream);
            st.mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) st.chunks.push(ev.data); };
            st.mr.start(250);
            holdDictStart(st);
        } catch (err) {
            if (hold !== st) return;
            // 麦克风打不开也先让浮层待着：按住就该一直显示，等松手再提示
            st.noMic = (err && err.message) ? err.message : '打不开麦克风';
        }
    }

    function holdAbort() {
        stopWave();
        window.removeEventListener('pointermove', holdMove, true);
        window.removeEventListener('pointerup', holdUp, true);
        window.removeEventListener('pointercancel', holdUp, true);
        const st = hold;
        hold = null;
        if (st) {
            clearTimeout(st.maxT);
            st.keepDict = false;
            if (st.recog) { try { st.recog.stop(); } catch (e) { /* ignore */ } }
            if (st.stream) { st.stream.getTracks().forEach(t => t.stop()); }
        }
        const el = recEl();
        if (el) { el.classList.remove('on'); el.classList.remove('cancel'); el.classList.remove('text'); }
    }

    // 录音同时后台识别文字：给「转文字」用，也让 AI 读得懂这条语音
    function holdDictStart(st) {
        if (!SR) return;
        try {
            const r = new SR();
            r.lang = localStorage.getItem('voice_lang') || 'zh-CN';
            r.continuous = true;
            r.interimResults = true;
            r.onresult = (ev) => {
                let fin = '', inter = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const t = ev.results[i][0].transcript;
                    if (ev.results[i].isFinal) fin += t; else inter += t;
                }
                st.final += fin;
                st.transcript = (st.final + inter).trim();
            };
            r.onerror = () => { /* 识别挂了不影响录音 */ };
            r.onend = () => { if (st.keepDict) { try { r.start(); } catch (e) { /* ignore */ } } };
            st.keepDict = true;
            r.start();
            st.recog = r;
        } catch (e) { st.recog = null; }
    }

    function holdStopRec(st) {
        return new Promise((resolve) => {
            const cleanup = (res) => {
                if (st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; }
                st.mr = null;
                resolve(res);
            };
            if (!st.mr || st.mr.state === 'inactive') { cleanup(null); return; }
            const mr = st.mr;
            mr.onstop = () => {
                if (st.drop) { cleanup(null); return; }
                const blob = new Blob(st.chunks, { type: mr.mimeType || 'audio/webm' });
                if (!blob.size) { cleanup(null); return; }
                const duration = Math.max(1, Math.round((Date.now() - st.t0) / 1000));
                const rd = new FileReader();
                rd.onload = () => resolve({ dataUrl: rd.result, duration });
                rd.onerror = () => cleanup(null);
                rd.readAsDataURL(blob);
            };
            try { mr.stop(); } catch (e) { cleanup(null); }
        });
    }

    async function holdUp(e) {
        const st = hold;
        if (!st || st.busy) return;
        st.busy = true;
        const ms = Date.now() - st.t0;
        let target = st.target;
        if (e && e.type === 'pointercancel') target = 'cancel';   // 系统打断 = 取消，不乱发
        clearTimeout(st.maxT);
        st.keepDict = false;
        if (st.recog) { try { st.recog.stop(); } catch (e) { /* ignore */ } st.recog = null; }
        stopWave();
        window.removeEventListener('pointermove', holdMove, true);
        window.removeEventListener('pointerup', holdUp, true);
        window.removeEventListener('pointercancel', holdUp, true);
        st.drop = target === 'cancel';
        const res = await holdStopRec(st);
        hold = null;
        recEl().classList.remove('on');
        recEl().classList.remove('cancel');
        recEl().classList.remove('text');
        if (target === 'cancel') return;
        if (st.noMic) { cToast('录音失败：' + st.noMic); return; }
        if (ms < 1000) { cToast('说话时间太短'); return; }
        if (!res || !res.dataUrl) { cToast('没录到声音'); return; }
        const txt = (st.transcript || '').trim();
        if (target === 'text') {
            if (!SR) { cToast('这个浏览器不能转文字'); return; }
            if (!txt) { cToast('没听清你说了什么'); return; }
            setVoiceMode(false);
            const box = document.getElementById('c-inp');
            const old = (box.value || '').trim();
            box.value = old ? old + ' ' + txt : txt;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            box.focus();
            return;
        }
        if (typeof sendMyRawVoiceMessage !== 'function') { cToast('这里暂时发不了语音'); return; }
        sendMyRawVoiceMessage(res.dataUrl, res.duration, txt);
    }

    // ---- 输入框里的麦克风：点亮就直接听写，文字进输入框，不弹任何窗 ----
    function toggleDictation() {
        if (dict) { stopDictation(); return; }
        if (!SR) { cToast('这个浏览器不支持语音转文字'); return; }
        const box = document.getElementById('c-inp');
        dict = { base: box.value || '', final: '', recog: null, keep: false };
        try {
            const r = new SR();
            r.lang = localStorage.getItem('voice_lang') || 'zh-CN';
            r.continuous = true;
            r.interimResults = true;
            r.onresult = (ev) => {
                let fin = '', inter = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const t = ev.results[i][0].transcript;
                    if (ev.results[i].isFinal) fin += t; else inter += t;
                }
                dict.final += fin;
                box.value = dict.base + dict.final + inter;
                box.dispatchEvent(new Event('input', { bubbles: true }));
            };
            r.onerror = (ev) => {
                if (ev && ev.error === 'not-allowed') { cToast('麦克风权限被拒绝'); stopDictation(); }
            };
            r.onend = () => { if (dict && dict.keep) { try { r.start(); } catch (e) { /* ignore */ } } };
            r.start();
            dict.keep = true;
            dict.recog = r;
            document.getElementById('c-mic').classList.add('on');
        } catch (e) {
            dict = null;
            cToast('语音转文字启动失败');
        }
    }

    function stopDictation() {
        if (!dict) return;
        dict.keep = false;
        if (dict.recog) { try { dict.recog.stop(); } catch (e) { /* ignore */ } }
        dict = null;
        const m = document.getElementById('c-mic');
        if (m) m.classList.remove('on');
    }

    // ---- 语音气泡：有录音放录音，没有就让角色把文字念出来 ----
    function stopVoicePlay(el) {
        if (el) el.classList.remove('playing');
        if (cVoiceAudioEl) { try { cVoiceAudioEl.pause(); } catch (e) { /* ignore */ } }
        if (window.MinimaxVoice) { try { window.MinimaxVoice.stop(); } catch (e) { /* ignore */ } }
    }

    function cPlayVoice(el) {
        const chat = chatOf(currentChatId, currentChatType);
        const msg = findMsgById(el.dataset.mid);
        if (!chat || !msg) return;
        const v = displayOf(msg, chat).voice;
        if (!v) return;
        if (el.classList.contains('playing')) { stopVoicePlay(el); return; }
        document.querySelectorAll('#c-list .c-bub.voice.playing').forEach(b => stopVoicePlay(b));
        el.classList.add('playing');
        if (v.data) {
            if (!cVoiceAudioEl || cVoiceAudioEl.src !== v.data) {
                if (cVoiceAudioEl) { try { cVoiceAudioEl.pause(); } catch (e) { /* ignore */ } }
                cVoiceAudioEl = new Audio(v.data);
                ['ended', 'error', 'pause'].forEach(ev =>
                    cVoiceAudioEl.addEventListener(ev, () => el.classList.remove('playing')));
            }
            try { cVoiceAudioEl.currentTime = 0; } catch (e) { /* ignore */ }
            const p = cVoiceAudioEl.play();
            if (p && p.catch) p.catch(() => el.classList.remove('playing'));
            return;
        }
        if (!window.MinimaxVoice) { stopVoicePlay(el); cToast('这里暂时放不了语音'); return; }
        if (!v.transcript) { stopVoicePlay(el); cToast('这条语音没识别出文字'); return; }
        const charId = currentChatType === 'private' ? chat.id : (msg.senderId || null);
        (async () => {
            try {
                const audio = (window.MinimaxVoice.hasSfxMarkers && window.MinimaxVoice.hasSfxMarkers(v.transcript))
                    ? await window.MinimaxVoice.speakSequence(v.transcript, charId)
                    : await window.MinimaxVoice.speak(v.transcript, charId);
                if (!audio) { el.classList.remove('playing'); return; }
                ['ended', 'error', 'pause'].forEach(ev =>
                    audio.addEventListener(ev, () => el.classList.remove('playing')));
            } catch (e) {
                el.classList.remove('playing');
                cToast(e && e.message ? e.message : '语音生成失败');
            }
        })();
    }

    // ==================== 转账 / 红包（沿用 B 的钱包与消息格式） ====================
    function cMoneySheet(kind) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) { cToast('先打开一个聊天'); return; }
        const bal = (window.Wallet && Wallet.balance) ? Number(Wallet.balance()) : 0;

        if (kind === 'transfer') {
            if (currentChatType === 'group') { cToast('群聊转账要选人，请回原生模式发'); return; }
            if (typeof sendMyTransfer !== 'function') { cToast('这里暂时发不了转账'); return; }
            openCPage({
                title: '转账',
                html: '<div class="c-form">' +
                    '<div class="c-frow"><span class="c-flb">金额</span><span class="c-famt"><b>¥</b>' +
                    '<input data-focus id="c-f-a" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></span></div>' +
                    '<div class="c-frow"><span class="c-flb">备注</span><input id="c-f-r" maxlength="20" placeholder="转账说明（可留空）"></div>' +
                    '<div class="c-fbal">零钱余额 ¥' + bal.toFixed(2) + '</div></div>' +
                    '<button class="c-bigbtn" id="c-f-ok">确定转账</button>',
                onOpen: (body) => {
                    body.querySelector('#c-f-ok').addEventListener('click', () => {
                        const a = Math.round((Number(body.querySelector('#c-f-a').value) || 0) * 100) / 100;
                        if (!(a > 0)) { cToast('请输入有效的金额'); return; }
                        if (window.Wallet && Wallet.canAfford && !Wallet.canAfford(a)) {
                            cToast('零钱不够，还差 ¥' + (a - bal).toFixed(2)); return;
                        }
                        const remark = body.querySelector('#c-f-r').value.trim();
                        closeCPage();
                        try { sendMyTransfer(a, remark); } catch (e) { console.error('[CMode] transfer failed:', e); }
                        scheduleSync(true);
                    });
                }
            });
            return;
        }

        const isGroup = (currentChatType === 'group');
        const n = Math.max(1, isGroup ? (((chat.members || []).length) || 1) : 1);
        openCPage({
            title: isGroup ? '拼手气红包' : '红包',
            html: '<div class="c-form">' +
                '<div class="c-frow"><span class="c-flb">总金额</span><span class="c-famt"><b>¥</b>' +
                '<input data-focus id="c-f-a" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></span></div>' +
                (isGroup ? '<div class="c-frow"><span class="c-flb">个数<small>全群 ' + n + ' 人</small></span>' +
                    '<input id="c-f-c" type="number" min="1" max="500" step="1" inputmode="numeric" placeholder="' + n + '"></div>' : '') +
                '<div class="c-frow"><span class="c-flb">留言</span><input id="c-f-r" maxlength="24" placeholder="恭喜发财，大吉大利"></div>' +
                '<div class="c-fbal">零钱余额 ¥' + bal.toFixed(2) + '</div></div>' +
                '<button class="c-bigbtn pk" id="c-f-ok">塞钱进红包</button>',
            onOpen: (body) => {
                body.querySelector('#c-f-ok').addEventListener('click', () => {
                    const a = Math.round((Number(body.querySelector('#c-f-a').value) || 0) * 100) / 100;
                    const cEl = body.querySelector('#c-f-c');
                    const cnt = Math.max(1, Math.min(500, parseInt(cEl ? cEl.value : '', 10) || n));
                    const remark = body.querySelector('#c-f-r').value.trim() || '恭喜发财，大吉大利';
                    if (!(a > 0)) { cToast('请输入有效的金额'); return; }
                    if (isGroup && a < cnt * 0.01) { cToast('金额太小，不够分给 ' + cnt + ' 个人'); return; }
                    if (window.Wallet && Wallet.canAfford && !Wallet.canAfford(a)) {
                        cToast('零钱不够，还差 ¥' + (a - bal).toFixed(2)); return;
                    }
                    closeCPage();
                    cSendPacket(a, cnt, remark);
                });
            }
        });
    }

    async function cSendPacket(amount, count, remark) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        if (!chat.history) chat.history = [];
        const meName = (currentChatType === 'private')
            ? (chat.myRemarkName || chat.myName || '我')
            : ((chat.me && chat.me.nickname) || '我');
        if (window.Wallet && Wallet.spend) {
            Wallet.spend(amount, {
                type: 'redpacket_out',
                title: currentChatType === 'group' ? '群聊红包' : '发红包',
                subtitle: count + ' 个 · ' + remark
            });
        }
        const pool = (typeof distributeRedPacket === 'function')
            ? distributeRedPacket(amount, count) : [amount];
        const content = '[' + meName + '发出了一个拼手气红包：' + amount + '元；个数：' + count + '个；留言：' + remark + ']';
        const message = {
            id: 'msg_' + Date.now(),
            role: 'user',
            type: 'red-packet',
            content: content,
            parts: [{ type: 'text', text: content }],
            totalAmount: amount,
            count: count,
            remark: remark,
            pool: pool,
            distributions: {},
            isRevealed: false,
            timestamp: Date.now()
        };
        if (currentChatType === 'group') message.senderId = 'user_me';
        chat.history.push(message);
        if (typeof addMessageBubble === 'function') addMessageBubble(message, currentChatId, currentChatType);
        try { await saveData(); } catch (e) { /* ignore */ }
        if (typeof renderChatList === 'function') renderChatList();
        scheduleSync(true);
        cToast('红包已发出');
    }

    function syncSendBtn() {
        const box = document.getElementById('c-inp');
        const has = box.value.trim();
        document.getElementById('c-send').style.display = has ? 'block' : 'none';
        document.getElementById('c-imgbtn').style.display = has ? 'none' : 'flex';
        const mic = document.getElementById('c-mic');
        // 微信：框里没字才露出麦克风；正在听写时一直露着（好再点一下关掉）
        if (mic) mic.style.display = (!has || dict) && !cVoiceMode ? 'flex' : 'none';
        // ＋ 被发送键顶掉时，它的面板也跟着收起来
        if (has && sheetCur === 'more') closeSheets();
    }

    function findMsgById(id) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat || !chat.history) return null;
        return chat.history.find(x => x.id === id) || null;
    }

    function updateCHeader() {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        const name = document.getElementById('c-name');
        if (name) name.textContent = displayName(chat) || '…';
        document.title = displayName(chat) || 'mie';
    }

    // ==================== 底部升起的面板：表情 ☺ / 功能集 ＋（微信同款抽屉） ====================
    let sheetCur = '';      // '' | 'em' | 'more'
    let emCat = '';         // '' = 还没选过 | wx | all | recent | kao | 分组名
    let kaoSub = 0;

    function kaoData() {
        // 和 B 模式共用同一份颜文字数据（在「更多 · 表情包」页里编辑）
        if (Array.isArray(db.kaomojiData) && db.kaomojiData.length) return db.kaomojiData;
        try { return (typeof KAOMOJI_DATA === 'undefined') ? [] : KAOMOJI_DATA; } catch (e) { return []; }
    }
    function sheetOf(name) { return document.getElementById(name === 'em' ? 'c-panel' : 'c-fns'); }
    function closeSheets() {
        closeCMenu();
        if (!sheetCur) return;
        const el = sheetOf(sheetCur);
        if (el) el.classList.remove('on');
        sheetCur = '';
        syncBarIcons();
    }
    function toggleSheet(name) {
        if (sheetCur === name) { closeSheets(); return; }
        closeSheets();
        if (name === 'em') buildEmSheet(); else buildFnSheet();
        sheetCur = name;
        const el = sheetOf(name);
        if (el) el.classList.add('on');
        syncBarIcons();
    }
    // 面板开着时 ☺ 变键盘、＋ 变叉，和微信一样
    function syncBarIcons() {
        const stk = document.getElementById('c-stk');
        const more = document.getElementById('c-imgbtn');
        if (stk) stk.innerHTML = sheetCur === 'em' ? IC.keyboardPlain : IC.smile;
        if (more) more.innerHTML = sheetCur === 'more' ? IC.close : IC.plus;
    }

    function emList(cat) {
        const list = db.myStickers || [];
        if (cat === 'recent') return list.slice().sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0)).slice(0, 20);
        if (cat === 'ungrouped') return list.filter(s => !s.group);
        if (cat === 'all') return list;
        return list.filter(s => s.group === cat);
    }
    function buildEmSheet() {
        const cats = document.getElementById('c-em-cats');
        const body = document.getElementById('c-em-body');
        if (!cats || !body) return;
        const list = db.myStickers || [];
        const groups = [];
        list.forEach(s => { const g = s.group || ''; if (g && groups.indexOf(g) < 0) groups.push(g); });
        const kao = kaoData();
        const wx = (window.WxEmoji && window.WxEmoji.count()) ? window.WxEmoji : null;
        if (!emCat) emCat = wx ? 'wx' : 'all';
        if (emCat === 'wx' && !wx) emCat = 'all';
        if (emCat === 'kao' && !kao.length) emCat = 'all';
        if (emCat !== 'all' && emCat !== 'kao' && emCat !== 'wx' &&
            groups.indexOf(emCat) < 0) emCat = wx ? 'wx' : 'all';
        const chip = (id, inner) => '<button class="c-em-cat' + (emCat === id ? ' on' : '') +
            '" data-cat="' + esc(id) + '">' + inner + '</button>';
        let ch = '';
        if (wx) ch += chip('wx', '<img src="' + esc(wx.EMOJIS[0].f) + '" alt="">');
        if (kao.length) ch += chip('kao', IC.heartLn);
        ch += chip('all', '😊');
        groups.forEach(g => {
            const first = list.filter(s => (s.group || '') === g)[0];
            ch += chip(g, first ? '<img src="' + esc(first.data || first.url || '') + '" alt="">' : '📁');
        });
        cats.innerHTML = ch;
        cats.querySelectorAll('.c-em-cat').forEach(b => b.addEventListener('click', () => {
            emCat = b.dataset.cat;
            buildEmSheet();
        }));
        if (emCat === 'wx') { buildWxBody(body, wx); return; }
        if (emCat === 'kao') { buildKaoBody(body, kao); return; }
        const cells = [];
        const grid = (arr) => {
            let h = '<div class="c-em-grid">';
            arr.forEach(s => {
                cells.push(s);
                h += '<img src="' + esc(s.data || s.url || '') + '" alt="' + esc(s.name || '') +
                    '" data-i="' + (cells.length - 1) + '">';
            });
            return h + '</div>';
        };
        let html = '';
        if (emCat === 'all') {
            const recent = emList('recent');
            if (recent.length) html += '<div class="c-em-sec">最近使用</div>' + grid(recent);
            html += '<div class="c-em-sec">所有表情</div>' + grid(list);
        } else {
            const title = emCat === 'ungrouped' ? '未分类' : emCat;
            html += '<div class="c-em-sec">' + esc(title) + '</div>' + grid(emList(emCat));
        }
        if (!list.length) {
            html = '<div class="c-em-empty">还没有表情包<br><small>在原生模式的聊天设置里添加后，这里就能发</small></div>';
        }
        body.innerHTML = html;
        body.querySelectorAll('.c-em-grid img').forEach(img => img.addEventListener('click', () => {
            const s = cells[+img.dataset.i];
            if (s) cSendSticker(s);
        }));
    }
    const WX_REC_MAX = 8;
    function wxRecent(wx) {
        const arr = Array.isArray(db.wxEmojiRecent) ? db.wxEmojiRecent : [];
        return arr.filter(n => wx.has(n)).slice(0, WX_REC_MAX);
    }
    function wxRemember(name) {
        const arr = (Array.isArray(db.wxEmojiRecent) ? db.wxEmojiRecent : []).filter(n => n !== name);
        arr.unshift(name);
        db.wxEmojiRecent = arr.slice(0, WX_REC_MAX);
        try { saveData(); } catch (e) { /* ignore */ }
    }
    function buildWxBody(body, wx) {
        if (!wx) { body.innerHTML = '<div class="c-em-empty">微信表情素材没加载</div>'; return; }
        const idx = {};
        wx.EMOJIS.forEach((e, i) => { idx[e.n] = i; });
        const tile = (i) => {
            const e = wx.EMOJIS[i];
            return '<img src="' + esc(e.f) + '" alt="[' + esc(e.n) + ']" title="[' + esc(e.n) + ']" data-i="' + i + '">';
        };
        const row = (arr) => '<div class="c-em-grid wx">' + arr.map(tile).join('') + '</div>';
        const bind = (el) => el.querySelectorAll('.c-em-grid.wx img')
            .forEach(img => img.addEventListener('click', () => tap(+img.dataset.i)));
        const drawRec = () => {
            const rec = wxRecent(wx).map(n => idx[n]);
            recEl.innerHTML = rec.length ? '<div class="c-em-sec">最近使用</div>' + row(rec) : '';
            bind(recEl);
        };
        function tap(i) {
            const e = wx.EMOJIS[i];
            if (!e) return;
            emInsertText('[' + e.n + ']');
            wxRemember(e.n);
            drawRec();
        }
        body.innerHTML = '<div class="c-em-wxrec"></div><div class="c-em-wxall">' +
            '<div class="c-em-sec">所有表情</div>' + row(wx.EMOJIS.map((e, i) => i)) + '</div>';
        const recEl = body.querySelector('.c-em-wxrec');
        bind(body.querySelector('.c-em-wxall'));
        drawRec();
    }
    function buildKaoBody(body, kao) {
        if (kaoSub >= kao.length) kaoSub = 0;
        let html = '<div class="c-em-sub">' + kao.map((k, i) =>
            '<button class="c-em-pill' + (i === kaoSub ? ' on' : '') + '" data-k="' + i + '">' + esc(k.name) + '</button>'
        ).join('') + '</div>';
        const items = (kao[kaoSub] && kao[kaoSub].items) || [];
        html += items.length
            ? '<div class="c-em-kao-grid">' + items.map(t => '<button class="c-em-kao-item">' + esc(kaoText(t)) + '</button>').join('') + '</div>'
            : '<div class="c-em-empty">这一类还没有颜文字</div>';
        body.innerHTML = html;
        body.querySelectorAll('.c-em-pill').forEach(b => b.addEventListener('click', () => {
            kaoSub = +b.dataset.k;
            buildKaoBody(body, kao);
        }));
        body.querySelectorAll('.c-em-kao-item').forEach(b => b.addEventListener('click', () => emInsertText(b.textContent)));
    }
    function emInsertText(t) {
        const box = document.getElementById('c-inp');
        if (!box || !t) return;
        const v = box.value || '';
        const s = box.selectionStart == null ? v.length : box.selectionStart;
        const e = box.selectionEnd == null ? v.length : box.selectionEnd;
        box.value = v.slice(0, s) + t + v.slice(e);
        box.selectionStart = box.selectionEnd = s + t.length;
        box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function emBackspace() {
        const box = document.getElementById('c-inp');
        if (!box || !box.value) return;
        box.value = Array.from(box.value).slice(0, -1).join('');
        box.selectionStart = box.selectionEnd = box.value.length;
        box.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ＋ 面板 = B 模式那套功能集（顺序 / 隐藏都跟着「管理功能集」的配置）
    const C_FN_DO = {
        'photo-video-btn': () => pickCImage(),
        'wallet-btn': () => cMoneySheet('transfer'),
        'red-packet-btn': () => cMoneySheet('redpacket'),
        'voice-message-btn': () => setVoiceMode(true)
    };
    const C_FN_ICON = {
        'red-packet-btn': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.2 3h13.6A2.2 2.2 0 0 1 21 5.2v13.6A2.2 2.2 0 0 1 18.8 21H5.2A2.2 2.2 0 0 1 3 18.8V5.2A2.2 2.2 0 0 1 5.2 3Zm6.8 3.4a4.9 4.9 0 0 1 4.4 2.8c-1.2.8-2.7 1.2-4.4 1.2s-3.2-.4-4.4-1.2A4.9 4.9 0 0 1 12 6.4Z"/><path fill="#fff" d="M10.7 13h2.6v1.5h2v1.7h-2v2.6h-2.6v-2.6h-2v-1.7h2Z"/></svg>'
    };
    function cFnItems() {
        const nodes = Array.prototype.slice.call(document.querySelectorAll('#panel-function-area .expansion-item'));
        if (!nodes.length) return [];
        let cfg = null;
        try { if (window.MieFunctionPanelManager) cfg = MieFunctionPanelManager.loadConfig(); } catch (e) { cfg = null; }
        const order = (cfg && Array.isArray(cfg.order)) ? cfg.order : [];
        const hidden = (cfg && Array.isArray(cfg.hidden)) ? cfg.hidden : [];
        const map = {};
        nodes.forEach(n => { if (n.id && !map[n.id]) map[n.id] = n; });
        let ids = order.filter(id => map[id] && hidden.indexOf(id) < 0);
        Object.keys(map).forEach(id => { if (ids.indexOf(id) < 0 && hidden.indexOf(id) < 0) ids.push(id); });
        // 红包在 C 模式一直发得出去，管理页里藏了也留着
        if (map['red-packet-btn'] && ids.indexOf('red-packet-btn') < 0) ids.push('red-packet-btn');
        return ids.map(id => {
            const el = map[id];
            const nameEl = el.querySelector('.expansion-item-name');
            const iconEl = el.querySelector('.expansion-item-icon');
            return {
                id: id,
                label: (nameEl && nameEl.textContent.trim()) || id,
                svg: C_FN_ICON[id] || (iconEl ? iconEl.innerHTML : '')
            };
        });
    }
    function buildFnSheet() {
        const scroll = document.getElementById('c-fn-scroll');
        const dots = document.getElementById('c-fn-dots');
        if (!scroll || !dots) return;
        const items = cFnItems();
        if (!items.length) {
            scroll.innerHTML = '<div class="c-fn-page"><div class="c-em-empty">功能集是空的<br><small>在原生模式的「管理功能集」里把按钮放回来</small></div></div>';
            dots.innerHTML = '';
            scroll.onscroll = null;
            return;
        }
        const pages = [];
        for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8));
        scroll.innerHTML = pages.map(p => '<div class="c-fn-page">' + p.map(it =>
            '<button class="c-fn-cell" data-id="' + esc(it.id) + '"><span class="c-fn-ic">' +
            (it.svg || IC.plus) + '</span><small>' + esc(it.label) + '</small></button>'
        ).join('') + '</div>').join('');
        dots.innerHTML = pages.length > 1 ? pages.map((p, i) => '<i' + (i ? '' : ' class="on"') + '></i>').join('') : '';
        scroll.scrollLeft = 0;
        scroll.onscroll = () => {
            const idx = pages.length > 1 ? Math.round(scroll.scrollLeft / Math.max(1, scroll.clientWidth)) : 0;
            Array.prototype.forEach.call(dots.children, (d, i) => d.classList.toggle('on', i === idx));
        };
        scroll.querySelectorAll('.c-fn-cell').forEach(b => b.addEventListener('click', () => runFn(b.dataset.id)));
    }
    function runFn(id) {
        closeSheets();
        setTimeout(() => {
            try {
                if (C_FN_DO[id]) { C_FN_DO[id](); return; }
                const el = document.getElementById(id);
                if (!el) { cToast('这个功能在这里用不了'); return; }
                el.click();
            } catch (e) { console.error('[CMode] 功能集按钮失败:', e); }
        }, 80);
    }

    // 表情包数量变了：面板开着就立刻重建一次（☺ 常驻显示，空列表时面板里给提示）
    let stickerCount = -1;
    function syncStickerBtn() {
        const n = (db.myStickers || []).length;
        if (n === stickerCount) return;
        stickerCount = n;
        if (sheetCur === 'em') buildEmSheet();
    }

    // 照抄 B 的 sendSticker：内容 [xxx发送的表情包：名字]，消息自带 stickerData
    async function cSendSticker(sticker) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        const dbSticker = (db.myStickers || []).find(s => s.id === sticker.id);
        if (dbSticker) dbSticker.lastUsedTime = Date.now();
        const myName = (currentChatType === 'private') ? chat.myName : (chat.me && chat.me.nickname) || '我';
        const messageContent = `[${myName}发送的表情包：${sticker.name}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: messageContent,
            parts: [{ type: 'text', text: messageContent }],
            timestamp: Date.now(),
            stickerData: sticker.data
        };
        if (currentChatType === 'group') message.senderId = 'user_me';
        chat.history.push(message);
        if (typeof addMessageBubble === 'function') addMessageBubble(message, currentChatId, currentChatType);
        await saveData();
        if (typeof renderChatList === 'function') renderChatList();
    }

    // ==================== 主页（模拟微信 App：微信 / 通讯录 / 发现 / 我） ====================
    function cToast(t) { if (typeof showToast === 'function') showToast(t); }

    function fmtListTime(ts) {
        const d = new Date(ts), n = new Date(), day = 864e5;
        if (d.toDateString() === n.toDateString()) return d.toTimeString().slice(0, 5);
        if (d.toDateString() === new Date(n.getTime() - day).toDateString()) return '昨天';
        if (n.getTime() - ts < 6 * day) return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
        return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    }

    function myInfo() {
        if (typeof getCommunityUserInfo === 'function') return getCommunityUserInfo();
        const c = (db.characters || [])[0];
        return { name: (c && (c.myRemarkName || c.myName)) || '我', avatar: (c && c.myAvatar) || '' };
    }

    function unreadTotal() {
        let n = 0;
        (db.characters || []).forEach(c => { n += Number(c.unreadCount) || 0; });
        (db.groups || []).forEach(g => { n += Number(g.unreadCount) || 0; });
        return n;
    }

    // 会话列表（置顶优先，其次最后一条消息时间）
    function convList() {
        const arr = [];
        (db.characters || []).forEach(c => arr.push({ id: c.id, type: 'private', chat: c }));
        (db.groups || []).forEach(g => arr.push({ id: g.id, type: 'group', chat: g }));
        arr.forEach(x => {
            const h = x.chat.history || [];
            x.ts = h.length ? (h[h.length - 1].timestamp || 0) : 0;
        });
        arr.sort((a, b) => ((b.chat.isPinned ? 1 : 0) - (a.chat.isPinned ? 1 : 0)) || (b.ts - a.ts));
        return arr;
    }

    function convAvatar(x) {
        return x.chat.avatar ||
            (x.type === 'group' && x.chat.members && x.chat.members[0] && x.chat.members[0].avatar) || '';
    }

    function matchQ(x, q) {
        return [displayName(x.chat), x.chat.name, x.chat.realName]
            .filter(Boolean).some(s => String(s).toLowerCase().indexOf(q) >= 0);
    }

    // 列表里的第二行（微信：群聊带[群名]，自己发的带「我：」）
    function previewOf(x) {
        const h = x.chat.history || [];
        if (!h.length) return { pv: '还没有聊过', ts: 0 };
        let info = null;
        for (let i = h.length - 1; i >= 0 && i > h.length - 8; i--) {
            const it = displayOf(h[i], x.chat);
            if (it.who !== 'hide' && (it.text || it.imgs || it.stk || it.pk || it.tr || it.voice)) { info = it; break; }
        }
        const ts = h[h.length - 1].timestamp || 0;
        if (!info) return { pv: x.type === 'group' ? '[' + (displayName(x.chat) || '群聊') + '] [消息]' : '[消息]', ts };
        const t = info.text || (info.imgs ? '[图片]' : info.stk ? '[表情包]' : info.pk ? '[红包]' : info.tr ? '[转账]' : info.voice ? '[语音]' : '[消息]');
        const pre = info.who === 'sys' ? '' : (info.who === 'me' ? '我：' : (info.name ? info.name + '：' : ''));
        const grp = x.type === 'group' ? '[' + (displayName(x.chat) || '群聊') + '] ' : '';
        return { pv: grp + pre + t, ts };
    }

    function av2(url, name, cls) {
        return '<span class="c-av2' + (cls ? ' ' + cls : '') + '">' + (url
            ? '<img src="' + esc(url) + '" alt="" loading="lazy">'
            : esc(String(name || '?').charAt(0))) + '</span>';
    }

    function convRow(x) {
        const p = previewOf(x);
        const nm = displayName(x.chat) || '未命名';
        const un = Number(x.chat.unreadCount) || 0;
        return '<button class="c-lrow' + (x.chat.isPinned ? ' pin' : '') + '" data-act="open" data-id="' + esc(x.id) + '" data-type="' + x.type + '">' +
            av2(convAvatar(x), nm) +
            '<span class="c-lmid"><span class="c-lnm">' + esc(nm) + '</span><span class="c-lpv">' + wxEm(p.pv) + '</span></span>' +
            '<span class="c-lrt"><span class="c-ltm">' + esc(p.ts ? fmtListTime(p.ts) : '') + '</span>' +
            (un ? '<span class="c-lbg">' + (un > 99 ? '99+' : un) + '</span>' : '') + '</span></button>';
    }

    function contactRow(x) {
        const nm = displayName(x.chat) || '未命名';
        return '<button class="c-crow2" data-act="open" data-id="' + esc(x.id) + '" data-type="' + x.type + '">' +
            av2(convAvatar(x), nm, 'sm') + '<span class="c-cnm">' + esc(nm) + '</span>' +
            '<span class="c-chev">' + IC.chev + '</span></button>';
    }

    function searchHtml() {
        return '<div class="c-search"><span class="c-sic">' + IC.search + '</span>' +
            '<input id="c-q" placeholder="搜索" autocomplete="off" value="' + esc(homeQuery) + '"></div>';
    }

    function emptyHtml() {
        return '<div class="c-none"><div class="c-none-t">还没有聊天对象<br><small>先创建角色，再回到这里聊天<br>想换界面请点底部「我」→ 切换界面</small></div></div>';
    }

    function chatsHtml() {
        const all = convList();
        if (!all.length) return emptyHtml();
        const q = homeQuery.trim().toLowerCase();
        const list = q ? all.filter(x => matchQ(x, q)) : all;
        if (!list.length) return '<div class="c-none">没有找到相关聊天</div>';
        return '<div class="c-list">' + list.map(convRow).join('') + '</div>';
    }

    function contactsHtml() {
        const all = convList();
        if (!all.length) return emptyHtml();
        const q = homeQuery.trim().toLowerCase();
        const keep = x => !q || matchQ(x, q);
        const chars = all.filter(x => x.type === 'private' && keep(x));
        const grps = all.filter(x => x.type === 'group' && keep(x));
        let html = '<div class="c-lbl">联系人 ' + chars.length + '</div>';
        html += chars.length ? chars.map(contactRow).join('') : '<div class="c-none sm">还没有角色</div>';
        html += '<div class="c-lbl">群聊 ' + grps.length + '</div>';
        html += grps.length ? grps.map(contactRow).join('') : '<div class="c-none sm">还没有群聊</div>';
        return html;
    }

    function meHtml() {
        const me = myInfo();
        const bal = (window.Wallet && Wallet.balance) ? Number(Wallet.balance()) : 0;
        const nMo = (db.communityMoments || []).length;
        let html = '<div class="c-mecard">' + av2(me.avatar, me.name, 'xl') +
            '<div class="c-meinfo"><div class="c-mename">' + esc(me.name) + '</div>' +
            '<div class="c-mesub">聊天对象 ' + (db.characters || []).length + ' · 群聊 ' + (db.groups || []).length + '</div></div>' +
            '<span class="c-chev">' + IC.chev + '</span></div>';
        html += '<div class="c-grp">' +
            '<div class="c-cell"><span class="c-cnm3">我的零钱</span><span class="c-cval">¥' + bal.toFixed(2) + '</span></div>' +
            '<button class="c-cell" data-act="mo"><span class="c-cnm3">朋友圈</span><span class="c-cval">' + nMo + ' 条</span>' +
            '<span class="c-chev">' + IC.chev + '</span></button></div>';
        html += '<div class="c-grp">' +
            '<button class="c-cell" data-act="mode2"><span class="c-cnm3">切换界面</span><span class="c-cval">微信界面</span>' +
            '<span class="c-chev">' + IC.chev + '</span></button></div>';
        html += '<div class="c-mver">微信风界面参考开源项目 purr（MIT License）</div>';
        return html;
    }

    // ==================== 朋友圈（发现） ====================
    function moTime(ts) {
        if (!ts) return '';
        return (typeof formatCommunityTime === 'function') ? formatCommunityTime(ts) : fmtTime(ts);
    }

    function momentsHtml() {
        const me = myInfo();
        const list = (db.communityMoments || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const style = db.wallpaper ? ' style="background-image:url(&quot;' + esc(db.wallpaper) + '&quot;)"' : '';
        let html = '<div class="c-cover"' + style + '><span class="c-own">' + esc(me.name) + av2(me.avatar, me.name, 'xl') + '</span></div>';
        if (!list.length) {
            html += '<div class="c-none"><div class="c-none-t">朋友圈还空着<br><small>点右上角相机发一条，角色平时也会自己发</small></div></div>';
        } else {
            html += '<div class="c-mlist">' + list.map(moRow).join('') + '</div>';
        }
        return html;
    }

    function moRow(m) {
        const imgs = (m.images || []).map(u => '<img src="' + esc(u) + '" loading="lazy" data-act="zoom" alt="">').join('');
        const likes = m.likes || [];
        const cmts = m.comments || [];
        let html = '<div class="c-mo">' + av2(m.authorAvatar, m.authorName, 'sm') + '<div class="c-mobd">' +
            '<div class="c-monm">' + esc(m.authorName || 'TA') + '</div>';
        if (m.content) html += '<div class="c-motx">' + wxEm(m.content) + '</div>';
        if (imgs) html += '<div class="c-moimgs' + ((m.images || []).length === 1 ? ' solo' : '') + '">' + imgs + '</div>';
        html += '<div class="c-moftr"><span class="c-motm">' + esc(moTime(m.timestamp)) + '</span>' +
            (m.visibility === 'private' ? '<span class="c-movis">仅自己可见</span>' : '') +
            '<button class="c-moact" data-act="mk" data-id="' + esc(m.id) + '" title="更多">' + IC.dots3h + '</button></div>';
        if (likes.length) {
            html += '<div class="c-molk">' + IC.heart + '<span>' +
                esc(likes.map(l => (typeof l === 'string' ? l : (l && l.name) || 'TA')).join('、')) + '</span></div>';
        }
        if (cmts.length) {
            html += '<div class="c-mocm">' + cmts.map(c => '<div>' + esc(c.author || 'TA') +
                (c.replyTo ? ' 回复 ' + esc(c.replyTo) : '') + '：' + esc(c.content) + '</div>').join('') + '</div>';
        }
        html += '</div></div>';
        return html;
    }

    function momentMenu(anchor, id) {
        const m = (db.communityMoments || []).find(x => x.id === id);
        if (!m) return;
        const liked = (m.likes || []).indexOf(myInfo().name) >= 0;
        const items = [
            { t: liked ? '取消赞' : '赞', f: () => cLike(id) },
            { t: '评论', f: () => cComment(id) }
        ];
        if (m.authorType === 'user') items.push({ t: '删除', f: () => cDelMo(id) });
        openCMenu(anchor, items);
    }

    async function cLike(id) {
        if (typeof toggleCommunityLike === 'function') {
            try { await toggleCommunityLike(id); } catch (e) { console.error('[CMode] like failed:', e); }
        } else {
            const m = (db.communityMoments || []).find(x => x.id === id);
            if (!m) return;
            if (!m.likes) m.likes = [];
            const nm = myInfo().name;
            const i = m.likes.indexOf(nm);
            if (i >= 0) m.likes.splice(i, 1); else m.likes.push(nm);
            await saveData();
        }
        renderCHome(true);
    }

    function cComment(id) {
        openCPage({
            title: '评论',
            okText: '发送',
            html: '<textarea class="c-pgta tall" id="c-f-t" data-focus placeholder="写下你的评论…"></textarea>',
            onOk: async (body) => {
                const text = (body.querySelector('#c-f-t').value || '').trim();
                if (!text) { cToast('先写点什么吧'); return; }
                const m = (db.communityMoments || []).find(x => x.id === id);
                if (!m) { closeCPage(); return; }
                if (!m.comments) m.comments = [];
                m.comments.push({
                    id: 'cmt_' + Date.now(), author: myInfo().name, content: text,
                    timestamp: Date.now(), replyTo: null
                });
                await saveData();
                closeCPage();
                renderCHome(true);
                if (typeof scheduleCharacterReply === 'function') {
                    try { scheduleCharacterReply(m); } catch (e) { /* ignore */ }
                }
            }
        });
    }

    async function cDelMo(id) {
        const arr = db.communityMoments || [];
        const i = arr.findIndex(x => x.id === id);
        if (i < 0) return;
        arr.splice(i, 1);
        try { await saveData(); } catch (e) { /* ignore */ }
        renderCHome(true);
        cToast('已删除');
    }

    function cComposeMoment() {
        pageImg = '';
        openCPage({
            title: '发表动态',
            okText: '发表',
            html: '<textarea class="c-pgta" id="c-f-t" data-focus placeholder="这一刻的想法…"></textarea>' +
                '<div class="c-picks"><div id="c-f-imgs"></div><button class="c-pickbtn" id="c-f-pick" type="button">' + IC.cam + '</button></div>',
            onOpen: (body) => body.querySelector('#c-f-pick').addEventListener('click', () => pickMomentImage(body)),
            onOk: (body) => cPostMoment(body)
        });
    }

    let moImgInput = null;
    function pickMomentImage(body) {
        if (!moImgInput) {
            moImgInput = document.createElement('input');
            moImgInput.type = 'file';
            moImgInput.accept = 'image/*';
            moImgInput.style.display = 'none';
            document.body.appendChild(moImgInput);
            moImgInput.addEventListener('change', async () => {
                const f = moImgInput.files && moImgInput.files[0];
                moImgInput.value = '';
                if (!f) return;
                try {
                    pageImg = (typeof compressImage === 'function')
                        ? await compressImage(f, { quality: 0.8, maxWidth: 1080, maxHeight: 1080 })
                        : await new Promise((res, rej) => {
                            const fr = new FileReader();
                            fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f);
                        });
                } catch (e) { pageImg = ''; cToast('图片读不出来'); }
                const box = document.getElementById('c-f-imgs');
                if (box) box.innerHTML = pageImg
                    ? '<span class="c-picked"><img src="' + esc(pageImg) + '" alt=""><button type="button" id="c-f-drop">✕</button></span>' : '';
                const drop = document.getElementById('c-f-drop');
                if (drop) drop.addEventListener('click', () => {
                    pageImg = '';
                    box.innerHTML = '';
                });
            });
        }
        moImgInput.click();
    }

    async function cPostMoment(body) {
        const text = (body.querySelector('#c-f-t').value || '').trim();
        if (!text && !pageImg) { cToast('写点什么或配张图吧'); return; }
        if (!db.communityMoments) db.communityMoments = [];
        const me = myInfo();
        const moment = {
            id: 'cm_' + Date.now(),
            authorType: 'user',
            authorId: 'user',
            authorName: me.name,
            authorAvatar: me.avatar,
            content: text,
            images: pageImg ? [pageImg] : [],
            likes: [],
            comments: [],
            timestamp: Date.now(),
            visibility: 'public',
            partialChars: []
        };
        db.communityMoments.push(moment);
        try { await saveData(); } catch (e) { console.error('[CMode] moment save failed:', e); }
        pageImg = '';
        closeCPage();
        renderCHome(true);
        cToast('动态已发布');
        if (typeof scheduleCharacterReactions === 'function') {
            try { scheduleCharacterReactions(moment); } catch (e) { /* ignore */ }
        }
    }

    function openZoom(src) {
        const z = document.getElementById('c-zoom');
        if (!z || !src) return;
        z.querySelector('img').src = src;
        z.classList.add('on');
    }

    // ==================== 页面切换 / 渲染 ====================
    function showCPage(p) {
        cPage = p;
        if (p !== 'chat') {
            if (hold) holdAbort();
            stopDictation();
            stopVoicePlay(document.querySelector('#c-list .c-bub.voice.playing'));
        }
        const cv = document.getElementById('c-cv');
        const hv = document.getElementById('c-hv');
        if (cv) cv.classList.toggle('on', p === 'chat');
        if (hv) hv.classList.toggle('on', p === 'home');
        closeSheets();
        updateOverlay();
    }

    function openCHome() {
        showCPage('home');
        renderCHome(true);
    }

    function setCTab(t) {
        if (!C_TAB_TITLE[t]) return;
        cTab = t;
        if (t === 'discover') markMomentsSeen();
        renderCHome(true);
    }

    function renderCHome(force) {
        const body = document.getElementById('c-home-body');
        if (!body) return;
        document.querySelectorAll('#c-hv .c-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === cTab));
        const title = document.getElementById('c-home-title');
        if (title) title.textContent = C_TAB_TITLE[cTab] || '微信';
        const searchable = (cTab === 'chats' || cTab === 'contacts');
        if (homeTabBuilt !== cTab) {
            homeTabBuilt = cTab;
            body.innerHTML = (searchable ? searchHtml() : '') + '<div class="c-scroll tab-' + cTab + '" id="c-hl"></div>';
        }
        const host = document.getElementById('c-hl');
        if (!host) return;
        const html = cTab === 'chats' ? chatsHtml()
            : cTab === 'contacts' ? contactsHtml()
                : cTab === 'discover' ? momentsHtml() : meHtml();
        if (force || html !== homeHtml) {
            homeHtml = html;
            host.innerHTML = html;
        }
        syncTabBadge();
    }

    function markMomentsSeen() {
        let mx = 0;
        (db.communityMoments || []).forEach(m => { if ((m.timestamp || 0) > mx) mx = m.timestamp; });
        moSeenTs = mx || Date.now();
        try { localStorage.setItem('mie_c_mo_seen', String(moSeenTs)); } catch (e) { /* ignore */ }
    }

    function syncTabBadge() {
        const dot = document.getElementById('c-dot-chats');
        if (dot) {
            const n = unreadTotal();
            dot.textContent = n > 99 ? '99+' : String(n);
            dot.style.display = n ? 'flex' : 'none';
        }
        const md = document.getElementById('c-dot-mo');
        if (md) {
            const fresh = (db.communityMoments || []).some(m => m.authorType !== 'user' && (m.timestamp || 0) > moSeenTs);
            md.style.display = (fresh && cTab !== 'discover') ? 'block' : 'none';
        }
    }

    function onHomeClick(e) {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.dataset.act;
        try {
            if (act === 'open') openCChat(el.dataset.id, el.dataset.type);
            else if (act === 'mode2') modeMenu(el);
            else if (act === 'mo') setCTab('discover');
            else if (act === 'mk') momentMenu(el, el.dataset.id);
            else if (act === 'zoom') openZoom(el.getAttribute('src'));
        } catch (err) { console.error('[CMode] home action failed:', err); }
    }

    function modeMenu(anchor) {
        const cur = urlModeOverride || (typeof db !== 'undefined' && db && db.uiMode) || 'c';
        const tag = (m) => (cur === m ? '（当前）' : '');
        openCMenu(anchor, [
            { t: '微信界面' + tag('c'), f: () => { if (cur !== 'c') setMode('c'); } },
            { t: 'B模式' + tag('mie'), f: () => { if (cur !== 'mie') setMode('mie'); } },
            { t: 'A模式' + tag('a'), f: () => { if (cur !== 'a') setMode('a'); } }
        ]);
    }

    // ==================== 子页面（转账 / 红包 / 发动态 / 评论） ====================
    function openCPage(o) {
        pageCfg = o;
        const body = document.getElementById('c-page-body');
        document.getElementById('c-page-title').textContent = o.title || '';
        const r = document.getElementById('c-page-r');
        if (o.okText) { r.style.display = 'flex'; r.textContent = o.okText; } else { r.style.display = 'none'; }
        body.innerHTML = o.html || '';
        document.getElementById('c-page').classList.add('on');
        if (typeof o.onOpen === 'function') {
            try { o.onOpen(body); } catch (e) { console.error('[CMode] page open failed:', e); }
        }
        const f = body.querySelector('[data-focus]');
        if (f) setTimeout(() => { try { f.focus(); } catch (e) { /* ignore */ } }, 80);
    }

    function closeCPage() {
        const p = document.getElementById('c-page');
        if (p) p.classList.remove('on');
        pageCfg = null;
        pageImg = '';
    }


    // ==================== 打开聊天 ====================
    function openCChat(id, type) {
        currentChatId = id;          // 全局变量（db.js 顶层 var），sendMessage 等都读它
        currentChatType = type;
        if (typeof openChatRoom === 'function') {
            openChatRoom(id, type);  // 让 B 切到聊天室 → C 覆盖层自动显示
        }
        closeCPage();
        updateCHeader();
        showCPage('chat');
        scheduleSync(true);
    }

    // ==================== 渲染（purr 的 bubble + render：整列表重建 + 保底滚动） ====================
    function scheduleSync(force) { requestAnimationFrame(() => cSync(force)); }

    let lastSnap = '';
    function cSync(force) {
        const list = document.getElementById('c-list');
        if (!list || cPage !== 'chat' || !appVisible()) return;
        syncStickerBtn();
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) { list.innerHTML = ''; return; }
        if (!chat.history) chat.history = [];

        // 打字指示：B 侧正在生成（点了触发按钮 / B 侧自动回复）→ 显示，否则收起
        if (typeof isGenerating !== 'undefined' && isGenerating) showTyping();
        else hideTyping();

        // 快照去重：数据没变就别重建（已读数 / 红包拆开数变化也要重画）
        const lastMsg = chat.history[chat.history.length - 1];
        const openedPk = chat.history.reduce((n, m) => n + (m.type === 'red-packet' && m.isRevealed ? 1 : 0), 0);
        const snap = chat.id + ':' + chat.history.length + ':' + (lastMsg ? lastMsg.id : '') + ':' + readIds.size + ':' + openedPk;
        if (!force && snap === lastSnap) return;
        lastSnap = snap;

        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        let html = '', lastT = 0;
        chat.history.forEach((msg) => {
            const info = displayOf(msg, chat);
            if (info.who === 'hide' || (!info.text && !info.imgs && !info.stk && !info.pk && !info.tr && !info.voice)) return;
            if (msg.timestamp - lastT > 5 * 60 * 1000 ||
                new Date(msg.timestamp).toDateString() !== new Date(lastT).toDateString()) {
                html += '<div class="c-time">' + esc(fmtTime(msg.timestamp)) + '</div>';
            }
            lastT = msg.timestamp;

            if (info.who === 'sys') {
                html += '<div class="c-sys">' + esc(info.text) + '</div>';
                return;
            }

            const me = info.who === 'me';
            let avUrl = '';
            if (me) avUrl = (currentChatType === 'private') ? (chat.myAvatar || '') : ((chat.me && chat.me.avatar) || '');
            else avUrl = (currentChatType === 'private') ? (chat.avatar || '')
                : ((chat.members || []).find(x => x.id === msg.senderId) || {}).avatar || '';
            const avName = me
                ? ((currentChatType === 'private') ? ((chat.myRemarkName || chat.myName) || '我') : ((chat.me && chat.me.nickname) || '我'))
                : (displayName(chat) || '?');
            // 已读回执（purr：我发的普通消息在对方读过之后显示「已读」；红包不显示）
            const readMark = (me && !info.pk && !info.tr && readIds.has(msg.id)) ? '<span class="c-read">已读</span>' : '';

            html += '<div class="c-row' + (me ? ' me' : '') + '" data-mid="' + esc(msg.id) + '">';
            html += '<div class="c-av' + (me ? ' me' : '') + '">' + (avUrl
                ? '<img src="' + esc(avUrl) + '" alt="">'
                : esc(avName.charAt(0))) + '</div>';
            let body = '<div class="c-body">';
            if (!me && info.name) body += '<div class="c-who">' + esc(info.name) + '</div>';
            if (info.pk) {
                body += '<div class="c-pk' + (info.pk.opened ? ' opened' : '') + '" data-mid="' + esc(msg.id) + '"><div class="t"><div class="ic"></div><div>' + esc(info.pk.note) + (info.pk.opened ? '<br><small>已领取</small>' : '') + '</div></div><div class="b">红包</div></div>';
            } else if (info.tr) {
                const st = !me ? '待你收款'
                    : (info.tr.state === 'received' ? '已接收' : info.tr.state === 'returned' ? '已退回' : '待收款');
                body += '<div class="c-tr"><div class="t"><div class="coin">¥</div><div>' +
                    '<div class="a">¥' + (Number(info.tr.amount) || 0).toFixed(2) + '</div>' +
                    '<div class="n">' + esc(info.tr.to ? ('给 ' + info.tr.to) : (info.tr.note || '转账')) + '</div></div></div>' +
                    '<div class="b">微信转账 · ' + st + '</div></div>';
            } else if (info.voice) {
                const wd = Math.min(210, 84 + info.voice.duration * 12);
                body += '<div class="c-bub voice" data-mid="' + esc(msg.id) + '" style="width:' + wd + 'px">' +
                    '<span class="vdur">' + info.voice.duration + '"</span>' +
                    '<span class="vic">' + IC.wavePlain + '</span></div>';
            } else if (info.stk) {
                body += '<div class="c-bub stk"><img src="' + esc(info.stk) + '" alt="表情包"></div>';
            } else if (info.imgs) {
                info.imgs.forEach(u => { body += '<div class="c-bub img"><img src="' + esc(u) + '" loading="lazy" alt=""></div>'; });
            } else {
                body += '<div class="c-bub">' + wxEm(info.text) + '</div>';
            }
            body += '</div>';
            html += body;
            html += readMark;
            html += '</div>';
        });
        list.innerHTML = html;
        if (atBottom) list.scrollTop = list.scrollHeight;
    }

    // ==================== 输入中提示 ====================
    let typingTimer = null;
    function showTyping() {
        const t = document.getElementById('c-typing');
        const s = document.getElementById('c-state');
        if (t) t.classList.add('on');
        if (s) s.textContent = '对方正在输入…';
        clearTimeout(typingTimer);
        typingTimer = setTimeout(hideTyping, 90000);
    }
    function hideTyping() {
        const t = document.getElementById('c-typing');
        const s = document.getElementById('c-state');
        if (t) t.classList.remove('on');
        if (s) s.textContent = '';
        clearTimeout(typingTimer);
    }

    // ==================== 发送（走 B 的 sendMessage） ====================
    function cSend() {
        const box = document.getElementById('c-inp');
        const text = (box.value || '').trim();
        if (!text) return;
        stopDictation();
        if (typeof window.sendMessage !== 'function' || typeof messageInput === 'undefined') return;
        // B 正在生成时直接拦下：sendMessage 会静默丢弃，字不能丢
        if (typeof isGenerating !== 'undefined' && isGenerating) {
            if (typeof showToast === 'function') showToast('对方正在回复，等一下再发');
            return;
        }
        box.value = '';
        box.style.height = '40px';
        syncSendBtn();
        messageInput.value = text;
        try {
            window.sendMessage();
        } catch (e) {
            console.error('[CMode] send failed:', e);
        }
    }

    // ==================== 触发回复（手动：与 B 的「获取回复」按钮同一链路） ====================
    function cTrigger() {
        if (typeof getAiReply !== 'function') return;
        if (typeof isGenerating !== 'undefined' && isGenerating) return;
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        if (!chat.history || !chat.history.length) {
            if (typeof showToast === 'function') showToast('先说点什么吧');
            return;
        }
        showTyping();
        try {
            getAiReply(currentChatId, currentChatType, false);
        } catch (e) {
            console.error('[CMode] trigger failed:', e);
            hideTyping();
        }
    }

    // ==================== 红包（purr 样子 + B 的钱包结算） ====================
    function openPk(msg) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        const chatName = displayName(chat) || 'TA';
        const modal = document.getElementById('c-m-pk');
        const bal0 = (window.Wallet && Wallet.balance) ? Wallet.balance() : 0;
        // 自己发出去的红包：只看发放结果，不再领
        if (msg.role === 'user') {
            document.getElementById('c-pkfrom').textContent = '我发出的红包';
            document.getElementById('c-pknote').textContent = msg.remark || '恭喜发财';
            document.getElementById('c-pkamt').textContent = '¥' + Number(msg.totalAmount || 0).toFixed(2);
            document.getElementById('c-pkbal').textContent = '零钱余额 ¥' + Number(bal0 || 0).toFixed(2);
            modal.classList.add('on');
            return;
        }
        let amount, balance, openedNow = false;
        if (msg.isRevealed || !Array.isArray(msg.pool) || !msg.pool.length) {
            // 已拆过 / 已被 B 侧结算：展示领取结果
            amount = (msg.distributions && msg.distributions['user_me']) || 0;
            balance = (window.Wallet && Wallet.balance) ? Wallet.balance() : 0;
        } else {
            amount = msg.pool.splice(Math.floor(Math.random() * msg.pool.length), 1)[0];
            if (!msg.distributions) msg.distributions = {};
            msg.distributions['user_me'] = amount;
            msg.isRevealed = true;
            openedNow = true;
            if (window.Wallet && Wallet.income) {
                Wallet.income(amount, { type: 'redpacket_in', title: '收到红包', subtitle: `来自 ${chatName} 的红包` });
            }
            balance = (window.Wallet && Wallet.balance) ? Wallet.balance() : 0;
            saveData().then(() => scheduleSync()).catch(() => scheduleSync());
        }
        document.getElementById('c-pkfrom').textContent = chatName + '的红包';
        document.getElementById('c-pknote').textContent = msg.remark || '恭喜发财';
        document.getElementById('c-pkamt').textContent = '¥' + Number(amount || 0).toFixed(2);
        document.getElementById('c-pkbal').textContent = openedNow
            ? ('已存入零钱，余额 ¥' + Number(balance || 0).toFixed(2))
            : ('已领取 · 零钱余额 ¥' + Number(balance || 0).toFixed(2));
        modal.classList.add('on');
    }

    // ==================== 钩子：B 的渲染函数 → 同步 C 界面 ====================
    function setupHooks() {
        // 清洗脏消息：空 parts 数组会让 B 的渲染器崩掉
        function sanitizeHistory(chat) {
            if (!chat || !Array.isArray(chat.history)) return;
            for (const m of chat.history) {
                if (m && Array.isArray(m.parts) && m.parts.length === 0) delete m.parts;
            }
        }
        if (typeof window.addMessageBubble === 'function') {
            const _add = window.addMessageBubble;
            window.addMessageBubble = function (message, targetChatId, targetChatType) {
                const r = _add.apply(this, arguments);
                try {
                    if (document.body.classList.contains('c-mode') &&
                        targetChatId === currentChatId && targetChatType === currentChatType) {
                        // AI 回复落地 → 之前的消息标记已读（purr 的已读语义）
                        if (message && message.role === 'assistant') markAllRead(chatOf(targetChatId, targetChatType));
                        scheduleSync();
                    }
                } catch (e) { /* ignore */ }
                return r;
            };
        }
        if (typeof window.renderMessages === 'function') {
            const _render = window.renderMessages;
            window.renderMessages = function () {
                let r;
                try {
                    r = _render.apply(this, arguments);
                } catch (e) {
                    console.warn('[CMode] renderMessages error:', e && e.message);
                    scheduleSync();
                    return r;
                }
                try {
                    if (document.body.classList.contains('c-mode')) scheduleSync();
                } catch (e) { /* ignore */ }
                return r;
            };
        }
        if (typeof window.openChatRoom === 'function') {
            const _open = window.openChatRoom;
            window.openChatRoom = function (chatId, type) {
                try { sanitizeHistory(chatOf(chatId, type)); } catch (e) { /* ignore */ }
                const r = _open.apply(this, arguments);
                try {
                    if (document.body.classList.contains('c-mode')) {
                        currentChatId = chatId;
                        currentChatType = type;
                        updateCHeader();
                        closeSheets();   // 换会话先收起底部面板
                        scheduleSync(true);
                    }
                } catch (e) { /* ignore */ }
                return r;
            };
        }
    }

    // ==================== 覆盖层可见性：跟随 chat-room-screen ====================
    function appVisible() {
        if (cPage === 'home') return true;      // 主页只在 C 里出现，与 B 的屏幕无关
        const room = document.getElementById('chat-room-screen');
        return !!(room && room.classList.contains('active'));
    }
    function updateOverlay() {
        const app = document.getElementById('c-app');
        if (!app) return;
        const on = isEnabled() && appVisible();
        app.classList.toggle('on', on);
        document.body.classList.toggle('c-chat-on', on);
        if (on) {
            if (cPage === 'home') renderCHome();
            else scheduleSync();
            updateCHeader();
        }
    }
    function setupScreenWatcher() {
        new MutationObserver(() => updateOverlay()).observe(document.body, {
            attributes: true, attributeFilter: ['class'], subtree: true
        });
    }

    // ==================== 启动入口 ====================
    function killSplash() {
        try {
            if (window.mieSplash && typeof window.mieSplash.dismiss === 'function') window.mieSplash.dismiss();
        } catch (e) { /* ignore */ }
        const leftover = document.getElementById('mist-splash-overlay');
        if (leftover) leftover.remove();
    }

    let pollTimer = null;
    function startPoll() {
        if (pollTimer) return;
        // purr 的 1.5s 轮询：覆盖层可见时轻量同步（生成状态 / 已读 / 新消息兜底）
        pollTimer = setInterval(() => {
            if (!document.body.classList.contains('c-mode')) return;
            if (!appVisible()) return;
            if (cPage === 'home') {
                // 子页面（转账/发动态）打开时不要重绘背后的列表
                const pg = document.getElementById('c-page');
                if (pg && pg.classList.contains('on')) return;
                renderCHome();
            } else {
                cSync();
            }
        }, 1500);
    }

    function init() {
        if (!isEnabled()) return;
        mirrorMode('c');
        document.body.classList.add('c-mode');
        killSplash();
        setTimeout(killSplash, 1200);   // 兜底：万一开屏是延迟挂载的
        setupHooks();
        setupScreenWatcher();
        buildCApp();
        startPoll();
        syncSendBtn();
        // 启动先落主页（微信栏 = 会话列表），点某一条才进全屏聊天页
        setTimeout(() => {
            try {
                openCHome();
            } catch (e) {
                console.error('[CMode] home open failed:', e);
            }
        }, 60);
    }

    window.CMode = {
        isEnabled, setMode, init, openCHome, showCPage, setCTab, cTrigger,
        get currentChatId() { return currentChatId; },
    };
})();
