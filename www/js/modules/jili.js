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
  C.markState(S.state);
  var busy = false;
  var TAB = "home";
  var HOME_SEG = "rec";
  var SPACE_SEG = "video";
  var SPACE_SORT = "new";       // new 最新发布 / hot 最多播放
  var SPACE_FAN_OPEN = false;   // 空间页「我的粉丝牌」是否展开
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
  var LIVE_CAT = "all";     // 直播页当前分类
  var LIVE_CATS_OPEN = false;
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

  /* 多账号（对齐 nuojiji）：个人号 me + 共创账号（team creators） */
  function pubId() { return S.state.activePublisherId || "me"; }
  function teamAccounts() {
    return (S.state.creators || []).filter(function (c) { return c.accountType === "team" && c.ownedByUser; });
  }
  function acctName(id) {
    if (String(id) === "me") return S.state.userName || "我";
    var cr = creatorOf(id);
    return cr && cr.name ? cr.name : (S.state.userName || "我");
  }
  function tidFor(cid) { return C.threadId(cid, pubId()); }
  function unreadByAcct(id) {
    return (S.state.dms || []).filter(function (t) {
      return String(t.threadId || "").indexOf("@" + id) >= 0;
    }).reduce(function (s, t) { return s + (Number(t.unread) || 0); }, 0);
  }
  function meIdentity() {
    var id = pubId();
    if (String(id) === "me") return { name: S.state.userName || "我", avatarRef: S.state.userAvatar || "" };
    var cr = creatorOf(id);
    return cr ? { name: cr.name, avatarRef: cr.avatarRef || "" } : { name: S.state.userName || "我", avatarRef: S.state.userAvatar || "" };
  }

  /* ================= 切换账号 / 共创账号 ================= */

  function acctRowHTML(id, name, typeLabel, isTeam) {
    var cur = String(id) === String(pubId());
    var unread = unreadByAcct(id);
    var av = String(id) === "me" ? avHTML({ id: "me", name: name, avatarRef: S.state.userAvatar }, 44) : avHTML(creatorOf(id) || { id: id, name: name }, 44);
    var side = (unread > 0 && !cur ? '<b class="jl-num">' + (unread > 99 ? "99+" : unread) + "</b>" : "") +
      '<span class="jl-tagline">' + (cur ? "当前使用中" : "点击切换") + "</span>" +
      (isTeam ? '<button class="jl-btn sm ghost" data-jili-action="teamEdit" data-id="' + esc(id) + '">管理</button>' : "");
    return '<div class="jl-crow" data-jili-action="acctSwitch" data-id="' + esc(id) + '">' + av +
      '<span class="jili-rowb"><b class="jl-one">' + esc(name) + "</b><small>" + typeLabel + "</small></span>" +
      '<span class="jili-dmside">' + side + "</span></div>";
  }

  function openSwitchAccount() {
    var st = S.state;
    var rows = [acctRowHTML("me", st.userName || "我", "个人账号", false)];
    teamAccounts().forEach(function (t) { rows.push(acctRowHTML(t.id, t.name, "全体账号", true)); });
    var html = titlebar("切换账号") + '<div class="jl-scroll">' +
      '<p class="jl-hint" style="padding:0 16px">切换后，叽哩主页、空间、投稿、动态和直播都会使用这个账号。</p>' +
      '<div class="jl-secthead" style="padding:0 16px;margin-top:14px"><b>当前用户的叽哩账号</b></div>' +
      rows.join("") +
      '<button class="jl-widetile" data-jili-action="teamNew"><b>＋ 新增共创账号</b><span>选择多名角色，共同经营一个整体账号</span></button>' +
      '<p class="jl-hint" style="padding:14px 16px">个人号和共创号只存在于当前用户内，彼此不会串数据。</p>' +
      "</div>";
    pushOv("acct", html, 36);
  }

  var TEAM_EDIT_ID = null;
  var teamDraft = {};
  function teamNamesOf(t) {
    var st = S.state;
    return (t.memberCharIds || []).map(function (id) {
      var c = (st.characters || []).filter(function (x) { return String(x.id) === String(id); })[0];
      return c ? c.name : null;
    }).filter(Boolean);
  }

  function openTeamAccounts(editId) {
    TEAM_EDIT_ID = editId || null;
    if (TEAM_EDIT_ID === "new") teamDraft = {};
    renderTeamPage();
  }

  function renderTeamPage() {
    var st = S.state;
    var d = ovEl("team");
    if (TEAM_EDIT_ID) {
      var isNew = TEAM_EDIT_ID === "new";
      var t = isNew ? { memberCharIds: (teamDraft.memberCharIds || []).slice() } : (creatorOf(TEAM_EDIT_ID) || {});
      var memberIds = (t.memberCharIds || []).map(String);
      var ownerRow = '<div class="jl-crow">' + avHTML(meIdentity(), 44) +
        '<span class="jili-rowb"><b>' + esc(st.userName || "我") + '</b><small>创建者</small></span>' +
        '<span class="jl-tagline">已加入</span></div>';
      var memberRows = (st.characters || []).map(function (c) {
        var inTeam = memberIds.some(function (x) { return x === String(c.id); });
        return '<div class="jl-crow">' + avHTML({ id: c.id, name: c.name, avatarRef: c.avatar }, 44) +
          '<span class="jili-rowb"><b class="jl-one">' + esc(c.name) + "</b></span>" +
          '<button class="jl-btn sm' + (inTeam ? " ghost" : "") + '" data-jili-action="teamMemberToggle" data-id="' + esc(c.id) + '">' + (inTeam ? "已加入" : "加入") + "</button></div>";
      }).join("") || '<p class="jl-hint" style="padding:0 16px">聊天列表里还没有角色</p>';
      var html = titlebar(isNew ? "新建全体账号" : "编辑全体账号") + '<div class="jl-scroll">' +
        '<div class="jl-field" style="margin:12px 16px"><label>账号名称</label>' +
        '<input id="jili-team-name" value="' + esc(t.name || "") + '" placeholder="给这个共创账号起个名字"></div>' +
        '<div class="jl-field" style="margin:0 16px 12px"><label>账号简介</label>' +
        '<textarea id="jili-team-intro" rows="3" placeholder="介绍一下这个账号">' + esc(t.persona || "") + "</textarea></div>" +
        '<div class="jl-secthead" style="padding:0 16px"><b>内部成员</b><span>' + memberIds.length + " 位角色</span></div>" +
        '<p class="jl-hint" style="padding:0 16px">可以同时选择多名角色；你作为创建者固定在账号内。</p>' +
        '<div style="margin:8px 0">' + ownerRow + memberRows + "</div>" +
        '<div class="jili-btnrow" style="padding:8px 16px"><button class="jl-btn" style="flex:1" data-jili-action="teamSave">' + (isNew ? "创建账号" : "保存修改") + "</button></div>" +
        (!isNew ? '<div class="jili-btnrow" style="padding:0 16px 20px"><button class="jl-btn ghost" style="flex:1" data-jili-action="teamDel" data-id="' + esc(TEAM_EDIT_ID) + '">删除全体账号</button></div>' : "") +
        "</div>";
      if (d) d.innerHTML = html; else pushOv("team", html, 36);
    } else {
      var list = teamAccounts();
      var rows = list.map(function (t2) {
        var names = teamNamesOf(t2);
        var line = names.length ? names.length + " 位成员 · " + names.join("、") : "暂时只有你";
        return '<div class="jl-crow" data-jili-action="teamEdit" data-id="' + esc(t2.id) + '">' + avHTML(t2, 44) +
          '<span class="jili-rowb"><b class="jl-one">' + esc(t2.name) + "</b><small>" + esc(line) + "</small></span>" +
          '<span class="jl-tagline">' + (String(t2.id) === String(pubId()) ? "当前使用中" : "管理") + "</span></div>";
      }).join("");
      var html2 = titlebar("管理账号") + '<div class="jl-scroll">' +
        '<p class="jl-hint" style="padding:0 16px">像群聊一样选择多名成员，对外则以一个完整账号共同经营。</p>' +
        (rows ? '<div style="margin:8px 0">' + rows + "</div>" : '<p class="jl-hint" style="padding:0 16px">还没有全体账号</p>') +
        '<div class="jili-btnrow" style="padding:4px 16px"><button class="jl-btn" style="flex:1" data-jili-action="teamNewEdit">＋ 新建全体账号</button></div>' +
        '<p class="jl-hint" style="padding:14px 16px">账号与记忆只属于当前用户的世界线。</p>' +
        "</div>";
      if (d) d.innerHTML = html2; else pushOv("team", html2, 36);
    }
  }

  function saveTeamAccount() {
    var st = S.state;
    var d = ovEl("team");
    if (!d) return;
    var nm = $("#jili-team-name", d).value.trim();
    if (!nm) { toast("先填账号名称"); return; }
    var intro = $("#jili-team-intro", d).value.trim();
    if (TEAM_EDIT_ID === "new") {
      var t = C.makeCreator({
        id: "team_" + Date.now().toString(36), name: nm, persona: intro,
        catchphrase: "大家好，我们是" + nm + "！",
        accountType: "team", ownedByUser: true
      });
      t.memberCharIds = (teamDraft.memberCharIds || []).slice();
      teamDraft = {};
      st.creators.push(t);
      st.activePublisherId = t.id;
      save();
      toast("全体账号已建立，已切换为当前身份");
      closeOv("team"); closeOv("acct");
      renderAll();
    } else {
      var t2 = creatorOf(TEAM_EDIT_ID);
      if (t2) { t2.name = nm; t2.persona = intro; save(); toast("全体账号已更新"); }
      TEAM_EDIT_ID = null;
      renderTeamPage();
      var ac = ovEl("acct");
      if (ac) openSwitchAccount();
    }
  }

  function teamMemberToggle(cid) {
    var t = TEAM_EDIT_ID === "new" ? null : creatorOf(TEAM_EDIT_ID);
    if (!t) {
      // 新建草稿：直接暂存到 teamDraft
      teamDraft.memberCharIds = teamDraft.memberCharIds || [];
      var at0 = teamDraft.memberCharIds.indexOf(String(cid));
      if (at0 >= 0) teamDraft.memberCharIds.splice(at0, 1);
      else teamDraft.memberCharIds.push(String(cid));
      renderTeamPage();
      return;
    }
    t.memberCharIds = (t.memberCharIds || []).map(String);
    var at = t.memberCharIds.indexOf(String(cid));
    if (at >= 0) t.memberCharIds.splice(at, 1);
    else t.memberCharIds.push(String(cid));
    save();
    renderTeamPage();
  }

  function deleteTeamAccount(id) {
    var st = S.state;
    var t = creatorOf(id);
    if (!t) return;
    if (!window.confirm("删除「" + t.name + "」？删除后，该账号和它发布的内容都会移除。确定删除吗？")) return;
    st.creators = (st.creators || []).filter(function (x) { return String(x.id) !== String(id); });
    st.posts = (st.posts || []).filter(function (p) { return String(p.creatorId) !== String(id); });
    st.dms = (st.dms || []).filter(function (m) { return String(m.threadId || "").indexOf("@" + id) < 0; });
    st.dmMessages = (st.dmMessages || []).filter(function (m) { return String(m.threadId || "").indexOf("@" + id) < 0; });
    st.liveRooms = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) !== String(id); });
    st.following = (st.following || []).filter(function (x) { return String(x) !== String(id); });
    if (String(st.activePublisherId) === String(id)) st.activePublisherId = "me";
    save();
    toast("全体账号已删除");
    TEAM_EDIT_ID = null;
    closeOv("team");
    renderAll();
    var ac = ovEl("acct");
    if (ac) openSwitchAccount();
  }

  /* 角色转来的主播：头像跟随微信 APP 里该角色当前设置的头像 */
  function avatarRefOf(o) {
    if (!o) return "";
    if (o.sourceCharId) {
      var cid = String(o.sourceCharId);
      var live = (typeof db !== "undefined" && db.characters || []).filter(function (c) { return String(c.id) === cid; })[0];
      if (live && live.avatar) return live.avatar;
      var local = (S.state.characters || []).filter(function (c) {
        return String(c.id) === "jc_" + cid || String(c.id) === cid;
      })[0];
      if (local && local.avatar) return local.avatar;
      if (o.avatarRef) return o.avatarRef;
      return "";
    }
    return o.avatarRef || "";
  }

  /* 默认用户头像：白色人形剪影（圆头 + 肩部），叠在不同颜色的渐变底上 */
  var DEFAULT_AV_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="35" r="21" fill="#fff"/>' +
    '<path d="M50 62C27 62 13 77 10 100h80c-3-23-17-38-40-38z" fill="#fff"/>' +
    '</svg>'
  );

  function defaultAvatarBG(idOrName) {
    return "url(" + DEFAULT_AV_SVG + ") center/cover no-repeat," + C.avatarColor(idOrName);
  }

  function avHTML(o, size) {
    var name = (o && (o.name || o.userName)) || "?";
    var style = "width:" + size + "px;height:" + size + "px;flex:none;";
    var ref = avatarRefOf(o);
    if (ref && /^(data:|https?:|blob:)/i.test(String(ref))) {
      return '<span class="jl-av" style="' + style + "background-image:url(" + ref + ')"></span>';
    }
    var bg = defaultAvatarBG(o && o.id ? o.id : name);
    return '<span class="jl-av" style="' + style + "background:" + bg + '"></span>';
  }

  function coverStyle(seed) { return "background:" + C.seedCover(seed); }

  /* 首页封面：16 种参考图风格色系轮换，每次刷新再随机微调色相/饱和度，颜色几乎不重复 */
  var FEED_FAMILIES = [
    [[172,52,52],[150,45,64],[96,42,76],[52,70,78]],
    [[176,55,46],[160,50,58],[130,42,70],[86,55,76]],
    [[212,28,44],[238,30,52],[262,32,62],[282,38,72]],
    [[278,32,38],[300,34,50],[322,42,62],[342,55,72]],
    [[24,85,50],[34,88,58],[44,90,66],[52,88,74]],
    [[216,58,40],[226,58,50],[238,55,60],[248,48,70]],
    [[178,58,44],[188,58,54],[198,52,66],[206,48,76]],
    [[336,52,56],[348,58,64],[16,62,72],[34,68,78]],
    [[156,42,38],[140,40,52],[112,38,68],[72,52,80]],
    [[232,48,40],[248,46,50],[266,42,62],[286,40,72]],
    [[4,62,48],[18,72,54],[32,78,64],[46,80,72]],
    [[186,56,40],[200,58,50],[214,56,62],[228,50,72]],
    [[272,38,40],[286,38,50],[250,46,62],[224,52,72]],
    [[92,48,40],[80,52,52],[64,62,66],[50,72,76]],
    [[344,48,50],[324,44,60],[300,38,68],[276,36,76]],
    [[200,20,32],[188,28,44],[172,36,56],[150,42,68]]
  ];
  function feedRand(seed) {
    var x = seed >>> 0;
    return function () {
      x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
      x = (x + 0x9e3779b9) >>> 0;
      return x / 4294967296;
    };
  }
  function feedFamilyOrder() {
    var arr = FEED_FAMILIES.map(function (_, i) { return i; });
    var r = feedRand(C.hash("feedorder:" + String(feedAt || 0)));
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function feedGradientAt(i, order) {
    var fam = FEED_FAMILIES[(order || feedFamilyOrder())[i % FEED_FAMILIES.length]];
    var r = feedRand(C.hash("feedcolor:" + String(feedAt || 0) + ":" + i));
    var pos = [0, 36, 72, 100];
    var stops = fam.map(function (c, k) {
      var h = (c[0] + (r() * 20 - 10) + 360) % 360;
      var s = Math.max(32, Math.min(85, c[1] + (r() * 12 - 6)));
      var l = Math.max(34, Math.min(82, c[2] + (r() * 10 - 5)));
      return "hsl(" + Math.round(h) + "," + Math.round(s) + "%," + Math.round(l) + "%) " + pos[k] + "%";
    });
    return "linear-gradient(135deg," + stops.join(",") + ")";
  }
  function feedGradientsFor(n) {
    var order = feedFamilyOrder();
    var out = [];
    for (var i = 0; i < n; i++) out.push(feedGradientAt(i, order));
    return out;
  }
  /* 同一个视频在首页、详情页推荐里用同一张渐变 */
  function feedGradientForPost(p) {
    var list = (S.state.posts || []).filter(function (x) { return x.kind === "video"; });
    var idx = 0;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(p && p.id)) { idx = i; break; }
    }
    return feedGradientsFor(list.length)[idx] || feedGradientsFor(1)[0];
  }
  /* 封面样式：投稿时选了真实图片就用图片，否则用渐变 */
  function feedCoverStyle(p, gradient) {
    var s = "background:" + (gradient || feedGradientsFor(1)[0]);
    if (p && p.coverImg) {
      s += ";background-image:url(" + p.coverImg + ");background-size:cover;background-position:center";
    }
    return s;
  }
  function feedCoverText(text) {
    var s = String(text || "");
    if (s.indexOf("\n") >= 0 || s.length < 4 || s.length > 10) return s;
    var cut = Math.floor(s.length / 2);
    return s.slice(0, cut) + "\n" + s.slice(cut);
  }

  /* 封面文字颜色：设置里可选固定色或按视频随机（亮色系，深底渐变上都可读） */
  var COVER_INKS = ["#ffffff", "#ffe14d", "#ff8fb3", "#7fd8e8", "#9fe26a", "#ffb35c", "#c9a5ff"];
  function coverInkOf(seed) {
    var v = S.state.settings.coverInk || "random";
    if (v !== "random") return v;
    return COVER_INKS[C.hash("cink:" + String(seed == null ? "" : seed)) % COVER_INKS.length];
  }

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
    refresh: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.2 7h9.6a4 4 0 0 1 3.9 3.1l1.1 5.2a2.6 2.6 0 0 1-4.6 2.2L15 15H9l-2.2 2.5a2.6 2.6 0 0 1-4.6-2.2l1.1-5.2A4 4 0 0 1 7.2 7z"/><path d="M8 10v4M6 12h4"/><circle cx="16" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/></svg>',
    dm: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.6 7.4l7.2 5.1a2.1 2.1 0 0 0 2.4 0l7.2-5.1"/></svg>',
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
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.2 10.6 4.6a2.2 2.2 0 0 1 2.8 0L20 10.2V18a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 18z"/><path d="M9 14.6c1.7 1.6 4.3 1.6 6 0"/></svg>',
    chevleft: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7.6 6.4H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.4a2 2 0 0 0-2-2h-3.6L14.5 4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    bigplay: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5z"/></svg>',
    storyboard: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M12 10v10"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>',
    heartsvg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 20.6C8.2 18 2.6 13.6 2.6 9.3 2.6 6.4 4.8 4.4 7.4 4.4c1.8 0 3.4 1 4.6 2.6 1.2-1.6 2.8-2.6 4.6-2.6 2.6 0 4.8 2 4.8 4.9 0 4.3-5.6 8.7-9.4 11.3z"/></svg>',
    giftsvg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8.2" width="18" height="4" rx="1.2"/><path d="M4.8 12.2V19a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6v-6.8M12 8.2v12.4"/><path d="M12 8.2s-1.3-5.2-4.4-5.2a2.3 2.3 0 0 0 0 4.6H12zm0 0s1.3-5.2 4.4-5.2a2.3 2.3 0 0 1 0 4.6H12z"/></svg>',
    follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(0 12 12)"><path d="M12 11.4V4.6c0-.5.4-.8.9-.7 3.4.9 4.9 4.6 2.7 7.3-.9 1-2.3 1.2-3.6.2z"/></g><g transform="rotate(90 12 12)"><path d="M12 11.4V4.6c0-.5.4-.8.9-.7 3.4.9 4.9 4.6 2.7 7.3-.9 1-2.3 1.2-3.6.2z"/></g><g transform="rotate(180 12 12)"><path d="M12 11.4V4.6c0-.5.4-.8.9-.7 3.4.9 4.9 4.6 2.7 7.3-.9 1-2.3 1.2-3.6.2z"/></g><g transform="rotate(270 12 12)"><path d="M12 11.4V4.6c0-.5.4-.8.9-.7 3.4.9 4.9 4.6 2.7 7.3-.9 1-2.3 1.2-3.6.2z"/></g></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8c4.6 0 8.2 3.2 8.2 7.4s-3.6 7.4-8.2 7.4c-1 0-2-.15-2.9-.45L5 19.9l1-3.6C4.7 15 3.8 13.2 3.8 11.2c0-4.2 3.6-7.4 8.2-7.4z"/><path d="M9 11.8c1.7 1.5 4.3 1.5 6 0"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="7" width="17.6" height="13" rx="3.2"/><path d="M8.2 3.6 10.4 7M15.8 3.6 13.6 7"/><path d="M8 13.4h2.4M13.6 13.4H16"/></svg>',
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
    else if (TAB === "live") renderLive();
    else if (TAB === "follow") renderFollow();
    else if (TAB === "msg") renderMsg();
    else if (TAB === "me") renderMe();
  }

  function renderAll() { renderTabbar(); renderTab(); }

  /* ================= 首页 Kr ================= */

  var HOME_SEGS = [["live", "直播"], ["rec", "推荐"], ["hot", "热门"], ["series", "追番"], ["film", "影视"]];

  /* 封面字排版：8 种封面样式按渲染顺序轮转，保证相邻卡片样式不同、分布均匀 */
  var CTH_SEQ = 0;
  function nextCoverStyle() {
    CTH_SEQ = (CTH_SEQ + 1) % 8;
    return "jili-cth s" + (CTH_SEQ + 1);
  }

  function videoCardHTML(p, cr, hero, gradient) {
    var cov = esc(feedCoverText(p.coverText)).replace(/\n/g, "<br>");
    var ct = cov ? '<b class="jl-feedct">' + cov + "</b>" : "";
    var style = feedCoverStyle(p, gradient || feedGradientForPost(p));
    if (hero) {
      return '<button class="jl-feedhero" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
        '<span class="jl-feedcov" style="' + style + '">' + ct +
          '<i class="jl-feedcaption">' + esc(p.title || "") + "</i></span></button>";
    }
    var meta = '<span class="jl-feedmeta">' +
      "<span>" + ICONS.vplay + fmtN(p.play || 0) + "</span>" +
      "<span>" + ICONS.vdm + fmtN(p.danmaku || 0) + "</span>" +
      (p.durationSec ? "<i>" + fmtD(p.durationSec) + "</i>" : "") + "</span>";
    return '<button class="jl-feedcard" data-jili-action="openPost" data-id="' + esc(p.id) + '">' +
      '<span class="jl-feedcov" style="' + style + '">' + ct + meta + "</span>" +
      '<span class="jl-feedinfo"><b>' + esc(p.title || "") + "</b>" +
        '<span class="jl-feedup"><i>UP</i>' + esc(cr ? cr.name : "UP 主") + "</span></span></button>";
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

  /* ================= 首页「直播」页 ================= */

  function liveRoomList() {
    var st = S.state;
    var seen = {};
    var rooms = [];
    function add(r, cr) {
      var cid = String(r.creatorId || (cr && cr.id) || "");
      if (!cr || seen[cid]) return;
      seen[cid] = 1;
      var ln = cr.liveNow || {};
      rooms.push({
        id: r.id || ("live:" + cid), cid: cid, cr: cr,
        title: r.title || ln.title || "",
        coverText: r.coverText || ln.coverText || "",
        topic: r.topic || ln.topic || "",
        viewers: Number(r.viewers) || Math.max(12, Math.round((cr.fans || 0) * 0.03)),
        danmaku: Number(r.danmaku) || Math.round((cr.fans || 0) * 0.05),
        area: cr.area || "chat",
        goods: r.goods || ln.goods || [],
        source: r.source || "chat",
        seed: r.seed || (cid + "|" + (r.title || ln.title || ""))
      });
    }
    (st.liveRooms || []).forEach(function (r) { add(r, creatorOf(r.creatorId)); });
    (st.creators || []).forEach(function (cr) {
      if (!cr.liveNow || !cr.liveNow.title) return;
      if (seen[String(cr.id)]) return;
      var room = {
        id: "live:" + cr.id, creatorId: String(cr.id), title: cr.liveNow.title,
        coverText: cr.liveNow.coverText || "", topic: cr.liveNow.topic || "",
        viewers: Math.max(12, Math.round((cr.fans || 0) * 0.03)), source: "chat",
        goods: cr.liveNow.goods || [], seed: cr.id + "|" + cr.liveNow.title
      };
      st.liveRooms = st.liveRooms || [];
      st.liveRooms.unshift(room);
      add(room, cr);
    });
    rooms.sort(function (a, b) {
      var as = a.cr.sourceCharId ? 1 : 0, bs = b.cr.sourceCharId ? 1 : 0;
      return bs - as || (b.cr.fans || 0) - (a.cr.fans || 0);
    });
    return rooms;
  }

  function liveGradient(r) {
    var i = C.hash("live:" + String(r.seed || r.id)) % FEED_FAMILIES.length;
    return feedGradientAt(i);
  }
  function liveCoverText(r) {
    return esc(feedCoverText(r.coverText || r.title)).replace(/\n/g, "<br>");
  }
  function liveFeatureHTML(r) {
    var cov = liveCoverText(r);
    return '<button class="jl-fcard" data-jili-action="openLive" data-id="' + esc(r.id) + '">' +
      '<span class="jl-fcover" style="background:' + liveGradient(r) + '">' +
        (cov ? '<b class="ct">' + cov + "</b>" : "") +
        '<span class="who">' + avHTML(r.cr, 30) + '<span class="jl-one">' + esc(r.cr.name) + "</span></span>" +
        '<span class="jl-onair">' + ICONS.broadcast + "直播中</span>" +
        (r.topic ? '<span class="topic jl-one">' + esc(r.topic) + "</span>" : "") +
      "</span>" +
      '<span class="jl-ffoot"><span class="t jl-one">' + esc(r.title) + '</span><span class="jl-btn outline sm">查看更多</span></span>' +
      "</button>";
  }
  function liveCardHTML(r) {
    var cov = liveCoverText(r);
    var sell = (r.goods && r.goods.length) ? '<span class="jl-sellbadge">🛒 直播带货</span>' : "";
    return '<button class="jl-vcard" data-jili-action="openLive" data-id="' + esc(r.id) + '">' +
      '<span class="jl-cover" style="background:' + liveGradient(r) + '">' +
        (cov ? '<b class="ct">' + cov + "</b>" : "") + sell +
        '<span class="meta"><span>' + ICONS.broadcast + fmtN(r.viewers) + "</span>" +
          "<span>" + ICONS.vdm + fmtN(r.danmaku) + "</span>" +
          '<span class="r">' + esc(areaName(r.area)) + "</span></span>" +
      "</span>" +
      '<span class="jl-vinfo">' + avHTML(r.cr, 28) +
        '<span style="min-width:0"><span class="t jl-one">' + esc(r.title) + "</span>" +
          '<span class="u jl-one">' + (isFollowed(r.cid) ? '<span class="jl-followed">已关注</span>' : "") + esc(r.cr.name) + "</span></span>" +
      "</span></button>";
  }
  function renderLive() {
    var list = liveRoomList();
    var featured = list.slice(0, 3);
    var followed = list.filter(function (r) { return isFollowed(r.cid); });
    var areas = [];
    list.forEach(function (r) { if (areas.indexOf(r.area) < 0) areas.push(r.area); });
    var cats = [{ id: "all", name: "全部" }].concat(areas.map(function (a) { return { id: a, name: areaName(a) }; }));
    var shown = LIVE_CAT === "all" ? list : list.filter(function (r) { return r.area === LIVE_CAT; });
    var body = "";

    if (!list.length) {
      body = '<div class="jl-empty"><p>现在没人在直播，点刷新看看</p></div>';
    } else {
      body += '<div class="jl-featured">' + featured.map(liveFeatureHTML).join("") + "</div>";
      if (featured.length > 1) {
        body += '<div class="jl-dots">' + featured.map(function (_, i) {
          return '<i class="' + (i === 0 ? "on" : "") + '"></i>';
        }).join("") + "</div>";
      }
      if (followed.length) {
        body += '<div class="jl-myfollow">' +
          '<div class="jl-secthead"><b>我的关注<span>' + followed.length + " 个直播中</span></b>" +
            '<button class="more" data-jili-action="tab" data-id="follow">查看全部 ›</button></div>' +
          '<div class="jl-hrow">' + followed.map(function (r) {
            return '<button class="jl-hitem" data-jili-action="openLive" data-id="' + esc(r.id) + '">' +
              '<span class="jl-ring">' + avHTML(r.cr, 52) + '<span class="jl-wave">' + ICONS.broadcast + "</span></span>" +
              '<span class="name jl-two">' + esc(r.cr.name) + "</span></button>";
          }).join("") + "</div></div>";
      }
      body += '<div class="jl-cattabs"><div class="cs">' + cats.map(function (c) {
        return '<button class="' + (LIVE_CAT === c.id ? "on" : "") + '" data-jili-action="liveCat" data-id="' + esc(c.id) + '">' + esc(c.name) + "</button>";
      }).join("") + '</div><button class="gridbtn" data-jili-action="liveCatsToggle" aria-label="全部分类">' + ICONS.storyboard + "</button></div>";
      if (LIVE_CATS_OPEN) {
        body += '<div class="jl-catgrid" style="padding:8px var(--jl-g)">' + cats.map(function (c) {
          return '<button class="' + (LIVE_CAT === c.id ? "on" : "") + '" data-jili-action="liveCat" data-id="' + esc(c.id) + '">' + esc(c.name) + "</button>";
        }).join("") + "</div>";
      }
      body += shown.length
        ? '<div class="jl-grid2" style="padding-top:0">' + shown.map(liveCardHTML).join("") + "</div>"
        : '<div class="jl-empty"><p>这个分类暂时没人直播</p></div>';
    }
    ui.main.innerHTML = homeHeaderHTML() + '<div class="jl-scroll with-tabbar">' + body + "</div>";
    bindHomeInput();
  }

  function homeHeaderHTML() {
    return '<div class="jl-homehead">' +
      '<div class="jl-searchrow" style="padding-left:4px">' +
        '<button data-jili-action="goMe" aria-label="我的" style="width:38px;height:38px;flex:none;padding:0;border:0;background:none">' +
          (S.state.userAvatar
            ? '<span class="jl-av" style="width:38px;height:38px;flex:none;background-image:url(' + S.state.userAvatar + ')"></span>'
            : '<span class="jl-av" style="width:38px;height:38px;flex:none;background:' + defaultAvatarBG("me") + '"></span>') +
        '</button>' +
        '<label class="jl-search"><span class="jl-searchico">' + ICONS.search + '</span><input placeholder="搜索视频、UP 主" value="' + esc(homeQ) + '"/></label>' +
        '<button class="jl-refresh-ico" data-jili-action="refresh" aria-label="刷新生成" title="' + esc(feedAt ? "上次刷新：" + ago(feedAt) : "还没刷新过 · 点这里刷新") + '">' + ICONS.refresh + '</button>' +
        '<button class="jl-headdm" data-jili-action="tab" data-id="msg" aria-label="私信" title="私信">' + ICONS.dm + '</button>' +
      '</div>' +
      '<div class="jl-toptabs">' + HOME_SEGS.map(function (s) {
        return '<button class="' + (HOME_SEG === s[0] ? "on" : "") + '" data-jili-action="homeSeg" data-id="' + s[0] + '">' + s[1] + '</button>';
      }).join("") + '</div>' +
    '</div>';
  }

  function renderHome() {
    var st = S.state;
    var cmap = creatorMap();
    if (HOME_SEG === "live") { renderLive(); return; }
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
      body = (videos.length ? videoCardHTML(videos[0], cmap[videos[0].creatorId], true, feedGradientForPost(videos[0])) : "") +
        (videos.length > 1
          ? '<div class="jl-feedgrid">' + videos.slice(1).map(function (p) {
              return videoCardHTML(p, cmap[p.creatorId], false, feedGradientForPost(p));
            }).join("") + "</div>"
          : "");
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

  /* 主应用世界书 → 角色简介（全局书 + 角色绑定的书，供 jili AI 的 World info 使用） */
  function mainCharWorldInfo(c) {
    try {
      var books = (typeof db !== "undefined" && db.worldBooks) || [];
      var bound = (c.worldBookIds || []).map(String);
      var parts = [];
      books.forEach(function (f) {
        if (!f || f.type !== "folder") return;
        if (!f.global && bound.indexOf(String(f.id)) < 0) return;
        var buf = [];
        books.forEach(function (e) {
          if (e && e.type === "entry" && e.parentId === f.id && e.content) {
            buf.push((e.name ? e.name + ": " : "") + String(e.content).slice(0, 200));
          }
        });
        if (buf.length) parts.push("【" + (f.name || "世界书") + "】\n" + buf.join("\n"));
      });
      var s = parts.join("\n\n");
      return s.length > 1200 ? s.slice(0, 1200) + "…" : s;
    } catch (e) { return ""; }
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
          worldInfo: mainCharWorldInfo(c),
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

  /* ================= 开播控制台 · 液态玻璃 ================= */

  /* 直播封面字段：预览 + 选图 + 恢复默认（开播控制台 / 编辑 UP 主共用） */
  var studioCoverTmp = null;   // { key, data } 待保存的封面
  function liveCoverFieldHTML(cur, key) {
    var shown = studioCoverTmp && studioCoverTmp.key === key ? studioCoverTmp.data : (cur || "");
    return '<div class="jl-field lc-field"><label>直播封面</label>' +
      '<div class="lc-row">' +
        '<span class="lc-prev" id="' + key + '-prev" style="' + (shown ? "background-image:url(" + shown + ")" : "background:#e8ecf2 center/cover no-repeat url('" + sceneArtFor(key + ":default") + "')") + '"></span>' +
        '<span class="lc-acts">' +
          '<label class="lc-pick">选图片<input type="file" accept="image/*" id="' + key + '-file" hidden></label>' +
          '<button type="button" data-jili-action="liveCoverReset" data-id="' + esc(key) + '">恢复默认</button>' +
        '</span>' +
      '</div></div>';
  }
  function readLiveCoverFile(file, key) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 720;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        studioCoverTmp = { key: key, data: cv.toDataURL("image/jpeg", 0.82) };
        var prev = $("#" + key + "-prev");
        if (prev) prev.style.backgroundImage = "url(" + studioCoverTmp.data + ")";
        toast("封面已选好，保存后生效");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function liveCoverReset(key) {
    studioCoverTmp = { key: key, data: "" };
    var prev = $("#" + key + "-prev");
    if (prev) prev.style.backgroundImage = "url('" + sceneArtFor(key + ":default") + "')";
  }

  function openStudio() {
    var st = S.state;
    var cur = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(pubId()); })[0] || {};
    var src = cur.source || "chat";
    var html = titlebar("开始直播") +
      '<div class="jl-scroll lq-scroll">' +
      '<div class="lq-hero"><span class="lq-heroic">' + ICONS.broadcast + "</span>" +
      '<span class="lq-herotx"><b>准备好开播了吗</b><small>开播后观众会进场聊天、送礼</small></span></div>' +

      '<div class="lq-group"><div class="lq-gt">直播信息</div>' +
      '<div class="jl-field"><label>直播标题</label><input id="jili-studio-title" value="' + esc(cur.title || "") + '" placeholder="今天播点什么"></div>' +
      '<div class="jl-field"><label>话题（可选）</label><input id="jili-studio-topic" value="' + esc(cur.topic || "") + '" placeholder="例如：聊聊最近看的番"></div>' +
      liveCoverFieldHTML(cur.liveCover || (creatorOf(pubId()) || {}).liveCover || "", "jili-studio-cover") + "</div>" +

      '<div class="lq-group"><div class="lq-gt">画面来源</div>' +
      '<div class="jl-chips lq-chips">' +
      '<button type="button" class="' + (src === "chat" ? "on" : "") + '" data-jili-action="studioSrc" data-id="chat">聊天画面</button>' +
      '<button type="button" class="' + (src === "camera" ? "on" : "") + '" data-jili-action="studioSrc" data-id="camera">摄像头</button>' +
      '<button type="button" class="' + (src === "video" ? "on" : "") + '" data-jili-action="studioSrc" data-id="video">放视频</button>' +
      "</div>" +
      '<input type="hidden" id="jili-studio-source" value="' + esc(src) + '"></div>' +

      '<div class="lq-group"><div class="lq-gt">直播带货</div>' + liveShopFormHTML(cur) + "</div>" +

      '<button type="button" class="jl-btn big lq-start" data-jili-action="studioStart">' + (cur.id ? "开始直播" : "开播") + "</button>" +
      "</div>";
    var d = ovEl("studio");
    if (d) { d.className = "jl-root lq-root"; d.innerHTML = html; }
    else {
      pushOv("studio", html, 36);
      var nd = ovEl("studio");
      if (nd) nd.classList.add("lq-root");
    }
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
      spawnDm(layer, { t: t, text: text, mode: s.dmMyMode || "scroll", mine: true }, s);
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

  /* contact 消息状态机（对齐 nuojiji A8）：none / asked / given / linked */
  function contactState(cr) {
    if (!cr) return "none";
    if (cr.sourceCharId && (S.state.characters || []).some(function (c) { return c.id === cr.sourceCharId; })) return "linked";
    var m = msgsOf(tidFor(cr.id)).filter(function (m) { return m.kind === "contact"; })[0];
    if (!m) return "none";
    return m.dir === "ask" ? "asked" : "given";
  }

  function addFriend(cid, btn, contact) {
    var st = S.state;
    var cr = creatorOf(cid);
    if (!cr) return;
    if (cr.sourceCharId) { toast("已经是好友了"); return; }
    var tid = tidFor(cid);
    var dmLines = (st.dmMessages || []).filter(function (m) { return m.threadId === tid; }).slice(-20)
      .map(function (m) { return (m.from === "me" ? (st.userName || "me") : cr.name) + ": " + m.text; });
    var seed = (contact && contact.personaSeed) || "";
    var note = (contact && contact.note) || "";
    if (!seed || !note) {
      var cm = (st.dmMessages || []).filter(function (m) { return m.threadId === tid && m.kind === "contact"; })[0];
      if (cm) {
        if (!seed) seed = cm.personaSeed || "";
        if (!note) note = cm.note || "";
      }
    }
    aiRun(btn, function () { return C.ai.creatorToChar(st, cr, dmLines, { personaSeed: seed, note: note }); }).then(function (r) {
      if (r === undefined) return;
      var ch = { id: "jch_" + Date.now().toString(36), name: r.name, persona: r.persona, worldInfo: r.worldInfo || "", avatar: "" };
      st.characters = st.characters || [];
      st.characters.push(ch);
      cr.sourceCharId = ch.id;
      if (r.firstMessage) {
        st.dms = st.dms || [];
        var exists = st.dms.some(function (t) { return t.id === tid || t.threadId === tid; });
        if (!exists) st.dms.push(C.makeDMThread({ id: tid, creatorId: cid, lastText: r.firstMessage }));
        st.dmMessages = st.dmMessages || [];
        st.dmMessages.push(C.makeDMMessage({ threadId: tid, from: "them", text: r.firstMessage, kind: "auto" }));
      }
      save();
      toast("「" + r.name + "」已加进聊天列表，TA 给你发了条消息");
      var sp = ovEl("space");
      if (sp) renderSpacePage(sp.getAttribute("data-cid"));
      var d = ovEl("dm");
      if (d) renderDMPage(cid, d.getAttribute("data-dmtid"));
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

  var FOLLOW_CHIP = "all";
  function renderFollow() {
    var st = S.state;
    var cmap = creatorMap();
    var allIds = st.following || [];
    var specialCount = allIds.filter(function (id) { var c = cmap[id]; return c && c.sourceCharId; }).length;
    if (FOLLOW_CHIP === "special") {
      allIds = allIds.filter(function (id) { var c = cmap[id]; return c && c.sourceCharId; });
    }
    var followIds = allIds;
    var posts = (st.posts || []).filter(function (p) {
      return followIds.some(function (id) { return String(p.creatorId) === String(id); });
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var chips = '<div class="jl-chips" style="padding:10px 14px 2px">' +
      '<button class="jl-chip' + (FOLLOW_CHIP === "all" ? " on" : "") + '" data-jili-action="followChip" data-id="all">全部</button>' +
      '<button class="jl-chip' + (FOLLOW_CHIP === "special" ? " on" : "") + '" data-jili-action="followChip" data-id="special">特别关注' + (specialCount ? " " + specialCount : "") + "</button></div>";
    var body;
    if (!followIds.length) {
      body = chips + '<div class="jl-empty"><p>' + (FOLLOW_CHIP === "special" ? "还没有特别关注。成为好友的 UP 主会出现在这里。" : "还没关注任何 UP 主。去 UP 主空间点「关注」吧。") + "</p></div>";
    } else {
      body = chips + '<div class="jl-sect"><div class="jl-secthead"><b>我的关注</b><span>' + followIds.length + " 人</span></div>" +
        '<div class="jl-followgrid">' + followIds.map(function (id) {
          var cr = cmap[id];
          if (!cr) return "";
          var isSp = !!cr.sourceCharId;
          return '<button class="jl-followcard" data-jili-action="openSpace" data-id="' + esc(id) + '">' +
            avHTML(cr, 56) +
            '<b' + (isSp ? ' style="color:var(--jl-pink,#ff6699)"' : "") + ">" + esc(cr.name) + "</b>" +
            (isSp ? '<span class="jl-tagline">特别关注</span>' : "") +
            "</button>";
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
      var m = String(t.threadId || "").match(/@([A-Za-z0-9_]+)$/);
      var acctTag = m && m[1] ? '<span class="jl-tagline">' + esc(acctName(m[1])) + "</span>" : "";
      var isSp = !!cr.sourceCharId;
      return '<button class="jili-dmrow" data-jili-action="openDM" data-id="' + esc(t.creatorId) + '" data-tid="' + esc(t.threadId) + '">' +
        avHTML(cr, 44) +
        '<span class="jili-rowb"><b class="jl-one"' + (isSp ? ' style="color:var(--jl-pink,#ff6699)"' : "") + ">" + esc(cr.name) + (t.pinned ? " 📌" : "") + (t.muted ? " 🔕" : "") + "</b>" +
        (isSp ? '<span class="jl-tagline">特别关注</span>' : "") +
        "<span>" + esc(dmPreview(last) || "发条私信打个招呼吧") + "</span></span>" +
        '<span class="jili-dmside">' + acctTag + "<i>" + ago(t.lastAt) + "</i>" + badgeHTML(t.unread || 0) + "</span></button>";
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

  function openDM(creatorId, tid) {
    var st = S.state;
    var cr = creatorOf(creatorId);
    if (!cr) { toast("找不到这位 UP 主"); return; }
    tid = tid || tidFor(cr.id);
    var th = (st.dms || []).filter(function (t) { return t.threadId === tid; })[0];
    if (th) { th.unread = 0; save(); }
    renderDMPage(cr.id, tid);
  }

  function renderDMPage(cid, tid) {
    var st = S.state;
    var cr = creatorOf(cid);
    if (!cr) return;
    var dPre = ovEl("dm");
    tid = tid || (dPre && dPre.getAttribute("data-dmtid")) || tidFor(cid);
    var asAcct = pubId() !== "me";
    var msgs = msgsOf(tid);
    var th = (st.dms || []).filter(function (t) { return t.threadId === tid; })[0] || {};
    var followed = isFollowed(cid);
    var charged = !!C.chargedOf(st, cid);
    var chat = msgs.map(function (m, i) {
      var parts = [];
      if (i === 0 || (m.at || 0) - (msgs[i - 1].at || 0) > 300000) {
        parts.push('<span class="jl-dmtime">' + ago(m.at) + "</span>");
      }
      if (m.kind === "contact") {
        if (m.dir === "ask") {
          parts.push('<span class="jl-systip">「' + esc(cr.name) + '」请求加你为好友，已自动通过 — 去 TA 的聊天看看第一条消息</span>');
        } else {
          var linked2 = !!(cr.sourceCharId && (st.characters || []).some(function (c) { return c.id === cr.sourceCharId; }));
          parts.push('<button class="jl-contactcard" data-jili-action="addFriend" data-id="' + esc(cid) + '"' + (linked2 ? " disabled" : "") + ">" +
            '<span class="ic">' + (linked2 ? "✓" : "✉") + "</span>" +
            '<span class="tx"><b>' + (linked2 ? "你们已经在聊天里联系上了" : "「" + esc(cr.name) + "」把联系方式给你了") + "</b>" +
            (m.note && !linked2 ? "<small>" + esc(m.note) + "</small>" : "") +
            (linked2 ? "" : '<small class="go">点一下加进聊天 →</small>') + "</span></button>");
        }
        return parts.join("");
      }
      if (m.kind === "video" || m.kind === "live") {
        var meta = m.meta || {};
        var cardIn = '<span class="jili-dmcard-c" style="' + coverStyle(meta.seed || cid) + '"><i class="jili-cd">' + (m.kind === "live" ? "直播" : fmtD(meta.dur || meta.durationSec || 0)) + "</i></span><span class='ttl'>" + esc(meta.title || "") + "</span>";
        var card = meta.postId
          ? '<button class="jl-dmcard" data-jili-action="openPost" data-id="' + esc(meta.postId) + '">' + cardIn + "</button>"
          : '<span class="jl-dmcard">' + cardIn + "</span>";
        parts.push(m.from === "me"
          ? '<div class="jl-msg me"><div class="b">' + card + "</div>" + avHTML(meIdentity(), 28) + "</div>"
          : '<div class="jl-msg">' + avHTML(cr, 28) + '<div class="b">' + card + "</div></div>");
      } else if (m.from === "me") {
        parts.push('<div class="jl-msg me"><div class="b">' + esc(m.text) + "</div>" + avHTML(meIdentity(), 28) + "</div>");
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
      (asAcct ? '<p class="jl-hint" style="padding:0 14px;margin:0 0 4px">你正以「' + esc(acctName(pubId())) + '」的身份私信，和个人号的对话分开存</p>' : "") +
      '<div class="jl-scroll" data-dmscroll="1">' + chat + "</div>" +
      '<div class="jl-composer"><input id="jili-dm-input" placeholder="发消息…"><button class="jl-btn" data-jili-action="dmSend" data-id="' + esc(cid) + '">发送</button></div>';

    var d = ovEl("dm");
    if (d) { d.innerHTML = html; d.setAttribute("data-dmtid", tid); }
    else { d = pushOv("dm", html, 45); d.setAttribute("data-dmtid", tid); }
    var sc = $('[data-dmscroll]', d);
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  function dmSendText(cid, text) {
    var st = S.state;
    text = String(text || "").trim();
    if (!text) return;
    var dOv = ovEl("dm");
    var tid = (dOv && dOv.getAttribute("data-dmtid")) || tidFor(cid);
    st.dmMessages = st.dmMessages || [];
    st.dmMessages.push({ threadId: tid, from: "me", text: text, at: Date.now() });
    touchThread(tid, cid);
    save();
    renderDMPage(cid, tid);
    liveP = liveP || {};
    liveP.dmTyping = cid;
    renderDMPage(cid, tid);
    aiRun(null, function () { return C.ai.dmReply(st, cid, text); }).then(function (r) {
      if (liveP) liveP.dmTyping = null;
      if (r !== undefined) save();
      var d = ovEl("dm");
      if (d) renderDMPage(cid, tid);
      handleContactResult(cid, r && r.contact);
    });
  }

  /* 视频分享给微信 APP 里的角色：生成一张视频分享 HTML 卡片发到 TA 的聊天 */
  function wechatChars() {
    return (typeof db !== "undefined" && db.characters) ? db.characters : [];
  }
  function wechatCharName(ch) { return ch && (ch.remarkName || ch.realName || ch.name) || "角色"; }

  function shareVideoHTML(p) {
    var by = creatorOf(p.creatorId);
    var ct = esc(feedCoverText(p.coverText)).replace(/\n/g, "<br>");
    var cover = feedCoverStyle(p, feedGradientForPost(p));
    return '<div style="display:flex;align-items:center;gap:10px;width:238px;padding:10px;box-sizing:border-box;background:#fff;border-radius:8px;color:#181818;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;line-height:1.35;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(p.title) + "</div>" +
        '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:12px;color:#8a8a8a;white-space:nowrap;overflow:hidden">' +
          '<span style="display:inline-grid;place-items:center;width:14px;height:14px;border-radius:3px;background:#00aeec;color:#fff;font-size:9px">▶</span>' +
          '<span style="overflow:hidden;text-overflow:ellipsis">叽哩叽哩 · ' + esc(by ? by.name : "UP 主") + "</span></div>" +
      "</div>" +
      '<div style="position:relative;width:64px;height:64px;flex:none;border-radius:6px;overflow:hidden;display:grid;place-items:center;' + cover + '">' +
        (ct ? '<b style="max-width:100%;padding:0 4px;box-sizing:border-box;text-align:center;font-size:12px;line-height:1.2;color:#fff;text-shadow:0 1px 3px #000">' + ct + "</b>" : "") +
        '<i style="position:absolute;left:4px;bottom:3px;font-style:normal;font-size:10px;color:#fff;text-shadow:0 1px 2px #000">' + fmtD(p.durationSec || 0) + "</i>" +
      "</div></div>";
  }

  /* 把视频的简介、台词/画面字幕整理成角色可读的内容摘要，供 AI 回复时参考 */
  function videoSummaryForAI(p) {
    var by = creatorOf(p.creatorId);
    var lines = ["【你刚收到的视频 · 内容摘要】",
      "标题：" + p.title,
      "UP 主：" + (by ? by.name : "UP 主") + "｜时长：" + fmtD(p.durationSec || 0) + (p.area ? "｜分区：" + p.area : "")];
    if (p.desc) lines.push("简介：" + String(p.desc).slice(0, 600));
    if (p.series) lines.push("系列：" + p.series + (p.epTitle ? " · " + p.epTitle : ""));
    var sc = (p.script || []).filter(function (l) { return l && l.text; });
    if (sc.length) {
      var pick = [];
      var max = 36;
      if (sc.length <= max) pick = sc;
      else for (var i = 0; i < max; i++) pick.push(sc[Math.floor(i * (sc.length - 1) / (max - 1))]);
      lines.push("视频内容（按时间顺序，口播台词与画面字幕节选）：");
      pick.forEach(function (l) {
        lines.push("[" + fmtD(Number(l.t) || 0) + "] " + (l.k === "say" ? "口播：" : "画面：") + String(l.text).slice(0, 180));
      });
    }
    var cms = (p.comments || []).filter(function (c) { return c && c.text; }).slice(0, 3);
    if (cms.length) lines.push("观众评论：" + cms.map(function (c) { return String(c.text).slice(0, 80); }).join(" / "));
    lines.push("请结合这个视频实际讲的内容自然回应，不要只说收到。");
    return lines.join("\n").slice(0, 4000);
  }

  function openShareSheet() {
    if (!player) return;
    var list = wechatChars();
    if (!list.length) { toast("还没有可以分享的角色"); return; }
    openModal("<h3>分享给角色</h3>" + list.map(function (ch) {
      var nm = wechatCharName(ch);
      return '<div class="jl-crow" data-jili-action="shareToChar" data-id="' + esc(ch.id) + '">' +
        avHTML({ id: ch.id, name: nm, avatarRef: ch.avatar }, 40) +
        '<span class="jili-rowb"><b class="jl-one">' + esc(nm) + "</b><span>微信 · 发给 TA</span></span>" +
        '<span class="jl-tagline">发送</span></div>';
    }).join(""));
  }

  function shareVideoToChar(cid) {
    if (!player) return;
    var ch = wechatChars().filter(function (x) { return String(x.id) === String(cid); })[0];
    if (!ch) return;
    var p = player.post;
    var msg = {
      id: "msg_" + Date.now(), role: "user",
      content: "[分享视频] " + p.title,
      parts: [{ type: "html", text: shareVideoHTML(p) }],
      aiContext: videoSummaryForAI(p),
      timestamp: Date.now()
    };
    ch.history = ch.history || [];
    ch.history.push(msg);
    if (typeof saveData === "function") saveData();
    if (typeof renderChatList === "function") renderChatList();
    p.shares = (p.shares || 0) + 1;
    save();
    closeModal();
    currentChatId = ch.id;
    currentChatType = "private";
    if (typeof openChatRoom === "function") openChatRoom(ch.id, "private");
    toast("已分享给 " + wechatCharName(ch));
    updateActNums();
  }

  /* 求联系方式结果处理：give 出联系卡等用户点；ask 自动走变角色（mie 无"新的朋友"审批流） */
  function handleContactResult(cid, contact) {
    if (!contact) return;
    var cr = creatorOf(cid);
    if (!cr) return;
    if (contact.dir === "ask") {
      toast("「" + cr.name + "」请求加你为好友");
      addFriend(cid, null, contact);
    } else {
      toast("「" + cr.name + "」把联系方式给你了，点卡片加进聊天");
      var d = ovEl("dm");
      if (d) renderDMPage(cid, d.getAttribute("data-dmtid"));
    }
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
    var myPosts = (st.posts || []).filter(function (p) { return String(p.creatorId) === String(pubId()); });
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
    var ident = meIdentity();
    var html = '<div class="jl-mehead"><div class="jl-meid">' + avHTML({ id: pubId(), name: ident.name, avatarRef: ident.avatarRef }, 68) +
      '<div><div class="nm"><b>' + esc(ident.name) + '</b><span class="jl-lv">LV' + lv + "</span>" +
      '<button class="jl-switchu" data-jili-action="switchUser">切换账号</button></div>' +
      '<div class="jl-coins"><span>叽币 <b>' + (st.jibi || 0).toLocaleString() + "</b></span><span>硬币 <b>" + (st.coin || 0) + "</b></span></div></div></div>" +
      '<div class="jl-stats">' + stats.map(function (s) {
        return '<button data-jili-action="' + s[2] + '"><b>' + s[1] + "</b><span>" + s[0] + "</span></button>";
      }).join("") + "</div>" +
      '<div class="jl-vipbar"><div><b>叽币中心</b><p>充值叽币，给你喜欢的 UP 主充电、送礼、上舰</p></div>' +
      '<button class="jl-btn" data-jili-action="rechargeOpen">充值</button></div>' +
      '<div class="jl-icongrid blue">' + icons.map(function (ic) {
        return '<button data-jili-action="openList" data-id="' + ic[0] + '"><span class="jl-ic-svg">' + ic[1] + "</span><span>" + ic[2] + "</span></button>";
      }).join("") + "</div>" +
      '<div class="jl-sect"><div class="jl-secthead"><b>创作中心</b><span>数据中心</span>' +
      '<button class="jl-btn sm" data-jili-action="openUpload">发布</button></div>' +
      '<div class="jl-earn"><div><p>创作激励 · 可提现</p><div class="v">¥ ' + Number(st.earnings || 0).toFixed(2) + "</div><p>今日已提 ¥" + todayWithdrawOf().toFixed(2) + "</p></div>" +
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
    SPACE_FAN_OPEN = false;
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
        (contactState(cr) === "given"
          ? '<div class="jili-btnrow" style="padding:0 16px 4px"><button class="jl-btn" style="flex:1" data-jili-action="addFriend" data-id="' + esc(cid) + '">加为聊天好友</button></div>'
          : "") +
        '<div class="jlsp-name"><b>' + esc(cr.name) + "</b>" +
          '<span class="jlsp-lv lv' + lv + '">LV' + lv + "</span>" +
          (isYearly ? '<span class="jlsp-badge">年度大会员</span>' : "") +
        "</div>" +
        (bio ? '<div class="jlsp-bio">' + esc(bioShort) + (bio.length > 40 ? ' <a class="jlsp-biodet" data-jili-action="bioToggle">详情</a>' : "") + "</div>" : "") +
        '<div class="jlsp-ip">IP属地：' + esc(ipLoc) + "</div>" +
        (chargeCount ? '<div class="jlsp-chargebar"><span>⚡ 充电</span><span>' + chargeCount + "人充电</span></div>" : "") +
        fanStripHTML(cr) +
        fanMineHTML(cr) +
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
              (p.coverText ? '<b class="jili-cth" style="color:' + coverInkOf(p.seed) + '">' + esc(p.coverText) + "</b>" : "") +
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
          milestonesHTML(cr) +
          '<div class="jlsp-homecard"><b>关于 ' + esc(cr.name) + "</b>" +
            (bio ? "<p>" + esc(bio) + "</p>" : "") +
            (cr.catchphrase ? '<div class="jlsp-homeq">「' + esc(cr.catchphrase) + '」</div>' : "") +
            (cr.schedule ? '<div class="jlsp-homesch">📅 ' + esc(cr.schedule) + "</div>" : "") +
            (cr.fanName ? '<div class="jlsp-homefan">粉丝名：' + esc(cr.fanName) + (cr.upNickname ? " · 称呼：" + esc(cr.upNickname) : "") + "</div>" : "") +
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
    return (st.posts || []).filter(function (p) { return String(p.creatorId) === String(pubId()); })
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
    var html = titlebar("主播工坊") + head + '<div class="jl-scroll jl-scroll-ws">' + body + "</div>";
    var d = ovEl("workshop");
    if (d) d.innerHTML = html;
    else d = pushOv("workshop", html, 36);
    if (d) d.classList.add("ws-glass");
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
      '<button class="ws-src" data-jili-action="wsSrc" data-id="vid">生成视频</button></div></div>' +
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
    return rows;
  }

  /* 角色来源的 UP 主：生图提示词/参考图来自微信绘图工坊该角色的专属配置，每次读取实时同步 */
  function workshopGenOf(cid) {
    var cr = creatorOf(cid);
    var sid = cr && cr.sourceCharId ? String(cr.sourceCharId) : "";
    if (!sid || typeof db === "undefined") return null;
    var list = (db.workshopSettings && db.workshopSettings.boundCharacters) || [];
    var bc = list.filter(function (b) { return String(b.charId) === sid; })[0];
    if (!bc) return null;
    return {
      positive: bc.imgGenPositive || "",
      negative: bc.imgGenNegative || "",
      ratio: bc.imgGenAspectRatio || "",
      refs: Array.isArray(bc.imgGenRefs) ? bc.imgGenRefs.slice() : [],
      enabled: !!bc.imgGenEnabled
    };
  }

  function openCreatorEditor(cid) {
    var cr = creatorOf(cid);
    if (!cr) return;
    var isChar = !!(cr.sourceCharId && (typeof db === "undefined" || (db.characters || []).some(function (c) { return String(c.id) === String(cr.sourceCharId); })));
    var gen = isChar ? workshopGenOf(cid) : null;

    var typeChips = ["real", "faceless", "virtual", "radio"].map(function (t) {
      return '<button type="button" class="ws-type' + (cr.type === t ? " on" : "") + '" data-jili-action="crType" data-id="' + t + '">' + typeName(t) + "</button>";
    }).join("");
    var areaOpts = Object.keys(JILI_AREA_NAMES).map(function (a) {
      return '<option value="' + a + '"' + (cr.area === a ? " selected" : "") + ">" + JILI_AREA_NAMES[a] + "</option>";
    }).join("");
    var visual = cr.visual || { img: false, vid: false };

    var parts = [];
    parts.push('<div class="jili-segs cr-tabs"><button class="on">UP 主资料</button></div>');
    parts.push('<div class="jl-scroll jl-scroll-ws cr-form ws-form">');

    /* 基础信息 */
    parts.push('<div class="cr-group"><div class="cr-group-title">基础信息</div>');
    parts.push('<div class="jl-field"><label>名字</label><input id="jili-cr-name" value="' + esc(cr.name) + '"></div>');
    parts.push('<div class="jl-field"><label>类型</label><div class="jl-chips">' + typeChips + "</div></div>");
    parts.push('<div class="jl-field"><label>画面来源</label><div class="jl-chips">' +
      '<button type="button" class="ws-src' + (visual.img ? " on" : "") + '" data-jili-action="crSrc" data-id="img">生图</button>' +
      '<button type="button" class="ws-src' + (visual.vid ? " on" : "") + '" data-jili-action="crSrc" data-id="vid">生成视频</button></div></div>');
    parts.push('<div class="jl-field"><label>分区</label><select id="jili-cr-area">' + areaOpts + "</select></div>");
    parts.push('<div class="jl-field"><label>粉丝数</label><input id="jili-cr-fans" type="number" min="0" value="' + (Number(cr.fans) || 0) + '"></div>');
    parts.push("</div>");

    /* 人设与风格 */
    parts.push('<div class="cr-group"><div class="cr-group-title">人设与风格</div>');
    parts.push('<div class="jl-field"><label>UP 主人设 / 直播风格</label><textarea id="jili-cr-persona" rows="3">' + esc(cr.persona || "") + "</textarea></div>");
    parts.push('<div class="jl-field"><label>口头禅</label><input id="jili-cr-catch" value="' + esc(cr.catchphrase || "") + '"></div>');
    parts.push('<div class="jl-field"><label>开播时间</label><input id="jili-cr-sched" value="' + esc(cr.schedule || "") + '" placeholder="例如：每周二、五 20:00"></div>');
    parts.push(liveCoverFieldHTML(cr.liveCover || "", "jili-cr-livecover"));
    parts.push('<div class="jl-field"><label>关注自动回复</label><textarea id="jili-cr-follow" rows="2">' + esc(cr.followReply || "") + "</textarea></div>");
    parts.push("</div>");

    /* 外观/生图：角色来源只读（来自微信绘图工坊），手动捏可改 */
    if (isChar) {
      var gp = gen || { positive: "", negative: "", refs: [], enabled: false };
      var refHTML = gp.refs.length
        ? '<div class="cr-refs">' + gp.refs.map(function (r) {
            return '<span class="cr-ref"><img src="' + esc(r.src || "") + '" alt=""></span>';
          }).join("") + "</div>"
        : '<div class="cr-emptyref">暂无参考图</div>';
      parts.push('<div class="cr-group"><div class="cr-group-title">生图配置 · 来自微信绘图工坊</div>');
      parts.push('<div class="jl-field cr-readonly"><label>正面提示词</label><div class="cr-roval">' + esc(gp.positive || "未设置") + "</div></div>");
      parts.push('<div class="jl-field cr-readonly"><label>负面提示词</label><div class="cr-roval">' + esc(gp.negative || "未设置") + "</div></div>");
      parts.push('<div class="jl-field cr-readonly"><label>参考图 · ' + gp.refs.length + " 张</label>" + refHTML + "</div>");
      parts.push("</div>");
    } else {
      parts.push('<div class="cr-group"><div class="cr-group-title">外观</div>');
      parts.push('<div class="jl-field"><label>外观提示词（生图 / 视频用，建议英文）</label><textarea id="jili-cr-looks" rows="2" placeholder="English description of face, hair, outfit, room…">' + esc(cr.looks || "") + "</textarea></div>");
      parts.push("</div>");
    }

    /* 粉丝团 */
    parts.push('<div class="cr-group"><div class="cr-group-title">粉丝团</div>');
    parts.push('<div class="jl-field"><label>粉丝名</label><input id="jili-cr-fanname" value="' + esc(cr.fanName || "") + '"></div>');
    parts.push('<div class="jl-field"><label>粉丝怎么称呼你</label><input id="jili-cr-upnick" value="' + esc(cr.upNickname || "") + '" placeholder="例如：老师 / 老大 / 舰长们"></div>');
    parts.push('<div class="jl-field"><label>粉丝牌名称</label><div class="jl-fc-medalrow"><input id="jili-cr-medal" value="' + esc(cr.medalName || "") + '" placeholder="默认取粉丝名前三个字">' +
      fanMedalHTML({ name: cr.name, fanName: cr.fanName, medalName: cr.medalName }, 12, false) + "</div></div>");
    parts.push('<button type="button" class="jl-fc-toggle" data-jili-action="crFanTitleToggle"><span>粉丝头衔 <small>' +
      fanTitlesOf(cr).filter(function (x, i) { return String((cr.fanTitles || [])[i] || "").trim(); }).length + "/7</small></span><span>▾</span></button>");
    parts.push('<div class="jl-fc-titles" id="jili-cr-titles" hidden>' + FAN_TIER_LV.map(function (lv, i) {
      return '<label class="row"><span class="lv">Lv' + lv + (FAN_TIER_LV[i + 1] ? "-" + (FAN_TIER_LV[i + 1] - 1) : "+") + '</span>' +
        '<input id="jili-cr-title-' + i + '" value="' + esc((cr.fanTitles || [])[i] || "") + '" placeholder="' + esc(FAN_TIER_DEF[i]) + '"></label>';
    }).join("") + "</div>");
    parts.push("</div>");

    parts.push('<div class="jili-btnrow"><button class="jl-btn big" data-jili-action="creatorSave" data-id="' + esc(cid) + '">保存修改</button>' +
      '<button class="jl-btn ghost" data-jili-action="back">取消</button></div>');
    parts.push("</div>");

    var html = titlebar("编辑 UP 主") + parts.join("");
    var d = ovEl("creditor");
    if (d) d.innerHTML = html;
    else d = pushOv("creditor", html, 40);
    if (d) d.classList.add("ws-glass");
  }

  /* ================= 设置页 jm ================= */

  /* 设置页：世界书「破限」条目勾选列表（jbEntryIds=null 表示全选） */
  function jbRowsHTML() {
    var rows = [];
    try {
      var books = (typeof db !== "undefined" && db.worldBooks) || [];
      var ids = Array.isArray(S.state.settings.jbEntryIds) ? S.state.settings.jbEntryIds.map(String) : null;
      books.forEach(function (b) {
        if (!b || b.type !== "entry" || b.position !== "limit_break") return;
        var on = ids ? ids.indexOf(String(b.id)) >= 0 : true;
        var bookName = "";
        for (var i = 0; i < books.length; i++) {
          if (books[i] && books[i].id === b.parentId) { bookName = books[i].name || ""; break; }
        }
        rows.push('<label class="jl-crow" style="grid-template-columns:1fr auto"><span><b class="jl-one">' + esc(b.name || "破限条目") + '</b><span>' + esc(bookName) + "</span></span>" +
          '<input id="jili-setting-jb-' + esc(b.id) + '" type="checkbox"' + (on ? " checked" : "") + ' style="width:20px;height:20px;accent-color:#ff6699"></label>');
      });
    } catch (e) { /* 主库不可用时忽略 */ }
    return rows.length
      ? '<div style="margin:6px 0">' + rows.join("") + "</div>"
      : '<p class="jl-hint">还没有「破限」类型的世界书条目。到主应用「世界书」新建破限条目后再来勾选。</p>';
  }

  function openSettings() {
    var st = S.state;
    function cb(key, label, desc) {
      return '<label class="jl-crow" style="grid-template-columns:1fr auto"><span><b>' + label + "</b>" +
        (desc ? "<span>" + desc + "</span>" : "") + "</span>" +
        '<input id="jili-setting-' + key + '" type="checkbox" ' + (st.settings[key] ? "checked" : "") +
        ' style="width:20px;height:20px;accent-color:#ff6699"></label>';
    }
    var gfx = st.settings.giftFx || "all";
    var ink = st.settings.coverInk || "random";
    var coverInkRow = '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>封面文字颜色</b></span>' +
      '<span class="jili-inkrow">' +
      '<button class="jili-ink-dot' + (ink === "random" ? " on" : "") + '" data-jili-action="coverInkSet" data-id="random" aria-label="随机颜色"><i style="background:conic-gradient(#ff6699,#ffe14d,#7fd8e8,#9fe26a,#c9a5ff,#ff6699)"></i></button>' +
      COVER_INKS.map(function (c) {
        return '<button class="jili-ink-dot' + (ink === c ? " on" : "") + '" data-jili-action="coverInkSet" data-id="' + c + '" aria-label="' + c + '"><i style="background:' + c + '"></i></button>';
      }).join("") + "</span></div>";
    var profileAv = '<span id="jili-setting-avatar-prev" class="jl-av" style="width:48px;height:48px;flex:none;' +
      (st.userAvatar ? "background-image:url(" + st.userAvatar + ")" : "background:" + defaultAvatarBG(st.userName || "我")) + '"></span>';
    var html = titlebar("设置") + '<div class="jl-scroll">' +
      '<div class="jl-sect"><div class="jl-secthead"><b>外观</b></div>' +
      cb("darkMode", "黑暗模式") +
      coverInkRow + '</div>' +
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
      '<button class="' + (gfx === "mine" ? "on" : "") + '" data-jili-action="giftFxSet" data-id="mine">只看自己</button>' +
      '<button class="' + (gfx === "none" ? "on" : "") + '" data-jili-action="giftFxSet" data-id="none">关闭</button></span></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>声音设置</b></div>' +
      cb("voiceOn", "语音合成", "开启后 AI 回复会生成语音") +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>音量</b></span>' +
      '<input type="range" min="0" max="100" value="' + (st.settings.voiceVolume || 80) + '" id="jili-setting-voiceVolume" style="width:120px"></div>' +
      '<div class="jl-crow" style="grid-template-columns:1fr auto"><span><b>语速</b></span>' +
      '<input type="range" min="50" max="200" value="' + (st.settings.voiceRate || 100) + '" id="jili-setting-voiceRate" style="width:120px"></div></div>' +
      '<div class="jl-sect"><div class="jl-secthead"><b>成人与破限</b></div>' +
      cb("adult", "成人内容", "允许生成成人向主题（18+）") +
      cb("adultSexOnly", "仅成人向生成", "更开放地生成成人向内容，不淡出") +
      cb("breakLimit", "破限", "把勾选的世界书「破限」条目注入叽哩叽哩所有 AI 生成的最前面") +
      jbRowsHTML() +
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

  /* ================= 投稿页 · 完整投稿流程 ================= */

  function freshUploadDraft() {
    return {
      brief: "", title: "", desc: "", area: "life", durationMin: 3, scriptText: "",
      srcTab: "file", link: "", videoInfo: null, reading: false,
      coverMode: "frame", frameIdx: 0, coverAI: "", coverCustom: "",
      bgmMode: "auto", bgmQuery: "", bgmSong: "",
      coPost: false, collaborators: [], aiCalls: 0, boardCells: []
    };
  }

  function renderUpload() {
    var d = ovEl("upload");
    var box = d && $("#jili-up-scroll", d);
    if (!box || !uploadDraft) return;
    var u = uploadDraft;
    var areas = Object.keys(JILI_AREA_NAMES);
    var durs = [1, 3, 5, 10, 20, 40];
    var h = '<div class="up-form">';

    /* AI 创作影片内容 */
    h += '<div class="up-group"><div class="up-gt">AI 创作影片内容</div>' +
      '<p class="up-hint">写一句方向，AI 会补齐标题、简介和完整脚本；留空也可以自由创作。</p>' +
      '<textarea id="jili-up-brief" class="up-ta" rows="3" placeholder="想拍什么？例如：大家第一次一起旅行的约会 vlog（可留空）">' + esc(u.brief || "") + "</textarea>" +
      '<button type="button" class="jl-btn block up-ai" data-jili-action="uploadGen">✨ AI 帮我创作</button></div>';

    /* 来源：本地影片 / 视频链接 / 图片分镜 */
    h += '<div class="up-group"><div class="jl-seg three up-seg">' +
      '<button type="button" class="' + (u.srcTab === "file" ? "on" : "") + '" data-jili-action="uploadTab" data-id="file">本地影片</button>' +
      '<button type="button" class="' + (u.srcTab === "link" ? "on" : "") + '" data-jili-action="uploadTab" data-id="link">视频链接</button>' +
      '<button type="button" class="' + (u.srcTab === "board" ? "on" : "") + '" data-jili-action="uploadTab" data-id="board">图片分镜</button>' +
      "</div>";
    if (u.srcTab === "file") {
      h += '<div class="up-sub">选择视频（可选）</div>' +
        '<label class="up-file"><span class="up-filebtn">选取文件</span><span class="up-fname">' + esc(u.videoInfo ? u.videoInfo.name : "未选择文件") + "</span>" +
        '<input type="file" accept="video/*" data-jili-upload="video"></label>' +
        '<p class="up-hint">会读取时长并截几张画面做封面、让观众「看到」内容；视频文件本身不存进 App；站内以图文版展示。</p>' +
        (u.reading ? '<p class="up-hint">正在读取视频画面…</p>' : "");
    } else if (u.srcTab === "link") {
      h += '<div class="up-sub">视频链接</div>' +
        '<input id="jili-up-link" class="up-in" value="' + esc(u.link || "") + '" placeholder="粘贴视频直链">' +
        '<button type="button" class="jl-btn sm up-read" data-jili-action="uploadReadLink">读取画面</button>' +
        '<p class="up-hint">' + (u.videoInfo ? "已读取 " + fmtD(u.videoInfo.durationSec) + " · " + u.videoInfo.frames.length + " 张画面" : "会尝试读取时长并截取封面画面。") + "</p>";
    } else {
      h += '<div class="up-sub">图片分镜</div>' +
        '<div class="up-board">' + (u.boardCells || []).map(function (c, i) {
          return '<div class="up-boardcell">' + (c ? '<img src="' + esc(c) + '">' : '<span>' + (i + 1) + "</span>") + "</div>";
        }).join("") + "</div>" +
        '<label class="up-file"><span class="up-filebtn">添加图片</span><span class="up-fname">可多选</span>' +
        '<input type="file" accept="image/*" multiple data-jili-upload="board"></label>';
    }
    h += "</div>";

    /* 封面 */
    var covers = "";
    if (u.videoInfo && u.videoInfo.frames && u.videoInfo.frames.length) {
      covers += u.videoInfo.frames.slice(0, 6).map(function (f, i) {
        return '<button type="button" class="' + (u.coverMode === "frame" && u.frameIdx === i ? "on" : "") + '" data-jili-action="uploadCoverFrame" data-id="' + i + '">' +
          '<img src="' + esc(f.dataUrl) + '"><span>' + fmtD(f.t) + "</span></button>";
      }).join("");
    }
    if (u.coverAI) covers += '<button type="button" class="' + (u.coverMode === "ai" ? "on" : "") + '" data-jili-action="uploadCoverMode" data-id="ai"><img src="' + esc(u.coverAI) + '"><span>AI</span></button>';
    if (u.coverCustom) covers += '<button type="button" class="' + (u.coverMode === "custom" ? "on" : "") + '" data-jili-action="uploadCoverMode" data-id="custom"><img src="' + esc(u.coverCustom) + '"><span>相册</span></button>';
    covers += '<button type="button" class="jl-upcoveradd" data-jili-action="uploadCoverAI">' + ICONS.sparkle + "<span>" + (u.coverAI ? "AI 重画" : "AI 生成") + "</span></button>";
    covers += '<label class="jl-upcoveradd">' + ICONS.camera + "<span>相册选图</span>" +
      '<input type="file" accept="image/*" data-jili-upload="cover"></label>';
    h += '<div class="up-group"><div class="up-gt">封面</div><div class="jl-upcovers">' + covers + "</div></div>";

    /* 标题 / 简介 */
    h += '<div class="up-group"><div class="up-gt">标题</div>' +
      '<input id="jili-up-title" class="up-in" value="' + esc(u.title || "") + '" placeholder="给视频起个标题"></div>';
    h += '<div class="up-group"><div class="up-gt">简介</div>' +
      '<textarea id="jili-up-desc" class="up-ta" rows="3" placeholder="说说这个视频讲了什么">' + esc(u.desc || "") + "</textarea></div>";

    /* 联合投稿 */
    var collabs = (S.state.creators || []).filter(function (c) { return c && c.name; });
    h += '<div class="up-group up-row"><div class="up-rowtx"><b>联合投稿</b><small>可选择角色 UP 主共同署名；观众反应会参考合作方的粉丝量</small></div>' +
      '<label class="up-switch"><input type="checkbox" id="jili-up-co"' + (u.coPost ? " checked" : "") + '><i></i></label></div>';
    if (u.coPost && collabs.length) {
      h += '<div class="up-chips">' + collabs.map(function (c) {
        var on = (u.collaborators || []).indexOf(String(c.id)) >= 0;
        return '<button type="button" class="' + (on ? "on" : "") + '" data-jili-action="uploadCollab" data-id="' + esc(c.id) + '">' + esc(c.name) + "</button>";
      }).join("") + "</div>";
    }

    /* 分区 / 时长 */
    h += '<div class="up-group up-grid2">' +
      '<label><span>分区</span><select id="jili-up-area">' + areas.map(function (a) {
        return '<option value="' + a + '"' + (u.area === a ? " selected" : "") + ">" + JILI_AREA_NAMES[a] + "</option>";
      }).join("") + "</select></label>" +
      '<label><span>时长</span><select id="jili-up-dur">' + durs.map(function (n) {
        return '<option value="' + n + '"' + (Number(u.durationMin) === n ? " selected" : "") + ">" + n + " 分钟</option>";
      }).join("") + "</select></label></div>";

    /* 分镜 / 字幕 */
    h += '<div class="up-group"><div class="up-gt">分镜 / 字幕（可选）</div>' +
      '<textarea id="jili-up-script" class="up-ta up-script" rows="5" placeholder="一行一句，按顺序平均分布在视频里">' + esc(u.scriptText || "") + "</textarea>" +
      '<p class="up-hint">不写的话，「发布并看观众反应」会按画面和简介帮你补分镜。</p></div>';

    /* 背景音乐 */
    h += '<div class="up-group"><div class="up-gt">背景音乐</div>' +
      '<div class="jl-seg three up-seg">' +
      '<button type="button" class="' + (u.bgmMode === "none" ? "on" : "") + '" data-jili-action="uploadBgm" data-id="none">不配乐</button>' +
      '<button type="button" class="' + (u.bgmMode === "auto" ? "on" : "") + '" data-jili-action="uploadBgm" data-id="auto">自动配乐</button>' +
      '<button type="button" class="' + (u.bgmMode === "pick" ? "on" : "") + '" data-jili-action="uploadBgm" data-id="pick">自己选歌</button></div>';
    if (u.bgmMode === "pick") {
      h += '<input id="jili-up-bgmquery" class="up-in" value="' + esc(u.bgmQuery || "") + '" placeholder="搜歌名 / 歌手">' +
        '<div class="up-chips">' + ["lofi hip hop", "轻快流行", "氛围电子", "钢琴", "古风"].map(function (s) {
          return '<button type="button" class="' + (u.bgmSong === s ? "on" : "") + '" data-jili-action="uploadSong" data-id="' + esc(s) + '">' + esc(s) + "</button>";
        }).join("") + "</div>";
    }
    h += '<p class="up-hint">发布时自动挑一首配乐，风格：' + esc(u.bgmQuery || "lofi hip hop") + "（用 AI 创作的话会按内容选曲风）</p></div>";

    /* 发布 */
    h += '<div class="up-cost">「发布并看观众反应」= 1 次 AI 调用，生成弹幕、评论和首日数据；按播放量算创作激励；「直接发布」不调用 AI。</div>' +
      '<button type="button" class="jl-btn block up-pub" data-jili-action="uploadPubAI">⬆ 发布并看观众反应</button>' +
      '<button type="button" class="jl-btn block up-pub2" data-jili-action="uploadPubPlain">⊞ 直接发布</button>';
    h += "</div>";
    box.innerHTML = h;
  }

  function syncUploadDraft() {
    var d = ovEl("upload");
    if (!d || !uploadDraft) return;
    var u = uploadDraft;
    function val(id) { var e = $("#" + id, d); return e ? e.value : null; }
    var v;
    if ((v = val("jili-up-brief")) != null) u.brief = v;
    if ((v = val("jili-up-title")) != null) u.title = v;
    if ((v = val("jili-up-desc")) != null) u.desc = v;
    if ((v = val("jili-up-area")) != null) u.area = v;
    if ((v = val("jili-up-dur")) != null) u.durationMin = Number(v) || 3;
    if ((v = val("jili-up-script")) != null) u.scriptText = v;
    if ((v = val("jili-up-link")) != null) u.link = v;
    if ((v = val("jili-up-bgmquery")) != null) u.bgmQuery = v;
    var co = $("#jili-up-co", d);
    if (co) u.coPost = co.checked;
  }

  function openUpload() {
    closeModal();
    uploadDraft = freshUploadDraft();
    var d = ovEl("upload");
    if (!d) pushOv("upload", titlebar("投稿视频") + '<div class="jl-scroll up-scroll" id="jili-up-scroll"></div>', 38);
    else d.innerHTML = titlebar("投稿视频") + '<div class="jl-scroll up-scroll" id="jili-up-scroll"></div>';
    renderUpload();
  }

  /* 读取视频：隐藏 video 截 6 帧（参考工程同源做法） */
  function uploadReadVideo(src, isFile, fileName) {
    if (!src) return;
    var u = uploadDraft;
    u.reading = true;
    renderUpload();
    var v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    if (!isFile) v.crossOrigin = "anonymous";
    v.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(v);
    var timer = null;
    var done = false;
    function cleanup() {
      if (timer) clearTimeout(timer);
      try { v.removeAttribute("src"); v.load(); } catch (e) { }
      if (v.parentNode) v.parentNode.removeChild(v);
    }
    function fail(msg) {
      if (done) return;
      done = true;
      cleanup();
      if (isFile && src.indexOf("blob:") === 0) URL.revokeObjectURL(src);
      u.reading = false;
      renderUpload();
      toast(msg || "视频读取失败，可直接填资料发布");
    }
    timer = setTimeout(function () { fail(); }, isFile ? 20000 : 20000);
    v.onloadeddata = function () {
      if (done) return;
      clearTimeout(timer);
      var dur = Number.isFinite(v.duration) ? v.duration : 0;
      var frames = [];
      var i = 0;
      function next() {
        if (i >= 6 || !(dur > 0)) { finish(); return; }
        var t = dur * (i + 0.5) / 6;
        var got = false;
        var seekTimer = setTimeout(function () { if (!got) { got = true; v.onseeked = null; i++; next(); } }, 4000);
        v.onseeked = function () {
          if (got) return;
          got = true;
          clearTimeout(seekTimer);
          try {
            var c = document.createElement("canvas");
            var iw = v.videoWidth || 640, ih = v.videoHeight || 360;
            c.width = 640;
            c.height = Math.max(1, Math.round(640 * ih / iw));
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            frames.push({ t: t, dataUrl: c.toDataURL("image/jpeg", 0.72) });
          } catch (e) { }
          i++;
          next();
        };
        try { v.currentTime = t; } catch (e) { clearTimeout(seekTimer); v.onseeked = null; i++; next(); }
      }
      function finish() {
        if (done) return;
        done = true;
        cleanup();
        if (isFile && src.indexOf("blob:") === 0) URL.revokeObjectURL(src);
        u.reading = false;
        u.videoInfo = { name: fileName || u.link || "视频", durationSec: dur, frames: frames, videoUrl: isFile ? "" : src };
        u.coverMode = frames.length ? "frame" : u.coverMode;
        if (!u.title && fileName) u.title = String(fileName).replace(/\.[^.]+$/, "");
        if (dur > 0) u.durationMin = Math.max(1, Math.round(dur / 60));
        renderUpload();
        toast(frames.length ? ("已读取 " + frames.length + " 张画面") : "未取到画面，可继续填资料");
      }
      next();
    };
    v.onerror = function () { fail(); };
    v.src = src;
  }

  function uploadCoverAI(btn) {
    if (typeof window.executeImageGeneration !== "function") { toast("生图功能未配置"); return; }
    var u = uploadDraft;
    syncUploadDraft();
    var prompt = "视频封面，" + (u.title || "视频") + "，" + (u.desc || u.brief || "");
    aiRun(btn, function () {
      var settings = (typeof db !== "undefined" && db.workshopSettings) ? Object.assign({}, db.workshopSettings) : {};
      settings.characterPrompt = prompt;
      return window.executeImageGeneration(settings, prompt);
    }).then(function (r) {
      var img = r && (r.imageData || r.data || (typeof r === "string" ? r : ""));
      if (!r) return;
      if (!img) { toast("生图失败"); return; }
      u.coverAI = img;
      u.coverMode = "ai";
      u.aiCalls++;
      renderUpload();
    });
  }

  function uploadPublish(withAI) {
    syncUploadDraft();
    var u = uploadDraft;
    var title = String(u.title || "").trim();
    if (!title) { toast("先填标题"); return; }
    if (u.bgmMode === "pick" && !u.bgmSong) { toast("先选一首歌"); return; }
    var st = S.state;
    var durSec = Math.max(20, Math.round((Number(u.durationMin) || 3) * 60));
    if (u.videoInfo && u.videoInfo.durationSec > 0) durSec = Math.max(20, Math.round(u.videoInfo.durationSec));

    var lines = String(u.scriptText || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var script = lines.map(function (l, i) { return { t: Math.round(i * durSec / lines.length), k: "desc", text: l }; });
    var scenes = [];
    for (var i = 0; i < script.length; i++) {
      var nt = i + 1 < script.length ? script[i + 1].t : durSec;
      scenes.push({ desc: script[i].text, dur: Math.max(1, Math.round(nt - script[i].t)) });
    }
    if (!scenes.length) scenes = [{ desc: title, dur: durSec }];

    var coverImg = "";
    if (u.coverMode === "custom") coverImg = u.coverCustom || "";
    else if (u.coverMode === "ai") coverImg = u.coverAI || "";
    else if (u.videoInfo && u.videoInfo.frames && u.videoInfo.frames[u.frameIdx]) coverImg = u.videoInfo.frames[u.frameIdx].dataUrl;

    var bgm = u.bgmMode === "none" ? "" : (u.bgmMode === "pick" ? (u.bgmSong || "") : (u.bgmQuery || "lofi hip hop"));

    var post = C.makePost({
      creatorId: pubId(), kind: "video", title: title,
      desc: String(u.desc || "").trim(), intro: String(u.desc || "").trim(),
      area: u.area || "life", durationSec: durSec,
      play: 0, likes: 0, coins: 0, favs: 0, commentsCount: 0, danmakuCount: 0,
      audio: u.bgmMode === "none" ? "voice" : "bgm",
      bgm: bgm, bgmQuery: u.bgmQuery || "",
      script: script, scenes: scenes,
      coverImg: coverImg,
      coverText: C.coverTextFromTitle(title, C.hash(title + "|" + Date.now())),
      seed: C.hash(title + "|" + durSec),
      collaboratorIds: u.coPost ? (u.collaborators || []).slice() : [],
      fromVideo: !!u.videoInfo, videoLink: u.link || "",
      at: Date.now()
    });
    st.posts.unshift(post);
    save();
    uploadDraft = null;
    closeOv("upload");
    HOME_SEG = "rec";
    renderAll();
    toast(withAI ? "已发布，看看观众反应…" : "发布成功");
    if (withAI) {
      aiRun(null, function () { return C.ai.uploadReception(st, post); }).then(function (r) {
        if (r === undefined || !r) return;
        applyReception({ id: post.id }, r);
        st.fans = (st.fans || 0) + (r.newFans || 0);
        st.jibi = (st.jibi || 0) + Math.round((r.stats && r.stats.play || 0) * 0.01);
        save();
        renderAll();
        toast("第一波观众反响来了");
      });
    }
  }

  /* ================= 弹窗群（chooser / 充值 / 充电 / 发动态） ================= */

  function openChooser() {
    openModal("<h3>发布</h3><div class='jl-tiles pub'>" +
      "<button data-jili-action='openStudio'><span class='jl-ic-svg'>" + ICONS.broadcast + "</span><b>开始直播</b></button>" +
      "<button data-jili-action='openUpload'><span class='jl-ic-svg'>" + ICONS.document + "</span><b>投稿视频</b></button>" +
      "<button data-jili-action='openDynModal'><span class='jl-ic-svg'>" + ICONS.edit + "</span><b>发动态</b></button></div>" +
      "<button class='jl-widetile ws' data-jili-action='openWorkshop'><span class='jl-ic-svg jl-ws-ic'>" + ICONS.sparkle + "</span>" +
      "<span class='jili-rowb'><b style='color:var(--jl-ink,#18191c)'>主播工坊</b></span><i>›</i></button>");
  }

  function startLiveModal() {
    var st = S.state;
    var cur = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(pubId()); })[0] || {};
    openModal("<h3>开始直播</h3>" +
      "<div class='jl-field'><label>直播标题</label><input id='jili-live-title' value='" + esc(cur.title || "") + "' placeholder='今天播点什么'></div>" +
      "<div class='jl-field'><label>话题（可选）</label><input id='jili-live-topic' value='" + esc(cur.topic || "") + "' placeholder='例如：聊聊最近看的番'></div>" +
      "<div class='jl-field'><label>画面来源</label><select id='jili-live-source' style='width:100%'>" +
      "<option value='chat'" + (cur.source === "chat" ? " selected" : "") + ">聊天画面</option>" +
      "<option value='camera'" + (cur.source === "camera" ? " selected" : "") + ">摄像头</option>" +
      "<option value='video'" + (cur.source === "video" ? " selected" : "") + ">放视频</option></select></div>" +
      liveShopFormHTML(cur) +
      "<div class='jili-btnrow'><button class='jl-btn' data-jili-action='closeModal'>取消</button><button class='jl-btn pink' data-jili-action='startLiveNow'>开始直播</button></div>");
  }

  function studioStart() {
    var st = S.state;
    var d0 = ovEl("studio");
    var titleEl = $("#jili-studio-title", d0);
    var title = titleEl ? titleEl.value.trim() : "";
    if (!title) { toast("先起个直播标题"); return; }
    var topicEl = $("#jili-studio-topic", d0);
    var topic = topicEl ? topicEl.value.trim() : "";
    var srcEl = $("#jili-studio-source", d0);
    var source = srcEl ? srcEl.value : "chat";
    var shopCfg = readLiveShopForm(d0 || ui.modals);
    var shopOnEl = $("#jili-live-shopon", d0 || ui.modals);
    if (shopOnEl && shopOnEl.checked && !shopCfg) { toast("带货至少选一件商品"); return; }

    // 直播封面：优先本次选择的，其次恢复默认（清空），再次沿用旧的
    var pid = pubId();
    var room = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(pid); })[0];
    var oldCover = (room && room.liveCover) || (creatorOf(pid) || {}).liveCover || "";
    var cover = oldCover;
    if (studioCoverTmp && studioCoverTmp.key === "jili-studio-cover") {
      cover = studioCoverTmp.data;
      if (cover && pid !== "me") { var cr0 = creatorOf(pid); if (cr0) cr0.liveCover = cover; }
      if (!cover && pid !== "me") { var cr1 = creatorOf(pid); if (cr1) delete cr1.liveCover; }
    }

    if (room) {
      room.title = title;
      room.topic = topic;
      room.source = source;
      room.shop = shopCfg;
      room.liveNow = true;
      if (studioCoverTmp && studioCoverTmp.key === "jili-studio-cover") { if (cover) room.liveCover = cover; else delete room.liveCover; }
    } else {
      room = { id: "live_" + pid, creatorId: pid, title: title, topic: topic, source: source, shop: shopCfg, coverText: C.coverTextFromTitle(title, "live:" + title), viewers: 0, popularity: 0, liveNow: true, seed: C.hash(pid + ":" + title) };
      if (cover) room.liveCover = cover;
      st.liveRooms = st.liveRooms || [];
      st.liveRooms.unshift(room);
    }
    studioCoverTmp = null;
    save();
    closeOv("studio");
    openLive(room.id);
  }

  function startLiveNow() {
    var st = S.state;
    var title = ($("#jili-live-title").value || "").trim();
    if (!title) { toast("先起个直播标题"); return; }
    var topic = ($("#jili-live-topic").value || "").trim();
    var srcSel = $("#jili-live-source");
    var source = srcSel ? srcSel.value : "chat";
    var shopCfg = readLiveShopForm(ui.modals);
    var shopOnEl = $("#jili-live-shopon", ui.modals);
    if (shopOnEl && shopOnEl.checked && !shopCfg) { toast("带货至少选一件商品"); return; }
    var room = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(pubId()); })[0];
    if (room) {
      room.title = title;
      room.topic = topic;
      room.source = source;
      room.shop = shopCfg;
      room.liveNow = true;
    } else {
      room = { id: "live_" + pubId(), creatorId: pubId(), title: title, topic: topic, source: source, shop: shopCfg, coverText: C.coverTextFromTitle(title, "live:" + title), viewers: 0, popularity: 0, liveNow: true, seed: C.hash(pubId() + ":" + title) };
      st.liveRooms = st.liveRooms || [];
      st.liveRooms.unshift(room);
    }
    save();
    closeModal();
    openLive(room.id);
  }

  function openRecharge() {
    var st = S.state;
    openModal("<h3>充值叽币</h3><p class='jl-hint'>当前叽币 " + (st.jibi || 0).toLocaleString() + " · 钱包余额 ¥" + walletBalanceOf().toFixed(2) + "</p>" +
      "<div class='jl-tiles four'>" + (C.RECHARGE_TIERS || [6, 30, 98, 298]).map(function (n) {
        return "<button data-jili-action='recharge' data-id='" + n + "'><span>⚡</span><b>" + (n * 600) + " 叽币</b><small>¥ " + n + "</small></button>";
      }).join("") + "</div>" +
      "<p class='jl-hint'>从钱包余额扣款，1 元 = 600 叽币。</p>" +
      "<div class='jili-btnrow'><button class='jl-btn ghost' data-jili-action='openWallet'>去钱包充值</button></div>");
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
    var myRooms = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(pubId()); });
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
    var w = { balance: walletBalanceOf(), transactions: walletTxOf() };
    var tx = (w.transactions || []).slice(0, 20).map(function (t) {
      var income = (Number(t.amount) || 0) > 0;
      var d = new Date(t.time || Date.now());
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      return '<div class="jl-lib-row"><div class="jl-row">' +
        '<span class="jili-rowb"><b>' + esc(t.title || "交易") + "</b><span>" + esc(t.subtitle || "") + "</span>" +
        "<span>" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + "</span></span></div>" +
        '<b style="color:' + (income ? "#2f9e6e" : "inherit") + '">' + (income ? "+" : "-") + "¥" + Math.abs(Number(t.amount) || 0).toFixed(2) + "</b></div>";
    }).join("");
    var html = titlebar("我的钱包") + '<div class="jl-scroll">' +
      '<div class="jl-sect"><div class="jl-secthead"><b>余额</b><span>自动扣款补足叽币</span></div>' +
      '<div class="jl-wallet-bal"><div class="v">¥ ' + Number(w.balance).toFixed(2) + '</div><p>钱包余额</p></div>' +
      '<div class="jili-btnrow"><button class="jl-btn" data-jili-action="rechargeOpen">充值叽币</button>' +
      (st.earnings > 0 ? '<button class="jl-btn ghost" data-jili-action="withdrawWallet">提现收益 ¥' + Number(st.earnings).toFixed(2) + "</button>" : "") +
      "</div></div>" +
      '<div class="jl-sect"><div class="jl-secthead"><b>交易记录</b><span>最近 20 笔</span></div>' +
      (tx || '<div class="jl-empty"><p>暂无交易记录</p></div>') + "</div></div>";
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
      var mode = (d.mode === "top" || d.mode === "center" || d.mode === "bottom") ? d.mode : "fly";
      list.push({ t: t, text: String(d.text || ""), mode: mode, color: d.color || "" });
    });
    if (list.length < 10) {
      var t = 1.2;
      while (t < dur - 0.5) {
        var r = rnd();
        var mode = r < 0.62 ? "fly" : r < 0.78 ? "top" : r < 0.89 ? "center" : "bottom";
        var color = rnd() < 0.16 ? DM_COLORS[1 + Math.floor(rnd() * (DM_COLORS.length - 1))] : "";
        list.push({ t: t, text: DM_POOL[Math.floor(rnd() * DM_POOL.length)], mode: mode, color: color });
        t += 0.8 + rnd() * 1.6;
      }
    }
    list.sort(function (a, b) { return a.t - b.t; });
    return list;
  }

  function sceneHTML(pl, i) {
    var cov = esc(feedCoverText(pl.post.coverText)).replace(/\n/g, "<br>");
    return '<div class="jili-scene" style="' + feedCoverStyle(pl.post, feedGradientForPost(pl.post)) + '">' +
      (cov ? '<b class="jl-scenecov">' + cov + "</b>" : "") + "</div>";
  }

  function sceneStart(pl, i) {
    var acc = 0;
    for (var k = 0; k < i && k < pl.scenes.length; k++) acc += pl.scenes[k].dur;
    return acc;
  }

  function heatPath(pl) {
    var dur = pl.post.durationSec || 60;
    var B = 40, buckets = new Array(B).fill(0);
    (pl.dm || []).forEach(function (d) { var b = Math.min(B - 1, Math.floor((d.t / dur) * B)); buckets[b]++; });
    var max = Math.max.apply(null, buckets.concat([1]));
    var d = "M0,20";
    for (var i = 0; i < B; i++) {
      var x = (i / B) * 100, y = 20 - (buckets[i] / max) * 17;
      d += " L" + x.toFixed(1) + "," + y.toFixed(1) + " L" + (((i + 1) / B) * 100).toFixed(1) + "," + y.toFixed(1);
    }
    d += " L100,20 Z";
    return { d: d };
  }

  function pl0(pl) { return pl; }

  function bindPlayerStage(ov) {
    var stage = $(".jl-player", ov);
    if (!stage) return;
    stage.addEventListener("click", function (e) {
      if (e.target.closest(".jl-pctl") || e.target.closest(".jl-ratemenu") || e.target.closest(".jl-setpop") || e.target.closest(".jl-morepop") || e.target.closest(".jl-bigplay")) return;
      var pctl = $("#jili-pctl", ov);
      if (!pctl) return;
      var show = pctl.classList.contains("hide");
      pctl.classList.toggle("hide", !show);
      var rp = $("#jili-ratepop", ov);
      if (rp) rp.hidden = true;
      var sp = $("#jili-setpop", ov);
      if (sp) sp.hidden = true;
      var mp = $("#jili-morepop", ov);
      if (mp) mp.hidden = true;
      if (player) player.ctrlUntil = show ? Date.now() + 3200 : 0;
    });
    var prog = $("#jili-prog", ov);
    if (prog) {
      var seekTo = function (e) {
        if (!player) return;
        var r = prog.getBoundingClientRect();
        if (!r.width || !isFinite(r.width)) return;
        var f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        player.time = f * (player.post.durationSec || 60);
        if (player.clip) player.time = Math.max(player.clip.start, Math.min(player.clip.end - 0.5, player.time));
        clearDm();
        player.di = dmIndexAt(player.time);
        updateHUD();
      };
      var dragging = false;
      prog.addEventListener("pointerdown", function (e) { dragging = true; seekTo(e); try { prog.setPointerCapture && prog.setPointerCapture(e.pointerId); } catch (err) { } });
      prog.addEventListener("pointermove", function (e) { if (dragging) seekTo(e); });
      prog.addEventListener("pointerup", function () { dragging = false; });
      prog.addEventListener("pointercancel", function () { dragging = false; });
    }
  }

  function saveFramePNG(pl, idx) {
    try {
      var s = pl.scenes[idx] || { desc: "", sub: "" };
      var cv = document.createElement("canvas");
      cv.width = 960; cv.height = 540;
      var g = cv.getContext("2d");
      var h = C.hash("cover:" + String(pl.post.seed) + "#s" + idx);
      var h1 = h % 360, h2 = (h >>> 8) % 360;
      var grad = g.createLinearGradient(0, 0, cv.width, cv.height);
      grad.addColorStop(0, "hsl(" + h1 + ", 70%, 55%)");
      grad.addColorStop(1, "hsl(" + h2 + ", 70%, 32%)");
      g.fillStyle = grad;
      g.fillRect(0, 0, cv.width, cv.height);
      var ink = coverInkOf(pl.post.seed + "#s" + idx);
      g.fillStyle = ink;
      g.textAlign = "left";
      if (s.desc) {
        g.font = "900 44px sans-serif";
        var lines = wrapText(g, s.desc, cv.width - 96);
        lines.slice(0, 3).forEach(function (ln, li) { g.fillText(ln, 48, 120 + li * 54); });
      }
      if (pl.post.title) {
        g.font = "600 26px sans-serif";
        g.globalAlpha = 0.92;
        g.fillText(pl.post.title, 48, cv.height - 40);
        g.globalAlpha = 1;
      }
      if (s.sub) {
        g.font = "700 30px sans-serif";
        g.textAlign = "center";
        g.shadowColor = "rgba(0,0,0,.8)"; g.shadowBlur = 8;
        g.fillStyle = "#fff";
        g.fillText(s.sub.slice(0, 28), cv.width / 2, cv.height - 110);
        g.shadowBlur = 0;
      }
      g.font = "500 20px sans-serif";
      g.textAlign = "right";
      g.globalAlpha = 0.75;
      g.fillText("jili · 剧照", cv.width - 48, 60);
      var a = document.createElement("a");
      a.download = "jili_剧照_" + (pl.post.title || "画面").slice(0, 16) + "_" + (idx + 1) + ".png";
      a.href = cv.toDataURL("image/png");
      a.click();
      toast("已保存剧照");
    } catch (e) { toast("保存失败：" + e.message); }
  }

  function wrapText(g, text, maxW) {
    var out = [], line = "";
    for (var i = 0; i < String(text).length; i++) {
      var c = String(text)[i];
      if (g.measureText(line + c).width > maxW) { out.push(line); line = c; }
      else line += c;
    }
    if (line) out.push(line);
    return out;
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
      post: p, time: 0, playing: true, rate: Number(S.state.settings.playRate) || 1, timer: null,
      scenes: planScenes(p), sceneIdx: -1, clip: null, ctrlUntil: 0,
      dm: buildDmSchedule(p), di: 0, dmOn: true,
      tracks: [], fixFree: { top: [], center: [], bottom: [] },
      suppress: false
    };
    var dur = fmtD(p.durationSec || 0);
    var heat = heatPath(pl0(player));
    var html =
      '<div class="jl-player jili-stage" data-stage="1">' +
        '<div class="jili-scenewrap">' + sceneHTML(player, 0) + "</div>" +
        '<div class="jl-dmlayer" id="jili-dmlayer"></div>' +
        '<div class="jl-sub" id="jili-sub"></div>' +
        '<div id="jili-ratepop" class="jl-ratemenu" hidden role="menu">' +
          [2, 1.5, 1.25, 1, 0.75, 0.5].map(function (r) {
            return '<button role="menuitemradio" aria-checked="' + (r === 1) + '" data-jili-action="rateSet" data-id="' + r + '" class="' + (r === 1 ? "on" : "") + '">' + r + "x</button>";
          }).join("") + "</div>" +
        '<div id="jili-setpop" class="jl-setpop" hidden>' + dmSetHTML() + "</div>" +
        '<button class="jl-bigplay" id="jili-bigplay" data-jili-action="playToggle" aria-label="播放">' + ICONS.bigplay + "</button>" +
        '<div class="jl-pctl hide" id="jili-pctl">' +
          '<div class="jl-ptop">' +
            '<button data-jili-action="back" aria-label="返回">' + ICONS.chevleft + "</button>" +
            '<span class="ttl jl-one">' + esc(p.title) + "</span>" +
            '<button class="jl-morebtn" data-jili-action="morePop" aria-label="更多设置" id="jili-morebtn">' + ICONS.more + "</button>" +
          "</div>" +
          '<div id="jili-morepop" class="jl-morepop" hidden>' +
            '<div class="jl-morettl">播放模式</div>' +
            '<button data-jili-action="modeSet" data-id="normal" class="' + (player.clip ? "" : "on") + '">' + ICONS.storyboard + '<span>图文版</span><i class="jl-modeck">✓</i></button>' +
            '<button data-jili-action="modeSet" data-id="clip" class="' + (player.clip ? "on" : "") + '">' + ICONS.refresh + '<span>精华片段循环</span><i class="jl-modeck">✓</i></button>' +
          "</div>" +
          '<div class="jl-pbar" id="jili-pbar">' +
            '<button class="jl-playbtn" id="jili-playbtn" data-jili-action="playToggle" aria-label="播放或暂停">' + ICONS.pause + "</button>" +
            '<span class="time" id="jili-time">0:00</span>' +
            '<span class="jl-prog" id="jili-prog">' +
              '<svg class="jl-dmheat" id="jili-dmheat" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="jili-heatclip"><rect id="jili-heatrect" x="0" y="0" width="0" height="20"/></clipPath></defs><path class="all" d="' + heat.d + '"/><path class="done" clip-path="url(#jili-heatclip)" d="' + heat.d + '"/></svg>' +
              '<span class="track"></span><span class="fill" id="jili-fill" style="width:0%"></span><span class="knob" id="jili-knob" style="left:0%"></span>' +
            "</span>" +
            '<span class="time jl-dur">' + dur + "</span>" +
            '<button class="jl-dmtog' + (player.dmOn ? "" : " off") + '" data-jili-action="dmToggle" aria-label="弹幕开关">弹</button>' +
            '<button class="jl-ratebtn' + (player.rate !== 1 ? " on" : "") + '" data-jili-action="ratePop" aria-label="播放速度" id="jili-ratebtn">' + (player.rate === 1 ? "倍速" : player.rate + "x") + "</button>" +
            '<button class="jl-setbtn" data-jili-action="dmSet" aria-label="播放设置">' + ICONS.sliders + "</button>" +
            '<button class="jl-fsbtn" data-jili-action="fsBtn" aria-label="横屏全屏">' + ICONS.expand + "</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="jlp-subbar">' +
        '<div class="jlp-tabs">' +
          '<button class="' + (cmTab === "intro" ? "on" : "") + '" data-jili-action="cmTabSet" data-id="intro">简介</button>' +
          '<button id="jili-tabcm" class="' + (cmTab === "comments" ? "on" : "") + '" data-jili-action="cmTabSet" data-id="comments">评论 ' + fmtN((p.comments || []).length) + "</button>" +
        "</div>" +
        '<input class="jlp-dmin" id="jili-dm-text" placeholder="发个友善的弹幕">' +
        '<button class="jlp-dmsend" data-jili-action="dmSendV" aria-label="发送弹幕">' + ICONS.send + "</button>" +
      "</div>" +
      '<div class="jl-scroll jlp-scroll" id="jili-postbody"></div>' +
      '<div id="jili-cmto"></div>' +
      '<div class="jlp-cmbar"><input id="jili-cm-input" placeholder="' + esc(CM_PHRASES[Math.floor(Math.random() * CM_PHRASES.length)]) + '"><button class="jlp-cmemj" data-jili-action="cmEmoji">☺</button><button class="jlp-cmsend" data-jili-action="cmSend">发送</button></div>';
    var ov = pushOv("post", html, 30);
    ov.className = "jl-root jili-postov";
    ov.style.background = "#111";
    bindPlayerStage(ov);
    renderPostBody();
    startPlayerTimer();
    setPlayBtn();
    var cr = creatorOf(p.creatorId);
    if (cr && cr.fanOnly && !C.chargedOf(st, p.creatorId)) {
      toast("充电专属视频 · 充电后可看完整版");
    }
  }

  var DM_COLORS = ["#ffffff", "#fe0302", "#ff7204", "#ffff00", "#00cd00", "#00bebe", "#00a0e9", "#c209c2"];
  function dmChips(label, key, opts, fmt, def) {
    var s = S.state.settings;
    var cur = s[key] == null ? def : s[key];
    return '<div class="jl-field"><label>' + label + "</label>" +
      '<div class="jl-chips">' + opts.map(function (o) {
        return '<button class="' + (Number(cur) === Number(o) ? "on" : "") + '" data-jili-action="dmPref" data-k="' + key + '" data-v="' + o + '">' + fmt(o) + "</button>";
      }).join("") + "</div></div>";
  }
  function dmCheck(key, label) {
    var s = S.state.settings;
    return '<label class="jl-dmset-row"><span>' + label + '</span><input type="checkbox" data-jili-action="dmPref" data-k="' + key + '" data-v="auto"' + (s[key] ? " checked" : "") + "></label>";
  }
  function dmSetHTML() {
    var s = S.state.settings;
    var blocks = String(s.dmBlock || "").split(/[,，、\s]+/).filter(Boolean);
    var myColor = s.dmMyColor || "#ffffff";
    var myMode = s.dmMyMode || "scroll";
    return '<div class="jili-dmset-head" style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 10px"><b style="font-size:16px">播放设置</b><button class="jl-iconbtn" data-jili-action="dmSetClose">✕</button></div>' +
      '<div class="jl-field"><label>播放速度</label><div class="jl-chips">' + [0.75, 1, 1.25, 1.5, 2].map(function (r) {
        return '<button data-jili-action="rateSet" data-id="' + r + '" class="' + (player && player.rate === r ? "on" : "") + '">' + (r === 1 ? "正常" : r + "x") + "</button>";
      }).join("") + "</div></div>" +
      '<div class="jl-field"><label>我发的弹幕</label>' +
      '<div class="jl-dmset-colors">' + DM_COLORS.map(function (c) {
        return '<button class="' + (myColor === c ? "on" : "") + '" style="background:' + c + '" data-jili-action="dmPref" data-k="dmMyColor" data-v="' + c + '" aria-label="' + c + '"></button>';
      }).join("") + "</div>" +
      '<div class="jl-chips">' + [["scroll", "滚动"], ["top", "顶部"], ["center", "中间"], ["bottom", "底部"]].map(function (m) {
        return '<button class="' + (myMode === m[0] ? "on" : "") + '" data-jili-action="dmPref" data-k="dmMyMode" data-v="' + m[0] + '">' + m[1] + "</button>";
      }).join("") + "</div></div>" +
      dmChips("不透明度", "dmOpacity", [0.3, 0.5, 0.8, 1], function (o) { return Math.round(o * 100) + "%"; }, 1) +
      dmChips("字号", "dmSize", [0.8, 1, 1.2], function (o) { return o === 0.8 ? "小" : o === 1 ? "标准" : "大"; }, 1) +
      dmChips("显示区域", "dmArea", [0.25, 0.5, 0.75, 1], function (o) { return o === 1 ? "满屏" : Math.round(o * 100) + "%"; }, 1) +
      dmChips("弹幕速度", "dmSpeed", [0.7, 1, 1.4], function (o) { return o === 0.7 ? "慢" : o === 1 ? "适中" : "快"; }, 1) +
      '<div class="jl-field">' +
      dmCheck("dmHeat", "高能进度条") +
      dmCheck("dmHideTop", "屏蔽顶部弹幕") +
      dmCheck("dmHideBottom", "屏蔽底部弹幕") +
      dmCheck("dmHideColor", "屏蔽彩色弹幕") +
      "</div>" +
      '<div class="jl-field"><label>屏蔽词</label>' +
      '<span class="jl-dmset-add"><input id="jili-dm-block" placeholder="输入要屏蔽的词" enterkeyhint="done"><button class="jl-btn sm" data-jili-action="dmBlockAdd">新增</button></span>' +
      (blocks.length ? '<div class="jl-chips">' + blocks.map(function (w) {
        return '<button data-jili-action="dmBlockDel" data-id="' + esc(w) + '">' + esc(w) + " ✕</button>";
      }).join("") + "</div>" : "") +
      "</div>";
  }
  function keepCtrl() {
    if (player) player.ctrlUntil = Date.now() + 3200;
    var d = ovEl("post");
    if (d) {
      var pctl = $("#jili-pctl", d);
      if (pctl) pctl.classList.remove("hide");
    }
  }
  function openDmSet() {
    var d = ovEl("post");
    if (!d) return;
    var pop = $("#jili-setpop", d);
    if (!pop) return;
    var wasOpen = !pop.hidden;
    pop.innerHTML = dmSetHTML();
    pop.hidden = wasOpen;
    var rp = $("#jili-ratepop", d);
    if (rp) rp.hidden = true;
    var mp = $("#jili-morepop", d);
    if (mp) mp.hidden = true;
    if (!wasOpen) keepCtrl();
  }
  function clearDm() {
    var layer = $("#jili-dmlayer", ovEl("post"));
    if (layer) layer.innerHTML = "";
    if (player) {
      player.tracks = [];
      player.fixFree = { top: [], center: [], bottom: [] };
    }
  }
  function dmIndexAt(t) {
    if (!player) return 0;
    var list = player.dm || [], lo = 0, hi = list.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid].t <= t) lo = mid + 1; else hi = mid;
    }
    return lo;
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
          '<button class="jlp-act' + (p.liked ? " on" : "") + '" data-tri="1"><span class="heart-container' + (p.liked ? " on" : "") + '"><span class="svg-container">' +
              '<svg class="svg-outline" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
              '<svg class="svg-filled" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
              '<svg class="svg-celebrate" viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.5 16.1l-.15-.13C7.14 14.79 4 11.92 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 3.42-3.14 6.29-7.85 10.47l-.15.12z"/></svg>' +
          '</span></span><b id="jili-nlike">' + fmtN(p.likes || 0) + "</b><u>点赞</u></button>" +
          '<button class="jlp-act' + (p.disliked ? " on" : "") + '" data-jili-action="dislike"><i>' + ICONS.thumbsdown + '</i><b>' + fmtN(p.dislikes || 0) + "</b><u>不喜欢</u></button>" +
          '<button class="jlp-act' + (p.coined ? " on" : "") + '" data-jili-action="coin"><i>' + ICONS.coin + '</i><b id="jili-ncoin">' + fmtN(p.coins || 0) + "</b><u>投币</u></button>" +
          '<button class="jlp-act' + (p.faved ? " on" : "") + '" data-jili-action="fav"><i>' + ICONS.star + '</i><b id="jili-nfav">' + fmtN(p.favs || 0) + "</b><u>收藏</u></button>" +
          '<button class="jlp-act" data-jili-action="share"><i>' + ICONS.forward + '</i><b id="jili-nshare">' + fmtN(p.shares || 0) + "</b><u>分享</u></button>" +
        "</div>" +
        (p.series ? '<button class="jlp-series" data-jili-action="openSeries" data-id="' + esc(p.series) + '"><span class="l"><b>合集 · ' + esc(p.series) + "</b>" + (p.epTitle ? "<span>" + esc(p.epTitle) + "</span>" : "") + '</span><span class="r">' + (epTotal >= (p.episode || 1) && epTotal > 1 ? (p.episode || 1) + "/" + epTotal : "已更 " + Math.max(epTotal, p.episode || 1) + " 集") + " ›</span></button>" : "") +
        (p.intro ? '<p class="jlp-intro">' + esc(p.intro) + "</p>" : "") +
        rel.map(function (o) {
          var oc = creatorOf(o.creatorId);
          var cov = esc(feedCoverText(o.coverText)).replace(/\n/g, "<br>");
          return '<div class="jlp-rel" data-jili-action="openPost" data-id="' + esc(o.id) + '">' +
            '<span class="jlp-relcov" style="background:' + feedGradientForPost(o) + '">' +
              (cov ? '<b class="jl-feedct">' + cov + "</b>" : "") +
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
    if (!pl) return;
    var now = Date.now();
    var dt = Math.min(2, Math.max(0, (now - (pl.last || now)) / 1000));
    pl.last = now;
    if (!pl.playing) return;
    pl.time += dt * (pl.rate || 1);
    var dur = pl.post.durationSec || 60;
    if (pl.clip) {
      if (pl.time >= pl.clip.end) {
        pl.time = pl.clip.start;
        clearDm();
        pl.di = dmIndexAt(pl.time);
      }
    } else if (pl.time >= dur) { pl.time = dur; pl.playing = false; setPlayBtn(); }
    var d0 = ovEl("post");
    var pctl = $("#jili-pctl", d0);
    var rp = $("#jili-ratepop", d0);
    var sp = $("#jili-setpop", d0);
    var mp = $("#jili-morepop", d0);
    var menuOpen = (rp && !rp.hidden) || (sp && !sp.hidden) || (mp && !mp.hidden);
    if (pctl && pl.playing && pl.ctrlUntil && Date.now() > pl.ctrlUntil && !menuOpen && !pctl.classList.contains("hide")) {
      pctl.classList.add("hide");
      if (rp) rp.hidden = true;
      if (sp) sp.hidden = true;
      if (mp) mp.hidden = true;
    }
    updateHUD();
    spawnDueDm();
  }
  function updateHUD() {
    var pl = player;
    if (!pl) return;
    var d = ovEl("post");
    if (!d) return;
    var dur = pl.post.durationSec || 60;
    var pct = isFinite(pl.time) ? Math.max(0, Math.min(100, (pl.time / dur) * 100)) : 0;
    if (!isFinite(pl.time)) pl.time = 0;
    var knob = $("#jili-knob", d);
    if (knob) knob.style.left = pct + "%";
    var fill = $("#jili-fill", d);
    if (fill) fill.style.width = pct + "%";
    var hr = $("#jili-heatrect", d);
    if (hr) hr.setAttribute("width", pct.toFixed(2));
    var heatEl = $("#jili-dmheat", d);
    if (heatEl) heatEl.style.display = S.state.settings.dmHeat === false ? "none" : "";
    var tl = $("#jili-time", d);
    if (tl) tl.textContent = fmtD(pl.time);
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
    var subEl = $("#jili-sub", d);
    if (subEl) {
      var cur = "", isSay = false;
      if (pl.post.script && pl.post.script.length) {
        for (var j = 0; j < pl.post.script.length; j++) {
          var ln = pl.post.script[j];
          if (ln && Number(ln.t) <= pl.time) { cur = String(ln.text || ""); isSay = ln.k === "say"; }
        }
      }
      if (!cur) cur = (pl.scenes[idx] && pl.scenes[idx].desc) || "";
      if (subEl.textContent !== cur) subEl.textContent = cur;
      subEl.classList.toggle("jl-sub-desc", !isSay);
    }
  }
  function setPlayBtn() {
    var d = ovEl("post");
    if (!d || !player) return;
    var big = $("#jili-bigplay", d);
    if (big) big.style.display = player.playing ? "none" : "grid";
    var pb = $("#jili-playbtn", d);
    if (pb) pb.innerHTML = player.playing ? ICONS.pause : ICONS.play;
    var layer = $("#jili-dmlayer", d);
    if (layer) layer.classList.toggle("paused", !player.playing);
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
    if (!layer.style.getPropertyValue("--w")) layer.style.setProperty("--w", (layer.clientWidth || 320) + "px");
    while (pl.di < pl.dm.length && pl.dm[pl.di].t <= pl.time) {
      var item = pl.dm[pl.di++];
      if (!dmBlocked(item.text) && !dmFiltered(item, s)) spawnDm(layer, item, s);
    }
  }
  function dmFiltered(item, s) {
    var mode = item.mode === "scroll" ? "fly" : item.mode;
    if (mode === "top" && s.dmHideTop) return true;
    if (mode === "bottom" && s.dmHideBottom) return true;
    if (s.dmHideColor && (item.color || (item.mine && s.dmMyColor && s.dmMyColor !== "#ffffff"))) return true;
    return false;
  }
  function spawnDm(layer, item, s) {
    var pl = player;
    if (!pl) return;
    var mode = item.mode === "scroll" ? "fly" : item.mode;
    if (mode !== "fly" && mode !== "top" && mode !== "bottom" && mode !== "center") mode = "fly";
    var color = item.mine ? (s.dmMyColor || "") : (item.color || "");
    var h = layer.clientHeight || 156;
    var spd = Number(s.dmSpeed) || 1;
    var rate = pl.rate || 1;
    var d = document.createElement("span");
    d.textContent = item.text;
    if (color) d.style.color = color;
    if (mode === "fly") {
      var laneH = Math.max(26, Math.min(32, h / 6));
      var lanes = Math.max(3, Math.min(9, Math.floor(h / laneH)));
      while (pl.tracks.length < lanes) pl.tracks.push(0);
      var area = s.dmArea == null ? 1 : Number(s.dmArea);
      var maxLane = Math.max(1, Math.round(lanes * area));
      var dur = 8 / (spd * rate);
      var tr = -1;
      for (var i = 0; i < maxLane; i++) {
        if (pl.tracks[i] <= pl.time) { tr = i; break; }
      }
      if (tr < 0) return;
      pl.tracks[tr] = pl.time + (8 / spd) + 0.5;
      d.className = "jl-flydm";
      d.style.top = (4 + tr * laneH) + "px";
      d.style.animationDuration = dur + "s";
      layer.appendChild(d);
      d.addEventListener("animationend", function () { d.remove(); });
    } else {
      var free = pl.fixFree[mode];
      var slots = mode === "center" ? 3 : 4;
      while (free.length < slots) free.push(0);
      var slot = -1;
      for (var k = 0; k < slots; k++) {
        if (free[k] <= pl.time) { slot = k; break; }
      }
      if (slot < 0) return;
      free[slot] = pl.time + 4.5;
      d.style.animationDuration = (4 / rate) + "s";
      d.className = "jl-fixdm";
      if (mode === "top") d.style.top = (4 + slot * 28) + "px";
      else if (mode === "bottom") d.style.bottom = (4 + slot * 28) + "px";
      else d.style.top = "calc(50% + " + ((slot - 1) * 28 - 12) + "px)";
      layer.appendChild(d);
      d.addEventListener("animationend", function () { d.remove(); });
    }
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
    if (lk) {
      lk.classList.toggle("on", !!p.liked);
      var hc = lk.querySelector(".heart-container");
      if (hc) hc.classList.toggle("on", !!p.liked);
    }
    function mark(act, on) { var el = $('[data-jili-action="' + act + '"]', d); if (el) el.classList.toggle("on", !!on); }
    mark("dislike", p.disliked);
    mark("coin", p.coined);
    mark("fav", p.faved);
    var tab = $("#jili-tabcm", d);
    if (tab) tab.textContent = "评论 " + (p.comments || []).length;
  }

  /* ================= 直播观看页 Jd ================= */

  /* ================= 直播间（对齐 nuojiji 玩法：礼物/SC/大航海/榜单/PK/天选/投票/红包） ================= */

  var LIVE_GUARDS = [
    { id: "captain", name: "舰长", price: 198, rank: 1 },
    { id: "admiral", name: "提督", price: 1998, rank: 2 },
    { id: "governor", name: "总督", price: 19998, rank: 3 }
  ];
  var GUARD_NAME = { captain: "舰长", admiral: "提督", governor: "总督" };
  var SC_TIERS = [
    { price: 30, until: 60000 },
    { price: 50, until: 120000 },
    { price: 100, until: 300000 }
  ];
  var GIFT_COUNTS = [1, 10, 66, 520];
  var FX_DUR = { big: 3600, legend: 6000, guard: 4600 };
  var NPC_NAMES = ["星河碎屑", "奶茶三分甜", "今天也要摸鱼", "夜航西飞", "软糖不软", "凌晨四点的猫", "不会起名", "打工人小王", "柠檬精本精", "低语者", "路过的一只", "云边有个小卖部", "秃头程序员", "爱吃火锅", "清风拂面", "不想上班", "住在海底", "某只路过的鸟", "午夜电台", "数星星的人", "半糖去冰", "咸鱼翻身", "电脑前发呆", "南巷旧人"];
  var NPC_DMS = ["主播今天状态好好", "哈哈哈笑死我了", "来了来了，每天都来", "这个真的绝了", "前排围观", "主播声音好好听", "蹲一个后续", "666666", "太强了吧", "这是今天的主题吗", "弹幕护体", "刚下班赶来", "好耶好耶", "主播多聊聊这个", "支持支持", "有人一起吗", "嚯，涨知识了", "屏幕前的我饿了呢", "气氛组报到", "主播加油！"];
  var PK_TAUNTS = ["就这？我的观众可比你热情多了~", "对面的朋友们，欢迎来我这边看看哦", "这波我要赢定了，你们说是不是", "别光看着呀，快助力你家主播！", "听说对面的主播昨晚翻车了？", "比分拉开啦，冲冲冲！", "输了可要表演才艺的哦", "大家把礼物刷起来！"];

  function liveMyName() { return acctName(pubId()); }
  function clampN(v, lo, hi, dft) { v = Number(v); if (!isFinite(v)) v = dft; return Math.max(lo, Math.min(hi, v)); }
  function giftOf(gid) {
    var g = (C.GIFTS || []).filter(function (x) { return x.id === gid; })[0];
    return g || { id: gid, emoji: "🎁", name: "神秘礼物", price: 1, tier: "small" };
  }
  function guardDef(level) {
    return LIVE_GUARDS.filter(function (x) { return x.id === level; })[0] || LIVE_GUARDS[0];
  }
  function scoreOf(l) {
    if (!l) return 0;
    if (l.type === "gift") { var g = giftOf(l.gift); return (g.price || 0) * (l.count || 1); }
    if (l.type === "sc") return 10 * (l.price || 30);
    if (l.type === "guard") return guardDef(l.level).price;
    return 0;
  }
  function medalCls(lv) {
    return lv >= 25 ? "m7" : lv >= 21 ? "m6" : lv >= 17 ? "m5" : lv >= 13 ? "m4" : lv >= 9 ? "m3" : lv >= 5 ? "m2" : "m1";
  }

  /* ---------- 粉丝团 / 粉丝牌（对齐 nuojiji：等级、头衔、亲密度、旅程） ---------- */

  var FAN_TIER_LV = [1, 5, 9, 13, 17, 21, 25];
  var FAN_TIER_DEF = ["初来乍到", "眼熟观众", "常驻铁粉", "真爱粉", "死忠粉", "元老", "本命守护"];
  var FAN_MS_FANS = [1000, 10000, 100000, 1000000, 10000000];

  function fanTitlesOf(cr) {
    var custom = cr && Array.isArray(cr.fanTitles) ? cr.fanTitles : [];
    return FAN_TIER_LV.map(function (lv, i) { return String(custom[i] || "").trim() || FAN_TIER_DEF[i]; });
  }
  function fanMedalName(cr) {
    if (!cr) return "";
    return cr.medalName || String(cr.fanName || cr.name || "").slice(0, 3);
  }
  function fanState(cid) {
    var st = S.state;
    st.fanships = st.fanships || {};
    var f = st.fanships[cid] = st.fanships[cid] || {};
    f.intimacy = Number(f.intimacy) || 0;
    if (!f.tierAt || typeof f.tierAt !== "object") f.tierAt = {};
    return f;
  }
  function fanLvOf(intimacy) {
    intimacy = Number(intimacy) || 0;
    return intimacy <= 0 ? 0 : Math.min(40, Math.floor(Math.sqrt(intimacy / 5)) + 1);
  }
  function fanTierOf(lv) {
    var t = -1;
    for (var i = 0; i < FAN_TIER_LV.length; i++) if (lv >= FAN_TIER_LV[i]) t = i;
    return t;
  }
  function fanTitleOf(cr, tier) { return tier < 0 ? "" : fanTitlesOf(cr)[tier]; }
  function fanInfo(cr) {
    var f = fanState(cr.id);
    var lv = fanLvOf(f.intimacy);
    var tier = fanTierOf(lv);
    return {
      f: f, lv: lv, tier: tier, title: fanTitleOf(cr, tier),
      next: lv > 0 && lv < 40 ? 5 * lv * lv : null,
      prev: lv > 1 ? 5 * (lv - 1) * (lv - 1) : 0
    };
  }
  function fanMedalHTML(cr, lv, guard) {
    var tier = fanTierOf(lv || 0);
    return '<span class="jl-fmedal ' + (tier < 0 ? "off" : "t" + tier) + (guard ? " guard" : "") + '">' +
      '<span class="nm">' + esc(fanMedalName(cr)) + '</span><b>' + ((lv || 0) > 0 ? lv : "-") + "</b></span>";
  }
  function fanAddIntimacy(cid, amount) {
    amount = Math.round(Number(amount) || 0);
    if (!cid || !amount) return;
    var cr = creatorOf(cid);
    var f = fanState(cid);
    var lv0 = fanLvOf(f.intimacy);
    var tier0 = fanTierOf(lv0);
    f.intimacy += amount;
    var lv1 = fanLvOf(f.intimacy);
    var tier1 = fanTierOf(lv1);
    for (var i = tier0 + 1; i <= tier1; i++) f.tierAt[i] = Date.now();
    save();
    if (cr && lv1 > lv0) toast("粉丝牌升到 Lv" + lv1 + "「" + fanTitleOf(cr, tier1) + "」");
  }
  function fanJourney(cr) {
    var st = S.state;
    var f = fanState(cr.id);
    var out = [];
    var fa = (st.followedAt || {})[cr.id];
    if (fa) out.push({ kind: "follow", at: fa, key: "follow" });
    Object.keys(f.tierAt || {}).forEach(function (t) {
      var at = Number(f.tierAt[t]) || 0;
      if (at) out.push({ kind: "tier", tier: Number(t), at: at, key: "tier" + t });
    });
    if (f.guard && f.guardSince) out.push({ kind: "guard", guard: f.guard, at: f.guardSince, key: "guard" });
    return out.sort(function (a, b) { return b.at - a.at; });
  }
  function fanJourneyLabel(cr, j) {
    if (j.kind === "follow") return "关注了 " + cr.name;
    if (j.kind === "guard") return "开通了" + GUARD_NAME[j.guard];
    return "获得「" + fanTitleOf(cr, j.tier) + "」";
  }

  /* ---------- 里程碑（自动 + 自定义） ---------- */

  function milestoneList(cr) {
    var st = S.state;
    var out = [];
    var posts = (st.posts || []).filter(function (p) { return String(p.creatorId) === String(cr.id); });
    var vids = posts.filter(function (p) { return p.kind === "video"; }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var dyns = posts.filter(function (p) { return p.kind === "dynamic"; }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var room = (st.liveRooms || []).filter(function (r) { return String(r.creatorId) === String(cr.id); })[0];

    var fans = Number(cr.fans) || 0;
    var topFans = 0;
    FAN_MS_FANS.forEach(function (n) { if (fans >= n) topFans = n; });
    if (topFans) out.push({ key: "fans" + topFans, kind: "fans", n: topFans, at: cr.createdAt || 0 });

    var play = vids.reduce(function (s, p) { return s + (Number(p.play) || 0); }, 0);
    if (play >= 10000) {
      var best = vids.slice().sort(function (a, b) { return (b.play || 0) - (a.play || 0); })[0];
      out.push({ key: "play", kind: "play", n: Math.floor(play / 10000) * 10000, title: best ? best.title : "", at: best ? best.at : 0 });
    }
    if (vids[0]) out.push({ key: "firstVideo", kind: "firstVideo", title: vids[0].title, at: vids[0].at || 0 });
    if (dyns[0]) out.push({ key: "firstDynamic", kind: "firstDynamic", at: dyns[0].at || 0 });
    if (room) out.push({ key: "firstLive", kind: "firstLive", title: room.title || "直播", at: room.createdAt || room.startedAt || 0 });

    (cr.milestones || []).forEach(function (m, i) {
      if (!m || !String(m.text || "").trim()) return;
      var at = m.date ? new Date(m.date + "T12:00:00").getTime() : 0;
      out.push({ key: m.id || "c" + i, kind: "custom", text: String(m.text).trim(), at: isFinite(at) ? at : 0, custom: true, m: m });
    });
    return out.filter(function (m) { return m.at !== 0 || m.kind === "custom"; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }
  function milestoneText(cr, m) {
    if (m.kind === "fans") return "粉丝突破 " + fmtN(m.n);
    if (m.kind === "play") return "「" + m.title + "」播放突破 " + fmtN(m.n);
    if (m.kind === "firstVideo") return "投稿了第一个视频「" + m.title + "」";
    if (m.kind === "firstDynamic") return "发布了第一条动态";
    if (m.kind === "firstLive") return "第一次开播：「" + m.title + "」";
    return m.text || "";
  }
  function milestoneIcon(kind) {
    if (kind === "fans") return ICONS.me;
    if (kind === "play") return ICONS.bigplay;
    if (kind === "firstVideo") return ICONS.vplay;
    if (kind === "firstDynamic") return ICONS.edit;
    if (kind === "firstLive") return ICONS.broadcast;
    return ICONS.star;
  }

  /* ---------- 粉丝文化 UI 片段 ---------- */

  function fanStripHTML(cr) {
    var has = cr.upNickname || cr.fanName || cr.medalName;
    if (!has) return "";
    return '<div class="jl-fc-strip">' +
      (cr.upNickname ? "<span><i>称呼</i>" + esc(cr.upNickname) + "</span>" : "") +
      (cr.fanName ? "<span><i>粉丝</i>" + esc(cr.fanName) + "</span>" : "") +
      fanMedalHTML(cr, 1, false) +
      "</div>";
  }
  function fanMineHTML(cr) {
    var info = fanInfo(cr);
    var guard = guardActive(cr.id);
    var open = !!SPACE_FAN_OPEN;
    var pct = info.lv > 0
      ? (info.next ? Math.max(0, Math.min(100, (info.f.intimacy - info.prev) / (info.next - info.prev) * 100)) : 100)
      : 0;
    var sub = info.lv
      ? (info.next ? "再送 " + (info.next - info.f.intimacy) + " 亲密度升到 Lv" + (info.lv + 1) : "已是最高等级")
      : "送礼物、上舰长就能累计亲密度";
    var html = '<div class="jl-fc-mine"><button class="main" data-jili-action="fanMineToggle" data-id="' + esc(cr.id) + '">' +
      fanMedalHTML(cr, info.lv, guard) +
      '<span class="txt"><b class="jl-one">' + esc(info.lv ? info.title : "还未佩戴粉丝牌") + "</b>" +
      '<span class="jl-one">' + esc(sub) + "</span></span>" +
      '<span class="jl-fc-chev">' + (open ? "▴" : "▾") + "</span></button>";
    if (info.lv > 0) html += '<span class="track"><i style="width:' + pct + '%"></i></span>';
    if (open) {
      var journey = fanJourney(cr);
      html += '<div class="more"><div class="ladder">' + FAN_TIER_LV.map(function (lv, i) {
        return '<span class="' + (i === info.tier ? "on" : "") + " " + (i < info.tier ? "past" : "") + '"><small>Lv' + lv + "</small>" + esc(fanTitlesOf(cr)[i]) + "</span>";
      }).join("") + "</div>" +
        '<p class="jl-hint">你是「' + esc(cr.fanName || fanMedalName(cr)) + '」' + (cr.upNickname ? "，可以叫 TA「" + esc(cr.upNickname) + "」" : "") + "</p>" +
        (journey.length ? '<ul class="jl-fc-tl">' + journey.map(function (j) {
          return "<li><span class=\"dot\">" + ICONS.star + '</span><span class="b">' + esc(fanJourneyLabel(cr, j)) + "</span><small>" + (j.at ? new Date(j.at).toLocaleDateString() : "初次相遇前") + "</small></li>";
        }).join("") + "</ul>" : "") + "</div>";
    }
    return html + "</div>";
  }
  function milestonesHTML(cr) {
    var list = milestoneList(cr);
    return '<div class="jl-fc-ms"><div class="jl-secthead" style="padding:14px 0 6px"><b>里程碑 <span>' + list.length + '</span></b>' +
      '<button class="more" data-jili-action="msOpen" data-id="' + esc(cr.id) + '">' + (list.length ? "查看全部" : "添加") + "</button></div>" +
      (list.length
        ? '<ul class="jl-fc-tl">' + list.slice(0, 3).map(function (m) {
          return "<li><span class=\"dot k-" + m.kind + '">' + milestoneIcon(m.kind) + '</span><span class="b"><span class="jl-two">' + esc(milestoneText(cr, m)) + "</span></span>" +
            "<small>" + (m.at ? new Date(m.at).toLocaleDateString() : "初次相遇前") + "</small></li>";
        }).join("") + "</ul>"
        : '<div class="jl-hint" style="padding:4px 0 12px">还没有里程碑，点「添加」记录你想记住的瞬间</div>') +
      "</div>";
  }

  function openMilestones(cid) {
    var cr = creatorOf(cid);
    if (!cr) return;
    var list = milestoneList(cr);
    openModal("<h3>里程碑</h3>" +
      '<div class="jl-fc-ms" style="margin:0 0 10px">' +
      (list.length ? '<ul class="jl-fc-tl">' + list.map(function (m) {
        return "<li><span class=\"dot k-" + m.kind + '">' + milestoneIcon(m.kind) + '</span><span class="b"><span class="jl-two">' + esc(milestoneText(cr, m)) + "</span><small>" + (m.at ? new Date(m.at).toLocaleDateString() : "") + "</small></span>" +
          (m.custom ? '<button class="del" data-jili-action="msDel" data-id="' + esc(cid) + '" data-key="' + esc(m.key) + '" aria-label="删除">✕</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="jl-hint">还没有里程碑</p>') +
      "</div>" +
      '<div class="jl-fc-msadd"><input id="jili-ms-text" placeholder="记下一个值得纪念的瞬间…"><div class="r"><input id="jili-ms-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '<button class="jl-btn sm" data-jili-action="msAdd" data-id="' + esc(cid) + '">添加</button></div></div>' +
      '<div class="jili-btnrow"><button class="jl-btn ghost" data-jili-action="closeModal">关闭</button></div>');
  }

  /* ---------- 支付 / 钱包 ---------- */

  function walletBalanceOf() {
    if (window.Wallet) { try { return Number(window.Wallet.balance()) || 0; } catch (e) {} }
    return Number(S.state.walletBalance) || 0;
  }
  function walletTxOf() {
    if (window.Wallet) { try { var st = window.Wallet.state(); return (st && st.transactions) || []; } catch (e) {} }
    return [];
  }
  function todayWithdrawOf() {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    return walletTxOf().filter(function (t) { return t.type === "refund" && (t.time || 0) >= start.getTime(); })
      .reduce(function (s, t) { return s + Math.abs(Number(t.amount) || 0); }, 0);
  }
  function payConfirm(cost, fn, opts) {
    opts = opts || {};
    cost = Math.max(0, Math.round(Number(cost) || 0));
    var st = S.state;
    var have = Number(st.jibi) || 0;
    if (have >= cost) { st.jibi = have - cost; save(); fn(); return; }
    var diff = cost - have;
    var yuan = Math.max(0.01, Math.round(diff / 600 * 100) / 100);
    openModal("<h3>确认支付</h3>" +
      "<p class='jl-hint'>" + esc(opts.title || "本次消费") + "：<b>" + fmtN(cost) + " 叽币</b></p>" +
      "<p class='jl-hint'>叽币不够，还差 " + fmtN(diff) + " 叽币。可以用钱包余额补足。</p>" +
      "<div class='jili-btnrow'><button class='jl-btn ghost' data-jili-action='closeModal'>取消</button>" +
      "<button class='jl-btn' id='jili-pay-confirm'>用钱包补足（¥" + yuan.toFixed(2) + "）并支付</button></div>");
    var b = $("#jili-pay-confirm", ui.modals);
    if (b) b.addEventListener("click", function () {
      var ok = false;
      if (window.Wallet) { try { ok = window.Wallet.spend(yuan, { type: "recharge", title: "补足叽币", subtitle: opts.title || "站内消费" }); } catch (e) { ok = false; } }
      if (!ok) { toast("钱包余额不足，先去「我的钱包」充值吧"); return; }
      st.jibi = Math.max(0, have + diff - cost);
      save();
      closeModal();
      fn();
      toast("支付成功");
    });
  }

  /* ---------- 直播带货（小黄车） ---------- */

  var SHOP_CATALOG = [
    { id: "g1", name: "限定徽章", emoji: "🎖️", price: 29, desc: "金属徽章 · 限量", stock: 100 },
    { id: "g2", name: "同款保温杯", emoji: "🥤", price: 69, desc: "主播同款", stock: 60 },
    { id: "g3", name: "联名卫衣", emoji: "👕", price: 129, desc: "秋冬新款", stock: 40 },
    { id: "g4", name: "手写明信片", emoji: "💌", price: 19, desc: "亲笔祝福", stock: 200 },
    { id: "g5", name: "零食大礼包", emoji: "🍪", price: 49, desc: "边播边吃", stock: 80 }
  ];
  var SHOP_COMMS = [0, 10, 20, 30, 50];

  function roomShopOf(room, cr) {
    if (room && room.shop && room.shop.on && room.shop.goods && room.shop.goods.length) return room.shop;
    var goods = cr && cr.liveNow && cr.liveNow.goods;
    if (Array.isArray(goods) && goods.length) {
      return {
        on: true, commission: 0, host: "creator",
        goods: goods.map(function (g, i) {
          return { id: g.id || "cg" + i, name: g.name || "商品", emoji: g.emoji || "📦", price: Number(g.price) || 9.9, desc: g.desc || "", stock: Number(g.stock) || 50 };
        })
      };
    }
    return null;
  }
  function liveShopFormHTML(cur) {
    var shop = cur && cur.shop && cur.shop.on ? cur.shop : null;
    var picked = {};
    ((shop && shop.goods) || []).forEach(function (g) { picked[g.id] = true; });
    return '<div class="jl-field"><label>带货（可选）</label>' +
      '<label class="jl-crow" style="grid-template-columns:1fr auto"><span><b>开启小黄车</b><span>直播时带货，观众可在直播间下单</span></span>' +
      '<input id="jili-live-shopon" type="checkbox" ' + (shop ? "checked" : "") + ' style="width:20px;height:20px;accent-color:#ff6699"></label>' +
      '<div class="jl-chips" style="margin-top:8px;flex-wrap:wrap">' + SHOP_CATALOG.map(function (g) {
        return '<button type="button" class="jl-shopgood' + (picked[g.id] ? " on" : "") + '" data-jili-action="shopGoodToggle" data-id="' + g.id + '">' + g.emoji + " " + esc(g.name) + " ¥" + g.price + "</button>";
      }).join("") + "</div>" +
      '<div class="jl-chips" style="margin-top:8px">佣金档：' + SHOP_COMMS.map(function (n) {
        return '<button type="button" class="jl-comm' + ((shop ? shop.commission : 20) === n ? " on" : "") + '" data-jili-action="shopCommPick" data-id="' + n + '">' + n + "%</button>";
      }).join("") + "</div>" +
      '<p class="jl-hint">佣金 = 本场成交额 × 比例，下播后自动结算到钱包。商品库存每场重置。</p></div>';
  }
  function readLiveShopForm(root) {
    var on = $("#jili-live-shopon", root);
    if (!on || !on.checked) return null;
    var goods = [];
    $$(".jl-shopgood.on", root).forEach(function (b) {
      var g = SHOP_CATALOG.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (g) goods.push({ id: g.id, name: g.name, emoji: g.emoji, price: g.price, desc: g.desc, stock: g.stock });
    });
    if (!goods.length) return null;
    var cb = $(".jl-comm.on", root);
    return { on: true, commission: cb ? Number(cb.getAttribute("data-id")) || 0 : 20, host: "me", goods: goods };
  }
  function shopItemOf(shop, idx) { return shop && shop.items ? shop.items[idx] : null; }
  function shopFeaturedOf(shop) { return shop && shop.items && shop.items.length ? (shop.items[shop.featured] || shop.items[0]) : null; }
  function renderShopPin() {
    var pin = $("#jili-shoppin", ovEl("live"));
    if (!pin || !liveP || !liveP.shop) return;
    var it = shopFeaturedOf(liveP.shop);
    if (!it) return;
    var sold = liveP.shop.gmv > 0 ? "剩 " + it.stock + " 件 · 本场 ¥" + liveP.shop.gmv.toFixed(2) : "剩 " + it.stock + " 件";
    pin.innerHTML = '<span class="emo">' + (it.emoji || "📦") + '</span><span class="tx"><b class="jl-one">' + esc(it.name) + "</b><span>" + esc(sold) + "</span></span>" +
      (liveP.isMe ? '<span class="gmv">GMV ¥' + liveP.shop.gmv.toFixed(0) + "</span>" : '<span class="gmv buy">去購買</span>');
  }
  function shopSoldOut(item) {
    if (!liveP || !liveP.shop || !item) return;
    liveP.shop.presenting = false;
    liveSys("「" + item.name + "」已抢光！");
    renderShopPin();
    if ($(".jl-sheet.jlv-shop", ovEl("live"))) renderShopSheet();
  }
  function shopNpcOrder(l) {
    if (!liveP || !liveP.shop) return;
    var idx = Number(l.item);
    var item = shopItemOf(liveP.shop, idx);
    if (!item || item.stock <= 0) return;
    var qty = clampN(l.qty, 1, 5, 1);
    qty = Math.min(qty, item.stock);
    item.stock -= qty;
    item.sold += qty;
    liveP.shop.orders += 1;
    liveP.shop.units += qty;
    liveP.shop.gmv = Math.round((liveP.shop.gmv + item.price * qty) * 100) / 100;
    chatLine({ type: "act", name: l.name, text: "拍下了 #" + (idx + 1) + " " + item.name + " ×" + qty });
    if (item.stock <= 0) shopSoldOut(item);
    else renderShopPin();
    if ($(".jl-sheet.jlv-shop", ovEl("live"))) renderShopSheet();
  }
  function openShopSheet() {
    if (!liveP || !liveP.shop) return;
    openLiveSheet("", "jlv-giftsheet", true);
    renderShopSheet();
  }
  function renderShopSheet() {
    var sheet = liveSheetEl();
    if (!sheet || !liveP || !liveP.shop) return;
    var sh = liveP.shop;
    var cfg = sh.cfg || {};
    var isShopHost = liveP.isMe && cfg.host === "me";
    var rows = sh.items.map(function (it, i) {
      var soldOut = it.stock <= 0;
      return '<div class="row' + (soldOut ? " sold" : "") + '">' +
        '<span class="emo">' + (it.emoji || "📦") + "</span>" +
        '<span class="tx"><b class="jl-one">#' + (i + 1) + " " + esc(it.name) + "</b><span>" + esc(it.desc || "") + " · 剩 " + it.stock + " / 已卖 " + it.sold + "</span></span>" +
        '<span class="side"><span class="price">¥' + Number(it.price).toFixed(2) + "</span>" + (soldOut ? '<span class="acts"><button disabled>已抢光</button></span>' :
          '<span class="acts">' + (isShopHost ? '<button data-jili-action="shopPresent" data-id="' + i + '">讲解</button>' :
            '<button class="buy" data-jili-action="shopBuy" data-id="' + i + '">购买</button>') + "</span>") + "</span></div>";
    }).join("");
    sheet.className = "jl-sheet jlv-giftsheet jlv-shop";
    sheet.innerHTML = '<div class="hd"><span>小黄车 · 本场成交</span></div>' +
      '<div class="sum"><span>GMV <b>¥' + sh.gmv.toFixed(2) + "</b></span><span>订单 <b>" + sh.orders + "</b></span><span>件数 <b>" + sh.units + "</b></span></div>" +
      '<div class="jlv-giftscroll"><div class="jlv-shopscroll">' + rows + "</div></div>" +
      '<div class="jlv-gfoot"><span class="bal">' + (sh.presenting ? "正在讲解「" + esc((shopFeaturedOf(sh) || {}).name || "") + "」" : "选择商品讲解或直接购买") + "</span>" +
      (liveP.isMe ? '<button class="rc" data-jili-action="endLive">结束直播</button>' : "") +
      '<button class="jl-btn sm ghost" data-jili-action="giftClose">关闭</button></div>' +
      (liveP.isMe && cfg.host === "me" ? '<div class="note">佣金 ' + (cfg.commission || 0) + "% · 预计 ¥" + (sh.gmv * (cfg.commission || 0) / 100).toFixed(2) + "</div>" : "");
  }
  function shopBuy(idx) {
    if (!liveP || !liveP.shop) return;
    var item = shopItemOf(liveP.shop, Number(idx));
    if (!item || item.stock <= 0) { toast("这件已经抢光了"); return; }
    var yuan = Number(item.price) || 0;
    var cost = Math.round(yuan * 600);
    payConfirm(cost, function () {
      if (!liveP || !liveP.shop) return;
      item.stock -= 1;
      item.sold += 1;
      liveP.shop.orders += 1;
      liveP.shop.units += 1;
      liveP.shop.gmv = Math.round((liveP.shop.gmv + yuan) * 100) / 100;
      liveP.shop.featured = Number(idx);
      chatLine({ type: "act", name: liveMyName(), text: "拍下了 #" + (Number(idx) + 1) + " " + item.name + " ×1" });
      if (item.stock <= 0) shopSoldOut(item);
      else { renderShopPin(); if ($(".jl-sheet.jlv-shop", ovEl("live"))) renderShopSheet(); }
      toast("下单成功，主播会尽快发货");
    }, { title: "购买 " + item.name });
  }
  function shopPresent(idx) {
    if (!liveP || !liveP.shop || !liveP.isMe) return;
    var item = shopItemOf(liveP.shop, Number(idx));
    if (!item) return;
    liveP.shop.featured = Number(idx);
    liveP.shop.presenting = true;
    liveSys("主播开始讲解「" + item.name + "」，库存 " + item.stock + " 件");
    renderShopPin();
    renderShopSheet();
  }
  function medalLvOf(name, me) {
    if (me) {
      var f = (S.state.fanships || {})[liveP.room.creatorId];
      return fanLvOf(f ? f.intimacy : 0);
    }
    return 1 + (C.hash(String(name)) % 20);
  }
  function guardActive(cid) {
    var f = (S.state.fanships || {})[cid];
    return f && f.guard && (!f.guardUntil || f.guardUntil > Date.now()) ? f : null;
  }
  function countTxt(ms) {
    ms = Math.max(0, ms);
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function boardAdd(cid, name, pts, lv) {
    var st = S.state;
    var day = new Date();
    var key = day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
    var bd = st.liveBoards[cid] = st.liveBoards[cid] || { days: {}, guards: {} };
    var d = bd.days[key] = bd.days[key] || {};
    var e = d[name] = d[name] || { name: name, p: 0, lv: 1 };
    e.p += pts;
    e.lv = Math.max(e.lv, lv || 1);
    var keys = Object.keys(st.liveBoards);
    while (keys.length > 40) { delete st.liveBoards[keys.shift()]; keys = Object.keys(st.liveBoards); }
  }
  function boardAgg(bd, range) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var start = now.getTime();
    if (range === "week") start -= ((now.getDay() + 6) % 7) * 86400000;
    else if (range === "month") start -= (now.getDate() - 1) * 86400000;
    var acc = {};
    Object.keys(bd.days || {}).forEach(function (k) {
      var t = new Date(k + "T00:00:00").getTime();
      if (!isFinite(t) || t < start) return;
      var d = bd.days[k];
      Object.keys(d).forEach(function (n) {
        var e = acc[n] = acc[n] || { name: n, p: 0, lv: 1 };
        e.p += d[n].p;
        e.lv = Math.max(e.lv, d[n].lv || 1);
      });
    });
    return Object.keys(acc).map(function (k) { return acc[k]; }).filter(function (e) { return e.p > 0; }).sort(function (a, b) { return b.p - a.p; });
  }
  function npcGuardUpsert(name, level) {
    var bd = S.state.liveBoards[liveP.room.creatorId];
    if (!bd) return;
    var gd = guardDef(level);
    var g = bd.guards[name] = bd.guards[name] || { name: name, level: level, since: Date.now(), until: 0, p: 0 };
    if (guardDef(g.level).rank < gd.rank) g.level = level;
    g.until = Math.max(g.until || 0, Date.now() + 30 * 86400000);
    g.p += gd.price;
  }
  function seedBoard(cid) {
    var st = S.state;
    var bd = st.liveBoards[cid] = st.liveBoards[cid] || { days: {}, guards: {} };
    var now = Date.now();
    var n = 2 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var nm = NPC_NAMES[(i * 7 + C.hash(cid)) % NPC_NAMES.length];
      if (bd.guards[nm] && bd.guards[nm].until > now) continue;
      var gd = LIVE_GUARDS[Math.floor(Math.random() * 3)];
      var days = 1 + Math.floor(Math.random() * 40);
      bd.guards[nm] = { name: nm, level: gd.id, since: now - days * 86400000, until: now + (1 + Math.floor(Math.random() * 20)) * 86400000, p: gd.price * (1 + Math.floor(Math.random() * 3)) };
    }
    var f = st.fanships[cid];
    if (f && f.guard && (!f.guardUntil || f.guardUntil > now)) {
      bd.guards["me"] = { name: liveMyName(), level: f.guard, since: f.guardSince || (f.guardUntil || now) - 30 * 86400000, until: f.guardUntil || now, p: f.intimacy || 0 };
    }
  }

  /* 直播画面：按 seed 程序生成一张风景 SVG 图（离线可用，每个直播间不同） */
  function sceneArtFor(seed) {
    var h = C.hash(String(seed || "live") + "|art");
    var hue = h % 360;
    var hue2 = (hue + 30 + (h >> 4) % 90) % 360;
    var sunX = 15 + (h >> 6) % 70, sunY = 18 + (h >> 9) % 22, sunR = 10 + (h >> 12) % 12;
    var night = (h >> 3) & 1;
    var sky1 = "hsl(" + hue + ",70%," + (night ? "14%" : "72%") + ")";
    var sky2 = "hsl(" + hue2 + ",80%," + (night ? "26%" : "55%") + ")";
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">'
      + '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient></defs>'
      + '<rect width="400" height="300" fill="url(#sky)"/>'
      + '<circle cx="' + (sunX * 4) + '" cy="' + (sunY * 3) + '" r="' + sunR + '" fill="#ffffff" opacity="' + (night ? ".9" : ".95") + '"/>'
      + (night
        ? '<circle cx="' + (sunX * 4 + 30) + '" cy="' + (sunY * 3 - 20) + '" r="1.6" fill="#fff" opacity=".8"/><circle cx="' + (sunX * 4 - 44) + '" cy="' + (sunY * 3 + 10) + '" r="1.2" fill="#fff" opacity=".7"/><circle cx="' + (sunX * 4 + 80) + '" cy="' + (sunY * 3 + 26) + '" r="1.4" fill="#fff" opacity=".6"/>'
        : '<ellipse cx="' + (sunX * 3) + '" cy="' + (sunY * 3 + 34) + '" rx="70" ry="16" fill="#fff" opacity=".55"/><ellipse cx="' + (sunX * 4 + 60) + '" cy="' + (sunY * 3 + 12) + '" rx="52" ry="13" fill="#fff" opacity=".45"/>')
      + '<polygon points="0,300 90,' + (150 + (h >> 7) % 50) + ' 190,300" fill="hsl(' + hue + ',45%,38%)" opacity=".9"/>'
      + '<polygon points="130,300 250,' + (120 + (h >> 10) % 60) + ' 370,300" fill="hsl(' + hue2 + ',50%,30%)" opacity=".92"/>'
      + '<polygon points="260,300 340,' + (170 + (h >> 5) % 40) + ' 430,300" fill="hsl(' + hue + ',40%,24%)" opacity=".9"/>'
      + '<rect y="272" width="400" height="28" fill="hsl(' + hue2 + ',45%,18%)"/>'
      + '</svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function openLive(roomId) {
    var st = S.state;
    var room = roomOf(roomId);
    if (!room) { toast("直播间不存在"); return; }
    var isMe = String(room.creatorId) === String(pubId());
    var cr = creatorOf(room.creatorId) || (isMe ? meAsCreator() : null);
    if (!cr) { toast("主播不存在"); return; }
    if (removeOv("live")) stopLive();
    st.liveBoards = st.liveBoards || {};
    st.fanships = st.fanships || {};
    var viewers = room.viewers || Math.max(12, Math.round(0.03 * (cr.fans || 0)));
    liveP = {
      room: room, cr: cr, isMe: isMe,
      queue: [], pumpT: null, evT: null, fxT: null, npcT: null,
      base: Math.max(12, Math.round(0.03 * (cr.fans || 0))),
      viewers: viewers, rank: {}, names: [], ended: false, chatLog: [],
      banners: [], scPins: [], stageQ: [], stageBusy: false,
      entries: [], entryBusy: false,
      lottery: null, vote: null, packets: [], packetSeq: 0,
      pk: null, pkIntroUntil: 0,
      giftSel: { tab: "gift", id: null, count: 1, scPrice: 30 },
      aud: { tab: "room", range: "online" },
      host: { tab: "lottery", prize: "", kw: "", sec: 60, jibi: 0, q: "", opts: ["", "", ""], total: 500, count: 20, pkSec: 300, opp: null },
      likeN: 0
    };
    seedBoard(room.creatorId);
    var shopCfg = roomShopOf(room, cr);
    if (shopCfg) {
      liveP.shop = {
        cfg: shopCfg,
        items: shopCfg.goods.map(function (g) { return { id: g.id, name: g.name, emoji: g.emoji || "📦", price: Number(g.price) || 9.9, desc: g.desc || "", stock: Number(g.stock) || 50, sold: 0 }; }),
        featured: 0, presenting: false, orders: 0, units: 0, gmv: 0
      };
      if (!isMe) liveP.shop.presenting = true;
    }
    var myGuard = guardActive(room.creatorId);
    var html =
      '<div class="jlv">' +
        '<div class="jlv-head">' +
          '<button class="jlv-icon" data-jili-action="back" aria-label="返回">' + ICONS.back + '</button>' +
          '<div class="jlv-anchor">' + avHTML(cr, 30) +
            '<div class="an"><b class="jl-one">' + esc(cr.name) + '</b><span class="jl-one">' + fmtN(cr.fans || 0) + ' 粉丝</span></div>' +
          '</div>' +
          '<button class="jlv-follow' + (isFollowed(cr.id) ? " done" : "") + '" data-jili-action="liveFollow" data-id="' + esc(cr.id) + '">' + (isFollowed(cr.id) ? "✓" : "关注") + '</button>' +
          '<button class="jlv-audience" data-jili-action="audOpen"><span class="jlv-top3" id="jili-top3"></span><span class="jlv-online" id="jili-online">' + fmtN(viewers) + '</span></button>' +
        '</div>' +
        '<div class="jlv-tagsrow">' +
          '<span class="jlv-tag">' + esc(areaName(cr.area)) + '</span>' +
          (room.topic ? '<span class="jlv-tag">' + esc(room.topic) + '</span>' : "") +
          '<button class="jlv-morelive" data-jili-action="tab" data-id="home">更多直播 ›</button>' +
        '</div>' +
        '<div class="jlv-screen">' +
          '<div class="jlv-fill" style="background:#0a0a14 url(\'' + (room.liveCover || cr.liveCover || sceneArtFor(room.seed || room.id)) + '\') center/cover no-repeat"></div>' +
          '<div class="jlv-landstage"></div>' +
          (liveP.shop ? '<div class="jlv-shoppin-wrap' + (isMe ? "" : " viewer") + '"><button class="jlv-shoppin" id="jili-shoppin" data-jili-action="shopOpen"></button></div>' : "") +
          (isMe ? '<div class="jlv-stagebar"><button class="jlv-hostbtn" data-jili-action="hostOpen">直播玩法</button></div>' : "") +
        '</div>' +
        '<div class="jlv-chatwrap"><div class="jlv-chat" id="jili-chat">' +
          '<div class="jlv-line plain">' + esc(cr.name) + ' 的直播间开播啦</div>' +
          '<div class="jlv-line anchor"><b>' + esc(cr.name) + '：</b>' + esc(cr.catchphrase || "大家好呀，欢迎进来坐坐～") + '</div>' +
        '</div></div>' +
        '<div class="jlg-scbar" id="jili-scbar" hidden></div>' +
        '<div class="jlv-bottom">' +
          '<button class="jlv-round menu" data-jili-action="liveMenu" aria-label="菜单">⋯</button>' +
          '<label class="jlv-inp"><input id="jili-live-dm" placeholder="弹幕支持下~" enterkeyhint="send"></label>' +
          '<span class="jlk-wrap"><span class="jlk-hearts" id="jili-jlkhearts"></span><button class="jlk-btn" data-jili-action="likeTap" aria-label="点赞">' + ICONS.heartsvg + '</button></span>' +
          '<button class="jlv-round gift" data-jili-action="giftOpen" aria-label="礼物">' + ICONS.giftsvg + '</button>' +
          (liveP.shop ? '<button class="jlv-round shop" data-jili-action="shopOpen" aria-label="小黄车">🛒</button>' : "") +
        '</div>' +
        '<div class="jlg-banners" id="jili-banners"></div>' +
        '<div class="jlg-burst" id="jili-burst"></div>' +
        '<div class="jlg-stage" id="jili-stage" hidden></div>' +
        '<div class="jlv-evstack" id="jili-evstack"></div>' +
        '<div id="jili-pkwrap"></div>' +
        '<div class="jlv-entry" id="jili-entry" hidden></div>' +
      '</div>';
    pushOv("live", html, 32);
    renderShopPin();
    liveP.evT = setInterval(liveTick, 1000);
    liveP.fxT = setInterval(fxTick, 500);
    liveP.npcT = setInterval(npcPulse, 2600);
    updateTop3();
    aiRun(null, function () { return C.ai.liveRound(st, room.id, ""); }).then(function (r) {
      if (r === undefined || !liveP) return;
      liveP.queue = liveP.queue.concat((r && r.lines) || r || []);
      if (!liveP.pumpT) pumpQueue();
    });
  }

  function updateTop3() {
    var box = $("#jili-top3", ovEl("live"));
    if (!box || !liveP) return;
    var top = Object.keys(liveP.rank).map(function (k) { return liveP.rank[k]; }).sort(function (a, b) { return b.p - a.p; }).slice(0, 3);
    box.innerHTML = top.map(function (e, i) {
      return '<span class="r' + (i + 1) + '"><i>' + (e.name === liveMyName() ? "我" : e.name.slice(0, 1)) + '</i></span>';
    }).join("");
  }

  function chatLine(l) {
    var chat = $("#jili-chat", ovEl("live"));
    if (!chat || !liveP) return;
    var html = typeof l === "string" ? l : lineHTML(l);
    var d = document.createElement("div");
    d.innerHTML = html;
    var el = d.firstChild;
    if (el) {
      chat.appendChild(el);
      while (chat.children.length > 60) chat.removeChild(chat.firstChild);
      var wrap = chat.parentElement;
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    }
    if (typeof l !== "string") liveP.chatLog.push({ at: Date.now(), type: l.type || "dm", name: l.name || (l.me ? liveMyName() : ""), text: l.text || "" });
    if (liveP.chatLog.length > 200) liveP.chatLog.shift();
  }
  function liveSys(text) { chatLine({ type: "sys", text: text }); }
  function pushName(name) {
    if (!name || name === liveMyName() || liveP.names.indexOf(name) >= 0) return;
    liveP.names.push(name);
    if (liveP.names.length > 40) liveP.names.shift();
  }
  function recentNames() { return liveP.names.slice(); }

  function lineHTML(l) {
    var st = S.state;
    var type = l.type || "dm";
    if (type === "sys") return '<div class="jlv-line sys">' + esc(l.text || "") + '</div>';
    if (type === "anchor") return '<div class="jlv-line anchor"><b>' + esc(l.name || liveP.cr.name) + '：</b>' + esc(l.text || "") + '</div>';
    if (type === "act") return '<div class="jlv-line act">' + esc((l.name ? l.name + "：" : "") + (l.text || "")) + '</div>';
    if (type === "enter") {
      return l.guard
        ? '<div class="jlv-line guardin ' + esc(l.guard) + '">⛵ ' + esc(l.name) + ' 开通了' + GUARD_NAME[l.guard] + '，进入直播间</div>'
        : '<div class="jlv-line plain">' + esc(l.name || "路人") + ' 进入直播间</div>';
    }
    if (type === "lottery") return '<div class="jlv-line event">🎁 主播发起了天选时刻：' + esc(l.prize) + '（发送「' + esc(l.keyword || String(l.prize || "").slice(0, 6)) + '」参与）</div>';
    if (type === "redpacket") return '<div class="jlv-line packet">🧧 ' + esc(l.name) + ' 发了一个 ' + fmtN(l.total || 0) + ' 叽币的红包，快抢！</div>';
    if (type === "vote") return '<div class="jlv-line event">🗳️ 主播发起投票：' + esc(l.q) + '</div>';
    if (type === "pk") return l.oppName ? '<div class="jlv-line event">⚔️ 开始和 ' + esc(l.oppName) + ' 连线 PK！</div>' : "";
    if (type === "pkanchor") return '<div class="jlv-line pkanchor"><b>' + esc(l.name || "") + '：</b>' + esc(l.text || "") + '</div>';
    if (type === "follow") return '<div class="jlv-line sys">' + esc(l.name) + ' 关注了主播</div>';
    if (type === "like") return '<div class="jlv-line like' + (l.me ? " me" : "") + '">❤ ' + esc(l.name) + ' 点了 ' + (l.count || 1) + ' 个赞</div>';
    if (type === "gift") {
      var g = giftOf(l.gift);
      return '<div class="jlv-line gift"><b>' + esc(l.name) + '</b> 投喂 ' + g.emoji + ' ' + esc(g.name) + ' ×' + (l.count || 1) + '</div>';
    }
    if (type === "sc") {
      return '<div class="jlv-sc tier' + (l.price || 30) + '"><div class="h">' + esc(l.name) + ' · ¥' + (l.price || 30) + ' 醒目留言</div><div class="b">' + esc(l.text || "") + '</div></div>';
    }
    if (type === "guard") {
      return '<div class="jlv-line guard"><b>' + esc(l.name) + '</b> 开通了' + GUARD_NAME[guardDef(l.level).id] + '，欢迎上舰！</div>';
    }
    var me = !!l.me;
    var gd = me ? guardActive(liveP.room.creatorId) : null;
    var lv = l.level != null ? l.level : medalLvOf(l.name || liveMyName(), me);
    return '<div class="jlv-line' + (me ? " me" : "") + (gd ? " gd-" + gd.guard : "") + '">' +
      (me ? '<span class="jlv-guest">我的角色</span>' : "") +
      (gd ? '<span class="jlv-gdtag ' + gd.guard + '">⚓ ' + GUARD_NAME[gd.guard] + '</span>' : "") +
      (lv > 0 ? '<span class="jlv-medal ' + medalCls(lv) + (gd ? " guard" : "") + '"><span class="nm">' + esc(fanMedalName(liveP.cr)) + '</span><b>' + lv + '</b></span>' : "") +
      '<span class="jlv-name">' + esc(l.name || liveMyName()) + '：</span>' + esc(l.text || "") +
    '</div>';
  }

  function applyRound(lines) {
    if (!liveP || !lines || !lines.length) return;
    var st = S.state;
    var cid = liveP.room.creatorId;
    var newFans = 0;
    lines.forEach(function (raw) {
      if (!raw || typeof raw === "string") raw = { type: "dm", text: String(raw || "") };
      var l = raw;
      var name = l.me ? liveMyName() : (l.name || "路人");
      var me = !!l.me;
      var lv = l.level || medalLvOf(name, me);
      var sx = scoreOf(l);
      if (sx) {
        boardAdd(cid, name, sx, lv);
        var re = liveP.rank[name] = liveP.rank[name] || { name: name, p: 0 };
        re.p += sx;
        updateTop3();
        pkScore(l);
      }
      if (l.type === "dm") {
        boardAdd(cid, name, 1, lv);
        pushName(name);
        chatLine(l);
        var lot = liveP.lottery;
        if (lot && !lot.result && l.text && lot.keyword && l.text.indexOf(lot.keyword) >= 0) {
          if (me) { if (!lot.joined) { lot.joined = true; lot.people.push(liveMyName()); } }
          else if (lot.people.indexOf(name) < 0) lot.people.push(name);
        }
        var vote = liveP.vote;
        if (vote && !vote.result && l.text) {
          var oi = voteOptionIdx(vote, l.text);
          if (oi >= 0) {
            if (me) { if (vote.myPick == null) { vote.myPick = oi; vote.counts[oi]++; } }
            else vote.counts[oi]++;
          }
        }
      } else if (l.type === "gift") {
        pushName(name); fxPush(l); chatLine(l);
        if (me) fanAddIntimacy(cid, sx);
      } else if (l.type === "sc") {
        fxScPin(l); chatLine(l);
        if (me) fanAddIntimacy(cid, sx);
      } else if (l.type === "guard") {
        fxPush(l); chatLine(l);
        npcGuardUpsert(name, l.level);
        if (me) fanshipBuy(l.level, true);
        entryPush(name, l.level, me);
      } else if (l.type === "enter") {
        if (l.guard) entryPush(name, l.guard, me);
        chatLine(l);
      } else if (l.type === "follow") { newFans++; chatLine(l); }
      else if (l.type === "order") shopNpcOrder(l);
      else if (l.type === "like") chatLine(l);
      else if (l.type === "sys") chatLine(l);
      else if (l.type === "anchor") chatLine(l);
      else if (l.type === "act") chatLine(l);
      else if (l.type === "lottery") { startLotteryEv(l); chatLine(l); }
      else if (l.type === "vote") { startVoteEv(l); chatLine(l); }
      else if (l.type === "pk") {
        if (!liveP.pk) {
          if (l.oppName) startPk({ sec: l.sec, opp: { id: l.oppId || "", name: l.oppName } });
          else startPk(l);
        }
      }
      else if (l.type === "pkanchor") { if (liveP.pk && l.text) liveP.pk.lastSay = l.text; chatLine(l); }
      else if (l.type === "pkend") { if (liveP.pk && !liveP.pk.result) resolvePk(); }
      else if (l.type === "redpacket") { pushPacket(l); chatLine(l); }
    });
    var drift = Math.round(lines.length / 3) + 2 * newFans - Math.floor(2 * Math.random());
    liveP.viewers = Math.max(5, liveP.viewers + drift);
    var on = $("#jili-online", ovEl("live"));
    if (on) on.textContent = fmtN(liveP.viewers);
    save();
  }

  function voteOptionIdx(vote, text) {
    var t = String(text).trim();
    for (var i = 0; i < vote.options.length; i++) {
      if (t === vote.options[i] || t === String(i + 1)) return i;
    }
    return -1;
  }
  function vmFill(counts, scale, sec) {
    var avg = scale / Math.max(10, sec || 60);
    return counts.map(function (n) { return Math.random() < 0.7 ? n + Math.round(Math.random() * avg) : n; });
  }

  function startLotteryEv(l) {
    if (liveP.lottery && !liveP.lottery.result) return;
    var kw = String(l.keyword || "").trim() || String(l.prize || "天选时刻").slice(0, 6);
    var sec = clampN(l.sec, 30, 180, 60);
    liveP.lottery = {
      prize: l.prize || "神秘奖励", keyword: kw, jibi: clampN(l.jibi, 0, 5000, 0),
      endsAt: Date.now() + sec * 1000, people: [], joined: false, result: null,
      host: !!l.host || liveP.isMe
    };
  }
  function resolveLottery() {
    var lot = liveP.lottery;
    var winner = null, isMe = false;
    if (lot.joined && Math.random() < 0.6) { isMe = true; winner = liveMyName(); }
    else {
      var pool = lot.people.filter(function (n) { return n !== liveMyName(); });
      if (!pool.length) pool = recentNames();
      if (pool.length) winner = pool[Math.floor(Math.random() * pool.length)];
    }
    lot.result = { winner: winner, isMe: isMe, clearAt: Date.now() + 6000 };
    if (winner) {
      liveSys("天选时刻开奖：「" + lot.prize + "」的幸运观众是 " + (isMe ? "我" : winner) + "！");
      if (isMe && lot.jibi > 0) { S.state.jibi = (S.state.jibi || 0) + lot.jibi; save(); toast("天选中奖，+" + lot.jibi + " 叽币！"); }
    } else {
      liveSys("天选时刻开奖：这次没有人中奖，奖品顺延到下一轮");
    }
  }

  function startVoteEv(l) {
    if (liveP.vote && !liveP.vote.result) return;
    var opts = (l.options || []).filter(function (x) { return String(x || "").trim(); }).slice(0, 4).map(function (x) { return String(x).trim(); });
    if (opts.length < 2) opts = ["是", "否"];
    var sec = clampN(l.sec, 20, 120, 45);
    liveP.vote = { q: l.q || "来投个票吧", options: opts, sec: sec, endsAt: Date.now() + sec * 1000, counts: opts.map(function () { return 0; }), myPick: null, result: null, host: !!l.host || liveP.isMe };
  }
  function resolveVote() {
    var vote = liveP.vote;
    var counts = vote.counts.slice();
    if (!counts.reduce(function (a, b) { return a + b; }, 0)) counts = vmFill(counts, 6, 1);
    var winner = 0;
    for (var i = 1; i < counts.length; i++) if (counts[i] > counts[winner]) winner = i;
    var my = vote.myPick;
    if (my != null && my >= 0 && Math.random() < 0.75) {
      winner = my;
      var second = -1;
      counts.forEach(function (c, i) { if (i !== my && c > second) second = c; });
      if (counts[my] <= second) counts[my] = second + 1 + Math.round(Math.random() * Math.max(2, 0.3 * second));
    }
    vote.result = { winner: winner, counts: counts, clearAt: Date.now() + 6000 };
    liveSys("投票结果：「" + vote.q + "」→ " + vote.options[winner] + " 胜出");
  }

  function pushPacket(l) {
    if (liveP.packets.length >= 3) liveP.packets.shift();
    liveP.packets.push({ id: ++liveP.packetSeq, name: l.name || liveP.cr.name, total: clampN(l.total, 100, 20000, 500), count: Math.round(clampN(l.count, 5, 100, 20)), endsAt: Date.now() + 20000, got: null, clearAt: 0 });
  }
  function grabPacket(id) {
    var st = S.state;
    var p = liveP && liveP.packets.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p || p.got != null) return;
    var amt = Math.max(1, Math.min(p.total, Math.round(p.total / Math.max(1, p.count) * (0.8 + 1.7 * Math.random()))));
    p.got = amt;
    p.clearAt = Date.now() + 3000;
    st.jibi = (st.jibi || 0) + amt;
    save();
    liveSys("我抢到了 " + p.name + " 的红包，+" + amt + " 叽币");
    toast("+" + amt + " 叽币");
    renderEv();
  }

  function startPk(l) {
    var opp = (l && l.opp) || null;
    if (!opp) {
      var pool = (S.state.creators || []).filter(function (c) { return String(c.id) !== String(liveP.room.creatorId); });
      if (!pool.length) { toast("找不到可以连线的对手"); return; }
      var c = pool[Math.floor(Math.random() * pool.length)];
      opp = { id: c.id, name: c.name };
    }
    var sec = clampN(l && l.sec, 120, 600, 300);
    liveP.pk = { opp: opp, host: 0, oppScore: 0, userGave: 0, lastSay: "", assist: {}, endsAt: Date.now() + sec * 1000, nextSay: Date.now() + 8000, visited: false, result: null };
    liveP.pkIntroUntil = Date.now() + 2600;
    liveSys("开始和 " + opp.name + " 连线 PK，为大家的主播助力吧！");
  }
  function pkScore(l) {
    var pk = liveP.pk;
    if (!pk || pk.result) return;
    var sx = scoreOf(l);
    if (!sx) return;
    pk.host += sx;
    if (l.me) pk.userGave += sx;
    var nm = l.me ? liveMyName() : (l.name || "路人");
    pk.assist[nm] = (pk.assist[nm] || 0) + sx;
  }
  function resolvePk() {
    var pk = liveP.pk;
    if (!pk || pk.result) return;
    pk.result = { win: pk.host > pk.oppScore, clearAt: Date.now() + 6000 };
    if (pk.result.win) liveSys("PK 结束：" + pk.host + " : " + pk.oppScore + "，赢了 " + pk.opp.name + "！");
    else liveSys("PK 结束：" + pk.host + " : " + pk.oppScore + "，惜败给 " + pk.opp.name + "，进入惩罚时间");
  }
  function renderPk() {
    var w = $("#jili-pkwrap", ovEl("live"));
    if (!w || !liveP) return;
    var pk = liveP.pk;
    if (!pk) { if (w.innerHTML) w.innerHTML = ""; return; }
    var now = Date.now();
    var html = "";
    if (now < liveP.pkIntroUntil) {
      html += '<div class="jlv-pkintro"><div class="half l"></div><div class="half r"></div><i class="bolt">⚡</i><div class="vs"><b>VS</b><span>连线 PK 开始</span></div></div>';
    }
    if (pk.result) {
      var conf = "";
      for (var ci = 0; ci < (pk.result.win ? 18 : 0); ci++) conf += '<i class="jlg-confetti" style="--x:' + (Math.random() * 100).toFixed(0) + '%;--c:' + ["#ffd166", "#ef476f", "#06d6a0", "#8fd3ff", "#ff9f43"][ci % 5] + ';--d:' + (Math.random()).toFixed(2) + ';--t:' + (1.2 + Math.random()).toFixed(2) + 's"></i>';
      html += '<div class="jlv-pkresult ' + (pk.result.win ? "win" : "lose") + '">' +
        (pk.result.win ? '<span class="crown">👑</span><b class="stamp">胜利！</b>' + conf : '<b class="stamp">惜败</b><span class="punish">惩罚时间</span>') +
      '</div>';
    }
    var a = pk.host, b = pk.oppScore;
    var pct = Math.round(a / Math.max(1, a + b) * 100);
    var left = pk.endsAt - now;
    var timer = pk.result ? "已结束" : Math.floor(left / 60000) + "分" + String(Math.floor(left / 1000) % 60).padStart(2, "0") + "秒";
    var assistKeys = Object.keys(pk.assist).sort(function (x, y) { return pk.assist[y] - pk.assist[x]; }).slice(0, 3);
    html +=
      '<div class="jlv-pkside pk">' +
        '<span class="ph">' + pk.opp.name.slice(0, 1) + '</span>' +
        '<span class="nm jl-one">' + esc(pk.opp.name) + '</span>' +
        (pk.lastSay ? '<span class="say jl-one">' + esc(pk.lastSay) + '</span>' : "") +
        (!liveP.isMe && !pk.result && !pk.visited ? '<button class="visit" data-jili-action="pkVisit">去TA直播间</button>' : "") +
      '</div>' +
      '<div class="jlv-pkbar' + (pk.result ? (pk.result.win ? " won" : " lost") : "") + '">' +
        '<div class="row"><span class="a">' + fmtN(a) + '</span><div class="bar"><i class="fa" style="width:' + pct + '%"></i><em class="edge" style="left:' + pct + '%"></em></div><span class="b">' + fmtN(b) + '</span></div>' +
        '<div class="mid"><span class="badge">PK</span><span class="timer">' + timer + '</span></div>' +
        (!pk.result && left <= 60000 ? '<span class="finaltag">⚡ 绝杀时刻</span>' : "") +
        (assistKeys.length ? '<div class="assist"><b>助力</b>' + assistKeys.map(function (k, i) { return '<span class="r' + (i + 1) + '">' + esc(k === liveMyName() ? "我" : k.slice(0, 1)) + '</span>'; }).join("") + '</div>' : "") +
      '</div>';
    w.innerHTML = html;
  }

  function fxMode() {
    var v = S.state.settings.giftFx || "all";
    return v === "none" ? "off" : v;
  }
  function fxPush(l) {
    if (!liveP) return;
    var mode = fxMode();
    if (mode === "off") return;
    if (l.type === "gift") {
      if (mode === "mine" && !l.me) return;
      var g = giftOf(l.gift);
      var key = (l.name || "") + "|" + l.gift;
      var now = Date.now();
      var found = null;
      liveP.banners.forEach(function (b) { if (b.key === key && now - b.at < 5000) found = b; });
      if (found) { found.combo += (l.count || 1); found.bump = (found.bump || 0) + 1; found.at = now; }
      else {
        liveP.banners.push({ key: key, name: l.name, me: !!l.me, tier: g.tier, emoji: g.emoji, gift: g.name, combo: l.count || 1, at: now, bump: 0 });
        if (liveP.banners.length > 3) liveP.banners.shift();
      }
      fxRenderBanners();
      if (g.tier !== "small") {
        var n = (g.tier === "big" || g.tier === "legend") ? 12 : Math.min(10, 4 + Math.round(2 * Math.log2((l.count || 1) + 1)));
        fxBurst(g.emoji, n);
      }
      if (g.tier === "big" || g.tier === "legend") {
        if (liveP.stageQ.length >= 6) {
          var idx = -1, minv = Infinity;
          liveP.stageQ.forEach(function (q, qi) { if (!q.me && q.value < minv) { minv = q.value; idx = qi; } });
          if (idx >= 0) liveP.stageQ.splice(idx, 1); else liveP.stageQ.shift();
        }
        liveP.stageQ.push({ kind: "gift", tier: g.tier, fx: g.fx, emoji: g.emoji, name: l.name, count: l.count || 1, value: g.price * (l.count || 1), me: !!l.me });
        fxStageNext();
      }
    } else if (l.type === "guard") {
      liveP.stageQ.push({ kind: "guard", level: l.level, name: l.name, value: guardDef(l.level).price, me: !!l.me });
      fxStageNext();
    }
  }
  function fxRenderBanners() {
    var box = $("#jili-banners", ovEl("live"));
    if (!box || !liveP) return;
    var n = liveP.banners.length;
    box.innerHTML = liveP.banners.map(function (b, i) {
      return '<div class="jlg-banner slot' + (n - 1 - i) + (b.me ? " me" : "") + ' tier-' + b.tier + '">' +
        '<span class="av">' + b.emoji + '</span><span class="tx">' + esc(b.name) + ' 送出了</span>' +
        '<em class="em">' + b.emoji + ' ' + esc(b.gift) + '</em>' +
        (b.combo > 1 ? '<span class="combo ' + (b.combo >= 66 ? "c3" : b.combo >= 10 ? "c2" : "") + '" data-cbump="' + b.bump + '">×' + b.combo + '</span>' : "") +
      '</div>';
    }).join("");
  }
  function fxBurst(emoji, n) {
    var box = $("#jili-burst", ovEl("live"));
    if (!box) return;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.textContent = emoji;
      s.style.setProperty("--sx", (Math.random() * 100).toFixed(0) + "%");
      s.style.setProperty("--dx", (Math.random() * 160 - 80).toFixed(0) + "px");
      s.style.setProperty("--dy", (-80 - Math.random() * 160).toFixed(0) + "px");
      s.style.setProperty("--r", (Math.random() * 360 - 180).toFixed(0) + "deg");
      s.style.setProperty("--fs", (16 + Math.random() * 18).toFixed(0) + "px");
      box.appendChild(s);
      (function (el) { setTimeout(function () { if (el.parentElement) el.remove(); }, 2600); })(s);
    }
  }
  function fxStageNext() {
    if (!liveP || liveP.stageBusy || !liveP.stageQ.length) return;
    var box = $("#jili-stage", ovEl("live"));
    if (!box) { liveP.stageQ = []; return; }
    var q = liveP.stageQ.shift();
    liveP.stageBusy = true;
    if (q.kind === "guard") {
      box.className = "jlg-stage guard lv-" + q.level;
      box.innerHTML = '<div class="jlg-guardring"></div><div class="jlg-sea"><i class="jlg-wave"></i></div><div class="jlg-ship">⛵</div>' +
        '<div class="jlg-plate"><b>' + esc(q.name) + '</b><span>开通了' + GUARD_NAME[q.level] + '</span><span class="wl">欢迎上舰！</span><span class="worth">价值 ' + fmtN(q.value) + ' 叽币</span></div>';
    } else {
      var legend = q.tier === "legend";
      box.className = "jlg-stage " + q.tier + (q.fx && q.fx !== "rain" ? " fx-" + q.fx : "");
      var conf = "";
      if (legend) {
        for (var ci = 0; ci < 22; ci++) conf += '<i class="jlg-confetti" style="--x:' + (Math.random() * 100).toFixed(0) + '%;--c:' + ["#ffd166", "#ef476f", "#06d6a0", "#8fd3ff", "#ff9f43"][ci % 5] + ';--d:' + (Math.random()).toFixed(2) + ';--t:' + (1.2 + Math.random()).toFixed(2) + 's"></i>';
      }
      box.innerHTML = '<span class="bigem">' + q.emoji + '</span>' +
        (legend ? '<div class="jlg-rays"></div><div class="jlg-title">' + esc(q.name) + ' 送出了传说礼物！</div><div class="jlg-broadcast">全区广播</div>' + conf : "") +
        '<div class="jlg-plate"><b>' + esc(q.name) + '</b><span>送出了 ' + q.emoji + ' ×' + q.count + '</span><span class="worth">价值 ' + fmtN(q.value) + ' 叽币</span></div>';
    }
    box.hidden = false;
    var dur = q.kind === "guard" ? FX_DUR.guard : (FX_DUR[q.tier] || 3400);
    setTimeout(function () {
      if (!liveP) return;
      box.hidden = true;
      box.innerHTML = "";
      liveP.stageBusy = false;
      fxStageNext();
    }, dur);
  }
  function fxScPin(l) {
    if (!liveP) return;
    var mode = fxMode();
    if (mode === "off") return;
    if (mode === "mine" && !l.me) return;
    var tier = SC_TIERS.filter(function (t) { return t.price === (l.price || 30); })[0] || SC_TIERS[0];
    liveP.scPins.push({ name: l.name, me: !!l.me, price: l.price || 30, text: l.text || "", at: Date.now(), until: Date.now() + tier.until, total: tier.until });
    if (liveP.scPins.length > 8) liveP.scPins.shift();
    fxRenderSc();
  }
  function fxRenderSc() {
    var bar = $("#jili-scbar", ovEl("live"));
    if (!bar || !liveP) return;
    var pins = liveP.scPins;
    bar.hidden = !pins.length;
    bar.innerHTML = pins.length
      ? '<div class="jlg-scchips">' + pins.map(function (p, i) {
          var pct = Math.max(4, Math.round((p.until - Date.now()) / p.total * 100));
          return '<button class="jlg-scchip tier' + p.price + (i === pins.length - 1 ? " on" : "") + '" data-jili-action="scPeek" data-id="' + i + '"><span class="av">💬</span>¥' + p.price + '<i style="width:' + pct + '%"></i></button>';
        }).join("") + '</div><button class="jlg-scopen" data-jili-action="scOpen">醒目留言</button>'
      : "";
  }
  function fxTick() {
    if (!liveP || liveP.ended) return;
    var now = Date.now();
    var dirty = false;
    for (var i = liveP.banners.length - 1; i >= 0; i--) {
      if (now - liveP.banners[i].at > 4200) { liveP.banners.splice(i, 1); dirty = true; }
    }
    if (dirty) fxRenderBanners();
    var sd = false;
    for (var j = liveP.scPins.length - 1; j >= 0; j--) {
      if (now >= liveP.scPins[j].until) { liveP.scPins.splice(j, 1); sd = true; }
    }
    if (sd || liveP.scPins.length) fxRenderSc();
  }

  function entryPush(name, level, me) {
    liveP.entries.push({ name: name, level: level, me: !!me });
    if (liveP.entries.length > 4) liveP.entries.shift();
    entryNext();
  }
  function entryNext() {
    if (!liveP || liveP.entryBusy) return;
    var e = liveP.entries.shift();
    var box = $("#jili-entry", ovEl("live"));
    if (!e || !box) return;
    liveP.entryBusy = true;
    box.className = "jlv-entry " + e.level + (e.me ? " me" : "");
    box.hidden = false;
    box.innerHTML = '<span class="ship">⛵</span><b>' + GUARD_NAME[e.level] + '</b><span class="jl-one">欢迎 ' + esc(e.me ? "我" : e.name) + ' 登舰</span>';
    setTimeout(function () {
      if (box) { box.hidden = true; box.innerHTML = ""; }
      if (liveP) { liveP.entryBusy = false; entryNext(); }
    }, 3000);
  }

  function liveTick() {
    if (!liveP || liveP.ended) return;
    var now = Date.now();
    var pk = liveP.pk;
    if (pk && !pk.result) {
      if (now >= pk.endsAt) resolvePk();
      else {
        pk.oppScore += Math.random() < 0.55 ? Math.max(1, Math.round(Math.random() * (liveP.base / 9))) : 0;
        if (now >= (pk.nextSay || 0)) {
          pk.nextSay = now + 16000 + Math.random() * 14000;
          pk.lastSay = PK_TAUNTS[Math.floor(Math.random() * PK_TAUNTS.length)];
          chatLine({ type: "pkanchor", name: pk.opp.name, text: pk.lastSay });
        }
      }
    }
    var lot = liveP.lottery;
    if (lot) {
      if (lot.result && now >= lot.clearAt) liveP.lottery = null;
      else if (!lot.result && now >= lot.endsAt) resolveLottery();
    }
    var vote = liveP.vote;
    if (vote) {
      if (vote.result && now >= vote.clearAt) liveP.vote = null;
      else if (!vote.result) {
        if (now >= vote.endsAt) resolveVote();
        else vote.counts = vmFill(vote.counts, Math.max(4, Math.round(0.4 * liveP.viewers)), vote.sec);
      }
    }
    for (var i = liveP.packets.length - 1; i >= 0; i--) {
      var p = liveP.packets[i];
      if ((p.got != null && now >= p.clearAt) || (p.got == null && now >= p.endsAt)) liveP.packets.splice(i, 1);
    }
    /* 人数实时波动：随机漂移 + 偶尔小幅涌入，围绕初始人数上下起伏 */
    if (liveP.viewers0 == null) liveP.viewers0 = liveP.viewers;
    if (Math.random() < 0.72) {
      var amp = Math.max(2, Math.round(liveP.viewers0 * 0.05));
      var drift = Math.round((Math.random() - 0.46) * amp * 2);
      if (Math.random() < 0.06) drift += Math.max(1, Math.round(amp * 0.8)); // 偶尔来一小波人
      liveP.viewers = Math.max(8, Math.min(Math.round(liveP.viewers0 * 2.4), liveP.viewers + drift));
    }
    renderEv();
    renderPk();
    var on = $("#jili-online", ovEl("live"));
    if (on) on.textContent = fmtN(liveP.viewers);
  }

  function npcPulse() {
    if (!liveP || liveP.ended) return;
    var lot = liveP.lottery, vote = liveP.vote;
    var r = Math.random();
    var name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
    if (liveP.shop && liveP.shop.presenting) {
      var it = shopFeaturedOf(liveP.shop);
      if (it && it.stock > 0 && r < 0.45) {
        liveP.queue.push({ type: "order", name: name, item: liveP.shop.featured, qty: 1 + Math.floor(Math.random() * 3) });
        if (!liveP.pumpT) pumpQueue();
        return;
      }
      if (it && it.stock <= 0) shopSoldOut(it);
    }
    if (r < 0.30) {
      var txt = lot && !lot.result ? lot.keyword : (vote && !vote.result ? vote.options[Math.floor(Math.random() * vote.options.length)] : NPC_DMS[Math.floor(Math.random() * NPC_DMS.length)]);
      liveP.queue.push({ type: "dm", name: name, text: txt, level: 1 + Math.floor(Math.random() * 40) });
    } else if (r < 0.42) {
      liveP.queue.push({ type: "like", name: name, count: 1 + Math.floor(Math.random() * 5) });
    } else if (r < 0.52) {
      var smalls = ["spicy", "heart", "clap", "drink", "rose", "icecream", "milktea", "cake"];
      var g = giftOf(smalls[Math.floor(Math.random() * smalls.length)]);
      liveP.queue.push({ type: "gift", name: name, gift: g.id, count: 1 + Math.floor(Math.random() * 3) });
    } else if (r < 0.58) {
      liveP.queue.push({ type: "enter", name: name });
    } else if (r < 0.62) {
      liveP.queue.push({ type: "follow", name: name });
    } else if (r < 0.64 && liveP.packets.length < 3) {
      liveP.queue.push({ type: "redpacket", name: liveP.cr.name, total: 100 * (2 + Math.floor(Math.random() * 30)), count: 10 + Math.floor(Math.random() * 20) });
    } else if (!liveP.pk && r > 0.985) {
      liveP.queue.push({ type: "pk", sec: 300 });
    } else if (!lot && !vote && r > 0.975) {
      if (Math.random() < 0.5) liveP.queue.push({ type: "lottery", prize: "签名照一张", keyword: "", sec: 60, jibi: 100 });
      else liveP.queue.push({ type: "vote", q: "下一首想听什么？", options: ["抒情慢歌", "摇滚热单"], sec: 45 });
    }
    if (!liveP.pumpT && liveP.queue.length) pumpQueue();
  }

  function pumpQueue() {
    if (!liveP || liveP.ended) { if (liveP) liveP.pumpT = null; return; }
    var l = liveP.queue.shift();
    if (l) applyRound([l]);
    if (liveP.queue.length) {
      liveP.pumpT = setTimeout(pumpQueue, 900);
    } else {
      liveP.pumpT = null;
    }
  }

  function renderEv() {
    var box = $("#jili-evstack", ovEl("live"));
    if (!box || !liveP) return;
    var now = Date.now();
    var html = "";
    var lot = liveP.lottery;
    if (lot) {
      var r;
      if (lot.result) {
        r = '<div class="r' + (lot.result.isMe ? " win" : "") + '">' + (lot.result.isMe ? "🎉 我中奖了！" : lot.result.winner ? esc(lot.result.winner) + ' 中奖' : "这次没有人中奖") + '</div>';
      } else if (lot.host) {
        r = '<div class="r">' + lot.people.length + ' 人参与 · 口令「' + esc(lot.keyword) + '」</div>';
      } else {
        r = '<button data-jili-action="lotJoin"' + (lot.joined ? " disabled" : "") + '>' + (lot.joined ? "已参与，等开奖" : '发送「' + esc(lot.keyword) + '」参与') + '</button>';
      }
      html += '<div class="jlv-ev lottery"><div class="h">🎁 天选时刻' + (lot.result ? "" : '<span>' + countTxt(lot.endsAt - now) + '</span>') + '</div><div class="b jl-two">' + esc(lot.prize) + '</div>' + r + '</div>';
    }
    liveP.packets.forEach(function (p) {
      html += '<div class="jlv-ev packet"><div class="h"><span class="jl-one">' + esc(p.name) + ' 的红包</span>' + (p.got == null ? '<span>' + countTxt(p.endsAt - now) + '</span>' : "") + '</div>' +
        (p.got != null ? '<div class="r win">+' + p.got + ' 叽币</div>' : '<button data-jili-action="rpGrab" data-id="' + p.id + '">抢</button>') + '</div>';
    });
    var vote = liveP.vote;
    if (vote) {
      var sum = vote.counts.reduce(function (a, b) { return a + b; }, 0);
      var showPct = vote.host || vote.myPick != null || !!vote.result;
      html += '<div class="jlv-ev vote"><div class="h">🗳️ 弹幕投票' + (vote.result ? "" : '<span>' + countTxt(vote.endsAt - now) + '</span>') + '</div><div class="b jl-two">' + esc(vote.q) + '</div>' +
        vote.options.map(function (opt, i) {
          var pctv = sum ? Math.round(vote.counts[i] / sum * 100) : 0;
          var win = vote.result && vote.result.winner === i;
          return '<button class="opt' + (vote.myPick === i ? " mine" : "") + (win ? " win" : "") + '" data-jili-action="votePick" data-id="' + i + '"' + (showPct || vote.result ? " disabled" : "") + '><i style="width:' + pctv + '%"></i><span class="jl-one">' + esc(opt) + '</span>' + (showPct ? '<b>' + pctv + '%</b>' : "") + '</button>';
        }).join("") + '</div>';
    }
    box.innerHTML = html;
  }

  /* ---------- 直播间内浮层（礼物 / 榜单 / 玩法） ---------- */

  function openLiveSheet(html, cls, side) {
    var ov = ovEl("live");
    if (!ov) return;
    closeLiveSheet();
    var d = document.createElement("div");
    d.className = "jl-scrim" + (side ? " side" : "");
    d.setAttribute("data-livesheet", "1");
    d.innerHTML = '<div class="jl-sheet' + (cls ? " " + cls : "") + '">' + html + '</div>';
    ov.appendChild(d);
  }
  function closeLiveSheet() {
    var ov = ovEl("live");
    if (!ov) return;
    var d = ov.querySelector('[data-livesheet]');
    if (d) d.remove();
  }
  function liveSheetEl() {
    var ov = ovEl("live");
    return ov ? ov.querySelector('[data-livesheet] .jl-sheet') : null;
  }

  function renderGiftSheet() {
    var st = S.state;
    var sheet = liveSheetEl();
    if (!sheet || !liveP) return;
    var sel = liveP.giftSel;
    var cid = liveP.room.creatorId;
    var tabs = '<div class="jlv-gtabs">' +
      '<button class="' + (sel.tab === "gift" ? "on" : "") + '" data-jili-action="giftTab" data-id="gift">礼物</button>' +
      '<button class="' + (sel.tab === "guard" ? "on" : "") + '" data-jili-action="giftTab" data-id="guard">大航海</button>' +
      '<button class="' + (sel.tab === "sc" ? "on" : "") + '" data-jili-action="giftTab" data-id="sc">醒目留言</button></div>';
    var body = "";
    if (sel.tab === "gift") {
      var groups = [
        { cls: "normal", label: "普通礼物", ids: ["spicy", "heart", "clap", "drink", "rose", "icecream", "milktea", "cake", "bow", "bear", "lightstick", "kiss", "moon"] },
        { cls: "luxury", label: "豪华礼物 · 全屏特效", ids: ["ring", "fireworks", "sportscar", "rocket", "yacht", "crown", "plane"] },
        { cls: "legend", label: "传说礼物 · 全区广播", ids: ["castle", "whale", "galaxy", "unicorn", "dragon", "planet"] }
      ];
      body = groups.map(function (sec) {
        return '<div class="jlv-gsec"><div class="t">' + sec.label + '</div><div class="jlv-gifts">' + sec.ids.map(function (gid) {
          var g = giftOf(gid);
          return '<button class="' + (g.tier === "big" ? "tier-big " : g.tier === "legend" ? "tier-legend " : "") + (sel.id === g.id ? "on" : "") + '" data-jili-action="giftSel" data-id="' + g.id + '">' +
            '<span class="e">' + g.emoji + '</span><b>' + esc(g.name) + '</b><span class="p">' + g.price + '</span>' +
            (g.tier === "legend" ? '<span class="fxtag">广播</span>' : g.tier === "big" ? '<span class="fxtag">特效</span>' : "") +
          '</button>';
        }).join("") + '</div></div>';
      }).join("");
      var gsel = sel.id ? giftOf(sel.id) : null;
      var total = gsel ? gsel.price * sel.count : 0;
      body += '<div class="jlv-gfoot"><button class="rc" data-jili-action="rechargeOpen">充值</button>' +
        '<span class="bal">叽币 ' + fmtN(st.jibi || 0) + '</span>' +
        '<span class="jl-chips">' + GIFT_COUNTS.map(function (n) {
          return '<button class="' + (sel.count === n ? "on" : "") + '" data-jili-action="giftCount" data-id="' + n + '">×' + n + '</button>';
        }).join("") + '</span>' +
        '<button class="jl-btn sm" data-jili-action="giftSend"' + (gsel ? "" : " disabled") + '>送出 · ' + fmtN(total) + '</button></div>';
    } else if (sel.tab === "guard") {
      var f = st.fanships[cid];
      var myActive = guardActive(cid);
      body = '<div class="jlv-ghint">开通大航海后，弹幕自带专属灯牌，主播更容易看到你，私信时 TA 也知道你是舰上的人。</div>' +
        (myActive ? '<div class="jlv-ghint">当前：「' + GUARD_NAME[myActive.guard] + '」· 剩余 ' + Math.max(1, Math.ceil(((myActive.guardUntil || Date.now()) - Date.now()) / 86400000)) + ' 天</div>' : "") +
        '<div class="jlv-gifts">' + LIVE_GUARDS.map(function (gd) {
          return '<button class="tier-big" data-jili-action="guardBuy" data-id="' + gd.id + '">' +
            '<span class="e">⚓</span><b>' + GUARD_NAME[gd.id] + '</b><span class="p">' + fmtN(gd.price) + '</span>' +
            '<span class="fxtag">/ 月</span></button>';
        }).join("") + '</div>' +
        '<div class="jlv-gfoot"><button class="rc" data-jili-action="rechargeOpen">充值</button><span class="bal">叽币 ' + fmtN(st.jibi || 0) + '</span><span class="jl-one" style="opacity:.7;font-size:12px">上舰有效期 30 天</span></div>';
    } else {
      body = '<div class="jlv-ghint">醒目留言会置顶在弹幕最上方，主播一定会看到。</div>' +
        '<div class="jl-chips">' + SC_TIERS.map(function (t) {
          return '<button class="' + (sel.scPrice === t.price ? "on" : "") + '" data-jili-action="scPrice" data-id="' + t.price + '">¥' + t.price + ' · ' + (t.price * 10) + ' 叽币</button>';
        }).join("") + '</div>' +
        '<textarea id="jili-sc-text" rows="3" placeholder="想说的话…" style="width:100%;margin-top:10px;background:#ffffff14;border:0;border-radius:10px;padding:10px;color:inherit;outline:0;resize:none;font:inherit"></textarea>' +
        '<div class="jlv-gfoot"><button class="rc" data-jili-action="rechargeOpen">充值</button><span class="bal">叽币 ' + fmtN(st.jibi || 0) + '</span><button class="jl-btn sm" data-jili-action="scSend">发送</button></div>';
    }
    sheet.innerHTML = tabs + body;
  }

  function scSend() {
    var st = S.state;
    var ta = $("#jili-sc-text", ovEl("live"));
    if (!ta || !ta.value.trim() || !liveP) return;
    var price = liveP.giftSel.scPrice;
    var cost = price * 10;
    var text = ta.value.trim();
    payConfirm(cost, function () {
      if (!liveP) return;
      closeLiveSheet();
      applyRound([{ type: "sc", name: liveMyName(), price: price, text: text, me: true }]);
      boardAdd(liveP.room.creatorId, liveMyName(), cost, medalLvOf(liveMyName(), true));
      toast("醒目留言已发送");
    }, { title: "醒目留言" });
  }
  function giftSend() {
    if (!liveP || !liveP.giftSel.id) return;
    var g = giftOf(liveP.giftSel.id);
    var count = liveP.giftSel.count;
    var cost = g.price * count;
    payConfirm(cost, function () {
      if (!liveP) return;
      closeLiveSheet();
      applyRound([{ type: "gift", name: liveMyName(), gift: g.id, count: count, me: true }]);
    }, { title: "礼物 " + g.name });
  }
  function guardBuy(level) {
    var gd = guardDef(level);
    payConfirm(gd.price, function () {
      if (!liveP) return;
      closeLiveSheet();
      applyRound([{ type: "guard", name: liveMyName(), level: gd.id, me: true }]);
      toast("已开通" + GUARD_NAME[gd.id]);
    }, { title: "开通" + GUARD_NAME[gd.id] });
  }
  function fanshipBuy(level, alreadyPaid) {
    if (!alreadyPaid) { guardBuy(level); return; }
    var cid = liveP.room.creatorId;
    var gd = guardDef(level);
    var now = Date.now();
    var f = fanState(cid);
    var oldRank = f.guard ? guardDef(f.guard).rank : 0;
    fanAddIntimacy(cid, gd.price);
    if (oldRank <= gd.rank) f.guard = gd.id;
    f.guardSince = f.guardSince || now;
    f.guardUntil = ((f.guardUntil && f.guardUntil > now) ? f.guardUntil : now) + 30 * 86400000;
    save();
  }

  function renderAudSheet() {
    var st = S.state;
    var sheet = liveSheetEl();
    if (!sheet || !liveP) return;
    var cid = liveP.room.creatorId;
    var bd = (st.liveBoards || {})[cid] || { days: {}, guards: {} };
    var a = liveP.aud;
    if (a.tab === "sea") sheet.className = "jl-sheet jlv-aud sea";
    else sheet.className = "jl-sheet jlv-aud";
    var tabs = '<div class="jlv-aud-tabs">' +
      '<button class="' + (a.tab === "room" ? "on" : "") + '" data-jili-action="audTab" data-id="room">房间观众</button>' +
      '<button class="' + (a.tab === "sea" ? "on" : "") + '" data-jili-action="audTab" data-id="sea">大航海 (' + Object.keys(bd.guards || {}).length + ')</button></div>';
    var body = "";
    if (a.tab === "room") {
      var ranges = [["online", "在线榜"], ["day", "日榜"], ["week", "周榜"], ["month", "月榜"]];
      var seg = '<div class="jlv-aud-seg">' + ranges.map(function (r) {
        return '<button class="' + (a.range === r[0] ? "on" : "") + '" data-jili-action="audRange" data-id="' + r[0] + '">' + r[1] + '</button>';
      }).join("") + '</div>';
      var rows = "";
      if (a.range === "online") {
        var entries = Object.keys(liveP.rank).map(function (k) { return liveP.rank[k]; });
        entries.push({ name: liveMyName(), p: 0 });
        var need = Math.max(12, Math.round(0.03 * (liveP.cr.fans || 0)));
        for (var i = 0; entries.length < need && i < NPC_NAMES.length; i++) {
          var nm2 = NPC_NAMES[(i * 5 + C.hash(cid)) % NPC_NAMES.length];
          entries.push({ name: nm2, p: Math.floor(Math.random() * 30) });
        }
        entries.sort(function (x, y) { return y.p - x.p; });
        rows = entries.slice(0, 50).map(function (e, i) {
          var meRow = e.name === liveMyName();
          var lv = medalLvOf(e.name, meRow);
          var gd = meRow ? guardActive(cid) : null;
          return audRowHTML(i, e.name, meRow, lv, gd, fmtN(e.p));
        }).join("");
      } else {
        var agg = boardAgg(bd, a.range);
        if (!agg.length) agg = [{ name: liveMyName(), p: 0, lv: medalLvOf(liveMyName(), true) }];
        rows = agg.slice(0, 50).map(function (e, i) {
          var meRow = e.name === liveMyName();
          var gd = meRow ? guardActive(cid) : null;
          return audRowHTML(i, e.name, meRow, e.lv, gd, fmtN(e.p));
        }).join("");
      }
      body = seg +
        '<div class="jlv-aud-tip">投喂礼物、发醒目留言、上舰都能获得贡献值；每发一条弹幕 +1。</div>' +
        '<div class="jlv-aud-list">' + rows + '</div>' +
        '<div class="jlv-aud-foot"><span class="fleet">在线 ' + fmtN(liveP.viewers) + ' 人</span><span class="slogan">点亮灯牌，成为 TA 的守护</span><button data-jili-action="audGuardGo">上船领回馈</button></div>';
    } else {
      var segs = [["week", "周舰榜"], ["month", "月舰榜"], ["companion", "陪伴榜"]];
      var seg2 = '<div class="jlv-sea-seg">' + segs.map(function (r) {
        return '<button class="' + (a.range === r[0] ? "on" : "") + '" data-jili-action="audRange" data-id="' + r[0] + '">' + r[1] + '</button>';
      }).join("") + '</div>';
      var gs = Object.keys(bd.guards || {}).map(function (k) { return bd.guards[k]; });
      if (a.range === "companion") gs.sort(function (x, y) { return (x.since || 0) - (y.since || 0); });
      else gs.sort(function (x, y) { return guardDef(y.level).rank - guardDef(x.level).rank || (y.p || 0) - (x.p || 0); });
      var top = gs[0];
      var rows2 = gs.slice(0, 50).map(function (g, i) {
        var meRow = g.name === liveMyName() || g.name === "me";
        var nm = meRow ? liveMyName() : g.name;
        var ringLv = guardDef(g.level).rank;
        var val = a.range === "companion" ? Math.max(1, Math.round(((Date.now()) - (g.since || Date.now())) / 86400000)) + " 天" : fmtN(g.p || 0);
        return '<div class="jlv-sea-row' + (meRow ? " me" : "") + '"><span class="rk r' + (i + 1) + '">' + (i + 1) + '</span>' +
          '<span class="jlv-sea-ring" data-lv="' + ringLv + '"><i>' + nm.slice(0, 1) + '</i><u>' + GUARD_NAME[g.level] + '</u></span>' +
          '<div class="who"><b>' + esc(nm) + '</b></div><span class="pt">' + val + '</span></div>';
      }).join("");
      if (!rows2) rows2 = '<div style="padding:20px;text-align:center;opacity:.6">还没有人上舰，做第一个吧</div>';
      var fleet = Object.keys(bd.guards || {}).length;
      var fleetTxt = fleet >= 1000 ? Math.round(fleet / 100) / 10 + " 千舰" : fleet >= 100 ? Math.round(fleet / 10) / 10 + " 百舰" : fleet >= 10 ? Math.round(fleet) + " 舰" : fleet + " 舰";
      var myG = guardActive(cid);
      var slogan = myG ? "你是" + GUARD_NAME[myG.guard] + " · 剩余 " + Math.max(1, Math.ceil(((myG.guardUntil || Date.now()) - Date.now()) / 86400000)) + " 天" : "点亮灯牌，成为 TA 的守护";
      body = seg2 +
        (top ? '<div class="jlv-sea-top"><span class="jlv-sea-ring sm" data-lv="' + guardDef(top.level).rank + '"><i>' + (top.name === "me" ? liveMyName() : top.name).slice(0, 1) + '</i><u>' + GUARD_NAME[top.level] + '</u></span><span>舰榜第一</span></div>' : "") +
        '<div class="jlv-sea-list">' + rows2 + '</div>' +
        '<div class="jlv-sea-foot"><span class="fleet">' + fleetTxt + '</span><span class="slogan jl-one">' + esc(slogan) + '</span><button data-jili-action="audGuardGo">' + (myG ? "续费" : "上船领回馈") + '</button></div>';
    }
    sheet.innerHTML = tabs + body;
  }
  function audRowHTML(i, name, meRow, lv, gd, pt) {
    return '<div class="jlv-aud-row' + (meRow ? " me" : "") + '">' +
      '<span class="rk">' + (i < 3 ? '<em>第' + (i + 1) + '</em>' : (i + 1)) + '</span>' +
      '<span class="av">' + avHTML({ name: name, seed: name }, 38) + '</span>' +
      '<div class="who"><b>' + esc(name) + '</b><div class="tags">' +
        (meRow ? '<span class="jlv-guest">我的角色</span>' : "") +
        (gd ? '<span class="jlv-gdtag ' + gd.guard + '">⚓ ' + GUARD_NAME[gd.guard] + '</span>' : "") +
        '<span class="jlv-medal ' + medalCls(lv) + '">Lv' + lv + '</span>' +
      '</div></div>' +
      '<span class="pt">' + pt + '</span></div>';
  }

  function renderHostSheet() {
    var sheet = liveSheetEl();
    if (!sheet || !liveP) return;
    var h = liveP.host;
    var tabs = '<div class="jlv-aud-tabs">' +
      '<button class="' + (h.tab === "lottery" ? "on" : "") + '" data-jili-action="hostTab" data-id="lottery">天选时刻</button>' +
      '<button class="' + (h.tab === "vote" ? "on" : "") + '" data-jili-action="hostTab" data-id="vote">弹幕投票</button>' +
      '<button class="' + (h.tab === "packet" ? "on" : "") + '" data-jili-action="hostTab" data-id="packet">红包</button>' +
      '<button class="' + (h.tab === "pk" ? "on" : "") + '" data-jili-action="hostTab" data-id="pk">连线 PK</button></div>';
    var chips = function (arr, cur, act) {
      return '<div class="jl-chips">' + arr.map(function (n) {
        return '<button class="' + (cur === n ? "on" : "") + '" data-jili-action="' + act + '" data-id="' + n + '">' + n + '</button>';
      }).join("") + '</div>';
    };
    var body = "";
    if (h.tab === "lottery") {
      body =
        '<label class="jl-field"><span>奖品</span><input id="jili-h-prize" placeholder="例如：周边礼盒" value="' + esc(h.prize) + '"></label>' +
        '<label class="jl-field"><span>口令（默认取奖品前六个字）</span><input id="jili-h-kw" placeholder="例如：想要礼盒" value="' + esc(h.kw) + '"></label>' +
        '<div class="jl-field"><span>时长（秒）</span>' + chips([30, 60, 120], h.sec, "hostSec") + '</div>' +
        '<div class="jl-field"><span>奖励叽币</span>' + chips([0, 100, 500, 1000], h.jibi, "hostJibi") + '</div>' +
        '<button class="jl-btn" data-jili-action="hostLotteryStart">开始天选</button>';
    } else if (h.tab === "vote") {
      body =
        '<label class="jl-field"><span>投票问题</span><input id="jili-h-q" placeholder="例如：今晚玩什么？" value="' + esc(h.q) + '"></label>' +
        '<div class="jl-field"><span>选项（至少填 2 个，最多 4 个）</span>' +
          h.opts.map(function (o, i) { return '<input class="jili-h-opt" data-idx="' + i + '" placeholder="选项 ' + (i + 1) + '" value="' + esc(o) + '">'; }).join("") +
        '</div>' +
        '<div class="jl-field"><span>时长（秒）</span>' + chips([20, 45, 90], h.sec, "hostSec") + '</div>' +
        '<button class="jl-btn" data-jili-action="hostVoteStart">发起投票</button>';
    } else if (h.tab === "packet") {
      body =
        '<label class="jl-field"><span>总额（叽币，100-20000）</span><input id="jili-h-total" type="number" min="100" max="20000" value="' + h.total + '"></label>' +
        '<label class="jl-field"><span>份数（5-100）</span><input id="jili-h-count" type="number" min="5" max="100" value="' + h.count + '"></label>' +
        '<button class="jl-btn" data-jili-action="hostPacketSend">发红包</button>';
    } else {
      var pool = (S.state.creators || []).filter(function (c) { return String(c.id) !== String(liveP.room.creatorId); });
      var oppName = h.opp ? h.opp.name : (pool.length ? "随机对手" : "暂无可连线对象");
      body =
        '<div class="jl-field"><span>对手</span><div class="jl-chips">' +
          (pool.length ? pool.slice(0, 6).map(function (c) {
            return '<button class="' + (h.opp && h.opp.id === c.id ? "on" : "") + '" data-jili-action="hostPkOpp" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
          }).join("") : '<span style="opacity:.6">没有其他主播</span>') +
        '</div><div style="margin-top:6px;opacity:.7;font-size:12px">当前：' + esc(oppName) + '</div></div>' +
        '<div class="jl-field"><span>时长（秒）</span>' + chips([120, 300, 600], h.pkSec, "hostPkSec") + '</div>' +
        '<button class="jl-btn" data-jili-action="hostPkStart">开始 PK</button>';
    }
    sheet.innerHTML = tabs + body;
  }

  function stopLive() {
    if (!liveP || liveP.ended) return;
    liveP.ended = true;
    if (liveP.pumpT) { clearTimeout(liveP.pumpT); liveP.pumpT = null; }
    if (liveP.evT) { clearInterval(liveP.evT); liveP.evT = null; }
    if (liveP.fxT) { clearInterval(liveP.fxT); liveP.fxT = null; }
    if (liveP.npcT) { clearInterval(liveP.npcT); liveP.npcT = null; }
    var sum = 0;
    Object.keys(liveP.rank).forEach(function (k) { sum += liveP.rank[k].p; });
    if (String(liveP.room.creatorId) === "me") {
      liveP.room.liveNow = false;
      liveP.room.endedAt = Date.now();
      liveP.room.replayChat = liveP.chatLog || [];
    }
    if (liveP.isMe && sum > 0) {
      var income = Math.round(sum * 0.5);
      S.state.jibi = (S.state.jibi || 0) + income;
      S.state.earnings = Math.round((Number(S.state.earnings) || 0) + income / 600 * 100) / 100;
      toast("本场直播收入 " + fmtN(income) + " 叽币（礼物折半，已计入创作激励）");
    }
    var shopSum = null;
    if (liveP.shop && liveP.shop.gmv > 0) {
      var sh = liveP.shop;
      var comm = Math.round(sh.gmv * (Number(sh.cfg && sh.cfg.commission) || 0)) / 100;
      var best = sh.items.slice().sort(function (a, b) { return b.sold - a.sold; })[0];
      shopSum = { gmv: sh.gmv, orders: sh.orders, units: sh.units, comm: comm, best: best && best.sold > 0 ? best : null };
      liveP.room.lastShopSum = shopSum;
      if (liveP.isMe && comm > 0) {
        S.state.earnings = Math.round((Number(S.state.earnings) || 0) + comm * 100) / 100;
      }
    }
    save();
    var wasMe = liveP.isMe;
    liveP = null;
    if (wasMe && shopSum) {
      setTimeout(function () {
        openModal("<h3>下播总结</h3>" +
          "<p class='jl-hint'>本场带货成交 <b>¥" + shopSum.gmv.toFixed(2) + "</b></p>" +
          "<p class='jl-hint'>订单 " + shopSum.orders + " 笔 · 件数 " + shopSum.units + " 件" +
          (shopSum.best ? " · 爆款「" + esc(shopSum.best.name) + "」" : "") + "</p>" +
          "<p class='jl-hint'>佣金 ¥" + shopSum.comm.toFixed(2) + (shopSum.comm > 0 ? " 已计入创作激励，可在「我的」提现" : "") + "</p>" +
          "<div class='jili-btnrow'><button class='jl-btn' data-jili-action='closeModal'>知道了</button></div>");
      }, 260);
    }
  }

  function sendLiveDm() {
    var st = S.state;
    var linp = $("#jili-live-dm", ovEl("live"));
    if (!linp || !linp.value.trim() || !liveP) return;
    var text = linp.value.trim();
    linp.value = "";
    applyRound([{ type: "dm", text: text, me: true }]);
    aiRun(null, function () { return C.ai.liveRound(st, liveP.room.id, text); }).then(function (r) {
      if (r === undefined || !liveP) return;
      liveP.queue = liveP.queue.concat((r && r.lines) || r || []);
      if (!liveP.pumpT) pumpQueue();
    });
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
        id: "p" + Date.now(), kind: "dynamic", creatorId: pubId(),
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
    if (scrim && !e.target.closest(".jl-sheet")) {
      if (scrim.getAttribute("data-livesheet")) closeLiveSheet();
      else closeModal();
      return;
    }
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
      case "liveCat": LIVE_CAT = id || "all"; LIVE_CATS_OPEN = false; renderHome(); break;
      case "liveCatsToggle": LIVE_CATS_OPEN = !LIVE_CATS_OPEN; renderHome(); break;
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
          keepCtrl();
        }
        break;
      case "ratePop": {
        var d0 = ovEl("post");
        var rp = $("#jili-ratepop", d0);
        if (rp) rp.hidden = !rp.hidden;
        var sp0 = $("#jili-setpop", d0);
        if (sp0) sp0.hidden = true;
        var mpp = $("#jili-morepop", d0);
        if (mpp) mpp.hidden = true;
        keepCtrl();
        break;
      }
      case "rateSet":
        if (player) {
          player.rate = Number(id) || 1;
          st.settings.playRate = player.rate;
          save();
          var d1 = ovEl("post");
          var rb = $("#jili-ratebtn", d1);
          if (rb) {
            rb.textContent = player.rate === 1 ? "倍速" : player.rate + "x";
            rb.classList.toggle("on", player.rate !== 1);
          }
          var rp2 = $("#jili-ratepop", d1);
          if (rp2) { rp2.hidden = true; $$("button", rp2).forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-id")) === player.rate); }); }
          var sp1 = $("#jili-setpop", d1);
          if (sp1) $$('[data-jili-action="rateSet"]', sp1).forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-id")) === player.rate); });
          keepCtrl();
        }
        break;
      case "dmToggle":
        if (player) {
          player.dmOn = !player.dmOn;
          var layer = $("#jili-dmlayer", ovEl("post"));
          if (layer) layer.style.display = player.dmOn ? "" : "none";
          var dvt = ovEl("post");
          $$('[data-jili-action="dmToggle"]', dvt).forEach(function (b) { b.classList.toggle("off", !player.dmOn); });
          keepCtrl();
        }
        break;
      case "dmSet": openDmSet(); break;
      case "dmSetClose": { var sp2 = $("#jili-setpop", ovEl("post")); if (sp2) sp2.hidden = true; keepCtrl(); break; }
      case "dmPref": {
        if (btn.tagName === "INPUT") {
          var ik = btn.getAttribute("data-k");
          if (ik) { st.settings[ik] = !!btn.checked; save(); }
          break;
        }
        var k = btn.getAttribute("data-k"), v = btn.getAttribute("data-v");
        if (k) {
          st.settings[k] = v === "true" ? true : v === "false" ? false : (isNaN(Number(v)) || v === "" ? v : Number(v));
          save();
          var sheet = $("#jili-setpop", ovEl("post"));
          if (sheet) sheet.innerHTML = dmSetHTML();
          keepCtrl();
        }
        break;
      }
      case "dmBlockAdd": {
        var inp = $("#jili-dm-block", ovEl("post"));
        if (inp && inp.value.trim()) {
          st.settings.dmBlock = String(st.settings.dmBlock || "") + (st.settings.dmBlock ? "," : "") + inp.value.trim();
          save(); inp.value = "";
          var ds3 = $("#jili-setpop", ovEl("post"));
          if (ds3) ds3.innerHTML = dmSetHTML();
          keepCtrl();
        }
        break;
      }
      case "dmBlockDel": {
        var words = String(st.settings.dmBlock || "").split(/[,，、\s]+/).filter(function (w) { return w && w !== id; });
        st.settings.dmBlock = words.join(",");
        save();
        var ds4 = $("#jili-setpop", ovEl("post"));
        if (ds4) ds4.innerHTML = dmSetHTML();
        break;
      }
      case "saveFrame": if (player) saveFramePNG(player, player.sceneIdx < 0 ? 0 : player.sceneIdx); break;
      case "morePop": {
        var dmp = ovEl("post");
        var mpop = $("#jili-morepop", dmp);
        if (mpop) mpop.hidden = !mpop.hidden;
        var rpp = $("#jili-ratepop", dmp);
        if (rpp) rpp.hidden = true;
        var spp = $("#jili-setpop", dmp);
        if (spp) spp.hidden = true;
        keepCtrl();
        break;
      }
      case "modeSet": {
        if (!player) break;
        var wantClip = id === "clip";
        if (wantClip) {
          var si = Math.max(0, player.sceneIdx);
          player.clip = { start: sceneStart(player, si), end: sceneStart(player, si) + player.scenes[si].dur, sceneIdx: si };
          player.time = player.clip.start;
          clearDm();
          player.di = dmIndexAt(player.time);
        } else {
          player.clip = null;
        }
        var dmPop = $("#jili-morepop", ovEl("post"));
        if (dmPop) {
          $$('[data-jili-action="modeSet"]', dmPop).forEach(function (b) {
            b.classList.toggle("on", (b.getAttribute("data-id") === "clip") === !!player.clip);
          });
          dmPop.hidden = true;
        }
        toast(player.clip ? "已进入精华片段循环（第 " + (player.clip.sceneIdx + 1) + " 段）" : "已切换为图文版");
        keepCtrl();
        break;
      }
      case "clipToggle": {
        if (!player) break;
        if (player.clip) { player.clip = null; }
        else {
          var si2 = Math.max(0, player.sceneIdx);
          player.clip = { start: sceneStart(player, si2), end: sceneStart(player, si2) + player.scenes[si2].dur, sceneIdx: si2 };
          player.time = player.clip.start;
          clearDm();
          player.di = dmIndexAt(player.time);
        }
        var dmPop2 = $("#jili-morepop", ovEl("post"));
        if (dmPop2) {
          $$('[data-jili-action="modeSet"]', dmPop2).forEach(function (b) {
            b.classList.toggle("on", (b.getAttribute("data-id") === "clip") === !!player.clip);
          });
        }
        toast(player.clip ? "已进入精华片段循环（第 " + (player.clip.sceneIdx + 1) + " 段）" : "已切换为图文版");
        break;
      }
      case "sceneJump":
        if (player) {
          player.time = sceneStart(player, Number(id) || 0);
          clearDm();
          player.di = dmIndexAt(player.time);
          player.playing = true;
          setPlayBtn();
          updateHUD();
        }
        break;
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
      case "share": openShareSheet(); break;
      case "shareToChar": shareVideoToChar(id); break;
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
      case "openDM": openDM(id, btn.getAttribute("data-tid")); break;
      case "dmOpen": {
        closeModal();
        var dmOv = ovEl("dm");
        if (!dmOv) openDM(id); else renderDMPage(id, dmOv.getAttribute("data-dmtid"));
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
          handleContactResult(cid, r && r.contact);
        });
        break;
      }
      case "dmReroll": {
        var cid2 = btn.getAttribute("data-id");
        var tid2 = (ovEl("dm") && ovEl("dm").getAttribute("data-dmtid")) || tidFor(cid2);
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
      case "coverInkSet": {
        st.settings.coverInk = id; save();
        $$("[data-jili-action='coverInkSet']", ovEl("settings")).forEach(function (b) {
          b.classList.toggle("on", b.getAttribute("data-id") === id);
        });
        renderAll();
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
      case "followChip": FOLLOW_CHIP = id; renderFollow(); break;
      case "meCharged": openChargePage(); break;
      case "switchUser": openSwitchAccount(); break;
      case "acctSwitch": {
        st.activePublisherId = id;
        save();
        closeOv("acct");
        closeOv("dm");
        renderAll();
        toast("已切换为「" + acctName(id) + "」");
        break;
      }
      case "teamNewEdit": openTeamAccounts("new"); break;
      case "teamNew": openTeamAccounts("new"); break;
      case "teamEdit": openTeamAccounts(id); break;
      case "teamSave": saveTeamAccount(); break;
      case "teamDel": deleteTeamAccount(id); break;
      case "teamMemberToggle": teamMemberToggle(id); break;
      case "rechargeOpen": openRecharge(); break;
      case "recharge": {
        var n = Number(id) || 6;
        var payed = false;
        if (window.Wallet) { try { payed = window.Wallet.spend(n, { type: "recharge", title: "充值叽币", subtitle: (n * 600) + " 叽币" }); } catch (e) { payed = false; } }
        if (!payed) { toast("钱包余额不足，先去「我的钱包」充值"); break; }
        st.jibi = (Number(st.jibi) || 0) + n * 600;
        save(); closeModal();
        toast("到账 " + (n * 600) + " 叽币");
        if (TAB === "me") renderMe();
        break;
      }
      case "charge": {
        var cid3 = btn.getAttribute("data-id");
        if (C.chargedOf(st, cid3)) { toast("已经充过电啦"); break; }
        payConfirm(30, function () {
          st.charged = st.charged || [];
          st.charged.push({ creatorId: cid3, until: Date.now() + 30 * 86400000 });
          save(); closeModal();
          toast("已给 " + ((creatorOf(cid3) || {}).name || "UP 主") + " 充电");
          var spc = ovEl("space");
          if (spc) renderSpacePage(spc.getAttribute("data-cid"));
        }, { title: "充电" });
        break;
      }
      case "withdraw": {
        var amtW = Math.round((Number(st.earnings) || 0) * 100) / 100;
        if (amtW <= 0) { toast("暂时没有可提现的收入，开播收到打赏后就有了"); break; }
        var okD = false;
        if (window.Wallet) { try { okD = window.Wallet.income(amtW, { type: "refund", title: "创作激励提现", subtitle: "转入钱包" }); } catch (e) { okD = false; } }
        if (!okD) { toast("钱包暂不可用"); break; }
        st.earnings = 0; save(); renderMe();
        toast("已提现 ¥" + amtW.toFixed(2) + " 到钱包");
        break;
      }
      case "myLive": openMyLive(); break;
      case "openReplay": openReplay(id); break;
      case "startLiveModal": closeModal(); openStudio(); break;
      case "startLiveNow": startLiveNow(); break;
      case "openWallet": closeModal(); openWallet(); break;
      case "openChargePage": openChargePage(); break;
      case "withdrawWallet": {
        var amtC = Math.round((Number(st.earnings) || 0) * 100) / 100;
        if (amtC <= 0) { toast("没有可提现的创作激励，开播收到打赏后就有了"); break; }
        var okC = false;
        if (window.Wallet) { try { okC = window.Wallet.income(amtC, { type: "refund", title: "创作激励提现", subtitle: "转入钱包" }); } catch (e) { okC = false; } }
        if (!okC) { toast("钱包暂不可用"); break; }
        st.earnings = 0; save();
        toast("已提现 ¥" + amtC.toFixed(2) + " 到钱包");
        openWallet();
        break;
      }
      case "fanMineToggle": {
        SPACE_FAN_OPEN = !SPACE_FAN_OPEN;
        var spf = ovEl("space");
        if (spf) renderSpacePage(spf.getAttribute("data-cid"));
        break;
      }
      case "crFanTitleToggle": {
        var tbox = $("#jili-cr-titles", ovEl("creditor"));
        if (tbox) tbox.hidden = !tbox.hidden;
        btn.classList.toggle("open");
        break;
      }
      case "crType": {
        var dcr = ovEl("creditor");
        if (dcr) $$(".ws-type", dcr).forEach(function (b) { b.classList.toggle("on", b === btn); });
        break;
      }
      case "crSrc": btn.classList.toggle("on"); break;
      case "msOpen": openMilestones(id); break;
      case "msAdd": {
        var crms = creatorOf(id);
        var mtext = ($("#jili-ms-text", ui.modals) || {}).value;
        var mdate = ($("#jili-ms-date", ui.modals) || {}).value;
        if (!crms) break;
        if (!mtext || !String(mtext).trim()) { toast("先写点什么"); break; }
        crms.milestones = crms.milestones || [];
        crms.milestones.push({ id: "ms_" + Date.now(), text: String(mtext).trim(), date: mdate || new Date().toISOString().slice(0, 10) });
        save(); openMilestones(id);
        var spm = ovEl("space");
        if (spm) renderSpacePage(spm.getAttribute("data-cid"));
        toast("已添加里程碑");
        break;
      }
      case "msDel": {
        var crd = creatorOf(id);
        var key = btn.getAttribute("data-key");
        if (!crd) break;
        crd.milestones = (crd.milestones || []).filter(function (m) { return String(m.id) !== String(key); });
        save(); openMilestones(id);
        var spd = ovEl("space");
        if (spd) renderSpacePage(spd.getAttribute("data-cid"));
        break;
      }
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
      case "openUpload": openUpload(); break;
      case "uploadTab": {
        syncUploadDraft();
        if (!uploadDraft) break;
        uploadDraft.srcTab = id;
        renderUpload();
        break;
      }
      case "uploadReadLink": {
        syncUploadDraft();
        if (!uploadDraft || !uploadDraft.link) { toast("先填视频链接"); break; }
        uploadReadVideo(uploadDraft.link, false, "视频链接");
        break;
      }
      case "uploadGen": {
        syncUploadDraft();
        if (!uploadDraft) break;
        var brief = uploadDraft.brief || "";
        aiRun(btn, function () { return C.ai.uploadVideo(st, brief, true); }).then(function (r) {
          if (!r || !uploadDraft) return;
          var u = uploadDraft;
          u.title = r.title || u.title;
          u.desc = r.desc || u.desc;
          u.area = r.area || u.area;
          u.durationMin = Math.max(1, Math.round((r.durationSec || 180) / 60));
          u.scriptText = (r.script || []).map(function (l) { return l.text; }).join("\n");
          u.bgmQuery = r.bgmQuery || "";
          u.aiCalls++;
          renderUpload();
          toast("已补齐标题、简介和分镜");
        });
        break;
      }
      case "uploadCoverFrame": {
        if (!uploadDraft) break;
        uploadDraft.coverMode = "frame";
        uploadDraft.frameIdx = Number(id) || 0;
        renderUpload();
        break;
      }
      case "uploadCoverMode": {
        if (!uploadDraft) break;
        uploadDraft.coverMode = id;
        renderUpload();
        break;
      }
      case "uploadCoverAI": uploadCoverAI(btn); break;
      case "uploadCollab": {
        syncUploadDraft();
        if (!uploadDraft) break;
        var cl = uploadDraft.collaborators || [];
        var ci = cl.indexOf(String(id));
        if (ci >= 0) cl.splice(ci, 1); else cl.push(String(id));
        uploadDraft.collaborators = cl;
        renderUpload();
        break;
      }
      case "uploadBgm": {
        syncUploadDraft();
        if (!uploadDraft) break;
        uploadDraft.bgmMode = id;
        renderUpload();
        break;
      }
      case "uploadSong": {
        syncUploadDraft();
        if (!uploadDraft) break;
        uploadDraft.bgmSong = id;
        renderUpload();
        break;
      }
      case "uploadPubAI": uploadPublish(true); break;
      case "uploadPubPlain": uploadPublish(false); break;
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
          var tp = $(".ws-type.on", d5);
          if (tp) cr.type = tp.getAttribute("data-id");
          cr.persona = $("#jili-cr-persona", d5).value.trim();
          cr.catchphrase = ($("#jili-cr-catch", d5) || {}).value.trim();
          cr.fanName = ($("#jili-cr-fanname", d5) || {}).value.trim();
          cr.upNickname = ($("#jili-cr-upnick", d5) || {}).value.trim();
          cr.medalName = ($("#jili-cr-medal", d5) || {}).value.trim();
          cr.fanTitles = FAN_TIER_LV.map(function (x, i) {
            var inp = $("#jili-cr-title-" + i, d5);
            return inp ? inp.value.trim() : "";
          });
          cr.area = ($("#jili-cr-area", d5) || {}).value || cr.area;
          cr.schedule = ($("#jili-cr-sched", d5) || {}).value.trim();
          var fo = $("#jili-cr-follow", d5);
          if (fo) cr.followReply = fo.value.trim();
          var fansInp = $("#jili-cr-fans", d5);
          if (fansInp) { var fv = Number(fansInp.value); cr.fans = fv > 0 ? Math.floor(fv) : 0; }
          var looksInp = $("#jili-cr-looks", d5);
          if (looksInp) cr.looks = looksInp.value.trim();
          var srcImg = $(".ws-src.on[data-id='img']", d5), srcVid = $(".ws-src.on[data-id='vid']", d5);
          if (srcImg || srcVid) cr.visual = { img: !!srcImg, vid: !!srcVid };
          if (studioCoverTmp && studioCoverTmp.key === "jili-cr-livecover") {
            if (studioCoverTmp.data) cr.liveCover = studioCoverTmp.data;
            else delete cr.liveCover;
            studioCoverTmp = null;
          }
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
          st.creators = (st.creators || []).filter(function (x) { return String(x.id) !== String(id); });
          st.posts = (st.posts || []).filter(function (p) { return String(p.creatorId) !== String(id); });
          st.dmMessages = (st.dmMessages || []).filter(function (m) { return String(m.threadId || "").indexOf(":" + id) < 0; });
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
        else {
          st.following.push(id);
          st.followedAt = st.followedAt || {};
          if (!st.followedAt[id]) st.followedAt[id] = Date.now();
          toast("关注成功");
        }
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
        else {
          st.following.push(id);
          st.followedAt = st.followedAt || {};
          if (!st.followedAt[id]) st.followedAt[id] = Date.now();
        }
        save();
        var nowF = isFollowed(id);
        btn.textContent = nowF ? "✓" : "关注";
        btn.classList.toggle("done", nowF);
        if (liveP) applyRound([{ type: "follow", name: liveMyName(), me: true }]);
        break;
      }
      case "liveSend": sendLiveDm(); break;
      case "endLive": {
        if (liveP && String(liveP.room.creatorId) === "me") {
          stopLive();
          closeOv("live");
          toast("直播已结束");
        }
        break;
      }
      case "giftOpen": { if (liveP) { liveP.giftSel.tab = id === "sc" ? "sc" : (id || liveP.giftSel.tab); openLiveSheet("", "jlv-giftsheet", true); renderGiftSheet(); } break; }
      case "shopOpen": openShopSheet(); break;
      case "shopBuy": shopBuy(id); break;
      case "shopPresent": shopPresent(id); break;
      case "shopGoodToggle": btn.classList.toggle("on"); break;
      case "shopCommPick": {
        var pbox = btn.parentElement;
        $$(".jl-comm", pbox).forEach(function (b) { b.classList.toggle("on", b === btn); });
        break;
      }
      case "giftClose": closeLiveSheet(); break;
      case "giftTab": { if (liveP) { liveP.giftSel.tab = id; renderGiftSheet(); } break; }
      case "giftSel": { if (liveP) { liveP.giftSel.id = id; renderGiftSheet(); } break; }
      case "giftCount": { if (liveP) { liveP.giftSel.count = Number(id) || 1; renderGiftSheet(); } break; }
      case "giftSend": giftSend(); break;
      case "scPrice": { if (liveP) { liveP.giftSel.scPrice = Number(id) || 30; renderGiftSheet(); } break; }
      case "scSend": scSend(); break;
      case "guardBuy": guardBuy(id); break;
      case "scOpen": { if (liveP) { liveP.giftSel.tab = "sc"; openLiveSheet("", "jlv-giftsheet", true); renderGiftSheet(); } break; }
      case "audOpen": { if (liveP) { openLiveSheet("", "jlv-aud"); renderAudSheet(); } break; }
      case "audTab": { if (liveP) { liveP.aud.tab = id; renderAudSheet(); } break; }
      case "audRange": { if (liveP) { liveP.aud.range = id; renderAudSheet(); } break; }
      case "audGuardGo": { if (liveP) { liveP.giftSel.tab = "guard"; openLiveSheet("", "jlv-giftsheet", true); renderGiftSheet(); } break; }
      case "hostOpen": { if (liveP && liveP.isMe) { openLiveSheet(""); renderHostSheet(); } break; }
      case "hostTab": { if (liveP) { liveP.host.tab = id; renderHostSheet(); } break; }
      case "hostSec": { if (liveP) { liveP.host.sec = Number(id) || 60; renderHostSheet(); } break; }
      case "hostJibi": { if (liveP) { liveP.host.jibi = Number(id) || 0; renderHostSheet(); } break; }
      case "hostPkSec": { if (liveP) { liveP.host.pkSec = Number(id) || 300; renderHostSheet(); } break; }
      case "hostPkOpp": {
        if (!liveP) break;
        var hpc = creatorOf(id);
        liveP.host.opp = hpc ? { id: hpc.id, name: hpc.name } : null;
        renderHostSheet();
        break;
      }
      case "hostLotteryStart": {
        if (!liveP || !liveP.isMe) break;
        var hp = $("#jili-h-prize", ovEl("live"));
        var hk = $("#jili-h-kw", ovEl("live"));
        var hprize = hp && hp.value.trim() ? hp.value.trim() : "神秘奖励";
        var hkw = hk && hk.value.trim() ? hk.value.trim() : "";
        liveP.host.prize = hprize;
        liveP.host.kw = hkw;
        closeLiveSheet();
        applyRound([{ type: "lottery", prize: hprize, keyword: hkw, sec: liveP.host.sec, jibi: liveP.host.jibi, me: true }]);
        break;
      }
      case "hostVoteStart": {
        if (!liveP || !liveP.isMe) break;
        var hq = $("#jili-h-q", ovEl("live"));
        var hopts = $$(".jili-h-opt", ovEl("live")).map(function (o) { return o.value.trim(); }).filter(Boolean);
        if (hopts.length < 2) { toast("至少填 2 个选项"); break; }
        liveP.host.q = hq && hq.value.trim() ? hq.value.trim() : "来投个票吧";
        closeLiveSheet();
        applyRound([{ type: "vote", q: liveP.host.q, options: hopts, sec: liveP.host.sec, me: true }]);
        break;
      }
      case "hostPacketSend": {
        if (!liveP || !liveP.isMe) break;
        var htEl = $("#jili-h-total", ovEl("live"));
        var hcEl = $("#jili-h-count", ovEl("live"));
        var htotal = clampN(htEl ? htEl.value : 0, 100, 20000, 500);
        var hcount = Math.round(clampN(hcEl ? hcEl.value : 0, 5, 100, 20));
        liveP.host.total = htotal;
        liveP.host.count = hcount;
        closeLiveSheet();
        applyRound([{ type: "redpacket", name: liveP.cr.name, total: htotal, count: hcount, me: true }]);
        break;
      }
      case "hostPkStart": {
        if (!liveP || !liveP.isMe) break;
        closeLiveSheet();
        startPk({ sec: liveP.host.pkSec, opp: liveP.host.opp });
        break;
      }
      case "lotJoin": {
        if (!liveP || !liveP.lottery || liveP.lottery.result || liveP.lottery.joined) break;
        applyRound([{ type: "dm", text: liveP.lottery.keyword, me: true }]);
        break;
      }
      case "rpGrab": grabPacket(id); break;
      case "votePick": {
        if (!liveP || !liveP.vote || liveP.vote.result || liveP.vote.myPick != null) break;
        var vi = Number(id);
        if (!(vi >= 0 && vi < liveP.vote.options.length)) break;
        applyRound([{ type: "dm", text: liveP.vote.options[vi], me: true }]);
        break;
      }
      case "pkVisit": {
        if (!liveP || !liveP.pk || !liveP.pk.opp || !liveP.pk.opp.id) break;
        var vroom = roomOf(liveP.pk.opp.id);
        if (!vroom) { toast("TA 现在没在直播"); break; }
        liveP.pk.visited = true;
        liveSys("我去 " + liveP.pk.opp.name + " 的直播间串门助威了！");
        openLive(vroom.id);
        break;
      }
      case "likeTap": {
        if (!liveP) break;
        liveP.likeN++;
        var hw = $("#jili-jlkhearts", ovEl("live"));
        if (hw) {
          var hs = document.createElement("span");
          hs.textContent = "❤";
          hw.appendChild(hs);
          setTimeout(function () { if (hs.parentElement) hs.remove(); }, 1600);
        }
        if (liveP.likeN % 10 === 0) applyRound([{ type: "like", name: liveMyName(), count: 10, me: true }]);
        break;
      }
      case "liveMenu": {
        if (!liveP) break;
        openLiveSheet('<div style="display:flex;flex-direction:column;gap:10px">' +
          '<button class="jl-btn sm ghost" data-jili-action="liveClear">清空弹幕</button>' +
          (liveP.isMe ? '<button class="jl-btn sm" data-jili-action="endLive">结束直播</button>' : "") +
        '</div>');
        break;
      }
      case "liveClear": {
        var lchat = $("#jili-chat", ovEl("live"));
        if (lchat) lchat.innerHTML = "";
        if (liveP) liveP.chatLog = [];
        closeLiveSheet();
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
      case "openStudio": closeModal(); openStudio(); break;
      case "studioSrc": {
        var sd = ovEl("studio");
        var sInput = $("#jili-studio-source", sd);
        if (sInput) sInput.value = id;
        var chips = $(".lq-chips", sd);
        if (chips) Array.prototype.forEach.call(chips.querySelectorAll("button"), function (b) {
          b.classList.toggle("on", b.getAttribute("data-id") === id);
        });
        break;
      }
      case "liveCoverReset": liveCoverReset(id); break;
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
    if (!t) return;
    var upKind = t.getAttribute && t.getAttribute("data-jili-upload");
    if (upKind && t.files && t.files.length) {
      if (upKind === "video") {
        var vf = t.files[0];
        uploadReadVideo(URL.createObjectURL(vf), true, vf.name);
      } else if (upKind === "cover") {
        var cr = new FileReader();
        cr.onload = function () {
          if (!uploadDraft) return;
          uploadDraft.coverCustom = String(cr.result || "");
          uploadDraft.coverMode = "custom";
          renderUpload();
        };
        cr.readAsDataURL(t.files[0]);
      } else if (upKind === "board") {
        var imgs = Array.prototype.slice.call(t.files);
        var got = [];
        var left = imgs.length;
        imgs.forEach(function (img) {
          var rr = new FileReader();
          rr.onload = function () {
            got.push(String(rr.result || ""));
            if (!--left && uploadDraft) { uploadDraft.boardCells = got; renderUpload(); }
          };
          rr.readAsDataURL(img);
        });
      }
      return;
    }
    if (!t.id) return;
    var st = S.state;
    if (t.id === "jili-up-co") {
      syncUploadDraft();
      renderUpload();
      return;
    }
    if (t.id.indexOf("jili-setting-jb-") === 0 && t.type === "checkbox") {
      var jbid = t.id.slice("jili-setting-jb-".length);
      var books = (typeof db !== "undefined" && db.worldBooks) || [];
      var allIds = books.filter(function (b) { return b && b.type === "entry" && b.position === "limit_break"; }).map(function (b) { return String(b.id); });
      var cur = Array.isArray(st.settings.jbEntryIds) ? st.settings.jbEntryIds.map(String) : allIds.slice();
      var at3 = cur.indexOf(jbid);
      if (t.checked && at3 < 0) cur.push(jbid);
      if (!t.checked && at3 >= 0) cur.splice(at3, 1);
      st.settings.jbEntryIds = cur;
      save();
      return;
    }
    if (t.id.indexOf("jili-setting-") === 0 && t.type === "checkbox") {
      var key = t.id.slice("jili-setting-".length);
      st.settings[key] = t.checked;
      save();
      if (key === "darkMode") applyJiliTheme();
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
    if (t.id === "jili-studio-cover-file" && t.files && t.files[0]) {
      readLiveCoverFile(t.files[0], "jili-studio-cover");
      t.value = "";
      return;
    }
    if (t.id === "jili-cr-livecover-file" && t.files && t.files[0]) {
      readLiveCoverFile(t.files[0], "jili-cr-livecover");
      t.value = "";
      return;
    }
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
    } else if (t.id === "jili-live-dm") {
      sendLiveDm();
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
    if (liveP) {
      if (liveP.pumpT) { clearTimeout(liveP.pumpT); liveP.pumpT = null; }
      if (liveP.evT) { clearInterval(liveP.evT); liveP.evT = null; }
      if (liveP.fxT) { clearInterval(liveP.fxT); liveP.fxT = null; }
      if (liveP.npcT) { clearInterval(liveP.npcT); liveP.npcT = null; }
    }
  }
  function resumeAll() {
    startPlayerTimer();
    if (liveP && !liveP.ended) {
      if (liveP.queue.length && !liveP.pumpT) pumpQueue();
      if (!liveP.evT) liveP.evT = setInterval(liveTick, 1000);
      if (!liveP.fxT) liveP.fxT = setInterval(fxTick, 500);
      if (!liveP.npcT) liveP.npcT = setInterval(npcPulse, 2600);
    }
  }

  /* ================= 外观（浅色 / 黑暗） ================= */

  function applyJiliTheme() {
    var screen = document.getElementById("jili-screen");
    if (!screen) return;
    screen.setAttribute("data-jili-theme", S.state.settings.darkMode ? "dark" : "light");
  }

  /* ================= 初始化 & 导出 ================= */

  function init() {
    ui.screen = document.getElementById("jili-screen");
    if (!ui.screen) return;
    applyJiliTheme();
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
    reload: function () { S.state = C.load(); applyJiliTheme(); renderAll(); },
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
