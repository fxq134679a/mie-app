// --- A 模式 v2：A 原生界面（真实 A 的 DOM 结构），数据与收发走 B 的链路 (js/modules/a_mode.js) ---
(function () {
    'use strict';

    // ==================== 模式开关 ====================
    // URL 参数 ?mode=a / ?mode=mie 可临时强制模式（不动数据库，调试用）
    const urlModeOverride = (() => {
        try {
            const m = new URLSearchParams(location.search).get('mode');
            return (m === 'a' || m === 'mie') ? m : null;
        } catch (e) { return null; }
    })();
    const isEnabled = () => {
        if (urlModeOverride) return urlModeOverride === 'a';
        if (typeof db === 'undefined' || !db) return false;
        if (db.uiMode === 'a') return true;
        // IndexedDB 偶发丢写入兜底：每次切换模式都同步写了 localStorage 记号，db 里丢了就用它恢复
        try {
            if (!db.uiMode && localStorage.getItem('mie_ui_mode') === 'a') { db.uiMode = 'a'; return true; }
        } catch (e) { /* ignore */ }
        return false;
    };

    function mirrorMode(mode) {
        try { localStorage.setItem('mie_ui_mode', mode); } catch (e) { /* ignore */ }
    }

    async function toggle() {
        if (typeof db === 'undefined' || !db) return;
        db.uiMode = isEnabled() ? 'mie' : 'a';
        mirrorMode(db.uiMode);
        try {
            await saveData();
        } catch (e) {
            console.error('[AMode] saveData failed:', e);
        }
        if (typeof showToast === 'function') {
            showToast(isEnabled() ? '已切换到 A 模式，即将刷新' : '已切换到原生模式，即将刷新');
        }
        setTimeout(() => location.reload(), 600);
    }

    // ==================== 小工具 ====================
    const chatOf = (id, type) => (type === 'private')
        ? (db.characters || []).find(c => c.id === id)
        : (db.groups || []).find(g => g.id === id);

    function cleanText(raw) {
        let t = String(raw == null ? '' : raw);
        t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/^<thinking>[\s\S]*/i, '');
        t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^<think>[\s\S]*/i, '');
        t = t.replace(/\[system:.*?\]/g, '');
        return t.trim();
    }

    // B 模式不渲染的隐形消息（转账/礼物回执、动态、开屏语、系统情景通知、私聊频道标记等）
    const A_INVISIBLE_RE = new RegExp([
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

    function displayOf(msg, chat) {
        chat = chat || chatOf(currentChatId, currentChatType);
        const raw = String(msg.content == null ? '' : msg.content);
        // 原声语音消息（真实录音）
        if (msg.voiceAudio && msg.voiceAudio.data) {
            return { who: msg.role === 'user' ? 'me' : 'ai', voice: msg.voiceAudio, text: '' };
        }
        if (msg.role === 'system') return { who: 'sys', text: cleanText(raw) };
        if (msg.isWithdrawn) {
            const nm = (chat && (chat.remarkName || chat.name)) || '';
            return { who: 'sys', text: msg.role === 'user' ? '你撤回了一条消息' : (nm ? nm + '撤回了一条消息' : '对方撤回了一条消息') };
        }
        // 事件类消息 → 系统通知样式（与 B 一致）
        let m;
        if ((m = raw.match(/\[(视频|语音)通话记录[：:](.*?)[；;](.*?)[；;](.*?)\]/)))
            return { who: 'sys', text: (m[1] === '视频' ? '视频通话结束 ' : '语音通话结束 ') + m[3] };
        if ((m = raw.match(/\[(.*?)向(.*?)发起了(视频|语音)通话\]/)))
            return { who: 'sys', text: m[1] + '向' + m[2] + '发起了' + m[3] + '通话' };
        if ((m = raw.match(/\[(.*?)拒绝了(.*?)的(视频|语音)通话\]/)))
            return { who: 'sys', text: m[1] + '拒绝了' + m[2] + '的' + m[3] + '通话' };
        if ((m = raw.match(/\[system-display:([\s\S]+?)\]/)))
            return { who: 'sys', text: m[1].trim() };
        if ((m = raw.match(/\[(.*?)邀请(.*?)加入了群聊\]/)))
            return { who: 'sys', text: m[1] + '邀请' + m[2] + '加入了群聊' };
        if ((m = raw.match(/\[(.*?)修改群名为[：:](.*?)\]/)))
            return { who: 'sys', text: m[1] + '修改群名为“' + m[2] + '”' };
        if (chat && chat.showStatusUpdateMsg && (m = raw.match(/\[(.*?)更新状态为[：:](.*?)\]/)))
            return { who: 'sys', text: m[1] + ' 更新状态为：' + m[2] };
        if (A_INVISIBLE_RE.test(raw)) return { who: 'hide', text: '' };

        // 图片 / 表情包
        if ((m = raw.match(/\[(?:.+?)发来的照片\/视频[：:]([\s\S]+?)\]/)) ||
            (m = raw.match(/\[(?:.*?的)?表情包[：:]([\s\S]+?)\]/i)) ||
            (m = raw.match(/\[(?:.+?)发送的表情包[：:]([\s\S]+?)\]/i))) {
            const urls = String(m[1]).split(/[\s,，]+/).map(s => s.trim())
                .filter(s => /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)|data:image\/[a-z]+;base64,)/i.test(s));
            if (urls.length) return { who: msg.role === 'user' ? 'me' : 'ai', imgs: urls };
        }

        let text = cleanText(raw);
        // [xxx的消息：yyy]（兼容半角/全角冒号，与 B 的 textRegex 一致）→ 只留正文
        let wrapName = '';
        const wm = text.match(/\[(.+?)的消息[：:]([\s\S]+?)\]/);
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
        // 群聊里成员查不到时，用 [xx的消息：] 包装里的名字兜底
        if (!name && wrapName && chat && chat.members) name = wrapName;
        return { who: 'ai', text, name };
    }

    function fmtTime(ts) {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const today = new Date().toDateString() === d.toDateString();
        if (today) return hh + ':' + mm;
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm;
    }

    // ==================== A 应用外壳 ====================
    const ICONS = {
        menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
        dots: '<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
        back: '<line x1="15" y1="5" x2="8" y2="12"/><line x1="8" y1="12" x2="15" y2="19"/>'
    };
    const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

    function buildAApp() {
        if (document.getElementById('a-app')) return;
        const app = document.createElement('div');
        app.id = 'a-app';
        app.innerHTML = `
            <div id="a-bgimg"></div>
            <header class="a-header">
                <button class="a-iconbtn" id="a-menu-btn" title="聊天列表">${svg(ICONS.menu)}</button>
                <div class="a-title"><h1 id="a-name"></h1><div class="sub" id="a-sub"></div></div>
                <button class="a-iconbtn" id="a-dots-btn" title="设置">${svg(ICONS.dots)}</button>
            </header>
            <div id="a-log"></div>
            <footer class="a-foot">
                <div class="a-typing" id="a-typing">对方正在输入…</div>
                <div class="a-composer">
            <div id="a-expansion-slot"></div>
            <textarea id="a-box" rows="1" placeholder="说点什么…" autocomplete="off"></textarea>
                    <div class="a-ctlrow">
                        <button class="a-ctl" id="a-plus" title="功能面板">${svg(ICONS.plus)}</button>
                        <span class="a-gap"></span>
                        <button class="a-send" id="a-send" title="发送">${svg(ICONS.up)}</button>
                    </div>
                </div>
            </footer>
        `;
        document.body.appendChild(app);

        document.getElementById('a-menu-btn').addEventListener('click', openDrawer);
        document.getElementById('a-dots-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            aOpenSettings();
        });

        const box = document.getElementById('a-box');
        const send = document.getElementById('a-send');
        send.addEventListener('click', () => aSend());
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aSend(); }
        });
        box.addEventListener('input', () => {
            box.style.height = 'auto';
            box.style.height = Math.min(box.scrollHeight, 120) + 'px';
        });
        document.getElementById('a-plus').addEventListener('click', openExpansionPanel);
    }

    const displayName = (chat) => (chat && chat.remarkName) ? chat.remarkName : (chat ? chat.name : '');

    function updateAHeader() {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return;
        const name = document.getElementById('a-name');
        const sub = document.getElementById('a-sub');
        if (name) name.textContent = displayName(chat);
        if (sub) sub.textContent = currentChatType === 'group'
            ? ((chat.members || []).length + ' 个成员')
            : (chat.status || '在线');
    }

    // 聊天背景（B 的聊天设置 → 聊天背景，char.chatBg / group.chatBg）
    function applyChatBg(chat) {
        const el = document.getElementById('a-bgimg');
        if (!el) return;
        let bg = '';
        try { bg = chat && chat.chatBg ? String(chat.chatBg) : ''; } catch (e) { /* ignore */ }
        // 不再因 bg 未变化提前 return：无壁纸聊天首次打开也要初始化玻璃令牌（采样有缓存，重复调用廉价）
        el.dataset.bg = bg;
        el.style.backgroundImage = bg ? 'url("' + bg.replace(/"/g, '%22') + '")' : 'none';
        el.classList.toggle('on', !!bg);
        // 背景变了 → 重新采样玻璃三带（规范 §4）
        _lgCurrentBg = bg;
        refreshGlassSample();
    }

    // ==================== 消息渲染（A 样式） ====================
    function bubbleOff() {
        try { return (db && db.aModeBubble === 'off'); } catch (e) { return false; }
    }
    function timeDivider(ts) {
        const d = document.createElement('div');
        d.className = 'a-time';
        d.textContent = fmtTime(ts);
        return d;
    }

    // ==================== 原声语音气泡（真实录音播放） ====================
    let aVoiceAudioEl = null;
    let aPlayingVoiceId = null; // 正在播放的消息 id（跨重渲染保留播放态）
    function buildAVoiceBubble(va, msgId) {
        const b = document.createElement('div');
        b.className = 'a-voice' + (msgId && msgId === aPlayingVoiceId ? ' playing' : '');
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span class="a-voice-dur">' + (va.duration || 1) + '"</span>' +
            '<span class="a-voice-wave"><i></i><i></i><i></i></span>';
        b.addEventListener('click', () => {
            if (b.classList.contains('playing')) {
                if (aVoiceAudioEl) aVoiceAudioEl.pause();
                return;
            }
            document.querySelectorAll('.a-voice.playing').forEach(x => x.classList.remove('playing'));
            if (aVoiceAudioEl) { aVoiceAudioEl.pause(); }
            aVoiceAudioEl = new Audio(va.data);
            aVoiceAudioEl.addEventListener('ended', () => { b.classList.remove('playing'); if (aPlayingVoiceId === msgId) aPlayingVoiceId = null; });
            aVoiceAudioEl.addEventListener('error', () => { b.classList.remove('playing'); if (aPlayingVoiceId === msgId) aPlayingVoiceId = null; });
            aVoiceAudioEl.addEventListener('pause', () => { b.classList.remove('playing'); if (aPlayingVoiceId === msgId) aPlayingVoiceId = null; });
            b.classList.add('playing');
            if (msgId) aPlayingVoiceId = msgId;
            aVoiceAudioEl.play().catch(() => { b.classList.remove('playing'); if (aPlayingVoiceId === msgId) aPlayingVoiceId = null; });
        });
        return b;
    }

    // ==================== 韩语学习模式：A 模式拆词与查词 ====================
    /* 把 AI 文本按空格拆成 .dict-word span（用 DOM 构造，天然防注入）；
       未开启韩语学习模式返回 null，调用方回退 textContent */
    function wrapADictWords(chat, text) {
        if (!chat || !chat.koreanModeEnabled) return null;
        const parts = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
        if (!parts.length) return null;
        const frag = document.createDocumentFragment();
        parts.forEach((w, i) => {
            const clean = w.replace(/^[^\uAC00-\uD7A3A-Za-z0-9]+|[^\uAC00-\uD7A3A-Za-z0-9]+$/g, '');
            if (!clean) { frag.appendChild(document.createTextNode(w)); }
            else {
                const sp = document.createElement('span');
                sp.className = 'dict-word';
                sp.dataset.word = clean; /* 查询词干净（剥首尾标点），显示保留原文 */
                sp.textContent = w;
                frag.appendChild(sp);
            }
            if (i < parts.length - 1) frag.appendChild(document.createTextNode(' '));
        });
        return frag;
    }

    /* 星尘雾：dust 是相对 text 的 [起,止] 区间，把区间包成 .mie-dust span（画布引擎认这个类）。
       区间外的文字照旧走韩语拆词；没有雾时与原来行为完全一致。
       aSync 是整段 innerHTML 重建，雾的揭开状态记在 revealedDust 里（键=消息id+段序号），
       重渲染后按它恢复 .open，不然点开的句子下一帧又被雾回去 */
    const revealedDust = new Set();
    function wrapAText(chat, text, dust, rk) {
        const frag = document.createDocumentFragment();
        const seg = (str, fogged, dk) => {
            if (!str) return;
            if (fogged) {
                const sp = document.createElement('span');
                sp.className = 'mie-dust';
                if (dk) {
                    sp.dataset.dk = dk;
                    if (revealedDust.has(dk)) sp.classList.add('open');
                }
                const inner = wrapADictWords(chat, str);
                if (inner) sp.appendChild(inner); else sp.textContent = str;
                frag.appendChild(sp);
            } else {
                const inner = wrapADictWords(chat, str);
                if (inner) frag.appendChild(inner);
                else frag.appendChild(document.createTextNode(str));
            }
        };
        const len = text.length;
        const ranges = (Array.isArray(dust) ? dust : [])
            .filter(r => Array.isArray(r))
            .map(r => [Math.max(0, Math.min(len, r[0] | 0)), Math.max(0, Math.min(len, r[1] | 0))])
            .filter(r => r[1] > r[0])
            .sort((a, b) => a[0] - b[0]);
        if (!ranges.length) { seg(text, false); return frag; }
        let cursor = 0;
        let idx = 0;
        for (const [s, e] of ranges) {
            if (s < cursor) continue;
            seg(text.slice(cursor, s), false);
            seg(text.slice(s, e), true, (rk || '') + idx);
            idx++;
            cursor = e;
        }
        seg(text.slice(cursor), false);
        return frag;
    }

    /* #a-log 事件委托（只绑一次）：点单词 toggle 查词卡片，长按直接查 */
    let aDictBound = false;
    let aDictLongPress = null;
    function bindADictHandlers() {
        if (aDictBound) return;
        const log = document.getElementById('a-log');
        if (!log) return;
        aDictBound = true;

        const dictChat = () => chatOf(currentChatId, currentChatType);

        function showWord(el) {
            const chat = dictChat();
            if (!chat || !chat.koreanModeEnabled) return;
            const owner = el.closest('.a-gu');
            if (owner) owner.querySelectorAll('.dict-word-selected').forEach(x => x.classList.remove('dict-word-selected'));
            el.classList.add('dict-word-selected');
            const word = el.dataset.word || el.textContent.trim();
            if (window.DictCard) window.DictCard.show(word);
        }
        function clearWord() {
            document.querySelectorAll('.dict-word-selected').forEach(x => x.classList.remove('dict-word-selected'));
            if (window.DictCard) window.DictCard.hide();
        }

        log.addEventListener('click', (e) => {
            /* 星尘雾：点一下揭开/藏回。引擎只负责动画，这里记录揭开状态，
               aSync 整段重建后靠 dataset.dk 恢复 */
            const dust = e.target.closest('.mie-dust');
            if (dust && dust.dataset.dk) {
                /* 不 stopPropagation：后面的画布引擎还要接同一事件去做化开动画 */
                const revealing = !dust.classList.contains('open');
                if (revealing) revealedDust.add(dust.dataset.dk);
                else revealedDust.delete(dust.dataset.dk);
                return;
            }
            const el = e.target.closest('.dict-word');
            if (!el) return;
            e.stopPropagation();
            const chat = dictChat();
            if (!chat || !chat.koreanModeEnabled) return;
            if (el.classList.contains('dict-word-selected')) {
                el.classList.remove('dict-word-selected');
                if (window.DictCard) window.DictCard.hide();
            } else {
                showWord(el);
            }
        });
        log.addEventListener('touchstart', (e) => {
            const el = e.target.closest('.dict-word');
            if (!el) return;
            aDictLongPress = setTimeout(() => { aDictLongPress = null; showWord(el); }, 450);
        }, { passive: true });
        const cancelLP = () => { if (aDictLongPress) { clearTimeout(aDictLongPress); aDictLongPress = null; } };
        log.addEventListener('touchend', cancelLP);
        log.addEventListener('touchmove', cancelLP);
        log.addEventListener('touchcancel', cancelLP);
    }

    /* aSync 快照去重：aSync 每次都 log.innerHTML='' 全量重建所有消息 DOM，
       群聊几百条时一次重建就是上百毫秒；而重建又会改变元素 class →
       触发 setupScreenWatcher 的 MutationObserver → updateOverlay → scheduleSync
       → 再全量重建……无限循环把主线程打满（表现为整个页面巨卡、滑动解锁后像"进不去"）。
       对齐 cSync 的做法：数据快照没变就不重建；B 侧 hook（renderMessages 等）显式标脏。 */
    let aSyncSnap = '';
    let aSyncDirty = true;
    function aSync() {
        const log = document.getElementById('a-log');
        if (!log || !appVisible()) return;
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat || !chat.history) return;

        const lastMsg = chat.history[chat.history.length - 1];
        const snap = [
            currentChatId, currentChatType, chat.history.length,
            lastMsg ? (lastMsg.id || lastMsg.timestamp || '') : '',
            chat.avatarMode || 'full',
            bubbleOff() ? 1 : 0,
            chat.stardustEnabled === false ? 0 : 1,
            (chat.members || []).length,
            chat.memberAvatarFrames ? Object.keys(chat.memberAvatarFrames).length : 0
        ].join('|');
        if (!aSyncDirty && snap === aSyncSnap) return;
        aSyncSnap = snap;
        aSyncDirty = false;

        bindADictHandlers();
        hideTypingIfReplied(chat);
        harvestSplashQuote(chat);
        applyChatBg(chat);
        log.innerHTML = '';
        // 头像显示模式（与 B 一致：full 全部 / merge 连续合并 / kkt 自己无头像 / hidden 隐藏）
        const avMode = chat.avatarMode || 'full';
        const myAvatar = (currentChatType === 'private') ? (chat.myAvatar || '') : ((chat.me && chat.me.avatar) || '');
        const avatarStateOf = (who, isContinuous) => {
            if (avMode === 'hidden' || (who === 'me' && avMode === 'kkt')) return 'none';
            if (avMode !== 'full' && isContinuous) return 'ghost';   // merge / kkt：连续消息占位但不显示
            return 'show';
        };
        const avatarUrlOf = (msg, who) => {
            if (who === 'me') return myAvatar;
            if (currentChatType === 'private') return chat.avatar || '';
            const mem = (chat.members || []).find(x => x.id === msg.senderId);
            return (mem && mem.avatar) || '';
        };

        let lastT = 0;
        let lastKey = null, lastTs = 0;
        let lastAiBody = null;
        let lastAiText = '';
        chat.history.forEach((msg) => {
            const info = displayOf(msg);
            if (info.who === 'hide' || (!info.text && !info.imgs && !info.voice)) return;
            if (msg.timestamp - lastT > 10 * 60 * 1000 ||
                new Date(msg.timestamp).toDateString() !== new Date(lastT).toDateString()) {
                log.appendChild(timeDivider(msg.timestamp));
            }
            lastT = msg.timestamp;

            const row = document.createElement('div');
            const senderKey = msg.role === 'user' ? 'user' : (msg.senderId || 'assistant');

            if (info.who === 'sys') {
                row.className = 'a-row sys';
                const s = document.createElement('div');
                s.className = 'a-sys';
                s.textContent = info.text;
                row.appendChild(s);
                lastKey = null;
                log.appendChild(row);
                return;
            }

            const isContinuous = lastKey === senderKey && (msg.timestamp - lastTs) < 10 * 60 * 1000;
            lastKey = senderKey;
            lastTs = msg.timestamp;

            const body = document.createElement('div');
            body.className = 'a-body';
            const avState = avatarStateOf(info.who, isContinuous);
            row.className = 'a-row' + (info.who === 'me' ? ' me' : '') + (avState !== 'none' ? ' has-av' : '');
            /* 成员专属头像框：群聊按 senderId 取，自己发送用我的框；私聊角色/我的框 */
            const memberFrames = (currentChatType === 'group' && chat.memberAvatarFrames) ? chat.memberAvatarFrames : {};
            const msgFrame = (msg.role === 'user') ? (chat.myAvatarFrame || null) : (memberFrames[msg.senderId] || null);
            const avEl = (state, url, frame) => {
                const a = document.createElement('div');
                a.className = 'a-avatar' + (state === 'ghost' ? ' ghost' : '') + (frame && frame.src ? ' has-frame' : '');
                if (state === 'show' && url) a.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
                if (frame && frame.src) {
                    a.style.setProperty('--frame-img', 'url("' + frame.src + '")');
                    a.style.setProperty('--frame-dx', (frame.dx || 0) + 'px');
                    a.style.setProperty('--frame-dy', (frame.dy || 0) + 'px');
                    a.style.setProperty('--frame-scale', (frame.scale || 100) / 100);
                }
                return a;
            };

            if (info.who === 'me') {
                if (avState !== 'none') row.appendChild(avEl(avState, avatarUrlOf(msg, 'me'), msgFrame));
                if (info.voice) {
                    body.appendChild(buildAVoiceBubble(info.voice, msg.id));
                } else if (info.imgs) {
                    const box = document.createElement('div');
                    box.className = 'a-imgs';
                    info.imgs.forEach(u => { const im = document.createElement('img'); im.src = u; im.loading = 'lazy'; box.appendChild(im); });
                    body.appendChild(box);
                } else if (bubbleOff()) {
                    const b = document.createElement('div');
                    b.className = 'a-nb-me';
                    b.textContent = info.text;
                    body.appendChild(b);
                } else {
                    const b = document.createElement('div');
                    b.className = 'a-bubble';
                    b.textContent = info.text;
                    body.appendChild(b);
                }
                row.appendChild(body);
            } else {
                if (avState !== 'none') row.appendChild(avEl(avState, avatarUrlOf(msg, 'ai'), msgFrame));
                if (info.name) {
                    const n = document.createElement('div');
                    n.className = 'a-who';
                    n.textContent = info.name;
                    body.appendChild(n);
                }
                if (info.voice) {
                    body.appendChild(buildAVoiceBubble(info.voice, msg.id));
                } else if (info.imgs) {
                    const box = document.createElement('div');
                    box.className = 'a-imgs';
                    info.imgs.forEach(u => { const im = document.createElement('img'); im.src = u; im.loading = 'lazy'; box.appendChild(im); });
                    body.appendChild(box);
                } else {
                    const g = document.createElement('div');
                    g.className = 'a-gu';
                    /* 群聊成员气泡：标记发送者，供成员专属气泡作用域样式 */
                    if (currentChatType === 'group' && msg.senderId) g.dataset.mid = msg.senderId;
                    /* 星尘雾：与 B 模式同一开关（chat.stardustEnabled），雾住的那几句包成 .mie-dust，
                       点一下由画布引擎化开（openAChat 里已把引擎挂到 #a-log） */
                    const frag = wrapAText(chat, info.text, chat.stardustEnabled === false ? null : msg.dust, msg.id || info.text);
                    if (frag.childNodes.length) g.appendChild(frag);
                    else g.textContent = info.text;
                    body.appendChild(g);
                    lastAiBody = body;
                    lastAiText = info.text;
                }
                row.appendChild(body);
            }
            log.appendChild(row);
        });
        // 无气泡模式：最后一条 AI 消息下面挂操作键（复制 / 念一遍 / 重说 / 编辑）
        if (bubbleOff() && lastAiBody && lastAiText) lastAiBody.appendChild(buildMsgActs(lastAiText));
        log.scrollTop = log.scrollHeight;
    }

    // ==================== 消息操作键（复制 / 念一遍 / 重说 / 编辑） ====================
    const ACT_ICONS = {
        copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
        play: '<polygon points="7 4 19 12 7 20 7 4" fill="currentColor" stroke="none"/>',
        retry: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><polyline points="20 3 20 8 15 8"/>',
        edit: '<path d="M4 20l4-1L20 7.5 16.5 4 5 15.5 4 20z"/>',
    };
    function buildMsgActs(text) {
        const bar = document.createElement('div');
        bar.className = 'a-mact';
        const acts = [
            ['copy', '复制', () => {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
                else if (typeof showToast === 'function') showToast('复制失败');
                if (typeof showToast === 'function') showToast('已复制');
            }],
            ['play', '念一遍', () => {
                try {
                    speechSynthesis.cancel();
                    const u = new SpeechSynthesisUtterance(text);
                    u.lang = 'zh-CN';
                    speechSynthesis.speak(u);
                } catch (e) { /* ignore */ }
            }],
            ['retry', '重说', () => {
                if (typeof handleRegenerate === 'function') { try { handleRegenerate(); } catch (e) { /* ignore */ } }
            }],
            ['edit', '编辑', () => {
                const box = document.getElementById('a-box');
                if (box) { box.value = text; box.dispatchEvent(new Event('input')); box.focus(); }
            }],
        ];
        acts.forEach(([k, tip, fn]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.title = tip;
            b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ACT_ICONS[k] || '') + '</svg>';
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
            bar.appendChild(b);
        });
        return bar;
    }

    function scheduleSync() { requestAnimationFrame(aSync); }

    // ==================== 输入中提示 ====================
    let typingTimer = null;
    let petWasTyping = false;
    function showTyping() {
        petWasTyping = true;
        try { if (window.APetX && APetX.petSet) APetX.petSet('typing'); } catch (e) { /* ignore */ }
        const t = document.getElementById('a-typing');
        if (!t) return;
        t.classList.add('on');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(hideTyping, 90000);
    }
    function hideTyping() {
        const t = document.getElementById('a-typing');
        if (t) t.classList.remove('on');
        clearTimeout(typingTimer);
    }
    // 只有当最后一条不再是用户消息（AI 已回复）时才收起"正在输入"
    function hideTypingIfReplied(chat) {
        const h = chat && chat.history;
        const last = h && h.length ? h[h.length - 1] : null;
        if (!last || last.role !== 'user') {
            hideTyping();
            if (petWasTyping) {
                petWasTyping = false;
                try { if (window.APetX && APetX.petSet) APetX.petSet('done', 3000); } catch (e) { /* ignore */ }
            }
        }
    }

    // ==================== 发送（走 B 的 sendMessage） ====================
    function aSend() {
        const box = document.getElementById('a-box');
        const text = (box.value || '').trim();
        if (!text) return;
        if (typeof window.sendMessage !== 'function' || typeof messageInput === 'undefined') return;
        box.value = '';
        box.style.height = 'auto';
        messageInput.value = text;
        showTyping();
        try {
            window.sendMessage();
            scheduleADelayedReply();
        } catch (e) {
            console.error('[AMode] send failed:', e);
            hideTyping();
        }
    }

    // ==================== A模式自动回复（发消息后 N 秒未再发才触发，期间再发则重新计时） ====================
    const aDelayTimers = new Map(); // key: chatType:chatId → timer
    function aDelaySeconds(chat) {
        const v = parseInt(chat && chat.aReplyDelay, 10);
        return (v > 0) ? v : 0;
    }
    function scheduleADelayedReply() {
        const key = currentChatType + ':' + currentChatId;
        const chat = chatOf(currentChatId, currentChatType);
        const sec = (currentChatType === 'private') ? aDelaySeconds(chat) : 0;
        if (aDelayTimers.has(key)) { clearTimeout(aDelayTimers.get(key)); aDelayTimers.delete(key); }
        if (!sec) return;
        const chatId = currentChatId, chatType = currentChatType;
        const t = setTimeout(async () => {
            aDelayTimers.delete(key);
            try {
                const c = db.characters.find(x => x.id === chatId);
                if (!c || !c.history || !c.history.length) return;
                if (c.history[c.history.length - 1].role !== 'user') return; // 已回复过，不重复触发
                if (typeof getAiReply !== 'function') return;
                const sameChat = (currentChatId === chatId && currentChatType === chatType);
                await getAiReply(chatId, chatType, sameChat ? false : true);
            } catch (e) {
                console.error('[AMode] delayed reply failed:', e);
            }
        }, sec * 1000);
        aDelayTimers.set(key, t);
    }

    // ==================== 「+」功能面板（复用 B 的展开面板） ====================
    let panelHome = null;
    function openExpansionPanel() {
        const panel = document.getElementById('chat-expansion-panel');
        const slot = document.getElementById('a-expansion-slot');
        if (!panel || !slot || typeof showPanel !== 'function') return;
        applyAFeatureLabelColor();
        // 已开着就收起（再点一次 + 收回）
        if (panel.classList.contains('visible') && panel.parentNode === slot) {
            showPanel('none');
            return;
        }
        if (!panelHome) panelHome = panel.parentNode;
        slot.appendChild(panel);
        showPanel('function');
    }
    // 点空白处收起：点在 A 界面里但不在这块面板/加号上
    function setupPanelBlankClose() {
        document.addEventListener('click', (e) => {
            if (!document.body.classList.contains('a-mode')) return;
            const panel = document.getElementById('chat-expansion-panel');
            if (!panel || !panel.classList.contains('visible')) return;
            if (panel.contains(e.target) || e.target.closest('#a-plus')) return;
            if (typeof showPanel === 'function') showPanel('none');
        }, true);
    }
    function watchExpansionPanel() {
        const panel = document.getElementById('chat-expansion-panel');
        if (!panel) return;
        new MutationObserver(() => {
            const slot = document.getElementById('a-expansion-slot');
            if (!panel.classList.contains('visible') && slot && panel.parentNode === slot && panelHome) {
                panelHome.insertBefore(panel, panelHome.firstChild);
            }
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    }

    // ==================== 设置（B 的聊天设置页） ====================
    function aOpenSettings() {
        if (currentChatType === 'private' && typeof loadSettingsToSidebar === 'function') {
            loadSettingsToSidebar();
            switchScreen('chat-settings-screen');
        } else if (currentChatType === 'group' && typeof loadGroupSettingsToSidebar === 'function') {
            loadGroupSettingsToSidebar();
            switchScreen('group-settings-screen');
        }
    }

    // ==================== 聊天列表（A 的 Chats 整页） ====================
    function buildChatsSheet() {
        if (document.getElementById('a-chats')) return;
        const sheet = document.createElement('div');
        sheet.id = 'a-chats';
        sheet.innerHTML = `
            <div class="a-chats-head">
                <button class="a-iconbtn" id="a-chats-close">${svg(ICONS.back)}</button>
                <div class="a-chats-title">Chats</div>
                <span style="width:40px;flex:none;"></span>
            </div>
            <div class="a-chats-body" id="a-chats-body"></div>
        `;
        document.body.appendChild(sheet);
        document.getElementById('a-chats-close').addEventListener('click', () => {
            document.getElementById('a-chats').classList.remove('on');
        });
        sheet.addEventListener('click', (e) => {
            const crow = e.target.closest('.a-crow');
            if (!crow) return;
            document.getElementById('a-chats').classList.remove('on');
            openAChat(crow.dataset.id, crow.dataset.type);
        });
    }

    function openChatsSheet() {
        buildChatsSheet();
        const body = document.getElementById('a-chats-body');
        body.innerHTML = '';
        const list = [];
        (db.characters || []).forEach(c => list.push({ id: c.id, type: 'private', chat: c }));
        (db.groups || []).forEach(g => list.push({ id: g.id, type: 'group', chat: g }));
        list.sort((a, b) => {
            const ta = (a.chat.history || []).length ? a.chat.history[a.chat.history.length - 1].timestamp : 0;
            const tb = (b.chat.history || []).length ? b.chat.history[b.chat.history.length - 1].timestamp : 0;
            return tb - ta;
        });
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'a-chats-empty';
            empty.textContent = '还没有聊天';
            body.appendChild(empty);
        }
        list.forEach(({ id, type, chat }) => {
            const h = chat.history || [];
            const last = h.length ? displayOf(h[h.length - 1], chat) : null;
            const ts = h.length ? h[h.length - 1].timestamp : 0;
            const row = document.createElement('button');
            row.className = 'a-crow';
            row.dataset.id = id;
            row.dataset.type = type;
            const mid = document.createElement('div');
            mid.className = 'a-cmid';
            const cn = document.createElement('div');
            cn.className = 'a-cn';
            cn.textContent = displayName(chat);
            const cp = document.createElement('div');
            cp.className = 'a-cp';
            let prev = last ? (last.text || '…') : '开始聊天吧';
            /* 雾住的句子不能在列表里漏出来（与 B 的聊天列表同规则） */
            if (last && window.MieStardust && chat.stardustEnabled !== false) {
                prev = window.MieStardust.redact(prev, h[h.length - 1].dust);
            }
            cp.textContent = prev;
            mid.appendChild(cn);
            mid.appendChild(cp);
            const ct = document.createElement('div');
            ct.className = 'a-ct';
            ct.textContent = ts ? fmtTime(ts) : '';
            row.appendChild(mid);
            row.appendChild(ct);
            body.appendChild(row);
        });
        document.getElementById('a-chats').classList.add('on');
    }

    // ==================== 打开聊天 ====================
    function openAChat(id, type) {
        currentChatId = id;
        currentChatType = type;
        if (typeof openChatRoom === 'function') {
            openChatRoom(id, type);   // 会让 chat-room-screen 变 active → 覆盖层自动显示
        }
        // A 模式用自己的气泡样式（与 B 分开），并清掉 B 的注入防止污染
        if (typeof updateACustomBubbleStyle === 'function') {
            const ch = chatOf(id, type);
            updateACustomBubbleStyle(id, ch ? (ch.aCustomBubbleCss || '') : '', !!(ch && ch.aUseCustomBubbleCss));
        }
        applyAFeatureLabelColor(id);
        updateAHeader();
        scheduleSync();
        // 星尘画布挂到 A 的聊天流上（openChatRoom 里 B 的挂载已按模式跳过，这里直接接手）
        if (window.MieStardust) setTimeout(() => window.MieStardust.attach('a'), 120);
        // 每次进入角色聊天界面都显示开屏
        setTimeout(showSplash, 320);
    }

    // 功能面板文字颜色（角色设置里自定义，'' = 跟随默认）
    function applyAFeatureLabelColor(id) {
        const app = document.getElementById('a-app');
        if (!app) return;
        const ch = (db.characters || []).find(c => c.id === (id || currentChatId));
        const color = ch && ch.featureLabelColor;
        if (color) app.style.setProperty('--a-func-label-color', color);
        else app.style.removeProperty('--a-func-label-color');
    }

    function findMostRecentChat() {
        let best = null, bestTime = -1;
        const scan = (list, type) => (list || []).forEach((c) => {
            const h = c.history || [];
            const t = h.length ? (h[h.length - 1].timestamp || 0) : 0;
            if (t > bestTime) { bestTime = t; best = { id: c.id, type }; }
        });
        scan(db.characters, 'private');
        scan(db.groups, 'group');
        return best;
    }

    // ==================== 覆盖层可见性：跟随 chat-room-screen ====================
    function appVisible() {
        const room = document.getElementById('chat-room-screen');
        return !!(room && room.classList.contains('active'));
    }
    function updateOverlay() {
        const app = document.getElementById('a-app');
        if (!app) return;
        const on = isEnabled() && appVisible();
        app.classList.toggle('on', on);
        document.body.classList.toggle('a-chat-on', on);
        if (on) {
            updateAHeader();
            scheduleSync();
        }
    }
    function setupScreenWatcher() {
        new MutationObserver(() => updateOverlay()).observe(document.body, {
            attributes: true, attributeFilter: ['class'], subtree: true
        });
    }

    // ==================== 锁屏 ====================
    let lockClockTimer = null;
    let lockUnlocked = false;

    function buildLockScreen() {
        if (document.getElementById('a-lock')) return;
        lockUnlocked = false;
        const lock = document.createElement('div');
        lock.id = 'a-lock';
        lock.innerHTML = `
            <div class="al-inner">
                <div class="al-time" id="al-time">--:--</div>
                <div class="al-date" id="al-date"></div>
            </div>
            <div class="al-track" id="al-track">
                <span class="al-hint">slide to unlock</span>
                <div class="al-knob" id="al-knob">${svg('<path d="M9 6l6 6-6 6"/>')}</div>
            </div>
        `;
        document.body.appendChild(lock);
        updateLockClock();
        lockClockTimer = setInterval(updateLockClock, 15000);
        setupLockDrag(lock);
    }

    function updateLockClock() {
        const t = document.getElementById('al-time');
        const d = document.getElementById('al-date');
        if (!t || !d) return;
        const n = new Date();
        t.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
        const week = ['日', '一', '二', '三', '四', '五', '六'][n.getDay()];
        d.textContent = `${n.getMonth() + 1}月${n.getDate()}日 星期${week}`;
    }

    function setupLockDrag(lock) {
        const track = lock.querySelector('#al-track');
        const knob = lock.querySelector('#al-knob');
        if (!track || !knob) return;

        let startX = 0, curX = 0, dragging = false, downX = 0;
        const maxOffset = () => Math.max(1, track.offsetWidth - knob.offsetWidth - 10);

        const onDown = (x) => { dragging = true; downX = x; startX = x - curX; knob.classList.add('dragging'); };
        const onMove = (x) => {
            if (!dragging || lockUnlocked) return;
            curX = Math.max(0, Math.min(maxOffset(), x - startX));
            knob.style.transform = `translateX(${curX}px)`;
            const hint = track.querySelector('.al-hint');
            if (hint) hint.style.opacity = String(Math.max(0, 1 - curX / (maxOffset() * 0.45)));
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            knob.classList.remove('dragging');
            if (curX > maxOffset() * 0.7) {
                unlockLockScreen();
            } else {
                curX = 0;
                knob.style.transform = '';
                const hint = track.querySelector('.al-hint');
                if (hint) hint.style.opacity = '';
            }
        };

        knob.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(e.clientX); });
        // 直接点轨道也能解锁：pointerdown 先记下起点，click 才不会被"拖动过"的判断拦住
        track.addEventListener('pointerdown', (e) => { downX = e.clientX; });
        window.addEventListener('pointermove', (e) => onMove(e.clientX));
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        track.addEventListener('click', (e) => {
            if (lockUnlocked) return;
            if (Math.abs(e.clientX - downX) > 12) return;
            unlockLockScreen();
        });
    }

    function unlockLockScreen() {
        if (lockUnlocked) return;
        lockUnlocked = true;
        const lock = document.getElementById('a-lock');
        if (lockClockTimer) { clearInterval(lockClockTimer); lockClockTimer = null; }
        if (lock) {
            lock.classList.add('hide');
            setTimeout(() => lock.remove(), 460);
        }
        const recent = findMostRecentChat();
        if (recent) {
            openAChat(recent.id, recent.type);  // openAChat 内部会显示开屏
        } else {
            if (typeof showToast === 'function') showToast('还没有聊天，先添加一个角色吧');
            openDrawer();
        }
    }

    // ==================== A 模式开屏（他/我头像 + 开屏语） ====================
    let splashGone = false;
    // AI 可在聊天中用 [角色名更新开屏语：xxx] 更新开屏语（隐藏指令）
    const SPLASH_CMD = /\[(?:[^\[\]]{0,30}?)更新开屏语[：:]([\s\S]*?)\]/;
    function harvestSplashQuote(chat) {
        if (!chat || !Array.isArray(chat.history)) return;
        for (let i = chat.history.length - 1; i >= 0; i--) {
            const c = chat.history[i] && chat.history[i].content;
            const m = (typeof c === 'string' ? c : '').match(SPLASH_CMD);
            if (m) {
                const q = m[1].trim();
                if (q && chat.splashQuote !== q) {
                    chat.splashQuote = q;
                    if (typeof saveData === 'function') { try { saveData(); } catch (e) { /* ignore */ } }
                }
                break;
            }
        }
    }
    function splashQuote(chat) {
        // 角色自己写过的开屏语优先
        if (chat && typeof chat.splashQuote === 'string' && chat.splashQuote.trim()) {
            return chat.splashQuote.trim();
        }
        let quotes = null;
        try {
            const c = JSON.parse(localStorage.getItem('mie_splash_config_v1') || '{}');
            if (Array.isArray(c.quotes)) {
                quotes = c.quotes.filter((q) => typeof q === 'string' && q.trim());
            }
        } catch (e) { /* ignore */ }
        if ((!quotes || !quotes.length) && window.MistSplashDefaults && Array.isArray(window.MistSplashDefaults.quotes)) {
            quotes = window.MistSplashDefaults.quotes.filter((q) => typeof q === 'string' && q.trim());
        }
        if (!quotes || !quotes.length) quotes = ['想我了吗？'];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }
    function splashDays(chat) {
        try {
            // 从创建角色（加好友）那天开始算
            let ts = 0;
            if (chat) {
                if (chat.friendSince) ts = Number(chat.friendSince) || 0;
                if (!ts) {
                    const m = String(chat.id || '').match(/^char_(\d+)$/);
                    if (m) ts = Number(m[1]) || 0;
                }
                if (!ts && chat.createdAt) ts = Number(chat.createdAt) || 0;
            }
            if (!ts) {
                // 兜底：最早一条消息的时间
                const h = chat && (chat.history || []);
                let oldest = Infinity;
                for (const m of h) {
                    const t = Number(m.timestamp || m.time || 0);
                    if (t > 0 && t < oldest) oldest = t;
                }
                if (isFinite(oldest) && oldest > 0) ts = oldest;
            }
            if (!ts) return '';
            const days = Math.max(1, Math.floor((Date.now() - ts) / 86400000) + 1);
            return '在一起第 ' + days + ' 天';
        } catch (e) { return ''; }
    }
    function paintSplashFaces(chat) {
        const her = document.querySelector('#a-splash .sp-face.her');
        const me = document.querySelector('#a-splash .sp-face.me');
        if (!her || !me) return;
        const herUrl = chat ? (chat.avatar || (chat.members && chat.members[0] && chat.members[0].avatar) || '') : '';
        const meUrl = chat ? (chat.myAvatar || '') : '';
        [[her, herUrl, '他'], [me, meUrl, '我']].forEach(([el, url, fallback]) => {
            if (url) {
                el.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
                el.classList.add('has');
            } else {
                el.style.backgroundImage = '';
                el.classList.remove('has');
                el.innerHTML = '<span>' + fallback + '</span>';
            }
        });
    }
    function showSplash() {
        if (!document.body.classList.contains('a-mode')) return;
        const chat = chatOf(currentChatId, currentChatType);
        harvestSplashQuote(chat);
        let root = document.getElementById('a-splash');
        if (!root) {
            root = document.createElement('div');
            root.id = 'a-splash';
            root.innerHTML =
                '<div class="sp-in">' +
                '<div class="sp-faces">' +
                '<div class="sp-face her"><span>他</span></div>' +
                '<div class="sp-face me"><span>我</span></div>' +
                '</div>' +
                '<div class="sp-hello" id="a-sp-hello"></div>' +
                '<div class="sp-days" id="a-sp-days"></div>' +
                '</div>';
            document.body.appendChild(root);
        }
        splashGone = false;
        paintSplashFaces(chat);
        const hello = root.querySelector('#a-sp-hello');
        const days = root.querySelector('#a-sp-days');
        if (hello) hello.textContent = splashQuote(chat);
        if (days) days.textContent = splashDays(chat);
        document.body.classList.add('a-splash-on');
        root.classList.remove('out');
        root.classList.add('show');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => root.classList.add('in'));
        });
        const leave = () => {
            if (splashGone) return;
            splashGone = true;
            root.classList.add('out');
            setTimeout(() => document.body.classList.remove('a-splash-on'), 620);
            setTimeout(() => {
                root.classList.remove('show', 'in', 'out');
            }, 1000);
        };
        root.onclick = leave;
        root.ontouchend = (e) => { e.preventDefault(); leave(); };
    }

    function showLockScreen() {
        buildLockScreen();
    }

    // ==================== 抽屉（左缘把手 / 左上角 → 功能栏） ====================
    // B 全部 APP（启动逻辑对齐 ui.js 里桌面图标的渲染钩子）
    const DRAWER_APPS = [
        { label: '聊天', icon: 'chat', run: () => openChatsSheet() },
        { label: '桌宠', icon: 'crab', run: () => { if (window.APetX) window.APetX.open(); } },
        { label: '日历', icon: 'cal', target: 'calendar-screen' },
        { label: '共读', icon: 'book', target: 'reader-bookshelf-screen' },
        { label: '同页', icon: 'pen', run: () => { if (typeof window.TongyeOpen === 'function') window.TongyeOpen(); } },
        { label: '朋友圈', icon: 'camera', target: 'moments-screen' },
        { label: 'instagram', icon: 'camera', target: 'instagram-screen' },
        { label: '小红书', icon: 'news', target: 'xiaohongshu-screen' },
        { label: '叽哩叽哩', icon: 'play', target: 'jili-screen' },
        { label: '世界书', icon: 'globe', run: () => { if (typeof renderWorldBookList === 'function') renderWorldBookList(); switchScreen('world-book-screen'); } },
        { label: '知识库', icon: 'box', run: () => { switchScreen('knowledge-screen'); if (typeof window.renderKnowledge === 'function') window.renderKnowledge(); } },
        { label: '控制台', icon: 'chip', target: 'console-screen' },
        { label: '商城', icon: 'bag', target: 'shop-screen' },
        { label: '网易云音乐', icon: 'music', target: 'radio-screen' },
        { label: '藏宝地图', icon: 'map', run: () => { switchScreen('treasure-map-screen'); if (window.TreasureMap) window.TreasureMap.open(); } },
        { label: '单词本', icon: 'abc', target: 'vocab-book-screen' },
        { label: '信箱', icon: 'mail', run: () => { if (window.Mailbox) window.Mailbox.render(); switchScreen('mailbox-screen'); } },
        { label: '美化', icon: 'spark', run: () => { if (typeof renderCustomizeForm === 'function') renderCustomizeForm(); switchScreen('customize-screen'); } },
        { label: '小组件', icon: 'grid', run: () => { if (typeof renderWidgetMarket === 'function') renderWidgetMarket(); switchScreen('widget-market-screen'); } },
        { label: '开屏语', icon: 'spark', run: () => { if (window.ASplashSet) ASplashSet.open(); } },
        { label: 'API 设置', icon: 'chip', run: () => { if (window.AApiSet) AApiSet.open(); } },
    ];
    const DRAWER_PREVIEW_COUNT = 4;   // 默认只显示 4 个 APP，点「展开」看全部
    let drawerExpanded = false;
    try { drawerExpanded = localStorage.getItem('a_drawer_expanded') === '1'; } catch (e) { /* ignore */ }

    const DRAWER_ICONS = {
        crab: '<path d="M7.5 8.5C6 7 6.5 5 7.8 4.5M16.5 8.5C18 7 17.5 5 16.2 4.5"/><ellipse cx="12" cy="13" rx="4.5" ry="3.5"/><circle cx="10.3" cy="12.2" r="0.4" fill="currentColor" stroke="none"/><circle cx="13.7" cy="12.2" r="0.4" fill="currentColor" stroke="none"/><path d="M7.5 8.5c1.2 1 2.8 1.5 4.5 1.5s3.3-0.5 4.5-1.5"/><path d="M3.5 13.5h4M16.5 13.5h4M4.5 17.5l3.2-1.6M19.5 17.5l-3.2-1.6M7 20l2.6-2M17 20l-2.6-2"/>',
        island: '<rect x="3" y="9.25" width="18" height="6.5" rx="3.25"/><circle cx="8" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><path d="M12.5 12.5h5"/>',
        chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
        cal: '<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
        news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9h4"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/>',
        box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
        chip: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
        spark: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2L12 3z"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        play: '<polygon points="5 3 19 12 5 21 5 3"/>',
        globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
        music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
        map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
        abc: '<path d="M4 7V5h16v2M9 20h6M12 4v16"/>',
        note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="2.5 7 12 14 21.5 7"/>',
        grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        swap: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
        chev: '<polyline points="6 9 12 15 18 9"/>'
    };
    const drawerSvg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

    function ensureDrawer() {
        if (document.getElementById('a-drawer-wrap')) return;
        const wrap = document.createElement('div');
        wrap.id = 'a-drawer-wrap';
        wrap.innerHTML = `
            <div class="a-drawer-scrim" id="a-drawer-scrim"></div>
            <nav class="a-drawer" id="a-drawer">
                <div class="ad-brand">功能</div>
                <div class="ad-nav">
                    <div class="ad-apps" id="ad-apps"></div>
                    <button class="ad-item ad-expand" id="ad-expand">
                        <span id="ad-expand-label">展开</span>
                        ${drawerSvg(DRAWER_ICONS.chev)}
                    </button>
                    <div class="ad-label">好友</div>
                    <div class="ad-chars" id="ad-chars"></div>
                </div>
                <div class="ad-foot">
                    <button class="ad-item" id="ad-switch">
                        ${drawerSvg(DRAWER_ICONS.swap)}
                        <span>切换模式</span>
                    </button>
                </div>
            </nav>
        `;
        document.body.appendChild(wrap);
        renderDrawerApps();
        renderDrawerChars();
        wrap.addEventListener('click', (e) => {
            if (e.target.id === 'a-drawer-scrim') { closeDrawer(); return; }
            const charItem = e.target.closest('.ad-char');
            if (charItem) {
                closeDrawer();
                setTimeout(() => openAChat(charItem.dataset.id, charItem.dataset.type), 80);
                return;
            }
            if (e.target.closest('#ad-expand')) {
                drawerExpanded = !drawerExpanded;
                try { localStorage.setItem('a_drawer_expanded', drawerExpanded ? '1' : '0'); } catch (err) { /* ignore */ }
                renderDrawerApps();
                return;
            }
            const item = e.target.closest('.ad-item');
            if (!item) return;
            const idx = item.getAttribute('data-ad-index');
            closeDrawer();
            if (idx !== null) {
                const it = DRAWER_APPS[+idx];
                if (it && typeof it.run === 'function') setTimeout(it.run, 80);
                return;
            }
            if (item.id === 'ad-switch') { toggle(); return; }
        });
    }

    function renderDrawerApps() {
        const box = document.getElementById('ad-apps');
        const expandLabel = document.getElementById('ad-expand-label');
        if (!box) return;
        const count = drawerExpanded ? DRAWER_APPS.length : Math.min(DRAWER_PREVIEW_COUNT, DRAWER_APPS.length);
        box.innerHTML = DRAWER_APPS.slice(0, count).map((it, i) => `
            <button class="ad-item" data-ad-index="${i}">
                ${drawerSvg(DRAWER_ICONS[it.icon] || DRAWER_ICONS.box)}
                <span>${it.label}</span>
            </button>`).join('');
        if (expandLabel) {
            expandLabel.textContent = drawerExpanded ? '收起' : '展开全部';
            const expandBtn = document.getElementById('ad-expand');
            if (expandBtn) expandBtn.classList.toggle('open', drawerExpanded);
        }
    }

    function renderDrawerChars() {
        const box = document.getElementById('ad-chars');
        if (!box) return;
        box.innerHTML = '';
        const list = [];
        (db.characters || []).forEach(c => list.push({ id: c.id, type: 'private', chat: c }));
        (db.groups || []).forEach(g => list.push({ id: g.id, type: 'group', chat: g }));
        list.sort((a, b) => {
            const ta = (a.chat.history || []).length ? a.chat.history[a.chat.history.length - 1].timestamp : 0;
            const tb = (b.chat.history || []).length ? b.chat.history[b.chat.history.length - 1].timestamp : 0;
            return tb - ta;
        });
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'ad-chars-empty';
            empty.textContent = '还没有好友';
            box.appendChild(empty);
            return;
        }
        list.forEach(({ id, type, chat }) => {
            const h = chat.history || [];
            const ts = h.length ? h[h.length - 1].timestamp : 0;
            const row = document.createElement('button');
            row.className = 'ad-char';
            row.dataset.id = id;
            row.dataset.type = type;
            const dot = document.createElement('span');
            dot.className = 'adc-dot';
            const av = type === 'private'
                ? (chat.avatar || '')
                : (chat.avatar || (chat.members && chat.members[0] && chat.members[0].avatar) || '');
            if (av) {
                dot.classList.add('has-img');
                dot.style.backgroundImage = `url("${String(av).replace(/"/g, '%22')}")`;
            } else {
                dot.textContent = (displayName(chat) || '?').charAt(0);
            }
            const name = document.createElement('span');
            name.className = 'adc-name';
            name.textContent = displayName(chat) || '未命名';
            const time = document.createElement('span');
            time.className = 'adc-time';
            time.textContent = ts ? fmtTime(ts) : '';
            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(time);
            box.appendChild(row);
        });
    }

    function openDrawer() {
        ensureDrawer();
        renderDrawerChars();
        requestAnimationFrame(() => {
            const w = document.getElementById('a-drawer-wrap');
            if (w) w.classList.add('open');
        });
    }

    function closeDrawer() {
        const w = document.getElementById('a-drawer-wrap');
        if (w) w.classList.remove('open');
    }

    function ensureEdgeHandle() {
        if (document.getElementById('a-edge-handle')) return;
        const handle = document.createElement('div');
        handle.id = 'a-edge-handle';
        handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
        document.body.appendChild(handle);
    }

    // ==================== 导航覆盖：A 模式下"回主屏幕"= 回聊天 ====================
    function setupNavOverrides() {
        document.body.addEventListener('click', (e) => {
            if (!document.body.classList.contains('a-mode')) return;
            const back = e.target.closest('.back-btn[data-target="home-screen"], .hidden-back-btn[data-target="home-screen"]');
            if (back) {
                e.preventDefault();
                e.stopPropagation();
                if (currentChatId) {
                    switchScreen('chat-room-screen');
                } else {
                    openChatsSheet();
                }
                return;
            }
            if (e.target.closest('#a-edge-handle')) {
                e.preventDefault();
                openDrawer();
            }
        }, true);
    }

    // ==================== 钩子：B 的渲染函数 → 同步 A 界面 ====================
    function setupHooks() {
        // 清洗脏消息：空 parts 数组会让 B 的渲染器崩掉（parts[0].type 读取 undefined）
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
                    if (document.body.classList.contains('a-mode') &&
                        targetChatId === currentChatId && targetChatType === currentChatType) {
                        aSyncDirty = true;   // 新消息：强制下次 aSync 重建
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
                    // B 渲染器对脏数据崩溃时不中断 A 模式流程（A 层自己从 history 渲染）
                    console.warn('[AMode] renderMessages error:', e && e.message);
                    scheduleSync();
                    return r;
                }
                try {
                    if (document.body.classList.contains('a-mode')) {
                        aSyncDirty = true;   // B 重渲（编辑/撤回/删除/分页等）→ 强制 A 重建
                        scheduleSync();
                    }
                } catch (e) { /* ignore */ }
                return r;
            };
        }
        if (typeof window.openChatRoom === 'function') {
            const _open = window.openChatRoom;
            window.openChatRoom = function (chatId, type) {
                try {
                    sanitizeHistory(chatOf(chatId, type));
                } catch (e) { /* ignore */ }
                const r = _open.apply(this, arguments);
                try {
                    if (document.body.classList.contains('a-mode')) {
                        currentChatId = chatId;
                        currentChatType = type;
                        aSyncDirty = true;   // 切换会话：强制重建
                        updateAHeader();
                        scheduleSync();
                    }
                } catch (e) { /* ignore */ }
                return r;
            };
        }
    }

    // ==================== A 外观设置注入（聊天设置 · 美化标签顶部） ====================
    function injectALookSettings() {
        const tab = document.getElementById('setting-tab-style');
        if (!tab || document.getElementById('a-mode-look-group')) return;
        const group = document.createElement('div');
        group.className = 'kkt-group a-mode-look-group';
        group.id = 'a-mode-look-group';
        group.innerHTML = `
            <div class="kkt-item">
                <div class="kkt-item-label">界面风格</div>
                <div class="kkt-item-control">
                    <select id="a-mode-look-select" style="border:none; background:transparent; text-align:right;">
                        <option value="classic">经典</option>
                        <option value="glass">液态玻璃</option>
                    </select>
                    <span class="kkt-arrow">›</span>
                </div>
            </div>
            <div class="kkt-item" id="a-mode-glass-row" style="display:none;">
                <div class="kkt-item-label">玻璃质感</div>
                <div class="kkt-item-control">
                    <input type="range" id="a-mode-glass-range" min="0" max="100" step="1" value="100">
                    <span class="a-glass-val" id="a-mode-glass-val">透明</span>
                </div>
            </div>
            <div class="kkt-item">
                <div class="kkt-item-label">气泡</div>
                <div class="kkt-item-control">
                    <label class="kkt-switch">
                        <input type="checkbox" id="a-mode-bubble-toggle">
                        <span class="kkt-slider"></span>
                    </label>
                </div>
            </div>
            <div class="kkt-item">
                <div class="kkt-item-label">发送键颜色</div>
                <div class="kkt-item-control">
                    <button type="button" id="a-mode-send-reset" style="border:none;background:transparent;font-size:12px;color:inherit;opacity:.6;cursor:pointer;padding:0 2px;">默认</button>
                    <input type="color" id="a-mode-send-color" style="width:30px;height:26px;border:none;background:transparent;padding:0;cursor:pointer;">
                </div>
            </div>
        `;
        tab.insertBefore(group, tab.firstChild);
        const lookSel = group.querySelector('#a-mode-look-select');
        const glassRow = group.querySelector('#a-mode-glass-row');
        const glassRange = group.querySelector('#a-mode-glass-range');
        const glassValEl = group.querySelector('#a-mode-glass-val');
        const bubbleToggle = group.querySelector('#a-mode-bubble-toggle');
        lookSel.value = db.aModeLook === 'glass' ? 'glass' : 'classic';
        glassRow.style.display = lookSel.value === 'glass' ? '' : 'none';
        glassRange.value = glassVal();
        glassValEl.textContent = glassLabel(glassVal());
        bubbleToggle.checked = db.aModeBubble !== 'off';
        bubbleToggle.addEventListener('change', async () => {
            db.aModeBubble = bubbleToggle.checked ? 'on' : 'off';
            try { await saveData(); } catch (e) { console.error('[AMode] save failed:', e); }
            aSyncDirty = true;   // 气泡开关变了：强制重建
            scheduleSync();
        });
        const sendColor = group.querySelector('#a-mode-send-color');
        const sendReset = group.querySelector('#a-mode-send-reset');
        sendColor.value = sendColorVal();
        sendColor.addEventListener('input', async () => {
            db.aModeSendColor = sendColor.value;
            applySendColor();
            try { await saveData(); } catch (e) { /* 拖动中静默 */ }
        });
        sendReset.addEventListener('click', async () => {
            db.aModeSendColor = '';
            sendColor.value = '#c96442';
            applySendColor();
            try { await saveData(); } catch (e) { console.error('[AMode] save failed:', e); }
        });
        lookSel.addEventListener('change', async () => {
            db.aModeLook = lookSel.value;
            glassRow.style.display = lookSel.value === 'glass' ? '' : 'none';
            try { await saveData(); } catch (e) { console.error('[AMode] save failed:', e); }
            applyLookClasses();
        });
        glassRange.addEventListener('input', async () => {
            const v = +glassRange.value;
            db.aModeGlass = v;
            glassValEl.textContent = glassLabel(v);
            applyGlassTune();
            try { await saveData(); } catch (e) { /* 拖动中静默，change 时再存 */ }
        });
        glassRange.addEventListener('change', async () => {
            try { await saveData(); } catch (e) { console.error('[AMode] save failed:', e); }
        });
    }

    function applyLookClasses() {
        document.body.classList.toggle('a-look-glass', db.aModeLook === 'glass');
        refreshGlassSample();
        applySendColor();
    }

    // 发送按钮颜色：空串=回默认
    function sendColorVal() {
        const c = (db.aModeSendColor || '').trim();
        return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#c96442';
    }
    function applySendColor() {
        const s = document.body.style;
        const c = (db.aModeSendColor || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(c)) s.setProperty('--a-send-bg', c);
        else s.removeProperty('--a-send-bg');
    }

    // 玻璃质感：0=磨砂 100=透明（滑杆 = 规范 §5 的材质强度 0→1.5，100 即规范原设计 1.0）
    function glassVal() {
        const v = +(db.aModeGlass == null ? 100 : db.aModeGlass);
        return Math.max(0, Math.min(100, isNaN(v) ? 100 : v));
    }

    /* ---------- 液态玻璃令牌引擎（专业规范） ----------
       采样：背景图按头部/中部/底部三个带各取 5×3 网格，去掉最暗最亮各 2 点后求均值；
       亮度 luma=(0.299R+0.587G+0.114B)/255，texture=亮暗极差，chroma=平均饱和度。
       墨水：luma<0.5 用亮字（滞回 ±0.05 防闪烁，记忆在 db.aGlassInk）；
       密度决定薄/厚 tint（亮玻璃 6%→22%，暗玻璃 10%→30%）；饱和度保留防染色。 */
    function _lgClamp01(x) { return Math.max(0, Math.min(1, x)); }

    function _lgBandStats(pts) {
        if (!pts || pts.length < 5) return null;
        const luma = p => (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
        const sorted = pts.slice().sort((a, b) => luma(a) - luma(b));
        const kept = sorted.slice(2, sorted.length - 2); // 丢最暗 2 + 最亮 2
        if (!kept.length) return null;
        let sl = 0, chroma = 0;
        kept.forEach(p => {
            sl += luma(p);
            chroma += (Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b)) / 255;
        });
        return {
            luma: sl / kept.length,
            texture: _lgClamp01(luma(sorted[sorted.length - 1]) - luma(sorted[0])),
            chroma: _lgClamp01(chroma / kept.length)
        };
    }

    const _lgSampleCache = new Map(); // bg -> bands|null
    let _lgLastBands = null;          // 当前聊天的三带采样结果
    let _lgCurrentBg = '';

    function _lgSampleBands(bg) {
        if (!bg) return Promise.resolve(null);
        if (_lgSampleCache.has(bg)) return Promise.resolve(_lgSampleCache.get(bg));
        return new Promise(resolve => {
            try {
                const img = new Image();
                img.onload = () => {
                    try {
                        const W = 64;
                        const H = Math.max(8, Math.round(W * img.naturalHeight / Math.max(1, img.naturalWidth)));
                        const cv = document.createElement('canvas');
                        cv.width = W; cv.height = H;
                        const cx = cv.getContext('2d');
                        cx.drawImage(img, 0, 0, W, H);
                        const data = cx.getImageData(0, 0, W, H).data;
                        const zone = (y0, y1) => {
                            const pts = [];
                            for (let gy = 0; gy < 3; gy++) {
                                for (let gx = 0; gx < 5; gx++) {
                                    const x = Math.min(W - 1, Math.round((gx + 0.5) / 5 * W));
                                    const y = Math.min(H - 1, Math.round((y0 + (gy + 0.5) / 3 * (y1 - y0)) * H));
                                    const i = (y * W + x) * 4;
                                    if (data[i + 3] > 10) pts.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
                                }
                            }
                            return _lgBandStats(pts);
                        };
                        const bands = { t: zone(0, 0.3), m: zone(0.35, 0.65), b: zone(0.7, 1) };
                        _lgSampleCache.set(bg, bands);
                        resolve(bands);
                    } catch (e) { resolve(null); } // 画布污染等
                };
                img.onerror = () => resolve(null);
                img.src = bg;
            } catch (e) { resolve(null); }
        });
    }

    function _lgBandTokens(st, inkMemory, unreadable) {
        const v = glassVal();
        const scale = v / 100 * 1.5;
        // 最右端"透明"：切换参考 liquid-glass-note 的 clear 材质（blur 0 / tint 近零 / 边缘厚度高光 + 近远两层投影）
        const clear = v >= 92;
        const blur = clear ? 0 : Math.round(4 + (100 - v) * 0.24);
        let dark = inkMemory === 'dark';
        if (st) {
            if (Math.abs(st.luma - 0.5) > 0.05) dark = st.luma < 0.5; // 滞回防闪烁
        } else if (unreadable) {
            dark = false; // 背景不可读：墨水取主题（亮）
        }
        if (clear) {
            // clear 材质：无模糊、极轻 smoke（只保文字可读），亮暗背景分别给边缘厚度与投影
            const satKept = st ? Math.max(0.45, 1 - 0.75 * st.chroma) : 1;
            return {
                dark,
                tint: dark ? 'rgba(16,18,22,0.10)' : 'rgba(255,255,255,0.05)',
                filter: 'blur(0px) saturate(' + Math.round((dark ? 165 : 185) * satKept) + '%) brightness(1)',
                edge: dark
                    ? 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.40), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.22), inset 0 0 0 .5px rgba(255,255,255,.14), 0 7px 18px rgba(0,0,0,.30), 0 2px 5px rgba(0,0,0,.18)'
                    : 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.95), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.42), inset 0 0 0 .5px rgba(255,255,255,.38), 0 7px 18px rgba(20,26,38,.105), 0 2px 5px rgba(20,26,38,.035)',
                ink: dark ? 'rgba(255,255,255,.94)' : 'rgba(0,0,0,.86)',
                inkDim: dark ? 'rgba(235,235,245,.64)' : 'rgba(60,60,67,.70)',
                blend: dark ? 'plus-lighter' : 'multiply',
                hi: dark ? 0.14 : 0.45
            };
        }
        const thin = dark ? 0.10 : 0.06, dense = dark ? 0.30 : 0.22;
        const inkBright = dark ? 0.94 : 0.14;
        const density = st
            ? _lgClamp01(0.55 * (1 - Math.abs(st.luma - inkBright)) + 0.7 * st.texture + 0.3 * st.chroma)
            : 1; // 不可读背景用高密度 tint
        const alpha = Math.min(0.72, (thin + (dense - thin) * density) * scale);
        const satKept = st ? Math.max(0.45, 1 - 0.75 * st.chroma) : 1;
        const bright = dark ? 0.85 : (scale > 0 ? (1 + 0.06 * Math.min(1, scale)) : 1); // 亮度提升随滑杆变薄
        return {
            dark,
            tint: (dark ? 'rgba(16,18,22,' : 'rgba(255,255,255,') + alpha.toFixed(3) + ')',
            filter: 'blur(' + blur + 'px) saturate(' + Math.round((dark ? 165 : 180) * satKept) + '%) brightness(' + bright.toFixed(3) + ')',
            edge: dark
                ? 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.32), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.18), inset 0 0 0 .5px rgba(255,255,255,.10), 0 0 0 .5px rgba(0,0,0,.45), 0 6px 24px rgba(0,0,0,.28)'
                : 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.95), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.55), inset 0 0 0 .5px rgba(255,255,255,.30), 0 0 0 .5px rgba(0,0,0,.06), 0 6px 24px rgba(0,0,0,.08)',
            ink: dark ? 'rgba(255,255,255,.94)' : 'rgba(0,0,0,.86)',
            inkDim: dark ? 'rgba(235,235,245,.64)' : 'rgba(60,60,67,.70)',
            blend: dark ? 'plus-lighter' : 'multiply',
            hi: dark ? 0.10 : 0.30
        };
    }

    async function applyGlassTune() {
        // 旧变量保留（兼容其他引用处）
        const v = glassVal();
        const bs = document.body.style;
        bs.setProperty('--glass-blur', Math.round((100 - v) * 0.38) + 'px');
        bs.setProperty('--glass-tint', (0.28 + (100 - v) * 0.0044).toFixed(3));
        bs.setProperty('--glass-tint-d', (0.3 + (100 - v) * 0.0026).toFixed(3));
        const app = document.getElementById('a-app');
        if (!app || !document.body.classList.contains('a-look-glass')) return;
        const inkMem = (db && db.aGlassInk && typeof db.aGlassInk === 'object') ? db.aGlassInk : {};
        let inkChanged = false;
        ['t', 'm', 'b'].forEach(band => {
            const st = _lgLastBands ? _lgLastBands[band] : null;
            const tk = _lgBandTokens(st, inkMem[band], !_lgLastBands);
            const want = tk.dark ? 'dark' : 'light';
            if (inkMem[band] !== want) { inkMem[band] = want; inkChanged = true; }
            const s = app.style;
            s.setProperty('--lg-tint-' + band, tk.tint);
            s.setProperty('--lg-filter-' + band, tk.filter);
            s.setProperty('--lg-edge-' + band, tk.edge);
            s.setProperty('--lg-ink-' + band, tk.ink);
            s.setProperty('--lg-ink-dim-' + band, tk.inkDim);
            s.setProperty('--lg-blend-' + band, tk.blend);
            s.setProperty('--lg-hi-' + band, String(tk.hi));
        });
        if (db) {
            db.aGlassInk = inkMem;
            if (inkChanged) { try { saveData(); } catch (e) { /* ignore */ } }
        }
    }

    async function refreshGlassSample() {
        if (!document.body.classList.contains('a-look-glass')) { _lgLastBands = null; return; }
        _lgLastBands = await _lgSampleBands(_lgCurrentBg);
        applyGlassTune();
    }
    function glassLabel(v) {
        return v >= 92 ? '透明' : '磨砂';
    }

    // ==================== 启动入口 ====================
    function killSplash() {
        // A 模式下彻底清掉 B 的开屏残留：它 z-index 是 int 最大值，
        // 播完即使透明也仍拦截所有点击（新浏览器身份下 localStorage 记号缺失时会挂载）
        try {
            if (window.mieSplash && typeof window.mieSplash.dismiss === 'function') window.mieSplash.dismiss();
        } catch (e) { /* ignore */ }
        const leftover = document.getElementById('mist-splash-overlay');
        if (leftover) leftover.remove();
    }

    function init() {
        if (!isEnabled()) return;
        mirrorMode('a');
        document.body.classList.add('a-mode');
        applyLookClasses();
        killSplash();
        setTimeout(killSplash, 1200);   // 兜底：万一开屏是延迟挂载的
        setupHooks();
        setupScreenWatcher();
        setupNavOverrides();
        ensureEdgeHandle();
        ensureDrawer();
        buildAApp();
        watchExpansionPanel();
        setupPanelBlankClose();
        injectALookSettings();
        buildLockScreen();
        relocatePageModals();
        try { if (window.APetX && APetX.boot) APetX.boot(); } catch (e) { /* ignore */ }
        try { if (window.AMaple && AMaple.boot) AMaple.boot(); } catch (e) { console.warn('[AMode] 螃蟹挂载失败', e); }
        updateOverlay();
    }

    /* A 模式下把页面级弹窗（语音/转账/礼物/剧情等）搬进 #a-app：
       .modal-overlay 是 absolute 定位，#a-app 是 fixed 全屏，搬进来既保证铺满
       又天然盖过 A 界面所有层，彻底避免 z-index 被压住打不开的问题 */
    function relocatePageModals() {
        const app = document.getElementById('a-app');
        if (!app) return;
        const ids = ['send-voice-modal', 'send-transfer-modal', 'send-gift-modal', 'time-skip-modal'];
        ids.forEach((id) => {
            const m = document.getElementById(id);
            if (m && m.parentElement !== app) app.appendChild(m);
        });
    }

    window.AMode = {
        isEnabled, toggle, init, showLockScreen, openDrawer, closeDrawer, openChatsSheet,
        get currentChatId() { return currentChatId; },
        applyAFeatureLabelColor,
    };
})();
