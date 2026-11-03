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
        return typeof db !== 'undefined' && db && db.uiMode === 'a';
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

    function displayOf(msg, chat) {
        chat = chat || chatOf(currentChatId, currentChatType);
        if (msg.role === 'system') return { who: 'sys', text: cleanText(msg.content) };
        if (msg.role === 'user') {
            let t = cleanText(msg.content);
            const m = t.match(/^\[[^\]：]*?的消息：([\s\S]*?)\]$/);
            if (m) t = m[1].trim();
            if (!t && msg.parts) t = msg.parts.filter(p => p.type === 'text').map(p => p.text).join('');
            return { who: 'me', text: t };
        }
        let text = cleanText(msg.content);
        if (!text && msg.parts) text = msg.parts.filter(p => p.type === 'text').map(p => p.text).join('');
        // 开屏语指令不显示在聊天流里
        text = text.replace(/\[.*?更新开屏语[：:][\s\S]*?\]/g, '').trim();
        let name = '';
        if (chat && chat.members && msg.senderId) {
            const mem = chat.members.find(x => x.id === msg.senderId);
            if (mem) name = mem.name;
        }
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
        if ((el.dataset.bg || '') === bg) return;
        el.dataset.bg = bg;
        el.style.backgroundImage = bg ? 'url("' + bg.replace(/"/g, '%22') + '")' : 'none';
        el.classList.toggle('on', !!bg);
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

    function aSync() {
        const log = document.getElementById('a-log');
        if (!log || !appVisible()) return;
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat || !chat.history) return;

        hideTypingIfReplied(chat);
        harvestSplashQuote(chat);
        applyChatBg(chat);
        log.innerHTML = '';
        let lastT = 0;
        let lastAiRow = null;
        let lastAiText = '';
        chat.history.forEach((msg) => {
            const info = displayOf(msg);
            if (!info.text) return;
            if (msg.timestamp - lastT > 10 * 60 * 1000 ||
                new Date(msg.timestamp).toDateString() !== new Date(lastT).toDateString()) {
                log.appendChild(timeDivider(msg.timestamp));
            }
            lastT = msg.timestamp;

            const row = document.createElement('div');
            row.className = 'a-row' + (info.who === 'me' ? ' me' : '');
            if (info.who === 'sys') {
                row.className = 'a-row sys';
                const s = document.createElement('div');
                s.className = 'a-sys';
                s.textContent = info.text;
                row.appendChild(s);
            } else if (info.who === 'me') {
                if (bubbleOff()) {
                    const b = document.createElement('div');
                    b.className = 'a-nb-me';
                    b.textContent = info.text;
                    row.appendChild(b);
                } else {
                    const b = document.createElement('div');
                    b.className = 'a-bubble';
                    b.textContent = info.text;
                    row.appendChild(b);
                }
            } else {
                if (info.name) {
                    const n = document.createElement('div');
                    n.className = 'a-who';
                    n.textContent = info.name;
                    row.appendChild(n);
                }
                const g = document.createElement('div');
                g.className = 'a-gu';
                g.textContent = info.text;
                row.appendChild(g);
                lastAiRow = row;
                lastAiText = info.text;
            }
            log.appendChild(row);
        });
        // 无气泡模式：最后一条 AI 消息下面挂操作键（复制 / 念一遍 / 重说 / 编辑）
        if (bubbleOff() && lastAiRow && lastAiText) lastAiRow.appendChild(buildMsgActs(lastAiText));
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
        } catch (e) {
            console.error('[AMode] send failed:', e);
            hideTyping();
        }
    }

    // ==================== 「+」功能面板（复用 B 的展开面板） ====================
    let panelHome = null;
    function openExpansionPanel() {
        const panel = document.getElementById('chat-expansion-panel');
        const slot = document.getElementById('a-expansion-slot');
        if (!panel || !slot || typeof showPanel !== 'function') return;
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
            cp.textContent = last ? (last.text || '…') : '开始聊天吧';
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
        updateAHeader();
        scheduleSync();
        // 每次进入角色聊天界面都显示开屏
        setTimeout(showSplash, 320);
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
        { label: '日记', icon: 'pen', run: () => { try { if (typeof renderJournalList === 'function') renderJournalList(); } catch (err) { console.warn('[AMode] renderJournalList failed:', err); } switchScreen('memory-journal-screen'); } },
        { label: '朋友圈', icon: 'camera', target: 'moments-screen' },
        { label: 'instagram', icon: 'camera', target: 'instagram-screen' },
        { label: '小红书', icon: 'news', target: 'xiaohongshu-screen' },
        { label: '叽哩叽哩', icon: 'play', target: 'jili-screen' },
        { label: '世界书', icon: 'globe', run: () => { if (typeof renderWorldBookList === 'function') renderWorldBookList(); switchScreen('world-book-screen'); } },
        { label: '知识库', icon: 'box', run: () => { switchScreen('knowledge-screen'); if (typeof window.renderKnowledge === 'function') window.renderKnowledge(); } },
        { label: '控制台', icon: 'chip', target: 'console-screen' },
        { label: '商城', icon: 'bag', target: 'shop-screen' },
        { label: '网易云音乐', icon: 'music', target: 'radio-screen' },
        { label: '深夜电台', icon: 'moon', target: 'midnight-screen' },
        { label: '藏宝地图', icon: 'map', run: () => { switchScreen('treasure-map-screen'); if (window.TreasureMap) window.TreasureMap.open(); } },
        { label: '单词本', icon: 'abc', target: 'vocab-book-screen' },
        { label: 'music', icon: 'note', run: () => { if (window.MusicPlayer) window.MusicPlayer.render(); switchScreen('tutorial-screen'); } },
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
            dot.textContent = (displayName(chat) || '?').charAt(0);
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
                    if (document.body.classList.contains('a-mode')) scheduleSync();
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
        applyGlassTune();
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

    // 玻璃质感：与 A 原版同款公式，0=磨砂 100=透明
    function glassVal() {
        const v = +(db.aModeGlass == null ? 100 : db.aModeGlass);
        return Math.max(0, Math.min(100, isNaN(v) ? 100 : v));
    }
    function applyGlassTune() {
        const v = glassVal();
        const s = document.body.style;
        s.setProperty('--glass-blur', Math.round((100 - v) * 0.38) + 'px');
        s.setProperty('--glass-tint', (0.28 + (100 - v) * 0.0044).toFixed(3));
        s.setProperty('--glass-tint-d', (0.3 + (100 - v) * 0.0026).toFixed(3));
    }
    function glassLabel(v) {
        return v <= 20 ? '磨砂' : v >= 80 ? '透明' : '清透';
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
        try { if (window.APetX && APetX.boot) APetX.boot(); } catch (e) { /* ignore */ }
        updateOverlay();
    }

    window.AMode = {
        isEnabled, toggle, init, showLockScreen, openDrawer, closeDrawer, openChatsSheet,
        get currentChatId() { return currentChatId; },
    };
})();
