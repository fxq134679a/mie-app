/* ════════════════════════════════════════════════════════
   通知栏美化 · 自定义 CSS + 预设管理
   ───────────────────────────────────────────────
   · 样式作用于角色回复时顶部通知栏 #toast-notification
   · 桥接层把本项目的 DOM 映射成 nuojiji 那套
     .ios-notification-banner / .banner-* 选择器，外部主题 CSS 可直接用
   · db.notificationCss 为空时完全保持默认外观
   ════════════════════════════════════════════════════════ */

(function () {
    const BRIDGE_ID = 'notif-skin-bridge';
    const USER_ID = 'notif-css-style';

    const BRIDGE_CSS = `
/* 默认布局外层：不设置任何颜色/边框，留空时外观与原来一致 */
#toast-notification .notif-card {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
}

/* 自定义样式开启时：外层只做定位，视觉全交给卡片内的主题 CSS */
#toast-notification.notif-custom:not(.simple) {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
}

#toast-notification.notif-custom:not(.simple) .ios-notification-banner {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    gap: var(--nuo-notif-gap, 12px);
    padding: var(--nuo-notif-padding, 12px);
    background: var(--nuo-notif-bg, rgba(255,255,255,.88));
    border: var(--nuo-notif-border, 1px solid rgba(0,0,0,.05));
    border-radius: var(--nuo-notif-radius, 20px);
    box-shadow: var(--nuo-notif-shadow, 0 8px 25px rgba(0,0,0,.12));
}

#toast-notification.notif-custom:not(.simple) .banner-content-wrapper {
    overflow: visible !important;
}

#toast-notification.notif-custom:not(.simple) .toast-avatar {
    width: var(--nuo-notif-avatar-size, 40px);
    height: var(--nuo-notif-avatar-size, 40px);
    border-radius: 12px;
}

#toast-notification.notif-custom:not(.simple) .banner-title {
    color: var(--nuo-notif-title-color, #000);
}

#toast-notification.notif-custom:not(.simple) .banner-message {
    color: var(--nuo-notif-message-color, #444);
}

body.a-mode #toast-notification.notif-custom:not(.simple) .ios-notification-banner {
    background: var(--nuo-notif-bg-dark, var(--nuo-notif-bg, rgba(255,255,255,.88)));
}

@media (prefers-color-scheme: dark) {
    #toast-notification.notif-custom:not(.simple) .ios-notification-banner {
        background: var(--nuo-notif-bg-dark, var(--nuo-notif-bg, rgba(255,255,255,.88)));
    }
}
`;

    function ensureBridge() {
        if (document.getElementById(BRIDGE_ID)) return;
        const st = document.createElement('style');
        st.id = BRIDGE_ID;
        st.textContent = BRIDGE_CSS;
        (document.head || document.documentElement).appendChild(st);
    }

    function getPresets() {
        if (typeof db === 'undefined') return [];
        if (!Array.isArray(db.notificationCssPresets)) db.notificationCssPresets = [];
        return db.notificationCssPresets;
    }

    /* 富通知（角色回复）才挂外部主题类名；纯文字小提示保持原样 */
    function syncNotificationToastSkin(rich) {
        const toast = document.getElementById('toast-notification');
        if (!toast) return;
        const active = !!rich && !!(typeof db !== 'undefined' && (db.notificationCss || '').trim());
        const pairs = [
            ['.notif-card', 'ios-notification-banner'],
            ['.toast-content', 'banner-content-wrapper'],
            ['.toast-name', 'banner-title'],
            ['.toast-message', 'banner-message']
        ];
        pairs.forEach(([sel, cls]) => {
            const el = toast.querySelector(sel);
            if (el) el.classList.toggle(cls, active);
        });
        toast.classList.toggle('notif-custom', active);
    }

    function applyNotificationCss(css, persist) {
        ensureBridge();
        const value = typeof css === 'string' ? css : '';
        if (typeof db !== 'undefined') db.notificationCss = value;

        let style = document.getElementById(USER_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = USER_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = value.trim() ? value : '';

        const toast = document.getElementById('toast-notification');
        if (toast) syncNotificationToastSkin(toast.classList.contains('actionable'));
        if (persist && typeof saveData === 'function') saveData();
    }

    function populateNotificationCssPresetSelect() {
        const select = document.getElementById('notif-css-preset-select');
        if (!select) return;
        const presets = getPresets();
        select.innerHTML = '';
        const first = document.createElement('option');
        first.value = '';
        first.textContent = '选择预设';
        select.appendChild(first);
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
    }

    function saveNotificationCssPreset() {
        const ta = document.getElementById('notif-css-editor');
        const nameEl = document.getElementById('notif-css-name');
        const css = ta ? ta.value.trim() : '';
        const name = nameEl ? nameEl.value.trim() : '';
        if (!css) return showToast('CSS 内容为空，无法保存');
        if (!name) return showToast('请输入预设名称');
        const presets = getPresets();
        const idx = presets.findIndex(p => p.name === name);
        if (idx >= 0) presets[idx].css = css;
        else presets.push({ name, css });
        db.notificationCssPresets = presets;
        applyNotificationCss(css, true);
        populateNotificationCssPresetSelect();
        showToast('通知栏预设已保存');
    }

    function loadNotificationCssPreset(name) {
        const preset = getPresets().find(p => p.name === name);
        if (!preset) return showToast('请选择或输入一个预设');
        const ta = document.getElementById('notif-css-editor');
        const nameEl = document.getElementById('notif-css-name');
        if (ta) ta.value = preset.css || '';
        if (nameEl) nameEl.value = preset.name;
        applyNotificationCss(preset.css || '', true);
        showToast('通知栏样式已应用');
    }

    function resetNotificationCss() {
        const ta = document.getElementById('notif-css-editor');
        const nameEl = document.getElementById('notif-css-name');
        if (ta) ta.value = '';
        if (nameEl) nameEl.value = '';
        applyNotificationCss('', true);
        showToast('通知栏已恢复默认');
    }

    function handleNotificationCssFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            const ta = document.getElementById('notif-css-editor');
            const nameEl = document.getElementById('notif-css-name');
            if (ta) ta.value = text;
            if (nameEl && !nameEl.value.trim()) {
                nameEl.value = file.name.replace(/\.(txt|css)$/i, '');
            }
            applyNotificationCss(text, true);
            const input = document.getElementById('notif-css-file');
            if (input) input.value = '';
            showToast('已导入并应用通知栏样式');
        };
        reader.onerror = () => showToast('文件读取失败');
        reader.readAsText(file);
    }

    function openNotificationCssManageModal() {
        let modal = document.getElementById('notif-css-manage-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'notif-css-manage-modal';
            modal.className = 'modal-overlay';
            modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);justify-content:center;align-items:center;z-index:9999;';
            modal.innerHTML = '<div class="modal-window" style="max-width:520px;background:var(--panel-bg,#fff);padding:14px;border-radius:12px;box-shadow:0 12px 36px rgba(10,10,20,.12);">' +
                '<h3 style="margin:0 0 10px;font-size:16px;">管理通知栏预设</h3>' +
                '<div id="notif-css-manage-list" style="max-height:50vh;overflow:auto;"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button type="button" id="notif-css-manage-close" class="btn btn-primary">关闭</button></div>' +
                '</div>';
            document.body.appendChild(modal);
            modal.querySelector('#notif-css-manage-close').addEventListener('click', () => { modal.style.display = 'none'; });
            modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
        }
        const list = modal.querySelector('#notif-css-manage-list');
        const presets = getPresets();
        list.innerHTML = '';
        if (!presets.length) {
            list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
        }
        presets.forEach((p, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid #f0f0f0;';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = p.name;
            input.style.cssText = 'flex:1;min-width:0;padding:6px 8px;border:1px solid #e5e5e5;border-radius:8px;font-size:13px;';
            row.appendChild(input);

            const mkBtn = (label, handler) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn btn-small';
                b.style.cssText = 'padding:5px 8px;font-size:12px;margin:0;';
                b.textContent = label;
                b.addEventListener('click', handler);
                row.appendChild(b);
                return b;
            };

            mkBtn('加载', () => loadNotificationCssPreset(presets[idx].name));
            mkBtn('重命名', () => {
                const next = input.value.trim();
                if (!next) return showToast('名称不能为空');
                presets[idx].name = next;
                saveData();
                populateNotificationCssPresetSelect();
                openNotificationCssManageModal();
                showToast('已重命名');
            });

            const del = mkBtn('删除', () => {
                if (!del.dataset.armed) {
                    del.dataset.armed = '1';
                    del.textContent = '确认删除';
                    return;
                }
                presets.splice(idx, 1);
                db.notificationCssPresets = presets;
                saveData();
                populateNotificationCssPresetSelect();
                openNotificationCssManageModal();
                showToast('预设已删除');
            });

            list.appendChild(row);
        });
        modal.style.display = 'flex';
    }

    window.syncNotificationToastSkin = syncNotificationToastSkin;
    window.applyNotificationCss = applyNotificationCss;
    window.populateNotificationCssPresetSelect = populateNotificationCssPresetSelect;
    window.saveNotificationCssPreset = saveNotificationCssPreset;
    window.loadNotificationCssPreset = loadNotificationCssPreset;
    window.resetNotificationCss = resetNotificationCss;
    window.handleNotificationCssFile = handleNotificationCssFile;
    window.openNotificationCssManageModal = openNotificationCssManageModal;

    ensureBridge();
})();
