// --- 表情回应 & 背景贴纸 (js/modules/chat_stickers.js) ---
// 玩法参考 github.com/Anko3o/cute-chat-stickers：
// 长按消息 -> 给该消息贴表情回应；长按空白处 -> 往聊天背景贴 emoji。角色通过 AI 标记使用。

const CS_REACTION_EMOJIS = ['❤️', '🥺', '😂', '🫣', '😡', '🐰', '🫶', '😍', '😭', '👍', '🙏', '✨', '😘', '🤔', '💀', '🎀'];
const CS_MAX_BG_STICKERS = 60;
const CS_MAX_REACTIONS_PER_MSG = 12;
const CS_MAX_EVENTS = 40;

let csActivePicker = null;
let csActiveReactionBar = null;
let csActiveTrash = null;
let csBgLongPressTimer = null;

function csGetCurrentChat() {
    return (currentChatType === 'private')
        ? db.characters.find(c => c.id === currentChatId)
        : db.groups.find(g => g.id === currentChatId);
}

/* 消息节点查找：B 模式 message-wrapper / C(Claude) 模式 c-row 双兼容 */
function csFindMsgRow(messageId) {
    const b = (typeof messageArea !== 'undefined' && messageArea)
        ? messageArea.querySelector(`.message-wrapper[data-id="${messageId}"]`) : null;
    if (b) return b;
    return document.querySelector(`#c-list .c-row[data-mid="${messageId}"]`);
}
function csFindBubbleOf(row) {
    return row ? (row.querySelector('.message-bubble') || row.querySelector('.c-bub')) : null;
}
/* 贴纸行的宿主：B 模式是 wrapper，C 模式是 c-body（c-row 是横向 flex，不能直接塞） */
function csStickerHostOf(row) {
    if (!row) return null;
    return row.classList.contains('c-row') ? (row.querySelector('.c-body') || row) : row;
}

// 用户长按气泡/贴背景时的表情面板列表：角色自带 reactionPickerEmojis 优先，
// 其次全局自定义 db.reactionPickerEmojis，都没有则用默认
function csGetPickerEmojis() {
    const clean = (arr) => Array.isArray(arr) ? arr.filter(e => typeof e === 'string' && e.trim()) : [];
    let own = [];
    try {
        const chat = csGetCurrentChat();
        if (chat) own = clean(chat.reactionPickerEmojis);
    } catch (e) { /* 不在聊天室里时忽略 */ }
    if (own.length) return own;
    const custom = (typeof db !== 'undefined') ? clean(db.reactionPickerEmojis) : [];
    return custom.length ? custom : CS_REACTION_EMOJIS;
}
window.csGetPickerEmojis = csGetPickerEmojis;

// 发送者在 reactions/bgStickers 里的统一 key
function csSenderKeyOf(message) {
    if (message.role === 'user') return 'user_me';
    return message.senderId || 'assistant';
}

function csDisplayNameOfSender(chat, chatType, key) {
    if (key === 'user_me') {
        return chatType === 'private'
            ? ((chat.myRemarkName && chat.myRemarkName.trim()) || chat.myName || '对方')
            : (chat.me ? chat.me.nickname : '对方');
    }
    if (key === 'assistant') return chatType === 'private' ? (chat.remarkName || chat.realName || '对方') : '对方';
    if (chatType === 'group' && chat.members) {
        const m = chat.members.find(m => m.id === key);
        if (m) return m.groupNickname || m.realName;
    }
    return '对方';
}

function csLogEvent(chat, evt) {
    if (!chat) return;
    if (!chat.stickerEvents) chat.stickerEvents = [];
    chat.stickerEvents.push(Object.assign({ time: Date.now() }, evt));
    if (chat.stickerEvents.length > CS_MAX_EVENTS) {
        chat.stickerEvents = chat.stickerEvents.slice(-CS_MAX_EVENTS);
    }
}

function csStripContent(content) {
    if (!content) return '';
    const m = String(content).match(/\[.*?的消息[：:]([\s\S]+?)\]/);
    let text = m ? m[1] : String(content);
    return text.trim();
}

/* ===================== 表情回应（iMessage 贴表情风格） ===================== */

/* 贴纸小气泡：无框 emoji + 小尾巴，压在气泡顶角上（角色消息→右上角，用户消息→左上角，互为镜像）。
   自己贴的：点按 → 上方浮出垃圾桶，点垃圾桶才删（只删自己那枚）；角色贴的：点按无反应，删不掉。
   长按 350ms → 放大并可拖动换位置（位置存 message.reactionPos） */
function buildReactionRow(message, chat) {
    const row = document.createElement('div');
    row.className = 'cs-reaction-row';
    const isSent = message.role === 'user';
    // 按 emoji 分组保序
    const groups = [];
    (message.reactions || []).forEach(r => {
        let g = groups.find(x => x.emoji === r.e);
        if (!g) { g = { emoji: r.e, items: [] }; groups.push(g); }
        g.items.push(r);
    });
    groups.forEach(g => {
        const chip = document.createElement('span');
        chip.className = 'cs-tapback from-' + (isSent ? 'sent' : 'received') + (g.items.some(r => r.k === 'user_me') ? ' mine' : '');
        chip.textContent = g.emoji;
        const pos = (message.reactionPos || {})[g.emoji];
        if (pos && (pos.dx || pos.dy)) {
            chip.style.setProperty('--tb-dx', pos.dx + 'px');
            chip.style.setProperty('--tb-dy', pos.dy + 'px');
        }
        csBindTapbackChip(chip, message, g);
        row.appendChild(chip);
    });
    // 渲染帧后按气泡实际位置锚定：贴纸压在气泡顶角上，下一颗气泡自然被推下去
    // rAF 优先，setTimeout 兜底（个别 WebView 不派发渲染帧时也能锚上）；函数幂等可重复执行
    const anchorTapbackRow = () => {
        try {
            const wrapper = row.parentElement; // B: message-wrapper / C: c-body
            const bubble = csFindBubbleOf(wrapper);
            if (!wrapper || !bubble || !document.contains(row)) return;
            wrapper.classList.add('has-tapback');
            const wRect = wrapper.getBoundingClientRect();
            const bRect = bubble.getBoundingClientRect();
            // 用 offsetWidth/Height（布局尺寸），chip 带拖拽 translate 时 rect 会被带偏
            const rowW = row.offsetWidth, rowH = row.offsetHeight;
            // 垂直：贴纸下半部压住气泡顶边 10px；水平：贴纸压在气泡顶角、外缘略超出气泡边缘
            row.style.top = ((bRect.top - wRect.top) - rowH + 10) + 'px';
            if (isSent) {
                // 用户消息（蓝色气泡）：贴纸压左上角，左缘超出气泡左缘 14px
                row.style.left = Math.max(0, (bRect.left - wRect.left) - 14) + 'px';
            } else {
                // 角色消息（灰白气泡）：贴纸压右上角，右缘超出气泡右缘 14px，避开头像
                let left = (bRect.right - wRect.left) - rowW + 14;
                row.style.left = Math.max(46, left) + 'px';
            }
        } catch (e) { /* 测量失败走 CSS 默认位置 */ }
    };
    requestAnimationFrame(anchorTapbackRow);
    // 字体/头像等异步资源会改变气泡宽度，多时间点重锚 + 字体就绪后兜底
    [80, 300, 900].forEach(t => setTimeout(anchorTapbackRow, t));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => anchorTapbackRow());
    return row;
}

/* 单枚贴纸的交互：自己贴的点按浮出垃圾桶 / 角色贴的点按什么都不做；长按 350ms 放大进入拖拽 */
function csBindTapbackChip(chip, message, g) {
    if (csGroupHasMine(g)) {
        chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (Date.now() - (chip.__csDragEndAt || 0) < 500) return; // 刚拖完位置不算点按
            csToggleTrashBadge(chip, message, g.emoji);
        });
    }

    /* 长按拖拽：350ms 触发，放大 + 跟手移动，松手保存位置 */
    let pressTimer = null;
    let dragging = false;
    let sx = 0, sy = 0, baseDx = 0, baseDy = 0;

    chip.addEventListener('touchstart', (ev) => {
        ev.stopPropagation(); // 不让气泡长按菜单被触发
        const t = ev.touches[0];
        if (!t) return;
        pressTimer = setTimeout(() => {
            dragging = true;
            csCloseTrashBadge();
            const p = (message.reactionPos || {})[g.emoji] || {};
            baseDx = p.dx || 0; baseDy = p.dy || 0;
            sx = t.clientX; sy = t.clientY;
            chip.classList.add('tb-dragging');
            if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
        }, 350);
    }, { passive: true });

    chip.addEventListener('touchmove', (ev) => {
        if (!dragging) {
            clearTimeout(pressTimer); // 未触发长按就滑动 → 取消，让页面正常滚
            return;
        }
        ev.preventDefault();
        const t = ev.touches[0];
        if (!t) return;
        const ndx = Math.max(-170, Math.min(170, baseDx + (t.clientX - sx)));
        const ndy = Math.max(-110, Math.min(200, baseDy + (t.clientY - sy)));
        chip.style.setProperty('--tb-dx', ndx + 'px');
        chip.style.setProperty('--tb-dy', ndy + 'px');
        chip.__pendingPos = { dx: Math.round(ndx), dy: Math.round(ndy) };
    }, { passive: false });

    const endDrag = async () => {
        clearTimeout(pressTimer);
        if (!dragging) return;
        dragging = false;
        chip.__csDragEndAt = Date.now();
        chip.classList.remove('tb-dragging');
        if (chip.__pendingPos) {
            if (!message.reactionPos) message.reactionPos = {};
            message.reactionPos[g.emoji] = chip.__pendingPos;
            chip.__pendingPos = null;
            try { await saveData(); } catch (e) {}
        }
    };
    chip.addEventListener('touchend', endDrag);
    chip.addEventListener('touchcancel', endDrag);
}

function csGroupHasMine(g) {
    return g.items.some(r => r.k === 'user_me');
}

const CS_TRASH_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 14h8l1-14"/></svg>';

/* 点自己贴的表情 → 正上方浮出垃圾桶；垃圾桶是全局唯一的，再点一次贴纸就收掉 */
function csToggleTrashBadge(chip, message, emoji) {
    const open = csActiveTrash && csActiveTrash.__chip === chip;
    csCloseTrashBadge();
    if (open) return;

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'cs-tapback-trash';
    badge.innerHTML = CS_TRASH_SVG;
    badge.__chip = chip;
    badge.addEventListener('click', (ev) => {
        ev.stopPropagation();
        csCloseTrashBadge();
        csRemoveMyReaction(message, emoji);
    });
    document.body.appendChild(badge);

    const cr = chip.getBoundingClientRect();
    const bw = badge.offsetWidth, bh = badge.offsetHeight;
    let left = cr.left + cr.width / 2 - bw / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - bw - 6));
    let top = cr.top - bh - 4;
    if (top < 64) top = cr.bottom + 4; // 贴着聊天室顶栏时改到下方
    badge.style.left = left + 'px';
    badge.style.top = top + 'px';
    csActiveTrash = badge;

    setTimeout(() => {
        document.addEventListener('click', csCloseTrashBadge, { once: true });
    }, 0);
}

function csCloseTrashBadge() {
    if (csActiveTrash) {
        csActiveTrash.remove();
        csActiveTrash = null;
    }
}

// 点垃圾桶 → 只删我自己贴的那枚表情，角色贴的同款表情留着
async function csRemoveMyReaction(message, emoji) {
    const chat = csGetCurrentChat();
    if (!chat || !message) return;
    message.reactions = (message.reactions || []).filter(r => !(r.e === emoji && r.k === 'user_me'));
    try { await saveData(); } catch (e) {}
    csRefreshReactionRow(chat, message);
}

async function csQuickToggleReaction(message, emoji) {
    const chat = csGetCurrentChat();
    if (!chat || !message) return;
    const existing = (message.reactions || []).find(r => r.k === 'user_me' && r.e === emoji);
    if (existing) {
        message.reactions = message.reactions.filter(r => !(r.k === 'user_me' && r.e === emoji));
    } else {
        if (!message.reactions) message.reactions = [];
        if (message.reactions.length >= CS_MAX_REACTIONS_PER_MSG) return showToast('贴太多啦');
        message.reactions.push({ e: emoji, k: 'user_me', t: Date.now() });
    }
    csLogEvent(chat, {
        type: 'react', emoji: emoji, whoKey: 'user_me',
        targetKey: csSenderKeyOf(message), excerpt: csStripContent(message.content).slice(0, 12)
    });
    await saveData();
    csRefreshReactionRow(chat, message);
}

function csRefreshReactionRow(chat, message) {
    if (!chat || !message || currentChatId !== chat.id) return;
    csCloseTrashBadge(); // 整行会被重建，浮标跟着收掉
    const wrapper = csFindMsgRow(message.id);
    if (!wrapper) return;
    const old = wrapper.querySelector('.cs-reaction-row');
    if (old) old.remove();
    if (message.reactions && message.reactions.length > 0) {
        wrapper.appendChild(buildReactionRow(message, chat)); // B: wrapper / C: c-row（内部锚到 c-bub）
    }
}

/* ===================== 贴贴纸（大 emoji 贴纸，贴在气泡下方内侧） ===================== */

const CS_MAX_STICKERS_PER_MSG = 6;

function buildStickerRow(message, chat) {
    const row = document.createElement('div');
    row.className = 'cs-sticker-row';
    const isSent = message.role === 'user';
    (message.stickers || []).forEach(s => {
        const el = document.createElement('span');
        el.className = 'cs-big-sticker';
        el.textContent = s.e;
        if (s.dx || s.dy) {
            el.style.setProperty('--st-dx', (s.dx || 0) + 'px');
            el.style.setProperty('--st-dy', (s.dy || 0) + 'px');
        }
        csBindStickerEl(el, message, s);
        row.appendChild(el);
    });
    // 渲染帧后锚定到气泡内端下方（角色消息→右端，用户消息→左端，镜像）
    const anchorStickerRow = () => {
        try {
            const wrapper = row.parentElement; // B: message-wrapper / C: c-body
            const bubble = csFindBubbleOf(wrapper);
            if (!wrapper || !bubble || !document.contains(row)) return;
            const wRect = wrapper.getBoundingClientRect();
            const bRect = bubble.getBoundingClientRect();
            const rowW = row.offsetWidth;
            row.style.alignSelf = 'flex-start';
            if (isSent) {
                row.style.marginLeft = Math.max(6, bRect.left - wRect.left + 8) + 'px';
            } else {
                let ml = (bRect.right - wRect.left) - rowW - 8;
                row.style.marginLeft = Math.max(46, ml) + 'px';
            }
        } catch (e) { /* 测量失败走 CSS 默认位置 */ }
    };
    requestAnimationFrame(anchorStickerRow);
    // 字体/头像等异步资源会改变气泡宽度，多时间点重锚 + 字体就绪后兜底
    [80, 300, 900].forEach(t => setTimeout(anchorStickerRow, t));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => anchorStickerRow());
    return row;
}

/* 单枚大贴纸的交互：点按直接删除 / 长按 350ms 放大进入拖拽 */
function csBindStickerEl(el, message, s) {
    el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        csRemoveSticker(message, s.id);
    });

    let pressTimer = null;
    let dragging = false;
    let sx = 0, sy = 0, baseDx = 0, baseDy = 0;

    el.addEventListener('touchstart', (ev) => {
        ev.stopPropagation(); // 不让气泡长按菜单被触发
        const t = ev.touches[0];
        if (!t) return;
        pressTimer = setTimeout(() => {
            dragging = true;
            baseDx = s.dx || 0; baseDy = s.dy || 0;
            sx = t.clientX; sy = t.clientY;
            el.classList.add('st-dragging');
            if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
        }, 350);
    }, { passive: true });

    el.addEventListener('touchmove', (ev) => {
        if (!dragging) {
            clearTimeout(pressTimer);
            return;
        }
        ev.preventDefault();
        const t = ev.touches[0];
        if (!t) return;
        const ndx = Math.max(-240, Math.min(240, baseDx + (t.clientX - sx)));
        const ndy = Math.max(-240, Math.min(240, baseDy + (t.clientY - sy)));
        el.style.setProperty('--st-dx', ndx + 'px');
        el.style.setProperty('--st-dy', ndy + 'px');
        el.__pendingPos = { dx: Math.round(ndx), dy: Math.round(ndy) };
    }, { passive: false });

    const endDrag = async () => {
        clearTimeout(pressTimer);
        if (!dragging) return;
        dragging = false;
        el.classList.remove('st-dragging');
        if (el.__pendingPos) {
            s.dx = el.__pendingPos.dx;
            s.dy = el.__pendingPos.dy;
            el.__pendingPos = null;
            try { await saveData(); } catch (e) {}
        }
    };
    el.addEventListener('touchend', endDrag);
    el.addEventListener('touchcancel', endDrag);
}

async function csAddSticker(message, emoji) {
    if (!message) return;
    if (!message.stickers) message.stickers = [];
    if (message.stickers.length >= CS_MAX_STICKERS_PER_MSG) { showToast('贴纸太多啦'); return; }
    message.stickers.push({
        id: `stk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        e: emoji, dx: 0, dy: 0, t: Date.now()
    });
    try { await saveData(); } catch (e) {}
    csRefreshStickerRow(csGetCurrentChat(), message);
}

async function csRemoveSticker(message, stickerId) {
    const chat = csGetCurrentChat();
    if (!chat || !message) return;
    message.stickers = (message.stickers || []).filter(s => s.id !== stickerId);
    try { await saveData(); } catch (e) {}
    csRefreshStickerRow(chat, message);
}

function csRefreshStickerRow(chat, message) {
    if (!chat || !message || currentChatId !== chat.id) return;
    const wrapper = csFindMsgRow(message.id);
    if (!wrapper) return;
    const old = wrapper.querySelector('.cs-sticker-row');
    if (old) old.remove();
    if (message.stickers && message.stickers.length > 0) {
        const host = csStickerHostOf(wrapper);
        if (host) host.appendChild(buildStickerRow(message, chat));
    }
}

// 长按菜单「贴贴纸」入口：弹出 emoji 选择面板
function csOpenStickerPicker(messageId, wrapperEl) {
    const chat = csGetCurrentChat();
    if (!chat) return;
    const message = chat.history.find(m => m.id === messageId);
    if (!message || message.isWithdrawn) return;
    const rect = wrapperEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 130;
    const y = rect.top;
    csOpenEmojiPicker(x, y, (emoji) => csAddSticker(message, emoji));
}

// 通用 emoji 选择面板（表情回应 & 背景贴纸共用）
function csOpenEmojiPicker(x, y, onPick) {
    csCloseEmojiPicker();
    const picker = document.createElement('div');
    picker.className = 'cs-emoji-picker';
    csGetPickerEmojis().forEach(emoji => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cs-emoji-cell';
        cell.textContent = emoji;
        cell.addEventListener('click', (ev) => {
            ev.stopPropagation();
            csCloseEmojiPicker();
            onPick(emoji);
        });
        picker.appendChild(cell);
    });
    document.body.appendChild(picker);

    const rect = picker.getBoundingClientRect();
    const pad = 8;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (x < pad) x = pad;
    if (y + rect.height > window.innerHeight - pad) y = y - rect.height - 48;
    if (y < pad) y = pad;
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';

    csActivePicker = picker;
    setTimeout(() => {
        document.addEventListener('click', csCloseEmojiPicker, { once: true });
    }, 0);
}

function csCloseEmojiPicker() {
    if (csActivePicker) {
        csActivePicker.remove();
        csActivePicker = null;
    }
}

/* 长按气泡直接弹出的 iMessage 式胶囊表情栏：横向一排 emoji 装在液态玻璃胶囊里，
   优先显示在气泡上方（放不下则到下方）。返回 { placed, height } 供下方功能菜单避开胶囊。 */
function csOpenReactionBar(message, wrapperEl) {
    const chat = csGetCurrentChat();
    if (!chat || !message || message.isWithdrawn || !wrapperEl) return null;
    csCloseReactionBar();
    const bar = document.createElement('div');
    bar.className = 'cs-reaction-bar';
    csGetPickerEmojis().forEach(emoji => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cs-reaction-bar-cell';
        cell.textContent = emoji;
        cell.addEventListener('click', (ev) => {
            ev.stopPropagation();
            csQuickToggleReaction(message, emoji);
            removeContextMenu(); // 贴完即收：胶囊和功能菜单一起关闭
        });
        bar.appendChild(cell);
    });
    document.body.appendChild(bar);

    // 定位：优先气泡上方居中；贴着顶栏时改到气泡下方
    const ar = wrapperEl.getBoundingClientRect();
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    const pad = 10;
    let left = ar.left + ar.width / 2 - bw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - bw - pad));
    const safeTop = 64; // 预留聊天室顶栏高度
    let top, placed;
    if (ar.top - bh - 10 >= safeTop) {
        top = ar.top - bh - 10;
        placed = 'above';
    } else {
        top = ar.bottom + 10;
        placed = 'below';
        bar.classList.add('cs-bar-below');
    }
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
    csActiveReactionBar = bar;
    return { placed: placed, height: bh + 10 };
}

function csCloseReactionBar() {
    if (csActiveReactionBar) {
        csActiveReactionBar.remove();
        csActiveReactionBar = null;
    }
}

// AI 使用：[贴表情:emoji] / [贴表情:成员名:emoji]
function csApplyAiReaction(chat, chatType, reactorName, emoji) {
    let reactorKey = 'assistant';
    if (chatType === 'group') {
        const member = (chat.members || []).find(m => m.realName === reactorName || m.groupNickname === reactorName);
        if (!member) return false;
        reactorKey = member.id;
    }
    // 目标：最近一条不是自己发的、可见的消息
    const target = [...chat.history].reverse().find(m => {
        if (m.isWithdrawn || m.isThinking || m.isStatusUpdate) return false;
        if (m.role !== 'user' && m.role !== 'assistant') return false;
        if (!m.content || /\[system[：: -]|\[system-display[：:]/.test(m.content)) return false;
        return csSenderKeyOf(m) !== reactorKey;
    });
    if (!target) return false;
    if (!target.reactions) target.reactions = [];
    if (target.reactions.some(r => r.k === reactorKey && r.e === emoji)) return true; // 已贴过，忽略
    if (target.reactions.length >= CS_MAX_REACTIONS_PER_MSG) return false;
    target.reactions.push({ e: emoji, k: reactorKey, t: Date.now() });
    csLogEvent(chat, {
        type: 'react', emoji: emoji, whoKey: reactorKey,
        targetKey: csSenderKeyOf(target), excerpt: csStripContent(target.content).slice(0, 12)
    });
    csRefreshReactionRow(chat, target);
    return true;
}

/* ===================== 背景贴纸 ===================== */

function csEnsureBgLayer() {
    let layer = document.getElementById('bg-sticker-layer');
    if (!layer && chatRoomScreen) {
        layer = document.createElement('div');
        layer.id = 'bg-sticker-layer';
        chatRoomScreen.appendChild(layer);
    }
    return layer;
}

function csRenderBgStickers() {
    const layer = csEnsureBgLayer();
    if (!layer) return;
    layer.innerHTML = '';
    const chat = csGetCurrentChat();
    if (!chat || !chat.bgStickers) return;
    chat.bgStickers.forEach(s => layer.appendChild(csBuildBgStickerEl(chat, s)));
}

function csBuildBgStickerEl(chat, s) {
    const el = document.createElement('span');
    el.className = 'bg-sticker';
    el.textContent = s.e;
    el.style.left = s.x + '%';
    el.style.top = s.y + '%';
    el.style.fontSize = (s.size || 30) + 'px';
    el.style.transform = `translate(-50%, -50%) rotate(${s.rot || 0}deg)`;
    // 长按/右键移除
    const tryRemove = (x, y) => {
        createContextMenu([
            { label: '移除这枚贴纸', action: async () => {
                chat.bgStickers = (chat.bgStickers || []).filter(i => i.id !== s.id);
                await saveData();
                csRenderBgStickers();
            }},
            { label: '取消', action: () => {} }
        ], x, y);
    };
    el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        tryRemove(ev.clientX, ev.clientY);
    });
    let pressTimer = null;
    el.addEventListener('touchstart', (ev) => {
        const t = ev.touches[0];
        pressTimer = setTimeout(() => tryRemove(t.clientX, t.clientY), 450);
    }, { passive: true });
    el.addEventListener('touchend', () => clearTimeout(pressTimer));
    el.addEventListener('touchmove', () => clearTimeout(pressTimer));
    return el;
}

async function csAddBgSticker(chat, emoji, byKey, xPct, yPct) {
    if (!chat) return;
    if (!chat.bgStickers) chat.bgStickers = [];
    if (chat.bgStickers.length >= CS_MAX_BG_STICKERS) {
        chat.bgStickers = chat.bgStickers.slice(-CS_MAX_BG_STICKERS + 1);
    }
    const sticker = {
        id: `bgs_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        e: emoji, k: byKey,
        x: Math.round(xPct * 10) / 10,
        y: Math.round(yPct * 10) / 10,
        rot: Math.round((Math.random() * 36 - 18)),
        size: Math.round(26 + Math.random() * 8),
        t: Date.now()
    };
    chat.bgStickers.push(sticker);
    csLogEvent(chat, { type: 'bg', emoji: emoji, whoKey: byKey });
    if (chat.id === currentChatId) csRenderBgStickers();
    return sticker;
}

// 用户在空白处长按时：以聊天室比例为坐标
function csOpenBgStickerPicker(x, y) {
    csOpenEmojiPicker(x, y, async (emoji) => {
        const chat = csGetCurrentChat();
        if (!chat) return;
        const rect = chatRoomScreen.getBoundingClientRect();
        const xPct = ((x - rect.left) / rect.width) * 100;
        const yPct = ((y - rect.top) / rect.height) * 100;
        await csAddBgSticker(chat, emoji, 'user_me', xPct, yPct);
        await saveData();
    });
}

// AI 使用：[贴背景:emoji] / [贴背景:成员名:emoji]
function csApplyAiBgSticker(chat, chatType, reactorName, emoji, targetChatId, targetChatType) {
    let reactorKey = 'assistant';
    let displayName = chat.remarkName || chat.realName || '对方';
    if (chatType === 'group') {
        const member = (chat.members || []).find(m => m.realName === reactorName || m.groupNickname === reactorName);
        if (!member) return false;
        reactorKey = member.id;
        displayName = member.groupNickname || member.realName;
    }
    const xPct = 10 + Math.random() * 72;
    const yPct = 14 + Math.random() * 56;
    csAddBgSticker(chat, emoji, reactorKey, xPct, yPct);
    // 系统提示条
    const notice = {
        id: `msg_${Date.now()}_${Math.random()}`,
        role: 'system',
        content: `[system-display:${displayName} 给聊天背景贴了一个 ${emoji}]`,
        timestamp: Date.now(),
        isContextDisabled: true
    };
    chat.history.push(notice);
    addMessageBubble(notice, targetChatId, targetChatType);
    return true;
}

/* ===================== AI 提示词 ===================== */

function buildStickerPromptSection(chat, chatType) {
    let s = '\n[表情互动]\n你可以在回复中使用以下特殊标记（不会显示为聊天消息，单独成行）：\n';
    if (chatType === 'group') {
        s += '- [贴表情:你的群昵称:emoji]：给其他人的最新消息贴表情回应，如 [贴表情:';
        const firstMember = (chat.members && chat.members[0]) ? (chat.members[0].groupNickname || chat.members[0].realName) : '昵称';
        s += `${firstMember}:❤️]\n`;
        s += `- [贴背景:你的群昵称:emoji]：往聊天背景贴一枚emoji，如 [贴背景:${firstMember}:🦊]\n`;
    } else {
        s += '- [贴表情:emoji]：给我的最新消息贴上表情回应，如 [贴表情:❤️]\n';
        s += '- [贴背景:emoji]：往聊天背景贴一枚emoji，如 [贴背景:🦊]\n';
    }
    s += '每次回复最多用其中一个，只在情绪自然契合时偶尔使用，不要频繁使用。\n';
    // 角色可贴表情白名单：设置后只能从列表里选
    const aiEmojis = Array.isArray(chat.stickerEmojis) ? chat.stickerEmojis.filter(e => typeof e === 'string' && e.trim()) : [];
    if (aiEmojis.length > 0) {
        s += `注意：你贴表情时只能从这些表情中选择：${aiEmojis.join(' ')} ，不要使用列表以外的表情。\n`;
    }

    const events = (chat.stickerEvents || []).slice(-6);
    if (events.length > 0) {
        s += '最近的表情互动：\n';
        events.forEach(ev => {
            const who = csDisplayNameOfSender(chat, chatType, ev.whoKey);
            if (ev.type === 'bg') {
                s += `（${who}给聊天背景贴了一个${ev.emoji}）\n`;
            } else {
                const target = csDisplayNameOfSender(chat, chatType, ev.targetKey);
                s += `（${who}给${target}的「${ev.excerpt || '消息'}」消息贴了${ev.emoji}）\n`;
            }
        });
    }
    return s;
}

/* ===================== 初始化 ===================== */

function initChatStickers() {
    csEnsureBgLayer();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { csCloseEmojiPicker(); csCloseTrashBadge(); }
    });
}
