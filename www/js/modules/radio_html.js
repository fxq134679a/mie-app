/* 一起听电台 — 静态外壳 (黑胶唱片风格)
 * 依赖顺序：radio_html.js → radio.js
 */
"use strict";

(function () {
  var screen = document.getElementById("radio-screen");
  if (!screen) return;
  screen.innerHTML =
    '<div class="radio-root" id="radio-root">' +
      '<div class="rv-topbar" id="rv-topbar">' +
        '<button class="rv-topbar-btn rv-menu-btn" id="rv-menu-btn"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>' +
        '<span class="rv-topbar-title" id="rv-topbar-title">网易云音乐</span>' +
        '<button class="rv-topbar-btn rv-topbar-action" id="rv-topbar-action"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>' +
      '</div>' +
      '<div class="rv-content" id="rv-content">' +
        '<div class="rv-view rv-view-home active" id="rv-view-home"></div>' +
        '<div class="rv-view rv-view-search" id="rv-view-search"></div>' +
        '<div class="rv-view rv-view-notes" id="rv-view-notes"></div>' +
        '<div class="rv-view rv-view-me" id="rv-view-me"></div>' +
        '<div class="rv-view rv-view-settings" id="rv-view-settings"></div>' +
      '</div>' +
      '<div class="rv-tabbar" id="rv-tabbar">' +
        '<button class="rv-tab active" data-tab="home">' +
          '<span class="rv-tab-label">首页</span>' +
        '</button>' +
        '<button class="rv-tab" data-tab="search">' +
          '<span class="rv-tab-label">搜索</span>' +
        '</button>' +
        '<button class="rv-tab" data-tab="notes">' +
          '<span class="rv-tab-label">歌单</span>' +
        '</button>' +
        '<button class="rv-tab" data-tab="me">' +
          '<span class="rv-tab-label">我的</span>' +
        '</button>' +
      '</div>' +
      '<div class="radio-modalhost" id="radio-modals"></div>' +
    '</div>';
})();
