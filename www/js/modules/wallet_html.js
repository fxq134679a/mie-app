document.addEventListener('DOMContentLoaded', () => {
    const walletHtml = `
    <div class="wallet-backdrop" aria-hidden="true">
        <span class="wallet-blob blob-a"></span>
        <span class="wallet-blob blob-b"></span>
        <span class="wallet-blob blob-c"></span>
    </div>

    <header class="wallet-header">
        <button class="wallet-back-btn" id="wallet-back-btn" aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <h1 class="wallet-brand">WALLET</h1>
        <button class="wallet-header-icon" id="wallet-detail-btn" aria-label="明细">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-4 2-4-2-3 2V3a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>
        </button>
    </header>

    <main class="wallet-scroll">
        <section class="wallet-card-wrap uw-wrap">
            <div class="uw-wallet" id="uw-wallet">
                <div class="uw-wallet-back"></div>

                <div class="uw-card stripe">
                    <div class="uw-card-inner">
                        <div class="uw-card-top">
                            <span>STRIPE</span>
                            <div class="uw-chip"></div>
                        </div>
                        <div class="uw-card-bottom">
                            <div>
                                <span class="uw-label">Card Holder</span>
                                <span class="uw-value uw-holder">MIE MEMBER</span>
                            </div>
                            <div class="uw-card-number-wrapper">
                                <span class="uw-hidden-stars">•••• ••••</span>
                                <span class="uw-card-number">6222 0913 2026 1111</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-card wise">
                    <div class="uw-card-inner">
                        <div class="uw-card-top">
                            <span>WISE</span>
                            <div class="uw-chip"></div>
                        </div>
                        <div class="uw-card-bottom">
                            <div>
                                <span class="uw-label">Card Holder</span>
                                <span class="uw-value uw-holder">MIE MEMBER</span>
                            </div>
                            <div class="uw-card-number-wrapper">
                                <span class="uw-hidden-stars">•••• ••••</span>
                                <span class="uw-card-number">6222 0913 2026 1111</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-card paypal">
                    <div class="uw-card-inner">
                        <div class="uw-card-top">
                            <span>PAYPAL</span>
                            <div class="uw-chip"></div>
                        </div>
                        <div class="uw-card-bottom">
                            <div>
                                <span class="uw-label">Card Holder</span>
                                <span class="uw-value uw-holder">MIE MEMBER</span>
                            </div>
                            <div class="uw-card-number-wrapper">
                                <span class="uw-hidden-stars">•••• ••••</span>
                                <span class="uw-card-number">6222 0913 2026 1111</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-pocket"></div>

                <div class="uw-pocket-content">
                    <span class="uw-balance-stars">¥ ••••••</span>
                    <span class="uw-balance-real">¥<span id="wallet-balance-value">0.00</span></span>
                    <div class="uw-eye-icon-wrapper">
                        <svg class="uw-eye-icon" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                            <g class="uw-eye-slash">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                                <line x1="1" y1="1" x2="23" y2="23"/>
                            </g>
                            <g class="uw-eye-open">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        </section>

        <section class="wallet-balance-panel">
            <div class="wallet-balance-head">
                <span class="wallet-balance-label">可用余额</span>
                <span class="wallet-balance-badge">CNY</span>
            </div>
            <div class="wallet-balance-amount">
                <span class="wallet-currency">¥</span><span id="wallet-balance-value">0.00</span>
            </div>
            <div class="wallet-actions">
                <button class="wallet-action-primary" id="wallet-recharge-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    充值
                </button>
                <button class="wallet-action-ghost" id="wallet-detail-btn-ghost">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V7"/><path d="M9 17V4"/><path d="M15 17v-6"/><path d="M21 17V9"/></svg>
                    明细
                </button>
            </div>
        </section>

        <section class="wallet-history" id="wallet-history">
            <div class="wallet-section-head">
                <h2>交易明细</h2>
                <span class="wallet-history-count" id="wallet-history-count"></span>
            </div>
            <div class="wallet-filter-row" role="tablist">
                <button class="wallet-filter-chip active" data-wallet-filter="all" role="tab">全部</button>
                <button class="wallet-filter-chip" data-wallet-filter="income" role="tab">收入</button>
                <button class="wallet-filter-chip" data-wallet-filter="expense" role="tab">支出</button>
            </div>
            <div class="wallet-history-list" id="wallet-history-list"></div>
        </section>
    </main>

    <div class="wallet-sheet-overlay" id="wallet-recharge-modal">
        <div class="wallet-sheet">
            <div class="wallet-sheet-handle"></div>
            <h2 class="wallet-sheet-title">充值</h2>
            <p class="wallet-sheet-sub">选择金额，立即到账</p>

            <div class="wallet-amount-grid" id="wallet-amount-grid">
                <button class="wallet-amount-chip active" data-amount="50"><span>¥</span>50</button>
                <button class="wallet-amount-chip" data-amount="100"><span>¥</span>100</button>
                <button class="wallet-amount-chip" data-amount="200"><span>¥</span>200</button>
                <button class="wallet-amount-chip" data-amount="500"><span>¥</span>500</button>
                <button class="wallet-amount-chip" data-amount="1000"><span>¥</span>1000</button>
                <button class="wallet-amount-chip" data-amount="2000"><span>¥</span>2000</button>
            </div>

            <div class="wallet-custom-row">
                <span class="wallet-custom-symbol">¥</span>
                <input id="wallet-custom-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="自定义金额">
            </div>

            <button class="wallet-sheet-confirm" id="wallet-recharge-confirm">确认充值</button>
            <button class="wallet-sheet-cancel" id="wallet-recharge-cancel">取消</button>
        </div>
    </div>
    `;

    const container = document.getElementById('wallet-screen');
    if (container) {
        container.innerHTML = walletHtml;
    }
});
