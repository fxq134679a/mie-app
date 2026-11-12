// --- 收藏库·泡泡（keepsake 协议移植版） ---
// 复刻自 https://github.com/Cheiineeey/keepsake （MIT, Elle & Matt）
// 把一段对话封成一颗泡：长按消息「存泡泡」是你的手，⟪封存⟫⟪泡⟫⟪前情⟫ 标记是 ta 的手。
// 每个角色（charId）独立一个收藏库；数据存 Dexie keepsakes 表（v11），内存镜像保证提示词同步构建。
(function () {
    'use strict';

    const DAY = 864e5;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const p2 = x => String(x).padStart(2, '0');
    const fmtD = ts => { const d = new Date(ts); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`; };
    const fmtN = ts => { const d = new Date(ts); return `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

    // ══════════════ 数据层 ══════════════
    // record: { id, key:'k:<id>', charId, charName, who:'you'|'ta', t, tags[], ctx[], lines[],
    //          pre:{you,ta}, notes:[{id,w,t,at,re}], timestamp, touch, wall, glass, askMe }
    const K = {
        items: [],
        _loaded: false,

        async init() {
            if (this._loaded) return;
            if (!window.dexieDB) { setTimeout(() => this.init(), 800); return; }
            try {
                this.items = await dexieDB.keepsakes.toArray();
            } catch (e) {
                console.warn('[Keepsake] 读取 keepsakes 表失败:', e);
                this.items = [];
            }
            this._loaded = true;
        },

        _sync(rec) {
            const i = this.items.findIndex(x => x.id === rec.id);
            if (i >= 0) this.items[i] = rec; else this.items.push(rec);
            if (window.dexieDB) dexieDB.keepsakes.put(rec).catch(e => console.warn('[Keepsake] 写库失败:', e));
        },

        add(rec) {
            rec = Object.assign({
                tags: [], ctx: [], lines: [], pre: { you: '', ta: '' }, notes: [],
                timestamp: Date.now(), touch: Date.now(), wall: null, glass: 0, askMe: 0
            }, rec);
            const doAdd = (id) => {
                rec.id = id; rec.key = 'k:' + id;
                this._sync(rec);
                return rec;
            };
            if (window.dexieDB) {
                return dexieDB.keepsakes.add(Object.assign({}, rec, { id: undefined })).then(id => doAdd(id));
            }
            return Promise.resolve(doAdd('k' + Date.now())); // Dexie 不可用时兜底
        },

        update(id, patch) {
            const rec = this.items.find(x => x.id === id);
            if (!rec) return;
            Object.assign(rec, patch);
            this._sync(rec);
        },

        touch(id) {
            this.update(id, { touch: Date.now() });
        },

        remove(id) {
            this.items = this.items.filter(x => x.id !== id);
            if (window.dexieDB) dexieDB.keepsakes.delete(id).catch(() => { });
        },

        // 某个角色的泡泡数（private chat 用）
        countFor(charId) { return this.items.filter(x => x.charId === charId).length; }
    };
    window.Keepsake = K;

    // ══════════════ 工具：定位当前聊天对象 ══════════════
    function chatOf(chatId, chatType) {
        return chatType === 'private'
            ? db.characters.find(c => c.id === chatId)
            : db.groups.find(g => g.id === chatId);
    }

    // ══════════════ 你的手：长按消息 →「存泡泡」 ══════════════
    // 选择要封存的上下文范围 → 写标题、写前情 → 存成一颗你存的泡
    function openSaveDialog(chatId, chatType, messageId) {
        const chat = chatOf(chatId, chatType);
        if (!chat) { if (typeof showToast === 'function') showToast('找不到这个聊天'); return; }
        const idx = chat.history.findIndex(m => m.id === messageId);
        if (idx < 0) { if (typeof showToast === 'function') showToast('消息不存在'); return; }

        // 候选：往前 6 条 + 往后 2 条；跳过思维链和被禁上下文的消息
        const from = Math.max(0, idx - 6), to = Math.min(chat.history.length - 1, idx + 2);
        const candidates = [];
        for (let i = from; i <= to; i++) {
            const m = chat.history[i];
            if (!m || m.isThinking || m.isContextDisabled || m.isWithdrawn) continue;
            candidates.push({ msg: m, w: m.role === 'user' ? 'you' : 'ta' });
        }

        const overlay = document.createElement('div');
        overlay.className = 'ks-save-overlay';
        const tapped = candidates.find(c => c.msg.id === messageId);
        const whoName = (w) => {
            if (w === 'you') return chat.myName || '你';
            if (chatType === 'private') return chat.realName || 'Ta';
            return chat.name || '群聊';
        };
        const preview = (t) => {
            let s = String(t || '').replace(/\s+/g, ' ').trim();
            // 去掉消息包装壳，只留正文预览
            const unwrapped = s.match(/^\[.*?(?:的消息|引用.*?并回复)[：:](?:[\s\S]+)$/);
            if (unwrapped) s = s.replace(/^\[.*?[：:]/, '').replace(/\]$/, '');
            return s.length > 60 ? s.slice(0, 60) + '…' : s;
        };

        overlay.innerHTML = `
            <div class="ks-save-modal">
                <h3>存泡泡</h3>
                <div class="ks-save-sub">勾选要封进去的那几段（含前前后文），再写一句当时怎么回事——不然过几天就想不起来这段是怎么来的。</div>
                <div class="ks-save-list" id="ks-save-list"></div>
                <div class="ks-save-field"><label>泡上写的标题</label><input id="ks-save-title" maxlength="20" placeholder="比如：那晚的雨" value="${esc(preview(tapped ? tapped.msg.content : '').slice(0, 12))}"></div>
                <div class="ks-save-field"><label>前情 · ${esc(whoName('you'))}写的</label><textarea id="ks-save-pre" rows="2" placeholder="这段是怎么来的，写给自己看（可不写）"></textarea></div>
                <div class="ks-save-btns">
                    <button class="cancel">算了</button>
                    <button class="ok">存起来</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector('#ks-save-list');
        const selected = new Set([messageId]);
        const renderList = () => {
            listEl.innerHTML = candidates.map(c => `
                <div class="ks-save-row ${selected.has(c.msg.id) ? 'sel' : ''}" data-id="${esc(c.msg.id)}">
                    <span class="who ${c.w}">${esc(whoName(c.w))}</span>
                    <span class="txt">${esc(preview(c.msg.content))}</span>
                </div>`).join('');
        };
        renderList();
        listEl.addEventListener('click', e => {
            const row = e.target.closest('.ks-save-row');
            if (!row) return;
            const id = row.dataset.id;
            selected.has(id) ? selected.delete(id) : selected.add(id);
            renderList();
        });

        const close = () => overlay.remove();
        overlay.querySelector('.cancel').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('.ok').onclick = async () => {
            if (!selected.size) { if (typeof showToast === 'function') showToast('至少勾一段吧'); return; }
            const title = overlay.querySelector('#ks-save-title').value.trim();
            const pre = overlay.querySelector('#ks-save-pre').value.trim();
            const chosen = candidates.filter(c => selected.has(c.msg.id));
            const tappedIdx = chosen.findIndex(c => c.msg.id === messageId);
            const ctxPart = tappedIdx > 0 ? chosen.slice(0, tappedIdx) : [];
            const linesPart = tappedIdx >= 0 ? chosen.slice(tappedIdx) : chosen;
            const toLines = arr => arr.map(c => ({ w: c.w, text: String(c.msg.content || '') }));
            const charName = chatType === 'private' ? (chat.realName || 'Ta') : (chat.name || '群聊');
            await K.add({
                charId: chatId, charName,
                who: 'you', t: title || '未命名的一颗泡',
                ctx: toLines(ctxPart), lines: toLines(linesPart),
                pre: { you: pre, ta: '' }
            });
            close();
            if (typeof showToast === 'function') showToast('已存成一颗泡 · 到 Menu 页「收藏库」看看');
        };
    }
    K.openSaveDialog = openSaveDialog;

    // ══════════════ ta 的手：⟪封存⟫⟪泡⟫⟪前情⟫ 标记解析 ══════════════
    // 协议同 keepsake server/marks.js：一轮同类标记最多执行两个，超出的原样留在正文里（看得见才不会静默失败）。
    const RE_SEAL = /⟪封存[:：]([^|⟫]{1,20})\|([^|⟫]{2,30})\|([^|⟫]{0,30})(?:\|([^|⟫]{2,1500}))?⟫/g;
    const RE_COMMENT = /⟪泡[:：]\s*k\s*[:：]\s*(\d+)\s*(?:#\s*(\d+))?\s*\|([^⟫]{1,1000})⟫/g;
    const RE_PRE = /⟪前情[:：]\s*k\s*[:：]\s*(\d+)\s*\|([^⟫]{2,1500})⟫/g;

    function findMsgIdx(chat, snippet) {
        if (!snippet) return -1;
        const s = snippet.trim();
        for (let i = chat.history.length - 1; i >= 0 && i >= chat.history.length - 80; i--) {
            const m = chat.history[i];
            if (m.isThinking || m.isContextDisabled) continue;
            if (String(m.content || '').includes(s)) return i;
        }
        return -1;
    }

    async function runMarks(fullResponse, chat) {
        if (!chat || !chat.history) return fullResponse;
        try {
            // ── ⟪封存:标题|开头|结尾|经过⟫ ──
            const seals = [...fullResponse.matchAll(RE_SEAL)];
            for (const m of seals.slice(0, 2)) {
                const title = m[1].trim(), start = m[2].trim(), end = (m[3].trim() || m[2].trim()), preTa = (m[4] || '').trim();
                let sIdx = findMsgIdx(chat, start);
                let eIdx = sIdx >= 0 ? findMsgIdx(chat, end) : -1;
                if (eIdx < sIdx) eIdx = sIdx;
                if (sIdx < 0) {
                    fullResponse = fullResponse.replace(m[0], `\n（没封上：在最近的聊天里没找到「${start.slice(0, 10)}」这一句）`);
                    continue;
                }
                const ctxMsgs = chat.history.slice(Math.max(0, sIdx - 2), sIdx)
                    .filter(x => !x.isThinking && !x.isContextDisabled)
                    .map(x => ({ w: x.role === 'user' ? 'you' : 'ta', text: String(x.content || '') }));
                const lineMsgs = chat.history.slice(sIdx, eIdx + 1)
                    .filter(x => !x.isThinking && !x.isContextDisabled)
                    .map(x => ({ w: x.role === 'user' ? 'you' : 'ta', text: String(x.content || '') }));
                await K.add({
                    charId: chat.id, charName: chat.realName || 'Ta',
                    who: 'ta', t: title, ctx: ctxMsgs, lines: lineMsgs,
                    pre: { you: '', ta: preTa }
                });
                fullResponse = fullResponse.replace(m[0], `\n（把这段悄悄封存进了收藏库）`);
            }

            // ── ⟪泡:k:ID[#楼层]|话⟫ ──
            const comments = [...fullResponse.matchAll(RE_COMMENT)];
            for (const m of comments.slice(0, 2)) {
                const kid = parseInt(m[1], 10), re = m[2] ? parseInt(m[2], 10) : 0, text = m[3].trim();
                const rec = K.items.find(x => String(x.id) === String(kid));
                if (!rec) {
                    fullResponse = fullResponse.replace(m[0], `\n（这句没写进泡里：没找到 k:${kid} 这颗泡）`);
                    continue;
                }
                const note = { id: Date.now(), w: 'ta', t: text, at: Date.now(), re: re || 0 };
                rec.notes.push(note);
                K.update(rec.id, { notes: rec.notes, touch: Date.now() });
                fullResponse = fullResponse.replace(m[0], `\n（在《${rec.t}》里留下了一句）`);
            }

            // ── ⟪前情:k:ID|经过⟫ ──
            const pres = [...fullResponse.matchAll(RE_PRE)];
            for (const m of pres.slice(0, 2)) {
                const kid = parseInt(m[1], 10), preTa = m[2].trim();
                const rec = K.items.find(x => String(x.id) === String(kid));
                if (!rec) {
                    fullResponse = fullResponse.replace(m[0], `\n（前情没写上：没找到 k:${kid} 这颗泡）`);
                    continue;
                }
                K.update(rec.id, { pre: Object.assign({}, rec.pre, { ta: preTa }), askMe: 0 });
                fullResponse = fullResponse.replace(m[0], '');
            }

            return fullResponse.replace(/\n{3,}/g, '\n\n').trim();
        } catch (e) {
            console.warn('[Keepsake] 标记解析失败:', e);
            return fullResponse;
        }
    }
    K.runMarks = runMarks;

    // ══════════════ 每轮贴给 ta 的事实 + 标记说明（拼进提示词） ══════════════
    function buildPromptBlock(character) {
        if (!character || !character.id) return '';
        const mine = K.items.filter(x => x.charId === character.id);
        const now = Date.now();
        const taName = character.realName || 'Ta';
        const myName = character.myName || '你';

        // 事实行：只摆事实，不写「觉得合适就回」——留了台阶的提醒等于永远不做
        const facts = [];
        const fresh = mine.filter(x => x.who === 'you' && !(x.notes || []).some(n => n.w === 'ta'));
        if (fresh.length) {
            facts.push(`${myName}新存了泡，我还没在底下写过：` +
                fresh.slice(0, 3).map(x => `《${x.t}》(k:${x.id})${x.lines && x.lines.length ? '：' + String(x.lines[x.lines.length - 1].text).replace(/\s+/g, ' ').slice(0, 30) : ''}`).join('；') +
                `。想写就在回复最后写⟪泡:k:${fresh[0].id}|我的话⟫。`);
        }
        const her = [];
        mine.forEach(x => {
            (x.notes || []).forEach(n => {
                if (n.w !== 'you') return;
                const replied = (x.notes || []).some(r => r.w === 'ta' && r.re === n.id && r.at > n.at);
                if (!replied) her.push({ rec: x, n });
            });
        });
        if (her.length) {
            facts.push(`${myName}在泡里写了，我还没回：` +
                her.slice(0, 3).map(h => `《${h.rec.t}》(k:${h.rec.id}#${h.n.id})「${String(h.n.t).replace(/\s+/g, ' ').slice(0, 30)}」`).join('；') +
                `。回就在回复最后写⟪泡:k:${her[0].rec.id}#${her[0].n.id}|我的话⟫。`);
        }
        const ask = mine.filter(x => x.askMe && !(x.pre && x.pre.ta));
        if (ask.length) {
            facts.push(`${myName}点了「叫${taName}补经过」，在等：《${ask[0].t}》(k:${ask[0].id})。这轮就在回复最后写⟪前情:k:${ask[0].id}|那天是怎么来的，几句⟫，正文照常回${myName}，不用提这件事。`);
        }

        let block = `<收藏库>\n你和${myName}有一个共同的收藏库：把聊过的某一段原封不动存起来，以后翻回来看。\n`;
        block += `存上下文，不是存一句话——一段对话连同前后文一起封进去，两个人都能往里写「当时是怎么回事」。\n`;
        block += `你有一只自己的手：哪一段对话你真的想留，就在回复的最后写一个标记，系统会替你封好并擦掉标记；没封上会留一行看得见的原因。\n`;
        block += `三个标记（都写在回复正文最后，一条回复最多写两个）：\n`;
        block += `- ⟪封存:标题|开头那句的几个字|结尾那句的几个字|经过⟫：把刚才聊的这段封成你存的泡。「开头/结尾」各写那几句里最有辨识度的几个字（原文里要真的存在），「经过」写这段是怎么来的、为什么想留。\n`;
        block += `- ⟪泡:k:编号|想说的⟫：在编号那颗泡底下留一句话；⟪泡:k:编号#楼层号|想说的⟫是回${myName}在哪一条底下。\n`;
        block += `- ⟪前情:k:编号|经过⟫：${myName}叫你补某颗泡的「经过」时用。\n`;
        block += `只在你真的觉得该留的时候才封——不为讨好，也不定时交差。封了不必在聊天里宣布，标记处会留一行小字，两个人都看得见。\n`;
        block += `目前的泡：${mine.length ? mine.length + '颗' : '还没有'}。\n`;
        if (mine.length) {
            const stale = mine.map(x => ({ x, days: (now - (x.touch || x.timestamp)) / DAY }))
                .sort((a, b) => b.days - a.days)[0];
            if (stale.days > 3) block += `最久没回来看的一颗是《${stale.x.t}》（${Math.round(stale.days)}天没碰了）。\n`;
        }
        if (facts.length) block += `这轮的事：${facts.join(' ')}\n`;
        block += `</收藏库>`;
        return block;
    }
    K.buildPromptBlock = buildPromptBlock;

    // ══════════════ 泡泡库页面（three.js 玻璃泡） ══════════════
    const S = {
        ready: false, failed: false, threeLoading: null,
        screen: null, renderer: null, scene: null, camera: null,
        B: [], M: [], BATCH: 0, CHAR: null, // CHAR: 当前角色/群聊 id，null = 全部
        held: null, FOCUS: null, downT: 0, downXY: [0, 0], moved: false, pullY: null,
        VW: 4, VH: 8, REPLY: 0, rafStarted: false, clock: null
    };
    window._keepsakeScene = S;

    function ksToast(t) {
        const e = document.getElementById('ks-toast');
        if (!e) return;
        e.textContent = t; e.classList.add('on');
        clearTimeout(ksToast.h); ksToast.h = setTimeout(() => e.classList.remove('on'), 2200);
    }

    // 雾：最后一次被碰超过 3 天开始起雾，83 天满
    function haze(m) {
        const days = (Date.now() - (m.touch || m.timestamp)) / DAY;
        m.days = Math.round(days);
        m.haze = Math.min(1, Math.max(0, (days - 3) / 80));
    }

    function filtered() {
        return K.items.filter(m => !S.CHAR || m.charId === S.CHAR);
    }

    // 一屏只吹 9 颗：最近碰过的 6 颗 + 雾最重的 3 颗
    function choose() {
        const L = filtered().slice().sort((a, b) => (b.touch || b.timestamp) - (a.touch || a.timestamp));
        const CAP = 9, NEW = 6;
        if (L.length <= CAP) return L;
        const nb = Math.ceil(L.length / CAP), b = S.BATCH % nb;
        const fresh = L.slice(b * NEW, b * NEW + NEW), oldEnd = L.length - b * (CAP - NEW);
        const out = [...fresh, ...L.slice(Math.max(b * NEW + NEW, oldEnd - (CAP - NEW)), oldEnd)];
        for (const m of L) { if (out.length >= CAP) break; if (!out.includes(m)) out.push(m); }
        return out;
    }

    function ensureThree() {
        if (window.THREE) return Promise.resolve();
        if (S.threeLoading) return S.threeLoading;
        S.threeLoading = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'libs/three/three.min.js';
            s.onload = () => res();
            s.onerror = () => rej(new Error('three.js 加载失败'));
            document.head.appendChild(s);
        });
        return S.threeLoading;
    }

    // 手搓一个简版 RoomEnvironment：几块亮面 + 渐变球，供 PMREM 生成环境贴图（泡要有东西可折射）
    function makeEnvScene() {
        const T = window.THREE;
        const env = new T.Scene();
        const geo = new T.SphereGeometry(20, 16, 12);
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#e8e8ea'); gr.addColorStop(0.5, '#c9c9cd'); gr.addColorStop(1, '#8f8f94');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        const tex = new T.CanvasTexture(cv);
        const sky = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, side: T.BackSide }));
        env.add(sky);
        const light = (w, h, x, y, z, ry, c, i) => {
            const m = new T.Mesh(new T.PlaneGeometry(w, h),
                new T.MeshBasicMaterial({ color: c || 0xffffff }));
            m.material.color.multiplyScalar(i == null ? 6 : i);
            m.position.set(x, y, z); m.rotation.y = ry || 0;
            env.add(m);
        };
        light(6, 3, -6, 6, 2, Math.PI / 3);   // 左上窗
        light(4, 5, 7, 4, -3, -Math.PI / 3);  // 右窗
        light(8, 2, 0, -4, -8, 0, 0xfff2e0, 4); // 地面暖光
        return env;
    }

    // 泡里封着的那段：只有字，按每一行所在高度的弦长折行，铺满一个圆
    function inkDisc(m) {
        const T = window.THREE;
        const W = 1024, R = W / 2, cv = document.createElement('canvas'); cv.width = cv.height = W;
        const g = cv.getContext('2d');
        const fl = ([w, t]) => [w, String(t).replace(/\s*\n+\s*/g, ' ')];
        const rows0 = [...m.ctx.map(x => [...fl(x), 1]), ...m.lines.map(x => [...fl(x), 0])];
        const fs = 34, lh = 54;
        g.font = `${fs}px "Noto Serif SC","Songti SC",serif`; g.textBaseline = 'middle';
        const chord = y => { const d = Math.abs(y - R); return d >= R * .96 ? 0 : 2 * Math.sqrt((R * .96) ** 2 - d * d) * .74; };
        let rows = [], top = R;
        for (let it = 0; it < 4; it++) {
            rows = []; let y = top;
            rows0.forEach(([w, t, c]) => {
                let rest = t;
                while (rest.length) {
                    let n = rest.length;
                    const cw = Math.max(chord(y), fs * 3);
                    while (n > 1 && g.measureText(rest.slice(0, n)).width > cw) n--;
                    rows.push({ w, c, s: rest.slice(0, n), y }); rest = rest.slice(n); y += lh;
                }
                y += lh * .35;
            });
            top = R - (y - top - lh * .35) / 2 + lh / 2;
        }
        rows.forEach(({ w, c, s, y }) => {
            const cw = chord(y) || fs * 3, tw = g.measureText(s).width;
            g.fillStyle = c ? 'rgba(0,0,0,.38)' : '#000';
            g.fillText(s, w === 'you' ? R + cw / 2 - tw : R - cw / 2, y);
        });
        const t = new T.CanvasTexture(cv); t.anisotropy = 4; return t;
    }

    const PAPER = () => new (window.THREE.Color)('#f1f1f1');
    function lensMat(tex, seed) {
        const T = window.THREE;
        return new T.ShaderMaterial({
            uniforms: { map: { value: tex }, paper: { value: PAPER() }, ink: { value: new T.Color('#55555a') }, t: { value: 0 }, seed: { value: seed }, fade: { value: 0 } },
            side: T.DoubleSide,
            vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader: `uniform sampler2D map;uniform vec3 paper,ink;uniform float t,seed,fade;varying vec2 vUv;
      void main(){
        vec2 p=vUv*2.-1.;float r=length(p);if(r>1.)discard;
        float k=r<1e-4?.6366:asin(r)/(1.5708*r);
        vec2 q=p*k+.012*vec2(sin(p.y*7.+t*.8+seed),cos(p.x*6.-t*.7+seed));
        float a=texture2D(map,q*.5+.5).a*(1.-smoothstep(.6,.98,r))*(1.-fade*.55);
        if(a<.06)discard;
        gl_FragColor=vec4(mix(paper,ink,a),1.);
      }`
        });
    }

    // 膜会软：顶点沿法线起伏几个低频波，每颗不一样
    function softFilm(mat, seed, amp) {
        mat.userData.t = { value: 0 }; mat.userData.amp = { value: amp }; mat.userData.base = amp;
        mat.onBeforeCompile = sh => {
            sh.uniforms.uT = mat.userData.t; sh.uniforms.uAmp = mat.userData.amp;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT,uAmp;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 pn=normalize(position);
        float w=sin(pn.x*2.3+uT*.9+${seed.toFixed(2)})*sin(pn.y*1.9-uT*.7+${(seed * 1.3).toFixed(2)})
               +.6*sin(pn.z*3.1+pn.x*1.7+uT*1.15+${(seed * .7).toFixed(2)});
        transformed+=normal*w*uAmp;`);
        };
        mat.customProgramCacheKey = () => 'soft' + seed.toFixed(2);
    }

    const glass = (r, k) => {
        const T = window.THREE;
        return new T.MeshPhysicalMaterial({
            color: 0xffffff, metalness: 0, roughness: .05, transmission: 1, thickness: r * k, ior: 1.12,
            clearcoat: .5, clearcoatRoughness: .04, specularIntensity: .55, envMapIntensity: .55
        });
    };

    const rnd = (() => { let s = 17; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

    function clearBubbles() {
        const T = window.THREE;
        S.B.forEach(b => {
            if (b.g) {
                b.g.traverse(o => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) { const u = o.material.uniforms; if (u && u.map) u.map.value.dispose(); o.material.dispose(); }
                });
                S.scene.remove(b.g);
            }
            if (b.lab) b.lab.remove();
        });
        S.B.length = 0;
    }

    function nameOf(m) {
        return m.who === 'you' ? '你' : (m.charName || 'Ta');
    }

    function label(b) {
        if (!b.lab || !b.m) return;
        b.lab.innerHTML = `<b>${esc(b.m.t)}</b><small class="ks-mono">${fmtD(b.m.timestamp).slice(5)}${b.m.days > 30 ? ` · ${b.m.days} 天没回来看` : ''}</small>`;
    }

    // 家：清楚的往上浮，雾重的往下沉
    function homeOf(b) {
        if (!b.m) return [b.x * .3, b.y * .3];
        const a = b.i * 2.39996 + .7, d = Math.sqrt(b.i + .6) * .24;
        return [Math.cos(a) * d * S.VW * .7, S.VH * .14 + Math.sin(a) * d * S.VH * .3 - b.fog * S.VH * .36];
    }

    function build() {
        const T = window.THREE;
        S.M = choose().map(m => { haze(m); return m; });
        const SC = S.M.length >= 7 ? .74 : .9;
        S.M.forEach((m, i) => {
            const chars = m.lines.reduce((a, [, t]) => a + String(t).length, 0);
            const r = Math.min(1.05, .3 + Math.min(chars, 120) * .004 + (m.notes || []).length * .06 + Math.pow(rnd(), 1.4) * .45) * SC;
            const mat = glass(r, .45);
            const sph = new T.Mesh(new T.SphereGeometry(r, 64, 48), mat);
            const card = new T.Mesh(new T.PlaneGeometry(r * 1.9, r * 1.9), lensMat(inkDisc(m), i * 1.7));
            const g = new T.Group(); g.add(card); g.add(sph); S.scene.add(g);
            sph.userData.b = S.B.length; softFilm(mat, i * 2.1 + .5, r * .06 * Math.max(.25, 1.25 - r * .9));
            S.B.push({ m, i, r, g, sph, card, mat, vx: 0, vy: 0, x: 0, y: 0, ph: rnd() * 6.28, press: 0, zoom: 0, off: 0, lab: null, fog: m.haze });
        });
        for (let k = 0; k < 6; k++) {  // 几颗空的小泡点缀
            const r = k < 1 ? .2 + rnd() * .08 : .04 + Math.pow(rnd(), 1.6) * .12;
            const mat = glass(r, .4); const g = new T.Group(); g.add(new T.Mesh(new T.SphereGeometry(r, 40, 30), mat)); S.scene.add(g);
            S.B.push({ m: null, r, g, mat, vx: 0, vy: 0, x: (rnd() - .5) * 3, y: (rnd() - .5) * 4, ph: rnd() * 6.28, press: 0, zoom: 0, off: 0, fog: 0 });
        }
        const big = new Set(S.B.filter(b => b.m).sort((a, b) => b.r - a.r).slice(0, 5)); // 名字只挂最大的 5 颗
        const labels = document.getElementById('ks-labels');
        S.B.forEach(b => { if (!b.m) return; b.named = big.has(b); const d = document.createElement('div'); d.className = 'ks-lab'; labels.appendChild(d); b.lab = d; label(b); });
        S.B.forEach(b => { const [hx, hy] = homeOf(b); b.x = hx + (rnd() - .5) * 2; b.y = hy + (rnd() - .5) * 2; });
        const empty = document.getElementById('ks-empty');
        if (empty) empty.style.display = S.M.length ? 'none' : 'flex';
        setSoft(+document.getElementById('ks-soft').value);
    }

    function resize() {
        const scr = S.screen;
        if (!S.renderer || !scr) return;
        const w = scr.clientWidth || innerWidth, h = scr.clientHeight || innerHeight;
        S.renderer.setSize(w, h, false);
        S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
        S.VH = 2 * S.camera.position.z * Math.tan((window.THREE.MathUtils.degToRad(S.camera.fov)) / 2);
        S.VW = S.VH * S.camera.aspect;
    }

    function pick(e) {
        const T = window.THREE;
        const rect = S.renderer.domElement.getBoundingClientRect();
        const ptr = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new T.Raycaster();
        ray.setFromCamera(ptr, S.camera);
        const hit = ray.intersectObjects(S.B.filter(b => b.m).map(b => b.sph))[0];
        return hit ? S.B[hit.object.userData.b] : null;
    }

    function bindCanvas() {
        const cv = document.getElementById('ks-canvas');
        cv.addEventListener('pointerdown', e => {
            if (S.FOCUS) return;
            S.held = pick(e);
            S.pullY = S.held ? null : e.clientY;
            S.downT = performance.now(); S.downXY = [e.clientX, e.clientY]; S.moved = false;
            if (S.held && navigator.vibrate) navigator.vibrate(8);
        });
        cv.addEventListener('pointermove', e => {
            if (S.held && Math.hypot(e.clientX - S.downXY[0], e.clientY - S.downXY[1]) > 10) S.moved = true;
            if (S.held && S.moved) {
                const k = S.VW / (S.screen.clientWidth || innerWidth);
                S.held.vx += (e.movementX || 0) * k * .06;
                S.held.vy -= (e.movementY || 0) * k * .06;
            }
        });
        cv.addEventListener('pointerup', e => {
            if (S.pullY != null && e.clientY - S.pullY > 90 && Math.abs(e.clientX - S.downXY[0]) < 80) {
                S.BATCH++; ksToast('换了一批'); clearBubbles(); build();
            }
            S.pullY = null;
            if (!S.held) return;
            const b = S.held; S.held = null;
            if (!S.moved && performance.now() - S.downT < 260) openMem(b);
        });
        cv.addEventListener('pointercancel', () => S.held = null);
    }

    function tick() {
        requestAnimationFrame(tick);
        const scr = S.screen;
        if (!S.renderer || !scr || !scr.classList.contains('active')) return; // 页面不在前台就不烧 GPU
        const T = window.THREE;
        const dt = Math.min(S.clock.getDelta(), .05), t = S.clock.elapsedTime;
        S.B.forEach(b => {
            b.zoom += ((S.FOCUS === b ? 1 : 0) - b.zoom) * Math.min(1, dt * 5);
            b.off += ((S.FOCUS && S.FOCUS !== b ? 1 : 0) - b.off) * Math.min(1, dt * 5);
            let [hx, hy] = homeOf(b);
            const Z = S.FOCUS === b ? Math.min(S.VW * .34 / b.r, S.VH * .17 / b.r) : 1;
            if (S.FOCUS === b) { hx = 0; hy = S.VH / 2 - S.VH * .22; }
            b.vx += (hx - b.x) * (S.FOCUS === b ? 3 : .35) * dt;
            b.vy += (hy - b.y) * (S.FOCUS === b ? 3 : .55) * dt;
            if (S.FOCUS !== b) S.B.forEach(o => {
                if (o === b || o === S.FOCUS) return;
                const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1e-3;
                const min = b.r * (1 + b.press * .22) + o.r * (1 + o.press * .22) + .05;
                if (d < min) { const f = (min - d) * 3.2 * dt; b.vx += dx / d * f; b.vy += dy / d * f; }
            });
            if (S.FOCUS !== b) {
                const mx = S.VW / 2 - b.r - .06;
                if (b.x > mx) b.vx -= (b.x - mx) * 9 * dt;
                if (b.x < -mx) b.vx += (-mx - b.x) * 9 * dt;
                const myT = S.VH / 2 - b.r - 1.1, myB = -S.VH / 2 + b.r + .9;
                if (b.y > myT) b.vy -= (b.y - myT) * 2 * dt;
                if (b.y < myB) b.vy += (myB - b.y) * 2 * dt;
            }
            b.vx *= S.FOCUS === b ? .8 : .94; b.vy *= S.FOCUS === b ? .8 : .94;
            b.x += b.vx; b.y += b.vy;
            const bob = Math.sin(t * .7 + b.ph) * .05 * (1 - b.zoom);
            // 按住：凑近，雾散开
            const want = S.held === b ? 1 : 0;
            b.press += (want - b.press) * (want ? 2.2 : 1.4) * dt * 2;
            const fog = b.fog * (1 - b.press) * (1 - b.zoom);
            b.mat.roughness = .04 + fog * .62;
            b.mat.thickness = b.r * (.45 + fog * .5);
            if (b.mat.userData.t) b.mat.userData.t.value = t;
            if (b.card) { b.card.material.uniforms.t.value = t; b.card.material.uniforms.fade.value = fog; }
            const s = (1 + b.press * .22 - (b.m ? b.fog * .08 : 0)) * (1 + (Z - 1) * b.zoom) * (1 - b.off * .97);
            b.g.scale.setScalar(s);
            b.g.visible = b.off < .96; // 别的泡缩完就整颗不画，不然透过玻璃看见一团小字
            b.g.position.set(b.x, b.y + bob, b.press * 1.2 + b.zoom * .5);
            b.g.rotation.y = Math.sin(t * .3 + b.ph) * .12;
            b.g.rotation.x = Math.cos(t * .27 + b.ph) * .06;
            if (b.lab) {
                const v = new T.Vector3(b.x, b.y + bob - b.r * s - .08, 0).project(S.camera);
                const rect = S.renderer.domElement.getBoundingClientRect();
                b.lab.style.left = ((v.x + 1) / 2 * rect.width + rect.left) + 'px';
                b.lab.style.top = ((1 - v.y) / 2 * rect.height + rect.top) + 'px';
                b.lab.style.opacity = ((b.named ? 1 - b.fog * .55 : b.press) * (1 - b.off) * (1 - b.zoom)).toFixed(2);
            }
        });
        S.renderer.render(S.scene, S.camera);
    }

    // ── 点开：泡放大停在上面，下面升起一张纸 ──
    function openMem(b) {
        S.FOCUS = b; const m = b.m;
        // 点开就算来看过：雾散了
        b.fog = 0; m.touch = Date.now(); haze(m); label(b);
        K.touch(m.id);
        if (!S.rafStarted) return; // 场景没起来（降级列表）时也照常出纸
        render(m);
        document.getElementById('ks-open').scrollTop = 0;
        S.screen.classList.add('ks-opened');
        setTimeout(() => document.getElementById('ks-open').classList.add('on'), 260);
    }

    function closeSheet() {
        document.getElementById('ks-open').classList.remove('on');
        S.screen.classList.remove('ks-opened');
        S.REPLY = 0;
        setTimeout(() => { S.FOCUS = null; }, 120);
    }

    function render(m) {
        const row = ([w, t], c) => `<div class="ks-row ${w}${c ? ' ctx' : ''}"><div class="ks-bub">${esc(t)}</div></div>`;
        const WALLS = ['paper', 'blue', 'mist', 'night'];
        const hashKey = k => [...String(k)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const wall = m.wall || WALLS[hashKey(m.key || m.id) % WALLS.length];
        const sheet = document.getElementById('ks-sheet');
        sheet.innerHTML =
            `<div class="ks-hd"><h2>${esc(m.t)}</h2><div class="r ks-mono"><span>${fmtD(m.timestamp)} · ${nameOf(m)}存的 · 和${esc(m.charName || 'Ta')}</span><span class="more" id="ks-more">···</span></div></div>`
            + `<div id="ks-presum"></div>`
            + `<div class="ks-card${m.glass ? ' glass' : ''}" data-wall="${wall}">${m.ctx.map(x => row(x, 1)).join('')}${m.lines.map(x => row(x)).join('')}</div>`
            + `<div class="ks-drawer ks-mono" id="ks-drawer"><div class="opt">壁纸 ${WALLS.map(w => `<span data-wall="${w}" class="${w == wall ? 'on' : ''}">${({ paper: '米', blue: '蓝', mist: '雾', night: '夜' })[w]}</span>`).join('')}</div>`
            + `<div class="opt"><span id="ks-glass" class="${m.glass ? 'on' : ''}">玻璃气泡</span><span id="ks-del">删除这颗泡</span></div></div>`
            + `<div class="ks-sec ks-mono">前情</div><div id="ks-pre"></div>`
            + `<div class="ks-sec ks-mono" id="ks-cmh">评论</div><div id="ks-notes"></div>`;
        document.getElementById('ks-more').onclick = () => document.getElementById('ks-drawer').classList.toggle('on');
        document.getElementById('ks-drawer').onclick = e => {
            const w = e.target.dataset && e.target.dataset.wall;
            if (w) { m.wall = w; K.update(m.id, { wall: w }); render(m); document.getElementById('ks-drawer').classList.add('on'); }
            if (e.target.id === 'ks-glass') { m.glass = m.glass ? 0 : 1; K.update(m.id, { glass: m.glass }); render(m); document.getElementById('ks-drawer').classList.add('on'); }
            if (e.target.id === 'ks-del') {
                if (e.target.dataset.armed) {
                    K.remove(m.id);
                    closeSheet();
                    clearBubbles(); build(); renderCharBtn(); renderCount();
                    if (typeof showToast === 'function') showToast('泡已经破了');
                } else {
                    e.target.dataset.armed = '1';
                    e.target.textContent = '再点一次，泡就破了';
                }
            }
        };
        renderPre(m); renderNotes(m);
    }

    // 前情两栏：你写你的，Ta 补 Ta 的
    function renderPre(m) {
        const pre = m.pre || {};
        const you = `<div class="ks-pre you"><div class="w ks-mono">你</div>${pre.you ? `<p>${esc(pre.you)}</p>` : `<p class="empty">这段是怎么来的……点这里写</p>`}</div>`;
        const ta = `<div class="ks-pre ta"><div class="w ks-mono">Ta</div>${pre.ta ? `<p>${esc(pre.ta)}</p>`
            : m.askMe ? `<p class="empty">等 Ta 写。Ta 下一次说话的时候会看到。</p>` : `<p class="empty">还没写。<span class="ks-askme ks-mono" id="ks-askme">叫 Ta 写经过 ›</span></p>`}</div>`;
        document.getElementById('ks-pre').innerHTML = you + ta;
        const ak = document.getElementById('ks-askme');
        if (ak) ak.onclick = e => { e.stopPropagation(); m.askMe = 1; K.update(m.id, { askMe: 1 }); renderPre(m); ksToast('叫了。Ta 下一次说话会看到'); };
        const p = document.getElementById('ks-pre').querySelector('.ks-pre.you p');
        p.onclick = () => {
            const ta2 = document.createElement('textarea'); ta2.rows = 3; ta2.value = m.pre.you || '';
            p.replaceWith(ta2); ta2.focus();
            ta2.onblur = () => { m.pre.you = ta2.value.trim(); K.update(m.id, { pre: m.pre }); renderPre(m); };
        };
        renderPreSum(m);
    }

    // 卡上面只露写过的那几栏；一栏都没写就整块不出
    function renderPreSum(m) {
        const pre = m.pre || {};
        const ws = ['you', 'ta'].filter(w => pre[w]);
        document.getElementById('ks-presum').innerHTML = ws.length
            ? `<div class="ks-sec ks-mono first">前情</div>` + ws.map(w => `<div class="ks-pre ${w}"><div class="w ks-mono">${{ you: '你', ta: 'Ta' }[w]}</div><p>${esc(pre[w])}</p></div>`).join('') + `<div style="height:22px"></div>`
            : '';
    }

    // 评论：楼中楼，谁都能回谁
    function renderNotes(m) {
        const notes = m.notes || [];
        const one = c => {
            const kids = notes.filter(x => x.re == c.id);
            return `<div class="ks-cm"><div class="w ks-mono"><b class="${c.w}">${c.w === 'you' ? '你' : 'Ta'}</b><span>${fmtN(c.at)}</span></div><p>${esc(c.t)}</p>`
                + `<span class="re ks-mono" data-id="${c.id}">回复</span>${kids.length ? `<div class="kids">${kids.map(one).join('')}</div>` : ''}</div>`;
        };
        const top = notes.filter(c => !c.re || !notes.some(x => x.id == c.re));
        const tgt = S.REPLY && notes.find(c => c.id == S.REPLY);
        document.getElementById('ks-cmh').textContent = `评论 ${notes.length || ''}`;
        document.getElementById('ks-notes').innerHTML = (top.length ? top.map(one).join('') : `<div class="ks-empty-cm">还没人说话。</div>`)
            + `<div class="ks-box"><textarea id="ks-ta" rows="1" placeholder="${tgt ? '回复 ' + (tgt.w === 'you' ? '你' : 'Ta') + '：' : '说点什么…'}"></textarea>`
            + (tgt ? `<span class="x ks-mono" id="ks-nore">取消</span>` : '') + `<div class="ks-wbtn ks-mono" id="ks-wok">发</div></div>`
            + `<div class="ks-note ks-mono">在这里写一句，Ta 下一次说话的时候会看到，可以回你。</div>`;
        document.getElementById('ks-notes').onclick = e => {
            const id = e.target.dataset && e.target.dataset.id;
            if (id) { S.REPLY = +id; renderNotes(m); document.getElementById('ks-ta').focus(); }
        };
        const nore = document.getElementById('ks-nore');
        if (nore) nore.onclick = () => { S.REPLY = 0; renderNotes(m); };
        const taEl = document.getElementById('ks-ta');
        taEl.oninput = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
        document.getElementById('ks-wok').onclick = () => {
            const t = taEl.value.trim();
            if (!t) return;
            const n = { id: Date.now(), w: 'you', t, at: Date.now(), re: S.REPLY };
            m.notes.push(n);
            K.update(m.id, { notes: m.notes, touch: Date.now() });
            S.REPLY = 0; renderNotes(m);
        };
    }

    function setSoft(v) {
        S.B.forEach(b => { if (b.mat && b.mat.userData && b.mat.userData.amp) b.mat.userData.amp.value = b.mat.userData.base * v; });
        try { localStorage.setItem('keepsake_soft_mie', v); } catch (e) { }
    }

    // ── 右上角角色切换：每个角色/群聊都是独立的一个收藏库页面 ──
    function charEntries() {
        const list = [{ id: null, name: '全部', n: K.items.length }];
        (db.characters || []).forEach(c => list.push({ id: c.id, name: c.realName || '未命名角色', n: K.items.filter(x => x.charId === c.id).length }));
        (db.groups || []).forEach(g => list.push({ id: g.id, name: g.name || '未命名群聊', n: K.items.filter(x => x.charId === g.id).length }));
        return list;
    }

    function curCharName() {
        const e = charEntries().find(x => x.id === S.CHAR);
        return e ? e.name : '全部';
    }

    function renderCharBtn() {
        const el = document.getElementById('ks-char-name');
        if (el) el.textContent = curCharName();
    }

    function renderCharMenu() {
        const menu = document.getElementById('ks-char-menu');
        if (!menu) return;
        menu.innerHTML = charEntries().map(e => `
            <div class="ks-char-item ${e.id === S.CHAR ? 'on' : ''}" data-cid="${e.id == null ? '' : esc(e.id)}">
                <span class="nm">${esc(e.name)}</span><span class="n ks-mono">${e.n || ''}</span>
            </div>`).join('');
    }

    function closeCharMenu() {
        const w = document.getElementById('ks-char-wrap');
        if (w) w.classList.remove('open');
    }

    function switchChar(id) {
        S.CHAR = id || null;
        S.BATCH = 0;
        renderCharBtn(); renderCount();
        if (S.failed) { renderFallback(); return; }
        if (!S.ready) return;
        clearBubbles(); build();
    }

    function bindCharMenu() {
        const btn = document.getElementById('ks-char-btn');
        const wrap = document.getElementById('ks-char-wrap');
        if (!btn || !wrap || S._menuBound) return;
        S._menuBound = true;
        btn.onclick = e => {
            e.stopPropagation();
            if (wrap.classList.toggle('open')) renderCharMenu();
        };
        document.getElementById('ks-char-menu').onclick = e => {
            const it = e.target.closest('.ks-char-item');
            if (!it) return;
            e.stopPropagation();
            switchChar(it.dataset.cid);
        };
        document.addEventListener('click', e => { if (!wrap.contains(e.target)) closeCharMenu(); });
    }

    function renderCount() {
        const n = filtered().length;
        document.getElementById('ks-count').textContent = S.CHAR ? `${n} 颗` : `${n} 颗`;
    }

    // ── 入口：初始化场景（three.js 加载失败时降级为列表） ──
    async function initScene() {
        S.screen = document.getElementById('keepsake-screen');
        if (S.ready) {
            // 屏幕此刻可能还没 active（display:none 时 clientWidth 为 0），推到下一帧再重建
            requestAnimationFrame(() => { resize(); clearBubbles(); build(); renderCharBtn(); renderCount(); });
            return;
        }
        try {
            await ensureThree();
            const T = window.THREE;
            const canvas = document.getElementById('ks-canvas');
            S.renderer = new T.WebGLRenderer({ canvas, antialias: true });
            S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
            S.scene = new T.Scene();
            S.scene.background = new T.Color('#edf0f9');
            const pmrem = new T.PMREMGenerator(S.renderer);
            S.scene.environment = pmrem.fromScene(makeEnvScene(), 0.03).texture;
            S.camera = new T.PerspectiveCamera(32, 1, .1, 100);
            S.camera.position.set(0, 0, 13);
            // 背后一张很淡的渐变：泡要有东西可以折射，才看得出是泡
            const cv = document.createElement('canvas'); cv.width = cv.height = 512;
            const g = cv.getContext('2d');
            const gr = g.createRadialGradient(256, 230, 20, 256, 256, 360);
            gr.addColorStop(0, '#fdfdff'); gr.addColorStop(.55, '#eef1fa'); gr.addColorStop(1, '#e5e9f5');
            g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
            const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
            const bg = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
            bg.position.z = -6; S.scene.add(bg);

            bindCanvas();
            window.addEventListener('resize', resize);
            document.getElementById('ks-back').onclick = closeSheet;
            document.getElementById('ks-gapTop').onclick = closeSheet;
            const soft = document.getElementById('ks-soft');
            soft.oninput = e => setSoft(+e.target.value);
            try { const v = localStorage.getItem('keepsake_soft_mie'); if (v != null) soft.value = +v; } catch (e) { }
            S.clock = new T.Clock();
            S.ready = true;
            resize(); build(); renderCharBtn(); renderCount();
            if (!S.rafStarted) { S.rafStarted = true; tick(); }
        } catch (e) {
            console.warn('[Keepsake] three.js 场景不可用，降级为列表视图:', e);
            S.failed = true;
            showFallback();
        }
    }

    // ── 降级列表视图（three.js / WebGL 不可用时） ──
    function showFallback() {
        document.getElementById('ks-canvas').style.display = 'none';
        document.getElementById('ks-fallback').style.display = 'block';
        // 标签点击监听已在 K.open 里绑定过，这里不重复绑
        renderFallback();
    }
    function renderFallback() {
        const box = document.getElementById('ks-fallback');
        const L = filtered().sort((a, b) => (b.touch || b.timestamp) - (a.touch || a.timestamp));
        renderCharBtn(); renderCount();
        const empty = document.getElementById('ks-empty');
        if (empty) empty.style.display = L.length ? 'none' : 'flex';
        box.innerHTML = L.length ? L.map(m => {
            haze(m);
            const first = (m.lines[0] && m.lines[0].text || '').replace(/\s+/g, ' ').slice(0, 40);
            return `<div class="ks-fb-item" data-id="${esc(m.id)}">
                <div class="ks-fb-meta ks-mono">${fmtD(m.timestamp)} · ${nameOf(m)}存的${m.days > 3 ? ` · ${m.days} 天没回来看` : ''}</div>
                <h3>${esc(m.t)}</h3><p>${esc(first)}</p></div>`;
        }).join('') : `<div class="ks-empty-cm" style="margin-top:40px">还没有泡。在聊天里长按一条消息，选「存泡泡」。</div>`;
        box.onclick = e => {
            const item = e.target.closest('.ks-fb-item');
            if (!item) return;
            const m = K.items.find(x => String(x.id) === item.dataset.id);
            if (m) {
                K.touch(m.id); haze(m);
                S.screen.classList.add('ks-opened');
                document.getElementById('ks-open').classList.add('on');
                render(m);
            }
        };
        document.getElementById('ks-back').onclick = () => {
            document.getElementById('ks-open').classList.remove('on');
            S.screen.classList.remove('ks-opened');
            setTimeout(renderFallback, 150);
        };
    }

    // ── 对外入口：打开收藏库 ──
    K.open = function () {
        bindCharMenu();
        renderCharBtn();
        initScene().then(() => { renderCount(); });
    };

    K.openSaveDialog = openSaveDialog;
})();
