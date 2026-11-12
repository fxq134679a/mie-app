// ===================================================================
// x_bridge.js — X社交模块(pp.js) 适配桥
// pp.js 期望宿主提供 GeminiChatDB 风格的 window.db：
//   - db.chats.toArray()/get(id)   → 角色列表 {id, name, isGroup, settings:{aiAvatar}}
//   - db.apiConfig.get('main')     → API配置 {proxyUrl, apiKey, model}
// 本桥把 miemie 的 db.characters / db.groups / db.apiSettings 实时映射为上述接口，
// 无需复制数据，读取时动态生成。
// ===================================================================
(function () {
    'use strict';

    // 推特风格随机默认头像池（DiceBear API 生成，无需托管图片）
    const __xAvatarPool = [
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Felix&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Aneka&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Leo&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Mia&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Max&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Lily&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Jack&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Zoe&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Sam&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Ella&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Noah&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Aria&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Kai&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Nora&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Finn&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Iris&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Oscar&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Luna&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Milo&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
        'https://api.dicebear.com/9.2/loreleiNeutral.svg?seed=Ruby&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf'
    ];
    window.__getXRandomAvatar = function () {
        const custom = (window.db && window.db.xAvatarSettings) || [];
        const pool = custom.length > 0 ? custom : __xAvatarPool;
        return pool[Math.floor(Math.random() * pool.length)];
    };

    function installBridge() {
        // 修复：pp.js 创建的 #x-social-screen 带内联 display:flex，会一直盖在主屏幕上。
        // 注入规则让它跟随 miemie 的 .screen.active 机制显隐。
        // 同时固定屏幕位置，防止滚动时底部栏移位。
        if (!document.getElementById('x-social-screen-fix-style')) {
            const style = document.createElement('style');
            style.id = 'x-social-screen-fix-style';
            style.textContent = `
                #x-social-screen{
                    display:none !important;
                    position:fixed !important;
                    top:0 !important;
                    left:0 !important;
                    width:100% !important;
                    height:100dvh !important;
                    overflow:hidden !important;
                }
                #x-social-screen.active{ display:flex !important; }
            `;
            document.head.appendChild(style);
        }

        if (!window.__xDayModeSyncAdded) {
            window.__xDayModeSyncAdded = true;
            const __syncXDayMode = () => {
                const xScreen = document.getElementById('x-social-screen');
                const homeScreen = document.getElementById('home-screen');
                if (!xScreen || !homeScreen) return;
                const shouldBeDay = homeScreen.classList.contains('day-mode');
                // 状态一致时不写 class，避免自触发的 MutationObserver 死循环（曾导致整页卡死无法点击）
                if (xScreen.classList.contains('day-mode') === shouldBeDay) return;
                if (shouldBeDay) {
                    xScreen.classList.add('day-mode');
                } else {
                    xScreen.classList.remove('day-mode');
                }
            };
            const __xScreenObserver = new MutationObserver(__syncXDayMode);
            const __startXDayModeSync = () => {
                const xScreen = document.getElementById('x-social-screen');
                if (xScreen) {
                    __xScreenObserver.observe(xScreen, { attributes: true, attributeFilter: ['class'] });
                    __syncXDayMode();
                } else {
                    setTimeout(__startXDayModeSync, 500);
                }
            };
            __startXDayModeSync();
            const __homeScreen = document.getElementById('home-screen');
            if (__homeScreen) {
                new MutationObserver(__syncXDayMode).observe(__homeScreen, { attributes: true, attributeFilter: ['class'] });
            }
        }

        // 为 X 应用第一个页面的返回按钮添加返回功能
        // 使用事件委托捕获 #x-social-screen 内的 .back-btn 点击
        if (!window.__xSocialBackBtnHandlerAdded) {
            window.__xSocialBackBtnHandlerAdded = true;
            document.addEventListener('click', (e) => {
                const backBtn = e.target.closest('#x-social-screen .back-btn');
                if (backBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    // 返回主屏幕
                    if (typeof switchScreen === 'function') {
                        switchScreen('home-screen');
                    }
                }
            }, true);
        }

        // 将路人的默认头像替换为随机推特风格头像
        // 用 MutationObserver 监听 DOM 变化，自动替换新添加的 img 元素
        if (!window.__xAvatarObserverAdded) {
            window.__xAvatarObserverAdded = true;
            const __oldAvatarUrl = 'https://i.postimg.cc/4xmx7V4R/mmexport1759081128356.jpg';
            const __replaceAvatar = (el) => {
                if (el.tagName === 'IMG' && el.src && el.src.includes('4xmx7V4R')) {
                    el.src = window.__getXRandomAvatar();
                }
                el.querySelectorAll && el.querySelectorAll('img[src*="4xmx7V4R"]').forEach(img => {
                    img.src = window.__getXRandomAvatar();
                });
            };
            const __observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        __replaceAvatar(node);
                    }
                }
            });
            const __startObserver = () => {
                const screen = document.getElementById('x-social-screen');
                if (screen) {
                    __observer.observe(screen, { childList: true, subtree: true });
                    screen.querySelectorAll('img[src*="4xmx7V4R"]').forEach(img => {
                        img.src = window.__getXRandomAvatar();
                    });
                    return true;
                }
                return false;
            };
            if (!__startObserver()) {
                const __check = setInterval(() => { if (__startObserver()) clearInterval(__check); }, 500);
            }
        }

        // 修复私信页面：键盘遮挡输入框 + Enter键发送消息
        if (!window.__xDmFixAdded) {
            window.__xDmFixAdded = true;

            // 1. 键盘遮挡修复：监听 visualViewport 变化，动态调整 #x-social-screen 高度
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', () => {
                    const screen = document.getElementById('x-social-screen');
                    if (!screen || !screen.classList.contains('active')) return;
                    const vh = window.visualViewport.height;
                    screen.style.height = vh + 'px';
                    // 私信页面：滚动消息区到底部，确保最新消息可见
                    const content = document.getElementById('message-detail-content');
                    if (content) content.scrollTop = content.scrollHeight;
                });
                window.visualViewport.addEventListener('scroll', () => {
                    const screen = document.getElementById('x-social-screen');
                    if (!screen || !screen.classList.contains('active')) return;
                    screen.style.top = window.visualViewport.offsetTop + 'px';
                });
            }

            // 2. Enter 键发送消息：事件委托捕获 #message-input 的 keydown
            // 只在 X 社交屏幕激活时拦（避免和微信聊天的 sendMessage 冲突）
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                if (e.target.id !== 'message-input') return;
                // 关键：只有 #x-social-screen 在前台才拦截，否则放行给原生 sendMessage
                const xScreen = document.getElementById('x-social-screen');
                if (!xScreen || !xScreen.classList.contains('active')) return;
                e.preventDefault();
                e.stopPropagation();
                if (typeof getAIResponse === 'function') {
                    getAIResponse();
                }
            }, true);
        }

        // 私信输入框拉宽：减小左右间距
        if (!document.getElementById('x-dm-input-fix-style')) {
            const style = document.createElement('style');
            style.id = 'x-dm-input-fix-style';
            style.textContent = `
                #x-social-screen .message-input-area{
                    padding-left: 6px !important;
                    padding-right: 6px !important;
                }
            `;
            document.head.appendChild(style);
        }

        // X应用所有页面顶栏重构：移动头像到左上角、添加X图标
        if (!window.__xTopBarRestructured) {
            window.__xTopBarRestructured = true;

            // 添加CSS样式
            if (!document.getElementById('x-top-bar-restructure-style')) {
                const style = document.createElement('style');
                style.id = 'x-top-bar-restructure-style';
                style.textContent = `
                    /* 顶栏垂直基准线：头像/图标/X logo 都对齐这条线（整体已下移） */
                    #x-social-screen { --x-bar-mid: 92px; }

                    /* 所有顶栏区域基础样式 */
                    #x-social-screen .x-top-bar,
                    #x-social-screen .trending-header,
                    #x-social-screen [class*="top-bar"],
                    #x-social-screen [class*="header"] {
                        position: relative !important;
                        min-height: 80px !important;
                    }

                    /* 首页顶栏：整体下移（顶栏变高把下面的标签页一起推下去），并去掉上横线 */
                    #x-social-screen .x-top-bar {
                        min-height: calc(var(--x-bar-mid) + 32px) !important;
                        border-bottom: none !important;
                    }

                    /* 头像容器移动到左上角，与右侧图标对齐 - 高优先级 */
                    #x-social-screen .x-profile-pic {
                        position: absolute !important;
                        left: 12px !important;
                        top: var(--x-bar-mid) !important;
                        transform: translateY(-50%) !important;
                        z-index: 100 !important;
                    }

                    #x-social-screen #top-bar-avatar {
                        width: 36px !important;
                        height: 36px !important;
                        cursor: pointer !important;
                    }

                    /* 隐藏原本的返回箭头 */
                    #x-social-screen .back-btn,
                    #x-social-screen [class*="back-btn"] {
                        display: none !important;
                    }

                    /* X图标居中（与头像同一水平线） */
                    #x-social-screen .x-logo-center {
                        position: absolute !important;
                        left: 50% !important;
                        top: var(--x-bar-mid) !important;
                        transform: translate(-50%, -50%) !important;
                        z-index: 5 !important;
                    }

                    #x-social-screen .x-logo-center img {
                        width: 30px !important;
                        height: 30px !important;
                        display: block !important;
                    }

                    /* 日间模式下顶栏是白底，白色 X 反色成黑 */
                    #x-social-screen.day-mode .x-logo-center img {
                        filter: invert(1);
                    }

                    /* 帖子：头像放大、昵称和正文字体放大（全部页面生效） */
                    #x-social-screen .tweet-item .tweet-avatar {
                        width: 48px !important;
                        height: 48px !important;
                    }
                    #x-social-screen .tweet-item .tweet-user-name {
                        font-size: 16.5px !important;
                    }
                    #x-social-screen .tweet-item .tweet-content {
                        font-size: 16px !important;
                    }
                `;
                document.head.appendChild(style);
            }

            // 使用MutationObserver监听DOM变化，重构顶栏结构
            const __restructureTopBar = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;

                // 查找所有顶栏区域
                const topBars = screen.querySelectorAll('.x-top-bar, .trending-header, [class*="top-bar"], [class*="header"]');
                if (topBars.length === 0) return false;

                let restructured = false;

                topBars.forEach(topBar => {
                    // 检查是否已经重构过
                    if (topBar.dataset.restructured) return;

                    // 查找头像元素
                    const avatar = topBar.querySelector('#top-bar-avatar');

                    // 只在包含头像的主顶栏添加X图标（避免在设置面板等overlay中添加）
                    if (avatar && !topBar.querySelector('.x-logo-center')) {
                        const xLogoContainer = document.createElement('div');
                        xLogoContainer.className = 'x-logo-center';
                        xLogoContainer.innerHTML = '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTE4LjI0NCAyLjI1aDMuMzA4bC03LjIyNyA4LjI2IDguNTAyIDExLjI0SDE2LjE3bC01LjIxNC02LjgxN0w0Ljk5IDIxLjc1SDIuMjVsNy43My04LjgzNUwxLjY3OSAyLjI1SDguMzJsNC43MTMgNi4yMzF6bS0xLjE2MSAxNy41MjFoMS44MzNMNy4wODQgNC4xMjZINS4xMTd6Ii8+PC9zdmc+" alt="X">';
                        topBar.appendChild(xLogoContainer);
                    }

                    // 只在包含头像的主顶栏操作
                    if (avatar) {
                        // 去掉顶栏底部横线（保留标签页下面的那条）
                        topBar.style.setProperty('border-bottom', 'none', 'important');
                    }

                    // 如果头像容器存在，确保它在左上角
                    if (avatar) {
                        const avatarContainer = avatar.parentElement;
                        // 移动父容器（与图标组同一水平线）
                        if (avatarContainer) {
                            avatarContainer.style.position = 'absolute';
                            avatarContainer.style.left = '12px';
                            avatarContainer.style.top = 'var(--x-bar-mid, 92px)';
                            avatarContainer.style.transform = 'translateY(-50%)';
                            avatarContainer.style.zIndex = '100';
                        }
                        // 设置头像本身的大小
                        avatar.style.width = '36px';
                        avatar.style.height = '36px';
                        avatar.style.cursor = 'pointer';

                        // 确保点击事件存在
                        if (!avatar.onclick) {
                            avatar.onclick = () => {
                                if (typeof switchXPage === 'function') {
                                    switchXPage('profile');
                                }
                            };
                        }
                    }

                    // 直播 / 刷新 / 设置图标组：下移到与头像同一水平线（左组贴左、右组贴右）
                    if (avatar) {
                        const avatarContainer = avatar.parentElement;
                        const groups = [...topBar.children].filter(el =>
                            el !== avatarContainer &&
                            !el.classList.contains('x-home-back-area') &&
                            !el.classList.contains('x-logo-center') &&
                            !el.classList.contains('x-profile-pic'));
                        groups.forEach((group, i) => {
                            const iconCount = group.querySelectorAll('svg, img, button, [class*="btn"]').length;
                            const isRight = groups.length > 1
                                ? i === groups.length - 1
                                : iconCount >= 2;
                            group.style.position = 'absolute';
                            group.style.top = 'var(--x-bar-mid, 92px)';
                            group.style.transform = 'translateY(-50%)';
                            group.style.display = 'flex';
                            group.style.alignItems = 'center';
                            group.style.gap = '15px';
                            if (isRight) {
                                group.style.right = '15px';
                                group.style.left = 'auto';
                            } else {
                                group.style.left = '15px';
                                group.style.right = 'auto';
                            }
                            // 清掉旧版"直播图标右移"的补偿
                            const liveBtn = group.querySelector('.x-live-btn');
                            if (liveBtn) { liveBtn.style.left = ''; liveBtn.style.position = ''; }
                        });
                    }

                    // 标记为已重构
                    topBar.dataset.restructured = 'true';
                    restructured = true;
                });

                return restructured;
            };

            // 启动观察者
            const __observer = new MutationObserver((mutations) => {
                __restructureTopBar();
            });

            const __startObserver = () => {
                const screen = document.getElementById('x-social-screen');
                if (screen) {
                    __observer.observe(screen, { childList: true, subtree: true });
                    __restructureTopBar();
                    return true;
                }
                return false;
            };

            if (!__startObserver()) {
                const __check = setInterval(() => { if (__startObserver()) clearInterval(__check); }, 500);
            }
        }

        // X应用标签页指示器优化：缩短蓝条长度并添加圆角
        if (!window.__xTabIndicatorOptimized) {
            window.__xTabIndicatorOptimized = true;

            // 添加CSS样式
            if (!document.getElementById('x-tab-indicator-style')) {
                const style = document.createElement('style');
                style.id = 'x-tab-indicator-style';
                style.textContent = `
                    /* 标签页指示器样式 */
                    #x-social-screen .tab-indicator {
                        transition: all 0.3s ease !important;
                    }

                    /* 确保标签容器是相对定位 */
                    #x-social-screen .x-tab-container,
                    #x-social-screen [class*="tab-container"],
                    #x-social-screen .trending-header {
                        position: relative !important;
                    }

                    /* 标签项样式 */
                    #x-social-screen .x-tab {
                        position: relative !important;
                        flex-shrink: 0 !important;
                    }

                    /* 移除帖子下方的蓝色线条 */
                    #x-social-screen .tweet-item::after,
                    #x-social-screen .tweet-item::before {
                        display: none !important;
                        content: none !important;
                    }

                    #x-social-screen .tweets-container::after,
                    #x-social-screen .tweets-container::before {
                        display: none !important;
                        content: none !important;
                    }

                    #x-social-screen .tab-content::after,
                    #x-social-screen .tab-content::before {
                        display: none !important;
                        content: none !important;
                    }

                    #x-social-screen .tweet-item {
                        border-bottom: none !important;
                    }

                    #x-social-screen .tweets-container {
                        border-bottom: none !important;
                    }
                `;
                document.head.appendChild(style);
            }

            // 更新指示器显示状态
            const __updateTabIndicator = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;

                // 查找主页标签页
                const homeTabs = screen.querySelector('.x-home-tabs');
                if (!homeTabs) return false;

                const tabs = homeTabs.querySelectorAll('.x-tab');
                if (tabs.length === 0) return false;

                // 更新每个标签的指示器显示状态
                tabs.forEach(tab => {
                    const indicator = tab.querySelector('.tab-indicator');
                    if (!indicator) return;

                    if (tab.classList.contains('active')) {
                        indicator.style.display = 'flex';
                    } else {
                        indicator.style.display = 'none';
                    }
                });

                return true;
            };

            // 监听标签点击事件
            const __handleTabClick = (e) => {
                const tab = e.target.closest('.x-tab');
                if (!tab) return;

                // 延迟更新指示器，等待DOM更新完成
                setTimeout(__updateTabIndicator, 50);
            };

            // 启动观察者和事件监听
            const __observer = new MutationObserver((mutations) => {
                __updateTabIndicator();
            });

            const __startObserver = () => {
                const screen = document.getElementById('x-social-screen');
                if (screen) {
                    __observer.observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
                    __updateTabIndicator();

                    // 添加点击事件监听
                    screen.addEventListener('click', __handleTabClick);

                    return true;
                }
                return false;
            };

            if (!__startObserver()) {
                const __check = setInterval(() => { if (__startObserver()) clearInterval(__check); }, 500);
            }
        }

        // X应用底栏页面独立顶栏：每个底栏页面拥有自己的顶栏
        if (!window.__xPerPageTopBars) {
            window.__xPerPageTopBars = true;

            if (!document.getElementById('x-per-page-topbar-style')) {
                const style = document.createElement('style');
                style.id = 'x-per-page-topbar-style';
                style.textContent = `
                    /* 搜索页面自定义顶栏 */
                    #x-social-screen .x-search-top-bar {
                        display: flex;
                        align-items: center;
                        padding: 50px 16px 10px 16px;
                        gap: 10px;
                        position: relative;
                        min-height: 56px;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-avatar {
                        flex-shrink: 0;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        object-fit: cover;
                        cursor: pointer;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        background: #202327 !important;
                        border: 1px solid transparent;
                        border-radius: 9999px !important;
                        padding: 10px 16px;
                        gap: 10px;
                        height: 44px;
                        box-sizing: border-box;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box .x-search-icon-inner {
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box .x-search-icon-inner svg {
                        width: 18px;
                        height: 18px;
                        fill: #71767b !important;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box input {
                        flex: 1;
                        background: transparent !important;
                        border: none;
                        color: #e7e9ea !important;
                        font-size: 15px;
                        outline: none;
                        min-width: 0;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box input::placeholder {
                        color: #71767b !important;
                        font-size: 15px;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-settings {
                        flex-shrink: 0;
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 50%;
                        background: none;
                        border: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-settings:hover {
                        background: rgba(239,243,244,0.1);
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-settings svg {
                        width: 22px;
                        height: 22px;
                        fill: #e7e9ea;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-settings svg circle {
                        stroke: #e7e9ea;
                    }
                    /* 日间模式搜索栏（pp.js 实际切换的主题类是 .x-theme-light） */
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-search-box {
                        background: #eff3f4 !important;
                        border-color: transparent;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-search-box .x-search-icon-inner svg {
                        fill: #536471 !important;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-search-box input {
                        color: #0f1419 !important;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-search-box input::placeholder {
                        color: #536471 !important;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-settings svg {
                        fill: #0f1419;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-settings svg circle {
                        stroke: #0f1419;
                    }
                    #x-social-screen.x-theme-light .x-search-top-bar .x-search-top-settings:hover {
                        background: rgba(0,0,0,0.06);
                    }
                    /* 搜索页激活时隐藏全局顶栏 */
                    #x-social-screen.x-on-search > .x-top-bar {
                        display: none !important;
                    }
                    /* 非搜索页时隐藏搜索顶栏 */
                    #x-social-screen:not(.x-on-search) .x-search-top-bar {
                        display: none !important;
                    }
                    /* 隐藏搜索页原本的search-header */
                    #x-social-screen #x-search-page .search-header {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            }

            const __createSearchTopBar = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;

                const searchPage = screen.querySelector('#x-search-page');
                if (!searchPage) return false;

                if (searchPage.querySelector('.x-search-top-bar')) return true;

                const topBar = document.createElement('div');
                topBar.className = 'x-search-top-bar';

                const origAvatar = screen.querySelector('#top-bar-avatar');
                if (origAvatar) {
                    const origImg = origAvatar.querySelector('img') || origAvatar;
                    const src = (origImg && origImg.src) || '';
                    if (src && !src.endsWith('/')) {
                        const searchAvatar = document.createElement('img');
                        searchAvatar.className = 'x-search-top-avatar';
                        searchAvatar.src = src;
                        searchAvatar.alt = '';
                        searchAvatar.onclick = () => { if (typeof switchXPage === 'function') switchXPage('profile'); };
                        topBar.appendChild(searchAvatar);
                    }
                }

                const searchBoxWrapper = document.createElement('div');
                searchBoxWrapper.className = 'x-search-top-search-box';

                const searchIconWrap = document.createElement('span');
                searchIconWrap.className = 'x-search-icon-inner';
                searchIconWrap.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10.25 3.75a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm-8.25 6.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012 10.25z"/></svg>';
                searchBoxWrapper.appendChild(searchIconWrap);

                const origSearchBox = searchPage.querySelector('.search-header .search-box');
                if (origSearchBox) {
                    const origInput = origSearchBox.querySelector('#search-input');
                    const newInput = document.createElement('input');
                    newInput.type = 'text';
                    newInput.placeholder = '搜索';
                    newInput.addEventListener('input', function() {
                        if (origInput) origInput.value = this.value;
                        if (typeof toggleSearchButton === 'function') toggleSearchButton();
                    });
                    newInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            if (origInput) origInput.value = this.value;
                            if (typeof performSearch === 'function') performSearch();
                        }
                    });
                    searchBoxWrapper.appendChild(newInput);
                }

                const settingsBtn = document.createElement('button');
                settingsBtn.className = 'x-search-top-settings';
                settingsBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
                settingsBtn.onclick = () => { if (typeof switchXPage === 'function') switchXPage('settings'); };

                topBar.appendChild(searchBoxWrapper);
                topBar.appendChild(settingsBtn);

                searchPage.insertBefore(topBar, searchPage.firstChild);
                return true;
            };

            const __updatePerPageTopBars = (pageName) => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return;

                if (pageName === 'search') {
                    screen.classList.add('x-on-search');
                    __createSearchTopBar();
                    const origInput = screen.querySelector('#search-input');
                    const topInput = screen.querySelector('.x-search-top-search-box input');
                    if (origInput && topInput && !topInput.value && origInput.value) {
                        topInput.value = origInput.value;
                    }
                } else {
                    screen.classList.remove('x-on-search');
                }
            };

            const __wrapSwitchXPage = () => {
                if (typeof window.switchXPage !== 'function') return false;
                if (window.__xSwitchXPageWrapped) return true;
                window.__xSwitchXPageWrapped = true;

                const orig = window.switchXPage;
                window.switchXPage = function(pageName) {
                    // 记录当前页面作为上一页（用于设置页返回）
                    const currentPage = document.querySelector('.x-page[style*="display: block"], .x-page[style*="display:block"]');
                    if (currentPage) {
                        const id = currentPage.id || '';
                        if (id === 'x-home-page') window.__xPrevPage = 'home';
                        else if (id === 'x-search-page') window.__xPrevPage = 'search';
                        else if (id === 'x-notifications-page') window.__xPrevPage = 'notifications';
                        else if (id === 'x-messages-page') window.__xPrevPage = 'messages';
                    }
                    const result = orig.apply(this, arguments);
                    setTimeout(() => __updatePerPageTopBars(pageName), 10);
                    return result;
                };
                return true;
            };

            const __initPerPageTopBars = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;

                if (!__wrapSwitchXPage()) {
                    const poll = setInterval(() => {
                        if (__wrapSwitchXPage()) clearInterval(poll);
                    }, 300);
                }

                const pageObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.type === 'attributes' && m.attributeName === 'style') {
                            const page = m.target;
                            if (page.classList && page.classList.contains('x-page')) {
                                const display = page.style.display;
                                if (display !== 'none') {
                                    const id = page.id || '';
                                    if (id === 'x-search-page') __updatePerPageTopBars('search');
                                    else if (id === 'x-home-page') __updatePerPageTopBars('home');
                                    else if (id === 'x-notifications-page') __updatePerPageTopBars('notifications');
                                    else if (id === 'x-messages-page') __updatePerPageTopBars('messages');
                                }
                            }
                        }
                    }
                });

                pageObserver.observe(screen, { subtree: true, attributes: true, attributeFilter: ['style'] });
                return true;
            };

            if (!__initPerPageTopBars()) {
                const __check = setInterval(() => { if (__initPerPageTopBars()) clearInterval(__check); }, 500);
            }
        }

        // X应用首页和设置页左上角返回区域（顶部空白处，无图标）
        if (!window.__xHomeBackArea) {
            window.__xHomeBackArea = true;

            if (!document.getElementById('x-home-back-area-style')) {
                const style = document.createElement('style');
                style.id = 'x-home-back-area-style';
                style.textContent = `
                    #x-social-screen .x-home-back-area,
                    #x-social-screen .x-settings-back-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 80px;
                        height: 60px;
                        z-index: 200;
                        cursor: pointer;
                    }
                    /* 只在首页显示首页返回区域 */
                    #x-social-screen:not(.x-on-home) .x-home-back-area {
                        display: none !important;
                    }
                    /* 只在设置页显示设置页返回区域 */
                    #x-social-screen:not(.x-on-settings) .x-settings-back-area {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            }

            const __createHomeBackArea = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;
                const topBar = screen.querySelector('.x-top-bar');
                if (!topBar) return false;
                if (topBar.querySelector('.x-home-back-area')) return true;

                const backArea = document.createElement('div');
                backArea.className = 'x-home-back-area';
                backArea.onclick = () => {
                    if (typeof switchScreen === 'function') switchScreen('home-screen');
                };
                topBar.insertBefore(backArea, topBar.firstChild);
                return true;
            };

            const __createSettingsBackArea = () => {
                const settingsPage = document.getElementById('x-settings-page');
                if (!settingsPage) return false;
                if (settingsPage.querySelector('.x-settings-back-area')) return true;

                // 设置页的顶栏可能在页面内部
                const header = settingsPage.querySelector('.settings-header, .x-settings-header, header, .top-bar') || settingsPage;
                const backArea = document.createElement('div');
                backArea.className = 'x-settings-back-area';
                backArea.onclick = () => {
                    // 返回到上一页（搜索页或首页）
                    if (typeof switchXPage === 'function') {
                        // 尝试返回到之前的页面
                        const prevPage = window.__xPrevPage || 'search';
                        switchXPage(prevPage);
                    }
                };
                header.insertBefore(backArea, header.firstChild);
                return true;
            };

            const __updateHomeBackArea = (pageName) => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return;
                if (pageName === 'home') {
                    screen.classList.add('x-on-home');
                    __createHomeBackArea();
                } else {
                    screen.classList.remove('x-on-home');
                }
            };

            const __updateSettingsBackArea = (pageName) => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return;
                if (pageName === 'settings') {
                    screen.classList.add('x-on-settings');
                    __createSettingsBackArea();
                } else {
                    screen.classList.remove('x-on-settings');
                }
            };

            // MutationObserver 检测页面切换
            const __backObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'attributes' && m.attributeName === 'style') {
                        const page = m.target;
                        if (page.classList && page.classList.contains('x-page')) {
                            const display = page.style.display;
                            if (display !== 'none') {
                                const id = page.id || '';
                                if (id === 'x-home-page') {
                                    __updateHomeBackArea('home');
                                    __updateSettingsBackArea('other');
                                } else if (id === 'x-settings-page') {
                                    __updateSettingsBackArea('settings');
                                    __updateHomeBackArea('other');
                                } else {
                                    __updateHomeBackArea('other');
                                    __updateSettingsBackArea('other');
                                }
                            }
                        }
                    }
                }
            });
            const __startBackObserver = () => {
                const screen = document.getElementById('x-social-screen');
                if (screen) {
                    __backObserver.observe(screen, { subtree: true, attributes: true, attributeFilter: ['style'] });
                    __createHomeBackArea();
                    __updateHomeBackArea('home');
                    return true;
                }
                return false;
            };
            if (!__startBackObserver()) {
                const __check = setInterval(() => { if (__startBackObserver()) clearInterval(__check); }, 500);
            }
        }

        // X应用设置页：预设管理下方添加默认头像管理
        if (!window.__xAvatarSettingsUI) {
            window.__xAvatarSettingsUI = true;

            window.__renderXAvatarSettings = function() {
                const container = document.getElementById('x-avatar-settings-list');
                if (!container) return;

                const customAvatars = (window.db && window.db.xAvatarSettings) || [];

                if (customAvatars.length === 0) {
                    container.innerHTML = '<p style="color:#71767b;font-size:14px;text-align:center;margin:10px 0;">暂无自定义头像，使用默认头像池</p>';
                    return;
                }

                let html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">';
                customAvatars.forEach((url, idx) => {
                    html += `<div style="position:relative;aspect-ratio:1;border-radius:50%;overflow:hidden;border:2px solid #333;">
                        <img src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="avatar">
                        <div onclick="window.__removeXAvatar(${idx})" style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;background:#e0245e;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:#fff;font-weight:bold;">×</div>
                    </div>`;
                });
                html += '</div>';
                container.innerHTML = html;
            };

            window.__removeXAvatar = function(idx) {
                if (!window.db.xAvatarSettings) return;
                window.db.xAvatarSettings.splice(idx, 1);
                if (typeof saveData === 'function') saveData();
                window.__renderXAvatarSettings();
            };

            window.__addXAvatar = function() {
                const input = document.getElementById('x-avatar-url-input');
                if (!input || !input.value.trim()) return;

                const url = input.value.trim();
                if (!window.db.xAvatarSettings) window.db.xAvatarSettings = [];
                window.db.xAvatarSettings.push(url);
                if (typeof saveData === 'function') saveData();
                input.value = '';
                window.__renderXAvatarSettings();
            };

            const __injectAvatarSettings = () => {
                const settingsContent = document.querySelector('#x-settings-page .settings-content');
                if (!settingsContent) return false;
                if (document.getElementById('x-avatar-settings-section')) return true;

                const presetSection = settingsContent.querySelector('.preset-management');
                if (!presetSection) return false;

                const section = document.createElement('div');
                section.id = 'x-avatar-settings-section';
                section.style.cssText = 'margin-top:30px;padding-top:20px;border-top:1px solid #333;';
                section.innerHTML = `
                    <h3 style="color:#fff;font-size:18px;font-weight:700;margin-bottom:8px;">默认头像管理</h3>
                    <p style="color:#71767b;font-size:13px;margin-bottom:15px;line-height:1.4;">添加自定义头像URL，帖子和评论的用户将随机使用这些头像。留空则使用默认头像池。</p>
                    <div style="display:flex;gap:8px;margin-bottom:15px;">
                        <input id="x-avatar-url-input" type="text" placeholder="输入头像图片URL..." style="flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;padding:10px 12px;font-size:14px;outline:none;min-width:0;" onfocus="this.style.borderColor='var(--x-accent)'" onblur="this.style.borderColor='#333'">
                        <button onclick="window.__addXAvatar()" style="background:var(--x-accent);border:none;border-radius:8px;color:#fff;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;">添加</button>
                    </div>
                    <div id="x-avatar-settings-list"></div>
                `;

                presetSection.parentNode.insertBefore(section, presetSection.nextSibling);
                window.__renderXAvatarSettings();
                return true;
            };

            // 监听设置页显示时注入
            const __avatarSettingsObserver = new MutationObserver(() => {
                const settingsPage = document.getElementById('x-settings-page');
                if (settingsPage && settingsPage.style.display !== 'none') {
                    __injectAvatarSettings();
                }
            });
            const __startAvatarObserver = () => {
                const screen = document.getElementById('x-social-screen');
                if (screen) {
                    __avatarSettingsObserver.observe(screen, { subtree: true, attributes: true, attributeFilter: ['style'] });
                    return true;
                }
                return false;
            };
            if (!__startAvatarObserver()) {
                const __check = setInterval(() => { if (__startAvatarObserver()) clearInterval(__check); }, 500);
            }
        }

        // X应用四页面精修V2：FAB固定蓝/页标题/铃铛/空状态居中/私信页「全部」液态玻璃按钮弹窗/搜索页下移
        if (!window.__xPerPageV2) {
            window.__xPerPageV2 = true;

            if (!document.getElementById('x-per-page-v2-style')) {
                const style = document.createElement('style');
                style.id = 'x-per-page-v2-style';
                style.textContent = `
                    /* ── 发帖按钮固定为调色盘第一蓝（#1d9bf0），加号白色，不受换色/主题影响 ── */
                    #x-social-screen .compose-btn {
                        background-color: #1d9bf0 !important;
                    }
                    #x-social-screen .compose-btn svg path {
                        stroke: #fff !important;
                    }
                    #x-social-screen #refresh-messages-btn {
                        background-color: #1d9bf0 !important;
                    }

                    /* ── 通知/私信页顶栏与首页同一水平线（头像/标题/图标对齐 92px 基准线） ──
                       （曾用 --x-bar-mid:112px 单独下移通知/私信页，现已取消，四页统一） ── */

                    /* ── 通知页「全部/提及」行上移：与首页「为你推荐/正在关注」同高（清掉原版 44px 顶部内边距） ── */
                    #x-social-screen .notifications-tabs {
                        padding-top: 0 !important;
                    }

                    /* ── 直播按钮只在首页显示 ── */
                    #x-social-screen:not(.x-on-home) .x-top-bar .x-live-btn {
                        display: none !important;
                    }

                    /* ── 设置/刷新图标在私信页隐藏（设置只在首页/搜索/通知显示） ── */
                    #x-social-screen.x-on-messages .x-top-bar .x-refresh-btn,
                    #x-social-screen.x-on-messages .x-top-bar .x-settings {
                        display: none !important;
                    }

                    /* ── 顶部中央页标题（通知/聊天），白色，日间模式反黑 ── */
                    #x-social-screen .x-page-title {
                        color: #fff;
                        font-size: 18px;
                        font-weight: 700;
                        letter-spacing: 1px;
                        white-space: nowrap;
                        user-select: none;
                    }
                    #x-social-screen.day-mode .x-page-title {
                        color: #0f1419;
                    }

                    /* ── 通知页「全部」标签左侧铃铛（底栏第3个图标同款） ── */
                    #x-social-screen .notification-tab .x-tab-bell {
                        display: inline-flex;
                        align-items: center;
                        margin-right: 6px;
                        vertical-align: -2px;
                    }
                    #x-social-screen .notification-tab .x-tab-bell svg {
                        width: 16px;
                        height: 16px;
                        fill: currentColor;
                        display: block;
                    }

                    /* ── 通知页空状态强制水平居中 ── */
                    #x-social-screen #x-notifications-page [id^="notifications-"][id$="-content"] > div {
                        align-items: center !important;
                        justify-content: center !important;
                        text-align: center !important;
                        margin: 0 auto !important;
                    }

                    /* ── 搜索页顶栏整体下移 ── */
                    #x-social-screen .x-search-top-bar {
                        padding-top: 64px !important;
                    }

                    /* ── 私信页右上角「全部」圆形液态玻璃按钮 ── */
                    #x-social-screen .x-msg-all-btn {
                        position: absolute;
                        right: 15px;
                        top: var(--x-bar-mid, 92px);
                        transform: translateY(-50%);
                        z-index: 120;
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        display: none;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-size: 13px;
                        font-weight: 700;
                        letter-spacing: 1px;
                        cursor: pointer;
                        user-select: none;
                        background: rgba(255,255,255,0.14);
                        border: 1px solid rgba(255,255,255,0.35);
                        -webkit-backdrop-filter: blur(20px) saturate(1.7);
                        backdrop-filter: blur(20px) saturate(1.7);
                        box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25);
                    }
                    #x-social-screen.x-on-messages .x-msg-all-btn { display: flex; }
                    #x-social-screen.day-mode .x-msg-all-btn {
                        color: #0f1419;
                        background: rgba(255,255,255,0.55);
                        border-color: rgba(0,0,0,0.1);
                        box-shadow: 0 4px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8);
                    }

                    /* ── 「全部」液态玻璃弹窗 ── */
                    #x-social-screen .x-msg-all-pop {
                        position: absolute;
                        right: 15px;
                        top: calc(var(--x-bar-mid, 92px) + 30px);
                        z-index: 130;
                        display: none;
                        flex-direction: column;
                        min-width: 156px;
                        border-radius: 18px;
                        overflow: hidden;
                        background: rgba(28,28,30,0.55);
                        border: 1px solid rgba(255,255,255,0.28);
                        -webkit-backdrop-filter: blur(30px) saturate(1.8);
                        backdrop-filter: blur(30px) saturate(1.8);
                        box-shadow: 0 16px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
                    }
                    #x-social-screen .x-msg-all-pop.open {
                        display: flex;
                        animation: x-msg-pop .18s cubic-bezier(.2,.9,.3,1.2);
                    }
                    #x-social-screen.day-mode .x-msg-all-pop {
                        background: rgba(255,255,255,0.72);
                        border-color: rgba(0,0,0,0.08);
                        box-shadow: 0 16px 44px rgba(0,0,0,0.16);
                    }
                    @keyframes x-msg-pop {
                        from { opacity: 0; transform: translateY(-8px) scale(.95); }
                        to { opacity: 1; transform: none; }
                    }
                    #x-social-screen .x-msg-all-pop .x-pop-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 13px 18px;
                        color: #fff;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    #x-social-screen .x-msg-all-pop .x-pop-item:active {
                        background: rgba(255,255,255,0.14);
                    }
                    #x-social-screen.day-mode .x-msg-all-pop .x-pop-item { color: #0f1419; }
                    #x-social-screen.day-mode .x-msg-all-pop .x-pop-item:active { background: rgba(0,0,0,0.06); }
                    #x-social-screen .x-msg-all-pop .x-pop-item svg {
                        width: 18px;
                        height: 18px;
                        fill: currentColor;
                        flex-shrink: 0;
                    }
                `;
                document.head.appendChild(style);
            }

            const __xXLogoSvg = '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTE4LjI0NCAyLjI1aDMuMzA4bC03LjIyNyA4LjI2IDguNTAyIDExLjI0SDE2LjE3bC01LjIxNC02LjgxN0w0Ljk5IDIxLjc1SDIuMjVsNy43My04LjgzNUwxLjY3OSAyLjI1SDguMzJsNC43MTMgNi4yMzF6bS0xLjE2MSAxNy41MjFoMS44MzNMNy4wODQgNC4xMjZINS4xMTd6Ii8+PC9zdmc+" alt="X">';
            const __xBellSvg = '<svg viewBox="0 0 24 24"><g><path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.302l.847 6.698h-7.722z"></path></g></svg>';
            const __xRefreshSvg = '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-8 8h3a5 5 0 015-5c1.38 0 2.63.56 3.54 1.47L13 11h7V4l-2.35 2.35zM20 13h-3a5 5 0 01-5 5c-1.38 0-2.63-.56-3.54-1.47L11 13H4v7l2.35-2.35A7.958 7.958 0 0012 20c4.42 0 8-3.58 8-8z"></path></svg>';
            const __xPageTitles = { 'x-notifications-page': '通知', 'x-messages-page': '聊天' };
            const __xPageKeys = {
                'x-home-page': 'home', 'x-search-page': 'search',
                'x-notifications-page': 'notifications', 'x-messages-page': 'messages'
            };

            const __syncPageUi = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return;

                /* 当前可见页面 → 页面 class */
                const visible = [...screen.querySelectorAll('.x-page')].find(p => p.style.display !== 'none');
                const key = visible ? (__xPageKeys[visible.id] || '') : '';
                ['x-on-home', 'x-on-search', 'x-on-notifications', 'x-on-messages'].forEach(c => {
                    const want = c === 'x-on-' + key;
                    if (want !== screen.classList.contains(c)) {
                        if (want) screen.classList.add(c); else screen.classList.remove(c);
                    }
                });

                /* 顶部中央：首页 X logo ↔ 通知/私信页白色页标题 */
                const logo = screen.querySelector('.x-top-bar .x-logo-center');
                if (logo) {
                    const title = visible ? (__xPageTitles[visible.id] || '') : '';
                    if ((logo.dataset.pageTitle || '') !== title) {
                        logo.dataset.pageTitle = title;
                        logo.innerHTML = title
                            ? `<span class="x-page-title">${title}</span>`
                            : __xXLogoSvg;
                    }
                }

                /* 通知页「全部」标签注入铃铛 */
                const tabAll = screen.querySelector('#x-notifications-page .notification-tab span[data-i18n="notificationsTabAll"]');
                if (tabAll && !tabAll.parentElement.querySelector('.x-tab-bell')) {
                    const bell = document.createElement('span');
                    bell.className = 'x-tab-bell';
                    bell.innerHTML = __xBellSvg;
                    tabAll.parentElement.insertBefore(bell, tabAll);
                }

                /* 通知页 FAB：换成首页同款白色加号 */
                const notifFab = document.getElementById('refresh-messages-btn');
                if (notifFab && !notifFab.dataset.plusIcon) {
                    notifFab.dataset.plusIcon = '1';
                    notifFab.innerHTML = '<svg viewBox="0 0 24 24" style="width:24px;height:24px;display:block;"><g><path d="M12 4L12 20M4 12L20 12" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"></path></g></svg>';
                }

                /* 搜索页设置图标：换成首页顶栏同款齿轮 */
                const searchSettings = screen.querySelector('.x-search-top-settings');
                const homeGear = screen.querySelector('.x-top-bar .x-settings svg');
                if (searchSettings && homeGear && searchSettings.dataset.gearSwap !== '1') {
                    searchSettings.dataset.gearSwap = '1';
                    searchSettings.innerHTML = homeGear.outerHTML;
                    const svg = searchSettings.querySelector('svg');
                    if (svg) svg.removeAttribute('style');
                }

                /* 私信页「全部」按钮 + 液态玻璃弹窗（只建一次） */
                if (!document.getElementById('x-msg-all-btn')) {
                    const btn = document.createElement('div');
                    btn.id = 'x-msg-all-btn';
                    btn.className = 'x-msg-all-btn';
                    btn.textContent = '全部';
                    const pop = document.createElement('div');
                    pop.id = 'x-msg-all-pop';
                    pop.className = 'x-msg-all-pop';
                    pop.innerHTML = `<div class="x-pop-item" id="x-msg-refresh-item">${__xRefreshSvg}<span>刷新</span></div>`;
                    screen.appendChild(btn);
                    screen.appendChild(pop);
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        pop.classList.toggle('open');
                    });
                    pop.addEventListener('click', e => e.stopPropagation());
                    document.getElementById('x-msg-refresh-item').addEventListener('click', () => {
                        pop.classList.remove('open');
                        const refreshBtn = screen.querySelector('.x-top-bar .x-refresh-btn');
                        if (refreshBtn) refreshBtn.click();
                    });
                    document.addEventListener('click', () => pop.classList.remove('open'));
                }
            };

            const __startV2 = () => {
                const screen = document.getElementById('x-social-screen');
                if (!screen) return false;
                new MutationObserver(__syncPageUi).observe(screen, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], childList: true });
                __syncPageUi();
                return true;
            };
            if (!__startV2()) {
                const __check = setInterval(() => { if (__startV2()) clearInterval(__check); }, 500);
            }
        }

        // var db 是全局变量，挂载在 window 上
        if (typeof window.db === 'undefined' || !window.db) {
            // db.js 尚未执行完成（理论上不会发生，因为本脚本在其后加载）
            setTimeout(installBridge, 50);
            return;
        }
        if (window.db.__xBridgeReady) return;

        // ---------- chats 虚拟表：miemie 角色 + 群组 → k-main 聊天记录格式 ----------
        function mapChar(c) {
            return {
                id: c.id,
                name: c.remarkName || c.name || '角色',
                isGroup: false,
                settings: {
                    aiAvatar: c.avatar || '',
                    aiPersona: c.persona || '',
                    myPersona: c.myPersona || '',
                    myName: c.myName || ''
                },
                persona: c.persona || '',
                myPersona: c.myPersona || '',
                myName: c.myName || ''
            };
        }
        function mapGroup(g) {
            return {
                id: g.id,
                name: g.name || g.groupName || '群聊',
                isGroup: true,
                settings: {
                    aiAvatar: g.avatar || g.groupAvatar || ''
                }
            };
        }

        const chatsTable = {
            async toArray() {
                const chars = (window.db.characters || []).map(mapChar);
                const groups = (window.db.groups || []).map(mapGroup);
                return chars.concat(groups);
            },
            async get(id) {
                const all = await chatsTable.toArray();
                return all.find(c => c.id === id) || undefined;
            },
            async put() { /* 只读视图，忽略写入 */ },
            async bulkPut() { /* 只读视图 */ },
            async delete() { /* 只读视图 */ }
        };

        // ---------- apiConfig 虚拟表：miemie 的 apiSettings → k-main 格式 ----------
        const apiConfigTable = {
            async get(id) {
                if (id !== 'main') return undefined;
                const s = window.db.apiSettings || {};
                if (!s.url || !s.key || !s.model) return undefined;
                return {
                    id: 'main',
                    proxyUrl: s.url,
                    apiKey: s.key,
                    model: s.model,
                    temperature: s.temperatureEnabled ? (s.temperature || 0.8) : 0.8
                };
            },
            async put() { /* 只读视图，API设置请在 miemie 设置页修改 */ },
            async delete() { /* 只读视图 */ }
        };

        window.db.chats = chatsTable;
        window.db.apiConfig = apiConfigTable;
        window.db.__xBridgeReady = true;
        console.log('[XBridge] ✅ X社交适配桥已挂载（chats/apiConfig 虚拟表就绪）');
    }

    // ============ 点赞按钮：heart-container 动画升级（与源版 CSS 一致） ============
    if (!window.__xHeartLikePatched) {
        window.__xHeartLikePatched = true;

        const X_HEART_HTML = '<span class="heart-container"><span class="svg-container">' +
            '<svg class="svg-outline" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            '<svg class="svg-filled" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            '<svg class="svg-celebrate" viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.5 16.1l-.15-.13C7.14 14.79 4 11.92 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 3.42-3.14 6.29-7.85 10.47l-.15.12z"/></svg>' +
            '</span></span>';

        // 与按钮状态保持一致；状态未变化时不写 class，避免 MutationObserver 自触发死循环
        const syncLike = (btn) => {
            const hc = btn.querySelector('.heart-container');
            if (!hc) return;
            // pp.js 的 toggleLike 以 data-liked 为唯一状态源；class .liked 只用于配色，
            // 残留时会让取消点赞卡在红心，所以有 data-liked 时一律以它为准。
            const on = btn.hasAttribute('data-liked')
                ? btn.dataset.liked === 'true'
                : btn.classList.contains('liked');
            if (hc.classList.contains('liked') !== on) hc.classList.toggle('liked', on);
        };

        // 把原 like-icon 升级为 heart-container（每个按钮只处理一次）
        const upgradeLike = (btn) => {
            if (!btn || btn.querySelector('.heart-container')) return;
            // pp.js 的 toggleLike 用 btn.querySelector('svg') 改「按钮内第一个 svg」的 path。
            // 若 heart-container 插在最前面，我们的 IG 爱心会被 X 的实心/空心 path 覆盖，
            // 取消点赞后就会变成两层心形叠加。必须排在原生 like-icon（已隐藏）之后。
            let anchor = btn.querySelector('svg');
            if (!anchor) {
                btn.insertAdjacentHTML('afterbegin',
                    '<svg class="x-like-decoy" width="0" height="0" style="display:none" aria-hidden="true"></svg>');
                anchor = btn.querySelector('svg');
            }
            anchor.insertAdjacentHTML('afterend', X_HEART_HTML);
            syncLike(btn);
        };

        const upgradeAll = (root) => {
            (root || document).querySelectorAll('#x-social-screen .tweet-action.like').forEach(upgradeLike);
        };

        const startHeart = () => {
            const screen = document.getElementById('x-social-screen');
            if (!screen) return false;
            upgradeAll(screen);
            const mo = new MutationObserver((muts) => {
                for (const m of muts) {
                    if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('like')) {
                        syncLike(m.target);
                    } else if (m.type === 'childList') {
                        upgradeAll(screen);
                    }
                }
            });
            mo.observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-liked'] });
            console.log('[XBridge] ❤️ 点赞按钮已升级为 heart-container 动画');
            return true;
        };

        if (!startHeart()) {
            const t = setInterval(() => { if (startHeart()) clearInterval(t); }, 500);
        }
    }

    // 本脚本在 db.js 之后、pp.js(defer) 之前执行；db 对象在 db.js 解析时即创建
    installBridge();
})();
