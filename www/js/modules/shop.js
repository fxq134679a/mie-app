// SVG 图标库
const ShopIcons = {
    food: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`, // 汉堡/饮料
    gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`, // 礼物盒
    gadget: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`, // 手机/数码
    pill: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"></path><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"></line></svg>`, // 药丸
    mystery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`, // 问号/盲盒
    flower: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 1 4.5 4.5M7.5 12H9m3 4.5a4.5 4.5 0 1 1 4.5-4.5M12 16.5V15m4.5-3a4.5 4.5 0 1 0-4.5-4.5M16.5 12H15m-3 9v-6m0 0L8 12m4 6 4-6M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"></path></svg>`, // 花
    clothes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path></svg>` // 衣服
};

const escapeShopText = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[ch]));

const parseShopPrice = (value) => {
    const price = parseFloat(String(value == null ? '' : value).replace(/[^\d.]/g, ''));
    return Number.isFinite(price) ? price : 0;
};

// 全局商城状态
let shopState = {
    items: {
        all: [],
        food: [],
        general: [],
        guess: [],
        character_choice: []
    },
    banner: null,
    currentTab: 'all',
    selectedItem: null,
    isLoading: false,
    cart: [],
    favorites: [],
    orders: [],
    bottomTab: 'home'
};

// 收藏页添加物品时暂存的图片（base64）
let favoriteImageDraft = '';
// 收藏页暂存的 HTML 页面内容
let favoriteHtmlDraft = '';
// 编辑时保留的 HTML 文件地址
let favoriteHtmlSrc = '';
// 当前正在编辑的收藏索引（-1 表示新增）
let favoriteEditIndex = -1;
// 当前全屏详情页展示的收藏索引（-1 表示未打开）
let favoriteDetailIndex = -1;

// 商城操作的归属角色：优先当前聊天，没有活跃聊天时退回第一个角色
function getShopChat() {
    return db.characters.find((character) => character.id === currentChatId) || db.characters[0] || null;
}

// 渲染 Tabs
function renderShopTabs() {
    const tabsContainer = document.getElementById('shop-tabs-container');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';
    
    let tabs = [
        { id: 'all', name: '全部' },
        { id: 'general', name: '数码好物' },
        { id: 'food', name: '生活家居' },
        { id: 'character_choice', name: '穿搭配饰' },
        { id: 'guess', name: '美妆个护' }
    ];

    const customCategories = getCustomCategories();
    if (customCategories.length > 0) {
        tabs = tabs.concat(customCategories);
    }

    tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = `shop-tab-item ${shopState.currentTab === tab.id ? 'active' : ''}`;
        el.textContent = tab.name;
        el.dataset.id = tab.id;
        el.onclick = () => switchShopTab(tab.id);
        tabsContainer.appendChild(el);
    });
}

// 商城底部玻璃标签栏实例
let shopGlassBar = null;

const SHOP_BAR_ICONS = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    delivery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
    cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`,
    favorite: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
    pickup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`,
    category: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
    add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path><line x1="12" y1="8" x2="12" y2="14"></line><line x1="9" y1="11" x2="15" y2="11"></line></svg>`,
    clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

// 挂载底部玻璃标签栏
function mountShopGlassBar() {
    const host = document.getElementById('shop-glass-bar');
    if (!host || !window.GlassTabMenu || shopGlassBar) return;

    shopGlassBar = window.GlassTabMenu.mount(host, {
        tabs: [
            { id: 'home', label: '首页', icon: SHOP_BAR_ICONS.home },
            { id: 'delivery', label: '收货', icon: SHOP_BAR_ICONS.delivery },
            { id: 'cart', label: '购物车', icon: SHOP_BAR_ICONS.cart, badgeable: true },
            { id: 'favorite', label: '收藏', icon: SHOP_BAR_ICONS.favorite }
        ],
        actions: [
            { id: 'pickup', label: '提取商品', icon: SHOP_BAR_ICONS.pickup },
            { id: 'category', label: '自定义分类', icon: SHOP_BAR_ICONS.category },
            { id: 'favorite_add', label: '添加收藏', icon: SHOP_BAR_ICONS.add },
            { id: 'clear', label: '清空商品', icon: SHOP_BAR_ICONS.clear }
        ],
        columns: 2,
        active: shopState.bottomTab || 'home',
        onSelect: (id) => handleBottomTab(id),
        onAction: handleShopMenuAction,
        onOpenChange: (open) => {
            document.getElementById('shop-screen')?.classList.toggle('shop-menu-open', open);
        }
    });
}

// 玻璃栏 ➕ 菜单动作
function handleShopMenuAction(id) {
    if (id === 'pickup') {
        document.getElementById('shop-pickup-modal')?.classList.add('visible');
    } else if (id === 'category') {
        openCategoryManager();
    } else if (id === 'favorite_add') {
        openFavoriteAddModal();
    } else if (id === 'clear') {
        if (confirm('确定要清空所有商品数据吗？')) clearShopData();
    }
}

// 初始化商城
function initShopSystem() {
    console.log('initShopSystem called');
    // 渲染 Tab
    renderShopTabs();

    // 绑定下单按钮事件
    const confirmBtn = document.getElementById('shop-delivery-confirm');
    if (confirmBtn) {
        confirmBtn.onclick = confirmPurchase;
    }

    // 绑定悬浮刷新按钮事件
    const fabRefreshBtn = document.getElementById('shop-fab-refresh-btn');
    if (fabRefreshBtn) {
        fabRefreshBtn.onclick = forceRefreshShop;
    }

    // 绑定搜索按钮事件
    const searchBtn = document.getElementById('shop-search-btn');
    if (searchBtn) {
        searchBtn.onclick = () => {
            const query = document.getElementById('shop-search-input').value.trim();
            if (query) {
                searchShopItems(query);
            }
        };
    }

    // 绑定搜索框回车事件
    const searchInput = document.getElementById('shop-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) searchShopItems(query);
            }
        });
    }

    // 底部玻璃标签栏（含 ➕ 快捷菜单）
    mountShopGlassBar();

    // 绑定提取弹窗取消
    const pickupCancelBtn = document.getElementById('shop-pickup-cancel');
    if (pickupCancelBtn) {
        pickupCancelBtn.onclick = () => {
            document.getElementById('shop-pickup-modal').classList.remove('visible');
        };
    }

    // 绑定提取确认
    const pickupConfirmBtn = document.getElementById('shop-pickup-confirm');
    if (pickupConfirmBtn) {
        pickupConfirmBtn.onclick = handlePickupConfirm;
    }

    // 绑定分类管理模态框按钮
    const addCategoryBtn = document.getElementById('shop-add-category-btn');
    if (addCategoryBtn) {
        addCategoryBtn.onclick = addCategory;
    }

    const itemCountInput = document.getElementById('shop-item-count');
    if (itemCountInput) {
        itemCountInput.onchange = saveItemCount;
    }

    const closeCategoryBtn = document.getElementById('shop-category-close-btn');
    if (closeCategoryBtn) {
        closeCategoryBtn.onclick = () => {
            if (itemCountInput) saveItemCount();
            document.getElementById('shop-category-manage-modal').classList.remove('visible');
            // 关闭时刷新 Tab 显示（如果修改了分类）
            renderShopTabs();
        };
    }
    
    // 初始化收藏页：添加物品弹窗事件
    bindFavoriteAddModal();

    // 初始化购物车 UI
    initCartUI();
}

// 绑定收藏页的添加/编辑物品弹窗
function bindFavoriteAddModal() {
    document.getElementById('fav-modal-close')?.addEventListener('click', closeFavoriteAddModal);
    document.getElementById('fav-cancel-btn')?.addEventListener('click', closeFavoriteAddModal);
    document.getElementById('fav-save-btn')?.addEventListener('click', saveFavoriteItem);
    document.getElementById('fav-delete-btn')?.addEventListener('click', () => {
        if (favoriteEditIndex >= 0) deleteFavoriteItem(favoriteEditIndex);
    });
    document.getElementById('fav-add-modal')?.addEventListener('click', (event) => {
        if (event.target.id === 'fav-add-modal') closeFavoriteAddModal();
    });

    const imageInput = document.getElementById('fav-image-input');
    imageInput?.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
        if (isHtml) {
            if (file.size > 3 * 1024 * 1024) {
                showToast('HTML 文件不能超过 3MB');
                return;
            }
            try {
                favoriteHtmlDraft = await file.text();
                favoriteImageDraft = '';
                favoriteHtmlSrc = '';
                applyFavoriteMediaPreview();
            } catch (error) {
                console.error('收藏 HTML 读取失败', error);
                showToast('HTML 读取失败，请重试');
            }
            return;
        }

        try {
            favoriteImageDraft = await readFavoriteImage(file);
            favoriteHtmlDraft = '';
            favoriteHtmlSrc = '';
            applyFavoriteMediaPreview();
        } catch (error) {
            console.error('收藏图片读取失败', error);
            showToast('图片读取失败，请重试');
        }
    });

    // 页面尺寸变化时重新缩放 HTML 预览
    if (!window.__favFrameResizeBound) {
        window.__favFrameResizeBound = true;
        window.addEventListener('resize', () => {
            scaleFavoriteFrames(document);
            fitFavoriteDetailFrame();
        });
    }
}

// 刷新弹窗里的媒体预览
function applyFavoriteMediaPreview() {
    const preview = document.getElementById('fav-image-preview');
    const box = document.getElementById('fav-upload-box');
    const hintText = document.getElementById('fav-upload-hint-text');
    const hasImage = !!favoriteImageDraft;
    const hasHtml = !!(favoriteHtmlDraft || favoriteHtmlSrc);

    if (preview) {
        preview.src = hasImage ? favoriteImageDraft : '';
        preview.hidden = !hasImage;
    }
    if (box) {
        box.classList.toggle('has-image', hasImage);
        box.classList.toggle('has-html', hasHtml);
    }
    if (hintText) {
        hintText.textContent = hasHtml ? '已载入 HTML 页面（点击可更换）' : '上传图片 / HTML 页面';
    }
}

// --- 自定义分类管理 ---

function getShopSettings() {
    const chat = getShopChat();
    if (chat && chat.shopSettings) {
        return chat.shopSettings;
    }
    return { customCategories: [], itemCount: 8 };
}

async function saveShopSettings(settings) {
    const chat = getShopChat();
    if (!chat) return;
    chat.shopSettings = settings;
    await dexieDB.characters.update(chat.id, { shopSettings: chat.shopSettings });
}

function getCustomCategories() {
    const settings = getShopSettings();
    return settings.customCategories || [];
}

async function saveCustomCategories(categories) {
    const settings = getShopSettings();
    settings.customCategories = categories;
    await saveShopSettings(settings);
}

async function saveItemCount() {
    const countInput = document.getElementById('shop-item-count');
    if (!countInput) return;
    
    let count = parseInt(countInput.value);
    if (isNaN(count) || count < 1) count = 8;
    if (count > 50) count = 50; // 限制最大数量
    
    const settings = getShopSettings();
    settings.itemCount = count;
    await saveShopSettings(settings);
}

function openCategoryManager() {
    const modal = document.getElementById('shop-category-manage-modal');
    modal.classList.add('visible');
    
    // 填充数量设置
    const settings = getShopSettings();
    const countInput = document.getElementById('shop-item-count');
    if (countInput) {
        countInput.value = settings.itemCount || 8;
    }
    
    renderCategoryList();
}

function renderCategoryList() {
    const list = document.getElementById('shop-category-list');
    const categories = getCustomCategories();
    
    if (categories.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无自定义分类</div>';
        return;
    }

    list.innerHTML = categories.map((cat, index) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${escapeShopText(cat.name)} <span style="font-weight:normal; color:#999; font-size:12px;">(${escapeShopText(cat.id)})</span></div>
                <div style="font-size:12px; color:#666;">${escapeShopText(cat.prompt)}</div>
            </div>
            <button class="btn btn-danger btn-small" data-category-index="${index}" style="margin-left:10px;">删除</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-category-index]').forEach((button) => {
        button.addEventListener('click', () => deleteCategory(Number(button.dataset.categoryIndex)));
    });
}

async function addCategory() {
    const idInput = document.getElementById('shop-cat-id');
    const nameInput = document.getElementById('shop-cat-name');
    const promptInput = document.getElementById('shop-cat-prompt');
    
    const id = idInput.value.trim();
    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();

    if (!id || !name || !prompt) {
        showToast('请填写完整信息');
        return;
    }

    // 检查 ID 是否冲突 (包括默认分类)
    const defaultIds = ['recommend', 'food', 'general', 'guess', 'character_choice'];
    const currentCategories = getCustomCategories();
    if (defaultIds.includes(id) || currentCategories.some(c => c.id === id)) {
        showToast('分类 ID 已存在，请更换');
        return;
    }

    currentCategories.push({ id, name, prompt });
    await saveCustomCategories(currentCategories);
    
    // 清空输入
    idInput.value = '';
    nameInput.value = '';
    promptInput.value = '';
    
    renderCategoryList();
    showToast('添加成功');
}

async function deleteCategory(index) {
    if (!confirm('确定要删除这个分类吗？')) return;
    
    const categories = getCustomCategories();
    categories.splice(index, 1);
    await saveCustomCategories(categories);
    renderCategoryList();
}

// 将 deleteCategory 暴露给全局以便 HTML onclick 调用
window.deleteCategory = deleteCategory;

// 处理提取商品确认
async function handlePickupConfirm() {
    const input = document.getElementById('shop-pickup-input');
    const code = input.value.trim();
    
    if (!code) {
        showToast('请输入口令');
        return;
    }

    // 查找匹配的订单
    const chat = getShopChat();
    if (!chat) return;

    let found = false;
    let foundItemName = '';

    // 遍历历史记录查找未提取的自提订单
    // 格式: [A为B下单了：自提口令: xxx|金额|商品清单]
    // 注意：口令匹配忽略大小写和空格
    for (let i = chat.history.length - 1; i >= 0; i--) {
        const msg = chat.history[i];
        if (msg.role === 'assistant' && !msg.isPickedUp) {
            const match = msg.content.match(/\[.*?为.*?下单了：自提口令:\s*(.*?)\|.*?\|(.*?)\]/);
            if (match) {
                const msgCode = match[1].trim();
                const items = match[2].trim();
                
                if (msgCode.toLowerCase() === code.toLowerCase()) {
                    // 匹配成功
                    msg.isPickedUp = true;
                    found = true;
                    foundItemName = items;
                    break; // 只提取最近的一单，或者全部提取？这里假设一次提取一单
                }
            }
        }
    }

    if (found) {
        await saveData();
        document.getElementById('shop-pickup-modal').classList.remove('visible');
        input.value = '';
        
        // 刷新聊天界面以显示商品名
        renderMessages(false, false); // 重新渲染，不强制滚动
        
        // 弹窗提示成功
        alert(`提取成功！\n你获得了：${foundItemName}`);
        
        // 可选：发送一条系统消息或用户消息确认
        // sendSystemMessage(`成功提取了 ${foundItemName}`);
    } else {
        showToast('口令无效或商品已被提取');
    }
}

function initCartUI() {
    // 购物清单已改为全屏页面，清理旧版弹层/悬浮球
    document.querySelector('.shop-cart-fab')?.remove();
    document.querySelector('.shop-cart-panel')?.remove();
    document.querySelector('.shop-cart-overlay')?.remove();
    updateCartUI();
}

// 购物车持久化：每个角色各自一份
function loadCart() {
    const chat = getShopChat();
    shopState.cart = (chat && Array.isArray(chat.shopCart)) ? chat.shopCart : [];
}

function saveCart() {
    const chat = getShopChat();
    if (!chat) return;
    chat.shopCart = shopState.cart;
    dexieDB.characters.update(chat.id, { shopCart: chat.shopCart });
}

// 购物车操作
function addToCart(item) {
    if (!item || !item.name) return;
    const existing = shopState.cart.find(i => i.item.name === item.name);
    if (existing) {
        existing.quantity++;
    } else {
        shopState.cart.push({ item: item, quantity: 1 });
    }
    saveCart();
    updateCartUI();
    showToast('已加入购物车');
}

function removeFromCart(itemName) {
    const index = shopState.cart.findIndex(i => i.item.name === itemName);
    if (index > -1) {
        shopState.cart[index].quantity--;
        if (shopState.cart[index].quantity <= 0) {
            shopState.cart.splice(index, 1);
        }
        saveCart();
        updateCartUI();
    }
}

function clearCart() {
    shopState.cart = [];
    saveCart();
    updateCartUI();
}

function updateCartUI() {
    const totalCount = shopState.cart.reduce((sum, i) => sum + i.quantity, 0);

    // 底栏购物车角标
    if (shopGlassBar) shopGlassBar.setBadge('cart', totalCount);

    // 购物清单页处于激活状态时同步刷新
    if (shopState.bottomTab === 'cart') {
        renderCartPage();
    }
}

// 将 addToCart 暴露给全局以便 HTML 字符串调用（如果需要）
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.openCartDeliveryModal = openCartDeliveryModal;

// 打开商城
async function openShopScreen() {
    shopState.currentTab = 'all';
    shopState.bottomTab = 'home';
    closeFavoriteDetail();
    shopGlassBar?.close();
    renderShopTabs();
    updateBottomTabbar('home');
    setShopPageMode('home');
    loadCart();
    updateCartUI();
    switchScreen('shop-screen');
    
    // 加载收藏和订单数据
    loadFavorites();
    loadOrders();
    
    if (shopState.isLoading) {
        renderShopLoading();
        return;
    }

    const chat = getShopChat();
    if (chat && chat.shopData && chat.shopData.items) {
        shopState.banner = chat.shopData.banner;
        shopState.items = chat.shopData.items;
        updateTabsUI('all');
        renderShopContent();
    } else {
        renderShopInitialState();
    }
}

// 强制刷新商城
async function forceRefreshShop() {
    if (shopState.isLoading) return; // 避免重复点击
    
    // 检查是否已有商品，如果有则需要确认，否则直接开始
    const hasItems = shopState.items && Object.values(shopState.items).some(arr => arr && arr.length > 0);

    if (hasItems && !confirm('确定要清空当前商品并重新进货吗？')) return;

    shopState.isLoading = true;
    shopState.currentTab = 'all';
    
    renderShopLoading();
    updateTabsUI('all');

    try {
        // 清空数据库中的缓存
        const chat = getShopChat();
        if (chat) {
            delete chat.shopData;
            await dexieDB.characters.update(chat.id, { shopData: null });
        }

        await fetchShopData();
        renderShopContent();
    } catch (e) {
        console.error("商城刷新失败", e);
        renderShopError(e.message || '进货失败了，请稍后再试');
    } finally {
        shopState.isLoading = false;
    }
}

// 切换 Tab
function switchShopTab(tabId) {
    shopState.currentTab = tabId;
    updateTabsUI(tabId);
    renderShopContent();
}

function updateTabsUI(activeId) {
    const tabsContainer = document.getElementById('shop-tabs-container');
    if (!tabsContainer) return;
    
    Array.from(tabsContainer.children).forEach(el => {
        if (el.dataset.id === activeId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function getTabName(id) {
    const map = {
        'all': '全部',
        'food': '生活家居',
        'general': '数码好物',
        'guess': '美妆个护',
        'character_choice': '穿搭配饰'
    };
    
    if (map[id]) return map[id];

    // 查找自定义分类
    const customCategories = getCustomCategories();
    const found = customCategories.find(c => c.id === id);
    return found ? found.name : id;
}

// 渲染 Loading (骨架屏)
function renderShopLoading() {
    const container = document.getElementById('shop-content-container');
    container.innerHTML = `
        <div class="shop-loading-skeleton">
            <div class="skeleton-banner"></div>
            <div class="skeleton-grid">
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                </div>
            </div>
        </div>
    `;
}

// 渲染错误
function renderShopError(errorMessage = '进货失败了，请稍后再试') {
    const container = document.getElementById('shop-content-container');
    const isApiError = errorMessage.includes('API未配置');
    
    let html = `
        <div class="shop-empty-state">
            <div style="font-size: 36px; margin-bottom: 12px;">${isApiError ? '⚙️' : '🚧'}</div>
            <div class="empty-title">${errorMessage}</div>
    `;
    
    if (isApiError) {
        html += `
            <p style="font-size: 12px; color: #999; margin-top: 10px;">请先在设置中配置API接口</p>
            <button class="btn btn-primary" onclick="switchScreen('api-settings-screen')" style="margin-top: 15px;">去配置API</button>
        `;
    } else {
        html += `
            <button class="btn btn-primary" onclick="forceRefreshShop()" style="margin-top: 15px;">重试</button>
        `;
    }
    
    html += `
        </div>
    `;
    
    container.innerHTML = html;
}

// 渲染初始状态（手动触发进货）
function renderShopInitialState() {
    const container = document.getElementById('shop-content-container');
    container.innerHTML = `
        <div class="shop-empty-state">
            <div class="empty-title">暂无商品内容</div>
            <div class="empty-subtitle">可搜索商品，或点刷新生成分类推荐</div>
        </div>
    `;
}

// 获取 AI 数据
async function fetchShopData() {
    // 构造 Prompt
    const chat = getShopChat();
    if (!chat) {
        console.error('商城：没有找到任何聊天');
        throw new Error('没有可用的聊天数据');
    }

    const contextPrompt = generatePrivateSystemPrompt(chat);

    // 截取最近 50 条消息作为参考
    let historySlice = chat.history.slice(-50);
    historySlice = filterHistoryForAI(chat, historySlice);

    const recentHistory = historySlice.map(m => {
        return `${m.role === 'user' ? '我' : chat.realName}: ${m.content}`;
    }).join('\n');

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;

    // 获取商品数量设置
    const settings = getShopSettings();
    const itemCount = settings.itemCount || 8;

    // 构建分类 Prompt
    let categoryPrompt = `
        *   **all**：综合推荐。按照当前世界观，模拟购物软件的主推送页面，包含当前热门趋势、流行商品、广告等。
        *   **food **：外卖、食物、饮料、零食。
        *   **general (百货市场)**：日用品、礼物、数码、服饰。
        *   **guess (猜你喜欢)**：针对用户，模拟大数据推送生成我（${chat.myName}）可能会想购买的推荐商品，这些商品应该反映我的兴趣、需求或我们最近聊到的话题。
        *   **character_choice (${chat.realName}想买？)**：模拟 ${chat.realName} 最近浏览过的商品，这些商品应该反映Ta的兴趣、需求或我们最近聊到的话题。
    `;

    // 添加自定义分类
    const customCategories = getCustomCategories();
    customCategories.forEach(cat => {
        categoryPrompt += `\n        *   **${cat.id} (${cat.name})**：${cat.prompt}`;
    });

    // 构建 XML 示例
    let xmlExample = `
    <shop>
      <banner>
        <title>活动标题</title>
        <desc>活动标语</desc>
        <bgStart>#颜色1</bgStart>
        <bgEnd>#颜色2</bgEnd>
      </banner>
      <items>
        <all>
          <item>
            <name>商品标题</name>
            <desc>商品规格</desc>
            <price>9.9</price>
            <type>food</type>
            <isAd>false</isAd>
          </item>
          ... (共${itemCount}个)
        </all>
        <food>
          ... (共${itemCount}个)
        </food>
        <general>
          ... (共${itemCount}个)
        </general>
        <guess>
          ... (共${itemCount}个)
        </guess>
        <character_choice>
          ... (共${itemCount}个)
        </character_choice>`;
    
    customCategories.forEach(cat => {
        xmlExample += `\n        <${cat.id}>\n          ... (共${itemCount}个)\n        </${cat.id}>`;
    });
    xmlExample += `\n      </items>\n    </shop>`;

    const shopPrompt = `
    ${contextPrompt}
    
    ---

    【最近聊天记录】
    ${recentHistory}
    
    ---
    
    【任务指令】
    你需要模拟知名购物软件"商城"的界面。
    
    请根据当前世界观、时代背景、今天的日期（${dateStr}），生成一份商品清单。

    【要求】
    1.  **活动Banner**：设计一个符合今日日期或随机节日（如春节、情人节、疯狂星期四、双11、普通周末等）的促销活动语，文案要吸引用户消费。
    2.  **商品分类与数量**：必须严格生成以下分类，每个分类 **必须包含 ${itemCount} 个商品**：
        ${categoryPrompt}
    3.  **商品内容**：
        *   name: 商品标题。
        *   desc: 商品规格。（禁止学习角色口吻，需客观平然）
        *   price: 价格（数字）。
        *   type: 图标类型，只能从以下选择一个：'food', 'gift', 'gadget', 'pill', 'mystery', 'flower', 'clothes'。
        *   isAd: 是否为广告商品 (true/false)。
    
    【输出格式】
    只输出纯 XML 数据，不要包含 markdown 代码块标记，不要有任何其他解释文字。
    XML 结构如下：
    ${xmlExample}
    `;

    // 调用 API
    const apiConfig = resolveAuxiliaryApiConfig('shop');
    let { url, key, model, provider } = apiConfig;
    
    // 检查API是否已配置
    if (!url || !key) {
        throw new Error('API未配置');
    }
    
    // 兼容 Gemini 和其他 OpenAI 格式接口
    let requestBody, endpoint, headers;

    if (provider === 'gemini') {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: "你是一个只输出 XML 数据的 API 接口。" + shopPrompt }]
            }],
            generationConfig: {
                temperature: 0.8
            }
        };
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        };
        requestBody = {
            model: model,
            messages: [
                { role: "system", content: "你是一个只输出 XML 数据的 API 接口。" },
                { role: "user", content: shopPrompt }
            ],
            temperature: 0.8
        };
    }

    let content = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);

    // 清洗 XML
    content = content.replace(/```xml/g, '').replace(/```/g, '').trim();
    // 尝试提取 <shop> 之间的内容
    const xmlMatch = content.match(/<shop>[\s\S]*<\/shop>/);
    if (xmlMatch) content = xmlMatch[0];

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        
        // 检查解析错误
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error("XML Parser Error: " + parserError.textContent);
        }

        const shopNode = xmlDoc.querySelector('shop');
        if (!shopNode) throw new Error("Missing <shop> root element");

        // 解析 banner
        const bannerNode = shopNode.querySelector('banner');
        let banner = null;
        if (bannerNode) {
            banner = {
                title: bannerNode.querySelector('title')?.textContent || '',
                desc: bannerNode.querySelector('desc')?.textContent || '',
                bgStart: bannerNode.querySelector('bgStart')?.textContent || '',
                bgEnd: bannerNode.querySelector('bgEnd')?.textContent || ''
            };
        }

        // 解析 items
        const itemsNode = shopNode.querySelector('items');
        const items = {};
        
        // 默认分类
        const categories = ['all', 'food', 'general', 'guess', 'character_choice'];
        // 自定义分类
        const customCategories = getCustomCategories();
        customCategories.forEach(cat => {
            categories.push(cat.id);
        });

        categories.forEach(catId => {
            items[catId] = [];
            const catNode = itemsNode?.querySelector(catId);
            if (catNode) {
                const itemNodes = catNode.querySelectorAll('item');
                itemNodes.forEach(itemNode => {
                    items[catId].push({
                        name: itemNode.querySelector('name')?.textContent || '',
                        desc: itemNode.querySelector('desc')?.textContent || '',
                        price: itemNode.querySelector('price')?.textContent || '0',
                        type: itemNode.querySelector('type')?.textContent || 'mystery',
                        isAd: itemNode.querySelector('isAd')?.textContent === 'true'
                    });
                });
            }
        });

        shopState.banner = banner;
        shopState.items = items;

        // 保存到数据库
        chat.shopData = {
            banner: banner,
            items: items,
            lastUpdated: Date.now()
        };
        await dexieDB.characters.update(chat.id, { shopData: chat.shopData });

    } catch (e) {
        console.error("XML Parse Error", e);
        throw new Error("XML Parse Error");
    }
}

// 渲染内容
function renderShopContent() {
    const container = document.getElementById('shop-content-container');
    container.innerHTML = '';

    // 1. 渲染 Banner (仅在全部页)
    if (shopState.currentTab === 'all' && shopState.banner) {
        const banner = document.createElement('div');
        banner.className = 'shop-banner';
        // 使用 AI 返回的颜色，或者默认渐变
        const bgStart = shopState.banner.bgStart || '#ff9a9e';
        const bgEnd = shopState.banner.bgEnd || '#fecfef';
        banner.style.background = `linear-gradient(135deg, ${bgStart} 0%, ${bgEnd} 100%)`;
        
        banner.innerHTML = `
            <div class="shop-banner-tag">限时活动</div>
            <div class="shop-banner-title">${escapeShopText(shopState.banner.title)}</div>
            <div class="shop-banner-desc">${escapeShopText(shopState.banner.desc)}</div>
            <div class="shop-banner-decoration">🎁</div>
        `;
        container.appendChild(banner);
    }

    // 2. 渲染网格
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    
    const items = shopState.items[shopState.currentTab] || [];
    
    if (items.length === 0) {
        container.innerHTML += `<div class="shop-empty-state"><div class="empty-title">暂无商品内容</div><div class="empty-subtitle">可搜索商品，或点刷新生成分类推荐</div></div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `shop-item-card ${item.isAd ? 'ad-item' : ''}`;
        
        // 图标匹配
        let svgIcon = ShopIcons[item.type] || ShopIcons.mystery;
        // 颜色随机微调
        const iconColor = item.isAd ? '#f1c40f' : '#FF6B00';
        
        card.innerHTML = `
            <div class="shop-item-image-box">
                <div class="shop-item-svg" style="color: ${iconColor}; width: 64px; height: 64px;">${svgIcon}</div>
                ${item.isAd ? '<div class="shop-item-ad-badge">广告</div>' : ''}
            </div>
            <div class="shop-item-info">
                <div class="shop-item-name">${escapeShopText(item.name)}</div>
                <div class="shop-item-desc">${escapeShopText(item.desc)}</div>
                <div class="shop-item-footer">
                    <div class="shop-item-price">${escapeShopText(item.price)}</div>
                    <div class="shop-item-buy-btn" data-shop-action="add" role="button" aria-label="加入购物车">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"></path></svg>
                    </div>
                </div>
            </div>
        `;

        card.querySelector('[data-shop-action="add"]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            addToCart(item);
        });

        // 点击卡片不再直接加入购物车，防止误触
        // card.onclick = () => addToCart(item);
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// 打开配送选择弹窗 (现在用于购物车结算)
function openCartDeliveryModal() {
    const modal = document.getElementById('shop-delivery-modal');
    const title = document.getElementById('shop-delivery-item-name');
    
    const totalCount = shopState.cart.reduce((sum, i) => sum + i.quantity, 0);
    const totalPrice = shopState.cart.reduce((sum, i) => sum + (parseShopPrice(i.item.price) * i.quantity), 0);
    
    title.textContent = `结算 ${totalCount} 件商品 (合计 ¥${totalPrice.toFixed(2)})`;
    
    // 重置选择
    document.querySelectorAll('.delivery-option-card').forEach(el => el.classList.remove('active'));
    document.querySelector('.delivery-option-card[data-type="timed"]').classList.add('active'); 
    
    modal.classList.add('visible');
}

// 确认购买
function confirmPurchase() {
    if (shopState.cart.length === 0) return;

    // 获取当前角色信息
    const chat = getShopChat();
    if (!chat) return;
    const realName = chat.realName;
    const myName = chat.myName;

    // 获取选中的配送方式
    const activeOption = document.querySelector('.delivery-option-card.active');
    const deliveryType = activeOption ? activeOption.dataset.type : 'timed';
    
    let deliveryName = '30分钟后送达';
    if (deliveryType === 'instant') deliveryName = '即时送达';
    if (deliveryType === 'pay-for-me') deliveryName = '代付请求';
    if (deliveryType === 'pickup') deliveryName = '门店自提';
    
    if (deliveryType === 'pickup') {
        const code = document.getElementById('shop-pickup-code').value.trim();
        if (!code) {
            alert('请输入自提口令');
            return;
        }
        deliveryName = `自提口令: ${code}`;
    }
    
    // 计算总价
    const totalPrice = shopState.cart.reduce((sum, i) => sum + (parseShopPrice(i.item.price) * i.quantity), 0);

    // 钱包余额校验（代付请求不扣自己的钱）
    if (deliveryType !== 'pay-for-me' && totalPrice > 0 && window.Wallet) {
        if (!Wallet.canAfford(totalPrice)) {
            showToast(`钱包余额不足，还差 ¥${(totalPrice - Wallet.balance()).toFixed(2)}`);
            return;
        }
    }

    // 生成商品列表字符串: 商品名x数量
    const itemsStr = shopState.cart.map(entry => `${entry.item.name} x${entry.quantity}`).join(', ');

    // 从钱包扣款
    if (deliveryType !== 'pay-for-me' && totalPrice > 0 && window.Wallet) {
        const paid = Wallet.spend(totalPrice, {
            type: 'payment',
            title: '商城购物',
            subtitle: `${deliveryName} · ${itemsStr.length > 28 ? itemsStr.slice(0, 28) + '…' : itemsStr}`
        });
        if (!paid) {
            showToast('钱包余额不足');
            return;
        }
    }

    // 创建订单记录
    addOrder({
        items: itemsStr,
        totalPrice: totalPrice.toFixed(2),
        deliveryType: deliveryName
    });

    // 格式生成
    let messageText = '';
    if (deliveryType === 'pay-for-me') {
        // 代付请求格式: [myName向realName发起了代付请求:总价|商品清单]
        messageText = `[${myName}向${realName}发起了代付请求:${totalPrice.toFixed(2)}|${itemsStr}]`;
    } else {
        // 普通订单格式: [myName为realName下单了：配送方式|总价|商品清单]
        messageText = `[${myName}为${realName}下单了：${deliveryName}|${totalPrice.toFixed(2)}|${itemsStr}]`;
    }

    // 清空购物车
    clearCart();

    // 关闭所有层级，发送消息
    document.getElementById('shop-delivery-modal').classList.remove('visible');
    if (!currentChatId) {
        currentChatId = chat.id;
        currentChatType = 'private';
        if (typeof updateCustomBubbleStyle === 'function') {
            updateCustomBubbleStyle(chat.id, chat.customBubbleCss, chat.useCustomBubbleCss);
        }
        if (typeof openChatRoom === 'function') openChatRoom(chat.id, 'private');
    } else {
        switchScreen('chat-room-screen');
    }
    
    // 调用 chat.js 的发送逻辑
    const input = document.getElementById('message-input');
    if (input) {
        input.value = messageText;
        document.getElementById('send-message-btn').click(); // 触发点击事件发送
    }
}

// 配送选项点击逻辑 (HTML 中 onclick 绑定)
window.selectDeliveryOption = function(type) {
    document.querySelectorAll('.delivery-option-card').forEach(el => {
        if (el.dataset.type === type) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    const pickupInputContainer = document.getElementById('pickup-code-input-container');
    if (type === 'pickup') {
        pickupInputContainer.style.display = 'block';
    } else {
        pickupInputContainer.style.display = 'none';
    }
};



// 搜索商品
function searchShopItems(query) {
    if (!query) return;
    
    const allItems = [];
    Object.values(shopState.items).forEach(arr => {
        if (arr) allItems.push(...arr);
    });
    
    const results = allItems.filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.desc.toLowerCase().includes(query.toLowerCase())
    );
    
    const container = document.getElementById('shop-content-container');
    if (results.length === 0) {
        container.innerHTML = `<div class="shop-empty-state"><div class="empty-title">未找到"${escapeShopText(query)}"相关商品</div><div class="empty-subtitle">试试其他关键词，或点刷新生成推荐</div></div>`;
        return;
    }
    
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    
    results.forEach(item => {
        const card = document.createElement('div');
        card.className = `shop-item-card ${item.isAd ? 'ad-item' : ''}`;
        let svgIcon = ShopIcons[item.type] || ShopIcons.mystery;
        const iconColor = item.isAd ? '#f1c40f' : '#FF6B00';
        
        card.innerHTML = `
            <div class="shop-item-image-box">
                <div class="shop-item-svg" style="color: ${iconColor}; width: 64px; height: 64px;">${svgIcon}</div>
                ${item.isAd ? '<div class="shop-item-ad-badge">广告</div>' : ''}
            </div>
            <div class="shop-item-info">
                <div class="shop-item-name">${escapeShopText(item.name)}</div>
                <div class="shop-item-desc">${escapeShopText(item.desc)}</div>
                <div class="shop-item-footer">
                    <div class="shop-item-price">${escapeShopText(item.price)}</div>
                    <div class="shop-item-buy-btn" data-shop-action="add" role="button" aria-label="加入购物车">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"></path></svg>
                    </div>
                </div>
            </div>
        `;
        card.querySelector('[data-shop-action="add"]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            addToCart(item);
        });
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

// 底部 Tab 栏处理：每个图标对应独立页面
function updateBottomTabbar(tab) {
    if (shopGlassBar) shopGlassBar.setActive(tab);
}

// 切换页面模式：home 显示顶部搜索/分类，其余页面只显示页面本身内容
function setShopPageMode(page) {
    const screen = document.getElementById('shop-screen');
    const content = document.getElementById('shop-content-container');
    const plain = page !== 'home';
    if (screen) screen.classList.toggle('shop-page-plain', plain);
    if (content) {
        content.classList.toggle('shop-content-cart', page === 'cart');
        content.classList.toggle('shop-content-fav', page === 'favorite');
    }
}

function handleBottomTab(tab) {
    shopState.bottomTab = tab;
    updateBottomTabbar(tab);
    setShopPageMode(tab);

    if (tab === 'home') {
        shopState.currentTab = 'all';
        updateTabsUI('all');
        renderShopContent();
    } else if (tab === 'delivery') {
        renderDeliveryPage();
    } else if (tab === 'favorite') {
        renderFavoritePage();
    } else if (tab === 'cart') {
        renderCartPage();
    }
}

// 渲染购物清单整页
function renderCartPage() {
    const container = document.getElementById('shop-content-container');
    if (!container) return;

    const totalPrice = shopState.cart.reduce((sum, i) => sum + (parseShopPrice(i.item.price) * i.quantity), 0);
    const isEmpty = shopState.cart.length === 0;

    const listHtml = isEmpty
        ? `<div class="shop-empty-state">
                <div style="font-size: 48px; margin-bottom: 12px;">🛒</div>
                <div class="empty-title">购物车是空的</div>
                <div class="empty-subtitle">去逛逛，把喜欢的商品加进来吧</div>
            </div>`
        : shopState.cart.map((entry, index) => `
            <div class="cart-item-row" data-cart-index="${index}">
                <div class="cart-item-name">${escapeShopText(entry.item.name)}</div>
                <div class="cart-item-price">¥${escapeShopText(entry.item.price)}</div>
                <div class="cart-item-controls">
                    <button class="cart-ctrl-btn minus" data-cart-action="minus">-</button>
                    <span class="cart-item-qty">${entry.quantity}</span>
                    <button class="cart-ctrl-btn plus" data-cart-action="plus">+</button>
                </div>
            </div>
        `).join('');

    container.innerHTML = `
        <div class="shop-cart-page">
            <div class="shop-cart-page-header">
                <span class="shop-cart-page-title">购物清单</span>
                ${isEmpty ? '' : '<button class="shop-cart-page-clear" onclick="clearCart()">清空</button>'}
            </div>
            <div class="shop-cart-page-list">${listHtml}</div>
            <div class="shop-cart-page-footer">
                <div class="cart-total-price">¥${totalPrice.toFixed(2)}</div>
                <button class="cart-checkout-btn" ${isEmpty ? 'disabled' : ''} onclick="openCartDeliveryModal()">去结算</button>
            </div>
        </div>
    `;

    container.querySelectorAll('[data-cart-action]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const row = button.closest('[data-cart-index]');
            const index = Number(row && row.dataset.cartIndex);
            const entry = Number.isInteger(index) ? shopState.cart[index] : null;
            if (!entry) return;
            if (button.dataset.cartAction === 'minus') removeFromCart(entry.item.name);
            else addToCart(entry.item);
        });
    });
}

// 渲染配送/订单页面
function renderDeliveryPage() {
    const container = document.getElementById('shop-content-container');
    container.innerHTML = '';
    
    // 加载订单数据
    loadOrders();
    
    if (shopState.orders.length === 0) {
        container.innerHTML = `
            <div class="shop-empty-state">
                <div style="font-size: 48px; margin-bottom: 12px;">📦</div>
                <div class="empty-title">暂无订单</div>
                <div class="empty-subtitle">下单后可以在这里查看配送状态</div>
            </div>
        `;
        return;
    }
    
    const ordersHtml = shopState.orders.map((order, index) => {
        const statusIcon = order.status === 'delivered' ? '✅' : order.status === 'shipping' ? '🚚' : '📋';
        const statusText = order.status === 'delivered' ? '已送达' : order.status === 'shipping' ? '配送中' : '待处理';
        const statusColor = order.status === 'delivered' ? '#4CAF50' : order.status === 'shipping' ? '#2196F3' : '#FF9800';
        
        return `
            <div class="shop-order-card" style="background: white; border-radius: 12px; padding: 15px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-size: 12px; color: #999;">订单号: ${order.orderId}</div>
                    <div style="font-size: 12px; color: ${statusColor}; font-weight: 600;">${statusIcon} ${statusText}</div>
                </div>
                <div style="font-size: 14px; color: #333; margin-bottom: 8px;">${order.items}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 16px; font-weight: 600; color: #FF6B00;">¥${order.totalPrice}</div>
                    <div style="font-size: 12px; color: #999;">${order.deliveryType} · ${order.time}</div>
                </div>
                ${order.status !== 'delivered' ? `
                    <button class="btn btn-secondary" style="width: 100%; margin-top: 10px; font-size: 13px;" onclick="confirmOrderDelivery(${index})">确认送达</button>
                ` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div style="padding: 12px;">
            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">我的订单</h3>
            ${ordersHtml}
        </div>
    `;
}

// 收藏页内置的 HTML 商品：整个页面原样作为物品图片展示
const FAV_DEFAULT_HTML_ITEM = {
    id: 'fav_seed_package_tear',
    name: '包装撕开粒子消散',
    style: '金装',
    desc: '撕开金色包装，粉末粒子在空气中消散的完整交互页面。',
    price: '',
    quantity: 1,
    image: '',
    htmlCode: '',
    htmlSrc: 'assets/fav-items/package-tear.html',
    createdAt: 0
};

// 渲染收藏页面（液态玻璃风格，每行最多 3 个，只显示图片 + 名称）
function renderFavoritePage() {
    const container = document.getElementById('shop-content-container');
    if (!container) return;

    loadFavorites();

    const cardsHtml = shopState.favorites.map((item, index) => `
        <article class="fav-card" data-fav-open="${index}">
            <div class="fav-media">${renderFavoriteMedia(item, index)}</div>
            <div class="fav-name">${escapeShopText(item.name || '未命名物品')}</div>
        </article>
    `).join('');

    container.innerHTML = `
        <div class="shop-fav-page">
            <div class="fav-topbar">
                <div>
                    <h1 class="fav-title">收藏</h1>
                    <p class="fav-subtitle">已收录 ${shopState.favorites.length} 件心头好 · 点击物品查看详情</p>
                </div>
                <button class="fav-add-btn" id="fav-add-btn" aria-label="添加收藏">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
            ${shopState.favorites.length === 0 ? `
                <div class="fav-empty">
                    <div class="fav-empty-icon">🫧</div>
                    <div class="fav-empty-title">还没有收藏</div>
                    <div class="fav-empty-sub">点右上角的 + 添加一件喜欢的物品</div>
                </div>
            ` : `<div class="fav-grid">${cardsHtml}</div>`}
        </div>
    `;

    document.getElementById('fav-add-btn')?.addEventListener('click', openFavoriteAddModal);

    // 点击物品进入全屏详情页
    container.querySelectorAll('[data-fav-open]').forEach((card) => {
        card.addEventListener('click', () => openFavoriteDetail(Number(card.dataset.favOpen)));
    });

    // 内嵌 HTML 商品：写入内容并等比缩放，完整展示整个页面
    container.querySelectorAll('[data-fav-html-index]').forEach((frame) => {
        const item = shopState.favorites[Number(frame.dataset.favHtmlIndex)];
        if (item && item.htmlCode) frame.srcdoc = item.htmlCode;
    });
    scaleFavoriteFrames(container);
}

// 渲染物品媒体：HTML 页面 > 上传图片 > 占位
// HTML 物品 iframe 加缓存穿透参数，改 HTML 后立即生效
const FAV_HTML_BUST = 'v=20261110d';
const bustHtmlSrc = (src) => src ? src + (src.includes('?') ? '&' : '?') + FAV_HTML_BUST : src;

function renderFavoriteMedia(item, index) {
    if (item.htmlSrc) {
        return `<div class="fav-html-wrap"><iframe class="fav-html-frame" src="${escapeShopText(bustHtmlSrc(item.htmlSrc))}" sandbox="allow-scripts" scrolling="no" loading="lazy" tabindex="-1"></iframe></div>`;
    }
    if (item.htmlCode) {
        return `<div class="fav-html-wrap"><iframe class="fav-html-frame" data-fav-html-index="${index}" sandbox="allow-scripts" scrolling="no" loading="lazy" tabindex="-1"></iframe></div>`;
    }
    if (item.image) {
        return `<img class="fav-media-img" src="${item.image}" alt="${escapeShopText(item.name)}">`;
    }
    return `<div class="fav-media-empty">🖼️</div>`;
}

// HTML 物品（package-tear 等 pantoria 模板）对准参数：
// 模板设计画布 1280x720，包装中心设计坐标约 (640, 348)（即旧 360 宽 iframe 下的 y≈98）
const FAV_HTML_ZOOM = 2.4;
const FAV_HTML_ZOOM_DETAIL = 2.8;
const FAV_HTML_VW = 360;
const FAV_HTML_SS = 3;          // 超采样倍率：iframe 按 3 倍尺寸渲染再缩小，避免放大后模糊
const FAV_DESIGN_W = 1280;      // 模板设计宽度
const FAV_DESIGN_H = 720;       // 模板设计高度
const FAV_PACK_CX = 640;        // 包装中心设计 x
const FAV_PACK_CY = 348;        // 包装中心设计 y

// 换算：iframe 内布局 r = frameCssW / 设计宽；CSS 缩放 S 再映射到容器像素
function favFrameTransformOf(wrap, zoom) {
    const w = wrap.clientWidth || 0, h = wrap.clientHeight || 0;
    if (!w || !h) return 'translate(0px, 0px) scale(1)';
    const frameW = FAV_HTML_VW * FAV_HTML_SS;          // iframe CSS 宽（1080）
    const r = frameW / FAV_DESIGN_W;                   // 模板内部布局缩放
    const S = (w / FAV_HTML_VW) * zoom / FAV_HTML_SS;  // iframe -> 容器 的 CSS 缩放
    const tx = w / 2 - FAV_PACK_CX * r * S;
    const ty = h / 2 - FAV_PACK_CY * r * S;
    return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${S.toFixed(4)})`;
}

function favFrameTransform(wrap) {
    return favFrameTransformOf(wrap, FAV_HTML_ZOOM);
}

// HTML 物品：放大对准包装，正方形展示；容器尺寸变化（首次布局/切页）时重算
function scaleFavoriteFrames(scope) {
    (scope || document).querySelectorAll('.fav-html-wrap').forEach((wrap) => {
        const frame = wrap.querySelector('iframe');
        if (!frame) return;
        const apply = () => { frame.style.transform = favFrameTransform(wrap); };
        apply();
        if (!wrap.__favRO) {
            wrap.__favRO = new ResizeObserver(apply);
            wrap.__favRO.observe(wrap);
        }
    });
}

// 打开收藏物品全屏详情页（上半物品媒体、下半信息，可从右上角进入编辑）
function openFavoriteDetail(index) {
    const item = shopState.favorites[index];
    if (!item) return;
    closeFavoriteDetail();
    favoriteDetailIndex = index;

    const screen = document.getElementById('shop-screen');
    if (!screen) return;

    let mediaHtml = '';
    if (item.htmlSrc) {
        mediaHtml = `<iframe class="fav-detail-frame" src="${escapeShopText(bustHtmlSrc(item.htmlSrc))}" sandbox="allow-scripts allow-same-origin" scrolling="no"></iframe>`;
    } else if (item.htmlCode) {
        mediaHtml = `<iframe class="fav-detail-frame" data-fav-detail-html sandbox="allow-scripts" scrolling="no"></iframe>`;
    } else if (item.image) {
        mediaHtml = `<img class="fav-detail-img" src="${item.image}" alt="${escapeShopText(item.name)}">`;
    } else {
        mediaHtml = `<div class="fav-detail-media-empty">🖼️</div>`;
    }

    const chips = [];
    if (item.style) chips.push(`款式 · ${escapeShopText(item.style)}`);
    if (item.price) chips.push(`价格 · ${escapeShopText(item.price)}`);
    chips.push(`数量 · ${item.quantity || 1}`);

    const overlay = document.createElement('div');
    overlay.className = 'fav-detail';
    overlay.innerHTML = `
        <div class="fav-detail-head">
            <button class="fav-detail-back" id="fav-detail-back" aria-label="返回">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button class="fav-detail-edit" id="fav-detail-edit" aria-label="编辑物品">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            </button>
        </div>
        <div class="fav-detail-media">
            <div class="fav-detail-frame-wrap">${mediaHtml}</div>
        </div>
        <div class="fav-detail-body">
            <h2 class="fav-detail-name">${escapeShopText(item.name || '未命名物品')}</h2>
            <div class="fav-detail-meta">${chips.map((chip) => `<span class="fav-detail-chip">${chip}</span>`).join('')}</div>
            ${item.desc ? `<p class="fav-detail-desc">${escapeShopText(item.desc)}</p>` : ''}
        </div>
    `;
    screen.appendChild(overlay);

    document.getElementById('fav-detail-back')?.addEventListener('click', closeFavoriteDetail);
    document.getElementById('fav-detail-edit')?.addEventListener('click', () => openFavoriteEditModal(favoriteDetailIndex));

    const htmlFrame = overlay.querySelector('[data-fav-detail-html]');
    if (htmlFrame && item.htmlCode) htmlFrame.srcdoc = item.htmlCode;

    fitFavoriteDetailFrame();
}

// 详情页 HTML：与网格预览同款对准逻辑，缩放更大以占满媒体区
function fitFavoriteDetailFrame() {
    const wrap = document.querySelector('.fav-detail-frame-wrap');
    const frame = wrap ? wrap.querySelector('.fav-detail-frame') : null;
    if (!wrap || !frame) return;
    frame.style.transform = favFrameTransformOf(wrap, FAV_HTML_ZOOM_DETAIL);
}

function closeFavoriteDetail() {
    document.querySelector('.fav-detail')?.remove();
    favoriteDetailIndex = -1;
}

// 打开添加收藏弹窗
function openFavoriteAddModal() {
    openFavoriteModal(-1);
}

// 打开编辑弹窗
function openFavoriteEditModal(index) {
    openFavoriteModal(index);
}

function openFavoriteModal(index) {
    const item = index >= 0 ? shopState.favorites[index] : null;
    favoriteEditIndex = item ? index : -1;
    favoriteImageDraft = item ? (item.image || '') : '';
    favoriteHtmlDraft = item ? (item.htmlCode || '') : '';
    favoriteHtmlSrc = item ? (item.htmlSrc || '') : '';

    const title = document.getElementById('fav-modal-title');
    if (title) title.textContent = item ? '编辑物品' : '添加收藏';
    const saveBtn = document.getElementById('fav-save-btn');
    if (saveBtn) saveBtn.textContent = item ? '保存修改' : '保存';
    const delBtn = document.getElementById('fav-delete-btn');
    if (delBtn) delBtn.hidden = !item;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    setValue('fav-name-input', item ? item.name || '' : '');
    setValue('fav-style-input', item ? item.style || '' : '');
    setValue('fav-desc-input', item ? item.desc || '' : '');
    setValue('fav-price-input', item ? item.price || '' : '');
    setValue('fav-qty-input', item ? String(item.quantity || 1) : '1');

    const imageInput = document.getElementById('fav-image-input');
    if (imageInput) imageInput.value = '';

    applyFavoriteMediaPreview();
    document.getElementById('fav-add-modal')?.classList.add('visible');
}

function closeFavoriteAddModal() {
    document.getElementById('fav-add-modal')?.classList.remove('visible');
}

// 保存手动添加 / 编辑的收藏物品
function saveFavoriteItem() {
    const nameInput = document.getElementById('fav-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        showToast('请填写物品名称');
        nameInput?.focus();
        return;
    }

    let quantity = parseInt(document.getElementById('fav-qty-input')?.value, 10);
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

    const data = {
        name,
        style: document.getElementById('fav-style-input')?.value.trim() || '',
        desc: document.getElementById('fav-desc-input')?.value.trim() || '',
        price: document.getElementById('fav-price-input')?.value.trim() || '',
        quantity,
        image: favoriteImageDraft,
        htmlCode: favoriteHtmlDraft,
        htmlSrc: favoriteHtmlSrc
    };

    const isEdit = favoriteEditIndex >= 0 && !!shopState.favorites[favoriteEditIndex];
    if (isEdit) {
        shopState.favorites[favoriteEditIndex] = { ...shopState.favorites[favoriteEditIndex], ...data };
    } else {
        shopState.favorites.push({
            id: 'fav_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            ...data,
            createdAt: Date.now()
        });
    }

    saveFavorites();
    closeFavoriteAddModal();
    renderFavoritePage();
    // 详情页开着时实时刷新内容（改名/改图后立即生效）
    if (favoriteDetailIndex >= 0 && shopState.favorites[favoriteDetailIndex]) {
        openFavoriteDetail(favoriteDetailIndex);
    }
    showToast(isEdit ? '已保存修改' : '已添加收藏');
}

function deleteFavoriteItem(index) {
    const item = shopState.favorites[index];
    if (!item) return;
    if (!confirm(`确定要移除「${item.name}」吗？`)) return;
    shopState.favorites.splice(index, 1);
    favoriteEditIndex = -1;
    if (favoriteDetailIndex === index) closeFavoriteDetail();
    else if (favoriteDetailIndex > index) favoriteDetailIndex -= 1;
    saveFavorites();
    closeFavoriteAddModal();
    renderFavoritePage();
    if (favoriteDetailIndex >= 0 && shopState.favorites[favoriteDetailIndex]) {
        openFavoriteDetail(favoriteDetailIndex);
    }
    showToast('已移除');
}

// 压缩用户上传的图片，避免占满本地存储
function readFavoriteImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxSize = 520;
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => reject(new Error('图片解析失败'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });
}

// 保存收藏到本地数据库
function saveFavorites() {
    const chat = getShopChat();
    if (chat) {
        chat.shopFavorites = shopState.favorites;
        dexieDB.characters.update(chat.id, { shopFavorites: chat.shopFavorites });
    }
}

// 加载收藏并兼容旧数据
function loadFavorites() {
    const chat = getShopChat();
    let list = (chat && Array.isArray(chat.shopFavorites)) ? chat.shopFavorites.slice() : [];

    // 首次进入收藏页时自动收录内置的 HTML 商品（只加一次，删除后不再出现）
    if (chat && !chat.shopFavSeedPackageV1) {
        if (!list.some((item) => item && item.id === FAV_DEFAULT_HTML_ITEM.id)) {
            list.unshift({ ...FAV_DEFAULT_HTML_ITEM });
        }
        chat.shopFavSeedPackageV1 = true;
        dexieDB.characters.update(chat.id, {
            shopFavorites: list,
            shopFavSeedPackageV1: true
        });
    }

    shopState.favorites = list.map((item) => ({
        ...item,
        style: item.style || '',
        desc: item.desc || '',
        image: item.image || '',
        htmlCode: item.htmlCode || '',
        htmlSrc: item.htmlSrc || '',
        price: item.price == null ? '' : String(item.price),
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1)
    }));
}

// 添加订单
function addOrder(orderData) {
    const order = {
        orderId: 'ORD' + Date.now(),
        items: orderData.items,
        totalPrice: orderData.totalPrice,
        deliveryType: orderData.deliveryType,
        time: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }),
        status: 'pending'
    };
    shopState.orders.unshift(order);
    saveOrders();
    return order;
}

// 确认送达
function confirmOrderDelivery(index) {
    shopState.orders[index].status = 'delivered';
    saveOrders();
    renderDeliveryPage();
    showToast('已确认送达');
}

// 保存订单到 localStorage
function saveOrders() {
    const chat = getShopChat();
    if (chat) {
        chat.shopOrders = shopState.orders;
        dexieDB.characters.update(chat.id, { shopOrders: chat.shopOrders });
    }
}

// 加载订单 from localStorage
function loadOrders() {
    const chat = getShopChat();
    if (chat && chat.shopOrders) {
        shopState.orders = chat.shopOrders;
    }
}

// 暴露给全局
window.confirmOrderDelivery = confirmOrderDelivery;

// 清空商城数据
async function clearShopData() {
    const chat = getShopChat();
    if (chat) {
        delete chat.shopData;
        await dexieDB.characters.update(chat.id, { shopData: null });
    }
    const emptyItems = { all: [], food: [], general: [], guess: [], character_choice: [] };
    getCustomCategories().forEach(cat => { emptyItems[cat.id] = []; });
    shopState.items = emptyItems;
    shopState.banner = null;
    shopState.currentTab = 'all';
    renderShopTabs();
    updateTabsUI('all');
    renderShopInitialState();
}

window.searchShopItems = searchShopItems;
window.handleBottomTab = handleBottomTab;
window.clearShopData = clearShopData;

// 导出供 main.js 使用
let shopSystemInitialized = false;
window.setupShopSystem = function() {
    if (shopSystemInitialized) return;
    shopSystemInitialized = true;
    initShopSystem();
    // 绑定返回按钮
    const backBtn = document.querySelector('.shop-back-btn');
    if (backBtn) {
        backBtn.onclick = () => {
            switchScreen('home-screen');
        };
    }

    // 绑定弹窗关闭
    const deliveryCancelBtn = document.getElementById('shop-delivery-cancel');
    if (deliveryCancelBtn) {
        deliveryCancelBtn.onclick = () => {
            document.getElementById('shop-delivery-modal').classList.remove('visible');
        };
    }
};
