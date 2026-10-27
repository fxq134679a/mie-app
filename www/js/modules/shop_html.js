document.addEventListener('DOMContentLoaded', () => {
    const shopHtml = `
    <header class="shop-header">
        <div class="shop-header-top">
            <button class="shop-back-btn" data-target="home-screen">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="shop-header-title-group">
                <span class="shop-header-subtitle">Welcome Back</span>
                <h1 class="shop-header-title">Shopping</h1>
            </div>
            <div class="shop-header-actions">
                <button class="shop-header-action-btn" id="shop-trash-btn" title="清空">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <button class="shop-header-action-btn" id="shop-more-btn" title="更多">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
            </div>
        </div>
        <div class="shop-search-bar">
            <svg class="shop-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" class="shop-search-input" placeholder="搜索商品" id="shop-search-input">
            <button class="shop-search-btn" id="shop-search-btn">搜索新物品</button>
        </div>
    </header>
    <div class="shop-tabs" id="shop-tabs-container"></div>
    <main class="shop-content" id="shop-content-container"></main>
    <button class="shop-fab-refresh" id="shop-fab-refresh-btn" title="刷新">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
    </button>
    <nav class="shop-bottom-tabbar">
        <button class="shop-tabbar-item active" data-tab="home">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </button>
        <button class="shop-tabbar-item" data-tab="delivery">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
        </button>
        <button class="shop-tabbar-item" data-tab="cart">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        </button>
        <button class="shop-tabbar-item" data-tab="favorite">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
    </nav>

    <div id="shop-delivery-modal" class="modal-overlay">
        <div class="modal-window">
            <h3 id="shop-delivery-item-name">确认订单</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 15px;">请选择配送方式：</p>
            <div class="delivery-options">
                <div class="delivery-option-card active" data-type="timed" onclick="selectDeliveryOption('timed')">
                    <div class="delivery-icon">🛵</div>
                    <div class="delivery-info">
                        <div class="delivery-title">定时送达</div>
                        <div class="delivery-desc">预计 30 分钟内送达</div>
                    </div>
                    <div class="delivery-check"></div>
                </div>
                <div class="delivery-option-card" data-type="instant" onclick="selectDeliveryOption('instant')">
                    <div class="delivery-icon">⚡</div>
                    <div class="delivery-info">
                        <div class="delivery-title">即时送达</div>
                        <div class="delivery-desc">加急配送，立即送出</div>
                    </div>
                    <div class="delivery-check"></div>
                </div>
                <div class="delivery-option-card" data-type="pickup" onclick="selectDeliveryOption('pickup')">
                    <div class="delivery-icon"></div>
                    <div class="delivery-info">
                        <div class="delivery-title">门店自提</div>
                        <div class="delivery-desc">凭口令到店领取</div>
                    </div>
                    <div class="delivery-check"></div>
                </div>
                <div class="delivery-option-card" data-type="pay-for-me" onclick="selectDeliveryOption('pay-for-me')">
                    <div class="delivery-icon">🥺</div>
                    <div class="delivery-info">
                        <div class="delivery-title">让Ta买单</div>
                        <div class="delivery-desc">发送代付请求</div>
                    </div>
                    <div class="delivery-check"></div>
                </div>
            </div>
            
            <div id="pickup-code-input-container" style="display: none; margin-top: 15px;">
                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">自提口令</label>
                <input type="text" id="shop-pickup-code" placeholder="输入取货码/口令" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; outline: none;">
            </div>

            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="shop-delivery-confirm" class="btn btn-primary" style="flex: 1;">确认下单</button>
                <button id="shop-delivery-cancel" class="btn btn-neutral" style="flex: 1;">取消</button>
            </div>
        </div>
    </div>

    <!-- Shop More ActionSheet -->
    <div id="shop-more-actionsheet" class="action-sheet-overlay">
        <div class="action-sheet">
            <button class="action-sheet-button" id="shop-pickup-btn">🎁 提取商品 (输入口令)</button>
            <button class="action-sheet-button" id="shop-category-manage-btn">🏷️ 自定义分类</button>
            <button class="action-sheet-button danger" id="shop-more-cancel-btn">取消</button>
        </div>
    </div>

    <!-- Shop Category Manage Modal -->
    <div id="shop-category-manage-modal" class="modal-overlay">
        <div class="modal-window" style="max-height: 85vh; overflow-y: auto;">
            <h3>商城分类管理</h3>
            <div style="font-size: 12px; color: #666; margin-bottom: 10px; background: #f9f9f9; padding: 8px; border-radius: 6px;">
                添加自定义分类后，下次进货时 AI 将会根据你的提示词生成对应商品。
            </div>

            <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                <label for="shop-item-count" style="margin: 0;">每个分类生成数量</label>
                <input type="number" id="shop-item-count" value="8" min="1" max="20" style="width: 60px; text-align: center;">
            </div>
            
            <div id="shop-category-list" style="margin-bottom: 15px; border: 1px solid #eee; border-radius: 8px; padding: 10px; min-height: 100px;">
                <!-- JS populated list -->
            </div>

            <div class="form-group" style="border-top: 1px solid #eee; padding-top: 15px;">
                <label style="font-weight: bold; margin-bottom: 10px; display: block;">添加新分类</label>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <input type="text" id="shop-cat-id" placeholder="英文id (如: flower)" style="flex: 1; min-width: 0;" required>
                    <input type="text" id="shop-cat-name" placeholder="显示名称 (如: 🌸 花)" style="flex: 1; min-width: 0;" required>
                </div>
                <textarea id="shop-cat-prompt" rows="2" placeholder="简短的提示词：描述这个分类下应该卖什么商品..." style="width: 100%; margin-bottom: 10px;" required></textarea>
                <button id="shop-add-category-btn" class="btn btn-secondary" style="width: 100%;">+ 添加分类</button>
            </div>
            
            <div style="margin-top: 10px; text-align: right;">
                <button id="shop-category-close-btn" class="btn btn-primary" style="width: 100%;">完成</button>
            </div>
        </div>
    </div>

    <!-- Shop Pickup Modal -->
    <div id="shop-pickup-modal" class="modal-overlay">
        <div class="modal-window">
            <h3>提取商品</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 15px;">请输入订单中的自提口令或暗号：</p>
            <div class="form-group">
                <input type="text" id="shop-pickup-input" placeholder="例如：888888 或 汪汪汪" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; outline: none; font-size: 16px; text-align: center;">
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="shop-pickup-confirm" class="btn btn-primary" style="flex: 1;">确认提取</button>
                <button id="shop-pickup-cancel" class="btn btn-neutral" style="flex: 1;">取消</button>
            </div>
        </div>
    </div>
    `;
    const container = document.getElementById('shop-screen');
    if (container) {
        container.innerHTML = shopHtml;
    }
});
