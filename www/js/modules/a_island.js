/* ============================================================
   灵动岛：真 Live Activity 优先；没有真岛时用「刘海假岛」网页胶囊
   素材：TangfanOVO/clawd-icons island/（MIT），六只像素小蟹
   原生接入套件见 native/island/（Widget Extension + 计时器字体 + 桥）
   三种环境：
     ① Capacitor CrabIsland 插件 → 真灵动岛
     ② OctoNative.islandStart 桥（MIE-APP 壳，契约见 native/island/IslandBridge.swift）→ 真灵动岛
     ③ 都没有 → 刘海假岛：纯黑胶囊对称加宽盖住真灵动岛/刘海，
        蟹和状态文字住在左右延伸区（可设置左右、文字开关）；桌面浏览器同为模拟预览
   配置存 localStorage.aIsland2；开关入口：美化 App「灵动岛」/ A 模式聊天设置
   ============================================================ */
(function () {
    'use strict';

    /* v2 键：旧 aIsland 存的是常开状态，换键让灵动岛默认回到关闭 */
    const KEY = 'aIsland2';
    const CYCLE_MS = 10000;

    /* 刘海假岛几何：真灵动岛（iPhone 14 Pro/Pro Max）宽约 126pt，居中；
       假胶囊左右对称延伸 ext，高度略高于真岛把它整个盖住（黑盖黑融为一体） */
    const ISLAND_W = 126;

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
    /* 刘海假岛配置：动画位置 / 状态文字开关与位置 / 岛的长短（中段宽 -60~300px，负值收窄） / 动画大小（16~64px） / 自定义动画图片（静态图或 GIF 的 dataURL） */
    if (!C.fake || typeof C.fake !== 'object') C.fake = { crabSide: 'left', textOn: true, textSide: 'right' };
    if (C.fake.crabSide !== 'right') C.fake.crabSide = 'left';
    if (C.fake.textSide !== 'right') C.fake.textSide = 'left';
    if (!Number.isFinite(+C.fake.gapW)) C.fake.gapW = 126;
    C.fake.gapW = Math.min(300, Math.max(-60, Math.round(+C.fake.gapW)));
    if (!Number.isFinite(+C.fake.crabSize)) C.fake.crabSize = 38;
    C.fake.crabSize = Math.min(64, Math.max(16, Math.round(+C.fake.crabSize)));
    if (typeof C.fake.sprite !== 'string' || !/^data:image\//.test(C.fake.sprite)) C.fake.sprite = '';
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

    /* ---------- 刘海假岛：延伸区宽度自适应（避开系统时钟/电量） ---------- */
    /* 角色当前状态：读聊天页顶部的状态文字（AI 更新状态时这里会同步变化） */
    function currentStatusText() {
        const el = document.getElementById('chat-room-status-text');
        const t = el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
        return t || '在线';
    }
    let statusObs = null, statusObsEl = null;
    function watchStatus() {
        const el = document.getElementById('chat-room-status-text');
        if (!el) return;
        if (statusObs && statusObsEl === el && statusObsEl.isConnected) return;
        if (statusObs) statusObs.disconnect();
        statusObsEl = el;
        statusObs = new MutationObserver(() => {
            if (!root) return;
            const t = currentStatusText();
            let changed = false;
            root.querySelectorAll('.ai-txt').forEach((node) => {
                if (node.dataset.txt === t) return;
                node.dataset.txt = t;
                const inner = node.querySelector('.ai-txt-in');
                if (inner) inner.textContent = t;
                changed = true;
            });
            if (changed) fitExt();
        });
        statusObs.observe(el, { childList: true, characterData: true, subtree: true });
    }

    function fitExt() {
        if (!root) return;
        /* 岛的长短（中段宽）跟随配置；负值按 0 处理，避免 CSS 宽度为负 */
        const gap = Math.max(0, C.fake.gapW || 0);
        const crabPx = C.fake.crabSize || 38;
        root.style.setProperty('--ai-gap', gap + 'px');
        root.style.setProperty('--ai-crab-size', crabPx + 'px');

        /* 状态文字可视宽度上限 = 岛的长短，超出部分只在该侧滚动，绝不撑长岛 */
        const textCap = Math.max(0, Math.min(gap, 220));
        const txt = root.querySelector('.ai-txt');
        if (txt) txt.style.display = '';
        const inner = txt ? txt.querySelector('.ai-txt-in') : null;
        const natural = inner ? inner.scrollWidth : 0;
        const tw = (C.fake.textOn && natural) ? Math.min(natural, textCap) : 0;

        const crabW = crabPx, gapW = 5, pad = 22, minExt = 40;
        let wL = 0, wR = 0;
        if (C.fake.crabSide === 'left') wL += crabW; else wR += crabW;
        if (C.fake.textOn) {
            if (C.fake.textSide === 'left') wL += (wL ? gapW : 0) + tw;
            else wR += (wR ? gapW : 0) + tw;
        }
        const need = Math.max(wL, wR) + pad;
        const vw = Math.min(window.innerWidth || 430, 500);
        const maxExt = Math.max(minExt, Math.floor((vw - gap) / 2) - 46);
        const ext = Math.min(maxExt, Math.max(minExt, need));
        root.style.setProperty('--ai-ext', ext + 'px');

        /* 按实际可用宽度截断文字；放不下的部分用缓慢滚动展示 */
        if (C.fake.textOn && txt) {
            const sameSide = C.fake.crabSide === C.fake.textSide;
            const avail = Math.max(0, ext - (sameSide ? crabW + gapW : 0) - 2);
            const viewW = Math.min(tw, avail);
            txt.style.maxWidth = viewW + 'px';
            txt.style.display = viewW > 0 ? '' : 'none';
            if (natural > viewW + 1) {
                txt.classList.add('ai-marquee');
                txt.style.setProperty('--ai-txt-shift', (natural - viewW) + 'px');
                txt.style.setProperty('--ai-txt-dur', Math.max(6, Math.min(20, Math.round((natural - viewW) / 16))) + 's');
            } else {
                txt.classList.remove('ai-marquee');
                txt.style.removeProperty('--ai-txt-shift');
            }
        }
    }

    /* ---------- DOM（刘海假岛胶囊 + 挑蟹卡片） ---------- */
    function build() {
        if (root || !document.body || !CRABS.length) return;
        root = document.createElement('div');
        root.id = 'a-island';
        root.innerHTML =
            '<button class="ai-pill" type="button">'
            + '<span class="ai-zone ai-zl"></span>'
            + '<span class="ai-gap"></span>'
            + '<span class="ai-zone ai-zr"></span>'
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
        window.addEventListener('resize', () => fitExt());
        if (!REAL_ISLAND) startCycle();
        render();
        apply();
    }

    function crabEl(it) {
        const s = document.createElement('span');
        s.className = 'ai-crab';
        if (C.fake.sprite) {
            /* 用户上传的静态图 / GIF：直接在岛上播放 */
            s.classList.add('ai-sprite');
            s.innerHTML = '<img src="' + C.fake.sprite + '" alt="">';
        } else {
            s.innerHTML = imgTag(it.f);
        }
        return s;
    }
    function txtEl() {
        const s = document.createElement('span');
        s.className = 'ai-txt';
        const t = currentStatusText();
        s.dataset.txt = t;
        const inner = document.createElement('span');
        inner.className = 'ai-txt-in';
        inner.textContent = t;
        s.appendChild(inner);
        return s;
    }

    function render() {
        if (!root) return;
        const it = cur();
        if (!it) return;
        const zl = root.querySelector('.ai-zl'), zr = root.querySelector('.ai-zr');
        if (zl && zr) {
            zl.innerHTML = ''; zr.innerHTML = '';
            (C.fake.crabSide === 'left' ? zl : zr).appendChild(crabEl(it));
            if (C.fake.textOn) {
                (C.fake.textSide === 'left' ? zl : zr).appendChild(txtEl());
            }
            fitExt();
        }
        root.querySelector('.ai-big').innerHTML = imgTag(it.f);
        root.querySelector('.ai-nm').textContent = it.n;
        root.querySelector('.ai-ds').textContent = it.d;
        markThumbs();
        watchStatus();
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
            /* 上传了自定义动画时，岛上固定播它，不再轮换小蟹 */
            if (C.fake.sprite) return;
            C.idx++; save();
            const it = cur();
            if (!it) return;
            /* 只替换小蟹，避免重置状态文字（否则滚动动画会一直从头开始） */
            const z = root.querySelector(C.fake.crabSide === 'left' ? '.ai-zl' : '.ai-zr');
            const old = z ? z.querySelector('.ai-crab') : null;
            if (old) old.replaceWith(crabEl(it)); else render();
            root.querySelector('.ai-big').innerHTML = imgTag(it.f);
            root.querySelector('.ai-nm').textContent = it.n;
            root.querySelector('.ai-ds').textContent = it.d;
            markThumbs();
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
            /* 没有真灵动岛桥：刘海假岛（盖在真灵动岛/刘海上的网页胶囊，以假乱真） */
            if (C.on) { build(); apply(); }
            else { close(); apply(); }
        }
        if (typeof showToast === 'function') {
            showToast(C.on ? (REAL_ISLAND ? '已挂到 iPhone 灵动岛'
                            : (IN_SHELL || IS_IOS) ? '刘海假岛已开启，盖在你的灵动岛上'
                            : '灵动岛已开启（桌面模拟）')
                          : (REAL_ISLAND ? '灵动岛已收起' : '灵动岛已关闭'));
        }
    }

    /* ---------- 刘海假岛设置（蟹位置 / 状态文字开关与位置 / 岛长短 / 螃蟹大小） ---------- */
    function getCfg() {
        return { crabSide: C.fake.crabSide, textOn: !!C.fake.textOn, textSide: C.fake.textSide, gapW: C.fake.gapW, crabSize: C.fake.crabSize, sprite: C.fake.sprite || '' };
    }
    function setCfg(patch) {
        patch = patch || {};
        if (patch.crabSide === 'left' || patch.crabSide === 'right') C.fake.crabSide = patch.crabSide;
        if (typeof patch.textOn === 'boolean') C.fake.textOn = patch.textOn;
        if (patch.textSide === 'left' || patch.textSide === 'right') C.fake.textSide = patch.textSide;
        if (patch.gapW !== undefined) {
            const n = Math.round(+patch.gapW);
            if (Number.isFinite(n)) C.fake.gapW = Math.min(300, Math.max(-60, n));
        }
        if (patch.crabSize !== undefined) {
            const n = Math.round(+patch.crabSize);
            if (Number.isFinite(n)) C.fake.crabSize = Math.min(64, Math.max(16, n));
        }
        if (patch.sprite !== undefined) {
            C.fake.sprite = (typeof patch.sprite === 'string' && /^data:image\//.test(patch.sprite)) ? patch.sprite : '';
        }
        save(); render(); syncCfgUI();
    }
    /* 读取用户选择的图片 / GIF（≤1.5MB），转 dataURL 存进配置后立即上岛播放 */
    function setSpriteFile(file) {
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            if (typeof showToast === 'function') showToast('请选择图片或 GIF');
            return;
        }
        if (file.size > 1.5 * 1024 * 1024) {
            if (typeof showToast === 'function') showToast('图片太大了，换一张 ≤1.5MB 的');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setCfg({ sprite: String(reader.result || '') });
            if (typeof showToast === 'function') showToast('动画已应用到灵动岛');
        };
        reader.onerror = () => { if (typeof showToast === 'function') showToast('读取图片失败'); };
        reader.readAsDataURL(file);
    }
    function syncCfgUI() {
        const cfg = getCfg();
        /* 面板显隐：有真灵动岛时隐藏刘海假岛设置（聊天设置模板是加载期求值的，显隐统一在这里管） */
        document.querySelectorAll('.island-cfg').forEach((el) => { el.style.display = REAL_ISLAND ? 'none' : ''; });
        if (REAL_ISLAND) return;
        document.querySelectorAll('.island-cfg-seg').forEach((seg) => {
            const val = seg.dataset.kind === 'crab' ? cfg.crabSide : cfg.textSide;
            seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.side === val));
        });
        document.querySelectorAll('.island-cfg-text-toggle').forEach((cb) => { cb.checked = cfg.textOn; });
        document.querySelectorAll('.island-cfg-len').forEach((r) => {
            if (+r.value !== cfg.gapW) r.value = cfg.gapW;
        });
        document.querySelectorAll('.island-cfg-len-val').forEach((el) => { el.textContent = cfg.gapW; });
        document.querySelectorAll('.island-cfg-crab').forEach((r) => {
            if (+r.value !== cfg.crabSize) r.value = cfg.crabSize;
        });
        document.querySelectorAll('.island-cfg-crab-val').forEach((el) => { el.textContent = cfg.crabSize; });
        /* 动画大小（聊天设置里的滑块） */
        document.querySelectorAll('.island-cfg-size').forEach((r) => {
            if (+r.value !== cfg.crabSize) r.value = cfg.crabSize;
        });
        document.querySelectorAll('.island-cfg-size-val').forEach((el) => { el.textContent = cfg.crabSize; });
        /* 上传的动画图片预览 */
        document.querySelectorAll('.island-sprite-preview').forEach((el) => {
            if (cfg.sprite) { el.src = cfg.sprite; el.style.display = 'block'; }
            else { el.removeAttribute('src'); el.style.display = 'none'; }
        });
    }

    function isOn() { return !!C.on; }

    window.AIsland = { boot: build, toggle, setOn, isOn, open, close, refresh: render, nativeStart, nativeStop, realIsland: REAL_ISLAND, getCfg, setCfg, setSpriteFile, syncCfgUI };

    /* ---------- 开机 ---------- */
    const bootSync = () => { try { syncCfgUI(); } catch (e) { /* ignore */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSync);
    else bootSync();
    if (REAL_ISLAND) {
        /* 真机开机：开关是开着的就把上次的蟹重新放回灵动岛 */
        const bootNative = () => { if (C.on) nativeStart(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootNative);
        else bootNative();
        /* 常驻保障：切后台时刷新 Live Activity（系统有时会收回灵动岛；开着就补挂，用户关了绝不强开） */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && C.on) { try { nativeStart(); } catch (e) {} }
        });
    } else {
        /* 没真灵动岛：刘海假岛 / 桌面模拟，开机时开关是开着就直接挂上 */
        if (C.on && document.body) build();
        else if (C.on) document.addEventListener('DOMContentLoaded', build);
    }
})();
