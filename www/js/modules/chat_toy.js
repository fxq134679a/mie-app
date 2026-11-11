/* 玩具（js/modules/chat_toy.js）
   功能集「玩具」→ 全屏老虎机 → 摇出结果卡 → 发送给角色 / 重新摇。
   页面本体在 toy/app.html（移植自 29-Cu/Ruota-della-Fortuna，MIT，见 toy/CREDITS.md），本文件只做外壳与接线。 */
(function () {
    'use strict';

    const BTN_ID = 'chat-toy-btn';
    const SCREEN_ID = 'toy-screen';
    const IFRAME_ID = 'toy-iframe';
    const PAGE = 'toy/app.html?v=20261111b';

    let bound = false;
    let booted = false;

    const TOY_BTN_HTML = `
        <div class="expansion-item" id="${BTN_ID}">
            <div class="expansion-item-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 1.8a.8.8 0 0 0-.8.8v3.2h11.6V4.6a.8.8 0 0 0-.8-.8H7ZM5.4 9v6.4h13.2V9H5.4Zm1.9 1.2h1.7v4H7.3v-4Zm3.6 0h1.7v4h-1.7v-4Zm3.6 0h1.7v4h-1.7v-4ZM5.4 16.8V19.4a.8.8 0 0 0 .8.8h11.6a.8.8 0 0 0 .8-.8v-2.6H5.4ZM19.6 4h1.5a1 1 0 0 1 1 1v9a1 1 0 0 1-2 0V5h-.5V4Z"/></svg>
            </div>
            <span class="expansion-item-name">玩具</span>
        </div>`;

    /* ── 基础工具 ── */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getChat() {
        if (typeof currentChatType === 'undefined' || typeof db === 'undefined' || !db) return null;
        const list = currentChatType === 'private' ? (db.characters || []) : (db.groups || []);
        return list.find(function (c) { return c.id === currentChatId; }) || null;
    }

    function myNameOf(chat) {
        if (!chat) return '我';
        return currentChatType === 'group'
            ? ((chat.me && chat.me.nickname) || chat.myName || '我')
            : (chat.myName || '我');
    }

    /* ── 结果卡 ── */
    function rowsText(rows) {
        return (rows || []).map(function (r) {
            const latin = [r.en, r.ja].filter(Boolean).join(' · ');
            return r.dim + '·' + r.zh + (latin ? '（' + latin + '）' : '');
        }).join(' / ');
    }

    function cardMarkup(rows) {
        const gore = (rows || []).some(function (r) { return r.gore; });
        const lines = (rows || []).map(function (r) {
            const latin = [r.en, r.ja].filter(Boolean).join(' · ');
            return '<li class="mt-row' + (r.gore ? ' mt-gore' : '') + '">' +
                '<span class="mt-d">' + esc(r.dim) + '</span>' +
                '<span class="mt-v"><b class="mt-zh">' + esc(r.zh) + '</b>' +
                (latin ? '<i class="mt-lat">' + esc(latin) + '</i>' : '') + '</span>' +
                '</li>';
        }).join('');
        return '<div class="mt-card' + (gore ? ' mt-gore-on' : '') + '">' +
            '<div class="mt-head"><span class="mt-crest">MENU</span><span class="mt-sub">Tonight</span></div>' +
            '<ul class="mt-list">' + lines + '</ul>' +
            '<div class="mt-foot"><span class="mt-mark">Ruota della Fortuna</span></div>' +
            '</div>';
    }

    function describeToyForAI(msg) {
        const toy = msg && msg.toy;
        if (!toy || !Array.isArray(toy.rows) || !toy.rows.length) return '';
        const chat = getChat();
        const me = myNameOf(chat);
        return '[' + me + '拉下玩具的摇杆，命运之轮摇出来的结果是——' + rowsText(toy.rows) + '。]';
    }

    /* ── 发送给角色 ── */
    function sendRows(rows) {
        const chat = getChat();
        if (!chat) { showToast('请先进入一个聊天再玩'); return; }
        if (!Array.isArray(rows) || !rows.length) { showToast('先摇一下'); return; }
        if (typeof isGenerating !== 'undefined' && isGenerating) { showToast('角色正在回复，稍等一下'); return; }

        const text = describeToyForAI({ toy: { rows: rows } });
        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            role: 'user',
            content: cardMarkup(rows),
            timestamp: Date.now(),
            isToy: true,
            toy: { rows: rows.slice(), text: text }
        };
        if (currentChatType === 'group') message.senderId = 'user_me';
        if (!chat.history) chat.history = [];
        chat.history.push(message);

        if (typeof addMessageBubble === 'function') {
            addMessageBubble(message, currentChatId, currentChatType);
        }
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();

        toShell({ type: 'toy:hide' });
        if (typeof switchScreen === 'function') switchScreen('chat-room-screen');
        if (typeof getAiReply === 'function') getAiReply(currentChatId, currentChatType);
    }

    /* ── 外壳 ↔ 页面本体通信 ── */
    function toShell(msg) {
        const frame = document.getElementById(IFRAME_ID);
        if (!frame || !frame.contentWindow) return;
        try { msg.from = 'mie-shell'; frame.contentWindow.postMessage(msg, '*'); } catch (e) { /* 忽略 */ }
    }

    function onMessage(e) {
        const d = e.data;
        if (!d || d.from !== 'mie-toy') return;
        if (d.type === 'toy:load') booted = true;
        else if (d.type === 'toy:send') sendRows(d.rows);
    }

    /* ── 打开全屏页 ── */
    function openToy() {
        const screen = document.getElementById(SCREEN_ID);
        if (!screen) return;
        const frame = document.getElementById(IFRAME_ID);
        if (frame && !frame.getAttribute('data-loaded')) {
            frame.src = PAGE;
            frame.setAttribute('data-loaded', '1');
        }
        if (!bound) {
            window.addEventListener('message', onMessage);
            const spin = document.getElementById('toy-spin-btn');
            if (spin) spin.addEventListener('click', function () { toShell({ type: 'toy:spin' }); });
            bound = true;
        }
        if (typeof switchScreen === 'function') switchScreen(SCREEN_ID);
    }

    /* ── 功能集入口 ── */
    function injectToyButton() {
        if (document.getElementById(BTN_ID)) return true;
        const grid = document.querySelector('#chat-expansion-panel .expansion-grid');
        if (grid) {
            grid.insertAdjacentHTML('beforeend', TOY_BTN_HTML);
        } else {
            const slides = document.querySelectorAll('#chat-expansion-panel .function-slide');
            const last = slides[slides.length - 1];
            if (!last) return false;
            last.insertAdjacentHTML('beforeend', TOY_BTN_HTML);
        }
        document.getElementById(BTN_ID).addEventListener('click', openToy);
        if (document.querySelector('#chat-expansion-panel .function-swiper-container') && window.refreshFunctionPanelSwiper) {
            window.refreshFunctionPanelSwiper();
        }
        return true;
    }

    function watchPanel() {
        injectToyButton();
        const mo = new MutationObserver(function () {
            if (document.getElementById(BTN_ID)) return;
            if (document.querySelector('#chat-expansion-panel .expansion-grid, #chat-expansion-panel .function-slide')) {
                injectToyButton();
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchPanel);
    } else {
        watchPanel();
    }

    window.ChatToy = {
        open: openToy,
        inject: injectToyButton,
        cardMarkup: cardMarkup,
        describeToyForAI: describeToyForAI,
        sendRows: sendRows
    };
})();
