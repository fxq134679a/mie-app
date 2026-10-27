/**
 * Community Moments (js/modules/community.js)
 * 动态页面：用户和角色互相发动态、评论、点赞
 */

function getCommunityUserInfo() {
    let myName = '我';
    let myAvatar = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    let activePersona = null;
    if (db.activePersonaId) {
        activePersona = (db.myPersonaPresets || []).find(p => p.id === db.activePersonaId);
    }
    if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) {
        activePersona = db.myPersonaPresets[0];
    }

    if (activePersona) {
        myName = activePersona.name || '我';
        myAvatar = activePersona.avatar || myAvatar;
    } else if (db.characters && db.characters.length > 0) {
        const firstChar = db.characters[0];
        myName = firstChar.myName || '我';
        myAvatar = firstChar.myAvatar || myAvatar;
    }

    return { name: myName, avatar: myAvatar };
}

function formatCommunityTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function renderCommunityFeed() {
    const feedContainer = document.getElementById('community-feed-container');
    if (!feedContainer) return;

    const userInfo = getCommunityUserInfo();
    const coverImg = document.getElementById('community-cover-img');
    const userNameEl = document.getElementById('community-user-name');
    const userAvatarEl = document.getElementById('community-user-avatar');

    if (coverImg) coverImg.src = db.wallpaper || 'https://i.postimg.cc/W4Z9R9x4/ins-1.jpg';
    if (userNameEl) userNameEl.textContent = userInfo.name;
    if (userAvatarEl) userAvatarEl.src = userInfo.avatar;

    if (!db.communityMoments) db.communityMoments = [];
    const moments = db.communityMoments;

    if (moments.length === 0) {
        feedContainer.innerHTML = '<div style="text-align: center; padding: 50px; color: #999;">暂无动态，点击下方 + 发布第一条动态吧</div>';
        return;
    }

    const sorted = [...moments].sort((a, b) => b.timestamp - a.timestamp);
    let html = '';

    sorted.forEach(moment => {
        const showProfile = db.communitySettings?.showProfile !== false;

        let imagesHtml = '';
        if (moment.images && moment.images.length > 0) {
            const isSingle = moment.images.length === 1;
            imagesHtml = `<div class="community-moment-images ${isSingle ? 'single' : ''}">`;
            moment.images.forEach(img => {
                imagesHtml += `<img src="${img}" class="community-moment-img" alt="配图">`;
            });
            imagesHtml += '</div>';
        }

        let likesHtml = '';
        if (moment.likes && moment.likes.length > 0) {
            likesHtml = `
                <div class="community-moment-likes">
                    <svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36,2,12.27,2,8.5C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"></path></svg>
                    ${moment.likes.join(', ')}
                </div>`;
        }

        let commentsHtml = '';
        if (moment.comments && moment.comments.length > 0) {
            commentsHtml = '<div class="community-moment-comments">';
            moment.comments.forEach(c => {
                if (c.replyTo) {
                    commentsHtml += `<div class="community-moment-comment"><span class="community-moment-comment-name">${c.author}</span> 回复 <span class="community-moment-comment-name">${c.replyTo}</span>: <span class="community-moment-comment-text">${c.content}</span></div>`;
                } else {
                    commentsHtml += `<div class="community-moment-comment"><span class="community-moment-comment-name">${c.author}</span>: <span class="community-moment-comment-text">${c.content}</span></div>`;
                }
            });
            commentsHtml += '</div>';
        }

        let interactionHtml = '';
        if (likesHtml || commentsHtml) {
            interactionHtml = `<div class="community-moment-interaction">${likesHtml}${commentsHtml}</div>`;
        }

        const timeStr = formatCommunityTime(moment.timestamp);

        html += `
            <div class="community-moment-item" data-id="${moment.id}">
                ${showProfile ? `<img src="${moment.authorAvatar}" class="community-moment-avatar" alt="">` : ''}
                <div class="community-moment-main">
                    ${showProfile ? `<div class="community-moment-header"><span class="community-moment-name">${moment.authorName}</span></div>` : ''}
                    <div class="community-moment-text">${moment.content.replace(/\n/g, '<br>')}</div>
                    ${imagesHtml}
                    <div class="community-moment-footer">
                        <span class="community-moment-time">${timeStr}</span>
                        <div style="position: relative;">
                            <button class="community-moment-action-btn">···</button>
                            <div class="community-moment-action-popup">
                                <div class="community-moment-action-item like">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12,21.35L10.55,20.03C5.4,15.36,2,12.27,2,8.5C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"></path></svg>
                                    赞
                                </div>
                                <div class="community-moment-action-item comment">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9Z"></path></svg>
                                    评论
                                </div>
                            </div>
                        </div>
                    </div>
                    ${interactionHtml}
                </div>
            </div>`;
    });

    feedContainer.innerHTML = html;
}

function setupCommunityModule() {
    const phoneScreen = document.getElementById('phone-screen');
    if (!phoneScreen) return;

    const composeBtn = document.getElementById('community-compose-btn');
    const composeModal = document.getElementById('community-compose-modal');
    const composeCancel = document.getElementById('community-compose-cancel');
    const composeSubmit = document.getElementById('community-compose-submit');
    const composeTextarea = document.getElementById('community-compose-textarea');
    const composeFileInput = document.getElementById('community-compose-file-input');
    const composeImageArea = document.getElementById('community-compose-image-area');
    const composePreview = document.getElementById('community-compose-preview');
    const composeRemoveImg = document.getElementById('community-compose-remove-img');
    const composeVisibility = document.getElementById('community-compose-visibility');
    const visibilityLabel = document.getElementById('community-visibility-label');
    const visibilityPopup = document.getElementById('community-visibility-popup');
    const partialSelect = document.getElementById('community-partial-select');
    const partialList = document.getElementById('community-partial-list');
    const partialCancel = document.getElementById('community-partial-cancel');
    const partialConfirm = document.getElementById('community-partial-confirm');
    const settingsBtn = document.getElementById('community-settings-btn');
    const settingsModal = document.getElementById('community-settings-modal');
    const settingsClose = document.getElementById('community-settings-close');
    const settingsSave = document.getElementById('community-settings-save');
    const addGroupBtn = document.getElementById('community-add-group-btn');
    const groupModal = document.getElementById('community-group-modal');
    const groupCancel = document.getElementById('community-group-cancel');
    const groupSave = document.getElementById('community-group-save');
    const groupNameInput = document.getElementById('community-group-name');
    const groupCharList = document.getElementById('community-group-char-list');
    const groupsList = document.getElementById('community-groups-list');
    const commentInputArea = document.getElementById('community-comment-input-area');
    const commentInput = document.getElementById('community-comment-input');
    const commentSendBtn = document.getElementById('community-comment-send-btn');
    const feedContent = document.getElementById('community-feed-content');

    let currentCommentMomentId = null;
    let currentCommentReplyTo = null;
    let currentVisibility = 'public';
    let currentPartialChars = [];
    let currentImageData = null;

    if (!db.communityMoments) db.communityMoments = [];

    renderCommunityFeed();

    const header = document.getElementById('community-header');
    feedContent?.addEventListener('scroll', () => {
        if (!header) return;
        if (feedContent.scrollTop > 200) {
            header.style.background = 'rgba(237,237,237,0.95)';
            header.style.borderBottom = '1px solid #d9d9d9';
            header.querySelectorAll('.action-btn').forEach(btn => {
                btn.style.background = 'rgba(0,0,0,0.06)';
                btn.style.borderColor = 'rgba(0,0,0,0.1)';
                btn.style.color = '#333';
                btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), inset 0 0.5px 0 rgba(255,255,255,0.6)';
            });
        } else {
            header.style.background = 'transparent';
            header.style.borderBottom = 'none';
            header.querySelectorAll('.action-btn').forEach(btn => {
                btn.style.background = 'rgba(255,255,255,0.18)';
                btn.style.borderColor = 'rgba(255,255,255,0.35)';
                btn.style.color = '#fff';
                btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.4)';
            });
        }
    });

    composeBtn?.addEventListener('click', () => {
        composeModal.classList.add('visible');
        composeTextarea.value = '';
        currentVisibility = 'public';
        currentPartialChars = [];
        currentImageData = null;
        visibilityLabel.textContent = '公开';
        composeImageArea.style.display = 'none';
        composePreview.src = '';
        partialSelect.style.display = 'none';
        visibilityPopup.style.display = 'none';
        composeTextarea.focus();
    });

    composeCancel?.addEventListener('click', () => {
        composeModal.classList.remove('visible');
        partialSelect.style.display = 'none';
        visibilityPopup.style.display = 'none';
    });

    composeModal?.querySelector('.community-modal-backdrop')?.addEventListener('click', () => {
        composeModal.classList.remove('visible');
        partialSelect.style.display = 'none';
        visibilityPopup.style.display = 'none';
    });

    composeFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentImageData = ev.target.result;
            composePreview.src = currentImageData;
            composeImageArea.style.display = 'block';
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    composeRemoveImg?.addEventListener('click', () => {
        currentImageData = null;
        composePreview.src = '';
        composeImageArea.style.display = 'none';
    });

    composeVisibility?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (partialSelect.style.display === 'flex') return;
        visibilityPopup.style.display = visibilityPopup.style.display === 'none' ? 'block' : 'none';
    });

    visibilityPopup?.querySelectorAll('.community-visibility-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            currentVisibility = val;
            const labels = { public: '公开', private: '私密', partial: '部分可见' };
            visibilityLabel.textContent = labels[val] || '公开';
            visibilityPopup.style.display = 'none';

            if (val === 'partial') {
                const checkboxes = renderPartialCharList(currentPartialChars);
                if (checkboxes) {
                    checkboxes.forEach(cb => {
                        cb.addEventListener('change', () => {
                            currentPartialChars = Array.from(partialList.querySelectorAll('input:checked')).map(el => el.value);
                        });
                    });
                }
                partialSelect.style.display = 'flex';
            } else {
                partialSelect.style.display = 'none';
            }
        });
    });

    partialCancel?.addEventListener('click', () => {
        partialSelect.style.display = 'none';
    });

    partialConfirm?.addEventListener('click', () => {
        partialSelect.style.display = 'none';
    });

    composeSubmit?.addEventListener('click', async () => {
        const text = composeTextarea.value.trim();
        if (!text && !currentImageData) {
            showToast('请输入动态内容或上传图片');
            return;
        }

        const userInfo = getCommunityUserInfo();
        const moment = {
            id: `cm_${Date.now()}`,
            authorType: 'user',
            authorId: 'user',
            authorName: userInfo.name,
            authorAvatar: userInfo.avatar,
            content: text || '',
            images: currentImageData ? [currentImageData] : [],
            likes: [],
            comments: [],
            timestamp: Date.now(),
            visibility: currentVisibility,
            partialChars: currentVisibility === 'partial' ? [...currentPartialChars] : []
        };

        db.communityMoments.push(moment);
        await saveData();
        composeModal.classList.remove('visible');
        partialSelect.style.display = 'none';
        visibilityPopup.style.display = 'none';
        renderCommunityFeed();
        showToast('动态已发布');

        if (currentVisibility !== 'private') {
            scheduleCharacterReactions(moment);
        }
    });

    settingsBtn?.addEventListener('click', () => {
        renderCommunitySettings();
        renderGroupsList();
        settingsModal.classList.add('visible');
    });

    settingsClose?.addEventListener('click', () => {
        settingsModal.classList.remove('visible');
    });

    settingsModal?.querySelector('.community-modal-backdrop')?.addEventListener('click', () => {
        settingsModal.classList.remove('visible');
    });

    settingsSave?.addEventListener('click', async () => {
        if (!db.communitySettings) db.communitySettings = {};
        const showProfileToggle = document.getElementById('community-show-profile-toggle');
        if (showProfileToggle) {
            db.communitySettings.showProfile = showProfileToggle.checked;
        }

        const items = document.querySelectorAll('.community-setting-item');
        items.forEach(item => {
            const charId = item.dataset.charId;
            const toggle = item.querySelector('.community-setting-toggle input');
            const commentToggle = item.querySelector('.community-allow-comment-toggle');
            const replyMin = item.querySelector('.community-reply-min');
            const replyMax = item.querySelector('.community-reply-max');
            if (!charId || !toggle) return;
            const char = db.characters.find(c => c.id === charId);
            if (!char) return;
            if (!char.communitySettings) char.communitySettings = {};
            char.communitySettings.enabled = toggle.checked;
            char.communitySettings.allowComment = commentToggle ? commentToggle.checked : true;
            if (replyMin) char.communitySettings.replyIntervalMin = parseInt(replyMin.value) || 5;
            if (replyMax) char.communitySettings.replyIntervalMax = parseInt(replyMax.value) || 15;
        });

        if (!db.communitySettings) db.communitySettings = {};
        const intervalMin = document.getElementById('community-interval-min');
        const intervalMax = document.getElementById('community-interval-max');
        if (intervalMin) db.communitySettings.autoPostIntervalMin = parseInt(intervalMin.value) || 30;
        if (intervalMax) db.communitySettings.autoPostIntervalMax = parseInt(intervalMax.value) || 120;

        await saveData();
        settingsModal.classList.remove('visible');
        showToast('设置已保存');
        startAutoPostTimer();
        renderGroupsList();
    });

    addGroupBtn?.addEventListener('click', () => {
        groupNameInput.value = '';
        renderGroupCharList([]);
        groupModal.classList.add('visible');
    });

    groupCancel?.addEventListener('click', () => {
        groupModal.classList.remove('visible');
    });

    groupModal?.querySelector('.community-modal-backdrop')?.addEventListener('click', () => {
        groupModal.classList.remove('visible');
    });

    groupSave?.addEventListener('click', async () => {
        const name = groupNameInput.value.trim();
        if (!name) {
            showToast('请输入群组名称');
            return;
        }

        const selectedChars = Array.from(groupCharList.querySelectorAll('input:checked')).map(cb => cb.value);
        if (selectedChars.length < 2) {
            showToast('请至少选择两个角色');
            return;
        }

        if (!db.communityGroups) db.communityGroups = [];
        db.communityGroups.push({
            id: `grp_${Date.now()}`,
            name,
            charIds: selectedChars
        });

        await saveData();
        groupModal.classList.remove('visible');
        renderGroupsList();
        showToast('群组已创建');
    });

    feedContent?.addEventListener('click', (e) => {
        document.querySelectorAll('.community-moment-action-popup.show').forEach(p => p.classList.remove('show'));

        const actionBtn = e.target.closest('.community-moment-action-btn');
        if (actionBtn) {
            e.stopPropagation();
            const popup = actionBtn.nextElementSibling;
            if (popup) popup.classList.toggle('show');
            return;
        }

        const likeBtn = e.target.closest('.community-moment-action-item.like');
        if (likeBtn) {
            e.stopPropagation();
            const momentId = likeBtn.closest('.community-moment-item').dataset.id;
            toggleCommunityLike(momentId);
            likeBtn.closest('.community-moment-action-popup').classList.remove('show');
            return;
        }

        const commentBtn = e.target.closest('.community-moment-action-item.comment');
        if (commentBtn) {
            e.stopPropagation();
            currentCommentMomentId = commentBtn.closest('.community-moment-item').dataset.id;
            currentCommentReplyTo = null;
            commentInput.placeholder = '评论';
            commentInputArea.style.display = 'flex';
            commentInput.focus();
            commentBtn.closest('.community-moment-action-popup').classList.remove('show');
            return;
        }

        const singleComment = e.target.closest('.community-moment-comment');
        if (singleComment) {
            e.stopPropagation();
            const author = singleComment.querySelector('.community-moment-comment-name')?.textContent;
            const userInfo = getCommunityUserInfo();
            if (author && author !== userInfo.name) {
                currentCommentMomentId = singleComment.closest('.community-moment-item').dataset.id;
                currentCommentReplyTo = author;
                commentInput.placeholder = `回复 ${author}:`;
                commentInputArea.style.display = 'flex';
                commentInput.focus();
            }
            return;
        }
    });

    phoneScreen?.addEventListener('click', (e) => {
        if (!e.target.closest('.community-moment-action-btn') && !e.target.closest('.community-moment-action-popup')) {
            document.querySelectorAll('.community-moment-action-popup.show').forEach(p => p.classList.remove('show'));
        }
        if (!e.target.closest('.community-comment-input-area') && !e.target.closest('.community-moment-action-item.comment')) {
            commentInputArea.style.display = 'none';
        }
    });

    const sendComment = async () => {
        const text = commentInput.value.trim();
        if (text && currentCommentMomentId) {
            const userInfo = getCommunityUserInfo();
            const moment = db.communityMoments.find(m => m.id === currentCommentMomentId);
            if (!moment) return;

            if (!moment.comments) moment.comments = [];
            moment.comments.push({
                id: `cmt_${Date.now()}`,
                author: userInfo.name,
                content: text,
                timestamp: Date.now(),
                replyTo: currentCommentReplyTo || null
            });

            await saveData();
            commentInput.value = '';
            commentInputArea.style.display = 'none';
            currentCommentMomentId = null;
            currentCommentReplyTo = null;
            commentInput.placeholder = '评论';
            renderCommunityFeed();

            scheduleCharacterReply(moment);
        }
    };

    commentSendBtn?.addEventListener('click', sendComment);
    commentInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        sendComment();
    });

    function renderGroupsList() {
        if (!groupsList) return;
        const groups = db.communityGroups || [];
        if (groups.length === 0) {
            groupsList.innerHTML = '<div style="padding: 10px; text-align: center; color: #999; font-size: 13px;">暂无群组</div>';
            return;
        }

        let html = '';
        groups.forEach(group => {
            const charNames = group.charIds.map(id => {
                const char = db.characters.find(c => c.id === id);
                return char ? ((char.remarkName && char.remarkName.trim()) || char.realName || char.name) : '';
            }).filter(Boolean).join('、');

            html += `
                <div class="community-group-item" data-group-id="${group.id}">
                    <span class="community-group-name">${group.name}</span>
                    <span class="community-group-chars">${charNames}</span>
                    <button class="community-group-delete" data-group-id="${group.id}">&times;</button>
                </div>`;
        });
        groupsList.innerHTML = html;

        groupsList.querySelectorAll('.community-group-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const groupId = btn.dataset.groupId;
                db.communityGroups = (db.communityGroups || []).filter(g => g.id !== groupId);
                await saveData();
                renderGroupsList();
            });
        });
    }

    function renderGroupCharList(selectedIds = []) {
        if (!groupCharList) return;
        const chars = db.characters || [];
        if (chars.length === 0) {
            groupCharList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无角色</div>';
            return;
        }

        let html = '';
        chars.forEach(char => {
            const name = (char.remarkName && char.remarkName.trim()) || char.realName || char.name || '角色';
            const checked = selectedIds.includes(char.id) ? 'checked' : '';
            html += `
                <label class="community-group-char-item">
                    <img src="${char.avatar || ''}" alt="">
                    <span>${name}</span>
                    <input type="checkbox" value="${char.id}" ${checked}>
                </label>`;
        });
        groupCharList.innerHTML = html;
    }

    let autoPostTimerId = null;

    function startAutoPostTimer() {
        if (autoPostTimerId) {
            clearTimeout(autoPostTimerId);
            autoPostTimerId = null;
        }

        const settings = db.communitySettings || {};
        const minMin = settings.autoPostIntervalMin || 30;
        const maxMin = settings.autoPostIntervalMax || 120;

        const delay = (minMin + Math.random() * (maxMin - minMin)) * 60 * 1000;

        autoPostTimerId = setTimeout(async () => {
            await generateCharacterMoment();
            startAutoPostTimer();
        }, delay);
    }
}

async function toggleCommunityLike(momentId) {
    const moment = db.communityMoments.find(m => m.id === momentId);
    if (!moment) return;
    if (!moment.likes) moment.likes = [];

    const userInfo = getCommunityUserInfo();
    const idx = moment.likes.indexOf(userInfo.name);
    if (idx >= 0) {
        moment.likes.splice(idx, 1);
    } else {
        moment.likes.push(userInfo.name);
    }

    await saveData();
    renderCommunityFeed();
}

function renderCommunitySettings() {
    const list = document.getElementById('community-settings-list');
    if (!list) return;

    const showProfileToggle = document.getElementById('community-show-profile-toggle');
    if (showProfileToggle) {
        showProfileToggle.checked = db.communitySettings?.showProfile !== false;
    }

    const intervalMin = document.getElementById('community-interval-min');
    const intervalMax = document.getElementById('community-interval-max');
    if (intervalMin) intervalMin.value = db.communitySettings?.autoPostIntervalMin || 30;
    if (intervalMax) intervalMax.value = db.communitySettings?.autoPostIntervalMax || 120;

    const chars = db.characters || [];
    if (chars.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无角色</div>';
        return;
    }

    let html = '';
    chars.forEach(char => {
        const name = (char.remarkName && char.remarkName.trim()) || char.realName || char.name || '角色';
        const settings = char.communitySettings || {};
        const enabled = settings.enabled !== false;
        const allowComment = settings.allowComment !== false;
        const replyMin = settings.replyIntervalMin || 5;
        const replyMax = settings.replyIntervalMax || 15;
        const statusText = enabled ? '已开启自动发动态' : '已关闭';

        html += `
            <div class="community-setting-item" data-char-id="${char.id}">
                <img src="${char.avatar || ''}" class="community-setting-avatar" alt="">
                <div class="community-setting-info">
                    <div class="community-setting-name">${name}</div>
                    <div class="community-setting-status">${statusText}</div>
                    <label class="community-comment-perm">
                        <input type="checkbox" class="community-allow-comment-toggle" ${allowComment ? 'checked' : ''}>
                        <span>允许评论</span>
                    </label>
                    <div class="community-reply-timing">
                        <span>回复时间(分钟):</span>
                        <input type="number" class="community-reply-min" min="1" max="60" value="${replyMin}" placeholder="最小">
                        <span>~</span>
                        <input type="number" class="community-reply-max" min="1" max="60" value="${replyMax}" placeholder="最大">
                    </div>
                </div>
                <label class="community-setting-toggle">
                    <input type="checkbox" ${enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>`;
    });

    list.innerHTML = html;

    list.querySelectorAll('.community-setting-toggle input').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const item = toggle.closest('.community-setting-item');
            const statusEl = item.querySelector('.community-setting-status');
            statusEl.textContent = toggle.checked ? '已开启自动发动态' : '已关闭';
        });
    });
}

async function generateCharacterMoment(options = {}) {
    const { specificCharId = null } = options;
    const chars = db.characters || [];
    if (chars.length === 0) {
        showToast('暂无角色');
        return;
    }

    let targetChar;
    if (specificCharId) {
        targetChar = chars.find(c => c.id === specificCharId);
    } else {
        const eligible = chars.filter(c => {
            const s = c.communitySettings || {};
            return s.enabled !== false;
        });
        if (eligible.length === 0) {
            showToast('没有开启自动发动态的角色');
            return;
        }
        targetChar = eligible[Math.floor(Math.random() * eligible.length)];
    }

    if (!targetChar) {
        showToast('找不到角色');
        return;
    }

    const apiConfig = resolveAuxiliaryApiConfig('peek');
    let { url, key, model } = apiConfig;
    if (!url || !key || !model) {
        showToast('请先在"api"应用中完成设置！');
        return;
    }

    if (url.endsWith('/')) url = url.slice(0, -1);

    const charName = (targetChar.remarkName && targetChar.remarkName.trim()) || targetChar.realName || targetChar.name || '角色';
    const recentHistory = (targetChar.history || []).slice(-20).map(m => m.content).join('\n');

    const systemPrompt = `你是一个角色扮演助手。请为角色"${charName}"写一条朋友圈动态。
角色设定：${targetChar.persona || targetChar.description || '无'}
最近的聊天内容：
${recentHistory}

要求：
1. 写一条符合角色性格的朋友圈动态（20-100字）
2. 内容要自然、生活化，像真人发的朋友圈
3. 可以包含心情、日常、感悟等
4. 只输出动态内容本身，不要加任何格式标记或前缀`;

    try {
        const { requestBody, endpoint, headers } = buildChatApiRequest(
            apiConfig,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.9, topP: 0.95 }
        );

        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        const cleanContent = contentStr.replace(/^["'「『\s]+|["'」』\s]+$/g, '').trim();

        if (!db.communityMoments) db.communityMoments = [];

        const moment = {
            id: `cm_${Date.now()}`,
            authorType: 'character',
            authorId: targetChar.id,
            authorName: charName,
            authorAvatar: targetChar.avatar || '',
            content: cleanContent,
            images: [],
            likes: [],
            comments: [],
            timestamp: Date.now()
        };

        db.communityMoments.push(moment);
        await saveData();
        renderCommunityFeed();
        showToast(`${charName} 发了一条动态`);
    } catch (err) {
        console.error('Generate character moment error:', err);
        showToast('动态生成失败');
    }
}

async function scheduleCharacterReply(originalMoment) {
    if (!originalMoment) return;

    const apiConfig = resolveAuxiliaryApiConfig('peek');
    let { url, key, model } = apiConfig;
    if (!url || !key || !model) return;
    if (url.endsWith('/')) url = url.slice(0, -1);

    let responders = [];

    if (originalMoment.authorType === 'character') {
        const authorChar = db.characters.find(c => c.id === originalMoment.authorId);
        if (authorChar) responders.push(authorChar);
    } else {
        const eligible = getEligibleCharsForMoment(originalMoment);
        responders = eligible.filter(c => {
            const s = c.communitySettings || {};
            return s.allowComment !== false;
        });
    }

    if (responders.length === 0) return;

    const delay = (5 + Math.random() * 10) * 1000;

    setTimeout(async () => {
        try {
            const fresh = db.communityMoments.find(m => m.id === originalMoment.id);
            if (!fresh) return;

            const lastComment = fresh.comments[fresh.comments.length - 1];
            if (!lastComment || lastComment.author !== getCommunityUserInfo().name) return;

            const responder = responders[Math.floor(Math.random() * responders.length)];
            const responderName = (responder.remarkName && responder.remarkName.trim()) || responder.realName || responder.name;
            const persona = responder.persona || responder.description || '无';

            const worldBooks = (responder.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean);
            const worldBookContent = worldBooks.map(wb => wb.content).join('\n');

            const replyToName = lastComment.replyTo || originalMoment.authorName;

            const prompt = `你是一个角色扮演助手。角色"${responderName}"看到一条朋友圈互动：

动态内容："${fresh.content}"
动态作者：${originalMoment.authorName}
最新评论：${lastComment.author} 说："${lastComment.content}"${lastComment.replyTo ? `（回复 ${lastComment.replyTo}）` : ''}

角色"${responderName}"的设定：${persona}
${worldBookContent ? `世界观设定：${worldBookContent}` : ''}

请以"${responderName}"的身份写一条简短的回复评论（10-30字），要符合角色性格和世界观设定。只输出评论内容本身。`;

            const cfg = resolveAuxiliaryApiConfig('peek');
            const { requestBody, endpoint, headers } = buildChatApiRequest(
                cfg,
                [{ role: 'user', content: prompt }],
                { temperature: 0.85 }
            );

            const contentStr = await fetchAiResponse(cfg, requestBody, headers, endpoint);
            const cleanComment = contentStr.replace(/^["'「『\s]+|["'」』\s]+$/g, '').trim();

            if (!fresh.comments) fresh.comments = [];
            fresh.comments.push({
                id: `cmt_${Date.now()}`,
                author: responderName,
                content: cleanComment,
                timestamp: Date.now(),
                replyTo: lastComment.author
            });

            await saveData();
            renderCommunityFeed();
        } catch (err) {
            console.error('Character reply error:', err);
        }
    }, delay);
}

function renderPartialCharList(selectedIds) {
    const partialList = document.getElementById('community-partial-list');
    if (!partialList) return;

    const chars = db.characters || [];
    if (chars.length === 0) {
        partialList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无角色</div>';
        return;
    }

    let html = '';
    chars.forEach(char => {
        const name = (char.remarkName && char.remarkName.trim()) || char.realName || char.name || '角色';
        const checked = (selectedIds || []).includes(char.id) ? 'checked' : '';
        html += `
            <label class="community-partial-item">
                <input type="checkbox" value="${char.id}" ${checked}>
                <img src="${char.avatar || ''}" alt="">
                <span>${name}</span>
            </label>`;
    });
    partialList.innerHTML = html;

    return partialList.querySelectorAll('input[type="checkbox"]');
}

function getEligibleCharsForMoment(moment) {
    const chars = db.characters || [];
    if (moment.visibility === 'private') return [];
    if (moment.visibility === 'partial') {
        return chars.filter(c => (moment.partialChars || []).includes(c.id));
    }
    return chars;
}

async function scheduleCharacterReactions(moment) {
    const eligible = getEligibleCharsForMoment(moment);
    if (eligible.length === 0) return;

    const apiConfig = resolveAuxiliaryApiConfig('peek');
    let { url, key, model } = apiConfig;
    if (!url || !key || !model) return;

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const commenters = [];

    for (let i = 0; i < shuffled.length; i++) {
        const char = shuffled[i];
        const likeDelay = (3 + Math.random() * 10) * 1000;

        setTimeout(async () => {
            const fresh = db.communityMoments.find(m => m.id === moment.id);
            if (!fresh) return;
            if (!fresh.likes) fresh.likes = [];
            const charName = (char.remarkName && char.remarkName.trim()) || char.realName || char.name || '角色';
            if (!fresh.likes.includes(charName)) {
                fresh.likes.push(charName);
                await saveData();
                renderCommunityFeed();
            }
        }, likeDelay);

        const charSettings = char.communitySettings || {};
        if (charSettings.allowComment === false) continue;

        const replyMin = charSettings.replyIntervalMin || 5;
        const replyMax = charSettings.replyIntervalMax || 15;
        const commentDelay = (replyMin + Math.random() * (replyMax - replyMin)) * 60 * 1000;

        setTimeout(async () => {
            try {
                const fresh = db.communityMoments.find(m => m.id === moment.id);
                if (!fresh) return;

                const charName = (char.remarkName && char.remarkName.trim()) || char.realName || char.name || '角色';
                const persona = char.persona || char.description || '无';

                const worldBooks = (char.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean);
                const worldBookContent = worldBooks.map(wb => wb.content).join('\n');

                let promptContent = `"${fresh.content}"`;
                if (fresh.images && fresh.images.length > 0) {
                    promptContent += '\n（这条动态附带了图片）';
                }

                const prompt = `你是一个角色扮演助手。角色"${charName}"看到"${moment.authorName}"发了一条朋友圈：
${promptContent}

角色"${charName}"的设定：${persona}
${worldBookContent ? `世界观设定：${worldBookContent}` : ''}

请以"${charName}"的身份写一条简短的评论（10-30字），要符合角色性格和世界观设定。只输出评论内容本身。`;

                const cfg = resolveAuxiliaryApiConfig('peek');
                const { requestBody, endpoint, headers } = buildChatApiRequest(
                    cfg,
                    [{ role: 'user', content: prompt }],
                    { temperature: 0.85 }
                );

                const contentStr = await fetchAiResponse(cfg, requestBody, headers, endpoint);
                const cleanComment = contentStr.replace(/^["'「『\s]+|["'」』\s]+$/g, '').trim();

                if (!fresh.comments) fresh.comments = [];
                if (!fresh.comments.some(c => c.author === charName)) {
                    fresh.comments.push({
                        id: `cmt_${Date.now()}`,
                        author: charName,
                        content: cleanComment,
                        timestamp: Date.now(),
                        replyTo: null,
                        charId: char.id
                    });
                    await saveData();
                    renderCommunityFeed();
                    commenters.push({ char, charName });
                }
            } catch (err) {
                console.error('Character reaction comment error:', err);
            }
        }, commentDelay);
    }

    setTimeout(async () => {
        const fresh = db.communityMoments.find(m => m.id === moment.id);
        if (!fresh || !fresh.comments) return;

        const groups = db.communityGroups || [];
        for (const group of groups) {
            const groupCommenters = commenters.filter(c => group.charIds.includes(c.char.id));
            if (groupCommenters.length < 2) continue;

            for (let i = 0; i < groupCommenters.length; i++) {
                for (let j = i + 1; j < groupCommenters.length; j++) {
                    if (Math.random() > 0.5) continue;

                    const commenter1 = groupCommenters[i];
                    const commenter2 = groupCommenters[j];
                    const replyDelay = (1 + Math.random() * 3) * 60 * 1000;

                    setTimeout(async () => {
                        try {
                            const latest = db.communityMoments.find(m => m.id === moment.id);
                            if (!latest) return;

                            const otherComment = latest.comments.find(c => c.author === commenter2.charName);
                            if (!otherComment) return;

                            const persona = commenter1.char.persona || commenter1.char.description || '无';
                            const worldBooks = (commenter1.char.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean);
                            const worldBookContent = worldBooks.map(wb => wb.content).join('\n');

                            const prompt = `你是一个角色扮演助手。角色"${commenter1.charName}"看到"${commenter2.charName}"在"${moment.authorName}"的朋友圈下评论：
"${otherComment.content}"

角色"${commenter1.charName}"的设定：${persona}
${worldBookContent ? `世界观设定：${worldBookContent}` : ''}

请以"${commenter1.charName}"的身份回复"${commenter2.charName}"的评论（10-30字），要符合角色性格和世界观设定。只输出回复内容本身。`;

                            const cfg = resolveAuxiliaryApiConfig('peek');
                            const { requestBody, endpoint, headers } = buildChatApiRequest(
                                cfg,
                                [{ role: 'user', content: prompt }],
                                { temperature: 0.85 }
                            );

                            const contentStr = await fetchAiResponse(cfg, requestBody, headers, endpoint);
                            const cleanReply = contentStr.replace(/^["'「『\s]+|["'」』\s]+$/g, '').trim();

                            if (!latest.comments) latest.comments = [];
                            latest.comments.push({
                                id: `cmt_${Date.now()}`,
                                author: commenter1.charName,
                                content: cleanReply,
                                timestamp: Date.now(),
                                replyTo: commenter2.charName,
                                charId: commenter1.char.id
                            });
                            await saveData();
                            renderCommunityFeed();
                        } catch (err) {
                            console.error('Group reply error:', err);
                        }
                    }, replyDelay);
                }
            }
        }
    }, 60 * 60 * 1000);
}

window.setupCommunityModule = setupCommunityModule;
