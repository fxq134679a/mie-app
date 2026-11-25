/* ============================================================
   常驻小手机（mini_phone）：悬浮小手机图标 → 点按弹出手机框，
   框里就是微信 App 的真页面（DOM 原样搬进去，同一个路口的另一扇门，
   数据/功能/消息完全同步）。
   - 仅 phone 模式（db.uiMode==='mie'）显示；微信 App 自己的页面不显示
   - 按住拖动挪位置，松手即落位；快速点按（没拖动）展开
   - 展开动画：从悬浮球位置放大成手机框；点框底横条（Home Indicator）收回
   - 设置入口：美化 App 底部「常驻小手机」组（开关 + 三种图标样式：经典手机/灵动岛 iPhone/霓虹渐变手机）
   桥契约（ui.js / settings_customize.js 已挂钩）：
     window.MiniPhone.rehostActive(targetScreen) —— switchScreen 里调用，
       小手机开着时保证 modal 背后的宿主页面不被切屏逻辑熄掉；
       若切到了主 App 的页面（手机框外），自动无声收起小手机。
     window.MiniPhone.renderSettings(container) —— 美化 App 表单重建后注入设置组。
   注意：悬浮球和手机框都挂在 .phone-screen 里——settings.js/settings_chat.js
   在 .phone-screen 上有事件委托，搬进来的微信页面必须保持在这棵子树内。
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'mieMiniPhone';
    const STYLE_KEY = 'mieMiniPhoneStyle';
    const POS_KEY = 'mieMiniPhonePos';

    /* 微信 App 自己的页面：悬浮球在这些页面不显示 */
    const WECHAT_SCREENS = [
        'chat-list-screen', 'chat-room-screen', 'contacts-screen',
        'more-screen', 'moments-screen', 'phone-screen'
    ];

    function cfg() {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function saveCfg(patch) {
        const c = Object.assign(cfg(), patch || {});
        try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* 配额满就算了 */ }
        return c;
    }
    function isEnabled() { return cfg().enabled === true; }
    function isPhoneMode() { return true; } /* 任何 UI 模式都常驻显示 */

    /* ---------- 三种悬浮图标：直接复用「TA 的手机」同款 DOM + peek.css ----------
       peekPhoneInner(style) 来自 chat_room_html.js（全局函数），DOM 结构与
       聊天页右上角手机图标一字不差，样式 100% 一致。
       peek.css 全局加载；三种样式高度都等于 --pp-h，悬浮球统一 46px。 */
    const STYLE_ALIAS = { a: 'emu', b: 'ape', c: 'kang' }; /* 旧键兼容 */
    function normStyle(s) { s = STYLE_ALIAS[s] || s; return (s === 'emu' || s === 'ape' || s === 'kang') ? s : 'emu'; }
    function fabPhoneHTML(style) {
        const s = normStyle(style);
        const inner = (typeof peekPhoneInner === 'function') ? peekPhoneInner(s) : '';
        return '<span class="mie-peek-phone mie-st-' + s + '" aria-hidden="true">' + inner + '</span>';
    }

    /* ---------- 状态注入一次 ---------- */
    let styleInjected = false;
    function injectStyle() {
        if (styleInjected) return;
        styleInjected = true;
        const css = `
        #miniphone-fab{position:fixed;z-index:2999;width:56px;height:56px;border-radius:18px;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;
            filter:drop-shadow(0 4px 10px rgba(0,0,0,.28));transition:transform .18s ease;will-change:transform;}
        #miniphone-fab .mie-peek-phone{--pp-h:46px;}
        /* 点击不弹跳：只亮屏（.lit 由 peek.css 接管），随后直接长成手机框 */
        #miniphone-fab:active{transform:scale(.92);}
        #miniphone-fab.mp-dragging{transition:none;transform:scale(1.12);}
        #miniphone-modal{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;
            background:rgba(12,12,20,.42);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
            opacity:0;pointer-events:none;transition:opacity .28s ease;}
        #miniphone-modal.mp-open{opacity:1;pointer-events:auto;}
        /* 白色手机壳：外壳层（带音量键/电源键）+ 内屏框；FLIP 动画作用于壳层 */
        .mp-shell{position:relative;will-change:transform;}
        .mp-sbtn{position:absolute;width:4px;border-radius:3px;
            background:linear-gradient(180deg,#ffffff,#e9e5dc);box-shadow:0 1px 2px rgba(0,0,0,.1);}
        .mp-sbtn.l{left:-4px;border-radius:3px 0 0 3px;}
        .mp-sbtn.r{right:-4px;border-radius:0 3px 3px 0;}
        .mp-sbtn.vol-up{top:22%;height:36px;}
        .mp-sbtn.vol-dn{top:calc(22% + 44px);height:36px;}
        .mp-sbtn.power{top:27%;height:52px;}
        /* 挂绳孔耳片：纯实白正圆凸耳，无任何描线；clip-path 裁掉与黑壳身重叠的左侧，只叠在白边框上 → 整体实白、无缝；
           ::after 是打孔的孔点，银链第一个环从此穿出 */
        .mp-grommet{position:absolute;right:-14px;top:12%;width:28px;height:28px;border-radius:50%;
            background:#fefdfb;z-index:2;clip-path:inset(0 -30px 0 5px);}
        .mp-grommet::after{content:'';position:absolute;left:17px;top:50%;width:7px;height:7px;
            border-radius:50%;background:#2a2622;transform:translateY(-50%);}
        /* 小挂件：加长银链 + 加大粉星，从孔里垂下来轻轻摆动 */
        .mp-charm{position:absolute;right:-21px;top:calc(12% + 7px);width:28px;z-index:2;
            transform-origin:14px 7px;animation:mpCharmSway 3.4s ease-in-out infinite;
            filter:drop-shadow(0 2px 3px rgba(0,0,0,.16));}
        @keyframes mpCharmSway{0%,100%{transform:rotate(6deg)}50%{transform:rotate(-6deg)}}
        @media (prefers-reduced-motion: reduce){.mp-charm{animation:none;}}
        /* 实白手机壳：白色机身 → 黑色屏幕包边 → 纯白屏 */
        .mp-frame{width:min(76vw,350px);height:min(80dvh,700px);border-radius:56px;overflow:hidden;
            background:#0b0b0c;border:9px solid #fefdfb;padding:3.5px;box-sizing:border-box;
            box-shadow:0 18px 50px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.1),
                inset 0 0 0 1px rgba(0,0,0,.06);
            display:flex;flex-direction:column;position:relative;z-index:1;}
        /* 状态栏悬浮在页面上方：透明底，刘海区与页面颜色自然融合 */
        .mp-statusbar{position:absolute;top:0;left:0;right:0;height:34px;z-index:60;
            display:flex;align-items:center;justify-content:space-between;
            padding:0 16px;pointer-events:none;}
        .mp-sb-time{font-size:13px;font-weight:700;color:#111;letter-spacing:.2px;margin-left:28px;}
        .mp-island{position:absolute;left:50%;top:7px;transform:translateX(-50%);width:74px;height:21px;
            border-radius:11px;background:#000;display:flex;align-items:center;justify-content:flex-end;
            padding-right:7px;box-sizing:border-box;}
        .mp-island-cam{width:7px;height:7px;border-radius:50%;background:#22265c;
            box-shadow:inset 0 0 2.5px 1.5px #4a52d8;}
        .mp-sb-icons{height:12px;pointer-events:none;margin-right:12px;}
        /* 框内 fixed 元素（微信底栏等）相对框定位，不再跑到手机壳外 */
        .mp-screen-host{position:relative;flex:1;overflow:hidden;background:#fff;display:flex;flex-direction:column;
            transform:translateZ(0);border-radius:43px;}
        .mp-screen-host .screen{width:100%;}
        /* 框内 CHATS 列表：底部收干净，最后一行不贴圆角边 */
        #miniphone-modal #chat-list-screen .content{padding-bottom:34px;}
        /* 框内页面顶栏整体下移：避开刘海/状态栏悬浮层 */
        #miniphone-modal .screen .app-header{padding-top:44px !important;}
        /* iPhone 式底部返回横条（Home Indicator）：点它收回小手机 */
        .mp-home-bar{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);
            width:120px;height:5px;border-radius:3px;background:#101010;opacity:.85;z-index:70;cursor:pointer;}
        .mp-style-row{display:flex;gap:10px;padding:10px 15px;}
        .mp-style-phone{display:flex;align-items:center;justify-content:center;height:48px;}
        .mp-style-btn{flex:1;border:2px solid #e5e5ea;border-radius:14px;background:#fff;padding:10px 4px 7px;
            display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#666;}
        .mp-style-btn .mie-peek-phone{--pp-h:40px;}
        .mp-style-btn.on{border-color:#3478f6;background:#eef4ff;color:#3478f6;}
        `;
        const st = document.createElement('style');
        st.id = 'miniphone-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    /* ---------- 悬浮球 ---------- */
    let fab = null;
    function ensureFab() {
        if (fab) return fab;
        injectStyle();
        fab = document.createElement('div');
        fab.id = 'miniphone-fab';
        fab.innerHTML = fabPhoneHTML(cfg().style);
        const host = document.querySelector('.phone-screen') || document.body;
        host.appendChild(fab);
        bindFab();
        applyFabPos();
        applyFabStyle();
        fab.style.display = 'none';
        return fab;
    }

    function applyFabStyle() {
        if (!fab) return;
        const s = normStyle(cfg().style);
        if (fab.dataset.style !== s) {
            fab.dataset.style = s;
            fab.innerHTML = fabPhoneHTML(s);
        }
    }

    function applyFabPos() {
        if (!fab) return;
        const p = cfg().pos || {};
        const w = 56;
        const maxX = window.innerWidth - w - 6;
        const maxY = window.innerHeight - w - 6;
        let x = (typeof p.x === 'number') ? p.x : maxX;
        let y = (typeof p.y === 'number') ? p.y : Math.round((window.innerHeight - w) / 2); /* 默认：页面中间偏右 */
        fab.style.left = Math.min(Math.max(6, x), Math.max(6, maxX)) + 'px';
        fab.style.top = Math.min(Math.max(6, y), Math.max(6, maxY)) + 'px';
    }

    function bindFab() {
        let drag = null;
        fab.addEventListener('pointerdown', (e) => {
            if (state.open) return;
            e.preventDefault();
            try { fab.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            drag = { sx: e.clientX, sy: e.clientY, ox: fab.offsetLeft, oy: fab.offsetTop, moved: false, t: Date.now() };
        });
        fab.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            if (!drag.moved && Math.sqrt(dx * dx + dy * dy) < 8) return;
            drag.moved = true;
            fab.classList.add('mp-dragging');
            fab.style.left = (drag.ox + dx) + 'px';
            fab.style.top = (drag.oy + dy) + 'px';
        });
        const finish = (e) => {
            if (!drag) return;
            const wasMoved = drag.moved;
            fab.classList.remove('mp-dragging');
            drag = null;
            if (wasMoved) {
                saveCfg({ pos: { x: fab.offsetLeft, y: fab.offsetTop } });
            } else if (!state.open) {
                openMini(fab);
            }
        };
        fab.addEventListener('pointerup', finish);
        fab.addEventListener('pointercancel', () => { drag = null; fab.classList.remove('mp-dragging'); });
        window.addEventListener('resize', applyFabPos);
    }

    /* ---------- 可见性：开关 + phone 模式 + 不在微信页面 + 小手机没开着 ---------- */
    function activeScreenId() {
        const s = document.querySelector('.screen.active');
        return s ? s.id : 'home-screen';
    }
    function updateVisibility() {
        if (!fab) return;
        const show = isEnabled() && isPhoneMode() && !state.open
            && WECHAT_SCREENS.indexOf(activeScreenId()) === -1;
        fab.style.display = show ? '' : 'none';
    }

    /* ---------- 手机框 ---------- */
    const state = { open: false, hostScreenId: null, closing: false, opening: false, fabRect: null };
    let modal = null, shell = null, frame = null, screenHost = null, timeEl = null, timeTimer = null;

    function ensureModal() {
        if (modal) return;
        injectStyle();
        modal = document.createElement('div');
        modal.id = 'miniphone-modal';
        modal.innerHTML = `
            <div class="mp-shell">
                <span class="mp-sbtn l vol-up"></span>
                <span class="mp-sbtn l vol-dn"></span>
                <span class="mp-sbtn r power"></span>
                <div class="mp-frame">
                    <div class="mp-statusbar">
                        <span class="mp-sb-time"> </span>
                        <div class="mp-island"><span class="mp-island-cam"></span></div>
                        <img class="mp-sb-icons" src="img/ios-statusbar-icons.png?v=20261112trim1" alt="" draggable="false">
                    </div>
                    <div class="mp-screen-host"></div>
                    <!-- iPhone 式底部横条：点击收回小手机 -->
                    <div class="mp-home-bar" title="收起"></div>
                </div>
                <!-- 挂绳孔：长在壳右边缘上的连体小耳片，中带穿孔 -->
                <div class="mp-grommet"></div>
                <svg class="mp-charm" viewBox="0 0 26 100" aria-hidden="true">
                    <circle cx="13" cy="6" r="4.6" fill="none" stroke="#cfc9bd" stroke-width="2.4"/>
                    <circle cx="13" cy="14" r="3.9" fill="none" stroke="#cfc9bd" stroke-width="2.2"/>
                    <circle cx="13" cy="22" r="3.4" fill="none" stroke="#cfc9bd" stroke-width="2"/>
                    <circle cx="13" cy="30" r="3" fill="none" stroke="#cfc9bd" stroke-width="1.8"/>
                    <line x1="13" y1="33" x2="13" y2="43" stroke="#cfc9bd" stroke-width="1.8"/>
                    <polygon points="13,45 15.7,52.3 23.5,52.6 17.4,57.4 19.5,64.9 13,60.6 6.5,64.9 8.6,57.4 2.5,52.6 10.3,52.3"
                        fill="#f7bccb" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
                    <circle cx="18.5" cy="49" r="1.5" fill="#fff" opacity=".85"/>
                </svg>
            </div>`;
        const host = document.querySelector('.phone-screen') || document.body;
        host.appendChild(modal);
        shell = modal.querySelector('.mp-shell');
        frame = modal.querySelector('.mp-frame');
        screenHost = modal.querySelector('.mp-screen-host');
        timeEl = modal.querySelector('.mp-sb-time');
        // 只能通过底部横条收回；点遮罩/页面空白不再关闭
        modal.querySelector('.mp-home-bar').addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!state.closing) closeMini(true);
        });
        // 小手机里只保留 CHATS 列表页：点角色不进聊天室（底部输入栏就不会出现），点导航标题也不切屏
        screenHost.addEventListener('click', (e) => {
            if (e.target.closest('.chat-item') || e.target.closest('[data-target]')) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.open) closeMini(true);
        });
    }

    function tickTime() {
        if (timeEl) {
            const d = new Date();
            timeEl.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        }
    }

    /* 把微信 App 的真页面搬进手机框（global-bottom-nav 是 .phone-screen 直接子元素，
       不搬的话它 fixed 定位相对视口，会跑到手机壳外面） */
    function moveScreensInto() {
        WECHAT_SCREENS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) screenHost.appendChild(el);
        });
        // 底栏不再进小手机：留在原处并隐藏（z-index 9999 高于 modal，必须压掉）
        const nav = document.getElementById('global-bottom-nav');
        if (nav) { state.navPrevDisplay = nav.style.display; nav.style.display = 'none'; }
    }
    function moveScreensBack() {
        const host = document.querySelector('.phone-screen');
        if (!host) return;
        WECHAT_SCREENS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) host.appendChild(el);
        });
        const nav = document.getElementById('global-bottom-nav');
        if (nav) { nav.style.display = state.navPrevDisplay || ''; state.navPrevDisplay = null; }
    }
    function deactivateWechatScreens() {
        WECHAT_SCREENS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    }

    /* FLIP：从悬浮球的位置长成手机框（动画作用于壳层） */
    function animateFrom(rect) {
        const fr = shell.getBoundingClientRect();
        const dx = (rect.left + rect.width / 2) - (fr.left + fr.width / 2);
        const dy = (rect.top + rect.height / 2) - (fr.top + fr.height / 2);
        const sx = Math.max(.08, rect.width / fr.width);
        const sy = Math.max(.08, rect.height / fr.height);
        shell.style.transition = 'none';
        shell.style.transformOrigin = 'center center';
        shell.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
        shell.style.opacity = '.35';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            shell.style.transition = 'transform .42s cubic-bezier(.32,.72,.33,1),opacity .3s ease';
            shell.style.transform = 'none';
            shell.style.opacity = '1';
        }));
    }

    function openMini(fromEl) {
        if (state.open || state.closing || state.opening) return;
        if (!fab) return;
        // 点击不弹跳：屏幕直接点亮（.lit，peek.css 三种样式各自亮法），亮起后直接长成手机框
        state.opening = true;
        state.fabRect = fab.getBoundingClientRect();
        const peekEl = fab.querySelector('.mie-peek-phone');
        if (peekEl) peekEl.classList.add('lit');
        setTimeout(() => {
            state.opening = false;
            openMiniNow(state.fabRect);
            // .lit 留在悬浮球上，关闭缩回时再熄屏
        }, 420);
    }

    function openMiniNow(rect) {
        if (state.open || state.closing) return;
        ensureModal();
        tickTime();
        if (!timeTimer) timeTimer = setInterval(tickTime, 20000);

        state.hostScreenId = activeScreenId();
        moveScreensInto();
        state.open = true;
        if (fab) fab.style.display = 'none';

        // 手机框里直接亮微信首页（不走 switchScreen，避免历史栈/底栏副作用）
        // 背后的宿主页面保持点亮（半透明 backdrop 能看到它，不能熄掉）
        document.querySelectorAll('.screen').forEach((s) => {
            if (s.id !== state.hostScreenId) s.classList.remove('active');
        });
        const list = document.getElementById('chat-list-screen');
        if (list) {
            list.classList.add('active');
            try { if (typeof renderChatList === 'function') renderChatList(); } catch (e) { /* 渲染失败不影响弹出 */ }
        }

        modal.classList.add('mp-open');
        if (rect) animateFrom(rect);
    }

    function closeMini(animated) {
        if (!state.open || state.closing) return;
        state.closing = true;
        const finish = () => {
            modal.classList.remove('mp-open');
            deactivateWechatScreens();
            moveScreensBack();
            // 宿主页面回来（打开小手机前你在的那个 App 页面）
            const host = state.hostScreenId ? document.getElementById(state.hostScreenId) : null;
            if (host) host.classList.add('active');
            state.open = false;
            state.hostScreenId = null;
            state.closing = false;
            // 熄屏：缩回悬浮球后屏幕渐暗（peek.css 各样式 .lit 的反向过渡）
            const peekEl = fab && fab.querySelector('.mie-peek-phone');
            if (peekEl) peekEl.classList.remove('lit');
            updateVisibility();
        };
        if (animated && shell) {
            const rect = (state.fabRect && state.fabRect.width > 0)
                ? state.fabRect
                : (fab && fab.style.display !== 'none' ? fab.getBoundingClientRect() : null);
            if (rect) {
                const fr = shell.getBoundingClientRect();
                const dx = (rect.left + rect.width / 2) - (fr.left + fr.width / 2);
                const dy = (rect.top + rect.height / 2) - (fr.top + fr.height / 2);
                shell.style.transition = 'transform .32s cubic-bezier(.4,.1,.7,1),opacity .28s ease';
                shell.style.transform = `translate(${dx}px,${dy}px) scale(${Math.max(.08, rect.width / fr.width)},${Math.max(.08, rect.height / fr.height)})`;
                shell.style.opacity = '0';
                setTimeout(() => {
                    shell.style.transition = ''; shell.style.transform = ''; shell.style.opacity = '';
                    finish();
                }, 300);
                return;
            }
        }
        finish();
    }

    /* 无声复位：用户在手机框里点到了主 App 的导航（目标页在框外）→ 直接收起 */
    function restoreQuiet() {
        if (!state.open) return;
        modal.classList.remove('mp-open');
        moveScreensBack();
        state.open = false;
        state.hostScreenId = null;
        updateVisibility();
    }

    /* ---------- ui.js switchScreen 挂钩 ---------- */
    function rehostActive(targetScreen) {
        if (!state.open || !targetScreen) return;
        if (frame && frame.contains(targetScreen)) {
            // 手机框内切屏：把背后的宿主页面重新点亮，别让它黑掉
            const host = state.hostScreenId ? document.getElementById(state.hostScreenId) : null;
            if (host && !frame.contains(host) && !host.classList.contains('active')) {
                host.classList.add('active');
            }
            return;
        }
        // 切到了框外的主 App 页面 → 小手机自动收起
        restoreQuiet();
    }

    /* ---------- 美化 App 设置组 ---------- */
    function renderSettings(container) {
        if (!container || document.getElementById('miniphone-group')) return;
        injectStyle();
        const c = cfg();
        const group = document.createElement('div');
        group.id = 'miniphone-group';
        group.innerHTML = `
            <div class="kkt-group-title" style="margin-left: 15px; margin-bottom: 8px; font-size: 13px; color: #666;">常驻小手机</div>
            <div class="kkt-group">
                <div class="kkt-item">
                    <div class="kkt-item-content">
                        <div class="kkt-item-title">常驻小手机</div>
                    </div>
                    <div class="kkt-item-control"><label class="kkt-switch"><input type="checkbox" id="miniphone-enabled"><span class="kkt-slider"></span></label></div>
                </div>
                <div class="kkt-item">
                    <div class="kkt-item-content" style="flex:1;">
                        <div class="kkt-item-title">悬浮图标样式</div>
                        <div class="mp-style-row">
                            <button type="button" class="mp-style-btn" data-style="emu"><span class="mp-style-phone">${fabPhoneHTML('emu')}</span><span>经典手机</span></button>
                            <button type="button" class="mp-style-btn" data-style="ape"><span class="mp-style-phone">${fabPhoneHTML('ape')}</span><span>灵动岛 iPhone</span></button>
                            <button type="button" class="mp-style-btn" data-style="kang"><span class="mp-style-phone">${fabPhoneHTML('kang')}</span><span>霓虹渐变手机</span></button>
                        </div>
                    </div>
                </div>
            </div>`;
        container.appendChild(group);

        const sw = group.querySelector('#miniphone-enabled');
        sw.checked = c.enabled === true;
        sw.addEventListener('change', () => {
            saveCfg({ enabled: sw.checked });
            ensureFab();
            updateVisibility();
            if (typeof showToast === 'function') showToast(sw.checked ? '常驻小手机已开启' : '常驻小手机已关闭');
        });
        group.querySelectorAll('.mp-style-btn').forEach((btn) => {
            btn.classList.toggle('on', normStyle(c.style) === btn.dataset.style);
            btn.addEventListener('click', () => {
                saveCfg({ style: btn.dataset.style });
                group.querySelectorAll('.mp-style-btn').forEach((b) => b.classList.toggle('on', b === btn));
                applyFabStyle();
                if (typeof showToast === 'function') showToast('悬浮图标样式已切换');
            });
        });
    }

    /* ---------- 启动 ---------- */
    function boot() {
        ensureFab();
        updateVisibility();
        // 页面切换探测：悬浮球在微信页面藏、其他页面现
        setInterval(updateVisibility, 400);
        document.addEventListener('click', () => setTimeout(updateVisibility, 60), true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.MiniPhone = { renderSettings, rehostActive, updateVisibility, cfg, saveCfg };
})();
