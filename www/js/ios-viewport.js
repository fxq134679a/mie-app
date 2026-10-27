/* ============================================================
   iOS 视口贴合（修「底部一条灰白带 / 页面被截断 / 不是全屏」）

   背景：iOS 26.x 的独立模式（添加到主屏幕）有一个 WebKit 已知回归
   （bug 301994 / 313800）——
   物理屏高 874，网页真实可视区可能只有 812，中间那几十 px 是系统在
   视口 *外面* 预留的区域。DOM 永远画不进去，只有根背景色能「渗透」过去。

   所以这里做两件事：
   1) 把 App 容器（.phone-screen）高度压到真正可见的高度，
      内容不再被截断、底栏完整露出；
   2) 把 html 根背景刷成「底部边缘那一块的实际颜色」，
      系统预留区和 App 融为一体，看起来才是真全屏。

   · 不是 iOS，或没有这条预留带 → 脚本完全不生效
   · 键盘弹出（可视区大幅缩水）→ 自动跳过，绝不压缩整个 App
   ============================================================ */
(function () {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && 'ontouchend' in document);   // iPadOS 桌面 UA
    if (!isIOS) return;

    var root = document.documentElement;
    var BAND_MIN = 8;         // 小于这个值就不算预留带
    var KEYBOARD_DELTA = 120; // 可视区缩水超过这个值 → 判定为键盘
    var REPAINT_MS = 1200;    // 切页面 / 换主题后补刷一次取色
    var vv = window.visualViewport || null;
    var active = false;
    var lastColor = '';

    function isEditing() {
        var el = document.activeElement;
        if (!el) return false;
        var tag = (el.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
    }

    // ---- 量一下：真实可见高度、系统预留带有多宽 ----
    function measure() {
        var innerH = window.innerHeight || 0;
        var vvH = (vv && vv.height) ? vv.height : innerH;
        var vvTop = (vv && vv.offsetTop) ? Math.max(0, Math.round(vv.offsetTop)) : 0;

        var sw = (window.screen && window.screen.width) || 0;
        var sh = (window.screen && window.screen.height) || 0;
        // 横屏时 screen 的宽高会互换，取长边当「物理屏高」
        if (window.innerWidth > window.innerHeight) {
            var t = sw; sw = sh; sh = t;
        }

        return {
            portrait: window.innerHeight >= window.innerWidth,
            innerH: Math.round(innerH),
            vvH: Math.round(vvH),
            vvTop: vvTop,
            gap: Math.round(sh - innerH),        // 物理屏 vs innerHeight
            delta: Math.round(innerH - vvH),     // innerHeight vs 真可视区
            keyboard: isEditing() && (innerH - vvH) > KEYBOARD_DELTA
        };
    }

    // ---- 取某一点「实际看到的颜色」：往上找到第一个不透明的背景 ----
    function colorAt(x, y) {
        var el = null;
        try { el = document.elementFromPoint(x, y); } catch (e) { return ''; }
        while (el && el !== root) {
            var bg = '';
            try { bg = getComputedStyle(el).backgroundColor || ''; } catch (e) { bg = ''; }
            var m = /rgba?\(([^)]+)\)/.exec(bg);
            if (m) {
                var p = m[1].split(',').map(parseFloat);
                var a = p.length > 3 ? p[3] : 1;
                if (a > 0.85) {
                    return 'rgb(' + Math.round(p[0]) + ',' + Math.round(p[1]) + ',' + Math.round(p[2]) + ')';
                }
            }
            el = el.parentElement;
        }
        return '';
    }

    // ---- 把系统预留带染成和 App 边缘同色 ----
    function paint(vh) {
        var h = vh || Math.min(window.innerHeight || 0, (vv && vv.height) || 0);
        if (!h) return;
        var c = colorAt(Math.round(window.innerWidth / 2), Math.max(2, Math.round(h) - 3));
        if (!c) return;
        // 开屏结束时宿主会把根背景还原清空，这里发现被清掉了就重新刷上
        if (c === lastColor && root.style.backgroundColor === c) return;
        lastColor = c;
        root.style.backgroundColor = c;
    }

    function apply() {
        var m = measure();
        if (!m.portrait) { reset(); return; }

        // 键盘弹出：可视区被键盘吃掉一大块，这不是预留带，保持原样
        if (m.keyboard || m.delta > KEYBOARD_DELTA) return;

        var band = Math.max(m.gap, m.delta, m.vvTop);
        if (band <= BAND_MIN) { reset(); return; }

        active = true;
        // 关键一步：容器高度 = 真正可见的高度，不再比可视区高（否则底部被截断）
        var top = Math.max(0, m.vvTop);          // 可视区被整体下推时，容器跟着下移
        var vh = Math.min(m.innerH, m.vvH, m.innerH - top);
        root.style.setProperty('--app-top', top + 'px');
        root.style.setProperty('--app-vh', vh + 'px');
        root.style.setProperty('--ios-band', band + 'px');
        requestAnimationFrame(function () { paint(vh); });   // 等布局落地后再取色
    }

    function reset() {
        if (!active) return;
        active = false;
        lastColor = '';
        root.style.removeProperty('--app-top');
        root.style.removeProperty('--app-vh');
        root.style.removeProperty('--ios-band');
        root.style.removeProperty('background-color');
    }

    if (!document.body) document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();

    window.addEventListener('load', function () { apply(); });
    window.addEventListener('orientationchange', function () {
        setTimeout(apply, 260);
    });

    var timer = 0;
    function onResize() {
        clearTimeout(timer);
        timer = setTimeout(apply, 180);
    }
    window.addEventListener('resize', onResize);
    if (vv) vv.addEventListener('resize', onResize);

    // 切页面 / 换主题后底部那块颜色会变，定时补刷（只有存在预留带时才跑）
    setInterval(function () { if (active && !isEditing()) paint(); }, REPAINT_MS);
})();
