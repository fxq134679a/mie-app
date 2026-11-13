/* ============================================================
   灵动岛：真 Live Activity 优先，网页胶囊只是桌面浏览器的模拟预览
   素材：TangfanOVO/clawd-icons island/（MIT），六只像素小蟹
   原生接入套件见 native/island/（Widget Extension + 计时器字体 + 桥）
   三种环境：
     ① Capacitor CrabIsland 插件 → 真灵动岛
     ② OctoNative.islandStart 桥（MIE-APP 壳，契约见 native/island/IslandBridge.swift）→ 真灵动岛
     ③ 都没有 → iOS 设备不放假胶囊（提示需更新壳）；桌面浏览器用黑胶囊模拟预览
   配置存 localStorage.aIsland2；开关入口：美化 App「灵动岛」/ A 模式聊天设置
   ============================================================ */
(function () {
    'use strict';

    /* v2 键：旧 aIsland 存的是常开状态，换键让灵动岛默认回到关闭 */
    const KEY = 'aIsland2';
    const CYCLE_MS = 10000;

    const CRABS = (window.APetX && window.APetX.ISLAND) || [];

    /* ① Capacitor 插件桥 */
    const CAP_PLUGIN = !!(window.Capacitor
        && typeof window.Capacitor.isNativePlatform === 'function'
        && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.CrabIsland);

    /* ② OctoNative 壳桥（MIE-APP）：契约见 native/island/IslandBridge.swift */
    const OCTO_ISLAND = !!(window.OctoNative
        && typeof window.OctoNative.islandStart === 'function');

    /* 壳环境（真机 IPA）与 iOS 设备判断 */
    const IN_SHELL = !!window.OctoNative || CAP_PLUGIN;
    const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    /* 真灵动岛可用 = 任一桥存在 */
    const REAL_ISLAND = CAP_PLUGIN || OCTO_ISLAND;

    /* 真机 Live Activity 的键是状态表里的短名（fish/care/...），主题色跟岛上样机一致 */
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

    /* ---------- 真灵动岛：统一启停，自动选桥 ---------- */
    function nativeStart() {
        const it = cur();
        if (!it || !REAL_ISLAND) return Promise.resolve(false);
        const shortKey = NATIVE_KEY[it.k] || it.k.replace(/^il:/, '');
        const accent = NATIVE_ACCENT[shortKey] || 0x7FD1E8;

        if (CAP_PLUGIN) {
            return window.Capacitor.Plugins.CrabIsland.start({
                key: shortKey, title: it.n, detail: it.d || '', accent: accent
            }).then(() => true).catch((e) => {
                C.on = false; save();
                if (typeof showToast === 'function') showToast('灵动岛开不了：' + (e && e.message || e));
                return false;
            });
        }
        /* OctoNative 壳：islandStart(title=状态表中文键, detail, accent) */
        try {
            return Promise.resolve(window.OctoNative.islandStart({
                key: shortKey, title: it.n, detail: it.d || '', accent: accent
            })).then((ok) => ok !== false).catch((e) => {
                C.on = false; save();
                if (typeof showToast === 'function') showToast('灵动岛开不了：' + (e && e.message || e));
                return false;
            });
        } catch (e) {
            C.on = false; save();
            if (typeof showToast === 'function') showToast('灵动岛开不了：' + (e && e.message || e));
            return Promise.resolve(false);
        }
    }
    function nativeStop() {
        if (CAP_PLUGIN) return window.Capacitor.Plugins.CrabIsland.stop().catch(() => {});
        if (OCTO_ISLAND) { try { window.OctoNative.islandStop(); } catch (e) { /* ignore */ } }
        return Promise.resolve();
    }

    /* ---------- DOM（模拟预览胶囊，只在桌面浏览器出现） ---------- */
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
        if (REAL_ISLAND) root.classList.add('ai-native');

        root.querySelector('.ai-pill').addEventListener('click', open);
        root.querySelector('.ai-close').addEventListener('click', close);
        root.querySelectorAll('.ai-th').forEach((th) => {
            th.addEventListener('click', () => {
                C.idx = +th.dataset.i; save(); render(); markThumbs();
                if (REAL_ISLAND && C.on) nativeStart();
            });
        });
        document.addEventListener('click', (e) => {
            if (root.classList.contains('ai-open') && !root.contains(e.target)) close();
        });
        if (!REAL_ISLAND) startCycle();
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

        /* iPhone/iPad 上没有真灵动岛桥：不放假胶囊，提示需要带灵动岛组件的壳 */
        if (v && !REAL_ISLAND && (IN_SHELL || IS_IOS)) {
            if (typeof showToast === 'function') {
                showToast('真灵动岛需要带「灵动岛组件」的 IPA 壳（见项目 native/island 指南重新打包）');
            }
            return;
        }

        C.on = v;
        save();
        if (REAL_ISLAND) {
            if (C.on) {
                build();                      // 建卡片（挑蟹用），真机上有 ai-native 样式藏胶囊
                nativeStart().then((ok) => { if (ok) { try { open(); } catch (e) {} } });
            } else {
                nativeStop();
                close();
                apply();
            }
        } else {
            /* 桌面浏览器：模拟胶囊 */
            if (C.on) { build(); apply(); }
            else { close(); apply(); }
        }
        if (typeof showToast === 'function') {
            showToast(C.on ? (REAL_ISLAND ? '已挂到 iPhone 灵动岛' : '灵动岛已开启（桌面模拟）')
                          : (REAL_ISLAND ? '灵动岛已收起' : '灵动岛已关闭'));
        }
    }

    function isOn() { return !!C.on; }

    window.AIsland = { boot: build, toggle, setOn, isOn, open, close, refresh: render, nativeStart, nativeStop, realIsland: REAL_ISLAND };

    /* ---------- 开机 ---------- */
    if (REAL_ISLAND) {
        /* 真机开机：开关是开着的就把上次的蟹重新放回灵动岛 */
        const bootNative = () => { if (C.on) nativeStart(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootNative);
        else bootNative();
        /* 常驻保障：切后台时刷新 Live Activity（系统有时会收回灵动岛；开着就补挂，用户关了绝不强开） */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && C.on) { try { nativeStart(); } catch (e) {} }
        });
    } else if (IN_SHELL || IS_IOS) {
        /* 壳里没有灵动岛组件 / iOS 网页：不建假胶囊；把残留的 on 状态清掉避免下次还提示 */
        if (C.on) { C.on = false; save(); }
    } else if (C.on && document.body) build();
    else if (C.on) document.addEventListener('DOMContentLoaded', build);
})();
