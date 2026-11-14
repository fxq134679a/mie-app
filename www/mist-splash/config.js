// 读取「美化 → 开屏动画」保存的自定义背景与文字
// iframe 与应用同源，共享 localStorage；必须在 splash.js 之前执行
(function () {
    var KEY = 'mie_splash_config_v1';
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { }

    var D = window.MistSplashDefaults || {};
    var defaultQuotes = Array.isArray(D.quotes) ? D.quotes
        : (Array.isArray(window.MistSplashQuotes) ? window.MistSplashQuotes : []);
    var defaultIntroEn = typeof D.introEn === 'string' ? D.introEn : 'TOUCH THE GLASS.';
    var defaultIntroCn = typeof D.introCn === 'string' ? D.introCn : '用手指擦开这层雾。';
    var defaultTitle = typeof D.title === 'string' ? D.title : 'Mist';

    var customQuotes = false;
    var customIntro = false;

    // --- 背景 ---
    var bg = cfg && typeof cfg.bg === 'string' ? cfg.bg : '';
    // 只接受本地上传压缩后的 data URL，远程图片会被 CORS/画布污染挡住
    if (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(bg)) {
        var img = document.querySelector('.alw-photo');
        if (img) img.src = bg;
    }

    // --- 擦开后显示的文字：空行分段 ---
    if (Array.isArray(cfg.quotes)) {
        var quotes = cfg.quotes
            .filter(function (q) { return typeof q === 'string' && q.trim(); })
            .map(function (q) { return q.replace(/\r/g, '').trim(); });
        if (quotes.length) {
            window.MistSplashQuotes = quotes;
            if (quotes.join('\u0000') !== defaultQuotes.join('\u0000')) customQuotes = true;
        }
    }

    // --- 左上角提示 ---
    function applyIntro(selector, value, fallback) {
        var el = document.querySelector(selector);
        if (!el) return false;
        var text = typeof value === 'string' ? value : fallback;
        el.textContent = text;
        return text !== fallback;
    }
    if (applyIntro('.alw-en', cfg.introEn, defaultIntroEn)) customIntro = true;
    if (applyIntro('.alw-cn', cfg.introCn, defaultIntroCn)) customIntro = true;

    // --- 手写标题 ---
    window.MistSplashTitle = typeof cfg.title === 'string' ? cfg.title : defaultTitle;

    // --- 擦开底色（划开后显现文字的那层背景颜色） ---
    var reveal = cfg && typeof cfg.revealColor === 'string' ? cfg.revealColor.trim() : '';
    if (/^#[0-9a-fA-F]{6}$/.test(reveal)) window.MistSplashRevealColor = reveal.toUpperCase();

    // --- 锁屏时钟（液态玻璃，iPhone 风格）：美化 → 开屏动画 里开启 ---
    if (cfg && cfg.clockOn === true) {
        var clockEl = document.getElementById('alw-clock');
        if (clockEl) {
            clockEl.hidden = false;
            var timeEl = document.getElementById('alw-clock-time');
            var clockHex = typeof cfg.clockColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cfg.clockColor.trim())
                ? cfg.clockColor.trim().toUpperCase() : '';
            if (timeEl) {
                if (clockHex) {
                    // 用所选颜色调出玻璃渐变：亮 → 原色 → 半亮
                    var mixWithWhite = function (hex, ratio) {
                        var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                        var m = function (c) { return Math.round(c + (255 - c) * ratio); };
                        var to = function (c) { return ('0' + c.toString(16)).slice(-2); };
                        return '#' + to(m(r)) + to(m(g)) + to(m(b));
                    };
                    timeEl.style.backgroundImage = 'linear-gradient(180deg,' +
                        mixWithWhite(clockHex, 0.62) + ' 4%,' + clockHex + ' 52%,' + mixWithWhite(clockHex, 0.3) + ' 100%)';
                } else {
                    timeEl.style.backgroundImage = '';
                }
            }
            var clockWd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            var clockPad = function (n) { return (n < 10 ? '0' : '') + n; };
            var clockTick = function () {
                var d = new Date();
                var de = document.getElementById('alw-clock-date');
                var te = document.getElementById('alw-clock-time');
                if (de) de.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日' + clockWd[d.getDay()];
                if (te) te.textContent = clockPad(d.getHours()) + ':' + clockPad(d.getMinutes());
            };
            clockTick();
            setInterval(clockTick, 1000);
        }
    }

    // 原字体是按默认文案裁的子集；换了文字就改用系统衬线，避免一半缺字一半正常
    if (customQuotes) window.MistSplashQuotesCustom = true;
    if (customIntro) {
        var root = document.getElementById('mist-living-water');
        if (root) root.classList.add('mist-custom-intro');
    }
})();
