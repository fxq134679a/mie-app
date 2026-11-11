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
    <nav class="shop-bottom-tabbar" id="shop-glass-bar" aria-label="商城导航"></nav>

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

    <!-- 收藏：添加物品 -->
    <div id="fav-add-modal" class="fav-modal-mask">
        <div class="fav-modal">
            <div class="fav-modal-grabber"></div>
            <div class="fav-modal-head">
                <h3 class="fav-modal-title" id="fav-modal-title">添加收藏</h3>
                <button class="fav-modal-close" id="fav-modal-close" aria-label="关闭">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="fav-modal-body">
                <label class="fav-upload" id="fav-upload-box">
                    <input type="file" id="fav-image-input" accept="image/*,.html,.htm" hidden>
                    <img id="fav-image-preview" class="fav-upload-preview" alt="">
                    <div class="fav-upload-hint">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <span id="fav-upload-hint-text">上传图片 / HTML 页面</span>
                    </div>
                </label>
                <div class="fav-form-row">
                    <div class="fav-field">
                        <label for="fav-name-input">名称</label>
                        <input type="text" id="fav-name-input" placeholder="物品名称">
                    </div>
                    <div class="fav-field">
                        <label for="fav-style-input">款式</label>
                        <input type="text" id="fav-style-input" placeholder="如：米白 / 大号">
                    </div>
                </div>
                <div class="fav-field">
                    <label for="fav-desc-input">描述</label>
                    <textarea id="fav-desc-input" rows="2" placeholder="记录一下喜欢它的理由"></textarea>
                </div>
                <div class="fav-form-row">
                    <div class="fav-field">
                        <label for="fav-price-input">价格</label>
                        <input type="number" id="fav-price-input" inputmode="decimal" min="0" step="0.01" placeholder="0.00">
                    </div>
                    <div class="fav-field">
                        <label for="fav-qty-input">数量</label>
                        <input type="number" id="fav-qty-input" inputmode="numeric" min="1" step="1" value="1">
                    </div>
                </div>
            </div>
            <button type="button" class="fav-delete-btn" id="fav-delete-btn">删除这个物品</button>
            <div class="fav-modal-actions">
                <button class="fav-btn fav-btn-ghost" id="fav-cancel-btn">取消</button>
                <button class="fav-btn fav-btn-primary" id="fav-save-btn">保存</button>
            </div>
        </div>
    </div>
    `;
    const container = document.getElementById('shop-screen');
    if (container) {
        container.innerHTML = shopHtml;
    }
});
