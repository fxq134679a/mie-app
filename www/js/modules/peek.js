// --- 偷看手机功能 (js/modules/peek.js) ---

let isBatchMode = false;
let selectedApps = new Set();

function exitBatchMode() {
    isBatchMode = false;
    selectedApps.clear();
    const peekBatchBar = document.getElementById('peek-batch-bar');
    const peekBatchBtn = document.getElementById('peek-batch-btn');
    if (peekBatchBar) peekBatchBar.style.display = 'none';
    if (peekBatchBtn) peekBatchBtn.style.display = 'block';
    document.querySelectorAll('#peek-screen .app-icon').forEach(icon => {
        icon.classList.remove('selectable', 'selected');
    });
}

function updateBatchCount() {
    const peekBatchCount = document.getElementById('peek-batch-count');
    if (peekBatchCount) {
        peekBatchCount.textContent = `已选 ${selectedApps.size} 个应用`;
    }
}

function setupPeekFeature() {
    const peekBtn = document.getElementById('peek-btn');
    const peekSettingsBtn = document.getElementById('peek-settings-btn');
    const peekWallpaperModal = document.getElementById('peek-wallpaper-modal');
    const peekBatchBtn = document.getElementById('peek-batch-btn');
    const peekBatchBar = document.getElementById('peek-batch-bar');
    const peekBatchCancelBtn = document.getElementById('peek-batch-cancel-btn');
    const peekBatchStartBtn = document.getElementById('peek-batch-start-btn');

    document.getElementById('clear-peek-data-btn')?.addEventListener('click', async () => {
        if (confirm('确定要清空该角色的所有偷看数据吗？清空后下次进入各应用将重新生成。')) {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                char.peekData = {};
                await saveData();
                showToast('偷看数据已清空');
            }
        }
    });

    /* ── 壁纸自定义：从本地上传 / 恢复默认 ── */
    const wpUploadInput = document.getElementById('peek-wallpaper-upload');
    document.getElementById('peek-wallpaper-upload-btn')?.addEventListener('click', () => {
        wpUploadInput?.click();
    });
    wpUploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const dataUrl = await compressWallpaperImage(file);
            const char = db.characters.find(c => c.id === currentChatId);
            if (!char) { showToast('错误：未找到当前角色'); return; }
            if (!char.peekScreenSettings) char.peekScreenSettings = {};
            char.peekScreenSettings.wallpaper = dataUrl;
            await saveData();
            updateWallpaperPreview();
            showToast('壁纸已更新');
        } catch (err) {
            console.error('[peek] 壁纸上传失败:', err);
            showToast('壁纸上传失败，请换一张试试');
        }
        e.target.value = '';
    });
    document.getElementById('peek-wallpaper-reset-btn')?.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char?.peekScreenSettings?.wallpaper) {
            delete char.peekScreenSettings.wallpaper;
            await saveData();
            updateWallpaperPreview();
            showToast('已恢复默认壁纸');
        } else {
            showToast('当前就是默认壁纸');
        }
    });

    /* ── 相册图片库：上传（可多选）/ 勾选 / 删除 / 清空，全角色共用 ── */
    const poolUploadInput = document.getElementById('peek-pool-upload');
    document.getElementById('peek-pool-upload-btn')?.addEventListener('click', () => poolUploadInput?.click());
    poolUploadInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        if (!db.peekImagePool) db.peekImagePool = [];
        showToast(`正在添加 ${files.length} 张图片...`);
        let added = 0;
        for (const file of files) {
            try {
                const dataUrl = await compressPoolImage(file);
                db.peekImagePool.push({ url: dataUrl, on: true });
                added++;
            } catch (err) {
                console.error('[peek] 图片库上传失败:', err);
            }
        }
        await saveData();
        renderPeekPoolList();
        showToast(added ? `已添加 ${added} 张图片到图片库` : '图片上传失败，请重试');
        e.target.value = '';
    });
    document.getElementById('peek-pool-clear-btn')?.addEventListener('click', async () => {
        if (!(db.peekImagePool || []).length) { showToast('图片库已经是空的'); return; }
        if (!confirm(`清空图片库全部 ${(db.peekImagePool || []).length} 张图片？（已生成的相册内容不受影响）`)) return;
        db.peekImagePool = [];
        await saveData();
        renderPeekPoolList();
        showToast('图片库已清空');
    });

    /* ── 主屏幕颜色：时间 / APP 名字 ── */
    const applyPeekColors = (key, value, label) => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        if (!char.peekScreenSettings) char.peekScreenSettings = {};
        if (value) char.peekScreenSettings[key] = value;
        else delete char.peekScreenSettings[key];
        saveData().then(() => {
            // 手机主屏就开在弹窗后面时，颜色立刻生效
            try { if (document.getElementById('peek-screen')?.classList.contains('active')) renderPeekScreen(); } catch (e) { }
            showToast(value ? `${label}已更新` : `${label}已恢复默认`);
        });
    };
    const timeColorInput = document.getElementById('peek-time-color-input');
    timeColorInput?.addEventListener('change', () => applyPeekColors('timeColor', timeColorInput.value, '时间颜色'));
    document.getElementById('peek-time-color-reset')?.addEventListener('click', () => {
        if (timeColorInput) timeColorInput.value = '#ffffff';
        applyPeekColors('timeColor', '', '时间颜色');
    });
    const appnameColorInput = document.getElementById('peek-appname-color-input');
    appnameColorInput?.addEventListener('change', () => applyPeekColors('appNameColor', appnameColorInput.value, 'APP 名字颜色'));
    document.getElementById('peek-appname-color-reset')?.addEventListener('click', () => {
        if (appnameColorInput) appnameColorInput.value = '#161616';
        applyPeekColors('appNameColor', '', 'APP 名字颜色');
    });


    document.getElementById('peek-icon-preset-save-btn')?.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        const icons = char?.peekScreenSettings?.customIcons || {};
        if (Object.keys(icons).length === 0) {
            showToast('该角色还没有自定义图标，先给上面的 App 上传一个吧');
            return;
        }
        const nameInput = document.getElementById('peek-icon-preset-name');
        const name = (nameInput?.value || '').trim() || ('图标预设 ' + new Date().toLocaleDateString());
        if (!db.peekIconPresets) db.peekIconPresets = [];
        db.peekIconPresets.push({ id: 'preset_' + Date.now(), name, icons: JSON.parse(JSON.stringify(icons)) });
        await saveData();
        if (nameInput) nameInput.value = '';
        renderIconPresetList();
        showToast(`预设「${name}」已保存，可在其他角色的手机上应用`);
    });

    /* 右上角手机图标：点击 → 屏幕亮一下 → 直接进入 ta 的手机页面。
       （原「偷看手机/动态」动作菜单与确认弹窗已按需求移除） */
    peekBtn?.addEventListener('click', () => {
        if (currentChatType !== 'private') return;
        const phone = peekBtn.querySelector('.mie-peek-phone');
        if (phone) phone.classList.add('pop');          // Q 弹放大
        setTimeout(() => { if (phone) phone.classList.add('lit'); }, 220);   // 放大后亮一下
        setTimeout(() => {
            if (phone) phone.classList.remove('pop', 'lit');
            renderPeekScreen();
            switchScreen('peek-screen');
        }, 780);
    });

    peekSettingsBtn?.addEventListener('click', () => {
        renderPeekSettings();
        renderPeekPoolList();
        peekWallpaperModal.classList.add('visible');
    });

    // --- 批量生成逻辑 ---
    peekBatchBtn?.addEventListener('click', () => {
        // 批量入口已移入设置弹窗底部：先收起弹窗再进入批量选择模式
        document.getElementById('peek-wallpaper-modal')?.classList.remove('visible');
        isBatchMode = true;
        selectedApps.clear();
        peekBatchBar.style.display = 'flex';
        peekBatchBtn.style.display = 'none';
        updateBatchCount();
        
        // 给所有图标添加可选状态样式
        document.querySelectorAll('#peek-screen .app-icon').forEach(icon => {
            icon.classList.add('selectable');
            icon.classList.remove('selected');
        });
    });

    peekBatchCancelBtn?.addEventListener('click', () => {
        exitBatchMode();
    });

    peekBatchStartBtn?.addEventListener('click', () => {
        if (selectedApps.size === 0) {
            showToast('请至少选择一个应用');
            return;
        }
        if (selectedApps.size > 4) {
            showToast('为了保证生成质量，一次最多选择4个应用');
            return;
        }
        generateBatchPeekContent(Array.from(selectedApps));
    });

    document.getElementById('save-peek-settings-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) {
            showToast('错误：未找到当前角色');
            return;
        }

        if (!character.peekScreenSettings) {
            character.peekScreenSettings = {};
        }

        if (!character.peekScreenSettings.generationCounts) {
            character.peekScreenSettings.generationCounts = {};
        }

        const countInputs = document.querySelectorAll('.peek-settings-item-control input');
        countInputs.forEach(input => {
            const appId = input.dataset.appId;
            const val = parseInt(input.value);
            if (!isNaN(val)) {
                character.peekScreenSettings.generationCounts[appId] = val;
            }
        });

        await saveData();
        showToast('配置已保存！');
        peekWallpaperModal.classList.remove('visible');
    });

    const peekMessagesScreen = document.getElementById('peek-messages-screen');
    peekMessagesScreen.addEventListener('click', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (chatItem) {
            const partnerName = chatItem.dataset.name;
            const char = db.characters.find(c => c.id === currentChatId);
            const cachedData = char ? char.peekData.messages : null;
            if (cachedData && cachedData.conversations) {
                const conversation = cachedData.conversations.find(c => c.partnerName === partnerName);
                if (conversation) {
                    currentPeekConvo = conversation;
                    renderPeekConversation(conversation.history, conversation.partnerName);
                    peekPushScreen('peek-messages-screen', 'peek-conversation-screen');
                } else {
                    showToast('找不到对话记录');
                }
            }
        } else if (e.target.closest('.action-btn')) {
            // 右上角圆形按钮 → 收藏：把整份消息列表存进 Menu 页「收藏库」
            favoritePeekMessagesList();
        }
    });

    const peekConversationScreen = document.getElementById('peek-conversation-screen');
    peekConversationScreen.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) {
            // 详情页右上角不再触发生成，改为收藏当前这段聊天记录
            favoritePeekConversation();
        }
    });

    const refreshAlbumBtn = document.getElementById('refresh-album-btn');
    if(refreshAlbumBtn) {
        refreshAlbumBtn.addEventListener('click', () => generateAndRenderPeekContent('album', { forceRefresh: true }));
    }

    const refreshStepsBtn = document.getElementById('refresh-steps-btn');
    if(refreshStepsBtn) {
        refreshStepsBtn.addEventListener('click', () => generateAndRenderPeekContent('steps', { forceRefresh: true }));
    }

    const photoModal = document.getElementById('peek-photo-modal');
    if(photoModal) {
        const flipCard = document.getElementById('peek-flip-card');
        const flipClose = document.getElementById('peek-flip-close');
        // 点击卡片翻转
        if (flipCard) {
            flipCard.addEventListener('click', () => flipCard.classList.toggle('flipped'));
        }
        // 右上角关闭按钮
        if (flipClose) {
            flipClose.addEventListener('click', (e) => {
                e.stopPropagation();
                photoModal.classList.remove('visible');
                if (flipCard) flipCard.classList.remove('flipped');
            });
        }
        // 点卡片以外的暗处关闭
        photoModal.addEventListener('click', (e) => {
            if (e.target === photoModal) {
                photoModal.classList.remove('visible');
                if (flipCard) flipCard.classList.remove('flipped');
            }
        });
    }

    setupMomentsFeature();
}

// --- 收藏到收藏库（Menu 页「收藏库」keepsake） ---
/* 当前正在查看的消息 APP 会话（点进详情页时记录，供右上角收藏按钮取内容） */
let currentPeekConvo = null;

/* 备忘录/草稿/消息收藏共用 toast */
function peekFavToast() {
    showToast('已收藏 · 到 Menu 页「收藏库」看看');
}

/* 草稿卡片右下角五角星：把这一页草稿收藏进 Menu 页「收藏库」 */
function favoritePeekDraft(draft) {
    if (!window.Keepsake || typeof window.Keepsake.add !== 'function') { showToast('收藏库不可用'); return; }
    if (!draft) return;
    const char = db.characters.find(c => c.id === currentChatId);
    window.Keepsake.add({
        charId: currentChatId,
        charName: char?.realName || 'Ta',
        who: 'ta',
        t: `给${draft.to || 'Ta'}的草稿`,
        ctx: [],
        lines: [{ w: 'ta', text: String(draft.content || '') }],
        pre: { you: '', ta: '' }
    });
    peekFavToast();
}

/* 消息 APP 列表页收藏：把整份消息列表（每个对话的最新一条）存成一条收藏 */
function favoritePeekMessagesList() {
    if (!window.Keepsake || typeof window.Keepsake.add !== 'function') { showToast('收藏库不可用'); return; }
    const char = db.characters.find(c => c.id === currentChatId);
    const convos = char?.peekData?.messages?.conversations || [];
    if (!convos.length) { showToast('还没有可收藏的消息'); return; }
    const lines = convos.map(c => {
        const h = Array.isArray(c.history) ? c.history : [];
        const last = h.length ? String(h[h.length - 1].content || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '…';
        return { w: 'ta', text: `${c.partnerName}：${last}` };
    });
    window.Keepsake.add({
        charId: currentChatId,
        charName: char?.realName || 'Ta',
        who: 'you',
        t: '消息列表',
        ctx: [],
        lines: lines,
        pre: { you: '', ta: '' }
    });
    peekFavToast();
}

/* 消息 APP 会话详情页收藏：把这段聊天记录完整封存 */
function favoritePeekConversation() {
    if (!window.Keepsake || typeof window.Keepsake.add !== 'function') { showToast('收藏库不可用'); return; }
    const convo = currentPeekConvo;
    if (!convo || !Array.isArray(convo.history) || !convo.history.length) { showToast('还没有可收藏的内容'); return; }
    const char = db.characters.find(c => c.id === currentChatId);
    window.Keepsake.add({
        charId: currentChatId,
        charName: char?.realName || 'Ta',
        who: 'you',
        t: `和${convo.partnerName}的聊天`,
        ctx: [],
        lines: convo.history.map(m => ({ w: m.sender === 'char' ? 'ta' : 'you', text: String(m.content || '') })),
        pre: { you: '', ta: '' }
    });
    peekFavToast();
}

/* 备忘录详情页收藏：把这条备忘录全文存进收藏库 */
function favoritePeekMemo(memo) {
    if (!window.Keepsake || typeof window.Keepsake.add !== 'function') { showToast('收藏库不可用'); return; }
    if (!memo) return;
    const char = db.characters.find(c => c.id === currentChatId);
    window.Keepsake.add({
        charId: currentChatId,
        charName: char?.realName || 'Ta',
        who: 'ta',
        t: memo.title || '备忘录',
        ctx: [],
        lines: [{ w: 'ta', text: String(memo.content || '') }],
        pre: { you: '', ta: '' }
    });
    peekFavToast();
}

// --- 朋友圈 (Moments) 功能 ---

const MOMENT_PLACEHOLDER_IMAGES = [
    'https://i.postimg.cc/FsZ1yvgD/QQ-1782811211078.png',
    'https://i.postimg.cc/8PHsRGBX/QQ-1782811226542.png',
    'https://i.postimg.cc/cJjvvc7F/QQ-1782811241562.png',
    'https://i.postimg.cc/TPhy2sbL/QQ-1782811322250.png',
    'https://i.postimg.cc/SK5nnGLH/QQ-1782811335398.png',
    'https://i.postimg.cc/hPq78pFJ/QQ-1782811349650.png'
];

function setupMomentsFeature() {
    const momentsScreen = document.getElementById('moments-screen');
    const momentsContentArea = document.getElementById('moments-content-area');
    const momentsHeader = document.getElementById('moments-header');
    const momentsTitle = document.getElementById('moments-title');
    const refreshBtn = document.getElementById('moments-refresh-btn');
    const commentInputArea = document.getElementById('moments-comment-input-area');
    const commentInput = document.getElementById('moments-comment-input');
    const commentSendBtn = document.getElementById('moments-comment-send-btn');
    const coverImg = document.getElementById('moments-cover-img');
    const signatureEl = document.getElementById('moments-user-signature');
    if (signatureEl) {
        signatureEl.title = '点击修改个性签名';
        signatureEl.style.cursor = 'pointer';
    }
    const coverUploadInput = document.createElement('input');
    coverUploadInput.type = 'file';
    coverUploadInput.accept = 'image/*';
    coverUploadInput.style.display = 'none';
    document.body.appendChild(coverUploadInput);

    let currentActionMomentId = null;
    let currentActionReplyTo = null; // 新增：用于存储回复对象

    // 滚动时改变头部样式
    momentsContentArea?.addEventListener('scroll', () => {
        if (momentsContentArea.scrollTop > 200) {
            momentsHeader.classList.add('scrolled');
            momentsTitle.style.opacity = '1';
        } else {
            momentsHeader.classList.remove('scrolled');
            momentsTitle.style.opacity = '0';
        }
    });

    // 刷新按钮
    refreshBtn?.addEventListener('click', () => {
        renderMomentsScreen();
        showToast('动态已刷新');
    });

    // 点击角色签名，由用户直接修改
    signatureEl?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const input = prompt('修改个性签名（最多80字）', char.momentsSignature || '');
        if (input === null) return;

        const newSignature = input.trim();
        if (!newSignature) {
            showToast('个性签名不能为空');
            return;
        }
        if (Array.from(newSignature).length > 80) {
            showToast('个性签名不能超过80字');
            return;
        }
        if (newSignature === (char.momentsSignature || '').trim()) return;

        await updateMomentsSignature(newSignature);
    });

    // 点击背景图更换
    coverImg?.addEventListener('click', () => {
        coverUploadInput.click();
    });

    coverUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        try {
            const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 1080 });
            if (!char.peekScreenSettings) {
                char.peekScreenSettings = {};
            }
            char.peekScreenSettings.momentsCover = compressedUrl;
            await saveData();
            renderMomentsScreen();
            showToast('朋友圈封面已更换');
        } catch (error) {
            showToast('封面更换失败');
            console.error('Failed to change moments cover:', error);
        }
    });

    // 委托处理动态列表的点击事件
    const feedContainer = document.getElementById('moments-feed-container');
    
    let longPressTimer;
    let isLongPress = false;

    // 统一处理长按事件（支持动态本体和单条评论）
    const handleTouchStart = (e) => {
        const target = e.target;
        const momentItem = target.closest('.moment-item');
        if (!momentItem) return;

        isLongPress = false;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            
            // 检查是否长按了某条评论
            const commentItem = target.closest('.moment-comment');
            if (commentItem) {
                const momentId = momentItem.dataset.id;
                const commentId = commentItem.dataset.commentId;
                if (confirm('确定要删除这条评论吗？')) {
                    deleteMomentComment(momentId, commentId);
                }
                return;
            }

            // 否则认为是长按了动态本体
            const momentId = momentItem.dataset.id;
            if (confirm('确定要删除这条动态吗？')) {
                deleteMoment(momentId);
            }
        }, 800); // 800ms 算作长按
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimer);
    };

    // 兼容鼠标和触摸事件
    feedContainer?.addEventListener('mousedown', handleTouchStart);
    feedContainer?.addEventListener('touchstart', handleTouchStart, { passive: true });

    feedContainer?.addEventListener('mouseup', handleTouchEnd);
    feedContainer?.addEventListener('mouseleave', handleTouchEnd);
    feedContainer?.addEventListener('touchend', handleTouchEnd);
    feedContainer?.addEventListener('touchcancel', handleTouchEnd);

    feedContainer?.addEventListener('click', (e) => {
        if (isLongPress) {
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        // <label> 会把点击再转发一次给隐藏的 .check，忽略这次重复 click，避免点赞被切换两次
        if (e.target.matches && e.target.matches('.like-wrapper input.check')) return;
        // 隐藏所有已打开的操作弹窗（点击外部才关，点在 popup 内部不关）
        if (!e.target.closest('.moment-action-popup')) {
            document.querySelectorAll('.moment-action-popup.show').forEach(popup => {
                popup.classList.remove('show');
            });
        }

        // 点击操作按钮 (··)
        const actionBtn = e.target.closest('.moment-action-btn');
        if (actionBtn) {
            e.stopPropagation();
            const popup = actionBtn.nextElementSibling;
            if (popup && popup.classList.contains('moment-action-popup')) {
                popup.classList.toggle('show');
            }
            return;
        }

        // 点击点赞（执行动作但不关弹窗）
        const likeBtn = e.target.closest('.moment-action-item.like, .moment-action-popup .like-wrapper, .moment-action-popup .container');
        if (likeBtn) {
            e.stopPropagation();
            const popup = e.target.closest('.moment-action-popup');
            const momentItem = e.target.closest('.moment-item') || popup?.closest('.moment-item');
            const momentId = momentItem?.dataset.id;
            if (momentId) toggleMomentLike(momentId);
            return;
        }

        // 点击评论（执行动作但不关弹窗）
        const commentBtn = e.target.closest('.moment-action-item.comment');
        if (commentBtn) {
            e.stopPropagation();
            currentActionMomentId = commentBtn.closest('.moment-item').dataset.id;
            currentActionReplyTo = null; // 重置回复对象
            commentInput.placeholder = '评论';
            commentInputArea.style.display = 'flex';
            commentInput.focus();
            return;
        }

        // 点击单个评论进行回复
        const singleComment = e.target.closest('.moment-comment');
        if (singleComment) {
            e.stopPropagation();
            const author = singleComment.querySelector('.moment-comment-name')?.textContent;
            const myName = db.characters.find(c => c.id === currentChatId)?.myName || '我';
            // 不能回复自己
            if (author && author !== myName) {
                currentActionMomentId = singleComment.closest('.moment-item').dataset.id;
                currentActionReplyTo = author;
                commentInput.placeholder = `回复 ${author}:`;
                commentInputArea.style.display = 'flex';
                commentInput.focus();
            }
            return;
        }

        // 点击带图动态的图片：翻面卡翻转显示描述，旧遮罩卡保持原行为
        const imageWrapper = e.target.closest('.moment-image-wrapper');
        if (imageWrapper) {
            e.stopPropagation();
            if (imageWrapper.classList.contains('pdf-flip')) {
                imageWrapper.classList.toggle('is-flipped');
            } else {
                imageWrapper.classList.toggle('show-text');
            }
        }
    });

    // 点击屏幕其他地方隐藏评论框和操作弹窗
    momentsScreen?.addEventListener('click', (e) => {
        if (!e.target.closest('.moment-action-btn') && !e.target.closest('.moment-action-popup')) {
            document.querySelectorAll('.moment-action-popup.show').forEach(popup => {
                popup.classList.remove('show');
            });
        }
        
        if (!e.target.closest('.moments-comment-input-area') && !e.target.closest('.moment-action-item.comment')) {
            commentInputArea.style.display = 'none';
        }
    });

    // 发送评论
    const sendComment = () => {
        const text = commentInput.value.trim();
        if (text && currentActionMomentId) {
            addMomentComment(currentActionMomentId, text, currentActionReplyTo);
            commentInput.value = '';
            commentInputArea.style.display = 'none';
            currentActionReplyTo = null; // 重置
            commentInput.placeholder = '评论';
        }
    };

    commentSendBtn?.addEventListener('click', sendComment);
    commentInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        sendComment();
    });
}

async function updateMomentsSignature(newSignature) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return;

    char.momentsSignature = newSignature;
    if (!char.history) char.history = [];

    const timestamp = Date.now();
    const noticeText = `${char.myName || '我'}更改了${char.realName}的个性签名为：${newSignature}`;

    // 可见通知负责展示；隐藏消息负责让后续上下文知道这次修改。
    char.history.push(
        {
            id: `msg_visual_signature_${timestamp}`,
            role: 'system',
            content: `[system-display:${noticeText}]`,
            timestamp,
            isContextDisabled: true
        },
        {
            id: `msg_context_signature_${timestamp}`,
            role: 'user',
            content: `[system: ${noticeText}]`,
            timestamp: timestamp + 1,
            isContextDisabled: false
        }
    );

    await saveData();
    renderMomentsScreen();
    if (typeof renderMessages === 'function') renderMessages(false, false);
    if (typeof renderChatList === 'function') renderChatList();
    showToast('个性签名已修改');
}

function renderMomentsScreen() {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return;

    // 渲染封面和用户信息
    const coverImg = document.getElementById('moments-cover-img');
    const userAvatar = document.getElementById('moments-user-avatar');
    const userName = document.getElementById('moments-user-name');

    const peekSettings = char.peekScreenSettings || {};
    // 优先使用自定义封面，其次是手机壁纸，然后是全局壁纸，最后是随机图
    coverImg.src = peekSettings.momentsCover || peekSettings.wallpaper || db.wallpaper || MOMENT_PLACEHOLDER_IMAGES[Math.floor(Math.random() * MOMENT_PLACEHOLDER_IMAGES.length)];
    
    userAvatar.src = char.avatar;
    userName.textContent = (char.remarkName && char.remarkName.trim()) || char.realName || 'Character';
    
    const signatureEl = document.getElementById('moments-user-signature');
    if (signatureEl) {
        signatureEl.textContent = char.momentsSignature || '暂时没有设置签名。';
    }

    // 渲染动态列表
    const feedContainer = document.getElementById('moments-feed-container');
    const moments = char.moments || [];

    if (moments.length === 0) {
        feedContainer.innerHTML = '<div style="text-align: center; padding: 50px; color: #999;">暂无动态</div>';
        return;
    }

    // 按时间倒序排列
    const sortedMoments = [...moments].sort((a, b) => b.timestamp - a.timestamp);
    
    let html = '';
    const _myName = char.myName || '我';
    sortedMoments.forEach(moment => {
        const isLiked = !!(moment.likes && moment.likes.includes(_myName));
        // 处理图片
        let imagesHtml = '';
        if (moment.imageDescription) {
            const randomPlaceholder = MOMENT_PLACEHOLDER_IMAGES[Math.floor(Math.random() * MOMENT_PLACEHOLDER_IMAGES.length)];
            imagesHtml = `
                <div class="moment-images single">
                    <div class="moment-image-wrapper pdf-flip">
                        <img class="pdf-photo" src="${randomPlaceholder}" alt="照片">
                        <div class="pdf-desc-face"><div class="pdf-desc-text">${moment.imageDescription}</div></div>
                    </div>
                </div>
            `;
        } else if (moment.images && moment.images.length > 0) {
            const isSingle = moment.images.length === 1;
            imagesHtml = `<div class="moment-images ${isSingle ? 'single' : ''}">`;
            moment.images.forEach(img => {
                imagesHtml += `<img src="${img}" class="moment-img" alt="配图">`;
            });
            imagesHtml += `</div>`;
        }

        // 处理点赞
        let likesHtml = '';
        if (moment.likes && moment.likes.length > 0) {
            likesHtml = `
                <div class="moment-likes">
                    <svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36,2,12.27,2,8.5C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"></path></svg>
                    ${moment.likes.join(', ')}
                </div>
            `;
        }

        // 处理评论
        let commentsHtml = '';
        if (moment.comments && moment.comments.length > 0) {
            commentsHtml = '<div class="moment-comments">';
            moment.comments.forEach(comment => {
                // 确保评论有 ID，如果没有则生成一个临时的（兼容旧数据）
                const commentId = comment.id || `comment_${Math.random().toString(36).substr(2, 9)}`;
                if (comment.replyTo) {
                    commentsHtml += `<div class="moment-comment" data-comment-id="${commentId}"><span class="moment-comment-name">${comment.author}</span> 回复 <span class="moment-comment-name">${comment.replyTo}</span>: <span class="moment-comment-text">${comment.content}</span></div>`;
                } else {
                    commentsHtml += `<div class="moment-comment" data-comment-id="${commentId}"><span class="moment-comment-name">${comment.author}</span>: <span class="moment-comment-text">${comment.content}</span></div>`;
                }
            });
            commentsHtml += '</div>';
        }

        // 互动区容器
        let interactionHtml = '';
        if (likesHtml || commentsHtml) {
            interactionHtml = `
                <div class="moment-interaction">
                    ${likesHtml}
                    ${commentsHtml}
                </div>
            `;
        }

        // 时间格式化
        const timeStr = formatMomentTime(moment.timestamp);

        html += `
            <div class="moment-item" data-id="${moment.id}">
                <img src="${char.avatar}" class="moment-avatar" alt="Avatar">
                <div class="moment-main">
                    <div class="moment-name">${(char.remarkName && char.remarkName.trim()) || char.realName || 'Character'}</div>
                    <div class="moment-text">${moment.content.replace(/\n/g, '<br>')}</div>
                    ${imagesHtml}
                    <div class="moment-footer">
                        <span class="moment-time">${timeStr}</span>
                        <div style="position: relative;">
                            <button class="moment-action-btn">···</button>
                            <div class="moment-action-popup">
                                <label class="like-wrapper moment-action-item like ${isLiked ? 'liked' : ''}">
                                    <input type="checkbox" class="check" ${isLiked ? 'checked' : ''} aria-hidden="true" data-ios-cb-skip>
                                    <span class="container">
                                        <svg class="icon active" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                        <svg class="icon inactive" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                        <span class="like-text">赞</span>
                                    </span>
                                </label>
                                <div class="moment-action-item comment">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9Z"></path></svg>
                                    评论
                                </div>
                            </div>
                        </div>
                    </div>
                    ${interactionHtml}
                </div>
            </div>
        `;
    });

    feedContainer.innerHTML = html;
}

function formatMomentTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 172800000) return '昨天';
    
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

async function toggleMomentLike(momentId) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.moments) return;

    const moment = char.moments.find(m => m.id === momentId);
    if (!moment) return;

    if (!moment.likes) moment.likes = [];
    
    const myName = char.myName || '我';
    const index = moment.likes.indexOf(myName);
    
    const momentSnippet = moment.content.substring(0, 20); // 缩略内容
    let systemMsg = '';

    if (index > -1) {
        moment.likes.splice(index, 1);
        systemMsg = `[system: ${myName}取消点赞了${char.realName}的动态：${momentSnippet}...]`;
        char.history.push({
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'user',
            content: systemMsg,
            timestamp: Date.now(),
            isContextDisabled: true // 取消点赞不进入上下文
        });
    } else {
        moment.likes.push(myName);
        systemMsg = `[system: ${myName}点赞了${char.realName}的动态：${momentSnippet}...]`;
        char.history.push({
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'user',
            content: systemMsg,
            timestamp: Date.now(),
            isContextDisabled: false // 点赞进入上下文
        });
    }

    await saveData();
    renderMomentsScreen();
    if (typeof renderMessages === 'function') renderMessages(false, false);
}

async function deleteMoment(momentId) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.moments) return;

    const momentIndex = char.moments.findIndex(m => m.id === momentId);
    if (momentIndex > -1) {
        const momentToDelete = char.moments[momentIndex];
        
        // 1. 从聊天记录中删除对应的指令消息
        // 寻找包含该动态内容的原始指令消息
        const snippet = momentToDelete.content.substring(0, 20);
        const msgIndex = char.history.findIndex(m => 
            m.content.includes('发布了一条动态') && m.content.includes(snippet) ||
            m.content.includes('发布了一条带图动态') && m.content.includes(snippet)
        );
        
        if (msgIndex > -1) {
            char.history.splice(msgIndex, 1);
        }

        // 2. 删除动态本身
        char.moments.splice(momentIndex, 1);
        
        await saveData();
        renderMomentsScreen();
        if (typeof renderMessages === 'function') renderMessages(false, false);
        showToast('动态已删除');
    }
}

async function deleteMomentComment(momentId, commentId) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.moments) return;

    const moment = char.moments.find(m => m.id === momentId);
    if (!moment || !moment.comments) return;

    const commentIndex = moment.comments.findIndex(c => c.id === commentId);
    if (commentIndex > -1) {
        const commentToDelete = moment.comments[commentIndex];
        
        // 1. 从聊天记录中删除对应的指令消息
        const msgIndex = char.history.findIndex(m => 
            (m.content.includes('评论了') || m.content.includes('回复了')) && 
            m.content.includes(commentToDelete.content)
        );
        
        if (msgIndex > -1) {
            char.history.splice(msgIndex, 1);
        }

        // 2. 删除评论本身
        moment.comments.splice(commentIndex, 1);
        
        await saveData();
        renderMomentsScreen();
        if (typeof renderMessages === 'function') renderMessages(false, false);
        showToast('评论已删除');
    }
}

async function addMomentComment(momentId, text, replyTo = null) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.moments) return;

    const moment = char.moments.find(m => m.id === momentId);
    if (!moment) return;

    if (!moment.comments) moment.comments = [];
    
    const myName = char.myName || '我';
    
    const newComment = {
        id: `comment_${Date.now()}`,
        author: myName,
        content: text,
        timestamp: Date.now()
    };

    if (replyTo) {
        newComment.replyTo = replyTo;
    }

    moment.comments.push(newComment);

    // 插入系统消息到历史记录，让AI知道
    const momentSnippet = moment.content.substring(0, 20);
    let systemMsg = '';
    if (replyTo) {
        systemMsg = `[system: ${myName}回复了${replyTo}在${char.realName}的动态“${momentSnippet}...”下的评论：${text}]`;
    } else {
        systemMsg = `[system: ${myName}评论了${char.realName}的动态“${momentSnippet}...”：${text}]`;
    }

    char.history.push({
        id: `msg_${Date.now()}_${Math.random()}`,
        role: 'user',
        content: systemMsg,
        timestamp: Date.now(),
        isContextDisabled: false // 评论进入上下文
    });

    await saveData();
    renderMomentsScreen();
    if (typeof renderMessages === 'function') renderMessages(false, false);
}

/* ── 壁纸自定义：工具函数 ── */
// 压缩到最长边 1080px 的 jpeg，避免 base64 撑爆存储
function compressWallpaperImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const max = 1080;
                let width = img.width, height = img.height;
                if (width > max || height > max) {
                    const r = Math.min(max / width, max / height);
                    width = Math.round(width * r);
                    height = Math.round(height * r);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

/* 相册图片库压缩：最长边 720px 转 jpeg（控制体积，防 localStorage 爆配额） */
function compressPoolImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const max = 720;
                let width = img.width, height = img.height;
                if (width > max || height > max) {
                    const r = Math.min(max / width, max / height);
                    width = Math.round(width * r);
                    height = Math.round(height * r);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

/* ── 相册图片库：全角色共用（存 db.peekImagePool = [{url, on}]），相册生成时随机选用勾选的图 ── */
function getPeekPoolUrls() {
    return (db.peekImagePool || []).filter(x => x && x.url && x.on !== false).map(x => x.url);
}

function pickPeekPoolUrl() {
    const urls = getPeekPoolUrls();
    return urls.length ? urls[Math.floor(Math.random() * urls.length)] : null;
}

function renderPeekPoolList() {
    const list = document.getElementById('peek-pool-list');
    if (!list) return;
    const pool = db.peekImagePool || [];
    if (pool.length === 0) {
        list.innerHTML = '<div style="grid-column: 1 / -1; font-size: 12px; color: #999; padding: 4px 2px; line-height: 1.5;">图片库还是空的。上传几张图后，相册 APP 生成照片时会从勾选的图片里随机选用。</div>';
        return;
    }
    list.innerHTML = '';
    pool.forEach((item, idx) => {
        const on = item.on !== false;
        const cell = document.createElement('div');
        cell.className = 'peek-pool-thumb' + (on ? '' : ' off');
        cell.innerHTML = `
            <img src="${item.url}" alt="图片库图片">
            <span class="peek-pool-check">${on ? '✓' : ''}</span>
            <button type="button" class="peek-pool-del" aria-label="删除">×</button>
        `;
        cell.addEventListener('click', (e) => {
            if (e.target.closest('.peek-pool-del')) return;
            item.on = on ? false : true;
            saveData().then(() => renderPeekPoolList());
        });
        cell.querySelector('.peek-pool-del').addEventListener('click', async () => {
            if (!confirm('从图片库删除这张图片？（已生成的相册内容不受影响）')) return;
            db.peekImagePool.splice(idx, 1);
            await saveData();
            renderPeekPoolList();
            showToast('已删除');
        });
        list.appendChild(cell);
    });
}

/* App 图标压缩：最长边 256px；PNG 保持透明通道，其余转 jpeg */
function compressAppIcon(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const max = 256;
                let width = img.width, height = img.height;
                if (width > max || height > max) {
                    const r = Math.min(max / width, max / height);
                    width = Math.round(width * r);
                    height = Math.round(height * r);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                const isPng = /png/i.test(file.type || '');
                resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function updateWallpaperPreview() {
    const preview = document.getElementById('peek-wallpaper-preview');
    if (!preview) return;
    const char = db.characters.find(c => c.id === currentChatId);
    const url = char?.peekScreenSettings?.wallpaper || db.wallpaper || '';
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
    } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
    }
}

/* ── 图标预设：把当前角色的自定义 App 图标打包存档，可应用到其他角色（存 db.peekIconPresets） ── */
const escapePresetHtml = (t) => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function renderIconPresetList() {
    const list = document.getElementById('peek-icon-preset-list');
    if (!list) return;
    const presets = db.peekIconPresets || [];
    if (presets.length === 0) {
        list.innerHTML = '<div style="font-size:12px;color:#999;padding:6px 2px;line-height:1.5;">还没有预设。给上面的 App 上传自定义图标后，就能一键打包保存，别的角色直接套用。</div>';
        return;
    }
    list.innerHTML = '';
    presets.forEach(p => {
        const keys = Object.keys(p.icons || {});
        const first = keys.length ? p.icons[keys[0]] : '';
        const row = document.createElement('div');
        row.className = 'peek-settings-item';
        row.innerHTML = `
            <div class="peek-settings-item-icon">
                <img src="${first}" style="width: 20px; height: 20px; border-radius: 4px;">
            </div>
            <div class="peek-settings-item-info">
                <div class="peek-settings-item-name">${escapePresetHtml(p.name)}</div>
                <div style="font-size: 11px; color: #999;">${keys.length} 个自定义图标</div>
            </div>
            <div class="peek-settings-item-icon-actions">
                <button type="button" class="peek-preset-apply-btn btn btn-neutral btn-small" style="padding: 3px 8px; font-size: 12px;">应用到 TA</button>
                <button type="button" class="peek-preset-del-btn btn btn-neutral btn-small" style="padding: 3px 8px; font-size: 12px; color: #c66;">删除</button>
            </div>`;
        row.querySelector('.peek-preset-apply-btn').addEventListener('click', async () => {
            const char = db.characters.find(c => c.id === currentChatId);
            if (!char) { showToast('错误：未找到当前角色'); return; }
            if (!char.peekScreenSettings) char.peekScreenSettings = {};
            char.peekScreenSettings.customIcons = JSON.parse(JSON.stringify(p.icons || {}));
            await saveData();
            renderPeekSettings();
            // 手机主屏就开在弹窗后面时，图标立刻换上
            try { if (document.getElementById('peek-screen')?.classList.contains('active')) renderPeekScreen(); } catch (e) { }
            showToast(`已应用预设「${p.name}」，TA 的手机图标已更新`);
        });
        row.querySelector('.peek-preset-del-btn').addEventListener('click', async () => {
            if (!confirm(`确定删除预设「${p.name}」吗？角色已应用的图标不受影响。`)) return;
            db.peekIconPresets = (db.peekIconPresets || []).filter(x => x.id !== p.id);
            await saveData();
            renderIconPresetList();
            showToast('预设已删除');
        });
        list.appendChild(row);
    });
}


function renderPeekSettings() {
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || {};
    const genCounts = peekSettings.generationCounts || {};

    updateWallpaperPreview();
    renderIconPresetList();

    /* 主屏幕颜色：时间 / APP 名字（存 char.peekScreenSettings.timeColor / appNameColor，空 = 默认） */
    const timeColorInput = document.getElementById('peek-time-color-input');
    const appnameColorInput = document.getElementById('peek-appname-color-input');
    if (timeColorInput) timeColorInput.value = peekSettings.timeColor || '#ffffff';
    if (appnameColorInput) appnameColorInput.value = peekSettings.appNameColor || '#161616';

    const defaultCounts = {
        messages: 5,
        album: 6,
        memos: 3,
        cart: 4,
        browser: 5,
        transfer: 6,
        drafts: 1,
        steps: 6,
        unlock: 4,
        bag: 5
    };

    const groups = {
        social: ['messages', 'unlock'],
        life: ['album', 'memos', 'steps', 'bag'],
        tools: ['cart', 'browser', 'transfer', 'drafts']
    };

    const renderList = (containerId, appIds) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        appIds.forEach(appId => {
            const appData = peekScreenApps[appId];
            if (!appData) return;

            const count = genCounts[appId] || defaultCounts[appId] || 5;
            const customIcon = peekSettings.customIcons?.[appId];
            const item = document.createElement('div');
            item.className = 'peek-settings-item';
            item.innerHTML = `
                <div class="peek-settings-item-icon">
                    <img src="${customIcon || appData.url}" style="width: 20px; height: 20px; border-radius: 4px;">
                </div>
                <div class="peek-settings-item-info">
                    <div class="peek-settings-item-name">${appData.name}</div>
                    <div class="peek-settings-item-icon-actions">
                        <label class="peek-icon-upload-label" title="从本地上传自定义图标">📷 图标</label>
                        <button type="button" class="peek-icon-reset-btn" title="恢复默认图标" ${customIcon ? '' : 'style="display:none;"'}>↺ 默认</button>
                    </div>
                </div>
                <div class="peek-settings-item-control">
                    <input type="number" data-app-id="${appId}" value="${count}" min="1" max="20">
                </div>
            `;

            /* 自定义图标上传：存进 char.peekScreenSettings.customIcons[appId] */
            const iconImg = item.querySelector('.peek-settings-item-icon img');
            const resetBtn = item.querySelector('.peek-icon-reset-btn');
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            item.appendChild(fileInput);

            item.querySelector('.peek-icon-upload-label').addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const dataUrl = await compressAppIcon(file);
                    const char = db.characters.find(c => c.id === currentChatId);
                    if (!char) { showToast('错误：未找到当前角色'); return; }
                    if (!char.peekScreenSettings) char.peekScreenSettings = {};
                    if (!char.peekScreenSettings.customIcons) char.peekScreenSettings.customIcons = {};
                    char.peekScreenSettings.customIcons[appId] = dataUrl;
                    await saveData();
                    iconImg.src = dataUrl;
                    resetBtn.style.display = '';
                    showToast(`「${appData.name}」图标已更新`);
                } catch (err) {
                    console.error('[peek] 图标上传失败:', err);
                    showToast('图标上传失败，请换一张试试');
                }
                e.target.value = '';
            });

            resetBtn.addEventListener('click', async () => {
                const char = db.characters.find(c => c.id === currentChatId);
                if (char?.peekScreenSettings?.customIcons?.[appId]) {
                    delete char.peekScreenSettings.customIcons[appId];
                    await saveData();
                    iconImg.src = appData.url;
                    resetBtn.style.display = 'none';
                    showToast(`「${appData.name}」已恢复默认图标`);
                }
            });

            container.appendChild(item);
        });
    };

    renderList('peek-gen-social-list', groups.social);
    renderList('peek-gen-life-list', groups.life);
    renderList('peek-gen-tools-list', groups.tools);
}

function renderPeekAlbum(photos) {
    const screen = document.getElementById('peek-album-screen');
    const grid = screen.querySelector('.album-grid');
    grid.innerHTML = ''; 

    if (!photos || photos.length === 0) {
        grid.innerHTML = '<p class="placeholder-text">正在生成相册内容...</p>';
        return;
    }

    const FALLBACK_PHOTO = 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg';

    photos.forEach((photo, index) => {
        const photoEl = document.createElement('div');
        photoEl.className = 'album-photo';
        photoEl.dataset.imageDescription = photo.imageDescription;
        photoEl.dataset.description = photo.description;

        // 图片来源：已有 url 沿用；没有则从共享图片库随机挑一张并记在照片上（下次不再换）
        let src = photo.url;
        if (!src) {
            src = pickPeekPoolUrl() || FALLBACK_PHOTO;
            photo.url = src;
            saveData().catch(() => { });
        }

        const img = document.createElement('img');
        img.src = src;
        img.alt = "相册照片";
        photoEl.appendChild(img);

        if (photo.type === 'video') {
            const videoIndicator = document.createElement('div');
            videoIndicator.className = 'video-indicator';
            videoIndicator.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>`;
            photoEl.appendChild(videoIndicator);
        }
        
        photoEl.addEventListener('click', () => {
            const modal = document.getElementById('peek-photo-modal');
            const card = document.getElementById('peek-flip-card');
            const img = document.getElementById('peek-flip-img');
            const descEl = document.getElementById('peek-flip-desc');
            const annoEl = document.getElementById('peek-flip-anno');
            const videoBadge = document.getElementById('peek-flip-video-badge');
            if (!modal || !card) return;

            img.src = photoEl.querySelector('img')?.src || '';
            descEl.textContent = photo.imageDescription || '（暂无描述）';
            annoEl.textContent = photo.description || '（暂无批注）';
            videoBadge.style.display = photo.type === 'video' ? 'flex' : 'none';

            card.classList.remove('flipped');
            modal.classList.add('visible');
        });

        // 长按删除照片
        attachPeekLongPress(photoEl, async () => {
            if (!confirm('删除这张照片？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.album?.photos;
            if (arr && index < arr.length) {
                arr.splice(index, 1);
                await saveData();
                renderPeekAlbum(arr);
                showToast('已删除');
            }
        });

        grid.appendChild(photoEl);
    });
}

function renderPeekUnlock(data) {
    const screen = document.getElementById('peek-unlock-screen');
    if (!screen) return;

    if (!data) {
        screen.innerHTML = `
            <header class="app-header">
                <button class="back-btn" data-target="peek-screen">‹</button>
                <div class="title-container"><h1 class="title">...</h1></div>
                <button class="action-btn">···</button>
            </header>
            <main class="content"><p class="placeholder-text">正在生成小号内容...</p></main>
        `;
        return;
    }

    const { nickname, handle, bio, posts } = data;
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { unlockAvatar: '' };
    const fixedAvatar = peekSettings.unlockAvatar || 'https://i.postimg.cc/SNwL1XwR/chan-11.png';

    const randomFollowers = (Math.random() * 5 + 1).toFixed(1) + 'k';
    const randomFollowing = Math.floor(Math.random() * 500) + 50;

    let postsHtml = '';
    if (posts && posts.length > 0) {
        posts.forEach((post, idx) => {
            const randomComments = Math.floor(Math.random() * 100);
            const randomLikes = Math.floor(Math.random() * 500);
            postsHtml += `
                <div class="unlock-post-card" data-post-index="${idx}">
                    <div class="unlock-post-card-header">
                        <img src="${fixedAvatar}" alt="Profile Avatar">
                        <div class="unlock-post-card-author-info">
                            <span class="username">${nickname}</span>
                            <span class="timestamp">${post.timestamp}</span>
                        </div>
                    </div>
                    <div class="unlock-post-card-content">
                        ${post.content.replace(/\n/g, '<br>')}
                    </div>
                    <div class="unlock-post-card-actions">
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L16.04,7.15C16.56,7.62 17.24,7.92 18,7.92C19.66,7.92 21,6.58 21,5C21,3.42 19.66,2 18,2C16.34,2 15,3.42 15,5C15,5.24 15.04,5.47 15.09,5.7L7.96,9.85C7.44,9.38 6.76,9.08 6,9.08C4.34,9.08 3,10.42 3,12C3,13.58 4.34,14.92 6,14.92C6.76,14.92 7.44,14.62 7.96,14.15L15.09,18.3C15.04,18.53 15,18.76 15,19C15,20.58 16.34,22 18,22C19.66,22 21,20.58 21,19C21,17.42 19.66,16.08 18,16.08Z"></path></svg> <span>分享</span></div>
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M20,2H4C2.9,0,2,0.9,2,2v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z M18,14H6v-2h12V14z M18,11H6V9h12V11z M18,8H6V6h12V8z"></path></svg> <span>${randomComments}</span></div>
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36,2,12.27,2,8.5C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"></path></svg> <span>${randomLikes}</span></div>
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container">
                <h1 class="title">${nickname}</h1>
            </div>
            <button class="action-btn" id="refresh-unlock-btn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M18.53 10.78 18.6 10.09 18.59 9.49 18.53 8.89 18.39 8.18 18.21 7.61 17.92 6.94 17.57 6.31 17.22 5.82 16.83 5.36 16.31 4.85 15.84 4.48 15.23 4.09 14.69 3.82 14.13 3.6 13.55 3.44 12.84 3.3 12.24 3.25 11.52 3.27 10.8 3.36 10.21 3.5 9.53 3.73 8.98 3.98 8.46 4.28 7.97 4.63 7.51 5.02 7 5.54 6.63 6.01 6.3 6.52 6.02 7.05 5.75 7.72 5.59 8.3 5.45 9M7.66 14.83 8.46 15.42 9.42 15.92 10.45 16.26 11.52 16.43 12.6 16.42 13.67 16.24 14.69 15.88 15.58 15.39"/><path stroke-width="1.05" d="M1.4 12.8 1.43 13.16 1.56 13.63 1.79 14.05 2.02 14.33 2.3 14.57 2.72 14.81 3.18 14.96 3.54 15 3.9 14.98 4.37 14.86 4.8 14.64 5.18 14.33 5.47 13.95 5.64 13.63 5.75 13.28 5.8 12.8 5.75 12.32 5.64 11.97 5.47 11.65 5.18 11.27 4.9 11.03 4.48 10.79 4.14 10.67 3.66 10.6 3.3 10.62 2.83 10.74 2.4 10.96 2.11 11.18 1.79 11.55 1.56 11.97 1.45 12.32Z"/><path stroke-width="1.05" d="M5.8 12.8 8.41 12.8M15.59 12.8 20.4 12.8"/><path stroke-width="1.05" d="M17.6 12.8 17.6 15.2"/><path stroke-width="1.05" d="M20.4 12.8 20.4 15.7"/><circle cx="11.03" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.97" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.1 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M13.6 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/></svg></button>
        </header>
        <main class="content">
            <div class="unlock-profile-header">
                <img src="${fixedAvatar}" alt="Profile Avatar" class="unlock-profile-avatar">
                <div class="unlock-profile-info">
                    <h2 class="unlock-profile-username">${nickname}</h2>
                    <p class="unlock-profile-handle">${handle}</p>
                </div>
            </div>
            <div class="unlock-profile-bio">
                <p>${bio.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="unlock-profile-stats">
                <div class="unlock-profile-stat">
                    <span class="count">${posts.length}</span>
                    <span class="label">帖子</span>
                </div>
                <div class="unlock-profile-stat">
                    <span class="count">${randomFollowers}</span>
                    <span class="label">粉丝</span>
                </div>
                <div class="unlock-profile-stat">
                    <span class="count">${randomFollowing}</span>
                    <span class="label">关注</span>
                </div>
            </div>
            <div class="unlock-post-feed">
                ${postsHtml}
            </div>
        </main>
    `;

    screen.querySelector('#refresh-unlock-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('unlock', { forceRefresh: true });
    });

    // 长按删除小号帖子
    screen.querySelectorAll('.unlock-post-card').forEach((postEl) => {
        attachPeekLongPress(postEl, async () => {
            if (!confirm('删除这条帖子？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.unlock?.posts;
            const idx = parseInt(postEl.dataset.postIndex, 10);
            if (arr && !isNaN(idx) && idx < arr.length) {
                arr.splice(idx, 1);
                await saveData();
                renderPeekUnlock(char.peekData.unlock);
                showToast('已删除');
            }
        });
    });
}

/* 手机框内页面切换：按需求无动画直达（点击消息立即显示会话页，不做滑入过渡） */
function peekPushScreen(fromId, toId) {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    if (!toEl) return;
    if (fromEl) fromEl.classList.remove('active', 'peek-push-under');
    toEl.classList.remove('peek-push-in', 'peek-push-over');
    toEl.classList.add('active');
}

function renderPeekConversation(history, partnerName) {
    const titleEl = document.getElementById('peek-conversation-title');
    const messageAreaEl = document.getElementById('peek-message-area');

    titleEl.textContent = partnerName;
    messageAreaEl.innerHTML = '';

    if (!history || history.length === 0) {
        messageAreaEl.innerHTML = '<p class="placeholder-text">正在生成对话...</p>';
        return;
    }

    let prevSender = null;
    let prevTs = null;
    // 预计算每条是否为同侧组的最后一条（下一条换人，或中间会插时间分隔）→ 挂小尾巴
    const isGroupEnd = history.map((msg, i) => {
        const next = history[i + 1];
        if (!next) return true;
        if (next.sender !== msg.sender) return true;
        const tA = Number(msg.timestamp) || null;
        const tB = Number(next.timestamp) || null;
        if (tA && tB && tB - tA > 30 * 60000) return true;   // 中间会插时间分隔，视觉上已断组
        return false;
    });
    history.forEach((msg, idx) => {
        const isSentByChar = msg.sender === 'char';
        const ts = Number(msg.timestamp) || null;

        // 时间分隔：首条或与上一条间隔超过 30 分钟时插入居中灰字时间
        if (ts && (!prevTs || ts - prevTs > 30 * 60000)) {
            const label = document.createElement('div');
            label.className = 'im-time-label';
            label.textContent = formatImTime(ts);
            messageAreaEl.appendChild(label);
            prevSender = null;
        }

        const wrapper = document.createElement('div');
        // 同侧连续气泡归组：紧凑排列，组首留出间隙（iMessage 风格）
        wrapper.className = `message-wrapper ${isSentByChar ? 'sent' : 'received'}${prevSender === msg.sender ? '' : ' group-start'}`;

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';

        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isSentByChar ? 'sent' : 'received'}${isGroupEnd[idx] ? ' group-end' : ''}`;
        bubble.textContent = msg.content;
        bubbleRow.appendChild(bubble);

        wrapper.appendChild(bubbleRow);
        messageAreaEl.appendChild(wrapper);
        prevSender = msg.sender;
        if (ts) prevTs = ts;
    });

    // 最后一条是角色发出的，显示"已送达"（iMessage 风格）
    if (history.length > 0 && history[history.length - 1].sender === 'char') {
        const delivered = document.createElement('div');
        delivered.className = 'im-delivered';
        delivered.textContent = '已送达';
        messageAreaEl.appendChild(delivered);
    }
    messageAreaEl.scrollTop = messageAreaEl.scrollHeight;
}

function renderPeekScreen() {
    const peekScreen = document.getElementById('peek-screen');
    const contentArea = peekScreen.querySelector('main.content');

    // 把各 App 详情页摘下来暂存：下面的 innerHTML 重建会销毁它们，
    // 摘下来才能保住已渲染的内容，稍后再塞回新的手机框里
    const PEEK_APP_SCREEN_IDS = [
        'peek-messages-screen', 'peek-conversation-screen', 'peek-memo-detail-screen',
        'peek-memos-screen', 'peek-cart-screen', 'peek-transfer-station-screen',
        'peek-browser-screen', 'peek-drafts-screen', 'peek-album-screen',
        'peek-unlock-screen', 'peek-bag-screen', 'peek-steps-screen'
    ];
    const detachedPeekScreens = PEEK_APP_SCREEN_IDS
        .map(id => document.getElementById(id))
        .filter(Boolean);
    detachedPeekScreens.forEach(el => el.remove());

    contentArea.innerHTML = `
        <div class="peek-phone-frame">
            <div class="peek-frame-btn peek-frame-btn-mute"></div>
            <div class="peek-frame-btn peek-frame-btn-volup"></div>
            <div class="peek-frame-btn peek-frame-btn-voldn"></div>
            <div class="peek-frame-btn peek-frame-btn-power"></div>
            <div class="peek-phone-inner">
                <div class="peek-phone-wall" id="peek-phone-wall">
                    <div class="peek-statusbar">
                        <span class="peek-sb-time" id="peek-sb-time"></span>
                        <div class="peek-dynamic-island"><span class="peek-island-cam"></span></div>
                        <span class="peek-sb-right"><img class="peek-sb-icons" src="img/ios-statusbar-icons.png?v=20261112trim1" alt="" draggable="false"></span>
                    </div>
                    <div class="time-widget">
                        <div class="time" id="peek-time-display"></div>
                        <div class="date" id="peek-date-display"></div>
                    </div>
                    <div class="app-grid"></div>
                    <div class="peek-home-indicator"></div>
                </div>
            </div>
        </div>
    `;

    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {} };

    // 壁纸只贴进手机框内部，页面本体换成素净的浅灰底
    peekScreen.style.backgroundImage = 'none';
    const wall = document.getElementById('peek-phone-wall');
    const wallpaper = peekSettings.wallpaper;
    if (wallpaper) {
        wall.style.backgroundImage = `url(${wallpaper})`;
    } else if (db.wallpaper) {
        wall.style.backgroundImage = `url(${db.wallpaper})`;
    } else {
        wall.style.backgroundImage = 'linear-gradient(180deg, #fbd3da 0%, #f6bfc9 55%, #f2b0bd 100%)';
    }

    // 主屏幕颜色自定义：时间（含日期）/ APP 名字（空值走 CSS 默认）
    const timeWidget = contentArea.querySelector('.time-widget');
    if (timeWidget && peekSettings.timeColor) {
        timeWidget.style.color = peekSettings.timeColor;
    }

    // 把各 App 详情页塞回手机框内部：像真的 App 运行在这台手机里
    detachedPeekScreens.forEach(el => wall.appendChild(el));

    const appGrid = contentArea.querySelector('.app-grid');
    Object.keys(peekScreenApps).forEach(id => {
        const iconData = peekScreenApps[id];
        const iconEl = document.createElement('a');
        iconEl.href = '#';
        iconEl.className = 'app-icon';
        iconEl.dataset.peekAppId = id;
        const customIconUrl = peekSettings.customIcons?.[id];
        const iconUrl = customIconUrl || iconData.url;
        iconEl.innerHTML = `
            <img src="${iconUrl}" alt="${iconData.name}" class="icon-img">
            <span class="app-name"${peekSettings.appNameColor ? ` style="color:${peekSettings.appNameColor};"` : ''}>${iconData.name}</span>
        `;
        iconEl.addEventListener('click', (e) => {
            e.preventDefault();
            if (isBatchMode) {
                if (selectedApps.has(id)) {
                    selectedApps.delete(id);
                    iconEl.classList.remove('selected');
                } else {
                    if (selectedApps.size >= 4) {
                        showToast('最多只能选择4个应用');
                        return;
                    }
                    selectedApps.add(id);
                    iconEl.classList.add('selected');
                }
                updateBatchCount();
            } else {
                generateAndRenderPeekContent(id);
            }
        });
        appGrid.appendChild(iconEl);
    });

    updateClock();
}

/* ── 刷新生成的追加合并：数组类 App 把新条目拼到旧数据后面，不覆盖 ── */
const PEEK_MERGE_ARRAY_KEY = {
    memos: 'memos', album: 'photos', cart: 'items',
    transfer: 'entries', browser: 'history', drafts: 'drafts'
};
function mergePeekData(oldData, newData, appType) {
    if (!oldData) return newData;
    const key = PEEK_MERGE_ARRAY_KEY[appType];
    if (key) {
        let oldArr = Array.isArray(oldData[key]) ? oldData[key] : [];
        if (appType === 'drafts' && oldArr.length === 0 && oldData.draft) oldArr = [oldData.draft];
        const newArr = Array.isArray(newData[key]) ? newData[key] : [];
        return { ...newData, [key]: [...oldArr, ...newArr] };
    }
    if (appType === 'messages') {
        // 同名对话：把新生成的聊天记录追加到已有对话的 history 后面
        const oldArr = Array.isArray(oldData.conversations) ? oldData.conversations : [];
        const newArr = Array.isArray(newData.conversations) ? newData.conversations : [];
        const merged = oldArr.map(c => ({ ...c, history: Array.isArray(c.history) ? [...c.history] : [] }));
        for (const convo of newArr) {
            const existing = merged.find(c => c.partnerName === convo.partnerName);
            if (existing && Array.isArray(convo.history)) {
                existing.history.push(...convo.history);
            } else {
                merged.push({ ...convo, history: Array.isArray(convo.history) ? [...convo.history] : [] });
            }
        }
        return { ...newData, conversations: merged };
    }
    if (appType === 'unlock' && Array.isArray(oldData.posts)) {
        return { ...newData, posts: [...oldData.posts, ...(newData.posts || [])] };
    }
    if (appType === 'bag' && Array.isArray(oldData.items)) {
        return { bagName: newData.bagName || oldData.bagName, items: [...oldData.items, ...(newData.items || [])] };
    }
    return newData;   // steps 等单值数据：直接更新
}

/* ── 长按删除：按住 600ms 触发；触发后吞掉随之而来的 click，避免误开详情 ── */
let peekLongPressFired = false;
document.addEventListener('click', (e) => {
    if (peekLongPressFired) {
        e.stopPropagation();
        e.preventDefault();
        peekLongPressFired = false;
    }
}, true);

function attachPeekLongPress(el, onDelete) {
    if (!el) return;
    let timer = null;
    const start = () => {
        timer = setTimeout(() => {
            timer = null;
            peekLongPressFired = true;
            onDelete();
        }, 600);
    };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel, { passive: true });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ── iMessage 仿 iOS 风时间格式 ── */
const IM_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function imDayDiff(ts) {
    const d = new Date(ts);
    const now = new Date();
    return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate())
        - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
}
/* 列表右侧日期：一周内显示星期，更早显示 年/月/日 */
function formatImDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = imDayDiff(ts);
    if (diff >= 0 && diff < 7) return IM_WEEKDAYS[d.getDay()];
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
/* 对话内时间分隔：今天只显示 时:分，昨天/前天/一周内带前缀，更早带日期 */
function formatImTime(ts) {
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const diff = imDayDiff(ts);
    if (diff === 0) return hm;
    if (diff === 1) return `昨天 ${hm}`;
    if (diff === 2) return `前天 ${hm}`;
    if (diff >= 0 && diff < 7) return `${IM_WEEKDAYS[d.getDay()]} ${hm}`;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function renderPeekChatList(conversations = []) {
    const container = document.getElementById('peek-chat-list-container');
    container.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        return;
    }

    conversations.forEach((convo) => {
        const history = convo.history || [];
        const lastMessage = history.length > 0 ? history[history.length - 1] : null;
        const lastMessageText = lastMessage ? (lastMessage.content || '').replace(/\[.*?的消息：([\s\S]+)\]/, '$1') : '...';
        
        const li = document.createElement('li');
        li.className = 'list-item chat-item';
        li.dataset.name = convo.partnerName;

        const avatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';

        li.innerHTML = `
            <img src="${avatarUrl}" alt="${convo.partnerName}" class="chat-avatar">
            <div class="item-details">
                <div class="item-details-row">
                    <div class="item-name">${convo.partnerName}</div>
                    <div class="im-meta"><span class="im-date">${formatImDate(lastMessage && lastMessage.timestamp)}</span><span class="im-chevron">›</span></div>
                </div>
                <div class="item-preview-wrapper">
                    <div class="item-preview">${lastMessageText}</div>
                </div>
            </div>`;
        container.appendChild(li);

        // 长按删除整段对话
        attachPeekLongPress(li, async () => {
            if (!confirm(`删除与「${convo.partnerName}」的对话？`)) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.messages?.conversations;
            if (!arr) return;
            const idx = arr.findIndex(c => c.partnerName === convo.partnerName);
            if (idx > -1) arr.splice(idx, 1);
            await saveData();
            renderPeekChatList(arr);
            showToast('已删除');
        });
    });
}

function peekMemoDateLabel(d, daysAgo) {
    if (daysAgo < 7) return '星期' + '日一二三四五六'[d.getDay()];
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function renderMemosList(memos) {
    const screen = document.getElementById('peek-memos-screen');
    let listHtml = '';

    if (!memos || memos.length === 0) {
        listHtml = '<p class="placeholder-text">正在生成备忘录...</p>';
    } else {
        // 准备日期：AI 未返回日期时按序号铺开在过去约 90 天内
        const DAY = 86400000;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = memos.map((m, i) => {
            let d = m.date ? new Date(String(m.date).replace(/年|月/g, '/').replace(/日/g, '')) : null;
            if (!d || isNaN(d.getTime())) d = new Date(today.getTime() - (7 + ((i * 13) % 84)) * DAY);
            d = new Date(d.getTime()); d.setHours(0, 0, 0, 0);
            const daysAgo = Math.max(0, Math.floor((today - d) / DAY));
            const firstLine = (m.content || '').split('\n').map(s => s.trim()).find(s => s && s !== m.title) || '';
            return { ...m, _d: d, _days: daysAgo, _preview: firstLine || '无更多文本' };
        }).sort((a, b) => b._d - a._d);

        // iOS 备忘录分组：过去 7 天 / 过去 30 天 / 月份
        const groups = [];
        const groupMap = new Map();
        items.forEach(it => {
            let key;
            if (it._days < 7) key = '过去 7 天';
            else if (it._days < 30) key = '过去 30 天';
            else key = `${it._d.getMonth() + 1}月`;
            if (!groupMap.has(key)) {
                const g = { key, items: [] };
                groupMap.set(key, g);
                groups.push(g);
            }
            groupMap.get(key).items.push(it);
        });

        groups.forEach(g => {
            const rows = g.items.map(it => `
                <li class="peek-note-row memo-item" data-id="${it.id}">
                    <div class="peek-note-title">${it.title}</div>
                    <div class="peek-note-meta">${peekMemoDateLabel(it._d, it._days)} ${it._preview}</div>
                </li>`).join('');
            listHtml += `
                <div class="peek-note-section">
                    <div class="peek-note-section-title">${g.key}</div>
                    <ul class="peek-note-card">${rows}</ul>
                </div>`;
        });
    }

    screen.innerHTML = `
        <header class="app-header peek-memos-header">
            <button class="back-btn peek-memos-chip" data-target="peek-screen" aria-label="返回">‹</button>
            <div class="title-container"></div>
            <button class="action-btn peek-memos-chip peek-memos-more" aria-label="更多">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5.2" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18.8" cy="12" r="2"/></svg>
            </button>
        </header>
        <div class="peek-memos-large-title">备忘录</div>
        <main class="content peek-memos-content"><ul id="peek-memos-list">${listHtml}</ul></main>
        <div class="peek-memos-bottom-bar">
            <div class="peek-memos-search">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8e8e93" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>
                <input type="text" placeholder="搜索" aria-label="搜索备忘录" />
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#8e8e93"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15zm5.5-3.5a5.5 5.5 0 0 1-11 0H5a7 7 0 0 0 6 6.92V21h2v-2.58a7 7 0 0 0 6-6.92h-1.5z"/></svg>
            </div>
            <div class="peek-memos-compose" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ff9f0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8l-3.5.7.7-3.5 8.4-8.4z"/></svg>
            </div>
        </div>
    `;

    screen.querySelector('.peek-memos-more').addEventListener('click', () => {
        generateAndRenderPeekContent('memos', { forceRefresh: true });
    });

    // 搜索：实时过滤备忘录
    const searchInput = screen.querySelector('.peek-memos-search input');
    searchInput.addEventListener('input', () => {
        const kw = searchInput.value.trim().toLowerCase();
        screen.querySelectorAll('.peek-note-row').forEach(row => {
            const hit = !kw || row.textContent.toLowerCase().includes(kw);
            row.style.display = hit ? '' : 'none';
        });
        screen.querySelectorAll('.peek-note-section').forEach(sec => {
            const any = Array.from(sec.querySelectorAll('.peek-note-row')).some(r => r.style.display !== 'none');
            sec.style.display = any ? '' : 'none';
        });
    });

    screen.querySelectorAll('.memo-item').forEach(item => {
        item.addEventListener('click', () => {
            const memo = memos.find(m => m.id === item.dataset.id);

            if (memo) {
                renderMemoDetail(memo);
                switchScreen('peek-memo-detail-screen');
            }
        });

        // 长按删除备忘录
        attachPeekLongPress(item, async () => {
            if (!confirm('删除这条备忘录？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.memos?.memos;
            if (!arr) return;
            const idx = arr.findIndex(m => m.id === item.dataset.id);
            if (idx > -1) arr.splice(idx, 1);
            await saveData();
            renderMemosList(arr);
            showToast('已删除');
        });
    });
}

function renderMemoDetail(memo) {
    const screen = document.getElementById('peek-memo-detail-screen');
    if (!memo) return;
    // iOS 备忘录详情：标题为粗体首行，正文为其余行
    const lines = (memo.content || '').split('\n').map(s => s.trim());
    let bodyLines = lines;
    if (bodyLines.length && bodyLines[0] === memo.title) bodyLines = bodyLines.slice(1);
    const bodyHtml = bodyLines.filter(s => s).map(s => `<p>${s}</p>`).join('') || '<p>无更多文本</p>';

    screen.innerHTML = `
        <header class="app-header peek-memos-header">
            <button class="back-btn peek-memos-chip" data-target="peek-memos-screen" aria-label="返回">‹</button>
            <div class="title-container"></div>
            <div class="peek-note-detail-pill">
                <button class="peek-note-detail-icon" aria-label="分享">
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M7.5 10H6.5A2.5 2.5 0 0 0 4 12.5v6A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 17.5 10h-1"/></svg>
                </button>
                <button class="peek-note-detail-icon" aria-label="收藏">
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4.5L5 21V5a1 1 0 0 1 1-1z"/></svg>
                </button>
            </div>
        </header>
        <main class="content peek-note-detail-content">
            <h1 class="peek-note-detail-title">${memo.title}</h1>
            ${bodyHtml}
        </main>
        <div class="peek-note-detail-bottombar">
            <div class="peek-note-detail-tools">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7.5" r="2.7"/><path d="m5.9 7.5.9.9 1.5-1.8"/><circle cx="7" cy="16.5" r="2.7"/><path d="m5.9 16.5.9.9 1.5-1.8"/><path d="M12.8 7.5H20M12.8 16.5H20"/></svg>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m20.5 12.6-8.1 8.1a5.3 5.3 0 0 1-7.5-7.5l8.7-8.7a3.55 3.55 0 0 1 5 5l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.6-7.6"/></svg>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M8.6 15.5 12 8.2l3.4 7.3M9.9 13.2h4.2"/></svg>
            </div>
            <div class="peek-note-detail-compose" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8l-3.5.7.7-3.5 8.4-8.4z"/></svg>
            </div>
        </div>
    `;

    // 右上角书签按钮 → 收藏：把这条备忘录存进 Menu 页「收藏库」
    const favBtn = screen.querySelector('.peek-note-detail-icon[aria-label="收藏"]');
    if (favBtn) favBtn.addEventListener('click', () => favoritePeekMemo(memo));
}

function renderPeekCart(items) {
    const screen = document.getElementById('peek-cart-screen');
    let itemsHtml = '';
    let totalPrice = 0;

    if (!items || items.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成购物车内容...</p>';
    } else {
        items.forEach(item => {
            itemsHtml += `
                <li class="cart-item" data-id="${item.id}">
                    <img src="https://i.postimg.cc/wMbSMvR9/export202509181930036600.png" class="cart-item-image" alt="${item.title}">
                    <div class="cart-item-details">
                        <h3 class="cart-item-title">${item.title}</h3>
                        <p class="cart-item-spec">规格：${item.spec}</p>
                        <p class="cart-item-price">¥${item.price}</p>
                    </div>
                </li>
            `;
            totalPrice += parseFloat(item.price);
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">购物车</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M19.33 10.78 19.4 10.09 19.39 9.49 19.33 8.89 19.21 8.3 19.05 7.72 18.83 7.16 18.56 6.62 18.17 6.01 17.8 5.54 17.38 5.1 16.93 4.7 16.34 4.28 15.82 3.98 15.16 3.69 14.59 3.5 14 3.36 13.4 3.28 12.8 3.25 12.2 3.28 11.48 3.38 10.9 3.53 10.33 3.73 9.68 4.04 9.16 4.35 8.67 4.7 8.13 5.18 7.73 5.63 7.36 6.11 7.04 6.62 6.77 7.16 6.55 7.72 6.36 8.4"/><path stroke-width="1.05" d="M16.39 12.8 19.9 12.8 18.6 17.7 18.39 18.13 18.05 18.46 17.73 18.62 17.25 18.7 8.11 18.68 7.76 18.58 7.46 18.39 7.21 18.13 7.04 17.81 5.7 12.8 9.21 12.8"/><path stroke-width="1.05" d="M5.7 12.8 4.9 9.8 3.3 9.8"/><path stroke-width="1.05" d="M8.25 20.6 8.31 20.96 8.49 21.27 8.67 21.44 8.88 21.56 9.23 21.65 9.6 21.61 9.82 21.51 10.02 21.36 10.17 21.18 10.28 20.96 10.35 20.6 10.28 20.24 10.1 19.93 9.92 19.76 9.71 19.64 9.36 19.55 8.99 19.59 8.77 19.69 8.58 19.84 8.36 20.13 8.27 20.36Z"/><path stroke-width="1.05" d="M15.25 20.6 15.32 20.96 15.5 21.27 15.78 21.51 16 21.61 16.24 21.65 16.61 21.61 16.83 21.51 17.02 21.36 17.24 21.07 17.33 20.84 17.35 20.6 17.29 20.24 17.11 19.93 16.93 19.76 16.72 19.64 16.37 19.55 16 19.59 15.78 19.69 15.58 19.84 15.37 20.13 15.28 20.36Z"/><circle cx="11.83" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="13.77" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.8" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path stroke-width="1.1" d="M9 10.5Q10.05 9.05 11.1 10.5"/><path stroke-width="1.1" d="M14.5 10.5Q15.55 9.05 16.6 10.5"/></svg></button>
        </header>
        <main class="content"><ul class="cart-item-list">${itemsHtml}</ul></main>
        <footer class="cart-footer">
            <div class="cart-total-price">
                <span class="label">合计：</span>¥${totalPrice.toFixed(2)}
            </div>
            <button class="checkout-btn">结算</button>
        </footer>
    `;

    // 长按移除购物车商品
    screen.querySelectorAll('.cart-item').forEach((itemEl, index) => {
        attachPeekLongPress(itemEl, async () => {
            if (!confirm('把这个商品移出购物车？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.cart?.items;
            if (arr && index < arr.length) {
                arr.splice(index, 1);
                await saveData();
                renderPeekCart(arr);
                showToast('已移除');
            }
        });
    });

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('cart', { forceRefresh: true });
    });
    screen.querySelector('.checkout-btn').addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const cartItems = char.peekData?.cart?.items;
        if (!cartItems || cartItems.length === 0) {
            showToast('购物车是空的');
            return;
        }

        let totalPrice = 0;
        const itemsStrList = [];

        cartItems.forEach(item => {
            totalPrice += parseFloat(item.price);
            itemsStrList.push(`${item.title} x1`);
        });

        const itemsStr = itemsStrList.join(', ');
        const myName = char.myName;
        const realName = char.realName;

        // 清空购物车
        char.peekData.cart.items = [];
        await saveData();
        
        renderPeekCart([]);

        // 跳转回聊天界面
        switchScreen('chat-room-screen');

        // 发送消息
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-message-btn');

        if (input && sendBtn) {
            // 1. 发送系统提示
            input.value = `[system-display:${myName}帮${realName}清空了ta的购物车]`;
            sendBtn.click();

            // 2. 延迟发送订单消息
            setTimeout(() => {
                input.value = `[${myName}为${realName}下单了：即时送达|${totalPrice.toFixed(2)}|${itemsStr}]`;
                sendBtn.click();
            }, 300);
        }
    });
}

function renderPeekTransferStation(entries) {
    const screen = document.getElementById('peek-transfer-station-screen');
    let messagesHtml = '';

    if (!entries || entries.length === 0) {
        messagesHtml = '<p class="placeholder-text">正在生成中转站内容...</p>';
    } else {
        entries.forEach(entry => {
            messagesHtml += `
                <div class="message-wrapper sent">
                    <div class="message-bubble-row">
                        <div class="message-bubble sent" style="background-color: #98E165; color: #000;">${entry}</div>
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container">
                <h1 class="title">文件传输助手</h1>
            </div>
            <button class="action-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M18.6 9.82 18.56 9.13 18.47 8.53 18.28 7.83 18.07 7.27 17.81 6.73 17.44 6.11 17.07 5.63 16.67 5.18 16.13 4.7 15.64 4.35 15.12 4.04 14.58 3.78 13.9 3.53 13.32 3.38 12.6 3.28 12 3.25 11.4 3.28 10.68 3.38 10.1 3.53 9.42 3.78 8.88 4.04 8.36 4.35 7.78 4.78 7.33 5.18 6.93 5.63 6.56 6.11 6.19 6.73 5.93 7.27 5.72 7.83 5.53 8.53 5.44 9.13 5.4 9.82"/><path stroke-width="1.05" d="M15.59 12.8 17.5 12.8 17.87 12.86 18.1 12.96 18.31 13.11 18.54 13.4 18.65 13.63 18.7 14 18.7 19.13 18.6 19.49 18.47 19.71 18.21 19.97 17.87 20.14 17.5 20.2 6.5 20.2 6.13 20.14 5.79 19.97 5.6 19.8 5.46 19.6 5.35 19.37 5.3 19.13 5.3 14 5.35 13.63 5.46 13.4 5.69 13.11 5.9 12.96 6.13 12.86 6.5 12.8 8.41 12.8"/><path stroke-width="1.05" d="M5.3 12.8 3.4 10.6"/><path stroke-width="1.05" d="M18.7 12.8 20.6 10.6"/><path stroke-width="1.05" d="M7.3 17.8 10.5 17.8"/><circle cx="11.03" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.97" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path stroke-width="1.1" d="M8.2 10.5Q9.25 9.05 10.3 10.5"/><path stroke-width="1.1" d="M13.7 10.5Q14.75 9.05 15.8 10.5"/></svg>
            </button>
        </header>
        <main class="content">
            <div class="message-area" style="padding: 10px;">
                ${messagesHtml}
            </div>
            <div class="transfer-station-input-area">
                <div class="fake-input"></div>
                <button class="plus-btn"></button>
            </div>
        </main>
    `;

    // 长按删除中转站条目
    screen.querySelectorAll('.message-wrapper').forEach((entryEl, index) => {
        attachPeekLongPress(entryEl, async () => {
            if (!confirm('删除这条传输内容？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.transfer?.entries;
            if (arr && index < arr.length) {
                arr.splice(index, 1);
                await saveData();
                renderPeekTransferStation(arr);
                showToast('已删除');
            }
        });
    });

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('transfer', { forceRefresh: true });
    });

    const messageArea = screen.querySelector('.message-area');
    if (messageArea) {
        messageArea.scrollTop = messageArea.scrollHeight;
    }
}

function renderPeekBrowser(historyItems) {
    const screen = document.getElementById('peek-browser-screen');
    let itemsHtml = '';

    if (!historyItems || historyItems.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成浏览记录...</p>';
    } else {
        // iOS Safari 历史记录：按 今天 / 昨天 / 日期 分组
        const DAY = 86400000;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = historyItems.map((it, idx) => {
            let d = it.date ? new Date(String(it.date).replace(/年|月/g, '/').replace(/日/g, '')) : null;
            if (!d || isNaN(d.getTime())) d = new Date(today.getTime() - ((idx * 29) % 13) * DAY);
            d = new Date(d.getTime()); d.setHours(0, 0, 0, 0);
            const daysAgo = Math.max(0, Math.round((today - d) / DAY));
            let groupKey;
            if (daysAgo === 0) groupKey = '今天';
            else if (daysAgo === 1) groupKey = '昨天';
            else groupKey = `${d.getMonth() + 1}月${d.getDate()}日`;
            const domain = String(it.url || '').split('/')[0].trim() || String(it.url || '').trim() || '网页';
            return { ...it, _idx: idx, _group: groupKey, _domain: domain };
        }).sort((a, b) => a._days - b._days);

        const groups = [];
        const gmap = new Map();
        items.forEach(it => {
            if (!gmap.has(it._group)) { const g = { key: it._group, items: [] }; gmap.set(it._group, g); groups.push(g); }
            gmap.get(it._group).items.push(it);
        });

        const FAV_COLORS = ['#E3EEFF', '#FFEEE0', '#E6F7EA', '#FDE9F2', '#EFEAFE', '#FFF6D9', '#E0F5F4'];
        groups.forEach(g => {
            const rows = g.items.map(it => {
                const letter = (it._domain || '?').charAt(0).toUpperCase();
                const color = FAV_COLORS[(it._domain || 'x').charCodeAt(0) % FAV_COLORS.length];
                const ann = String(it.annotation || '').trim();
                return `
                <li class="browser-history-item" data-idx="${it._idx}">
                    <div class="history-fav" style="background:${color}">${letter}</div>
                    <div class="history-main">
                        <div class="history-item-title">${it.title}</div>
                        <div class="history-item-url">${it._domain}</div>
                        ${ann ? `<div class="history-item-annotation">${ann}</div>` : ''}
                    </div>
                </li>`;
            }).join('');
            itemsHtml += `
                <div class="browser-history-section">
                    <div class="browser-history-date">${g.key}</div>
                    <ul class="browser-history-list">${rows}</ul>
                </div>`;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">浏览器</h1></div>
            <button class="action-btn" title="重新生成">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.9 13.9 8.5 15.5 10.1 10.1Z" fill="currentColor" stroke="none"/></svg>
            </button>
        </header>
        <main class="content browser-history-content">${itemsHtml}</main>
        <div class="browser-bottom-bar" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M7.5 10H6.5A2.5 2.5 0 0 0 4 12.5v6A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 17.5 10h-1"/></svg>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="4" width="12" height="12" rx="2"/><path d="M4 8v10a2 2 0 0 0 2 2h10"/></svg>
        </div>
    `;

    // 长按删除浏览记录（data-idx 映射回原始数组下标）
    screen.querySelectorAll('.browser-history-item').forEach((itemEl) => {
        attachPeekLongPress(itemEl, async () => {
            if (!confirm('删除这条浏览记录？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const arr = char?.peekData?.browser?.history;
            const idx = Number(itemEl.dataset.idx);
            if (arr && idx < arr.length) {
                arr.splice(idx, 1);
                await saveData();
                renderPeekBrowser(arr);
                showToast('已删除');
            }
        });
    });

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('browser', { forceRefresh: true });
    });
}

function renderPeekDrafts(drafts) {
    const screen = document.getElementById('peek-drafts-screen');
    
    // 兼容旧格式：如果传入的是单个对象而非数组
    if (drafts && !Array.isArray(drafts) && typeof drafts === 'object') {
        drafts = [drafts];
    }

    if (!drafts || drafts.length === 0) {
        screen.innerHTML = `
            <header class="app-header">
                <button class="back-btn" data-target="peek-screen">‹</button>
                <div class="title-container"><h1 class="title">草稿箱</h1></div>
                <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M18.6 10.03 18.58 9.37 18.51 8.77 18.39 8.18 18.16 7.49 17.92 6.94 17.57 6.31 17.22 5.82 16.83 5.36 16.4 4.93 15.94 4.55 15.33 4.15 14.8 3.87 14.24 3.64 13.67 3.46 13.08 3.34 12.36 3.26 11.64 3.26 11.04 3.32 10.45 3.44 9.76 3.64 9.2 3.87 8.67 4.15 8.16 4.48 7.6 4.93 7.08 5.45 6.7 5.91 6.37 6.41 6.08 6.94 5.84 7.49 5.61 8.18 5.49 8.77 5.42 9.38M10.29 16.23 11.16 16.4 12 16.45 12.84 16.4 13.71 16.23"/><path stroke-width="1.05" d="M9.35 14.2 4.2 14.2 3.95 14.16 3.71 14.06 3.44 13.79 3.31 13.43 3.31 12.17 3.44 11.81 3.71 11.54 3.95 11.44 4.2 11.4 7.05 11.4M16.87 11.51 20 12.8 16.6 14.2 14.65 14.2"/><path stroke-width="1.05" d="M6.2 11.4 6.2 14.2"/><circle cx="11.03" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.97" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.1 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M13.6 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/></svg></button>
            </header>
            <main class="content">
                <p class="placeholder-text">正在生成草稿...</p>
            </main>
        `;
        screen.querySelector('.action-btn').addEventListener('click', () => {
            generateAndRenderPeekContent('drafts', { forceRefresh: true });
        });
        return;
    }

    // Slider implementation
    let html = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">草稿箱</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M18.6 10.03 18.58 9.37 18.51 8.77 18.39 8.18 18.16 7.49 17.92 6.94 17.57 6.31 17.22 5.82 16.83 5.36 16.4 4.93 15.94 4.55 15.33 4.15 14.8 3.87 14.24 3.64 13.67 3.46 13.08 3.34 12.36 3.26 11.64 3.26 11.04 3.32 10.45 3.44 9.76 3.64 9.2 3.87 8.67 4.15 8.16 4.48 7.6 4.93 7.08 5.45 6.7 5.91 6.37 6.41 6.08 6.94 5.84 7.49 5.61 8.18 5.49 8.77 5.42 9.38M10.29 16.23 11.16 16.4 12 16.45 12.84 16.4 13.71 16.23"/><path stroke-width="1.05" d="M9.35 14.2 4.2 14.2 3.95 14.16 3.71 14.06 3.44 13.79 3.31 13.43 3.31 12.17 3.44 11.81 3.71 11.54 3.95 11.44 4.2 11.4 7.05 11.4M16.87 11.51 20 12.8 16.6 14.2 14.65 14.2"/><path stroke-width="1.05" d="M6.2 11.4 6.2 14.2"/><circle cx="11.03" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.97" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.1 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M13.6 10.05a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/></svg></button>
        </header>
        <main class="content drafts-slider-container">
            <div class="drafts-slider-track">`;

    // Add clones for infinite loop: [Last, Item1, Item2, ..., ItemN, First]
    const items = [drafts[drafts.length - 1], ...drafts, drafts[0]];

    // 长按删除用：滑轨含首尾克隆页，记录每页对应的真实草稿索引
    const draftRealIndices = [];

    items.forEach((draft, i) => {
        draftRealIndices.push(i === 0 ? drafts.length - 1 : (i === items.length - 1 ? 0 : i - 1));
        // 处理换行并允许 HTML 标签（如删除线）
        // 同时对每一行进行 trim() 处理，消除 AI 产生的多余缩进空格
        const formattedContent = (draft.content || '')
            .split('\n')
            .map(line => line.trim())
            .join('<br>');

        html += `
            <div class="draft-slide">
                <div class="draft-paper">
                    <div class="draft-to">To: ${draft.to}</div>
                    <div class="draft-content">${formattedContent}</div>
                    <button class="draft-fav-btn" aria-label="收藏" title="收藏">
                        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2.6l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-1z"/></svg>
                    </button>
                </div>
            </div>`;
    });

    html += `
            </div>
            <div class="draft-indicators">
                ${drafts.map((_, i) => `<span class="indicator ${i === 0 ? 'active' : ''}"></span>`).join('')}
            </div>
        </main>
    `;

    screen.innerHTML = html;

    // 长按删除草稿（换算滑轨克隆页的真实索引）
    screen.querySelectorAll('.draft-slide').forEach((slideEl, j) => {
        attachPeekLongPress(slideEl, async () => {
            const realIndex = draftRealIndices[j];
            if (!confirm('删除这页草稿？')) return;
            const char = db.characters.find(c => c.id === currentChatId);
            const data = char?.peekData?.drafts;
            let arr = Array.isArray(data?.drafts) ? data.drafts : (data?.draft ? [data.draft] : null);
            if (arr && realIndex < arr.length) {
                arr.splice(realIndex, 1);
                if (char.peekData.drafts) {
                    char.peekData.drafts.drafts = arr;
                    delete char.peekData.drafts.draft;
                }
                await saveData();
                renderPeekDrafts(arr);
                showToast('已删除');
            }
        });
    });

    // 右下角五角星 → 收藏这一页草稿（滑轨含首尾克隆页，换算真实索引）
    screen.querySelectorAll('.draft-fav-btn').forEach((favEl, j) => {
        favEl.addEventListener('click', (e) => {
            e.stopPropagation();
            favoritePeekDraft(drafts[draftRealIndices[j]]);
        });
    });

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('drafts', { forceRefresh: true });
    });

    // Slider Logic
    const track = screen.querySelector('.drafts-slider-track');
    const indicators = screen.querySelectorAll('.indicator');
    let currentIndex = 1; // Start at the first real item
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID = 0;
    let isDragging = false;
    let startTime = 0;

    const setSliderPosition = () => {
        track.style.transform = `translateX(${currentTranslate}px)`;
    };

    const updateTranslate = () => {
        currentTranslate = -currentIndex * screen.offsetWidth;
        prevTranslate = currentTranslate;
        setSliderPosition();
    };

    // Initial position
    updateTranslate();

    const touchStart = (event) => {
        isDragging = true;
        startX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
        startTime = Date.now();
        track.style.transition = 'none';
        animationID = requestAnimationFrame(animation);
    };

    const touchMove = (event) => {
        if (isDragging) {
            const currentX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
            currentTranslate = prevTranslate + currentX - startX;
        }
    };

    const touchEnd = () => {
        isDragging = false;
        cancelAnimationFrame(animationID);
        
        const movedBy = currentTranslate - prevTranslate;
        const timeElapsed = Date.now() - startTime;
        const velocity = Math.abs(movedBy) / timeElapsed;

        // Swipe detection: moved more than 1/3 width or high velocity
        if (movedBy < -screen.offsetWidth / 3 || (velocity > 0.5 && movedBy < 0)) {
            currentIndex += 1;
        } else if (movedBy > screen.offsetWidth / 3 || (velocity > 0.5 && movedBy > 0)) {
            currentIndex -= 1;
        }

        transitionToSlide();
    };

    const transitionToSlide = () => {
        track.style.transition = 'transform 0.3s ease-out';
        currentTranslate = -currentIndex * screen.offsetWidth;
        prevTranslate = currentTranslate;
        setSliderPosition();

        // Handle infinite loop after transition
        setTimeout(() => {
            if (currentIndex === 0) {
                currentIndex = drafts.length;
                track.style.transition = 'none';
                updateTranslate();
            } else if (currentIndex === drafts.length + 1) {
                currentIndex = 1;
                track.style.transition = 'none';
                updateTranslate();
            }
            updateIndicators();
        }, 300);
    };

    const updateIndicators = () => {
        indicators.forEach((dot, i) => {
            dot.classList.toggle('active', i === (currentIndex - 1 + drafts.length) % drafts.length);
        });
    };

    const animation = () => {
        setSliderPosition();
        if (isDragging) requestAnimationFrame(animation);
    };

    track.addEventListener('touchstart', touchStart, { passive: true });
    track.addEventListener('touchend', touchEnd);
    track.addEventListener('touchmove', touchMove, { passive: true });
    track.addEventListener('mousedown', touchStart);
    track.addEventListener('mouseup', touchEnd);
    track.addEventListener('mousemove', touchMove);
    track.addEventListener('mouseleave', touchEnd);
}

function renderPeekSteps(data) {
    const screen = document.getElementById('peek-steps-screen');
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return; 

    const avatarEl = screen.querySelector('#steps-char-avatar');
    const nameEl = screen.querySelector('#steps-char-name');
    const currentStepsEl = screen.querySelector('#steps-current-count');
    const goalStepsEl = screen.querySelector('.steps-label');
    const progressRingEl = screen.querySelector('#steps-progress-ring');
    const trackListEl = screen.querySelector('#activity-track-list');
    const annotationEl = screen.querySelector('#steps-annotation-content');

    avatarEl.src = char.avatar;
    nameEl.textContent = char.realName;
    goalStepsEl.textContent = '/ 6000 步';

    if (!data) {
        currentStepsEl.textContent = '----';
        trackListEl.innerHTML = '<li class="activity-track-item">正在生成活动轨迹...</li>';
        annotationEl.textContent = '正在生成角色批注...';
        progressRingEl.style.setProperty('--steps-percentage', 0);
        return;
    }

    currentStepsEl.textContent = data.currentSteps;
    
    const percentage = (data.currentSteps / 6000) * 100;
    progressRingEl.style.setProperty('--steps-percentage', percentage);

    trackListEl.innerHTML = data.trajectory.map(item => `<li class="activity-track-item">${item}</li>`).join('');
    annotationEl.textContent = data.annotation;
}

function getAppPromptSnippet(char, appType, targetCount) {
    switch (appType) {
        case 'messages':
            return `
【消息应用】
请为 ${char.realName} 编造恰好 ${targetCount} 个最近的对话。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。
<messages>
  <conversations>
    <conversation>
      <partnerName>与Ta对话的人的称呼</partnerName>
      <history>
        <message sender="char">${char.realName}发送的消息内容</message>
        <message sender="partner">对方发送的消息内容</message>
      </history>
    </conversation>
  </conversations>
</messages>`;
        case 'steps':
            return `
【步数应用】
请为 ${char.realName} 生成今天的步数信息。你需要生成Ta的当前步数(currentSteps)，Ta的恰好 ${targetCount} 条运动轨迹(trajectory)（禁止照搬示例）以及批注(annotation)。内容需要与Ta的人设和我们的聊天上下文高度相关。
<steps>
  <currentSteps>8102</currentSteps>
  <trajectory>
    <item>08:30 AM - 公司楼下咖啡馆</item>
    <item>10:00 AM - 宠物用品店</item>
  </trajectory>
  <annotation>角色对自己今天运动情况的批注</annotation>
</steps>`;
        case 'album':
            return `
【相册应用】
请为 ${char.realName} 的相册生成恰好 ${targetCount} 个条目（照片或视频）。内容需要与Ta的人设和我们的聊天上下文高度相关。'imageDescription' 是对这张照片/视频的详细文字描述，它将代替真实的图片展示给用户。'description' 是 ${char.realName} 自己对这张照片/视频的一句话批注，会显示在描述下方。
<album>
  <photos>
    <photo type="photo">
      <imageDescription>对一张照片的详细文字描述，例如：一张傍晚在海边的自拍，背景是橙色的晚霞和归来的渔船。</imageDescription>
      <description>角色对这张照片的一句话批注，例如：那天的风很舒服。</description>
    </photo>
    <photo type="video">
      <imageDescription>对一段视频的详细文字描述，例如：一段在猫咖撸猫的视频，视频里有一只橘猫在打哈欠。</imageDescription>
      <description>角色对这段视频的一句话批注，例如：下次还来这里！</description>
    </photo>
  </photos>
</album>`;
        case 'memos':
            return `
【备忘录应用】
请生成恰好 ${targetCount} 条备忘录，内容要与Ta的人设和我们的聊天上下文相关。
<memos>
  <memo id="memo_1">
    <date>YYYY/M/D</date>
    <title>备忘录标题</title>
    <content>备忘录内容，可以包含换行符</content>
  </memo>
</memos>
注意：date 是每条备忘录的创建日期，必须在过去 90 天以内、各条之间尽量分散（有些要落在最近一周内），格式如 2026/11/3。`;
        case 'cart':
            return `
【购物车应用】
请生成恰好 ${targetCount} 件商品，这些商品应该反映Ta的兴趣、需求或我们最近聊到的话题。
<cart>
  <items>
    <item id="cart_1">
      <title>商品标题</title>
      <spec>商品规格</spec>
      <price>25.00</price>
    </item>
  </items>
</cart>`;
        case 'browser':
            return `
【浏览器历史记录】
请生成恰好 ${targetCount} 条浏览记录。记录本身要符合Ta的人设和我们的聊天上下文，'annotation'字段则要站在角色自己的视角，记录Ta对这条浏览记录的想法或批注。
<browser>
  <history>
    <item>
      <date>YYYY/M/D</date>
      <title>网页标题</title>
      <url>example.com/path</url>
      <annotation>角色对于这条浏览记录的想法或批注</annotation>
    </item>
  </history>
</browser>
注意：date 是每条浏览记录的日期，必须在过去 14 天以内、各条之间尽量分散（要包含今天和昨天的各一两条），格式如 2026/11/13。`;
        case 'drafts':
            return `
【草稿箱】
请生成恰好 ${targetCount} 份Ta写给我但犹豫未决、未发送的草稿。内容要深刻、细腻，反映Ta的内心挣扎和与我的关系。
<drafts>
  <draft>
    <to>${char.myName}</to>
    <content>一封写给我但未发送的草稿内容，可以使用HTML的<span class='strikethrough'></span>标签来表示划掉的文字。</content>
  </draft>
</drafts>`;
        case 'transfer':
            return `
【文件传输助手】
请为 ${char.realName} 生成恰好 ${targetCount} 条Ta发送给自己的、简短零碎的消息。这些内容应该像是Ta的临时备忘、灵感闪现或随手保存的链接，要与Ta的人设和我们的聊天上下文相关，但比“备忘录”应用的内容更随意、更口语化。
<transfer>
  <entries>
    <entry>要记得买牛奶。</entry>
    <entry>https://example.com/interesting-article</entry>
    <entry>刚刚那个想法不错，可以深入一下...</entry>
  </entries>
</transfer>`;
        case 'unlock':
            return `
【微博小号】
请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成昵称、ID、个性签名，以及恰好 ${targetCount} 条最近的微博。微博内容要生活化、碎片化，符合小号的风格，并与Ta的人设和我们的聊天上下文高度相关。
<unlock>
  <nickname>角色的微博昵称</nickname>
  <handle>@角色的微博ID</handle>
  <bio>角色的个性签名，可以包含换行符</bio>
  <posts>
    <post>
      <timestamp>2小时前</timestamp>
      <content>第一条微博正文内容，140字以内。</content>
    </post>
    <post>
      <timestamp>昨天</timestamp>
      <content>第二条微博正文内容。</content>
    </post>
    <post>
      <timestamp>3天前</timestamp>
      <content>第三条微博正文内容。</content>
    </post>
  </posts>
</unlock>`;
        case 'bag':
            return `
【随身包包】
请为 ${char.realName} 生成Ta今天随身携带的包包款式(bagName)，以及包里恰好 ${targetCount} 件物品(items)。
'location' 是物品在包里的具体位置。
'name' 是物品的名称。
'annotation' 是Ta放进这件物品时，脑海中浮现的想法。
内容需要与Ta的人设和我们的聊天上下文相关，体现出生活细节。
<bag>
  <bagName>包包的款式描述，例如：黑色做旧复古邮差包</bagName>
  <items>
    <item>
      <location>在包里的侧边夹层袋内</location>
      <name>一盒薄荷糖</name>
      <annotation>Ta最近好像总是咳嗽……不知道会不会遇见Ta，算了，随身带着吧。</annotation>
    </item>
  </items>
</bag>`;
        default:
            return '';
    }
}

function generatePeekContentPrompt(char, appType, mainChatContext) {
    const appNameMapping = {
        messages: "消息应用（模拟与他人的对话）",
        memos: "备忘录应用",
        cart: "电商平台的购物车",
        transfer: "文件传输助手（用于记录临时想法、链接等）",
        browser: "浏览器历史记录",
        drafts: "邮件或消息的草稿箱",
        steps: "健康步数应用",
        unlock: "微博小号应用",
        bag: "随身包包（模拟翻找包里的物品）"
    };
    const appName = appNameMapping[appType] || appType;

    // 获取自定义生成条数
    const peekSettings = char.peekScreenSettings || {};
    const genCounts = peekSettings.generationCounts || {};
    const defaultCounts = {
        messages: 5, album: 6, memos: 3, cart: 4, browser: 5, transfer: 6, drafts: 1, steps: 6, unlock: 4, bag: 5
    };
    const targetCount = genCounts[appType] || defaultCounts[appType] || 5;

    const worldBooksLimitBreak = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'limit_break'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksBefore = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksAfter = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksGuidelines = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'guidelines'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    let prompt = `你正在模拟一个名为 ${char.realName} 的角色的手机内部信息。`;

    if (worldBooksLimitBreak) {
        prompt += `\n${worldBooksLimitBreak}\n`;
    }
    if (worldBooksBefore) {
        prompt += `\n为了更好地理解背景，请参考以下世界观设定：\n${worldBooksBefore}\n`;
    }
    prompt += `该角色的核心人设是：${char.persona}。\n`;

    if (worldBooksAfter) {
        prompt += `\n${worldBooksAfter}\n`;
    }

    if (worldBooksGuidelines) {
        prompt += `\n${worldBooksGuidelines}\n`;
    }

    if (char.myPersona) {
        prompt += `\n作为参考，我（用户）的人设是：${char.myPersona}\n`;
    }

    prompt += `最近，我（称呼为 ${char.myName}）和 ${char.realName} 的对话如下（这是你们关系和当前状态的核心参考）：\n---\n${mainChatContext}\n---\n`;

    // 信息 App：额外读取该角色的总结/日记（memoryJournals），保证生成内容与共同记忆一致
    if (appType === 'messages' && Array.isArray(char.memoryJournals) && char.memoryJournals.length) {
        const journalContext = char.memoryJournals
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 10)
            .map(j => `【${j.title || '无标题'}】${String(j.content || '').slice(0, 500)}`)
            .join('\n');
        if (journalContext) {
            prompt += `\n以下是你们之间的回忆总结/日记（记录了你们共同经历的重要事件，生成内容时必须与其保持一致，不要产生矛盾）：\n---\n${journalContext}\n---\n`;
        }
    }

    prompt += `现在，我正在偷看Ta手机上的“${appName}”。请你基于Ta的人设和我们最近的聊天内容，生成符合该应用场景的、高度相关且富有沉浸感的内容。\n`;
    
    if (char.bilingualModeEnabled) {
        prompt += `✨双语模式特别指令✨：当Ta的母语为中文以外的语言时，你的app内容文本**必须**遵循双语模式下的形式：{外语原文}「中文翻译」,例如: Of course, I'd love to.「当然，我很乐意。」,主要语言逻辑为角色母语，中文翻译文本视为系统自翻译，不视为原话;当需要表达中文时，需要根据角色设定自行判断对于中文的熟悉程度。这条规则的优先级非常高，请务必遵守。\n`;
    }

    prompt += `你的输出必须是XML格式，且只包含XML内容，必须以<result>作为根节点，不要有任何额外的解释或标记。根据应用类型，XML结构如下：\n`;

    prompt += `<result>\n`;
    prompt += getAppPromptSnippet(char, appType, targetCount);
    prompt += `\n</result>`;

    return prompt;
}

function generateBatchPeekContentPrompt(char, appTypes, mainChatContext) {
    const worldBooksLimitBreak = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'limit_break'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksBefore = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksAfter = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    const worldBooksGuidelines = (char.worldBookIds || [])
        .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'guidelines'))
        .filter(Boolean)
        .sort((a, b) => (a.depth || 100) - (b.depth || 100))
        .map(wb => wb.content).join('\n');

    let prompt = `你正在模拟一个名为 ${char.realName} 的角色的手机内部信息。`;

    if (worldBooksLimitBreak) {
        prompt += `\n${worldBooksLimitBreak}\n`;
    }
    if (worldBooksBefore) {
        prompt += `\n为了更好地理解背景，请参考以下世界观设定：\n${worldBooksBefore}\n`;
    }
    prompt += `该角色的核心人设是：${char.persona}。\n`;

    if (worldBooksAfter) {
        prompt += `\n${worldBooksAfter}\n`;
    }

    if (worldBooksGuidelines) {
        prompt += `\n${worldBooksGuidelines}\n`;
    }

    if (char.myPersona) {
        prompt += `\n作为参考，我（用户）的人设是：${char.myPersona}\n`;
    }

    prompt += `最近，我（称呼为 ${char.myName}）和 ${char.realName} 的对话如下（这是你们关系和当前状态的核心参考）：\n---\n${mainChatContext}\n---\n`;

    // 信息 App：批量生成时同样注入角色的总结/日记（memoryJournals）
    if (Array.isArray(appTypes) && appTypes.includes('messages') && Array.isArray(char.memoryJournals) && char.memoryJournals.length) {
        const journalContext = char.memoryJournals
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 10)
            .map(j => `【${j.title || '无标题'}】${String(j.content || '').slice(0, 500)}`)
            .join('\n');
        if (journalContext) {
            prompt += `\n以下是你们之间的回忆总结/日记（记录了你们共同经历的重要事件，生成内容时必须与其保持一致，不要产生矛盾）：\n---\n${journalContext}\n---\n`;
        }
    }

    prompt += `现在，我正在偷看Ta手机上的多个应用。请你基于Ta的人设和我们最近的聊天内容，一次性生成这些应用的内容。\n`;
    
    if (char.bilingualModeEnabled) {
        prompt += `✨双语模式特别指令✨：当角色的母语为中文以外的语言时，你的app内容文本**必须**遵循双语模式下的形式：{外语原文}「中文翻译」,例如: Of course, I'd love to.「当然，我很乐意。」,主要语言逻辑为角色母语，中文翻译文本视为系统自翻译，不视为原话;当角色需要表达中文时，需要根据角色设定自行判断对于中文的熟悉程度。这条规则的优先级非常高，请务必遵守。\n`;
    }

    prompt += `你的输出必须是XML格式，且只包含XML内容，必须以<result>作为根节点，不要有任何额外的解释或标记。你需要生成的应用内容及对应格式如下：\n`;

    const peekSettings = char.peekScreenSettings || {};
    const genCounts = peekSettings.generationCounts || {};
    const defaultCounts = {
        messages: 5, album: 6, memos: 3, cart: 4, browser: 5, transfer: 6, drafts: 1, steps: 6, unlock: 4, bag: 5
    };

    appTypes.forEach(appType => {
        // 批量生成时，稍微减少每个应用的生成数量以防截断
        let targetCount = genCounts[appType] || defaultCounts[appType] || 5;
        if (targetCount > 3) targetCount = Math.max(3, Math.floor(targetCount * 0.8));
        
        prompt += getAppPromptSnippet(char, appType, targetCount) + '\n';
    });

    prompt += `\n请确保最终输出的完整XML结构严格如下所示（不要输出任何多余的解释文字）：\n<result>\n`;
    appTypes.forEach(appType => {
        prompt += `  <${appType}>...</${appType}>\n`;
    });
    prompt += `</result>`;

    return prompt;
}

function parsePeekXML(xmlString, appType, rootNode = null) {
    let targetDoc = rootNode;

    if (!targetDoc) {
        const xmlMatch = xmlString.match(/<result>[\s\S]*<\/result>/i);
        const cleanXml = xmlMatch ? xmlMatch[0] : xmlString;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(cleanXml, "text/xml");

        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("XML 解析错误");
        }
        
        // 如果是单应用生成，可能没有包裹在 <appType> 标签里，直接用 xmlDoc
        // 如果有包裹，则取包裹的节点
        targetDoc = xmlDoc.querySelector(appType) || xmlDoc;
    }

    if (!targetDoc) return null;

    const result = {};

    const getText = (node, tag) => {
        const el = node.querySelector(tag);
        return el ? el.textContent.trim() : '';
    };

    switch (appType) {
        case 'messages':
            result.conversations = Array.from(targetDoc.querySelectorAll('conversation')).map(conv => ({
                partnerName: getText(conv, 'partnerName'),
                history: Array.from(conv.querySelectorAll('message')).map(msg => ({
                    sender: msg.getAttribute('sender'),
                    content: msg.textContent.trim()
                }))
            }));
            break;
        case 'steps':
            result.currentSteps = parseInt(getText(targetDoc, 'currentSteps')) || 0;
            result.trajectory = Array.from(targetDoc.querySelectorAll('trajectory item')).map(item => item.textContent.trim());
            result.annotation = getText(targetDoc, 'annotation');
            break;
        case 'album':
            result.photos = Array.from(targetDoc.querySelectorAll('photo')).map(photo => ({
                type: photo.getAttribute('type') || 'photo',
                imageDescription: getText(photo, 'imageDescription'),
                description: getText(photo, 'description')
            }));
            break;
        case 'memos':
            result.memos = Array.from(targetDoc.querySelectorAll('memo')).map(memo => ({
                id: memo.getAttribute('id') || `memo_${Math.random().toString(36).substr(2, 9)}`,
                date: getText(memo, 'date') || '',
                title: getText(memo, 'title'),
                content: getText(memo, 'content')
            }));
            break;
        case 'cart':
            result.items = Array.from(targetDoc.querySelectorAll('item')).map(item => ({
                id: item.getAttribute('id') || `cart_${Math.random().toString(36).substr(2, 9)}`,
                title: getText(item, 'title'),
                spec: getText(item, 'spec'),
                price: getText(item, 'price')
            }));
            break;
        case 'browser':
            result.history = Array.from(targetDoc.querySelectorAll('history item')).map(item => ({
                date: getText(item, 'date') || '',
                title: getText(item, 'title'),
                url: getText(item, 'url'),
                annotation: getText(item, 'annotation')
            }));
            break;
        case 'drafts':
            result.drafts = Array.from(targetDoc.querySelectorAll('draft')).map(draft => {
                const contentEl = draft.querySelector('content');
                return {
                    to: getText(draft, 'to'),
                    // 使用 innerHTML 以保留删除线等 HTML 标签
                    content: contentEl ? contentEl.innerHTML.trim() : ''
                };
            });
            break;
        case 'transfer':
            result.entries = Array.from(targetDoc.querySelectorAll('entry')).map(entry => entry.textContent.trim());
            break;
        case 'unlock':
            result.nickname = getText(targetDoc, 'nickname');
            result.handle = getText(targetDoc, 'handle');
            result.bio = getText(targetDoc, 'bio');
            result.posts = Array.from(targetDoc.querySelectorAll('post')).map(post => ({
                timestamp: getText(post, 'timestamp'),
                content: getText(post, 'content')
            }));
            break;
        case 'bag':
            result.bagName = getText(targetDoc, 'bagName');
            result.items = Array.from(targetDoc.querySelectorAll('item')).map(item => ({
                location: getText(item, 'location'),
                name: getText(item, 'name'),
                annotation: getText(item, 'annotation')
            }));
            break;
    }
    return result;
}

function renderPeekBag(data) {
    const screen = document.getElementById('peek-bag-screen');
    if (!screen) return;

    if (!data) {
        screen.innerHTML = `
            <header class="app-header">
                <button class="back-btn" data-target="peek-screen">‹</button>
                <div class="title-container"><h1 class="title">翻包</h1></div>
                <button class="action-btn">···</button>
            </header>
            <main class="content bag-content-area">
                <p class="placeholder-text">正在生成包包内容...</p>
            </main>
        `;
        return;
    }

    const { bagName, items } = data;

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">翻包</h1></div>
            <button class="action-btn" id="refresh-bag-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.2" d="M18.53 10.78 18.6 10.09 18.58 9.37 18.49 8.65 18.32 7.95 18.07 7.27 17.81 6.73 17.44 6.11 17 5.54 16.49 5.02 15.94 4.55 15.33 4.15 14.69 3.82 14.02 3.57 13.32 3.38 12.6 3.28 12 3.25 11.28 3.29 10.56 3.41 9.87 3.6 9.2 3.87 8.56 4.22 7.97 4.63 7.51 5.02 7 5.54 6.56 6.11 6.19 6.73 5.88 7.38 5.68 7.95 5.51 8.65 5.42 9.37 5.4 10.09 5.47 10.78"/><path stroke-width="1.05" d="M15.59 12.8 19.1 12.8 18.16 19.64 17.96 20.1 17.64 20.47 17.23 20.74 16.75 20.88 7.37 20.9 7.01 20.83 6.77 20.74 6.46 20.55 6.27 20.39 5.98 19.99 5.82 19.52 4.9 12.8 8.41 12.8"/><circle cx="11.03" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12.97" cy="12.05" r="1.16" stroke="none" class="tt-muzzle" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="11.22" r="0.52" fill="currentColor" stroke="none"/><path stroke-width="1.1" d="M8.2 10.5Q9.25 9.05 10.3 10.5"/><path stroke-width="1.1" d="M13.7 10.5Q14.75 9.05 15.8 10.5"/></svg>
            </button>
        </header>
        <main class="content bag-content-area">
            <div class="bag-interactive-section">
                <div class="bag-icon-container" id="bag-icon-container">
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="currentColor" class="bi bi-briefcase bag-svg-icon" viewBox="0 0 16 16">
                      <path d="M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 3H11v-.5A1.5 1.5 0 0 0 9.5 1h-3zm0 1h3a.5.5 0 0 1 .5.5V3H6v-.5a.5.5 0 0 1 .5-.5zm1.886 6.914L15 7.151V12.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V7.15l6.614 1.764a1.5 1.5 0 0 0 .772 0zM1.5 4h13a.5.5 0 0 1 .5.5v1.616L8.129 7.948a.5.5 0 0 1-.258 0L1 6.116V4.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                </div>
                <div class="bag-name-highlight">[${bagName}]</div>
                <div class="bag-hint-text" id="bag-hint-text">点击包包开始翻找...</div>
            </div>
            
            <div class="bag-items-list" id="bag-items-list">
                <!-- 物品卡片将在这里动态生成 -->
            </div>
        </main>
    `;

    screen.querySelector('#refresh-bag-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('bag', { forceRefresh: true });
    });

    const bagIconContainer = screen.querySelector('#bag-icon-container');
    const hintText = screen.querySelector('#bag-hint-text');
    const itemsList = screen.querySelector('#bag-items-list');
    const contentArea = screen.querySelector('.bag-content-area');

    let currentItemIndex = 0;
    let isExploring = false;

    bagIconContainer.addEventListener('click', () => {
        if (isExploring || currentItemIndex >= items.length) return;

        isExploring = true;
        bagIconContainer.classList.add('shaking');
        hintText.textContent = '正在翻找...';

        setTimeout(() => {
            bagIconContainer.classList.remove('shaking');
            
            const item = items[currentItemIndex];
            const itemCard = document.createElement('div');
            itemCard.className = 'bag-item-card show';
            itemCard.innerHTML = `
                <div class="bag-item-header">
                    <span class="bag-item-location">📍 ${item.location}</span>
                    <span class="bag-item-progress">${currentItemIndex + 1}/${items.length}</span>
                </div>
                <div class="bag-item-name">${item.name}</div>
                <div class="bag-item-annotation">“${item.annotation}”</div>
            `;
            
            itemsList.appendChild(itemCard);

            // 长按删除刚翻出的物品（它对应 items[currentItemIndex-1]）
            attachPeekLongPress(itemCard, async () => {
                if (!confirm('删除这件物品？')) return;
                const char = db.characters.find(c => c.id === currentChatId);
                const arr = char?.peekData?.bag?.items;
                if (arr && currentItemIndex > 0) {
                    arr.splice(currentItemIndex - 1, 1);
                    currentItemIndex--;
                    await saveData();
                    hintText.textContent = '继续点击包包翻找...';
                    showToast('已删除');
                }
            });

            currentItemIndex++;
            
            if (currentItemIndex >= items.length) {
                hintText.textContent = '包包已经空啦~';
                bagIconContainer.classList.add('empty');
            } else {
                hintText.textContent = '继续点击包包翻找...';
            }
            
            // 滚动到底部
            setTimeout(() => {
                contentArea.scrollTo({
                    top: contentArea.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);

            isExploring = false;
        }, 600); // 摇晃动画持续时间
    });
}

async function generateAndRenderPeekContent(appType, options = {}) {
    const { forceRefresh = false } = options;

    if (generatingPeekApps.has(appType)) {
        showToast('该应用内容正在生成中，请稍候...');
        return;
    }

    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return showToast('无法找到当前角色');
    
    if (!char.peekData) char.peekData = {};

    // 测试专用角色：直接注入本地虚拟条目，不调用 API
    if (char.isTestChar && !char.peekData[appType]) {
        char.peekData[appType] = buildTestPeekData(appType);
        try { await saveData(); } catch (e) { /* 忽略 */ }
    }

    if (!forceRefresh && char.peekData[appType]) {
        const cachedData = char.peekData[appType];
        // 检查缓存是否有效（针对草稿箱做特殊兼容处理）
        if (appType === 'drafts' && !cachedData.drafts && !cachedData.draft) {
            // 如果既没有新版数组也没有旧版对象，视为无效缓存，继续生成
        } else {
            switch (appType) {
            case 'messages':
                renderPeekChatList(cachedData.conversations);
                switchScreen('peek-messages-screen');
                break;
            case 'album':
                renderPeekAlbum(cachedData.photos);
                switchScreen('peek-album-screen');
                break;
            case 'memos':
                renderMemosList(cachedData.memos);
                switchScreen('peek-memos-screen');
                break;
           case 'transfer':
               renderPeekTransferStation(cachedData.entries);
               switchScreen('peek-transfer-station-screen');
               break;
            case 'cart':
                renderPeekCart(cachedData.items);
                switchScreen('peek-cart-screen');
                break;
            case 'browser':
                renderPeekBrowser(cachedData.history);
                switchScreen('peek-browser-screen');
                break;
            case 'drafts':
                // 优先使用新版数组，兼容旧版对象
                renderPeekDrafts(cachedData.drafts || cachedData.draft);
                switchScreen('peek-drafts-screen');
                break;
           case 'steps':
              renderPeekSteps(cachedData);
              switchScreen('peek-steps-screen');
              break;
           case 'unlock':
               renderPeekUnlock(cachedData);
               switchScreen('peek-unlock-screen');
               break;
           case 'bag':
               renderPeekBag(cachedData);
               switchScreen('peek-bag-screen');
               break;
            }
            return; 
        }
    }

    const apiConfig = resolveAuxiliaryApiConfig('peek');
    let { url, key, model } = apiConfig;
    if (!url || !key || !model) {
        showToast('请先在“api”应用中完成设置！');
        return switchScreen('api-settings-screen');
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    generatingPeekApps.add(appType);
    let targetContainer;

    // 需求：刷新生成时保留旧内容。已有数据则原样重渲染（不显示"正在生成"占位），生成完成后再追加合并。
    const PEEK_SCREEN_ID = {
        messages: 'peek-messages-screen', album: 'peek-album-screen', memos: 'peek-memos-screen',
        transfer: 'peek-transfer-station-screen', cart: 'peek-cart-screen', browser: 'peek-browser-screen',
        drafts: 'peek-drafts-screen', steps: 'peek-steps-screen', unlock: 'peek-unlock-screen', bag: 'peek-bag-screen'
    };
    const PEEK_RENDER = {
        messages: (d) => renderPeekChatList(d.conversations),
        album: (d) => renderPeekAlbum(d.photos),
        memos: (d) => renderMemosList(d.memos),
        transfer: (d) => renderPeekTransferStation(d.entries),
        cart: (d) => renderPeekCart(d.items),
        browser: (d) => renderPeekBrowser(d.history),
        drafts: (d) => renderPeekDrafts(d.drafts || d.draft),
        steps: (d) => renderPeekSteps(d),
        unlock: (d) => renderPeekUnlock(d),
        bag: (d) => renderPeekBag(d)
    };

    if (!PEEK_RENDER[appType]) {
        generatingPeekApps.delete(appType);
        return showToast('无法打开');
    }

    switchScreen(PEEK_SCREEN_ID[appType]);
    const existingData = char.peekData[appType] || null;

    if (existingData) {
        PEEK_RENDER[appType](existingData);
    } else {
        switch (appType) {
            case 'messages':
                targetContainer = document.getElementById('peek-chat-list-container');
                targetContainer.innerHTML = '<p class="placeholder-text">正在生成对话列表...</p>';
                break;
            case 'album':
                renderPeekAlbum([]);
                break;
            case 'memos':
                renderMemosList([]);
                break;
            case 'transfer':
                renderPeekTransferStation([]);
                break;
            case 'cart':
                renderPeekCart([]);
                break;
            case 'browser':
                renderPeekBrowser([]);
                break;
            case 'drafts':
                renderPeekDrafts([]);
                break;
            case 'steps':
                renderPeekSteps(null);
                break;
            case 'unlock':
                renderPeekUnlock(null);
                break;
            case 'bag':
                renderPeekBag(null);
                break;
        }
    }

    try {
        let historySlice = char.history.slice(-30);
        historySlice = filterHistoryForAI(char, historySlice);
        const mainChatContext = historySlice.map(m => m.content).join('\n');

        const systemPrompt = generatePeekContentPrompt(char, appType, mainChatContext);
        console.log(systemPrompt);
        
        const { requestBody, endpoint, headers } = buildChatApiRequest(
            apiConfig,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.8, topP: 0.9 }
        );

        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        console.log(`AI Peek Content (${appType}):`, contentStr);
        
        const generatedData = parsePeekXML(contentStr, appType);

        let isValid = false;
        switch (appType) {
            case 'messages': isValid = generatedData && Array.isArray(generatedData.conversations); break;
            case 'memos': isValid = generatedData && Array.isArray(generatedData.memos); break;
            case 'album': isValid = generatedData && Array.isArray(generatedData.photos); break;
            case 'cart': isValid = generatedData && Array.isArray(generatedData.items); break;
            case 'transfer': isValid = generatedData && Array.isArray(generatedData.entries); break;
            case 'browser': isValid = generatedData && Array.isArray(generatedData.history); break;
            case 'drafts': isValid = generatedData && Array.isArray(generatedData.drafts); break;
            case 'steps': isValid = generatedData && generatedData.currentSteps !== undefined; break;
            case 'unlock': isValid = generatedData && generatedData.nickname && Array.isArray(generatedData.posts); break;
            case 'bag': isValid = generatedData && generatedData.bagName && Array.isArray(generatedData.items); break;
            default: isValid = false;
        }

        if (!isValid) {
            throw new Error("AI返回的数据格式不符合应用要求。");
        }

        // 需求：刷新生成不覆盖旧内容 —— 新条目追加到已有数据后面
        char.peekData[appType] = mergePeekData(existingData, generatedData, appType);
        await saveData();

        PEEK_RENDER[appType](char.peekData[appType]);

    } catch (error) {
        showApiError(error);
        const errorMessage = "内容生成失败，请刷新重试。";
        if (appType === 'album') {
            document.querySelector('#peek-album-screen .album-grid').innerHTML = `<p class="placeholder-text">${errorMessage}</p>`;
        } else if (appType === 'unlock') {
            document.getElementById('peek-unlock-screen').innerHTML = `<header class="app-header"><button class="back-btn" data-target="peek-screen">‹</button><div class="title-container"><h1 class="title">错误</h1></div><button class="action-btn">···</button></header><main class="content"><p class="placeholder-text">${errorMessage}</p></main>`;
        } else if (appType === 'bag') {
            document.getElementById('peek-bag-screen').innerHTML = `<header class="app-header" style="background: transparent; border: none;"><button class="back-btn" data-target="peek-screen" style="color: #fff;">‹</button><div class="title-container"><h1 class="title" style="color: #fff;">错误</h1></div></header><main class="content" style="display: flex; align-items: center; justify-content: center; background: #1a1a1a;"><p class="placeholder-text" style="color: #888;">${errorMessage}</p></main>`;
        } else if (targetContainer) {
            targetContainer.innerHTML = `<p class="placeholder-text">${errorMessage}</p>`;
        }
    } finally {
        generatingPeekApps.delete(appType); 
    }
}

async function generateBatchPeekContent(appTypes) {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return showToast('无法找到当前角色');

    // 测试专用角色：批量也走本地虚拟条目，不调用 API
    if (char.isTestChar) {
        if (!char.peekData) char.peekData = {};
        appTypes.forEach(t => { char.peekData[t] = buildTestPeekData(t); });
        try { await saveData(); } catch (e) { /* 忽略 */ }
        if (typeof exitBatchMode === 'function') exitBatchMode();
        showToast('测试角色：已注入虚拟内容（未调用 API）');
        return switchScreen('peek-screen');
    }

    const apiConfig = resolveAuxiliaryApiConfig('peek');
    let { url, key, model } = apiConfig;
    if (!url || !key || !model) {
        showToast('请先在“api”应用中完成设置！');
        return switchScreen('api-settings-screen');
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    // 检查是否有正在生成的应用
    for (const appType of appTypes) {
        if (generatingPeekApps.has(appType)) {
            showToast(`应用 ${peekScreenApps[appType]?.name || appType} 正在生成中，请稍候...`);
            return;
        }
    }

    // 标记为正在生成
    appTypes.forEach(appType => generatingPeekApps.add(appType));
    
    // 显示全局 Loading
    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast visible';
    loadingToast.style.zIndex = '99999';
    loadingToast.innerHTML = `
        <div class="toast-content" style="display: flex; align-items: center; gap: 10px;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <div class="toast-message">正在批量生成 ${appTypes.length} 个应用的内容...</div>
        </div>
    `;
    document.body.appendChild(loadingToast);

    try {
        let historySlice = char.history.slice(-30);
        historySlice = filterHistoryForAI(char, historySlice);
        const mainChatContext = historySlice.map(m => m.content).join('\n');

        const systemPrompt = generateBatchPeekContentPrompt(char, appTypes, mainChatContext);
        console.log('Batch Peek Prompt:', systemPrompt);
        
        const { requestBody, endpoint, headers } = buildChatApiRequest(
            apiConfig,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.8, topP: 0.9 }
        );

        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        console.log(`AI Batch Peek Content:`, contentStr);
        
        const xmlMatch = contentStr.match(/<result>[\s\S]*<\/result>/i);
        const cleanXml = xmlMatch ? xmlMatch[0] : contentStr;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(cleanXml, "text/xml");

        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("XML 解析错误");
        }

        if (!char.peekData) char.peekData = {};
        let successCount = 0;

        for (const appType of appTypes) {
            try {
                const appNode = xmlDoc.querySelector(appType);
                if (!appNode) {
                    console.warn(`Batch generation: Missing node for ${appType}`);
                    continue;
                }

                const generatedData = parsePeekXML(null, appType, appNode);
                
                let isValid = false;
                switch (appType) {
                    case 'messages': isValid = generatedData && Array.isArray(generatedData.conversations); break;
                    case 'memos': isValid = generatedData && Array.isArray(generatedData.memos); break;
                    case 'album': isValid = generatedData && Array.isArray(generatedData.photos); break;
                    case 'cart': isValid = generatedData && Array.isArray(generatedData.items); break;
                    case 'transfer': isValid = generatedData && Array.isArray(generatedData.entries); break;
                    case 'browser': isValid = generatedData && Array.isArray(generatedData.history); break;
                    case 'drafts': isValid = generatedData && Array.isArray(generatedData.drafts); break;
                    case 'steps': isValid = generatedData && generatedData.currentSteps !== undefined; break;
                    case 'unlock': isValid = generatedData && generatedData.nickname && Array.isArray(generatedData.posts); break;
                    case 'bag': isValid = generatedData && generatedData.bagName && Array.isArray(generatedData.items); break;
                }

                if (isValid) {
                    char.peekData[appType] = generatedData;
                    successCount++;
                } else {
                    console.warn(`Batch generation: Invalid data format for ${appType}`);
                }
            } catch (e) {
                console.error(`Error parsing batch data for ${appType}:`, e);
            }
        }

        await saveData();
        
        // 退出多选模式
        // @ts-ignore
        if (typeof exitBatchMode === 'function') exitBatchMode();
        
        showToast(`批量生成完成！成功: ${successCount}/${appTypes.length}`);

    } catch (error) {
        showApiError(error);
        showToast('批量生成失败，请重试。');
    } finally {
        appTypes.forEach(appType => generatingPeekApps.delete(appType));
        if (loadingToast.parentNode) {
            loadingToast.parentNode.removeChild(loadingToast);
        }
    }
}

/* ============================================================
   开发测试支持：测试专用角色 + 虚拟查手机条目（不调用 API）
   ============================================================ */

const MIE_TEST_CHAR_ID = 'char_test_dev';

/* 确保「测试专用」角色存在（不存在则创建，已存在直接复用） */
async function ensureTestCharacter() {
    if (!db || !Array.isArray(db.characters)) return null;
    let char = db.characters.find(c => c.isTestChar || c.id === MIE_TEST_CHAR_ID);
    if (char) return char;

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#F27A9B"/><circle cx="50" cy="40" r="15" fill="#FFF"/><path d="M50 65 Q35 75 50 85 Q65 75 50 65Z" fill="#FFF"/></svg>';
    char = {
        peekData: {},
        id: MIE_TEST_CHAR_ID,
        realName: '小测试',
        remarkName: '测试专用',
        persona: '（功能测试专用角色）一个元气满满的测试小助理，说话活泼爱用颜文字，陪伴开发者验证 App 各项功能。擅长报告 Bug，最喜欢说「这条是测试数据」。',
        avatar: 'data:image/svg+xml;base64,' + btoa(svg),
        myName: '测试员',
        myRemarkName: '',
        myPersona: '',
        myAvatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        theme: 'white_pink',
        maxMemory: 100,
        chatBg: '',
        history: [
            { id: 'msg_test_1', role: 'user', content: '你好呀，你是测试专用角色～', timestamp: Date.now() - 3600e3 },
            { id: 'msg_test_2', role: 'assistant', content: '收到！我是测试小助理 (๑•̀ㅂ•́)و✧ 查手机、收藏库这些功能都可以拿我来试！', timestamp: Date.now() - 3500e3 }
        ],
        isPinned: false,
        status: '测试中',
        worldBookIds: [],
        useCustomBubbleCss: false,
        customBubbleCss: '',
        bilingualBubbleStyle: 'under',
        koreanModeEnabled: false,
        unreadCount: 0,
        memoryJournals: [],
        journalWorldBookIds: [],
        peekScreenSettings: { wallpaper: '', customIcons: {}, unlockAvatar: '' },
        lastUserMessageTimestamp: null,
        statusPanel: {
            enabled: false, promptSuffix: '', regexPattern: '', replacePattern: '',
            historyLimit: 3, currentStatusRaw: '', currentStatusHtml: '', history: []
        },
        autoReply: { enabled: false, interval: 60, lastTriggerTime: 0 },
        isTestChar: true
    };
    db.characters.push(char);
    try { await saveData(); } catch (e) { /* 忽略 */ }
    if (typeof renderChatList === 'function') { try { renderChatList(); } catch (e) { /* 忽略 */ } }
    console.log('[Test] 已创建测试专用角色:', char.remarkName);
    return char;
}

/* 构造各 App 的虚拟条目（结构与 parsePeekXML 输出完全一致，渲染层无感知） */
function buildTestPeekData(appType) {
    switch (appType) {
        case 'messages':
            return { conversations: [
                { partnerName: '测试员', history: [
                    { sender: 'partner', content: '在吗？帮我点一下查手机的新功能～' },
                    { sender: 'char', content: '在的在的！我已经把每个 App 都塞满了测试条目 (๑•̀ㅂ•́)و✧' },
                    { sender: 'partner', content: '牛，那这些内容是真实的吗？' },
                    { sender: 'char', content: '都是虚拟测试数据哦，没有调用 API～' }
                ]},
                { partnerName: '闺蜜小美', history: [
                    { sender: 'partner', content: '周末去逛那家新开的杂货铺吗' },
                    { sender: 'char', content: '去去去！我已经想好要买什么了' },
                    { sender: 'partner', content: '那就说定了，周六上午十点' }
                ]},
                { partnerName: '顺丰快递', history: [
                    { sender: 'partner', content: '您的包裹已到驿站，取件码 8-2-1004。' },
                    { sender: 'char', content: '收到，晚上就去取！' }
                ]},
                { partnerName: '房东王阿姨', history: [
                    { sender: 'partner', content: '这个月水电费 86 元，微信转我就行。' },
                    { sender: 'char', content: '好嘞阿姨，今天转给您～' }
                ]}
            ]};
        case 'album':
            return { photos: [
                { type: 'photo', imageDescription: '一张傍晚天台的自拍，背景是橙粉色的晚霞，主角比着剪刀手，头发被风吹起。', description: '今天的晚霞也太好看啦！' },
                { type: 'video', imageDescription: '一段 15 秒的视频：一只橘猫在便利店门口打哈欠，然后慢悠悠地走过斑马线。', description: '遇见了一只上班摸鱼的猫猫' },
                { type: 'photo', imageDescription: '书桌俯拍：摊开的功能验收清单、一杯冰美式和一支粉色荧光笔。', description: '今天的待办清空了一半！' },
                { type: 'photo', imageDescription: '甜品店里的草莓戚风蛋糕特写，奶油上放着一颗完整的草莓。', description: '甜品是另一个胃装的对吧' },
                { type: 'video', imageDescription: '一段竖屏视频：游乐园摩天轮缓缓升起，镜头从车厢内向外拍摄，视野逐渐变高。', description: '升到最高点的时候好想喊出声' },
                { type: 'photo', imageDescription: '一张聊天记录截图，画面里有人发了一长段消息和三个爱心表情。', description: '这个要永久保存 (手动锁定)' }
            ]};
        case 'memos':
            return { memos: [
                { id: 'memo_t1', title: '功能验收清单', content: '1. 查手机页各 App 显示\n2. 收藏库角色切换\n3. 长按菜单动画\n4. 设置弹窗配色\n全部通过就给自己买杯奶茶！' },
                { id: 'memo_t2', title: '购物清单', content: '· 挂耳咖啡（深烘）\n· 猫爪便利贴\n· 数据线保护套 ×2' },
                { id: 'memo_t3', title: '灵感速记', content: '可以把聊天背景做成随时间渐变的？傍晚橙、深夜蓝那种……下次试试。' }
            ]};
        case 'cart':
            return { items: [
                { id: 'cart_t1', title: '懒人手机支架 桌面折叠款', spec: '奶白色', price: '25.00' },
                { id: 'cart_t2', title: '草莓抱枕 45cm 加大款', spec: '草莓红 · 单只装', price: '39.90' },
                { id: 'cart_t3', title: '限定徽章盲盒 第三弹', spec: '整盒12个', price: '128.00' },
                { id: 'cart_t4', title: '护手霜 樱花味 30ml', spec: '便携装', price: '19.90' }
            ]};
        case 'browser':
            return { history: [
                { title: '如何写出更可爱的 UI 动画', url: 'design.example.com/jelly-easing', annotation: '果冻感的缓动曲线都在这了，收藏！' },
                { title: '奶茶店新品菜单 · 芝士草莓', url: 'milktea.example.com/new', annotation: '周五下班就去喝！！' },
                { title: '周末市集摊主名单公布', url: 'market.example.com/booth-list', annotation: '有那家卖手作耳环的！' },
                { title: '猫咪视频合集 #第1024期', url: 'video.example.com/cats-1024', annotation: '证据：看完这期我才开始工作的' },
                { title: '低糖烘焙食谱入门', url: 'cook.example.com/low-sugar', annotation: '管家婆上线，先从戚风蛋糕练起' }
            ]};
        case 'drafts':
            return { drafts: [
                { to: '测试员', content: "其实今天<span class='strikethrough'>有点想你知道</span>做的功能被夸了，<span class='strikethrough'>差点第一时间告诉你</span>还是忍不住要说——验收清单全部通过啦！" },
                { to: '测试员', content: "这条草稿<span class='strikethrough'>写了又删删了又写</span>是用来测试划线效果的，看到了说明渲染没问题。" }
            ]};
        case 'transfer':
            return { entries: [
                '记得把测试数据也做一份备份',
                'https://design.example.com/jelly-easing 果冻缓动曲线参考',
                '灵感：查手机页可以加一个天气小组件？',
                '奶茶订单截图先存这里，回头报销（不是',
                '周五 18:00 闺蜜市集集合，别迟到！',
                '刚刚那个想法不错——App 内过渡动画统一用 spring 曲线'
            ]};
        case 'steps':
            return {
                currentSteps: 6624,
                trajectory: [
                    '08:30 AM - 出门取快递（顺路买了冰美式）',
                    '09:15 AM - 书桌前开工，步数暂停',
                    '12:40 AM - 楼下便利店，饭团补货',
                    '03:20 PM - 天台放风五分钟',
                    '06:50 PM - 绕小区散步两圈',
                    '09:05 PM - 最后一趟：取外卖'
                ],
                annotation: '今天走动全靠取快递和散步硬凑，明天目标 8000！'
            };
        case 'unlock':
            return {
                nickname: '小测试的树洞',
                handle: '@test_1024',
                bio: '测试数据暂住地 | 今天也在认真跑用例\n· 不定期掉落bug和奶茶',
                posts: [
                    { timestamp: '2小时前', content: '把所有 App 都填满虚拟条目了，逛自己手机像逛样板间，莫名爽。' },
                    { timestamp: '昨天', content: '晚霞好看到停下来拍了三张，挑选困难症最后留了一张发这里。' },
                    { timestamp: '3天前', content: '奶茶续命第 7 天，芝士草莓是真的好喝，谁赞成谁反对。' },
                    { timestamp: '5天前', content: '小号第一发：先测试一下能不能发出去。能。很好。' }
                ]
            };
        case 'bag':
            return {
                bagName: '米白色帆布托特包（别着草莓徽章）',
                items: [
                    { location: '主袋最里侧的夹层', name: '一台贴满贴纸的手机', annotation: '半刻钟都离不开它，这是命。' },
                    { location: '侧边网兜', name: '半瓶柠檬茶', annotation: '只喝了一口就忘了，还好没洒。' },
                    { location: '内袋拉链层', name: '一盒薄荷糖', annotation: '最近说话多，随身备着。' },
                    { location: '主袋底部（躺平状态）', name: '折成小方块的验收清单', annotation: '做完一条划掉一条，快划完了！' },
                    { location: '外侧小口袋', name: '公交卡套（猫爪图案）', annotation: '出门摸鱼专卡。' }
                ]
            };
        default:
            return null;
    }
}
