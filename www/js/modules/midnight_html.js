/* 深夜电台 MIDNIGHT FM — 静态外壳（纸墨收音机风）
 * 依赖顺序：midnight_html.js → midnight.js
 */
"use strict";

(function () {
  var screen = document.getElementById("midnight-screen");
  if (!screen) return;
  screen.innerHTML =
    '<div class="mn-root" id="mn-root">' +
      '<div class="mn-topbar" id="mn-topbar">' +
        '<button class="mn-topbar-btn" id="mn-back-btn" style="visibility:hidden"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#141417" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
        '<span class="mn-topbar-title" id="mn-topbar-title">MIDNIGHT FM</span>' +
        '<button class="mn-topbar-btn" id="mn-gear-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#141417" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
      '</div>' +
      '<div class="mn-content">' +
        '<div class="mn-view mn-view-home active" id="mn-view-home"></div>' +
        '<div class="mn-view mn-view-live" id="mn-view-live"></div>' +
        '<div class="mn-view mn-view-archive" id="mn-view-archive"></div>' +
        '<div class="mn-view mn-view-detail" id="mn-view-detail"></div>' +
        '<div class="mn-view mn-view-mail" id="mn-view-mail"></div>' +
      '</div>' +
      '<div class="mn-modalhost" id="mn-modals"></div>' +
    '</div>';
})();
