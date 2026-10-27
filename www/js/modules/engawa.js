// ===================================================================
// engawa.js — 檐廊（engawa-mcp）连接器 + 檐廊页面
// MCP streamable-http 客户端，经 Gateway /engawa 转发到本机 engawa-mcp --http
// 功能集按钮：让当前聊天角色看到今天檐廊上的内容
// ===================================================================

(function () {
    const URL_KEY = 'engawa_url';
    let sessionId = null;
    let reqId = 1;

    function defaultUrl() {
        const host = location.hostname || '127.0.0.1';
        return (location.protocol || 'http:') + '//' + host + ':3000/engawa/mcp';
    }

    window.EngawaMCP = {
        getUrl: function () { return localStorage.getItem(URL_KEY) || defaultUrl(); },
        setUrl: function (url) {
            if (url) localStorage.setItem(URL_KEY, url);
            else localStorage.removeItem(URL_KEY);
            sessionId = null;
        },

        call: async function (toolName, args) {
            const endpoint = this.getUrl();
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
            if (sessionId) headers['mcp-session-id'] = sessionId;

            if (!sessionId) {
                const initRes = await fetch(endpoint, {
                    method: 'POST', headers,
                    body: JSON.stringify({ jsonrpc: '2.0', id: 'eg-init-' + (reqId++), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'miemie', version: '1' } } })
                });
                if (!initRes.ok) throw new Error('檐廊服务连不上（' + initRes.status + '）');
                const sid = initRes.headers.get('mcp-session-id');
                await parseRpcBody(initRes, 'eg-init');
                if (sid) { sessionId = sid; headers['mcp-session-id'] = sid; }
                fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }).catch(() => {});
            }

            const id = 'eg-' + (reqId++);
            const res = await fetch(endpoint, {
                method: 'POST', headers,
                body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args || {} } })
            });

            if (res.status === 404 || res.status === 400) {
                sessionId = null;
                throw new Error('檐廊会话已失效，请再点一次');
            }
            if (!res.ok) throw new Error('檐廊服务出错（' + res.status + '）');

            const rpc = await parseRpcBody(res, id);
            if (rpc.error) throw new Error(rpc.error.message || '檐廊调用失败');
            const result = rpc.result || {};
            if (result.isError) {
                const text = (result.content || []).find(c => c.type === 'text');
                throw new Error((text && text.text || toolName + ' 执行失败').replace(/^【engawa】/, ''));
            }
            const text = (result.content || []).find(c => c.type === 'text');
            const raw = text ? text.text : '';
            try { return JSON.parse(raw); } catch (e) { return raw; }
        },

        dailyPoem: function () { return this.call('daily_poem', {}); },
        skyTonight: function () { return this.call('sky_tonight', {}); },
        dailyArt: function () { return this.call('daily_art', {}); },
        onThisDay: function () { return this.call('on_this_day', {}); }
    };

    async function parseRpcBody(res, id) {
        const ct = res.headers.get('content-type') || '';
        const body = await res.text();
        if (ct.includes('event-stream')) {
            const lines = body.split('\n').filter(l => l.startsWith('data:'));
            for (const l of lines) {
                try {
                    const obj = JSON.parse(l.slice(5).trim());
                    if (obj && (obj.id === id || obj.result || obj.error)) return obj;
                } catch (e) { /* 跳过非 JSON 行 */ }
            }
            throw new Error('檐廊响应为空');
        }
        return JSON.parse(body);
    }

    // ================= 檐廊页面 =================

    const PHASE_CN = [
        ['full moon', '🌕', '满月'], ['new moon', '🌑', '新月'],
        ['first quarter', '🌓', '上弦月'], ['last quarter', '🌗', '下弦月'],
        ['waxing gibbous', '🌖', '盈凸月'], ['waning gibbous', '🌖', '亏凸月'],
        ['waxing crescent', '🌒', '娥眉月'], ['waning crescent', '🌘', '残月']
    ];
    function moonOf(phase) {
        const p = (phase || '').toLowerCase();
        for (const [en, emoji, cn] of PHASE_CN) if (p.includes(en)) return { emoji, cn };
        return { emoji: '🌙', cn: phase || '月亮' };
    }

    const PORCH_BTN_HTML = `
            <div class="expansion-item" id="engawa-porch-btn">
                <div class="expansion-item-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36A5.39 5.39 0 0 1 12 7.5a5.4 5.4 0 0 1-3.9 8.9A9 9 0 0 0 12 3z"/></svg>
                </div>
                <span class="expansion-item-name">檐廊</span>
            </div>`;

    // 面板有两种状态：swiper 未构建时是 .expansion-grid，构建后是 .function-slide 序列
    function injectPorchButton() {
        if (document.getElementById('engawa-porch-btn')) return true;
        const grid = document.querySelector('#chat-expansion-panel .expansion-grid');
        if (grid) {
            grid.insertAdjacentHTML('beforeend', PORCH_BTN_HTML);
        } else {
            const slides = document.querySelectorAll('#chat-expansion-panel .function-slide');
            const last = slides[slides.length - 1];
            if (!last) return false;
            last.insertAdjacentHTML('beforeend', PORCH_BTN_HTML);
        }
        document.getElementById('engawa-porch-btn').addEventListener('click', openPorch);
        // swiper 已存在时重新分页；不存在时 setupFunctionPanelSwiper 会把 grid 里所有 item（含本按钮）一起搬进 slide
        if (document.querySelector('#chat-expansion-panel .function-swiper-container') && window.refreshFunctionPanelSwiper) {
            window.refreshFunctionPanelSwiper();
        }
        return true;
    }

    function ensurePorchDom() {
        if (document.getElementById('engawa-porch-overlay')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="engawa-porch-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10000;justify-content:center;align-items:center;">
            <style>
                #engawa-porch-overlay .eg-panel { width:min(500px, 94vw); height:86vh; background:#f7f7f9; border-radius:20px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
                #engawa-porch-overlay .eg-head { display:flex; align-items:center; gap:10px; padding:14px 16px; background:#fff; border-bottom:1px solid #ececf0; }
                #engawa-porch-overlay .eg-head h3 { margin:0; font-size:17px; font-weight:700; color:#222; flex:1; }
                #engawa-porch-overlay .eg-date { font-size:12px; color:#8a8a92; margin-top:2px; }
                #engawa-porch-overlay .eg-icon-btn { border:none; background:#f2f2f6; width:30px; height:30px; border-radius:15px; font-size:15px; color:#555; cursor:pointer; display:flex; align-items:center; justify-content:center; }
                #engawa-porch-overlay .eg-body { flex:1; overflow-y:auto; padding:14px 14px 20px; display:flex; flex-direction:column; gap:12px; }
                #engawa-porch-overlay .eg-card { background:#fff; border-radius:14px; padding:14px 16px; box-shadow:0 1px 6px rgba(0,0,0,0.05); }
                #engawa-porch-overlay .eg-card-title { font-size:12px; color:#9a9aa2; margin-bottom:8px; display:flex; align-items:center; gap:5px; }
                #engawa-porch-overlay .eg-moon { font-size:34px; }
                #engawa-porch-overlay .eg-moon-row { display:flex; align-items:center; gap:12px; }
                #engawa-porch-overlay .eg-moon-main { font-size:16px; font-weight:600; color:#333; }
                #engawa-porch-overlay .eg-moon-sub { font-size:12px; color:#8a8a92; margin-top:3px; line-height:1.6; }
                #engawa-porch-overlay .eg-poem-sentence { font-size:16px; font-weight:600; color:#3a3a42; line-height:1.6; }
                #engawa-porch-overlay .eg-poem-full { font-size:13px; color:#66666e; line-height:1.8; margin-top:8px; white-space:pre-line; }
                #engawa-porch-overlay .eg-poem-from { font-size:12px; color:#9a9aa2; margin-top:6px; }
                #engawa-porch-overlay .eg-art-img { width:100%; border-radius:10px; display:block; background:#f2f2f6; min-height:60px; }
                #engawa-porch-overlay .eg-art-meta { font-size:12px; color:#8a8a92; margin-top:8px; line-height:1.6; }
                #engawa-porch-overlay .eg-art-title { font-size:14px; font-weight:600; color:#3a3a42; margin-top:8px; }
                #engawa-porch-overlay .eg-event { font-size:13px; color:#55555e; line-height:1.7; padding-left:14px; position:relative; }
                #engawa-porch-overlay .eg-event::before { content:'·'; position:absolute; left:2px; color:#b8b8c0; }
                #engawa-porch-overlay .eg-err { font-size:12px; color:#b0b0b8; }
                #engawa-porch-overlay .eg-foot { padding:12px 14px 16px; background:#fff; border-top:1px solid #ececf0; }
                #engawa-porch-overlay .eg-send { width:100%; border:none; background:#5e6cff; color:#fff; font-size:15px; font-weight:600; padding:12px; border-radius:12px; cursor:pointer; }
                #engawa-porch-overlay .eg-send:disabled { opacity:0.5; }
                #engawa-porch-overlay .eg-gear { display:none; padding:14px 16px; background:#fff; border-bottom:1px solid #ececf0; flex-direction:column; gap:8px; }
                #engawa-porch-overlay .eg-gear.open { display:flex; }
                #engawa-porch-overlay .eg-gear label { font-size:12px; color:#8a8a92; }
                #engawa-porch-overlay .eg-gear input { border:1px solid #e2e2e8; border-radius:8px; padding:8px 10px; font-size:13px; width:100%; box-sizing:border-box; }
                #engawa-porch-overlay .eg-gear button { align-self:flex-end; border:none; background:#5e6cff; color:#fff; border-radius:8px; padding:6px 16px; font-size:13px; cursor:pointer; }
            </style>
            <div class="eg-panel">
                <div class="eg-head">
                    <div style="flex:1;">
                        <h3>🌿 檐廊</h3>
                        <div class="eg-date" id="eg-date"></div>
                    </div>
                    <button type="button" class="eg-icon-btn" id="eg-gear-btn" title="设置">⚙</button>
                    <button type="button" class="eg-icon-btn" id="eg-close-btn">✕</button>
                </div>
                <div class="eg-gear" id="eg-gear">
                    <label>檐廊服务地址（电脑上运行 engawa-mcp --http，经网关 /engawa 转发）</label>
                    <input type="text" id="eg-url-input" placeholder="http://192.168.1.103:3000/engawa/mcp">
                    <button type="button" id="eg-url-save">保存</button>
                </div>
                <div class="eg-body" id="eg-body"></div>
                <div class="eg-foot">
                    <button type="button" class="eg-send" id="eg-send-btn">让 TA 看看今天 ✨</button>
                </div>
            </div>
        </div>`);

        document.getElementById('eg-close-btn').addEventListener('click', closePorch);
        document.getElementById('engawa-porch-overlay').addEventListener('click', e => {
            if (e.target.id === 'engawa-porch-overlay') closePorch();
        });
        document.getElementById('eg-gear-btn').addEventListener('click', () => {
            const gear = document.getElementById('eg-gear');
            gear.classList.toggle('open');
            if (gear.classList.contains('open')) document.getElementById('eg-url-input').value = window.EngawaMCP.getUrl();
        });
        document.getElementById('eg-url-save').addEventListener('click', () => {
            const v = document.getElementById('eg-url-input').value.trim();
            window.EngawaMCP.setUrl(v || '');
            showToast(v ? '檐廊地址已保存' : '已恢复默认地址');
            document.getElementById('eg-gear').classList.remove('open');
            loadPorch();
        });
        document.getElementById('eg-send-btn').addEventListener('click', sendPorchToChat);
    }

    let porchData = {};

    function openPorch() {
        ensurePorchDom();
        const ov = document.getElementById('engawa-porch-overlay');
        ov.style.display = 'flex';
        const d = new Date();
        const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        document.getElementById('eg-date').textContent = `${d.getMonth() + 1}月${d.getDate()}日 星期${week}`;
        loadPorch();
    }

    function closePorch() {
        const ov = document.getElementById('engawa-porch-overlay');
        if (ov) ov.style.display = 'none';
    }

    function sectionHtml(id, icon, title) {
        return `<div class="eg-card" id="eg-sec-${id}"><div class="eg-card-title">${icon} ${title}</div><div class="eg-err">…</div></div>`;
    }

    async function loadPorch() {
        const body = document.getElementById('eg-body');
        body.innerHTML = sectionHtml('sky', '🌙', '今晚的天空') + sectionHtml('poem', '📜', '今日一诗') + sectionHtml('art', '🖼', '今日一画') + sectionHtml('day', '🕰', '历史上的今天');
        porchData = {};

        window.EngawaMCP.skyTonight().then(d => {
            porchData.sky = d;
            const m = moonOf(d.moon_phase);
            document.getElementById('eg-sec-sky').innerHTML = `<div class="eg-card-title">🌙 今晚的天空</div>
                <div class="eg-moon-row"><div class="eg-moon">${m.emoji}</div><div><div class="eg-moon-main">${m.cn} · 亮度 ${d.moon_illumination || ''}</div>
                <div class="eg-moon-sub">日落 ${d.sunset || '—'} ｜ 月出 ${d.moonrise || '—'} ｜ 月落 ${d.moonset || '—'}</div></div></div>`;
        }).catch(e => failSection('sky', e));

        window.EngawaMCP.dailyPoem().then(d => {
            porchData.poem = d;
            document.getElementById('eg-sec-poem').innerHTML = `<div class="eg-card-title">📜 今日一诗</div>
                <div class="eg-poem-sentence">「${esc(d.sentence || '')}」</div>
                <div class="eg-poem-full">${esc(d.full || d.sentence || '')}</div>
                <div class="eg-poem-from">${esc(d.dynasty || '')} · ${esc(d.author || '')}《${esc(d.title || '')}》</div>`;
        }).catch(e => failSection('poem', e));

        window.EngawaMCP.dailyArt().then(d => {
            porchData.art = d;
            document.getElementById('eg-sec-art').innerHTML = `<div class="eg-card-title">🖼 今日一画</div>
                <img class="eg-art-img" src="${esc(d.image_url || '')}" loading="lazy" alt="">
                <div class="eg-art-title">${esc(d.title || '')}</div>
                <div class="eg-art-meta">${esc(d.artist || '佚名')} ｜ ${esc(d.date || '')}<br>${esc(d.medium || '')}</div>`;
        }).catch(e => failSection('art', e));

        window.EngawaMCP.onThisDay().then(d => {
            const events = (d.events || []).slice(0, 5);
            if (!d.ok || !events.length) {
                document.getElementById('eg-sec-day').innerHTML = `<div class="eg-card-title">🕰 历史上的今天</div><div class="eg-err">${esc(d.note || '今天没有拿到历史事件')}</div>`;
                return;
            }
            document.getElementById('eg-sec-day').innerHTML = `<div class="eg-card-title">🕰 历史上的今天</div>` +
                events.map(ev => `<div class="eg-event">${esc(String(ev.year || ''))}年 · ${esc(ev.text || ev.event || '')}</div>`).join('');
        }).catch(e => failSection('day', e));
    }

    function failSection(id, e) {
        const el = document.getElementById('eg-sec-' + id);
        if (el) el.innerHTML = el.innerHTML.replace(/<div class="eg-err">[\s\S]*?<\/div>/, `<div class="eg-err">${esc(shortErr(e))}</div>`);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function shortErr(e) { return String(e && e.message || e).slice(0, 80); }

    async function sendPorchToChat() {
        const btn = document.getElementById('eg-send-btn');
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) { showToast('请先进入一个聊天再打开檐廊'); return; }
        if (typeof isGenerating !== 'undefined' && isGenerating) { showToast('角色正在回复，稍等一下'); return; }

        const parts = [];
        if (porchData.sky && porchData.sky.ok) {
            const m = moonOf(porchData.sky.moon_phase);
            parts.push(`今晚是${m.cn}，亮度${porchData.sky.moon_illumination || ''}`);
        }
        if (porchData.poem && porchData.poem.ok) {
            parts.push(`还读到一句诗：「${porchData.poem.sentence}」——${porchData.poem.author}《${porchData.poem.title}》`);
        }
        if (porchData.art && porchData.art.ok) {
            parts.push(`今天的每日一画是《${porchData.art.title}》`);
        }
        if (!parts.length) { showToast('檐廊内容还没加载好'); return; }

        const myName = (currentChatType === 'private') ? (chat.myName || '我') : ((chat.me && chat.me.nickname) || '我');
        const text = `[${myName}的消息：我刚在檐廊上看到——${parts.join('；')}。你看到了吗？]`;

        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text,
            parts: [{ type: 'text', text }],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') message.senderId = 'user_me';
        if (!chat.history) chat.history = [];
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        await saveData();
        renderChatList();

        closePorch();
        if (typeof getAiReply === 'function') getAiReply(currentChatId, currentChatType);
    }

    // 面板可能随时被重建（进聊天/开面板），用 MutationObserver 持续盯住，出现即注入
    function watchPanel() {
        injectPorchButton();
        const mo = new MutationObserver(() => {
            if (document.getElementById('engawa-porch-btn')) return;
            if (document.querySelector('#chat-expansion-panel .expansion-grid, #chat-expansion-panel .function-slide')) {
                injectPorchButton();
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchPanel);
    } else {
        watchPanel();
    }

    console.log('✅ 檐廊（engawa）模块已加载');
})();
