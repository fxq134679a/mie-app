// --- TA 视角截图（思路取自 LoveNest/pov-snap，规则见其 README，代码为本站自写 · CC BY-NC-SA 4.0）---
// 角色自己决定把某一段对话「打印」成一张照片：照片里它的话在右边、你的话在左边，
// 但气泡颜色、头像、名字这些认人的东西一律跟着原来的人走。
window.PovSnap = (function () {
    'use strict';

    const MAX_MSGS = 12;
    const STAGE_ID = 'pov-stage';
    const STAGE_W = 390;
    const CACHE_MAX = 24;

    const SNAP_STANDALONE = /^<pov-snap([^>]*?)\s*\/?>$/i;
    const SNAP_ANY = /<pov-snap[^>]*\/?>/gi;
    const SNAP_HINT = /<pov-snap/i;

    const imgCache = new Map();   // snapId -> dataURL（读过就缓存，控制上限防内存）
    let povMode = false;          // 手动多选截图时是否按 TA 的视角翻边

    /* ══════════ 小工具 ══════════ */
    function toast(msg) {
        if (typeof showToast === 'function') showToast(msg);
    }

    function chatOf(chatId, chatType) {
        const pool = chatType === 'group' ? (db && db.groups) : (db && db.characters);
        return (pool || []).find(c => c.id === chatId);
    }

    function isNativeApp() {
        return !!(window.Capacitor
            && typeof window.Capacitor.isNativePlatform === 'function'
            && window.Capacitor.isNativePlatform());
    }

    function attrValue(src, key) {
        const m = src.match(new RegExp(key + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i'));
        if (!m) return '';
        return (m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]) || '').trim();
    }

    /* 解析标记：标记单独成一行就算；混在同一行正文里的只擦掉不打印 */
    function parseMarker(text) {
        const trimmed = (text || '').trim();
        const lines = trimmed.split(/\r?\n/);
        let hit = -1;
        for (let i = 0; i < lines.length; i++) {
            if (SNAP_STANDALONE.test(lines[i].trim())) { hit = i; break; }
        }
        if (hit >= 0) {
            const src = lines[hit].trim().match(SNAP_STANDALONE)[1] || '';
            const ctx = parseInt(attrValue(src, 'context'), 10);
            const lst = parseInt(attrValue(src, 'last'), 10);
            return {
                attrs: {
                    match: attrValue(src, 'match'),
                    note: attrValue(src, 'note'),
                    context: Number.isFinite(ctx) ? Math.max(0, Math.min(5, ctx)) : 0,
                    last: Number.isFinite(lst) ? Math.max(1, Math.min(MAX_MSGS, lst)) : 0
                },
                leftover: lines.filter((_, i) => i !== hit).join('\n').trim()
            };
        }
        if (SNAP_HINT.test(trimmed)) {
            return { attrs: null, leftover: trimmed.replace(SNAP_ANY, '').trim() };
        }
        return null;
    }

    /* 把一条消息还原成好比对的文字（去掉外壳方括号、尖括号标签、空白） */
    function plainText(msg) {
        let c = typeof msg.content === 'string' ? msg.content : '';
        if (!c && Array.isArray(msg.parts)) {
            c = msg.parts.filter(p => p && p.type === 'text').map(p => p.text).join(' ');
        }
        c = c.replace(SNAP_ANY, ' ').replace(/<[^>]+>/g, ' ');
        c = c.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&');
        const wrapped = c.trim().match(/^\[[^\[\]]{0,24}?(?:说|回复|消息|发送)[：:]([\s\S]*)\]$/);
        if (wrapped) c = wrapped[1];
        return c.replace(/\s+/g, '');
    }

    /* 能被打印的消息：聊天里说过的话，排除系统提示/状态更新/思考/照片本身 */
    function snappable(m) {
        if (!m || m.isPovSnap || m.isStatusUpdate || m.isThinking || m.isWithdrawn) return false;
        if (m.role === 'system') return false;
        const t = plainText(m);
        return t.length > 0 || (typeof m.content === 'string' && m.content.length > 0);
    }

    /* ══════════ 选段 ══════════ */
    function pickByMarker(chat, attrs) {
        const all = (chat.history || []).filter(snappable);
        if (!all.length) return { ok: false, reason: 'empty' };

        if (attrs.match) {
            const needle = attrs.match.replace(/\s+/g, '');
            let idx = -1;
            if (needle) {
                for (let i = all.length - 1; i >= 0; i--) {
                    if (plainText(all[i]).includes(needle)) { idx = i; break; }
                }
            }
            if (idx < 0) return { ok: false, reason: 'notfound', target: attrs.match };
            const pad = attrs.context > 0 ? attrs.context : 2;
            const to = Math.min(all.length - 1, idx + pad);
            const from = Math.max(Math.max(0, idx - pad), to - MAX_MSGS + 1);
            return { ok: true, msgs: all.slice(from, to + 1), center: idx - from };
        }
        if (attrs.last > 0) return { ok: true, msgs: all.slice(-attrs.last), center: -1 };
        return { ok: false, reason: 'nomarker' };
    }

    /* 照片内容的文字版，给模型看的 */
    function transcriptFor(chat, msgs) {
        const myName = chat.realName || chat.nickname || chat.name || 'TA';
        const youName = chat.myName || (chat.me && chat.me.nickname) || '你';
        return msgs.map(m => {
            const who = m.role === 'user' ? youName : myName;
            const body = plainText(m);
            return `${who}：${body.length > 60 ? body.slice(0, 60) + '…' : body}`;
        }).join('\n');
    }

    /* ══════════ 打印台 ══════════ */
    function stageEl() {
        let el = document.getElementById(STAGE_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = STAGE_ID;
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
        }
        el.className = '';
        el.removeAttribute('style');
        el.innerHTML = '';
        const src = document.getElementById('chat-room-screen');
        if (src) {
            if (src.classList.contains('show-timestamp')) el.classList.add('show-timestamp');
            if (src.classList.contains('disable-blur')) el.classList.add('disable-blur');
        }
        return el;
    }

    function sameSpeaker(a, b) {
        if (!a || !b) return false;
        if ((a.role === 'user') !== (b.role === 'user')) return false;
        return (a.senderId || '') === (b.senderId || '');
    }

    /* 借聊天本来的渲染函数，在离屏台上按 TA 的视角重排一遍 */
    function buildStage(chat, chatType, msgs, note) {
        const el = stageEl();
        const keepType = window.currentChatType, keepId = window.currentChatId;
        try {
            window.currentChatType = chatType;
            window.currentChatId = chat.id;
            if (chat.chatBg) {
                el.style.backgroundImage = `url("${chat.chatBg}")`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            } else {
                el.style.backgroundColor = '#f5f5f5';
            }
            msgs.forEach((m, i) => {
                let node = null;
                try {
                    node = createMessageBubbleElement(m, i > 0 && sameSpeaker(msgs[i - 1], m));
                } catch (e) {
                    console.warn('[PovSnap] 这条排不进打印台：', e);
                }
                if (!node) return;
                node.classList.remove('multi-select-selected', 'context-disabled', 'ap-them');
                node.classList.add('pov-flip');
                el.appendChild(node);
            });
            if (note) {
                const cap = document.createElement('div');
                cap.className = 'pov-caption';
                cap.textContent = note;
                el.appendChild(cap);
            }
        } finally {
            window.currentChatType = keepType;
            window.currentChatId = keepId;
        }
        return el;
    }

    /* html2canvas 是 UMD：页面里临时存在的 AMD define 会把它截走，这里用干净沙箱重跑一次 */
    async function ensureH2C() {
        if (typeof window.html2canvas === 'function') return window.html2canvas;
        try {
            const r = await fetch('js/lib/html2canvas.min.js');
            const code = await r.text();
            (new Function('define', 'module', 'exports', code))(undefined, undefined, undefined);
        } catch (e) {
            console.warn('[PovSnap] html2canvas 本地救援失败:', e);
        }
        return typeof window.html2canvas === 'function' ? window.html2canvas : null;
    }

    async function captureStage(el) {
        const h2c = await ensureH2C();
        if (!h2c) throw new Error('截图组件没加载好');
        await new Promise(r => setTimeout(r, 50));
        const canvas = await h2c(el, { useCORS: true, scale: 2, backgroundColor: null, logging: false });
        return canvas.toDataURL('image/png');
    }

    /* ══════════ 存图 ══════════ */
    async function saveSnap(chatId, dataUrl, meta) {
        if (typeof dexieDB === 'undefined' || !dexieDB || !dexieDB.povSnaps) return 0;
        const id = await dexieDB.povSnaps.add({
            chatId: chatId,
            timestamp: Date.now(),
            image: dataUrl,
            count: meta.count || 0,
            note: meta.note || '',
            title: meta.title || ''
        });
        cachePut(id, dataUrl);
        return id;
    }

    function cachePut(id, dataUrl) {
        if (imgCache.size > CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
        imgCache.set(id, dataUrl);
    }

    async function loadImage(snapId) {
        if (!snapId) return '';
        if (imgCache.has(snapId)) return imgCache.get(snapId);
        if (typeof dexieDB === 'undefined' || !dexieDB || !dexieDB.povSnaps) return '';
        try {
            const row = await dexieDB.povSnaps.get(Number(snapId));
            if (row && row.image) { cachePut(Number(snapId), row.image); return row.image; }
        } catch (e) { console.warn('[PovSnap] 读图失败:', e); }
        return '';
    }

    /* ══════════ 卡片（聊天里的那张照片） ══════════ */
    function buildCard(msg, onMissing) {
        const meta = msg.povSnap || {};
        const card = document.createElement('div');
        card.className = 'snap-card';

        const img = document.createElement('img');
        img.className = 'sc-shot';
        img.alt = '从TA的视角打印出来的聊天记录';
        card.appendChild(img);

        const cap = document.createElement('span');
        cap.className = 'sc-cap';
        cap.textContent = `${meta.count || 0} 条对话 · TA的视角`;
        card.appendChild(cap);

        if (isNativeApp()) {
            const share = document.createElement('button');
            share.type = 'button';
            share.className = 'sc-share';
            share.setAttribute('aria-label', '保存或分享这张照片');
            share.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
            share.addEventListener('click', function (e) {
                e.stopPropagation();
                shareSnap(msg);
            });
            card.classList.add('native');
            card.appendChild(share);
        }

        card.addEventListener('click', function () {
            if (!img.src) { toast('照片还在读…'); return; }
            if (typeof openImageViewer === 'function') openImageViewer(img.src);
        });

        loadImage(meta.snapId).then(function (url) {
            if (url) {
                img.src = url;
            } else if (typeof onMissing === 'function') {
                onMissing(card, msg);
            }
        });
        return card;
    }

    function attachMissing(card, msg) {
        card.classList.add('sc-missing');
        const tip = document.createElement('div');
        tip.className = 'sc-missing-tip';
        tip.textContent = '这张照片已被清理';
        if ((msg.povSnap || {}).ids && msg.povSnap.ids.length) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sc-missing-btn';
            btn.textContent = '重新打印';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                reprint(msg).then(function (ok) { if (ok) renderInto(card, buildCard(msg, attachMissing)); });
            });
            tip.appendChild(btn);
        }
        card.appendChild(tip);
    }

    function renderInto(oldNode, newNode) {
        if (oldNode && oldNode.parentNode) oldNode.parentNode.replaceChild(newNode, oldNode);
    }

    /* 图片被清理后，用消息里留下的那几条编号重新排一遍 */
    async function reprint(msg) {
        const meta = msg.povSnap || {};
        const chat = chatOf(meta.chatId, 'private') || chatOf(meta.chatId, 'group');
        if (!chat) { toast('找不到原来的聊天了'); return false; }
        const ids = meta.ids || [];
        const msgs = ids.map(id => (chat.history || []).find(m => m.id === id)).filter(Boolean);
        if (!msgs.length) { toast('那几条记录已经不在了'); return false; }
        try {
            const el = buildStage(chat, 'private', msgs, meta.note || '');
            const dataUrl = await captureStage(el);
            meta.snapId = await saveSnap(chat.id, dataUrl, {
                count: msgs.length, note: meta.note || '', title: chat.realName || ''
            });
            msg.content = snapContentText(msgs.length);
            return true;
        } catch (e) {
            console.warn('[PovSnap] 重新打印失败:', e);
            toast('重新打印失败了');
            return false;
        }
    }

    async function shareSnap(msg) {
        const meta = msg.povSnap || {};
        const url = await loadImage(meta.snapId);
        if (!url) { toast('照片还没读出来'); return; }
        const P = window.Capacitor && window.Capacitor.Plugins;
        if (P && P.Filesystem && P.Share) {
            try {
                const base64 = url.split(',')[1] || '';
                const name = `pov_snap_${meta.snapId || Date.now()}.png`;
                const written = await P.Filesystem.writeFile({ path: name, data: base64, encoding: 'base64', directory: 'Documents' });
                await P.Share.share({ title: 'TA打印的聊天记录', files: [written.uri], dialogTitle: '保存这张照片' });
                return;
            } catch (e) {
                console.warn('[PovSnap] 原生分享失败，改用下载:', e);
            }
        }
        const link = document.createElement('a');
        link.href = url;
        link.download = `pov_snap_${meta.snapId || Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function snapContentText(n) {
        return `[从TA的视角打印了一张聊天记录：${n}条]`;
    }

    function makeSnapMessage(chat, chatType, msgs, note, snapId) {
        return {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            role: chatType === 'group' ? 'user' : 'assistant',
            content: snapContentText(msgs.length),
            parts: [],
            timestamp: Date.now(),
            isPovSnap: true,
            povSnap: {
                snapId: snapId,
                chatId: chat.id,
                count: msgs.length,
                note: note || '',
                ids: msgs.map(m => m.id),
                desc: transcriptFor(chat, msgs) + (note ? `\n（照片边上还写了：${note}）` : '')
            }
        };
    }

    /* ══════════ 角色自己打印 ══════════ */
    async function createFromMarker(chat, chatId, chatType, attrs) {
        if (chatType !== 'private') return { ok: false, reason: 'group' };
        const picked = pickByMarker(chat, attrs);
        if (!picked.ok) return picked;

        const note = String(attrs.note || '').slice(0, 60);
        let dataUrl = '';
        try {
            dataUrl = await captureStage(buildStage(chat, chatType, picked.msgs, note));
        } catch (e) {
            console.warn('[PovSnap] 打印失败:', e);
            return { ok: false, reason: 'render', error: String((e && e.message) || e) };
        }

        const snapId = await saveSnap(chat.id, dataUrl, {
            count: picked.msgs.length, note: note, title: chat.realName || ''
        });
        const msg = makeSnapMessage(chat, chatType, picked.msgs, note, snapId);
        chat.history.push(msg);
        if (typeof addMessageBubble === 'function') addMessageBubble(msg, chat.id, chatType);
        return { ok: true, msg: msg };
    }

    /* 手动多选：按 TA 视角打印选中的几条，只出预览，不进聊天记录 */
    let lastPreview = { key: '', url: '' };
    function previewKey(ids) {
        const set = ids instanceof Set ? Array.from(ids) : (ids || []);
        return currentChatId + '|' + set.slice().sort().join(',');
    }

    async function captureSelected(ids) {
        const msgs = pickedSelected(ids);
        if (!msgs.length) { toast('这几条打印不出来'); return ''; }
        const chat = chatOf(currentChatId, currentChatType);
        const url = await captureStage(buildStage(chat, currentChatType, msgs, ''));
        lastPreview = { key: previewKey(ids), url: url };
        return url;
    }

    /* 手动多选：把预览那张真的存进聊天（预览已经画过就直接用，别再等一次截图） */
    async function pushSelectedAsSnap(ids) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return null;
        const msgs = pickedSelected(ids);
        if (!msgs.length) { toast('这几条打印不出来'); return null; }
        const key = previewKey(ids);
        const dataUrl = (lastPreview.key === key && lastPreview.url)
            ? lastPreview.url
            : await captureStage(buildStage(chat, currentChatType, msgs, ''));
        lastPreview = { key: '', url: '' };
        const snapId = await saveSnap(chat.id, dataUrl, { count: msgs.length, note: '', title: chat.realName || '' });
        const msg = makeSnapMessage(chat, currentChatType, msgs, '', snapId);
        chat.history.push(msg);
        if (typeof addMessageBubble === 'function') addMessageBubble(msg, chat.id, currentChatType);
        if (typeof saveData === 'function') saveData();
        return msg;
    }

    function pickedSelected(ids) {
        const chat = chatOf(currentChatId, currentChatType);
        if (!chat) return [];
        const set = ids instanceof Set ? ids : new Set(ids || []);
        return (chat.history || []).filter(m => set.has(m.id) && snappable(m)).slice(-MAX_MSGS);
    }

    /* ══════════ 给模型的说明 ══════════ */
    function describeSnapForAI(msg) {
        const meta = msg && msg.povSnap;
        if (!meta) return '';
        const lines = String(meta.desc || '').split('\n').filter(Boolean);
        if (!lines.length) return msg.content || '';
        return `[你把这段对话打印成了一张照片递过去，照片上是你自己的视角（你的话在右边）。照片里是：\n${lines.join('\n')}${meta.note ? `\n（你在照片边上写了一句：${meta.note}）` : ''}]`;
    }

    function buildPromptSection(chatType, enabled) {
        if (chatType !== 'private') return '';
        if (enabled === false) return '';
        return '\n\n【打印聊天记录·TA的视角】你可以把这段对话里的几句「打印」成一张照片递过去——'
            + '照片是你自己的视角：你说的话在右边，TA说的话在左边（气泡颜色、头像仍按各自本来的样子）。'
            + '用法：把标记单独占一行（可以跟你说的话放在同一条消息里），例如：'
            + '<pov-snap match="中间那句原话" context="2" note="想写在照片边的话"/>，'
            + '或者 <pov-snap last="6"/>（直接打印最近6条）。'
            + 'match 要照抄那一句里连续的原话（别改字、别补标点），系统拿它当中心，左右各取 context 条；一次最多 12 条。'
            + '找不到那句话就不会打印，聊天里会提示你没打印成功。'
            + '标记本身不会印在照片上，也不会作为文字显示出去。'
            + '适合：吵完架回看、约定和承诺、告白的瞬间、想留住的话、TA说错话时拿出来对质。'
            + '别滥用，一个话题最多一张；note 用你自己的口气写，会被印在照片下边。';
    }

    /* ══════════ 多选截图栏上的「TA视角」开关 ══════════ */
    function togglePovMode() {
        povMode = !povMode;
        const btn = document.getElementById('pov-capture-btn');
        if (btn) {
            btn.classList.toggle('active', povMode);
            btn.textContent = povMode ? 'TA视角：开' : 'TA视角：关';
        }
        return povMode;
    }

    function initBarToggle() {
        const bar = document.getElementById('capture-mode-bar');
        if (!bar || document.getElementById('pov-capture-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'pov-capture-btn';
        btn.className = 'btn btn-neutral';
        btn.style.cssText = 'width:auto;padding:8px 12px;font-size:13px;';
        btn.textContent = 'TA视角：关';
        btn.title = '按TA的视角重排：TA的话在右边';
        const gen = document.getElementById('generate-capture-btn');
        if (gen && gen.parentNode === bar) bar.insertBefore(btn, gen);
        else bar.appendChild(btn);
    }

    function ready() {
        initBarToggle();
        document.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('#pov-capture-btn')) togglePovMode();
        });
        document.addEventListener('click', function (e) {
            const btn = e.target && e.target.closest ? e.target.closest('#pov-store-btn') : null;
            if (!btn) return;
            let ids = [];
            try { ids = JSON.parse(btn.dataset.snapIds || '[]'); } catch (err) { ids = []; }
            if (!ids.length) return;
            btn.disabled = true;
            pushSelectedAsSnap(ids).then(function (m) {
                btn.disabled = false;
                if (!m) return;
                const modal = document.getElementById('capture-result-modal');
                if (modal) modal.classList.remove('visible');
                toast('已经存进聊天了');
            }).catch(function (err) {
                btn.disabled = false;
                console.warn('[PovSnap] store failed:', err);
            });
        });
        // 截图栏是聊天室 HTML 注入的，可能比本文件晚出现，用观察器等它
        const barWatcher = new MutationObserver(function () {
            initBarToggle();
            if (document.getElementById('pov-capture-btn')) barWatcher.disconnect();
        });
        barWatcher.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();

    return {
        parseMarker: parseMarker,
        pickByMarker: pickByMarker,
        createFromMarker: createFromMarker,
        captureSelected: captureSelected,
        pushSelectedAsSnap: pushSelectedAsSnap,
        buildCard: function (msg) { return buildCard(msg, attachMissing); },
        describeSnapForAI: describeSnapForAI,
        buildPromptSection: buildPromptSection,
        ensureH2C: ensureH2C,
        isPovMode: function () { return povMode; },
        togglePovMode: togglePovMode,
        enabled: function (chat) { return !chat || chat.snapEnabled !== false; }
    };
})();
