// --- 钱包 APP ---
// 余额与明细统一存在 db.wallet（globalSettings 的 wallet 键）

const WALLET_MAX_RECORDS = 300;

let walletFilter = 'all';

function walletDefaultState() {
    return {
        balance: 0,
        transactions: [],
        cardNumber: '6222 0913 2026 1111',
        cardholder: 'MIE MEMBER',
        updatedAt: 0
    };
}

function walletRound(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function getWalletState() {
    if (!window.db) return walletDefaultState();
    if (!db.wallet || typeof db.wallet !== 'object') db.wallet = walletDefaultState();
    if (!Array.isArray(db.wallet.transactions)) db.wallet.transactions = [];
    if (!Number.isFinite(Number(db.wallet.balance))) db.wallet.balance = 0;
    if (!db.wallet.cardNumber) db.wallet.cardNumber = '6222 0913 2026 1111';
    if (!db.wallet.cardholder) db.wallet.cardholder = 'MIE MEMBER';
    return db.wallet;
}

function persistWallet() {
    if (!window.dexieDB) return;
    try {
        dexieDB.globalSettings.put({
            key: 'wallet',
            value: JSON.parse(JSON.stringify(getWalletState()))
        }).catch(() => {});
    } catch (e) {}
}

function walletFormatAmount(value) {
    const n = Math.abs(Number(value) || 0);
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function walletRecord(options) {
    const state = getWalletState();
    const value = walletRound(options.amount);
    if (!value) return null;

    state.balance = walletRound(state.balance + value);
    state.updatedAt = Date.now();

    const record = {
        id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: options.type || (value > 0 ? 'income' : 'payment'),
        title: options.title || '交易',
        subtitle: options.subtitle || '',
        amount: value,
        time: Date.now()
    };
    state.transactions.unshift(record);
    if (state.transactions.length > WALLET_MAX_RECORDS) {
        state.transactions.length = WALLET_MAX_RECORDS;
    }

    persistWallet();
    window.dispatchEvent(new CustomEvent('wallet:update'));
    return record;
}

const Wallet = {
    state: getWalletState,
    balance() {
        return getWalletState().balance;
    },
    canAfford(amount) {
        return getWalletState().balance + 0.001 >= (Number(amount) || 0);
    },
    spend(amount, options = {}) {
        const value = walletRound(amount);
        if (value <= 0) return true;
        if (!this.canAfford(value)) return false;
        walletRecord({ ...options, amount: -value });
        return true;
    },
    income(amount, options = {}) {
        const value = walletRound(amount);
        if (value <= 0) return false;
        walletRecord({ ...options, amount: value });
        return true;
    },
    recharge(amount) {
        return this.income(amount, { type: 'recharge', title: '充值', subtitle: '余额充值' });
    },
    open: openWalletScreen,
    refresh: renderWalletScreen
};
window.Wallet = Wallet;

const WALLET_ICONS = {
    recharge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    payment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    transfer_out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    transfer_in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17"/><path d="M16 17H7V8"/></svg>',
    redpacket_in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 8h18"/><path d="M12 8v13"/><path d="M12 8c-1.5-2.6-5.5-2.6-4.5 0"/><path d="M12 8c1.5-2.6 5.5-2.6 4.5 0"/></svg>',
    redpacket_out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 8h18"/><path d="M12 8v13"/><path d="M12 8c-1.5-2.6-5.5-2.6-4.5 0"/><path d="M12 8c1.5-2.6 5.5-2.6 4.5 0"/></svg>',
    refund: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
};

const WALLET_ICON_TONES = {
    recharge: 'blue',
    payment: 'orange',
    transfer_out: 'violet',
    transfer_in: 'green',
    redpacket_in: 'red',
    redpacket_out: 'red',
    refund: 'teal'
};

function escapeWalletText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function walletDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (timestamp >= todayStart) return '今天';
    if (timestamp >= todayStart - 86400000) return '昨天';
    const prefix = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`;
    return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`;
}

function walletTimeLabel(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function maskWalletCardNumber(cardNumber) {
    const digits = String(cardNumber || '').replace(/\s+/g, '');
    if (digits.length < 8) return cardNumber || '6222 •••• •••• 1111';
    const first = digits.slice(0, 4);
    const last = digits.slice(-4);
    return `${first} •••• •••• ${last}`;
}

function renderWalletScreen() {
    const screen = document.getElementById('wallet-screen');
    if (!screen) return;

    const state = getWalletState();

    const balanceEl = document.getElementById('wallet-balance-value');
    if (balanceEl) balanceEl.textContent = walletFormatAmount(state.balance);

    const numberEls = document.querySelectorAll('#wallet-screen .uw-card-number');
    numberEls.forEach((el) => { el.textContent = state.cardNumber || '6222 0913 2026 1111'; });

    const holderEls = document.querySelectorAll('#wallet-screen .uw-holder');
    holderEls.forEach((el) => { el.textContent = state.cardholder || 'MIE MEMBER'; });

    const countEl = document.getElementById('wallet-history-count');
    if (countEl) countEl.textContent = state.transactions.length ? `共 ${state.transactions.length} 笔` : '';

    const list = document.getElementById('wallet-history-list');
    if (!list) return;

    const filtered = state.transactions.filter((item) => {
        if (walletFilter === 'income') return item.amount > 0;
        if (walletFilter === 'expense') return item.amount < 0;
        return true;
    });

    if (!filtered.length) {
        list.innerHTML = `
            <div class="wallet-empty">
                <div class="wallet-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/></svg>
                </div>
                <div class="wallet-empty-title">还没有交易记录</div>
                <div class="wallet-empty-sub">充值或买东西后，每一笔都会记在这里</div>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDateLabel = '';
    filtered.forEach((item) => {
        const dateLabel = walletDateLabel(item.time);
        if (dateLabel !== lastDateLabel) {
            lastDateLabel = dateLabel;
            html += `<div class="wallet-date-divider">${dateLabel}</div>`;
        }

        const icon = WALLET_ICONS[item.type] || WALLET_ICONS.payment;
        const tone = WALLET_ICON_TONES[item.type] || 'gray';
        const isIncome = item.amount > 0;
        const amountText = `${isIncome ? '+' : '-'}¥${walletFormatAmount(item.amount)}`;

        html += `
            <div class="wallet-record">
                <div class="wallet-record-icon ${tone}">${icon}</div>
                <div class="wallet-record-main">
                    <div class="wallet-record-title">${escapeWalletText(item.title)}</div>
                    <div class="wallet-record-sub">${escapeWalletText(item.subtitle || walletTimeLabel(item.time))}</div>
                </div>
                <div class="wallet-record-side">
                    <div class="wallet-record-amount ${isIncome ? 'income' : 'expense'}">${amountText}</div>
                    <div class="wallet-record-time">${item.subtitle ? walletTimeLabel(item.time) : ''}</div>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function updateWalletFilterUI() {
    document.querySelectorAll('#wallet-screen [data-wallet-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.walletFilter === walletFilter);
    });
}

function openWalletScreen() {
    renderWalletScreen();
    updateWalletFilterUI();
    switchScreen('wallet-screen');
}

let walletSelectedRechargeAmount = 100;

function openWalletRechargeSheet() {
    const modal = document.getElementById('wallet-recharge-modal');
    if (!modal) return;

    walletSelectedRechargeAmount = 100;
    const customInput = document.getElementById('wallet-custom-amount');
    if (customInput) customInput.value = '';
    document.querySelectorAll('#wallet-amount-grid [data-amount]').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.amount) === walletSelectedRechargeAmount);
    });

    modal.classList.add('visible');
}

function closeWalletRechargeSheet() {
    const modal = document.getElementById('wallet-recharge-modal');
    if (modal) modal.classList.remove('visible');
}

function confirmWalletRecharge() {
    const customInput = document.getElementById('wallet-custom-amount');
    const customValue = parseFloat(customInput ? customInput.value : '');
    const amount = customValue > 0 ? customValue : walletSelectedRechargeAmount;

    if (!Number.isFinite(amount) || amount <= 0) {
        showToast('请输入充值金额');
        return;
    }
    if (amount > 100000) {
        showToast('单次最多充值 100000 元');
        return;
    }

    Wallet.recharge(amount);
    closeWalletRechargeSheet();
    renderWalletScreen();
    showToast(`已充值 ¥${walletFormatAmount(amount)}`);
}

function setupWalletApp() {
    if (window.__walletAppReady) return;
    window.__walletAppReady = true;

    const backBtn = document.getElementById('wallet-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => switchScreen('home-screen'));

    const rechargeBtn = document.getElementById('wallet-recharge-btn');
    if (rechargeBtn) rechargeBtn.addEventListener('click', openWalletRechargeSheet);

    document.querySelectorAll('#wallet-detail-btn, #wallet-detail-btn-ghost').forEach((detailBtn) => {
        detailBtn.addEventListener('click', () => {
            const section = document.getElementById('wallet-history');
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const cancelBtn = document.getElementById('wallet-recharge-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeWalletRechargeSheet);

    const confirmBtn = document.getElementById('wallet-recharge-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmWalletRecharge);

    const overlay = document.getElementById('wallet-recharge-modal');
    if (overlay) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeWalletRechargeSheet();
        });
    }

    document.querySelectorAll('#wallet-amount-grid [data-amount]').forEach((button) => {
        button.addEventListener('click', () => {
            walletSelectedRechargeAmount = Number(button.dataset.amount) || 0;
            const customInput = document.getElementById('wallet-custom-amount');
            if (customInput) customInput.value = '';
            document.querySelectorAll('#wallet-amount-grid [data-amount]').forEach((item) => {
                item.classList.toggle('active', item === button);
            });
        });
    });

    document.querySelectorAll('#wallet-screen [data-wallet-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            walletFilter = button.dataset.walletFilter;
            updateWalletFilterUI();
            renderWalletScreen();
        });
    });

    window.addEventListener('wallet:update', () => {
        if (document.getElementById('wallet-screen')) renderWalletScreen();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) renderWalletScreen();
    });

    renderWalletScreen();
}

window.openWalletScreen = openWalletScreen;
window.setupWalletApp = setupWalletApp;
window.Wallet = Wallet;

document.addEventListener('DOMContentLoaded', () => {
    setupWalletApp();
});
