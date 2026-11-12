// --- 同页：人和 AI 一起写的手帐日记本（js/modules/tongye.js） ---
// 主屏 App → 直接进入本子（iframe 加载 tongye/book/app.html，每角色独立存储）
// 角色切换：本子左上角头像/名字 → 下拉弹层（由 app.html 接入层注入，调用本文件的 __tyCharList / __tySwitchChar）

(function () {
    'use strict';

    let currentCharId = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // 用户名（B 的私聊字段 myName，没有就"我"）
    function myNameFor(chat) {
        try { return (chat && chat.myName) ? String(chat.myName) : '我'; } catch (e) { return '我'; }
    }

    function lastCharId() {
        try { return localStorage.getItem('tongye:lastChar') || null; } catch (e) { return null; }
    }

    // 供 iframe 弹层用：角色清单（带当前标记）
    window.__tyCharList = function () {
        return (db.characters || []).map(c => ({
            id: c.id,
            name: c.name || '未命名',
            avatar: c.avatar || '',
            current: c.id === currentCharId,
        }));
    };

    // 供 iframe 弹层用：切换角色（重载 iframe，数据按前缀隔离不会丢）
    window.__tySwitchChar = function (charId) {
        if (!(db.characters || []).some(c => c.id === charId)) return;
        openBook(charId, true);
    };

    // 供 iframe 返回按钮用：退出同页回主屏
    window.__tyExitBook = function () {
        if (typeof switchScreen === 'function') switchScreen('home-screen');
    };

    function openBook(charId, forceReload) {
        const chat = (db.characters || []).find(c => c.id === charId);
        if (!chat) { showCharView(); return; }

        // 同一角色且本子开着 → 保留现场，不重载
        const bookView = document.getElementById('tongye-book-view');
        if (!forceReload && currentCharId === charId && bookView.style.display !== 'none') {
            return;
        }
        currentCharId = charId;
        try { localStorage.setItem('tongye:lastChar', charId); } catch (e) {}

        const iframe = document.getElementById('tongye-iframe');
        const params = new URLSearchParams({
            char: charId,
            her: chat.name || 'TA',
            me: myNameFor(chat),
        });
        if (chat.avatar) params.set('avatar', chat.avatar);
        // 每次进入都重设 src：接入层按最新角色名同步署名（存储前缀不变，数据不丢）
        iframe.src = 'tongye/book/app.html?v=20261113t1&' + params.toString();

        document.getElementById('tongye-char-view').style.display = 'none';
        bookView.style.display = 'block';
        document.getElementById('tongye-header').style.display = 'none'; // 本子占满全屏，有自己的顶栏
    }

    // 进 App：直接落到本子页（记住上次看的角色），没有角色才显示引导页
    function enterScreen() {
        const chars = (db.characters || []);
        if (!chars.length) { showCharView(); return; }
        const last = lastCharId();
        const target = (last && chars.some(c => c.id === last)) ? last : chars[0].id;
        openBook(target);
    }

    // 引导页（无角色时的空状态 + 备用角色网格）
    function showCharView() {
        currentCharId = null;
        const iframe = document.getElementById('tongye-iframe');
        iframe.src = 'about:blank'; // 停掉本子，避免后台继续跑
        document.getElementById('tongye-book-view').style.display = 'none';
        document.getElementById('tongye-char-view').style.display = 'block';
        document.getElementById('tongye-header').style.display = 'flex';
        renderCharGrid();
    }

    function renderCharGrid() {
        const grid = document.getElementById('tongye-char-grid');
        if (!grid) return;
        const chars = (db.characters || []);
        grid.innerHTML = '';

        if (!chars.length) {
            grid.innerHTML = `
                <div class="ty-empty">
                    <div class="ty-empty-book">
                        <span class="ty-empty-spine"></span>
                        <span class="ty-empty-line"></span>
                        <span class="ty-empty-dot"></span>
                    </div>
                    <div class="ty-empty-title">还没有和谁共用一本</div>
                    <div class="ty-empty-sub">先去创建一个角色，再来一起写本子吧</div>
                    <button type="button" class="ty-empty-btn" id="ty-goto-contacts">去创建角色</button>
                </div>`;
            const go = document.getElementById('ty-goto-contacts');
            if (go) go.addEventListener('click', () => {
                if (typeof switchScreen === 'function') switchScreen('contacts-screen');
            });
            return;
        }

        chars.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ty-char-item';
            const avatar = c.avatar ? `<img class="ty-char-avatar" src="${esc(c.avatar)}" alt="">` : `<div class="ty-char-avatar"></div>`;
            btn.innerHTML = `${avatar}<span class="ty-char-name">${esc(c.name || '未命名')}</span>`;
            btn.addEventListener('click', () => openBook(c.id));
            grid.appendChild(btn);
        });
    }

    function bindOnce() {
        const backBtn = document.getElementById('tongye-back-btn');
        if (backBtn && !backBtn.dataset.tyBound) {
            backBtn.dataset.tyBound = '1';
            backBtn.addEventListener('click', (e) => {
                // 引导页 → 直接放行回主屏
                if (document.getElementById('tongye-book-view').style.display !== 'none') {
                    e.preventDefault();
                    e.stopPropagation();
                    showCharView();
                }
            }, true); // 捕获阶段，抢在全局 data-target 委托之前
        }

        // postMessage 桥：iOS WKWebView 下 file:// iframe 是独立源，
        // 本子里直接访问 parent.window 会抛 SecurityError（返回按钮/切换角色全部失灵）。
        // 本子端会先试直连，失败时降级走这条消息通道。
        if (!window.__tyMsgBound) {
            window.__tyMsgBound = true;
            window.addEventListener('message', (ev) => {
                const d = ev && ev.data;
                if (!d || typeof d !== 'object') return;
                if (d.type === 'ty-exit') {
                    window.__tyExitBook();
                } else if (d.type === 'ty-switch-char') {
                    window.__tySwitchChar(d.id);
                } else if (d.type === 'ty-char-list-request') {
                    const iframe = document.getElementById('tongye-iframe');
                    try {
                        iframe.contentWindow.postMessage({ type: 'ty-char-list', list: window.__tyCharList() }, '*');
                    } catch (e) { /* 忽略 */ }
                }
            });
        }

        // 每次进入同页都直接落到本子（记住上次的角色）。
        // 注意必须同步执行：之前 setTimeout 60ms 会让屏幕先画一帧旧状态
        // （顶栏+引导页/旧本子）再翻转成正式内容，看起来就是"组件闪一下"。
        document.body.addEventListener('click', (e) => {
            const nav = e.target.closest('.app-icon[data-target="tongye-screen"]');
            if (nav) enterScreen();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindOnce);
    } else {
        bindOnce();
    }

    // A 模式抽屉入口
    window.TongyeOpen = function () {
        if (typeof switchScreen === 'function') switchScreen('tongye-screen');
        enterScreen(); // 同步执行，避免先画一帧旧状态再翻转造成闪烁
    };
})();
