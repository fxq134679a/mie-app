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

  var RING_ID_BASE = 72000;     // 通知 id 段位，避免和别的冲突
  var nextId = 0;
  var ringId = 0;               // 当前来电的通知 id（用来取消）
  var granted = false;
  var asked = false;

  function rid() {
    nextId = (nextId + 1) % 900;
    return RING_ID_BASE + nextId;
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
        sound: 'ring.wav',            // 走 www/ring.wav，插件会去 public/ 里找
        extra: o.extra || null
      };
      return LN.schedule({ notifications: [n] }).then(function () { return n.id; });
    });
  }

  function cancel(id) {
    if (!LN || id == null) return Promise.resolve();
    return LN.cancel({ notifications: [{ id: id }] }).catch(function () {});
  }

  // ---- 来电：挂到 App 自己的 receiveCall 上 ----
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
          // 只有后台/锁屏才发通知；前台直接弹 App 内来电界面就够了
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
    var name = '有人';
    try {
      var db = window.db || (typeof db !== 'undefined' ? db : null);
      if (db) {
        var c = (db.characters || []).find(function (x) { return x.id === chatId; });
        if (c) name = c.remarkName || c.name || name;
      }
    } catch (e) { /* ignore */ }

    var isVideo = type === 'video';
    return notify({
      title: isVideo ? '视频通话邀请' : '语音通话邀请',
      body: name + (isVideo ? ' 想和你视频通话…' : ' 想和你语音通话…'),
      id: RING_ID_BASE - 1,
      extra: { kind: 'incoming-call', callType: type, chatId: String(chatId) }
    }).then(function (id) {
      ringId = id;
      return id;
    });
  }

  // 点通知 → 回到 App 并直接进来电界面
  function hookTap() {
    if (!LN || !LN.addListener) return;
    LN.addListener('localNotificationActionPerformed', function (ev) {
      var extra = ev && ev.notification && ev.notification.extra;
      if (!extra || extra.kind !== 'incoming-call') return;
      var vc = null;
      try { vc = (typeof VideoCallModule !== 'undefined') ? VideoCallModule : window.VideoCallModule; } catch (e) { vc = null; }
      if (!vc || typeof vc.receiveCall !== 'function') return;
      var modal = document.getElementById('vc-incoming-modal');
      var visible = modal && modal.classList.contains('visible');
      if (!visible) vc.receiveCall(extra.callType, extra.chatId);
    });
  }

  // 第一次触屏时申请权限（iOS 习惯：有上下文的申请通过率更高）
  function hookPermission() {
    var once = function () {
      document.removeEventListener('touchstart', once, true);
      document.removeEventListener('click', once, true);
      ensurePermission();
    };
    document.addEventListener('touchstart', once, true);
    document.addEventListener('click', once, true);
  }

  var api = {
    ready: function () { return true; },
    request: ensurePermission,
    notify: notify,
    cancel: cancel,
    call: onCall,
    test: function (sec) {
      return notify({
        title: '章鱼喷墨机',
        body: '通知通道正常，' + (sec || 5) + ' 秒后你会看到这条。',
        delay: sec || 5,
        extra: { kind: 'test' }
      });
    }
  };
  window.OctoNative = api;

  function boot() {
    hookTap();
    hookPermission();
    // VideoCallModule 可能晚一点才初始化，轮询挂一次
    if (!hookCall()) {
      var tries = 0;
      var timer = setInterval(function () {
        if (hookCall() || ++tries > 40) clearInterval(timer);
      }, 250);
    }
    console.log('[OctoNative] bridge ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
