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
                    <div class="uw-tr tr-1"></div><div class="uw-tr tr-2"></div><div class="uw-tr tr-3"></div>
                    <div class="uw-tr tr-4"></div><div class="uw-tr tr-5"></div><div class="uw-tr tr-6"></div>
                    <div class="uw-tr tr-7"></div><div class="uw-tr tr-8"></div><div class="uw-tr tr-9"></div>
                    <div class="uw-fc-tilt">
                        <div class="uw-fc-glare"></div>
                        <div class="uw-fc-front">
                            <div class="uw-fc-header">
                                <div class="uw-fc-logo">
                                    <svg viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="4" y="4" width="92" height="62" rx="14" fill="#E8E8E8" stroke="#D1D1D1" stroke-width="6"></rect>
                                        <rect x="30" y="30" width="40" height="10" rx="5" fill="#4A4A4A"></rect>
                                        <path d="M 96 35 C 75 35 65 45 65 66 L 82 66 C 89.7 66 96 59.7 96 52 Z" fill="#F27800"></path>
                                    </svg>
                                </div>
                                <div class="uw-fc-nfc">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                        <path d="M12 2v20M17 5c2.5 3 2.5 11 0 14M21 2c4 4 4 16 0 20M7 5c-2.5 3-2.5 11 0 14M3 2c-4 4-4 16 0 20"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="uw-fc-chiprow">
                                <div class="uw-fc-chip">
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-main"></div>
                                </div>
                                <div class="uw-fc-type">STRIPE</div>
                            </div>
                            <div class="uw-fc-numbers embossed"><span>6222</span><span>0913</span><span>2026</span><span>1111</span></div>
                            <div class="uw-fc-footer">
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">CARDHOLDER</div>
                                    <div class="uw-fc-value embossed">Fanxiaoqian</div>
                                </div>
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">VALID THRU</div>
                                    <div class="uw-fc-value embossed">12/30</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-card wise">
                    <div class="uw-tr tr-1"></div><div class="uw-tr tr-2"></div><div class="uw-tr tr-3"></div>
                    <div class="uw-tr tr-4"></div><div class="uw-tr tr-5"></div><div class="uw-tr tr-6"></div>
                    <div class="uw-tr tr-7"></div><div class="uw-tr tr-8"></div><div class="uw-tr tr-9"></div>
                    <div class="uw-fc-tilt">
                        <div class="uw-fc-glare"></div>
                        <div class="uw-fc-front">
                            <div class="uw-fc-header">
                                <div class="uw-fc-logo">
                                    <svg viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="4" y="4" width="92" height="62" rx="14" fill="#E8E8E8" stroke="#D1D1D1" stroke-width="6"></rect>
                                        <rect x="30" y="30" width="40" height="10" rx="5" fill="#4A4A4A"></rect>
                                        <path d="M 96 35 C 75 35 65 45 65 66 L 82 66 C 89.7 66 96 59.7 96 52 Z" fill="#F27800"></path>
                                    </svg>
                                </div>
                                <div class="uw-fc-nfc">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                        <path d="M12 2v20M17 5c2.5 3 2.5 11 0 14M21 2c4 4 4 16 0 20M7 5c-2.5 3-2.5 11 0 14M3 2c-4 4-4 16 0 20"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="uw-fc-chiprow">
                                <div class="uw-fc-chip">
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-main"></div>
                                </div>
                                <div class="uw-fc-type">WISE</div>
                            </div>
                            <div class="uw-fc-numbers embossed"><span>9012</span><span>4432</span><span>8810</span></div>
                            <div class="uw-fc-footer">
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">CARDHOLDER</div>
                                    <div class="uw-fc-value embossed">Fanxiaoqian</div>
                                </div>
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">VALID THRU</div>
                                    <div class="uw-fc-value embossed">09/29</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-card paypal">
                    <div class="uw-tr tr-1"></div><div class="uw-tr tr-2"></div><div class="uw-tr tr-3"></div>
                    <div class="uw-tr tr-4"></div><div class="uw-tr tr-5"></div><div class="uw-tr tr-6"></div>
                    <div class="uw-tr tr-7"></div><div class="uw-tr tr-8"></div><div class="uw-tr tr-9"></div>
                    <div class="uw-fc-tilt">
                        <div class="uw-fc-glare"></div>
                        <div class="uw-fc-front">
                            <div class="uw-fc-header">
                                <div class="uw-fc-logo">
                                    <svg viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="4" y="4" width="92" height="62" rx="14" fill="#E8E8E8" stroke="#D1D1D1" stroke-width="6"></rect>
                                        <rect x="30" y="30" width="40" height="10" rx="5" fill="#4A4A4A"></rect>
                                        <path d="M 96 35 C 75 35 65 45 65 66 L 82 66 C 89.7 66 96 59.7 96 52 Z" fill="#F27800"></path>
                                    </svg>
                                </div>
                                <div class="uw-fc-nfc">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                        <path d="M12 2v20M17 5c2.5 3 2.5 11 0 14M21 2c4 4 4 16 0 20M7 5c-2.5 3-2.5 11 0 14M3 2c-4 4-4 16 0 20"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="uw-fc-chiprow">
                                <div class="uw-fc-chip">
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-line"></div>
                                    <div class="uw-fc-chip-main"></div>
                                </div>
                                <div class="uw-fc-type">PAYPAL</div>
                            </div>
                            <div class="uw-fc-numbers embossed"><span>3312</span><span>0045</span><span>0094</span></div>
                            <div class="uw-fc-footer">
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">CARDHOLDER</div>
                                    <div class="uw-fc-value embossed">Fanxiaoqian</div>
                                </div>
                                <div class="uw-fc-col">
                                    <div class="uw-fc-label">VALID THRU</div>
                                    <div class="uw-fc-value embossed">08/31</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uw-pocket">
                    <svg class="uw-pocket-svg" viewBox="0 0 280 160" fill="none">
                        <path
                            d="M 0 20 C 0 10, 5 10, 10 10 C 20 10, 25 25, 40 25 L 240 25 C 255 25, 260 10, 270 10 C 275 10, 280 10, 280 20 L 280 120 C 280 155, 260 160, 240 160 L 40 160 C 20 160, 0 155, 0 120 Z"
                            fill="#f4c2d0"
                        ></path>
                        <path
                            d="M 8 22 C 8 16, 12 16, 15 16 C 23 16, 27 29, 40 29 L 240 29 C 253 29, 257 16, 265 16 C 268 16, 272 16, 272 22 L 272 120 C 272 150, 255 152, 240 152 L 40 152 C 25 152, 8 152, 8 120 Z"
                            stroke="#d893ab"
                            stroke-width="1.5"
                            stroke-dasharray="6 4"
                        ></path>
                    </svg>
                    <div class="uw-pocket-content">
                        <div class="uw-balance-row">
                            <div class="uw-balance-stars">******</div>
                            <div class="uw-balance-real">&yen;<span id="wallet-balance-value">0.00</span></div>
                        </div>
                        <div class="uw-balance-caption">Total Balance</div>
                        <div class="uw-eye-icon-wrapper">
                            <svg
                                class="uw-eye-icon uw-eye-slash"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                                <line x1="3" y1="3" x2="21" y2="21"></line>
                            </svg>
                            <svg
                                class="uw-eye-icon uw-eye-open"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </div>
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
