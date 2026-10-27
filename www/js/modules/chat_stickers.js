// --- 表情回应 & 背景贴纸 (js/modules/chat_stickers.js) ---
// 玩法参考 github.com/Anko3o/cute-chat-stickers：
// 长按消息 -> 给该消息贴表情回应；长按空白处 -> 往聊天背景贴 emoji。角色通过 AI 标记使用。

const CS_REACTION_EMOJIS = ['❤️', '🥺', '😂', '🫣', '😡', '🐰', '🫶', '😍', '😭', '👍', '🙏', '✨', '😘', '🤔', '💀', '🎀'];
const CS_MAX_BG_STICKERS = 60;
const CS_MAX_REACTIONS_PER_MSG = 12;
const CS_MAX_EVENTS = 40;

let csActivePicker = null;
let csBgLongPressTimer = null;

function csGetCurrentChat() {
    return (currentChatType === 'private')
        ? db.characters.find(c => c.id === currentChatId)
        : db.groups.find(g => g.id === currentChatId);
}

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

/* ===================== 表情回应 ===================== */

function buildReactionRow(message, chat) {
    const row = document.createElement('div');
    row.className = 'cs-reaction-row';
    // 按 emoji 分组保序
    const groups = [];
    (message.reactions || []).forEach(r => {
        let g = groups.find(x => x.emoji === r.e);
        if (!g) { g = { emoji: r.e, items: [] }; groups.push(g); }
        g.items.push(r);
    });
    const myKey = 'user_me';
    groups.forEach(g => {
        const chip = document.createElement('span');
        chip.className = 'cs-reaction-chip' + (g.items.some(r => r.k === myKey) ? ' mine' : '');
        chip.textContent = g.emoji;
        if (g.items.length > 1) {
            const cnt = document.createElement('i');
            cnt.textContent = g.items.length;
            chip.appendChild(cnt);
        }
        chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            csQuickToggleReaction(message, g.emoji);
        });
        row.appendChild(chip);
    });
    return row;
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
    const wrapper = messageArea.querySelector(`.message-wrapper[data-id="${message.id}"]`);
    if (!wrapper) return;
    const old = wrapper.querySelector('.cs-reaction-row');
    if (old) old.remove();
    if (message.reactions && message.reactions.length > 0) {
        wrapper.appendChild(buildReactionRow(message, chat));
    }
}

// 通用 emoji 选择面板（表情回应 & 背景贴纸共用）
function csOpenEmojiPicker(x, y, onPick) {
    csCloseEmojiPicker();
    const picker = document.createElement('div');
    picker.className = 'cs-emoji-picker';
    CS_REACTION_EMOJIS.forEach(emoji => {
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

function csOpenReactionPicker(messageId, wrapperEl) {
    const chat = csGetCurrentChat();
    if (!chat) return;
    const message = chat.history.find(m => m.id === messageId);
    if (!message || message.isWithdrawn) return;
    const rect = wrapperEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 130;
    const y = rect.top;
    csOpenEmojiPicker(x, y, (emoji) => csQuickToggleReaction(message, emoji));
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
        if (e.key === 'Escape') csCloseEmojiPicker();
    });
}
