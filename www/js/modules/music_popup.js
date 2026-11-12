/* 音乐弹窗 (music popup) — uiverse hoshikawamaki/pretty-panther-5 黑胶卡片 1:1 还原
 * 收起态：小白卡 + 半露黑胶唱片；点击卡片展开（唱片弹出旋转 + 歌名歌手 + 进度条 + 控制键）
 * 展开态：点旋转的唱片收回。
 * 开关入口：电台 App「我的 → 设置 → 音乐弹窗」。依赖 radio.js（window.RadioApp）。
 * 样式：css/modules/music_popup.css
 */
(function () {
  "use strict";

  var LS_ENABLED = "radioMusicPopupEnabled";
  var LS_SHUFFLE = "radioMusicPopupShuffle";
  var LS_LAST = "radioPopupLastSong";   // 上一首播放的歌（弹窗常显用）
  var LS_POS = "radioPopupPos";         // 长按拖动后的位置（百分比）
  var LS_SCALE = "radioPopupScale";     // 弹窗大小（0.7 ~ 1.6）

  function isEnabled() {
    try { return localStorage.getItem(LS_ENABLED) === "1"; } catch (e) { return false; }
  }
  function isShuffle() {
    try { return localStorage.getItem(LS_SHUFFLE) === "1"; } catch (e) { return false; }
  }
  function getScale() {
    try {
      var v = Number(localStorage.getItem(LS_SCALE));
      if (isFinite(v) && v >= 0.5 && v <= 1.3) return v;
    } catch (e) {}
    return 1;
  }

  /* ===== 素材：黑胶唱片 SVG（原组件 128 viewBox）+ feather 图标 ===== */
  var VINYL =
    '<rect width="128" height="128" fill="black"></rect>' +
    '<circle cx="20" cy="20" r="2" fill="white"></circle>' +
    '<circle cx="40" cy="30" r="2" fill="white"></circle>' +
    '<circle cx="60" cy="10" r="2" fill="white"></circle>' +
    '<circle cx="80" cy="40" r="2" fill="white"></circle>' +
    '<circle cx="100" cy="20" r="2" fill="white"></circle>' +
    '<circle cx="120" cy="50" r="2" fill="white"></circle>' +
    '<circle cx="90" cy="30" r="10" fill="white" fill-opacity="0.5"></circle>' +
    '<circle cx="90" cy="30" r="8" fill="white"></circle>' +
    '<path d="M0 128 Q32 64 64 128 T128 128" fill="purple" stroke="black" stroke-width="1"></path>' +
    '<path d="M0 128 Q32 48 64 128 T128 128" fill="mediumpurple" stroke="black" stroke-width="1"></path>' +
    '<path d="M0 128 Q32 32 64 128 T128 128" fill="rebeccapurple" stroke="black" stroke-width="1"></path>' +
    '<path d="M0 128 Q16 64 32 128 T64 128" fill="purple" stroke="black" stroke-width="1"></path>' +
    '<path d="M64 128 Q80 64 96 128 T128 128" fill="mediumpurple" stroke="black" stroke-width="1"></path>';

  function vinylSvg() {
    return '<svg viewBox="0 0 128 128" class="mpp-disc-svg">' + VINYL + "</svg>";
  }

  var STROKE_ATTR = 'fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var ICON_REPEAT = '<svg class="mpp-icon-repeat" width="20" height="20" viewBox="0 0 24 24" stroke="#777" ' + STROKE_ATTR + '><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
  var ICON_SHUFFLE = '<svg class="mpp-icon-shuffle" width="20" height="20" viewBox="0 0 24 24" stroke="#777" ' + STROKE_ATTR + '><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>';
  var ICON_PREV = '<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" ' + STROKE_ATTR + '><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>';
  var ICON_PLAY = '<svg class="mpp-icon-play" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" ' + STROKE_ATTR + '><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
  var ICON_PAUSE = '<svg class="mpp-icon-pause" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" ' + STROKE_ATTR + '><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  var ICON_NEXT = '<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" ' + STROKE_ATTR + '><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>';
  var ICON_LIST = '<svg width="20" height="20" viewBox="0 0 24 24" stroke="#777" ' + STROKE_ATTR + '><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';

  /* ===== DOM 构建 ===== */
  var root = null;
  var built = false;
  var expanded = false;
  var lastSongKey = "";
  var el = {};

  function build() {
    if (built) return;
    var host = document.querySelector(".phone-screen");
    if (!host) return;

    root = document.createElement("div");
    root.id = "music-popup";
    root.innerHTML =
      '<div class="mpp-zoom">' +
        '<div class="mpp-disc-wrap">' +
          '<div class="mpp-disc mpp-disc-top">' + vinylSvg() + '<span class="mpp-label mpp-label-lg"></span></div>' +
        "</div>" +
        '<div class="mpp-card">' +
          '<div class="mpp-top">' +
            '<div class="mpp-bigdisc"><div class="mpp-disc mpp-disc-big">' + vinylSvg() + '<span class="mpp-label mpp-label-sm"></span></div></div>' +
            '<div class="mpp-meta">' +
              '<p class="mpp-title"></p>' +
              '<p class="mpp-artist"></p>' +
            "</div>" +
          "</div>" +
          '<div class="mpp-progress">' +
            '<span class="mpp-time mpp-cur">0:00</span>' +
            '<input type="range" class="mpp-seek" min="0" max="1000" value="0">' +
            '<span class="mpp-time mpp-dur">0:00</span>' +
          "</div>" +
          '<div class="mpp-controls">' +
            '<button class="mpp-btn mpp-modebtn" aria-label="切换循环模式">' + ICON_REPEAT + ICON_SHUFFLE + "</button>" +
            '<button class="mpp-btn mpp-prev" aria-label="上一首">' + ICON_PREV + "</button>" +
            '<button class="mpp-btn mpp-playbtn" aria-label="播放/暂停">' + ICON_PLAY + ICON_PAUSE + "</button>" +
            '<button class="mpp-btn mpp-next" aria-label="下一首">' + ICON_NEXT + "</button>" +
            '<button class="mpp-btn mpp-listbtn" aria-label="打开音乐">' + ICON_LIST + "</button>" +
          "</div>" +
        "</div>" +
      "</div>";
    host.appendChild(root);
    built = true;
    applySavedPos();
    el.zoom = root.querySelector(".mpp-zoom");
    applyScale();

    el.discWrap = root.querySelector(".mpp-disc-wrap");
    el.bigdisc = root.querySelector(".mpp-bigdisc");
    el.title = root.querySelector(".mpp-title");
    el.artist = root.querySelector(".mpp-artist");
    el.cur = root.querySelector(".mpp-cur");
    el.dur = root.querySelector(".mpp-dur");
    el.seek = root.querySelector(".mpp-seek");
    el.modeBtn = root.querySelector(".mpp-modebtn");
    el.prevBtn = root.querySelector(".mpp-prev");
    el.playBtn = root.querySelector(".mpp-playbtn");
    el.nextBtn = root.querySelector(".mpp-next");
    el.listBtn = root.querySelector(".mpp-listbtn");

    bindEvents();
    syncShuffle();
    hookAudio();
    refreshAll();
  }

  /* ===== 状态读取 ===== */
  function getPlayer() {
    try { return window.RadioApp && RadioApp.getPlayerState ? RadioApp.getPlayerState() : null; }
    catch (e) { return null; }
  }
  function getAudio() { return window.__radioAudio || null; }

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  /* ===== 音频挂钩（radio.js 可能尚未创建 audio，用 setter 拦截首次赋值） ===== */
  function hookAudio() {
    if (hookAudio.done) return;
    if (window.__radioAudio) { bindAudio(window.__radioAudio); hookAudio.done = true; return; }
    if (!hookAudio.def) {
      hookAudio.def = true;
      var val;
      try {
        Object.defineProperty(window, "__radioAudio", {
          configurable: true,
          get: function () { return val; },
          set: function (a) { val = a; bindAudio(a); hookAudio.done = true; }
        });
      } catch (e) {}
    }
  }

  function bindAudio(a) {
    if (!a || a.__mppBound) return;
    a.__mppBound = true;
    a.addEventListener("play", syncPlayState);
    a.addEventListener("pause", syncPlayState);
    a.addEventListener("timeupdate", syncProgress);
    a.addEventListener("loadedmetadata", function () { syncProgress(); syncSong(); });
  }

  /* ===== UI 同步 ===== */
  function getSavedSong() {
    try { return JSON.parse(localStorage.getItem(LS_LAST) || "null"); } catch (e) { return null; }
  }

  function syncSong() {
    var ps = getPlayer();
    var song = ps && ps.currentSong;
    var title, artist;
    if (song) {
      title = song.title || song.name || "未知歌曲";
      artist = song.artist || song.artists || "";
      try { localStorage.setItem(LS_LAST, JSON.stringify({ title: title, artist: artist })); } catch (e) {}
    } else {
      // 播放器还没初始化（本次会话没开过电台）→ 显示上一首播放过的歌
      var saved = getSavedSong();
      title = saved ? (saved.title || "未知歌曲") : "未在播放";
      artist = saved ? (saved.artist || "") : "";
    }
    var key = title + "|" + artist;
    if (key === lastSongKey) return;
    lastSongKey = key;
    el.title.textContent = title;
    el.artist.textContent = artist;
  }

  function syncPlayState() {
    var ps = getPlayer();
    root.classList.toggle("is-playing", !!(ps && ps.playing));
  }

  function syncProgress() {
    var a = getAudio();
    if (!a) return;
    var dur = isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    var cur = a.currentTime || 0;
    el.cur.textContent = fmt(cur);
    if (dur > 0) {
      el.dur.textContent = fmt(dur);
      if (document.activeElement !== el.seek) el.seek.value = Math.round((cur / dur) * 1000);
    }
  }

  function syncShuffle() {
    root.classList.toggle("is-shuffle", isShuffle());
  }

  function refreshVisibility() {
    // 开关打开就常显（所有页面，包括电台 App 内部）
    root.classList.toggle("is-hidden", !isEnabled());
  }

  function applyScale() {
    if (el.zoom) el.zoom.style.zoom = getScale();
  }

  function refreshAll() {
    if (!built) return;
    syncSong();
    syncPlayState();
    syncProgress();
    refreshVisibility();
  }

  /* ===== 交互 ===== */
  function expand() {
    expanded = true;
    root.classList.add("expanded");
    syncProgress();
  }
  function collapse() {
    expanded = false;
    root.classList.remove("expanded");
  }

  // 播放器还没初始化（本次会话没开过电台）时，先初始化拿到歌曲，再执行控制
  function ensurePlayer() {
    var ps = getPlayer();
    if (ps && ps.currentSong) return true;
    try { if (window.RadioApp && RadioApp.init) RadioApp.init(); } catch (e) {}
    ps = getPlayer();
    return !!(ps && ps.currentSong);
  }

  /* ---- 长按拖动位置 ---- */
  var drag = { active: false, suppressClick: false, startX: 0, startY: 0, startCX: 0, startCY: 0, timer: null, lastCX: 0, lastCY: 0, lastHost: null };

  function hostRect() { return root.parentElement.getBoundingClientRect(); }

  function applySavedPos() {
    var pos = null;
    try { pos = JSON.parse(localStorage.getItem(LS_POS) || "null"); } catch (e) {}
    if (pos && isFinite(pos.x) && isFinite(pos.y)) {
      root.classList.add("has-pos");
      root.style.left = (pos.x * 100) + "%";
      root.style.top = (pos.y * 100) + "%";
    }
  }

  function onDown(e) {
    if (e.target.closest(".mpp-btn") || e.target.closest(".mpp-seek")) return; // 控制键不触发拖动
    var host = hostRect();
    var rect = root.getBoundingClientRect();
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.startCX = rect.left + rect.width / 2 - host.left;
    drag.startCY = rect.top + rect.height / 2 - host.top;
    drag.active = false;
    drag.suppressClick = false;
    drag.timer = setTimeout(function () {
      drag.active = true;
      root.classList.add("dragging");
    }, 200);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onMove(e) {
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10) clearTimeout(drag.timer);
      return;
    }
    e.preventDefault();
    var host = hostRect();
    var rect = root.getBoundingClientRect(); // 真实渲染尺寸（含缩放），夹取才准
    var halfW = rect.width / 2 + 6;
    var halfH = rect.height / 2 + 6;
    var cx = drag.startCX + (e.clientX - drag.startX);
    var cy = drag.startCY + (e.clientY - drag.startY);
    cx = Math.max(halfW, Math.min(host.width - halfW, cx));
    cy = Math.max(halfH, Math.min(host.height - halfH, cy));
    root.classList.add("has-pos");
    root.style.left = cx + "px";
    root.style.top = cy + "px";
    drag.lastCX = cx; drag.lastCY = cy; drag.lastHost = host;
  }

  function onUp() {
    clearTimeout(drag.timer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (drag.active) {
      drag.suppressClick = true;
      root.classList.remove("dragging");
      if (drag.lastHost) {
        // 存百分比，换屏幕尺寸也不跑偏
        var x = drag.lastCX / drag.lastHost.width;
        var y = drag.lastCY / drag.lastHost.height;
        try { localStorage.setItem(LS_POS, JSON.stringify({ x: x, y: y })); } catch (e) {}
        root.style.left = (x * 100) + "%";
        root.style.top = (y * 100) + "%";
      }
    }
    drag.active = false;
  }

  function bindEvents() {
    // 长按拖动（按住 200ms 后进入拖动模式）
    root.addEventListener("pointerdown", onDown);

    // 卡片空白处：收起 → 展开；展开 → 收回（点唱片也落在这里）
    root.addEventListener("click", function (e) {
      if (drag.suppressClick) { drag.suppressClick = false; return; }
      if (e.target.closest(".mpp-btn") || e.target.closest(".mpp-seek")) return;
      if (!expanded) expand();
      else collapse();
    });

    el.playBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      ensurePlayer();
      if (window.RadioApp && RadioApp.togglePlayPause) RadioApp.togglePlayPause();
      syncPlayState();
      refreshAll();
    });

    function shuffleNext(dir) {
      var ps = getPlayer();
      if (!ps) return;
      var songs = ps.currentPlaylistSongs || [];
      if (!songs.length) return;
      if (isShuffle() && songs.length > 1) {
        var idx;
        do { idx = Math.floor(Math.random() * songs.length); } while (idx === ps.currentIndex);
        ps.currentIndex = idx;
        RadioApp.playSong(songs[idx]);
      } else if (dir > 0 && RadioApp.playNext) RadioApp.playNext();
      else if (dir < 0 && RadioApp.playPrev) RadioApp.playPrev();
    }

    el.nextBtn.addEventListener("click", function (e) { e.stopPropagation(); ensurePlayer(); shuffleNext(1); syncPlayState(); refreshAll(); });
    el.prevBtn.addEventListener("click", function (e) { e.stopPropagation(); ensurePlayer(); shuffleNext(-1); syncPlayState(); refreshAll(); });

    el.modeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      try { localStorage.setItem(LS_SHUFFLE, isShuffle() ? "0" : "1"); } catch (err) {}
      syncShuffle();
    });

    el.listBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof switchScreen === "function") switchScreen("radio-screen");
    });

    el.seek.addEventListener("input", function () {
      var a = getAudio();
      if (!a) return;
      if (isFinite(a.duration) && a.duration > 0) {
        a.currentTime = (Number(el.seek.value) / 1000) * a.duration;
        el.cur.textContent = fmt(a.currentTime);
      }
    });
  }

  /* ===== 对外 API ===== */
  window.MusicPopup = {
    isEnabled: isEnabled,
    setEnabled: function (v) {
      try { localStorage.setItem(LS_ENABLED, v ? "1" : "0"); } catch (e) {}
      refreshAll();
    },
    getScale: getScale,
    setScale: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return;
      n = Math.max(0.5, Math.min(1.3, n));
      try { localStorage.setItem(LS_SCALE, String(n)); } catch (e) {}
      applyScale();
    },
    refresh: refreshAll
  };

  /* ===== 启动 ===== */
  function start() {
    build();
    if (built) {
      setInterval(refreshAll, 800);
      if (window.__radioAudio) { bindAudio(window.__radioAudio); hookAudio.done = true; }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
