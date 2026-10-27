/* 单词本 App：主屏幕图标 → 页面渲染 / 搜索 / 长按删除 / 点击查词典 */
(function () {
  'use strict';

  var SCREEN_ID = 'vocab-book-screen';
  var listEl = null;
  var emptyEl = null;
  var searchEl = null;
  var countEl = null;
  var settingsBtn = null;

  /* ---------- DOM 准备 ---------- */
  function ensureDom() {
    var screen = document.getElementById(SCREEN_ID);
    if (!screen) return false;
    if (listEl) return true;

    listEl = screen.querySelector('[data-role="vocab-list"]');
    emptyEl = screen.querySelector('[data-role="vocab-empty"]');
    searchEl = screen.querySelector('[data-role="vocab-search"]');
    countEl = screen.querySelector('[data-role="vocab-count"]');
    settingsBtn = screen.querySelector('[data-role="vocab-settings"]');
    return !!(listEl && emptyEl && searchEl);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!ensureDom()) return;
    var kw = searchEl.value || '';
    var rows = (window.VocabStore && typeof window.VocabStore.search === 'function')
      ? window.VocabStore.search(kw) : [];

    if (countEl) countEl.textContent = String(rows.length);

    if (!rows.length) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    var html = rows.map(function (r) {
      var time = formatTime(r.savedAt);
      var src = r.sourceChat ? '<div class="vocab-meta">' + escapeHtml(r.sourceChat) + ' · ' + time + '</div>'
                             : '<div class="vocab-meta">' + time + '</div>';
      var pron = r.pronunciation ? '<span class="vocab-pron">' + escapeHtml(r.pronunciation) + '</span>' : '';
      var meaning = r.meaningPreview
        ? '<div class="vocab-meaning">' + escapeHtml(r.meaningPreview) + '</div>' : '';
      return (
        '<div class="vocab-item" data-id="' + escapeAttr(r.id || r.word) + '" data-word="' + escapeAttr(r.word) + '">' +
          '<div class="vocab-head">' +
            '<span class="vocab-word">' + escapeHtml(r.word) + '</span>' +
            pron +
          '</div>' +
          meaning +
          src +
        '</div>'
      );
    }).join('');
    listEl.innerHTML = html;
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    var sameYear = d.getFullYear() === now.getFullYear();
    if (sameYear) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/\s+/g, ' '); }

  /* ---------- 事件 ---------- */
  var pressTimer = null;
  var pressedItem = null;

  function onItemClick(e) {
    var item = e.target.closest('.vocab-item');
    if (!item) return;
    /* 如果刚发生过长按（pressTimer 已触发过），click 就不要再触发词典 */
    if (item.dataset.longPressed === '1') {
      item.dataset.longPressed = '0';
      return;
    }
    var word = item.getAttribute('data-word');
    if (word && window.DictCard) {
      window.DictCard.show(word, { source: 'vocab-book' });
    }
  }

  function startPress(e) {
    var item = e.target.closest('.vocab-item');
    if (!item) return;
    pressedItem = item;
    pressTimer = setTimeout(function () {
      if (!pressedItem) return;
      pressedItem.dataset.longPressed = '1';
      var word = pressedItem.getAttribute('data-word') || '';
      if (confirm('删除收藏单词 「' + word + '」？')) {
        var id = pressedItem.getAttribute('data-id');
        if (window.VocabStore) window.VocabStore.remove(id);
        render();
      }
      pressedItem = null;
    }, 550);
  }
  function cancelPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    pressedItem = null;
  }

  function bindEvents() {
    var screen = document.getElementById(SCREEN_ID);
    if (!screen) return;
    screen.addEventListener('click', function (e) {
      if (e.target.closest('.vocab-item')) onItemClick(e);
    });
    screen.addEventListener('mousedown', startPress);
    screen.addEventListener('mouseup', cancelPress);
    screen.addEventListener('mouseleave', cancelPress);
    screen.addEventListener('touchstart', function (e) { startPress(e); }, { passive: true });
    screen.addEventListener('touchend', cancelPress);
    screen.addEventListener('touchcancel', cancelPress);

    if (searchEl) {
      searchEl.addEventListener('input', function () { render(); });
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () { openDictSettings(); });
    }
  }

  /* ---------- 词典设置弹窗（任务 6） ---------- */
  var dictOverlay = null;
  var dictFileInput = null;

  function buildDictOverlay() {
    var el = document.createElement('div');
    el.className = 'modal-overlay';
    el.style.zIndex = '10001';
    el.innerHTML =
      '<div class="modal-window" style="max-width:340px;border-radius:20px;background:#fff;padding:22px 20px;">' +
        '<div style="font-size:16px;font-weight:700;color:#111;text-align:center;margin-bottom:16px;">词典设置</div>' +
        '<div data-role="dict-status" style="border-radius:12px;border:1px solid #eee;padding:14px;margin-bottom:14px;font-size:13px;color:#333;line-height:1.7;"></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button data-role="dict-import" class="dict-setting-btn" style="width:100%;padding:10px 14px;border-radius:14px;border:1px solid #111;background:#111;color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:all .15s;font-family:inherit;">导入 .mdx 词典文件</button>' +
          '<button data-role="dict-remove" class="dict-setting-btn" style="width:100%;padding:10px 14px;border-radius:14px;border:1px solid #e5e5e5;background:#fff;color:#999;font-size:14px;cursor:pointer;transition:all .15s;font-family:inherit;display:none;">移除词典</button>' +
          '<button data-role="dict-close" class="dict-setting-btn" style="width:100%;padding:9px 14px;border-radius:14px;border:1px solid #eee;background:#fff;color:#666;font-size:13px;cursor:pointer;font-family:inherit;">关闭</button>' +
        '</div>' +
      '</div>';

    dictFileInput = document.createElement('input');
    dictFileInput.type = 'file';
    dictFileInput.accept = '.mdx';
    dictFileInput.style.display = 'none';
    document.body.appendChild(dictFileInput);

    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
      if (e.target === el) closeDictSettings();
    });
    el.querySelector('[data-role="dict-close"]').addEventListener('click', closeDictSettings);
    el.querySelector('[data-role="dict-import"]').addEventListener('click', function () {
      dictFileInput.click();
    });
    el.querySelector('[data-role="dict-remove"]').addEventListener('click', function () {
      if (confirm('移除词典后需要重新导入，确定继续？')) {
        removeDict();
      }
    });
    dictFileInput.addEventListener('change', function () {
      if (dictFileInput.files && dictFileInput.files[0]) {
        importDict(dictFileInput.files[0]);
        dictFileInput.value = '';
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('visible')) closeDictSettings();
    });

    return el;
  }

  function openDictSettings() {
    if (!window.DictEngine) {
      showLocalToast('词典引擎未加载');
      return;
    }
    if (!dictOverlay) dictOverlay = buildDictOverlay();
    refreshDictStatus();
    dictOverlay.classList.add('visible');
  }
  function closeDictSettings() {
    if (dictOverlay) dictOverlay.classList.remove('visible');
  }

  function refreshDictStatus() {
    if (!dictOverlay || !window.DictEngine) return;
    var statusEl = dictOverlay.querySelector('[data-role="dict-status"]');
    var removeBtn = dictOverlay.querySelector('[data-role="dict-remove"]');
    var importBtn = dictOverlay.querySelector('[data-role="dict-import"]');
    DictEngine.getMeta().then(function (meta) {
      if (!meta || !meta.loaded) {
        statusEl.innerHTML =
          '<div style="color:#888;text-align:center;">未导入词典</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#bbb;text-align:center;">导入 .mdx 文件后点击韩语单词即可查释义</div>';
        removeBtn.style.display = 'none';
        importBtn.textContent = '导入 .mdx 词典文件';
        importBtn.disabled = false; importBtn.style.opacity = '1';
      } else {
        var sizeStr = formatSize(meta.size);
        var dateStr = meta.importedAt ? new Date(meta.importedAt).toLocaleString('zh-CN', { hour12: false }) : '';
        statusEl.innerHTML =
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#888;">状态</span><span style="color:#111;font-weight:600;">已加载</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#888;">文件名</span><span style="color:#333;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(meta.fileName || '') + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#888;">大小</span><span style="color:#333;">' + sizeStr + '</span></div>' +
          (dateStr ? '<div style="display:flex;justify-content:space-between;"><span style="color:#888;">导入时间</span><span style="color:#333;">' + dateStr + '</span></div>' : '');
        removeBtn.style.display = 'block';
        importBtn.textContent = '重新导入';
        importBtn.disabled = false; importBtn.style.opacity = '1';
      }
    }).catch(function (e) {
      statusEl.innerHTML = '<div style="color:#b04040;text-align:center;">读取状态失败</div>';
      importBtn.disabled = false; importBtn.style.opacity = '1';
    });
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function importDict(file) {
    if (!dictOverlay) dictOverlay = buildDictOverlay();
    var statusEl = dictOverlay.querySelector('[data-role="dict-status"]');
    var importBtn = dictOverlay.querySelector('[data-role="dict-import"]');
    importBtn.disabled = true; importBtn.style.opacity = '0.5';
    statusEl.innerHTML =
      '<div style="text-align:center;color:#555;">正在导入…</div>' +
      '<div style="text-align:center;color:#aaa;font-size:12px;margin-top:4px;">' + escapeHtml(file.name) + ' · ' + formatSize(file.size) + '</div>';

    DictEngine.importMdx(file).then(function (meta) {
      showLocalToast('词典导入成功');
      refreshDictStatus();
    }).catch(function (err) {
      console.warn('[VocabBook] import failed:', err);
      statusEl.innerHTML =
        '<div style="color:#b04040;text-align:center;">导入失败</div>' +
        '<div style="color:#b04040;font-size:12px;text-align:center;margin-top:4px;">' +
        escapeHtml(String(err && err.message ? err.message : err)) + '</div>';
      importBtn.disabled = false; importBtn.style.opacity = '1';
    });
  }

  function removeDict() {
    var statusEl = dictOverlay.querySelector('[data-role="dict-status"]');
    statusEl.innerHTML = '<div style="text-align:center;color:#555;">正在移除…</div>';
    DictEngine.remove().then(function () {
      showLocalToast('词典已移除');
      refreshDictStatus();
    }).catch(function (err) {
      console.warn('[VocabBook] remove failed:', err);
      refreshDictStatus();
    });
  }

  function showLocalToast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    try { alert(msg); } catch (e) {}
  }

  /* ---------- 对外 ---------- */
  var VocabBook = {
    refresh: render,
    init: function () {
      if (!ensureDom()) return;
      bindEvents();
      render();

      /* 监听 screen 变成 active —— 每次进入单词本都刷新一下列表（防止在词典卡片里收藏了新词） */
      var s = document.getElementById(SCREEN_ID);
      if (s) {
        var mo = new MutationObserver(function () {
          if (s.classList.contains('active')) render();
        });
        mo.observe(s, { attributes: true, attributeFilter: ['class'] });
      }
    }
  };

  window.VocabBook = VocabBook;

  /* DOM ready 时初始化 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', VocabBook.init);
  } else {
    VocabBook.init();
  }
})();
