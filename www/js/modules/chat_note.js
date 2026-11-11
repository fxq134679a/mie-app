/* 小纸条（js/modules/chat_note.js）
   功能集入口 → 写纸条 → 揉成纸团发进聊天 → 点纸团在页面中间摊开看字（真纸见 js/lib/crumple_paper.js）
   我写的纸条：字迹取「美化 → 小纸条字体」；角色写的纸条：字迹取「信箱 → 角色信件字体」，两边完全一致。 */
(function () {
    'use strict';

    const BTN_ID = 'chat-note-btn';
    const OVERLAY_ID = 'chat-note-overlay';
    const MAX_LEN = 120;
    const STYLE_KEY = 'mieNoteStyle';
    const PREFS_KEY = 'mieNotePrefs';
    const MAILBOX_PREFS_KEY = 'whisper-mailbox-preferences-v1';

    const FONT_STACKS = {
        kai: '"Kaiti SC","STKaiti","KaiTi","DFKai-SB","楷体",serif',
        serif: 'Georgia,"Times New Roman","Songti SC","SimSun",serif',
        mono: '"Cascadia Code",Consolas,"Courier New","Microsoft YaHei",monospace',
        sans: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    };
    const BUILTIN_FONTS = [
        ['default', '默认手写（楷体）'],
        ['serif', '宋体 / Serif'],
        ['kai', '楷体 / 手写体'],
        ['mono', '等宽 / Monospace'],
        ['sans', '系统无衬线']
    ];

    const NOTE_BTN_HTML = `
        <div class="expansion-item" id="${BTN_ID}">
            <div class="expansion-item-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.1 4.6c.5 1 .8 2 .8 3.1 0 1-.3 2-.7 2.9l-.5-.2c.4-.8.6-1.7.6-2.6 0-.9-.2-1.7-.6-2.5l.4-.7ZM4 6.5A2.5 2.5 0 0 1 6.5 4H13l7 7v6a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V6.5Zm2.2-.4c-.3.3-.5.7-.5 1.1 0 .5.2.9.5 1.2l6.9 6.9c.3.3.7.5 1.2.5.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1a1.6 1.6 0 0 0-.5-1.2l-6.9-6.9A1.6 1.6 0 0 0 7.6 6c-.4 0-.8.2-1.1.5l-.3-.4Zm1.1 1.5c.2-.2.4-.3.6-.3.3 0 .5.1.7.3l6.8 6.8c.2.2.3.4.3.7 0 .2-.1.4-.3.6s-.4.3-.6.3a1 1 0 0 1-.7-.3l-6.8-6.8a.9.9 0 0 1 0-1.3Z"/></svg>
            </div>
            <span class="expansion-item-name">小纸条</span>
        </div>`;

    const PANEL_HTML = `
        <div class="cn-sheet">
            <div class="cn-head">
                <span class="cn-title">写张纸条递过去</span>
                <button type="button" class="cn-x" aria-label="关闭">×</button>
            </div>
            <div class="cn-paper">
                <textarea class="cn-input" rows="7" maxlength="${MAX_LEN}" placeholder="想对TA说的话…"></textarea>
            </div>
            <div class="cn-styles"></div>
            <div class="cn-foot">
                <span class="cn-count">0/${MAX_LEN}</span>
                <div class="cn-actions">
                    <button type="button" class="cn-cancel">取消</button>
                    <button type="button" class="cn-send">揉成纸团</button>
                </div>
            </div>
        </div>`;

    /* ── 基础工具 ── */
    function styles() {
        return (window.CrumplePaper && window.CrumplePaper.styles) || {};
    }

    function currentStyle() {
        const key = localStorage.getItem(STYLE_KEY);
        return styles()[key] ? key : Object.keys(styles())[0] || 'note';
    }

    function readJson(key) {
        try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
    }

    function getChat() {
        if (typeof currentChatType === 'undefined' || typeof db === 'undefined') return null;
        return currentChatType === 'private'
            ? db.characters.find(function (c) { return c.id === currentChatId; })
            : db.groups.find(function (g) { return g.id === currentChatId; });
    }

    /* ── 字体：我写的走美化设置，角色写的走信箱角色字体 ── */
    function customFontPresets() {
        const list = (window.db && Array.isArray(db.fontPresets)) ? db.fontPresets : [];
        return list.filter(function (p) { return p && p.isCustom && p.fontFamily; });
    }

    function fontFamilyFor(value) {
        if (!value || value === 'default') return '';
        if (FONT_STACKS[value]) return FONT_STACKS[value];
        const preset = customFontPresets().find(function (p) { return p.id === value || p.name === value; });
        return preset ? '"' + preset.fontFamily + '"' : '';
    }

    function getMyFont() {
        return readJson(PREFS_KEY).font || 'default';
    }

    function setMyFont(value) {
        const p = readJson(PREFS_KEY);
        p.font = value || 'default';
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* 存储不可用时保持内存态 */ }
    }

    function myNoteFont() {
        return fontFamilyFor(getMyFont());
    }

    // 与信箱 applyLetterFont 同一份配置：该角色的信件字体，没设就跟随默认信纸字体
    function roleNoteFont(charId) {
        const mp = readJson(MAILBOX_PREFS_KEY);
        const roleFonts = (mp && mp.roleFonts) || {};
        return fontFamilyFor(roleFonts[String(charId)]) || fontFamilyFor(mp && mp.paperFont);
    }

    function fontOptions(selected) {
        const list = BUILTIN_FONTS.slice();
        for (const preset of customFontPresets()) list.push([preset.id, preset.name || '自定义字体']);
        if (selected && selected !== 'default' && !list.some(function (item) { return item[0] === selected; })) {
            list.push([selected, '（字体已丢失，重选一个）']);
        }
        return list.map(function (item) {
            return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + item[1] + '</option>';
        }).join('');
    }

    // 上传的字体是 FontFace 动态注册的，画进纸面前先确保它已加载
    function primeFont(family) {
        if (!family || !document.fonts || !document.fonts.load) return Promise.resolve();
        const first = family.split(',')[0].trim();
        return document.fonts.load('78px ' + first).catch(function () { });
    }

    /* ── 功能集按钮 ── */
    function injectNoteButton() {
        if (document.getElementById(BTN_ID)) return true;
        const grid = document.querySelector('#chat-expansion-panel .expansion-grid');
        if (grid) {
            grid.insertAdjacentHTML('beforeend', NOTE_BTN_HTML);
        } else {
            const slides = document.querySelectorAll('#chat-expansion-panel .function-slide');
            const last = slides[slides.length - 1];
            if (!last) return false;
            last.insertAdjacentHTML('beforeend', NOTE_BTN_HTML);
        }
        document.getElementById(BTN_ID).addEventListener('click', openPanel);
        if (document.querySelector('#chat-expansion-panel .function-swiper-container') && window.refreshFunctionPanelSwiper) {
            window.refreshFunctionPanelSwiper();
        }
        return true;
    }

    /* ── 编辑面板 ── */
    let overlay = null, paper = null, input = null, countEl = null, sendBtn = null, chips = null;
    let styleKey = 'note';

    function ensurePanel() {
        if (overlay) return true;
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = PANEL_HTML;
        document.body.appendChild(overlay);
        paper = overlay.querySelector('.cn-paper');
        input = overlay.querySelector('.cn-input');
        countEl = overlay.querySelector('.cn-count');
        sendBtn = overlay.querySelector('.cn-send');
        chips = overlay.querySelector('.cn-styles');

        for (const key of Object.keys(styles())) {
            const st = styles()[key];
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'cn-chip';
            chip.dataset.style = key;
            chip.innerHTML = '<i class="cn-swatch" style="background:' + st.paper + ';border-color:' + st.ink + '33"></i><span>' + st.label + '</span>';
            chip.addEventListener('click', function () { applyStyle(key); });
            chips.appendChild(chip);
        }

        input.addEventListener('input', function () {
            countEl.textContent = input.value.length + '/' + MAX_LEN;
            sendBtn.classList.toggle('is-ready', Boolean(input.value.trim()));
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { closePanel(); return; }
        });
        overlay.querySelector('.cn-x').addEventListener('click', closePanel);
        overlay.querySelector('.cn-cancel').addEventListener('click', closePanel);
        sendBtn.addEventListener('click', function () { sendNote(); });
        return true;
    }

    function applyStyle(key) {
        const st = styles()[key];
        if (!st) return;
        styleKey = key;
        localStorage.setItem(STYLE_KEY, key);
        paper.style.setProperty('--cn-paper', st.paper);
        paper.style.setProperty('--cn-ink', st.ink);
        paper.style.setProperty('--cn-rule', st.rule);
        paper.classList.toggle('is-grid', Boolean(st.grid));
        input.style.fontFamily = myNoteFont();
        for (const chip of chips.children) chip.classList.toggle('is-on', chip.dataset.style === key);
    }

    function openPanel() {
        if (!getChat()) return;
        ensurePanel();
        applyStyle(currentStyle());
        input.value = '';
        countEl.textContent = '0/' + MAX_LEN;
        sendBtn.classList.remove('is-ready');
        overlay.classList.add('visible');
        const family = myNoteFont();
        const focus = function () { input.focus(); };
        if (family) primeFont(family).then(focus, focus); else setTimeout(focus, 60);
    }

    function closePanel() {
        if (overlay) overlay.classList.remove('visible');
    }

    /* ── 我发纸条：只落消息，不自动要角色回话（点「回复」按钮才回） ── */
    function sendNote() {
        const text = (input.value || '').replace(/\s+$/, '');
        if (!text.trim()) { input.focus(); return; }
        const chat = getChat();
        if (!chat) { closePanel(); return; }

        const myName = (currentChatType === 'private')
            ? (chat.myName || '我')
            : ((chat.me && chat.me.nickname) || '我');
        const flat = text.replace(/\s+/g, ' ').trim();
        const label = (styles()[styleKey] || styles().note || {}).label || '小纸条';
        const content = '[' + myName + '给你写了张' + label + '小纸条：' + flat + ']';

        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            role: 'user',
            content: content,
            parts: [{ type: 'text', text: content }],
            timestamp: Date.now(),
            isNote: true,
            note: { text: text.trim(), style: styleKey, by: 'me' }
        };
        if (currentChatType === 'group') message.senderId = 'user_me';

        if (!chat.history) chat.history = [];
        chat.history.push(message);
        if (typeof addMessageBubble === 'function') {
            addMessageBubble(message, currentChatId, currentChatType);
        }
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();

        closePanel();
    }

    /* ── 角色发纸条：<note style="…">正文</note> 由 chat_ai.js 交进来 ── */
    function createRoleNote(chat, chatId, styleKeyRaw, body) {
        if (!chat || !window.CrumplePaper) return null;
        const text = String(body || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_LEN);
        if (!text) return null;
        const keys = Object.keys(styles());
        const style = keys.indexOf(styleKeyRaw) >= 0 ? styleKeyRaw : keys[Math.floor(Math.random() * keys.length)] || 'note';
        const label = (styles()[style] || {}).label || '小纸条';
        // 气泡正文不能带纸条原话：语音播报和外露文本会剧透
        const notice = 'TA给你塞了张' + label + '小纸条，摊开才知道写了什么';
        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            role: 'assistant',
            content: notice,
            parts: [{ type: 'text', text: notice }],
            timestamp: Date.now(),
            isNote: true,
            note: { text: text, style: style, by: 'role', charId: chatId }
        };
        if (!chat.history) chat.history = [];
        chat.history.push(message);
        if (typeof addMessageBubble === 'function') addMessageBubble(message, chatId, 'private');
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();
        return message;
    }

    /* ── 点纸团：真纸在页面中间摊开 ── */
    function openFromBubble(note, anchorEl) {
        if (!window.CrumplePaper) { console.warn('[ChatNote] 真纸组件没加载'); return; }
        const data = note || {};
        const family = data.by === 'role' ? roleNoteFont(data.charId) : myNoteFont();
        const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
        const go = function () {
            window.CrumplePaper.open({ text: data.text || '', style: data.style || currentStyle(), font: family, anchorRect: rect });
        };
        if (family) primeFont(family).then(go, go); else go();
    }

    /* ── 喂给 AI 的纸条文本 ── */
    function describeNoteForAI(msg) {
        if (!msg || !msg.note) return '';
        const text = String(msg.note.text || '').trim();
        if (!text) return '';
        const label = ((styles()[msg.note.style] || styles().note || {}).label) || '小纸条';
        const body = text.split(/\r?\n/).map(function (line) { return '    ' + line; }).join('\n');
        if (msg.note.by === 'role' || msg.role === 'assistant') {
            return '[小纸条：' + label + ']\n我把这张' + label + '揉成纸团塞给TA，TA摊开来看，上面写着：\n' + body;
        }
        return '[小纸条：' + label + ']\n我把这张' + label + '揉成纸团塞给你，你摊开来看，上面写着：\n' + body;
    }

    function buildPromptSection(chatType) {
        let s = '\n\n【小纸条】纸条是手写的便签，会被揉成纸团递过去，要摊开才看得到字。'
            + '聊天历史里以 [小纸条：…] 开头的就是这种纸条。收到纸条时先照着纸条上的原话回应（可以吐槽字迹、折痕、递过来的动作），再自然接话。';
        if (chatType !== 'group') {
            s += ' 你也可以给TA写纸条：单独用一条消息输出 <note style="note">纸条正文</note>，它就会揉成纸团出现在聊天里。'
                + 'style 三选一：note=白纸条、kraft=牛皮纸、grid=粉格纸，按心情挑一张。'
                + '适合当面说不出口的话、悄悄提醒、约会地点、塞回来的小回应；正文 8~40 字，像手写短句，里面不要出现方括号或其他尖括号标记。'
                + '一次最多一张，没什么想写的就别硬凑；纸条本身就是回复，不用再打字复述纸条内容。';
        }
        return s;
    }

    /* ── 初始化 ── */
    const observer = new MutationObserver(function () {
        if (document.querySelector('#chat-expansion-panel .expansion-grid, #chat-expansion-panel .function-slide')) {
            injectNoteButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectNoteButton, 500);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && overlay.classList.contains('visible')) closePanel();
    });

    window.ChatNote = {
        openPanel: openPanel,
        closePanel: closePanel,
        sendNote: sendNote,
        createRoleNote: createRoleNote,
        openFromBubble: openFromBubble,
        injectNoteButton: injectNoteButton,
        describeNoteForAI: describeNoteForAI,
        buildPromptSection: buildPromptSection,
        fontOptions: fontOptions,
        fontFamilyFor: fontFamilyFor,
        getMyFont: getMyFont,
        setMyFont: setMyFont,
        roleFontFamily: roleNoteFont
    };
})();
