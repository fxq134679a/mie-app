/* ============================================================
   消息通知中心（notify）：后台/隐藏期间 TA 发来的消息 → 系统通知
   管道：全局开关 → 单聊免打扰 → 60 秒同聊天去重（新的盖旧的）→ 投递
   投递顺序（三路兜底，命中一路即止）：
     ① OctoNative.localNotify(...)   —— MIE-APP 原生壳本地通知
     ② Web Notification API          —— 浏览器/添加到主屏幕的网页
     ③ Bark                          —— 用户自配 Bark 推送 URL（App 被冻结前的窗口期也能到达手机）

   ▼▼ 桥契约（给 MIE-APP 原生壳实现用；壳实现后 JS 侧零改动生效） ▼▼
   window.OctoNative.localNotify({ title, body, chatId, group, sound })
     - title  : 通知标题（角色名 / 角色名 (N 条新消息)）
     - body   : 预览文本
     - chatId : 聊天 id，点通知可据此跳转对应聊天
     - group  : 去重分组（= chatId），壳侧应把同 group 的旧通知替换掉（新的盖旧的）
     - sound  : 通知铃声名（可选，壳侧放自己的 .caf 资源；缺省 'default'）
     返回 Promise<boolean> 或任意值；抛错/不存在则 JS 自动降级下一路
   ▲▲

   设置入口：设置 App（api-settings-screen）「消息通知」分组。
   单聊免打扰：各聊天右上角设置里的「消息免打扰」开关（存 char.muted）。
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'mieNotifySettings';
    const DEDUPE_MS = 60 * 1000; // 同聊天 60 秒内的后续消息合并进上一条通知

    function cfg() {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function saveCfg(patch) {
        const c = Object.assign(cfg(), patch || {});
        try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* 配额满时设置写不进就算了 */ }
        return c;
    }

    /* ---------- 文本清洗：把 AI 的各种包装标记剥成一条干净的预览 ---------- */
    function previewOf(text) {
        let t = String(text || '');
        t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
        t = t.replace(/\[.*?的消息[：:]([\s\S]*?)\]/g, '$1');
        t = t.replace(/\[hb:[^\]]*\]/g, '[红包]');
        t = t.replace(/\[(?:图片|照片|语音|视频|表情)[^\]]*\]/g, (m) => m.slice(1, -1));
        t = t.replace(/<[^>]+>/g, ' ');
        t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        t = t.replace(/\s+/g, ' ').trim();
        return t.slice(0, 80);
    }

    function chatName(chat, chatType) {
        if (chatType === 'group') {
            return (chat.name || chat.groupName || '群聊').trim();
        }
        return (chat.remarkName || chat.realName || chat.name || '新消息').trim();
    }

    /* 取该聊天最后一条 AI 消息做预览 */
    function lastAiText(chat) {
        const h = chat && Array.isArray(chat.history) ? chat.history : [];
        for (let i = h.length - 1; i >= 0; i--) {
            if (h[i] && h[i].role === 'assistant' && h[i].content) {
                let c = h[i].content;
                const g = c.match(/\[.*?的消息[：:]([\s\S]*?)\]/);
                if (g) c = g[1];
                return previewOf(c);
            }
        }
        return '';
    }

    /* ---------- 投递三路 ---------- */
    async function deliver(title, body, chatId, sound) {
        // ① 原生壳
        try {
            if (window.OctoNative && typeof window.OctoNative.localNotify === 'function') {
                await window.OctoNative.localNotify({ title, body, chatId: String(chatId || ''), group: String(chatId || ''), sound: sound || 'default' });
                return 'native';
            }
        } catch (e) { /* 落到下一路 */ }

        // ② Bark（用户自配；no-cors 防跨源报错。放在网页通知前面——
        //    WKWebView 里 requestPermission 可能永久挂起，不能让它挡住 Bark 的路）
        const c = cfg();
        if (c.barkUrl) {
            try {
                let base = String(c.barkUrl).trim().replace(/\/+$/, '');
                if (/^https?:\/\//.test(base)) {
                    const url = base + '/' + encodeURIComponent(title) + '/' + encodeURIComponent(body || ' ') + '?group=mie-' + encodeURIComponent(chatId || 'x');
                    fetch(url, { mode: 'no-cors' }).catch(() => {});
                    return 'bark';
                }
            } catch (e) { /* 落到下一路 */ }
        }

        // ③ Web Notification（requestPermission 加 1.2 秒超时竞速，防止挂起卡死整条链路）
        try {
            if (typeof window.Notification !== 'undefined') {
                let perm = window.Notification.permission;
                if (perm === 'default') {
                    perm = await Promise.race([
                        window.Notification.requestPermission().catch(() => 'denied'),
                        new Promise((resolve) => setTimeout(() => resolve('denied'), 1200))
                    ]);
                }
                if (perm === 'granted') {
                    const n = new window.Notification(title, { body, tag: 'mie-' + chatId });
                    n.onclick = () => { try { window.focus(); } catch (e) {} };
                    return 'web';
                }
            }
        } catch (e) { /* 放弃 */ }
        return 'none';
    }

    /* ---------- 去重状态 ---------- */
    const _last = {}; // chatId -> { title, body, count, at }

    /* ---------- 对外主入口：一条后台消息到达时调用 ---------- */
    async function message(chat, chatType) {
        if (!chat) return;
        const c = cfg();
        if (c.enabled === false) return;      // 全局总开关（默认开）
        if (chat.muted) return;               // 单聊免打扰

        const id = chat.id || chatName(chat, chatType);
        const now = Date.now();
        const prev = _last[id];

        let title, body, count = 1;
        if (prev && now - prev.at < DEDUPE_MS) {
            // 同聊天连发：新的盖旧的，标题带累计条数
            count = prev.count + 1;
            title = chatName(chat, chatType) + ' (' + count + ' 条新消息)';
            body = lastAiText(chat) || prev.body;
        } else {
            title = chatName(chat, chatType);
            body = lastAiText(chat);
        }
        if (!body) body = '发来了一条新消息';
        _last[id] = { title, body, count, at: now };

        await deliver(title, body, id, c.sound);
    }

    /* ---------- 测试投递：立刻给反馈，结果永远汇报 ---------- */
    async function runTest() {
        if (typeof showToast === 'function') showToast('正在发送测试通知…');
        const barkEl = document.getElementById('mie-notify-bark');
        if (barkEl) saveCfg({ barkUrl: barkEl.value.trim() }); // 点测试时顺手把地址存了
        let r = 'none';
        try { r = await deliver('MIE 通知测试', '如果你看到这条通知，说明通知链路通了 🎉', '_test'); } catch (e) { /* 通知失败不影响页面 */ }
        if (typeof showToast === 'function') {
            showToast(r === 'native' ? '测试通知已交原生壳投递'
                : r === 'bark' ? '已发往 Bark：请打开 Bark App 的「历史记录」查看是否收到'
                : r === 'web' ? '测试通知已弹（网页通知）'
                : '没有可用通道：请检查 Bark 地址（需 https:// 开头），或原生壳未实现通知');
        }
        return r;
    }

    /* ---------- 设置 UI：注入到设置 App ---------- */
    function injectSettingsUI() {
        const screen = document.getElementById('api-settings-screen');
        if (!screen) return;
        const container = screen.querySelector('.kkt-settings-container');
        if (!container || document.getElementById('mie-notify-group')) return;

        const c = cfg();
        const group = document.createElement('div');
        group.className = 'kkt-group';
        group.id = 'mie-notify-group';
        group.innerHTML =
            '<div class="kkt-item">'
            + '<div class="kkt-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>'
            + '<div class="kkt-item-content">'
            + '<div class="kkt-item-title">后台消息通知</div>'
            + '<div class="kkt-item-sub">切到后台后 TA 发来消息时弹系统通知（需要原生壳支持或配置 Bark）</div>'
            + '</div>'
            + '<div class="kkt-item-control"><label class="kkt-switch"><input type="checkbox" id="mie-notify-enabled"><span class="kkt-slider"></span></label></div>'
            + '</div>'
            + '<div class="kkt-item">'
            + '<div class="kkt-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>'
            + '<div class="kkt-item-content">'
            + '<div class="kkt-item-title">Bark 推送（兜底）</div>'
            + '<div class="kkt-item-sub">Key 就是 Bark App 首页复制的地址里的那一串：打开 Bark → 复制 https://api.day.app/XXXXXX 整段粘贴到这里即可。装了 Bark 的 iPhone 即使 App 被冻结也能收到推送</div>'
            + '</div>'
            + '</div>'
            + '<div class="kkt-item" style="padding-top:0;">'
            + '<div class="kkt-item-content" style="flex:1;">'
            + '<input type="url" id="mie-notify-bark" placeholder="https://api.day.app/你的Key" style="width:100%;border:1px solid #eee;border-radius:10px;padding:9px 12px;font-size:13px;">'
            + '</div>'
            + '<div class="kkt-item-control"><button type="button" id="mie-notify-test" class="btn btn-primary" style="width:auto;padding:7px 14px;border-radius:16px;font-size:12px;white-space:nowrap;">测试</button></div>'
            + '</div>'
            + '<div class="kkt-item">'
            + '<div class="kkt-item-content">'
            + '<div class="kkt-item-sub">· 单聊免打扰：在该聊天右上角设置里开「消息免打扰」<br>· 同一聊天 60 秒内连发多条会合并成一条（新的盖旧的，不刷屏）<br>· 同聊天通知 60 秒后重新计时</div>'
            + '</div>'
            + '</div>';
        container.appendChild(group);

        const enabledEl = group.querySelector('#mie-notify-enabled');
        const barkEl = group.querySelector('#mie-notify-bark');
        const testBtn = group.querySelector('#mie-notify-test');

        const syncUI = () => {
            const cc = cfg();
            if (enabledEl) enabledEl.checked = cc.enabled !== false;
            if (barkEl) barkEl.value = cc.barkUrl || '';
        };
        syncUI();

        if (enabledEl) {
            enabledEl.addEventListener('change', () => {
                window.__mieNotifyEnabledAt = Date.now();
                saveCfg({ enabled: enabledEl.checked });
                if (typeof showToast === 'function') showToast(enabledEl.checked ? '后台消息通知已开启' : '后台消息通知已关闭');
            });
        }
        if (barkEl) {
            barkEl.addEventListener('change', () => {
                window.__mieNotifyBarkAt = Date.now();
                saveCfg({ barkUrl: barkEl.value.trim() });
                if (typeof showToast === 'function') showToast(barkEl.value.trim() ? 'Bark 推送地址已保存' : 'Bark 推送已清空');
            });
        }
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                window.__mieNotifyTestAt = Date.now();
                runTest();
            });
        }
    }

    /* 设置 App 打开时同步一次 UI 值 */
    function watchScreen() {
        const screen = document.getElementById('api-settings-screen');
        if (!screen || !window.MutationObserver) return;
        new MutationObserver(() => {
            if (screen.classList.contains('active')) {
                if (!document.getElementById('mie-notify-group')) injectSettingsUI();
                const enabledEl = document.getElementById('mie-notify-enabled');
                const barkEl = document.getElementById('mie-notify-bark');
                const c = cfg();
                if (enabledEl) enabledEl.checked = c.enabled !== false;
                if (barkEl) barkEl.value = c.barkUrl || '';
            }
        }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    function boot() {
        injectSettingsUI();
        watchScreen();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* ---------- iOS 兜底：启动期直绑失效时，委托接管（同 Heartbeat 配方） ----------
       直绑路径先写 __mieNotify*At 时间戳，兜底见到新鲜戳就闭嘴，双路不会双触发。 */
    function freshAt(marker, ms) { return (Date.now() - (window[marker] || 0)) < (ms || 500); }
    document.addEventListener('click', function (ev) {
        if (!ev.target || !ev.target.closest) return;
        if (!ev.target.closest('#mie-notify-test')) return;
        if (freshAt('__mieNotifyTestAt')) return;
        runTest();
    });
    document.addEventListener('change', function (ev) {
        const el = ev.target;
        if (!el) return;
        if (el.id === 'mie-notify-bark' && !freshAt('__mieNotifyBarkAt')) {
            saveCfg({ barkUrl: el.value.trim() });
        } else if (el.id === 'mie-notify-enabled' && !freshAt('__mieNotifyEnabledAt')) {
            saveCfg({ enabled: el.checked });
        }
    });

    window.MieNotify = {
        message,
        test: () => deliver('MIE 通知测试', '如果你看到这条通知，说明通知链路通了 🎉', '_test'),
        previewOf,
        cfg,
        saveCfg
    };
})();
