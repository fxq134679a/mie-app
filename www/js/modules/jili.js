/* 叽哩叽哩 (jili) — UI 层
 * 依赖顺序：jili_core.js → jili_html.js → jili.js（均为全局 <script>，无模块）
 * 数据层 window.JiliCore 是唯一数据来源；本层只做渲染与交互。
 * 暴露 window.JiliApp = { reload, refresh, openPost, openLive, showTab, getState, busy }
 */
(function () {
  "use strict";

  var C = window.JiliCore;
  if (!C) return;

  var S = { state: C.load() };
  var busy = false;
  var TAB = "home";
  var HOME_SEG = "rec";
  var SPACE_SEG = "video";
  var SPACE_SORT = "new";       // new 最新发布 / hot 最多播放
  var LIST_MODE = "history";
  var INBOX_CAT = "reply";
  var feedAt = 0;
  var homeQ = "";
  var ui = {};
  var player = null;   // 视频播放器状态
  var liveP = null;    // 直播间状态
  var cmTab = "intro";
  var cmSort = "hot";       // 评论区排序：hot 按热度 / time 按时间
  var TITLE_OPEN = false;   // 标题是否展开
  var cmReplyTo = null; // {id, name}
  var CM_PHRASES = ["宫廷玉液酒，评论走一走", "说点想说的…", "一键三连支持一下UP主", "前方高能预警", "留个爪印再走~"];
  var CM_REGIONS = ["广东", "浙江", "江苏", "北京", "上海", "四川", "湖北", "山东", "河南", "福建"];
  var uploadDraft = null;
  var suppressClick = false;
  var WS_TAB = "mine";
  var SERIES_SEASON = {};   // 系列名 -> 当前查看的季
  var FILM_VIEW = "lib";    // lib 片库 / mine 我想看
  var FILM_KIND = "movie";  // movie 电影 / doc 纪录片
  var FILM_SORT = "day3";   // day3 三日榜 / day7 七日榜
  var filmCache = { movie: null, doc: null, at: 0 };
  var FILM_LAST = null;     // 最近渲染的影片详情（一起看入口用）
  var SCR = null;           // 一起看放映室状态
  var SCR_SEL = [];         // 放映室已选角色
  var SCR_TAB = "file";     // 放映源 tab
  var SCR_PRESET = null;    // 从影视页带进来的预设
  var JILI_TYPE_NAMES = { real: "真人主播", faceless: "不露脸", virtual: "虚拟主播", radio: "电台" };
  var REFRESHING = false;   // 刷新中标志（主区域显示加载动画）
  var JILI_AREA_NAMES = { chat: "聊天", looks: "颜值", virtual: "虚拟主播", ent: "娱乐", game: "游戏", music: "音乐", asmr: "助眠", food: "美食", life: "生活", knowledge: "知识", film: "影视", doc: "纪录片", anime: "动画" };
  function typeName(t) { return JILI_TYPE_NAMES[t] || t || ""; }
  function areaName(a) { return JILI_AREA_NAMES[a] || a || ""; }

  /* ================= 基础工具 ================= */

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
  function save() { try { C.save(S.state); } catch (e) { /* 存储失败忽略 */ } }
  function fmtN(n) { return C.formatCount(n); }
  function fmtD(s) { return C.formatDur(s); }
  function ago(t) { return C.relTime(t); }
  function fmtDateCN(t) {
    var d = new Date(t || Date.now());
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function lvBadge(likes) {
    var n = likes || 0;
    var lv = n >= 10000 ? 6 : n >= 5000 ? 5 : n >= 2000 ? 4 : n >= 500 ? 3 : n >= 50 ? 2 : 1;
    return '<span class="jlp-lv lv' + lv + '">LV' + lv + "</span>";
  }
  function cmRegion(name) { return CM_REGIONS[C.hash(String(name)) % CM_REGIONS.length]; }

  function creatorMap() {
    var m = {};
    (S.state.creators || []).forEach(function (c) { m[c.id] = c; });
    return m;
  }
  function postMap() {
    var m = {};
    (S.state.posts || []).forEach(function (p) { m[p.id] = p; });
    return m;
  }
  function creatorOf(id) { return creatorMap()[id] || null; }
  function postOf(id) { return postMap()[id] || null; }
  function roomOf(roomId) {
    var st = S.state;
    var list = st.liveRooms || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (String(r.id) === String(roomId) || String(r.creatorId) === String(roomId) || ("live:" + r.creatorId) === String(roomId)) return r;
    }
    return null;
  }
  function msgsOf(tid) {
    return (S.state.dmMessages || []).filter(function (m) { return m.threadId === tid; });
  }
  function isFollowed(cid) {
    return (S.state.following || []).some(function (x) { return String(x) === String(cid); });
  }

  function avHTML(o, size) {
    var name = (o && (o.name || o.userName)) || "?";
    var style = "width:" + size + "px;height:" + size + "px;flex:none;";
    if (o && o.avatarRef && String(o.avatarRef).indexOf("data:") === 0) {
      return '<span class="jl-av" style="' + style + "background-image:url(" + o.avatarRef + ')"></span>';
    }
    var col = o && o.id ? C.avatarColor(o.id) : C.avatarColor(name);
    return '<span class="jl-av" style="' + style + "background:" + col + '">' + esc(name.charAt(0)) + "</span>";
  }

  function coverStyle(seed) { return "background:" + C.seedCover(seed); }

  /* AI 调用包装：busy 保护 + 统一错误 toast */
  function aiRun(btn, fn) {
    if (busy) return Promise.resolve(undefined);
    busy = true;
    var old = null;
    if (btn) {
      old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="jl-spin"></span>';
    }
    return Promise.resolve()
      .then(fn)
      .catch(function (e) {
        var msg = (e && e.message) || "生成失败";
        toast(msg === "NO_API" ? "请先在设置中配置 API" : msg);
        return undefined;
      })
      .then(function (r) {
        busy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = old; }
        return r;
      });
  }

  /* ================= 覆盖层 / 弹层框架 ================= */

  function pushOv(id, html, z) {
    removeOv(id);
    var d = document.createElement("div");
    d.className = "jl-root";
    d.setAttribute("data-ov", id);
    d.style.cssText = "position:absolute;inset:0;z-index:" + (z || 34) +
      ";display:flex;flex-direction:column;background:var(--jl-ground,#f6f7f8);pointer-events:auto";
    d.innerHTML = html;
    ui.ov.appendChild(d);
    return d;
  }
  function ovEl(id) { return ui.ov.querySelector('[data-ov="' + id + '"]'); }
  function removeOv(id) {
    var d = ovEl(id);
    if (d) d.remove();
    return !!d;
  }
  function closeOv(id) {
    if (id === "post") stopPlayer();
    if (id === "live") stopLive();
    return removeOv(id);
  }
  function openModal(html) {
    ui.modals.innerHTML =
      '<div class="jl-scrim" data-jili-scrim="1"><div class="jl-sheet">' + html + "</div></div>";
  }
  function closeModal() { ui.modals.innerHTML = ""; }

  function titlebar(t, back) {
    var left = (back === "plain" || back === "gear")
      ? "<i></i>"
      : '<button class="jl-iconbtn" data-jili-action="back" aria-label="返回">‹</button>';
    var right = back === "gear"
      ? '<span class="r"><button class="jl-iconbtn jl-gearbtn" data-jili-action="openSettings" aria-label="设置">' + ICONS.gear + "</button></span>"
      : "<i></i>";
    return '<div class="jl-titlebar"><div class="jl-titlebar-in">' + left +
      '<span class="ttl jl-one">' + esc(t) + "</span>" + right + "</div></div>";
  }

  /* ================= Tabbar ================= */

  var ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l-8 8 8 8"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    thumbsup: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 11v9H4.5A1.5 1.5 0 0 1 3 18.5v-6A1.5 1.5 0 0 1 4.5 11H7zm0 0l4-7.2c1.8.2 2.8 1.3 2.5 3L13 10h5.4a2 2 0 0 1 2 2.4l-1.1 5.6a2 2 0 0 1-2 1.6H7"/></svg>',
    thumbsupS: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 11v9H4.5A1.5 1.5 0 0 1 3 18.5v-6A1.5 1.5 0 0 1 4.5 11H7zm0 0l4-7.2c1.8.2 2.8 1.3 2.5 3L13 10h5.4a2 2 0 0 1 2 2.4l-1.1 5.6a2 2 0 0 1-2 1.6H7"/></svg>',
    thumbsdown: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M17 13V4h2.5A1.5 1.5 0 0 1 21 5.5v6A1.5 1.5 0 0 1 19.5 13H17zm0 0l-4 7.2c-1.8-.2-2.8-1.3-2.5-3L11 14H5.6a2 2 0 0 1-2-2.4l1.1-5.6a2 2 0 0 1 2-1.6H17"/></svg>',
    coin: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="10.2" rx="4.6" ry="2.8"/><path d="M7.4 10.2v3.4c0 1.5 2 2.8 4.6 2.8s4.6-1.3 4.6-2.8v-3.4"/></svg>',
    forward: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5.5l6.5 5.5-6.5 5.5v-3.6C8 13.2 5 15 3.5 17.8 3.6 12 7.5 9.2 13 9V5.5z"/></svg>',
    tv: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="18" height="13" rx="3"/><path d="M8 3.5L12 6l4-2.5"/><path d="M7.5 11h5M7.5 14.5h8"/></svg>',
    vplay: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M10 9.2l5 2.8-5 2.8z" fill="currentColor" stroke="none"/></svg>',
    vdm: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="4.5" width="19" height="13" rx="3"/><path d="M7 9h10M7 12.5h6"/></svg>',
    vwatch: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9.5" cy="8" r="3.2"/><path d="M3 19c.7-3 3.2-4.8 6.5-4.8s5.8 1.8 6.5 4.8"/><circle cx="17" cy="9" r="2.4"/><path d="M16.7 14.2c2.3.4 4 1.9 4.6 4.3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>',
    follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8.6L7 21v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    broadcast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>',
    document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 14h2"/></svg>',
    lightning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };
  var TABS = [
    { id: "home", t: "首页" },
    { id: "follow", t: "关注" },
    { id: "plus" },
    { id: "msg", t: "讯息" },
    { id: "me", t: "我的" }
  ];

  function tabAction(act, id) {
    if (act === "plus") { (function () { var ev = document.createEvent("MouseEvents"); ev.initMouseEvent("click", true, true, window); })(); return; }
    showTab(act === "tab" ? id : "home");
  }

  function renderTabbar() {
    ui.tabbar.innerHTML = TABS.map(function (t) {
      if (t.id === "plus") {
        return '<button class="jili-tabitem" data-jili-action="plus" aria-label="发布"><span class="jili-plus">＋</span></button>';
      }
      return '<button class="jili-tabitem' + (TAB === t.id ? " on" : "") + '" data-jili-action="tab" data-id="' + t.id + '">' +
        ICONS[t.id] + "<span>" + t.t + "</span></button>";
    }).join("");

    var btns = ui.tabbar.querySelectorAll("[data-jili-action]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var act = b.getAttribute("data-jili-action");
          var id = b.getAttribute("data-id");
          if (act === "plus") { openChooser(); return; }
          if (act === "tab" && id) { showTab(id); return; }
        };
      })(btns[i]);
    }
  }

  function showTab(name) {
    if (["home", "follow", "msg", "me"].indexOf(name) < 0) return;
    TAB = name;
    renderTabbar();
    renderTab();
  }

  function renderTab() {
    if (TAB === "home") renderHome();
    else if (TAB === "follow") renderFollow();
    else if (TAB === "msg") renderMsg();
    else if (TAB === "me") renderMe();
  }

  function renderAll() { renderTabbar(); renderTab(); }

  /* ================= 首页 Kr ================= */

  var HOME_SEGS = [["rec", "推荐"], ["hot", "热门"], ["series", "追番"], ["film", "影视"]];

  /* 封面字排版：6 种封面样式按渲染顺序轮转，保证相邻卡片样式不同、分布均匀 */
  var CTH_SEQ = 0;
  function nextCoverStyle() {
    CTH_SEQ = (CTH_SEQ + 1) % 6;
    return "jili-cth s" + (CTH_SEQ + 1);
  }

  function videoCardHTML(p, cr) {
    return '<button class="jili-vcard" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
      '<span class="jili-cover" style="' + coverStyle(p.seed) + '">' +
        (p.coverText ? '<b class="' + nextCoverStyle() + '">' + esc(p.coverText) + "</b>" : "") +
        (p.durationSec ? '<i class="jili-cd">' + fmtD(p.durationSec) + "</i>" : "") +
        (p.fanOnly ? '<i class="jili-cx">充电专属</i>' : "") +
      "</span>" +
      '<span class="jili-vinfo"><b>' + esc(p.title) + "</b>" +
        '<span>' + esc(cr ? cr.name : "UP 主") + " · " + fmtN(p.play || 0) + "播放</span></span></button>";
  }

  function hotRowHTML(p, cr) {
    return '<button class="jl-row" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
      '<span class="jili-thumb" style="' + coverStyle(p.seed) + '">' +
        (p.durationSec ? '<i class="jili-cd">' + fmtD(p.durationSec) + "</i>" : "") +
        (p.fanOnly ? '<i class="jili-cx">充</i>' : "") + "</span>" +
      '<span class="jili-rowb"><b>' + esc(p.title) + "</b>" +
        '<span>' + esc(cr ? cr.name : "") + " · " + fmtN(p.play || 0) + "播放 · " + fmtN(p.danmaku || 0) + "弹幕</span>" +
        '<span>' + ago(p.at) + "</span></span></button>";
  }

  function liveStripHTML(st, cmap) {
    var rooms = (st.liveRooms || []).filter(function (r) { return cmap[r.creatorId]; });
    if (!rooms.length) return '<p class="jili-subhint">现在没人在直播，刷新看看</p>';
    return '<div class="jili-liverow">' + rooms.map(function (r) {
      var cr = cmap[r.creatorId];
      return '<button class="jili-livecard" data-jili-action="openLive" data-id="' + esc(r.id) + '" style="' + coverStyle(r.seed) + '">' +
        "<i>直播中</i><em>" + fmtN(r.viewers || 0) + "人</em><b>" + esc(cr.name) + " · " + esc(r.title || "") + "</b></button>";
    }).join("") + "</div>";
  }

  function homeHeaderHTML() {
    return '<div class="jl-homehead">' +
      '<div class="jl-searchrow" style="padding-left:4px">' +
        '<button data-jili-action="goMe" aria-label="我的" style="width:32px;height:32px;flex:none;padding:0;border:0;background:none">' +
          (S.state.userAvatar
            ? '<span class="jl-av" style="width:32px;height:32px;flex:none;background-image:url(' + S.state.userAvatar + ')"></span>'
            : '<span class="jl-av" style="width:32px;height:32px;flex:none;background:' + C.avatarColor("me") + '">' + esc((S.state.userName || "阿").charAt(0)) + "</span>") +
        '</button>' +
        '<label class="jl-search"><span class="jl-searchico">' + ICONS.search + '</span><input placeholder="搜索视频、UP 主" value="' + esc(homeQ) + '"/></label>' +
        '<button class="jl-refresh-ico" data-jili-action="refresh" aria-label="刷新" title="' + esc(feedAt ? "上次刷新：" + ago(feedAt) : "还没刷新过 · 点这里刷新") + '">' + ICONS.refresh + '</button>' +
      '</div>' +
      '<div class="jl-toptabs">' + HOME_SEGS.map(function (s) {
        return '<button class="' + (HOME_SEG === s[0] ? "on" : "") + '" data-jili-action="homeSeg" data-id="' + s[0] + '">' + s[1] + '</button>';
      }).join("") + '</div>' +
    '</div>';
  }

  function renderHome() {
    var st = S.state;
    var cmap = creatorMap();
    var allVideos = (st.posts || []).filter(function (p) { return p.kind === "video"; });
    var videos = homeQ ? allVideos.filter(function (p) {
      var q = homeQ.toLowerCase();
      var cr = cmap[p.creatorId];
      return (p.title || "").toLowerCase().indexOf(q) >= 0 || (cr && cr.name || "").toLowerCase().indexOf(q) >= 0;
    }) : allVideos;
    var body = "";

    if (REFRESHING) {
      body = '<div class="jl-refreshing"><div class="jl-refresh-anim"><div class="jl-refresh-tv"><span class="jl-refresh-scan"></span></div></div>' +
        '<p class="jl-refresh-txt">AI 正在生成内容…</p>' +
        '<p class="jl-refresh-sub">请来 UP 主、投稿和直播</p></div>';
      ui.main.innerHTML = homeHeaderHTML() + '<div class="jl-scroll with-tabbar">' + body + "</div>";
      bindHomeInput();
      return;
    }

    if (!feedAt) {
      body = '<div class="jl-empty"><p>' +
        "还没有内容。点「刷新」让 AI 生成视频和直播。</p>" +
        '<button class="jl-btn" data-jili-action="refresh">刷新</button></div>';
      ui.main.innerHTML = homeHeaderHTML() + '<div class="jl-scroll with-tabbar">' + body + "</div>";
      bindHomeInput();
      return;
    }

    if (!(st.creators || []).length) {
      body = '<div class="jl-empty"><p>' +
        "站里还没有 UP 主。点「刷新」，AI 会顺带请来一批主播，带着投稿和直播一起出现；也可以去主播工坊自己捏。</p>" +
        '<button class="jl-btn" data-jili-action="refresh">刷新</button>' +
        '<button class="jl-btn ghost" data-jili-action="openWorkshop">去主播工坊</button></div>';
      ui.main.innerHTML = homeHeaderHTML() + '<div class="jl-scroll with-tabbar">' + body + "</div>";
      bindHomeInput();
      return;
    }

    if (HOME_SEG === "rec") {
      body = '<div class="jl-sect"><div class="jl-secthead"><b>正在直播</b></div>' + liveStripHTML(st, cmap) + "</div>" +
        '<div class="jl-grid2">' + videos.map(function (p) { return videoCardHTML(p, cmap[p.creatorId]); }).join("") + "</div>";
    } else if (HOME_SEG === "hot") {
      var hot = videos.slice().sort(function (a, b) { return (b.play || 0) - (a.play || 0); });
      body = hot.map(function (p) { return hotRowHTML(p, cmap[p.creatorId]); }).join("") ||
        '<p class="jili-subhint">还没有视频，点「刷新」让 UP 主们投稿</p>';
    } else if (HOME_SEG === "series") {
      body = seriesGridHTML(cmap);
    } else {
      body = filmTabHTML();
    }

    ui.main.innerHTML = homeHeaderHTML() + '<div class="jl-scroll with-tabbar">' + body + "</div>";
    bindHomeInput();
  }

  /* ================= 影视（一起看 + 片库） ================= */

  var FILM_SORTS = [["day3", "三日榜"], ["day7", "七日榜"]];
  var FILM_TYPE = { movie: 2, doc: 3 };

  function wantsOf() {
    var st = S.state;
    st.bgms = st.bgms || {};
    st.bgms.wants = st.bgms.wants || [];
    return st.bgms.wants;
  }

  function isWanted(key) {
    return wantsOf().some(function (w) { return String(w.key) === String(key); });
  }

  function filmCardHTML(it) {
    var badge = it.badge ? '<i class="jlb-cardbadge">' + esc(it.badge) + "</i>" : "";
    var sub = it.newEpDesc || (it.score ? "评分 " + it.score : "");
    return '<button class="jlb-card" data-jili-action="filmDetail" data-id="' + esc(it.seasonId) + '">' +
      '<span class="jlb-poster"><img src="' + esc(it.cover) + '" alt="" loading="lazy"><em class="score">' + (it.score ? it.score.toFixed(1) : "") + "</em>" + badge + "</span>" +
      '<span class="jlb-name jl-one">' + esc(it.title) + "</span>" +
      '<span class="jlb-sub jl-one">' + esc(sub) + "</span></button>";
  }

  function filmTabHTML() {
    var st = S.state;
    var screenings = (st.screenings || []).slice().reverse();
    var wants = wantsOf();
    var libBusy = filmCache.loading;
    var lib = filmCache[FILM_KIND];
    var body = "";
    var recRows = screenings.length
      ? '<div class="jl-sect"><div class="jl-secthead"><b>最近放映</b><span>' + screenings.length + " 次</span></div>" +
        screenings.map(function (sc) {
          return '<button class="jl-row" data-jili-action="screenResume" data-id="' + esc(sc.id) + '">' +
            '<span class="jili-rowb"><b class="jl-one">' + esc(sc.title) + "</b>" +
            "<span>" + esc((sc.charNames || []).join("、")) + "</span>" +
            "<span>" + ago(sc.at) + " · 看了 " + Math.max(1, Math.round((sc.watchedSec || 0) / 60)) + " 分钟</span></span>" +
            '<i class="jili-go">›</i></button>';
        }).join("") + "</div>"
      : "";

    if (FILM_VIEW === "mine") {
      body = wants.length
        ? '<div class="jlb-grid">' + wants.map(function (w) {
            return '<button class="jlb-card" data-jili-action="filmDetail" data-id="' + esc(w.key) + '">' +
              '<span class="jlb-poster"><img src="' + esc(w.cover) + '" alt="" loading="lazy"><em class="score">' + (w.score ? Number(w.score).toFixed(1) : "") + "</em></span>" +
              '<span class="jlb-name jl-one">' + esc(w.title) + "</span>" +
              '<span class="jlb-sub jl-one">' + esc(w.sub || "") + "</span></button>";
          }).join("") + "</div>"
        : '<div class="jl-empty"><p>还没有想看的影片。去片库标记想看吧。</p></div>';
    } else if (libBusy) {
      body = '<div class="jl-empty"><p><i class="jl-spin"></i> 正在加载片库…</p></div>';
    } else if (lib && lib.error) {
      body = '<div class="jl-empty"><p>片库加载失败。</p><button class="jl-btn line sm" data-jili-action="filmReload">重新加载</button></div>';
    } else if (lib && lib.items) {
      body = '<div class="jlb-grid">' + lib.items.map(filmCardHTML).join("") + "</div>";
    } else {
      body = '<div class="jl-empty"><p>上滑加载片库。</p><button class="jl-btn line sm" data-jili-action="filmReload">加载</button></div>';
    }

    return recRows +
      '<div class="jlb-filmtab">' +
      '<button class="jl-btn block" data-jili-action="openScreen">🎬 发起一起看（本地视频 / 链接）</button>' +
      '<div class="jlb-bindrow"><input id="jili-film-link" placeholder="粘贴 B 站/YouTube/视频链接，和朋友一起看">' +
      '<button class="jl-btn sm" data-jili-action="filmOpen">打开</button></div>' +
      '<div class="jlb-views"><button class="' + (FILM_VIEW === "lib" ? "on" : "") + '" data-jili-action="filmView" data-id="lib">片库</button>' +
      '<button class="' + (FILM_VIEW === "mine" ? "on" : "") + '" data-jili-action="filmView" data-id="mine">我想看' +
      (wants.length ? "<i>" + wants.length + "</i>" : "") + "</button></div>" +
      (FILM_VIEW === "lib"
        ? '<div class="jlb-days"><button class="' + (FILM_KIND === "movie" ? "on" : "") + '" data-jili-action="filmKind" data-id="movie">电影</button>' +
          '<button class="' + (FILM_KIND === "doc" ? "on" : "") + '" data-jili-action="filmKind" data-id="doc">纪录片</button></div>' +
          '<div class="jlb-filters"><div class="jlb-orders">' + FILM_SORTS.map(function (s) {
            return '<button class="' + (FILM_SORT === s[0] ? "on" : "") + '" data-jili-action="filmSort" data-id="' + s[0] + '">' + s[1] + "</button>";
          }).join("") + "</div></div>"
        : "") +
      body + "</div>";
  }

  function loadFilmLib() {
    var key = FILM_KIND;
    if (filmCache[key] && filmCache.sort === FILM_SORT && Date.now() - filmCache.at < 30 * 60 * 1000) {
      renderHome();
      return;
    }
    filmCache.loading = true;
    renderHome();
    C.fetchBiliRank(FILM_TYPE[key], FILM_SORT === "day7" ? 7 : 3).then(function (items) {
      filmCache[key] = { items: items };
      filmCache.sort = FILM_SORT;
      filmCache.at = Date.now();
    }).catch(function () {
      filmCache[key] = { error: true };
    }).then(function () {
      filmCache.loading = false;
      renderHome();
    });
  }

  function openFilmDetail(key) {
    var want = wantsOf().find(function (w) { return String(w.key) === String(key); });
    var card = (filmCache.movie && filmCache.movie.items || []).concat((filmCache.doc && filmCache.doc.items) || [])
      .find(function (it) { return String(it.seasonId) === String(key); });
    var d = ovEl("film");
    var html = titlebar("影片详情") + '<div class="jl-scroll jlb-page"><div class="jlb-loading"><i class="jl-spin"></i> 加载中…</div></div>';
    if (d) d.innerHTML = html; else pushOv("film", html, 34);
    C.fetchPgcSeason("ss" + key).then(function (season) {
      renderFilmDetail(season, want || null, card || null);
    }).catch(function () {
      if (card || want) {
        renderFilmDetail({
          title: (card && card.title) || (want && want.title) || "未知影片",
          cover: (card && card.cover) || (want && want.cover) || "",
          score: (card && card.score) || (want && want.score) || 0,
          evaluate: "", styles: [], episodes: [], seasons: [],
          totalDesc: (card && card.newEpDesc) || ""
        }, want || null, card || null);
      } else {
        var dd = ovEl("film");
        if (dd) dd.innerHTML = titlebar("影片详情") + '<div class="jl-scroll jlb-page"><div class="jl-empty"><p>加载失败，请稍后再试。</p><button class="jl-btn line sm" data-jili-action="back">好的</button></div></div>';
      }
    });
  }

  function renderFilmDetail(s, want, card) {
    FILM_LAST = s;
    var link = s.seasonId ? "https://www.bilibili.com/bangumi/play/ss" + s.seasonId : (card && card.url) || "";
    var tags = (s.styles || []).slice(0, 6);
    var html = titlebar("影片详情") + '<div class="jl-scroll jlb-page">' +
      '<div class="jlb-hero"><span class="jlb-poster big">' +
      (s.cover ? '<img src="' + esc(s.cover) + '" alt="">' : "") + "</span>" +
      '<div class="jlb-heroinfo"><b class="jlb-title">' + esc(s.title) + "</b>" +
      (s.totalDesc ? '<span class="jlb-orig jl-one">' + esc(s.totalDesc) + "</span>" : "") +
      (s.score ? '<span class="jlb-score"><b>' + Number(s.score).toFixed(1) + "</b>" + (s.scoreCount ? "<span>" + fmtN(s.scoreCount) + " 人评分</span>" : "") + "</span>" : "") +
      (s.publishDate ? '<span class="jlb-meta">' + esc(s.publishDate) + "</span>" : "") +
      '<div class="jlb-heroacts">' +
      '<button class="jl-btn ' + (want ? "line" : "") + '" data-jili-action="filmWant" data-id="' + esc(s.seasonId) + '">' + (want ? "已想看" : "想看") + "</button>" +
      '<button class="jl-btn" data-jili-action="filmWatch" data-id="' + esc(s.seasonId) + '">一起看</button></div></div></div>' +
      (tags.length ? '<div class="jlb-tags">' + tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
      (s.evaluate ? '<p class="jlb-summary">' + esc(s.evaluate) + "</p>" : "") +
      (s.episodes && s.episodes.length ? '<div class="jlb-eps"><b class="jlb-head">选集</b><div class="jlb-eprows">' +
        s.episodes.map(function (e) {
          return '<button class="jlb-eprow" data-jili-action="filmEp" data-id="' + esc(e.bvid) + '">' +
            "<b>" + esc(e.index) + "</b><span class='jl-one'>" + esc(e.longTitle || e.index) + "</span>" +
            (e.badge ? "<i class='badge'>" + esc(e.badge) + "</i>" : "") + "</button>";
        }).join("") + "</div></div>" : "") +
      (link ? '<a class="jlb-link" href="' + esc(link) + '" target="_blank" rel="noopener">在 B 站打开 ↗</a>' : "") +
      '<p class="jlb-credit">资料来自哔哩哔哩</p></div>';
    var d = ovEl("film");
    if (d) d.innerHTML = html;
  }

  /* ================= 一起看放映室 ================= */

  function screenCharsHTML(sel) {
    var st = S.state;
    var chars = st.characters || [];
    if (!chars.length) return '<p class="jl-hint">聊天列表里还没有角色。</p>';
    return chars.map(function (ch) {
      var on = sel.indexOf(String(ch.id)) >= 0;
      var idx = on ? sel.indexOf(String(ch.id)) : -1;
      return '<button class="jl-crow" style="width:100%;text-align:left" data-jili-action="screenChar" data-id="' + esc(ch.id) + '" aria-pressed="' + on + '">' +
        avHTML({ name: ch.name, avatarRef: ch.avatar, id: ch.id }, 36) +
        '<span style="min-width:0"><b class="jl-one">' + esc(ch.name) + "</b></span>" +
        '<span class="jls-pick' + (on ? " on" : "") + '">' + (on && sel.length > 1 ? idx + 1 : (on ? "✓" : "")) + "</span></button>";
    }).join("");
  }

  function openScreenSetup(preset) {
    preset = preset || null;
    var st = S.state;
    SCR_SEL = [];
    var isPost = preset && preset.kind === "post";
    var srcTabs = preset ? "" :
      '<div class="jl-seg jls-seg">' +
      '<button class="on" data-jili-action="screenTab" data-id="file">本地视频</button>' +
      '<button data-jili-action="screenTab" data-id="link">视频链接</button></div>';
    var srcField = preset
      ? '<p class="jl-hint">本次放映：' + esc(preset.title || "") + "</p>"
      : '<div class="jl-field" data-src="file"><label>选择视频文件</label>' +
        '<input id="jili-screening-file" type="file" accept="video/*" style="height:auto;padding:8px">' +
        '<span class="jl-hint">只在本机播放，不会上传。</span></div>' +
        '<div class="jl-field" data-src="link" hidden><label>视频链接</label>' +
        '<input id="jili-screening-link" type="url" placeholder="https://（支持 B 站视频 BV 链接或直链 mp4）">' +
        '<span class="jl-hint">B 站 / YouTube 链接会内嵌播放器；mp4 直链直接播放。</span></div>';
    var titleField = preset ? "" :
      '<label class="jl-field">标题<input id="jili-screening-title" placeholder="这部片子叫什么（AI 会以此聊天）">' +
      '<span class="jl-hint">留空则自动使用文件名或链接标题。</span></label>';
    var html = titlebar(preset ? "一起看" : "一起看 · 新的放映") + '<div class="jl-scroll" style="background:var(--jl-card)">' +
      '<div style="padding:16px var(--jl-g) 24px">' +
      (preset && preset.resume ? '<div class="jl-genbox"><span>上次看到 ' + fmtD(preset.resume) + "，这次接着聊。</span></div>" : "") +
      srcTabs + srcField + titleField +
      '<div class="jl-field"><label>和谁一起看</label><span class="jl-hint">选 1-3 个角色，他们会边看边和你聊。</span>' +
      '<div id="jili-screening-chars">' + screenCharsHTML(SCR_SEL) + "</div></div>" +
      '<label class="jl-crow" style="grid-template-columns:1fr auto;cursor:pointer;margin-bottom:12px">' +
      "<span><b>看过这部</b><span style=\"display:block;line-height:1.5;margin-top:2px\">看过的话 TA 们可以说「等这段」，但不会主动剧透。</span></span>" +
      '<input id="jili-screening-seen" type="checkbox" style="width:20px;height:20px;accent-color:#ff6699"></label>' +
      '<button class="jl-btn block" data-jili-action="screenStart">开始放映</button>' +
      "</div></div>";
    var d = ovEl("scrsetup");
    if (d) d.innerHTML = html;
    else pushOv("scrsetup", html, 36);
    SCR_PRESET = preset;
  }

  function bvidOf(url) {
    var m = /bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i.exec(String(url || ""));
    return m ? m[1] : "";
  }

  function screenCollectStart() {
    var d = ovEl("scrsetup");
    if (!d) return null;
    var preset = SCR_PRESET;
    var chars = SCR_SEL.map(function (cid) {
      return (S.state.characters || []).find(function (c) { return String(c.id) === String(cid); });
    }).filter(Boolean);
    if (!chars.length) { toast("先选至少一位一起看的角色"); return null; }
    var seen = !!$("#jili-screening-seen", d).checked;
    var cfg;
    if (preset) {
      cfg = {
        kind: preset.kind, title: preset.title, author: preset.author || "", desc: preset.desc || "",
        durationSec: preset.durationSec || 0, post: preset.post || null, url: preset.url || "", bvid: preset.bvid || "",
        ytid: preset.ytid || "", seenBefore: seen, chars: chars, resume: preset.resume || 0
      };
      if (cfg.kind === "post" && cfg.post) {
        cfg.durationSec = cfg.post.durationSec || 0;
        cfg.author = cfg.post.byUserName || cfg.author;
      }
      return cfg;
    }
    var tab = SCR_TAB || "file";
    if (tab === "file") {
      var f = $("#jili-screening-file", d);
      if (!f || !f.files || !f.files[0]) { toast("先选一个视频文件"); return null; }
      var name = f.files[0].name.replace(/\.[^.]+$/, "");
      cfg = { kind: "file", file: f.files[0], title: ($("#jili-screening-title", d).value || "").trim() || name, seenBefore: seen, chars: chars };
    } else {
      var link = ($("#jili-screening-link", d).value || "").trim();
      var bv = bvidOf(link);
      var yt = ytIdOf(link);
      if (!link) { toast("先填视频链接"); return null; }
      if (bv) {
        cfg = { kind: "bilibili", bvid: bv, title: ($("#jili-screening-title", d).value || "").trim() || "B 站视频 " + bv, seenBefore: seen, chars: chars };
      } else if (yt) {
        cfg = { kind: "youtube", ytid: yt, title: ($("#jili-screening-title", d).value || "").trim() || "YouTube 视频", seenBefore: seen, chars: chars };
      } else {
        cfg = { kind: "url", url: link, title: ($("#jili-screening-title", d).value || "").trim() || link.slice(0, 40), seenBefore: seen, chars: chars };
      }
    }
    return cfg;
  }

  function openScreenRoom(cfg) {
    SCR = {
      cfg: cfg, time: 0, paused: true, timeUnknown: cfg.kind !== "post",
      msgs: [], scenes: [], lastCut: 0, lastAi: 0, lastTalk: 0, busy: false,
      startedAt: Date.now(), watched: 0, dmQueue: [], dmI: 0, danmakuOn: true
    };
    if (cfg.kind === "post") {
      var p = cfg.post;
      SCR.script = (p.script || []).map(function (l) { return { t: Number(l.t) || 0, text: String(l.text || ""), k: l.k || "desc" }; }).sort(function (a, b) { return a.t - b.t; });
      SCR.dms = (p.danmaku || []).map(function (d) { return { t: Number(d.t) || 0, text: String(d.text || "") }; }).sort(function (a, b) { return a.t - b.t; });
      SCR.cfg.durationSec = p.durationSec || (SCR.script.length ? SCR.script[SCR.script.length - 1].t + 15 : 120);
      SCR.timeUnknown = false;
      SCR.paused = false;
    } else if (cfg.kind === "youtube" || cfg.kind === "bilibili") {
      // 内嵌播放器读不到播放状态，按"已开始播放"处理，进度靠本页时钟与「⏱同步」
      SCR.paused = false;
    }
    var stage;
    if (cfg.kind === "bilibili") {
      stage = '<iframe class="jls-frame" src="https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(cfg.bvid) + '&autoplay=0&danmaku=0" allowfullscreen scrolling="no" frameborder="no"></iframe>';
    } else if (cfg.kind === "youtube") {
      stage = '<iframe class="jls-frame" src="https://www.youtube.com/embed/' + encodeURIComponent(cfg.ytid || "") + '" allowfullscreen frameborder="no"></iframe>';
    } else if (cfg.kind === "url") {
      stage = '<video class="jls-frame" src="' + esc(cfg.url) + '" controls playsinline></video>';
    } else if (cfg.kind === "file") {
      stage = '<video class="jls-frame" controls playsinline></video>';
    } else {
      stage = '<div class="jls-story"><div class="jls-capbox"><b class="jls-capttl jl-one">' + esc(cfg.title) + '</b><p id="jili-scr-cap"></p></div>' +
        '<div class="jl-dmlayer" id="jili-scr-dmlayer"></div></div>';
    }
    var avs = cfg.chars.slice(0, 3).map(function (ch) { return avHTML({ name: ch.name, avatarRef: ch.avatar, id: ch.id }, 32); }).join("");
    var html = '<div class="jls-room" data-ov="scrroom">' +
      '<div class="jls-stagecol">' + stage + "</div>" +
      '<div class="jls-side">' +
      '<div class="jlv-head"><button class="jlv-icon" data-jili-action="screenEnd" aria-label="结束">‹</button>' +
      '<div class="jlv-anchor" style="padding-right:12px"><span class="jls-avs">' + avs + "</span>" +
      '<div class="an"><b class="jl-one">' + esc(cfg.title) + "</b>" +
      '<span class="jl-one">和 ' + esc(cfg.chars.map(function (c) { return c.name; }).join("、")) + " 一起看</span></div></div>" +
      '<button class="jl-btn line sm" data-jili-action="screenPause" id="jili-scr-pause">暂停</button>' +
      '<button class="jlv-icon" data-jili-action="screenSync" id="jili-scr-syncbtn" aria-label="同步进度">⏱</button></div>' +
      '<div class="jlv-chatwrap"><div class="jlv-chat" id="jili-scr-chat"></div></div>' +
      '<div class="jlv-bottom"><div class="jlv-inp"><input id="jili-screening-say" placeholder="说点什么…" autocomplete="off">' +
      '<button class="jl-btn" data-jili-action="screenSend">发送</button></div></div>' +
      "</div></div>";
    var d = ovEl("scrsetup");
    if (d) { closeOv("scrsetup"); }
    pushOv("scrroom", html, 37);
    if (cfg.kind === "file") {
      var v = $("video.jls-frame", ovEl("scrroom"));
      if (v) { try { v.src = URL.createObjectURL(cfg.file); } catch (e) { } }
    }
    if (cfg.kind === "url") {
      var v2 = $("video.jls-frame", ovEl("scrroom"));
      if (v2) {
        v2.addEventListener("play", function () { setScrPaused(false); });
        v2.addEventListener("pause", function () { setScrPaused(true); });
        v2.addEventListener("timeupdate", function () { if (v2.currentTime > 0.5) { SCR.time = v2.currentTime; SCR.timeUnknown = false; } });
      }
    }
    if (cfg.kind === "bilibili") {
      SCR.timeUnknown = true;
    }
    scrSysLine("放映开始，" + cfg.chars.map(function (c) { return c.name; }).join("、") + " 坐到了你旁边。");
    renderScrChat();
    startScrClock();
  }

  function setScrPaused(paused) {
    if (!SCR) return;
    SCR.paused = paused;
    var b = $("#jili-scr-pause", ovEl("scrroom"));
    if (b) b.textContent = paused ? "播放" : "暂停";
    if (!paused) SCR.lastTalk = Date.now();
    if (paused && SCR && !SCR.busy) scrAsk("pause");
  }

  function scrSysLine(text) {
    if (!SCR) return;
    SCR.msgs.push({ from: "sys", text: text, at: Date.now() });
    renderScrChat();
  }

  function scrAsk(trigger, userText) {
    if (!SCR || SCR.busy) return;
    SCR.busy = true;
    SCR.lastAi = Date.now();
    var cfg = SCR.cfg;
    var lines = SCR.script
      ? SCR.script.filter(function (l) { return l.t <= SCR.time; }).slice(-30)
      : [];
    var dms = SCR.dms
      ? SCR.dms.filter(function (d) { return Math.abs(d.t - SCR.time) <= 45; }).slice(-14)
      : [];
    aiRun(null, function () {
      return C.ai.screeningRound(S.state, {
        chars: cfg.chars,
        source: { kind: cfg.kind, title: cfg.title, author: cfg.author, desc: cfg.desc, durationSec: cfg.durationSec },
        time: SCR.time, paused: SCR.paused, timeUnknown: SCR.timeUnknown,
        seenBefore: cfg.seenBefore,
        scenes: SCR.scenes, lines: lines, danmaku: dms,
        recent: SCR.msgs.filter(function (m) { return m.from !== "sys"; }).slice(-24).map(function (m) {
          return { from: m.from, charName: m.charName, text: m.text };
        }),
        userText: userText || "", trigger: userText ? "" : (trigger || "")
      });
    }).then(function (r) {
      if (!SCR) return;
      SCR.busy = false;
      if (r === undefined) return;
      (r.replies || []).forEach(function (rp) {
        SCR.msgs.push({ from: "them", charId: rp.charId, charName: rp.charName, text: rp.text, at: Date.now() });
      });
      (r.danmaku || []).forEach(function (t) {
        SCR.dmQueue.push(t);
      });
      SCR.lastTalk = Date.now();
      renderScrChat();
      flushScrDanmaku();
    });
  }

  function scrAddScene(t, text) {
    if (!SCR) return;
    var last = SCR.scenes[SCR.scenes.length - 1];
    if (last && last.text === text) return;
    SCR.scenes.push({ t: t, text: text });
    if (SCR.scenes.length > 8) SCR.scenes.shift();
  }

  function flushScrDanmaku() {
    if (!SCR || !SCR.danmakuOn) return;
    var layer = $("#jili-scr-dmlayer", ovEl("scrroom"));
    if (!layer) return;
    while (SCR.dmQueue.length) {
      var t = SCR.dmQueue.shift();
      if (!t) continue;
      spawnFlyDm(layer, { text: t, color: "", big: false });
    }
  }

  function spawnFlyDm(layer, item) {
    var el = document.createElement("span");
    el.className = "jl-flydm" + (item.big ? " big" : "");
    el.textContent = item.text;
    if (item.color) el.style.color = item.color;
    layer.appendChild(el);
    var w = el.offsetWidth + layer.offsetWidth;
    el.style.setProperty("--w", layer.offsetWidth + "px");
    setTimeout(function () { el.remove(); }, 8200);
  }

  function renderScrChat() {
    if (!SCR) return;
    var box = $("#jili-scr-chat", ovEl("scrroom"));
    if (!box) return;
    box.innerHTML = SCR.msgs.map(function (m) {
      if (m.from === "sys") return '<span class="jlv-line sys"><span>' + esc(m.text) + "</span></span>";
      if (m.from === "me") return '<span class="jlv-line me"><span>' + esc(m.text) + "</span></span>";
      return '<span class="jlv-line">' + avHTML({ name: m.charName, avatarRef: (SCR.cfg.chars.find(function (c) { return c.id === m.charId; }) || {}).avatar, id: m.charId }, 28) +
        '<div class="jlv-who"><b>' + esc(m.charName) + "</b><span>" + esc(m.text) + "</span></div></span>";
    }).join("");
    box.scrollTop = box.scrollHeight;
  }

  function startScrClock() {
    stopScrClock();
    SCR.timer = setInterval(function () {
      if (!SCR) { stopScrClock(); return; }
      var d = ovEl("scrroom");
      if (!d) { stopScrClock(); return; }
      var v = $("video.jls-frame", d);
      if (SCR.cfg.kind === "post") {
        if (!SCR.paused) {
          SCR.time += 0.25;
          if (SCR.time >= SCR.cfg.durationSec) { SCR.time = SCR.cfg.durationSec; setScrPaused(true); }
          var cap = $("#jili-scr-cap", d);
          var cur = null;
          for (var i = 0; i < SCR.script.length; i++) {
            if (SCR.script[i].t <= SCR.time) cur = SCR.script[i]; else break;
          }
          if (cap && cur) cap.textContent = cur.text;
          if (cur) scrAddScene(Math.round(SCR.time), cur.text);
          while (SCR.dmI < SCR.dms.length && SCR.dms[SCR.dmI].t <= SCR.time) {
            spawnFlyDm($("#jili-scr-dmlayer", d), SCR.dms[SCR.dmI]);
            SCR.dmI++;
          }
        }
        var cutAt = SCR.script.filter(function (l) { return l.t <= SCR.time; }).length;
        if (!SCR.paused && cutAt !== SCR.lastCut && Date.now() - SCR.lastAi > 45000) {
          var prev = SCR.lastCut;
          SCR.lastCut = cutAt;
          if (Math.abs(cutAt - prev) >= 2 && cutAt > 0) scrAsk("cut");
        }
      } else if (v) {
        if (!v.paused && v.currentTime > 0.5) { SCR.time = v.currentTime; SCR.timeUnknown = false; SCR.watched += 0.25; }
      } else if (SCR.cfg.kind === "youtube" || SCR.cfg.kind === "bilibili") {
        if (!SCR.paused) { SCR.time += 0.25; SCR.timeUnknown = false; SCR.watched += 0.25; }
      }
      if (!SCR.paused && !SCR.busy && Date.now() - Math.max(SCR.lastAi, SCR.lastTalk) > 120000) {
        scrAsk("timer");
      }
    }, 250);
  }

  function stopScrClock() {
    if (SCR && SCR.timer) { clearInterval(SCR.timer); SCR.timer = null; }
  }

  function endScreening() {
    if (!SCR) return;
    var cfg = SCR.cfg;
    var watchedSec = cfg.kind === "post" ? Math.round(SCR.time) : Math.round(SCR.watched);
    stopScrClock();
    if (cfg.kind === "file") {
      var v = $("video.jls-frame", ovEl("scrroom"));
      if (v) { try { URL.revokeObjectURL(v.src); } catch (e) { } }
    }
    var st = S.state;
    st.screenings = st.screenings || [];
    if (watchedSec > 30) {
      st.screenings.push({
        id: "sc_" + Date.now(),
        title: cfg.title,
        at: Date.now(),
        watchedSec: watchedSec,
        charIds: cfg.chars.map(function (c) { return c.id; }),
        charNames: cfg.chars.map(function (c) { return c.name; }),
        src: { kind: cfg.kind, title: cfg.title, author: cfg.author || "", desc: cfg.desc || "", durationSec: cfg.durationSec || 0, bvid: cfg.bvid || "", url: cfg.url || "", ytid: cfg.ytid || "", postId: cfg.post ? cfg.post.id : "" }
      });
      if (st.screenings.length > 12) st.screenings.shift();
      save();
    }
    SCR = null;
    closeOv("scrroom");
    if (TAB === "home" && HOME_SEG === "film") renderHome();
  }

  /* ================= 一起看/影视/开播 辅助 ================= */

  function scrSay() {
    if (!SCR) return;
    var inp = $("#jili-screening-say", ovEl("scrroom"));
    var text = inp && inp.value.trim();
    if (!text) return;
    if (inp) inp.value = "";
    SCR.msgs.push({ from: "me", text: text, at: Date.now() });
    SCR.lastTalk = Date.now();
    renderScrChat();
    scrAsk("", text);
  }

  function scrSync() {
    if (!SCR) return;
    var d = ovEl("scrroom");
    var v = d && $("video.jls-frame", d);
    if (v && v.currentTime > 0.5) { SCR.time = v.currentTime; SCR.timeUnknown = false; }
    else if (SCR.cfg.kind === "youtube" || SCR.cfg.kind === "bilibili") {
      var s = window.prompt("内嵌播放器读不到进度，输入当前播放到几分几秒（如 12:30 或 750）：", "");
      if (s == null) return;
      s = String(s).trim();
      if (!s) { toast("没有同步进度"); return; }
      var mm = /^(\d+):([0-5]?\d)$/.exec(s);
      var sec = mm ? (Number(mm[1]) * 60 + Number(mm[2])) : Number(s);
      if (!isFinite(sec) || sec < 0) { toast("没看懂这个时间"); return; }
      SCR.time = sec; SCR.timeUnknown = false;
    }
    toast("已把进度告诉 TA 们（" + fmtD(Math.round(SCR.time)) + "）");
  }

  function ytIdOf(url) {
    var m = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ""));
    return m ? m[1] : "";
  }

  function filmLinkOpen() {
    var inp = $("#jili-film-link");
    var link = inp && inp.value.trim();
    if (!link) { toast("先粘贴视频链接"); return; }
    if (inp) inp.value = "";
    var bv = bvidOf(link);
    var yt = ytIdOf(link);
    if (bv) openScreenSetup({ kind: "bilibili", bvid: bv, title: "B 站视频 " + bv });
    else if (yt) openScreenSetup({ kind: "youtube", ytid: yt, title: "YouTube 视频" });
    else openScreenSetup({ kind: "url", url: link, title: link.slice(0, 40) });
  }

  function filmWantToggle(key) {
    var st = S.state;
    var wants = wantsOf();
    var i = -1;
    for (var k = 0; k < wants.length; k++) if (String(wants[k].key) === String(key)) { i = k; break; }
    if (i >= 0) {
      wants.splice(i, 1);
      save();
      toast("已取消想看");
    } else {
      var lib = (filmCache.movie && filmCache.movie.items) || [];
      var lib2 = (filmCache.doc && filmCache.doc.items) || [];
      var card = lib.concat(lib2).filter(function (it) { return String(it.seasonId) === String(key); })[0] || null;
      var s = FILM_LAST || {};
      var title = (s && s.title) || (card && card.title) || "";
      if (!title) { toast("还没拿到影片信息"); return; }
      wants.push({ key: String(key), title: title, cover: (s && s.cover) || (card && card.cover) || "", score: (s && s.score) || (card && card.score) || 0, sub: (card && card.newEpDesc) || (s && s.totalDesc) || "" });
      save();
      toast("已加入「我想看」");
    }
    var d = ovEl("film");
    if (d) openFilmDetail(key);
  }

  function filmWatchStart(key) {
    var s = FILM_LAST && String(FILM_LAST.seasonId) === String(key) ? FILM_LAST : null;
    if (!s) { openFilmDetail(key); return; }
    var ep = (s.episodes || [])[0];
    if (!ep || !ep.bvid) { toast("没拿到选集信息，稍后再试"); return; }
    openScreenSetup({ kind: "bilibili", bvid: ep.bvid, title: s.title || "一起看", desc: s.evaluate || "" });
  }

  function filmEpWatch(bvid) {
    var s = FILM_LAST || {};
    if (!bvid) { toast("这一集没有链接"); return; }
    openScreenSetup({ kind: "bilibili", bvid: bvid, title: s.title || "一起看", desc: s.evaluate || "" });
  }

  function screenResume(id) {
    var sc = (S.state.screenings || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!sc || !sc.src) { toast("这场放映没有保存源"); return; }
    var p = sc.src;
    var preset = {
      kind: p.kind, title: p.title || sc.title, author: p.author || "", desc: p.desc || "",
      durationSec: p.durationSec || 0, bvid: p.bvid || "", url: p.url || "", ytid: p.ytid || "",
      post: p.postId ? postOf(p.postId) : null, resume: sc.watchedSec || 0
    };
    if (preset.kind === "post" && !preset.post) { toast("原视频已不存在"); return; }
    openScreenSetup(preset);
  }

  /* 同步微信角色到叽哩（jc_ 前缀；本地生成的角色保留） */
  function syncChars() {
    try {
      var list = (typeof db !== "undefined" && db.characters) || [];
      var st = S.state;
      var local = (st.characters || []).filter(function (c) { return String(c.id).indexOf("jc_") !== 0; });
      var synced = list.map(function (c) {
        return {
          id: "jc_" + c.id,
          name: c.remarkName || c.realName || "角色",
          persona: c.persona || "",
          worldInfo: "",
          avatar: c.avatar || ""
        };
      });
      st.characters = synced.concat(local);
      save();
    } catch (e) { /* 主库不可用时忽略 */ }
  }

  function meAsCreator() {
    var st = S.state;
    return {
      id: "me", name: st.userName || "我", type: "real", area: "chat",
      persona: st.userIntro || "", catchphrase: "", fanName: "",
      fans: Number(st.fans) || 0, avatarRef: st.userAvatar || "",
      looks: "", schedule: "", visual: { img: false, vid: false }
    };
  }

  /* ================= 开播控制台 ================= */

  function openStudio() {
    var st = S.state;
    var cur = (st.liveRooms || []).filter(function (r) { return r.creatorId === "me"; })[0] || {};
    var html = titlebar("开播控制台") + '<div class="jl-scroll">' +
      '<div class="jl-field"><label>直播标题</label><input id="jili-studio-title" value="' + esc(cur.title || "") + '" placeholder="今天播点什么"></div>' +
      '<div class="jl-field"><label>话题（可选）</label><input id="jili-studio-topic" value="' + esc(cur.topic || "") + '" placeholder="例如：聊聊最近看的番"></div>' +
      '<div class="jl-field"><label>画面来源</label><select id="jili-studio-source" style="width:100%">' +
      '<option value="chat"' + (cur.source === "chat" ? " selected" : "") + ">聊天画面（纯文字直播）</option>" +
      '<option value="camera"' + (cur.source === "camera" ? " selected" : "") + ">摄像头</option>" +
      '<option value="video"' + (cur.source === "video" ? " selected" : "") + '">放视频</option></select></div>' +
      '<p class="jl-hint">开播后观众会进场聊天、送礼；你发的每条消息他们都会接话。</p>' +
      '<div class="jili-btnrow"><button class="jl-btn big" data-jili-action="studioStart">' + (cur.id ? "开始直播" : "开播") + "</button></div></div>";
    var d = ovEl("studio");
    if (d) d.innerHTML = html;
    else pushOv("studio", html, 36);
  }

  function studioStart() {
    var st = S.state;
    var d = ovEl("studio");
    if (!d) return;
    var title = ($("#jili-studio-title", d).value || "").trim();
    if (!title) { toast("先起个直播标题"); return; }
    var topic = ($("#jili-studio-topic", d).value || "").trim();
    var srcSel = $("#jili-studio-source", d);
    var source = srcSel ? srcSel.value : "chat";
    var room = (st.liveRooms || []).filter(function (r) { return r.creatorId === "me"; })[0];
    if (room) {
      room.title = title;
      room.topic = topic;
      room.source = source;
      room.liveNow = true;
    } else {
      room = { id: "live_me", creatorId: "me", title: title, topic: topic, source: source, coverText: title.slice(0, 6), viewers: 0, popularity: 0, liveNow: true, seed: C.hash("me:" + title) };
      st.liveRooms = st.liveRooms || [];
      st.liveRooms.unshift(room);
    }
    save();
    closeOv("studio");
    openLive(room.id);
  }

  /* ================= 视频页弹幕/投币 ================= */

  function coinToggle() {
    if (!player) return;
    var p = player.post;
    if (p.coined) { toast("这个视频已经投过币啦"); return; }
    var st = S.state;
    if ((Number(st.jibi) || 0) < 1) { openRecharge(); return; }
    st.jibi = (Number(st.jibi) || 0) - 1;
    p.coined = true;
    p.coins = (p.coins || 0) + 1;
    save();
    updateActNums();
    toast("投币成功 · 叽币 " + (st.jibi || 0));
  }

  function sendVideoDm() {
    if (!player) return;
    var inp = $("#jili-dm-text", ovEl("post"));
    var text = inp && inp.value.trim();
    if (!text) return;
    if (inp) inp.value = "";
    var st = S.state;
    var p = player.post;
    var t = Math.round(player.time);
    st.danmaku = st.danmaku || [];
    st.danmaku.push({ postId: p.id, time: t, text: text, mode: "scroll", color: "", big: false, up: true, likes: 0 });
    p.danmakuCount = (p.danmakuCount || 0) + 1;
    save();
    var layer = $("#jili-dmlayer", ovEl("post"));
    if (layer && player.dmOn) {
      var s = st.settings;
      layer.style.opacity = s.dmOpacity == null ? 1 : s.dmOpacity;
      layer.style.setProperty("--dms", s.dmSize || 1);
      spawnDm(layer, { t: t, text: text, type: "fly" }, s);
    }
    if (st.settings.dmReactOn && !busy) {
      aiRun(null, function () { return C.ai.danmakuReact(st, p.id, t); });
    }
  }

  /* ================= 投稿反响 / 加好友 / 楼中楼 ================= */

  function applyReception(post, r) {
    var st = S.state;
    var p = postOf(post.id);
    if (!p) return;
    p.play = Math.max(p.play || 0, (r.stats && r.stats.play) || 0);
    p.likes = Math.max(p.likes || 0, (r.stats && r.stats.likes) || 0);
    p.coins = Math.max(p.coins || 0, (r.stats && r.stats.coins) || 0);
    p.favs = Math.max(p.favs || 0, (r.stats && r.stats.favs) || 0);
    var added = (r.danmaku || []).length;
    (r.danmaku || []).forEach(function (d) {
      st.danmaku.push({ postId: p.id, time: d.t, text: d.text, mode: "scroll", color: "", big: false, up: false, likes: 0 });
    });
    p.danmakuCount = (p.danmakuCount || 0) + added;
    if (r.script && r.script.length && !(p.script || []).length) {
      p.script = r.script;
      var scenes = [];
      for (var i = 0; i < r.script.length; i++) {
        var nextT = i + 1 < r.script.length ? r.script[i + 1].t : (p.durationSec || 60);
        scenes.push({ desc: r.script[i].text, dur: Math.max(1, Math.round(nextT - r.script[i].t)) });
      }
      p.scenes = scenes;
    }
    var have = {};
    (p.comments || []).forEach(function (c) { have[c.name + "|" + c.text] = 1; });
    (r.comments || []).forEach(function (c) {
      if (have[c.name + "|" + c.text]) return;
      have[c.name + "|" + c.text] = 1;
      p.comments.push(C.makeComment({ name: c.name, text: c.text, likes: c.likes || 0 }));
    });
    p.commentsCount = p.comments.length;
    (r.fanMail || []).forEach(function (m) {
      st.fanMail.push(C.makeFanMail({ fanName: m.name, postId: p.id, text: m.text }));
    });
    st.fans = (Number(st.fans) || 0) + (r.newFans || 0);
    save();
  }

  function addFriend(cid, btn) {
    var st = S.state;
    var cr = creatorOf(cid);
    if (!cr) return;
    if (cr.sourceCharId) { toast("已经是好友了"); return; }
    var tid = C.threadId(cid);
    var dmLines = (st.dmMessages || []).filter(function (m) { return m.threadId === tid; }).slice(-20)
      .map(function (m) { return (m.from === "me" ? (st.userName || "me") : cr.name) + ": " + m.text; });
    aiRun(btn, function () { return C.ai.creatorToChar(st, cr, dmLines); }).then(function (r) {
      if (r === undefined) return;
      var ch = { id: "jch_" + Date.now().toString(36), name: r.name, persona: r.persona, worldInfo: r.worldInfo || "", avatar: "" };
      st.characters = st.characters || [];
      st.characters.push(ch);
      cr.sourceCharId = ch.id;
      if (r.firstMessage) {
        st.dms = st.dms || [];
        var exists = st.dms.some(function (t) { return t.id === tid; });
        if (!exists) st.dms.push(C.makeDMThread({ id: tid, creatorId: cid, lastText: r.firstMessage }));
        st.dmMessages = st.dmMessages || [];
        st.dmMessages.push(C.makeDMMessage({ threadId: tid, from: "them", text: r.firstMessage, kind: "auto" }));
      }
      save();
      toast("「" + r.name + "」已成为你的好友");
      var sp = ovEl("space");
      if (sp) renderSpacePage(sp.getAttribute("data-cid"));
    });
  }

  function threadOpen(cid) {
    if (!player) return;
    var st = S.state;
    var p = postOf(player.post.id);
    var c = p && (p.comments || []).filter(function (x) { return String(x.id) === String(cid); })[0];
    if (!c) return;
    if (c.threaded) { toast("已经展开全部回复啦"); return; }
    aiRun(null, function () {
      return C.ai.threadReplies(st, p.id, { name: c.name, text: c.text, me: !!c.me, replies: c.replies || [] });
    }).then(function (r) {
      if (r === undefined) return;
      c.replies = (c.replies || []).concat((r.replies || []).map(function (x) {
        return { name: x.name, text: x.text, likes: x.likes || 0, replyTo: x.replyTo || "", up: !!x.up, charCreatorId: x.charCreatorId || "" };
      }));
      c.threaded = true;
      save();
      renderPostBody();
    });
  }

  /* ================= 追番（系列分组） ================= */

  function buildSeries() {
    var byS = {};
    (S.state.posts || []).forEach(function (p) {
      if (p.kind !== "video" || !p.series) return;
      var key = String(p.series);
      (byS[key] = byS[key] || []).push(p);
    });
    return Object.keys(byS).map(function (key) {
      var eps = byS[key].slice().sort(function (a, b) {
        return (a.season || 1) - (b.season || 1) || (a.episode || 0) - (b.episode || 0) || (a.at || 0) - (b.at || 0);
      });
      return { series: key, eps: eps, latest: eps[eps.length - 1] };
    }).sort(function (a, b) { return (b.latest.at || 0) - (a.latest.at || 0); });
  }

  function seriesGridHTML(cmap) {
    var groups = buildSeries();
    if (!groups.length) {
      return '<div class="jl-empty"><p>还没有连载。UP 主发系列视频后会出现在这里。</p></div>';
    }
    var watched = {};
    (S.state.history || []).forEach(function (h) { watched[h.id] = true; });
    return '<div class="jl-grid2">' + groups.map(function (g) {
      var last = g.latest;
      var cr = cmap[last.creatorId];
      var seasons = {};
      g.eps.forEach(function (p) { seasons[p.season || 1] = true; });
      var nSeasons = Object.keys(seasons).length;
      var lastEp = last.episode || g.eps.length;
      var updated = nSeasons > 1 ? "S" + (last.season || 1) + " 更至第 " + lastEp + " 集" : "更新至第 " + lastEp + " 集";
      return '<button class="jl-vcard" data-jili-action="openSeries" data-id="' + esc(g.series) + '">' +
        '<span class="jili-thumb" style="' + coverStyle(last.seed) + '">' +
        (nSeasons > 1 ? '<i class="jls2-badge">共 ' + nSeasons + " 季</i>" : "") +
        '<i class="jili-cd">共 ' + g.eps.length + " 集</i></span>" +
        '<span class="jl-vinfo"><b class="t jl-one">' + esc(g.series) + "</b>" +
        '<span class="u jl-one">' + esc(updated) + "</span>" +
        '<span class="u"><i class="jl-uptag">UP</i><span class="jl-one">' + esc(cr ? cr.name : "UP 主") + "</span></span></span></button>";
    }).join("") + "</div>";
  }

  function openSeriesPage(name) {
    var g = buildSeries().find(function (x) { return x.series === String(name); });
    if (!g) { toast("系列不存在"); return; }
    var st = S.state;
    var watched = {};
    (st.history || []).forEach(function (h) { watched[h.id] = true; });
    var seasons = [];
    g.eps.forEach(function (p) {
      var s = p.season || 1;
      if (seasons.indexOf(s) < 0) seasons.push(s);
    });
    seasons.sort(function (a, b) { return a - b; });
    var curSeason = SERIES_SEASON[g.series] || seasons[0];
    var eps = g.eps.filter(function (p) { return (p.season || 1) === curSeason; });
    var html = titlebar(g.series) +
      '<div class="jl-scroll jls2-page"><div class="jls2-head"><b>' + esc(g.series) + "</b>" +
      "<span>共 " + g.eps.length + " 集 · " + esc(((S.state.creators || []).find(function (c) { return c.id === g.latest.creatorId; }) || {}).name || "UP 主") + "</span></div>" +
      (seasons.length > 1 ? '<div class="jls2-seasons">' + seasons.map(function (s) {
        return '<button class="' + (s === curSeason ? "on" : "") + '" data-jili-action="seriesSeason" data-series="' + esc(g.series) + '" data-id="' + s + '">第 ' + s + " 季</button>";
      }).join("") + "</div>" : "") +
      '<div class="jls2-eps">' + eps.map(function (p) {
        var seen = watched[p.id] ? " seen" : "";
        return '<button class="jls2-ep' + seen + '" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
          "<b>第 " + (p.episode || eps.indexOf(p) + 1) + " 集</b>" +
          '<span class="jl-two">' + esc(p.epTitle || p.title) + "</span></button>";
      }).join("") + "</div></div>";
    var d = ovEl("series");
    if (d) d.innerHTML = html;
    else pushOv("series", html, 34);
  }

  function bindHomeInput() {
    var inp = $("input", ui.main);
    if (inp) {
      inp.addEventListener("input", function () {
        homeQ = inp.value.trim();
        renderHome();
      });
    }
    var segs = ui.main.querySelectorAll(".jl-toptabs button[data-jili-action='homeSeg']");
    for (var i = 0; i < segs.length; i++) {
      (function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          HOME_SEG = b.getAttribute("data-id");
          renderHome();
        };
      })(segs[i]);
    }
    var goMe = ui.main.querySelector("[data-jili-action='goMe']");
    if (goMe) {
      goMe.onclick = function (e) {
        e.stopPropagation();
        showTab("me");
      };
    }
  }

  /* ================= 关注页 ================= */

  function renderFollow() {
    var st = S.state;
    var cmap = creatorMap();
    var followIds = st.following || [];
    var posts = (st.posts || []).filter(function (p) {
      return followIds.some(function (id) { return String(p.creatorId) === String(id); });
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var body;
    if (!followIds.length) {
      body = '<div class="jl-empty"><p>还没关注任何 UP 主。去 UP 主空间点「关注」吧。</p></div>';
    } else {
      body = '<div class="jl-sect"><div class="jl-secthead"><b>我的关注</b><span>' + followIds.length + " 人</span></div>" +
        '<div class="jl-followgrid">' + followIds.map(function (id) {
          var cr = cmap[id];
          if (!cr) return "";
          return '<button class="jl-followcard" data-jili-action="openSpace" data-id="' + esc(id) + '">' +
            avHTML(cr, 56) +
            "<b>" + esc(cr.name) + "</b></button>";
        }).join("") + "</div></div>" +
        (posts.length ? posts.map(function (p) {
          var cr = cmap[p.creatorId];
          return '<div class="jili-feedcard">' +
            '<div class="jili-feedhead">' + avHTML(cr, 30) +
            '<b class="jl-one">' + esc(cr ? cr.name : "") + "</b><span>" + ago(p.at) + "</span></div>" +
            '<p class="jili-feedcap">' + (p.kind === "video" ? "投稿了视频" : "发表了动态") + "</p>" +
            (p.kind === "video" ? hotRowHTML(p, cr) : '<button class="jl-row" data-jili-action="openPost" data-id="' + esc(p.id) + '"><span class="jili-rowb"><b>动态</b><span>' + esc(p.text || p.title || "") + "</span></span></button>") +
            "</div>";
        }).join("") : '<div class="jl-empty"><p>关注的 UP 主还没有新动态</p></div>');
    }
    ui.main.innerHTML = titlebar("关注", "plain") + '<div class="jl-scroll with-tabbar">' + body + "</div>";
  }

  /* ================= 消息页 eo ================= */

  var QUICKS = [
    ["reply", "回复与@", "#3fbf7f"],
    ["like", "收到喜欢", "#f25d6f"],
    ["fan", "新增粉丝", "#00aeec"],
    ["notice", "系统通知", "#ff9f2e"]
  ];

  function unreadOf(cat) {
    return (S.state.inbox || []).filter(function (r) { return r.cat === cat && !r.read; }).length;
  }
  function badgeHTML(n) {
    return n > 0 ? '<b class="jl-num">' + (n > 99 ? "99+" : n) + "</b>" : "";
  }

  function dmPreview(m) {
    if (!m) return "";
    if (m.kind === "video") return "[视频] " + (m.meta && m.meta.title || "");
    if (m.kind === "live") return "[直播] " + (m.meta && m.meta.title || "");
    return m.text;
  }

  function renderMsg() {
    var st = S.state;
    var cmap = creatorMap();
    var quick = '<div class="jl-quick">' + QUICKS.map(function (q) {
      var n = q[0] === "notice"
        ? (st.notices || []).filter(function (x) { return !x.read; }).length
        : unreadOf(q[0]);
      var iconSvg = {
        reply: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fbf7f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
        like: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f25d6f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3z"/></svg>',
        fan: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00aeec" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
        notice: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9f2e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      };
      return '<button data-jili-action="openInbox" data-id="' + q[0] + '">' +
        '<span class="ic" style="background:#e8e8ed">' + (iconSvg[q[0]] || "") + "</span>" +
        "<span>" + q[1] + "</span>" + badgeHTML(n) + "</button>";
    }).join("") + "</div>";

    var mails = st.fanMail || [];
    var mailUnread = mails.filter(function (m) { return !m.read; }).length;
    var mailRow = '<button class="jili-dmrow" data-jili-action="openFanmail">' +
      '<span class="jl-fanmail-ic">✉</span>' +
      '<span class="jili-rowb"><b>粉丝私信</b><span>' + (mails.length ? esc(mails[mails.length - 1].name + "：" + mails[mails.length - 1].text) : "看完你视频的观众发来的私信") + "</span></span>" +
      badgeHTML(mailUnread) + "</button>";

    var dms = (st.dms || []).slice().sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.lastAt || 0) - (a.lastAt || 0);
    });
    var dmList = dms.map(function (t) {
      var cr = cmap[t.creatorId];
      if (!cr) return "";
      var msgs = msgsOf(t.threadId);
      var last = msgs[msgs.length - 1];
      return '<button class="jili-dmrow" data-jili-action="openDM" data-id="' + esc(t.creatorId) + '">' +
        avHTML(cr, 44) +
        '<span class="jili-rowb"><b>' + esc(cr.name) + (t.pinned ? " 📌" : "") + (t.muted ? " 🔕" : "") + "</b>" +
        "<span>" + esc(dmPreview(last) || "发条私信打个招呼吧") + "</span></span>" +
        '<span class="jili-dmside"><i>' + ago(t.lastAt) + "</i>" + badgeHTML(t.unread || 0) + "</span></button>";
    }).join("") || '<p class="jili-subhint">还没有私信。去 UP 主空间点「私信」开始聊吧。</p>';

    ui.main.innerHTML = titlebar("讯息", "plain") +
      '<div class="jl-scroll with-tabbar">' + quick + mailRow + '<div class="jl-dmlist">' + dmList + "</div></div>";
  }

  /* ================= 收件箱 / 通知 / 粉丝来信 ================= */

  var INBOX_SEGS = [["reply", "回复与@"], ["like", "收到喜欢"], ["fan", "新增粉丝"]];
  var IB_TEXT = {
    reply: { c: "回复了我的评论", v: "评论了我的视频", d: "评论了我的动态" },
    like: { c: "赞了我的评论", v: "赞了我的视频", d: "赞了我的动态" },
    fan: { c: "关注了我", v: "关注了我", d: "关注了我" }
  };

  function ibRowHTML(r, pmap) {
    var text = (IB_TEXT[r.cat] && IB_TEXT[r.cat][r.kind || "c"]) || "";
    var p = r.thumbPostId ? pmap[r.thumbPostId] : null;
    var followedBack = S.state.fanFollowBack && S.state.fanFollowBack[r.userId];
    return '<div class="jl-ib-row">' +
      avHTML({ id: r.userId || r.name, name: r.name }, 36) +
      '<span class="jl-ib-body"><span class="jl-ib-head"><b>' + esc(r.name) + "</b><span>" + esc(text) + "</span></span>" +
      (r.text ? '<span class="jl-ib-text">' + esc(r.text) + "</span>" : "") +
      (r.quote ? '<span class="jl-ib-quote">' + esc(r.quote) + "</span>" : "") +
      '<span class="jl-ib-meta">' + ago(r.at) + "</span></span>" +
      (p ? '<span class="jl-ib-thumb" style="' + coverStyle(p.seed) + '"></span>' : "") +
      (r.cat === "fan"
        ? (followedBack
          ? '<button class="jl-btn sm ghost" disabled>已互粉</button>'
          : '<button class="jl-btn sm" data-jili-action="ibFollow" data-id="' + esc(r.userId || r.name) + '">回关</button>')
        : "") +
      "</div>";
  }

  function openInboxPage(cat) {
    INBOX_CAT = cat === "notice" ? "reply" : cat;
    if (cat === "notice") return openNotices();
    var st = S.state;
    var pmap = postMap();
    (st.inbox || []).forEach(function (r) { if (r.cat === INBOX_CAT) r.read = true; });
    save();
    var rows = (st.inbox || []).filter(function (r) { return r.cat === INBOX_CAT; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var emptyTxt = { reply: "还没有人回复你。发条评论、投个稿，大家就会来找你聊", like: "还没有收到喜欢。投稿、发动态或写评论被点赞后会出现在这里", fan: "还没有新增粉丝" }[INBOX_CAT];
    var html = titlebar("消息中心") +
      '<div class="jili-segs">' + INBOX_SEGS.map(function (s) {
        return '<button class="' + (INBOX_CAT === s[0] ? "on" : "") + '" data-jili-action="inboxSeg" data-id="' + s[0] + '">' + s[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="jl-scroll" style="background:var(--jl-card,#fff)">' +
      (rows.length ? rows.map(function (r) { return ibRowHTML(r, pmap); }).join("") : '<div class="jl-empty"><p>' + emptyTxt + "</p></div>") +
      "</div>";
    pushOv("inbox", html, 38);
  }

  function openNotices() {
    var st = S.state;
    (st.notices || []).forEach(function (n) { n.read = true; });
    save();
    var rows = (st.notices || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var html = titlebar("系统通知") + '<div class="jl-scroll">' +
      (rows.length ? rows.map(function (n) {
        return '<button class="jili-dmrow"><span class="jl-fanmail-ic">📣</span>' +
          '<span class="jili-rowb"><b>' + esc(n.text) + "</b><span>" + ago(n.at) + "</span></span></button>";
      }).join("") : '<div class="jl-empty"><p>还没有通知</p></div>') + "</div>";
    pushOv("notices", html, 38);
  }

  function openFanmail() {
    var st = S.state;
    var mails = (st.fanMail || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var html = titlebar("粉丝私信") + '<div class="jl-scroll"><p class="jl-hint">看完你视频的观众发来的私信</p><div class="jl-dmlist">' +
      (mails.length ? mails.map(function (m) {
        return '<button class="jili-dmrow" data-jili-action="openFanmailDetail" data-id="' + esc(m.id) + '">' +
          avHTML({ id: m.creatorId || m.name, name: m.name }, 40) +
          '<span class="jili-rowb"><b>' + esc(m.name) + "</b><span>" + esc(m.text) + "</span></span>" +
          '<span class="jili-dmside"><i>' + ago(m.at) + "</i>" + (m.reply ? "" : badgeHTML(1)) + "</span></button>";
      }).join("") : '<div class="jl-empty"><p>还没有粉丝来信</p></div>') + "</div></div>";
    pushOv("fanmail", html, 40);
  }

  function openFanmailDetail(id) {
    var st = S.state;
    var m = (st.fanMail || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!m) return;
    m.read = true;
    save();
    var html = titlebar(esc(m.name)) +
      '<div class="jl-scroll"><div class="jl-chat">' +
      '<span class="jl-systip">看完你视频后发来的私信</span>' +
      '<div class="jl-msg">' + avHTML({ id: m.creatorId || m.name, name: m.name }, 30) + '<div class="b">' + esc(m.text) + "</div></div>" +
      (m.reply ? '<div class="jl-msg me"><div class="b">' + esc(m.reply) + "</div>" + avHTML({ name: st.userName || "我", avatarRef: st.userAvatar }, 30) + "</div>" : "") +
      "</div></div>" +
      '<div class="jl-composer"><input id="jili-fm-input" placeholder="回复…"><button class="jl-btn" data-jili-action="fmSend" data-id="' + esc(m.id) + '">发送</button></div>';
    var d = pushOv("fanmaildetail", html, 46);
    var inp = $("#jili-fm-input", d);
    if (inp) inp.focus();
  }

  /* ================= 私信会话 Zr ================= */

  function openDM(creatorId) {
    var st = S.state;
    var cr = creatorOf(creatorId);
    if (!cr) { toast("找不到这位 UP 主"); return; }
    var tid = C.threadId(cr.id);
    var th = (st.dms || []).filter(function (t) { return t.threadId === tid; })[0];
    if (th) { th.unread = 0; save(); }
    renderDMPage(cr.id);
  }

  function renderDMPage(cid) {
    var st = S.state;
    var cr = creatorOf(cid);
    if (!cr) return;
    var tid = C.threadId(cid);
    var msgs = msgsOf(tid);
    var th = (st.dms || []).filter(function (t) { return t.threadId === tid; })[0] || {};
    var followed = isFollowed(cid);
    var charged = !!C.chargedOf(st, cid);
    var chat = msgs.map(function (m, i) {
      var parts = [];
      if (i === 0 || (m.at || 0) - (msgs[i - 1].at || 0) > 300000) {
        parts.push('<span class="jl-dmtime">' + ago(m.at) + "</span>");
      }
      if (m.kind === "video" || m.kind === "live") {
        var meta = m.meta || {};
        var cardIn = '<span class="jili-dmcard-c" style="' + coverStyle(meta.seed || cid) + '"><i class="jili-cd">' + (m.kind === "live" ? "直播" : fmtD(meta.dur || meta.durationSec || 0)) + "</i></span><span class='ttl'>" + esc(meta.title || "") + "</span>";
        var card = meta.postId
          ? '<button class="jl-dmcard" data-jili-action="openPost" data-id="' + esc(meta.postId) + '">' + cardIn + "</button>"
          : '<span class="jl-dmcard">' + cardIn + "</span>";
        parts.push(m.from === "me"
          ? '<div class="jl-msg me"><div class="b">' + card + "</div>" + avHTML({ name: st.userName || "我", avatarRef: st.userAvatar }, 28) + "</div>"
          : '<div class="jl-msg">' + avHTML(cr, 28) + '<div class="b">' + card + "</div></div>");
      } else if (m.from === "me") {
        parts.push('<div class="jl-msg me"><div class="b">' + esc(m.text) + "</div>" + avHTML({ name: st.userName || "我", avatarRef: st.userAvatar }, 28) + "</div>");
      } else {
        parts.push('<div class="jl-msg">' + avHTML(cr, 28) + '<div class="b">' + esc(m.text) + "</div></div>");
      }
      return parts.join("");
    }).join("") +
      (liveP && liveP.dmTyping === cid ? '<span class="jl-typing">对方正在输入…</span>' : "");

    var html = '<div class="jl-titlebar"><div class="jl-titlebar-in">' +
      '<button class="jl-iconbtn" data-jili-action="back">‹</button><span class="ttl jl-one">' + esc(cr.name) + "</span><i></i></div></div>" +
      '<div class="jili-dmtop"><button class="jl-btn sm ghost" data-jili-action="dmSpace" data-id="' + esc(cid) + '">UP 主空间</button>' +
      '<button class="jl-btn sm ghost" data-jili-action="dmCharge" data-id="' + esc(cid) + '">' + (charged ? "已充电" : "充电") + "</button>" +
      '<button class="jl-btn sm ghost" data-jili-action="dmAsk" data-id="' + esc(cid) + '">让 TA 回复</button>' +
      '<button class="jl-btn sm ghost" data-jili-action="dmReroll" data-id="' + esc(cid) + '">重新回复</button></div>' +
      '<div class="jl-scroll" data-dmscroll="1">' + chat + "</div>" +
      '<div class="jl-composer"><input id="jili-dm-input" placeholder="发消息…"><button class="jl-btn" data-jili-action="dmSend" data-id="' + esc(cid) + '">发送</button></div>';

    var d = ovEl("dm");
    if (d) { d.innerHTML = html; }
    else { d = pushOv("dm", html, 45); }
    var sc = $('[data-dmscroll]', d);
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  function dmSendText(cid, text) {
    var st = S.state;
    text = String(text || "").trim();
    if (!text) return;
    var tid = C.threadId(cid);
    st.dmMessages = st.dmMessages || [];
    st.dmMessages.push({ threadId: tid, from: "me", text: text, at: Date.now() });
    touchThread(tid, cid);
    save();
    renderDMPage(cid);
    liveP = liveP || {};
    liveP.dmTyping = cid;
    renderDMPage(cid);
    aiRun(null, function () { return C.ai.dmReply(st, cid, text); }).then(function (r) {
      if (liveP) liveP.dmTyping = null;
      if (r !== undefined) save();
      var d = ovEl("dm");
      if (d) renderDMPage(cid);
    });
  }

  function touchThread(tid, cid) {
    var st = S.state;
    st.dms = st.dms || [];
    var th = st.dms.filter(function (t) { return t.threadId === tid; })[0];
    if (!th) { th = { threadId: tid, creatorId: cid, unread: 0, lastAt: 0, muted: false, pinned: false }; st.dms.push(th); }
    th.lastAt = Date.now();
  }

  /* ================= 我的页 ho ================= */

  function renderMe() {
    var st = S.state;
    var exp = st.exp || 0;
    var lv = C.levelOf(exp);
    var myPosts = (st.posts || []).filter(function (p) { return p.creatorId === "me"; });
    var stats = [
      ["动态", myPosts.length, "meDyn"],
      ["关注", (st.following || []).length, "goFollow"],
      ["充电中", (st.charged || []).filter(function (c) { return c.until > Date.now(); }).length, "meCharged"]
    ];
    var icons = [
      ["offline", ICONS.download, "离线缓存"],
      ["history", ICONS.clock, "历史记录"],
      ["favs", ICONS.star, "我的收藏"],
      ["later", ICONS.clock, "稍后再看"]
    ];
    var serv = [
      ["mylive", ICONS.broadcast, "我的直播"],
      ["manuscripts", ICONS.document, "稿件管理"],
      ["workshop", ICONS.sparkle, "主播工坊"],
      ["dynamic", ICONS.edit, "发动态"]
    ];
    var myServ = [
      ["wallet", ICONS.wallet, "我的钱包"],
      ["charge", ICONS.lightning, "我的充电"],
      ["settings", ICONS.gear, "设置"]
    ];
    var html = '<div class="jl-mehead"><div class="jl-meid">' + avHTML({ name: st.userName || "我", avatarRef: st.userAvatar }, 68) +
      '<div><div class="nm"><b>' + esc(st.userName || "我") + '</b><span class="jl-lv">LV' + lv + "</span>" +
      '<button class="jl-switchu" data-jili-action="switchUser">切换</button></div>' +
      '<div class="jl-coins"><span>叽币 <b>' + (st.jibi || 0).toLocaleString() + "</b></span><span>硬币 <b>" + (st.coin || 0) + "</b></span></div></div></div>" +
      '<div class="jl-stats">' + stats.map(function (s) {
        return '<button data-jili-action="' + s[2] + '"><b>' + s[1] + "</b><span>" + s[0] + "</span></button>";
      }).join("") + "</div>" +
      '<div class="jl-vipbar"><div><b>充电中心</b><p>给喜欢的 UP 主充电，解锁充电专属视频</p></div>' +
      '<button class="jl-btn" data-jili-action="rechargeOpen">充值</button></div>' +
      '<div class="jl-icongrid blue">' + icons.map(function (ic) {
        return '<button data-jili-action="openList" data-id="' + ic[0] + '"><span class="jl-ic-svg">' + ic[1] + "</span><span>" + ic[2] + "</span></button>";
      }).join("") + "</div>" +
      '<div class="jl-sect"><div class="jl-secthead"><b>创作中心</b><span>数据中心</span>' +
      '<button class="jl-btn sm" data-jili-action="openUpload">发布</button></div>' +
      '<div class="jl-earn"><div><p>创作激励 · 可提现</p><div class="v">¥ ' + Number(st.earnings || 0).toFixed(2) + "</div><p>今日已提 ¥0.00</p></div>" +
      '<button class="jl-btn sm" data-jili-action="withdraw">提现</button></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>我的服务</b></div>' +
      '<div class="jl-icongrid">' + serv.map(function (ic) {
        return '<button data-jili-action="' + ({ mylive: "myLive", manuscripts: "openManuscripts", workshop: "openWorkshop", dynamic: "openDynModal" }[ic[0]]) + '"><span class="jl-ic-svg">' + ic[1] + "</span><span>" + ic[2] + "</span></button>";
      }).join("") + "</div></div>" +
      '<div class="jl-sect"><div class="jl-secthead"><b>更多服务</b></div>' +
      '<div class="jl-icongrid">' + myServ.map(function (ic) {
        return '<button data-jili-action="' + ({ wallet: "openWallet", charge: "openChargePage", settings: "openSettings" }[ic[0]]) + '"><span class="jl-ic-svg">' + ic[1] + "</span><span>" + ic[2] + "</span></button>";
      }).join("") + "</div></div>";

    ui.main.innerHTML = titlebar("我的", "gear") + '<div class="jl-scroll with-tabbar">' + html + "</div>";
  }

  /* ================= 列表页 sm（历史/收藏/稍后） ================= */

  function openListPage(mode) {
    LIST_MODE = mode;
    renderListPage();
  }
  function renderListPage() {
    var st = S.state;
    var pmap = postMap();
    var titles = { history: "历史记录", favs: "我的收藏", later: "稍后再看" };
    var list = (st[LIST_MODE] || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var rows = list.map(function (it) {
      var p = pmap[it.id];
      if (!p) return "";
      var cr = creatorOf(p.creatorId);
      return '<div class="jl-lib-row"><button class="jl-row" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
        '<span class="jili-thumb" style="' + coverStyle(p.seed) + '">' + (p.durationSec ? '<i class="jili-cd">' + fmtD(p.durationSec) + "</i>" : "") + "</span>" +
        '<span class="jili-rowb"><b>' + esc(p.title) + "</b><span>" + esc(cr ? cr.name : "") + " · " + fmtN(p.play || 0) + "播放</span><span>" + ago(it.at) + "</span></span></button>" +
        '<button class="jl-iconbtn" data-jili-action="listDel" data-id="' + esc(it.id) + '">✕</button></div>';
    }).join("");
    var html = titlebar(titles[LIST_MODE] || "列表") + '<div class="jl-scroll">' +
      (rows || '<div class="jl-empty"><p>这里还是空的</p></div>') + "</div>";
    var d = ovEl("list");
    if (d) d.innerHTML = html;
    else pushOv("list", html, 34);
  }

  /* ================= UP 主空间 pc / Uu ================= */

  function openSpace(cid) {
    SPACE_SEG = "video";
    SPACE_SORT = "new";
    renderSpacePage(cid);
  }
  function renderSpacePage(cid) {
    var st = S.state;
    var cr = creatorOf(cid);
    if (!cr) { toast("找不到这位 UP 主"); return; }
    var followed = isFollowed(cid);
    var charged = !!C.chargedOf(st, cid);
    var posts = (st.posts || []).filter(function (p) { return String(p.creatorId) === String(cid); })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var vids = posts.filter(function (p) { return p.kind === "video"; });
    var dyns = posts.filter(function (p) { return p.kind === "dynamic"; });
    var room = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(cid); })[0];
    var likesSum = vids.reduce(function (s, p) { return s + (p.likes || 0); }, 0);
    var chargeCount = (st.charged || []).filter(function (c) { return String(c.creatorId) === String(cid); }).length;
    var lv = cr.fans >= 100000 ? 6 : cr.fans >= 20000 ? 5 : cr.fans >= 5000 ? 4 : cr.fans >= 1000 ? 3 : cr.fans >= 100 ? 2 : 1;
    var isYearly = cr.fans >= 1000;
    var bio = cr.persona || cr.catchphrase || "";
    var bioShort = bio.length > 40 ? bio.slice(0, 40) + "…" : bio;
    var ipLoc = cmRegion(cr.name);

    var body =
      '<div class="jlsp-banner" style="' + coverStyle("space:" + cr.id) + '">' +
        '<button class="jlsp-back" data-jili-action="back" aria-label="返回">‹</button>' +
        '<button class="jlsp-dm" data-jili-action="dmOpen" data-id="' + esc(cid) + '" aria-label="私信">✉</button>' +
      "</div>" +
      '<div class="jlsp-info">' +
        '<div class="jlsp-avrow">' +
          avHTML(cr, 80) +
          '<div class="jlsp-stats">' +
            '<span><b>' + fmtN(cr.fans || 0) + '</b>粉丝</span>' +
            '<span><b>' + fmtN(likesSum) + '</b>获赞</span>' +
            '<span><b>' + vids.length + '</b>投稿</span>' +
          "</div>" +
        "</div>" +
        '<div class="jlsp-btnrow">' +
          '<button class="jlsp-charge" data-jili-action="dmCharge" data-id="' + esc(cid) + '">' + (charged ? " 已充电" : "⚡ 充电") + "</button>" +
          '<button class="jlsp-follow' + (followed ? " off" : "") + '" data-jili-action="followToggle" data-id="' + esc(cid) + '">' + (followed ? "已关注" : "+ 关注") + "</button>" +
        "</div>" +
        '<div class="jlsp-name"><b>' + esc(cr.name) + "</b>" +
          '<span class="jlsp-lv lv' + lv + '">LV' + lv + "</span>" +
          (isYearly ? '<span class="jlsp-badge">年度大会员</span>' : "") +
        "</div>" +
        (bio ? '<div class="jlsp-bio">' + esc(bioShort) + (bio.length > 40 ? ' <a class="jlsp-biodet" data-jili-action="bioToggle">详情</a>' : "") + "</div>" : "") +
        '<div class="jlsp-ip">IP属地：' + esc(ipLoc) + "</div>" +
        (chargeCount ? '<div class="jlsp-chargebar"><span>⚡ 充电</span><span>' + chargeCount + "人充电</span></div>" : "") +
      "</div>" +
      '<div class="jlsp-tabs">' +
        '<button class="' + (SPACE_SEG === "home" ? "on" : "") + '" data-jili-action="spaceSeg" data-id="home">主页</button>' +
        '<button class="' + (SPACE_SEG === "dynamic" ? "on" : "") + '" data-jili-action="spaceSeg" data-id="dynamic">动态 ' + dyns.length + "</button>" +
        '<button class="' + (SPACE_SEG === "video" ? "on" : "") + '" data-jili-action="spaceSeg" data-id="video">投稿 ' + vids.length + "</button>" +
      "</div>" +
      '<div class="jlsp-scroll jl-scroll">';

    if (SPACE_SEG === "video") {
      var sorted = vids.slice().sort(SPACE_SORT === "hot"
        ? function (a, b) { return (b.play || 0) - (a.play || 0); }
        : function (a, b) { return (b.at || 0) - (a.at || 0); });
      body +=
        '<div class="jlsp-sub">' +
          '<button class="jlsp-playall" data-jili-action="spacePlayAll" data-id="' + esc(cid) + '">▶ 播放全部</button>' +
          '<button class="jlsp-sort" data-jili-action="spaceSort">' + (SPACE_SORT === "new" ? "最新发布" : "最多播放") + " ▾</button>" +
        "</div>" +
        '<div class="jlsp-list">' +
        (sorted.length ? sorted.map(function (p, i) {
          return '<div class="jlsp-vrow" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
            '<span class="jlsp-vcov" style="' + coverStyle(p.seed) + '">' +
              (p.coverText ? '<b class="jili-cth">' + esc(p.coverText) + "</b>" : "") +
              '<i class="jlsp-vcd">' + fmtD(p.durationSec || 0) + "</i>" +
              (i === 0 && p.lastWatchSec ? '<span class="jlsp-vlast">上次观看</span>' : "") +
            "</span>" +
            '<div class="jlsp-vcol">' +
              '<b class="jlsp-vtitle">' + esc(p.title) + "</b>" +
              '<div class="jlsp-vmeta"><span>' + ago(p.at) + "</span><span>▷ " + fmtN(p.play || 0) + "</span><span>💬 " + (p.comments || []).length + "</span></div>" +
            "</div>" +
            '<button class="jlsp-vmenu" data-jili-action="vFav" data-id="' + esc(p.id) + '" aria-label="收藏">⋮</button>' +
          "</div>";
        }).join("") : '<div class="jl-empty"><p>还没有投稿，刷新首页看看</p></div>') +
        "</div>";
    } else if (SPACE_SEG === "dynamic") {
      body += (dyns.length ? dyns.map(function (p) {
        return '<div class="jlsp-dyn"><div class="jlsp-dynhead">' + avHTML(cr, 28) + "<b>" + esc(cr.name) + "</b><span>" + ago(p.at) + "</span></div><p>" + esc(p.text || p.title || "") + "</p></div>";
      }).join("") : '<div class="jl-empty"><p>还没有动态</p></div>');
    } else {
      body +=
        '<div class="jlsp-home">' +
          '<div class="jlsp-homecard"><b>关于 ' + esc(cr.name) + "</b>" +
            (bio ? "<p>" + esc(bio) + "</p>" : "") +
            (cr.catchphrase ? '<div class="jlsp-homeq">「' + esc(cr.catchphrase) + '」</div>' : "") +
            (cr.schedule ? '<div class="jlsp-homesch">📅 ' + esc(cr.schedule) + "</div>" : "") +
            (cr.fanName ? '<div class="jlsp-homefan">粉丝名：' + esc(cr.fanName) + '</div>' : '') +
          "</div>" +
          (chargeCount ? '<div class="jlsp-chargebar"><span> 充电</span><span>' + chargeCount + "人充电</span></div>" : "") +
          (room ? '<button class="jlsp-liverow" data-jili-action="openLive" data-id="' + esc(room.id) + '"><span class="jlsp-livebadge">直播中</span><span class="jlsp-livetitle">' + esc(room.title || "直播") + "</span><span>›</span></button>" : "") +
        "</div>";
    }
    body += "</div>";

    var html = body;
    var d = ovEl("space");
    if (d) { d.setAttribute("data-cid", cid); d.innerHTML = html; }
    else { d = pushOv("space", html, 36); d.setAttribute("data-cid", cid); }
    d.className = "jl-root jili-spaceov";
    d.style.background = "#111";
  }

  /* ================= 稿件管理 Pu / 主播工坊 vc ================= */

  function myPosts() {
    var st = S.state;
    return (st.posts || []).filter(function (p) { return p.creatorId === "me"; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  function openManuscripts() {
    var rows = myPosts().map(function (p) {
      return '<div class="jl-lib-row"><button class="jl-row" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
        '<span class="jili-thumb" style="' + coverStyle(p.seed) + '"></span>' +
        '<span class="jili-rowb"><b>' + esc(p.title) + "</b><span>" + (p.kind === "video" ? "视频" : "动态") + " · " + fmtN(p.play || 0) + "播放</span><span>" + ago(p.at) + "</span></span></button>" +
        '<button class="jl-iconbtn" data-jili-action="postDelete" data-id="' + esc(p.id) + '">🗑</button></div>';
    }).join("");
    var html = titlebar("稿件管理") + '<div class="jl-scroll">' +
      (rows || '<div class="jl-empty"><p>还没有稿件，去「发布」投个稿吧</p></div>') + "</div>";
    var d = ovEl("manuscripts");
    if (d) d.innerHTML = html;
    else pushOv("manuscripts", html, 36);
  }

  /* ================= 主播工坊（三页签） ================= */

  var WS_TABS = [["mine", "我的主播"], ["make", "手动捏"], ["chars", "角色"]];

  function openWorkshop(tab) {
    if (tab) WS_TAB = tab;
    var head = '<div class="jili-segs ws-tabs">' + WS_TABS.map(function (t) {
      return '<button data-jili-action="wsTab" data-id="' + t[0] + '" class="' + (WS_TAB === t[0] ? "on" : "") + '">' + t[1] + "</button>";
    }).join("") + "</div>";
    var body = WS_TAB === "make" ? wsMakeHTML() : WS_TAB === "chars" ? wsCharsHTML() : wsMineHTML();
    var html = titlebar("主播工坊") + head + '<div class="jl-scroll">' + body + "</div>";
    var d = ovEl("workshop");
    if (d) d.innerHTML = html;
    else pushOv("workshop", html, 36);
  }

  function wsMineHTML() {
    var st = S.state;
    var rows = (st.creators || []).map(function (cr) {
      return '<div class="jl-lib-row"><button class="jl-row" data-jili-action="openSpace" data-id="' + esc(cr.id) + '">' +
        avHTML(cr, 52) +
        '<span class="jili-rowb"><b>' + esc(cr.name) + "</b><span>" + fmtN(cr.fans || 0) + " 粉丝 · " + typeName(cr.type) + (cr.area ? " · " + areaName(cr.area) : "") + "</span><span>" + esc(cr.persona || "") + "</span></span></button>" +
        '<button class="jl-btn sm ghost" data-jili-action="creatorEdit" data-id="' + esc(cr.id) + '">编辑</button>' +
        '<button class="jl-iconbtn" data-jili-action="creatorDelete" data-id="' + esc(cr.id) + '">🗑</button></div>';
    }).join("");
    return rows || '<div class="jl-empty"><p>站里还没有 UP 主。点「刷新」，AI 会顺带请来一批主播，带着投稿和直播一起出现；也可以去主播工坊自己捏，或让角色成为 UP 主。</p></div>';
  }

  function wsMakeHTML() {
    var typeChips = ["real", "faceless", "virtual", "radio"].map(function (t, i) {
      return '<button class="ws-type' + (i === 0 ? " on" : "") + '" data-jili-action="wsType" data-id="' + t + '">' + typeName(t) + "</button>";
    }).join("");
    var areaOpts = Object.keys(JILI_AREA_NAMES).map(function (a) {
      return '<option value="' + a + '">' + JILI_AREA_NAMES[a] + "</option>";
    }).join("");
    return '<div class="ws-form"><div class="jl-field"><label>名字</label><input id="jili-ws-name" placeholder="给主播起个名字"></div>' +
      '<div class="jl-field"><label>类型</label><div class="jl-chips">' + typeChips + "</div></div>" +
      '<div class="jl-field"><label>画面来源（可以都开）</label><div class="jl-chips">' +
      '<button class="ws-src" data-jili-action="wsSrc" data-id="img">生图</button>' +
      '<button class="ws-src" data-jili-action="wsSrc" data-id="vid">生成视频</button></div>' +
      '<p class="jl-hint">都不开 = 只用封面和字幕，不花钱。开了之后直播间才会出现对应按钮，每次都要你自己点。</p></div>' +
      '<div class="jl-field"><label>分区</label><select id="jili-ws-area">' + areaOpts + "</select></div>" +
      '<div class="jl-field"><label>UP 主人设 / 直播风格</label><textarea id="jili-ws-persona" rows="3" placeholder="TA 是个怎样的人，直播是什么风格…"></textarea></div>' +
      '<div class="jl-field"><label>口头禅</label><input id="jili-ws-catch" placeholder="例如：大家好呀～"></div>' +
      '<div class="jl-field"><label>粉丝名</label><input id="jili-ws-fanname" placeholder="粉丝群体叫什么"></div>' +
      '<div class="jl-field"><label>外观提示词（生图 / 视频用，建议英文）</label><textarea id="jili-ws-looks" rows="2" placeholder="English description of face, hair, outfit, room…"></textarea></div>' +
      '<div class="jl-field"><label>开播时间</label><input id="jili-ws-sched" placeholder="例如：每周二、五 20:00"></div>' +
      '<div class="jl-field"><label>粉丝数</label><input id="jili-ws-fans" type="number" min="0" value="1000"></div>' +
      '<div class="jili-btnrow"><button class="jl-btn big" data-jili-action="wsSave">保存主播</button></div></div>';
  }

  function wsCharsHTML() {
    var st = S.state;
    var list = st.characters || [];
    if (!list.length) return '<div class="jl-empty"><p>聊天列表里还没有角色</p></div>';
    var rows = list.map(function (ch) {
      var isUp = (st.creators || []).some(function (c) { return c.sourceCharId && String(c.sourceCharId) === String(ch.id); });
      var act = isUp
        ? '<span class="ws-uptag">已是 UP 主</span>'
        : '<button class="jl-btn sm" data-jili-action="wsCharUp" data-id="' + esc(ch.id) + '">让 TA 成为 UP 主</button>';
      return '<div class="jl-lib-row"><div class="jl-row">' +
        avHTML({ name: ch.name, avatarRef: ch.avatar, id: ch.id }, 48) +
        '<span class="jili-rowb"><b>' + esc(ch.name) + "</b><span>" + esc(ch.persona || "") + "</span></span></div>" + act + "</div>";
    }).join("");
    return '<p class="jl-hint ws-hint">让角色成为 UP 主：AI 按 TA 的人设写出站内身份，之后刷新时会按人设和近期剧情判断 TA 在不在直播。</p>' + rows;
  }

  function openCreatorEditor(cid) {
    var cr = creatorOf(cid);
    if (!cr) return;
    var html = titlebar("编辑 UP 主") + '<div class="jl-scroll"><div class="jl-field"><label>名字</label><input id="jili-cr-name" value="' + esc(cr.name) + '"></div>' +
      '<div class="jl-field"><label>UP 主人设 / 直播风格</label><textarea id="jili-cr-persona" rows="3">' + esc(cr.persona || "") + "</textarea></div>" +
      '<div class="jl-field"><label>口头禅</label><input id="jili-cr-catch" value="' + esc(cr.catchphrase || "") + '"></div>' +
      '<div class="jl-field"><label>粉丝名</label><input id="jili-cr-fanname" value="' + esc(cr.fanName || "") + '"></div>' +
      '<div class="jl-field"><label>分区</label><select id="jili-cr-area">' +
      Object.keys(JILI_AREA_NAMES).map(function (a) {
        return '<option value="' + a + '"' + (cr.area === a ? " selected" : "") + ">" + JILI_AREA_NAMES[a] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="jl-field"><label>开播时间</label><input id="jili-cr-sched" value="' + esc(cr.schedule || "") + '" placeholder="例如：每周二、五 20:00"></div>' +
      '<div class="jili-btnrow"><button class="jl-btn" data-jili-action="creatorSave" data-id="' + esc(cid) + '">保存修改</button>' +
      '<button class="jl-btn ghost" data-jili-action="back">取消</button></div></div>';
    var d = ovEl("creditor");
    if (d) d.innerHTML = html;
    else pushOv("creditor", html, 40);
  }

  /* ================= 设置页 jm ================= */

  function openSettings() {
    var st = S.state;
    function cb(key, label, desc) {
      return '<label class="jl-crow" style="grid-template-columns:1fr auto"><span><b>' + label + "</b>" +
        (desc ? "<span>" + desc + "</span>" : "") + "</span>" +
        '<input id="jili-setting-' + key + '" type="checkbox" ' + (st.settings[key] ? "checked" : "") +
        ' style="width:20px;height:20px;accent-color:#ff6699"></label>';
    }
    var gfx = st.settings.giftFx || "all";
    var profileAv = '<span id="jili-setting-avatar-prev" class="jl-av" style="width:48px;height:48px;flex:none;' +
      (st.userAvatar ? "background-image:url(" + st.userAvatar + ")" : "background:" + C.avatarColor(st.userName || "我")) + '">' +
      (st.userAvatar ? "" : esc((st.userName || "我").charAt(0))) + "</span>";
    var html = titlebar("设置") + '<div class="jl-scroll">' +
      '<div class="jl-sect"><div class="jl-secthead"><b>我的资料</b></div>' +
      '<div class="jl-crow" style="grid-template-columns:auto 1fr auto;align-items:center;gap:10px">' +
      profileAv +
      '<div class="jl-field" style="margin:0"><label>昵称</label><input id="jili-setting-username" value="' + esc(st.userName || "") + '" placeholder="给自己起个昵称"></div>' +
      '<button class="jl-btn sm" data-jili-action="avatarPick">换头像</button></div>' +
      '<input type="file" id="jili-setting-avatar-file" accept="image/*" style="display:none">' +
      '<div class="jili-btnrow"><button class="jl-btn sm" data-jili-action="saveProfile">保存资料</button></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>世界观</b><span class="jl-hint">' + (st.worldview ? "已生成" : "未生成") + "</span></div>" +
      '<p class="jl-hint">描述这个小镇和 UP 主们的背景设定，AI 会按它来生成内容。</p>' +
      '<div class="jl-field"><textarea id="jili-setting-world" rows="5">' + esc(st.worldview || "") + "</textarea></div>" +
      '<div class="jili-btnrow"><button class="jl-btn sm" data-jili-action="worldDraft">AI 起草</button>' +
      '<button class="jl-btn sm ghost" data-jili-action="worldClear">清空</button></div>' +
      '<p class="jl-hint">AI 起草会调用一次 API。</p></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>AI 接口</b></div>' +
      '<p class="jl-hint">配置 AI 服务的 API Key 和端点。</p>' +
      '<div class="jl-field"><label>API Key</label><input id="jili-setting-apikey" type="password" value="' + esc(st.settings.apiKey || "") + '" placeholder="sk-..."></div>' +
      '<div class="jl-field"><label>API 端点</label><input id="jili-setting-apiurl" value="' + esc(st.settings.apiUrl || "") + '" placeholder="https://api.openai.com/v1"></div>' +
      '<div class="jl-field"><label>模型</label><input id="jili-setting-model" value="' + esc(st.settings.model || "") + '" placeholder="gpt-4"></div>' +
      '<div class="jili-btnrow"><button class="jl-btn sm" data-jili-action="saveApiSettings">保存</button>' +
      '<button class="jl-btn sm ghost" data-jili-action="testApi">测试连接</button></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>名册角色上网</b></div>' +
      cb("charOnline", "允许角色自动上网", "角色会浏览网页并分享见闻") +
      '<p class="jl-hint">开启后，角色会定期上网冲浪，回来后会发动态分享。</p></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>角色分享</b></div>' +
      cb("charShare", "允许角色分享到外部", "角色内容可以分享到其他平台") +
      '<p class="jl-hint">开启后，可以将角色的视频或动态分享到社交媒体。</p></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>直播间设置</b></div>' +
      cb("autoRenew", "自动续播", "直播结束后自动开始下一场") +
      cb("giftFxOn", "礼物特效", "观众送礼物时显示特效") +
      cb("danmakuReact", "发弹幕后观众接话", "你发弹幕后 UP 主会回应") +
      cb("autoCover", "自动生成封面", "投稿自动配上 AI 封面文案") +
      cb("generateCreators", "刷新时生成新 UP 主", "刷新首页时 AI 可以引入新主播") +
      cb("autoSceneImg", "特殊情节自动配图", "视频中出现特殊情节时自动生成配图") +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>生成画面数量</b><span>每次生成几张配图</span></span>' +
      '<select id="jili-setting-sceneCount" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px">' +
      '<option value="1"' + (st.settings.sceneCount === 1 ? " selected" : "") + '>1 张</option>' +
      '<option value="2"' + (!st.settings.sceneCount || st.settings.sceneCount === 2 ? " selected" : "") + '>2 张</option>' +
      '<option value="3"' + (st.settings.sceneCount === 3 ? " selected" : "") + '>3 张</option>' +
      '<option value="4"' + (st.settings.sceneCount === 4 ? " selected" : "") + '>4 张</option></select></div>' +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>礼物特效</b></span><span class="jili-segs inline">' +
      '<button class="' + (gfx === "all" ? "on" : "") + '" data-jili-action="giftFxSet" data-id="all">全部</button>' +
      '<button class="' + (gfx === "none" ? "on" : "") + '" data-jili-action="giftFxSet" data-id="none">关闭</button></span></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>声音设置</b></div>' +
      cb("voiceOn", "语音合成", "开启后 AI 回复会生成语音") +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>音量</b></span>' +
      '<input type="range" min="0" max="100" value="' + (st.settings.voiceVolume || 80) + '" id="jili-setting-voiceVolume" style="width:120px"></div>' +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>语速</b></span>' +
      '<input type="range" min="50" max="200" value="' + (st.settings.voiceRate || 100) + '" id="jili-setting-voiceRate" style="width:120px"></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>成人与破限</b></div>' +
      cb("adultMode", "成人模式", "允许生成成人内容（18+）") +
      cb("breakLimit", "破限模式", "减少 AI 的内容限制（可能不稳定）") +
      '<p class="jl-hint">开启后，AI 生成的内容可能包含成人主题。请确保你已成年。</p></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>选项</b></div>' +
      cb("dmReactOn", "弹幕互动", "视频播放时生成互动弹幕") +
      "</div>" +
      '<div class="jl-sect"><div class="jl-secthead"><b>数据</b></div>' +
      '<div class="jili-btnrow"><button class="jl-btn ghost" data-jili-action="wipeData">清空叽哩叽哩数据</button></div>' +
      '<p class="jl-hint">清空后所有 UP 主、视频、私信都会重新生成。</p></div>' +
      "</div>";
    var d = ovEl("settings");
    if (d) d.innerHTML = html;
    else pushOv("settings", html, 37);
  }

  /* ================= 投稿页 Bu ================= */

  function openUpload() {
    uploadDraft = null;
    var html = titlebar("投稿视频") + '<div class="jl-scroll upload">' +
      '<div class="jl-field"><label>简介（AI 会据此生成视频）</label><textarea id="jili-up-intro" rows="4" placeholder="分享点什么…"></textarea></div>' +
      '<div class="jili-btnrow"><button class="jl-btn" data-jili-action="uploadGen">AI 生成视频</button></div>' +
      '<div id="jili-up-preview"></div></div>';
    var d = ovEl("upload");
    if (d) d.innerHTML = html;
    else pushOv("upload", html, 38);
  }

  function showUploadPreview(p) {
    var box = $("#jili-up-preview", ovEl("upload"));
    if (!box) return;
    box.innerHTML = '<div class="jl-sect"><div class="jl-secthead"><b>预览</b></div>' +
      '<button class="jl-row" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
      '<span class="jili-thumb" style="' + coverStyle(p.seed) + '">' + (p.durationSec ? '<i class="jili-cd">' + fmtD(p.durationSec) + "</i>" : "") + "</span>" +
      '<span class="jili-rowb"><b>' + esc(p.title) + "</b><span>" + esc(p.intro || "") + "</span></span></button>" +
      '<div class="jili-btnrow"><button class="jl-btn" data-jili-action="uploadPub">发布</button></div></div>';
  }

  /* ================= 弹窗群（chooser / 充值 / 充电 / 发动态） ================= */

  function openChooser() {
    openModal("<h3>发布</h3><div class='jl-tiles pub'>" +
      "<button data-jili-action='startLiveModal'><span class='jl-ic-svg'>" + ICONS.broadcast + "</span><b>开始直播</b></button>" +
      "<button data-jili-action='openUpload'><span class='jl-ic-svg'>" + ICONS.document + "</span><b>投稿视频</b></button>" +
      "<button data-jili-action='openDynModal'><span class='jl-ic-svg'>" + ICONS.edit + "</span><b>发动态</b></button></div>" +
      "<button class='jl-widetile ws' data-jili-action='openWorkshop'><span class='jl-ic-svg jl-ws-ic'>" + ICONS.sparkle + "</span>" +
      "<span class='jili-rowb'><b>主播工坊</b><span>捏一个主播，或者让 AI 一键生成一批</span></span><i>›</i></button>");
  }

  function startLiveModal() {
    var st = S.state;
    var cur = (st.liveRooms || []).filter(function (r) { return r.creatorId === "me"; })[0] || {};
    openModal("<h3>开始直播</h3>" +
      "<div class='jl-field'><label>直播标题</label><input id='jili-live-title' value='" + esc(cur.title || "") + "' placeholder='今天播点什么'></div>" +
      "<div class='jl-field'><label>话题（可选）</label><input id='jili-live-topic' value='" + esc(cur.topic || "") + "' placeholder='例如：聊聊最近看的番'></div>" +
      "<div class='jl-field'><label>画面来源</label><select id='jili-live-source' style='width:100%'>" +
      "<option value='chat'" + (cur.source === "chat" ? " selected" : "") + ">聊天画面</option>" +
      "<option value='camera'" + (cur.source === "camera" ? " selected" : "") + ">摄像头</option>" +
      "<option value='video'" + (cur.source === "video" ? " selected" : "") + ">放视频</option></select></div>" +
      "<div class='jili-btnrow'><button class='jl-btn' data-jili-action='closeModal'>取消</button><button class='jl-btn pink' data-jili-action='startLiveNow'>开始直播</button></div>");
  }

  function startLiveNow() {
    var st = S.state;
    var title = ($("#jili-live-title").value || "").trim();
    if (!title) { toast("先起个直播标题"); return; }
    var topic = ($("#jili-live-topic").value || "").trim();
    var srcSel = $("#jili-live-source");
    var source = srcSel ? srcSel.value : "chat";
    var room = (st.liveRooms || []).filter(function (r) { return r.creatorId === "me"; })[0];
    if (room) {
      room.title = title;
      room.topic = topic;
      room.source = source;
      room.liveNow = true;
    } else {
      room = { id: "live_me", creatorId: "me", title: title, topic: topic, source: source, coverText: title.slice(0, 6), viewers: 0, popularity: 0, liveNow: true, seed: C.hash("me:" + title) };
      st.liveRooms = st.liveRooms || [];
      st.liveRooms.unshift(room);
    }
    save();
    closeModal();
    openLive(room.id);
  }

  function openRecharge() {
    var st = S.state;
    openModal("<h3>充值叽币</h3><p class='jl-hint'>叽币 " + (st.jibi || 0).toLocaleString() + "</p>" +
      "<div class='jl-tiles four'>" + (C.RECHARGE_TIERS || [6, 30, 98, 298]).map(function (n) {
        return "<button data-jili-action='recharge' data-id='" + n + "'><span>⚡</span><b>" + (n * 600) + " 叽币</b><small>¥ " + n + "</small></button>";
      }).join("") + "</div><p class='jl-hint'>从钱包扣钱，1 元 = 600 叽币。</p>");
  }

  function openCharge(cid) {
    var cr = creatorOf(cid);
    if (!cr) return;
    var charged = C.chargedOf(S.state, cid);
    openModal("<h3>给 " + esc(cr.name) + " 充电</h3>" +
      "<p class='jl-hint'>充电后可以看 TA 的充电专属视频，私信时 TA 也会知道你是支持者。</p>" +
      (charged ? "<p class='jl-hint'>充电有效期至 " + new Date(charged.until).toLocaleDateString() + "</p>" : "") +
      "<div class='jili-btnrow'><button class='jl-btn' data-jili-action='charge' data-id='" + esc(cid) + "'>30 叽币 · 充电 30 天</button></div>");
  }

  function openDynModal() {
    closeModal();
    openModal("<h3>发动态</h3>" +
      "<div class='jl-field'><textarea id='jili-dyn-text' rows='4' placeholder='分享点什么…'></textarea></div>" +
      "<div class='jili-btnrow'><button class='jl-btn sm' data-jili-action='dynPublishAI'>发布并看反应</button>" +
      "<button class='jl-btn sm ghost' data-jili-action='dynPublish'>直接发布</button></div>");
  }

  /* ================= 我的直播页 ================= */

  function openMyLive() {
    var st = S.state;
    var myRooms = (st.liveRooms || []).filter(function (r) { return r.creatorId === "me"; });
    var html = titlebar("我的直播") + '<div class="jl-scroll">' +
      '<button class="jl-btn block" data-jili-action="openStudio">🎙 开播控制台</button>' +
      (myRooms.length ? myRooms.map(function (r) {
        var isReplay = !r.liveNow && r.replayChat && r.replayChat.length;
        return '<div class="jl-lib-row"><button class="jl-row" data-jili-action="' + (isReplay ? "openReplay" : "openLive") + '" data-id="' + esc(r.id) + '">' +
          '<span class="jili-thumb" style="' + coverStyle(r.seed) + '"><i class="jili-cx">' + (r.liveNow ? "直播" : isReplay ? "回放" : "未开播") + '</i></span>' +
          '<span class="jili-rowb"><b>' + esc(r.title) + "</b><span>" + fmtN(r.viewers || 0) + " 观看</span><span>" + (r.liveNow ? "直播中" : isReplay ? "查看回放" : "未开播") + "</span></span></button></div>";
      }).join("") : '<div class="jl-empty"><p>还没有直播间，去「发布」开始直播吧</p></div>') + "</div>";
    var d = ovEl("mylive");
    if (d) d.innerHTML = html;
    else pushOv("mylive", html, 36);
  }

  function openReplay(roomId) {
    var st = S.state;
    var room = roomOf(roomId);
    if (!room || !room.replayChat || !room.replayChat.length) { toast("没有可回放的内容"); return; }
    var html = titlebar("直播回放") + '<div class="jl-scroll">' +
      '<div class="jl-sect"><div class="jl-secthead"><b>' + esc(room.title) + '</b><span>' + (room.replayChat.length + " 条消息") + '</span></div>' +
      '<div class="jl-replaychat">' + room.replayChat.map(function (msg) {
        return '<div class="jlv-line">' + msg.html + '</div>';
      }).join("") + '</div></div></div>';
    var d = ovEl("replay");
    if (d) d.innerHTML = html;
    else pushOv("replay", html, 36);
  }

  /* ================= 我的钱包页 ================= */

  function openWallet() {
    var st = S.state;
    var html = titlebar("我的钱包") + '<div class="jl-scroll">' +
      '<div class="jl-sect"><div class="jl-secthead"><b>余额</b></div>' +
      '<div class="jl-wallet-bal"><div class="v">¥ ' + Number(st.walletBalance || 0).toFixed(2) + "</div><p>可提现余额</p></div>" +
      '<div class="jili-btnrow"><button class="jl-btn" data-jili-action="withdrawWallet">提现到银行卡</button></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>交易记录</b></div>' +
      '<div class="jl-empty"><p>暂无交易记录</p></div></div></div>';
    var d = ovEl("wallet");
    if (d) d.innerHTML = html;
    else pushOv("wallet", html, 36);
  }

  /* ================= 我的充电页 ================= */

  function openChargePage() {
    var st = S.state;
    var charged = (st.charged || []).filter(function (c) { return c.until > Date.now(); });
    var html = titlebar("我的充电") + '<div class="jl-scroll">' +
      (charged.length ? charged.map(function (c) {
        var cr = creatorOf(c.creatorId);
        return '<div class="jl-lib-row"><button class="jl-row" data-jili-action="openSpace" data-id="' + esc(c.creatorId) + '">' +
          avHTML(cr, 44) +
          '<span class="jili-rowb"><b>' + esc(cr ? cr.name : "UP 主") + "</b><span>充电至 " + new Date(c.until).toLocaleDateString() + "</span></span></button></div>";
      }).join("") : '<div class="jl-empty"><p>还没有充电的 UP 主，去喜欢的 UP 主空间充电吧</p></div>') + "</div>";
    var d = ovEl("chargepage");
    if (d) d.innerHTML = html;
    else pushOv("chargepage", html, 36);
  }

  /* ================= 视频播放页 tc ================= */

  var DM_POOL = ["前方高能", "哈哈哈哈哈", "名场面", "泪目", "太顶了", "下次一定", "好活", "必火", "来晚了", "循环中", "梦开始的地方", "有内味了", "宝藏视频", "三连了", "UP 主辛苦了", "这就是知识的力量"];

  function seededRnd(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
  }

  function scriptSub(p, from, to) {
    if (!p.script || !p.script.length) return "";
    var lines = [];
    p.script.forEach(function (l) {
      if (l && l.k === "say" && Number(l.t) >= from && Number(l.t) < to) lines.push(String(l.text || ""));
    });
    return lines.join(" ");
  }

  function planScenes(p) {
    var dur = Math.max(10, Number(p.durationSec) || 60);
    if (p.scenes && p.scenes.length) {
      var acc = 0;
      return p.scenes.map(function (s) {
        var d = Number(s.dur) || Math.round(dur / p.scenes.length);
        var seg = { desc: s.desc || "", dur: d, sub: scriptSub(p, acc, acc + d) };
        acc += d;
        return seg;
      });
    }
    var k = Math.max(2, Math.min(5, Math.round(dur / 20)));
    var names = ["开场", "正片", "名场面", "高潮", "尾声"];
    var each = dur / k;
    var out = [];
    for (var i = 0; i < k; i++) {
      out.push({ desc: (names[i] || "") + " · " + (p.title || ""), dur: each, sub: scriptSub(p, i * each, (i + 1) * each) });
    }
    return out;
  }

  function buildDmSchedule(p) {
    var rnd = seededRnd(C.hash("dm:" + p.id));
    var dur = Math.max(10, Number(p.durationSec) || 60);
    var list = [];
    (S.state.danmaku || []).forEach(function (d) {
      if (!d || String(d.postId) !== String(p.id)) return;
      var t = Number(d.time) || 0;
      if (t > dur) t = t % dur;
      var type = d.mode === "adv" ? "adv" : (d.mode === "top" || d.mode === "bottom") ? "fix" : "fly";
      list.push({ t: t, text: String(d.text || ""), type: type });
    });
    if (list.length < 10) {
      var t = 1.2;
      while (t < dur - 0.5) {
        var r = rnd();
        list.push({ t: t, text: DM_POOL[Math.floor(rnd() * DM_POOL.length)], type: r < 0.72 ? "fly" : r < 0.92 ? "fix" : "adv" });
        t += 0.8 + rnd() * 1.6;
      }
    }
    list.sort(function (a, b) { return a.t - b.t; });
    return list;
  }

  function sceneHTML(pl, i) {
    var s = pl.scenes[i] || { desc: "", sub: "" };
    return '<div class="jili-scene" style="' + coverStyle(pl.post.seed + "#s" + i) + '">' +
      (s.desc ? "<p>" + esc(s.desc) + "</p>" : "") +
      (s.sub ? '<div class="jili-sub">' + esc(s.sub) + "</div>" : "") + "</div>";
  }

  function openPost(id) {
    var p = postOf(id);
    if (!p) { toast("内容不存在"); return; }
    if (removeOv("post")) stopPlayer();
    cmTab = "intro";
    cmSort = "hot";
    TITLE_OPEN = false;
    cmReplyTo = null;
    var st = S.state;
    player = {
      post: p, time: 0, playing: true, rate: 1, timer: null,
      scenes: planScenes(p), sceneIdx: -1,
      dm: buildDmSchedule(p), di: 0, dmOn: true,
      tracks: [0, 0, 0, 0, 0, 0], fixN: 0,
      suppress: false, pipVideo: null, pipCanvas: null
    };
    var dur = fmtD(p.durationSec || 0);
    var html =
      '<div class="jili-stage" data-stage="1">' +
        '<div class="jili-scenewrap">' + sceneHTML(player, 0) + "</div>" +
        '<div class="jl-dmlayer" id="jili-dmlayer"></div>' +
        '<button class="jl-iconbtn jili-stageback" data-jili-action="back">‹</button>' +
        '<div class="jili-ctrl">' +
          '<button data-jili-action="playToggle" id="jili-playbtn">⏸</button>' +
          '<input type="range" id="jili-seek" min="0" max="' + Math.floor(p.durationSec || 60) + '" step="1" value="0">' +
          '<span id="jili-time">0:00 / ' + dur + "</span>" +
          '<button data-jili-action="ratePop" id="jili-ratebtn">' + player.rate + "x</button>" +
          '<button data-jili-action="dmToggle" id="jili-dmbtn">弹</button>' +
          '<button data-jili-action="dmSet">设置</button>' +
          '<button data-jili-action="pipBtn">画中画</button>' +
          '<button data-jili-action="fsBtn">全屏</button>' +
        "</div>" +
        '<div id="jili-ratepop" class="jili-ratepop" hidden>' +
          (C.RATES || [0.5, 0.75, 1, 1.25, 1.5, 2]).map(function (r) {
            return '<button data-jili-action="rateSet" data-id="' + r + '" class="' + (r === 1 ? "on" : "") + '">' + r + "x</button>";
          }).join("") + "</div>" +
        '<div id="jili-dmset" class="jili-dmset" hidden>' + dmSetHTML() + "</div>" +
      "</div>" +
      '<div class="jlp-subbar">' +
        '<div class="jlp-tabs">' +
          '<button class="' + (cmTab === "intro" ? "on" : "") + '" data-jili-action="cmTabSet" data-id="intro">简介</button>' +
          '<button id="jili-tabcm" class="' + (cmTab === "comments" ? "on" : "") + '" data-jili-action="cmTabSet" data-id="comments">评论 ' + fmtN((p.comments || []).length) + "</button>" +
        "</div>" +
        '<input class="jlp-dmin" id="jili-dm-text" placeholder="点我发弹幕">' +
        '<button class="jlp-dmsend" data-jili-action="dmSendV">发送</button>' +
        '<button class="jlp-dmbtn' + (player.dmOn ? "" : " off") + '" data-jili-action="dmToggle" aria-label="弹幕开关">' + ICONS.tv + "</button>" +
      "</div>" +
      '<div class="jl-scroll jlp-scroll" id="jili-postbody"></div>' +
      '<div id="jili-cmto"></div>' +
      '<div class="jlp-cmbar"><input id="jili-cm-input" placeholder="' + esc(CM_PHRASES[Math.floor(Math.random() * CM_PHRASES.length)]) + '"><button class="jlp-cmemj" data-jili-action="cmEmoji">☺</button><button class="jlp-cmsend" data-jili-action="cmSend">发送</button></div>';
    var ov = pushOv("post", html, 30);
    ov.className = "jl-root jili-postov";
    ov.style.background = "#111";
    renderPostBody();
    startPlayerTimer();
    var cr = creatorOf(p.creatorId);
    if (cr && cr.fanOnly && !C.chargedOf(st, p.creatorId)) {
      toast("充电专属视频 · 充电后可看完整版");
    }
  }

  function dmSetHTML() {
    var s = S.state.settings;
    function sel(id, label, opts, cur) {
      return '<div class="jl-field"><label>' + label + "</label><select id=\"" + id + '" style="width:100%">' +
        opts.map(function (o) { return '<option value="' + o + '"' + (Number(cur) === o ? " selected" : "") + ">" + Math.round(o * 100) + "%</option>"; }).join("") + "</select></div>";
    }
    var blocks = String(s.dmBlock || "").split(/[,，、\s]+/).filter(Boolean);
    return '<div class="jili-dmset-in">' +
      '<div class="jili-dmset-head"><b>弹幕设置</b><button class="jl-iconbtn" data-jili-action="dmSetClose">✕</button></div>' +
      sel("jili-dm-opacity", "不透明度", [0.3, 0.5, 0.8, 1], s.dmOpacity) +
      sel("jili-dm-speed", "弹幕速度", [0.7, 1, 1.4], s.dmSpeed) +
      sel("jili-dm-size", "字号", [0.8, 1, 1.25], s.dmSize) +
      '<label class="jl-dmset-row"><span>弹幕互动</span><input id="jili-dm-react" type="checkbox" ' + (s.dmReactOn ? "checked" : "") + "></label>" +
      '<div class="jl-field"><label>屏蔽词（点标签删除）</label>' +
      '<div class="jl-chips">' + blocks.map(function (w) {
        return '<button class="jili-chip" data-jili-action="dmBlockDel" data-id="' + esc(w) + '">' + esc(w) + " ✕</button>";
      }).join("") + "</div>" +
      '<div class="jl-dmset-add"><input id="jili-dm-block" placeholder="输入屏蔽词"><button class="jl-btn sm" data-jili-action="dmBlockAdd">添加</button></div></div></div>';
  }

  function renderPostBody() {
    if (!player) return;
    var box = $("#jili-postbody", ovEl("post"));
    if (!box) return;
    var st = S.state;
    var p = player.post;
    var cr = creatorOf(p.creatorId);
    if (cmTab === "intro") {
      var vids = (st.posts || []).filter(function (x) { return x.kind === "video" && x.creatorId === p.creatorId; }).length;
      var watching = Math.max(1, Math.round((p.play || 0) / 9000));
      var rel = (st.posts || []).filter(function (x) { return x.kind === "video" && x.id !== p.id; })
        .sort(function (a, b) { return (b.play || 0) - (a.play || 0); }).slice(0, 6);
      var epTotal = p.series ? (st.posts || []).filter(function (x) { return x.kind === "video" && x.series === p.series; }).length : 0;
      box.innerHTML =
        '<div class="jlp-uprow">' +
          '<button class="jlp-upbtn" data-jili-action="openSpace" data-id="' + esc(p.creatorId) + '">' + avHTML(cr, 40) +
          '<span class="jlp-upcol"><b>' + esc(cr ? cr.name : "UP 主") + "</b><span>" + fmtN(cr ? cr.fans || 0 : 0) + "粉丝 · " + vids + "视频</span></span></button>" +
          '<button class="jlp-follow' + (isFollowed(p.creatorId) ? " off" : "") + '" data-jili-action="followToggle" data-id="' + esc(p.creatorId) + '">' + (isFollowed(p.creatorId) ? "已关注" : "+ 关注") + "</button>" +
        "</div>" +
        '<div class="jlp-title' + (TITLE_OPEN ? " open" : "") + '" data-jili-action="titleToggle"><span>' + esc(p.title) + '</span><i class="jlp-chev">' + ICONS.chev + "</i></div>" +
        '<div class="jlp-stats"><span>' + ICONS.vplay + fmtN(p.play || 0) + "</span><span>" + ICONS.vdm + fmtN(p.danmakuCount || 0) + "</span><span>" + fmtDateCN(p.at) + '</span><span class="w">' + ICONS.vwatch + watching + "人正在看</span></div>" +
        '<div class="jlp-actrow">' +
          '<button class="jlp-act' + (p.liked ? " on" : "") + '" data-tri="1"><i>' + ICONS.thumbsup + '</i><b id="jili-nlike">' + fmtN(p.likes || 0) + "</b><u>点赞</u></button>" +
          '<button class="jlp-act' + (p.disliked ? " on" : "") + '" data-jili-action="dislike"><i>' + ICONS.thumbsdown + '</i><b>' + fmtN(p.dislikes || 0) + "</b><u>不喜欢</u></button>" +
          '<button class="jlp-act' + (p.coined ? " on" : "") + '" data-jili-action="coin"><i>' + ICONS.coin + '</i><b id="jili-ncoin">' + fmtN(p.coins || 0) + "</b><u>投币</u></button>" +
          '<button class="jlp-act' + (p.faved ? " on" : "") + '" data-jili-action="fav"><i>' + ICONS.star + '</i><b id="jili-nfav">' + fmtN(p.favs || 0) + "</b><u>收藏</u></button>" +
          '<button class="jlp-act" data-jili-action="share"><i>' + ICONS.forward + '</i><b id="jili-nshare">' + fmtN(p.shares || 0) + "</b><u>转发</u></button>" +
        "</div>" +
        (p.series ? '<button class="jlp-series" data-jili-action="openSeries" data-id="' + esc(p.series) + '"><span class="l"><b>合集 · ' + esc(p.series) + "</b>" + (p.epTitle ? "<span>" + esc(p.epTitle) + "</span>" : "") + '</span><span class="r">' + (epTotal >= (p.episode || 1) && epTotal > 1 ? (p.episode || 1) + "/" + epTotal : "已更 " + Math.max(epTotal, p.episode || 1) + " 集") + " ›</span></button>" : "") +
        (p.intro ? '<p class="jlp-intro">' + esc(p.intro) + "</p>" : "") +
        rel.map(function (o) {
          var oc = creatorOf(o.creatorId);
          return '<div class="jlp-rel" data-jili-action="openPost" data-id="' + esc(o.id) + '">' +
            '<span class="jlp-relcov" style="' + coverStyle(o.seed) + '">' +
              (o.coverText ? '<b class="' + nextCoverStyle() + '">' + esc(o.coverText) + "</b>" : "") +
              '<i class="jili-cd">' + fmtD(o.durationSec || 0) + "</i></span>" +
            '<span class="jlp-relcol"><b>' + esc(o.title) + "</b><span class='m'>" + esc(oc ? oc.name : "UP 主") + " · " + fmtN(o.play || 0) + "播放</span></span>" +
          "</div>";
        }).join("");
    } else {
      var list = (p.comments || []).slice();
      list.sort(cmSort === "hot" ? function (a, b) { return (b.likes || 0) - (a.likes || 0); } : function (a, b) { return (b.at || 0) - (a.at || 0); });
      var kw = String(p.title || "").replace(/【[^】]*】/g, "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, " ").trim().split(/\s+/)[0] || (cr ? cr.name : "好活");
      box.innerHTML =
        '<div class="jlp-search" data-jili-action="cmSearchFocus"><span>大家都在搜：</span><b>' + esc(kw) + '</b><i>' + ICONS.search + "</i></div>" +
        '<div class="jlp-cmhead"><b>热门评论</b><button data-jili-action="cmSortToggle">' + (cmSort === "hot" ? "按热度" : "按时间") + " ▾</button></div>" +
        (list.length ? list.map(function (c) { return commentHTML(c, cr); }).join("") : '<div class="jl-empty"><p>还没有评论</p></div>');
      if (!list.length && !busy) {
        box.innerHTML = '<div class="jl-empty"><p>生成评论中…</p></div>';
        aiRun(null, function () { return C.ai.seedComments(S.state, p.id); }).then(function (r) {
          if (r !== undefined && player) renderPostBody();
        });
      }
    }
    var to = $("#jili-cmto", ovEl("post"));
    if (to) {
      to.innerHTML = cmReplyTo
        ? "<div class='jl-cmto'>回复 @" + esc(cmReplyTo.name) + "<button class='jl-btn sm ghost' data-jili-action='cmCancel'>取消</button></div>"
        : "";
    }
    updateActNums();
  }

  function commentHTML(c, cr) {
    var me = S.state.userName || "我";
    var who = { id: c.userId || c.name, name: c.name };
    var replies = (c.replies || []);
    var shown = c.threaded ? replies : replies.slice(0, 2);
    var card = "";
    if (shown.length) {
      card = '<div class="jlp-rmcard">' + shown.map(function (r) {
        return '<div class="jlp-rmin"><b>' + esc(r.name) + (r.up ? "<span class='jl-uptag'>UP</span>" : "") + "：</b>" +
          (r.replyTo ? "<i>@" + esc(r.replyTo) + " </i>" : "") + esc(r.text) +
          (r.likes ? '<span class="lk">👍 ' + fmtN(r.likes) + "</span>" : "") + "</div>";
      }).join("") +
      (!c.threaded ? '<button class="jlp-rmmore" data-jili-action="threadOpen" data-id="' + esc(c.id) + '">共 ' + replies.length + ' 条回复 ›</button>' : "") +
      "</div>";
    }
    return '<div class="jl-cm" data-cid="' + esc(c.id) + '">' +
      '<span class="jlp-cmav">' + avHTML(who, 34) + "</span>" +
      '<div class="jlp-cmmain">' +
        '<div class="jlp-cmname"><b>' + esc(c.name) + "</b>" + (c.isUp ? "<span class='jl-uptag'>UP</span>" : "") + lvBadge(c.likes) + "</div>" +
        "<p>" + esc(c.text) + "</p>" + card +
        '<div class="jlp-cmmeta"><span>' + ago(c.at) + " " + cmRegion(c.name) + '</span><button data-jili-action="cmReplyBtn" data-id="' + esc(c.id) + '">回复</button></div>' +
      "</div>" +
      '<div class="jlp-cmside">' +
        '<button data-jili-action="cmLike" data-id="' + esc(c.id) + '" class="' + (c.liked ? "on" : "") + '">' + ICONS.thumbsupS + "<i>" + fmtN(c.likes || 0) + "</i></button>" +
        (c.name === me ? '<button data-jili-action="cmDel" data-id="' + esc(c.id) + '">删除</button>' : "") +
      "</div></div>";
  }

  /* --- 播放器时钟 / 弹幕 --- */

  function startPlayerTimer() {
    if (player && player.timer == null) {
      player.last = Date.now();
      player.timer = setInterval(playerTick, 250);
    }
  }
  function stopPlayer() {
    if (player && player.timer) clearInterval(player.timer);
    player = null;
  }
  function playerTick() {
    var pl = player;
    if (!pl || !pl.playing) return;
    pl.time += 0.25 * pl.rate;
    var dur = pl.post.durationSec || 60;
    if (pl.time >= dur) { pl.time = dur; pl.playing = false; setPlayBtn(); }
    updateHUD();
    spawnDueDm();
    drawPip();
  }
  function updateHUD() {
    var pl = player;
    if (!pl) return;
    var d = ovEl("post");
    if (!d) return;
    var seek = $("#jili-seek", d);
    if (seek && document.activeElement !== seek) seek.value = Math.floor(pl.time);
    var tl = $("#jili-time", d);
    if (tl) tl.textContent = fmtD(pl.time) + " / " + fmtD(pl.post.durationSec || 0);
    var acc = 0, idx = 0;
    for (var i = 0; i < pl.scenes.length; i++) {
      if (pl.time >= acc && pl.time < acc + pl.scenes[i].dur) { idx = i; break; }
      acc += pl.scenes[i].dur;
      idx = i;
    }
    if (idx !== pl.sceneIdx) {
      pl.sceneIdx = idx;
      var wrap = $(".jili-scenewrap", d);
      if (wrap) wrap.innerHTML = sceneHTML(pl, idx);
    }
    var subEl = $(".jili-sub", d);
    if (subEl && pl.post.script && pl.post.script.length) {
      var cur = "";
      for (var j = 0; j < pl.post.script.length; j++) {
        var ln = pl.post.script[j];
        if (ln && ln.k === "say" && Number(ln.t) <= pl.time) cur = String(ln.text || "");
      }
      if (cur && subEl.textContent !== cur) subEl.textContent = cur;
    }
  }
  function setPlayBtn() {
    var d = ovEl("post");
    var b = d && $("#jili-playbtn", d);
    if (b) b.textContent = player && player.playing ? "⏸" : "▶";
  }
  function dmBlocked(text) {
    var s = S.state.settings;
    var blocks = String(s.dmBlock || "").split(/[,，、\s]+/).filter(Boolean);
    return blocks.some(function (w) { return w && text.indexOf(w) >= 0; });
  }
  function spawnDueDm() {
    var pl = player;
    if (!pl || !pl.dmOn) return;
    var layer = $("#jili-dmlayer", ovEl("post"));
    if (!layer) return;
    var s = S.state.settings;
    layer.style.opacity = s.dmOpacity == null ? 1 : s.dmOpacity;
    layer.style.setProperty("--dms", s.dmSize || 1);
    while (pl.di < pl.dm.length && pl.dm[pl.di].t <= pl.time) {
      var item = pl.dm[pl.di++];
      if (!dmBlocked(item.text)) spawnDm(layer, item, s);
    }
  }
  function spawnDm(layer, item, s) {
    var pl = player;
    var d = document.createElement("span");
    if (item.type === "fly") {
      var tr = 0;
      for (var i = 1; i < pl.tracks.length; i++) if (pl.tracks[i] < pl.tracks[tr]) tr = i;
      pl.tracks[tr] = pl.time + Math.min(7, 2.2 + item.text.length * 0.16 / (s.dmSpeed || 1));
      d.className = "jl-flydm";
      d.textContent = item.text;
      d.style.top = (8 + tr * 30) + "px";
      d.style.animationDuration = (8 / (s.dmSpeed || 1)) + "s";
      layer.appendChild(d);
      requestAnimationFrame(function () {
        d.style.setProperty("--w", (d.offsetWidth || 200) + "px");
      });
      setTimeout(function () { d.remove(); }, 9000 / (s.dmSpeed || 1));
    } else if (item.type === "fix") {
      d.className = "jl-fixdm";
      d.textContent = item.text;
      d.style.top = (6 + (pl.fixN++ % 3) * 26) + "px";
      layer.appendChild(d);
      setTimeout(function () { d.remove(); }, 4000);
    } else {
      d.className = "jl-advdm";
      d.textContent = item.text;
      d.style.left = (25 + Math.random() * 45) + "%";
      d.style.top = (30 + Math.random() * 45) + "%";
      d.style.setProperty("--dx", (-60 + Math.random() * 120) + "px");
      d.style.setProperty("--dy", (-40 + Math.random() * 80) + "px");
      layer.appendChild(d);
      setTimeout(function () { d.remove(); }, 5200);
    }
  }

  function drawPip() {
    var pl = player;
    if (!pl || !pl.pipVideo || !pl.pipCanvas) return;
    var ctx = pl.pipCanvas.getContext("2d");
    if (!ctx) return;
    var w = pl.pipCanvas.width, h = pl.pipCanvas.height;
    var cr = creatorOf(pl.post.creatorId);
    var sc = pl.scenes[pl.sceneIdx] || {};
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(String(pl.post.title || "").slice(0, 18), 12, 34);
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#9fb3c8";
    ctx.fillText((cr ? cr.name : "") + " · " + String(sc.desc || "").slice(0, 22), 12, 58);
    ctx.fillText(String(sc.sub || "").slice(0, 26), 12, h - 40);
    ctx.fillStyle = "#ff6699";
    ctx.fillText(fmtD(pl.time) + " / " + fmtD(pl.post.durationSec || 0), 12, h - 16);
  }

  /* --- 三连 Wo --- */
  var tri = { t1: null, t2: null, start: 0, x: 0, y: 0, moved: false, active: false };

  function triDown(e, btn) {
    if (!player) return;
    tri.active = true; tri.moved = false;
    tri.x = e.clientX; tri.y = e.clientY; tri.start = Date.now();
    tri.t1 = setTimeout(function () { btn.classList.add("holding"); }, 250);
    tri.t2 = setTimeout(function () { doTriple(btn); }, 1500);
  }
  function triMove(e) {
    if (!tri.active) return;
    if (Math.abs(e.clientX - tri.x) > 8 || Math.abs(e.clientY - tri.y) > 8) {
      tri.moved = true;
      triCancel();
    }
  }
  function triUp(btn) {
    if (!tri.active) return;
    var dt = Date.now() - tri.start;
    triCancel();
    if (!tri.moved && dt < 450) likeToggle();
    tri.moved = false;
  }
  function triCancel() {
    if (tri.t1) clearTimeout(tri.t1);
    if (tri.t2) clearTimeout(tri.t2);
    tri.t1 = tri.t2 = null; tri.active = false;
    var b = $('[data-tri="1"]', ovEl("post"));
    if (b) b.classList.remove("holding");
  }
  function doTriple(btn) {
    triCancel();
    if (!player) return;
    var p = player.post;
    if (!p.liked) { p.liked = true; p.likes = (p.likes || 0) + 1; }
    if (!p.faved) { p.faved = true; p.favs = (p.favs || 0) + 1; addList("favs", p.id); }
    if (!p.coined) { p.coined = true; p.coins = (p.coins || 0) + 1; }
    save();
    updateActNums();
    splashTriple();
    toast("三连完成：点赞 + 投币 + 收藏");
  }
  function addList(key, id) {
    var st = S.state;
    st[key] = st[key] || [];
    if (!st[key].some(function (x) { return String(x.id) === String(id); })) {
      st[key].push({ id: id, at: Date.now() });
    }
  }
  function splashTriple() {
    var stage = $('[data-stage="1"]', ovEl("post"));
    if (!stage) return;
    var cols = C.FX_COLORS || ["#ff6699", "#ffc53d", "#4dc3ff", "#a07cff", "#7ef0d0"];
    var d = document.createElement("div");
    d.className = "jl-tri-splash";
    var html = "<b>三连完成！</b>";
    for (var i = 0; i < 14; i++) {
      html += "<i style=\"--x:" + (6 + (37 * i) % 88) + "%;--c:" + cols[i % 5] +
        ";--d:" + ((i % 5) * 0.08) + "s;--r:" + ((53 * i) % 360) + 'deg"></i>';
    }
    d.innerHTML = html;
    stage.appendChild(d);
    setTimeout(function () { d.remove(); }, 1700);
  }
  function updateActNums() {
    var d = ovEl("post");
    if (!d || !player) return;
    var p = player.post;
    var a = $("#jili-nlike", d), b = $("#jili-nfav", d), cn = $("#jili-ncoin", d), sh = $("#jili-nshare", d);
    if (a) a.textContent = fmtN(p.likes || 0);
    if (b) b.textContent = fmtN(p.favs || 0);
    if (cn) cn.textContent = fmtN(p.coins || 0);
    if (sh) sh.textContent = fmtN(p.shares || 0);
    var lk = $('[data-tri="1"]', d);
    if (lk) lk.classList.toggle("on", !!p.liked);
    function mark(act, on) { var el = $('[data-jili-action="' + act + '"]', d); if (el) el.classList.toggle("on", !!on); }
    mark("dislike", p.disliked);
    mark("coin", p.coined);
    mark("fav", p.faved);
    var tab = $("#jili-tabcm", d);
    if (tab) tab.textContent = "评论 " + (p.comments || []).length;
  }

  /* ================= 直播观看页 Jd ================= */

  function openLive(roomId) {
    var st = S.state;
    var room = roomOf(roomId);
    if (!room) { toast("直播间不存在"); return; }
    var isMe = String(room.creatorId) === "me";
    var cr = creatorOf(room.creatorId) || (isMe ? meAsCreator() : null);
    if (!cr) { toast("主播不存在"); return; }
    if (removeOv("live")) stopLive();
    liveP = {
      room: room, cr: cr, queue: [], pumpT: null,
      base: Math.max(12, Math.round(0.03 * (cr.fans || 0))),
      viewers: room.viewers || Math.max(12, Math.round(0.03 * (cr.fans || 0))),
      rank: {}, ended: false, dmTyping: null, chatLog: []
    };
    var likesSum = (st.posts || []).filter(function (p) { return p.creatorId === cr.id; }).reduce(function (s, p) { return s + (p.likes || 0); }, 0);
    var html =
      '<div class="jlv-root2">' +
        '<div class="jlv-head2">' +
          '<button class="jlv-back2" data-jili-action="back">‹</button>' +
          '<div class="jlv-headinfo">' + avHTML(cr, 32) +
            '<div><b>' + esc(cr.name) + '</b><span>' + fmtN(likesSum) + ' 点赞</span></div>' +
          '</div>' +
          (isMe ? '<button class="jlv-endbtn" data-jili-action="endLive">结束直播</button>' : '<button class="jlv-followbtn" data-jili-action="liveFollow" data-id="' + esc(cr.id) + '">' + (isFollowed(cr.id) ? "已关注" : "关注") + '</button>') +
          '<div class="jlv-viewers2"><span class="jlv-viewavatars">' + avHTML(cr, 20) + '</span><span class="jlv-viewcount">' + fmtN(liveP.viewers) + '</span></div>' +
          '<button class="jlv-more2" data-jili-action="liveMore">⋮</button>' +
        '</div>' +
        '<div class="jlv-tabs2"><button class="on">热门榜</button><button>人气榜</button><span class="jlv-morelive">更多直播 ›</span></div>' +
        '<div class="jlv-giftbar2"><span>礼物星球 0/9</span><span class="jlv-giftad">🎨 画师航海</span></div>' +
        '<div class="jlv-video2" style="' + coverStyle(room.seed) + '">' +
          '<span class="jlv-bilibili">bilibili直播</span>' +
          '<span class="jlv-roomid">' + room.id + '</span>' +
          '<div class="jlv-qrcode"><span>直播间小伙伴群</span><span class="jlv-qrdate">(-10.22)</span></div>' +
        '</div>' +
        '<div class="jlv-desc2">' + esc(room.title || cr.catchphrase || "") + '</div>' +
        '<div class="jlv-chat2" id="jili-chat">' +
          '<div class="jlv-line2">欢迎来到 ' + esc(cr.name) + ' 的直播间</div>' +
          (cr.catchphrase ? '<div class="jlv-line2"><b>' + esc(cr.name) + '：</b>' + esc(cr.catchphrase) + '</div>' : '') +
        '</div>' +
        '<div class="jlv-floatbanner">歌王争霸赛<br>+ 直播赛区 +<br><span class="jlv-hot">🔴 火热进行中</span></div>' +
        '<div class="jlv-bottom2">' +
          '<input id="jili-live-input" placeholder="弹幕支持下～">' +
          '<button class="jlv-emoji2">☺</button>' +
          '<button class="jlv-hotbtn">人气</button>' +
          '<button class="jlv-gift2" data-jili-action="giftOpen">🎁</button>' +
        '</div>' +
      '</div>';
    var d = pushOv("live", html, 32);
    updateTop3();
    aiRun(null, function () { return C.ai.liveRound(st, room.id, ""); }).then(function (r) {
      if (r === undefined || !liveP) return;
      applyRound((r && r.lines) || r || []);
    });
  }

  function giftSheetHTML() {
    var st = S.state;
    return '<div class="jlv-gtabs"><button class="on">全部</button></div>' +
      '<div class="jlv-gifts">' + (C.GIFTS || []).map(function (g) {
        return '<button data-jili-action="giftSend" data-id="' + esc(g.id) + '">' +
          "<span>" + g.emoji + "</span><b>" + esc(g.name) + "</b><small>" + g.price + " 叽币</small></button>";
      }).join("") + "</div>" +
      '<div class="jlv-gfoot"><span>叽币 ' + (st.jibi || 0).toLocaleString() + "</span>" +
      '<button class="jl-btn sm" data-jili-action="rechargeOpen">充值</button>' +
      '<button class="jl-btn sm ghost" data-jili-action="giftClose">收起</button></div>';
  }

  function rankKey(l) { return l.name || "路人"; }
  function addPts(name, pts) {
    if (!liveP) return;
    var k = rankKey({ name: name });
    liveP.rank[k] = (liveP.rank[k] || 0) + pts;
    updateTop3();
  }
  function updateTop3() {
    var box = $("#jili-top3", ovEl("live"));
    if (!box || !liveP) return;
    var arr = Object.keys(liveP.rank).map(function (k) { return [k, liveP.rank[k]]; })
      .filter(function (x) { return x[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    box.innerHTML = arr.map(function (x, i) {
      return "<span><i>" + (i + 1) + "</i>" + esc(x[0]) + "</span>";
    }).join("");
  }
  function chatLine(html) {
    var chat = $("#jili-chat", ovEl("live"));
    if (!chat) return;
    var d = document.createElement("div");
    d.className = "jlv-line2";
    d.innerHTML = html;
    chat.appendChild(d);
    while (chat.children.length > 60) chat.removeChild(chat.firstChild);
    var wrap = chat.parentElement;
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
    if (liveP && liveP.chatLog) {
      liveP.chatLog.push({ at: Date.now(), html: html });
    }
  }
  function fxBanner(html, color, fx) {
    var wrap = $("#jili-fxwrap", ovEl("live"));
    if (!wrap) return;
    if (S.state.settings.giftFx === "none") return;
    var d = document.createElement("div");
    d.className = "jili-fx" + (fx ? " jlg-" + fx : "");
    d.style.borderColor = color || "rgba(255,255,255,.25)";
    d.innerHTML = html;
    wrap.appendChild(d);
    setTimeout(function () { d.remove(); }, 3200);
  }
  function liveSysLine(text) { chatLine("<i>📢</i> " + esc(text)); }

  function applyRound(lines) {
    if (!liveP || !lines || !lines.length) return;
    var newFans = 0;
    lines.forEach(function (l) {
      var name = l.name || "路人";
      if (l.type === "dm") {
        chatLine("<i>Lv" + (l.level || 1) + "</i><b>" + esc(name) + "：</b>" + esc(l.text || ""));
        addPts(name, 1);
      } else if (l.type === "gift") {
        var g = (C.GIFTS || []).filter(function (x) { return x.id === l.gift; })[0] || { emoji: "🎁", name: l.gift, price: l.price || 1, color: "", fx: "" };
        var n = l.count || 1;
        fxBanner(esc(name) + " 送出 " + g.emoji + " " + esc(g.name) + " ×" + n, g.color || "#ff6699", g.fx || "");
        chatLine("<b>" + esc(name) + "</b> 送出了 " + esc(g.name) + " ×" + n);
        addPts(name, (g.price || 0) * n);
      } else if (l.type === "sc") {
        var price = l.price || 30;
        fxBanner(esc(name) + " 的醒目留言：¥" + price, "#ffc53d", "");
        chatLine("<b>" + esc(name) + "</b>：¥" + price + " " + esc(l.text || ""));
        addPts(name, 10 * price);
        var scbox = $("#jili-scbox", ovEl("live"));
        if (scbox) {
          var chip = document.createElement("span");
          chip.className = "jlv-sc";
          chip.textContent = name + "（¥" + price + "）：" + (l.text || "");
          scbox.appendChild(chip);
        }
      } else if (l.type === "guard") {
        var gp = l.price || 198;
        fxBanner(esc(name) + " 开通了舰长！", "#a07cff", "");
        liveSysLine(name + " 上舰了，欢迎！");
        addPts(name, gp);
        var aud = $("#jili-aud", ovEl("live"));
        if (aud) aud.appendChild(avHTML({ name: name }, 26));
      } else if (l.type === "follow") {
        newFans++;
        liveSysLine(name + " 关注了主播");
        addPts(name, 1);
      } else if (l.type === "like") {
        liveSysLine(name + " 点了个赞");
      }
    });
    var delta = Math.round(lines.length / 3) + 2 * newFans - Math.floor(2 * Math.random());
    liveP.viewers = Math.max(5, liveP.viewers + delta);
    var on = $("#jili-online", ovEl("live"));
    if (on) on.textContent = fmtN(liveP.viewers) + " 人观看";
  }

  function pumpQueue() {
    if (!liveP) return;
    liveP.pumpT = null;
    if (!liveP.queue.length) return;
    var l = liveP.queue.shift();
    renderQueued(l);
    liveP.pumpT = setTimeout(pumpQueue, 900);
  }
  function renderQueued(l) {
    applyRound([l]);
  }

  function stopLive() {
    if (liveP && liveP.pumpT) clearTimeout(liveP.pumpT);
    if (liveP && String(liveP.room.creatorId) === "me") {
      var st = S.state;
      var room = liveP.room;
      room.liveNow = false;
      room.endedAt = Date.now();
      room.replayChat = liveP.chatLog || [];
      save();
      toast("直播已结束，回放已保存");
    }
    liveP = null;
  }

  /* ================= 设置保存 / 其他动作 ================= */

  function likeToggle() {
    if (!player) return;
    var p = player.post;
    if (p.liked) { p.liked = false; p.likes = Math.max(0, (p.likes || 0) - 1); }
    else { p.liked = true; p.likes = (p.likes || 0) + 1; }
    save();
    updateActNums();
  }
  function favToggle() {
    if (!player) return;
    var p = player.post;
    if (p.faved) { p.faved = false; p.favs = Math.max(0, (p.favs || 0) - 1); }
    else { p.faved = true; p.favs = (p.favs || 0) + 1; addList("favs", p.id); }
    save();
    updateActNums();
  }

  function doRefresh(btn) {
    var st = S.state;
    REFRESHING = true;
    renderHome();
    aiRun(btn, function () { return C.ai.generateFeed(st); }).then(function (r) {
      REFRESHING = false;
      if (r === undefined) { renderHome(); return; }
      feedAt = Date.now();
      st.feedAt = feedAt;
      save();
      toast("刷新完成");
      renderAll();
    });
  }

  function publishDynamic(text, useAI) {
    var st = S.state;
    var btn = null;
    function mk(txt) {
      var post = {
        id: "p" + Date.now(), kind: "dynamic", creatorId: "me",
        text: txt, at: Date.now(), comments: []
      };
      st.posts = st.posts || [];
      st.posts.unshift(post);
      save();
      closeModal();
      toast("已发布");
      renderAll();
    }
    if (!useAI) { mk(text); return; }
    aiRun(btn, function () { return C.ai.dynamicText(st, text); }).then(function (r) {
      if (r === undefined) return;
      mk(typeof r === "string" ? r : text);
    });
  }

  /* ================= 事件绑定 ================= */

  function onClick(e) {
    var scrim = e.target.closest && e.target.closest(".jl-scrim");
    if (scrim && !e.target.closest(".jl-sheet")) { closeModal(); return; }
    var btn = e.target.closest && e.target.closest("[data-jili-action]");
    if (!btn) return;
    if (suppressClick) { suppressClick = false; return; }
    var act = btn.getAttribute("data-jili-action");
    var id = btn.getAttribute("data-id");
    var st = S.state;
    switch (act) {
      case "tab": showTab(id); break;
      case "plus": openChooser(); break;
      case "back": {
        var ov = btn.closest("[data-ov]");
        if (ov) closeOv(ov.getAttribute("data-ov"));
        break;
      }
      case "refresh": doRefresh(btn); break;
      case "homeSeg": HOME_SEG = id; renderHome(); break;
      case "goMe": showTab("me"); break;
      case "openPost": if (id) openPost(id); break;
      case "openLive": openLive(id); break;
      case "openSpace": openSpace(id); break;
      case "cmTabSet": cmTab = id; var tb = $(".jlp-tabs", ovEl("post")); if (tb) $$("button", tb).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-id") === id); }); renderPostBody(); break;
      case "playToggle":
        if (player) {
          if (!player.playing && player.time >= (player.post.durationSec || 60)) player.time = 0;
          player.playing = !player.playing;
          setPlayBtn();
        }
        break;
      case "ratePop": { var rp = $("#jili-ratepop", ovEl("post")); if (rp) rp.hidden = !rp.hidden; break; }
      case "rateSet":
        if (player) {
          player.rate = Number(id) || 1;
          var rb = $("#jili-ratebtn", ovEl("post"));
          if (rb) rb.textContent = player.rate + "x";
        }
        var rp2 = $("#jili-ratepop", ovEl("post"));
        if (rp2) { rp2.hidden = true; $$("button", rp2).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-id") === id); }); }
        break;
      case "dmToggle":
        if (player) {
          player.dmOn = !player.dmOn;
          var layer = $("#jili-dmlayer", ovEl("post"));
          if (layer) layer.style.display = player.dmOn ? "" : "none";
          var dvt = ovEl("post");
          $$('[data-jili-action="dmToggle"]', dvt).forEach(function (b) { b.classList.toggle("off", !player.dmOn); });
        }
        break;
      case "dmSet": { var ds = $("#jili-dmset", ovEl("post")); if (ds) ds.hidden = !ds.hidden; break; }
      case "dmSetClose": { var ds2 = $("#jili-dmset", ovEl("post")); if (ds2) ds2.hidden = true; break; }
      case "dmBlockAdd": {
        var inp = $("#jili-dm-block", ovEl("post"));
        if (inp && inp.value.trim()) {
          st.settings.dmBlock = String(st.settings.dmBlock || "") + (st.settings.dmBlock ? "," : "") + inp.value.trim();
          save(); inp.value = "";
          var ds3 = $("#jili-dmset", ovEl("post"));
          if (ds3) { ds3.innerHTML = dmSetHTML(); ds3.hidden = false; }
        }
        break;
      }
      case "dmBlockDel": {
        var words = String(st.settings.dmBlock || "").split(/[,，、\s]+/).filter(function (w) { return w && w !== id; });
        st.settings.dmBlock = words.join(",");
        save();
        var ds4 = $("#jili-dmset", ovEl("post"));
        if (ds4) ds4.innerHTML = dmSetHTML();
        break;
      }
      case "pipBtn": {
        if (!player) break;
        try {
          if (!player.pipCanvas) {
            player.pipCanvas = document.createElement("canvas");
            player.pipCanvas.width = 320; player.pipCanvas.height = 180;
            player.pipVideo = document.createElement("video");
            player.pipVideo.muted = true;
            player.pipVideo.srcObject = player.pipCanvas.captureStream(10);
            player.pipVideo.play();
          }
          if (document.pictureInPictureElement) document.exitPictureInPicture();
          else player.pipVideo.requestPictureInPicture();
        } catch (err) { toast("此设备不支持画中画"); }
        break;
      }
      case "fsBtn": {
        var stage = $('[data-stage="1"]', ovEl("post"));
        if (stage) {
          if (document.fullscreenElement) document.exitFullscreen();
          else stage.requestFullscreen && stage.requestFullscreen();
        }
        break;
      }
      case "dislike":
        if (player) {
          var dp = player.post;
          if (dp.disliked) { dp.disliked = false; dp.dislikes = Math.max(0, (dp.dislikes || 0) - 1); }
          else {
            dp.disliked = true;
            dp.dislikes = (dp.dislikes || 0) + 1;
            if (dp.liked) { dp.liked = false; dp.likes = Math.max(0, (dp.likes || 0) - 1); }
          }
          save();
          updateActNums();
        }
        break;
      case "fav": favToggle(); break;
      case "share": {
        if (player) { player.post.shares = (player.post.shares || 0) + 1; save(); }
        toast("已复制链接");
        break;
      }
      case "titleToggle": TITLE_OPEN = !TITLE_OPEN; if (btn) btn.classList.toggle("open", TITLE_OPEN); break;
      case "cmSortToggle": cmSort = cmSort === "hot" ? "time" : "hot"; renderPostBody(); break;
      case "cmSearchFocus": { var csi = $("#jili-cm-input", ovEl("post")); if (csi) csi.focus(); break; }
      case "cmEmoji": { var cei = $("#jili-cm-input", ovEl("post")); if (cei) { cei.value += "😊"; cei.focus(); } break; }
      case "cmReplyBtn": {
        var p2 = postOf(player && player.post.id);
        var c2 = p2 && (p2.comments || []).filter(function (x) { return String(x.id) === String(id); })[0];
        if (c2) { cmReplyTo = { id: c2.id, name: c2.name }; renderPostBody(); }
        break;
      }
      case "cmCancel": cmReplyTo = null; renderPostBody(); break;
      case "cmLike": {
        var p3 = postOf(player && player.post.id);
        var c3 = p3 && (p3.comments || []).filter(function (x) { return String(x.id) === String(id); })[0];
        if (c3) {
          if (c3.liked) { c3.liked = false; c3.likes = Math.max(0, (c3.likes || 0) - 1); }
          else { c3.liked = true; c3.likes = (c3.likes || 0) + 1; }
          save(); renderPostBody();
        }
        break;
      }
      case "cmDel": {
        var p4 = postOf(player && player.post.id);
        if (p4) {
          p4.comments = (p4.comments || []).filter(function (x) { return String(x.id) !== String(id); });
          save(); renderPostBody();
        }
        break;
      }
      case "cmSend": sendComment(); break;
      case "openInbox": openInboxPage(id); break;
      case "inboxSeg": INBOX_CAT = id; openInboxPage(id); break;
      case "ibFollow": {
        st.fanFollowBack = st.fanFollowBack || {};
        st.fanFollowBack[id] = true;
        save(); toast("已回关");
        openInboxPage(INBOX_CAT);
        break;
      }
      case "openFanmail": openFanmail(); break;
      case "openFanmailDetail": openFanmailDetail(id); break;
      case "fmSend": {
        var finp = $("#jili-fm-input", ovEl("fanmaildetail"));
        if (!finp || !finp.value.trim()) break;
        var mailId = btn.getAttribute("data-id");
        var mail = (st.fanMail || []).filter(function (x) { return String(x.id) === String(mailId); })[0];
        if (!mail) break;
        mail.reply = finp.value.trim();
        mail.repliedAt = Date.now();
        save();
        openFanmailDetail(mailId);
        aiRun(btn, function () { return C.ai.fanMailReply(st, mailId); }).then(function (r) {
          if (r !== undefined) openFanmailDetail(mailId);
        });
        break;
      }
      case "openDM": openDM(id); break;
      case "dmOpen": {
        closeModal();
        var dmOv = ovEl("dm");
        if (!dmOv) openDM(id); else renderDMPage(id);
        break;
      }
      case "dmSend": {
        var dinp = $("#jili-dm-input", ovEl("dm"));
        if (dinp && dinp.value.trim()) { dmSendText(id, dinp.value); }
        break;
      }
      case "dmAsk": {
        var cid = btn.getAttribute("data-id");
        liveP = liveP || {};
        liveP.dmTyping = cid;
        renderDMPage(cid);
        aiRun(null, function () { return C.ai.dmReply(st, cid, ""); }).then(function (r) {
          if (liveP) liveP.dmTyping = null;
          if (ovEl("dm")) renderDMPage(cid);
        });
        break;
      }
      case "dmReroll": {
        var cid2 = btn.getAttribute("data-id");
        var tid2 = C.threadId(cid2);
        var mine = msgsOf(tid2).filter(function (m) { return m.from === "me"; });
        var last = mine[mine.length - 1];
        aiRun(null, function () { return C.ai.dmReply(st, cid2, last ? last.text : ""); }).then(function (r) {
          if (r !== undefined && ovEl("dm")) renderDMPage(cid2);
        });
        break;
      }
      case "dmSpace": openSpace(id); break;
      case "dmCharge": openCharge(id); break;
      case "openSettings": openSettings(); break;
      case "saveApiSettings": {
        var ak = $("#jili-setting-apikey", ovEl("settings"));
        var au = $("#jili-setting-apiurl", ovEl("settings"));
        var am = $("#jili-setting-model", ovEl("settings"));
        st.settings.apiKey = ak ? ak.value.trim() : "";
        st.settings.apiUrl = au ? au.value.trim() : "";
        st.settings.model = am ? am.value.trim() : "";
        save(); toast("API 设置已保存");
        break;
      }
      case "testApi": {
        if (!st.settings.apiKey) { toast("请先填写 API Key"); break; }
        toast("正在测试连接…");
        aiRun(btn, function () { return C.ai.draftWorldview(st, ""); }).then(function (r) {
          if (r !== undefined) toast("API 连接成功");
        });
        break;
      }
      case "worldDraft": {
        var ta = $("#jili-setting-world", ovEl("settings"));
        aiRun(btn, function () { return C.ai.draftWorldview(st, ""); }).then(function (r) {
          if (r !== undefined && ta) { ta.value = st.worldview || ""; toast("世界观已生成"); }
        });
        break;
      }
      case "worldClear": {
        st.worldview = "";
        save();
        var ta2 = $("#jili-setting-world", ovEl("settings"));
        if (ta2) ta2.value = "";
        toast("已清空");
        break;
      }
      case "giftFxSet": {
        st.settings.giftFx = id; save();
        $$("[data-jili-action='giftFxSet']", ovEl("settings")).forEach(function (b) {
          b.classList.toggle("on", b.getAttribute("data-id") === id);
        });
        break;
      }
      case "avatarPick": {
        var af = $("#jili-setting-avatar-file", ovEl("settings"));
        if (af) af.click();
        break;
      }
      case "saveProfile": {
        var un = $("#jili-setting-username", ovEl("settings"));
        if (un) st.userName = un.value.trim() || "阿澈";
        save();
        openSettings();
        if (TAB === "me") renderMe();
        toast("资料已保存");
        break;
      }
      case "wipeData": {
        if (window.confirm("清空叽哩叽哩的所有数据？此操作不可恢复。")) {
          C.reset();
          S.state = C.load();
          closeModal();
          ["post", "live", "settings", "space", "dm", "inbox", "fanmail", "fanmaildetail", "list", "manuscripts", "workshop", "creditor", "upload", "notices"].forEach(closeOv);
          TAB = "home"; HOME_SEG = "rec";
          renderAll();
          toast("已清空并重置");
        }
        break;
      }
      case "openList": openListPage(id); break;
      case "listDel": {
        var key = LIST_MODE;
        st[key] = (st[key] || []).filter(function (x) { return String(x.id) !== String(id); });
        save(); renderListPage();
        break;
      }
      case "meDyn": openManuscripts(); break;
      case "goFollow": showTab("follow"); break;
      case "meCharged": openChargePage(); break;
      case "switchUser": toast("切换身份下一期上线"); break;
      case "rechargeOpen": openRecharge(); break;
      case "recharge": {
        var n = Number(id) || 6;
        st.jibi = (st.jibi || 0) + n * 600;
        save(); closeModal();
        toast("到账 " + (n * 600) + " 叽币");
        if (TAB === "me") renderMe();
        break;
      }
      case "charge": {
        var cid3 = btn.getAttribute("data-id");
        if ((st.jibi || 0) < 30) { toast("叽币不够，先充值"); break; }
        st.jibi -= 30;
        st.charged = st.charged || [];
        st.charged.push({ creatorId: cid3, until: Date.now() + 30 * 86400000 });
        save(); closeModal();
        toast("已给 " + (creatorOf(cid3) || {}).name + " 充电");
        break;
      }
      case "withdraw": {
        if (!st.earnings || st.earnings <= 0) { toast("暂时没有可提现的收入，开播收到打赏后就有了"); break; }
        toast("已提现 ¥" + Number(st.earnings).toFixed(2));
        st.earnings = 0; save(); renderMe();
        break;
      }
      case "myLive": openMyLive(); break;
      case "openReplay": openReplay(id); break;
      case "startLiveModal": closeModal(); startLiveModal(); break;
      case "startLiveNow": startLiveNow(); break;
      case "openWallet": openWallet(); break;
      case "openChargePage": openChargePage(); break;
      case "withdrawWallet": toast("提现功能即将上线"); break;
      case "openManuscripts": openManuscripts(); break;
      case "openWorkshop": closeModal(); openWorkshop(); break;
      case "wsTab": openWorkshop(id); break;
      case "wsType": {
        var dws = ovEl("workshop");
        if (dws) $$(".ws-type", dws).forEach(function (b) { b.classList.toggle("on", b === btn); });
        break;
      }
      case "wsSrc": btn.classList.toggle("on"); break;
      case "wsSave": {
        var dw = ovEl("workshop");
        if (!dw) break;
        var nmw = $("#jili-ws-name", dw).value.trim();
        if (!nmw) { toast("先给主播起个名字"); break; }
        var tw = $(".ws-type.on", dw);
        var fansw = Number($("#jili-ws-fans", dw).value);
        st.creators.push(C.makeCreator({
          name: nmw,
          type: tw ? tw.getAttribute("data-id") : "virtual",
          area: ($("#jili-ws-area", dw) || {}).value || "chat",
          persona: $("#jili-ws-persona", dw).value.trim(),
          catchphrase: $("#jili-ws-catch", dw).value.trim(),
          fanName: $("#jili-ws-fanname", dw).value.trim(),
          looks: $("#jili-ws-looks", dw).value.trim(),
          schedule: $("#jili-ws-sched", dw).value.trim(),
          fans: fansw > 0 ? Math.floor(fansw) : 1000,
          followReply: "",
          visual: { img: !!$(".ws-src.on[data-id='img']", dw), vid: !!$(".ws-src.on[data-id='vid']", dw) }
        }));
        save();
        toast("主播已保存");
        openWorkshop("mine");
        break;
      }
      case "wsCharUp": {
        var chUp = (st.characters || []).filter(function (x) { return String(x.id) === String(id); })[0];
        if (!chUp) break;
        aiRun(btn, function () { return C.ai.createCreator(st, chUp); }).then(function (r) {
          if (r === undefined) return;
          toast("「" + r.name + "」已入驻");
          openWorkshop("mine");
        });
        break;
      }
      case "openDynModal": openDynModal(); break;
      case "openUpload": closeModal(); openUpload(); break;
      case "uploadGen": {
        var intro = $("#jili-up-intro", ovEl("upload"));
        var brief = intro && intro.value.trim();
        if (!brief) { toast("先写几句简介"); break; }
        aiRun(btn, function () { return C.ai.uploadVideo(st, brief); }).then(function (r) {
          if (r === undefined) return;
          uploadDraft = r;
          showUploadPreview(uploadDraft);
        });
        break;
      }
      case "uploadPub": {
        toast("发布成功");
        closeModal();
        var up = ovEl("upload");
        if (up) closeOv("upload");
        HOME_SEG = "rec"; renderAll();
        var pub = uploadDraft;
        uploadDraft = null;
        if (pub) {
          var pubId = pub.id;
          aiRun(null, function () { return C.ai.uploadReception(st, postOf(pubId)); }).then(function (r) {
            if (r === undefined) return;
            applyReception({ id: pubId }, r);
            toast("第一波观众反响来了");
          });
        }
        break;
      }
      case "postDelete": {
        st.posts = (st.posts || []).filter(function (p) { return String(p.id) !== String(id); });
        save(); toast("已删除"); openManuscripts();
        break;
      }
      case "creatorEdit": openCreatorEditor(id); break;
      case "creatorSave": {
        var cr = creatorOf(id);
        var d5 = ovEl("creditor");
        if (cr && d5) {
          var nm = $("#jili-cr-name", d5).value.trim();
          if (!nm) { toast("先填名字"); break; }
          cr.name = nm;
          cr.persona = $("#jili-cr-persona", d5).value.trim();
          cr.catchphrase = $("#jili-cr-catch", d5).value.trim();
          cr.fanName = $("#jili-cr-fanname", d5).value.trim();
          cr.area = $("#jili-cr-area", d5).value.trim();
          cr.schedule = $("#jili-cr-sched", d5).value.trim();
          save(); toast("资料已更新");
          closeOv("creditor");
          openWorkshop();
        }
        break;
      }
      case "creatorDelete": {
        var cr2 = creatorOf(id);
        if (!cr2) break;
        if (window.confirm("删除「" + cr2.name + "」？TA 的视频、动态和私信会一起删掉。")) {
          var tid3 = C.threadId(id);
          st.creators = (st.creators || []).filter(function (x) { return String(x.id) !== String(id); });
          st.posts = (st.posts || []).filter(function (p) { return String(p.creatorId) !== String(id); });
          st.dmMessages = (st.dmMessages || []).filter(function (m) { return m.threadId !== tid3; });
          st.dms = (st.dms || []).filter(function (t) { return t.creatorId !== id; });
          st.liveRooms = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) !== String(id); });
          save(); toast("已删除");
          openWorkshop();
        }
        break;
      }
      case "followToggle": {
        st.following = st.following || [];
        var at = st.following.indexOf(id);
        if (at >= 0) { st.following.splice(at, 1); toast("已取消关注"); }
        else { st.following.push(id); toast("关注成功"); }
        save();
        var sp = ovEl("space");
        if (sp) renderSpacePage(sp.getAttribute("data-cid"));
        if (player) renderPostBody();
        break;
      }
      case "spaceSeg": {
        SPACE_SEG = id;
        var sp2 = ovEl("space");
        if (sp2) renderSpacePage(sp2.getAttribute("data-cid"));
        break;
      }
      case "spaceSort": {
        SPACE_SORT = SPACE_SORT === "new" ? "hot" : "new";
        var sp3 = ovEl("space");
        if (sp3) renderSpacePage(sp3.getAttribute("data-cid"));
        break;
      }
      case "spacePlayAll": {
        var cr4 = creatorOf(id);
        if (cr4) {
          var vids4 = (st.posts || []).filter(function (p) { return String(p.creatorId) === String(id) && p.kind === "video"; })
            .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
          if (vids4.length) { openPost(vids4[0].id); toast("正在播放全部视频"); }
          else toast("还没有投稿");
        }
        break;
      }
      case "vFav": {
        addList("favs", id);
        toast("已收藏");
        break;
      }
      case "bioToggle": {
        var bio5 = document.querySelector(".jlsp-bio");
        if (bio5) {
          var det5 = bio5.querySelector(".jlsp-biodet");
          if (bio5.getAttribute("data-expanded") === "1") {
            bio5.setAttribute("data-expanded", "0");
            var cr5 = creatorOf(ovEl("space") && ovEl("space").getAttribute("data-cid"));
            if (cr5) {
              var b5 = cr5.persona || cr5.catchphrase || "";
              var bs5 = b5.length > 40 ? b5.slice(0, 40) + "…" : b5;
              bio5.innerHTML = esc(bs5) + (b5.length > 40 ? ' <a class="jlsp-biodet" data-jili-action="bioToggle">详情</a>' : "");
            }
          } else {
            bio5.setAttribute("data-expanded", "1");
            var cr6 = creatorOf(ovEl("space") && ovEl("space").getAttribute("data-cid"));
            if (cr6) {
              var b6 = cr6.persona || cr6.catchphrase || "";
              bio5.innerHTML = esc(b6) + ' <a class="jlsp-biodet" data-jili-action="bioToggle">收起</a>';
            }
          }
        }
        break;
      }
      case "liveSrcImg":
      case "liveSrcVid": {
        if (!liveP) break;
        var isImg = act === "liveSrcImg";
        var stage = $(".jlv-landstage", ovEl("live"));
        if (stage) stage.style.cssText = coverStyle("src:" + liveP.room.id + ":" + Date.now());
        chatLine("<i>系统</i><b>：</b>" + (isImg ? "主播用 AI 生成了新的直播画面" : "主播生成了新的视频片段并开始播放"));
        aiRun(btn, function () {
          return C.ai.liveRound(st, liveP.room.id, isImg
            ? "（刚刚用 AI 生成了全新的直播画面并展示给观众，请观众围绕新画面自然反应）"
            : "（刚刚生成了一段新的视频并开始播放，请观众围绕新视频内容自然反应）");
        }).then(function (r) {
          if (r === undefined || !liveP) return;
          liveP.queue = liveP.queue.concat((r && r.lines) || r || []);
          if (!liveP.pumpT) pumpQueue();
        });
        break;
      }
      case "liveFollow": {
        st.following = st.following || [];
        var at2 = st.following.indexOf(id);
        if (at2 >= 0) st.following.splice(at2, 1);
        else st.following.push(id);
        save();
        btn.textContent = isFollowed(id) ? "已关注" : "关注";
        break;
      }
      case "liveSend": {
        var linp = $("#jili-live-input", ovEl("live"));
        if (!linp || !linp.value.trim() || !liveP) break;
        var text = linp.value.trim();
        linp.value = "";
        chatLine("<b>" + esc(st.userName || "我") + "：</b>" + esc(text));
        aiRun(null, function () { return C.ai.liveRound(st, liveP.room.id, text); }).then(function (r) {
          if (r === undefined || !liveP) return;
          liveP.queue = liveP.queue.concat((r && r.lines) || r || []);
          if (!liveP.pumpT) pumpQueue();
        });
        break;
      }
      case "endLive": {
        if (liveP && String(liveP.room.creatorId) === "me") {
          stopLive();
          closeOv("live");
          toast("直播已结束");
        }
        break;
      }
      case "giftOpen": { var gs = $("#jili-giftsheet", ovEl("live")); if (gs) gs.hidden = false; break; }
      case "giftClose": { var gs2 = $("#jili-giftsheet", ovEl("live")); if (gs2) gs2.hidden = true; break; }
      case "giftSend": {
        if (!liveP) break;
        var g2 = (C.GIFTS || []).filter(function (x) { return x.id === id; })[0];
        if (!g2) break;
        if ((st.jibi || 0) < g2.price) { toast("叽币不够，先充值"); break; }
        st.jibi -= g2.price; save();
        var gs3 = $("#jili-giftsheet", ovEl("live"));
        if (gs3) gs3.hidden = true;
        applyRound([{ type: "gift", name: st.userName || "我", gift: g2.id, count: 1, price: g2.price }]);
        chatLine("<b>" + esc(st.userName || "我") + "</b> 送出了 " + esc(g2.name) + " ×1");
        break;
      }
      case "dynPublish": {
        var dt = $("#jili-dyn-text");
        if (dt && dt.value.trim()) publishDynamic(dt.value.trim(), false);
        break;
      }
      case "dynPublishAI": {
        var dt2 = $("#jili-dyn-text");
        if (dt2 && dt2.value.trim()) publishDynamic(dt2.value.trim(), true);
        break;
      }
      case "openSeries": if (id) openSeriesPage(id); break;
      case "seriesSeason": {
        var sname = btn.getAttribute("data-series");
        if (sname) { SERIES_SEASON[sname] = Number(id) || 1; openSeriesPage(sname); }
        break;
      }
      case "filmView": FILM_VIEW = id; renderHome(); break;
      case "filmKind": FILM_KIND = id; FILM_VIEW = "lib"; renderHome(); loadFilmLib(); break;
      case "filmSort": FILM_SORT = id; filmCache.movie = null; filmCache.doc = null; loadFilmLib(); break;
      case "filmReload": filmCache[FILM_KIND] = null; loadFilmLib(); break;
      case "filmDetail": if (id) openFilmDetail(id); break;
      case "filmWant": filmWantToggle(id); break;
      case "filmWatch": filmWatchStart(id); break;
      case "filmEp": filmEpWatch(id); break;
      case "filmOpen": filmLinkOpen(); break;
      case "openScreen": openScreenSetup(null); break;
      case "screenResume": screenResume(id); break;
      case "screenTab": {
        SCR_TAB = id;
        var dsr = ovEl("scrsetup");
        if (dsr) {
          $$("[data-src]", dsr).forEach(function (f) { f.hidden = f.getAttribute("data-src") !== id; });
          $$(".jls-seg button", dsr).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-id") === id); });
        }
        break;
      }
      case "screenChar": {
        var scid = String(id);
        var sat = SCR_SEL.indexOf(scid);
        if (sat >= 0) { if (SCR_SEL.length > 1) SCR_SEL.splice(sat, 1); }
        else {
          if (SCR_SEL.length >= 3) { toast("最多选 3 位"); break; }
          SCR_SEL.push(scid);
        }
        var scw = $("#jili-screening-chars", ovEl("scrsetup"));
        if (scw) scw.innerHTML = screenCharsHTML(SCR_SEL);
        break;
      }
      case "screenStart": {
        var scfg = screenCollectStart();
        if (scfg) openScreenRoom(scfg);
        break;
      }
      case "screenSend": scrSay(); break;
      case "screenPause": if (SCR) setScrPaused(!SCR.paused); break;
      case "screenSync": scrSync(); break;
      case "screenEnd": endScreening(); break;
      case "openStudio": openStudio(); break;
      case "studioStart": studioStart(); break;
      case "coin": coinToggle(); break;
      case "dmSendV": sendVideoDm(); break;
      case "addFriend": addFriend(id, btn); break;
      case "threadOpen": threadOpen(id); break;
      case "comingSoon": toast("这个功能下一期上线"); break;
      default: break;
    }
  }

  function sendComment() {
    if (!player) return;
    var inp = $("#jili-cm-input", ovEl("post"));
    var text = inp && inp.value.trim();
    if (!text) return;
    var pid = player.post.id;
    var st = S.state;
    var reply = cmReplyTo;
    aiRun(null, function () { return C.ai.commentReply(st, pid, text); }).then(function (r) {
      if (r === undefined) return;
      if (reply) {
        var c = (postOf(pid).comments || []).filter(function (x) { return String(x.id) === String(reply.id); })[0];
        if (c) {
          c.replies = c.replies || [];
          c.replies.push({ id: "r" + Date.now(), name: st.userName || "我", text: text, at: Date.now() });
          save();
        }
      }
      cmReplyTo = null;
      if (inp) inp.value = "";
      cmTab = "comments";
      renderPostBody();
      updateActNums();
    });
  }

  function onChange(e) {
    var t = e.target;
    if (!t || !t.id) return;
    var st = S.state;
    if (t.id.indexOf("jili-setting-") === 0 && t.type === "checkbox") {
      var key = t.id.slice("jili-setting-".length);
      st.settings[key] = t.checked;
      save();
      return;
    }
    if (t.id === "jili-setting-world") {
      st.worldview = t.value;
      save();
      return;
    }
    if (t.id === "jili-dm-react") {
      st.settings.dmReactOn = t.checked;
      save();
      return;
    }
    if (t.id === "jili-dm-opacity") { st.settings.dmOpacity = Number(t.value); save(); return; }
    if (t.id === "jili-dm-speed") { st.settings.dmSpeed = Number(t.value); save(); return; }
    if (t.id === "jili-dm-size") { st.settings.dmSize = Number(t.value); save(); return; }
    if (t.id === "jili-setting-sceneCount") { st.settings.sceneCount = Number(t.value); save(); return; }
    if (t.id === "jili-setting-voiceVolume") { st.settings.voiceVolume = Number(t.value); save(); return; }
    if (t.id === "jili-setting-voiceRate") { st.settings.voiceRate = Number(t.value); save(); return; }
    if (t.id === "jili-setting-avatar-file" && t.files && t.files[0]) {
      var file = t.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 256;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          S.state.userAvatar = cv.toDataURL("image/jpeg", 0.85);
          save();
          openSettings();
          if (TAB === "me") renderMe();
          toast("头像已更新");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      t.value = "";
      return;
    }
  }

  function onKeyDown(e) {
    if (e.key !== "Enter") return;
    var t = e.target;
    if (!t || t.tagName !== "INPUT") return;
    if (t.id === "jili-dm-input") {
      var btn = $('[data-jili-action="dmSend"]', ovEl("dm"));
      if (btn) btn.click();
    } else if (t.id === "jili-live-input") {
      var btn2 = $('[data-jili-action="liveSend"]', ovEl("live"));
      if (btn2) btn2.click();
    } else if (t.id === "jili-cm-input") {
      sendComment();
    } else if (t.id === "jili-dm-text") {
      sendVideoDm();
    } else if (t.id === "jili-screening-say") {
      scrSay();
    } else if (t.id === "jili-film-link") {
      filmLinkOpen();
    } else if (t.id === "jili-fm-input") {
      var btn3 = $('[data-jili-action="fmSend"]', ovEl("fanmaildetail"));
      if (btn3) btn3.click();
    }
  }

  /* 三连长按：pointer 事件在根上委托 */
  function onPointerDown(e) {
    var btn = e.target.closest && e.target.closest('[data-tri="1"]');
    if (!btn) return;
    suppressClick = true;
    triDown(e, btn);
  }

  /* ================= 挂起/恢复（屏幕非 active 时暂停） ================= */

  function pauseAll() {
    if (player && player.timer) { clearInterval(player.timer); player.timer = null; }
    if (liveP && liveP.pumpT) { clearTimeout(liveP.pumpT); liveP.pumpT = null; }
  }
  function resumeAll() {
    startPlayerTimer();
    if (liveP && liveP.queue.length && !liveP.pumpT) pumpQueue();
  }

  /* ================= 初始化 & 导出 ================= */

  function init() {
    ui.screen = document.getElementById("jili-screen");
    if (!ui.screen) return;
    var phoneScreen = document.querySelector(".phone-screen");
    if (phoneScreen && ui.screen.parentElement !== phoneScreen) {
      phoneScreen.appendChild(ui.screen);
    }
    ui.root = document.getElementById("jili-root");
    if (!ui.root) {
      if (typeof window.injectJiliHTML === "function") window.injectJiliHTML();
      ui.root = document.getElementById("jili-root");
    }
    if (!ui.root) return;
    ui.main = document.getElementById("jili-main");
    ui.tabbar = document.getElementById("jili-tabbar");
    ui.ov = document.getElementById("jili-ov");
    ui.modals = document.getElementById("jili-modals");

    ui.root.addEventListener("click", onClick);
    ui.root.addEventListener("change", onChange);
    ui.root.addEventListener("keydown", onKeyDown);
    ui.root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", triMove);
    window.addEventListener("pointerup", function (e) {
      var btn = $('[data-tri="1"]', ovEl("post"));
      if (btn && tri.active) triUp(btn);
    });

    if (typeof MutationObserver === "function") {
      var mo = new MutationObserver(function () {
        if (ui.screen.classList.contains("active")) {
          syncChars();
          if (TAB === "home" && HOME_SEG === "film" && FILM_VIEW === "lib" && !filmCache[FILM_KIND] && !filmCache.loading) setTimeout(loadFilmLib, 0);
          resumeAll();
        } else pauseAll();
      });
      mo.observe(ui.screen, { attributes: true, attributeFilter: ["class"] });
    }

    syncChars();
    // feedAt 持久化：优先读存档；老存档没有但有帖子时按已生成过恢复（否则内容会被空状态挡住）
    feedAt = Number(S.state.feedAt) || ((S.state.posts || []).length ? ((S.state.posts[0].at || Date.now())) : 0);
    renderAll();
  }

  window.JiliApp = {
    reload: function () { S.state = C.load(); renderAll(); },
    refresh: function () { doRefresh(null); return busy; },
    openPost: openPost,
    openLive: openLive,
    openSpace: openSpace,
    openSettings: openSettings,
    openMyLive: openMyLive,
    openWallet: openWallet,
    showTab: showTab,
    getState: function () { return S.state; },
    busy: function () { return busy; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
