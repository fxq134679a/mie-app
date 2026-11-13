/* 一起听电台 (radio) — UI 层 + 播放器核心 (黑胶唱片风格)
 * 依赖顺序：radio_html.js → radio.js
 * 数据层：localStorage + 内存缓存。暴露 window.RadioApp。
 */
(function () {
  "use strict";

  var FAV_ID = "__favorites__";
  var UPL_ID = "__uploads__";
  var LS_KEY = "radioPlaylists";
  var SONG_KEY_PREFIX = "radioPlaylist_";

  var MUSIC_API = (function () {
    try {
      var saved = localStorage.getItem("radioMusicApi");
      if (saved) return saved;
    } catch (e) {}
    if (location.protocol === "file:") return "http://localhost:9091";
    return location.protocol + "//" + location.hostname + ":9091";
  })();
  var MUSIC_TOKEN = "changeme";

  function musicFetch(path, opts) {
    opts = opts || {};
    var headers = { "X-Auth-Token": MUSIC_TOKEN };
    if (opts.json) headers["Content-Type"] = "application/json";
    return fetch(MUSIC_API + path, Object.assign({}, opts, { headers: headers }))
      .then(function (r) { return r.json(); });
  }

  var playlists = [];
  var songCache = {};
  var currentPlaylistId = null;
  var currentTab = "home";
  var notesSubView = "playlists";

  /* 网易云账号同步状态 */
  var neStatus = "loading";
  var neProfile = null;
  var nePlaylists = [];
  var neDailySongs = [];
  var neDailyLoaded = false;
  var nePlaylistSongs = {};
  var neCurrentPl = null;
  var scrobbleStartedAt = 0;

  var playerState = {
    playing: false,
    currentSong: null,
    currentSongId: null,
    currentPlaylistSongs: [],
    currentIndex: -1,
    lyricLines: [],
    activeLyricIdx: -1,
    lyricsMode: false
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(m) {
    if (typeof window.showToast === "function") window.showToast(String(m == null ? "" : m));
  }

  function getAudio() {
    if (!window.__radioAudio) {
      var a = new Audio();
      a.preload = "auto";
      window.__radioAudio = a;
    }
    return window.__radioAudio;
  }

  /* ===== 数据层 ===== */

  function defaultPlaylists() {
    return [
      { id: FAV_ID, name: "我的收藏", isDefault: true, createdAt: 0 },
      { id: UPL_ID, name: "本地音乐", isDefault: true, createdAt: 1 }
    ];
  }

  function loadPlaylists() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      var defaults = defaultPlaylists();
      for (var i = 0; i < defaults.length; i++) {
        var d = defaults[i];
        var existing = arr.find(function (p) { return p.id === d.id; });
        if (!existing) {
          arr.unshift(d);
        } else if (d.name !== existing.name && existing.isDefault) {
          existing.name = d.name;
        }
      }
      return arr;
    } catch (e) {
      return defaultPlaylists();
    }
  }

  function savePlaylists() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(playlists)); } catch (e) {}
  }

  function loadSongs(plId) {
    if (songCache[plId]) return songCache[plId];
    try {
      var raw = localStorage.getItem(SONG_KEY_PREFIX + plId);
      var arr = raw ? JSON.parse(raw) : [];
      songCache[plId] = Array.isArray(arr) ? arr : [];
    } catch (e) {
      songCache[plId] = [];
    }
    return songCache[plId];
  }

  function saveSongs(plId, songs) {
    songCache[plId] = songs;
    try {
      localStorage.setItem(SONG_KEY_PREFIX + plId, JSON.stringify(songs));
    } catch (e) {}
  }

  function getSongCount(plId) {
    return loadSongs(plId).length;
  }

  /* ===== Tab 切换 ===== */

  function switchTab(tab) {
    currentTab = tab;
    var views = $$(".rv-view");
    views.forEach(function (v) { v.classList.remove("active"); });
    var target = $("#rv-view-" + tab);
    if (target) target.classList.add("active");

    var root = $("#radio-root");
    if (root) {
      root.classList.toggle("rv-on-home", tab === "home");
      root.classList.toggle("rv-on-me", tab === "me");
    }

    var tabs = $$(".rv-tab");
    tabs.forEach(function (t) { t.classList.remove("active"); });
    var activeTab = $('.rv-tab[data-tab="' + tab + '"]') ||
      (tab === "settings" ? $('.rv-tab[data-tab="me"]') : null);
    if (activeTab) activeTab.classList.add("active");

    if (tab === "home") renderHomeView();
    else if (tab === "search") renderSearchView();
    else if (tab === "notes") { notesSubView = "playlists"; loadNeteaseAccount(); renderNotesView(); }
    else if (tab === "me") renderMeView();
    else if (tab === "settings") renderSettingsView();

    updateTopbar();
  }

  /* ===== 首页 - 黑胶播放器 ===== */

  /* ===== 首页 - 唱机样式（白底，图片那种） ===== */

  var TT_WAVE_BARS = [16, 30, 22, 38, 26, 34, 18];

  var ttSeeking = false; // 唱机进度条拖动中
  var ttSeekBound = false;

  function renderTurntableHome(home, s) {
    var audio = getAudio();
    var pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
    var spinClass = playerState.playing ? " is-spinning" : "";
    var armClass = playerState.playing ? " is-playing" : "";

    var title = s ? (s.title || s.name || "未知歌曲") : "还没有播放的歌曲";
    var artist = s ? (s.artist || s.artists || "未知歌手") : "去「歌单」挑一首吧";

    var waveHtml = "";
    var onCount = Math.round(pct / 100 * TT_WAVE_BARS.length);
    for (var i = 0; i < TT_WAVE_BARS.length; i++) {
      // 负延迟错开相位，播放时波形跳动更自然
      waveHtml += '<i class="' + (i < onCount ? "is-on" : "") + '" style="height:' + TT_WAVE_BARS[i] + 'px;animation-delay:' + (-(i * 0.17 + Math.random() * 0.3)).toFixed(2) + 's"></i>';
    }

    var mode = getPlayMode();
    var modeIcon = mode === "one" ? iconRepeatOne() : mode === "shuffle" ? iconShuffle() : iconRepeat();

    var html =
      '<div class="rv-tt-wrap">' +
        '<div class="rv-tt-card">' +
          '<div class="rv-tt-knobs"><i></i><i></i></div>' +
          '<div class="rv-vinyl-area rv-tt-vinyl" id="rv-vinyl-click-area">' +
            '<div class="rv-disc rv-tt-disc' + spinClass + '" id="rv-disc">' +
              '<div class="rv-tt-label"></div>' +
              '<div class="rv-cover-hole"></div>' +
            '</div>' +
          '</div>' +
          '<div class="rv-tonearm rv-tt-arm' + armClass + '" id="rv-tonearm">' +
            '<div class="rv-tonearm-pivot"></div>' +
            '<div class="rv-tonearm-arm">' +
              '<div class="rv-tonearm-head">' +
                '<div class="rv-tonearm-needle"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="rv-tt-pitch"><i></i></div>' +
          '<div class="rv-tt-strobe"><i></i><i></i><i></i><i></i></div>' +
        '</div>' +
        '<div class="rv-tt-cluster">' +
          '<div class="rv-tt-info">' +
            '<div class="rv-now-title">' + esc(title) + '</div>' +
            '<div class="rv-now-artist">' + esc(artist) + '</div>' +
          '</div>' +
          '<div class="rv-tt-glow">' +
            '<div class="rv-tt-wave' + (playerState.playing ? " is-playing" : "") + '" id="rv-tt-wave">' + waveHtml + '</div>' +
            '<div class="rv-tt-progress-row">' +
              '<div class="rv-tt-progress" id="rv-tt-progress"><div class="rv-tt-progress-fill" id="rv-tt-progress-fill" style="width:' + pct + '%"></div></div>' +
              '<div class="rv-tt-times">' +
                '<span id="rv-cur-time">' + formatDur(audio.currentTime) + '</span>' +
                '<span class="rv-tt-sep">/</span>' +
                '<span id="rv-dur-time">' + formatDur(audio.duration) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rv-tt-bottom">' +
          '<button class="rv-tt-flatbtn' + (mode === "shuffle" ? " is-shuffle" : "") + '" id="rv-mode" aria-label="切换播放模式">' + modeIcon + '</button>' +
          '<div class="rv-tt-glass">' +
            '<button class="rv-tt-side" id="rv-prev" aria-label="上一首">' + iconPrev() + '</button>' +
            '<button class="rv-tt-play" id="rv-play" aria-label="播放/暂停">' + (playerState.playing ? iconPause() : iconPlay()) + '</button>' +
            '<button class="rv-tt-side" id="rv-next" aria-label="下一首">' + iconNext() + '</button>' +
          '</div>' +
          '<button class="rv-tt-flatbtn" id="rv-playlist" aria-label="查看播放歌单">' + iconList() + '</button>' +
        '</div>' +
      '</div>';

    home.innerHTML = html;

    var vinylArea = $("#rv-vinyl-click-area", home);
    if (vinylArea && playerState.lyricLines.length > 0) {
      vinylArea.onclick = enterLyricsMode;
    }

    var playBtn = $("#rv-play", home);
    if (playBtn) playBtn.onclick = togglePlayPause;
    var prevBtn = $("#rv-prev", home);
    if (prevBtn) prevBtn.onclick = playPrev;
    var nextBtn = $("#rv-next", home);
    if (nextBtn) nextBtn.onclick = playNext;
    var modeBtn = $("#rv-mode", home);
    if (modeBtn) modeBtn.onclick = cyclePlayMode;

    // 清单按钮：打开歌单页
    var listBtn = $("#rv-playlist", home);
    if (listBtn) listBtn.onclick = function () { switchTab("notes"); };

    // 唱机样式进度条：点击/拖动调进度（窗口级监听只挂一次）
    var prog = $("#rv-tt-progress", home);
    if (prog) {
      var seekTo = function (e) {
        var ad = getAudio();
        if (!ad.duration || !isFinite(ad.duration)) return;
        var rect = prog.getBoundingClientRect();
        var x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
        var ratio = Math.max(0, Math.min(1, x / rect.width));
        ad.currentTime = ratio * ad.duration;
        updateProgress();
      };
      prog.addEventListener("pointerdown", function (e) { ttSeeking = true; seekTo(e); e.preventDefault(); });
      prog.addEventListener("click", seekTo);
      if (!ttSeekBound) {
        window.addEventListener("pointermove", function (e) { if (ttSeeking) seekTo(e); });
        window.addEventListener("pointerup", function () { ttSeeking = false; });
        ttSeekBound = true;
      }
    }
  }

  function renderHomeView() {
    var home = $("#rv-view-home");
    if (!home) return;
    var s = playerState.currentSong;

    if (playerState.lyricsMode) {
      home.classList.add("rv-lyrics-active");
    } else {
      home.classList.remove("rv-lyrics-active");
    }

    if (homeStyle === "turntable") {
      if (playerState.lyricsMode && s) {
        renderLyricsView(home, s);
      } else {
        renderTurntableHome(home, s);
      }
      return;
    }

    if (!s) {
      home.innerHTML =
        '<div class="rv-vinyl-area">' +
          buildTonearmHtml(false) +
          buildDiscHtml(null) +
        '</div>' +
        '<div class="rv-empty-home">' +
          '<div class="rv-empty-home-icon">♪</div>' +
          '<div class="rv-empty-home-text">选择一首歌开始播放<br>去「歌单」选择歌单，或「搜索」找歌</div>' +
        '</div>';
      return;
    }

    if (playerState.lyricsMode) {
      renderLyricsView(home, s);
      return;
    }

    var audio = getAudio();
    var pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
    var liked = isInFavorites(s.id);
    var spinClass = playerState.playing ? " is-spinning" : "";
    var armClass = playerState.playing ? " is-playing" : "";

    var html =
      '<div class="rv-vinyl-area" id="rv-vinyl-click-area">' +
        '<div class="rv-tonearm' + armClass + '" id="rv-tonearm">' +
          '<div class="rv-tonearm-pivot"></div>' +
          '<div class="rv-tonearm-arm">' +
            '<div class="rv-tonearm-head">' +
              '<div class="rv-tonearm-needle"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rv-disc' + spinClass + '" id="rv-disc">' +
          buildCoverHtml(s) +
          '<div class="rv-cover-hole"></div>' +
        '</div>' +
      '</div>' +
      '<div class="rv-player">' +
        '<div class="rv-song-row">' +
          '<div class="rv-song-meta">' +
            '<div class="rv-now-title">' + esc(s.title || s.name || "未知歌曲") + '</div>' +
            '<div class="rv-now-artist">' + esc(s.artist || s.artists || "未知歌手") + '</div>' +
          '</div>' +
          '<div class="rv-song-actions">' +
            '<button class="rv-act-btn' + (liked ? " is-liked" : "") + '" id="rv-like">' + iconHeart(liked) + '</button>' +
            '<button class="rv-act-btn" id="rv-comment">' + iconComment() + '</button>' +
            '<button class="rv-act-btn" id="rv-more">' + iconMore() + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="rv-progress-wrap">' +
          '<div class="rv-progress-bar" id="rv-progress-bar">' +
            '<div class="rv-progress-fill" id="rv-progress-fill" style="width:' + pct + '%">' +
              '<div class="rv-progress-thumb"></div>' +
            '</div>' +
          '</div>' +
          '<div class="rv-times">' +
            '<span id="rv-cur-time">' + formatDur(audio.currentTime) + '</span>' +
            '<span class="rv-quality">极高音质</span>' +
            '<span id="rv-dur-time">' + formatDur(audio.duration) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="rv-controls">' +
          '<button class="rv-ctrl-btn" id="rv-prev">' + iconPrev() + '</button>' +
          '<button class="rv-ctrl-play" id="rv-play">' + (playerState.playing ? iconPause() : iconPlay()) + '</button>' +
          '<button class="rv-ctrl-btn" id="rv-next">' + iconNext() + '</button>' +
        '</div>' +
      '</div>';

    home.innerHTML = html;

    var vinylArea = $("#rv-vinyl-click-area", home);
    if (vinylArea && playerState.lyricLines.length > 0) {
      vinylArea.onclick = enterLyricsMode;
    }

    $("#rv-play", home).onclick = togglePlayPause;
    $("#rv-prev", home).onclick = playPrev;
    $("#rv-next", home).onclick = playNext;

    var likeBtn = $("#rv-like", home);
    if (likeBtn) likeBtn.onclick = function () { toggleFavoriteSong(s); };

    var commentBtn = $("#rv-comment", home);
    if (commentBtn) commentBtn.onclick = function () { showCommentsModal(s); };

    var moreBtn = $("#rv-more", home);
    if (moreBtn) moreBtn.onclick = function () { showSongMenuModal(s); };

    var progressBar = $("#rv-progress-bar", home);
    if (progressBar) {
      progressBar.onclick = function (e) {
        var rect = progressBar.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        var audio = getAudio();
        if (audio.duration) {
          audio.currentTime = ratio * audio.duration;
        }
      };
    }
  }

  function renderLyricsView(home, s) {
    var audio = getAudio();
    var pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;

    var html =
      '<div class="rv-lyrics-container" id="rv-lyrics-container">' +
        '<div class="rv-lyrics-scroll" id="rv-lyrics-scroll">';

    if (playerState.lyricLines.length === 0) {
      html += '<div class="rv-lyric-line rv-lyric-empty">暂无歌词</div>';
    } else {
      for (var i = 0; i < playerState.lyricLines.length; i++) {
        var line = playerState.lyricLines[i];
        var isActive = i === playerState.activeLyricIdx;
        html += '<div class="rv-lyric-line' + (isActive ? ' rv-lyric-active' : '') + '" data-idx="' + i + '">' +
          esc(line.text) +
        '</div>';
      }
    }

    html +=
        '</div>' +
      '</div>' +
      '<div class="rv-lyrics-player">' +
        '<div class="rv-progress-wrap">' +
          '<div class="rv-progress-bar" id="rv-progress-bar">' +
            '<div class="rv-progress-fill" id="rv-progress-fill" style="width:' + pct + '%">' +
              '<div class="rv-progress-thumb"></div>' +
            '</div>' +
          '</div>' +
          '<div class="rv-times">' +
            '<span id="rv-cur-time">' + formatDur(audio.currentTime) + '</span>' +
            '<span class="rv-quality">极高音质</span>' +
            '<span id="rv-dur-time">' + formatDur(audio.duration) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="rv-controls">' +
          '<button class="rv-ctrl-btn" id="rv-prev">' + iconPrev() + '</button>' +
          '<button class="rv-ctrl-play" id="rv-play">' + (playerState.playing ? iconPause() : iconPlay()) + '</button>' +
          '<button class="rv-ctrl-btn" id="rv-next">' + iconNext() + '</button>' +
        '</div>' +
      '</div>';

    home.innerHTML = html;

    var lyricsContainer = $("#rv-lyrics-container", home);
    if (lyricsContainer) lyricsContainer.onclick = exitLyricsMode;

    $("#rv-play", home).onclick = function(e) { e.stopPropagation(); togglePlayPause(); };
    $("#rv-prev", home).onclick = function(e) { e.stopPropagation(); playPrev(); };
    $("#rv-next", home).onclick = function(e) { e.stopPropagation(); playNext(); };

    var progressBar = $("#rv-progress-bar", home);
    if (progressBar) {
      progressBar.onclick = function (e) {
        var rect = progressBar.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        var audio = getAudio();
        if (audio.duration) {
          audio.currentTime = ratio * audio.duration;
        }
      };
    }

    setTimeout(function() { scrollLyricToActive(); }, 50);
  }

  function enterLyricsMode() {
    playerState.lyricsMode = true;
    renderHomeView();
    updateTopbar();
  }

  function exitLyricsMode() {
    playerState.lyricsMode = false;
    renderHomeView();
    updateTopbar();
  }

  function scrollLyricToActive() {
    var container = $("#rv-lyrics-scroll");
    if (!container) return;
    var activeLine = container.querySelector(".rv-lyric-active");
    if (!activeLine) return;
    var containerHeight = container.clientHeight;
    var lineHeight = activeLine.clientHeight;
    var offset = activeLine.offsetTop - (containerHeight / 2) + (lineHeight / 2);
    container.scrollTo({ top: offset, behavior: "smooth" });
  }

  function buildTonearmHtml(playing) {
    var cls = playing ? " is-playing" : "";
    return '<div class="rv-tonearm' + cls + '" id="rv-tonearm">' +
      '<div class="rv-tonearm-pivot"></div>' +
      '<div class="rv-tonearm-arm">' +
        '<div class="rv-tonearm-head">' +
          '<div class="rv-tonearm-needle"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function buildDiscHtml(song) {
    var spinClass = playerState.playing ? " is-spinning" : "";
    return '<div class="rv-disc' + spinClass + '" id="rv-disc">' +
      buildCoverHtml(song) +
      '<div class="rv-cover-hole"></div>' +
    '</div>';
  }

  function buildCoverHtml(song) {
    if (song && song.cover) {
      return '<div class="rv-cover"><img src="' + esc(song.cover) + '" alt=""></div>';
    }
    return '<div class="rv-cover">🎤</div>';
  }

  /* ===== 播放器图标 ===== */

  function iconPlay() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M8 5v14l11-7z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }

  function iconPause() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>' +
      '<rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor"/></svg>';
  }

  function iconPrev() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M6 6h2v12H6z" fill="currentColor"/>' +
      '<path d="M18 6l-9 6 9 6z" fill="currentColor"/></svg>';
  }

  function iconNext() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M6 6l9 6-9 6z" fill="currentColor"/>' +
      '<path d="M16 6h2v12h-2z" fill="currentColor"/></svg>';
  }

  /* 播放模式图标：列表循环 / 单曲循环 / 随机 */
  function iconRepeat() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="17 1 21 5 17 9"/>' +
      '<path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
      '<polyline points="7 23 3 19 7 15"/>' +
      '<path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  }

  function iconRepeatOne() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="17 1 21 5 17 9"/>' +
      '<path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
      '<polyline points="7 23 3 19 7 15"/>' +
      '<path d="M21 13v2a4 4 0 0 1-4 4H3"/>' +
      '<text x="12" y="14.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor" stroke="none">1</text></svg>';
  }

  function iconShuffle() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="16 3 21 3 21 8"/>' +
      '<line x1="4" y1="20" x2="21" y2="3"/>' +
      '<polyline points="21 16 21 21 16 21"/>' +
      '<line x1="15" y1="15" x2="21" y2="21"/>' +
      '<line x1="4" y1="4" x2="9" y2="9"/></svg>';
  }

  function iconList() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<line x1="4" y1="7" x2="20" y2="7"/>' +
      '<line x1="4" y1="12" x2="20" y2="12"/>' +
      '<line x1="4" y1="17" x2="20" y2="17"/></svg>';
  }

  var HEART_PATH = "M256 448l-30.164-27.211C118.718 322.442 48 258.61 48 179.095 48 114.221 97.918 64 162.4 64c36.399 0 70.717 16.742 93.6 43.935C278.88 80.742 313.199 64 349.6 64 414.082 64 464 114.221 464 179.095c0 79.516-70.719 143.348-177.836 241.694L256 448z";

  function iconHeart(filled) {
    return '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="' + HEART_PATH + '" ' +
      (filled
        ? 'fill="currentColor"'
        : 'fill="none" stroke="currentColor" stroke-width="34" stroke-linejoin="round"') +
      '/></svg>';
  }

  function iconComment() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '<line x1="8" y1="9" x2="16" y2="9"/>' +
      '<line x1="8" y1="12.5" x2="13" y2="12.5"/></svg>';
  }

  function iconMore() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="5.6" r="1.7" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="1.7" fill="currentColor"/>' +
      '<circle cx="12" cy="18.4" r="1.7" fill="currentColor"/></svg>';
  }

  function toggleFavoriteSong(song) {
    if (isInFavorites(song.id)) {
      removeSong(FAV_ID, song.id);
      toast("已取消喜欢");
    } else {
      doAddSong(song, FAV_ID, null);
    }
    renderHomeView();
  }

  function updateVinylState() {
    var tonearm = $("#rv-tonearm");
    var disc = $("#rv-disc");
    var playBtn = $("#rv-play");

    if (tonearm) {
      if (playerState.playing) {
        tonearm.classList.add("is-playing");
      } else {
        tonearm.classList.remove("is-playing");
      }
    }
    if (disc) {
      if (playerState.playing) {
        disc.classList.add("is-spinning");
      } else {
        disc.classList.remove("is-spinning");
      }
    }
    if (playBtn) {
      playBtn.innerHTML = playerState.playing ? iconPause() : iconPlay();
    }
    // 唱机样式的波形：播放时跳动
    var ttWave = $("#rv-tt-wave");
    if (ttWave) ttWave.classList.toggle("is-playing", !!playerState.playing);
  }

  function updateProgress() {
    var audio = getAudio();
    var pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;

    var fill = $("#rv-progress-fill");
    if (fill) fill.style.width = pct + "%";

    var curTime = $("#rv-cur-time");
    if (curTime) curTime.textContent = formatDur(audio.currentTime);

    var durTime = $("#rv-dur-time");
    if (durTime && audio.duration) durTime.textContent = formatDur(audio.duration);

    var ttFill = $("#rv-tt-progress-fill");
    if (ttFill) ttFill.style.width = pct + "%";

    var wave = $("#rv-tt-wave");
    if (wave) {
      var bars = wave.children;
      var onCount = Math.round(pct / 100 * bars.length);
      for (var i = 0; i < bars.length; i++) {
        if (i < onCount) bars[i].classList.add("is-on");
        else bars[i].classList.remove("is-on");
      }
    }

    updateLyricHighlight(audio.currentTime);
  }

  function formatDur(sec) {
    if (!sec && sec !== 0) return "0:00";
    var s = Math.round(sec);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* ===== 搜索视图 ===== */

  var searchTimer = null;
  var searchResults = [];

  var demoSongs = [
    { id: "demo_0", title: "一路向北", artist: "周杰伦", cover: "", duration: 295, source: "demo" },
    { id: "demo_1", title: "晴天", artist: "周杰伦", cover: "", duration: 269, source: "demo" },
    { id: "demo_2", title: "七里香", artist: "周杰伦", cover: "", duration: 299, source: "demo" },
    { id: "demo_3", title: "夜曲", artist: "周杰伦", cover: "", duration: 253, source: "demo" },
    { id: "demo_4", title: "稻香", artist: "周杰伦", cover: "", duration: 223, source: "demo" },
    { id: "demo_5", title: "简单爱", artist: "周杰伦", cover: "", duration: 270, source: "demo" },
    { id: "demo_6", title: "告白气球", artist: "周杰伦", cover: "", duration: 215, source: "demo" },
    { id: "demo_7", title: "起风了", artist: "买辣椒也用券", cover: "", duration: 325, source: "demo" },
    { id: "demo_8", title: "光年之外", artist: "邓紫棋", cover: "", duration: 235, source: "demo" },
    { id: "demo_9", title: "平凡之路", artist: "朴树", cover: "", duration: 282, source: "demo" },
    { id: "demo_10", title: "后来", artist: "刘若英", cover: "", duration: 332, source: "demo" },
    { id: "demo_11", title: "小幸运", artist: "田馥甄", cover: "", duration: 293, source: "demo" },
    { id: "demo_12", title: "演员", artist: "薛之谦", cover: "", duration: 271, source: "demo" }
  ];

  function renderSearchView() {
    var view = $("#rv-view-search");
    if (!view) return;

    var html =
      '<div class="rv-search-toprow">' +
        '<button class="rv-search-lt-btn" id="rv-search-lt-btn" aria-label="一起听">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/></svg>' +
        '</button>' +
        '<div class="rv-search-spacer"></div>' +
        '<button class="rv-search-theme-btn" id="rv-search-theme-btn" aria-label="美化播放器">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="rv-search-bar">' +
        '<div class="rv-search-input-wrap">' +
          '<span class="rv-search-icon-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>' +
          '<input class="rv-search-input" id="rv-search-input" placeholder="搜索歌曲名称或歌手" autocomplete="off">' +
        '</div>' +
      '</div>' +
      '<div class="rv-search-body" id="rv-search-body">';

    if (searchResults.length === 0) {
      html += '<div class="rv-search-empty">' +
        '<div class="rv-empty-icon" style="font-size:36px;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>' +
        '<div class="rv-search-hint">输入关键词搜索歌曲</div>' +
      '</div>';
    } else {
      html += buildSearchResultsHtml();
    }

    html += '</div>';
    view.innerHTML = html;

    var input = $("#rv-search-input");
    if (input) {
      input.oninput = function () {
        clearTimeout(searchTimer);
        var q = input.value.trim();
        searchTimer = setTimeout(function () { doSearch(q); }, 300);
      };
      setTimeout(function () { input.focus(); }, 100);
    }

    var ltBtn = $("#rv-search-lt-btn", view);
    if (ltBtn) ltBtn.onclick = function () { onListenEntryTap(); };
    var themeBtn = $("#rv-search-theme-btn", view);
    if (themeBtn) themeBtn.onclick = function () { openLtThemeModal(); };
    ltUpdateEntryButtons();

    bindAddButtons(view);
  }

  function buildSearchResultsHtml() {
    var html = '';
    for (var i = 0; i < searchResults.length; i++) {
      var s = searchResults[i];
      var coverHtml = s.cover
        ? '<img src="' + esc(s.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
        : "♪";
      html += '<div class="rv-search-result-item">' +
        '<div class="rv-search-cover">' + coverHtml + '</div>' +
        '<div class="rv-search-info">' +
          '<div class="rv-search-title">' + esc(s.title || s.name) + '</div>' +
          '<div class="rv-search-artist">' + esc(s.artist || s.artists) + '</div>' +
        '</div>' +
        '<button class="rv-add-btn" data-add-idx="' + i + '">+</button>' +
      '</div>';
    }
    return html;
  }

  var _searchSeq = 0;
  function doSearch(query) {
    var body = $("#rv-search-body");
    if (!body) return;

    if (!query) {
      searchResults = [];
      body.innerHTML = '<div class="rv-search-empty">' +
        '<div class="rv-empty-icon" style="font-size:36px;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>' +
        '<div class="rv-search-hint">输入关键词搜索歌曲</div>' +
      '</div>';
      return;
    }

    var seq = ++_searchSeq;
    body.innerHTML = '<div class="rv-search-empty"><div class="rv-search-hint">搜索中...</div></div>';

    musicFetch("/api/music/search?q=" + encodeURIComponent(query) + "&limit=30")
      .then(function (data) {
        if (seq !== _searchSeq) return;
        var songs = (data && data.songs) || [];
        searchResults = songs.map(function (s) {
          return {
            id: "netease_" + s.id,
            neteaseId: String(s.id),
            title: s.name || "",
            artist: s.artist || "",
            cover: s.cover || s.pic || "",
            album: s.album || "",
            duration: 0,
            source: "netease"
          };
        });
        if (searchResults.length === 0) {
          body.innerHTML = '<div class="rv-search-empty">' +
            '<div class="rv-search-hint">没有找到相关歌曲<br>试试其他关键词</div>' +
          '</div>';
          return;
        }
        body.innerHTML = buildSearchResultsHtml();
        bindAddButtons(body);
      })
      .catch(function () {
        if (seq !== _searchSeq) return;
        searchResults = [];
        body.innerHTML = '<div class="rv-search-empty">' +
          '<div class="rv-search-hint">搜索失败，请检查网络</div>' +
        '</div>';
      });
  }

  function bindAddButtons(root) {
    var addBtns = $$(".rv-add-btn", root);
    addBtns.forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.getAttribute("data-add-idx"), 10);
        addSongToPlaylist(searchResults[idx], btn);
      };
    });
  }

  function addSongToPlaylist(song, btnEl) {
    if (!currentPlaylistId) {
      showPlaylistPicker(song, btnEl);
      return;
    }
    doAddSong(song, currentPlaylistId, btnEl);
  }

  function doAddSong(song, plId, btnEl) {
    var songs = loadSongs(plId);
    if (songs.find(function (s) { return String(s.id) === String(song.id); })) {
      toast("已在歌单中");
      if (btnEl) {
        btnEl.textContent = "✓";
        btnEl.classList.add("added");
      }
      return;
    }
    songs.push({
      id: song.id,
      title: song.title || song.name || "",
      artist: song.artist || song.artists || "",
      cover: song.cover || "",
      duration: song.duration || 0,
      type: "song",
      source: song.source || "",
      remoteUrl: song.remoteUrl || "",
      lyric: song.lyric || "",
      neteaseId: song.neteaseId || ""
    });
    saveSongs(plId, songs);
    if (btnEl) {
      btnEl.textContent = "✓";
      btnEl.classList.add("added");
    }
    toast("已添加到 " + (playlists.find(function (p) { return p.id === plId; }) || {}).name);
  }

  function showPlaylistPicker(song, btnEl) {
    var html = '<div class="radio-modal-title">添加到歌单</div>' +
      '<div class="radio-song-menu">';
    for (var i = 0; i < playlists.length; i++) {
      var pl = playlists[i];
      html += '<button class="radio-song-menu-item" data-pick-pl="' + esc(pl.id) + '">' +
        esc(pl.name) + '</button>';
    }
    html += '</div>' +
      '<div style="margin-top:12px;">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>' +
      '</div>';

    showModal(html);

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    var items = $$("[data-pick-pl]", $("#radio-modals"));
    items.forEach(function (el) {
      el.onclick = function () {
        var plId = el.getAttribute("data-pick-pl");
        closeModal();
        doAddSong(song, plId, btnEl);
      };
    });
  }

  /* ===== 网易云账号同步 ===== */

  function mapNeteaseSong(s) {
    return {
      id: "netease_" + s.id,
      neteaseId: String(s.id),
      title: s.name || "",
      artist: s.artist || "",
      cover: s.cover || "",
      album: s.album || "",
      duration: 0,
      fee: s.fee || 0,
      source: "netease"
    };
  }

  function loadNeteaseAccount() {
    musicFetch("/api/netease/profile")
      .then(function (data) {
        if (data && data.ok && data.profile) {
          neProfile = data.profile;
          neStatus = "ok";
          return musicFetch("/api/netease/playlists").then(function (pl) {
            nePlaylists = (pl && pl.ok && pl.playlists) || [];
          });
        }
        neStatus = "none";
        neProfile = null;
      })
      .catch(function () { neStatus = "none"; neProfile = null; })
      .then(function () {
        if (currentTab === "notes" && notesSubView === "playlists") renderNotesView();
      });
  }

  function buildNeteaseSectionHtml() {
    var html = '<div class="rv-ne-section">' +
      '<div class="rv-ne-head">网易云音乐</div>';

    if (neStatus === "none") {
      html += '<div class="rv-ne-login" id="rv-ne-login-row">' +
        '<div class="rv-ne-login-text">未登录网易云<br><span>登录后可用每日推荐和网易云歌单</span></div>' +
        '<button class="rv-ne-login-btn">登录</button>' +
      '</div>';
    } else if (neStatus === "ok" && neProfile) {
      html += '<div class="rv-ne-account">' +
        '<div class="rv-ne-avatar">' +
          (neProfile.avatar ? '<img src="' + esc(neProfile.avatar) + '" alt="">' : "☁") +
        '</div>' +
        '<div class="rv-ne-account-info">' +
          '<div class="rv-ne-nick">' + esc(neProfile.nickname || "网易云用户") + '</div>' +
          '<div class="rv-ne-sub">累计听歌 ' + (neProfile.listenSongs || 0) + ' 首 · Lv.' + (neProfile.level || 0) + '</div>' +
        '</div>' +
      '</div>';
    } else {
      html += '<div class="rv-ne-loading">网易云登录中…</div>';
    }

    if (neStatus === "ok") {
      html += '<div class="rv-playlist-item" data-ne-view="daily">' +
        '<div class="rv-playlist-icon ne">日</div>' +
        '<div class="rv-playlist-info">' +
          '<div class="rv-playlist-name">每日推荐</div>' +
          '<div class="rv-playlist-count">根据你的口味，每天更新</div>' +
        '</div>' +
        '<div class="rv-playlist-arrow">›</div>' +
      '</div>';
      for (var i = 0; i < nePlaylists.length; i++) {
        var p = nePlaylists[i];
        html += '<div class="rv-playlist-item" data-ne-pl="' + esc(p.id) + '">' +
          '<div class="rv-playlist-icon ne">' +
            (p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : "♫") +
          '</div>' +
          '<div class="rv-playlist-info">' +
            '<div class="rv-playlist-name">' + esc(p.name) + '</div>' +
            '<div class="rv-playlist-count">' + (p.count || 0) + ' 首' + (p.mine ? '' : ' · 收藏') + '</div>' +
          '</div>' +
          '<div class="rv-playlist-arrow">›</div>' +
        '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  function bindNeteaseSection(view) {
    var loginRow = $("#rv-ne-login-row", view);
    if (loginRow) loginRow.onclick = showNeteaseLoginModal;

    var dailyRows = $$("[data-ne-view='daily']", view);
    dailyRows.forEach(function (el) {
      el.onclick = function () {
        notesSubView = "nedaily";
        renderNotesView();
      };
    });

    var plRows = $$("[data-ne-pl]", view);
    plRows.forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute("data-ne-pl");
        var pl = null;
        for (var i = 0; i < nePlaylists.length; i++) {
          if (String(nePlaylists[i].id) === String(id)) { pl = nePlaylists[i]; break; }
        }
        neCurrentPl = pl || { id: id, name: "网易云歌单" };
        notesSubView = "neplaylist";
        renderNotesView();
      };
    });
  }

  function renderNeteaseSongList(view) {
    var isDaily = notesSubView === "nedaily";
    var title = isDaily ? "每日推荐" : (neCurrentPl ? neCurrentPl.name : "网易云歌单");
    var songs = null;
    var loading = true;

    if (isDaily) {
      songs = neDailySongs;
      loading = !neDailyLoaded;
    } else if (neCurrentPl) {
      var cached = nePlaylistSongs[neCurrentPl.id];
      if (cached) { songs = cached; loading = false; }
    }

    var html = '<div class="rv-songlist-header">' +
      '<button class="rv-songlist-back" id="rv-songlist-back" style="color:#1c1c1e;">‹</button>' +
      '<div class="rv-songlist-title">' + esc(title) + '</div>' +
    '</div>';
    html += '<div class="rv-song-list">';

    if (loading) {
      html += '<div class="rv-empty"><div class="rv-empty-icon">☁</div><div class="rv-empty-text">加载中…</div></div>';
    } else if (!songs || songs.length === 0) {
      html += '<div class="rv-empty"><div class="rv-empty-icon">🎶</div><div class="rv-empty-text">暂时没有歌曲<br>检查网易云登录状态后重试</div></div>';
    } else {
      for (var i = 0; i < songs.length; i++) {
        var s = songs[i];
        var isPlaying = playerState.currentSongId && String(s.id) === String(playerState.currentSongId);
        var coverHtml = s.cover
          ? '<img src="' + esc(s.cover) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;">'
          : "♪";
        html += '<div class="rv-song-item' + (isPlaying ? ' is-playing' : '') + '" data-song-idx="' + i + '">' +
          '<div class="rv-song-cover">' + coverHtml + '</div>' +
          '<div class="rv-song-info">' +
            '<div class="rv-song-title">' + esc(s.title || s.name) +
              (s.fee === 1 ? '<span class="rv-song-vip">VIP</span>' : '') +
              (isDaily && s.reason ? '<span class="rv-song-reason">' + esc(s.reason) + '</span>' : '') +
            '</div>' +
            '<div class="rv-song-artist">' + esc(s.artist || s.artists) + '</div>' +
          '</div>' +
          '<button class="rv-add-btn" data-ne-add-idx="' + i + '">+</button>' +
        '</div>';
      }
    }

    html += '</div>';
    view.innerHTML = html;

    var backBtn = $("#rv-songlist-back", view);
    if (backBtn) backBtn.onclick = function () {
      notesSubView = "playlists";
      renderNotesView();
    };

    if (loading) {
      if (isDaily) {
        musicFetch("/api/netease/daily")
          .then(function (data) {
            neDailySongs = ((data && data.ok && data.songs) || []).map(mapNeteaseSong);
            neDailyLoaded = true;
          })
          .catch(function () { neDailySongs = []; neDailyLoaded = true; })
          .then(function () {
            if (currentTab === "notes" && notesSubView === "nedaily") renderNotesView();
          });
      } else if (neCurrentPl) {
        (function (pl) {
          musicFetch("/api/netease/playlist?id=" + encodeURIComponent(pl.id) + "&limit=300")
            .then(function (data) {
              nePlaylistSongs[pl.id] = ((data && data.ok && data.songs) || []).map(mapNeteaseSong);
            })
            .catch(function () { nePlaylistSongs[pl.id] = []; })
            .then(function () {
              if (currentTab === "notes" && notesSubView === "neplaylist" &&
                  neCurrentPl && String(neCurrentPl.id) === String(pl.id)) {
                renderNotesView();
              }
            });
        })(neCurrentPl);
      }
      return;
    }

    var songItems = $$(".rv-song-item", view);
    songItems.forEach(function (el) {
      el.onclick = function () {
        var idx = parseInt(el.getAttribute("data-song-idx"), 10);
        playSongFromList(songs, idx);
      };
    });

    var addBtns = $$("[data-ne-add-idx]", view);
    addBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute("data-ne-add-idx"), 10);
        if (songs[idx]) showPlaylistPicker(songs[idx], btn);
      };
    });
  }

  /* ===== 网易云扫码登录 ===== */

  var neQrTimer = null;
  var neQrPollBusy = false;

  function stopNeteaseQrLogin() {
    if (neQrTimer) { clearInterval(neQrTimer); neQrTimer = null; }
  }

  // 兜底：index.html 未引入 libs/qrcode.js 时（旧包/旧缓存）动态补加载
  function ensureQrcodeLib() {
    return new Promise(function (resolve) {
      if (window.qrcode) { resolve(true); return; }
      var s = document.createElement("script");
      s.src = "libs/qrcode.js";
      s.onload = function () { resolve(!!window.qrcode); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  function renderNeteaseQr(text, box) {
    try {
      var qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createSvgTag(6, 0);
    } catch (e) {
      box.innerHTML = "";
    }
  }

  function startNeteaseQrLogin() {
    stopNeteaseQrLogin();
    var box = $("#rv-ne-qr-box");
    var status = $("#rv-ne-qr-status");
    var refresh = $("#rv-ne-qr-refresh");
    if (!box || !status) return;
    neQrPollBusy = false;
    status.textContent = "正在生成二维码…";
    status.className = "rv-ne-qr-status";
    if (refresh) refresh.style.display = "none";

    ensureQrcodeLib().then(function (libOk) {
      if (!$("#rv-ne-qr-box")) return;
      if (!libOk) {
        status.textContent = "二维码组件加载失败，请更新 APP 版本";
        status.className = "rv-ne-qr-status rv-ne-qr-status-err";
        if (refresh) refresh.style.display = "block";
        return;
      }
      musicFetch("/api/netease/qrcode/create").then(function (data) {
      if (!$("#rv-ne-qr-box")) return; // 弹窗已关闭
      if (!data || !data.ok || !data.key) {
        status.textContent = (data && data.msg) || "二维码生成失败，请检查音乐服务";
        status.className = "rv-ne-qr-status rv-ne-qr-status-err";
        if (refresh) refresh.style.display = "block";
        return;
      }
      renderNeteaseQr(data.qr || ("https://music.163.com/login?codekey=" + data.key), box);
      status.textContent = "请用网易云音乐 APP 扫一扫登录";
      neQrTimer = setInterval(function () {
        if (!$("#rv-ne-qr-box")) { stopNeteaseQrLogin(); return; }
        if (neQrPollBusy) return;
        neQrPollBusy = true;
        musicFetch("/api/netease/qrcode/status?key=" + encodeURIComponent(data.key))
          .then(function (st) {
            neQrPollBusy = false;
            if (!$("#rv-ne-qr-box")) { stopNeteaseQrLogin(); return; }
            var code = st && st.code;
            if (code === 802) {
              status.textContent = "已扫码，请在手机上确认登录";
            } else if (code === 800 || code === 0) {
              stopNeteaseQrLogin();
              status.textContent = code === 800 ? "二维码已过期" : ((st && st.msg) || "登录失败，请重试");
              status.className = "rv-ne-qr-status rv-ne-qr-status-err";
              if (refresh) refresh.style.display = "block";
            } else if (code === 803) {
              stopNeteaseQrLogin();
              status.textContent = "登录成功 ✓";
              status.className = "rv-ne-qr-status rv-ne-qr-status-ok";
              toast("网易云登录成功");
              neStatus = "loading";
              neDailyLoaded = false;
              nePlaylistSongs = {};
              nePlaylists = [];
              loadNeteaseAccount();
              setTimeout(closeModal, 700);
            }
          })
          .catch(function () {
            neQrPollBusy = false;
            if (!$("#rv-ne-qr-box")) stopNeteaseQrLogin();
          });
      }, 1500);
    }).catch(function () {
      if (!$("#rv-ne-qr-box")) return;
      status.textContent = "二维码生成失败，请检查音乐服务";
      status.className = "rv-ne-qr-status rv-ne-qr-status-err";
      if (refresh) refresh.style.display = "block";
    });
    });
  }

  function showNeteaseLoginModal() {
    showModal(
      '<div class="radio-modal-title">登录网易云音乐</div>' +
      '<div class="rv-ne-qr-wrap">' +
        '<div class="rv-ne-qr-box" id="rv-ne-qr-box">' +
          '<div class="rv-ne-qr-loading">生成中…</div>' +
        '</div>' +
        '<div class="rv-ne-qr-status" id="rv-ne-qr-status">正在生成二维码…</div>' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="rv-ne-qr-refresh" style="display:none;width:100%">刷新二维码</button>' +
      '</div>' +
      '<div class="rv-ne-login-divider"><span>或手动粘贴 Cookie</span></div>' +
      '<div class="rv-ne-login-hint">电脑浏览器打开 music.163.com 登录 → 按 F12 → Application(应用) → Cookies → 复制 MUSIC_U 的值，粘贴到这里</div>' +
      '<textarea class="radio-modal-input rv-ne-cookie-input" id="rv-ne-cookie-input" placeholder="粘贴 MUSIC_U 的值（或整段 Cookie）" rows="4" autocomplete="off"></textarea>' +
      '<div class="radio-modal-actions">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel">取消</button>' +
        '<button class="radio-modal-btn radio-modal-btn-confirm" id="rv-ne-cookie-save">保存</button>' +
      '</div>'
    );

    startNeteaseQrLogin();

    var refreshBtn = $("#rv-ne-qr-refresh");
    if (refreshBtn) refreshBtn.onclick = function () { startNeteaseQrLogin(); };

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    var saveBtn = $("#rv-ne-cookie-save");
    if (saveBtn) saveBtn.onclick = function () {
      var input = $("#rv-ne-cookie-input");
      var val = (input ? input.value : "").trim();
      if (!val) { toast("请先粘贴 Cookie"); return; }
      musicFetch("/api/netease/cookie", {
        method: "POST",
        json: true,
        body: JSON.stringify({ cookie: val })
      }).then(function (data) {
        if (data && data.ok) {
          closeModal();
          toast("已保存，正在登录…");
          neStatus = "loading";
          neDailyLoaded = false;
          nePlaylistSongs = {};
          nePlaylists = [];
          loadNeteaseAccount();
        } else {
          toast((data && data.msg) || "保存失败");
        }
      }).catch(function () { toast("保存失败，请检查音乐服务"); });
    };
  }

  function formatCommentTime(ts) {
    var n = parseInt(ts, 10);
    if (!n) return "";
    var d = new Date(n);
    function p2(x) { return x < 10 ? "0" + x : "" + x; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }

  function showCommentsModal(song) {
    var nid = song.neteaseId || (String(song.id).indexOf("netease_") === 0 ? String(song.id).slice(8) : "");
    if (!nid) { toast("这首歌还没有评论"); return; }

    showModal('<div class="radio-modal-title">评论</div>' +
      '<div class="rv-comments-list" id="rv-comments-list">' +
        '<div class="rv-comments-loading">加载评论中…</div>' +
      '</div>' +
      '<div style="margin-top:12px;">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">关闭</button>' +
      '</div>');

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    musicFetch("/api/music/comments?id=" + encodeURIComponent(nid) + "&limit=20")
      .then(function (data) {
        var list = (data && data.comments) || [];
        var total = (data && data.total) || 0;
        var title = $(".radio-modal-title", $("#radio-modals"));
        if (title) title.textContent = "评论 (" + total + ")";
        var box = $("#rv-comments-list");
        if (!box) return;
        if (!list.length) {
          box.innerHTML = '<div class="rv-comments-loading">还没有评论，快来抢沙发～</div>';
          return;
        }
        var html = "";
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          html += '<div class="rv-comment-item">' +
            '<div class="rv-comment-avatar">' +
              (c.avatar ? '<img src="' + esc(c.avatar) + '" alt="" loading="lazy">' : "☁") +
            '</div>' +
            '<div class="rv-comment-body">' +
              '<div class="rv-comment-user">' + esc(c.user || "网易云网友") +
                (c.is_hot ? '<span class="rv-comment-hot">热评</span>' : '') + '</div>' +
              '<div class="rv-comment-content">' + esc(c.content || "") + '</div>' +
              '<div class="rv-comment-time">' + formatCommentTime(c.time) + '</div>' +
            '</div>' +
          '</div>';
        }
        box.innerHTML = html;
      })
      .catch(function () {
        var box = $("#rv-comments-list");
        if (box) box.innerHTML = '<div class="rv-comments-loading">评论加载失败</div>';
      });
  }

  function startScrobbleTimer() {
    if (playerState.currentSong && playerState.currentSong.neteaseId) {
      scrobbleStartedAt = Date.now();
    } else {
      scrobbleStartedAt = 0;
    }
  }

  function reportScrobble(end) {
    if (!scrobbleStartedAt) return;
    var song = playerState.currentSong;
    var seconds = Math.round((Date.now() - scrobbleStartedAt) / 1000);
    scrobbleStartedAt = 0;
    if (!song || !song.neteaseId || seconds < 1) return;
    musicFetch("/api/netease/scrobble", {
      method: "POST",
      json: true,
      body: JSON.stringify({ song_id: song.neteaseId, seconds: seconds, end: end })
    }).catch(function () {});
  }

  /* ===== 笔记视图 (歌单 + 歌曲列表) ===== */

  function renderNotesView() {
    var view = $("#rv-view-notes");
    if (!view) return;

    if (notesSubView === "playlists") {
      renderPlaylistList(view);
    } else if (notesSubView === "songs") {
      renderSongList(view);
    } else if (notesSubView === "upload") {
      renderUploadView(view);
    } else if (notesSubView === "nedaily" || notesSubView === "neplaylist") {
      renderNeteaseSongList(view);
    }
  }

  function renderPlaylistList(view) {
    var html = '<div class="rv-notes-header">我的歌单</div>' +
      '<div class="rv-notes-list">';

    html += '<button class="rv-notes-create" id="rv-create-pl-btn">' +
      '<div class="rv-notes-create-icon">+</div>' +
      '<span>新建歌单</span>' +
    '</button>';

    if (playlists.length === 0) {
      html += '<div class="rv-empty"><div class="rv-empty-icon">🎵</div><div class="rv-empty-text">暂无歌单</div></div>';
    } else {
      for (var i = 0; i < playlists.length; i++) {
        var pl = playlists[i];
        var count = getSongCount(pl.id);
        var iconClass = pl.id === FAV_ID ? "favorites" : (pl.id === UPL_ID ? "local" : "custom");
        var icon = pl.id === FAV_ID ? "❤" : (pl.id === UPL_ID ? "♫" : "♪");
        html += '<div class="rv-playlist-item" data-pl-id="' + esc(pl.id) + '">' +
          '<div class="rv-playlist-icon ' + iconClass + '">' + icon + '</div>' +
          '<div class="rv-playlist-info">' +
            '<div class="rv-playlist-name">' + esc(pl.name) + '</div>' +
            '<div class="rv-playlist-count">' + count + ' 首</div>' +
          '</div>' +
          '<div class="rv-playlist-arrow">›</div>' +
        '</div>';
      }
    }

    html += buildNeteaseSectionHtml();
    html += '</div>';

    var s = playerState.currentSong;
    if (s) {
      var coverHtml = s.cover
        ? '<img src="' + esc(s.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : '<span style="font-size:18px;"></span>';
      html += '<div class="rv-mini-player" id="rv-mini-player">' +
        '<div class="rv-mini-cover">' + coverHtml + '</div>' +
        '<div class="rv-mini-info">' +
          '<div class="rv-mini-title">' + esc(s.title || s.name || "未知歌曲") + '</div>' +
          '<div class="rv-mini-artist">' + esc(s.artist || s.artists || "未知歌手") + '</div>' +
        '</div>' +
        '<button class="rv-mini-play" id="rv-mini-play-btn">' + (playerState.playing ? iconPause() : iconPlay()) + '</button>' +
        '<button class="rv-mini-queue" id="rv-mini-queue-btn">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
        '</button>' +
      '</div>';
    } else {
      html += '<div style="padding:12px 16px;">' +
        '<button class="rv-notes-create" id="rv-lt-entry-btn" style="background:linear-gradient(135deg,#4a3a34,#2a2220);color:#fff;">' +
          '<div class="rv-notes-create-icon" style="background:rgba(255,255,255,.18);">🎧</div>' +
          '<span>一起听模式</span>' +
        '</button>' +
      '</div>';
    }

    view.innerHTML = html;

    var createBtn = $("#rv-create-pl-btn", view);
    if (createBtn) createBtn.onclick = showCreatePlaylistModal;

    if (s) {
      var miniPlayer = $("#rv-mini-player", view);
      if (miniPlayer) miniPlayer.onclick = function () { currentTab = "home"; switchTab("home"); };
      var playBtn = $("#rv-mini-play-btn", view);
      if (playBtn) playBtn.onclick = function (e) { e.stopPropagation(); togglePlayPause(); };
      var queueBtn = $("#rv-mini-queue-btn", view);
      if (queueBtn) queueBtn.onclick = function (e) { e.stopPropagation(); showSongMenuModal(s); };
    } else {
      var ltBtn = $("#rv-lt-entry-btn", view);
      if (ltBtn) ltBtn.onclick = function () { onListenEntryTap(); };
    }

    var items = $$(".rv-playlist-item", view);
    items.forEach(function (el) {
      el.onclick = function () {
        currentPlaylistId = el.getAttribute("data-pl-id");
        notesSubView = "songs";
        renderNotesView();
      };
    });

    bindNeteaseSection(view);
  }

  function renderSongList(view) {
    var pl = playlists.find(function (p) { return p.id === currentPlaylistId; });
    if (!pl) { notesSubView = "playlists"; renderNotesView(); return; }

    var songs = loadSongs(pl.id);
    var isUpload = pl.id === UPL_ID;

    var html = '<div class="rv-songlist-header">' +
      '<button class="rv-songlist-back" id="rv-songlist-back" style="color:#1c1c1e;">‹</button>' +
      '<div class="rv-songlist-title">' + esc(pl.name) + '</div>' +
      '<button class="rv-songlist-menu" id="rv-songlist-menu">⋯</button>' +
    '</div>';

    html += '<div class="rv-song-list">';

    if (songs.length === 0) {
      html += '<div class="rv-empty"><div class="rv-empty-icon">🎶</div><div class="rv-empty-text">歌单是空的' +
        (isUpload ? '<br>点击右上角 ⋯ 上传音频文件' : '<br>去搜索添加歌曲吧') + '</div></div>';
    } else {
      for (var i = 0; i < songs.length; i++) {
        var s = songs[i];
        var isPlaying = playerState.currentSongId && String(s.id) === String(playerState.currentSongId);
        var coverHtml = s.cover
          ? '<img src="' + esc(s.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
          : "♪";
        html += '<div class="rv-song-item' + (isPlaying ? ' is-playing' : '') + '" data-song-idx="' + i + '">' +
          '<div class="rv-song-cover">' + coverHtml + '</div>' +
          '<div class="rv-song-info">' +
            '<div class="rv-song-title">' + esc(s.title || s.name || "未知歌曲") + '</div>' +
            '<div class="rv-song-artist">' + esc(s.artist || s.artists || "未知歌手") + '</div>' +
          '</div>' +
          (s.duration ? '<div class="rv-song-duration">' + formatDur(s.duration) + '</div>' : '') +
        '</div>';
      }
    }

    html += '</div>';
    view.innerHTML = html;

    var backBtn = $("#rv-songlist-back", view);
    if (backBtn) backBtn.onclick = function () {
      notesSubView = "playlists";
      currentPlaylistId = null;
      renderNotesView();
    };

    var menuBtn = $("#rv-songlist-menu", view);
    if (menuBtn) menuBtn.onclick = function () { showPlaylistMenuModal(pl); };

    var songItems = $$(".rv-song-item", view);
    songItems.forEach(function (el) {
      el.onclick = function () {
        var idx = parseInt(el.getAttribute("data-song-idx"), 10);
        playSongFromList(songs, idx);
      };
    });
  }

  /* ===== 我的视图 ===== */

  function renderMeView() {
    var view = $("#rv-view-me");
    if (!view) return;

    var favCount = getSongCount(FAV_ID);
    var uplCount = getSongCount(UPL_ID);

    var bgStyle = profileData.bg
      ? 'background-image:url(' + profileData.bg + ');background-size:cover;background-position:center;'
      : 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);';

    var avatarHtml = profileData.avatar
      ? '<img src="' + profileData.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span style="font-size:28px;">♫</span>';

    var html =
      '<div class="rv-me-banner" id="rv-me-banner" style="' + bgStyle + '">' +
        '<div class="rv-me-banner-overlay"></div>' +
        '<div class="rv-me-profile">' +
          '<div class="rv-me-avatar-wrap">' + avatarHtml + '</div>' +
          '<div class="rv-me-name-row">' +
            '<span class="rv-me-name">' + esc(profileData.name) + '</span>' +
          '</div>' +
          '<div class="rv-me-stats">' +
            '<span class="rv-me-stat"><strong>' + playlists.length + '</strong> 歌单</span>' +
            '<span class="rv-me-stat"><strong>' + favCount + '</strong> 收藏</span>' +
            '<span class="rv-me-stat"><strong>' + (profileData.followers || 0) + '</strong> 粉丝</span>' +
          '</div>' +
        '</div>' +
        '<div class="rv-me-actions">' +
          '<button class="rv-me-action-btn" id="rv-me-recent">🕐 最近</button>' +
          '<button class="rv-me-action-btn" id="rv-me-local">📁 本地</button>' +
          '<button class="rv-me-action-btn" id="rv-me-fav-entry">❤ 收藏</button>' +
          '<button class="rv-me-action-btn" id="rv-me-upload-entry">↑ 上传</button>' +
        '</div>' +
      '</div>' +
      '<div class="rv-me-tabs">' +
        '<button class="rv-me-tab active" data-mtab="music">音乐</button>' +
        '<button class="rv-me-tab" data-mtab="podcast">播客</button>' +
        '<button class="rv-me-tab" data-mtab="notes">笔记</button>' +
      '</div>' +
      '<div class="rv-me-subtabs">' +
        '<button class="rv-me-subtab active" data-stab="recent">近期</button>' +
        '<button class="rv-me-subtab" data-stab="created">创建</button>' +
        '<button class="rv-me-subtab" data-stab="collected">收藏</button>' +
        '<button class="rv-me-subtab" data-stab="album">专辑</button>' +
      '</div>' +
      '<div class="rv-me-playlists" id="rv-me-playlists"></div>';

    view.innerHTML = html;

    var localBtn = $("#rv-me-local", view);
    if (localBtn) localBtn.onclick = function () {
      currentPlaylistId = UPL_ID;
      switchTab("notes");
      notesSubView = "songs";
      renderNotesView();
    };

    var favEntryBtn = $("#rv-me-fav-entry", view);
    if (favEntryBtn) favEntryBtn.onclick = function () {
      currentPlaylistId = FAV_ID;
      switchTab("notes");
      notesSubView = "songs";
      renderNotesView();
    };

    var uploadEntryBtn = $("#rv-me-upload-entry", view);
    if (uploadEntryBtn) uploadEntryBtn.onclick = function () {
      notesSubView = "upload";
      switchTab("notes");
      renderNotesView();
    };

    var recentBtn = $("#rv-me-recent", view);
    if (recentBtn) recentBtn.onclick = function () {
      switchTab("home");
    };

    var tabs = $$(".rv-me-tab", view);
    tabs.forEach(function (t) {
      t.onclick = function () {
        $$(".rv-me-tab", view).forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
      };
    });

    var subtabs = $$(".rv-me-subtab", view);
    subtabs.forEach(function (t) {
      t.onclick = function () {
        $$(".rv-me-subtab", view).forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
      };
    });

    renderMePlaylistList(view);
  }

  function renderMePlaylistList(view) {
    var container = $("#rv-me-playlists", view);
    if (!container) return;

    var html = '';
    playlists.forEach(function (pl) {
      if (pl.id === FAV_ID || pl.id === UPL_ID) return;
      var count = getSongCount(pl.id);
      var icon = pl.id === FAV_ID ? "❤" : "♪";
      html +=
        '<div class="rv-me-pl-item" data-pl-id="' + esc(pl.id) + '">' +
          '<div class="rv-me-pl-cover">' + icon + '</div>' +
          '<div class="rv-me-pl-info">' +
            '<div class="rv-me-pl-name">' + esc(pl.name) + '</div>' +
            '<div class="rv-me-pl-count">' + count + ' 首</div>' +
          '</div>' +
          '<div class="rv-me-pl-arrow">›</div>' +
        '</div>';
    });

    if (!html) {
      html = '<div class="rv-me-empty">还没有歌单，去首页找歌吧</div>';
    }

    container.innerHTML = html;

    var items = $$(".rv-me-pl-item", view);
    items.forEach(function (el) {
      el.onclick = function () {
        currentPlaylistId = el.getAttribute("data-pl-id");
        switchTab("notes");
        notesSubView = "songs";
        renderNotesView();
      };
    });
  }

  function pickMeAvatar() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        profileData.avatar = reader.result;
        saveProfile();
        renderMeView();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function pickMeBackground() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        profileData.bg = reader.result;
        saveProfile();
        renderMeView();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function editMeName() {
    var newName = prompt("修改昵称", profileData.name);
    if (newName !== null && newName.trim()) {
      profileData.name = newName.trim();
      saveProfile();
      renderMeView();
    }
  }

  /* ===== 个人资料 ===== */

  var PROFILE_KEY = "radioProfile";
  var profileData = { name: "我的音乐", avatar: "", bg: "", followers: 0 };

  function loadProfile() {
    try {
      var stored = localStorage.getItem(PROFILE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        profileData.name = parsed.name || "我的音乐";
        profileData.avatar = parsed.avatar || "";
        profileData.bg = parsed.bg || "";
        profileData.followers = typeof parsed.followers === "number" ? parsed.followers : 0;
      }
    } catch (e) {}
  }

  function saveProfile() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));
    } catch (e) {}
  }

  loadProfile();

  /* ===== 设置视图 (壁纸) ===== */

  var WALLPAPER_KEY = "radioWallpaper";
  var wallpaperData = "";

  function loadWallpaper() {
    try {
      wallpaperData = localStorage.getItem(WALLPAPER_KEY) || "";
    } catch (e) {
      wallpaperData = "";
    }
  }

  function applyWallpaper() {
    var root = $("#radio-root");
    if (!root) return;
    if (wallpaperData) {
      root.classList.add("rv-has-wallpaper");
      root.style.backgroundImage = 'url("' + wallpaperData + '")';
    } else {
      root.classList.remove("rv-has-wallpaper");
      root.style.backgroundImage = "";
    }
  }

  function setWallpaper(dataUrl) {
    wallpaperData = dataUrl || "";
    try {
      if (wallpaperData) localStorage.setItem(WALLPAPER_KEY, wallpaperData);
      else localStorage.removeItem(WALLPAPER_KEY);
    } catch (e) {
      toast("图片过大，无法保存");
      return false;
    }
    applyWallpaper();
    return true;
  }

  /* ===== 首页样式：黑胶（原来的深色）/ 唱机（白底，图片那种） ===== */

  var HOME_STYLE_KEY = "radioHomeStyle";
  var homeStyle = "vinyl"; // vinyl | turntable

  function loadHomeStyle() {
    try {
      var v = localStorage.getItem(HOME_STYLE_KEY);
      if (v === "turntable" || v === "vinyl") homeStyle = v;
    } catch (e) {}
  }

  function applyHomeStyle() {
    var root = $("#radio-root");
    if (!root) return;
    root.classList.toggle("rv-style-turntable", homeStyle === "turntable");
  }

  function setHomeStyle(style) {
    if (style !== "vinyl" && style !== "turntable") return;
    if (style === homeStyle) return;
    homeStyle = style;
    try { localStorage.setItem(HOME_STYLE_KEY, style); } catch (e) {}
    applyHomeStyle();
    if (currentTab === "home") renderHomeView();
    if (currentTab === "settings") renderSettingsView();
    updateTopbar();
    toast(style === "turntable" ? "已换成唱机样式" : "已换回黑胶样式");
  }

  /* ===== 设置页 - 字体颜色 ===== */

  var FONT_COLOR_KEY = "radioFontColors";
  var fontColors = {
    tab_home: "#1c1c1e",
    tab_search: "#1c1c1e",
    tab_notes: "#1c1c1e",
    tab_me: "#1c1c1e",
    topbar: "#333333",
    controls: "#ffffff",
    song: "#ffffff",
    // 唱机样式（白底）自己的一套，免得深色那套的白字白底看不见
    tab_home_t: "#1c1c1e",
    topbar_t: "#1c1c1e",
    controls_t: "#4c5566",
    song_t: "#14161a"
  };
  var FONT_COLOR_KEYS = ["tab_home", "tab_search", "tab_notes", "tab_me", "topbar", "controls", "song",
    "tab_home_t", "topbar_t", "controls_t", "song_t"];

  function loadFontColors() {
    try {
      var raw = localStorage.getItem(FONT_COLOR_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return;
      // 旧版本只保存了 tabbar 一个颜色：迁移为四个底栏标签统一取该色
      if (typeof obj.tabbar === "string" && obj.tabbar) {
        ["tab_home", "tab_search", "tab_notes", "tab_me"].forEach(function (k) {
          if (typeof obj[k] !== "string" || !obj[k]) obj[k] = obj.tabbar;
        });
      }
      FONT_COLOR_KEYS.forEach(function (k) {
        if (typeof obj[k] === "string" && obj[k]) fontColors[k] = obj[k];
      });
    } catch (e) {}
  }

  function applyFontColors() {
    var root = $("#radio-root");
    if (!root) return;
    root.style.setProperty("--rv-c-tab-home", fontColors.tab_home);
    root.style.setProperty("--rv-c-tab-search", fontColors.tab_search);
    root.style.setProperty("--rv-c-tab-notes", fontColors.tab_notes);
    root.style.setProperty("--rv-c-tab-me", fontColors.tab_me);
    root.style.setProperty("--rv-c-topbar", fontColors.topbar);
    root.style.setProperty("--rv-c-controls", fontColors.controls);
    root.style.setProperty("--rv-c-song", fontColors.song);
    // 唱机样式那套
    root.style.setProperty("--rv-c-tab-home-t", fontColors.tab_home_t);
    root.style.setProperty("--rv-c-topbar-t", fontColors.topbar_t);
    root.style.setProperty("--rv-c-controls-t", fontColors.controls_t);
    root.style.setProperty("--rv-c-song-t", fontColors.song_t);
  }

  function setFontColor(key, value) {
    if (!value) return;
    fontColors[key] = value;
    try {
      localStorage.setItem(FONT_COLOR_KEY, JSON.stringify(fontColors));
    } catch (e) {}
    applyFontColors();
  }

  function renderSettingsView() {
    var view = $("#rv-view-settings");
    if (!view) return;

    var avatarPreview = profileData.avatar
      ? '<img src="' + esc(profileData.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span>未设置</span>';

    var bgPreview = profileData.bg
      ? '<div style="width:100%;height:100%;background-image:url(\'' + esc(profileData.bg) + '\');background-size:cover;background-position:center;border-radius:8px;"></div>'
      : '<span>未设置</span>';

    // 两套首页样式各记一套颜色：唱机样式读写 _t 那套
    var isTT = homeStyle === "turntable";
    var fc = {
      tab_home: fontColors[isTT ? "tab_home_t" : "tab_home"],
      tab_search: fontColors.tab_search,
      tab_notes: fontColors.tab_notes,
      tab_me: fontColors.tab_me,
      topbar: fontColors[isTT ? "topbar_t" : "topbar"],
      controls: fontColors[isTT ? "controls_t" : "controls"],
      song: fontColors[isTT ? "song_t" : "song"]
    };

    view.innerHTML =
      '<div class="rv-settings-body">' +
        '<div class="rv-settings-section">' +
          '<div class="rv-settings-title">首页播放器样式</div>' +
          '<div class="rv-style-picker">' +
            '<button type="button" class="rv-style-opt' + (homeStyle === "vinyl" ? " is-on" : "") + '" data-home-style="vinyl">' +
              '<span class="rv-style-thumb rv-style-thumb-vinyl"><i></i></span>' +
              '<span class="rv-style-meta"><b>黑胶</b><em>现在这样 · 深色</em></span>' +
            '</button>' +
            '<button type="button" class="rv-style-opt' + (homeStyle === "turntable" ? " is-on" : "") + '" data-home-style="turntable">' +
              '<span class="rv-style-thumb rv-style-thumb-tt"><i class="rv-style-thumb-plate"></i><i class="rv-style-thumb-disc"></i></span>' +
              '<span class="rv-style-meta"><b>唱机</b><em>白底 · 图片那种</em></span>' +
            '</button>' +
          '</div>' +
          '<div class="rv-settings-hint">唱机样式默认白底；壁纸、字体颜色照样能用，两套样式各记一套颜色</div>' +
        '</div>' +
        '<div class="rv-settings-section">' +
          '<div class="rv-settings-title">音乐弹窗</div>' +
          '<div class="rv-popup-toggle-row">' +
            '<div class="rv-popup-toggle-text"><b>桌面黑胶弹窗</b><em>播放时在桌面显示黑胶小弹窗，点卡片展开控制</em></div>' +
            '<label class="mp-switch"><input type="checkbox" id="rv-music-popup-toggle"><span class="mp-switch-track"><span class="mp-switch-thumb"></span></span></label>' +
          '</div>' +
          '<div class="rv-popup-size-row">' +
            '<span class="rv-popup-size-label">弹窗大小</span>' +
            '<input type="range" min="70" max="130" step="5" class="rv-popup-size-slider" id="rv-music-popup-size">' +
            '<span class="rv-popup-size-val" id="rv-music-popup-size-val">100%</span>' +
          '</div>' +
          '<div class="rv-settings-hint">收起状态点卡片展开，展开后点旋转的唱片收回；弹窗可长按拖动位置</div>' +
        '</div>' +
        '<div class="rv-settings-section">' +
          '<div class="rv-settings-title">个人资料</div>' +
          '<div class="rv-profile-row">' +
            '<div class="rv-profile-avatar-preview" id="rv-profile-avatar-preview">' + avatarPreview + '</div>' +
            '<div class="rv-profile-actions">' +
              '<label class="rv-wallpaper-btn" for="rv-profile-avatar-file">更换头像</label>' +
              '<input type="file" id="rv-profile-avatar-file" accept="image/*" style="display:none">' +
            '</div>' +
          '</div>' +
          '<div class="rv-profile-row">' +
            '<div class="rv-profile-bg-preview" id="rv-profile-bg-preview">' + bgPreview + '</div>' +
            '<div class="rv-profile-actions">' +
              '<label class="rv-wallpaper-btn" for="rv-profile-bg-file">更换背景</label>' +
              '<input type="file" id="rv-profile-bg-file" accept="image/*" style="display:none">' +
            '</div>' +
          '</div>' +
          '<div class="rv-profile-name-row">' +
            '<span class="rv-profile-name-label">昵称</span>' +
            '<input class="rv-profile-name-input" id="rv-profile-name-input" value="' + esc(profileData.name) + '" placeholder="输入昵称">' +
            '<button class="rv-wallpaper-btn" id="rv-profile-name-save">保存</button>' +
          '</div>' +
          '<div class="rv-profile-name-row">' +
            '<span class="rv-profile-name-label">粉丝数</span>' +
            '<input class="rv-profile-name-input" id="rv-profile-followers-input" type="number" value="' + (profileData.followers || 0) + '" placeholder="0" min="0">' +
            '<button class="rv-wallpaper-btn" id="rv-profile-followers-save">保存</button>' +
          '</div>' +
        '</div>' +
        '<div class="rv-settings-section">' +
          '<div class="rv-settings-title">壁纸</div>' +
          '<div class="rv-wallpaper-card">' +
            '<div class="rv-wallpaper-preview" id="rv-wallpaper-preview"><span>未设置壁纸</span></div>' +
            '<div class="rv-wallpaper-actions">' +
              '<label class="rv-wallpaper-btn" for="rv-wallpaper-file">上传图片</label>' +
              '<input type="file" id="rv-wallpaper-file" accept="image/*" style="display:none">' +
              '<button class="rv-wallpaper-btn rv-wallpaper-btn-reset" id="rv-wallpaper-reset">恢复默认</button>' +
            '</div>' +
          '</div>' +
          '<div class="rv-settings-hint">壁纸只应用到首页（覆盖顶栏与底栏），其它页面保持白色背景</div>' +
        '</div>' +
        '<div class="rv-settings-section">' +
          '<div class="rv-settings-title">字体' + (isTT ? '（唱机样式）' : '（黑胶样式）') + '</div>' +
          '<div class="rv-color-list">' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">底栏 · 首页</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-tab-home" value="' + fc.tab_home + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">底栏 · 搜索</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-tab-search" value="' + fc.tab_search + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">底栏 · 歌单</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-tab-notes" value="' + fc.tab_notes + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">底栏 · 我的</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-tab-me" value="' + fc.tab_me + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">顶栏图标</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-topbar" value="' + fc.topbar + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">播放键</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-controls" value="' + fc.controls + '">' +
            '</div>' +
            '<div class="rv-color-item">' +
              '<span class="rv-color-label">歌曲名</span>' +
              '<input type="color" class="rv-color-input" id="rv-color-song" value="' + fc.song + '">' +
            '</div>' +
          '</div>' +
          '<div class="rv-settings-hint">底栏颜色只在对应标签被选中时显示，未选中的标签统一为灰色；顶栏图标 / 播放键 / 歌曲名立即变色。黑胶和唱机各记一套，切换样式不会互相覆盖</div>' +
        '</div>' +
      '</div>';

    var avatarPreviewEl = $("#rv-profile-avatar-preview", view);
    if (avatarPreviewEl && profileData.avatar) {
      avatarPreviewEl.classList.add("has-image");
    }

    // 音乐弹窗开关（弹窗本体在 music_popup.js）
    var popupToggle = $("#rv-music-popup-toggle", view);
    if (popupToggle) {
      popupToggle.checked = window.MusicPopup ? MusicPopup.isEnabled() : false;
      popupToggle.onchange = function () {
        if (window.MusicPopup) {
          MusicPopup.setEnabled(popupToggle.checked);
          toast(popupToggle.checked ? "音乐弹窗已开启" : "音乐弹窗已关闭");
        }
      };
    }

    // 弹窗大小滑杆（0.7x ~ 1.6x，即时预览）
    var sizeSlider = $("#rv-music-popup-size", view);
    if (sizeSlider) {
      var sizeVal = $("#rv-music-popup-size-val", view);
      var curScale = window.MusicPopup ? MusicPopup.getScale() : 1;
      sizeSlider.value = Math.round(curScale * 100);
      if (sizeVal) sizeVal.textContent = Math.round(curScale * 100) + "%";
      sizeSlider.oninput = function () {
        var v = Number(sizeSlider.value);
        if (sizeVal) sizeVal.textContent = v + "%";
        if (window.MusicPopup) MusicPopup.setScale(v / 100);
      };
    }

    var bgPreviewEl = $("#rv-profile-bg-preview", view);
    if (bgPreviewEl && profileData.bg) {
      bgPreviewEl.classList.add("has-image");
    }

    var avatarFileInput = $("#rv-profile-avatar-file", view);
    if (avatarFileInput) {
      avatarFileInput.onchange = function () {
        var file = avatarFileInput.files && avatarFileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          profileData.avatar = reader.result;
          saveProfile();
          renderSettingsView();
          toast("头像已更新");
        };
        reader.readAsDataURL(file);
      };
    }

    var bgFileInput = $("#rv-profile-bg-file", view);
    if (bgFileInput) {
      bgFileInput.onchange = function () {
        var file = bgFileInput.files && bgFileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          profileData.bg = reader.result;
          saveProfile();
          renderSettingsView();
          toast("背景已更新");
        };
        reader.readAsDataURL(file);
      };
    }

    var nameSaveBtn = $("#rv-profile-name-save", view);
    if (nameSaveBtn) {
      nameSaveBtn.onclick = function () {
        var input = $("#rv-profile-name-input", view);
        if (input && input.value.trim()) {
          profileData.name = input.value.trim();
          saveProfile();
          toast("昵称已更新");
        }
      };
    }

    var followersSaveBtn = $("#rv-profile-followers-save", view);
    if (followersSaveBtn) {
      followersSaveBtn.onclick = function () {
        var input = $("#rv-profile-followers-input", view);
        if (input) {
          var val = parseInt(input.value, 10);
          profileData.followers = isNaN(val) ? 0 : Math.max(0, val);
          saveProfile();
          toast("粉丝数已更新");
        }
      };
    }

    var preview = $("#rv-wallpaper-preview", view);
    if (preview && wallpaperData) {
      preview.style.backgroundImage = 'url("' + wallpaperData + '")';
      preview.classList.add("has-image");
      preview.innerHTML = "";
    }

    var resetBtn = $("#rv-wallpaper-reset", view);
    if (resetBtn) {
      if (!wallpaperData) resetBtn.disabled = true;
      resetBtn.onclick = function () {
        if (!wallpaperData) return;
        setWallpaper("");
        renderSettingsView();
        toast("已恢复默认壁纸");
      };
    }

    var fileInput = $("#rv-wallpaper-file", view);
    if (fileInput) {
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (typeof window.compressImage === "function") {
          window.compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.82 })
            .then(onWallpaperPicked)
            .catch(function () { toast("图片处理失败"); });
        } else {
          var reader = new FileReader();
          reader.onload = function () { onWallpaperPicked(reader.result); };
          reader.readAsDataURL(file);
        }
      };
    }

    var colorPairs = [
      [isTT ? "tab_home_t" : "tab_home", "rv-color-tab-home"],
      ["tab_search", "rv-color-tab-search"],
      ["tab_notes", "rv-color-tab-notes"],
      ["tab_me", "rv-color-tab-me"],
      [isTT ? "topbar_t" : "topbar", "rv-color-topbar"],
      [isTT ? "controls_t" : "controls", "rv-color-controls"],
      [isTT ? "song_t" : "song", "rv-color-song"]
    ];
    colorPairs.forEach(function (pair) {
      var input = $("#" + pair[1], view);
      if (!input) return;
      input.oninput = function () {
        setFontColor(pair[0], input.value);
      };
    });

    $$("[data-home-style]", view).forEach(function (btn) {
      btn.onclick = function () {
        setHomeStyle(btn.getAttribute("data-home-style"));
      };
    });
  }

  function onWallpaperPicked(dataUrl) {
    if (setWallpaper(dataUrl)) {
      renderSettingsView();
      toast("壁纸已设置");
    }
  }

  /* ===== 上传视图 ===== */

  var uploadFile = null;
  var uploadLrcFile = null;

  function renderUploadView(view) {
    var html = '<div class="rv-songlist-header">' +
      '<button class="rv-songlist-back" id="rv-upload-back" style="color:#1c1c1e;">‹</button>' +
      '<div class="rv-songlist-title">本地音乐</div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;">' +
      '<div class="rv-upload-area">' +
        '<div class="rv-upload-dropzone" id="rv-upload-zone">' +
          '<div class="rv-upload-icon">📁</div>' +
          '<div class="rv-upload-text">点击选择音频文件</div>' +
          '<div class="rv-upload-hint">支持 MP3, WAV, OGG, FLAC 等格式</div>' +
          '<input type="file" id="rv-upload-file" accept="audio/*" style="display:none">' +
        '</div>' +
        '<div id="rv-upload-filename"></div>' +
        '<div class="rv-upload-form" id="rv-upload-form">' +
          '<div class="rv-upload-field">' +
            '<label class="rv-upload-label">歌曲名称</label>' +
            '<input class="rv-upload-input" id="rv-upload-title" placeholder="输入歌曲名称">' +
          '</div>' +
          '<div class="rv-upload-field">' +
            '<label class="rv-upload-label">歌手</label>' +
            '<input class="rv-upload-input" id="rv-upload-artist" placeholder="输入歌手名称">' +
          '</div>' +
          '<div class="rv-upload-field">' +
            '<label class="rv-upload-label">歌词文件（可选）</label>' +
            '<div class="rv-upload-lrc-row" id="rv-upload-lrc-row">' +
              '<button class="rv-upload-lrc-btn" id="rv-upload-lrc-btn">选择 .lrc 文件</button>' +
              '<span class="rv-upload-lrc-name" id="rv-upload-lrc-name"></span>' +
            '</div>' +
            '<input type="file" id="rv-upload-lrc" accept=".lrc,.txt" style="display:none">' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    view.innerHTML = html;

    var backBtn = $("#rv-upload-back", view);
    if (backBtn) backBtn.onclick = function () {
      uploadFile = null;
      uploadLrcFile = null;
      notesSubView = "songs";
      renderNotesView();
    };

    var zone = $("#rv-upload-zone", view);
    var fileInput = $("#rv-upload-file", view);

    zone.onclick = function () { fileInput.click(); };

    fileInput.onchange = function () {
      if (fileInput.files && fileInput.files[0]) {
        uploadFile = fileInput.files[0];
        uploadLrcFile = null;
        var name = uploadFile.name.replace(/\.[^.]+$/, "");
        $("#rv-upload-filename").innerHTML =
          '<div class="rv-upload-file-name">已选择: ' + esc(uploadFile.name) + '</div>';
        $("#rv-upload-title").value = name;
        var lrcNameEl = $("#rv-upload-lrc-name", view);
        if (lrcNameEl) lrcNameEl.textContent = "";
        bindUploadConfirm(view);
      }
    };

    var lrcBtn = $("#rv-upload-lrc-btn", view);
    var lrcInput = $("#rv-upload-lrc", view);
    if (lrcBtn && lrcInput) {
      lrcBtn.onclick = function (e) { e.stopPropagation(); lrcInput.click(); };
      lrcInput.onchange = function () {
        if (lrcInput.files && lrcInput.files[0]) {
          uploadLrcFile = lrcInput.files[0];
          var lrcNameEl = $("#rv-upload-lrc-name", view);
          if (lrcNameEl) lrcNameEl.textContent = uploadLrcFile.name;
        }
      };
    }
  }

  function bindUploadConfirm(view) {
    var existing = $("#rv-upload-actions", view);
    if (existing) existing.remove();

    var area = $(".rv-upload-area", view);
    if (!area) return;

    var actions = document.createElement("div");
    actions.id = "rv-upload-actions";
    actions.style.cssText = "display:flex;gap:10px;padding:0 16px 16px;";
    actions.innerHTML =
      '<button class="radio-modal-btn radio-modal-btn-cancel" id="rv-upload-cancel" style="flex:1;">取消</button>' +
      '<button class="radio-modal-btn radio-modal-btn-confirm" id="rv-upload-confirm" style="flex:1;">上传</button>';
    area.appendChild(actions);

    $("#rv-upload-cancel", view).onclick = function () {
      uploadFile = null;
      uploadLrcFile = null;
      notesSubView = "songs";
      renderNotesView();
    };

    $("#rv-upload-confirm", view).onclick = function () {
      if (!uploadFile) { toast("请先选择音频文件"); return; }
      var songTitle = ($("#rv-upload-title", view).value || "").trim() || uploadFile.name;
      var songArtist = ($("#rv-upload-artist", view).value || "").trim() || "本地音乐";
      var songId = "local_" + Date.now();

      var saveLyricPromise = null;
      if (uploadLrcFile) {
        saveLyricPromise = new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            try {
              localStorage.setItem("radio_lyric_" + songId, reader.result);
            } catch (e) {}
            resolve();
          };
          reader.onerror = function () { resolve(); };
          reader.readAsText(uploadLrcFile, "utf-8");
        });
      } else {
        saveLyricPromise = Promise.resolve();
      }

      saveLyricPromise.then(function () {
        return saveLocalAudio(songId, uploadFile);
      }).then(function () {
        var song = {
          id: songId,
          title: songTitle,
          artist: songArtist,
          cover: "",
          duration: 0,
          type: "song",
          source: "local"
        };

        var targetPl = currentPlaylistId || UPL_ID;
        doAddSong(song, targetPl, null);

        var tempAudio = new Audio();
        tempAudio.src = getLocalAudioUrl(songId);
        tempAudio.addEventListener("loadedmetadata", function () {
          if (tempAudio.duration && isFinite(tempAudio.duration)) {
            var songs = loadSongs(targetPl);
            var found = songs.find(function (s) { return s.id === songId; });
            if (found) {
              found.duration = Math.round(tempAudio.duration);
              saveSongs(targetPl, songs);
            }
          }
        });

        uploadFile = null;
        uploadLrcFile = null;
        notesSubView = "songs";
        renderNotesView();
        toast("上传成功");
      });
    };
  }

  /* ===== 弹窗 ===== */

  function showModal(html) {
    var host = $("#radio-modals");
    if (!host) return;
    host.innerHTML = '<div class="radio-modal-mask" id="radio-modal-mask">' +
      '<div class="radio-modal-sheet">' +
        '<div class="radio-modal-handle"></div>' +
        html +
      '</div></div>';

    var mask = $("#radio-modal-mask");
    if (mask) {
      mask.onclick = function (e) {
        if (e.target === mask) closeModal();
      };
    }
  }

  function closeModal() {
    var host = $("#radio-modals");
    if (host) host.innerHTML = "";
  }

  function showCreatePlaylistModal() {
    showModal(
      '<div class="radio-modal-title">新建歌单</div>' +
      '<input class="radio-modal-input" id="radio-new-pl-name" placeholder="歌单名称" maxlength="30" autocomplete="off">' +
      '<div class="radio-modal-actions">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel">取消</button>' +
        '<button class="radio-modal-btn radio-modal-btn-confirm" id="radio-modal-confirm">创建</button>' +
      '</div>'
    );

    var input = $("#radio-new-pl-name");
    var cancelBtn = $("#radio-modal-cancel");
    var confirmBtn = $("#radio-modal-confirm");

    if (input) setTimeout(function () { input.focus(); }, 100);
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (confirmBtn) confirmBtn.onclick = function () {
      var name = (input ? input.value : "").trim();
      if (!name) { toast("请输入歌单名称"); return; }
      var newPl = {
        id: "pl_" + Date.now(),
        name: name,
        isDefault: false,
        createdAt: Date.now()
      };
      playlists.push(newPl);
      savePlaylists();
      closeModal();
      renderNotesView();
      toast("歌单已创建");
    };
  }

  function showPlaylistMenuModal(pl) {
    var isDefault = pl.isDefault;
    var html = '<div class="radio-modal-title">' + esc(pl.name) + '</div>' +
      '<div class="radio-modal-actions" style="flex-direction:column;gap:8px;">';

    if (pl.id === UPL_ID) {
      html += '<button class="radio-modal-btn radio-modal-btn-confirm" id="radio-upload-btn" style="width:100%">上传音频文件</button>';
    }
    if (!isDefault) {
      html += '<button class="radio-modal-btn radio-modal-btn-confirm" id="radio-rename-pl-btn" style="width:100%">重命名</button>';
      html += '<button class="radio-modal-btn radio-modal-btn-danger" id="radio-delete-pl-btn" style="width:100%">删除歌单</button>';
    }
    html += '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>';
    html += '</div>';

    showModal(html);

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    var uploadBtn = $("#radio-upload-btn");
    if (uploadBtn) uploadBtn.onclick = function () {
      closeModal();
      notesSubView = "upload";
      renderNotesView();
    };

    if (!isDefault) {
      var renameBtn = $("#radio-rename-pl-btn");
      if (renameBtn) renameBtn.onclick = function () { showRenamePlaylistModal(pl); };

      var deleteBtn = $("#radio-delete-pl-btn");
      if (deleteBtn) deleteBtn.onclick = function () {
        if (confirm('确定删除歌单「' + pl.name + '」吗？')) {
          playlists = playlists.filter(function (p) { return p.id !== pl.id; });
          savePlaylists();
          try { localStorage.removeItem(SONG_KEY_PREFIX + pl.id); } catch (e) {}
          delete songCache[pl.id];
          closeModal();
          notesSubView = "playlists";
          currentPlaylistId = null;
          renderNotesView();
          toast("歌单已删除");
        }
      };
    }
  }

  function showRenamePlaylistModal(pl) {
    showModal(
      '<div class="radio-modal-title">重命名歌单</div>' +
      '<input class="radio-modal-input" id="radio-rename-pl-input" value="' + esc(pl.name) + '" maxlength="30" autocomplete="off">' +
      '<div class="radio-modal-actions">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel">取消</button>' +
        '<button class="radio-modal-btn radio-modal-btn-confirm" id="radio-modal-confirm">确定</button>' +
      '</div>'
    );

    var input = $("#radio-rename-pl-input");
    var cancelBtn = $("#radio-modal-cancel");
    var confirmBtn = $("#radio-modal-confirm");

    if (input) { setTimeout(function () { input.focus(); input.select(); }, 100); }
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (confirmBtn) confirmBtn.onclick = function () {
      var name = (input ? input.value : "").trim();
      if (!name) { toast("请输入歌单名称"); return; }
      pl.name = name;
      savePlaylists();
      closeModal();
      renderNotesView();
      toast("已重命名");
    };
  }

  function showSongMenuModal(song) {
    var isFav = isInFavorites(song.id);
    var html = '<div class="radio-modal-title">' + esc(song.title || song.name || "歌曲") + '</div>' +
      '<div class="radio-song-menu">';

    if (isFav) {
      html += '<button class="radio-song-menu-item danger" id="radio-song-remove-fav">从收藏移除</button>';
    } else {
      html += '<button class="radio-song-menu-item" id="radio-song-add-fav">添加到收藏</button>';
    }

    html += '<button class="radio-song-menu-item" id="radio-song-add-pl">添加到歌单</button>';

    if (currentPlaylistId && currentPlaylistId !== FAV_ID) {
      html += '<button class="radio-song-menu-item danger" id="radio-song-remove">从当前歌单移除</button>';
    }

    html += '</div>' +
      '<div style="margin-top:12px;">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>' +
      '</div>';

    showModal(html);

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    var addFavBtn = $("#radio-song-add-fav");
    if (addFavBtn) addFavBtn.onclick = function () {
      doAddSong(song, FAV_ID, null);
      closeModal();
    };

    var removeFavBtn = $("#radio-song-remove-fav");
    if (removeFavBtn) removeFavBtn.onclick = function () {
      removeSong(FAV_ID, song.id);
      closeModal();
      toast("已从收藏移除");
      if (notesSubView === "songs") renderNotesView();
    };

    var addPlBtn = $("#radio-song-add-pl");
    if (addPlBtn) addPlBtn.onclick = function () {
      closeModal();
      showAddToPlaylistPicker(song);
    };

    var removeBtn = $("#radio-song-remove");
    if (removeBtn) removeBtn.onclick = function () {
      removeSong(currentPlaylistId, song.id);
      closeModal();
      toast("已移除");
      if (notesSubView === "songs") renderNotesView();
    };
  }

  function showAddToPlaylistPicker(song) {
    var html = '<div class="radio-modal-title">添加到歌单</div>' +
      '<div class="radio-song-menu">';
    for (var i = 0; i < playlists.length; i++) {
      var pl = playlists[i];
      html += '<button class="radio-song-menu-item" data-pick-pl="' + esc(pl.id) + '">' +
        esc(pl.name) + '</button>';
    }
    html += '</div>' +
      '<div style="margin-top:12px;">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>' +
      '</div>';

    showModal(html);

    var cancelBtn = $("#radio-modal-cancel");
    if (cancelBtn) cancelBtn.onclick = closeModal;

    var items = $$("[data-pick-pl]", $("#radio-modals"));
    items.forEach(function (el) {
      el.onclick = function () {
        var plId = el.getAttribute("data-pick-pl");
        closeModal();
        doAddSong(song, plId, null);
      };
    });
  }

  function isInFavorites(songId) {
    return loadSongs(FAV_ID).some(function (s) { return String(s.id) === String(songId); });
  }

  function removeSong(plId, songId) {
    var songs = loadSongs(plId).filter(function (s) { return String(s.id) !== String(songId); });
    saveSongs(plId, songs);
  }

  /* ===== 播放控制 ===== */

  function playSongFromList(songs, idx) {
    if (idx < 0 || idx >= songs.length) return;
    playerState.currentPlaylistSongs = songs;
    playerState.currentIndex = idx;
    var song = songs[idx];
    playSong(song);
  }

  function playSong(song) {
    if (scrobbleStartedAt) reportScrobble("ui");
    playerState.currentSong = song;
    playerState.currentSongId = String(song.id);

    var audio = getAudio();
    audio.__currentSongId = playerState.currentSongId;
    audio.__songInfo = {
      title: song.title || song.name || "",
      artist: song.artist || song.artists || "",
      cover: song.cover || "",
      type: "song",
      source: song.source || ""
    };

    playerState.lyricLines = [];
    playerState.activeLyricIdx = -1;

    if (currentTab === "home") {
      renderHomeView();
    }

    var url = resolveSongUrl(song);
    if (url) {
      startPlayback(song, url);
      return;
    }

    if (song.source === "netease" && song.neteaseId) {
      musicFetch("/api/music/url?id=" + encodeURIComponent(song.neteaseId))
        .then(function (data) {
          if (data && data.url) {
            var playUrl = MUSIC_API + "/api/music/proxy?url=" + encodeURIComponent(data.url);
            startPlayback(song, playUrl);
          } else {
            toast("无法获取播放地址");
          }
        })
        .catch(function () { toast("获取播放地址失败"); });
      return;
    }

    toast("无法播放此歌曲");
  }

  function startPlayback(song, url) {
    var audio = getAudio();
    audio.src = url;
    audio.play().catch(function () {
      toast("播放失败");
    });
    playerState.playing = true;
    startScrobbleTimer();
    loadSongLyric(song);
    musicFetch("/api/recently-played", {
      method: "POST",
      json: true,
      body: JSON.stringify({
        song_id: String(song.neteaseId || song.id),
        song_name: song.title || song.name || "",
        artist: song.artist || "",
        cover_url: song.cover || ""
      })
    }).catch(function () {});
    if (currentTab === "home") {
      renderHomeView();
    }
  }

  function resolveSongUrl(song) {
    if (song.remoteUrl) return song.remoteUrl;
    if (song.source === "local" || String(song.id).indexOf("local_") === 0) {
      return getLocalAudioUrl(String(song.id));
    }
    if (song.url) return song.url;
    return null;
  }

  function togglePlayPause() {
    var audio = getAudio();
    if (!playerState.currentSong) return;
    if (playerState.playing) {
      audio.pause();
      playerState.playing = false;
    } else {
      audio.play().catch(function () {});
      playerState.playing = true;
    }
    updateVinylState();
  }

  /* ===== 播放模式：loop 列表循环 / one 单曲循环 / shuffle 随机播放 ===== */

  var LS_PLAY_MODE = "radioPlayMode";

  function getPlayMode() {
    var m = null;
    try { m = localStorage.getItem(LS_PLAY_MODE); } catch (e) {}
    return (m === "one" || m === "shuffle") ? m : "loop";
  }

  function setPlayMode(m) {
    if (m !== "loop" && m !== "one" && m !== "shuffle") m = "loop";
    try { localStorage.setItem(LS_PLAY_MODE, m); } catch (e) {}
    toast(m === "one" ? "单曲循环" : m === "shuffle" ? "随机播放" : "列表循环");
    var modeBtn = $("#rv-mode");
    if (modeBtn) {
      modeBtn.innerHTML = m === "one" ? iconRepeatOne() : m === "shuffle" ? iconShuffle() : iconRepeat();
      modeBtn.classList.toggle("is-shuffle", m === "shuffle");
    }
  }

  function cyclePlayMode() {
    var order = ["loop", "one", "shuffle"];
    var cur = getPlayMode();
    setPlayMode(order[(order.indexOf(cur) + 1) % order.length]);
  }

  function playNext() {
    if (playerState.currentPlaylistSongs.length === 0) return;
    var n = playerState.currentPlaylistSongs.length;
    var idx;
    if (getPlayMode() === "shuffle" && n > 1) {
      do { idx = Math.floor(Math.random() * n); } while (idx === playerState.currentIndex);
    } else {
      idx = (playerState.currentIndex + 1) % n;
    }
    playerState.currentIndex = idx;
    playSong(playerState.currentPlaylistSongs[idx]);
  }

  function playPrev() {
    if (playerState.currentPlaylistSongs.length === 0) return;
    var prevIdx = (playerState.currentIndex - 1 + playerState.currentPlaylistSongs.length) % playerState.currentPlaylistSongs.length;
    playerState.currentIndex = prevIdx;
    playSong(playerState.currentPlaylistSongs[prevIdx]);
  }

  /* ===== 本地音频存储 ===== */

  var localAudioUrls = {};

  function saveLocalAudio(songId, file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        localAudioUrls[String(songId)] = dataUrl;
        try {
          localStorage.setItem("radio_local_" + songId, dataUrl);
        } catch (e) {}
        resolve(dataUrl);
      };
      reader.readAsDataURL(file);
    });
  }

  function getLocalAudioUrl(songId) {
    if (localAudioUrls[String(songId)]) return localAudioUrls[String(songId)];
    try {
      var stored = localStorage.getItem("radio_local_" + songId);
      if (stored) {
        localAudioUrls[String(songId)] = stored;
        return stored;
      }
    } catch (e) {}
    return null;
  }

  /* ===== 歌词 ===== */

  function parseLrc(text) {
    if (!text) return [];
    var lines = text.split("\n");
    var result = [];
    var timeRe = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var times = [];
      var match;
      while ((match = timeRe.exec(line)) !== null) {
        var min = parseInt(match[1], 10);
        var sec = parseInt(match[2], 10);
        var ms = match[3] ? parseInt(match[3], 10) : 0;
        if (match[3] && match[3].length === 2) ms *= 10;
        times.push(min * 60 + sec + ms / 1000);
      }
      var txt = line.replace(timeRe, "").trim();
      if (txt && times.length > 0) {
        for (var j = 0; j < times.length; j++) {
          result.push({ time: times[j], text: txt });
        }
      }
    }
    result.sort(function (a, b) { return a.time - b.time; });
    return result;
  }

  function loadSongLyric(song) {
    var lyricKey = "radio_lyric_" + song.id;
    try {
      var stored = localStorage.getItem(lyricKey);
      if (stored) {
        playerState.lyricLines = parseLrc(stored);
        return;
      }
    } catch (e) {}

    if (song.lyric) {
      playerState.lyricLines = parseLrc(song.lyric);
      return;
    }

    if (song.source === "netease" && song.neteaseId) {
      musicFetch("/api/music/lyric?id=" + encodeURIComponent(song.neteaseId))
        .then(function (data) {
          if (data && data.lrc) {
            try { localStorage.setItem(lyricKey, data.lrc); } catch (e) {}
            playerState.lyricLines = parseLrc(data.lrc);
          }
        })
        .catch(function () {});
    }
  }

  function updateLyricHighlight(currentTime) {
    if (playerState.lyricLines.length === 0) return;
    var idx = -1;
    for (var i = playerState.lyricLines.length - 1; i >= 0; i--) {
      if (currentTime >= playerState.lyricLines[i].time) {
        idx = i;
        break;
      }
    }
    if (playerState.activeLyricIdx !== idx) {
      playerState.activeLyricIdx = idx;
      if (playerState.lyricsMode) {
        var container = $("#rv-lyrics-scroll");
        if (container) {
          var lines = container.querySelectorAll(".rv-lyric-line");
          lines.forEach(function(line, i) {
            if (i === idx) {
              line.classList.add("rv-lyric-active");
            } else {
              line.classList.remove("rv-lyric-active");
            }
          });
          scrollLyricToActive();
        }
      }
    }
  }

  /* ===== Audio 事件 ===== */

  function setupAudioEvents() {
    var audio = getAudio();

    audio.addEventListener("timeupdate", function () {
      updateProgress();
    });

    audio.addEventListener("play", function () {
      playerState.playing = true;
      updateVinylState();
    });

    audio.addEventListener("pause", function () {
      if (audio.__skipPauseBroadcast) {
        audio.__skipPauseBroadcast = false;
        return;
      }
      playerState.playing = false;
      updateVinylState();
    });

    audio.addEventListener("ended", function () {
      reportScrobble("playend");
      if (getPlayMode() === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
      }
      playNext();
    });

    audio.addEventListener("loadedmetadata", function () {
      if (playerState.currentSong && !playerState.currentSong.duration && audio.duration && isFinite(audio.duration)) {
        playerState.currentSong.duration = Math.round(audio.duration);
      }
      var durTime = $("#rv-dur-time");
      if (durTime) durTime.textContent = formatDur(audio.duration);
    });

    audio.addEventListener("error", function () {
      if (audio.src && audio.src !== "") {
        toast("播放出错");
        playerState.playing = false;
        updateVinylState();
      }
    });
  }

  /* ===== 顶部栏 ===== */

  var ICON_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var ICON_BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>';
  var ICON_GEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  function updateTopbar() {
    var topbar = $("#rv-topbar");
    var menuBtn = $("#rv-menu-btn");
    var title = $("#rv-topbar-title");
    var actionBtn = $("#rv-topbar-action");
    if (!menuBtn || !actionBtn) return;

    // 歌词模式：显示返回按钮
    if (playerState.lyricsMode) {
      if (topbar) topbar.style.display = "";
      menuBtn.style.visibility = "visible";
      menuBtn.innerHTML = ICON_BACK;
      menuBtn.setAttribute("aria-label", "返回");
      menuBtn.onclick = function () { exitLyricsMode(); };
      if (title) { title.textContent = "网易云音乐"; title.style.display = ""; }
      actionBtn.style.visibility = "visible";
      actionBtn.innerHTML = ICON_SEARCH;
      actionBtn.setAttribute("aria-label", "搜索");
      actionBtn.onclick = function () { switchTab("search"); };
      return;
    }

    // 设置页：保留返回箭头 + 标题"设置"
    if (currentTab === "settings") {
      if (topbar) topbar.style.display = "";
      menuBtn.style.visibility = "visible";
      menuBtn.innerHTML = ICON_BACK;
      menuBtn.setAttribute("aria-label", "返回");
      menuBtn.onclick = function () { switchTab("me"); };
      if (title) { title.textContent = "设置"; title.style.display = ""; }
      actionBtn.style.visibility = "hidden";
      return;
    }

    // 只有首页显示顶栏（左上 / 右上两个图标），且不再显示标题文字
    if (currentTab === "home") {
      if (topbar) topbar.style.display = "";
      menuBtn.style.visibility = "visible";
      menuBtn.innerHTML = "&#9776;";
      menuBtn.setAttribute("aria-label", "歌单");
      menuBtn.onclick = function () { switchTab("notes"); };
      actionBtn.style.visibility = "visible";
      actionBtn.innerHTML = ICON_SEARCH;
      actionBtn.setAttribute("aria-label", "搜索");
      actionBtn.onclick = function () { switchTab("search"); };
      if (title) title.style.display = "none";
      return;
    }

    // 我的：顶栏只显示右上角设置（齿轮）图标，点击进入设置页
    if (currentTab === "me") {
      if (topbar) topbar.style.display = "";
      menuBtn.style.visibility = "hidden";
      if (title) title.style.display = "none";
      actionBtn.style.visibility = "visible";
      actionBtn.innerHTML = ICON_GEAR;
      actionBtn.setAttribute("aria-label", "设置");
      actionBtn.onclick = function () { switchTab("settings"); };
      return;
    }

    // 搜索页：顶栏隐藏（搜索页自带顶栏行）
    if (currentTab === "search") {
      if (topbar) topbar.style.display = "none";
      return;
    }

    // 笔记：顶栏隐藏
    if (topbar) topbar.style.display = "none";
  }

  /* ===== Tab 事件 ===== */

  function setupTabEvents() {
    var tabs = $$(".rv-tab");
    tabs.forEach(function (tab) {
      tab.onclick = function () {
        var target = tab.getAttribute("data-tab");
        switchTab(target);
      };
    });
  }

  /* ===== 一起听模式（3D 转轮播放器） ===== */

  var LT_MINI_POS_KEY = "radioLT_miniPos";

  var ltState = {
    active: false,
    charId: "",
    charName: "",
    charImage: "",
    userName: "",
    userImage: "",
    startTime: 0,
    collapsed: false
  };

  var ltPlayer = null;
  var ltSyncTimer = null;
  var ltSongKey = "";

  function ltGetElapsed() {
    if (!ltState.startTime) return 0;
    return Math.floor((Date.now() - ltState.startTime) / 1000);
  }

  function ltFormatElapsed(sec) {
    var m = Math.floor(sec / 60);
    if (m > 0) return m + "分钟";
    return sec + "秒";
  }

  function ltFormatClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function ltSongTitle(song) {
    return song ? (song.title || song.name || "未知歌曲") : "还没有播放的歌曲";
  }

  function ltSongArtist(song) {
    return song ? (song.artist || song.artists || "") : "";
  }

  function ltCurrentLyric() {
    var idx = playerState.activeLyricIdx;
    var lines = playerState.lyricLines;
    if (idx >= 0 && lines[idx] && lines[idx].text) return lines[idx].text;
    return "";
  }

  function ltAudioPosition() {
    var a = getAudio();
    return a && isFinite(a.currentTime) ? a.currentTime : 0;
  }

  function ltAudioDuration() {
    var a = getAudio();
    if (a && isFinite(a.duration) && a.duration > 0) return a.duration;
    var s = playerState.currentSong;
    return s && s.duration ? s.duration : 0;
  }

  function ltSongKeyOf(song) {
    if (!song) return "";
    return String(song.id || song.neteaseId || "") + "|" + (song.cover || "");
  }

  function ltSaveSession() {
    try {
      localStorage.setItem("radioListenTogether", JSON.stringify({
        id: ltState.charId,
        name: ltState.charName,
        image: ltState.charImage,
        _userName: ltState.userName,
        _userImage: ltState.userImage
      }));
    } catch (e) {}
  }

  function ltLoadSession() {
    try {
      var raw = localStorage.getItem("radioListenTogether");
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return {
        charId: obj.id || "",
        charName: obj.name || "",
        charImage: obj.image || "",
        userName: obj._userName || "",
        userImage: obj._userImage || ""
      };
    } catch (e) { return null; }
  }

  /* ----- 3D 播放器美化设置 ----- */

  var LT_PREFS_KEY = "radioPlayer3dPrefs";
  var ltPrefs = null;

  function ltDefaultPrefs() {
    return { skin: "lime", earphones: true, stickers: true, intro: true, reducedMotion: false, menuLabel: "MENU" };
  }

  function ltGetPrefs() {
    if (ltPrefs) return ltPrefs;
    var prefs = ltDefaultPrefs();
    try {
      var raw = localStorage.getItem(LT_PREFS_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === "object") {
          if (typeof obj.skin === "string") prefs.skin = obj.skin;
          ["earphones", "stickers", "intro", "reducedMotion"].forEach(function (k) {
            if (typeof obj[k] === "boolean") prefs[k] = obj[k];
          });
          if (typeof obj.menuLabel === "string" && obj.menuLabel) prefs.menuLabel = obj.menuLabel;
        }
      }
    } catch (e) {}
    var valid = false;
    try {
      valid = !!(window.RadioPlayer3D && window.RadioPlayer3D.SKINS.some(function (s) { return s.id === prefs.skin; }));
    } catch (e) {}
    if (!valid) prefs.skin = "lime";
    ltPrefs = prefs;
    return ltPrefs;
  }

  function ltSavePrefs() {
    try { localStorage.setItem(LT_PREFS_KEY, JSON.stringify(ltGetPrefs())); } catch (e) {}
  }

  function ltApplyPrefsToStage() {
    var floatEl = $(".lt-float");
    if (floatEl) floatEl.classList.toggle("is-no-ear", !ltGetPrefs().earphones);
  }

  function ltRemountPlayer() {
    if (!ltState.active || ltState.collapsed) return;
    var stage = $("#lt-player-stage");
    if (!stage) return;
    ltDestroyPlayer();
    stage.innerHTML = "";
    ltApplyPrefsToStage();
    ltMountPlayer();
  }

  function ltUpdateEntryButtons() {
    var searchBtn = $("#rv-search-lt-btn");
    if (searchBtn) {
      searchBtn.classList.toggle("is-active", !!ltState.active);
      searchBtn.setAttribute("aria-label", ltState.active ? "结束一起听" : "一起听");
    }
    var legacyBtn = $("#rv-lt-entry-btn");
    if (legacyBtn) legacyBtn.classList.toggle("is-active", !!ltState.active);
  }

  function onListenEntryTap() {
    if (ltState.active) { ltShowEndConfirm(); return; }
    openListenTogether();
  }

  function ltShowEndConfirm() {
    showModal(
      '<div class="radio-modal-title">是否结束一起听</div>' +
      '<div class="lt-confirm-text">' + esc(ltState.charName || "TA") + ' · 已一起听 ' + esc(ltFormatElapsed(ltGetElapsed())) + '</div>' +
      '<div class="radio-modal-actions">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel">继续听</button>' +
        '<button class="radio-modal-btn radio-modal-btn-danger" id="radio-lt-end">结束</button>' +
      '</div>'
    );
    var cancel = $("#radio-modal-cancel");
    if (cancel) cancel.onclick = closeModal;
    var end = $("#radio-lt-end");
    if (end) end.onclick = function () { closeModal(); closeListenTogether(); };
  }

  function openLtThemeModal() {
    var prefs = ltGetPrefs();
    var skins = [];
    try { skins = (window.RadioPlayer3D && window.RadioPlayer3D.SKINS) || []; } catch (e) {}
    if (!skins.length) skins = [{ id: "lime", name: "青柠绿", body: "#9fd11a" }];

    var skinHtml = '<div class="lt-skin-row">';
    skins.forEach(function (s) {
      skinHtml += '<button type="button" class="lt-skin' + (s.id === prefs.skin ? " is-on" : "") + '" data-lt-skin="' + esc(s.id) + '">' +
        '<span class="lt-skin-dot" style="background:' + esc(s.body || "#ccc") + '"></span>' +
        '<span class="lt-skin-name">' + esc(s.name || s.id) + '</span>' +
      '</button>';
    });
    skinHtml += '</div>';

    showModal(
      '<div class="radio-modal-title">3D 播放器美化</div>' +
      '<div class="lt-opt-group"><div class="lt-opt-label">机身配色</div>' + skinHtml + '</div>' +
      '<label class="lt-opt-row"><span>耳机线 + 双耳塞头像</span><input type="checkbox" class="lt-switch" id="lt-opt-earphones"' + (prefs.earphones ? " checked" : "") + '></label>' +
      '<label class="lt-opt-row"><span>手绘涂鸦贴纸</span><input type="checkbox" class="lt-switch" id="lt-opt-stickers"' + (prefs.stickers ? " checked" : "") + '></label>' +
      '<label class="lt-opt-row"><span>播放器进场动画</span><input type="checkbox" class="lt-switch" id="lt-opt-intro"' + (prefs.intro ? " checked" : "") + '></label>' +
      '<label class="lt-opt-row"><span>减少动态效果</span><input type="checkbox" class="lt-switch" id="lt-opt-rm"' + (prefs.reducedMotion ? " checked" : "") + '></label>' +
      '<div class="lt-opt-group" style="margin-top:12px;"><div class="lt-opt-label">转轮上方文字</div><input class="radio-modal-input" id="lt-opt-menulabel" maxlength="8" value="' + esc(prefs.menuLabel) + '"></div>' +
      '<div class="lt-credit-note">外观来自 clickwheel-player-3d · CC BY-NC 4.0</div>' +
      '<div class="radio-modal-actions" style="margin-top:14px;">' +
        '<button class="radio-modal-btn radio-modal-btn-confirm" id="radio-modal-cancel" style="width:100%">完成</button>' +
      '</div>'
    );

    function apply() {
      ltSavePrefs();
      ltRemountPlayer();
    }

    $$("[data-lt-skin]", $("#radio-modals")).forEach(function (btn) {
      btn.onclick = function () {
        ltGetPrefs().skin = btn.getAttribute("data-lt-skin");
        $$("[data-lt-skin]", $("#radio-modals")).forEach(function (b) { b.classList.toggle("is-on", b === btn); });
        apply();
      };
    });

    function bindToggle(id, key) {
      var el = $("#" + id);
      if (!el) return;
      el.onchange = function () { ltGetPrefs()[key] = !!el.checked; apply(); };
    }
    bindToggle("lt-opt-earphones", "earphones");
    bindToggle("lt-opt-stickers", "stickers");
    bindToggle("lt-opt-intro", "intro");
    bindToggle("lt-opt-rm", "reducedMotion");

    var labelInput = $("#lt-opt-menulabel");
    if (labelInput) {
      labelInput.onchange = function () {
        var v = labelInput.value.trim() || "MENU";
        labelInput.value = v;
        ltGetPrefs().menuLabel = v;
        apply();
      };
    }

    var done = $("#radio-modal-cancel");
    if (done) done.onclick = closeModal;
  }

  function ltTogglePlay() {
    var audio = getAudio();
    if (audio) audio.muted = false;
    togglePlayPause();
    ltSyncPlayer();
  }

  function ltAvatarList() {
    return [
      { src: ltState.charImage || "", label: (ltState.charName || "TA").charAt(0) },
      { src: ltState.userImage || "", label: (ltState.userName || "我").charAt(0) }
    ];
  }

  /* 播放器浮层的活动范围 = 手机屏幕（.phone-screen）。
     index.html 的 div 未配平，radio-screen 等一批页面实际挂在 body 下，
     浮层若挂在 .phone-screen 里会被这些页面整体盖住（点空白收不回去），
     所以浮层必须挂到 body 最上层，坐标与拖拽范围按手机屏幕矩形换算。 */
  function ltBounds() {
    var host = document.querySelector(".phone-screen");
    if (host) {
      var r = host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }

  function ltGetLayer() {
    var layer = document.getElementById("lt-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "lt-layer";
    }
    if (layer.parentElement !== document.body) document.body.appendChild(layer);
    return layer;
  }

  function ltDestroyPlayer() {
    if (ltPlayer) {
      try { ltPlayer.destroy(); } catch (e) {}
      ltPlayer = null;
    }
    ltSongKey = "";
  }

  function ltStopSync() {
    if (ltSyncTimer) {
      clearInterval(ltSyncTimer);
      ltSyncTimer = null;
    }
  }

  function ltStartSync() {
    ltStopSync();
    ltSyncTimer = setInterval(function () {
      if (!ltState.active) {
        ltStopSync();
        return;
      }
      if (ltState.collapsed) ltEnsureMini();
      ltSyncPlayer();
    }, 500);
  }

  function ltSyncPlayer() {
    if (!ltState.active) return;
    var stage = $("#lt-player-stage");
    if (!ltPlayer) {
      ltUpdateFallback(stage);
      return;
    }
    var song = playerState.currentSong;
    var key = ltSongKeyOf(song);
    if (key !== ltSongKey) {
      ltSongKey = key;
      try { ltPlayer.setCover(song && song.cover ? song.cover : ""); } catch (e) {}
    }
    try {
      ltPlayer.update({
        title: ltSongTitle(song),
        artist: ltSongArtist(song),
        lyric: ltCurrentLyric(),
        position: ltAudioPosition(),
        duration: ltAudioDuration(),
        playing: !!playerState.playing,
        topText: "一起听"
      });
    } catch (e) {}
  }

  function ltUpdateFallback(stage) {
    if (!stage) return;
    var song = playerState.currentSong;
    var title = $(".lt-fb-title", stage);
    var artist = $(".lt-fb-artist", stage);
    var play = $('[data-lt-cmd="play"]', stage);
    if (title) title.textContent = ltSongTitle(song);
    if (artist) artist.textContent = ltSongArtist(song);
    if (play) play.textContent = playerState.playing ? "⏸" : "▶";
  }

  function ltRenderFallback(stage) {
    if (!stage || $(".lt-fallback", stage)) return;
    ltDestroyPlayer();
    var song = playerState.currentSong;
    stage.innerHTML =
      '<div class="lt-fallback">' +
        '<div class="lt-fb-avatars">' +
          '<span class="lt-fb-avatar">' +
            (ltState.charImage ? '<img src="' + esc(ltState.charImage) + '" alt="">' : esc((ltState.charName || "TA").charAt(0))) +
          '</span>' +
          '<span class="lt-fb-avatar">' +
            (ltState.userImage ? '<img src="' + esc(ltState.userImage) + '" alt="">' : esc((ltState.userName || "我").charAt(0))) +
          '</span>' +
        '</div>' +
        '<div class="lt-fb-cover">' +
          (song && song.cover ? '<img src="' + esc(song.cover) + '" alt="">' : '<span>♫</span>') +
        '</div>' +
        '<div class="lt-fb-title"></div>' +
        '<div class="lt-fb-artist"></div>' +
        '<div class="lt-fb-controls">' +
          '<button type="button" data-lt-cmd="prev" aria-label="上一首">◀︎</button>' +
          '<button type="button" data-lt-cmd="play" class="is-main" aria-label="播放或暂停">▶</button>' +
          '<button type="button" data-lt-cmd="next" aria-label="下一首">▶︎</button>' +
        '</div>' +
      '</div>';
    $$("[data-lt-cmd]", stage).forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var cmd = btn.getAttribute("data-lt-cmd");
        if (cmd === "play") ltTogglePlay();
        else if (cmd === "next") playNext();
        else playPrev();
        ltSyncPlayer();
      };
    });
    ltUpdateFallback(stage);
  }

  function ltMountPlayer(retry) {
    if (!ltState.active || ltState.collapsed) return;
    var stage = $("#lt-player-stage");
    if (!stage) return;
    retry = retry || 0;
    if (!window.RadioPlayer3D) {
      if (retry < 50) {
        setTimeout(function () { ltMountPlayer(retry + 1); }, 100);
      } else {
        ltRenderFallback(stage);
      }
      return;
    }
    var song = playerState.currentSong;
    var prefs = ltGetPrefs();
    ltApplyPrefsToStage();
    try {
      ltPlayer = window.RadioPlayer3D.createPlayer(stage, {
        THREE: window.RadioPlayer3D.THREE,
        skin: prefs.skin,
        earphones: prefs.earphones,
        stickers: prefs.stickers,
        intro: prefs.intro,
        reducedMotion: prefs.reducedMotion,
        menuLabel: prefs.menuLabel || "MENU",
        state: {
          title: ltSongTitle(song),
          artist: ltSongArtist(song),
          lyric: ltCurrentLyric(),
          position: ltAudioPosition(),
          duration: ltAudioDuration(),
          playing: !!playerState.playing,
          topText: "一起听"
        },
        avatars: ltAvatarList(),
        cover: song && song.cover ? song.cover : "",
        onCommand: function (cmd) {
          if (cmd === "play") ltTogglePlay();
          else if (cmd === "next") playNext();
          else if (cmd === "prev") playPrev();
          ltSyncPlayer();
        },
        onSeek: function (sec) {
          var audio = getAudio();
          if (!audio || !isFinite(sec)) return;
          var dur = audio.duration || 0;
          audio.currentTime = Math.max(0, dur ? Math.min(sec, dur) : sec);
          ltSyncPlayer();
        },
        onMenu: function () { ltCollapse(); },
        onOutsideTap: function () { ltCollapse(); },
        onError: function () { ltRenderFallback(stage); }
      });
      ltSongKey = ltSongKeyOf(song);
    } catch (err) {
      ltRenderFallback(stage);
    }
  }

  function ltPlaceMini(mini) {
    if (!mini) return;
    var b = ltBounds();
    var mw = mini.offsetWidth || 58;
    var mh = mini.offsetHeight || 58;
    var saved = null;
    try {
      var raw = localStorage.getItem(LT_MINI_POS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {}
    var x = saved && isFinite(saved.x) ? saved.x : b.x + b.w - mw - 14;
    var y = saved && isFinite(saved.y) ? saved.y : b.y + b.h - mh - 96;
    x = Math.max(b.x + 6, Math.min(x, b.x + b.w - mw - 6));
    y = Math.max(b.y + 6, Math.min(y, b.y + b.h - mh - 6));
    mini.style.left = x + "px";
    mini.style.top = y + "px";
  }

  function ltBindMini(mini) {
    var dragging = false;
    var moved = false;
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var baseX = 0;
    var baseY = 0;

    mini.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".lt-mini-close")) return;
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      baseX = parseFloat(mini.style.left) || 0;
      baseY = parseFloat(mini.style.top) || 0;
      mini.classList.add("is-dragging");
      try { mini.setPointerCapture(pointerId); } catch (err) {}
      e.preventDefault();
    });

    mini.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      var b = ltBounds();
      var mw = mini.offsetWidth || 58;
      var mh = mini.offsetHeight || 58;
      mini.style.left = Math.max(b.x + 6, Math.min(baseX + dx, b.x + b.w - mw - 6)) + "px";
      mini.style.top = Math.max(b.y + 6, Math.min(baseY + dy, b.y + b.h - mh - 6)) + "px";
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      mini.classList.remove("is-dragging");
      try { mini.releasePointerCapture(pointerId); } catch (err) {}
      if (moved) {
        try {
          localStorage.setItem(LT_MINI_POS_KEY, JSON.stringify({
            x: parseFloat(mini.style.left) || 0,
            y: parseFloat(mini.style.top) || 0
          }));
        } catch (err) {}
      } else {
        ltExpand();
      }
    }

    mini.addEventListener("pointerup", endDrag);
    mini.addEventListener("pointercancel", endDrag);
  }

  function ltEnsureMini() {
    if (!ltState.active || !ltState.collapsed) return;
    var layer = ltGetLayer();
    var mini = $("#lt-mini", layer);
    if (!mini) {
      mini = document.createElement("div");
      mini.id = "lt-mini";
      mini.className = "lt-mini";
      mini.innerHTML =
        '<div class="lt-mini-wave" aria-hidden="true"></div>' +
        '<img class="lt-mini-icon" src="assets/baobao-icons/svg/thin/seal-music.svg" alt="">' +
        '<div class="lt-mini-ring"></div>' +
        '<div class="lt-mini-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
      layer.appendChild(mini);
      ltBindMini(mini);
      ltPlaceMini(mini);
    }
    mini.classList.toggle("is-playing", !!playerState.playing);
  }

  function ltCollapse() {
    if (!ltState.active || ltState.collapsed) return;
    ltState.collapsed = true;
    ltDestroyPlayer();
    var floatEl = $("#lt-float");
    if (floatEl) floatEl.remove();
    ltEnsureMini();
  }

  function ltExpand() {
    if (!ltState.active) return;
    ltState.collapsed = false;
    var mini = $("#lt-mini");
    if (mini) mini.remove();
    renderLtFloat();
  }

  function renderLtFloat() {
    var layer = ltGetLayer();
    var existing = $("#lt-float", layer);
    if (existing) existing.remove();
    var mini = $("#lt-mini", layer);
    if (mini) mini.remove();
    ltDestroyPlayer();

    var wrap = document.createElement("div");
    wrap.className = "lt-float";
    wrap.id = "lt-float";
    wrap.innerHTML = '<div class="lt-float-stage" id="lt-player-stage"></div>';
    layer.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      if (e.target.closest("#lt-player-stage")) return;
      ltCollapse();
    });

    ltApplyPrefsToStage();
    ltMountPlayer();
    ltStartSync();
  }

  function openListenTogether() {
    var creators = [];
    try {
      if (window.db && window.db.characters) creators = window.db.characters;
    } catch (e) {}

    if (creators.length === 0) {
      var html = '<div class="radio-modal-title">选择一起听的好友</div>' +
        '<div style="padding:20px 0;text-align:center;color:#8e8e93;font-size:14px;">还没有创建角色<br>先去微信里添加好友吧</div>' +
        '<div style="margin-top:8px;">' +
          '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>' +
        '</div>';
      showModal(html);
      var cancelBtn = $("#radio-modal-cancel");
      if (cancelBtn) cancelBtn.onclick = closeModal;
      return;
    }

    var html = '<div class="radio-modal-title">选择一起听的好友</div>' +
      '<div class="radio-song-menu" style="max-height:50vh;overflow-y:auto;">';
    for (var i = 0; i < creators.length; i++) {
      var c = creators[i];
      var displayName = c.remarkName || c.realName || "未知角色";
      var avStyle = "";
      if (c.avatar && String(c.avatar).indexOf("data:") === 0) {
        avStyle = "background-image:url(" + c.avatar + ");background-size:cover;background-position:center;";
      } else if (c.avatar) {
        avStyle = "background-image:url(" + esc(c.avatar) + ");background-size:cover;background-position:center;";
      } else {
        avStyle = "background:#4a4f5a;";
      }
      html += '<button class="radio-song-menu-item" data-lt-char="' + esc(c.id) + '" style="gap:12px;">' +
        '<span style="width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600;' + avStyle + '">' + esc(displayName.charAt(0)) + '</span>' +
        '<span>' + esc(displayName) + '</span>' +
      '</button>';
    }
    html += '</div>' +
      '<div style="margin-top:12px;">' +
        '<button class="radio-modal-btn radio-modal-btn-cancel" id="radio-modal-cancel" style="width:100%">取消</button>' +
      '</div>';

    showModal(html);

    var cancelBtn2 = $("#radio-modal-cancel");
    if (cancelBtn2) cancelBtn2.onclick = closeModal;

    var items = $$("[data-lt-char]", $("#radio-modals"));
    items.forEach(function (el) {
      el.onclick = function () {
        var charId = el.getAttribute("data-lt-char");
        var cr = creators.find(function (c) { return String(c.id) === String(charId); });
        closeModal();
        if (cr) startListenTogether(cr);
      };
    });
  }

  function startListenTogether(character) {
    var session = ltLoadSession();
    var displayName = character.remarkName || character.realName || "好友";
    var charImg = (character.avatar && String(character.avatar).indexOf("data:") === 0)
      ? character.avatar
      : (character.avatar || "");
    var userImg = character.myAvatar || "";
    var userName = character.myName || "我";
    if (session && session.charName === displayName) {
      charImg = session.charImage || charImg;
      userImg = session.userImage || userImg;
      userName = session.userName || userName;
    }

    ltState.active = true;
    ltState.collapsed = false;
    ltState.charId = character.id != null ? String(character.id) : "";
    ltState.charName = displayName;
    ltState.charImage = charImg;
    ltState.userName = userName;
    ltState.userImage = userImg;
    ltState.startTime = Date.now();

    var audio = getAudio();
    if (audio) audio.muted = false;

    ltSaveSession();
    ltUpdateEntryButtons();
    renderLtFloat();
  }

  function closeListenTogether() {
    ltState.active = false;
    ltState.collapsed = false;
    ltStopSync();
    ltDestroyPlayer();
    var floatEl = $("#lt-float");
    if (floatEl) floatEl.remove();
    var mini = $("#lt-mini");
    if (mini) mini.remove();
    try { localStorage.removeItem("radioListenTogether_start"); } catch (e) {}
    ltUpdateEntryButtons();
  }

  function getListenTogetherContext() {
    if (!ltState.active) return null;
    var song = playerState.currentSong;
    return {
      charId: ltState.charId,
      charName: ltState.charName,
      userName: ltState.userName,
      elapsed: ltGetElapsed(),
      playing: !!playerState.playing,
      song: song ? {
        title: ltSongTitle(song),
        artist: ltSongArtist(song),
        lyric: ltCurrentLyric(),
        position: ltAudioPosition(),
        duration: ltAudioDuration()
      } : null
    };
  }

  /* ===== 初始化 ===== */

  function init() {
    playlists = loadPlaylists();
    loadWallpaper();
    applyWallpaper();
    loadHomeStyle();
    applyHomeStyle();
    loadFontColors();
    applyFontColors();
    setupAudioEvents();
    setupTabEvents();
    switchTab("home");

    if (!playerState.currentSong) {
      var defaultSong = demoSongs[0];
      playerState.currentSong = defaultSong;
      playerState.currentSongId = String(defaultSong.id);
      playerState.playing = false;
      var audio = getAudio();
      audio.muted = true;
      audio.__currentSongId = playerState.currentSongId;
      audio.__songInfo = {
        title: defaultSong.title || "",
        artist: defaultSong.artist || "",
        cover: defaultSong.cover || "",
        type: "song",
        source: "demo"
      };
      renderHomeView();
    }
  }

  window.RadioApp = {
    init: init,
    getPlaylists: function () { return playlists; },
    getSongs: loadSongs,
    addSong: function (plId, song) {
      var songs = loadSongs(plId);
      if (songs.find(function (s) { return String(s.id) === String(song.id); })) return false;
      songs.push({
        id: song.id,
        title: song.title || song.name || "",
        artist: song.artist || song.artists || "",
        cover: song.cover || "",
        duration: song.duration || 0,
        type: "song",
        source: song.source || "",
        neteaseId: song.neteaseId || ""
      });
      saveSongs(plId, songs);
      return true;
    },
    removeSong: removeSong,
    FAV_ID: FAV_ID,
    UPL_ID: UPL_ID,
    getPlayerState: function () { return playerState; },
    playSong: playSong,
    playNext: playNext,
    playPrev: playPrev,
    getPlayMode: getPlayMode,
    setPlayMode: setPlayMode,
    togglePlayPause: togglePlayPause,
    openListenTogether: openListenTogether,
    getListenTogetherContext: getListenTogetherContext
  };

  document.addEventListener("DOMContentLoaded", function () {
    var screen = document.getElementById("radio-screen");
    if (screen && screen.classList.contains("active")) {
      init();
    }
  });

  var observer = new MutationObserver(function () {
    var screen = document.getElementById("radio-screen");
    if (screen && screen.classList.contains("active") && playlists.length === 0) {
      init();
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var screen = document.getElementById("radio-screen");
    if (screen) {
      observer.observe(screen, { attributes: true, attributeFilter: ["class"] });
    }
  });

})();
