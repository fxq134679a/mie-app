/* ============================================================
   settings_background.js — 设置 App「后台与保活」折叠组
   组成（index.html 的 data-collapse-key="background" 折叠组）：
     · 后台保活：总开关 + 保活方式（振荡器/静音音频/两者都开/画中画）
     · 消息通知：后台消息通知开关 + Bark 推送（由 notify.js 注入）
   依赖：keep_alive.js（KeepAliveManager）、notify.js（MieNotify）
   ============================================================ */
(function () {
    'use strict';

    const PIP_SUPPORTED = typeof HTMLVideoElement !== 'undefined'
        && 'requestPictureInPicture' in HTMLVideoElement.prototype;

    const MODE_TIPS = {
        osc: '振荡器：网页自己凭空发声，完全静音、不冒锁屏播放器；但部分机型后台会被系统收回。',
        audio: '静音音频循环：循环播放一段听不见的声音，切后台/锁屏更可靠；通知栏会挂一个播放器。',
        both: '两者都开（最稳）：振荡器和静音音频同时跑，最不易被系统掐掉，略耗电。',
        pip: '画中画（不占音频）：靠系统小窗保活，听歌、刷视频都不受影响；需要点「进入画中画」把小窗带出来，关掉小窗即退出。'
    };

    function modeButtons() {
        return Array.prototype.slice.call(document.querySelectorAll('.ka-mode-btn'));
    }

    function currentMode() {
        return (window.KeepAliveManager && typeof window.KeepAliveManager.getMode === 'function')
            ? window.KeepAliveManager.getMode()
            : 'audio';
    }

    function syncButtons() {
        const mode = currentMode();
        modeButtons().forEach(btn => {
            btn.classList.toggle('active', btn.dataset.kaMode === mode);
        });
        const tip = document.getElementById('ka-mode-tip');
        if (tip && MODE_TIPS[mode]) tip.textContent = MODE_TIPS[mode];

        const pipBtn = document.getElementById('ka-pip-enter');
        if (pipBtn) {
            const show = mode === 'pip' && PIP_SUPPORTED;
            pipBtn.style.display = show ? '' : 'none';
        }
    }

    function refreshStatus() {
        const el = document.getElementById('keep-alive-status');
        if (!el || el.dataset.state === 'off') return;
        const st = window.KeepAliveManager && window.KeepAliveManager.isRunning
            ? window.KeepAliveManager.isRunning()
            : null;
        if (!st) return;
        if (!st.any && st.enabled) {
            // 开关是开的但通道全没了：提示点一下页面恢复
            el.textContent = '通道被系统暂停，点一下页面即可恢复';
            el.dataset.state = 'waiting';
        }
    }

    function bind() {
        modeButtons().forEach(btn => {
            if (btn.__kaBound) return;
            btn.__kaBound = true;
            btn.addEventListener('click', async () => {
                const mode = btn.dataset.kaMode;
                const Kam = window.KeepAliveManager;
                if (!Kam || typeof Kam.setMode !== 'function') return;
                const ok = await Kam.setMode(mode, { userInitiated: true });
                syncButtons();
                if (typeof showToast === 'function') {
                    const names = { osc: '振荡器', audio: '静音音频循环', both: '两者都开', pip: '画中画' };
                    showToast(ok ? ('保活方式已切换：' + names[mode]) : '切换失败');
                }
            });
        });

        const pipBtn = document.getElementById('ka-pip-enter');
        if (pipBtn && !pipBtn.__kaBound) {
            pipBtn.__kaBound = true;
            // 必须在用户点击手势内同步调用，否则系统会拒绝进小窗
            pipBtn.addEventListener('click', () => {
                const Kam = window.KeepAliveManager;
                if (!Kam || typeof Kam.enterPip !== 'function') return;
                Kam.enterPip();
                if (typeof showToast === 'function') showToast('已请求进入画中画，若没弹出请再点一次');
            });
        }

        const sw = document.getElementById('keep-alive-switch');
        if (sw && !sw.__kaBound) {
            sw.__kaBound = true;
            sw.addEventListener('change', () => {
                setTimeout(syncButtons, 50);   // 开关打开后通道起没起，稍后刷新一次
                setTimeout(refreshStatus, 600);
            });
        }

        window.addEventListener('uwu:keepalive-mode', syncButtons);
        document.addEventListener('visibilitychange', () => setTimeout(refreshStatus, 400));

        // 折叠组每次展开时同步一次按钮与状态
        const group = document.querySelector('.kkt-collapsible[data-collapse-key="background"]');
        if (group && !group.__kaBound) {
            group.__kaBound = true;
            new MutationObserver(() => {
                if (!group.classList.contains('collapsed')) {
                    syncButtons();
                    refreshStatus();
                }
            }).observe(group, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function mountNotify() {
        const host = document.getElementById('mie-notify-host');
        if (!host) return;
        // 让 notify.js 的 boot 把通知设置注入到折叠组里
        window.__mieNotifyUIHost = host;
        if (window.MieNotify && typeof window.MieNotify.injectSettingsUI === 'function') {
            window.MieNotify.injectSettingsUI(host);
        }
    }

    function boot() {
        bind();
        mountNotify();
        syncButtons();
        refreshStatus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
