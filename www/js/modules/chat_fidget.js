// --- 聊天趣味互动模块：弹弹乐、河豚、哒哒哒 ---

let _fidgetState = null; // { fling, puff, chatId }

function fidgetAttach(chatId) {
    fidgetDetach();
    if (currentChatType !== 'private') return;
    const container = document.getElementById('message-area');
    if (!container || !window.AvatarFling || !window.AvatarPuff || !window.BubbleGun) return;

    const chat = db.characters.find(c => c.id === chatId);
    if (!chat) return;

    // 弹弹乐：拖拽对方头像
    const fling = window.AvatarFling.attach({
        container: container,
        row: '.message-wrapper.received',
        avatar: '.message-avatar',
        bubble: '.message-bubble',
        onPull: function(count) {
            fidgetSendReaction(chat, 'pull', count);
        },
        onFly: function(count) {
            fidgetSendReaction(chat, 'fly', count);
        }
    });

    // 河豚：长按对方头像
    const puff = window.AvatarPuff.attach({
        container: container,
        side: 'them',
        row: '.message-wrapper.received',
        anyRow: '.message-wrapper',
        avatar: '.message-avatar',
        scale: 2.4,
        onChange: function(on, byUser) {
            if (byUser) {
                fidgetSendReaction(chat, on ? 'puff-on' : 'puff-off', 1);
            }
        }
    });

    _fidgetState = { fling: fling, puff: puff, chatId: chatId };
}

function fidgetDetach() {
    if (!_fidgetState) return;
    if (_fidgetState.fling && typeof _fidgetState.fling.destroy === 'function') {
        _fidgetState.fling.destroy();
    }
    if (_fidgetState.puff && typeof _fidgetState.puff.destroy === 'function') {
        _fidgetState.puff.destroy();
    }
    _fidgetState = null;
}

// 小功能（拉头像/弹飞/河豚/哒哒哒）纯视觉效果：不入聊天记录、不发给 AI 提示。
// 保留函数签名，历史调用方无需改动。
function fidgetSendReaction(chat, kind, count) {
    /* intentionally no-op */
}

/* 一次性清洗历史遗留的小功能提示消息（视觉提示 + 发给 AI 的上下文提示）。
   命中规则：[system: 或 [system-display: 开头，且包含小功能关键词。
   返回 true 表示有清理过（调用方需要 saveData）。 */
function fidgetPurgeLegacyMessages() {
    if (typeof db === 'undefined' || !db) return false;
    const re = /^\[system(:|-display:)[\s\S]*?(拉了拉|弹飞|河豚|泄气|哒哒哒)[\s\S]*?\]$/;
    let cleaned = false;
    const purge = (history) => {
        if (!Array.isArray(history)) return;
        const kept = history.filter(m => !(m && typeof m.content === 'string' && re.test(m.content)));
        if (kept.length !== history.length) { history.length = 0; kept.forEach(m => history.push(m)); cleaned = true; }
    };
    (db.characters || []).forEach(c => purge(c.history));
    (db.groups || []).forEach(g => purge(g.history));
    return cleaned;
}

// 哒哒哒：从长按菜单触发
function fidgetBubbleGun(messageWrapper) {
    if (!window.BubbleGun) {
        showToast('哒哒哒模块未加载');
        return;
    }
    const bubble = messageWrapper.querySelector('.message-bubble.received');
    const avatar = messageWrapper.querySelector('.message-avatar');
    if (!bubble || !avatar) {
        showToast('找不到目标');
        return;
    }
    const chat = (currentChatType === 'private')
        ? db.characters.find(c => c.id === currentChatId)
        : null;
    window.BubbleGun.fire(bubble, avatar).then(function(played) {
        if (played && chat) {
            fidgetSendReaction(chat, 'bubble-gun', 1);
        }
    });
}

// 暴露给 chat_ops.js 的菜单调用
window.fidgetBubbleGun = fidgetBubbleGun;
window.fidgetPurgeLegacyMessages = fidgetPurgeLegacyMessages;

// 监听聊天切换，自动 attach/detach（在 openChatRoom 和 switchScreen 中调用）
window.fidgetAttach = fidgetAttach;
window.fidgetDetach = fidgetDetach;
