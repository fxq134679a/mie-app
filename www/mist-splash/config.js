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

    // 原字体是按默认文案裁的子集；换了文字就改用系统衬线，避免一半缺字一半正常
    if (customQuotes) window.MistSplashQuotesCustom = true;
    if (customIntro) {
        var root = document.getElementById('mist-living-water');
        if (root) root.classList.add('mist-custom-intro');
    }
})();
