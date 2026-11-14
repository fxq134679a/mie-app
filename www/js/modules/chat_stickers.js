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

// 用户长按气泡/贴背景时的表情面板列表：全局自定义 db.reactionPickerEmojis，空则用默认
function csGetPickerEmojis() {
    const custom = (typeof db !== 'undefined' && Array.isArray(db.reactionPickerEmojis)) ? db.reactionPickerEmojis.filter(e => typeof e === 'string' && e.trim()) : [];
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

/* 贴纸小气泡：无框 emoji + 小尾巴，贴在气泡下内端（角色消息→右端，用户消息→左端，互为镜像）。
   点按 → 上方弹垃圾桶删除；长按 → 放大并可拖动换位置（位置存 message.reactionPos） */
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
    // 渲染帧后按气泡实际宽度锚定：贴纸跟随气泡内端（镜像），下一颗气泡自然被推下去
    // rAF 优先，setTimeout 兜底（个别 WebView 不派发渲染帧时也能锚上）；函数幂等可重复执行
    const anchorTapbackRow = () => {
        try {
            const wrapper = row.closest('.message-wrapper');
            const bubble = wrapper && wrapper.querySelector('.message-bubble');
            if (!wrapper || !bubble || !document.contains(row)) return;
            const wRect = wrapper.getBoundingClientRect();
            const bRect = bubble.getBoundingClientRect();
            const rRect = row.getBoundingClientRect();
            if (isSent) {
                // 用户消息（蓝色气泡）：贴纸对齐气泡左端
                row.style.alignSelf = 'flex-start';
                row.style.marginLeft = Math.max(6, bRect.left - wRect.left + 6) + 'px';
                row.style.marginRight = 'auto';
            } else {
                // 角色消息（灰白气泡）：贴纸对齐气泡右端
                row.style.alignSelf = 'flex-start';
                let ml = (bRect.right - wRect.left) - rRect.width - 6;
                row.style.marginLeft = Math.max(46, ml) + 'px';
            }
        } catch (e) { /* 测量失败走 CSS 默认位置 */ }
    };
    requestAnimationFrame(anchorTapbackRow);
    setTimeout(anchorTapbackRow, 80);
    return row;
}

/* 单枚贴纸的交互：点按弹垃圾桶 / 长按 350ms 放大进入拖拽 */
function csBindTapbackChip(chip, message, g) {
    let trash = null;

    const closeTrash = () => { if (trash) { trash.remove(); trash = null; } };

    chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (trash) { closeTrash(); return; }
        document.querySelectorAll('.cs-tapback-trash').forEach(t => t.remove());
        trash = document.createElement('button');
        trash.type = 'button';
        trash.className = 'cs-tapback-trash';
        trash.setAttribute('aria-label', '删除贴纸');
        trash.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        chip.appendChild(trash);
        trash.addEventListener('click', (e2) => {
            e2.stopPropagation();
            closeTrash();
            csQuickToggleReaction(message, g.emoji);
        });
        setTimeout(() => {
            document.addEventListener('click', closeTrash, { once: true });
        }, 0);
    });

    /* 长按拖拽：350ms 触发，放大 + 跟手移动，松手保存位置 */
    let pressTimer = null;
    let dragging = false;
    let sx = 0, sy = 0, baseDx = 0, baseDy = 0;

    chip.addEventListener('touchstart', (ev) => {
        const t = ev.touches[0];
        if (!t) return;
        pressTimer = setTimeout(() => {
            dragging = true;
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
        const ndy = Math.max(-70, Math.min(150, baseDy + (t.clientY - sy)));
        chip.style.setProperty('--tb-dx', ndx + 'px');
        chip.style.setProperty('--tb-dy', ndy + 'px');
        chip.__pendingPos = { dx: Math.round(ndx), dy: Math.round(ndy) };
    }, { passive: false });

    const endDrag = async () => {
        clearTimeout(pressTimer);
        if (!dragging) return;
        dragging = false;
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
        if (e.key === 'Escape') csCloseEmojiPicker();
    });
}
