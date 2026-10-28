/**
 * native-bridge.js — 章鱼喷墨机 原生壳桥接层
 * 只在 Capacitor 原生环境里生效；浏览器/PWA 下直接 return，零影响。
 *
 * 提供：
 *   window.OctoNative.ready()            是否原生环境
 *   window.OctoNative.notify({...})      立刻发一条本地通知
 *   window.OctoNative.request()          请求通知权限
 *   window.OctoNative.test()             5 秒后发一条测试通知（方便验证）
 *   window.OctoNative.onCall(...)        来电时弹系统通知（已自动挂到接听流程）
 *   window.OctoNative.replan()           重排「主动消息」预排通知
 *   window.OctoNative.planInfo()         查看当前预排情况（排查用）
 *
 * 三块能力：
 *   1) 来电通知：VideoCallModule.receiveCall 在后台时弹通知（ring.wav）
 *   2) 新消息通知：getAiReply 结束后，App 不在前台就弹一条消息预览
 *   3) 主动消息预排：按角色 autoReply 设置，把未来 24h 的「她来找你」排进系统队列，
 *      App 被杀、手机重启也会准时弹（本地通知由系统队列负责），代价是文案为预生成
 */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
    return;
  }

  var Plugins = Cap.Plugins || {};
  var LN = Plugins.LocalNotifications;
  var AppPlugin = Plugins.App;

  var CALL_ID_BASE = 72000;     // 来电通知 id 段
  var MSG_ID_BASE = 76000;      // 新消息通知 id 段
  var PLAN_ID_BASE = 81000;     // 预排计划 id 段
  var PLAN_STORE = 'octo_plan_v2';
  var MAX_PER_CHAR = 8;         // 每个角色最多预排几条（iOS 单 App 待发上限 64 条）

  var nextId = 0;
  var ringId = 0;
  var granted = false;
  var asked = false;

  function rid() {
    nextId = (nextId + 1) % 900;
    return MSG_ID_BASE + nextId;
  }

  function ensurePermission() {
    if (!LN) return Promise.resolve(false);
    if (granted) return Promise.resolve(true);
    return LN.checkPermissions()
      .then(function (r) {
        if (r.display === 'granted') { granted = true; return true; }
        if (asked) return false;
        asked = true;
        return LN.requestPermissions().then(function (r2) {
          granted = r2.display === 'granted';
          return granted;
        });
      })
      .catch(function () { return false; });
  }

  /**
   * @param {object} o { title, body, id, sound, extra, delay(秒) }
   *   sound: false = 系统默认提示音；字符串 = www/ 下的音频文件名
   */
  function notify(o) {
    if (!LN) return Promise.resolve(null);
    o = o || {};
    return ensurePermission().then(function (ok) {
      if (!ok) return null;
      var when = new Date(Date.now() + Math.max(0.2, o.delay || 0.2) * 1000);
      var n = {
        id: o.id || rid(),
        title: o.title || '章鱼喷墨机',
        body: o.body || '',
        schedule: { at: when },
        extra: o.extra || null
      };
      if (o.sound === false) {
        // 不指定 sound → 系统默认提示音
      } else if (typeof o.sound === 'string') {
        n.sound = o.sound;
      } else {
        n.sound = 'ring.wav';
      }
      return LN.schedule({ notifications: [n] }).then(function () { return n.id; })
        .catch(function (e) { console.warn('[OctoNative] 通知失败', e); return null; });
    });
  }

  function cancel(id) {
    if (!LN || id == null) return Promise.resolve();
    return LN.cancel({ notifications: [{ id: id }] }).catch(function () {});
  }

  function cancelMany(ids) {
    if (!LN || !ids || !ids.length) return Promise.resolve();
    var list = ids.filter(function (x) { return typeof x === 'number'; })
      .map(function (x) { return { id: x }; });
    if (!list.length) return Promise.resolve();
    return LN.cancel({ notifications: list }).catch(function () {});
  }

  // ---------------- 基础工具 ----------------

  function charById(id) {
    var d = window.db;
    if (!d || !Array.isArray(d.characters)) return null;
    for (var i = 0; i < d.characters.length; i++) {
      if (String(d.characters[i].id) === String(id)) return d.characters[i];
    }
    return null;
  }

  function charName(c) {
    return (c && (c.remarkName || c.name || c.realName)) || '她';
  }

  function msgText(m) {
    if (!m) return '';
    var c = m.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c.map(function (p) { return (p && (p.text || '')) || ''; }).join(' ');
    }
    if (Array.isArray(m.parts)) {
      return m.parts.map(function (p) { return (p && (p.text || '')) || ''; }).join(' ');
    }
    return '';
  }

  function cleanText(s, max) {
    s = String(s || '');
    var wrapped = s.match(/^\s*\[[^\]\n]{0,24}的消息：([\s\S]*)\]\s*$/);
    if (wrapped) s = wrapped[1];
    s = s.replace(/\[[^\]\n]*\]/g, ' ');
    s = s.replace(/<[^>]*>/g, ' ');
    s = s.replace(/[*_`#>~]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (max && s.length > max) s = s.slice(0, max - 1) + '…';
    return s;
  }

  function dbReady() {
    return !!(window.db && Array.isArray(window.db.characters) && window.db.characters.length > 0);
  }

  function whenDbReady(cb, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 12000);
    var timer = setInterval(function () {
      if (dbReady()) {
        clearInterval(timer);
        try { cb(); } catch (e) { console.warn(e); }
        return;
      }
      if (Date.now() > deadline) clearInterval(timer);
    }, 250);
  }

  // ---------------- 1) 来电通知 ----------------

  function hookCall() {
    var vc = null;
    try { vc = (typeof VideoCallModule !== 'undefined') ? VideoCallModule : window.VideoCallModule; } catch (e) { vc = null; }
    if (!vc || typeof vc.receiveCall !== 'function' || vc.__octoHooked) return false;
    vc.__octoHooked = true;

    var origReceive = vc.receiveCall.bind(vc);
    var origAccept = typeof vc.acceptCall === 'function' ? vc.acceptCall.bind(vc) : null;
    var origReject = typeof vc.rejectCall === 'function' ? vc.rejectCall.bind(vc) : null;

    vc.receiveCall = function (type, chatId) {
      var ret = origReceive(type, chatId);
      try {
        if (document.hidden || document.visibilityState === 'hidden') {
          onCall(type, chatId);
        }
      } catch (e) { /* 通知失败不影响来电本身 */ }
      return ret;
    };

    if (origAccept) {
      vc.acceptCall = function () {
        cancel(ringId); ringId = 0;
        return origAccept();
      };
    }
    if (origReject) {
      vc.rejectCall = function () {
        cancel(ringId); ringId = 0;
        return origReject();
      };
    }
    console.log('[OctoNative] 已挂上来电通知');
    return true;
  }

  function onCall(type, chatId) {
    var c = charById(chatId);
    var name = charName(c);
    var isVideo = type === 'video';
    return notify({
      title: isVideo ? '视频通话邀请' : '语音通话邀请',
      body: name + (isVideo ? ' 想和你视频通话…' : ' 想和你语音通话…'),
      id: CALL_ID_BASE - 1,
      sound: 'ring.wav',
      extra: { kind: 'incoming-call', callType: type, chatId: String(chatId) }
    }).then(function (id) {
      ringId = id;
      return id;
    });
  }

  // ---------------- 2) 新消息通知 ----------------

  function hookReply() {
    if (typeof window.getAiReply !== 'function' || window.getAiReply.__octoHooked) return false;
    var orig = window.getAiReply;

    var wrapped = function (chatId, chatType) {
      var since = Date.now();
      var ret = orig.apply(this, arguments);
      if (ret && typeof ret.then === 'function') {
        return ret.then(function (v) {
          try { afterReply(chatId, chatType, since); } catch (e) { console.warn(e); }
          return v;
        }, function (err) {
          try { afterReply(chatId, chatType, since); } catch (e2) { /* ignore */ }
          throw err;
        });
      }
      try { afterReply(chatId, chatType, since); } catch (e) { /* ignore */ }
      return ret;
    };

    wrapped.__octoHooked = true;
    window.getAiReply = wrapped;
    console.log('[OctoNative] 已挂上新消息通知');
    return true;
  }

  function afterReply(chatId, chatType, since) {
    if (!document.hidden) return;             // 前台不打扰，界面上已经看到了

    var chat;
    if (chatType === 'group') {
      var groups = (window.db && window.db.groups) || [];
      for (var g = 0; g < groups.length; g++) {
        if (String(groups[g].id) === String(chatId)) { chat = groups[g]; break; }
      }
    } else {
      chat = charById(chatId);
    }
    if (!chat || !Array.isArray(chat.history) || !chat.history.length) return;

    var last = null;
    for (var i = chat.history.length - 1; i >= 0; i--) {
      var m = chat.history[i];
      if (m && m.role === 'assistant' && (m.timestamp || 0) >= since) { last = m; break; }
    }
    if (!last) return;

    var text = cleanText(msgText(last), 90);
    if (!text) return;

    notify({
      title: charName(chat),
      body: text,
      sound: false,
      extra: { kind: 'chat', chatId: String(chatId), chatType: chatType || 'private' }
    });

    // 她刚真的说话了，后面的「突然想你」往后挪
    if (chatType !== 'group') replanChar(chat, true);
  }

  // ---------------- 3) 主动消息预排 ----------------

  var LINES = {
    morning: [
      '醒了吗？今天别把自己搞太累。',
      '早安，我刚醒就想到你了。',
      '起床了没，记得吃点东西。',
      '今天出门记得穿件外套。'
    ],
    noon: [
      '中午了，吃饭了吗？',
      '在忙什么呀，突然想跟你说句话。',
      '刚吃完，顺手问问你吃了没。',
      '下午会不会很忙？别硬撑。'
    ],
    afternoon: [
      '忙完了吗？我这边有点安静。',
      '刚看到个东西，觉得你会喜欢。',
      '摸鱼中，想你一下。',
      '今天过得怎么样，说给我听听。'
    ],
    evening: [
      '下班了吗？今天累不累。',
      '晚上有什么安排？',
      '刚吃完饭，突然很想你。',
      '想听你说说今天的事。'
    ],
    night: [
      '还没睡？',
      '睡不着就跟我说说话。',
      '今天最后一句话，留给你。',
      '晚安，做个好梦。'
    ],
    any: [
      '在吗？',
      '突然想你了。',
      '有空的时候回我一句。'
    ]
  };

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function lineFor(char, ts, prev) {
    var d = new Date(ts);
    var h = d.getHours() + d.getMinutes() / 60;
    var bucket = (h >= 5 && h < 11) ? 'morning'
      : (h >= 11 && h < 14) ? 'noon'
        : (h >= 14 && h < 18) ? 'afternoon'
          : (h >= 18 && h < 23) ? 'evening'
            : 'night';
    var pool = LINES[bucket].concat(LINES.any);
    var idx = hash(String(char.id) + '|' + ts) % pool.length;
    if (prev && pool[idx] === prev) idx = (idx + 1) % pool.length;   // 别连着说同一句
    return pool[idx];
  }

  function isQuiet(ts) {
    var d = new Date(ts);
    var h = d.getHours() + d.getMinutes() / 60;
    return (h >= 23.5 || h < 7.5);   // 深夜不吵人
  }

  function charIndex(char) {
    var list = (window.db && window.db.characters) || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(char.id)) return i;
    }
    return 0;
  }

  function planIdsFor(char) {
    var base = PLAN_ID_BASE + Math.min(charIndex(char), 11) * 10;
    var ids = [];
    for (var i = 0; i < MAX_PER_CHAR; i++) ids.push(base + i);
    return ids;
  }

  function loadPlan() {
    try { return JSON.parse(localStorage.getItem(PLAN_STORE) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function savePlan(p) {
    try { localStorage.setItem(PLAN_STORE, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function buildSlots(char, fromTs) {
    var intervalMin = Math.max(30, Number((char.autoReply && char.autoReply.interval) || 120));
    var horizon = Date.now() + 24 * 3600 * 1000;
    var t = fromTs;
    var slots = [];
    var prevLine = '';
    var guard = 0;
    while (t < horizon && slots.length < MAX_PER_CHAR && guard++ < 400) {
      t += intervalMin * 60000 * (0.85 + Math.random() * 0.3);
      if (isQuiet(t)) continue;
      var line = lineFor(char, t, prevLine);
      prevLine = line;
      slots.push({ at: Math.round(t), body: line });
    }
    return slots;
  }

  // enabledOverride：外部（角色设置页）刚改了开关、还没落盘时，直接按它算
  function replanChar(char, fromNow, enabledOverride) {
    if (!LN || !char) return Promise.resolve();
    var key = String(char.id);
    var old = loadPlan()[key];
    var prevIds = (old && old.ids) || [];
    var enabled = (enabledOverride === undefined)
      ? !!(char.autoReply && char.autoReply.enabled)
      : !!enabledOverride;

    if (!enabled) {
      if (prevIds.length) {
        var p0 = loadPlan();
        delete p0[key];
        savePlan(p0);
        return cancelMany(prevIds);
      }
      return Promise.resolve();
    }

    var slots = buildSlots(char, fromNow ? Date.now() : Date.now());
    var ids = planIdsFor(char);

    return cancelMany(prevIds).then(function () {
      if (!slots.length) {
        var p1 = loadPlan(); delete p1[key]; savePlan(p1);
        return null;
      }
      var list = slots.map(function (slot, i) {
        return {
          id: ids[i],
          title: charName(char),
          body: slot.body,
          schedule: { at: new Date(slot.at) },
          extra: { kind: 'chat', chatId: String(char.id), chatType: 'private', planned: true }
        };
      });
      return LN.schedule({ notifications: list }).then(function () {
        // 重新读一次再写：多个角色并行排程时，避免彼此覆盖存档
        var p2 = loadPlan();
        p2[key] = { ids: ids.slice(0, list.length), till: slots[slots.length - 1].at };
        savePlan(p2);
      });
    }).catch(function (e) { console.warn('[OctoNative] 预排失败', e); });
  }

  function replanAll(force) {
    if (!LN || !dbReady()) return Promise.resolve();
    var chars = window.db.characters || [];
    var plan = loadPlan();
    var now = Date.now();
    var jobs = [];

    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var key = String(c.id);
      var entry = plan[key];
      var enabled = !!(c.autoReply && c.autoReply.enabled);

      if (!enabled) {
        if (entry && entry.ids && entry.ids.length) jobs.push(replanChar(c, true));
        continue;
      }
      // 还有 2 小时以上余量就不重排，避免每次开 App 都把时间往后推
      if (!force && entry && entry.till && entry.till > now + 2 * 3600 * 1000) continue;
      jobs.push(replanChar(c, true));
    }
    return Promise.all(jobs);
  }

  // ---------------- 点击通知 ----------------

  var injected = {};   // 防止同一条预排通知被塞两次

  function injectMessage(chatId, body) {
    var c = charById(chatId);
    if (!c || !body) return;
    var key = String(chatId) + '|' + body;
    if (injected[key] && Date.now() - injected[key] < 15 * 60 * 1000) return;
    injected[key] = Date.now();

    var content = '[' + charName(c) + '的消息：' + body + ']';
    if (!Array.isArray(c.history)) c.history = [];
    var msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      role: 'assistant',
      content: content,
      parts: [{ type: 'text', text: content }],
      timestamp: Date.now()
    };
    c.history.push(msg);
    try {
      if (typeof window.addMessageBubble === 'function') {
        window.addMessageBubble(msg, chatId, 'private');
      }
    } catch (e) { /* 气泡渲染失败不影响入库 */ }
    try {
      if (typeof window.saveData === 'function') window.saveData();
    } catch (e) { /* ignore */ }
  }

  function openChatWhenReady(chatId, type, planned, body) {
    whenDbReady(function () {
      // 预排通知点进来时，聊天里其实还没有这条消息 —— 补进去，别让她"说了话却查无此人"
      if (planned && body) injectMessage(chatId, body);
      var fn = window.openChatRoom;
      if (typeof fn !== 'function') { console.warn('[OctoNative] 找不到 openChatRoom'); return; }
      fn(chatId, type || 'private');
      var c = charById(chatId);
      if (c) replanChar(c, true);
    }, 15000);
  }

  function hookTap() {
    if (!LN || !LN.addListener) return;
    LN.addListener('localNotificationActionPerformed', function (ev) {
      var extra = ev && ev.notification && ev.notification.extra;
      if (!extra || !extra.kind) return;

      if (extra.kind === 'chat') {
        var body = (ev.notification && ev.notification.body) || '';
        openChatWhenReady(extra.chatId, extra.chatType, !!extra.planned, body);
        return;
      }
      if (extra.kind !== 'incoming-call') return;

      var vc = null;
      try { vc = (typeof VideoCallModule !== 'undefined') ? VideoCallModule : window.VideoCallModule; } catch (e) { vc = null; }
      if (!vc || typeof vc.receiveCall !== 'function') return;
      var modal = document.getElementById('vc-incoming-modal');
      var visible = modal && modal.classList.contains('visible');
      if (!visible) vc.receiveCall(extra.callType, extra.chatId);
    });

    // App 在前台时预排通知到点：不弹横幅（系统也会弹，但至少让聊天里真有这条）
    LN.addListener('localNotificationReceived', function (ev) {
      var extra = ev && ev.notification && ev.notification.extra;
      if (!extra || extra.kind !== 'chat' || !extra.planned) return;
      injectMessage(extra.chatId, (ev.notification && ev.notification.body) || '');
    });
  }

  // 第一次触屏时申请权限（有上下文的申请通过率更高）
  function hookPermission() {
    var once = function () {
      document.removeEventListener('touchstart', once, true);
      document.removeEventListener('click', once, true);
      ensurePermission();
    };
    document.addEventListener('touchstart', once, true);
    document.addEventListener('click', once, true);
  }

  function hookResume() {
    if (!AppPlugin || !AppPlugin.addListener) return;
    try {
      AppPlugin.addListener('appStateChange', function (state) {
        if (state && state.isActive && dbReady()) replanAll(false);
      });
    } catch (e) { /* ignore */ }
  }

  var api = {
    ready: function () { return true; },
    request: ensurePermission,
    notify: notify,
    cancel: cancel,
    call: onCall,
    replan: function () { return replanAll(true); },
    // 单个角色重排（角色设置里改「主动发消息」开关 / 间隔时调用）
    // enabled 传 true/false 可覆盖数据库里的旧值，不传则按 db 现状
    replanChar: function (id, enabled) {
      var c = charById(id);
      if (!c) return Promise.resolve();
      return replanChar(c, true, enabled);
    },
    planInfo: function () { return loadPlan(); },
    test: function (sec) {
      return notify({
        title: '章鱼喷墨机',
        body: '通知通道正常，' + (sec || 5) + ' 秒后你会看到这条。',
        delay: sec || 5,
        sound: false,
        extra: { kind: 'test' }
      });
    }
  };
  window.OctoNative = api;

  function boot() {
    hookTap();
    hookPermission();
    hookResume();

    // VideoCallModule / getAiReply 可能晚一点才初始化，轮询挂一次
    var tries = 0;
    var timer = setInterval(function () {
      var a = hookCall();
      var b = hookReply();
      if ((a && b) || ++tries > 60) clearInterval(timer);
    }, 250);

    // db 起来后排一轮「主动消息」
    whenDbReady(function () {
      ensurePermission().then(function (ok) {
        if (ok) replanAll(false);
      });
    }, 20000);

    // 每 10 分钟自检一次（仅 App 活着时有效，纯补漏）
    setInterval(function () { if (dbReady()) replanAll(false); }, 10 * 60 * 1000);

    console.log('[OctoNative] bridge ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
