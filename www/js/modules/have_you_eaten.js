// 吃了么 · 宿主模块：角色选择 + iframe 装载 + 返回主屏
// 每个创建的角色都有自己独立的美食账本（数据按角色隔离，见 local-book.js）
// 角色需在「角色设置 → 吃了么记录」开启后才会出现在这里
(function () {
    'use strict';
    const LS_KEY = 'mie-food-char';
    const V = '20261111food3';
    let currentChar = null;

    // 只列出开启了「吃了么记录」的角色
    function charList() {
        const all = (typeof db !== 'undefined' && db.characters) || [];
        return all.filter((c) => c && c.foodRecordEnabled);
    }
    function charName(c) {
        return (c && (c.remarkName || c.realName)) || '角色';
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    // ── 样式（只挂一次） ──
    function ensureCss() {
        if (document.getElementById('hye-host-css')) return;
        const css = document.createElement('style');
        css.id = 'hye-host-css';
        css.textContent = `
#have-you-eaten-screen { background: var(--bg, #f6f4ef); }
#hye-char-switch {
    position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: 12px; z-index: 20;
    display: none; align-items: center; gap: 7px; max-width: 46vw;
    padding: 6px 12px 6px 7px; border: 1px solid color-mix(in srgb, var(--line, #e6e0d6) 80%, transparent);
    border-radius: 999px; background: color-mix(in srgb, var(--card, #fff) 78%, transparent);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 2px 10px rgba(0,0,0,.10);
    font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink, #2c2620);
    cursor: pointer; pointer-events: auto;
}
#hye-char-switch.on { display: inline-flex; }
#hye-char-switch .hye-av2 {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    background-size: cover; background-position: center; background-color: var(--maple, #c96f4a);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: #fff;
}
#hye-char-switch .hye-nm2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 液态玻璃风格的角色切换下拉：贴在右上角图标正下方 */
#hye-char-menu {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 54px); right: 12px; z-index: 40;
    min-width: 200px; max-width: 64vw; max-height: 56vh; overflow-y: auto;
    padding: 8px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--card, #fff) 52%, transparent);
    backdrop-filter: blur(28px) saturate(180%); -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid rgba(255,255,255,.55);
    box-shadow:
        0 12px 40px rgba(0,0,0,.16),
        inset 0 1px 0 rgba(255,255,255,.65),
        inset 0 -1px 0 rgba(255,255,255,.25),
        inset 1px 0 0 rgba(255,255,255,.35),
        inset -1px 0 0 rgba(255,255,255,.35);
    opacity: 0; transform: translateY(-8px) scale(.96); transform-origin: top right;
    pointer-events: none;
    transition: opacity .22s ease, transform .22s cubic-bezier(.22,.77,.23,1);
}
#hye-char-menu.on { opacity: 1; transform: none; pointer-events: auto; }
#hye-char-list { display: flex; flex-direction: column; gap: 2px; }
#hye-char-list .hye-char {
    display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 10px 10px; border: 0; background: none; border-radius: 14px;
    font-family: inherit; text-align: left; cursor: pointer; color: var(--ink, #2c2620);
}
#hye-char-list .hye-char:active { background: color-mix(in srgb, var(--ink, #2c2620) 6%, transparent); }
#hye-char-list .hye-char.on { background: color-mix(in srgb, var(--maple, #c96f4a) 14%, transparent); }
#hye-char-list .hye-av {
    flex: none; width: 40px; height: 40px; border-radius: 50%;
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 600; color: #fff;
}
#hye-char-list .hye-nm { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#hye-char-list .hye-cur { font-size: 11.5px; color: var(--maple, #c96f4a); flex: none; }
#hye-char-empty { padding: 18px 8px 22px; font-size: 13.5px; color: var(--sub, #9a938a); text-align: center; line-height: 1.7; }`;
        document.head.appendChild(css);
    }

    function avatarBg(c) {
        if (c && typeof c.avatar === 'string' && c.avatar) return `background-image:url("${esc(c.avatar)}")`;
        const name = charName(c);
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        const hue = h % 360;
        return `background:hsl(${hue},52%,56%)`;
    }
    function initial(c) { return charName(c).charAt(0) || '角'; }

    // ── 角色切换下拉（液态玻璃） ──
    function ensureMenu() {
        const screen = document.getElementById('have-you-eaten-screen');
        if (!screen || document.getElementById('hye-char-menu')) return;
        screen.insertAdjacentHTML('beforeend', `
<button type="button" id="hye-char-switch" aria-label="切换角色"></button>
<div id="hye-char-menu">
    <div id="hye-char-list"></div>
    <div id="hye-char-empty" hidden>还没有开启「吃了么记录」的角色<br>先去角色设置里打开吧</div>
</div>`);
        // 点击下拉以外的地方收起
        document.addEventListener('pointerdown', (e) => {
            const menu = document.getElementById('hye-char-menu');
            if (!menu || !menu.classList.contains('on')) return;
            if (menu.contains(e.target) || e.target.closest('#hye-char-switch')) return;
            hideMenu();
        });
    }

    function renderMenu() {
        const list = document.getElementById('hye-char-list');
        const empty = document.getElementById('hye-char-empty');
        if (!list) return;
        const chars = charList();
        if (empty) empty.hidden = chars.length > 0;
        list.innerHTML = chars.map((c) => {
            const on = currentChar && String(currentChar) === String(c.id) ? ' on' : '';
            return `<button type="button" class="hye-char${on}" data-id="${esc(c.id)}">
                <span class="hye-av" style="${avatarBg(c)}">${esc(initial(c))}</span>
                <span class="hye-nm">${esc(charName(c))}</span>
                ${on ? '<span class="hye-cur">当前</span>' : ''}
            </button>`;
        }).join('');
        list.querySelectorAll('.hye-char').forEach((btn) => {
            btn.addEventListener('click', () => { pickChar(btn.dataset.id); });
        });
    }

    function showMenu() {
        ensureMenu();
        renderMenu();
        document.getElementById('hye-char-menu')?.classList.add('on');
    }
    function hideMenu() {
        document.getElementById('hye-char-menu')?.classList.remove('on');
    }

    // ── 装载 ──
    function loadFrame(charId) {
        const frame = document.getElementById('have-you-eaten-iframe');
        const switchBtn = document.getElementById('hye-char-switch');
        if (!frame) return;
        currentChar = String(charId);
        try { localStorage.setItem(LS_KEY, currentChar); } catch (e) { /* 无痕模式忽略 */ }
        frame.dataset.loaded = 'true';
        frame.src = `js/lib/have-you-eaten/index.html?char=${encodeURIComponent(currentChar)}&v=${V}`;
        if (switchBtn) {
            const c = charList().find((x) => String(x.id) === currentChar);
            switchBtn.classList.add('on');
            switchBtn.innerHTML = `<span class="hye-av2" style="${avatarBg(c)}">${esc(initial(c))}</span><span class="hye-nm2">${esc(charName(c))}</span>`;
        }
        hideMenu();
    }

    function pickChar(id) {
        if (currentChar && String(currentChar) === String(id)) {
            hideMenu();
            return;
        }
        loadFrame(id);
    }

    window.FoodApp = {
        open() {
            ensureCss();
            ensureMenu();
            const switchBtn = document.getElementById('hye-char-switch');
            if (switchBtn && !switchBtn.dataset.bound) {
                switchBtn.dataset.bound = '1';
                switchBtn.addEventListener('click', () => {
                    const menu = document.getElementById('hye-char-menu');
                    if (menu && menu.classList.contains('on')) hideMenu(); else showMenu();
                });
            }
            const chars = charList();
            // 当前角色被关掉了「吃了么记录」→ 作废重选
            if (currentChar && !chars.some((c) => String(c.id) === String(currentChar))) {
                currentChar = null;
                try { localStorage.removeItem(LS_KEY); } catch (e) { /* 忽略 */ }
            }
            if (currentChar) return;                    // 已有角色在用 → 直接用
            if (chars.length) {
                let last = null;
                try { last = localStorage.getItem(LS_KEY); } catch (e) { /* 忽略 */ }
                if (last && chars.some((c) => String(c.id) === String(last))) {
                    loadFrame(last);                    // 上次看的谁，这次还是谁
                } else {
                    loadFrame(chars[Math.floor(Math.random() * chars.length)].id);   // 第一次：随机进一个角色
                }
            } else {
                // 没有可用角色：按钮不亮，空态自己显示
                if (switchBtn) switchBtn.classList.remove('on');
            }
        }
    };

    window.addEventListener('message', function (event) {
        const frame = document.getElementById('have-you-eaten-iframe');
        if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
        if (event.data?.type === 'mie-food-home') switchScreen('home-screen');
    });
})();
