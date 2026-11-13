// 角色专属温度：把 clawd-thinking 思考滑块当作聊天温度控制
// 组件版权：Copyright (c) 2026 FeiFei (@nextoneforeal)，PolyForm Noncommercial 1.0.0
(function () {
    const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
    const LEVEL_TEMPS = { low: 0.2, medium: 0.6, high: 1.0, xhigh: 1.5, max: 2.0 };
    const SOUND_KEY = 'mie-clawd-temp-sound';
    let control = null;
    let mountToken = 0;

    const globalTemp = () => {
        const s = (typeof db !== 'undefined' && db.apiSettings) || {};
        return (s.temperatureEnabled !== false && Number.isFinite(Number(s.temperature)))
            ? Number(s.temperature) : 1.0;
    };

    const levelForTemp = (t) => {
        let best = 'high', dist = Infinity;
        for (const id of LEVELS) {
            const d = Math.abs(LEVEL_TEMPS[id] - Number(t));
            if (d < dist) { dist = d; best = id; }
        }
        return best;
    };

    const currentChar = () => {
        let id = null;
        try { id = currentChatId; } catch (e) { id = window.currentChatId; }
        if (!id || typeof db === 'undefined' || !db.characters) return null;
        return db.characters.find(c => c.id === id) || null;
    };

    function paintStatus() {
        const badge = document.getElementById('char-temp-badge');
        const globalEl = document.getElementById('char-temp-global');
        if (globalEl) globalEl.textContent = globalTemp().toFixed(1);
        if (!badge) return;
        const c = currentChar();
        if (c && c.charTempEnabled && Number.isFinite(Number(c.charTemperature))) {
            badge.textContent = '专属 ' + Number(c.charTemperature).toFixed(1);
            badge.style.color = 'var(--primary-color)';
        } else {
            badge.textContent = '跟随全局';
            badge.style.color = '#999';
        }
    }

    async function persist(next) {
        const c = currentChar();
        if (!c) return;
        if (next === 'auto') {
            c.charTempEnabled = false;
        } else if (LEVEL_TEMPS[next] !== undefined) {
            c.charTempEnabled = true;
            c.charTemperature = LEVEL_TEMPS[next];
        }
        if (typeof saveData === 'function') await saveData();
        paintStatus();
    }

    function release() {
        mountToken++;
        if (control) {
            try { control.destroy(); } catch (e) { /* 忽略销毁异常 */ }
            control = null;
        }
        const el = document.getElementById('char-temp-clawd');
        if (el) el.innerHTML = '';
    }

    async function mount() {
        const screen = document.getElementById('chat-settings-screen');
        const tab = document.getElementById('setting-tab-exclusive');
        const section = document.getElementById('setting-exclusive-reply');
        if (!screen?.classList.contains('active') || !tab?.classList.contains('active') || !section?.open) {
            release();
            return;
        }
        const el = document.getElementById('char-temp-clawd');
        if (!el) return;
        const c = currentChar();
        if (!c) return;
        const token = ++mountToken;
        if (control) {
            try { control.destroy(); } catch (e) { /* 忽略销毁异常 */ }
            control = null;
        }
        el.innerHTML = '';
        paintStatus();
        // file://（iOS WKWebView IPA）下动态 import() 被禁，改用 classic script 标签加载 classic 版
        try {
            await new Promise((resolve, reject) => {
                if (window.ClawdThinking) return resolve();
                const sc = document.createElement('script');
                sc.src = 'js/lib/clawd-thinking/src/clawd-thinking.classic.js?v=20261113a';
                sc.onload = () => window.ClawdThinking ? resolve() : reject(new Error('组件未就绪'));
                sc.onerror = () => { sc.remove(); reject(new Error('脚本加载失败')); };
                document.head.appendChild(sc);
            });
        } catch (e) {
            console.warn('[专属温度] 组件加载失败', e);
            el.innerHTML = '<p style="font-size:12px;color:#c66;padding:6px 0;">滑块组件加载失败，请刷新页面重试</p>';
            return;
        }
        if (token !== mountToken) return;
        const enabled = !!(c.charTempEnabled && Number.isFinite(Number(c.charTemperature)));
        const value = enabled ? levelForTemp(c.charTemperature) : 'auto';
        control = window.ClawdThinking.createClawdThinking(el, {
            levels: LEVELS,
            value,
            theme: 'auto',
            sound: true,
            storageKey: SOUND_KEY,
            recommended: levelForTemp(globalTemp()),
            onChange: (next) => persist(next)
        });
        paintStatus();
    }

    window.ClawdTemp = {
        mount,
        release,
        paintStatus,
        levelForTemp,
        LEVEL_TEMPS,
        getState: () => control ? {
            value: control.value,
            temp: control.value === 'auto' ? null : LEVEL_TEMPS[control.value]
        } : null
    };
})();
