// ============================================================
// 小红书 APP —— 静态 HTML 注入（xiaohongshu_html.js）
// 参考 js/modules/shop_html.js / video_call.js 的模式：
// 全局函数 injectXiaohongshuHTML() 把静态骨架一次性注入
// #xiaohongshu-screen（容器本身已是 .screen，不嵌套 .screen）。
// 动态区域由 js/modules/xiaohongshu.js 负责渲染。
// ============================================================

/* global document, window */

function injectXiaohongshuHTML() {
    var screen = document.getElementById("xiaohongshu-screen");
    if (!screen) return;

    var html = ''
        // 小红书模块内缺失的 CSS（cp-refresh-indicator / cp-spin / cp-bilingual /
        // 设置开关）由本模块自带的最小样式补齐，其余样式全部来自
        // css/modules/xiaohongshu.css。
        + '<style id="xhs-inline-style">'
        + '@keyframes xhsDotBlink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}'
        + '@keyframes xhsSpin{to{transform:rotate(360deg)}}'
        + '#xhs-busy-indicator{position:absolute;top:calc(var(--cp-appbar-safe-top,0px) + 12px);left:50%;transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:8px;background:rgba(28,25,32,.9);color:#fff;font-size:12px;line-height:1;padding:8px 14px;border-radius:999px;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.22);white-space:nowrap}'
        + '#xhs-busy-indicator .cp-refresh-indicator-dots{display:inline-flex;gap:3px}'
        + '#xhs-busy-indicator .cp-refresh-indicator-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:xhsDotBlink 1.2s infinite}'
        + '#xhs-busy-indicator .cp-refresh-indicator-dots i:nth-child(2){animation-delay:.15s}'
        + '#xhs-busy-indicator .cp-refresh-indicator-dots i:nth-child(3){animation-delay:.3s}'
        + '.cp-spin{display:inline-block;width:1em;height:1em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:xhsSpin .8s linear infinite;vertical-align:-.14em}'
        + '.cp-bilingual-original{color:inherit}'
        + '.cp-bilingual-toggle{display:inline-block;margin:0 5px;padding:1px 7px;border-radius:999px;border:1px solid rgba(0,0,0,.14);background:rgba(255,255,255,.72);color:#8a858f;font-size:.86em;line-height:1.5;cursor:pointer;user-select:none;white-space:nowrap;vertical-align:baseline}'
        + '.cp-bilingual--light .cp-bilingual-toggle{border-color:rgba(255,255,255,.45);background:rgba(0,0,0,.35);color:rgba(255,255,255,.85)}'
        + '.cp-bilingual-toggle:hover{color:#ff2442;border-color:#ff2442}'
        + '.cp-bilingual--light .cp-bilingual-toggle:hover{color:#fff;background:rgba(255,36,66,.55)}'
        + '.cp-bilingual-translation{color:#8a858f}'
        + '.cp-bilingual--light .cp-bilingual-translation{color:rgba(255,255,255,.82)}'
        + '.cp-bilingual-inline-separator{display:inline}'
        + '.cp-bilingual-divider{display:block;height:1px;margin:6px 0;background:rgba(0,0,0,.1)}'
        + '.cp-bilingual--light .cp-bilingual-divider{background:rgba(255,255,255,.28)}'
        + '.xhs-toggle{position:relative;width:44px;height:26px;border-radius:999px;border:0;background:#ddd;padding:0;cursor:pointer;transition:background .18s;flex:none}'
        + '.xhs-toggle::after{content:"";position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .18s}'
        + '.xhs-toggle.is-checked{background:#ff2442}'
        + '.xhs-toggle.is-checked::after{transform:translateX(18px)}'
        + '</style>'
        + '<section class="xhs-app cp-xhs-module" id="xhs-app">'
        +   '<header class="cp-xhs-appbar xhs-appbar" id="xhs-appbar">'
        +     '<button type="button" class="back-btn cp-float-back" data-target="home-screen" aria-label="返回桌面">'
        +       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
        +     '</button>'
        +     '<div class="cp-xhs-header-stack" id="xhs-header-titles"></div>'
        +     '<div class="cp-appbar-actions" id="xhs-appbar-actions">'
        +       '<button type="button" class="cp-float-refresh xhs-icon-action xhs-icon-action--refresh" data-action="feed-refresh" aria-label="刷新小红书内容" disabled>'
        +         '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>'
        +       '</button>'
        +       '<button type="button" class="cp-float-refresh xhs-icon-action xhs-icon-action--clear" data-action="feed-clear" aria-label="清空小红书内容" disabled>'
        +         '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
        +       '</button>'
        +     '</div>'
        +   '</header>'
        +   '<div class="cp-refresh-indicator cp-refresh-indicator--floating" id="xhs-busy-indicator" style="display:none" aria-live="polite">'
        +     '<span class="cp-refresh-indicator-text" id="xhs-busy-text"></span>'
        +     '<span class="cp-refresh-indicator-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
        +   '</div>'
        +   '<main class="cp-xhs-body" id="xhs-body">'
        +     '<div class="cp-xhs-thread-screen xhs-dm-thread-screen" id="xhs-screen-dm" style="display:none"></div>'
        +     '<div class="cp-xhs-video-detail-screen xhs-video-detail-screen" id="xhs-screen-video" style="display:none"></div>'
        +     '<div class="cp-xhs-scroll cp-xhs-scroll--detail xhs-detail-page" id="xhs-screen-detail" style="display:none"></div>'
        +     '<div class="cp-xhs-scroll" id="xhs-screen-main" style="display:none">'
        +       '<section class="cp-xhs-home" id="xhs-pane-home" style="display:none"></section>'
        +       '<section class="cp-xhs-home" id="xhs-pane-video" style="display:none"></section>'
        +       '<section class="cp-xhs-panel cp-xhs-message-page xhs-message-page" id="xhs-pane-messages" style="display:none"></section>'
        +       '<section class="cp-xhs-profile xhs-profile" id="xhs-pane-profile" style="display:none"></section>'
        +     '</div>'
        +   '</main>'
        +   '<nav class="cp-xhs-tabbar xhs-tabbar" id="xhs-tabbar" aria-label="小红书导航"></nav>'
        +   '<div class="xhs-modal-backdrop" id="xhs-modal-publish" style="display:none">'
        +     '<section class="xhs-publish-sheet" id="xhs-publish-sheet"></section>'
        +   '</div>'
        +   '<div class="xhs-modal-backdrop" id="xhs-modal-settings" style="display:none">'
        +     '<section class="xhs-profile-edit-sheet xhs-settings-edit-sheet" id="xhs-settings-sheet"></section>'
        +   '</div>'
        +   '<div class="xhs-modal-backdrop" id="xhs-modal-profile" style="display:none">'
        +     '<section class="xhs-profile-edit-sheet" id="xhs-profile-sheet"></section>'
        +   '</div>'
        +   '<div class="xhs-modal-backdrop" id="xhs-modal-confirm" style="display:none">'
        +     '<section class="xhs-confirm-sheet" id="xhs-confirm-sheet" role="dialog" aria-modal="true"></section>'
        +   '</div>'
        +   '<input type="file" accept="image/*" id="xhs-publish-file-input" hidden />'
        +   '<input type="file" accept="image/*" id="xhs-cover-file-input" hidden />'
        + '</section>';

    screen.innerHTML = html;
}

injectXiaohongshuHTML();
