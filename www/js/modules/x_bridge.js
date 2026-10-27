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
                    /* 所有顶栏区域基础样式 */
                    #x-social-screen .x-top-bar,
                    #x-social-screen .trending-header,
                    #x-social-screen [class*="top-bar"],
                    #x-social-screen [class*="header"] {
                        position: relative !important;
                        min-height: 80px !important;
                    }

                    /* 头像容器移动到左上角，与右侧图标对齐 - 高优先级 */
                    #x-social-screen .x-profile-pic {
                        position: absolute !important;
                        left: 12px !important;
                        top: 80px !important;
                        transform: translateY(-50%) !important;
                        z-index: 100 !important;
                    }

                    #x-social-screen #top-bar-avatar {
                        width: 36px !important;
                        height: 36px !important;
                        cursor: pointer !important;
                    }

                    /* 直播图标右移 */
                    #x-social-screen .x-live-btn {
                        position: relative !important;
                        left: 50px !important;
                    }

                    /* 隐藏原本的返回箭头 */
                    #x-social-screen .back-btn,
                    #x-social-screen [class*="back-btn"] {
                        display: none !important;
                    }

                    /* 直播按钮往右移动 */
                    #x-social-screen [class*="live"],
                    #x-social-screen button:has-text("直播"),
                    #x-social-screen .x-top-bar button {
                        margin-left: auto !important;
                        margin-right: 15px !important;
                    }

                    /* X图标居中 */
                    #x-social-screen .x-logo-center {
                        position: absolute !important;
                        left: 50% !important;
                        top: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        z-index: 5 !important;
                    }

                    #x-social-screen .x-logo-center img {
                        width: 32px !important;
                        height: 32px !important;
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
                        xLogoContainer.innerHTML = '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwMCIgZD0iTTE4LjI0NCAyLjI1aDMuMzA4bC03LjIyNyA4LjI2IDguNTAyIDExLjI0SDE2LjE3bC01LjIxOC02LjgxOC02LjAxIDYuODEySDIuNjM5bDcuNzUtOC44ODJMMi4zMzUgMi4yNUg5LjE2Nmw0LjcxOSA2LjI0MnptLTEuMTYxIDE3LjUyMWgxLjgzOUw3LjA4NCA0LjEyN0g1LjExMnoiLz48L3N2Zz4=" alt="X">';
                        topBar.appendChild(xLogoContainer);
                    }

                    // 如果头像容器存在，确保它在左上角，与右侧图标对齐
                    if (avatar) {
                        const avatarContainer = avatar.parentElement;
                        // 移动父容器
                        if (avatarContainer) {
                            avatarContainer.style.position = 'absolute';
                            avatarContainer.style.left = '12px';
                            avatarContainer.style.top = '80px';
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

                    // 直播图标右移
                    const liveBtn = topBar.querySelector('.x-live-btn');
                    if (liveBtn) {
                        liveBtn.style.position = 'relative';
                        liveBtn.style.left = '50px';
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
                        background: #202327;
                        border-radius: 24px;
                        padding: 10px 18px;
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
                        fill: #71767b;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        color: #e7e9ea;
                        font-size: 15px;
                        outline: none;
                        min-width: 0;
                    }
                    #x-social-screen .x-search-top-bar .x-search-top-search-box input::placeholder {
                        color: #71767b;
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
                    /* 日间模式搜索栏 */
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-search-box {
                        background: #eaecee;
                    }
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-search-box input {
                        color: #0f1419;
                    }
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-search-box input::placeholder {
                        color: #536471;
                    }
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-settings svg {
                        fill: #0f1419;
                    }
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-settings svg circle {
                        stroke: #0f1419;
                    }
                    #x-social-screen.day-mode .x-search-top-bar .x-search-top-settings:hover {
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
                    const searchAvatar = document.createElement('img');
                    searchAvatar.className = 'x-search-top-avatar';
                    const origImg = origAvatar.querySelector('img') || origAvatar;
                    searchAvatar.src = origImg.src || '';
                    searchAvatar.alt = '';
                    searchAvatar.onclick = () => { if (typeof switchXPage === 'function') switchXPage('profile'); };
                    topBar.appendChild(searchAvatar);
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

    // 本脚本在 db.js 之后、pp.js(defer) 之前执行；db 对象在 db.js 解析时即创建
    installBridge();
})();
