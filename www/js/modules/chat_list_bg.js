// --- 聊天列表（底栏第二个图标）背景图片设置 ---
(function () {
    'use strict';

    var KEY = 'mie_chat_list_bg_v1';
    var STYLE_KEY = 'mie_chat_list_style_v1'; // 旧版独立磨砂开关，仅用于迁移读取
    var VARIANT_KEY = 'mie_chat_list_variant_v1';
    // 主题列表：v1 经典 / v2 清透 / v3 浸色 / v4 辉光 / v5 奶白 / frosted 磨砂 / glass 毛玻璃
    var VARIANTS = ['v1', 'v2', 'v3', 'v4', 'v5', 'frosted', 'glass'];
    var VARIANT_NAMES = { v1: '经典', v2: '清透', v3: '浸色', v4: '辉光', v5: '奶白', frosted: '磨砂', glass: '毛玻璃' };

    function readBg() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    // 主题变体：兼容旧数据（旧样式开关 frosted → 迁移为主题；v6 暮色已移除 → 回落 v1）
    function readVariant() {
        try {
            var v = localStorage.getItem(VARIANT_KEY);
            if (VARIANTS.indexOf(v) >= 0) return v;
            if (localStorage.getItem(STYLE_KEY) === 'frosted') return 'frosted';
            return 'v1';
        } catch (e) { return 'v1'; }
    }

    function cssUrl(url) {
        return 'url("' + String(url).replace(/["\\]/g, '') + '")';
    }

    // 浸色主题取色：从背景图平均取主色调（跳过近白像素），写入 --clb-tint-rgb 供 v3 浸染
    var _tintCache = { url: null, rgb: null };
    function extractTint(url, cb) {
        if (!url) return cb(null);
        if (_tintCache.url === url) return cb(_tintCache.rgb);
        var img = new Image();
        img.onload = function () {
            try {
                var c = document.createElement('canvas');
                c.width = 16; c.height = 16;
                var ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, 16, 16);
                var d = ctx.getImageData(0, 0, 16, 16).data;
                var r = 0, g = 0, b = 0, n = 0;
                for (var i = 0; i < d.length; i += 4) {
                    if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) continue; // 跳过近白
                    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
                }
                if (!n) { r = 186; g = 208; b = 224; n = 1; }
                var rgb = Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n);
                _tintCache = { url: url, rgb: rgb };
                cb(rgb);
            } catch (e) { cb(null); }
        };
        img.onerror = function () { cb(null); };
        img.src = url;
    }

    function applyTint(url) {
        extractTint(url, function (rgb) {
            var t = rgb || '186, 208, 224'; // 无图/取色失败：中性雾蓝兜底
            try { document.documentElement.style.setProperty('--clb-tint-rgb', t); } catch (e) { /* ignore */ }
        });
    }

    // 顶部朦胧遮罩的高度：顶栏 + 分类栏实测高度，页面由隐藏变可见时自动更新
    function measureTop(screen) {
        var header = screen.querySelector('.chat-list-header');
        var tabs = screen.querySelector('.chat-category-tabs');
        if (!header || !tabs) return;
        var h = header.getBoundingClientRect().height + tabs.getBoundingClientRect().height;
        if (h > 40) screen.style.setProperty('--clb-top-h', Math.round(h) + 'px');
    }

    var _topObserver = null;
    function watchTop(screen) {
        if (_topObserver || typeof ResizeObserver === 'undefined') return;
        var header = screen.querySelector('.chat-list-header');
        var tabs = screen.querySelector('.chat-category-tabs');
        if (!header || !tabs) return;
        _topObserver = new ResizeObserver(function () { measureTop(screen); });
        _topObserver.observe(header);
        _topObserver.observe(tabs);
    }

    // 把已保存的背景图应用到聊天列表页
    function apply() {
        var screen = document.getElementById('chat-list-screen');
        if (!screen) return;
        var variant = readVariant();
        screen.classList.remove('chat-list-frosted');
        VARIANTS.forEach(function (v) { screen.classList.remove('chat-list-variant-' + v); });
        if (variant === 'frosted') screen.classList.add('chat-list-frosted');
        else screen.classList.add('chat-list-variant-' + variant);
        measureTop(screen);
        watchTop(screen);
        var url = readBg();
        applyTint(url);
        if (url) {
            screen.style.backgroundImage = cssUrl(url);
            screen.style.backgroundSize = 'cover';
            screen.style.backgroundPosition = 'center center';
            screen.style.backgroundRepeat = 'no-repeat';
            screen.classList.add('chat-list-has-bg');
        } else {
            screen.style.backgroundImage = '';
            screen.style.backgroundSize = '';
            screen.style.backgroundPosition = '';
            screen.style.backgroundRepeat = '';
            screen.classList.remove('chat-list-has-bg');
        }
    }

    // 同步设置页预览与主题网格
    function sync() {
        var preview = document.getElementById('clb-preview');
        var variant = readVariant();
        if (preview) {
            var url = readBg();
            preview.style.backgroundImage = url ? cssUrl(url) : '';
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center center';
            preview.classList.toggle('clb-has-bg', !!url);
            preview.classList.toggle('clb-frosted', variant === 'frosted');
            VARIANTS.forEach(function (v) { preview.classList.remove('clb-variant-' + v); });
            if (variant !== 'frosted') preview.classList.add('clb-variant-' + variant);
        }
        var vseg = document.getElementById('clb-variant-seg');
        if (vseg) {
            Array.prototype.forEach.call(vseg.querySelectorAll('.clb-variant-btn'), function (btn) {
                btn.classList.toggle('selected', btn.dataset.variant === variant);
            });
        }
    }

    function open() {
        apply();
        sync();
        renderDuoPicker();
        bindGlobalCssEntry();
        if (typeof switchScreen === 'function') switchScreen('chat-list-bg-screen');
    }

    // ===== 全局 CSS 美化（自美化 APP 移入的入口） =====
    // 数据仍在 db.globalCss / db.globalCssPresets，此处只负责填充与打开弹层
    var _gceBound = false;
    function bindGlobalCssEntry() {
        var entry = document.getElementById('clb-global-css-entry');
        if (!entry || _gceBound) return;
        _gceBound = true;
        // iOS 直绑（非交互元素委托 click 不派发）
        entry.addEventListener('click', function () {
            var ta = document.getElementById('global-beautification-css');
            if (ta) ta.value = db.globalCss || '';
            if (typeof populateGlobalCssPresetSelect === 'function') populateGlobalCssPresetSelect();
            var modal = document.getElementById('global-css-modal');
            if (modal) modal.classList.add('visible');
        });
    }

    // ===== 更多页双头像设置（角色选择 + 头像区背景） =====
    function renderDuoPicker() {
        var picker = document.getElementById('duo-char-picker');
        if (!picker) return;
        picker.innerHTML = '';
        (db.characters || []).forEach(function (c) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'duo-char-option' + (c.id === db.moreDuoCharId ? ' selected' : '');
            var img = document.createElement('img');
            img.src = c.avatar || '';
            img.alt = '';
            var name = document.createElement('span');
            name.className = 'duo-char-option-name';
            name.textContent = c.remarkName || c.name || '角色';
            item.appendChild(img);
            item.appendChild(name);
            // iOS 直绑（非交互元素委托 click 不派发）
            item.addEventListener('click', function () {
                db.moreDuoCharId = c.id;
                if (typeof saveData === 'function') saveData();
                renderDuoPicker();
                if (typeof renderMoreScreen === 'function') renderMoreScreen();
                toast('更多页头像已切换为「' + (c.remarkName || c.name || '角色') + '」');
            });
            picker.appendChild(item);
        });
    }

    function bindDuoSettings() {
        var uploadBtn = document.getElementById('duo-bg-upload-btn');
        var fileInput = document.getElementById('duo-bg-file-input');
        var resetBtn = document.getElementById('duo-bg-reset-btn');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', async function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    var url = (typeof compressImage === 'function')
                        ? await compressImage(file, { quality: 0.8, maxWidth: 900, maxHeight: 900 })
                        : await new Promise(function (resolve, reject) {
                            var r = new FileReader();
                            r.onload = function () { resolve(r.result); };
                            r.onerror = reject;
                            r.readAsDataURL(file);
                        });
                    db.moreDuoBg = url;
                    if (typeof saveData === 'function') saveData();
                    if (typeof renderMoreScreen === 'function') renderMoreScreen();
                    toast('更多页头像背景已更换');
                } catch (err) {
                    console.warn('[chat_list_bg] 头像背景保存失败', err);
                    toast('图片过大或保存失败，请换一张');
                }
                e.target.value = '';
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                db.moreDuoBg = '';
                if (typeof saveData === 'function') saveData();
                if (typeof renderMoreScreen === 'function') renderMoreScreen();
                toast('已恢复默认背景');
            });
        }
    }

    function toast(msg) {
        if (typeof showToast === 'function') showToast(msg);
    }

    function bind() {
        var uploadBtn = document.getElementById('clb-upload-btn');
        var fileInput = document.getElementById('clb-file-input');
        var resetBtn = document.getElementById('clb-reset-btn');
        var variantSeg = document.getElementById('clb-variant-seg');

        if (variantSeg) {
            variantSeg.addEventListener('click', function (e) {
                var btn = e.target.closest('.clb-variant-btn');
                if (!btn) return;
                try { localStorage.setItem(VARIANT_KEY, btn.dataset.variant); } catch (err) { /* ignore */ }
                apply();
                sync();
                toast('已切换为「' + (VARIANT_NAMES[btn.dataset.variant] || btn.dataset.variant) + '」主题');
            });
        }

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', async function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    var url = (typeof compressImage === 'function')
                        ? await compressImage(file, { quality: 0.8, maxWidth: 900, maxHeight: 1600 })
                        : await new Promise(function (resolve, reject) {
                            var r = new FileReader();
                            r.onload = function () { resolve(r.result); };
                            r.onerror = reject;
                            r.readAsDataURL(file);
                        });
                    localStorage.setItem(KEY, url);
                    apply();
                    sync();
                    toast('聊天列表背景已更换');
                } catch (err) {
                    console.warn('[chat_list_bg] 保存失败', err);
                    toast('图片过大或保存失败，请换一张');
                }
                e.target.value = '';
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
                apply();
                sync();
                toast('已恢复默认白色');
            });
        }
    }

    window.MieChatListBg = { apply: apply, open: open, sync: sync };

    function init() { bind(); bindDuoSettings(); apply(); sync(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
