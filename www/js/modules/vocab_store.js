/* 单词本存储：收藏 / 删除 / 列表 / 搜索，底层 localStorage 键 uwu_fav_words
 * 任务 6 会把词典导入也挂到这个模块，但本文件保持轻量。 */
(function () {
  'use strict';

  var STORAGE_KEY = 'uwu_fav_words';

  /* ---------- 内部 ---------- */
  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) { return []; }
  }
  function writeAll(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch (e) { console.warn('[VocabStore] storage write failed:', e); }
  }
  function uid() { return 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- API ---------- */
  var VocabStore = {
    /** 添加一个单词；已存在则更新 meaning/pronunciation 但保留原 savedAt */
    add: function (entry) {
      if (!entry || !entry.word || !String(entry.word).trim()) return null;
      var list = readAll();
      var word = String(entry.word).trim();
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].word === word) { idx = i; break; }

      var meaningPreview = stripHtml(entry.meaningPreview || entry.meaning || '').slice(0, 120);
      var rec = {
        id: entry.id || (idx >= 0 ? list[idx].id : uid()),
        word: word,
        pronunciation: stripHtml(entry.pronunciation || ''),
        meaningPreview: meaningPreview,
        sourceChat: stripHtml(entry.sourceChat || ''),
        savedAt: idx >= 0 ? list[idx].savedAt : (entry.savedAt || Date.now())
      };

      if (idx >= 0) list[idx] = rec;
      else list.push(rec);
      writeAll(list);
      return rec;
    },

    remove: function (id) {
      var list = readAll();
      var next = list.filter(function (r) { return r.id !== id; });
      if (next.length !== list.length) { writeAll(next); return true; }
      /* 回退：也允许按 word 删除 */
      if (typeof id === 'string' && !id.match(/^v_/)) {
        var next2 = list.filter(function (r) { return r.word !== id; });
        if (next2.length !== list.length) { writeAll(next2); return true; }
      }
      return false;
    },

    list: function () {
      return readAll().slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    },

    search: function (keyword) {
      var k = String(keyword == null ? '' : keyword).trim().toLowerCase();
      var all = VocabStore.list();
      if (!k) return all;
      return all.filter(function (r) {
        return (r.word || '').toLowerCase().indexOf(k) >= 0
          || (r.meaningPreview || '').toLowerCase().indexOf(k) >= 0
          || (r.pronunciation || '').toLowerCase().indexOf(k) >= 0;
      });
    },

    count: function () { return readAll().length; },

    /* dict_card.js 已有收藏逻辑，任务 5 上线后统一走这里；旧数据字段可能缺 pronunciation，补上默认 */
    syncFromLocalStorage: function () {
      /* 已经是同一 key，无需迁移；此函数仅用于与 dict_card.js 的约定接口 */
      return readAll();
    },

    findByWord: function (word) {
      var list = readAll();
      for (var i = 0; i < list.length; i++) if (list[i].word === word) return list[i];
      return null;
    }
  };

  window.VocabStore = VocabStore;
})();
