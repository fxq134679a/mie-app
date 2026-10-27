// 开屏页 → 宿主页面通信
// 1) 点 ENTER：通知宿主提前结束开屏
// 2) 接收宿主传来的安全区（iframe 内 env(safe-area-inset-*) 恒为 0）

window.addEventListener('mist:enter', () => {
    try {
        parent.postMessage({ type: 'mie-mist-enter' }, '*');
    } catch (e) { /* 单独打开时 parent === self，忽略 */ }
});

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'mie-mist-insets') return;

    const top = Math.max(0, Number(d.top) || 0);
    const right = Math.max(0, Number(d.right) || 0);
    const bottom = Math.max(0, Number(d.bottom) || 0);
    const left = Math.max(0, Number(d.left) || 0);

    // splash.js 暴露的接口会同时更新 CSS 变量并重排文字
    if (typeof window.mistSplashEnvironment === 'function') {
        window.mistSplashEnvironment({ active: true, top, right, bottom, left });
    } else {
        const root = document.documentElement.style;
        root.setProperty('--safe-top', top + 'px');
        root.setProperty('--safe-right', right + 'px');
        root.setProperty('--safe-bottom', bottom + 'px');
        root.setProperty('--safe-left', left + 'px');
    }
});
