/* ============================================================
   A 模式 · 枫枝螃蟹：聊天页顶栏下挂一只吊在枫枝上的小蟹
   组件本体 js/lib/maple-crab/（TangfanOVO/curio，MIT；螃蟹身子来自
   clawd-tank，MIT，署名见 js/lib/maple-crab/CREDITS.md）
   开关在捉宠面板的「桌宠设置」里，默认开；配置存 localStorage.mieMapleCrab
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'mieMapleCrab';
    let mc = null;
    let barRO = null;

    function read() {
        let v = null;
        try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { v = null; }
        if (!v || typeof v !== 'object') v = {};
        if (typeof v.set !== 'object' || !v.set) v.set = {};
        if (v.on === undefined) v.on = true;
        return v;
    }
    function write(patch) {
        const v = Object.assign(read(), patch);
        try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { }
        return v;
    }

    function isOn() { return read().on !== false; }

    /* 顶栏在 A 模式是绝对定位的浮层，组件按「顶栏占一行」来量位置，
       所以把量到的顶栏下沿喂给 CSS 变量，那一排才不会被顶栏盖住 */
    function syncBar(app) {
        const bar = app.querySelector('.a-header');
        if (!bar) return;
        const r = bar.getBoundingClientRect(), hr = app.getBoundingClientRect();
        app.style.setProperty('--mc-bar', Math.max(0, Math.round(r.bottom - hr.top)) + 'px');
    }

    /* 组件一挂载就开始算弹簧，量到 0 尺寸会把它算成 NaN 且再也缓不回来，
       所以等 #a-app 真的摆好（从 display:none 变可见）再挂 */
    let waitRO = null;
    function boot() {
        const app = document.getElementById('a-app');
        if (!app || mc || !window.MapleCrab || !isOn()) return;
        if (app.clientWidth > 0 && app.clientHeight > 0) mount(app);
        else if (!waitRO) {
            waitRO = new ResizeObserver(() => {
                if (app.clientWidth > 0 && app.clientHeight > 0) {
                    waitRO.disconnect(); waitRO = null; mount(app);
                }
            });
            waitRO.observe(app);
        }
    }

    function mount(app) {
        const st = read();
        app.classList.add('a-maple');

        mc = window.MapleCrab.mount(app, {
            bar: '.a-header',
            chat: '#a-log',
            bubble: '.a-bubble',
            input: '#a-box',
            menus: ['press', 'settings', 'play'],
            places: [],
            unread: [],
            hints: false,
            shown: st.on !== false,
            sets: window.MapleCrab.defaultSets(),
            onSettings: (s) => {
                const keep = Object.assign({}, s);
                delete keep.move;   /* 移动只是临时状态，别下次打开还在拖 */
                write({ set: keep });
                app.classList.toggle('a-maple-up', (keep.offY || 0) < 0);
            },
            onHide: () => write({ on: false }),
            onShow: () => write({ on: true })
        });
        Object.keys(st.set).forEach((k) => mc.set(k, st.set[k]));

        syncBar(app);
        const bar = app.querySelector('.a-header');
        if (bar && window.ResizeObserver) {
            barRO = new ResizeObserver(() => syncBar(app));
            barRO.observe(bar);
        }
        addEventListener('resize', () => syncBar(app));

        /* 那一排改成浮层后不再自己撑开聊天，把它的高度转成 --mc-push 往下推 */
        const fold = app.querySelector('.mc-fold');
        if (fold && window.ResizeObserver) {
            new ResizeObserver(() => {
                app.style.setProperty('--mc-push', fold.getBoundingClientRect().height + 'px');
            }).observe(fold);
        }
    }

    function set(on) {
        write({ on: !!on });
        if (!mc) { if (on) boot(); return; }
        if (on) mc.show(); else mc.hide();
    }
    function toggle() { set(!isOn()); }

    window.AMaple = {
        boot, isOn, set, toggle,
        open: () => mc && mc.open(),
        close: () => mc && mc.close(),
        instance: () => mc
    };
})();
