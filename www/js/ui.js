// --- 界面交互逻辑 (js/ui.js) ---

// DOM 元素缓存 (将在脚本加载时初始化)
const homeScreen = document.getElementById('home-screen');
let chatRoomScreen = document.getElementById('chat-room-screen');
let chatExpansionPanel = document.getElementById('chat-expansion-panel');
let panelFunctionArea = document.getElementById('panel-function-area');
let panelStickerArea = document.getElementById('panel-sticker-area');
let messageArea = document.getElementById('message-area');
let chatRoomHeaderDefault = document.getElementById('chat-room-header-default');
let chatRoomHeaderSelect = document.getElementById('chat-room-header-select');
let multiSelectBar = document.getElementById('multi-select-bar');
let multiSelectTitle = document.getElementById('multi-select-title');
let selectCount = document.getElementById('select-count');
let deleteSelectedBtn = document.getElementById('delete-selected-btn');
let chatRoomTitle = document.getElementById('chat-room-title');
let chatRoomStatusText = document.getElementById('chat-room-status-text');
let typingIndicator = document.getElementById('typing-indicator');
let messageInput = document.getElementById('message-input');
let getReplyBtn = document.getElementById('get-reply-btn');
let regenerateBtn = document.getElementById('regenerate-btn');

// 绑定功能面板按钮
function setupAirDropPanelBtn() {
    const airdropPanelBtn = document.getElementById('airdrop-panel-btn');
    if (airdropPanelBtn) {
        // 移除旧的监听器以防重复绑定
        const newBtn = airdropPanelBtn.cloneNode(true);
        airdropPanelBtn.parentNode.replaceChild(newBtn, airdropPanelBtn);
        
        newBtn.addEventListener('click', async () => {
            document.getElementById('chat-expansion-panel').classList.remove('visible');
            if (currentChatType !== 'private') {
                showToast('隔空投送仅支持私聊');
                return;
            }
            const chat = db.characters.find(c => c.id === currentChatId);
            if (!chat) return;

            if (!dexieDB) {
                showToast('数据库未就绪');
                return;
            }

            try {
                const photos = await dexieDB.characterPhotos.where('charId').equals(chat.id).reverse().sortBy('timestamp');
                if (photos.length > 0) {
                    showAirDropPreview(photos[0], chat);
                } else {
                    showToast('TA的相册空空如也');
                }
            } catch (error) {
                console.error("Load AirDrop Error:", error);
                showToast('加载失败');
            }
        });
    }
}

// 导航历史栈（供左滑返回手势使用）
const screenHistory = [];

// Instagram 首页快拍栏渲染：你的快拍 + 最多 3 个角色
function renderInstagramStories() {
    const row = document.getElementById('ig-stories-row');
    if (!row) return;
    const info = igGetMyInfo();
    const chars = (db.characters || []).slice(0, 3);
    row.innerHTML = `
        <div class="ig-story-item" data-story="me">
            <div class="ig-story-avatar-wrap">
                <div class="ig-story-ring plain"><img src="${info.avatar}" alt="${info.name}"></div>
                <div class="ig-story-plus">+</div>
            </div>
            <span class="ig-story-name">你的快拍</span>
        </div>
        ${chars.map(c => `
        <div class="ig-story-item" data-story="${c.id}">
            <div class="ig-story-ring"><img src="${c.avatar || ''}" alt="${c.name || ''}" onerror="this.style.visibility='hidden'"></div>
            <span class="ig-story-name">${c.name || c.realName || '角色'}</span>
        </div>`).join('')}
    `;
}

// ===== Instagram 新帖子页面 =====
const IG_PHOTOS_KEY = 'uwu_ig_photos';
const IG_POSTS_KEY = 'uwu_ig_posts';

function igGetPhotos() {
    try {
        const raw = JSON.parse(localStorage.getItem(IG_PHOTOS_KEY)) || [];
        // 兼容旧格式（纯字符串）
        return raw.map(p => (typeof p === 'string' ? { img: p, desc: '' } : p));
    } catch (e) { return []; }
}
function igSavePhotos(photos) { localStorage.setItem(IG_PHOTOS_KEY, JSON.stringify(photos)); }
function igGetPosts() {
    try { return JSON.parse(localStorage.getItem(IG_POSTS_KEY)) || []; } catch (e) { return []; }
}
function igSavePosts(posts) { localStorage.setItem(IG_POSTS_KEY, JSON.stringify(posts)); }

// Ins 内"我"的资料：完全独立于微信的人设/资料。
// 首次使用时从当前人设播种一次初始值，之后只读写 db.igProfile，两边互不影响。
function igGetMyInfo() {
    if (!db.igProfile) {
        let seed = { name: 'uwu用户123', avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bio: '' };
        let activePersona = null;
        if (db.activePersonaId) activePersona = db.myPersonaPresets.find(p => p.id === db.activePersonaId);
        if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) activePersona = db.myPersonaPresets[0];
        if (activePersona) {
            seed.name = activePersona.name || seed.name;
            seed.avatar = activePersona.avatar || seed.avatar;
            seed.bio = activePersona.persona || '';
        } else if (db.characters && db.characters.length > 0) {
            seed.name = db.characters[0].myName || seed.name;
            seed.avatar = db.characters[0].myAvatar || seed.avatar;
        }
        db.igProfile = { name: seed.name, handle: seed.name, avatar: seed.avatar, bio: seed.bio, followers: 21, following: 4, popularity: 'unknown' };
        if (typeof saveData === 'function') saveData();
    }
    return {
        name: db.igProfile.name || 'uwu用户123',
        handle: db.igProfile.handle || db.igProfile.name || 'uwu用户123',
        avatar: db.igProfile.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        bio: db.igProfile.bio || '',
        followers: (typeof db.igProfile.followers === 'number') ? db.igProfile.followers : 21,
        following: (typeof db.igProfile.following === 'number') ? db.igProfile.following : 4,
        popularity: db.igProfile.popularity || 'unknown'
    };
}

// 选择中的图片（页面临时状态）
let igSelectedPhoto = null;

function igRenderGallery() {
    const grid = document.getElementById('ig-newpost-gallery');
    if (!grid) return;
    const photos = igGetPhotos();
    grid.innerHTML = `
        <div id="ig-newpost-camera" title="上传图片" style="background:#111;aspect-ratio:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">
            <svg viewBox="0 0 24 24" style="width:28px;height:28px;" fill="none" stroke="#ffffff" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>
        </div>
        ${photos.map(p => `
            <div class="ig-photo-cell ${igSelectedPhoto === p.img ? 'selected' : ''}" data-photo="${p.img}" style="aspect-ratio:1;overflow:hidden;cursor:pointer;position:relative;">
                <img src="${p.img}" style="width:100%;height:100%;object-fit:cover;display:block;">
                ${igSelectedPhoto === p.img ? '<div style="position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:#3897f0;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;">✓</div>' : ''}
            </div>`).join('')}
    `;
    document.getElementById('ig-newpost-camera')?.addEventListener('click', () => {
        document.getElementById('ig-newpost-input')?.click();
    });
    grid.querySelectorAll('.ig-photo-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            igSelectedPhoto = cell.dataset.photo;
            const img = document.getElementById('ig-newpost-preview-img');
            if (img) { img.src = igSelectedPhoto; img.style.display = 'block'; }
            document.getElementById('ig-newpost-edit').style.display = 'block';
            igRenderGallery();
        });
        // 长按 500ms 删除图片
        let pressTimer = null;
        const startPress = () => {
            pressTimer = setTimeout(() => {
                pressTimer = null;
                if (confirm('删除这张图片？')) {
                    const list = igGetPhotos().filter(p => p.img !== cell.dataset.photo);
                    igSavePhotos(list);
                    if (igSelectedPhoto === cell.dataset.photo) {
                        igSelectedPhoto = null;
                        const img = document.getElementById('ig-newpost-preview-img');
                        if (img) { img.style.display = 'none'; img.src = ''; }
                        document.getElementById('ig-newpost-edit').style.display = 'none';
                    }
                    igRenderGallery();
                    showToast('已删除');
                }
            }, 500);
        };
        const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        cell.addEventListener('touchstart', startPress, { passive: true });
        cell.addEventListener('touchend', cancelPress);
        cell.addEventListener('touchmove', cancelPress);
        cell.addEventListener('mousedown', startPress);
        cell.addEventListener('mouseup', cancelPress);
        cell.addEventListener('mouseleave', cancelPress);
    });
}

// 编辑图片描述弹窗
function igOpenDescEditor() {
    if (!igSelectedPhoto) return;
    const photos = igGetPhotos();
    const item = photos.find(p => p.img === igSelectedPhoto);
    let overlay = document.getElementById('ig-desc-modal');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'ig-desc-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="width:360px;max-width:88%;background:#fff;padding:18px;border-radius:16px;">
            <h3 style="margin:0 0 10px 0;font-size:15px;color:#1a1a1a;">图片描述</h3>
            <textarea id="ig-desc-input" placeholder="写点描述..." style="width:100%;height:90px;resize:none;border:1px solid #d3e3f8;border-radius:12px;padding:10px;font-size:14px;box-sizing:border-box;outline:none;">${item ? (item.desc || '') : ''}</textarea>
            <div style="display:flex;gap:10px;margin-top:12px;justify-content:flex-end;">
                <button id="ig-desc-cancel" style="padding:8px 18px;border-radius:12px;border:1px solid #d3e3f8;background:#fff;color:#1a1a1a;cursor:pointer;">取消</button>
                <button id="ig-desc-save" style="padding:8px 22px;border-radius:12px;border:none;background:linear-gradient(135deg,#d0e0fd,#b8d0f8);color:#1a1a1a;font-weight:600;cursor:pointer;">保存</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#ig-desc-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ig-desc-save').addEventListener('click', () => {
        const desc = overlay.querySelector('#ig-desc-input').value.trim();
        const list = igGetPhotos();
        const it = list.find(p => p.img === igSelectedPhoto);
        if (it) { it.desc = desc; igSavePhotos(list); }
        overlay.remove();
        showToast('描述已保存');
    });
}

// Instagram 个人主页渲染
function igRenderProfileGrid() {
    const grid = document.getElementById('ig-profile-grid');
    const posts = igGetPosts();
    grid.innerHTML = posts.length === 0
        ? '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:13px;padding:40px 20px;">还没有帖子</div>'
        : posts.map(post => `<div class="ig-profile-cell" data-pid="${post.id}" style="cursor:pointer;"><img src="${post.img}" alt="帖子"></div>`).join('');
    // 点击帖子 → 帖子详情页
    grid.querySelectorAll('.ig-profile-cell').forEach(cell => {
        cell.addEventListener('click', () => igOpenPostDetail(cell.dataset.pid));
    });
}

// 帖子详情页：头部信息 + 大图 + 文案 + 评论列表（可下滑）
function igOpenPostDetail(postId) {
    const post = igGetPosts().find(p => p.id === postId);
    if (!post) return;
    if (!Array.isArray(post.comments)) post.comments = [];
    const info = igGetMyInfo();
    const total = post.comments.length + post.comments.reduce((n, c) => n + (c.replies?.length || 0), 0);
    const rowHtml = (c, isReply) => `
        <div style="display:flex;gap:10px;padding:${isReply ? '6px' : '10px'} 14px;${isReply ? 'margin-left:42px;' : ''}">
            <img src="${c.avatar || IG_DEFAULT_AVATAR}" style="width:${isReply ? 26 : 34}px;height:${isReply ? 26 : 34}px;border-radius:50%;object-fit:cover;flex:none;background:#f0f0f0;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:600;color:#1a1a1a;">${igEscapeHtml(c.name)}</div>
                <div style="font-size:13.5px;color:#262626;margin-top:2px;word-break:break-word;line-height:1.45;">${isReply && c.pname ? `<span style="color:#385185;font-weight:500;">@${igEscapeHtml(c.pname)}</span> ` : ''}${igEscapeHtml(c.text)}</div>
                <div style="font-size:10.5px;color:#999;margin-top:3px;">${igFormatTime(c.timestamp || Date.now())}</div>
            </div>
        </div>`;
    const cmtsHtml = post.comments.map(c => rowHtml(c) + (c.replies?.length ? c.replies.map(r => rowHtml({ ...r, pname: c.name }, true)).join('') : '')).join('');
    document.getElementById('ig-post-detail-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;">
            <img src="${info.avatar || IG_DEFAULT_AVATAR}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;background:#f0f0f0;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:13.5px;font-weight:600;color:#1a1a1a;">${igEscapeHtml(info.handle)}</div>
                <div style="font-size:11px;color:#999;margin-top:1px;">${igFormatTime(post.timestamp || Date.now())}</div>
            </div>
        </div>
        <img src="${post.img}" style="width:100%;display:block;background:#000;" alt="帖子图片">
        <div style="padding:12px 14px 4px;font-size:13.5px;color:#1a1a1a;line-height:1.5;">${post.desc ? `<span style="font-weight:600;margin-right:6px;">${igEscapeHtml(info.handle)}</span>${igEscapeHtml(post.desc)}` : '<span style="color:#999;">（无文案）</span>'}</div>
        <div style="padding:12px 14px;border-bottom:1px solid #f0f0f0;margin-top:6px;font-size:12.5px;color:#666;">评论 ${total}</div>
        <div>${cmtsHtml || '<div style="text-align:center;color:#999;font-size:13px;padding:30px 20px;">还没有评论，快去首页的评论弹窗里查看吧</div>'}</div>`;
    window.__isBackNavigation = true;
    switchScreen('ig-post-detail-screen');
    window.__isBackNavigation = false;
}

function renderInstagramProfile() {
    const info = igGetMyInfo();
    const posts = igGetPosts();
    document.getElementById('ig-profile-name').textContent = info.handle;
    document.getElementById('ig-profile-username').textContent = info.name;
    const handleEl = document.getElementById('ig-profile-handle');
    if (handleEl) handleEl.textContent = info.name;
    document.getElementById('ig-profile-avatar').src = info.avatar;
    document.getElementById('ig-profile-posts-n').textContent = posts.length;
    document.getElementById('ig-profile-followers-n').textContent = info.followers;
    document.getElementById('ig-profile-following-n').textContent = info.following;
    document.getElementById('ig-profile-bio').textContent = info.bio || 'U W U';
    igRenderProfileGrid();
    // 主页 tab 切换（帖子 / 视频）
    document.querySelectorAll('#ig-profile-screen .ig-profile-tab').forEach(tab => {
        if (tab.dataset.igBound) return;
        tab.dataset.igBound = '1';
        tab.addEventListener('click', () => {
            document.querySelectorAll('#ig-profile-screen .ig-profile-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const grid = document.getElementById('ig-profile-grid');
            if (tab.dataset.igTab === 'videos') {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:13px;padding:40px 20px;">还没有视频</div>';
            } else if (tab.dataset.igTab === 'tagged') {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:13px;padding:40px 20px;">还没有被标记的照片</div>';
            } else {
                igRenderProfileGrid();
            }
        });
    });
}


const IG_ICONS = {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M12 21c-4.9-3.6-8.5-6.9-8.5-11A5 5 0 0 1 12 7.2 5 5 0 0 1 20.5 10c0 4.1-3.6 7.4-8.5 11z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    repost: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
};
const igLikedPosts = new Set();
const igSavedPosts = new Set();

function igFormatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    const d = new Date(ts);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function igRandInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// 按热度等级随机生成互动数：点赞 > 转发 > 评论 > 推荐
function igGenerateCounts() {
    const tier = (db.igProfile && db.igProfile.popularity) || 'unknown';
    let likes;
    if (tier === 'top') likes = igRandInt(400000, 2000000);
    else if (tier === 'rising') likes = igRandInt(10000, 100000);
    else likes = igRandInt(0, 40);
    const reposts = likes > 0 ? igRandInt(Math.floor(likes * 0.2), Math.max(Math.floor(likes * 0.2), likes - 1)) : 0;
    const comments = reposts > 0 ? igRandInt(0, reposts - 1) : 0;
    const recommends = comments > 0 ? igRandInt(0, comments - 1) : 0;
    return { likes, reposts, comments, recommends };
}

// 确保每条帖子都有互动数（首次生成后持久化，不再变化）
function igEnsureCounts() {
    const posts = igGetPosts();
    let changed = false;
    posts.forEach(p => {
        if (!p.counts) { p.counts = igGenerateCounts(); changed = true; }
    });
    if (changed) igSavePosts(posts);
    return posts;
}

function igFmtNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
    return n.toLocaleString('en-US');
}

function igCharHash(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
}

// 角色实际帖子数：读取 db.igCharPosts[charId]（角色发帖功能待做，当前为 0）
function igCharPostCount(charId) {
    return (db.igCharPosts && Array.isArray(db.igCharPosts[charId])) ? db.igCharPosts[charId].length : 0;
}

// ===== INS 评论设置（≡ 菜单）=====
function igGetCommentSettings() {
    if (!db.igCommentSettings) db.igCommentSettings = {};
    const s = db.igCommentSettings;
    // 一次性迁移：角色评论/路人评论默认改为关闭
    if (s._v2Defaults !== true) {
        s.charEnabled = false;
        s.strangerEnabled = false;
        s._v2Defaults = true;
    }
    if (s.charEnabled === undefined) s.charEnabled = false;
    if (s.charMin === undefined) s.charMin = 1;
    if (s.charMax === undefined) s.charMax = 3;
    if (s.delayMin === undefined) s.delayMin = 0;
    if (s.delayMax === undefined) s.delayMax = 0;
    if (s.strangerEnabled === undefined) s.strangerEnabled = false;
    if (s.strangerMin === undefined) s.strangerMin = 2;
    if (s.strangerMax === undefined) s.strangerMax = 5;
    if (s.strangerPrompt === undefined) s.strangerPrompt = '';
    return s;
}

function igOpenCommentSettings() {
    const s = igGetCommentSettings();
    document.getElementById('ig-cs-char-enabled').checked = s.charEnabled;
    document.getElementById('ig-cs-char-min').value = s.charMin;
    document.getElementById('ig-cs-char-max').value = s.charMax;
    document.getElementById('ig-cs-delay-min').value = s.delayMin;
    document.getElementById('ig-cs-delay-max').value = s.delayMax;
    document.getElementById('ig-cs-stranger-enabled').checked = s.strangerEnabled;
    document.getElementById('ig-cs-stranger-min').value = s.strangerMin;
    document.getElementById('ig-cs-stranger-max').value = s.strangerMax;
    document.getElementById('ig-cs-stranger-prompt').value = s.strangerPrompt;
    igRenderAutoPostList();
    switchScreen('ig-comment-settings-screen');
}

function igBindCommentSettings() {
    document.getElementById('ig-profile-menu-btn')?.addEventListener('click', igOpenCommentSettings);
    // 返回：回到 Ins 个人主页
    document.getElementById('ig-cs-back')?.addEventListener('click', () => {
        window.__isBackNavigation = true;
        switchScreen('ig-profile-screen');
        window.__isBackNavigation = false;
    });
    // 保存：读取全部设置 → 校验 → 持久化 → 返回
    document.getElementById('ig-cs-save')?.addEventListener('click', () => {
        const s = igGetCommentSettings();
        const charEnabledBefore = !!s.charEnabled;
        s.charEnabled = document.getElementById('ig-cs-char-enabled').checked;
        s.charMin = Math.max(0, parseInt(document.getElementById('ig-cs-char-min').value, 10) || 0);
        s.charMax = Math.max(s.charMin, parseInt(document.getElementById('ig-cs-char-max').value, 10) || 0);
        s.delayMin = Math.max(0, parseFloat(document.getElementById('ig-cs-delay-min').value) || 0);
        s.delayMax = Math.max(s.delayMin, parseFloat(document.getElementById('ig-cs-delay-max').value) || 0);
        s.strangerEnabled = document.getElementById('ig-cs-stranger-enabled').checked;
        s.strangerMin = Math.max(0, parseInt(document.getElementById('ig-cs-stranger-min').value, 10) || 0);
        s.strangerMax = Math.max(s.strangerMin, parseInt(document.getElementById('ig-cs-stranger-max').value, 10) || 0);
        s.strangerPrompt = document.getElementById('ig-cs-stranger-prompt').value.trim();
        saveData().then(() => {
            // 从关到开：回填所有还没生成过角色评论的旧帖
            if (!charEnabledBefore && s.charEnabled) igBackfillCharComments();
            showToast('评论设置已保存');
            window.__isBackNavigation = true;
            switchScreen('ig-profile-screen');
            window.__isBackNavigation = false;
        });
    });
}

// ===== 角色主动发帖（任务1：≡ 菜单设置入口） =====
// 每角色发帖设置：db.igCharPostSettings[charId] = { enabled, startHour, endHour, minPerDay, maxPerDay, useGallery }
function igGetPostSettings() {
    if (!db.igCharPostSettings) db.igCharPostSettings = {};
    return db.igCharPostSettings;
}

function igRenderAutoPostList() {
    const wrap = document.getElementById('ig-ap-char-list');
    if (!wrap) return;
    const settings = igGetPostSettings();
    const chars = db.characters || [];
    if (!chars.length) {
        wrap.innerHTML = '<div style="color:#b0b0b8;font-size:13px;text-align:center;padding:12px 0;">暂无角色</div>';
        return;
    }
    wrap.innerHTML = chars.map(c => {
        const st = settings[c.id] || {};
        const on = !!st.enabled;
        return `<div class="ig-ap-row" data-cid="${c.id}" style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid rgba(142,142,142,0.1);cursor:pointer;">
            <img src="${c.avatar || IG_DEFAULT_AVATAR}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:500;color:#1a1a1a;">${igEscapeHtml(c.remarkName || c.name || '')}</div>
                <div style="font-size:11px;color:${on ? '#e1306c' : '#a8a8b0'};">${on ? '已开启主动发帖 · 点击进入详情' : '点击进入发帖详情设置'}</div>
            </div>
            <label class="ig-switch" style="transform:scale(0.92);" onclick="event.stopPropagation();"><input type="checkbox" data-ap-toggle="${c.id}" ${on ? 'checked' : ''}><span class="track"></span></label>
        </div>`;
    }).join('');
    // 开关：立即生效保存；开启即接入发帖调度
    wrap.querySelectorAll('[data-ap-toggle]').forEach(t => {
        t.addEventListener('change', () => {
            const s = igGetPostSettings();
            const cid = t.dataset.apToggle;
            if (!s[cid]) s[cid] = {};
            s[cid].enabled = t.checked;
            if (typeof saveData === 'function') saveData();
            if (t.checked && typeof igScheduleCharTimers === 'function') igScheduleCharTimers(cid);
            igRenderAutoPostList();
        });
    });
    // 点击行：进入单角色发帖详情设置
    wrap.querySelectorAll('.ig-ap-row').forEach(row => {
        row.addEventListener('click', () => igOpenAutoPostDetail(row.dataset.cid));
    });
}

// ===== 任务3：单角色主动发帖详情设置 =====
let igApDetailCharId = null;

// 每角色设置默认值（首次打开时初始化）
function igGetCharPostSetting(charId) {
    const all = igGetPostSettings();
    if (!all[charId]) all[charId] = { enabled: false, startHour: 9, endHour: 23, minPerDay: 1, maxPerDay: 3, useGallery: true };
    const s = all[charId];
    if (s.startHour === undefined) s.startHour = 9;
    if (s.endHour === undefined) s.endHour = 23;
    if (s.minPerDay === undefined) s.minPerDay = 1;
    if (s.maxPerDay === undefined) s.maxPerDay = 3;
    if (s.useGallery === undefined) s.useGallery = true;
    if (s.fanPrompt === undefined) s.fanPrompt = '';
    return s;
}

function igOpenAutoPostDetail(charId) {
    igApDetailCharId = charId;
    const c = (db.characters || []).find(x => x.id === charId);
    document.getElementById('ig-apd-title').textContent = `${c ? (c.remarkName || c.name) : '角色'} · 主动发帖`;
    const s = igGetCharPostSetting(charId);
    document.getElementById('ig-apd-start').value = s.startHour;
    document.getElementById('ig-apd-end').value = s.endHour;
    document.getElementById('ig-apd-min').value = s.minPerDay;
    document.getElementById('ig-apd-max').value = s.maxPerDay;
    document.getElementById('ig-apd-use-gallery').checked = s.useGallery;
    document.getElementById('ig-apd-gallery-count').textContent = `共 ${(db.igCharGalleries?.[charId] || []).length} 张图片`;
    document.getElementById('ig-apd-fan-prompt').value = s.fanPrompt || '';
    switchScreen('ig-ap-detail-screen');
}

function igBindAutoPostDetail() {
    const screen = document.getElementById('ig-ap-detail-screen');
    if (!screen) return;
    // 返回 → 回 Ins 设置页
    document.getElementById('ig-apd-back').addEventListener('click', () => {
        window.__isBackNavigation = true;
        switchScreen('ig-comment-settings-screen');
        window.__isBackNavigation = false;
    });
    // 图库入口
    document.getElementById('ig-apd-gallery-entry').addEventListener('click', () => {
        if (igApDetailCharId) igOpenGallery(igApDetailCharId);
    });
    // 保存：校验并持久化
    document.getElementById('ig-apd-save').addEventListener('click', () => {
        if (!igApDetailCharId) return;
        const startHour = parseInt(document.getElementById('ig-apd-start').value, 10);
        const endHour = parseInt(document.getElementById('ig-apd-end').value, 10);
        const minPerDay = parseInt(document.getElementById('ig-apd-min').value, 10);
        const maxPerDay = parseInt(document.getElementById('ig-apd-max').value, 10);
        const useGallery = document.getElementById('ig-apd-use-gallery').checked;
        if (isNaN(startHour) || isNaN(endHour) || startHour < 0 || endHour < 0 || startHour > 23 || endHour > 23) { showToast('时间段需在 0~23 点之间'); return; }
        if (startHour > endHour) { showToast('开始时间需早于结束时间'); return; }
        if (isNaN(minPerDay) || isNaN(maxPerDay) || minPerDay < 0 || maxPerDay < 0 || minPerDay > maxPerDay) { showToast('每日条数需满足 最少 ≤ 最多'); return; }
        const s = igGetCharPostSetting(igApDetailCharId);
        s.startHour = startHour; s.endHour = endHour;
        s.minPerDay = minPerDay; s.maxPerDay = maxPerDay;
        s.useGallery = useGallery;
        s.fanPrompt = document.getElementById('ig-apd-fan-prompt').value.trim();
        saveData().then(() => {
            showToast('发帖设置已保存');
            igRenderAutoPostList();
            window.__isBackNavigation = true;
            switchScreen('ig-comment-settings-screen');
            window.__isBackNavigation = false;
        });
    });
}

// ===== 任务4：角色主动发帖引擎 =====
// 每天按北京时间（UTC+8）为每个开启的角色规划 minPerDay~maxPerDay 个发帖时刻（在设定时间段内随机）
// 计划持久化 db.igAutoPostPlan[charId] = { date:'Y-M-D', items:[{at,done}] }，刷新后补发到期时点、重挂未来定时器

function igBeijingNow() {
    return new Date(Date.now() + 8 * 3600000 + new Date().getTimezoneOffset() * 60000);
}

function igGetAutoPostPlan() {
    if (!db.igAutoPostPlan) db.igAutoPostPlan = {};
    return db.igAutoPostPlan;
}

const igScheduledKeys = new Set(); // 内存防重复挂定时器：`${charId}|${at}`

function igEnsurePlan(charId) {
    const s = igGetCharPostSetting(charId);
    const plans = igGetAutoPostPlan();
    const bj = igBeijingNow();
    const today = `${bj.getFullYear()}-${bj.getMonth() + 1}-${bj.getDate()}`;
    let plan = plans[charId];
    if (!plan || plan.date !== today) {
        // 北京时间当日 0 点对应的真实时间戳
        const midnightEpoch = Date.now() - (bj.getHours() * 3600000 + bj.getMinutes() * 60000 + bj.getSeconds() * 1000 + bj.getMilliseconds());
        const n = s.minPerDay + Math.floor(Math.random() * (s.maxPerDay - s.minPerDay + 1));
        const times = [];
        for (let i = 0; i < n; i++) {
            const h = s.startHour + Math.floor(Math.random() * (s.endHour - s.startHour + 1));
            times.push(midnightEpoch + h * 3600000 + igRandInt(0, 3599) * 1000);
        }
        times.sort((a, b) => a - b);
        plan = plans[charId] = { date: today, items: times.map(at => ({ at, done: false })) };
        saveData();
    }
    return plan;
}

function igScheduleCharTimers(charId) {
    const plan = igEnsurePlan(charId);
    plan.items.forEach(it => {
        if (it.done) return;
        const key = `${charId}|${it.at}`;
        if (igScheduledKeys.has(key)) return;
        igScheduledKeys.add(key);
        const delay = it.at - Date.now();
        if (delay <= 0) {
            // 错过的时点（刷新补偿）：立即补发
            it.done = true;
            setTimeout(() => igCharAutoPost(charId), igRandInt(0, 5000));
        } else {
            setTimeout(() => {
                // 到点时校验计划未被重排（跨天会重新规划）
                const cur = igGetAutoPostPlan()[charId];
                const item = cur && cur.items.find(x => x.at === it.at && !x.done);
                if (!item) return;
                item.done = true;
                saveData();
                igCharAutoPost(charId);
            }, delay);
        }
    });
    saveData();
}

// 引擎启动：为所有开启的角色挂定时器；每5分钟巡检跨天重排与漏网补发
function igInitAutoPostEngine() {
    const settings = igGetPostSettings();
    Object.keys(settings).forEach(cid => {
        if (settings[cid].enabled) igScheduleCharTimers(cid);
    });
    setInterval(() => {
        const st = igGetPostSettings();
        Object.keys(st).forEach(cid => {
            if (st[cid].enabled) igScheduleCharTimers(cid);
        });
    }, 5 * 60000);
}

// 爱心催更：首页右上角爱心 → 选角色 → 立即生成发布一条帖子（不受时间段限制，同样遵守图库规则与热度等级）
function igBindHeartBoost() {
    const btn = document.getElementById('ig-heart-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const chars = db.characters || [];
        if (!chars.length) { showToast('暂无角色'); return; }
        document.getElementById('ig-heart-pick-overlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'ig-heart-pick-overlay';
        ov.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.35);z-index:130;display:flex;align-items:center;justify-content:center;';
        ov.innerHTML = `
            <div style="width:280px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.18);">
                <div style="padding:16px 16px 10px;text-align:center;font-size:15px;font-weight:600;color:#1a1a1a;">选择催更的角色</div>
                <div style="max-height:320px;overflow-y:auto;padding:0 10px 10px;">
                    ${chars.map(c => `
                        <div data-boost-cid="${c.id}" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:14px;cursor:pointer;" onmouseover="this.style.background='#f7f8fa'" onmouseout="this.style.background=''">
                            <img src="${c.avatar || IG_DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;">
                            <div style="font-size:14px;font-weight:500;color:#1a1a1a;">${igEscapeHtml(c.remarkName || c.name || '')}</div>
                        </div>`).join('')}
                </div>
                <div style="border-top:1px solid #f0f0f0;padding:10px;">
                    <div id="ig-heart-pick-cancel" style="text-align:center;font-size:14px;color:#e1306c;font-weight:600;cursor:pointer;padding:4px;">取消</div>
                </div>
            </div>`;
        document.getElementById('instagram-screen').appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
        ov.querySelector('#ig-heart-pick-cancel').addEventListener('click', () => ov.remove());
        ov.querySelectorAll('[data-boost-cid]').forEach(row => {
            row.addEventListener('click', async () => {
                const cid = row.dataset.boostCid;
                ov.remove();
                showToast('正在催更…');
                await igCharAutoPost(cid);
                renderInstagramPosts();
            });
        });
    });
}

// 角色帖子的互动数：按该角色 heatLevel 三档生成，点赞 > 转发 > 评论 > 推荐
function igGenerateCharCounts(charId) {
    const tier = (db.igCharProfiles && db.igCharProfiles[charId] && db.igCharProfiles[charId].heatLevel) || 'unknown';
    let likes;
    if (tier === 'top') likes = igRandInt(400000, 2000000);
    else if (tier === 'rising') likes = igRandInt(10000, 100000);
    else likes = igRandInt(0, 40);
    const reposts = likes > 0 ? igRandInt(Math.floor(likes * 0.2), Math.max(Math.floor(likes * 0.2), likes - 1)) : 0;
    const comments = reposts > 0 ? igRandInt(0, reposts - 1) : 0;
    const recommends = comments > 0 ? igRandInt(0, comments - 1) : 0;
    return { likes, reposts, comments, recommends };
}

// 黑底白字文字图（1080x1080，自动换行居中）
function igMakeTextImage(text) {
    const size = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = text.length > 40 ? 56 : text.length > 16 ? 72 : 96;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const maxW = size - 160;
    const lines = [];
    let line = '';
    for (const ch of text) {
        if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
        else line += ch;
    }
    if (line) lines.push(line);
    const lh = fontSize * 1.4;
    const startY = size / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, size / 2, startY + i * lh));
    return canvas.toDataURL('image/jpeg', 0.85);
}

// 角色主动发一次帖：AI 生成面向大众的文案+配图描述 → 选图库图或黑底文字图 → 落库
async function igCharAutoPost(charId) {
    const c = (db.characters || []).find(x => x.id === charId);
    if (!c) return;
    const s = igGetCharPostSetting(charId);
    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) { showToast('请先在设置中配置 API，角色发帖失败'); return; }

    // 上下文：角色人设 + 世界书 + 最近20条聊天 + 用户人设
    let activePersona = null;
    if (db.activePersonaId) activePersona = (db.myPersonaPresets || []).find(p => p.id === db.activePersonaId);
    if (!activePersona && db.myPersonaPresets?.length) activePersona = db.myPersonaPresets[0];
    const userPersona = activePersona?.persona ? activePersona.persona.slice(0, 200) : '';
    const wbs = (c.worldBookIds || []).map(id => db.worldBooks?.find(wb => wb.id === id)).filter(Boolean).map(wb => wb.content).join('\n');
    const history = (c.history || []).slice(-20)
        .filter(m => m && typeof m.content === 'string' && m.content.trim() && !m.isThinking)
        .map(m => `${m.role === 'user' ? '用户' : (c.remarkName || c.name)}: ${m.content.replace(/<[^>]+>/g, '').slice(0, 80)}`)
        .join('\n');
    const heat = (db.igCharProfiles && db.igCharProfiles[charId] && db.igCharProfiles[charId].heatLevel) || 'unknown';
    const heatDesc = heat === 'top' ? '顶流（几十万到几百万粉丝）' : heat === 'rising' ? '小红（一万到十万粉丝）' : '默默无闻（几百粉丝以内）';

    const prompt = `你正在以一位 Instagram 用户的身份发帖。
【你的身份】${c.remarkName || c.name}
人设：${(c.persona || '').slice(0, 300)}
${wbs ? `相关设定：${wbs.slice(0, 300)}` : ''}
${history ? `你最近的生活/聊天记录：\n${history}` : ''}
${userPersona ? `【你的好友（用户）】${userPersona}` : ''}
【你的热度】${heatDesc}

【要求】
1. 发一条面向平台大众的帖子（不是对特定人说话），内容符合人设、像真实生活分享
2. caption：帖子文案（可带 emoji 和 #标签，20字以内）
3. imageDesc：配图画面描述（15字以内，如"夕阳下的海边咖啡店"）
4. 只输出 JSON：{"caption":"...","imageDesc":"..."}，不要任何解释`;

    let requestBody, endpoint, headers;
    if (provider === 'gemini') {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        requestBody = {
            model: model,
            messages: [
                { role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' },
                { role: 'user', content: prompt }
            ],
            temperature: 1.0
        };
    }

    try {
        let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const m = content.match(/\{[\s\S]*\}/);
        const obj = JSON.parse(m ? m[0] : content);
        const caption = String(obj.caption || '').slice(0, 100);
        const imageDesc = String(obj.imageDesc || '').slice(0, 60);

        // 配图：图库开关开且有余图 → 大概率挑一张标记已用；否则黑底文字图
        let img = null;
        const gallery = (db.igCharGalleries && db.igCharGalleries[charId] || []).filter(g => !g.used);
        if (s.useGallery && gallery.length && Math.random() >= 0.2) {
            const pick = gallery[igRandInt(0, gallery.length - 1)];
            pick.used = true;
            img = pick.img;
        } else {
            img = igMakeTextImage(imageDesc || caption || 'NO PHOTO');
        }

        const post = {
            id: 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            charId,
            img,
            desc: caption,
            imageDesc,
            counts: igGenerateCharCounts(charId),
            timestamp: Date.now(),
            comments: []
        };
        if (!db.igCharPosts) db.igCharPosts = {};
        if (!Array.isArray(db.igCharPosts[charId])) db.igCharPosts[charId] = [];
        db.igCharPosts[charId].unshift(post);
        saveData();
        showToast(`${c.remarkName || c.name} 发布了新帖子`);
        // 自动生成评论区（5~10条路人，异步）
        igGenerateCharPostComments(charId, post);
    } catch (err) {
        showToast('角色发帖生成失败');
    }
}

// ===== 任务2：角色专属 INS 图库 =====
// db.igCharGalleries[charId] = [{id, img(base64 480px方图), desc, used}]，随 globalSettingKeys 持久化
let igGalCharId = null;   // 当前图库角色
let igGalManage = false;  // 是否管理模式
const igGalSelected = new Set();

function igGetGallery(charId) {
    if (!db.igCharGalleries) db.igCharGalleries = {};
    if (!db.igCharGalleries[charId]) db.igCharGalleries[charId] = [];
    return db.igCharGalleries[charId];
}

function igOpenGallery(charId) {
    igGalCharId = charId;
    igGalManage = false;
    igGalSelected.clear();
    const c = (db.characters || []).find(x => x.id === charId);
    document.getElementById('ig-gal-title').textContent = `${c ? (c.remarkName || c.name) : '角色'} · INS图库`;
    igRenderGalleryPage();
    switchScreen('ig-gallery-screen');
}

function igRenderGalleryPage() {
    const grid = document.getElementById('ig-gal-grid');
    if (!grid || !igGalCharId) return;
    const items = igGetGallery(igGalCharId);
    const manageBtn = document.getElementById('ig-gal-manage');
    const actionbar = document.getElementById('ig-gal-actionbar');
    manageBtn.textContent = igGalManage ? '完成' : '管理';
    actionbar.classList.toggle('visible', igGalManage && items.length > 0);
    document.getElementById('ig-gal-delete').textContent = `删除所选 (${igGalSelected.size})`;

    let html = '';
    if (!igGalManage) {
        html += `<div class="ig-gal-upload" id="ig-gal-upload-tile"><span>上传图片</span><i>可多选</i></div>`;
    }
    html += items.map((it, i) => `
        <div class="ig-gal-cell ${igGalSelected.has(it.id) ? 'selected' : ''}" data-gidx="${i}">
            <div class="ig-gal-imgwrap">
                <img src="${it.img}">
                ${it.used ? '<div class="ig-gal-used">✓</div>' : ''}
                ${igGalManage ? `<div class="ig-gal-check">${igGalSelected.has(it.id) ? '✓' : ''}</div>` : ''}
            </div>
            ${igGalManage ? '' : `<textarea class="ig-gal-desc" rows="2" data-gdesc="${i}" placeholder="描述词（角色据此选图）">${igEscapeHtml(it.desc || '')}</textarea>`}
        </div>`).join('');
    grid.innerHTML = html;

    // 上传入口
    grid.querySelector('#ig-gal-upload-tile')?.addEventListener('click', () => {
        document.getElementById('ig-gal-input').click();
    });
    // 描述词编辑（change 时保存，避免每键都写库）
    grid.querySelectorAll('[data-gdesc]').forEach(ta => {
        ta.addEventListener('change', () => {
            const items2 = igGetGallery(igGalCharId);
            const idx = parseInt(ta.dataset.gdesc, 10);
            if (items2[idx]) { items2[idx].desc = ta.value.trim(); saveData(); }
        });
    });
    // 管理模式下点格子切换选中
    if (igGalManage) {
        grid.querySelectorAll('.ig-gal-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const it = igGetGallery(igGalCharId)[parseInt(cell.dataset.gidx, 10)];
                if (!it) return;
                igGalSelected.has(it.id) ? igGalSelected.delete(it.id) : igGalSelected.add(it.id);
                igRenderGalleryPage();
            });
        });
    }
}

function igBindGalleryPage() {
    const screen = document.getElementById('ig-gallery-screen');
    if (!screen) return;
    // 返回 → 回单角色发帖详情设置
    document.getElementById('ig-gal-back').addEventListener('click', () => {
        window.__isBackNavigation = true;
        switchScreen('ig-ap-detail-screen');
        window.__isBackNavigation = false;
    });
    // 管理/完成切换
    document.getElementById('ig-gal-manage').addEventListener('click', () => {
        igGalManage = !igGalManage;
        igGalSelected.clear();
        igRenderGalleryPage();
    });
    // 批量删除
    document.getElementById('ig-gal-delete').addEventListener('click', () => {
        if (!igGalSelected.size) { showToast('请先勾选图片'); return; }
        const items = igGetGallery(igGalCharId).filter(it => !igGalSelected.has(it.id));
        db.igCharGalleries[igGalCharId] = items;
        igGalSelected.clear();
        saveData();
        igRenderGalleryPage();
        showToast('已删除');
    });
    document.getElementById('ig-gal-cancel').addEventListener('click', () => {
        igGalManage = false;
        igGalSelected.clear();
        igRenderGalleryPage();
    });
    // 批量上传：居中截方 → 480px jpeg 0.8
    document.getElementById('ig-gal-input').addEventListener('change', (ev) => {
        const files = [...ev.target.files];
        if (!files.length || !igGalCharId) return;
        let done = 0;
        const items = igGetGallery(igGalCharId);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const size = Math.min(img.width, img.height);
                    const scale = Math.min(1, 480 / size);
                    const out = Math.round(size * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = out; canvas.height = out;
                    canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, out, out);
                    items.unshift({ id: 'g_' + Date.now() + '_' + Math.floor(Math.random() * 1000), img: canvas.toDataURL('image/jpeg', 0.8), desc: '', used: false });
                    if (++done === files.length) {
                        saveData();
                        ev.target.value = '';
                        igRenderGalleryPage();
                        showToast(`已上传 ${files.length} 张图片`);
                    }
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    });
}

// 角色的 Ins 互动数据：db.igCharProfiles 手动设置优先，否则由 id 稳定生成
function igCharStats(char) {
    const ov = (db.igCharProfiles && db.igCharProfiles[char.id]) || {};
    const h = igCharHash(char.id || char.name || 'x');
    return {
        posts: igCharPostCount(char.id),
        followers: typeof ov.followers === 'number' ? ov.followers : (h >>> 3) % 1900000 + 10000,
        following: typeof ov.following === 'number' ? ov.following : (h >>> 7) % 900 + 50
    };
}

function igCharIgProfile(char) {
    const ov = (db.igCharProfiles && db.igCharProfiles[char.id]) || {};
    return {
        name: ov.name || char.name || '角色',
        handle: ov.handle || char.name || 'user',
        bio: (ov.bio !== undefined && ov.bio !== '') ? ov.bio : ((char.persona || '').slice(0, 40) || 'Instagram 用户')
    };
}

function igIsCharFollowed(charId) {
    if (!db.igFollowState) db.igFollowState = {};
    if (db.igFollowState[charId] === undefined) db.igFollowState[charId] = true;
    return db.igFollowState[charId];
}

function igToggleCharFollow(charId) {
    if (!db.igFollowState) db.igFollowState = {};
    db.igFollowState[charId] = !igIsCharFollowed(charId);
    if (typeof saveData === 'function') saveData();
}

// "关注的人"列表
function renderFollowingList() {
    const list = document.getElementById('ig-following-list');
    if (!list) return;
    const chars = db.characters || [];
    if (chars.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#8e8e8e;font-size:13px;padding:60px 20px;">还没有创建角色</div>';
        return;
    }
    list.innerHTML = chars.map(c => {
        const igp = igCharIgProfile(c);
        return `
        <div class="ig-follow-row" data-char-id="${c.id}">
            <img src="${c.avatar || ''}" class="ig-follow-avatar" alt="${igp.name}">
            <div class="ig-follow-info">
                <div class="ig-follow-name">${igp.handle}</div>
                <div class="ig-follow-sub">${igp.bio}</div>
            </div>
            <button class="ig-follow-btn ${igIsCharFollowed(c.id) ? 'followed' : ''}">${igIsCharFollowed(c.id) ? '已关注' : '关注'}</button>
        </div>`;
    }).join('');
    list.querySelectorAll('.ig-follow-row').forEach(row => {
        const cid = row.dataset.charId;
        row.querySelector('.ig-follow-avatar')?.addEventListener('click', () => openIgCharProfile(cid));
        row.querySelector('.ig-follow-info')?.addEventListener('click', () => openIgCharProfile(cid));
        row.querySelector('.ig-follow-btn')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            igToggleCharFollow(cid);
            renderFollowingList();
        });
    });
}

// 角色 Ins 主页（参考 Instagram 他人主页模板）
function openIgCharProfile(charId) {
    const c = (db.characters || []).find(x => x.id === charId);
    if (!c) return;
    const stats = igCharStats(c);
    const followed = igIsCharFollowed(c.id);
    const igp = igCharIgProfile(c);
    document.getElementById('ig-char-name-title').textContent = igp.handle;
    document.getElementById('ig-char-profile-body').innerHTML = `
        <div class="ig-char-top">
            <img src="${c.avatar || ''}" class="ig-char-avatar" alt="${igp.name}">
            <div class="ig-char-stats">
                <div class="ig-char-stat name">${igp.name}</div>
                <div class="ig-char-stats-row">
                    <div class="ig-char-stat"><b>${stats.posts}</b><span>帖子</span></div>
                    <div class="ig-char-stat"><b>${igFmtNum(stats.followers)}</b><span>粉丝</span></div>
                    <div class="ig-char-stat"><b>${stats.following}</b><span>关注</span></div>
                </div>
            </div>
        </div>
        <div class="ig-char-bio">${igp.bio}</div>
        <div class="ig-char-btns">
            <button class="ig-char-follow-btn ${followed ? 'followed' : ''}" id="ig-char-follow-btn">${followed ? '已关注' : '关注'}</button>
            <button class="ig-char-msg-btn" id="ig-char-msg-btn">发消息</button>
            <button class="ig-char-more-btn" title="推荐用户">
                <svg viewBox="0 0 24 24" style="width:20px;height:20px;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><path d="M18 8v6M15 11h6"/></svg>
            </button>
        </div>
        <div class="ig-char-tabs">
            <div class="ig-char-tab active"><svg viewBox="0 0 24 24" style="width:22px;height:22px;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></div>
            <div class="ig-char-tab"><svg viewBox="0 0 24 24" style="width:22px;height:22px;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 9l5 3-5 3z"/></svg></div>
            <div class="ig-char-tab"><svg viewBox="0 0 24 24" style="width:22px;height:22px;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M4 9v10h16V9M2 9h20l-2-5H4z"/><path d="M9 13h6"/></svg></div>
            <div class="ig-char-tab"><svg viewBox="0 0 24 24" style="width:22px;height:22px;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.5 3.5-5.5 7-5.5s6.2 2 7 5.5"/></svg></div>
        </div>
        <div class="ig-char-grid"><div style="grid-column:1/-1;text-align:center;color:#8e8e8e;font-size:13px;padding:50px 20px;">暂无帖子</div></div>`;
    document.getElementById('ig-char-follow-btn')?.addEventListener('click', () => {
        igToggleCharFollow(c.id);
        openIgCharProfile(c.id);
    });
    document.getElementById('ig-char-msg-btn')?.addEventListener('click', () => showToast('发消息功能即将上线'));
    document.querySelector('#ig-char-profile-body .ig-char-more-btn')?.addEventListener('click', () => openIgCharSettings(c));
    switchScreen('ig-char-profile-screen');
}

// 角色右上角 ••• → 角色 Ins 设置弹窗（昵称 / 签名 / 粉丝数 / 关注数）
function openIgCharSettings(c) {
    const stats = igCharStats(c);
    const igp = igCharIgProfile(c);
    const ov = (db.igCharProfiles && db.igCharProfiles[c.id]) || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-window" style="width:320px;max-width:88%;border-radius:20px;padding:20px;box-sizing:border-box;">
            <h3 style="margin:0 0 16px;font-size:16px;color:#1a1a1a;text-align:center;">角色 Ins 设置</h3>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <label style="display:block;">
                    <span style="font-size:12px;color:#8e8e8e;">Ins 账号（默认为微信备注）</span>
                    <input id="ig-char-set-handle" type="text" maxlength="20" value="${igp.handle}" style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;">
                </label>
                <label style="display:block;">
                    <span style="font-size:12px;color:#8e8e8e;">Ins 昵称</span>
                    <input id="ig-char-set-name" type="text" maxlength="20" value="${igp.name}" style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;">
                </label>
                <label style="display:block;">
                    <span style="font-size:12px;color:#8e8e8e;">个人签名</span>
                    <textarea id="ig-char-set-bio" rows="2" maxlength="80" style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;resize:none;box-sizing:border-box;outline:none;font-family:inherit;">${ov.bio !== undefined ? ov.bio : ((c.persona || '').slice(0, 40))}</textarea>
                </label>
                <div style="display:flex;gap:10px;">
                    <label style="flex:1;display:block;">
                        <span style="font-size:12px;color:#8e8e8e;">帖子数（实际发帖 ${stats.posts}）</span>
                        <input id="ig-char-set-posts" type="number" min="0" value="${stats.posts}" disabled style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;background:#f5f5f5;color:#999;">
                    </label>
                    <label style="flex:1;display:block;">
                        <span style="font-size:12px;color:#8e8e8e;">粉丝数</span>
                        <input id="ig-char-set-followers" type="number" min="0" value="${stats.followers}" style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;">
                    </label>
                    <label style="flex:1;display:block;">
                        <span style="font-size:12px;color:#8e8e8e;">关注数</span>
                        <input id="ig-char-set-following" type="number" min="0" value="${stats.following}" style="width:100%;margin-top:4px;padding:9px 12px;border:1px solid #dbdbdb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;">
                    </label>
                </div>
                <div style="display:block;">
                    <span style="font-size:12px;color:#8e8e8e;">发帖热度等级</span>
                    <div id="ig-char-set-heat" style="display:flex;gap:8px;margin-top:6px;">
                        <button type="button" data-tier="unknown" style="flex:1;padding:9px 0;border:1px solid #dbdbdb;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;">默默无闻</button>
                        <button type="button" data-tier="rising" style="flex:1;padding:9px 0;border:1px solid #dbdbdb;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;">小红</button>
                        <button type="button" data-tier="top" style="flex:1;padding:9px 0;border:1px solid #dbdbdb;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;">顶流</button>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:18px;">
                <button id="ig-char-set-cancel" style="flex:1;padding:10px 0;border:none;border-radius:12px;background:#efefef;color:#1a1a1a;font-size:14px;cursor:pointer;">取消</button>
                <button id="ig-char-set-save" style="flex:1;padding:10px 0;border:none;border-radius:12px;background:#3897f0;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    // 热度等级按钮：回显当前档位（默认默默无闻）+ 点击切换
    const heatBtns = overlay.querySelectorAll('#ig-char-set-heat button');
    const paintHeat = () => {
        heatBtns.forEach(b => {
            const active = b.dataset.tier === overlay.dataset.heatTier;
            b.style.background = active ? '#1a1a1a' : '#fff';
            b.style.color = active ? '#fff' : '#1a1a1a';
            b.style.borderColor = active ? '#1a1a1a' : '#dbdbdb';
        });
    };
    overlay.dataset.heatTier = ov.heatLevel || 'unknown';
    paintHeat();
    heatBtns.forEach(b => b.addEventListener('click', () => { overlay.dataset.heatTier = b.dataset.tier; paintHeat(); }));
    const close = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 200);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#ig-char-set-cancel').addEventListener('click', close);
    overlay.querySelector('#ig-char-set-save').addEventListener('click', () => {
        const handle = overlay.querySelector('#ig-char-set-handle').value.trim();
        const name = overlay.querySelector('#ig-char-set-name').value.trim();
        const bio = overlay.querySelector('#ig-char-set-bio').value.trim();
        const posts = parseInt(overlay.querySelector('#ig-char-set-posts').value, 10);
        const followers = parseInt(overlay.querySelector('#ig-char-set-followers').value, 10);
        const following = parseInt(overlay.querySelector('#ig-char-set-following').value, 10);
        if (!db.igCharProfiles) db.igCharProfiles = {};
        db.igCharProfiles[c.id] = {
            ...(db.igCharProfiles[c.id] || {}),
            handle: handle || undefined,
            name: name || undefined,
            bio: bio,
            posts: isNaN(posts) ? undefined : posts,
            followers: isNaN(followers) ? undefined : followers,
            following: isNaN(following) ? undefined : following,
            heatLevel: overlay.dataset.heatTier || 'unknown'
        };
        if (typeof saveData === 'function') saveData();
        close();
        openIgCharProfile(c.id);
        showToast('已保存');
    });
}

function renderInstagramPosts() {
    const feed = document.getElementById('ig-posts-feed');
    if (!feed) return;
    const info = igGetMyInfo();
    const myName = info.handle;
    const myAvatar = info.avatar;
    const myPosts = igEnsureCounts();
    // 合并角色帖子：db.igCharPosts 展平，按时间倒序混入 feed
    const charPostList = [];
    Object.keys(db.igCharPosts || {}).forEach(cid => {
        const c = (db.characters || []).find(x => x.id === cid);
        if (!c) return;
        (db.igCharPosts[cid] || []).forEach(p => {
            charPostList.push({ ...p, _author: { name: c.remarkName || c.name, avatar: c.avatar || IG_DEFAULT_AVATAR }, _charId: cid, isChar: true });
        });
    });
    const allPosts = [
        ...myPosts.map(p => ({ ...p, _author: { name: myName, avatar: myAvatar }, isChar: false })),
        ...charPostList
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (allPosts.length === 0) {
        feed.innerHTML = '<div style="text-align:center;color:#999;font-size:13px;padding:40px 20px;">还没有帖子，点左上角相机发布第一条吧</div>';
        return;
    }
    feed.innerHTML = allPosts.map(post => `
        <div class="ig-post" data-post-id="${post.id}" ${post.isChar ? `data-char-id="${post._charId}"` : ''}>
            <div class="ig-post-header" ${post.isChar ? 'style="cursor:pointer;"' : ''}>
                <img src="${post._author.avatar || IG_DEFAULT_AVATAR}" class="ig-post-avatar" alt="${igEscapeHtml(post._author.name)}">
                <span class="ig-post-name">${igEscapeHtml(post._author.name)}</span>
                <button class="ig-post-dots" title="更多">•••</button>
            </div>
            <img src="${post.img}" class="ig-post-img" alt="帖子图片">
            <div class="ig-post-actions">
                <div class="ig-post-actions-left">
                    <button class="ig-post-icon ig-post-like">${IG_ICONS.heart}</button>
                    <span class="ig-post-count">${post.counts ? igFmtNum(post.counts.likes) : ''}</span>
                    <button class="ig-post-icon ig-post-comment">${IG_ICONS.comment}</button>
                    <span class="ig-post-count">${post.counts ? igFmtNum(post.counts.comments) : ''}</span>
                    <button class="ig-post-icon ig-post-repost">${IG_ICONS.repost}</button>
                    <span class="ig-post-count">${post.counts ? igFmtNum(post.counts.reposts) : ''}</span>
                    <button class="ig-post-icon ig-post-send">${IG_ICONS.send}</button>
                    <span class="ig-post-count">${post.counts ? igFmtNum(post.counts.recommends) : ''}</span>
                </div>
                <button class="ig-post-icon ig-post-save">${IG_ICONS.bookmark}</button>
            </div>
            ${post.desc ? `<div class="ig-post-desc"><span class="ig-post-desc-name">${igEscapeHtml(post._author.name)}</span>${igEscapeHtml(post.desc)}</div>` : ''}
            <div class="ig-post-time">${igFormatTime(post.timestamp || Date.now())}</div>
        </div>`).join('');
    // 交互：点赞 / 收藏
    feed.querySelectorAll('.ig-post').forEach(card => {
        const id = card.dataset.postId;
        const isChar = !!card.dataset.charId;
        const likeBtn = card.querySelector('.ig-post-like');
        const saveBtn = card.querySelector('.ig-post-save');
        if (igLikedPosts.has(id)) { likeBtn.classList.add('liked'); likeBtn.querySelector('svg').setAttribute('fill', '#ff3040'); }
        if (igSavedPosts.has(id)) { saveBtn.classList.add('saved'); saveBtn.querySelector('svg').setAttribute('fill', '#1a1a1a'); }
        likeBtn.addEventListener('click', () => {
            const svg = likeBtn.querySelector('svg');
            if (igLikedPosts.has(id)) { igLikedPosts.delete(id); svg.setAttribute('fill', 'none'); likeBtn.classList.remove('liked'); }
            else { igLikedPosts.add(id); svg.setAttribute('fill', '#ff3040'); likeBtn.classList.add('liked'); }
        });
        saveBtn.addEventListener('click', () => {
            const svg = saveBtn.querySelector('svg');
            if (igSavedPosts.has(id)) { igSavedPosts.delete(id); svg.setAttribute('fill', 'none'); saveBtn.classList.remove('saved'); }
            else { igSavedPosts.add(id); svg.setAttribute('fill', '#1a1a1a'); saveBtn.classList.add('saved'); }
        });
        card.querySelector('.ig-post-comment').addEventListener('click', () => igOpenComments(id));
        card.querySelector('.ig-post-repost').addEventListener('click', () => showToast('转发功能即将上线'));
        card.querySelector('.ig-post-send').addEventListener('click', () => showToast('分享给好友功能即将上线'));
        // 角色帖子：点头像/名字进角色主页
        if (isChar) {
            card.querySelector('.ig-post-header').addEventListener('click', () => openIgCharProfile(card.dataset.charId));
        }
        card.querySelector('.ig-post-dots').addEventListener('click', () => {
            if (!confirm('删除这条帖子？')) return;
            if (isChar) {
                const cid = card.dataset.charId;
                if (db.igCharPosts && Array.isArray(db.igCharPosts[cid])) {
                    db.igCharPosts[cid] = db.igCharPosts[cid].filter(p => p.id !== id);
                    saveData();
                }
            } else {
                igSavePosts(igGetPosts().filter(p => p.id !== id));
            }
            renderInstagramPosts();
            showToast('已删除');
        });
    });
}

// ===== Ins 评论系统：数据结构 + 半屏评论弹窗 =====
// 评论存在帖子对象上：post.comments = [{id, who:'user'|'char'|'stranger', charId, name, avatar, text, timestamp, likes, liked, replies:[{...同结构无replies}]}]
const IG_DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#e2e5e9"/><circle cx="32" cy="25" r="11" fill="#fff"/><path d="M10 58c3-12 12-17 22-17s19 5 22 17z" fill="#fff"/></svg>');
const IG_COMMENT_HEART_SVG = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;" fill="none" stroke="#1a1a1a" stroke-width="1.8"><path d="M12 21c-5.2-3.6-9-6.9-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4.1-3.8 7.4-9 11z"/></svg>';
function igEscapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function igOpenComments(postId) {
    // 避免重复打开
    document.querySelector('.ig-cmt-overlay')?.remove();
    // 用户帖子和角色帖子统一查找
    let found = null;
    const myPostsArr = igGetPosts();
    let post = myPostsArr.find(p => p.id === postId);
    if (post) {
        found = { post, save: () => igSavePosts(myPostsArr) };
    } else {
        for (const cid of Object.keys(db.igCharPosts || {})) {
            const arr = db.igCharPosts[cid];
            const cp = arr.find(p => p.id === postId);
            if (cp) { found = { post: cp, save: () => saveData() }; break; }
        }
    }
    if (!found) return;
    post = found.post;
    if (!Array.isArray(post.comments)) post.comments = [];

    const my = igGetMyInfo();
    const overlay = document.createElement('div');
    overlay.className = 'ig-cmt-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.35);z-index:120;display:flex;align-items:flex-end;';
    overlay.innerHTML = `
        <div class="ig-cmt-sheet" style="width:100%;height:62vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform .3s cubic-bezier(.32,.72,.32,1);box-sizing:border-box;">
            <div style="flex:none;padding:8px 14px 10px;position:relative;">
                <div style="width:36px;height:4px;border-radius:2px;background:#e4e4e8;margin:0 auto;"></div>
                <div style="text-align:center;font-size:14px;font-weight:600;color:#1a1a1a;margin-top:8px;">评论</div>
                <button class="ig-cmt-close" style="position:absolute;right:14px;top:24px;background:none;border:none;font-size:15px;color:#8e8e8e;cursor:pointer;">✕</button>
            </div>
            <div class="ig-cmt-list" style="flex:1;overflow-y:auto;padding:2px 16px 10px;-webkit-overflow-scrolling:touch;"></div>
            <div class="ig-cmt-inputbar" style="flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #f0f0f0;background:#fff;">
                <img class="ig-cmt-my-avatar" src="${my.avatar || IG_DEFAULT_AVATAR}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex:none;">
                <input class="ig-cmt-input" type="text" placeholder="添加评论…" style="flex:1;min-width:0;padding:10px 14px;border:none;background:#f2f3f5;border-radius:20px;font-size:14px;outline:none;color:#1a1a1a;">
                <button class="ig-cmt-send" style="flex:none;border:none;background:none;color:#e1306c;font-size:14px;font-weight:600;cursor:pointer;display:none;">发布</button>
            </div>
        </div>`;
    document.getElementById('instagram-screen').appendChild(overlay);

    const sheet = overlay.querySelector('.ig-cmt-sheet');
    const listEl = overlay.querySelector('.ig-cmt-list');
    const inputEl = overlay.querySelector('.ig-cmt-input');
    const sendBtn = overlay.querySelector('.ig-cmt-send');
    let replyTarget = null; // 当前回复的评论对象
    let kbOffset = 0;

    const applyTransform = () => { sheet.style.transform = `translateY(${kbOffset > 5 ? -kbOffset : 0}px)`; };
    requestAnimationFrame(() => applyTransform());

    // 键盘适配：键盘弹出时弹窗整体上移，避免输入框被遮挡
    const vv = window.visualViewport;
    const onVvResize = () => { if (!vv) return; kbOffset = window.innerHeight - vv.height; applyTransform(); listEl.scrollTop = listEl.scrollHeight; };
    vv?.addEventListener('resize', onVvResize);

    const save = found.save;

    const heartHtml = (c) => `<span class="ig-cmt-like" data-cid="${c.id}" data-rid="${c.rid || ''}" style="flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;cursor:pointer;min-width:18px;">
            <span style="display:block;transform:scale(${c.liked ? '1.15' : '1'});">${IG_COMMENT_HEART_SVG.replace('fill="none" stroke="#1a1a1a"', `fill="${c.liked ? '#ff3040' : 'none'}" stroke="${c.liked ? '#ff3040' : '#1a1a1a'}"`)}</span>
            ${c.likes > 0 ? `<span style="font-size:11px;color:#8e8e8e;">${igFmtNum(c.likes)}</span>` : ''}
        </span>`;

    const rowHtml = (c, isReply) => `
        <div data-ig-row data-who="${c.who || 'user'}" data-del-cid="${c.id}" data-del-rid="${c.rid || ''}" style="display:flex;gap:10px;padding:10px 0;${isReply ? 'margin-left:42px;padding:6px 0;' : ''}">
            <img src="${c.avatar || IG_DEFAULT_AVATAR}" style="width:${isReply ? 24 : 34}px;height:${isReply ? 24 : 34}px;border-radius:50%;object-fit:cover;flex:none;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${igEscapeHtml(c.name)}</div>
                <div style="font-size:14px;color:#1a1a1a;line-height:1.45;word-break:break-word;">${isReply && c.pname ? `<span style="color:#385185;font-weight:500;">@${igEscapeHtml(c.pname)}</span> ` : ''}${igEscapeHtml(c.text)}</div>
                <div style="display:flex;align-items:center;gap:14px;margin-top:3px;font-size:12px;color:#a0a0a8;">
                    <span>${igFormatTime(c.timestamp)}</span>
                    ${!isReply ? '<span class="ig-cmt-reply" data-cid="' + c.id + '" style="cursor:pointer;font-weight:500;">回复</span>' : ''}
                </div>
            </div>
            ${heartHtml(c)}
        </div>`;

    const renderList = () => {
        if (!post.comments.length) {
            listEl.innerHTML = '<div style="text-align:center;color:#b0b0b8;font-size:13px;padding:56px 20px;">暂无评论，快来抢沙发～</div>';
            return;
        }
        listEl.innerHTML = post.comments.map(c =>
            rowHtml(c, false) + (c.replies || []).map(r => rowHtml({ ...r, rid: c.id, pname: c.name }, true)).join('')
        ).join('');
        listEl.querySelectorAll('.ig-cmt-like').forEach(el => {
            el.addEventListener('click', () => {
                const cid = el.dataset.cid, rid = el.dataset.rid;
                const parent = post.comments.find(x => x.id === cid);
                const item = rid ? (parent?.replies || []).find(x => x.id === rid) : parent;
                if (!item) return;
                item.liked = !item.liked;
                item.likes = Math.max(0, (item.likes || 0) + (item.liked ? 1 : -1));
                save(); renderList();
            });
        });
        listEl.querySelectorAll('.ig-cmt-reply').forEach(el => {
            el.addEventListener('click', () => {
                const parent = post.comments.find(x => x.id === el.dataset.cid);
                if (!parent) return;
                replyTarget = parent;
                inputEl.placeholder = `回复 @${parent.name}：`;
                inputEl.focus();
            });
        });
        // 长按删除角色/路人评论（含其楼中楼）
        listEl.querySelectorAll('[data-ig-row]').forEach(el => {
            const who = el.dataset.who;
            if (who !== 'char' && who !== 'stranger') return;
            let pressTimer = null;
            const start = () => {
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    if (confirm('删除这条评论？')) {
                        const cid = el.dataset.delCid, rid = el.dataset.delRid;
                        if (rid) {
                            const parent = post.comments.find(x => x.id === rid);
                            if (parent) parent.replies = (parent.replies || []).filter(x => x.id !== cid);
                        } else {
                            post.comments = post.comments.filter(x => x.id !== cid);
                        }
                        save();
                        renderList();
                        showToast('已删除');
                    }
                }, 600);
            };
            const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
            el.addEventListener('touchstart', start, { passive: true });
            el.addEventListener('touchend', cancel);
            el.addEventListener('touchmove', cancel);
            el.addEventListener('mousedown', start);
            el.addEventListener('mouseup', cancel);
            el.addEventListener('mouseleave', cancel);
            el.addEventListener('contextmenu', (e) => e.preventDefault());
        });
    };
    renderList();

    // 输入框有内容时显示"发布"
    inputEl.addEventListener('input', () => { sendBtn.style.display = inputEl.value.trim() ? 'block' : 'none'; });
    inputEl.addEventListener('focus', () => { setTimeout(() => { onVvResize(); }, 150); });

    const doSend = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        const base = { who: 'user', name: my.handle || my.name || '我', avatar: my.avatar || '', text, timestamp: Date.now(), likes: 0, liked: false };
        let target;
        if (replyTarget && post.comments.includes(replyTarget)) {
            if (!Array.isArray(replyTarget.replies)) replyTarget.replies = [];
            replyTarget.replies.push({ id: 'c_' + Date.now(), ...base });
            target = replyTarget;
        } else {
            target = { id: 'c_' + Date.now(), ...base, replies: [] };
            post.comments.push(target);
        }
        replyTarget = null;
        inputEl.placeholder = '添加评论…';
        inputEl.value = '';
        sendBtn.style.display = 'none';
        save();
        renderList();
        listEl.scrollTop = listEl.scrollHeight;
        // 触发回复：角色帖新评论 → 楼主回复+50%路人（任务3）；回复已有评论/继续对话 → 连续回复链（任务4）
        if (post.charId !== undefined && t.who === 'user' && !(t.replies || []).length) {
            setTimeout(() => igTriggerCharPostReply(post, t, listEl), 800);
        } else {
            setTimeout(() => igChainReply(post, t, listEl), 800);
        }
    };
    sendBtn.addEventListener('click', doSend);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

    const close = () => {
        vv?.removeEventListener('resize', onVvResize);
        window.__igSheet = null;
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('.ig-cmt-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // 弹窗注册表：定时器插入角色评论时若该帖弹窗正开着，就刷新列表
    window.__igSheet = { postId: post.id, rerender: renderList };

    // 路人评论：打开时若开启且未生成过 → 立即生成，排在最上面
    igMaybeGenerateStrangers(post, listEl, renderList, save);
    // 角色评论：补偿到期的 pending → 调度未来的 → 首次生成 pending 队列
    igResumePostPendingChars(post, renderList, save);
    igMaybeGenerateCharComments(post, listEl, renderList, save);
}

// 路人评论生成（任务4）：按设置条数区间调 API，昵称/语气由提示词控制，立即生成插到评论最上方
// 角色帖子不走路人开关：其评论区由发帖引擎自动生成（任务2），这里只负责触发补生成
async function igMaybeGenerateStrangers(post, listEl, rerender, save) {
    if (post.charId !== undefined) { igBackfillCharPostComments(post, listEl); return; }
    const s = igGetCommentSettings();
    if (!s.strangerEnabled) return;
    if (!Array.isArray(post.comments)) post.comments = [];
    if (post.strangersDone || post.comments.some(c => c.who === 'stranger')) return;
    const count = s.strangerMin + Math.floor(Math.random() * (s.strangerMax - s.strangerMin + 1));
    if (count <= 0) { post.strangersDone = true; save(); return; }

    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) return; // 未配置 API 时静默跳过，等配置后再生成

    // 生成中状态（插在列表最上面；后台模式无列表则跳过）
    let loadingEl = null;
    if (listEl) {
        loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'text-align:center;color:#b0b0b8;font-size:12.5px;padding:14px 0;';
        loadingEl.textContent = '路人评论生成中…';
        listEl.prepend(loadingEl);
    }

    const prompt = `请为一条 Instagram 帖子生成 ${count} 条路人评论。
【帖子内容】${post.desc ? post.desc : '（图片帖子，无文案）'}
${s.strangerPrompt ? `【路人设定】${s.strangerPrompt}` : '【路人设定】普通的 Instagram 用户，昵称随机自然，评论简短口语化。'}
【要求】
1. 每条评论包含 name（昵称）和 text（评论内容，1~15个字，像真实网友）
2. 评论要自然多样：夸赞、玩梗、提问、纯表情均可
3. 只输出 JSON 数组，格式：[{"name":"昵称","text":"评论内容"}]，不要任何其他解释文字`;

    let requestBody, endpoint, headers;
    if (provider === 'gemini') {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        requestBody = {
            model: model,
            messages: [
                { role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' },
                { role: 'user', content: prompt }
            ],
            temperature: 1.0
        };
    }

    try {
        let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const m = content.match(/\[[\s\S]*\]/);
        const arr = JSON.parse(m ? m[0] : content);
        const now = Date.now();
        const strangers = (Array.isArray(arr) ? arr : []).filter(x => x && (x.text || x.content)).slice(0, count).map((x, i) => ({
            id: 'c_' + now + '_s' + i,
            who: 'stranger',
            name: String(x.name || '用户').slice(0, 20),
            avatar: '',
            text: String(x.text || x.content),
            timestamp: now - Math.floor((Math.random() * 71 + 1)) * 3600000 - Math.floor(Math.random() * 3600000),
            likes: Math.floor(Math.random() * 40),
            liked: false
        }));
        if (!strangers.length) throw new Error('empty');
        post.comments = strangers.concat(post.comments);
        post.strangersDone = true;
        save();
        loadingEl?.remove();
        rerender?.();
    } catch (err) {
        loadingEl?.remove();
        if (listEl) showToast('路人评论生成失败');
    }
}

// ===== 任务5：点赞数分层细化 + IG格式 =====
// 按帖子楼主的热度决定评论/回复的点赞数区间（角色帖看角色热度，用户帖看自己热度）
function igReplyLikeBase(post) {
    let tier = 'unknown';
    if (post.charId !== undefined) {
        tier = (db.igCharProfiles && db.igCharProfiles[post.charId] && db.igCharProfiles[post.charId].heatLevel) || 'unknown';
    } else {
        tier = (db.igProfile && db.igProfile.popularity) || 'unknown';
    }
    if (tier === 'top') return [80, 6000];
    if (tier === 'rising') return [20, 800];
    return [0, 12];
}
function igRandReplyLike(post, scale = 1) {
    const [a, b] = igReplyLikeBase(post);
    return Math.floor(igRandInt(a, b) * scale);
}

// ===== 任务2：角色发帖自动生成评论区（5~10条路人 + 路人互评楼中楼 + 点赞按热度分层） =====
// 角色帖子的路人评论统一由本函数负责（发帖时生成、打开评论区时补生成），不受全局"路人评论"开关限制
async function igGenerateCharPostComments(charId, post, listEl) {
    const c = (db.characters || []).find(x => x.id === charId);
    if (!c || !post) return;
    if (!Array.isArray(post.comments)) post.comments = [];
    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) return; // 未配置 API 静默跳过，打开评论区时会重试

    const heat = (db.igCharProfiles && db.igCharProfiles[charId] && db.igCharProfiles[charId].heatLevel) || 'unknown';
    const heatDesc = heat === 'top' ? '顶流（几十万到几百万粉丝，评论区非常热闹）' : heat === 'rising' ? '小红（一万到十万粉丝，评论区较活跃）' : '默默无闻（几百粉丝以内，评论区冷清）';
    const likeRange = heat === 'top' ? '200~50000' : heat === 'rising' ? '30~3000' : '0~30';
    const s = igGetCharPostSetting(charId);
    const fanPrompt = s.fanPrompt || '普通社交平台用户：路人随意自然，有夸赞、玩梗、提问、闲聊，小部分互相回复';
    const count = 5 + Math.floor(Math.random() * 6); // 5~10

    const loadingEl = (() => {
        if (!listEl) return null;
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center;color:#b0b0b8;font-size:12.5px;padding:14px 0;';
        el.textContent = '评论区生成中…';
        listEl.prepend(el);
        return el;
    })();

    const prompt = `请为一个 Instagram 帖子的评论区生成路人评论。
【楼主】${c.remarkName || c.name}（${heatDesc}）
人设：${(c.persona || '').slice(0, 200)}
【帖子文案】${post.desc || '（图片帖子，无文案）'}
【评论区路人设定】${fanPrompt}
【要求】
1. 生成 ${count} 条路人评论，模拟真实 Instagram 评论区氛围
2. 路人是平台陌生大众，不是楼主好友；语气自然多样（夸赞/玩梗/提问/闲聊/纯表情），与帖子内容相关
3. 允许路人之间互动：部分评论可回复其他路人，在 replyTo 填对方评论的 idx（从0开始的序号）；大部分评论 replyTo 为 -1
4. likes 为该条评论的点赞数（${likeRange} 之间的数字）
5. 只输出 JSON 数组：[{"idx":0,"name":"昵称","text":"评论","likes":123,"replyTo":-1}]，不要任何解释`;

    let requestBody, endpoint, headers;
    if (provider === 'gemini') {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        requestBody = { model, messages: [{ role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' }, { role: 'user', content: prompt }], temperature: 1.0 };
    }

    try {
        let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const m = content.match(/\[[\s\S]*\]/);
        const arr = JSON.parse(m ? m[0] : content);
        if (!Array.isArray(arr)) throw new Error('empty');

        const mkComment = (name, text, likes, ts) => ({
            id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
            who: 'stranger', name: String(name || '用户').slice(0, 20), avatar: '',
            text: String(text || '').slice(0, 120), timestamp: ts,
            likes: Math.max(0, Math.floor(Number(likes) || 0)), liked: false, replies: []
        });
        const built = [];
        arr.forEach((x, i) => {
            if (!x || (!x.text && !x.content)) return;
            const ts = post.timestamp + (5 * 60000) + Math.floor(Math.random() * 23 * 3600000); // 发帖后5分钟~23小时
            const item = mkComment(x.name, x.text || x.content, x.likes, ts);
            const rt = parseInt(x.replyTo, 10);
            if (!isNaN(rt) && rt >= 0 && rt < built.length) {
                // 回复其他路人：楼中楼，时间晚于被回复者
                item.timestamp = built[rt].timestamp + 60000 + Math.floor(Math.random() * 2 * 3600000);
                built[rt].replies.push(item);
            } else {
                built.push(item);
            }
        });
        if (!built.length) throw new Error('empty');
        post.comments = post.comments.concat(built);
        post.strangersDone = true;
        saveData();
        loadingEl?.remove();
        if (window.__igSheet && window.__igSheet.postId === post.id) window.__igSheet.rerender();
    } catch (err) {
        loadingEl?.remove();
        if (listEl) showToast('评论区生成失败');
    }
}

// 角色帖子打开评论区时若无路人评论 → 后台补生成
function igBackfillCharPostComments(post, listEl) {
    if (post.charId === undefined) return;
    if (post.strangersDone || (post.comments || []).some(x => x.who === 'stranger')) return;
    igGenerateCharPostComments(post.charId, post, listEl);
}

// ===== 任务3：我们评论角色帖子 → 楼主角色回复我们 + 50%概率路人插话 + 角色按人设选择性回复路人 =====
async function igTriggerCharPostReply(post, userComment, listEl) {
    if (post.charId === undefined || !userComment) return;
    const c = (db.characters || []).find(x => x.id === post.charId);
    if (!c) return;
    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) return;
    const s = igGetCharPostSetting(post.charId);
    const fanPrompt = s.fanPrompt || '普通社交平台用户：语气随意自然';

    // 上下文：这条评论下的现有对话 + 评论区其他路人 + 角色人设/世界书 + 聊天记录
    const threadText = (userComment.replies || [])
        .map(r => `${r.who === 'user' ? '我' : r.name}: ${r.text}`).join('\n');
    const strangers = (post.comments || []).filter(x => x.who === 'stranger').slice(0, 4)
        .map((x, i) => `${i + 1}. ${x.name}：${x.text}`).join('\n');
    const wbs = (c.worldBookIds || []).map(id => db.worldBooks?.find(wb => wb.id === id)).filter(Boolean).map(wb => wb.content).join('\n').slice(0, 200);
    const history = (c.history || []).slice(-10)
        .filter(m => m && typeof m.content === 'string' && m.content.trim() && !m.isThinking)
        .map(m => `${m.role === 'user' ? '用户' : (c.remarkName || c.name)}: ${m.content.replace(/<[^>]+>/g, '').slice(0, 60)}`)
        .join('\n');

    const prompt = `Instagram 帖子评论区场景。
【楼主】${c.remarkName || c.name}
人设：${(c.persona || '').slice(0, 250)}
${wbs ? `相关设定：${wbs}` : ''}
${history ? `你和用户的聊天记录（供了解你们的关系）：\n${history}` : ''}
【帖子文案】${post.desc || '（图片帖子，无文案）'}
【评论区路人设定】${fanPrompt}
【评论区其他路人评论】${strangers || '（暂无）'}
【我（用户）刚刚评论了】"${userComment.text}"
${threadText ? `【这条评论下已有的对话】\n${threadText}` : ''}

【要求】
1. charReply：楼主对我的评论的回复（符合人设、口语化、30字以内，简单评论就简短回复甚至只回emoji）
2. charFanReplies：楼主根据人设自行决定是否顺便回复评论区里的其他路人（0~2条，可以完全不回）；每条含 name（必须是上面列出的路人昵称）和 text
3. fanReplies：路人看到我的评论后对我的插话（0~2条，陌生人语气、不认识我）；每条含 name（新路人昵称）和 text
4. 只输出 JSON：{"charReply":"...","charFanReplies":[],"fanReplies":[]}，不要任何解释`;

    // 生成中提示（列表底部）
    const loadingEl = document.createElement('div');
    if (listEl) {
        loadingEl.style.cssText = 'text-align:center;color:#b0b0b8;font-size:12.5px;padding:12px 0;';
        loadingEl.textContent = '正在回复…';
        listEl.appendChild(loadingEl);
        listEl.scrollTop = listEl.scrollHeight;
    }

    const pushReply = (target, item) => {
        if (!target) return;
        if (!Array.isArray(target.replies)) target.replies = [];
        target.replies.push(item);
    };

    setTimeout(async () => {
        let requestBody, endpoint, headers;
        if (provider === 'gemini') {
            endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
            headers = { 'Content-Type': 'application/json' };
            requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
        } else {
            endpoint = `${url}/v1/chat/completions`;
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
            requestBody = { model, messages: [{ role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' }, { role: 'user', content: prompt }], temperature: 1.0 };
        }
        try {
            let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
            content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
            const m = content.match(/\{[\s\S]*\}/);
            const obj = JSON.parse(m ? m[0] : content);
            let changed = false;
            const mk = (who, name, text, likes) => ({
                id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
                who, name: String(name || '').slice(0, 20), avatar: who === 'char' ? (c.avatar || '') : '',
                text: String(text || '').slice(0, 120), timestamp: Date.now(),
                likes: Math.max(0, Math.floor(Number(likes) || likes)), liked: false
            });

            // 1. 楼主回复我
            const cr = String(obj.charReply || '').trim();
            if (cr) {
                pushReply(userComment, mk('char', c.remarkName || c.name, cr, igRandReplyLike(post, 0.6)));
                changed = true;
            }
            // 2. 楼主选择性回复其他路人（找到对应路人评论挂楼中楼）
            if (Array.isArray(obj.charFanReplies)) {
                obj.charFanReplies.forEach(r => {
                    const t = String(r?.text || '').trim();
                    if (!t) return;
                    const fan = post.comments.filter(x => x.who === 'stranger').find(x => x.name === r.name || x.name.includes(r.name));
                    if (fan) { pushReply(fan, mk('char', c.remarkName || c.name, t, igRandReplyLike(post, 0.6))); changed = true; }
                });
            }
            // 3. 50% 概率路人插话回复我
            if (Math.random() < 0.5 && Array.isArray(obj.fanReplies)) {
                obj.fanReplies.forEach(r => {
                    const t = String(r?.text || '').trim();
                    if (!t) return;
                    pushReply(userComment, mk('stranger', r.name || '网友', t, igRandReplyLike(post)));
                    changed = true;
                });
            }
            if (changed) {
                saveData();
                loadingEl?.remove();
                if (window.__igSheet && window.__igSheet.postId === post.id) window.__igSheet.rerender();
            } else {
                loadingEl?.remove();
            }
        } catch (err) {
            loadingEl?.remove();
            if (listEl) showToast('回复生成失败');
        }
    }, 1200 + Math.floor(Math.random() * 2800));
}

// ===== 任务4：连续回复链（适用所有帖子） =====
// 我们回复某条评论后，对方（角色或路人）继续回复我们；每次我们再发言都再次触发，直到我们停手
// 对方一次可回 1~10 条消息（AI 根据内容决定），模拟真人连续回复
function igChainResolveReplier(post, target) {
    if (target.who === 'stranger') return { kind: 'stranger', name: target.name };
    if (target.who === 'char' || target.charId !== undefined) {
        const cid = target.charId !== undefined ? target.charId : post.charId;
        return { kind: 'char', char: (db.characters || []).find(x => x.id === cid) };
    }
    // target 是我们自己发的评论：从楼中楼里判断最后回复我们的是谁
    const reps = [...(target.replies || [])].reverse();
    const lastCharRep = reps.find(r => r.who === 'char');
    if (lastCharRep) {
        const cid = lastCharRep.charId !== undefined ? lastCharRep.charId : post.charId;
        return { kind: 'char', char: (db.characters || []).find(x => x.id === cid) };
    }
    const lastStranger = reps.find(r => r.who === 'stranger');
    if (lastStranger) return { kind: 'stranger', name: lastStranger.name };
    return null;
}

async function igChainReply(post, target, listEl) {
    const r = igChainResolveReplier(post, target);
    if (!r || (r.kind === 'char' && !r.char)) return;
    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) return;
    const s = post.charId !== undefined ? igGetCharPostSetting(post.charId) : null;
    const fanPrompt = s?.fanPrompt || '普通社交平台用户：语气随意自然';

    // 完整互评对话（按时间顺序）
    const dialog = (target.replies || []).map(x =>
        `${x.who === 'user' ? '我' : x.name}: ${x.text}`).join('\n');
    const myName = r.kind === 'char' ? (r.char.remarkName || r.char.name) : r.name;

    let personaBlock = '';
    if (r.kind === 'char') {
        const c = r.char;
        const wbs = (c.worldBookIds || []).map(id => db.worldBooks?.find(wb => wb.id === id)).filter(Boolean).map(wb => wb.content).join('\n').slice(0, 200);
        const history = (c.history || []).slice(-10)
            .filter(m => m && typeof m.content === 'string' && m.content.trim() && !m.isThinking)
            .map(m => `${m.role === 'user' ? '用户' : (c.remarkName || c.name)}: ${m.content.replace(/<[^>]+>/g, '').slice(0, 60)}`)
            .join('\n');
        personaBlock = `人设：${(c.persona || '').slice(0, 250)}\n${wbs ? `相关设定：${wbs}\n` : ''}${history ? `你和用户的聊天记录（供了解你们的关系）：\n${history}\n` : ''}`;
    }

    const prompt = `Instagram 评论区连续对话场景。
【你的身份】${myName}（楼主是 ${(db.characters || []).find(x => x.id === post.charId)?.remarkName || (db.characters || []).find(x => x.id === post.charId)?.name || '该帖子作者'}）
${personaBlock}${r.kind === 'stranger' ? `路人设定：${fanPrompt}。你是平台陌生人，不认识"我"，语气像普通网友。\n` : ''}
【帖子文案】${post.desc || '（图片帖子，无文案）'}
【这条评论下的完整对话（按顺序）】
${dialog || '（还没有对话，我刚刚评论了）'}

【要求】
1. 你（${myName}）现在回复"我"在这条评论下的最新发言
2. 可以一次发 1~10 条消息，像真人一样根据内容决定（简单回应1条，聊得来就连发几条）
3. 每条简短口语化（30字以内），符合身份
4. 只输出 JSON 数组：[{"text":"..."},{"text":"..."}]，不要任何解释`;

    const loadingEl = document.createElement('div');
    if (listEl) {
        loadingEl.style.cssText = 'text-align:center;color:#b0b0b8;font-size:12.5px;padding:12px 0;';
        loadingEl.textContent = `${myName} 正在回复…`;
        listEl.appendChild(loadingEl);
        listEl.scrollTop = listEl.scrollHeight;
    }

    setTimeout(async () => {
        let requestBody, endpoint, headers;
        if (provider === 'gemini') {
            endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
            headers = { 'Content-Type': 'application/json' };
            requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
        } else {
            endpoint = `${url}/v1/chat/completions`;
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
            requestBody = { model, messages: [{ role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' }, { role: 'user', content: prompt }], temperature: 1.0 };
        }
        try {
            let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
            content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
            const m = content.match(/\[[\s\S]*\]/);
            const arr = JSON.parse(m ? m[0] : content);
            if (!Array.isArray(arr) || !arr.length) throw new Error('empty');
            if (!Array.isArray(target.replies)) target.replies = [];
            arr.forEach((x, i) => {
                const t = String(x?.text || '').trim();
                if (!t) return;
                target.replies.push({
                    id: 'c_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 100000),
                    who: r.kind === 'char' ? 'char' : 'stranger',
                    charId: r.kind === 'char' ? r.char.id : undefined,
                    name: myName, avatar: r.kind === 'char' ? (r.char.avatar || '') : '',
                    text: t.slice(0, 120), timestamp: Date.now() + i,
                    likes: igRandReplyLike(post, r.kind === 'char' ? 0.6 : 1), liked: false
                });
            });
            saveData();
            loadingEl?.remove();
            if (window.__igSheet && window.__igSheet.postId === post.id) window.__igSheet.rerender();
        } catch (err) {
            loadingEl?.remove();
            if (listEl) showToast('回复生成失败');
        }
    }, 1500 + Math.floor(Math.random() * 3500));
}

// ===== 任务5：角色评论生成 + 延时调度 =====
// 首次打开帖子时一次性生成所有角色评论 → 存入 post.pendingChars（含未来发布时间 at）
// 到点后由定时器移入 post.comments（插在路人评论下面）；刷新后由补偿逻辑恢复定时器/补插到期评论

// 把一条 pending 角色评论正式插入 post.comments（排在路人评论块之后）
function igInsertCharComment(post, item) {
    const comment = {
        id: item.id,
        who: 'char',
        charId: item.charId,
        name: item.name,
        avatar: item.avatar || '',
        text: item.text,
        timestamp: Date.now(),
        likes: Math.floor(Math.random() * 30),
        liked: false,
        replies: []
    };
    const idx = post.comments.findIndex(c => c.who !== 'stranger');
    if (idx === -1) post.comments.push(comment);
    else post.comments.splice(idx, 0, comment);
}

// 定时器触发：按帖子 id 重新读取最新数据，从 pending 移入正式评论；若该帖弹窗开着就刷新列表
function igFirePendingChar(postId, item) {
    // 用户帖子和角色帖子统一查找
    let save;
    let post = null;
    const myPostsArr = igGetPosts();
    post = myPostsArr.find(x => x.id === postId);
    if (post) {
        save = () => igSavePosts(myPostsArr);
    } else {
        for (const cid of Object.keys(db.igCharPosts || {})) {
            const arr = db.igCharPosts[cid];
            const cp = arr.find(p => p.id === postId);
            if (cp) { post = cp; save = () => saveData(); break; }
        }
    }
    if (!post) return;
    post.pendingChars = (post.pendingChars || []).filter(p => p.id !== item.id);
    igInsertCharComment(post, item);
    save();
    if (window.__igSheet && window.__igSheet.postId === postId) window.__igSheet.rerender();
}

// 单帖补偿：把已到期的 pending 立即插入，未到期的挂上定时器
function igResumePostPendingChars(post, rerender, save) {
    const pending = post.pendingChars || [];
    if (!pending.length) return;
    const now = Date.now();
    const due = pending.filter(p => p.at <= now);
    const future = pending.filter(p => p.at > now);
    if (due.length) {
        due.forEach(item => igInsertCharComment(post, item));
        post.pendingChars = future;
        save();
        rerender?.();
    }
    future.forEach(item => setTimeout(() => igFirePendingChar(post.id, item), item.at - Date.now()));
}

// 回填：开启角色评论后，给所有还没生成过角色评论的帖子（用户帖+角色帖）补生成；逐帖错开 4 秒防 API 峰值
function igBackfillCharComments() {
    const s = igGetCommentSettings();
    if (!s.charEnabled) return;
    const targets = [];
    igGetPosts().forEach(p => { if (!p.charsDone && !(p.pendingChars?.length)) targets.push(p); });
    Object.values(db.igCharPosts || {}).forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(p => { if (!p.charsDone && !(p.pendingChars?.length)) targets.push(p); });
    });
    targets.forEach((post, i) => {
        setTimeout(() => {
            const alive = igGetPosts().find(x => x.id === post.id) || Object.values(db.igCharPosts || {}).flatMap(a => a).find(x => x.id === post.id);
            if (alive && !alive.charsDone && !(alive.pendingChars?.length)) {
                igMaybeGenerateCharComments(alive, null, () => { if (window.__igSheet) window.__igSheet.rerender(); }, () => saveData());
            }
        }, i * 4000);
    });
    if (targets.length) showToast(`将为 ${targets.length} 条帖子补充角色评论`);
}

// 首次生成角色评论队列（一次性 API 调用生成全部角色的评论）
async function igMaybeGenerateCharComments(post, listEl, rerender, save) {
    const s = igGetCommentSettings();
    if (!s.charEnabled) return;
    if (!Array.isArray(post.comments)) post.comments = [];
    if (post.charsDone || post.pendingChars?.length) return;
    const chars = (db.characters || []).filter(c => c && (c.name || c.remarkName));
    if (!chars.length) { post.charsDone = true; save(); return; }
    const count = s.charMin + Math.floor(Math.random() * (s.charMax - s.charMin + 1));
    if (count <= 0) { post.charsDone = true; save(); return; }

    // 随机挑 count 个不同角色
    const picked = [...chars].sort(() => Math.random() - 0.5).slice(0, count);

    const apiConfig = resolveAuxiliaryApiConfig('instagram');
    const { url, key, model, provider } = apiConfig || {};
    if (!url || !model) return; // 未配置 API 时静默跳过，等配置后再生成

    let loadingEl = null;
    if (listEl) {
        loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'text-align:center;color:#b0b0b8;font-size:12.5px;padding:14px 0;';
        loadingEl.textContent = '角色评论生成中…';
        listEl.prepend(loadingEl);
    }

    // 组装上下文：角色人设 + 绑定世界书 + 最近20条聊天 + 用户人设
    let activePersona = null;
    if (db.activePersonaId) activePersona = (db.myPersonaPresets || []).find(p => p.id === db.activePersonaId);
    if (!activePersona && db.myPersonaPresets?.length) activePersona = db.myPersonaPresets[0];
    const userPersona = activePersona?.persona ? activePersona.persona.slice(0, 200) : '';

    const charBlocks = picked.map((c, i) => {
        const wbs = (c.worldBookIds || []).map(id => db.worldBooks?.find(wb => wb.id === id)).filter(Boolean).map(wb => wb.content).join('\n');
        const history = (c.history || []).slice(-20)
            .filter(m => m && typeof m.content === 'string' && m.content.trim() && !m.isThinking)
            .map(m => `${m.role === 'user' ? '用户' : (c.remarkName || c.name)}: ${m.content.replace(/<[^>]+>/g, '').slice(0, 80)}`)
            .join('\n');
        return `【角色${i + 1}】名字：${c.remarkName || c.name}
人设：${(c.persona || '').slice(0, 200)}${wbs ? `\n相关设定：${wbs.slice(0, 300)}` : ''}${history ? `\n最近聊天记录：\n${history}` : ''}`;
    }).join('\n\n');

    const prompt = `请为一条 Instagram 帖子生成角色评论。以下是你在微信聊天中认识的好友。
【帖子内容】${post.desc ? post.desc : '（图片帖子，无文案）'}
${userPersona ? `【用户形象】${userPersona}\n` : ''}
${charBlocks}

【要求】
1. 每个角色以自己的性格、语气和与用户的关系，给这条帖子写 1 条评论（1~20字，口语化，可以带表情符号）
2. 评论要符合角色人设，像真实好友随手评论
3. 只输出 JSON 数组，格式：[{"name":"角色名","text":"评论内容"}]，不要任何其他解释文字`;

    let requestBody, endpoint, headers;
    if (provider === 'gemini') {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = { contents: [{ role: 'user', parts: [{ text: '你是一个只输出 JSON 数据的 API 接口。' + prompt }] }], generationConfig: { temperature: 1.0 } };
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        requestBody = {
            model: model,
            messages: [
                { role: 'system', content: '你是一个只输出 JSON 数据的 API 接口。' },
                { role: 'user', content: prompt }
            ],
            temperature: 1.0
        };
    }

    try {
        let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        content = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const m = content.match(/\[[\s\S]*\]/);
        const arr = JSON.parse(m ? m[0] : content);
        const now = Date.now();
        const baseDelayH = s.delayMin, spanH = Math.max(0, s.delayMax - s.delayMin);
        const pending = (Array.isArray(arr) ? arr : [])
            .filter(x => x && (x.text || x.content))
            .slice(0, count)
            .map((x, i) => {
                const src = picked.find(c => (c.remarkName || c.name) === x.name) || picked[i % picked.length];
                const delayMs = Math.round((baseDelayH + Math.random() * spanH) * 3600000);
                return {
                    id: 'c_' + now + '_ch' + i,
                    charId: src.id,
                    name: src.remarkName || src.name,
                    avatar: src.avatar || '',
                    text: String(x.text || x.content),
                    at: now + delayMs
                };
            });
        if (!pending.length) throw new Error('empty');
        post.pendingChars = (post.pendingChars || []).concat(pending);
        post.charsDone = true;
        save();
        loadingEl?.remove();
        // 立即补偿到期的 + 为未来的挂定时器
        igResumePostPendingChars(post, rerender, save);
    } catch (err) {
        loadingEl?.remove();
        if (listEl) showToast('角色评论生成失败');
    }
}


function initInstagramNewPost() {
    // 左上角相机图标 → 滑出新帖子页
    document.getElementById('ig-open-newpost')?.addEventListener('click', () => {
        igSelectedPhoto = null;
        const previewImg = document.getElementById('ig-newpost-preview-img');
        if (previewImg) { previewImg.style.display = 'none'; previewImg.src = ''; }
        const editBtn = document.getElementById('ig-newpost-edit');
        if (editBtn) editBtn.style.display = 'none';
        const captionBox = document.getElementById('ig-newpost-caption');
        if (captionBox) captionBox.value = '';
        igRenderGallery();
        switchScreen('ig-new-post-screen');
    });
    // 编辑主页
    document.getElementById('ig-edit-profile-btn')?.addEventListener('click', () => {
        const info = igGetMyInfo();
        document.getElementById('ig-edit-avatar-preview').src = info.avatar;
        document.getElementById('ig-edit-name').value = info.name === 'uwu用户123' ? '' : info.name;
        document.getElementById('ig-edit-handle').value = info.handle === info.name ? '' : info.handle;
        document.getElementById('ig-edit-bio').value = info.bio;
        document.getElementById('ig-edit-followers').value = info.followers;
        document.getElementById('ig-edit-following').value = info.following;
        const tier = (db.igProfile && db.igProfile.popularity) || 'unknown';
        document.querySelectorAll('#ig-edit-popularity button').forEach(b => {
            const active = b.dataset.tier === tier;
            b.style.background = active ? '#1a1a1a' : '#fff';
            b.style.color = active ? '#fff' : '#1a1a1a';
            b.style.borderColor = active ? '#1a1a1a' : '#dbdbdb';
        });
        switchScreen('ig-edit-profile-screen');
    });
    // 热度等级选择
    document.querySelectorAll('#ig-edit-popularity button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#ig-edit-popularity button').forEach(x => {
                x.style.background = '#fff';
                x.style.color = '#1a1a1a';
                x.style.borderColor = '#dbdbdb';
            });
            b.style.background = '#1a1a1a';
            b.style.color = '#fff';
            b.style.borderColor = '#1a1a1a';
        });
    });
    // 分享主页（占位）
    document.getElementById('ig-share-profile-btn')?.addEventListener('click', () => showToast('分享功能即将上线'));
    // 点粉丝/关注数字 → 关注的人列表
    ['ig-profile-followers-n', 'ig-profile-following-n'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            renderFollowingList();
            switchScreen('ig-following-screen');
        });
    });
    // 更换头像
    const editAvatarInput = document.getElementById('ig-edit-avatar-input');
    const openEditAvatar = () => editAvatarInput?.click();
    document.getElementById('ig-edit-avatar-preview')?.addEventListener('click', openEditAvatar);
    document.getElementById('ig-edit-avatar-hint')?.addEventListener('click', openEditAvatar);
    editAvatarInput?.addEventListener('change', (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const size = Math.min(img.width, img.height);
                const scale = Math.min(1, 400 / size);
                const out = Math.round(size * scale);
                const canvas = document.createElement('canvas');
                canvas.width = out; canvas.height = out;
                canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, out, out);
                document.getElementById('ig-edit-avatar-preview').src = canvas.toDataURL('image/jpeg', 0.85);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
        ev.target.value = '';
    });
    // 保存编辑
    document.getElementById('ig-edit-profile-save')?.addEventListener('click', () => {
        const avatar = document.getElementById('ig-edit-avatar-preview').src;
        const name = document.getElementById('ig-edit-name').value.trim();
        const bio = document.getElementById('ig-edit-bio').value.trim();
        const followers = parseInt(document.getElementById('ig-edit-followers').value, 10);
        const following = parseInt(document.getElementById('ig-edit-following').value, 10);
        const selectedTierBtn = document.querySelector('#ig-edit-popularity button[style*="background: rgb(26, 26, 26)"]');
        const newTier = selectedTierBtn ? selectedTierBtn.dataset.tier : ((db.igProfile && db.igProfile.popularity) || 'unknown');
        const oldTier = (db.igProfile && db.igProfile.popularity) || 'unknown';
        if (newTier !== oldTier) {
            // 热度等级变了，清空旧互动数，按新等级重新生成
            igSavePosts(igGetPosts().map(p => ({ ...p, counts: undefined })));
        }
        const prev = db.igProfile || {};
        const handleVal = document.getElementById('ig-edit-handle').value.trim();
        db.igProfile = {
            name: name || 'uwu用户123',
            handle: handleVal || name || prev.handle || 'uwu用户123',
            avatar: avatar.startsWith('data:') ? avatar : (prev.avatar || ''),
            bio: bio,
            followers: isNaN(followers) ? prev.followers : followers,
            following: isNaN(following) ? prev.following : following,
            popularity: newTier
        };
        if (typeof saveData === 'function') saveData();
        renderInstagramProfile();
        showToast('已保存');
        window.__isBackNavigation = true;
        switchScreen('ig-profile-screen');
        window.__isBackNavigation = false;
    });
    // 底部导航点击（首页 / 我的；其余占位）—— 绑定所有 Instagram 页面的底栏
    document.querySelectorAll('.ig-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nav = btn.dataset.igNav;
            if (nav === 'home') {
                window.__isBackNavigation = true;
                switchScreen('instagram-screen');
                window.__isBackNavigation = false;
            } else if (nav === 'me') {
                renderInstagramProfile();
                switchScreen('ig-profile-screen');
            } else {
                showToast('即将上线');
            }
        });
    });
    // 预览区"编辑"按钮 → 编辑图片描述
    document.getElementById('ig-newpost-edit')?.addEventListener('click', igOpenDescEditor);
    // X 返回
    document.getElementById('ig-newpost-close')?.addEventListener('click', () => {
        window.__isBackNavigation = true;
        switchScreen('instagram-screen');
        window.__isBackNavigation = false;
    });
    // 上传图片
    document.getElementById('ig-newpost-input')?.addEventListener('change', (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                // 居中截成正方形，压缩到 480px 存 localStorage
                const size = Math.min(img.width, img.height);
                const scale = Math.min(1, 480 / size);
                const out = Math.round(size * scale);
                const canvas = document.createElement('canvas');
                canvas.width = out; canvas.height = out;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, out, out);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const photos = igGetPhotos();
                photos.unshift({ img: dataUrl, desc: '' });
                igSavePhotos(photos);
                igSelectedPhoto = dataUrl;
                const previewImg = document.getElementById('ig-newpost-preview-img');
                if (previewImg) { previewImg.src = dataUrl; previewImg.style.display = 'block'; }
                const editBtn = document.getElementById('ig-newpost-edit');
                if (editBtn) editBtn.style.display = 'block';
                igRenderGallery();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
        ev.target.value = '';
    });
    // 发布（文案取自"添加文案"输入框；展示位置待定，先存入帖子列表）
    document.getElementById('ig-newpost-publish')?.addEventListener('click', () => {
        if (!igSelectedPhoto) return showToast('请先选择一张图片');
        const caption = (document.getElementById('ig-newpost-caption')?.value || '').trim();
        const item = igGetPhotos().find(p => p.img === igSelectedPhoto);
        const desc = caption || (item ? (item.desc || '') : '');
        const posts = igGetPosts();
        posts.unshift({ id: 'igpost_' + Date.now(), img: igSelectedPhoto, desc, timestamp: Date.now() });
        localStorage.setItem(IG_POSTS_KEY, JSON.stringify(posts));
        showToast('已发布');
        // 角色评论开启时，2秒后自动为帖子安排角色评论
        if (igGetCommentSettings().charEnabled) setTimeout(() => igBackfillCharComments(), 2000);
        igSelectedPhoto = null;
        const captionBox = document.getElementById('ig-newpost-caption');
        if (captionBox) captionBox.value = '';
        window.__isBackNavigation = true;
        switchScreen('instagram-screen');
        window.__isBackNavigation = false;
    });
}
initInstagramNewPost();
igBindCommentSettings();
igBindGalleryPage();
igBindAutoPostDetail();
igInitAutoPostEngine();
igBindHeartBoost();

// 屏幕切换
const switchScreen = (targetId) => {
    // 记录导航历史：进入新 screen 前把当前 screen 压栈（返回导航时不重复记录；回到主屏幕则清空）
    if (!window.__isBackNavigation) {
        const activeScreen = document.querySelector('.screen.active');
        const currentId = activeScreen ? activeScreen.id : 'home-screen';
        if (targetId === 'home-screen') {
            screenHistory.length = 0;
        } else if (currentId && currentId !== targetId && currentId !== 'home-screen') {
            screenHistory.push(currentId);
            if (screenHistory.length > 30) screenHistory.shift();
        }
    }
    window.__isBackNavigation = false;

    // 离开聊天室时清理自定义样式
    if (targetId !== 'chat-room-screen') {
        const customStyles = document.querySelectorAll('style[id^="custom-bubble-style-for-"]');
        customStyles.forEach(style => style.remove());
        //  Detach fidget effects when leaving chat
        if (typeof fidgetDetach === 'function') {
            fidgetDetach();
        }
        if (window.MieStardust) {
            window.MieStardust.detach();
        }
    } else {
        // 返回聊天室时重新应用样式
        if (typeof currentChatId !== 'undefined' && currentChatId) {
            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            if (chat) {
                updateCustomBubbleStyle(currentChatId, chat.customBubbleCss, chat.useCustomBubbleCss);
            }
        }
    }
    
    // 修复：实时获取所有 screen 元素，确保动态创建的页面也能被正确隐藏
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const targetScreen = document.getElementById(targetId);
    if (targetScreen) targetScreen.classList.add('active');
    
    // 关闭所有覆盖层和侧边栏
    const overlays = document.querySelectorAll('.modal-overlay, .action-sheet-overlay, .settings-sidebar');
    overlays.forEach(o => o.classList.remove('visible', 'open'));
    // 清理上下文菜单
    removeContextMenu();

    // 离开设置页面时清空CSS预览区域，防止预览样式(可能是全局的)污染其他页面
    if (targetId !== 'chat-settings-screen' && targetId !== 'group-settings-screen') {
        const previewContainers = document.querySelectorAll('.bubble-css-preview');
        previewContainers.forEach(el => el.innerHTML = '');
    }

    // 控制全局底栏显示与状态
    const globalNav = document.getElementById('global-bottom-nav');
    if (globalNav) {
        if (targetId === 'chat-list-screen' || targetId === 'contacts-screen' || targetId === 'more-screen' || targetId === 'phone-screen') {
            globalNav.style.display = 'flex';
            // 更新选中状态
            const navItems = globalNav.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.getAttribute('data-target') === targetId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        } else {
            globalNav.style.display = 'none';
        }
    }

    // Instagram 底部导航选中态（目前仅首页有内容，其余页面待扩展）
    if (targetId === 'instagram-screen') {
        document.querySelectorAll('#instagram-screen .ig-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.igNav === 'home');
        });
        renderInstagramStories();
        renderInstagramPosts();
    }

    if (targetId === 'more-screen') {
        renderMoreScreen();
    }

    if (targetId === 'world-book-screen') {
        if (typeof renderWorldBookList === 'function') renderWorldBookList();
    }
};

// 返回上一个页面（左滑手势调用）
const goBackScreen = () => {
    window.__isBackNavigation = true;
    const prev = screenHistory.pop();
    switchScreen(prev || 'home-screen');
};
window.goBackScreen = goBackScreen;

// ===== 右滑返回手势（安卓边缘拖拽风：跟手但只能拖动一点点 + Q弹回弹） =====
// 按住向右拖：页面只被拽动一小段（强阻尼，越拖越拖不动）；松手达到条件 → 页面Q弹归位并返回上一页（新页轻微滑入）
(function () {
    const ENGAGE = 14;          // 起手确认距离（px）
    const MIN_TRIGGER = 90;     // 触发返回所需的手指位移（px）
    const MAXPULL = 56;         // 页面最大被拽动距离（px，渐近值——拖不动的感觉）
    let sx = 0, sy = 0, st = 0, tracking = false, engaged = false, curEl = null;

    const canGoBack = () => {
        const active = document.querySelector('.screen.active');
        if (!active || active.id === 'home-screen') return false; // 主屏幕不触发
        if (active.id === 'chat-room-screen') return false; // 聊天页面不触发
        if (active.id === 'x-social-screen') return false; // X社交页面不触发
        if (active.id === 'world-book-screen') return false; // 世界书页面不触发
        if (active.id === 'reader-bookshelf-screen') return false; // 阅读器书架页面不触发
        // 有弹窗/面板/上下文菜单打开时不触发
        if (document.querySelector('.modal-overlay.visible, .action-sheet-overlay.visible, .context-menu')) return false;
        return true;
    };

    // 安卓 overscroll 阻尼：拖动越多阻力越大，页面位移渐近 MAXPULL（永远拖不满）
    const damp = (dx) => MAXPULL * (1 - 1 / (1 + dx / MAXPULL));

    const setX = (el, x, animate) => {
        el.style.transition = animate ? 'transform .45s cubic-bezier(.22,1.35,.36,1)' : 'none';
        el.style.transform = x ? `translateX(${x}px)` : '';
    };

    const cleanup = () => {
        if (curEl) { curEl.style.position = ''; curEl.style.zIndex = ''; curEl.style.boxShadow = ''; }
        document.body.style.userSelect = '';
        curEl = null; tracking = false; engaged = false;
    };

    const start = (x, y) => { sx = x; sy = y; st = Date.now(); tracking = true; engaged = false; };

    const move = (x, y) => {
        if (!tracking) return;
        const dx = x - sx, dy = y - sy;
        if (!engaged) {
            if (Math.abs(dx) < ENGAGE) return;
            if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; } // 纵向滑动意图 → 放弃
            if (dx <= 0 || !canGoBack()) { tracking = false; return; }
            engaged = true;
            curEl = document.querySelector('.screen.active');
            curEl.style.position = 'relative';
            curEl.style.zIndex = '60';
            document.body.style.userSelect = 'none';
        }
        // 拖到一半变成纵向滚动 → 回弹取消
        if (dy > Math.abs(dx) * 0.9) { setX(curEl, 0, true); cleanup(); return; }
        curEl.style.boxShadow = '-10px 0 26px rgba(0,0,0,0.12)';
        setX(curEl, damp(dx), false);
    };

    const end = (x, y) => {
        if (!tracking) return;
        const dx = x - sx;
        const dt = Date.now() - st;
        if (!engaged) {
            tracking = false;
            // 快速轻扫兜底：位移够 + 时间短
            if (dx > MIN_TRIGGER && dt < 300 && canGoBack()) goBackScreen();
            return;
        }
        // 触发条件：手指位移达标（页面只拖动了一点点，看手指位移判断）
        const shouldGo = dx > MIN_TRIGGER || (dx > 55 && dt < 260);
        if (shouldGo) {
            // 拦截本次拖拽结尾产生的误点击
            const kill = (e) => { e.stopPropagation(); e.preventDefault(); };
            document.addEventListener('click', kill, { capture: true, once: true });
            setTimeout(() => document.removeEventListener('click', kill, { capture: true }), 700);
            const old = curEl;
            // 页面Q弹归位
            setX(old, 0, true);
            old.style.opacity = '0.85';
            setTimeout(() => {
                goBackScreen();
                // 旧屏复位（已隐藏）
                old.style.transition = ''; old.style.transform = ''; old.style.opacity = '';
                old.style.position = ''; old.style.zIndex = ''; old.style.boxShadow = '';
                // 新屏轻微滑入（安卓过渡感）
                const el2 = document.querySelector('.screen.active');
                if (el2) {
                    el2.style.transition = 'none';
                    el2.style.transform = 'translateX(28px)';
                    el2.style.opacity = '0.4';
                    requestAnimationFrame(() => {
                        el2.style.transition = 'transform .4s cubic-bezier(.2,.9,.3,1.15), opacity .35s ease';
                        el2.style.transform = '';
                        el2.style.opacity = '';
                        setTimeout(() => { el2.style.transition = ''; el2.style.transform = ''; el2.style.opacity = ''; }, 450);
                    });
                }
            }, 160);
        } else {
            // Q弹回弹
            setX(curEl, 0, true);
        }
        cleanup();
    };

    // 触摸
    document.addEventListener('touchstart', (e) => {
        if (!canGoBack()) { tracking = false; return; }
        const t = e.touches[0];
        start(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        move(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        end(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchcancel', () => {
        if (engaged && curEl) setX(curEl, 0, true);
        cleanup();
    }, { passive: true });

    // 鼠标拖拽（桌面端）
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !canGoBack()) { tracking = false; return; }
        start(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    document.addEventListener('mouseup', (e) => {
        if (!tracking) return;
        // 正在选中文字时不触发（防止选中文本被误判为滑动）
        if (String(window.getSelection && window.getSelection())) {
            if (engaged && curEl) setX(curEl, 0, true);
            cleanup();
            return;
        }
        end(e.clientX, e.clientY);
    });
})();

function renderMoreScreen() {
    let myName = 'User Name';
    let myAvatar = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    let activePersona = null;
    if (db.activePersonaId) {
        activePersona = db.myPersonaPresets.find(p => p.id === db.activePersonaId);
    }
    
    if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) {
        activePersona = db.myPersonaPresets[0];
    }

    if (activePersona) {
        myName = activePersona.name || 'User';
        myAvatar = activePersona.avatar || myAvatar;
    } else if (db.characters && db.characters.length > 0) {
        const firstChar = db.characters[0];
        myName = firstChar.myName || 'User Name';
        myAvatar = firstChar.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    }
    
    const avatarEl = document.getElementById('more-my-avatar');
    const nameEl = document.getElementById('more-my-name');
    const dateEl = document.getElementById('more-date-display');

    if (avatarEl) avatarEl.src = myAvatar;
    if (nameEl) nameEl.textContent = myName;
    
    // 更新日期显示 (格式: YYYY#MMDD)
    if (dateEl) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dateEl.textContent = `${year}#${month}${day}`;
    }

    // 应用自定义背景图
    const bgLayer = document.querySelector('.glass-background-layer');
    if (bgLayer && db.moreProfileCardBg) {
        bgLayer.style.backgroundImage = `url('${db.moreProfileCardBg}')`;
    }

    // 触发搜索引导
    if (window.GuideSystem) {
        window.GuideSystem.check('guide_search_entry');
    }
}

function setupMoreCardBgModal() {
    const modal = document.getElementById('more-card-bg-modal');
    const form = document.getElementById('more-card-bg-form');
    const preview = document.getElementById('more-card-bg-preview');
    const urlInput = document.getElementById('more-card-bg-url-input');
    const fileUpload = document.getElementById('more-card-bg-file-upload');
    
    // 绑定点击事件到背景层
    // 注意：由于 renderMoreScreen 可能会被多次调用，我们需要使用事件委托或者确保只绑定一次
    // 这里我们使用事件委托绑定到 document，在 renderMoreScreen 中不需要重复绑定
    document.body.addEventListener('click', (e) => {
        // 只要点击了更多界面的个人卡片区域（包括背景和内容），都触发更换背景
        // 这样可以避免因为内容层遮挡背景层导致点击无效
        // 2026-01-21 修改：将点击范围限定在背景层 (glass-background-layer)，避免点击头像/名字触发
        if (e.target.classList.contains('glass-background-layer')) {
            // 打开模态框
            modal.classList.add('visible');
            urlInput.value = '';
            fileUpload.value = null;
            preview.style.backgroundImage = `url('${db.moreProfileCardBg || 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg'}')`;
            preview.innerHTML = '';
        }
    });

    // URL 输入预览
    urlInput.addEventListener('input', () => {
        if (urlInput.value) {
            preview.style.backgroundImage = `url('${urlInput.value}')`;
            preview.innerHTML = '';
        }
    });

    // 文件上传预览
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.style.backgroundImage = `url('${e.target.result}')`;
                preview.innerHTML = '';
                // 临时存储 base64，提交时使用
                fileUpload.dataset.base64 = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // 保存
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let newBg = db.moreProfileCardBg;

        if (fileUpload.files.length > 0 && fileUpload.dataset.base64) {
            newBg = fileUpload.dataset.base64;
        } else if (urlInput.value) {
            newBg = urlInput.value;
        }

        if (newBg !== db.moreProfileCardBg) {
            db.moreProfileCardBg = newBg;
            await saveData();
            renderMoreScreen(); // 重新渲染以应用更改
            showToast('背景已更新');
        }
        
        modal.classList.remove('visible');
        // 清理
        fileUpload.dataset.base64 = '';
    });
}

// 右键菜单
function createContextMenu(items, x, y) {
    removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.danger) menuItem.classList.add('danger');
        menuItem.textContent = item.label;
        menuItem.onclick = () => {
            item.action();
            removeContextMenu();
        };
        menu.appendChild(menuItem);
    });

    const rect = menu.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const padding = 10; // 屏幕边缘间距

    // 水平方向调整
    if (x + rect.width > winWidth - padding) {
        x = winWidth - rect.width - padding;
    }
    if (x < padding) {
        x = padding;
    }
    
    // 垂直方向调整
    if (y + rect.height > winHeight - padding) {
        // 如果下方空间不足，向上弹出
        y = y - rect.height;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';

    document.addEventListener('click', removeContextMenu, {once: true});
}

function removeContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) menu.remove();
}

// 更新气泡样式
function updateCustomBubbleStyle(chatId, css, enabled) {
    const STYLE_TAG_CLASS = 'dynamic-chat-style-tag';
    const existingStyles = document.querySelectorAll(`.${STYLE_TAG_CLASS}, style[id^="custom-bubble-style-for-"]`);
    existingStyles.forEach(el => el.remove());

    if (!enabled || !css) return;

    // 获取 chat 对象以支持模板变量
    let chat = null;
    if (typeof db !== 'undefined') {
        chat = db.characters.find(c => c.id === chatId) || db.groups.find(g => g.id === chatId);
    }

    // 处理模板变量 ({{char_avatar}}, {{user_avatar}} 等)
    // processTemplate 定义在 js/utils.js 中
    const processedCss = (typeof processTemplate === 'function' && chat) ? processTemplate(css, chat) : css;

    const styleElement = document.createElement('style');
    styleElement.id = `custom-bubble-style-for-${chatId}`;
    styleElement.className = STYLE_TAG_CLASS;

    styleElement.textContent = processedCss;

    document.head.appendChild(styleElement);
}

function updateBubbleCssPreview(previewContainer, css, useDefault, theme) {
    previewContainer.innerHTML = '';

    const sentBubble = document.createElement('div');
    sentBubble.className = 'message-bubble sent';
    sentBubble.textContent = '这是我方气泡。';
    sentBubble.style.alignSelf = 'flex-end';
    sentBubble.style.borderBottomRightRadius = '5px';

    const receivedBubble = document.createElement('div');
    receivedBubble.className = 'message-bubble received';
    receivedBubble.textContent = '这是对方气泡。';
    receivedBubble.style.alignSelf = 'flex-start';
    receivedBubble.style.borderBottomLeftRadius = '5px';

    [sentBubble, receivedBubble].forEach(bubble => {
        bubble.style.maxWidth = '70%';
        bubble.style.padding = '8px 12px';
        bubble.style.wordWrap = 'break-word';
        bubble.style.lineHeight = '1.4';
    });

    if (useDefault || !css) {
        sentBubble.style.backgroundColor = theme.sent.bg;
        sentBubble.style.color = theme.sent.text;
        sentBubble.style.borderRadius = '18px';
        sentBubble.style.borderBottomRightRadius = '5px';
        receivedBubble.style.backgroundColor = theme.received.bg;
        receivedBubble.style.color = theme.received.text;
        receivedBubble.style.borderRadius = '18px';
        receivedBubble.style.borderBottomLeftRadius = '5px';
    } else {
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            #${previewContainer.id} {
                ${css}
            }
        `;
        previewContainer.appendChild(styleTag);
    }
    previewContainer.appendChild(receivedBubble);
    previewContainer.appendChild(sentBubble);
}

// 主屏幕逻辑
let currentPageIndex = 0;
let homeSortables = [];
let isHomeEditMode = false;
let homePressTimer = null;
let lastHomeDragEndTime = 0;
let editModeEnterTime = 0;

/**
 * 初始分页计算算法：仅在迁移旧数据或初始化时使用
 * 将小组件按顺序填充到 4x6 的网格页面中，返回 ID 的二维数组
 */
function calculatePagesFromIds(ids, allItemsHtmlMap) {
    const PAGE_COLS = 4;
    const PAGE_ROWS = 6;
    let pages = [];
    let currentPageIds = [];
    let grid = Array(PAGE_ROWS).fill(null).map(() => Array(PAGE_COLS).fill(false));
    let currR = 0;
    let currC = 0;

    ids.forEach(id => {
        const html = allItemsHtmlMap[id];
        if (!html) return;
        
        let rows = 1, cols = 1;
        const match = html.match(/grid-item-(\d+)x(\d+)/);
        if (match) {
            rows = parseInt(match[1]);
            cols = parseInt(match[2]);
        }
        
        let placed = false;
        while (currR <= PAGE_ROWS - rows) {
            let canFit = true;
            if (currC + cols > PAGE_COLS) {
                canFit = false;
            } else {
                for (let i = 0; i < rows; i++) {
                    for (let j = 0; j < cols; j++) {
                        if (grid[currR + i][currC + j]) {
                            canFit = false;
                            break;
                        }
                    }
                    if (!canFit) break;
                }
            }

            if (canFit) {
                for (let i = 0; i < rows; i++) {
                    for (let j = 0; j < cols; j++) {
                        grid[currR + i][currC + j] = true;
                    }
                }
                currentPageIds.push(id);
                placed = true;
                currC += cols;
                if (currC >= PAGE_COLS) {
                    currC = 0;
                    currR++;
                }
                break;
            } else {
                currC++;
                if (currC >= PAGE_COLS) {
                    currC = 0;
                    currR++;
                }
            }
        }
        
        if (!placed) {
            pages.push(currentPageIds);
            currentPageIds = [id];
            grid = Array(PAGE_ROWS).fill(null).map(() => Array(PAGE_COLS).fill(false));
            currR = 0;
            currC = 0;
            if (rows <= PAGE_ROWS && cols <= PAGE_COLS) {
                for (let i = 0; i < rows; i++) {
                    for (let j = 0; j < cols; j++) {
                        grid[i][j] = true;
                    }
                }
                currC = cols;
                if (currC >= PAGE_COLS) {
                    currC = 0;
                    currR = 1;
                }
            }
        }
    });
    
    if (currentPageIds.length > 0) {
        pages.push(currentPageIds);
    }
    
    while (pages.length < 2) {
        pages.push([]);
    }
    
    return pages;
}

function setupHomeScreen() {
    const getIcon = (id) => db.customIcons[id] || defaultIcons[id].url;
    if (!db.insWidgetSettings) {
        db.insWidgetSettings = {
            avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
            bubble1: '„- ω -„',
            avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
            bubble2: 'ｷ...✩'
        };
    }
    const insWidget = db.insWidgetSettings;

    // 定义所有可用的组件和应用
    const allItems = {
        'app-chat': `<div class="grid-item-1x1" data-id="app-chat"><a href="#" class="app-icon" data-target="chat-list-screen"><img src="${getIcon('chat-list-screen')}" alt="微信" class="icon-img"><span class="app-name">${defaultIcons['chat-list-screen'].name}</span></a></div>`,
        'app-api': `<div class="grid-item-1x1" data-id="app-api"><a href="#" class="app-icon" data-target="instagram-screen"><img src="${getIcon('instagram-screen')}" alt="instagram" class="icon-img"><span class="app-name">instagram</span></a></div>`,
                'app-worldbook': `<div class="grid-item-1x1" data-id="app-worldbook"><a href="#" class="app-icon" data-target="world-book-screen"><img src="${getIcon('world-book-screen')}" alt="World Book" class="icon-img"><span class="app-name">${defaultIcons['world-book-screen'].name}</span></a></div>`,
        'app-customize': `<div class="grid-item-1x1" data-id="app-customize"><a href="#" class="app-icon" data-target="customize-screen"><img src="${getIcon('customize-screen')}" alt="Customize" class="icon-img"><span class="app-name">${defaultIcons['customize-screen'].name}</span></a></div>`,
        'app-tutorial': `<div class="grid-item-1x1" data-id="app-tutorial"><a href="#" class="app-icon" data-target="tutorial-screen"><img src="${getIcon('tutorial-screen')}" alt="Music" class="icon-img"><span class="app-name">${defaultIcons['tutorial-screen'].name}</span></a></div>`,
        'app-console': `<div class="grid-item-1x1" data-id="app-console"><a href="#" class="app-icon" data-target="console-screen"><img src="${getIcon('console-screen')}" alt="Console" class="icon-img"><span class="app-name">${defaultIcons['console-screen'].name}</span></a></div>`,
        'app-widget-market': `<div class="grid-item-1x1" data-id="app-widget-market"><a href="#" class="app-icon" data-target="widget-market-screen"><img src="${getIcon('widget-market-screen')}" alt="小组件" class="icon-img"><span class="app-name">小组件</span></a></div>`,
        'app-reader': `<div class="grid-item-1x1" data-id="app-reader"><a href="#" class="app-icon" data-target="reader-bookshelf-screen"><img src="${getIcon('reader-bookshelf-screen')}" alt="阅读器" class="icon-img"><span class="app-name">${defaultIcons['reader-bookshelf-screen'].name}</span></a></div>`,
        'app-vocab': `<div class="grid-item-1x1" data-id="app-vocab"><a href="#" class="app-icon" data-target="vocab-book-screen"><img src="${getIcon('vocab-book-screen')}" alt="单词本" class="icon-img"><span class="app-name">${defaultIcons['vocab-book-screen'].name}</span></a></div>`,
        'app-placeholder': `<div class="grid-item-1x1" data-id="app-placeholder"><a href="#" class="app-icon" onclick="return false;"><img src="${getIcon('placeholder-app')}" alt="<3" class="icon-img"><span class="app-name">${defaultIcons['placeholder-app'].name}</span></a></div>`,
        'app-x': `<div class="grid-item-1x1" data-id="app-x"><a href="#" class="app-icon" data-target="x-social-screen"><img src="${getIcon('x-social-screen')}" alt="X" class="icon-img"><span class="app-name">推特</span></a></div>`,
        'app-knowledge': `<div class="grid-item-1x1" data-id="app-knowledge"><a href="#" class="app-icon" data-target="knowledge-screen"><img src="${getIcon('knowledge-screen')}" alt="知识库" class="icon-img"><span class="app-name">知识库</span></a></div>`,
        'app-calendar': `<div class="grid-item-1x1" data-id="app-calendar"><a href="#" class="app-icon" data-target="calendar-screen"><img src="${getIcon('calendar-screen')}" alt="日历" class="icon-img"><span class="app-name">${defaultIcons['calendar-screen'].name}</span></a></div>`,
        'app-shop': `<div class="grid-item-1x1" data-id="app-shop"><a href="#" class="app-icon" data-target="shop-screen" onclick="openShopScreen(); return false;"><img src="${getIcon('shop-screen')}" alt="商城" class="icon-img"><span class="app-name">${defaultIcons['shop-screen'].name}</span></a></div>`,
        'app-xiaohongshu': `<div class="grid-item-1x1" data-id="app-xiaohongshu"><a href="#" class="app-icon" data-target="xiaohongshu-screen"><img src="${getIcon('xiaohongshu-screen')}" alt="小红书" class="icon-img"><span class="app-name">${defaultIcons['xiaohongshu-screen'].name}</span></a></div>`,
        'app-jili': `<div class="grid-item-1x1" data-id="app-jili"><a href="#" class="app-icon" data-target="jili-screen"><img src="${getIcon('jili-screen')}" alt="叽哩叽哩" class="icon-img"><span class="app-name">${defaultIcons['jili-screen'].name}</span></a></div>`,
        'app-radio': `<div class="grid-item-1x1" data-id="app-radio"><a href="#" class="app-icon" data-target="radio-screen"><img src="${getIcon('radio-screen')}" alt="一起听电台" class="icon-img"><span class="app-name">${defaultIcons['radio-screen'].name}</span></a></div>`,
        'app-midnight': `<div class="grid-item-1x1" data-id="app-midnight"><a href="#" class="app-icon" data-target="midnight-screen"><img src="${getIcon('midnight-screen')}" alt="深夜电台" class="icon-img"><span class="app-name">${defaultIcons['midnight-screen'].name}</span></a></div>`,
        'app-treasure-map': `<div class="grid-item-1x1" data-id="app-treasure-map"><a href="#" class="app-icon" data-target="treasure-map-screen"><img src="${getIcon('treasure-map-screen')}" alt="藏宝地图" class="icon-img"><span class="app-name">${defaultIcons['treasure-map-screen'].name}</span></a></div>`
    };

    // 收集需要执行的 JS 代码
    const widgetScripts = [];

    // 注入自定义小组件
    if (db.addedWidgets && db.widgetTemplates) {
        db.addedWidgets.forEach(instance => {
            const template = db.widgetTemplates.find(t => t.id === instance.templateId);
            if (template) {
                // 修复：必须替换 {{id}} 占位符，否则 HTML 无法匹配注入的 CSS 选择器
                let html = template.html.replace(/{{id}}/g, template.id);
                // 替换变量
                const vars = { ...template.defaultVars, ...instance.vars };
                for (const [key, value] of Object.entries(vars)) {
                    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
                }
                
                // 收集 JS 代码
                if (template.js) {
                    let jsCode = template.js.replace(/{{id}}/g, template.id);
                    for (const [key, value] of Object.entries(vars)) {
                        jsCode = jsCode.replace(new RegExp(`{{${key}}}`, 'g'), value);
                    }
                    widgetScripts.push({ id: instance.id, code: jsCode });
                }
                
                // 转换尺寸类名 (4x2 对应 grid-item-2x4)
                let sizeClass = `grid-item-${template.size}`;
                if (template.size === '4x2') sizeClass = 'grid-item-2x4';
                
                allItems[instance.id] = `
                    <div class="${sizeClass}" data-id="${instance.id}">
                        <div class="custom-widget-container" style="width:100%; height:100%; position:relative;">
                            ${html}
                            <button class="delete-widget-btn" data-id="${instance.id}" style="display:none; position:absolute; top:-5px; right:-5px; background:#ff3b30; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; z-index:10; align-items:center; justify-content:center; font-size:14px;">×</button>
                        </div>
                    </div>`;
            }
        });
    }

    // 确保所有项目都在 allItems 中，并处理新添加的项目
    const allItemIds = Object.keys(allItems);
    
    // 数据结构迁移与初始化
    if (!db.homeLayoutPages) {
        const order = db.homeLayoutOrder || ['app-chat', 'app-api', 'app-worldbook', 'app-customize', 'app-tutorial', 'app-console', 'app-widget-market', 'app-vocab', 'app-calendar', 'app-shop', 'app-xiaohongshu', 'app-jili', 'app-radio', 'app-midnight', 'app-treasure-map', 'app-placeholder'];
        db.homeLayoutPages = calculatePagesFromIds(order, allItems);
        saveData();
    }

    // 检查是否有新添加但未在分页中的项目
    const existingIds = new Set(db.homeLayoutPages.flat());
    let hasNewItems = false;
    allItemIds.forEach(id => {
        if (!existingIds.has(id)) {
            // 将新项目添加到第一页，溢出逻辑会自动处理
            if (!db.homeLayoutPages[0]) db.homeLayoutPages[0] = [];
            db.homeLayoutPages[0].push(id);
            hasNewItems = true;
        }
    });

    let pagesChanged = false;
    // 先清理空页面
    const originalLength = db.homeLayoutPages.length;
    db.homeLayoutPages = db.homeLayoutPages.filter(page => page.length > 0);
    if (db.homeLayoutPages.length === 0) {
        db.homeLayoutPages = [[]];
    }
    if (db.homeLayoutPages.length !== originalLength) {
        pagesChanged = true;
    }

    // 溢出处理逻辑：如果某一页超过 6 行，将多余的组件推送到下一页
    for (let p = 0; p < db.homeLayoutPages.length; p++) {
        let pageIds = db.homeLayoutPages[p];
        let validIds = [];
        let overflowIds = [];
        
        let grid = Array(6).fill(null).map(() => Array(4).fill(false));
        let currR = 0, currC = 0;
        let overflowStarted = false;
        
        for (let id of pageIds) {
            if (overflowStarted) {
                overflowIds.push(id);
                continue;
            }
            
            const html = allItems[id];
            if (!html) continue;
            let rows = 1, cols = 1;
            const match = html.match(/grid-item-(\d+)x(\d+)/);
            if (match) { rows = parseInt(match[1]); cols = parseInt(match[2]); }
            
            let placed = false;
            while (currR <= 6 - rows) {
                let canFit = true;
                if (currC + cols > 4) canFit = false;
                else {
                    for (let i=0; i<rows; i++) for (let j=0; j<cols; j++) if (grid[currR+i][currC+j]) canFit = false;
                }
                if (canFit) {
                    for (let i=0; i<rows; i++) for (let j=0; j<cols; j++) grid[currR+i][currC+j] = true;
                    validIds.push(id);
                    placed = true;
                    currC += cols;
                    if (currC >= 4) { currC = 0; currR++; }
                    break;
                } else {
                    currC++;
                    if (currC >= 4) { currC = 0; currR++; }
                }
            }
            
            if (!placed) {
                overflowStarted = true;
                overflowIds.push(id);
            }
        }
        
        if (overflowIds.length > 0) {
            db.homeLayoutPages[p] = validIds;
            if (p + 1 >= db.homeLayoutPages.length) {
                db.homeLayoutPages.push([]);
            }
            // 将溢出项插入到下一页的最前面
            db.homeLayoutPages[p+1] = [...overflowIds, ...db.homeLayoutPages[p+1]];
            pagesChanged = true;
        }
    }
    
    // 再次清理可能产生的空页面
    const afterOverflowLength = db.homeLayoutPages.length;
    db.homeLayoutPages = db.homeLayoutPages.filter(page => page.length > 0);
    if (db.homeLayoutPages.length === 0) {
        db.homeLayoutPages = [[]];
    }
    if (db.homeLayoutPages.length !== afterOverflowLength) {
        pagesChanged = true;
    }
    
    if (pagesChanged || hasNewItems) saveData();

    // 生成 HTML
    let swiperHtml = '';
    let indicatorHtml = '';
    
    db.homeLayoutPages.forEach((pageIds, index) => {
        let pageHtml = pageIds.map(id => allItems[id] || '').join('');
        swiperHtml += `
        <div class="home-screen-page">
            <div class="home-grid-layout" id="home-grid-layout-${index + 1}" style="min-height: 500px;">
                ${pageHtml}
            </div>
        </div>`;
        indicatorHtml += `<span class="dot ${index === 0 ? 'active' : ''}"></span>`;
    });

    const homeScreenHTML = `
    <div class="home-screen-swiper" id="home-screen-swiper">
        ${swiperHtml}
    </div>
    <div class="page-indicator">
        ${indicatorHtml}
    </div>
    <div class="dock-container">
        <div class="dock dock-normal">
            <a href="#" class="app-icon" id="day-mode-btn" data-target="api-settings-screen" title="设置"><img src="${getIcon('day-mode-btn')}" alt="设置" class="icon-img"></a>
            <a href="#" class="app-icon" id="night-mode-btn"><img src="${getIcon('night-mode-btn')}" alt="夜间" class="icon-img"></a>
            <a href="#" class="app-icon" data-target="storage-analysis-screen"><img src="${getIcon('storage-analysis-screen')}" alt="存储" class="icon-img"></a>
        </div>
        <div class="dock dock-edit" style="display: none;">
            <a href="#" class="app-icon" id="add-widget-btn">
                <div class="icon-img" style="background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
            </a>
            <a href="#" class="app-icon" id="finish-edit-btn">
                <div class="icon-img" style="background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
            </a>
        </div>
    </div>`;

    
    homeScreen.innerHTML = homeScreenHTML;

    // 执行收集到的小组件 JS 代码
    // 先清理旧的脚本标签
    document.querySelectorAll('.widget-dynamic-script').forEach(el => el.remove());
    widgetScripts.forEach(scriptData => {
        try {
            const scriptEl = document.createElement('script');
            scriptEl.className = 'widget-dynamic-script';
            scriptEl.setAttribute('data-widget-id', scriptData.id);
            // 使用 IIFE 包装，避免变量污染全局作用域
            scriptEl.textContent = `(function() { \n${scriptData.code}\n })();`;
            document.body.appendChild(scriptEl);
        } catch (e) {
            console.error(`Error executing script for widget ${scriptData.id}:`, e);
        }
    });

    // 拦截长按菜单，防止与编辑模式冲突
    homeScreen.addEventListener('contextmenu', (e) => {
        // 如果长按的是可编辑元素（如签名档），则允许弹出系统菜单
        if (e.target.closest('[contenteditable="true"]')) {
            return;
        }
        // 否则阻止默认菜单弹出，确保顺利进入编辑模式
        e.preventDefault();
    });

    // 禁用 App 图标（锚点）的原生拖拽/预览，否则编辑模式下图标无法被 Sortable 拖动
    homeScreen.addEventListener('dragstart', (e) => e.preventDefault());

    // 监听滑动事件更新指示器
    const swiper = document.getElementById('home-screen-swiper');
    if (swiper) {
        swiper.addEventListener('scroll', () => {
            const pageIndex = Math.round(swiper.scrollLeft / swiper.clientWidth);
            updatePageIndicator(pageIndex);
        });

        // PC 端鼠标拖拽翻页逻辑
        let isDown = false;
        let startX;
        let scrollLeft;
        let dragDistance = 0;

        swiper.addEventListener('mousedown', (e) => {
            // 如果点击的是可编辑元素、图标，或者处于编辑模式，不触发翻页拖拽
            if (e.target.closest('[contenteditable]') || e.target.closest('.app-icon') || isHomeEditMode) return;
            
            isDown = true;
            dragDistance = 0;
            swiper.style.scrollSnapType = 'none'; // 拖拽时临时禁用吸附，保证丝滑
            swiper.style.cursor = 'grabbing';
            startX = e.pageX - swiper.offsetLeft;
            scrollLeft = swiper.scrollLeft;
        });

        const handleDragEnd = () => {
            if (!isDown) return;
            isDown = false;
            swiper.style.cursor = '';
            
            // 恢复吸附前，根据拖拽距离判断是否需要主动翻页
            const threshold = 50; // 触发翻页的最小拖拽距离
            const pageWidth = swiper.clientWidth;
            const currentPage = Math.round(scrollLeft / pageWidth);
            
            if (Math.abs(dragDistance) > threshold) {
                // 拖拽距离足够，主动滚动到下一页/上一页
                const targetPage = dragDistance > 0 ? currentPage - 1 : currentPage + 1;
                // 确保目标页在合法范围内
                const maxPage = swiper.children.length - 1;
                const finalPage = Math.max(0, Math.min(targetPage, maxPage));
                
                swiper.scrollTo({
                    left: finalPage * pageWidth,
                    behavior: 'smooth'
                });
            } else {
                // 拖拽距离不够，回弹到当前页
                swiper.scrollTo({
                    left: currentPage * pageWidth,
                    behavior: 'smooth'
                });
            }

            // 延迟恢复吸附，等待平滑滚动动画完成
            setTimeout(() => {
                swiper.style.scrollSnapType = 'x mandatory';
            }, 300);
        };

        swiper.addEventListener('mouseleave', handleDragEnd);
        swiper.addEventListener('mouseup', handleDragEnd);

        swiper.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - swiper.offsetLeft;
            dragDistance = x - startX;
            const walk = dragDistance * 1.5; // 滚动速度倍率
            swiper.scrollLeft = scrollLeft - walk;
        });
    }

    const polaroidImage = db.homeWidgetSettings?.polaroidImage;
    if (polaroidImage) {
        updatePolaroidImage(polaroidImage);
    }

    updateClock();
    applyWallpaper(db.wallpaper);
    applyHomeScreenMode(db.homeScreenMode);
    
    // 底部第一个图标（原日间模式）保留图标占位，无功能
    document.getElementById('night-mode-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        // 来回切换日间/夜间模式
        applyHomeScreenMode(db.homeScreenMode === 'day' ? 'night' : 'day');
    });
    
    // 绑定应用点击事件
    homeScreen.querySelectorAll('.app-icon[data-target]').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            if (isHomeEditMode) return; // 编辑模式下禁止点击
            const target = icon.getAttribute('data-target');
            if (target === 'world-book-screen') renderWorldBookList();
            else if (target === 'customize-screen') renderCustomizeForm();
            else if (target === 'api-settings-screen') { switchScreen(target); }
            else if (target === 'knowledge-screen') { switchScreen(target); if (window.renderKnowledge) window.renderKnowledge(); }
            else if (target === 'tutorial-screen') { if (window.MusicPlayer) window.MusicPlayer.render(); switchScreen(target); }
            else if (target === 'treasure-map-screen') { switchScreen(target); if (window.TreasureMap) window.TreasureMap.open(); }
            else if (target === 'widget-market-screen') {
                if (typeof renderWidgetMarket === 'function') renderWidgetMarket();
                switchScreen(target);
            }
            else switchScreen(target);
        });
    });

    // 绑定编辑模式按钮
    const addWidgetBtn = document.getElementById('add-widget-btn');
    if (addWidgetBtn) {
        addWidgetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof renderWidgetAddModal === 'function') {
                renderWidgetAddModal();
            }
            const modal = document.getElementById('widget-add-modal');
            if (modal) modal.classList.add('visible');
        });
    }
    
    const closeWidgetAddModalBtn = document.getElementById('close-widget-add-modal-btn');
    const widgetAddModal = document.getElementById('widget-add-modal');
    if (closeWidgetAddModalBtn && widgetAddModal) {
        closeWidgetAddModalBtn.addEventListener('click', () => {
            widgetAddModal.classList.remove('visible');
        });
        // 点击遮罩层关闭
        widgetAddModal.addEventListener('click', (e) => {
            if (e.target === widgetAddModal) {
                widgetAddModal.classList.remove('visible');
            }
        });
    }

    const finishEditBtn = document.getElementById('finish-edit-btn');
    if (finishEditBtn) {
        finishEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exitHomeEditMode();
        });
    }

    // 绑定删除小组件按钮
    homeScreen.querySelectorAll('.delete-widget-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const instanceId = btn.getAttribute('data-id');
            if (confirm('确定要删除这个小组件吗？')) {
                db.addedWidgets = db.addedWidgets.filter(w => w.id !== instanceId);
                // 从分页数据中删除
                if (db.homeLayoutPages) {
                    db.homeLayoutPages = db.homeLayoutPages.map(page => page.filter(id => id !== instanceId));
                }
                db.homeLayoutOrder = db.homeLayoutOrder.filter(id => id !== instanceId);
                await saveData();
                setupHomeScreen();
            }
        });
    });

    updateBatteryStatus();

    const homeWidgetContainer = homeScreen.querySelector('.home-widget-container');

    // Central Circle Click
    const centralCircle = homeWidgetContainer?.querySelector('.central-circle');
    if (centralCircle) {
        centralCircle.addEventListener('click', () => {
            if (isHomeEditMode) return;
            const modal = document.getElementById('ins-widget-avatar-modal');
            const preview = document.getElementById('ins-widget-avatar-preview');
            const urlInput = document.getElementById('ins-widget-avatar-url-input');
            const fileUpload = document.getElementById('ins-widget-avatar-file-upload');
            const targetInput = document.getElementById('ins-widget-avatar-target');

            targetInput.value = 'centralCircle'; 
            preview.style.backgroundImage = `url("${db.homeWidgetSettings.centralCircleImage}")`;
            preview.innerHTML = '';
            urlInput.value = '';
            fileUpload.value = null;
            modal.classList.add('visible');
        });
    }

    // Blur to Save Logic
    homeScreen.addEventListener('blur', async (e) => {
        const target = e.target;
        if (target.hasAttribute('contenteditable')) {
            const oval = target.closest('.satellite-oval');
            if (oval) { 
                const part = oval.dataset.widgetPart;
                const prop = target.classList.contains('satellite-emoji') ? 'emoji' : 'text';
                const newValue = target.textContent.trim();

                if (db.homeWidgetSettings[part] && db.homeWidgetSettings[part][prop] !== newValue) {
                    db.homeWidgetSettings[part][prop] = newValue;
                    await saveData();
                    showToast('小组件已更新');
                }
            } else if (target.id === 'widget-signature') { 
                const newSignature = target.textContent.trim();
                if (db.homeSignature !== newSignature) {
                    db.homeSignature = newSignature;
                    await saveData();
                    showToast('签名已保存');
                }
            } else if (target.id === 'ins-widget-bubble-1' || target.id === 'ins-widget-bubble-2') { 
                 const bubbleId = target.id === 'ins-widget-bubble-1' ? 'bubble1' : 'bubble2';
                 const newText = target.textContent.trim();
                 if (db.insWidgetSettings[bubbleId] !== newText) {
                     db.insWidgetSettings[bubbleId] = newText;
                     await saveData();
                     showToast('小组件文字已保存');
                 }
            }
        }
    }, true); 
    
    const signatureWidget = document.getElementById('widget-signature');
    if (signatureWidget) {
        signatureWidget.textContent = db.homeSignature || '';
    }

    homeScreen.addEventListener('click', (e) => {
        // 编辑模式下的点击拦截逻辑
        if (isHomeEditMode) {
            // 检查点击的是否是网格内的小组件或应用图标
            const gridItem = e.target.closest('.home-grid-layout > div');
            if (gridItem) {
                // 如果点击的是删除按钮，放行
                if (e.target.closest('.delete-widget-btn')) {
                    return;
                }
                // 编辑模式下单击应用图标：退出编辑模式并正常打开应用（防止用户误入编辑模式后“点什么都没反应”）
                const appIcon = e.target.closest('.app-icon[data-target]');
                if (appIcon && Date.now() - lastHomeDragEndTime > 300 && Date.now() - editModeEnterTime > 400) {
                    exitHomeEditMode();
                    return;
                }
                // 否则拦截所有点击，防止触发跳转或小组件内部逻辑
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        const activeEl = document.activeElement;
        if (activeEl && activeEl.hasAttribute('contenteditable') && e.target !== activeEl) {
            activeEl.blur();
        }
        
        // 点击空白处退出编辑模式
        if (isHomeEditMode && !e.target.closest('.home-grid-layout > div')) {
            exitHomeEditMode();
        }
    }, true); // 使用捕获阶段以确保最高优先级拦截

    homeScreen.querySelectorAll('.satellite-emoji').forEach(span => {
        span.addEventListener('input', (e) => {
            const chars = [...e.target.textContent];
            if (chars.length > 1) {
                e.target.textContent = chars[0];
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(e.target);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
    });

    // 初始化 SortableJS
    initHomeSortables();
}

let lastPageFlipTime = 0;
const flipCooldown = 800; // 翻页冷却时间 800ms
let edgeFlipInterval = null;
let currentDragX = 0;

function initHomeSortables() {
    const gridLayouts = document.querySelectorAll('.home-grid-layout');
    const swiper = document.getElementById('home-screen-swiper');
    
    // 清理旧的实例
    homeSortables.forEach(sortable => sortable.destroy());
    homeSortables = [];

    if (typeof Sortable === 'undefined') {
        console.error("SortableJS not loaded");
        return;
    }

    const handleGlobalDrag = (e) => {
        currentDragX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    };

    gridLayouts.forEach(layout => {
        const sortable = new Sortable(layout, {
            group: 'home-grid',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            delay: 800, // 初始长按 800ms
            delayOnTouchOnly: false,
            forceFallback: true,
            fallbackOnBody: true,
            scroll: false, // 禁用默认滚动
            onStart: function() {
                if (swiper) swiper.style.scrollSnapType = 'none';
                
                // 动态添加一个空页，以便可以拖拽到新页
                const newPageIdx = document.querySelectorAll('.home-grid-layout').length + 1;
                const newPage = document.createElement('div');
                newPage.className = 'home-screen-page';
                newPage.innerHTML = `<div class="home-grid-layout edit-mode" id="home-grid-layout-${newPageIdx}" style="min-height: 500px;"></div>`;
                swiper.appendChild(newPage);
                
                // 为新页初始化 Sortable
                const newLayout = newPage.querySelector('.home-grid-layout');
                const newSortable = new Sortable(newLayout, {
                    group: 'home-grid',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    delay: 0,
                    delayOnTouchOnly: false,
                    forceFallback: true,
                    fallbackOnBody: true,
                    scroll: false
                });
                homeSortables.push(newSortable);

                // 更新指示器
                const indicator = document.querySelector('.page-indicator');
                if (indicator) {
                    const dot = document.createElement('span');
                    dot.className = 'dot';
                    indicator.appendChild(dot);
                }
                
                // 挂载全局位置监听
                window.addEventListener('mousemove', handleGlobalDrag);
                window.addEventListener('touchmove', handleGlobalDrag);

                // 启动边缘检测定时器
                if (edgeFlipInterval) clearInterval(edgeFlipInterval);
                edgeFlipInterval = setInterval(() => {
                    if (!swiper) return;
                    const now = Date.now();
                    if (now - lastPageFlipTime < flipCooldown) return;

                    const edgeThreshold = 60;
                    const screenWidth = window.innerWidth;
                    const pageWidth = swiper.clientWidth;
                    const maxScroll = swiper.scrollWidth - pageWidth;

                    if (currentDragX > 0 && currentDragX < edgeThreshold && swiper.scrollLeft > 0) {
                        const targetScroll = Math.max(0, swiper.scrollLeft - pageWidth);
                        swiper.scrollTo({ left: targetScroll, behavior: 'smooth' });
                        lastPageFlipTime = now;
                        if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
                    } else if (currentDragX > screenWidth - edgeThreshold && swiper.scrollLeft < maxScroll) {
                        const targetScroll = Math.min(maxScroll, swiper.scrollLeft + pageWidth);
                        swiper.scrollTo({ left: targetScroll, behavior: 'smooth' });
                        lastPageFlipTime = now;
                        if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
                    }
                }, 100);
            },
            onChoose: function (evt) {
                if (!isHomeEditMode) {
                    // 检查是否点击了可编辑元素，如果是则不进入编辑模式
                    if (evt.originalEvent.target.closest('[contenteditable]')) {
                        evt.preventDefault();
                        return;
                    }
                    enterHomeEditMode();
                    if (typeof triggerHapticFeedback === 'function') {
                        triggerHapticFeedback('heavy');
                    }
                }
            },
            onEnd: async function (evt) {
                lastHomeDragEndTime = Date.now();
                // 获取所有页面的新顺序，保存为二维数组实现持久化分页
                let newPages = [];
                document.querySelectorAll('.home-grid-layout').forEach(grid => {
                    const gridOrder = Array.from(grid.children).map(el => el.getAttribute('data-id'));
                    newPages.push(gridOrder);
                });
                
                // 过滤掉空页面
                newPages = newPages.filter(page => page.length > 0);
                if (newPages.length === 0) newPages = [[]]; // 至少保留一页
                
                db.homeLayoutPages = newPages;
                
                // 同时更新旧的扁平化 order 以保持兼容性
                db.homeLayoutOrder = newPages.flat();

                if (typeof saveData === 'function') {
                    await saveData();
                }
                
                // 重新渲染以应用溢出处理逻辑
                const wasEditMode = isHomeEditMode;
                setupHomeScreen();
                if (wasEditMode) {
                    enterHomeEditMode();
                }
                if (swiper) swiper.style.scrollSnapType = 'x mandatory';

                // 清理全局监听和定时器
                window.removeEventListener('mousemove', handleGlobalDrag);
                window.removeEventListener('touchmove', handleGlobalDrag);
                if (edgeFlipInterval) {
                    clearInterval(edgeFlipInterval);
                    edgeFlipInterval = null;
                }
                currentDragX = 0;
            }
        });
        homeSortables.push(sortable);
    });
}

function enterHomeEditMode() {
    isHomeEditMode = true;
    editModeEnterTime = Date.now();
    const gridLayouts = document.querySelectorAll('.home-grid-layout');
    
    gridLayouts.forEach(layout => {
        layout.classList.add('edit-mode');
        
        // 禁用所有 contenteditable
        layout.querySelectorAll('[contenteditable]').forEach(el => {
            el.setAttribute('data-editable', 'true');
            el.removeAttribute('contenteditable');
        });

        // 显示删除按钮
        layout.querySelectorAll('.delete-widget-btn').forEach(btn => {
            btn.style.display = 'flex';
        });
    });

    // 将所有 Sortable 实例的 delay 设为 0
    homeSortables.forEach(sortable => {
        sortable.option('delay', 0);
    });

    // 切换 Dock
    const dockNormal = document.querySelector('.dock-normal');
    const dockEdit = document.querySelector('.dock-edit');
    if (dockNormal && dockEdit) {
        dockNormal.style.display = 'none';
        dockEdit.style.display = 'flex';
    }
}

function exitHomeEditMode() {
    isHomeEditMode = false;
    const gridLayouts = document.querySelectorAll('.home-grid-layout');
    
    gridLayouts.forEach(layout => {
        layout.classList.remove('edit-mode');
        
        // 恢复 contenteditable
        layout.querySelectorAll('[data-editable="true"]').forEach(el => {
            el.setAttribute('contenteditable', 'true');
            el.removeAttribute('data-editable');
        });

        // 隐藏删除按钮
        layout.querySelectorAll('.delete-widget-btn').forEach(btn => {
            btn.style.display = 'none';
        });
    });

    // 恢复 delay 为 800
    homeSortables.forEach(sortable => {
        sortable.option('delay', 800);
    });

    // 切换 Dock
    const dockNormal = document.querySelector('.dock-normal');
    const dockEdit = document.querySelector('.dock-edit');
    if (dockNormal && dockEdit) {
        dockNormal.style.display = 'flex';
        dockEdit.style.display = 'none';
    }
}


function updateClock() {
    const now = new Date();
    const timeString = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateString = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`;

    const homeTimeDisplay = document.getElementById('time-display');
    const homeDateDisplay = document.getElementById('date-display');
    if (homeTimeDisplay) homeTimeDisplay.textContent = timeString;
    if (homeDateDisplay) homeDateDisplay.textContent = dateString;

    const peekTimeDisplay = document.getElementById('peek-time-display');
    const peekDateDisplay = document.getElementById('peek-date-display');
    if (peekTimeDisplay) peekTimeDisplay.textContent = timeString;
    if (peekDateDisplay) peekDateDisplay.textContent = dateString;
}

function updatePageIndicator(index) {
    const dots = document.querySelectorAll('.page-indicator .dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function applyWallpaper(url) {
    if (homeScreen) homeScreen.style.backgroundImage = `url(${url})`;
}

async function applyHomeScreenMode(mode) {
    const xScreen = document.getElementById('x-social-screen');
    if (mode === 'day') {
        homeScreen.classList.add('day-mode');
        if (xScreen) xScreen.classList.add('day-mode');
    } else {
        homeScreen.classList.remove('day-mode');
        if (xScreen) xScreen.classList.remove('day-mode');
    }
    db.homeScreenMode = mode;
    await saveData();
}

async function injectCustomFont(preset) {
    if (!preset || !preset.isCustom || !preset.fontFamily || !preset.id) return;
    try {
        const fontData = await dexieDB.customFonts.get(preset.id);
        if (fontData && fontData.file) {
            const arrayBuffer = await fontData.file.arrayBuffer();
            const fontFace = new FontFace(preset.fontFamily, arrayBuffer);
            const loadedFace = await fontFace.load();
            document.fonts.add(loadedFace);
            console.log(`Custom font ${preset.fontFamily} injected successfully.`);
        }
    } catch (error) {
        console.error(`Failed to inject custom font ${preset.fontFamily}:`, error);
    }
}

async function loadAllCustomFonts() {
    if (!db.fontPresets) return;
    const customPresets = db.fontPresets.filter(p => p.isCustom);
    for (const preset of customPresets) {
        await injectCustomFont(preset);
    }
}

function applyGlobalFont(fontValue, isCustom = false) {
    const styleId = 'global-font-style';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    if (fontValue) {
        if (isCustom) {
            styleElement.innerHTML = `:root { --font-family: '${fontValue}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }`;
        } else {
            const fontName = 'CustomGlobalFont';
            styleElement.innerHTML = `@font-face { font-family: '${fontName}'; src: url('${fontValue}'); } :root { --font-family: '${fontName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }`;
        }
    } else {
        styleElement.innerHTML = `:root { --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }`;
    }
}

function applyGlobalCss(css) {
    const styleId = 'global-css-style';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    
    styleElement.innerHTML = css || '';
}

function applyFontSize(scale) {
    document.documentElement.style.setProperty('--app-font-scale', scale);
}

// 统一面板控制函数
function showPanel(type) {
    triggerHapticFeedback('light');
    const toggleExpansionBtn = document.getElementById('toggle-expansion-btn');
    const panel = document.getElementById('chat-expansion-panel');

    if (type === 'none') {
        chatExpansionPanel.classList.remove('visible');
        if (toggleExpansionBtn) toggleExpansionBtn.classList.remove('rotate-45');
        return;
    }

    chatExpansionPanel.classList.add('visible');

    if (type === 'function') {
        panelFunctionArea.style.display = 'flex';
        panelStickerArea.style.display = 'none';
        
        // 初始化功能面板的分页滑动
        if (!document.querySelector('.function-swiper-wrapper')) {
            setupFunctionPanelSwiper();
        }

        if (toggleExpansionBtn) toggleExpansionBtn.classList.add('rotate-45');

        // 触发功能面板引导
        if (window.GuideSystem) {
            if (currentChatType === 'private') {
                window.GuideSystem.check('guide_char_gallery');
            } else if (currentChatType === 'group') {
                window.GuideSystem.check('guide_group_summary');
            }
        }
    } else if (type === 'sticker') {
        panelFunctionArea.style.display = 'none';
        panelStickerArea.style.display = 'flex';
        if (toggleExpansionBtn) toggleExpansionBtn.classList.remove('rotate-45');
        renderStickerCategories();
        renderStickerGrid();
    }

    setTimeout(() => {
        messageArea.scrollTop = messageArea.scrollHeight;
    }, 50);
}

function initKeyboardDetection() {
    if (!window.visualViewport) return;

    let maxViewportHeight = window.visualViewport.height;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // 初始化应用保存的高度
    if (db.savedKeyboardHeight) {
        document.documentElement.style.setProperty('--panel-height', `${db.savedKeyboardHeight}px`);
    }

    window.visualViewport.addEventListener('resize', () => {
        const currentHeight = window.visualViewport.height;
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        
        // 如果高度变小了，且输入框聚焦，说明键盘弹出了
        if (currentHeight < maxViewportHeight && isInputFocused) {
            const diff = maxViewportHeight - currentHeight;
            // 简单的阈值判断，防止误判
            if (diff > 150) { 
                const keyboardHeight = diff;
                
                // iOS 下，键盘弹出时我们不应该增加 --panel-height，因为浏览器会自动调整视口
                // 增加高度会导致输入框被顶得过高，遮挡消息
                if (!isIOS) {
                    document.documentElement.style.setProperty('--panel-height', `${keyboardHeight}px`);
                }
                
                // 保存到 DB (防抖)
                if (db.savedKeyboardHeight !== keyboardHeight) {
                    db.savedKeyboardHeight = keyboardHeight;
                    if (typeof saveData === 'function') {
                        saveData();
                    }
                }

                // 键盘弹出后，确保消息区域滚动到底部
                if (targetScreen && targetScreen.id === 'chat-room-screen') {
                    setTimeout(() => {
                        if (messageArea) messageArea.scrollTop = messageArea.scrollHeight;
                    }, 100);
                }
            }
        } else if (currentHeight > maxViewportHeight) {
            // 可能是地址栏收起导致的高度增加，更新最大高度
            maxViewportHeight = currentHeight;
        }
    });

    // 修复 iOS 键盘弹出导致的页面偏移（光标错位、点击错位）
    if (isIOS) {
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // 键盘弹出时，强制重置滚动位置，防止 iOS 自动滚动导致的错位
                setTimeout(() => {
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                }, 50);
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // 键盘收起时，再次重置滚动位置
                setTimeout(() => {
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                    // 额外触发一次 resize 检查，确保布局恢复
                    window.dispatchEvent(new Event('resize'));
                }, 50);
            }
        });
    }
}

// 底部导航栏逻辑
function setupBottomNavigation() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetId = item.getAttribute('data-target');
            if (targetId) {
                // 切换屏幕
                switchScreen(targetId);
                
                // 更新所有底部导航栏的选中状态
                document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => {
                    if (nav.getAttribute('data-target') === targetId) {
                        nav.classList.add('active');
                    } else {
                        nav.classList.remove('active');
                    }
                });
            }
        });
    });
}

function setupPhoneScreen() {
    const bubble = document.getElementById('burnout-bubble');
    if (bubble) {
        bubble.addEventListener('click', () => {
            document.getElementById('burnout-update-modal').classList.add('visible');
        });
    }
}

function setupFunctionPanelSwiper() {
    const panelArea = document.getElementById('panel-function-area');
    const originalGrid = panelArea.querySelector('.expansion-grid');
    if (!originalGrid) return; 

    // 获取所有 expansion-item
    const items = Array.from(originalGrid.querySelectorAll('.expansion-item'));
    if (items.length === 0) return;

    // 创建新结构
    const swiperContainer = document.createElement('div');
    swiperContainer.className = 'function-swiper-container';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'function-swiper-wrapper';

    const pagination = document.createElement('div');
    pagination.className = 'function-pagination';

    const itemsPerPage = 8;
    const pageCount = Math.ceil(items.length / itemsPerPage);

    for (let i = 0; i < pageCount; i++) {
        const slide = document.createElement('div');
        slide.className = 'function-slide';
        
        const pageItems = items.slice(i * itemsPerPage, (i + 1) * itemsPerPage);
        pageItems.forEach(item => slide.appendChild(item));
        
        wrapper.appendChild(slide);

        const dot = document.createElement('span');
        dot.className = `dot ${i === 0 ? 'active' : ''}`;
        pagination.appendChild(dot);
    }

    // 移除旧 grid
    originalGrid.remove();

    swiperContainer.appendChild(wrapper);
    // 只有多页时才显示 pagination
    if (pageCount > 1) {
        swiperContainer.appendChild(pagination);
    }
    
    panelArea.appendChild(swiperContainer);

    // 绑定滚动事件更新 pagination
    wrapper.addEventListener('scroll', () => {
        const width = wrapper.offsetWidth;
        if (width > 0) {
            const index = Math.round(wrapper.scrollLeft / width);
            const dots = pagination.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    // 桌面端鼠标拖拽翻页
    let dragStartX = 0;
    let dragCurrentX = 0;
    let isDragging = false;

    wrapper.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.pageX;
        dragCurrentX = dragStartX;
        wrapper.style.scrollBehavior = 'auto';
        wrapper.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        dragCurrentX = e.pageX;
        const diff = dragCurrentX - dragStartX;
        wrapper.scrollLeft = wrapper.scrollLeft - diff;
        dragStartX = dragCurrentX;
        const width = wrapper.offsetWidth;
        if (width > 0) {
            const index = Math.round(wrapper.scrollLeft / width);
            const dots = pagination.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        wrapper.style.scrollBehavior = 'smooth';
        wrapper.style.cursor = '';
        const width = wrapper.offsetWidth;
        if (width > 0) {
            const index = Math.round(wrapper.scrollLeft / width);
            wrapper.scrollTo({ left: index * width, behavior: 'smooth' });
            const dots = pagination.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    wrapper.addEventListener('dragstart', (e) => e.preventDefault());
}

function refreshFunctionPanelSwiper() {
    const panelArea = document.getElementById('panel-function-area');
    if (!panelArea) return;

    const container = panelArea.querySelector('.function-swiper-container');
    if (!container) {
        setupFunctionPanelSwiper();
        return;
    }

    const wrapper = container.querySelector('.function-swiper-wrapper');
    if (!wrapper) return;

    const allItems = Array.from(wrapper.querySelectorAll('.expansion-item'));
    if (allItems.length === 0) return;

    const itemsPerPage = 8;
    const pageCount = Math.ceil(allItems.length / itemsPerPage);
    const oldPageCount = wrapper.querySelectorAll('.function-slide').length;

    if (pageCount === oldPageCount) return;

    const pagination = container.querySelector('.function-pagination');
    wrapper.innerHTML = '';

    for (let i = 0; i < pageCount; i++) {
        const slide = document.createElement('div');
        slide.className = 'function-slide';
        const pageItems = allItems.slice(i * itemsPerPage, (i + 1) * itemsPerPage);
        pageItems.forEach(item => slide.appendChild(item));
        wrapper.appendChild(slide);
    }

    if (pagination) {
        pagination.innerHTML = '';
        for (let i = 0; i < pageCount; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot' + (i === 0 ? ' active' : '');
            pagination.appendChild(dot);
        }
        if (pageCount <= 1) {
            pagination.style.display = 'none';
        } else {
            pagination.style.display = '';
        }
    }

    wrapper.scrollLeft = 0;
}

window.refreshFunctionPanelSwiper = refreshFunctionPanelSwiper;
