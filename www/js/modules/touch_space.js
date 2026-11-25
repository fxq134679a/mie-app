// ==================== 触感空间 · MIE 接入（C 模式聊天页） ====================
// 来源触摸层：github.com/sibylsea-hub/touch-space（translate.js + touch-surface.js，PolyForm 非商业许可）
// 本文件是宿主胶水：入口按钮、全屏触摸层、两种发送模式、待发送徽章、iOS 原生震动桥补丁。
// 约定：译文 <touch …>…</touch> 排在用户文字前面，走 B 的 sendMessage 原链路发送。
(function () {
    'use strict';

    const LS_KEY = 'uwu_touch';
    const MAP_LABEL = { screen: '屏幕', body: '上半身', lower: '下半身' };
    const EFFECT_LABEL = { ripple: '水纹', skin: '皮肤' };

    function load() {
        try { return Object.assign({ map: 'body', effect: 'skin', realtime: false }, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }
        catch (e) { return { map: 'body', effect: 'skin', realtime: false }; }
    }
    function save(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
    function cfg() { return load(); }

    /* ---- iOS 原生震动桥： Capacitor TouchBridge 存在时给 navigator.vibrate 打补丁，
            touch-surface 的 buzz() 无需改动就能在 WKWebView 里震（网页震动 iOS 原生不支持） ---- */
    function hapticsPatch() {
        try {
            const C = window.Capacitor;
            /* 有原生触感桥就强制接管（iOS WKWebView 没有原生 vibrate；桌面 Chrome 有但是 no-op） */
            if (C && C.Plugins && C.Plugins.TouchBridge) {
                navigator.vibrate = function (pattern) {
                    const ms = Array.isArray(pattern) ? pattern[0] : pattern;
                    try { C.Plugins.TouchBridge.vibrate({ duration: Number(ms) || 10 }); } catch (e) {}
                    return true;
                };
            }
        } catch (e) {}
    }

    /* ---- 全局状态 ---- */
    let surface = null, layerEl = null, pendingText = null, waiting = [], pollTimer = null;

    function generating() {
        try { return typeof isGenerating !== 'undefined' && !!isGenerating; } catch (e) { return false; }
    }

    /* ---- 发送 ---- */
    function sendTouchOnly(text) {
        if (typeof window.sendMessage !== 'function' || typeof messageInput === 'undefined') {
            if (typeof showToast === 'function') showToast('当前界面不能发送触摸');
            return false;
        }
        /* B 模式里 messageInput 就是用户正在打字的框：临时换成触摸译文发出去，
           发完再把草稿还回去，别把已经打了一半的字吞掉 */
        const draft = messageInput.value;
        messageInput.value = text;
        try { window.sendMessage(); } catch (e) { console.error('[TouchSpace]', e); return false; }
        if (draft && !messageInput.value) {
            messageInput.value = draft;
            try { messageInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
        return true;
    }
    function autoSend(text) {
        if (generating()) { waiting.push(text); startPoll(); return; }
        sendTouchOnly(text);
    }
    /* 模型回复结束后把攒着的触摸一次性补发（不会打断它说话） */
    function startPoll() {
        if (pollTimer) return;
        pollTimer = setInterval(() => {
            if (generating()) return;
            clearInterval(pollTimer); pollTimer = null;
            if (!waiting.length) return;
            const text = waiting.splice(0).join('\n\n');
            sendTouchOnly(text);
        }, 700);
    }

    /* ---- 待发送徽章（手动模式：攒着的触摸挂在输入栏上方，随下一条消息一起发） ---- */
    function strokesOf(text) {
        const m = String(text || '').match(/<touch\s+strokes="(\d+)"/);
        return m ? +m[1] : 0;
    }
    function updateBadge() {
        const el = document.getElementById('ts-pending');
        if (!el) return;
        if (pendingText) {
            el.style.display = 'flex';
            const n = strokesOf(pendingText);
            el.innerHTML = '<span class="ts-p-txt">👆 已记录' + (n ? ' ' + n + ' 笔' : '') + '，随下一条消息一起发</span>' +
                '<button type="button" id="ts-pending-x">×</button>';
        } else {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    }

    /* ---- 取走攒着的触摸（cSend 发送时调用；译文排正文前面，同一批只发一次） ---- */
    function takeForSending() {
        if (surface && cfg().realtime) return null;   // 实时模式走 onBatch 自动发，不走这里
        let t = pendingText; pendingText = null;
        if (surface) { const s = surface.flush(); if (s) t = t ? t + '\n\n' + s : s; }
        updateBadge();
        return t || null;
    }

    /* ---- 悬浮层 ---- */
    /* 触摸层挂到当前模式的聊天页里：C = 微信页，A = Claude 风外壳，B = 原生聊天页 */
    function hostEl() {
        const body = document.body;
        if (body.classList.contains('c-mode')) return document.getElementById('c-cv');
        if (body.classList.contains('a-mode')) return document.getElementById('a-app');
        return document.querySelector('.phone-screen') || document.getElementById('chat-room-screen');
    }
    function ensureLayer() {
        const page = hostEl();
        if (!page) return null;
        if (layerEl && layerEl.isConnected && layerEl.parentElement === page) return layerEl;
        if (layerEl && layerEl.parentNode) layerEl.parentNode.removeChild(layerEl);
        layerEl = document.createElement('div');
        layerEl.id = 'ts-layer';
        layerEl.innerHTML =
            '<canvas id="ts-canvas"></canvas>' +
            '<div id="ts-top">' +
                '<button type="button" class="ts-tb" data-ts="effect"></button>' +
                '<button type="button" class="ts-tb" data-ts="map"></button>' +
                '<button type="button" class="ts-tb" data-ts="real"></button>' +
                '<button type="button" class="ts-tb ts-ok" data-ts="ok">✓ 发送</button>' +
                '<button type="button" class="ts-tb ts-x" data-ts="close">✕</button>' +
            '</div>';
        page.appendChild(layerEl);
        /* 待发送徽章挂在输入栏上方 */
        const c = document.createElement('div');
        c.id = 'ts-pending';
        c.style.display = 'none';
        page.appendChild(c);
        return layerEl;
    }
    function refreshTop() {
        const c = cfg();
        const btns = layerEl && layerEl.querySelectorAll('[data-ts]');
        if (!btns) return;
        btns.forEach(b => {
            const k = b.getAttribute('data-ts');
            if (k === 'effect') b.textContent = EFFECT_LABEL[c.effect] || '水纹';
            else if (k === 'map') b.textContent = MAP_LABEL[c.map] || '屏幕';
            else if (k === 'real') b.textContent = c.realtime ? '实时·开' : '实时·关';
            else if (k === 'ok') b.style.display = c.realtime ? 'none' : '';
        });
    }
    function open() {
        hapticsPatch();
        if (typeof window.TouchTranslate === 'undefined' || typeof window.TouchSurface === 'undefined') return;
        const layer = ensureLayer();
        if (!layer) return;
        layerEl.style.display = 'block';
        const c = cfg();
        /* 发送模式（pause）变了必须重建触摸面——包括绕过 UI 直接改配置的情况 */
        if (surface && surface.__rt !== c.realtime) { surface.destroy(); surface = null; }
        if (!surface) {
            surface = window.TouchSurface.create(document.getElementById('ts-canvas'), {
                effect: c.effect, map: c.map,
                pause: c.realtime ? 2000 : null,
                onBatch(text) {
                    if (cfg().realtime) autoSend(text);
                    /* 手动模式：flush() 的返回值由 takeForSending 消费，这里不重复发 */
                },
                onStart() {}
            });
            surface.__rt = c.realtime;
        } else {
            surface.setEffect(c.effect); surface.setMap(c.map);
        }
        refreshTop();
    }
    function close() {
        if (layerEl) layerEl.style.display = 'none';
    }

    /* ---- 气泡里的触摸徽章：点击展开/收起译文 ---- */
    function toggleDetail(chip) {
        const bub = chip.parentElement;
        let d = bub.querySelector('.ts-detail');
        if (d) { d.remove(); return; }
        d = document.createElement('div');
        d.className = 'ts-detail';
        d.textContent = chip.getAttribute('data-ts-detail') || '';
        bub.appendChild(d);
    }

    /* ---- 事件委托 ---- */
    document.addEventListener('click', (ev) => {
        const t = ev.target;
        /* 入口在功能栏里（B 原生 / A 外壳 / C 微信三种模式共用同一个加号面板按钮） */
        const entry = t.closest && t.closest('#touch-space-btn');
        if (entry) {
            ev.preventDefault();
            if (typeof showPanel === 'function') showPanel('none');
            layerEl && layerEl.style.display === 'block' ? close() : open();
            return;
        }
        const tb = t.closest && t.closest('[data-ts]');
        if (tb && layerEl && layerEl.contains(tb)) {
            const k = tb.getAttribute('data-ts'), c = cfg();
            if (k === 'effect') c.effect = c.effect === 'ripple' ? 'skin' : 'ripple';
            else if (k === 'map') c.map = c.map === 'screen' ? 'body' : c.map === 'body' ? 'lower' : 'screen';
            else if (k === 'real') {
                c.realtime = !c.realtime;
                if (surface) surface.destroy(), surface = null;   // pause 模式变了，重建触摸面
            }
            else if (k === 'ok') {
                /* 确认：这批触摸放进待发送徽章（原版交互），之后可直接按发送键发出（纯触摸也可） */
                const s = surface ? surface.flush() : null;
                const all = s ? (pendingText ? pendingText + '\n\n' + s : s) : pendingText;
                pendingText = all || null;
                updateBadge();
                console.log('[TS] ok: strokes=' + (surface ? surface.count() : 0) + ' pending=' + (all ? all.length : 0));
                if (!all && typeof showToast === 'function') showToast('还没有记录到触摸');
                else close();
            }
            else if (k === 'close') { close(); return; }
            save(c);
            if (surface) { surface.setEffect(c.effect); surface.setMap(c.map); }
            if (k === 'real') { if (layerEl && layerEl.style.display === 'block') open(); else refreshTop(); }
            else refreshTop();
            return;
        }
        if (t.id === 'ts-pending-x') { pendingText = null; updateBadge(); return; }
        const chip = t.closest && t.closest('.ts-chip');
        if (chip) { toggleDetail(chip); return; }
    }, true);

    /* ---- 导出 ---- */
    window.TouchSpaceMIE = {
        takeForSending,
        hasPending() { return !!pendingText || !!(surface && !cfg().realtime); },
        /* 是否真的有东西可发：确认过待发的译文，或触摸面上还攒着笔画 */
        hasTouch() { return !!pendingText || !!(surface && surface.count && surface.count() > 0); },
        setPending(text) { pendingText = text; updateBadge(); },
        open, close,
        fold(text) {
            const m = String(text || '').match(/^\s*<touch\s+strokes="(\d+)"\s+span="([\d.]+)s">([\s\S]*?)<\/touch>\s*([\s\S]*)$/);
            return m ? { strokes: +m[1], span: m[2], detail: m[3].trim(), rest: m[4] } : null;
        }
    };
})();
