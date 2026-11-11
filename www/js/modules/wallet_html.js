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
        <section class="wallet-card-wrap">
            <div class="wallet-card" id="wallet-card">
                <div class="wallet-card-sheen"></div>
                <div class="wallet-card-top">
                    <span class="wallet-card-brand">MIE WALLET</span>
                    <span class="wallet-contactless">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 8a8 8 0 0 1 0 8"/><path d="M11 6a11 11 0 0 1 0 12"/><path d="M15 4a14 14 0 0 1 0 16"/></svg>
                    </span>
                </div>
                <div class="wallet-chip">
                    <span></span><span></span><span></span>
                </div>
                <div class="wallet-card-number" id="wallet-card-number">6222 •••• •••• 1111</div>
                <div class="wallet-card-bottom">
                    <div class="wallet-card-holder">
                        <span class="wallet-card-label">CARD HOLDER</span>
                        <span class="wallet-card-holder-name" id="wallet-card-holder">MIE MEMBER</span>
                    </div>
                    <div class="wallet-card-network">
                        <span class="network-ring ring-left"></span>
                        <span class="network-ring ring-right"></span>
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
