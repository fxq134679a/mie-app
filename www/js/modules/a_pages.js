// --- A 模式独立设置页：开屏语 / API 设置（js/modules/a_pages.js） ---
// window.ASplashSet.open() → A 风格开屏语页（头像+天数+开屏语预览，按角色编辑）
// window.AApiSet.open()    → API 设置页（预设管理 + 每个角色的专属模型分配）
(function () {
    'use strict';

    const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function chatOf(id) {
        try {
            return (db.characters || []).find(c => c.id === id) || (db.groups || []).find(g => g.id === id) || null;
        } catch (e) { return null; }
    }
    function allChats() {
        try { return [...(db.characters || []), ...(db.groups || [])]; } catch (e) { return []; }
    }
    function toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) { /* ignore */ } }
    async function persist() { try { if (typeof saveData === 'function') await saveData(); } catch (e) { /* ignore */ } }

    // 通用浮层壳：返回箭头 + 标题 + 滚动主体
    function shell(id, title) {
        let root = document.getElementById(id);
        if (root) root.remove();
        root = document.createElement('div');
        root.id = id;
        root.innerHTML =
            '<div class="ap-page">' +
            '<header class="ap-head">' +
            '<button class="ap-back">' + ARROW + '</button>' +
            '<div class="ap-title">' + esc(title) + '</div>' +
            '<span class="ap-head-gap"></span>' +
            '</header>' +
            '<div class="ap-body"></div>' +
            '</div>';
        document.body.appendChild(root);
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
        root.querySelector('.ap-back').addEventListener('click', () => closeShell(root));
        return root;
    }
    function closeShell(root) {
        root.classList.remove('in');
        setTimeout(() => root.remove(), 320);
    }

    // ==================== 开屏天数 / 头像 / 语录（与 a_mode 开屏同逻辑） ====================
    function splashDaysOf(chat) {
        try {
            let ts = 0;
            if (chat) {
                if (chat.friendSince) ts = Number(chat.friendSince) || 0;
                if (!ts) {
                    const m = String(chat.id || '').match(/^char_(\d+)$/);
                    if (m) ts = Number(m[1]) || 0;
                }
                if (!ts && chat.createdAt) ts = Number(chat.createdAt) || 0;
            }
            if (!ts) {
                const h = chat && (chat.history || []);
                let oldest = Infinity;
                for (const m of h) {
                    const t = Number(m.timestamp || m.time || 0);
                    if (t > 0 && t < oldest) oldest = t;
                }
                if (isFinite(oldest) && oldest > 0) ts = oldest;
            }
            if (!ts) return '';
            const days = Math.max(1, Math.floor((Date.now() - ts) / 86400000) + 1);
            return '在一起第 ' + days + ' 天';
        } catch (e) { return ''; }
    }
    function globalQuotes() {
        let quotes = null;
        try {
            const c = JSON.parse(localStorage.getItem('mie_splash_config_v1') || '{}');
            if (Array.isArray(c.quotes)) quotes = c.quotes.filter(q => typeof q === 'string' && q.trim());
        } catch (e) { /* ignore */ }
        if ((!quotes || !quotes.length) && window.MistSplashDefaults && Array.isArray(window.MistSplashDefaults.quotes)) {
            quotes = window.MistSplashDefaults.quotes.filter(q => typeof q === 'string' && q.trim());
        }
        if (!quotes || !quotes.length) quotes = ['想我了吗？'];
        return quotes;
    }
    function quoteOf(chat) {
        if (chat && typeof chat.splashQuote === 'string' && chat.splashQuote.trim()) return chat.splashQuote.trim();
        const qs = globalQuotes();
        return qs[Math.floor(Math.random() * qs.length)];
    }
    function avatarUrl(chat, mine) {
        if (!chat) return '';
        return mine ? (chat.myAvatar || '') : (chat.avatar || (chat.members && chat.members[0] && chat.members[0].avatar) || '');
    }

    // ==================== 开屏语页 ====================
    let ssChatId = null;
    function openSplashSet() {
        const chats = allChats();
        if (!ssChatId || !chats.some(c => c.id === ssChatId)) {
            try { ssChatId = (typeof AMode !== 'undefined' && AMode.currentChatId) ? AMode.currentChatId : null; } catch (e) { /* ignore */ }
            if (!ssChatId || !chats.some(c => c.id === ssChatId)) ssChatId = chats.length ? chats[0].id : null;
        }
        const root = shell('a-splashset', '开屏语');
        const body = root.querySelector('.ap-body');
        body.innerHTML =
            '<div class="ss-chips" id="ss-chips"></div>' +
            '<div class="ss-preview">' +
            '<div class="sp-faces">' +
            '<div class="sp-face her"><span>他</span></div>' +
            '<div class="sp-face me"><span>我</span></div>' +
            '</div>' +
            '<div class="sp-hello" id="ss-hello"></div>' +
            '<div class="sp-days" id="ss-days"></div>' +
            '</div>' +
            '<div class="ap-card">' +
            '<div class="ap-label">这位角色的开屏语</div>' +
            '<textarea id="ss-quote" rows="3" placeholder="留空 = 每次从下面的随机语录里抽一句"></textarea>' +
            '<div class="ap-btnrow">' +
            '<button class="ap-btn ghost" id="ss-clear">用随机</button>' +
            '<button class="ap-btn" id="ss-save">保存</button>' +
            '</div>' +
            '</div>' +
            '<div class="ap-card">' +
            '<div class="ap-label">全局随机语录（一行一句）</div>' +
            '<textarea id="ss-global" rows="5"></textarea>' +
            '<div class="ap-btnrow"><button class="ap-btn" id="ss-gsave">保存语录库</button></div>' +
            '</div>';

        // 角色选择 chips
        const chips = body.querySelector('#ss-chips');
        chips.innerHTML = chats.map(c => {
            const url = avatarUrl(c, false);
            const inner = url
                ? '<img src="' + esc(url) + '" alt="">'
                : '<span>' + esc((c.name || '?').slice(0, 1)) + '</span>';
            return '<button class="ss-chip" data-id="' + esc(c.id) + '">' +
                '<span class="ss-chip-face' + (url ? ' has' : '') + '">' + inner + '</span>' +
                '<span class="ss-chip-name">' + esc(c.name || '未命名') + '</span></button>';
        }).join('') || '<div class="ap-empty">还没有角色，先去加一个好友吧</div>';
        chips.addEventListener('click', (e) => {
            const chip = e.target.closest('.ss-chip');
            if (!chip) return;
            ssChatId = chip.dataset.id;
            paint();
        });

        // 全局语录库初值
        body.querySelector('#ss-global').value = globalQuotes().join('\n');
        body.querySelector('#ss-gsave').addEventListener('click', async () => {
            const lines = body.querySelector('#ss-global').value.split('\n').map(s => s.trim()).filter(Boolean);
            try {
                localStorage.setItem('mie_splash_config_v1', JSON.stringify({ quotes: lines }));
                toast('语录库已保存（' + lines.length + ' 句）');
                paint();
            } catch (e) { toast('保存失败'); }
        });

        // 专属开屏语
        body.querySelector('#ss-save').addEventListener('click', async () => {
            const chat = chatOf(ssChatId);
            if (!chat) return;
            const v = body.querySelector('#ss-quote').value.trim();
            if (v) chat.splashQuote = v; else delete chat.splashQuote;
            await persist();
            toast(v ? '开屏语已保存' : '已清除，回到随机语录');
            paint();
        });
        body.querySelector('#ss-clear').addEventListener('click', async () => {
            const chat = chatOf(ssChatId);
            if (!chat) return;
            delete chat.splashQuote;
            body.querySelector('#ss-quote').value = '';
            await persist();
            toast('已清除，回到随机语录');
            paint();
        });
        body.querySelector('#ss-quote').addEventListener('input', () => {
            const chat = chatOf(ssChatId);
            const v = body.querySelector('#ss-quote').value.trim();
            document.getElementById('ss-hello').textContent = v || quoteOf(chat);
        });

        function paint() {
            chips.querySelectorAll('.ss-chip').forEach(ch => ch.classList.toggle('on', ch.dataset.id === ssChatId));
            const chat = chatOf(ssChatId);
            [[body.querySelector('.sp-face.her'), avatarUrl(chat, false), '他'],
             [body.querySelector('.sp-face.me'), avatarUrl(chat, true), '我']].forEach(([el, url, fb]) => {
                if (!el) return;
                if (url) { el.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")'; el.classList.add('has'); }
                else { el.style.backgroundImage = ''; el.classList.remove('has'); el.querySelector('span').textContent = fb; }
            });
            body.querySelector('#ss-hello').textContent = quoteOf(chat);
            body.querySelector('#ss-days').textContent = splashDaysOf(chat);
            body.querySelector('#ss-quote').value = (chat && typeof chat.splashQuote === 'string') ? chat.splashQuote : '';
        }
        paint();
    }

    // ==================== API 设置页 ====================
    const PROVIDERS = [['newapi', 'OpenAI 兼容 (newapi)'], ['gemini', 'Google Gemini']];
    function openApiSet() {
        const root = shell('a-apiset', 'API 设置');
        const body = root.querySelector('.ap-body');
        let editingId = null;   // 正在编辑的预设 id（null=列表态）

        function presetRow(p) {
            const d = p.data || {};
            return '<div class="ap-row" data-id="' + esc(p.id) + '">' +
                '<div class="ap-row-main">' +
                '<div class="ap-row-title">' + esc(p.name || '未命名') + '</div>' +
                '<div class="ap-row-sub">' + esc(d.model || '未设模型') + ' · ' + esc((d.apiUrl || '').replace(/^https?:\/\//, '').slice(0, 32) || '未设地址') + '</div>' +
                '</div>' +
                '<button class="ap-mini" data-act="edit">编辑</button>' +
                '<button class="ap-mini danger" data-act="del">删除</button>' +
                '</div>';
        }
        function presetForm(p) {
            const d = (p && p.data) || {};
            return '<div class="ap-card" id="ap-preset-form">' +
                '<div class="ap-label">预设名称</div>' +
                '<input id="apf-name" type="text" value="' + esc(p ? p.name : '') + '" placeholder="比如：小克专属">' +
                '<div class="ap-label">接口类型</div>' +
                '<select id="apf-provider">' + PROVIDERS.map(([v, t]) => '<option value="' + v + '"' + ((d.provider || 'newapi') === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
                '<div class="ap-label">API 地址</div>' +
                '<input id="apf-url" type="text" value="' + esc(d.apiUrl || '') + '" placeholder="https://api.example.com/v1">' +
                '<div class="ap-label">API Key</div>' +
                '<input id="apf-key" type="password" value="' + esc(d.apiKey || '') + '" placeholder="sk-...">' +
                '<div class="ap-label">模型</div>' +
                '<input id="apf-model" type="text" value="' + esc(d.model || '') + '" placeholder="gpt-4o / gemini-2.0-flash ...">' +
                '<div class="ap-btnrow">' +
                '<button class="ap-btn ghost" id="apf-cancel">取消</button>' +
                '<button class="ap-btn" id="apf-save">保存预设</button>' +
                '</div></div>';
        }

        function paintPresets() {
            const wrap = body.querySelector('#ap-presets');
            const presets = db.apiPresets || [];
            if (editingId !== null) {
                const p = presets.find(x => x.id === editingId);
                wrap.innerHTML = presetForm(editingId === '__new' ? null : p);
                wrap.querySelector('#apf-cancel').addEventListener('click', () => { editingId = null; paintPresets(); });
                wrap.querySelector('#apf-save').addEventListener('click', async () => {
                    const name = wrap.querySelector('#apf-name').value.trim();
                    const data = {
                        provider: wrap.querySelector('#apf-provider').value,
                        apiUrl: wrap.querySelector('#apf-url').value.trim(),
                        apiKey: wrap.querySelector('#apf-key').value.trim(),
                        model: wrap.querySelector('#apf-model').value.trim()
                    };
                    if (!name || !data.apiUrl || !data.apiKey || !data.model) { toast('名称/地址/Key/模型都要填'); return; }
                    if (editingId === '__new') {
                        db.apiPresets = db.apiPresets || [];
                        db.apiPresets.push({ id: 'preset_' + Date.now(), name, data });
                    } else {
                        const p2 = (db.apiPresets || []).find(x => x.id === editingId);
                        if (p2) { p2.name = name; p2.data = data; }
                    }
                    await persist();
                    editingId = null;
                    paintPresets();
                    paintChars();
                    toast('预设已保存');
                });
            } else {
                wrap.innerHTML = presets.map(presetRow).join('') ||
                    '<div class="ap-empty">还没有预设，点下面「新建预设」加一个</div>';
            }
        }
        function paintChars() {
            const wrap = body.querySelector('#ap-chars');
            const presets = db.apiPresets || [];
            const chats = allChats();
            wrap.innerHTML = chats.map(c => {
                const url = avatarUrl(c, false);
                const face = url ? '<img src="' + esc(url) + '" alt="">' : '<span>' + esc((c.name || '?').slice(0, 1)) + '</span>';
                const sel = '<select class="ap-preset-sel" data-id="' + esc(c.id) + '"' + (c.exclusiveApiEnabled ? '' : ' disabled') + '>' +
                    '<option value="">选择预设…</option>' +
                    presets.map(p => '<option value="' + esc(p.name) + '"' + (c.exclusiveApiPreset === p.name ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
                    '</select>';
                return '<div class="ap-row tall" data-id="' + esc(c.id) + '">' +
                    '<span class="ap-face' + (url ? ' has' : '') + '">' + face + '</span>' +
                    '<div class="ap-row-main">' +
                    '<div class="ap-row-title">' + esc(c.name || '未命名') + '</div>' +
                    '<div class="ap-row-sub">' + (c.exclusiveApiEnabled ? (c.exclusiveApiPreset ? '专属：' + esc(c.exclusiveApiPreset) : '专属：未选预设') : '跟随全局 API') + '</div>' +
                    '</div>' +
                    sel +
                    '<label class="ap-switch"><input type="checkbox" data-act="ex" data-id="' + esc(c.id) + '"' + (c.exclusiveApiEnabled ? ' checked' : '') + '><i></i></label>' +
                    '</div>';
            }).join('') || '<div class="ap-empty">还没有角色</div>';
        }
        function paint() { paintPresets(); paintChars(); }

        body.innerHTML =
            '<div class="ap-card">' +
            '<div class="ap-label">API 预设</div>' +
            '<div id="ap-presets"></div>' +
            '<div class="ap-btnrow"><button class="ap-btn" id="ap-new">＋ 新建预设</button></div>' +
            '<div class="ap-hint">预设 = 一套「地址 + Key + 模型」。给角色开了「专属」并选好预设后，和 TA 聊天就走这套配置；没开的角色继续用全局 API。</div>' +
            '</div>' +
            '<div class="ap-card">' +
            '<div class="ap-label">角色专属模型</div>' +
            '<div id="ap-chars"></div>' +
            '</div>';

        body.querySelector('#ap-new').addEventListener('click', () => { editingId = '__new'; paintPresets(); });
        body.querySelector('#ap-presets').addEventListener('click', async (e) => {
            const btn = e.target.closest('.ap-mini');
            if (!btn) return;
            const row = btn.closest('.ap-row');
            const id = row.dataset.id;
            if (btn.dataset.act === 'edit') { editingId = id; paintPresets(); }
            else if (btn.dataset.act === 'del') {
                db.apiPresets = (db.apiPresets || []).filter(x => x.id !== id);
                await persist();
                paintPresets(); paintChars();
                toast('预设已删除');
            }
        });
        body.querySelector('#ap-chars').addEventListener('change', async (e) => {
            const t = e.target;
            const row = t.closest('.ap-row');
            if (!row) return;
            const chat = chatOf(row.dataset.id);
            if (!chat) return;
            if (t.dataset.act === 'ex') {
                chat.exclusiveApiEnabled = t.checked;
                if (!t.checked) chat.exclusiveApiPreset = '';
                else if (!chat.exclusiveApiPreset) {
                    const first = (db.apiPresets || [])[0];
                    if (first) chat.exclusiveApiPreset = first.name;
                }
                await persist();
                paintChars();
                toast(t.checked ? '已开启专属模型' : '已回到全局 API');
            } else if (t.classList.contains('ap-preset-sel')) {
                chat.exclusiveApiPreset = t.value;
                if (t.value && !chat.exclusiveApiEnabled) chat.exclusiveApiEnabled = true;
                await persist();
                paintChars();
                if (t.value) toast('已选「' + t.value + '」');
            }
        });
        paint();
    }

    window.ASplashSet = { open: openSplashSet };
    window.AApiSet = { open: openApiSet };
})();
