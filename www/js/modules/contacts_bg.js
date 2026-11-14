// --- Friends（联系人页 / 底栏第一个图标）背景图片设置 ---
// 与 chat_list_bg.js（Chats 页背景）同款：localStorage 存图，设置页（chat-list-bg-screen）内更换/恢复
(function () {
    'use strict';

    var KEY = 'mie_contacts_bg_v1';

    function readBg() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    function cssUrl(url) {
        return 'url("' + String(url).replace(/["\\]/g, '') + '")';
    }

    // 把已保存的背景图应用到联系人（Friends）页
    function apply() {
        var screen = document.getElementById('contacts-screen');
        if (!screen) return;
        var url = readBg();
        if (url) {
            screen.style.backgroundImage = cssUrl(url);
            screen.style.backgroundSize = 'cover';
            screen.style.backgroundPosition = 'center center';
            screen.style.backgroundRepeat = 'no-repeat';
            screen.classList.add('contacts-has-bg');
        } else {
            screen.style.backgroundImage = '';
            screen.style.backgroundSize = '';
            screen.style.backgroundPosition = '';
            screen.style.backgroundRepeat = '';
            screen.classList.remove('contacts-has-bg');
        }
    }

    // 同步设置页预览
    function sync() {
        var preview = document.getElementById('cfb-preview');
        if (preview) {
            var url = readBg();
            preview.style.backgroundImage = url ? cssUrl(url) : '';
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center center';
            preview.classList.toggle('cfb-has-bg', !!url);
        }
    }

    function toast(msg) {
        if (typeof showToast === 'function') showToast(msg);
    }

    function bind() {
        var uploadBtn = document.getElementById('cfb-upload-btn');
        var fileInput = document.getElementById('cfb-file-input');
        var resetBtn = document.getElementById('cfb-reset-btn');

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
                    toast('Friends 页背景已更换');
                } catch (err) {
                    console.warn('[contacts_bg] 保存失败', err);
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

    window.MieContactsBg = { apply: apply, sync: sync };

    // 设置页（chat-list-bg-screen）每次打开时刷新预览，避免预览与最新背景不同步
    function watchSettingsScreen() {
        var scr = document.getElementById('chat-list-bg-screen');
        if (!scr || typeof MutationObserver === 'undefined') return;
        new MutationObserver(function () {
            if (scr.classList.contains('active')) sync();
        }).observe(scr, { attributes: true, attributeFilter: ['class'] });
    }

    function init() { bind(); watchSettingsScreen(); apply(); sync(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
