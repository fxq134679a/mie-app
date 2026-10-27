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

function fidgetSendReaction(chat, kind, count) {
    if (!chat || !chat.history) return;
    let visualText = '';
    let contextText = '';
    const myName = chat.myName || '我';
    const realName = chat.realName || chat.name || '对方';

    if (kind === 'pull') {
        visualText = `${myName}拉了拉${realName}的头`;
        contextText = `[system: ${myName}拉了拉${realName}的头像，像拉弹簧一样拉了一下就松手了]`;
    } else if (kind === 'fly') {
        visualText = `${myName}把${realName}弹飞了！`;
        contextText = `[system: ${myName}用力把${realName}的头像拉得很长，然后松手，${realName}被弹飞出去了]`;
    } else if (kind === 'puff-on') {
        visualText = `${realName}被吹成河豚了！`;
        contextText = `[system: ${myName}长按${realName}的头像，${realName}像河豚一样鼓起来了]`;
    } else if (kind === 'puff-off') {
        visualText = `${realName}泄气了…`;
        contextText = `[system: ${myName}再次长按${realName}的头像，${realName}像气球一样泄气飞走了]`;
    } else if (kind === 'bubble-gun') {
        visualText = `${myName}用哒哒哒扫射了${realName}！`;
        contextText = `[system: ${myName}对${realName}使用了哒哒哒，把消息气泡拆成字母扫射向${realName}]`;
    } else {
        return;
    }

    // 视觉消息（显示在聊天中）
    const visualMessage = {
        id: 'msg_visual_' + Date.now(),
        role: 'system',
        content: '[system-display:' + visualText + ']',
        parts: [],
        timestamp: Date.now()
    };
    // 上下文消息（发给 AI）
    const contextMessage = {
        id: 'msg_context_' + Date.now(),
        role: 'user',
        content: contextText,
        parts: [{type: 'text', text: contextText}],
        timestamp: Date.now(),
        senderId: 'user_me'
    };

    chat.history.push(visualMessage, contextMessage);
    addMessageBubble(visualMessage, chat.id, 'private');
    saveData();
    renderChatList();
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

// 监听聊天切换，自动 attach/detach（在 openChatRoom 和 switchScreen 中调用）
window.fidgetAttach = fidgetAttach;
window.fidgetDetach = fidgetDetach;
