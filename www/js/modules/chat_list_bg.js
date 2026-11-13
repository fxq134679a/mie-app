// --- 聊天列表（底栏第二个图标）背景图片设置 ---
(function () {
    'use strict';

    var KEY = 'mie_chat_list_bg_v1';
    var STYLE_KEY = 'mie_chat_list_style_v1';
    var VARIANT_KEY = 'mie_chat_list_variant_v1';
    var VARIANTS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

    function readBg() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    // 胶囊样式：liquid=液态玻璃（默认）、frosted=磨砂
    function readStyle() {
        try { return localStorage.getItem(STYLE_KEY) === 'frosted' ? 'frosted' : 'liquid'; } catch (e) { return 'liquid'; }
    }

    // 液态玻璃效果变体（v1 清透 / v2 浸色 / v3 辉光 / v4 奶白 / v5 暖砂 / v6 暮色）
    function readVariant() {
        try {
            var v = localStorage.getItem(VARIANT_KEY);
            return VARIANTS.indexOf(v) >= 0 ? v : 'v1';
        } catch (e) { return 'v1'; }
    }

    function cssUrl(url) {
        return 'url("' + String(url).replace(/["\\]/g, '') + '")';
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
        screen.classList.toggle('chat-list-frosted', readStyle() === 'frosted');
        VARIANTS.forEach(function (v) { screen.classList.remove('chat-list-variant-' + v); });
        if (readStyle() === 'liquid') screen.classList.add('chat-list-variant-' + readVariant());
        measureTop(screen);
        watchTop(screen);
        var url = readBg();
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

    // 同步设置页预览、样式分段按钮与液态效果网格
    function sync() {
        var preview = document.getElementById('clb-preview');
        var style = readStyle();
        var variant = readVariant();
        if (preview) {
            var url = readBg();
            preview.style.backgroundImage = url ? cssUrl(url) : '';
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center center';
            preview.classList.toggle('clb-has-bg', !!url);
            preview.classList.toggle('clb-frosted', style === 'frosted');
            VARIANTS.forEach(function (v) { preview.classList.remove('clb-variant-' + v); });
            if (style === 'liquid') preview.classList.add('clb-variant-' + variant);
        }
        var seg = document.getElementById('clb-style-seg');
        if (seg) {
            Array.prototype.forEach.call(seg.querySelectorAll('.clb-style-btn'), function (btn) {
                btn.classList.toggle('selected', btn.dataset.style === style);
            });
        }
        // 液态效果网格：仅液态玻璃时显示
        var row = document.getElementById('clb-variant-row');
        if (row) row.style.display = style === 'liquid' ? '' : 'none';
        var vseg = document.getElementById('clb-variant-seg');
        if (vseg) {
            Array.prototype.forEach.call(vseg.querySelectorAll('.clb-variant-btn'), function (btn) {
                btn.classList.toggle('selected', btn.dataset.variant === variant);
            });
        }
    }

    function open() {
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
        var styleSeg = document.getElementById('clb-style-seg');
        var variantSeg = document.getElementById('clb-variant-seg');

        if (variantSeg) {
            variantSeg.addEventListener('click', function (e) {
                var btn = e.target.closest('.clb-variant-btn');
                if (!btn) return;
                try { localStorage.setItem(VARIANT_KEY, btn.dataset.variant); } catch (err) { /* ignore */ }
                apply();
                sync();
                var names = { v1: '经典', v2: '清透', v3: '浸色', v4: '辉光', v5: '奶白', v6: '暮色' };
                toast('已切换为「' + (names[btn.dataset.variant] || btn.dataset.variant) + '」效果');
            });
        }

        if (styleSeg) {
            styleSeg.addEventListener('click', function (e) {
                var btn = e.target.closest('.clb-style-btn');
                if (!btn) return;
                try { localStorage.setItem(STYLE_KEY, btn.dataset.style === 'frosted' ? 'frosted' : 'liquid'); } catch (err) { /* ignore */ }
                apply();
                sync();
                toast(btn.dataset.style === 'frosted' ? '已切换为磨砂' : '已切换为液态玻璃');
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
