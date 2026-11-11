// --- 联系人界面逻辑 (js/contacts.js) ---

let currentPersonaIndex = 0;
let currentEditingBindingCharId = null;

// 联系人屏幕初始化
function setupContactsScreen() {
    renderMyProfile();
    renderContactList();
    setupFriendSearch();

    // 绑定我的名片点击事件 -> 已移动到 Menu 页的「收藏」入口
    const myProfileSection = document.getElementById('my-profile-section');
    if (myProfileSection) {
        myProfileSection.style.cursor = 'default';
    }

    // 点击遮罩关闭 Profile Card
    const profileCardModal = document.getElementById('profile-card-modal');
    if (profileCardModal) {
        profileCardModal.addEventListener('click', (e) => {
            if (e.target === profileCardModal) {
                profileCardModal.classList.remove('visible');
            }
        });
    }

    // 资料卡中的“发消息”按钮
    const pcMessageBtn = document.getElementById('pc-message-btn');
    if (pcMessageBtn) {
        pcMessageBtn.addEventListener('click', () => {
            const charId = pcMessageBtn.dataset.charId;
            if (charId) {
                document.getElementById('profile-card-modal').classList.remove('visible');
                currentChatId = charId;
                currentChatType = 'private';
                const char = db.characters.find(c => c.id === charId);
                if (char) {
                    updateCustomBubbleStyle(currentChatId, char.customBubbleCss, char.useCustomBubbleCss);
                }
                openChatRoom(currentChatId, currentChatType);
            }
        });
    }
    
    // 初始化资料卡设置按钮
    const pcSettingsBtn = document.getElementById('pc-settings-btn');
    if (pcSettingsBtn) {
        pcSettingsBtn.addEventListener('click', () => {
            const charId = document.getElementById('pc-message-btn').dataset.charId;
            if (charId) {
                document.getElementById('profile-card-modal').classList.remove('visible');
                currentChatId = charId;
                currentChatType = 'private';
                loadSettingsToSidebar();
                switchScreen('chat-settings-screen');
            }
        });
    }

    // 资料卡：关闭 / 重新生成档案
    const pc2CloseBtn = document.getElementById('pc2-close-btn');
    if (pc2CloseBtn) {
        pc2CloseBtn.addEventListener('click', () => {
            document.getElementById('profile-card-modal').classList.remove('visible');
        });
    }
    const pcRegenBtn = document.getElementById('pc-regen-btn');
    if (pcRegenBtn) {
        pcRegenBtn.addEventListener('click', () => {
            const charId = pcRegenBtn.dataset.charId;
            if (charId && window.MieCharProfile) window.MieCharProfile.regenerate(charId);
        });
    }

    // --- My Profile Screen Listeners ---
    const mpSaveBtn = document.getElementById('mp-save-btn');
    if (mpSaveBtn) mpSaveBtn.addEventListener('click', saveCurrentPersona);

    const mpAddBindingBtn = document.getElementById('mp-add-binding-btn');
    if (mpAddBindingBtn) mpAddBindingBtn.addEventListener('click', openCharSelectModal);

    const mpDeletePersonaBtn = document.getElementById('mp-delete-persona-btn');
    if (mpDeletePersonaBtn) mpDeletePersonaBtn.addEventListener('click', deleteCurrentPersona);

    const mpSetActiveBtn = document.getElementById('mp-set-active-btn');
    if (mpSetActiveBtn) mpSetActiveBtn.addEventListener('click', setAsActivePersona);

    // Carousel Avatar Upload
    const mpAvatarUpload = document.getElementById('mp-carousel-avatar-upload');
    if (mpAvatarUpload) {
        mpAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 300, maxHeight: 300});
                    // 更新当前显示的人设头像
                    if (db.myPersonaPresets && db.myPersonaPresets[currentPersonaIndex]) {
                        db.myPersonaPresets[currentPersonaIndex].avatar = compressedUrl;
                        // 重新渲染当前 active 的图片
                        // 找到当前居中的 img
                        const activeImg = document.querySelector('.mp-carousel-item.active img');
                        if (activeImg) activeImg.src = compressedUrl;
                        updateBgBlur(compressedUrl);
                    }
                } catch (err) {
                    showToast('头像处理失败');
                }
            }
        });
    }

    // Exclusive Panel Buttons
    document.getElementById('mp-panel-close-btn')?.addEventListener('click', closeExclusivePanel);
    document.getElementById('mp-exclusive-sheet')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('mp-exclusive-sheet')) closeExclusivePanel();
    });
    
    document.getElementById('mp-panel-confirm-btn')?.addEventListener('click', confirmExclusiveSetting);
    document.getElementById('mp-panel-unbind-btn')?.addEventListener('click', unbindCharacter);

    // Char Select Modal Buttons
    document.getElementById('mp-char-select-cancel')?.addEventListener('click', () => {
        document.getElementById('mp-char-select-modal').classList.remove('visible');
    });
    document.getElementById('mp-char-select-confirm')?.addEventListener('click', confirmCharSelection);
    
    // 监听输入框变化，实时更新内存数据 (name, persona)
    document.getElementById('mp-name-input')?.addEventListener('input', (e) => {
        if (db.myPersonaPresets[currentPersonaIndex]) {
            db.myPersonaPresets[currentPersonaIndex].name = e.target.value;
        }
    });
    document.getElementById('mp-persona-input')?.addEventListener('input', (e) => {
        if (db.myPersonaPresets[currentPersonaIndex]) {
            db.myPersonaPresets[currentPersonaIndex].persona = e.target.value;
        }
    });
}

// 渲染联系人页面的“我的名片”
function renderMyProfile() {
    let myName = 'User Name';
    let myStatus = '';
    let myAvatar = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    let activePersona = null;
    if (db.activePersonaId) {
        activePersona = db.myPersonaPresets.find(p => p.id === db.activePersonaId);
    }
    
    // 如果没有指定的 activePersona，回退到第一个
    if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) {
        activePersona = db.myPersonaPresets[0];
    }

    if (activePersona) {
        myName = activePersona.name || 'User';
        myStatus = activePersona.persona || '';
        myAvatar = activePersona.avatar || myAvatar;
    } else if (db.characters && db.characters.length > 0) {
        const firstChar = db.characters[0];
        myName = firstChar.myName || 'User Name';
        myStatus = firstChar.myPersona ? firstChar.myPersona.substring(0, 30) : ''; 
        myAvatar = firstChar.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    }

    const avatarEl = document.getElementById('contacts-my-avatar');
    const nameEl = document.getElementById('contacts-my-name');
    const statusEl = document.getElementById('contacts-my-status');

    if (avatarEl) avatarEl.src = myAvatar;
    if (nameEl) nameEl.textContent = myName;
    if (statusEl) {
        statusEl.textContent = ''; // 清空内容
        statusEl.style.display = 'none'; // 隐藏元素
    }
}

function escapeContactHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ================= Tinder 风格好友卡片 =================

// 渲染联系人列表（堆叠大卡 + 顶部头像行 + 划掉切换）
function renderContactList() {
    const stack = document.getElementById('contacts-list');
    const stage = document.getElementById('friend-swipe-stage');
    const countEl = document.getElementById('friends-count');
    const dotsEl = document.getElementById('friend-carousel-dots');
    const avatarRow = document.getElementById('friends-avatar-row');
    if (!stack) return;

    stack.innerHTML = '';
    if (dotsEl) dotsEl.innerHTML = '';
    if (avatarRow) avatarRow.innerHTML = '';

    const allContacts = db.characters || [];
    if (countEl) countEl.textContent = allContacts.length;

    // 按名称排序
    const sortedContacts = [...allContacts].sort((a, b) => {
        return (a.remarkName || a.realName).localeCompare(b.remarkName || b.realName);
    });

    // 重置状态
    stack._friendActiveIndex = 0;
    stack.classList.toggle('is-empty', sortedContacts.length === 0);
    // card-swap 式切换：卡组顺序用数组管理，DOM 不移动（移动 DOM 会重置过渡动画）
    stack._cardOrder = sortedContacts.map(c => String(c.id));

    if (!sortedContacts.length) {
        stack.innerHTML = `
            <div class="friends-empty" style="position:absolute;inset:0;margin:auto;">
                <div class="friends-empty-orb">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <line x1="19" y1="8" x2="19" y2="14"></line>
                        <line x1="22" y1="11" x2="16" y2="11"></line>
                    </svg>
                </div>
                <div class="friends-empty-title">还没有好友</div>
                <div class="friends-empty-hint">在聊天页点右上角的 + 创建第一个角色吧</div>
            </div>`;
        return;
    }

    // 渲染每张卡片（所有卡片叠在一起，后续通过 updateStackVisual 控制层次）
    sortedContacts.forEach((char, index) => {
        const card = document.createElement('div');
        card.className = 'friend-card';
        card.dataset.charId = char.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', '查看 ' + (char.remarkName || char.realName || '好友') + ' 的资料');

        const msgCount = Array.isArray(char.history) ? char.history.length : 0;

        card.innerHTML = `
            <img src="${escapeContactHtml(char.avatar)}" alt="${escapeContactHtml(char.remarkName || char.realName)}" class="friend-card-photo" draggable="false">
            <div class="friend-card-shade"></div>
            <!-- 右上角三个点（白色） -->
            <button type="button" class="friend-card-more" aria-label="更多">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <circle cx="6"  cy="12" r="1.7" fill="#ffffff"/>
                    <circle cx="12" cy="12" r="1.7" fill="#ffffff"/>
                    <circle cx="18" cy="12" r="1.7" fill="#ffffff"/>
                </svg>
            </button>
            <!-- 叉（左下）/ 爱心（右下）—— 拖动时弹出 -->
            <div class="friend-card-badge friend-card-badge-left" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="5" x2="19" y2="19"></line>
                    <line x1="19" y1="5" x2="5" y2="19"></line>
                </svg>
            </div>
            <div class="friend-card-badge friend-card-badge-right" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </div>
        `;
        card.dataset.charName = char.remarkName || char.realName || '未命名';

        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProfileCard(char.id);
            }
        });

        // 三个点：阻止事件冒泡，避免触发卡片点击
        const moreBtn = card.querySelector('.friend-card-more');
        if (moreBtn) {
            moreBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openProfileCard(char.id); // 暂时等同点击卡片（后续可做更多菜单）
            });
        }

        stack.appendChild(card);

        // 顶部头像 pill
        if (avatarRow) {
            const pill = document.createElement('div');
            pill.className = 'friend-avatar-pill' + (index === 0 ? ' is-active' : '');
            pill.dataset.charId = char.id;
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.setAttribute('aria-label', '切换到 ' + (char.remarkName || char.realName || '好友'));
            pill.innerHTML = `<img src="${escapeContactHtml(char.avatar)}" alt="" draggable="false">`;
            pill.addEventListener('click', () => focusStackCard(stack, avatarRow, dotsEl, index));
            pill.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pill.click(); }
            });
            avatarRow.appendChild(pill);
        }

        // 底部指示点（保留但可隐藏）
        if (dotsEl) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'friend-dot' + (index === 0 ? ' is-active' : '');
            dot.setAttribute('aria-label', '查看第 ' + (index + 1) + ' 位好友');
            dot.addEventListener('click', () => focusStackCard(stack, avatarRow, dotsEl, index));
            dotsEl.appendChild(dot);
        }
    });

    updateStackVisual(stack, avatarRow, dotsEl);
    setupFriendSwipe(stack, avatarRow, dotsEl);
}

// 更新卡片堆叠视觉（谁在前面谁在后面）
function ensureFriendCardNameEl(stack) {
    if (!stack) return null;
    const host = stack.parentElement || stack;
    let el = host.querySelector('.friend-card-name');
    if (!el) {
        el = document.createElement('div');
        el.className = 'friend-card-name';
        host.appendChild(el);
    }
    return el;
}

// 按当前卡组顺序返回卡片元素（card-swap：顺序存于 _cardOrder，不依赖 DOM 顺序）
function orderedCards(stack) {
    const cards = Array.from(stack.querySelectorAll('.friend-card'));
    const order = stack._cardOrder;
    if (!order || !order.length) return cards;
    const map = new Map(cards.map(c => [String(c.dataset.charId), c]));
    const out = order.map(id => map.get(id)).filter(Boolean);
    cards.forEach(c => { if (out.indexOf(c) === -1) out.push(c); });  // 兜底
    return out;
}

function updateStackVisual(stack, avatarRow, dotsEl) {
    if (!stack) return;
    const cards = orderedCards(stack);
    if (!cards.length) return;

    // 循环队列：activeIndex 永远是 0（队首），后面依次排队。
    // 切换动画由 CSS 槽位过渡完成（540ms 3D），这里只负责分配槽位类。
    cards.forEach((card, i) => {
        card.classList.remove('is-active', 'is-behind-1', 'is-behind-2', 'is-behind-3', 'is-behind-n');
        card.classList.remove('is-leaving-left', 'is-leaving-right', 'is-dragging');
        card.style.display = '';
        card.style.transform = '';
        card.style.opacity = '';
        card.style.transition = '';

        if (i === 0) card.classList.add('is-active');
        else if (i === 1) card.classList.add('is-behind-1');
        else if (i === 2) card.classList.add('is-behind-2');
        else if (i === 3) card.classList.add('is-behind-3');
        else card.classList.add('is-behind-n');
    });

    // 卡片下面的名字（单例，跟随队首卡显示）
    const nameEl = ensureFriendCardNameEl(stack);
    if (nameEl) nameEl.textContent = cards[0].dataset.charName || '';

    // 同步顶部头像 pill —— 用最前面那张卡的 charId 匹配
    if (avatarRow) {
        const frontCard = cards[0];
        const frontId = frontCard ? frontCard.dataset.charId : null;
        const pills = Array.from(avatarRow.querySelectorAll('.friend-avatar-pill'));
        pills.forEach(pill => {
            pill.classList.toggle('is-active', pill.dataset.charId === frontId);
        });
    }
    // 指示点也同步
    if (dotsEl && avatarRow) {
        const frontCard = cards[0];
        const frontId = frontCard ? frontCard.dataset.charId : null;
        const pills = Array.from(avatarRow.querySelectorAll('.friend-avatar-pill'));
        const idx = pills.findIndex(p => p.dataset.charId === frontId);
        Array.from(dotsEl.children).forEach((dot, i) => dot.classList.toggle('is-active', i === idx));
    }
}

// 点击头像聚焦到某个卡片（把该角色排到队首）
function focusStackCard(stack, avatarRow, dotsEl, index) {
    if (!stack) return;
    const pills = avatarRow ? Array.from(avatarRow.querySelectorAll('.friend-avatar-pill')) : [];
    const targetPill = pills[index];
    if (!targetPill) return;
    const targetId = String(targetPill.dataset.charId);

    // 在顺序数组中把该角色移到队首（DOM 不动，槽位过渡自动播放）
    const order = stack._cardOrder;
    if (order && order.length) {
        const i = order.findIndex(id => id === targetId);
        if (i > 0) { order.splice(i, 1); order.unshift(targetId); }
    }
    updateStackVisual(stack, avatarRow, dotsEl);
}

// 下一张（循环：队首卡排到队尾，槽位 540ms 过渡顶上来）
function nextStackCard(stack, avatarRow, dotsEl) {
    if (!stack) return false;
    const cards = orderedCards(stack);
    if (cards.length <= 1) return false;
    const order = stack._cardOrder;
    if (order && order.length > 1) {
        order.push(order.shift());
    }
    updateStackVisual(stack, avatarRow, dotsEl);
    return true;
}


// 设置 swipe 拖拽交互 —— card-swap 式：
// 按住队首卡拖动有弹性阻力 + 微旋转；轻扫（快速）或拖远松手 → 当前卡滑入牌堆队尾，
// 后面的卡沿槽位曲线 540ms 顶上来；轻点 → 打开资料卡；向右拖走 → 喜欢进聊天。
function setupFriendSwipe(stack, avatarRow, dotsEl) {
    if (!stack || stack._swipeBound) return;
    stack._swipeBound = true;

    const active = () => stack.querySelector('.friend-card.is-active');
    const TAP_MAX = 6;          // 位移小于此视为点击
    const SWIPE_DIST = 70;      // 拖远触发切换（px）
    const FLICK_V = 0.6;        // 轻扫速度阈值（px/ms）
    const FLICK_DIST = 24;      // 轻扫最小位移（px）
    const RESIST = 160;         // 拖动弹性阻力（tanh）
    const MAX_ROT = 14;         // 拖动旋转上限（度）

    const resist = v => RESIST * Math.tanh(v / RESIST);

    const drag = {
        active: false, pointerId: null,
        x0: 0, y0: 0, t0: 0, dx: 0, dy: 0,
        moved: false, suppressedClick: false,
    };

    // 检查是否是可拖拽的 active card
    const getDraggableCard = (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return null;
        return target.closest('.friend-card.is-active') || null;
    };

    stack.addEventListener('pointerdown', (e) => {
        if (!getDraggableCard(e)) return; // 只有 active 卡响应
        if (stack._animating) return;

        drag.active = true;
        drag.pointerId = e.pointerId;
        drag.x0 = e.clientX;
        drag.y0 = e.clientY;
        drag.t0 = performance.now();
        drag.dx = 0; drag.dy = 0;
        drag.moved = false;
        drag.suppressedClick = false;

        const card = active();
        if (card) card.classList.add('is-dragging');
        try { stack.setPointerCapture(e.pointerId); } catch (_) {}
    });

    stack.addEventListener('pointermove', (e) => {
        if (!drag.active || e.pointerId !== drag.pointerId) return;

        const card = active();
        if (!card) return;

        drag.dx = e.clientX - drag.x0;
        drag.dy = e.clientY - drag.y0;
        if (Math.abs(drag.dx) > 6 || Math.abs(drag.dy) > 6) drag.moved = true;

        // tanh 弹性阻力 + 随水平位移微旋转（参考 card-swap）
        const rx = resist(drag.dx);
        const ry = resist(drag.dy);
        const rot = Math.max(-MAX_ROT, Math.min(MAX_ROT, rx * 0.05));
        card.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;

        // 徽章显隐：根据拖动方向 + 幅度，连续放大（左叉右心，保留原功能）
        const leftBadge  = card.querySelector('.friend-card-badge-left');
        const rightBadge = card.querySelector('.friend-card-badge-right');
        const SHOW_THRESHOLD = 18;   // 位移 ≥18px 徽章开始出现

        const goingLeft = drag.dx < 0;
        const badge = goingLeft ? leftBadge : rightBadge;
        const other = goingLeft ? rightBadge : leftBadge;

        if (other) {
            other.classList.remove('is-show', 'is-ready');
            other.style.removeProperty('--badge-scale');
        }

        if (badge && Math.abs(drag.dx) > SHOW_THRESHOLD) {
            // 0 → 1 的连续进度，按钮随之由小变大
            const p = Math.min((Math.abs(drag.dx) - SHOW_THRESHOLD) / (SWIPE_DIST - SHOW_THRESHOLD), 1);
            badge.classList.add('is-show');
            badge.style.setProperty('--badge-scale', (0.45 + p * 0.55).toFixed(3));
            badge.classList.toggle('is-ready', p >= 1);
        } else if (badge) {
            badge.classList.remove('is-show', 'is-ready');
            badge.style.removeProperty('--badge-scale');
        }
    });

    // 统一清理徽章状态
    const resetBadges = (card) => {
        if (!card) return;
        ['.friend-card-badge-left', '.friend-card-badge-right'].forEach(sel => {
            const b = card.querySelector(sel);
            if (b) {
                b.classList.remove('is-show', 'is-strong', 'is-ready');
                b.style.removeProperty('--badge-scale');
            }
        });
    };

    const endSwipe = (e) => {
        if (!drag.active || e.pointerId !== drag.pointerId) return;
        drag.active = false;
        const card = active();
        if (!card) return;

        card.classList.remove('is-dragging');
        resetBadges(card);
        try { stack.releasePointerCapture(drag.pointerId); } catch (_) {}

        const dx = drag.dx;
        const dy = drag.dy;
        const dist = Math.hypot(dx, dy);
        const dt = Math.max(1, performance.now() - drag.t0);
        const velocity = dist / dt;

        // 轻点 → 打开资料卡（功能保留）
        if (dist < TAP_MAX) {
            card.style.transform = '';
            openProfileCard(card.dataset.charId);
            return;
        }

        const flick = velocity > FLICK_V && dist > FLICK_DIST;
        const far = dist > SWIPE_DIST;

        if (!flick && !far) {
            // 未达阈值：弹回原槽位（540ms 槽位过渡）
            card.style.transition = 'transform 540ms cubic-bezier(0.22, 0.77, 0.23, 1)';
            card.style.transform = '';
            setTimeout(() => { card.style.transition = ''; }, 560);
            drag.suppressedClick = true;
            return;
        }

        stack._animating = true;
        drag.suppressedClick = true;

        if (dx > 0) {
            // 右滑 = 喜欢 → 卡片向右飞出，进入聊天页（功能保留）
            card.classList.add('is-leaving-right');
            setTimeout(() => {
                card.classList.remove('is-leaving-right');
                card.style.transform = '';
                card.style.opacity = '';
                stack._animating = false;
                if (typeof openChatRoom === 'function' && card.dataset.charId) {
                    openChatRoom(card.dataset.charId, 'private');
                }
            }, 300);
        } else {
            // 左滑 / 轻扫 = 下一个：队首沿槽位 540ms 过渡滑入队尾，后面的卡顶上来
            nextStackCard(stack, avatarRow, dotsEl);
            stack._animating = false;
        }
    };

    stack.addEventListener('pointerup', endSwipe);
    stack.addEventListener('pointercancel', endSwipe);

    // 拖拽期间抑制 click
    stack.addEventListener('click', (e) => {
        if (drag.suppressedClick) {
            e.preventDefault();
            e.stopPropagation();
            drag.suppressedClick = false;
        } else if (drag.moved) {
            // 移动过也抑制这次 click（虽然 pointerup 已被我们接管，但保险）
            drag.suppressedClick = false;
        }
    }, true);

    // 键盘左右方向键切换
    if (!stack._keyBound) {
        stack._keyBound = true;
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('contacts-screen')?.classList.contains('active')) return;
            if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
            if (stack._animating) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                nextStackCard(stack, avatarRow, dotsEl);
            }
        });
    }
}

// --- 好友搜索 ---

function setupFriendSearch() {
    const overlay = document.getElementById('friend-search-overlay');
    const input = document.getElementById('friend-search-input');
    const cancelBtn = document.getElementById('friend-search-cancel');
    const searchBtn = document.getElementById('contacts-search-btn');
    if (!overlay || !input || !searchBtn) return;

    if (searchBtn._friendSearchBound) return;
    searchBtn._friendSearchBound = true;

    searchBtn.addEventListener('click', () => openFriendSearch());
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeFriendSearch());

    input.addEventListener('input', () => renderFriendSearchResults(input.value));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFriendSearch();
        } else if (e.key === 'Enter') {
            const first = document.querySelector('#friend-search-results .friend-search-item');
            if (first) first.click();
        }
    });
}

function openFriendSearch() {
    const overlay = document.getElementById('friend-search-overlay');
    const input = document.getElementById('friend-search-input');
    if (!overlay) return;
    overlay.classList.add('is-open');
    if (input) {
        input.value = '';
        renderFriendSearchResults('');
        setTimeout(() => input.focus(), 60);
    }
}

function closeFriendSearch() {
    const overlay = document.getElementById('friend-search-overlay');
    const input = document.getElementById('friend-search-input');
    if (overlay) overlay.classList.remove('is-open');
    if (input) input.blur();
}

function highlightFriendMatch(text, query) {
    const escaped = escapeContactHtml(text);
    if (!query) return escaped;
    const qEsc = escapeContactHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + qEsc + ')', 'gi'), '<mark>$1</mark>');
}

function renderFriendSearchResults(query) {
    const container = document.getElementById('friend-search-results');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();

    if (!q) {
        const total = (db.characters || []).length;
        container.innerHTML = total
            ? '<div class="friend-search-hint">输入名字或备注开始搜索<br>共 ' + total + ' 位好友</div>'
            : '<div class="friend-search-hint">还没有好友可以搜索</div>';
        return;
    }

    const matches = (db.characters || []).filter(c => {
        const remark = (c.remarkName || '').toLowerCase();
        const real = (c.realName || '').toLowerCase();
        const persona = (c.persona || '').toLowerCase();
        return remark.includes(q) || real.includes(q) || persona.includes(q);
    });

    if (!matches.length) {
        container.innerHTML = '<div class="friend-search-empty">没有找到 “' + escapeContactHtml(query.trim()) + '”<br>试试别的名字或备注</div>';
        return;
    }

    container.innerHTML = '';
    matches.forEach(char => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'friend-search-item';

        const sub = char.realName && char.realName !== char.remarkName
            ? '真名：' + escapeContactHtml(char.realName)
            : escapeContactHtml((char.persona || '这个人很神秘，还没有留下签名').substring(0, 24));

        item.innerHTML = `
            <img src="${escapeContactHtml(char.avatar)}" alt="" class="friend-search-avatar" draggable="false">
            <div class="friend-search-info">
                <div class="friend-search-name">${highlightFriendMatch(char.remarkName || char.realName || '未命名', query.trim())}</div>
                <div class="friend-search-sub">${sub}</div>
            </div>
            <span class="friend-search-go">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
        `;

        item.addEventListener('click', () => focusFriendCard(char.id));
        container.appendChild(item);
    });
}

function focusFriendCard(charId) {
    closeFriendSearch();

    const stack = document.getElementById('contacts-list');
    const avatarRow = document.getElementById('friends-avatar-row');
    const dotsEl = document.getElementById('friend-carousel-dots');
    if (!stack) return;

    const cards = Array.from(stack.querySelectorAll('.friend-card'));
    const index = cards.findIndex(card => card.dataset.charId === charId);
    if (index === -1) return;

    focusStackCard(stack, avatarRow, dotsEl, index);

    const card = cards[index];
    if (card) {
        card.classList.remove('is-found');
        void card.offsetWidth;
        card.classList.add('is-found');
        setTimeout(() => card.classList.remove('is-found'), 2000);
    }
}

// 打开角色资料卡
function openProfileCard(charId) {
    const char = db.characters.find(c => c.id === charId);
    if (!char) return;

    const modal = document.getElementById('profile-card-modal');
    modal.dataset.charId = charId;

    document.getElementById('pc-avatar').src = char.avatar;
    // 姓名：我们给他的备注名 → 下面一行是 @真名
    document.getElementById('pc-name').textContent = char.remarkName || char.realName || '未命名';
    const remarkEl = document.getElementById('pc-remark');
    if (remarkEl) remarkEl.textContent = '';
    const realEl = document.getElementById('pc-realname');
    if (realEl) realEl.textContent = char.realName ? `@${char.realName}` : '';

    // 背景层：角色头像超强模糊作为磨砂底色
    const bgUrl = String(char.avatar || '').replace(/"/g, '%22');
    modal.style.setProperty('--pc-avatar-url', bgUrl ? `url("${bgUrl}")` : 'none');

    // 从角色头像取样 → 弹窗主色（磨砂玻璃的"彩"来源）
    applyAvatarThemeToModal(char.avatar, modal);

    modal.classList.add('visible');
    if (window.MieCharProfile) window.MieCharProfile.ensureProfile(charId);
}

// 头像取色：用 canvas 取样像素平均，写入 CSS 变量
function applyAvatarThemeToModal(avatarUrl, modal) {
    // 默认色（取色失败时兜底）
    const fallback = ['#ff758c', '#a18cd1', '#7ab5ff'];
    modal.style.setProperty('--pc-color-a', fallback[0]);
    modal.style.setProperty('--pc-color-b', fallback[1]);
    modal.style.setProperty('--pc-color-c', fallback[2]);

    if (!avatarUrl) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        try {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 32;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0, 32, 32);
            const data = ctx.getImageData(0, 0, 32, 32).data;
            let r = 0, g = 0, b = 0, n = 0;
            // 取中间 60% 区域（避开边缘透明/白边）
            for (let y = 6; y < 26; y++) {
                for (let x = 6; x < 26; x++) {
                    const i = (y * 32 + x) * 4;
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
                }
            }
            if (n > 0) {
                r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
                // 主色（略饱和）
                modal.style.setProperty('--pc-color-a', `rgb(${r}, ${g}, ${b})`);
                // 亮一点的变体（右上角光斑）
                modal.style.setProperty('--pc-color-b', `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 40)}, 0.55)`);
                // 暗一点的变体（右下角光斑）
                modal.style.setProperty('--pc-color-c', `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 20)}, 0.45)`);
            }
        } catch (_) { /* 跨域或 canvas 被污染，用默认 */ }
    };
    img.onerror = () => { /* 网络失败，用默认 */ };
    img.src = avatarUrl;
}

// --- NEW My Profile Logic (Cover Flow) ---

function setupMyProfileScreen() {
    // 1. 数据检查与初始化
    if (!db.myPersonaPresets) {
        db.myPersonaPresets = [];
    }

    // 如果完全没有预设，尝试从第一个角色创建一个默认的
    if (db.myPersonaPresets.length === 0) {
        if (db.characters && db.characters.length > 0) {
            const c = db.characters[0];
            db.myPersonaPresets.push({
                id: generateUUID(),
                name: c.myName || 'User',
                avatar: c.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
                persona: c.myPersona || '',
                bindings: {} // 初始为空，保存时才会建立连接
            });
        } else {
            // 完全新号
            db.myPersonaPresets.push({
                id: generateUUID(),
                name: 'User',
                avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
                persona: '',
                bindings: {}
            });
        }
    }

    // 2. 补全字段 (针对老数据)
    db.myPersonaPresets.forEach(p => {
        if (!p.id) p.id = generateUUID();
        if (!p.bindings) p.bindings = {};
    });

    currentPersonaIndex = 0; // 重置到第一个
    renderPersonaCarousel();
    
    // 初始化时更新一下视觉效果 (需要等待DOM渲染)
    setTimeout(() => {
        updateCarouselVisuals();
        updatePersonaInfoArea(0);
    }, 50);
}

function renderPersonaCarousel() {
    const carousel = document.getElementById('mp-carousel');
    const indicators = document.getElementById('mp-carousel-indicators');
    carousel.innerHTML = '';
    indicators.innerHTML = '';

    // 计算 padding 以保证居中
    // 假设 Item Width = 100, 实际间距 = 60 (100 - 40)
    // 但 CSS 中设置了 scroll-snap-align: center，所以只要 padding 足够大即可
    const containerWidth = carousel.clientWidth || window.innerWidth;
    const itemWidth = 100; // CSS 固定
    const padding = (containerWidth - itemWidth) / 2;
    carousel.style.paddingLeft = `${padding}px`;
    carousel.style.paddingRight = `${padding}px`;

    // 渲染人设卡片
    db.myPersonaPresets.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'mp-carousel-item';
        
        const img = document.createElement('img');
        img.src = p.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
        img.className = 'mp-avatar-card';
        img.onclick = () => {
            if (item.classList.contains('active')) {
                document.getElementById('mp-carousel-avatar-upload').click();
            } else {
                item.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        };

        item.appendChild(img);
        carousel.appendChild(item);

        // Indicator
        const dot = document.createElement('div');
        dot.className = 'mp-indicator';
        indicators.appendChild(dot);
    });

    // 添加“新建”卡片
    const addItem = document.createElement('div');
    addItem.className = 'mp-carousel-item';
    addItem.innerHTML = `<div class="mp-add-card">+</div>`;
    addItem.onclick = createNewPersona;
    carousel.appendChild(addItem);

    // 监听滚动实现 Cover Flow 效果
    let isScrolling = false;
    
    const onScroll = () => {
        if (!isScrolling) {
            requestAnimationFrame(() => {
                updateCarouselVisuals();
                isScrolling = false;
            });
            isScrolling = true;
        }
    };
    
    carousel.removeEventListener('scroll', carousel._scrollHandler); // 移除旧监听器如果存在
    carousel._scrollHandler = onScroll;
    carousel.addEventListener('scroll', onScroll);
}

function updateCarouselVisuals() {
    const carousel = document.getElementById('mp-carousel');
    const items = Array.from(carousel.querySelectorAll('.mp-carousel-item'));
    const dots = document.querySelectorAll('.mp-indicator');
    
    const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
    
    let minDistance = Infinity;
    let newActiveIndex = -1;

    items.forEach((item, index) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const distance = Math.abs(containerCenter - itemCenter);
        
        // 动态样式计算 (Cover Flow)
        // 距离越远：Scale 越小 (0.8 -> 1.1)，Blur 越大 (2 -> 0)，Z-Index 越小
        
        // 归一化距离：相对于 itemWidth (约60-100)
        // 范围控制在 300px 内变化
        const range = 200; 
        let progress = Math.min(distance / range, 1); // 0 (center) -> 1 (far)
        
        const scale = 1.1 - (progress * 0.3); // 1.1 -> 0.8
        const blur = progress * 3; // 0 -> 3px
        const opacity = 1 - (progress * 0.4); // 1 -> 0.6
        const zIndex = 100 - Math.floor(progress * 100);
        
        item.style.transform = `scale(${scale})`;
        item.style.filter = `blur(${blur}px)`;
        item.style.opacity = opacity;
        item.style.zIndex = zIndex;

        // 找最近的 item 作为 active
        if (distance < minDistance) {
            minDistance = distance;
            newActiveIndex = index;
        }
    });

    // 只有当完全停下或者距离足够近时才切换数据上下文
    // 但为了响应性，这里实时高亮 index
    // 注意：最后一张是“新建按钮”，不算有效人设索引
    
    if (newActiveIndex !== -1) {
        items.forEach(it => it.classList.remove('active'));
        items[newActiveIndex].classList.add('active');
        
        // 更新 Indicator (注意 items 长度比 dots 多 1)
        dots.forEach((dot, idx) => {
            if (idx === newActiveIndex) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        // 如果索引变了，且是有效人设索引，更新下方信息
        if (newActiveIndex !== currentPersonaIndex && newActiveIndex < db.myPersonaPresets.length) {
            currentPersonaIndex = newActiveIndex;
            updatePersonaInfoArea(currentPersonaIndex);
        }
    }
}

function updatePersonaInfoArea(index) {
    const p = db.myPersonaPresets[index];
    if (!p) return;

    // 更新 Input 值 (避免触发 input 事件导致循环更新，直接设 value)
    const nameInput = document.getElementById('mp-name-input');
    const personaInput = document.getElementById('mp-persona-input');
    if (nameInput.value !== p.name) nameInput.value = p.name || '';
    if (personaInput.value !== p.persona) personaInput.value = p.persona || '';
    
    updateBgBlur(p.avatar);
    renderBindingTags(p);

    // Update "Set as Active" button state
    const setActiveBtn = document.getElementById('mp-set-active-btn');
    if (setActiveBtn) {
        // 判断当前是否是“激活”状态
        // 1. db.activePersonaId 匹配
        // 2. 或者 db.activePersonaId 为空且 index 为 0 (默认第一个)
        const isDefaultActive = !db.activePersonaId && index === 0;
        const isExplicitActive = db.activePersonaId === p.id;
        
        if (isDefaultActive || isExplicitActive) {
            setActiveBtn.classList.add('active');
            setActiveBtn.title = '当前展示中';
        } else {
            setActiveBtn.classList.remove('active');
            setActiveBtn.title = '设为展示名片';
        }
    }
}

function setAsActivePersona() {
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p) return;
    
    // Check if already active
    if (db.activePersonaId === p.id) return;
    if (!db.activePersonaId && currentPersonaIndex === 0) return;

    db.activePersonaId = p.id;
    saveData();
    renderMyProfile(); // 刷新联系人界面
    
    // 更新按钮状态
    updatePersonaInfoArea(currentPersonaIndex);
    
    showToast('已设为当前展示名片');
}

function updateBgBlur(url) {
    const bg = document.getElementById('mp-bg-blur');
    if (bg) {
        bg.style.backgroundImage = `url(${url})`;
    }
}

function renderBindingTags(preset) {
    const container = document.getElementById('mp-tags-container');
    const addBtn = document.getElementById('mp-add-binding-btn');
    container.innerHTML = ''; 
    
    if (preset.bindings) {
        Object.keys(preset.bindings).forEach(charId => {
            const char = db.characters.find(c => c.id === charId);
            if (!char) return; 

            const binding = preset.bindings[charId];
            const hasExtra = binding.extraPersona && binding.extraPersona.trim().length > 0;
            
            const tag = document.createElement('div');
            tag.className = `mp-tag ${hasExtra ? 'has-extra' : ''}`;
            tag.innerHTML = `
                <img src="${char.avatar}" class="mp-tag-avatar">
                <span>${char.remarkName}</span>
            `;
            tag.onclick = () => openExclusivePanel(charId);
            
            container.appendChild(tag);
        });
    }
    
    container.appendChild(addBtn);
}

function createNewPersona() {
    const newPersona = {
        id: generateUUID(),
        name: '新身份',
        avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', 
        persona: '',
        bindings: {}
    };
    db.myPersonaPresets.push(newPersona);
    renderPersonaCarousel();
    
    setTimeout(() => {
        const carousel = document.getElementById('mp-carousel');
        const items = document.querySelectorAll('.mp-carousel-item');
        if (items.length >= 2) {
            items[items.length - 2].scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }
    }, 100);
}

function deleteCurrentPersona() {
    if (db.myPersonaPresets.length <= 1) {
        showToast('至少保留一个档案');
        return;
    }
    
    if (confirm('确定删除当前人设档案吗？')) {
        db.myPersonaPresets.splice(currentPersonaIndex, 1);
        saveData();
        
        currentPersonaIndex = Math.max(0, currentPersonaIndex - 1);
        renderPersonaCarousel();
        
        setTimeout(() => {
            const carousel = document.getElementById('mp-carousel');
            const items = carousel.querySelectorAll('.mp-carousel-item');
            if (items[currentPersonaIndex]) {
               items[currentPersonaIndex].scrollIntoView({ inline: 'center' });
            }
        }, 50);
        
        showToast('已删除');
    }
}

// --- Tag & Binding Logic ---

function openExclusivePanel(charId) {
    currentEditingBindingCharId = charId;
    const p = db.myPersonaPresets[currentPersonaIndex];
    const binding = p.bindings[charId];
    const char = db.characters.find(c => c.id === charId);
    
    if (!binding || !char) return;

    document.getElementById('mp-panel-char-avatar').src = char.avatar;
    document.getElementById('mp-panel-char-name').textContent = char.remarkName;
    
    document.getElementById('mp-panel-input').value = binding.extraPersona || '';
    document.getElementById('mp-panel-override-check').checked = binding.override || false;

    document.getElementById('mp-exclusive-sheet').classList.add('visible');
}

function closeExclusivePanel() {
    document.getElementById('mp-exclusive-sheet').classList.remove('visible');
    currentEditingBindingCharId = null;
}

function confirmExclusiveSetting() {
    if (!currentEditingBindingCharId) return;
    
    const extra = document.getElementById('mp-panel-input').value;
    const override = document.getElementById('mp-panel-override-check').checked;
    
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (p.bindings[currentEditingBindingCharId]) {
        p.bindings[currentEditingBindingCharId].extraPersona = extra;
        p.bindings[currentEditingBindingCharId].override = override;
    }
    
    renderBindingTags(p);
    closeExclusivePanel();
}

function unbindCharacter() {
    if (!currentEditingBindingCharId) return;
    
    if (confirm('确定解除绑定？')) {
        const p = db.myPersonaPresets[currentPersonaIndex];
        delete p.bindings[currentEditingBindingCharId];
        renderBindingTags(p);
        closeExclusivePanel();
    }
}

// --- Char Selection Modal ---

function openCharSelectModal() {
    const list = document.getElementById('mp-char-select-list');
    list.innerHTML = '';
    
    const p = db.myPersonaPresets[currentPersonaIndex];
    const existingIds = Object.keys(p.bindings || {});
    
    const availableChars = db.characters.filter(c => !existingIds.includes(c.id));
    
    if (availableChars.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">所有角色都已绑定</div>';
    } else {
        availableChars.forEach(char => {
            const item = document.createElement('div');
            item.className = 'mp-select-item';
            item.innerHTML = `
                <input type="checkbox" class="mp-select-checkbox" value="${char.id}">
                <img src="${char.avatar}" class="mp-select-avatar">
                <span class="mp-select-name">${char.remarkName}</span>
            `;
            item.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('input');
                    cb.checked = !cb.checked;
                }
            };
            list.appendChild(item);
        });
    }
    
    document.getElementById('mp-char-select-modal').classList.add('visible');
}

function confirmCharSelection() {
    const checkboxes = document.querySelectorAll('#mp-char-select-list input:checked');
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p.bindings) p.bindings = {};
    
    checkboxes.forEach(cb => {
        const charId = cb.value;
        p.bindings[charId] = {
            extraPersona: '',
            override: false
        };
    });
    
    renderBindingTags(p);
    document.getElementById('mp-char-select-modal').classList.remove('visible');
}

// --- Token Breakdown Modal Logic ---
function showTokenBreakdownModal(breakdown) {
    const modal = document.getElementById('token-breakdown-modal');
    const listContainer = document.getElementById('token-breakdown-list');
    if (!modal || !listContainer) return;

    listContainer.innerHTML = '';

    const items = [
        { name: '系统基础指令', value: breakdown.baseSystem, color: '#007AFF' },
        { name: '世界书设定', value: breakdown.worldBook, color: '#34C759' },
        { name: '角色设定', value: breakdown.charPersona, color: '#FF9500' },
        { name: '用户设定', value: breakdown.userPersona, color: '#FF3B30' },
        { name: '共同回忆', value: breakdown.memory, color: '#AF52DE' },
        { name: '聊天记录', value: breakdown.history, color: '#5856D6' }
    ];

    const total = breakdown.total || 1; // 防止除以 0

    items.forEach(item => {
        const percentage = ((item.value / total) * 100).toFixed(1);
        const html = `
            <div class="token-breakdown-item">
                <div class="token-breakdown-header">
                    <span class="token-breakdown-name">${item.name}</span>
                    <span class="token-breakdown-value">${item.value} (${percentage}%)</span>
                </div>
                <div class="token-breakdown-bar-bg">
                    <div class="token-breakdown-bar-fill" style="width: ${percentage}%; background-color: ${item.color};"></div>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', html);
    });

    // 添加总计
    listContainer.insertAdjacentHTML('beforeend', `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-weight: bold;">
            <span>总计估算</span>
            <span>${breakdown.total}</span>
        </div>
    `);

    modal.classList.add('visible');

    const closeBtn = document.getElementById('close-token-breakdown-btn');
    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.remove('visible');
    }
}

// --- Save & Sync Logic ---

async function saveCurrentPersona() {
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p) return;

    p.name = document.getElementById('mp-name-input').value;
    p.persona = document.getElementById('mp-persona-input').value;

    let syncCount = 0;
    if (p.bindings) {
        Object.keys(p.bindings).forEach(charId => {
            const char = db.characters.find(c => c.id === charId);
            if (char) {
                const binding = p.bindings[charId];
                
                char.myName = p.name;
                char.myAvatar = p.avatar;
                
                let finalPersona = '';
                if (binding.override) {
                    finalPersona = binding.extraPersona || '';
                } else {
                    const base = p.persona || '';
                    const extra = binding.extraPersona || '';
                    finalPersona = base + (base && extra ? '\n' : '') + extra;
                }
                char.myPersona = finalPersona;
                
                syncCount++;
            }
        });
    }

    await saveData();
    renderMyProfile(); 
    showToast(`已保存并同步到 ${syncCount} 个角色`);
}
