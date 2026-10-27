/* 深夜电台 MIDNIGHT FM — 主模块（纸墨收音机版）
 * 依赖：midnight_html.js（外壳）、db（apiSettings/characters）、window.MinimaxVoice（TTS/音效，可选）
 * 歌曲：music-server（与 Radio APP 同一地址规则 radioMusicApi / hostname:9091）
 */
"use strict";

(function () {

  /* ===== 服务器地址（与 radio.js 相同规则） ===== */
  var MUSIC_API = (function () {
    try { var saved = localStorage.getItem("radioMusicApi"); if (saved) return saved; } catch (e) {}
    if (location.protocol === "file:") return "http://localhost:9091";
    return location.protocol + "//" + location.hostname + ":9091";
  })();
  var MUSIC_TOKEN = "changeme";

  function musicFetch(path) {
    return fetch(MUSIC_API + path, { headers: { "X-Auth-Token": MUSIC_TOKEN } })
      .then(function (r) { return r.json(); });
  }

  /* ===== 电台定义 ===== */
  var STATIONS = [
    { id: "story", freq: "90.6", name: "故事台", tag: "深夜的老位置，讲一个只有今晚的故事", songs: [1, 2],
      viz: "ridge", color: "#9db8d6",
      structure: "开场问候 → 讲一个原创深夜短篇（温柔、留白、有点孤独但最后是暖的，现实向，不恐怖不猎奇）→ 中间插一首慢歌 → 故事收束 → 晚安收尾" },
    { id: "night", freq: "97.3", name: "夜話台", tag: "睡不着的话，就当我陪你聊聊天", songs: [2, 3],
      viz: "wave", color: "#e2b27c",
      structure: "开场问候 → 挑一两个深夜话题跟听众聊聊（最近的念头、心事、回忆、小的温柔），像深夜热线 → 每聊两三段插一首歌 → 晚安收尾" },
    { id: "music", freq: "104.1", name: "音樂台", tag: "今晚的歌都准备好了，一首一首放给你", songs: [3, 5],
      viz: "ripples", color: "#9ec8b2",
      structure: "开场问候 → 以歌为主：每首歌前面给一小段串词，说说这首歌适合深夜的哪个瞬间 → 晚安收尾" },
    { id: "pillow", freq: "88.8", name: "枕話台", tag: "声音放得很低很低，听着听着就睡着了", songs: [1, 2], hidden: true,
      viz: "stars", color: "#c9b8e8",
      structure: "全程音量很低：几乎每行都用[低声]，多用[停顿]，每段说话不超过两行；说几句就垫一段轻音乐；内容是放松引导（呼吸、放松肩膀、想象海边或雪夜）→ 最后慢慢淡出，语气越来越轻地说晚安" }
  ];
  function findStation(id) {
    for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i];
    return null;
  }

  /* ===== 配置 ===== */
  var CFG_KEY = "midnightCfg";
  var UNLOCK_KEY = "mnPillowUnlocked";
  var ARCHIVE_KEY = "mnArchive";
  var LETTERS_KEY = "mnLetters";

  function loadCfg() {
    var d = { hostCharId: "", callName: "", readComments: true, bgmVol: 0.14 };
    try { var raw = localStorage.getItem(CFG_KEY); if (raw) { var o = JSON.parse(raw); for (var k in d) if (o[k] !== undefined) d[k] = o[k]; } } catch (e) {}
    return d;
  }
  function saveCfgObj() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  var cfg = loadCfg();

  /* ===== 状态 ===== */
  var currentView = "home";
  var liveStationId = null;
  var pb = { active: false, stopFlag: false, skipFlag: false, queue: [], idx: -1, station: null,
             title: "", scriptRaw: "", played: [], curAudio: null, curResolver: null,
             bgmAudio: null, phase: "idle", errorMsg: "", detailEntry: null, rate: 1, lettersUsed: [] };

  /* ===== DOM ===== */
  function $(id) { return document.getElementById(id); }
  var viewHome, viewLive, viewArchive, viewDetail, viewMail, backBtn, titleEl;

  /* ===== 工具 ===== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(msg) {
    var host = $("mn-modals");
    if (!host) return;
    var old = host.querySelector(".mn-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "mn-toast";
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 250);
    }, 2200);
  }
  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  async function sleepCancellable(ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms && !pb.stopFlag && !pb.skipFlag) await sleep(100);
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function nowDate() { return new Date(); }
  function dateLabel() {
    var d = nowDate();
    var wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 · 星期" + wk + " · 深夜 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function clockLabel() {
    var d = nowDate();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function isPillowUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) { return false; }
  }
  function loadArchive() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]"); } catch (e) { return []; }
  }
  function loadLetters() {
    try { return JSON.parse(localStorage.getItem(LETTERS_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveLetters(list) {
    try { localStorage.setItem(LETTERS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  /* ===== 提示词 ===== */
  function hostNote() {
    var c = cfg.hostCharId && db && db.characters ? db.characters.find(function (x) { return x && x.id === cfg.hostCharId; }) : null;
    if (c) return "主播人设：你就是「" + c.name + "」本人（从平时的聊天里走出来的），用你自己的口吻和称呼习惯，但今晚你是深夜电台主播。";
    return "主播人设：深夜电台主播，声音低而温柔，说话不紧不慢，像老朋友。";
  }
  function callName() {
    return (cfg.callName || "").trim() || "你";
  }
  function stationSystemPrompt(st, letters) {
    var lines = [
      "你是「深夜电台」的主播，一台只放给一个人听的深夜广播。",
      hostNote(),
      "今晚在播「" + st.name + "」，频率 FM " + st.freq + "。",
      "所有话都是只对着这一个人说的，亲密、自然、有画面感，但别腻。",
      "",
      "输出一份「播报稿」，可用这些标记：",
      "[song:歌名|歌手] 插播一首歌；想给候选替补就这样：[song:歌名|歌手|替补歌手]",
      "[bgm:轻音乐描述] 在说话底下垫一段很轻的纯音乐",
      "[se:音效名] 插一个短音效（例如：雨声、海浪、风、翻书声、钟声）",
      "[停顿] 独占一行，表示停一拍",
      "[低声] 放在某行话的开头，表示这句要压低声音",
      "（括号里的是导演提示，不会被读出来）",
      "除标记行以外，每一行都会被原样朗读。一行一两句话，别写长段。",
      ""
    ];
    if (letters && letters.length) {
      lines.push("今晚有几封听众来信，挑一封在最合适的位置念出来，念之前用一两句话自然带出这封信：");
      letters.forEach(function (l) {
        lines.push("——来自「" + l.charName + "」：" + l.text);
      });
      lines.push("念信时也照常一行一两句，念完轻轻接回节目。");
      lines.push("");
    }
    lines.push("今晚的节目结构：" + st.structure);
    lines.push("歌的数量控制在 " + st.songs[0] + "-" + st.songs[1] + " 首，歌名必须是真实存在的歌（华语/日语流行、纯音乐都可以）。");
    lines.push("");
    lines.push("格式要求：");
    lines.push("第一行写「标题：」加今晚节目的标题（10个字以内）。");
    lines.push("最后一段一定是温柔的收尾和晚安。");
    lines.push("不要输出任何解释、markdown、代码块或标记说明。");
    return lines.join("\n");
  }
  function buildUserPrompt(st) {
    return "现在是 " + dateLabel() + "。今晚播「" + st.name + "」FM " + st.freq + "。听众是" + callName() + "。请直接输出今晚的播报稿。";
  }
  function letterSystemPrompt(charName) {
    return [
      "你是「" + charName + "」——这台手机里的一个角色，平时和机主聊天相处，有自己说话的口吻和习惯。",
      "现在是深夜，你想给「深夜电台」写一封短信投稿——那是一台只放给机主一个人听的电台。",
      "要求：80~160字，口语、真诚、像你平时说话的样子；可以聊聊最近的小事、想点给电台的一首歌、或者只是睡不着想说的话；",
      "不用客套的开头结尾，不写署名和日期，不用markdown，直接输出信的正文。"
    ].join("\n");
  }

  /* ===== LLM（与 calendar_engine 相同的双协议） ===== */
  async function llmChat(systemPrompt, userPrompt) {
    var api = db && db.apiSettings;
    if (!api || !api.url || !api.key || !api.model) throw new Error("请先在 API 设置里配置好 API");
    var headers, endpoint, body;
    if (api.provider === "gemini") {
      endpoint = api.url.replace(/\/$/, "") + "/v1beta/models/" + api.model + ":generateContent?key=" + encodeURIComponent(api.key);
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        system_instruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.95 }
      });
    } else {
      endpoint = api.url.replace(/\/$/, "") + "/v1/chat/completions";
      headers = { "Content-Type": "application/json", "Authorization": "Bearer " + api.key };
      body = JSON.stringify({
        model: api.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.95
      });
    }
    var resp = await fetch(endpoint, { method: "POST", headers: headers, body: body });
    if (!resp.ok) {
      var errText = await resp.text().catch(function () { return ""; });
      throw new Error("API 错误 " + resp.status + " " + errText.slice(0, 120));
    }
    var data = await resp.json();
    if (api.provider === "gemini") {
      var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      return (parts && parts.map(function (p) { return p.text || ""; }).join("")) || "";
    }
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  }

  /* ===== 播报稿解析 ===== */
  function parseScript(raw) {
    var title = "";
    var segs = [];
    var lines = String(raw || "").replace(/```[a-zA-Z]*\n?/g, "").split(/\r?\n/);
    var inSummary = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^<\/?(本子|轨道|摘要|script|broadcast)>$/i.test(line)) continue;
      if (/^<摘要>/i.test(line)) { inSummary = true; continue; }
      if (/^<\/摘要>/i.test(line)) { inSummary = false; continue; }
      if (inSummary) continue;
      var m;
      if (!title && (m = line.match(/^标题[:：]\s*(.+)$/))) { title = m[1].trim(); continue; }
      if ((m = line.match(/^\[(?:song|歌)[:：]\s*(.+?)\s*\]$/i))) {
        var parts = m[1].split("|").map(function (s) { return s.trim(); });
        if (parts[0]) segs.push({ type: "song", title: parts[0], artist: parts[1] || "", backups: parts.slice(2).filter(Boolean) });
        continue;
      }
      if ((m = line.match(/^\[(?:bgm|垫乐|音乐)[:：]\s*(.+?)\s*\]$/i))) { segs.push({ type: "bgm", query: m[1] }); continue; }
      if ((m = line.match(/^\[(?:se|音效)[:：]\s*(.+?)\s*\]$/i))) { segs.push({ type: "se", name: m[1] }); continue; }
      if (/^\[(?:停顿|pause)\s*\]$/i.test(line)) { segs.push({ type: "pause", ms: 900 }); continue; }
      var text = line;
      var whisper = false;
      if ((m = text.match(/^\[(?:低声|轻声|whisper)\]\s*/i))) { whisper = true; text = text.slice(m[0].length); }
      text = text.replace(/[（(][^（）()]{0,24}[）)]/g, "").trim();
      if (!text) continue;
      if (whisper) text = "……" + text;
      var prev = segs[segs.length - 1];
      if (prev && prev.type === "speech") prev.text += "\n" + text;
      else segs.push({ type: "speech", text: text });
    }
    return { title: title, segs: segs };
  }

  /* ===== 歌曲解析 ===== */
  function proxyUrl(u) { return MUSIC_API + "/api/music/proxy?url=" + encodeURIComponent(u); }
  async function searchSongs(q) {
    try {
      var d = await musicFetch("/api/music/search?q=" + encodeURIComponent(q));
      return (d && d.songs) || [];
    } catch (e) { return []; }
  }
  async function getSongUrl(id) {
    try {
      var d = await musicFetch("/api/music/url?id=" + encodeURIComponent(id));
      return (d && d.url) || "";
    } catch (e) { return ""; }
  }
  async function resolveSong(seg) {
    var tries = [];
    if (seg.artist) tries.push(seg.title + " " + seg.artist);
    tries.push(seg.title);
    for (var b = 0; b < seg.backups.length; b++) tries.push(seg.title + " " + seg.backups[b]);
    for (var i = 0; i < tries.length; i++) {
      var songs = await searchSongs(tries[i]);
      for (var j = 0; j < Math.min(3, songs.length); j++) {
        var url = await getSongUrl(songs[j].id);
        if (url) {
          return { neteaseId: String(songs[j].id), title: songs[j].name, artist: songs[j].artist || "", cover: songs[j].cover || "", url: proxyUrl(url) };
        }
      }
      if (pb.stopFlag) return null;
    }
    return null;
  }

  /* ===== 热评 ===== */
  async function fetchTopComment(neteaseId) {
    try {
      var d = await musicFetch("/api/music/comments?id=" + encodeURIComponent(neteaseId) + "&limit=4");
      var list = (d && d.comments) || [];
      for (var i = 0; i < list.length; i++) {
        var c = String(list[i].content || "").replace(/\s+/g, " ").trim();
        if (c && c.length <= 80 && c.length >= 6) return c;
      }
      return "";
    } catch (e) { return ""; }
  }

  /* ===== 播放原语 ===== */
  function playUrl(url) {
    return new Promise(function (resolve) {
      var a = new Audio(url);
      a.playbackRate = pb.rate || 1;
      a.ontimeupdate = function () {
        var fill = $("mn-song-bar-fill");
        if (!fill) return;
        var d = a.duration;
        if (isFinite(d) && d > 0) {
          fill.classList.remove("mn-indet");
          fill.style.width = Math.min(100, a.currentTime / d * 100) + "%";
        } else {
          fill.classList.add("mn-indet");
        }
      };
      pb.curAudio = a;
      pb.curResolver = resolve;
      var done = false;
      var fin = function (r) { if (!done) { done = true; if (pb.curAudio === a) pb.curAudio = null; if (pb.curResolver === resolve) pb.curResolver = null; resolve(r); } };
      a.onended = function () { fin("ended"); };
      a.onerror = function () { fin("error"); };
      a.play().catch(function () { fin("error"); });
    });
  }
  function waitAudioEnd(audio) {
    return new Promise(function (resolve) {
      if (!audio) { resolve(); return; }
      pb.curAudio = audio;
      var done = false;
      var fin = function () { if (!done) { done = true; if (pb.curAudio === audio) pb.curAudio = null; resolve(); } };
      audio.addEventListener("ended", fin);
      audio.addEventListener("pause", function () { setTimeout(fin, 80); });
      if (audio.paused) setTimeout(fin, 80);
    });
  }
  function interruptCurrent() {
    if (pb.curAudio) { try { pb.curAudio.pause(); } catch (e) {} }
    if (pb.curResolver) { var r = pb.curResolver; pb.curResolver = null; r("skipped"); }
  }

  /* ===== 垫乐 BGM ===== */
  function stopBgm() {
    var a = pb.bgmAudio;
    if (!a) return;
    pb.bgmAudio = null;
    var v0 = a.volume;
    var i = 0;
    var iv = setInterval(function () {
      i++;
      a.volume = Math.max(0, v0 * (1 - i / 10));
      if (i >= 10) { clearInterval(iv); try { a.pause(); a.src = ""; } catch (e) {} }
    }, 70);
  }
  async function startBgm(query) {
    if (pb.bgmAudio || pb.stopFlag) return;
    var q = (query || "").trim() || "深夜 轻音乐";
    var songs = await searchSongs(q + " 纯音乐");
    if (!pb.stopFlag && !songs.length) songs = await searchSongs("钢琴曲 轻音乐");
    if (pb.stopFlag || pb.bgmAudio) return;
    var url = "";
    for (var i = 0; i < Math.min(3, songs.length); i++) {
      url = await getSongUrl(songs[i].id);
      if (url) break;
    }
    if (!url || pb.stopFlag || pb.bgmAudio) return;
    var a = new Audio(proxyUrl(url));
    a.loop = true;
    a.volume = 0;
    pb.bgmAudio = a;
    try { await a.play(); } catch (e) { pb.bgmAudio = null; return; }
    var target = Number(cfg.bgmVol) || 0.14;
    var n = 0;
    var iv = setInterval(function () {
      if (pb.bgmAudio !== a) { clearInterval(iv); return; }
      n++;
      a.volume = Math.min(target, a.volume + target / 10);
      if (n >= 10) clearInterval(iv);
    }, 110);
  }

  /* ===== 音效 ===== */
  var SE_ALIAS = { "雨": "水声", "雨声": "水声", "下雨": "水声", "海浪": "水声", "海": "水声", "浪": "水声", "流水": "水声", "溪水": "水声", "河水": "水声", "呼吸": "轻喘" };
  async function playSe(name) {
    var mv = window.MinimaxVoice;
    if (!mv) return;
    var names = [name, SE_ALIAS[name]];
    for (var i = 0; i < names.length; i++) {
      if (!names[i]) continue;
      var list = null;
      try { list = await mv.listSfx(names[i]); } catch (e) { list = null; }
      if (list && list.length) {
        var blob = list[Math.floor(Math.random() * list.length)].blob;
        var a = new Audio(URL.createObjectURL(blob));
        a.volume = 0.9;
        pb.curAudio = a;
        try { await a.play(); } catch (e) { pb.curAudio = null; return; }
        await waitAudioEnd(a);
        try { URL.revokeObjectURL(a.src); } catch (e) {}
        return;
      }
    }
  }

  /* ===== 主播说话 ===== */
  async function speakText(text) {
    showSubtitle(text);
    var mv = window.MinimaxVoice;
    if (mv) {
      try {
        var audio = await mv.speak(text, cfg.hostCharId || undefined);
        if (audio) {
          try { audio.playbackRate = pb.rate || 1; } catch (e) {}
          await waitAudioEnd(audio);
          return;
        }
      } catch (e) { /* 落到字幕兜底 */ }
    }
    var ms = Math.min(30000, (1600 + text.replace(/\s/g, "").length * 230) / (pb.rate || 1));
    await sleepCancellable(ms);
  }

  /* ===== 队列执行 ===== */
  async function runQueue() {
    for (var i = 0; i < pb.queue.length; i++) {
      if (pb.stopFlag) return "stopped";
      pb.idx = i;
      pb.skipFlag = false;
      updateQueueUI();
      var seg = pb.queue[i];
      if (seg.type === "speech") {
        await speakText(seg.text);
      } else if (seg.type === "song") {
        stopBgm();
        showSongCard(seg.song);
        var r = await playUrl(seg.song.url);
        if (r !== "error") pb.played.push(seg.song);
        updateQueueUI();
      } else if (seg.type === "bgm") {
        showSubtitle("♪ 垫一段轻音乐");
        startBgm(seg.query);
        await sleepCancellable(1000);
      } else if (seg.type === "se") {
        showSubtitle("♪ " + seg.name);
        await playSe(seg.name);
      } else if (seg.type === "pause") {
        showSubtitle("");
        await sleepCancellable(seg.ms || 900);
      }
    }
    return pb.stopFlag ? "stopped" : "done";
  }

  function saveArchive(reason) {
    if (!pb.played.length && !pb.scriptRaw) return;
    var list = loadArchive();
    var no = 1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].stationId === pb.station.id) no++;
    }
    list.unshift({
      ts: Date.now(),
      no: no,
      stationId: pb.station.id, stationName: pb.station.name, freq: pb.station.freq,
      title: pb.title || (pb.station.name + "的节目"),
      songs: pb.played.map(function (s) { return { title: s.title, artist: s.artist, cover: s.cover }; }),
      segs: pb.queue.length,
      script: pb.scriptRaw,
      letters: (pb.lettersUsed || []).map(function (l) { return { charName: l.charName, text: l.text }; }),
      complete: reason === "done"
    });
    if (list.length > 30) list = list.slice(0, 30);
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  async function runBroadcast(station) {
    if (pb.active) { toast("已经在播了，先停止当前的"); return; }
    var lettersUsed = loadLetters().filter(function (l) { return !l.aired && l.text; }).slice(0, 3);
    liveStationId = station.id;
    pb = { active: true, stopFlag: false, skipFlag: false, queue: [], idx: -1, station: station,
           title: "", scriptRaw: "", played: [], curAudio: null, curResolver: null,
           bgmAudio: null, phase: "generating", errorMsg: "", detailEntry: null, rate: pb.rate || 1, lettersUsed: lettersUsed };
    showView("live");
    renderLive();
    var reason = "stopped";
    try {
      var raw = await llmChat(stationSystemPrompt(station, lettersUsed), buildUserPrompt(station));
      if (pb.stopFlag) { pb.phase = "idle"; renderLive(); return; }
      if (!raw || !raw.trim()) throw new Error("AI 没写出播报稿，再试一次吧");
      pb.scriptRaw = raw.trim();
      var parsed = parseScript(raw);
      if (!parsed.segs.length) throw new Error("播报稿没法解析，再试一次吧");
      pb.title = parsed.title || (station.name + " · " + clockLabel());
      pb.phase = "resolving";
      renderLive();
      for (var i = 0; i < parsed.segs.length; i++) {
        var seg = parsed.segs[i];
        if (seg.type === "song") {
          seg.resolved = await resolveSong(seg);
          if (pb.stopFlag) { pb.phase = "idle"; renderLive(); return; }
        }
      }
      if (cfg.readComments) {
        pb.phase = "resolving";
        for (var k = 0; k < parsed.segs.length; k++) {
          var s2 = parsed.segs[k];
          if (s2.type === "song" && s2.resolved) s2.comment = await fetchTopComment(s2.resolved.neteaseId);
          if (pb.stopFlag) { pb.phase = "idle"; renderLive(); return; }
        }
      }
      var q = [];
      parsed.segs.forEach(function (seg) {
        if (seg.type === "song") {
          if (!seg.resolved) return;
          if (seg.comment) q.push({ type: "speech", text: "接下来这首《" + seg.resolved.title + "》。有条热评是这么说的：「" + seg.comment + "」" });
          q.push({ type: "song", song: seg.resolved });
        } else {
          q.push(seg);
        }
      });
      pb.queue = q;
      pb.phase = "playing";
      renderLive();
      reason = await runQueue();
      if (reason === "done") {
        pb.phase = "done";
        if (lettersUsed.length) {
          var all = loadLetters();
          all.forEach(function (l) {
            if (lettersUsed.some(function (u) { return u.id === l.id; })) l.aired = true;
          });
          saveLetters(all);
        }
      }
      else if (reason === "stopped") pb.phase = "idle";
      saveArchive(reason);
      renderLive();
    } catch (e) {
      pb.phase = "error";
      pb.errorMsg = (e && e.message) || "出错了";
      renderLive();
    } finally {
      pb.active = false;
      stopBgm();
      renderHome();
    }
  }

  function stopBroadcast() {
    if (!pb.active) return;
    pb.stopFlag = true;
    interruptCurrent();
    stopBgm();
  }
  function skipSegment() {
    if (!pb.active || pb.phase !== "playing") return;
    pb.skipFlag = true;
    interruptCurrent();
  }
  function cycleSpeed() {
    var rates = [1, 1.25, 1.5];
    var idx = rates.indexOf(pb.rate || 1);
    pb.rate = rates[(idx + 1) % rates.length];
    if (pb.curAudio) { try { pb.curAudio.playbackRate = pb.rate; } catch (e) {} }
    var btn = $("mn-speed-btn");
    if (btn) btn.textContent = "倍速 " + pb.rate + "×";
  }

  /* ===== 可视化（时间驱动，避开跨域音频分析） ===== */
  var viz = { canvas: null, ctx: null, w: 0, h: 0, theme: "wave", color: "#9db8d6", level: 0.3, raf: 0, t: 0 };
  function vizStart(canvas, st) {
    if (!canvas) return;
    viz.canvas = canvas;
    viz.theme = st.viz || "wave";
    viz.color = st.color || "#9db8d6";
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth || 300;
    var h = canvas.clientHeight || 108;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    viz.w = w; viz.h = h;
    viz.ctx = canvas.getContext("2d");
    viz.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!viz.raf) viz.raf = requestAnimationFrame(vizFrame);
  }
  function vizStop() {
    if (viz.raf) { cancelAnimationFrame(viz.raf); viz.raf = 0; }
    viz.canvas = null;
  }
  function vizBump() {
    viz.level = Math.min(1, viz.level + 0.45);
  }
  function vizFrame(ts) {
    viz.raf = 0;
    var c = viz.canvas;
    if (!c || !c.isConnected || !viz.ctx) return;
    var ctx = viz.ctx, w = viz.w, h = viz.h;
    viz.t = ts / 1000;
    viz.level = Math.max(0.18, viz.level * 0.965);
    ctx.clearRect(0, 0, w, h);
    var col = viz.color;
    if (!pb.active || pb.phase === "idle") vizStatic(ctx, w, h);
    else if (viz.theme === "ridge") vizRidge(ctx, w, h, col);
    else if (viz.theme === "ripples") vizRipples(ctx, w, h, col);
    else if (viz.theme === "stars") vizStars(ctx, w, h, col);
    else vizWave(ctx, w, h, col);
    viz.raf = requestAnimationFrame(vizFrame);
  }
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function vizStatic(ctx, w, h) {
    var t = viz.t;
    for (var i = 0; i < 46; i++) {
      var x = Math.random() * w, y = Math.random() * h;
      ctx.fillStyle = "rgba(238,238,241," + (0.02 + Math.random() * 0.06) + ")";
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.beginPath();
    for (var px = 0; px <= w; px += 4) {
      var y2 = h * 0.5 + Math.sin(px * 0.05 + t * 1.4) * 3 * Math.sin(t * 0.7) + (Math.random() - 0.5) * 2.2;
      if (px === 0) ctx.moveTo(px, y2); else ctx.lineTo(px, y2);
    }
    ctx.strokeStyle = "rgba(238,238,241,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function vizWave(ctx, w, h, col) {
    var t = viz.t, lv = viz.level;
    for (var L = 0; L < 3; L++) {
      ctx.beginPath();
      var amp = h * (0.1 + 0.14 * lv) * (1 - L * 0.22);
      for (var x = 0; x <= w; x += 3) {
        var y = h * (0.52 + (L - 1) * 0.1)
          + Math.sin(x * 0.022 + t * (1.5 + L * 0.5)) * amp
          + Math.sin(x * 0.008 - t * (0.8 + L * 0.3)) * amp * 0.5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexA(col, 0.55 - L * 0.16);
      ctx.lineWidth = 1.6 - L * 0.4;
      ctx.stroke();
    }
  }
  function vizRidge(ctx, w, h, col) {
    var t = viz.t, lv = viz.level;
    for (var L = 0; L < 4; L++) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      var base = h * (0.52 + L * 0.13);
      var amp = h * (0.1 + 0.1 * lv) * (1 - L * 0.16);
      for (var x = 0; x <= w; x += 4) {
        var y = base
          - Math.abs(Math.sin(x * 0.012 + t * (0.5 + L * 0.22) + L * 2.1)) * amp
          - Math.abs(Math.sin(x * 0.031 - t * 0.4 + L)) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = hexA(col, 0.16 + L * 0.09);
      ctx.fill();
    }
  }
  function vizRipples(ctx, w, h, col) {
    var t = viz.t, lv = viz.level;
    var cx = w / 2, cy = h * 0.55;
    for (var i = 0; i < 6; i++) {
      var r = ((t * (14 + 10 * lv) + i * 26) % 156);
      if (r < 2) continue;
      var a = Math.max(0, 0.5 * (1 - r / 156));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(col, a);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 3 + lv * 3, 0, Math.PI * 2);
    ctx.fillStyle = hexA(col, 0.8);
    ctx.fill();
  }
  function vizStars(ctx, w, h, col) {
    var t = viz.t, lv = viz.level;
    for (var i = 0; i < 42; i++) {
      var seed = i * 127.3;
      var x = (Math.sin(seed) * 0.5 + 0.5) * w;
      var y = (Math.sin(seed * 1.7) * 0.5 + 0.5) * h * 0.86;
      var tw = 0.5 + 0.5 * Math.sin(t * (0.6 + (i % 5) * 0.24) + seed);
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + tw * 1.4 * (0.6 + lv * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = hexA(col, 0.16 + tw * 0.5);
      ctx.fill();
    }
    var sx = ((t * 26) % (w + 120)) - 60;
    var sy = h * 0.3 + Math.sin(t * 0.8) * 8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 34, sy - 10);
    ctx.strokeStyle = hexA(col, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ===== 视图切换 ===== */
  function showView(name) {
    currentView = name;
    var map = { home: viewHome, live: viewLive, archive: viewArchive, detail: viewDetail, mail: viewMail };
    for (var k in map) {
      if (!map[k]) continue;
      map[k].classList.toggle("active", k === name);
    }
    backBtn.style.visibility = name === "home" ? "hidden" : "visible";
    var st = pb.station || findStation(liveStationId);
    if (name === "live" && st) titleEl.textContent = "FM " + st.freq;
    else if (name === "archive" || name === "detail") titleEl.textContent = "历期节目";
    else if (name === "mail") titleEl.textContent = "听众来信";
    else titleEl.textContent = "MIDNIGHT FM";
    if (name !== "live") vizStop();
  }

  /* ===== 调频刻度盘 ===== */
  function freqPct(freq) {
    var f = parseFloat(freq);
    return Math.max(2, Math.min(98, (f - 87) / (106 - 87) * 100));
  }
  function renderDial() {
    var html = '<div class="mn-dial"><div class="mn-dial-scale">';
    for (var f = 88; f <= 106; f += 2) {
      var isStation = STATIONS.some(function (s) { return Math.abs(parseFloat(s.freq) - f) < 0.5 && !(s.hidden && !isPillowUnlocked()); });
      html += '<span class="mn-tick' + (isStation ? " mn-tick-station" : "") + '" style="left:' + freqPct(f) + '%"><i></i><b>' + f + '</b></span>';
    }
    var tuned = findStation(liveStationId);
    var nf = tuned ? tuned.freq : "96.0";
    html += '</div><div class="mn-dial-needle" style="left:' + freqPct(nf) + '%"></div></div>';
    return html;
  }

  /* ===== 首页 ===== */
  function renderHome() {
    var unlocked = isPillowUnlocked();
    var html = '<div class="mn-masthead">' +
        '<div class="mn-masthead-latin">MIDNIGHT FM</div>' +
        '<h1 class="mn-masthead-title">深夜电台</h1>' +
        '<p class="mn-masthead-sub">一台只放给一个人听的电台。</p>' +
        '<p class="mn-masthead-date">' + dateLabel() + '</p>' +
      '</div>' +
      renderDial() +
      '<div class="mn-stations">';
    STATIONS.forEach(function (st) {
      if (st.hidden && !unlocked) return;
      var playing = pb.active && pb.station && pb.station.id === st.id;
      html += '<div class="mn-station-card mn-glass' + (playing ? ' mn-playing-station' : '') + '" data-st="' + st.id + '">' +
          '<div class="mn-station-freq">FM ' + st.freq + '</div>' +
          '<div class="mn-station-name">' + esc(st.name) +
            (playing ? '<span class="mn-onair-badge"><span class="mn-onair-dot"></span>ON AIR</span><span class="mn-station-wave"><i></i><i></i><i></i><i></i></span>' : '') +
          '</div>' +
          '<div class="mn-station-tag">' + esc(st.tag) + '</div>' +
        '</div>';
    });
    if (!unlocked) {
      html += '<div class="mn-station-card mn-glass mn-mystery" id="mn-mystery-card">' +
          '<div class="mn-mystery-freq">FM ▒▒.▒</div>' +
          '<div class="mn-mystery-name">▒▒▒</div>' +
          '<div class="mn-mystery-hint">这个频段有点杂音，试试长按</div>' +
        '</div>';
    }
    html += '</div>';

    var arch = loadArchive();
    var letters = loadLetters();
    var unread = letters.filter(function (l) { return !l.aired; }).length;
    html += '<div class="mn-home-rows">' +
        '<div class="mn-row mn-glass" id="mn-archive-entry">' +
          '<span class="mn-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#141417" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></span>' +
          '<div class="mn-row-body">' +
            '<div class="mn-row-title">历期节目</div>' +
            '<div class="mn-row-sub">' + (arch.length ? "存了 " + arch.length + " 晚的节目" : "还没有存档") + '</div>' +
          '</div><span class="mn-row-arrow">›</span>' +
        '</div>' +
        '<div class="mn-row mn-glass" id="mn-mail-entry">' +
          '<span class="mn-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#141417" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/></svg></span>' +
          '<div class="mn-row-body">' +
            '<div class="mn-row-title">听众来信</div>' +
            '<div class="mn-row-sub">' + (unread ? unread + " 封还没念" : (letters.length ? "信都念过了" : "信箱是空的")) + '</div>' +
          '</div>' +
          (unread ? '<span class="mn-row-badge">' + unread + '</span>' : '') +
          '<span class="mn-row-arrow">›</span>' +
        '</div>' +
      '</div>';
    viewHome.innerHTML = html;

    Array.prototype.forEach.call(viewHome.querySelectorAll("[data-st]"), function (card) {
      card.addEventListener("click", function () { openLiveStation(card.getAttribute("data-st")); });
    });
    var mystery = $("mn-mystery-card");
    if (mystery) bindMystery(mystery);
    $("mn-archive-entry").addEventListener("click", function () {
      renderArchiveList();
      showView("archive");
    });
    $("mn-mail-entry").addEventListener("click", function () {
      renderMail();
      showView("mail");
    });
  }

  function bindMystery(el) {
    var timer = null;
    var start = function (e) {
      if (e.cancelable) e.preventDefault();
      timer = setTimeout(function () {
        timer = null;
        try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
        toast("调频成功——枕話台出现了");
        renderHome();
      }, 1200);
    };
    var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchmove", cancel);
    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup", cancel);
    el.addEventListener("mouseleave", cancel);
    el.addEventListener("click", function () { if (!timer) toast("长按这个频段试试"); });
  }

  function openLiveStation(id) {
    var st = findStation(id);
    if (!st) return;
    if (pb.active && pb.station && pb.station.id !== st.id) {
      toast("正在播「" + pb.station.name + "」，先停止再换台");
      return;
    }
    liveStationId = st.id;
    renderLive();
    showView("live");
  }

  /* ===== 直播页（深色小屏） ===== */
  function screenHtml(st) {
    var body = "";
    if (pb.active && pb.station && pb.station.id === st.id && pb.phase === "playing") {
      body = '<div class="mn-screen-label" id="mn-now-label"></div>' +
        '<div id="mn-now-body"></div>' +
        '<div class="mn-song-progress" id="mn-song-progress" style="display:none"><i id="mn-song-bar-fill"></i></div>';
    } else if (pb.active && pb.station && pb.station.id === st.id && (pb.phase === "generating" || pb.phase === "resolving")) {
      var tip = pb.phase === "generating" ? "主播正在准备今晚的节目" : "正在把今晚的歌找出来";
      body = '<div class="mn-screen-gen"><span class="mn-spin"></span>' + tip + '</div>';
    } else if (pb.active && pb.station && pb.station.id === st.id && pb.phase === "done") {
      body = '<div class="mn-screen-idle">节目结束</div>';
    } else {
      body = '<div class="mn-screen-idle">这里只有沙沙声。</div>';
    }
    return '<div class="mn-screen"><canvas class="mn-viz" id="mn-viz"></canvas><div class="mn-screen-body">' + body + '</div></div>';
  }

  function renderLive() {
    var st = pb.station || findStation(liveStationId);
    if (!st) { showView("home"); return; }
    var head = '<div class="mn-live-head">' +
        '<div class="mn-live-freq"><small>FM</small>' + st.freq + '</div>' +
        '<div class="mn-live-name">' + esc(st.name) + '</div>' +
        '<div class="mn-live-status" id="mn-live-status"></div>' +
      '</div>';
    var below = "";
    if (pb.active && pb.station && pb.station.id === st.id) {
      if (pb.phase === "generating" || pb.phase === "resolving") {
        below = '<div class="mn-live-controls"><button class="mn-ctl-btn mn-stop" id="mn-stop-btn">不听了</button></div>';
      } else if (pb.phase === "playing") {
        below = '<div class="mn-queue"><div class="mn-queue-title">今晚节目单</div><div class="mn-queue-list" id="mn-queue-list"></div></div>' +
          '<div class="mn-live-controls">' +
            '<button class="mn-ctl-btn" id="mn-speed-btn">倍速 ' + (pb.rate || 1) + '×</button>' +
            '<button class="mn-ctl-btn" id="mn-skip-btn">跳过</button>' +
            '<button class="mn-ctl-btn mn-stop" id="mn-stop-btn">不听了</button>' +
          '</div>';
      } else if (pb.phase === "done") {
        below = '<div class="mn-live-tip">今晚的节目到这里。<br>晚安，' + esc(callName()) + '。</div>' +
          '<div class="mn-live-controls">' +
            '<button class="mn-ctl-btn mn-primary" id="mn-again-btn">再来一晚</button>' +
            '<button class="mn-ctl-btn" id="mn-back-home-btn">回去</button>' +
          '</div>';
      } else if (pb.phase === "error") {
        below = '<div class="mn-live-tip">' + esc(pb.errorMsg || "出错了") + '</div>' +
          '<div class="mn-live-controls">' +
            '<button class="mn-ctl-btn mn-primary" id="mn-again-btn">再试一次</button>' +
            '<button class="mn-ctl-btn" id="mn-back-home-btn">回去</button>' +
          '</div>';
      } else {
        below = startButtonHtml();
      }
    } else {
      below = startButtonHtml();
    }
    viewLive.innerHTML = head + screenHtml(st) + below;

    var canvas = $("mn-viz");
    if (canvas) vizStart(canvas, st);

    var stopBtn = $("mn-stop-btn");
    if (stopBtn) stopBtn.addEventListener("click", stopBroadcast);
    var skipBtn = $("mn-skip-btn");
    if (skipBtn) skipBtn.addEventListener("click", skipSegment);
    var speedBtn = $("mn-speed-btn");
    if (speedBtn) speedBtn.addEventListener("click", cycleSpeed);
    var startBtn = $("mn-start-btn");
    if (startBtn) startBtn.addEventListener("click", function () { runBroadcast(st); });
    var againBtn = $("mn-again-btn");
    if (againBtn) againBtn.addEventListener("click", function () { runBroadcast(st); });
    var backHomeBtn = $("mn-back-home-btn");
    if (backHomeBtn) backHomeBtn.addEventListener("click", function () { showView("home"); renderHome(); });

    if (pb.phase === "playing") {
      renderQueueList();
      updateQueueUI();
      var cur = pb.queue[pb.idx];
      if (cur) {
        if (cur.type === "song") showSongCard(cur.song);
        else if (cur.type === "speech") showSubtitle(cur.text);
      }
    }
    setStatusText(st);
  }
  function startButtonHtml() {
    return '<div class="mn-live-controls"><button class="mn-ctl-btn mn-primary" id="mn-start-btn">打开收音机</button></div>';
  }
  function setStatusText(st) {
    var el = $("mn-live-status");
    if (!el) return;
    var sameStation = st && pb.station && st.id === pb.station.id;
    var html = "这个台现在没在播。";
    var isErr = false;
    if (sameStation && pb.phase === "error") {
      html = esc(pb.errorMsg || "出错了");
      isErr = true;
    } else if (sameStation && pb.phase === "done") {
      html = "节目结束 · " + clockLabel();
    } else if (pb.active && sameStation) {
      var tag = pb.phase === "generating" ? "备稿中" : (pb.phase === "resolving" ? "找歌中" : "直播中");
      html = '<span class="mn-onair-dot"></span>ON AIR · ' + tag;
    }
    el.innerHTML = html;
    el.classList.toggle("mn-error", isErr);
  }

  function renderQueueList() {
    var el = $("mn-queue-list");
    if (!el) return;
    var html = "";
    pb.queue.forEach(function (seg, i) {
      var icon = "▍", text = "";
      if (seg.type === "speech") { icon = "▍"; text = seg.text.split("\n")[0]; }
      else if (seg.type === "song") { icon = "♪"; text = seg.song.title + " - " + seg.song.artist; }
      else if (seg.type === "bgm") { icon = "〜"; text = "垫乐"; }
      else if (seg.type === "se") { icon = "✧"; text = "音效：" + seg.name; }
      else if (seg.type === "pause") { icon = "···"; text = "停顿"; }
      html += '<div class="mn-queue-item mn-glass" data-qi="' + i + '">' +
          '<span class="mn-queue-icon">' + esc(icon) + '</span>' +
          '<span class="mn-queue-text">' + esc(text) + '</span>' +
        '</div>';
    });
    el.innerHTML = html;
  }
  function updateQueueUI() {
    var el = $("mn-queue-list");
    if (!el) return;
    var items = el.querySelectorAll(".mn-queue-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("mn-cur", i === pb.idx);
      items[i].classList.toggle("mn-done", i < pb.idx);
    }
  }
  function showSubtitle(text) {
    var label = $("mn-now-label");
    var body = $("mn-now-body");
    var bar = $("mn-song-progress");
    if (bar) bar.style.display = "none";
    if (!label || !body) return;
    label.textContent = "主播";
    body.innerHTML = '<div class="mn-nowcard-speech">' + esc(text) + '</div>';
    var sp = body.querySelector(".mn-nowcard-speech");
    if (sp) sp.scrollTop = sp.scrollHeight;
    vizBump();
  }
  function showSongCard(song) {
    var label = $("mn-now-label");
    var body = $("mn-now-body");
    var bar = $("mn-song-progress");
    if (!label || !body) return;
    label.textContent = "现在播放";
    body.innerHTML = '<div class="mn-nowcard-song">' +
        '<img class="mn-nowcard-cover" src="' + esc(song.cover) + '" onerror="this.style.visibility=\'hidden\'" alt="">' +
        '<div class="mn-nowcard-songinfo">' +
          '<div class="mn-nowcard-songtitle">' + esc(song.title) + '</div>' +
          '<div class="mn-nowcard-songartist">' + esc(song.artist) + '</div>' +
        '</div>' +
        '<div class="mn-eq"><i></i><i></i><i></i><i></i></div>' +
      '</div>';
    if (bar) { bar.style.display = "block"; var fill = $("mn-song-bar-fill"); if (fill) { fill.style.width = ""; fill.classList.add("mn-indet"); } }
    vizBump();
  }

  /* ===== 历期节目 ===== */
  function renderArchiveList() {
    var list = loadArchive();
    var html = '<h2 class="mn-page-title">历期节目</h2>' +
      '<p class="mn-page-sub">每一晚都留了底。</p><div class="mn-ep-list">';
    if (!list.length) {
      html = '<h2 class="mn-page-title">历期节目</h2>' +
        '<p class="mn-page-sub">每一晚都留了底。</p>' +
        '<div class="mn-empty-tip">还没有存档。<br>听一晚，这里就会留下记录。</div>';
    } else {
      list.forEach(function (entry, i) {
        var d = new Date(entry.ts);
        var meta = (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) +
          " · " + esc(entry.stationName) + " FM " + esc(entry.freq) +
          (entry.segs ? " · " + entry.segs + " 段" : "") +
          (entry.songs && entry.songs.length ? " · " + entry.songs.length + " 首歌" : "") +
          (entry.complete ? "" : ' · <span class="mn-ep-flag">未播完</span>');
        html += '<div class="mn-ep-item mn-glass" data-ai="' + i + '">' +
            '<div class="mn-ep-no">' + (entry.no ? "第 " + entry.no + " 期" : "往期") + '</div>' +
            '<div class="mn-ep-title">' + esc(entry.title) + '</div>' +
            '<div class="mn-ep-meta">' + meta + '</div>' +
          '</div>';
      });
    }
    html += '</div>';
    viewArchive.innerHTML = html;
    Array.prototype.forEach.call(viewArchive.querySelectorAll("[data-ai]"), function (item) {
      item.addEventListener("click", function () {
        var idx = Number(item.getAttribute("data-ai"));
        var entry = loadArchive()[idx];
        if (entry) { renderDetail(entry); showView("detail"); }
      });
    });
  }

  function renderDetail(entry) {
    var d = new Date(entry.ts);
    var meta = (entry.no ? "第 " + entry.no + " 期 · " : "") +
      (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) +
      " · " + esc(entry.stationName) + " FM " + esc(entry.freq) +
      (entry.complete ? "" : " · 未播完");
    var songsHtml = "";
    if (entry.songs && entry.songs.length) {
      songsHtml = '<div class="mn-detail-label">今晚放了这些歌</div><div class="mn-detail-songs mn-glass">';
      entry.songs.forEach(function (s, i) {
        songsHtml += '<div class="mn-detail-songrow">' +
            '<span class="mn-detail-songidx">' + pad2(i + 1) + '</span>' +
            '<span>' + esc(s.title) + '</span>' +
            '<span class="mn-detail-songartist">' + esc(s.artist) + '</span>' +
          '</div>';
      });
      songsHtml += '</div>';
    }
    var lettersHtml = "";
    if (entry.letters && entry.letters.length) {
      lettersHtml = '<div class="mn-detail-label">今晚念了的信</div><div class="mn-detail-letters">';
      entry.letters.forEach(function (l) {
        lettersHtml += '<div class="mn-letter-card mn-glass">' +
            '<div class="mn-letter-head"><span class="mn-letter-avatar">' + esc((l.charName || "?").slice(0, 1)) + '</span><span class="mn-letter-name">' + esc(l.charName) + '</span></div>' +
            '<div class="mn-letter-text">' + esc(l.text) + '</div>' +
          '</div>';
      });
      lettersHtml += '</div>';
    }
    viewDetail.innerHTML = '<div class="mn-detail-head">' +
        '<div class="mn-detail-title">' + esc(entry.title) + '</div>' +
        '<div class="mn-detail-meta">' + meta + '</div>' +
      '</div>' +
      songsHtml +
      lettersHtml +
      (entry.script ? '<div class="mn-detail-label">文稿</div><div class="mn-detail-script mn-glass">' + esc(entry.script) + '</div>' : '');
  }

  /* ===== 听众来信 ===== */
  function renderMail() {
    var letters = loadLetters().sort(function (a, b) { return b.ts - a.ts; });
    var html = '<h2 class="mn-page-title">听众来信</h2>' +
      '<p class="mn-page-sub">角色们写来的信，主播会在节目里念。</p>' +
      '<div class="mn-mail-compose mn-glass" id="mn-mail-compose">' +
        '<span class="mn-mail-compose-icon">✎</span>' +
        '<div class="mn-row-body">' +
          '<div class="mn-mail-compose-title">请角色写一封信</div>' +
          '<div class="mn-mail-compose-sub">挑一个人，替 TA 把信寄到电台</div>' +
        '</div>' +
      '</div>';
    if (!letters.length) {
      html += '<div class="mn-empty-tip">信箱是空的。<br>第一封信，从上面寄出。</div>';
    } else {
      html += '<div class="mn-ep-list">';
      letters.forEach(function (l, i) {
        var d = new Date(l.ts);
        html += '<div class="mn-letter-card mn-glass">' +
            '<div class="mn-letter-head">' +
              '<span class="mn-letter-avatar">' + esc((l.charName || "?").slice(0, 1)) + '</span>' +
              '<span class="mn-letter-name">' + esc(l.charName) + '</span>' +
              '<span class="mn-letter-aired">' + (l.aired ? "电台已读过" : "还没念") + '</span>' +
            '</div>' +
            '<div class="mn-letter-text">' + esc(l.text) + '</div>' +
            '<div class="mn-ep-meta" style="margin-top:8px">' + (d.getMonth() + 1) + "月" + d.getDate() + "日</div>" +
          '</div>';
      });
      html += '</div>';
    }
    viewMail.innerHTML = html;
    $("mn-mail-compose").addEventListener("click", openLetterCompose);
  }

  function openLetterCompose() {
    var chars = (window.db && window.db.characters) || [];
    if (!chars.length) { toast("还没有角色，先去聊天里创建一个"); return; }
    var opts = "";
    chars.forEach(function (c) {
      if (!c || !c.id || !c.name) return;
      opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    });
    var html = '<div class="mn-modal-title">请谁写信？</div>' +
      '<div class="mn-form-row"><label class="mn-form-label">写信的角色</label>' +
        '<select class="mn-form-select" id="mn-mail-char">' + opts + '</select></div>' +
      '<div class="mn-form-row"><label class="mn-form-label">想让 TA 聊点什么（可不填）</label>' +
        '<input class="mn-form-input" id="mn-mail-topic" placeholder="例如：最近在听的歌"></div>' +
      '<div class="mn-modal-btns">' +
        '<button class="mn-modal-btn" id="mn-mail-cancel">取消</button>' +
        '<button class="mn-modal-btn mn-confirm" id="mn-mail-go">写好寄出</button>' +
      '</div>';
    showModal(html);
    $("mn-mail-cancel").addEventListener("click", closeModal);
    $("mn-mail-go").addEventListener("click", async function () {
      var btn = $("mn-mail-go");
      var charId = $("mn-mail-char").value;
      var topic = $("mn-mail-topic").value.trim();
      var c = (window.db && window.db.characters || []).find(function (x) { return x && x.id === charId; });
      if (!c) return;
      btn.disabled = true;
      btn.textContent = "写中……";
      try {
        var up = "现在请直接写下这封信。" + (topic ? "可以围绕这个话题：「" + topic + "」。" : "");
        var text = (await llmChat(letterSystemPrompt(c.name), up)).trim();
        if (!text) throw new Error("没写成，再试一次");
        var list = loadLetters();
        list.push({ id: "lt" + Date.now(), charId: c.id, charName: c.name, text: text, ts: Date.now(), aired: false });
        saveLetters(list);
        closeModal();
        toast("信寄到了电台");
        renderMail();
        renderHome();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "写好寄出";
        toast((e && e.message) || "写信失败了");
      }
    });
  }

  /* ===== 弹窗 ===== */
  function closeModal() {
    var host = $("mn-modals");
    if (!host) return;
    var mask = host.querySelector(".mn-modal-mask");
    var sheet = host.querySelector(".mn-modal-sheet");
    if (mask) mask.classList.remove("show");
    if (sheet) sheet.classList.remove("show");
    setTimeout(function () { host.innerHTML = ""; }, 240);
  }
  function showModal(html) {
    var host = $("mn-modals");
    if (!host) return;
    host.innerHTML = '<div class="mn-modal-mask"></div><div class="mn-modal-sheet">' + html + '</div>';
    var mask = host.querySelector(".mn-modal-mask");
    mask.addEventListener("click", closeModal);
    requestAnimationFrame(function () {
      mask.classList.add("show");
      host.querySelector(".mn-modal-sheet").classList.add("show");
    });
  }

  function openSettings() {
    var chars = (window.db && window.db.characters) || [];
    var opts = '<option value="">默认（跟随语音设置）</option>';
    chars.forEach(function (c) {
      if (!c || !c.id || !c.name) return;
      opts += '<option value="' + esc(c.id) + '"' + (cfg.hostCharId === c.id ? " selected" : "") + '>' + esc(c.name) + '</option>';
    });
    var html = '<div class="mn-modal-title">电台设置</div>' +
      '<div class="mn-form-row"><label class="mn-form-label">主播声音（选一个角色，用 TA 的音色和引擎）</label>' +
        '<select class="mn-form-select" id="mn-set-host">' + opts + '</select></div>' +
      '<div class="mn-form-row"><label class="mn-form-label">主播怎么称呼你（留空就用「你」）</label>' +
        '<input class="mn-form-input" id="mn-set-call" value="' + esc(cfg.callName) + '" placeholder="例如：笨蛋 / 宝宝 / 老婆"></div>' +
      '<div class="mn-form-row"><div class="mn-form-toggle" id="mn-set-comments">' +
        '<div><div class="mn-form-toggle-text">放歌前念网易云热评</div><div class="mn-form-toggle-sub">抓不到热评就自动跳过</div></div>' +
        '<div class="mn-switch' + (cfg.readComments ? " on" : "") + '" id="mn-set-comments-sw"></div>' +
      '</div></div>' +
      '<div class="mn-form-row"><label class="mn-form-label">垫乐音量 <span id="mn-set-bgmval">' + Math.round((Number(cfg.bgmVol) || 0.14) * 100) + '%</span></label>' +
        '<input type="range" class="mn-form-range" id="mn-set-bgm" min="0" max="0.3" step="0.01" value="' + (Number(cfg.bgmVol) || 0.14) + '"></div>' +
      '<div class="mn-modal-btns">' +
        '<button class="mn-modal-btn" id="mn-set-cancel">取消</button>' +
        '<button class="mn-modal-btn mn-confirm" id="mn-set-save">保存</button>' +
      '</div>';
    showModal(html);
    $("mn-set-bgm").addEventListener("input", function () {
      $("mn-set-bgmval").textContent = Math.round(this.value * 100) + "%";
    });
    $("mn-set-comments").addEventListener("click", function (e) {
      e.preventDefault();
      var sw = $("mn-set-comments-sw");
      sw.classList.toggle("on");
    });
    $("mn-set-cancel").addEventListener("click", closeModal);
    $("mn-set-save").addEventListener("click", function () {
      cfg.hostCharId = $("mn-set-host").value;
      cfg.callName = $("mn-set-call").value.trim();
      cfg.readComments = $("mn-set-comments-sw").classList.contains("on");
      cfg.bgmVol = Number($("mn-set-bgm").value) || 0.14;
      saveCfgObj();
      closeModal();
      toast("设置已保存");
      if (currentView === "live") renderLive();
    });
  }

  /* ===== 初始化 ===== */
  function init() {
    viewHome = $("mn-view-home");
    viewLive = $("mn-view-live");
    viewArchive = $("mn-view-archive");
    viewDetail = $("mn-view-detail");
    viewMail = $("mn-view-mail");
    backBtn = $("mn-back-btn");
    titleEl = $("mn-topbar-title");
    if (!viewHome) return;

    backBtn.addEventListener("click", function () {
      if (currentView === "detail") { renderArchiveList(); showView("archive"); }
      else { showView("home"); renderHome(); }
    });
    $("mn-gear-btn").addEventListener("click", openSettings);
    renderHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.MidnightFM = { stopBroadcast: stopBroadcast, skipSegment: skipSegment, runBroadcast: runBroadcast, findStation: findStation, cycleSpeed: cycleSpeed,
    state: function () { return { active: pb.active, phase: pb.phase, idx: pb.idx, queueLen: pb.queue.length, played: pb.played.length, hasBgm: !!pb.bgmAudio, title: pb.title, rate: pb.rate }; } };
})();
