/* ============================================================
   灵动岛模拟：屏幕顶部黑色胶囊，养 clawd-icons island/ 六只像素小蟹
   素材：TangfanOVO/clawd-icons island/（MIT），SVG 自带 10 秒动画自动播
   交互：点胶囊展开（大蟹 + 文案 + 六只缩略图挑选），10 秒自动轮换
   配置存 localStorage.aIsland2（v2：默认关闭，避免 B 模式下常驻）
   开关入口：美化 App「灵动岛」/ A 模式聊天右上角设置「灵动岛」
   ============================================================ */
(function () {
    'use strict';

    /* v2 键：旧 aIsland 存的是常开状态，换键让灵动岛默认回到关闭 */
    const KEY = 'aIsland2';
    const CYCLE_MS = 10000;

    const CRABS = (window.APetX && window.APetX.ISLAND) || [];
    const NATIVE = !!(window.Capacitor
        && typeof window.Capacitor.isNativePlatform === 'function'
        && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.CrabIsland);
    /* 真机 Live Activity 的键是 CRAB_STATES_2 里的短名（fish/care/...），主题色跟岛上的样机一致 */
    const NATIVE_KEY = { 'il:fish': 'fish', 'il:care': 'care', 'il:letter': 'letter', 'il:window': 'window', 'il:travel': 'travel', 'il:food': 'food' };
    const NATIVE_ACCENT = { fish: 0x7FD1E8, care: 0xFF6B7A, letter: 0xFF97A2, window: 0xFFE066, travel: 0x9BD77A, food: 0x5C9CE6 };
    let C = { on: false, idx: 0 };
    try { Object.assign(C, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
    if (!C.state || typeof C.state !== 'object') C.state = {};
    let root = null, cycleTimer = null;

    function save() { try { localStorage.setItem(KEY, JSON.stringify(C)); } catch (e) { /* ignore */ } }
    function cur() {
        if (!CRABS.length) return null;
        return CRABS[((C.idx % CRABS.length) + CRABS.length) % CRABS.length];
    }
    function imgTag(f, cls) {
        return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="pet/' + f + '" alt="">';
    }

    /* ---------- 真机灵动岛（iOS Live Activity，走 Capacitor 插件） ---------- */
    function plugin() {
        return NATIVE ? window.Capacitor.Plugins.CrabIsland : null;
    }
    function nativeStart() {
        const P = plugin();
        const it = cur();
        if (!P || !it) return Promise.resolve(false);
        const key = NATIVE_KEY[it.k] || it.k.replace(/^il:/, '');
        return P.start({
            key: key,
            title: it.n,
            detail: it.d || '',
            accent: NATIVE_ACCENT[key] || 0x7FD1E8
        }).then(() => true).catch((e) => {
            C.on = false; save();
            if (typeof showToast === 'function') showToast('灵动岛开不了：' + (e && e.message || e));
            return false;
        });
    }
    function nativeStop() {
        const P = plugin();
        if (!P) return Promise.resolve();
        return P.stop().catch(() => {});
    }

    /* ---------- DOM ---------- */
    function build() {
        if (root || !document.body || !CRABS.length) return;
        root = document.createElement('div');
        root.id = 'a-island';
        root.innerHTML =
            '<button class="ai-pill" type="button">'
            + '<span class="ai-mini"></span>'
            + '<span class="ai-live"><i></i>灵动岛</span>'
            + '</button>'
            + '<div class="ai-card">'
            + '<div class="ai-head"><span class="ai-big"></span>'
            + '<div class="ai-info"><b class="ai-nm"></b><i class="ai-ds"></i></div></div>'
            + '<div class="ai-thumbs">' + CRABS.map((c) =>
                '<button type="button" class="ai-th" data-i="' + CRABS.indexOf(c) + '">'
                + imgTag(c.f) + '<u>' + c.n + '</u></button>').join('')
            + '</div>'
            + '<div class="ai-foot"><button type="button" class="ai-close">收起</button></div>'
            + '</div>';
        document.body.appendChild(root);
        /* 真机上有真的灵动岛，网页胶囊会跟它叠在一起，藏掉；这里只留挑蟹的卡片 */
        if (NATIVE) root.classList.add('ai-native');

        root.querySelector('.ai-pill').addEventListener('click', open);
        root.querySelector('.ai-close').addEventListener('click', close);
        root.querySelectorAll('.ai-th').forEach((th) => {
            th.addEventListener('click', () => {
                C.idx = +th.dataset.i; save(); render(); markThumbs();
                if (NATIVE && C.on) nativeStart();
            });
        });
        document.addEventListener('click', (e) => {
            if (root.classList.contains('ai-open') && !root.contains(e.target)) close();
        });
        if (!NATIVE) startCycle();
        render();
        apply();
    }

    function render() {
        if (!root) return;
        const it = cur();
        if (!it) return;
        root.querySelector('.ai-mini').innerHTML = imgTag(it.f);
        root.querySelector('.ai-big').innerHTML = imgTag(it.f);
        root.querySelector('.ai-nm').textContent = it.n;
        root.querySelector('.ai-ds').textContent = it.d;
        markThumbs();
    }
    function markThumbs() {
        if (!root) return;
        root.querySelectorAll('.ai-th').forEach((th) => {
            th.classList.toggle('on', +th.dataset.i === ((C.idx % CRABS.length) + CRABS.length) % CRABS.length);
        });
    }
    function apply() {
        if (!root) return;
        root.classList.toggle('ai-off', !C.on);
    }
    function startCycle() {
        if (cycleTimer) return;
        cycleTimer = setInterval(() => {
            if (document.hidden || !root || !root.isConnected) return;
            if (root.classList.contains('ai-open')) return;
            C.idx++; save(); render();
        }, CYCLE_MS);
    }

    function open() {
        if (!root) build();
        if (!root || !C.on) return;
        render();
        root.classList.add('ai-open');
    }
    function close() { if (root) root.classList.remove('ai-open'); }

    function toggle() {
        setOn(!C.on);
    }

    function setOn(v) {
        v = !!v;
        if (v === C.on && root) { apply(); return; }
        C.on = v;
        save();
        if (NATIVE) {
            if (C.on) {
                build();
                nativeStart().then((ok) => { if (ok) open(); });
            } else {
                nativeStop();
                close();
                apply();
            }
        } else {
            if (C.on) { build(); apply(); }
            else { close(); apply(); }
        }
        if (typeof showToast === 'function') {
            showToast(C.on ? (NATIVE ? '灵动岛已开到屏幕顶上' : '灵动岛已开启')
                          : (NATIVE ? '灵动岛已关掉' : '灵动岛已关闭'));
        }
    }

    function isOn() { return !!C.on; }

    window.AIsland = { boot: build, toggle, setOn, isOn, open, close, refresh: render, nativeStart, nativeStop };

    if (NATIVE) {
        /* 真机开机：开关是开着的就把上次的蟹重新放回灵动岛（不弹胶囊） */
        const bootNative = () => { if (C.on) nativeStart(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootNative);
        else bootNative();
        /* 常驻保障：切后台时刷新 Live Activity（系统有时会收回灵动岛；开着就补挂，用户关了绝不强开） */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && C.on) { try { nativeStart(); } catch (e) {} }
        });
    } else if (C.on && document.body) build();
    else if (C.on) document.addEventListener('DOMContentLoaded', build);
})();
