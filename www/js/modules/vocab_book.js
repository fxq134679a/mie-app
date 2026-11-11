/* 单词本 App：主屏幕图标 → 页面渲染 / 搜索 / 长按删除 / 点击查词典 */
(function () {
  'use strict';

  var SCREEN_ID = 'vocab-book-screen';
  var listEl = null;
  var emptyEl = null;
  var searchEl = null;
  var countEl = null;
  var settingsBtn = null;
  var clearEl = null;

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
    clearEl = screen.querySelector('[data-role="vocab-clear"]');
    return !!(listEl && emptyEl && searchEl);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!ensureDom()) return;
    var kw = searchEl.value || '';
    var rows = (window.VocabStore && typeof window.VocabStore.search === 'function')
      ? window.VocabStore.search(kw) : [];

    if (countEl) countEl.textContent = String(rows.length);
    if (clearEl) clearEl.classList.toggle('is-visible', !!kw);

    if (!rows.length) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    var chevron = '<svg class="vocab-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    var html = rows.map(function (r, i) {
      var time = formatTime(r.savedAt);
      var src = r.sourceChat ? '<div class="vocab-meta">' + escapeHtml(r.sourceChat) + ' · ' + time + '</div>'
                             : '<div class="vocab-meta">' + time + '</div>';
      var pron = r.pronunciation ? '<span class="vocab-pron">' + escapeHtml(r.pronunciation) + '</span>' : '';
      var meaning = r.meaningPreview
        ? '<div class="vocab-meaning">' + escapeHtml(r.meaningPreview) + '</div>' : '';
      var glyph = String(r.word || '').charAt(0) || '·';
      return (
        '<div class="vocab-item" data-id="' + escapeAttr(r.id || r.word) + '" data-word="' + escapeAttr(r.word) + '"' +
             ' data-tone="' + (i % 5) + '" style="--i:' + i + '">' +
          '<div class="vocab-glyph" aria-hidden="true">' + escapeHtml(glyph) + '</div>' +
          '<div class="vocab-body">' +
            '<div class="vocab-head">' +
              '<span class="vocab-word">' + escapeHtml(r.word) + '</span>' +
              pron +
            '</div>' +
            meaning +
            src +
          '</div>' +
          chevron +
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
    if (clearEl) {
      clearEl.addEventListener('click', function () {
        if (searchEl) {
          searchEl.value = '';
          searchEl.focus();
        }
        render();
      });
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
    el.className = 'modal-overlay vocab-dict-overlay';
    el.style.zIndex = '10001';
    el.innerHTML =
      '<div class="vocab-dict-modal">' +
        '<div class="vocab-dict-grabber"></div>' +
        '<div class="vocab-dict-title">词典设置</div>' +
        '<div class="vocab-dict-subtitle">导入 .mdx 韩语词典后即可查词</div>' +
        '<div class="vocab-dict-status" data-role="dict-status"></div>' +
        '<div class="vocab-dict-actions">' +
          '<button data-role="dict-import" class="vocab-dict-btn vocab-dict-btn-primary">导入 .mdx 词典文件</button>' +
          '<button data-role="dict-remove" class="vocab-dict-btn vocab-dict-btn-ghost" style="display:none;">移除词典</button>' +
          '<button data-role="dict-close" class="vocab-dict-btn vocab-dict-btn-plain">关闭</button>' +
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
          '<div class="vocab-dict-muted">未导入词典</div>' +
          '<div class="vocab-dict-hint">导入 .mdx 文件后，点击韩语单词即可查看释义</div>';
        removeBtn.style.display = 'none';
        importBtn.textContent = '导入 .mdx 词典文件';
        importBtn.disabled = false; importBtn.style.opacity = '1';
      } else {
        var sizeStr = formatSize(meta.size);
        var dateStr = meta.importedAt ? new Date(meta.importedAt).toLocaleString('zh-CN', { hour12: false }) : '';
        statusEl.innerHTML =
          '<div class="vocab-dict-row"><span>状态</span><b class="is-ok">已加载</b></div>' +
          '<div class="vocab-dict-row"><span>文件名</span><em>' + escapeHtml(meta.fileName || '') + '</em></div>' +
          '<div class="vocab-dict-row"><span>大小</span><em>' + sizeStr + '</em></div>' +
          (dateStr ? '<div class="vocab-dict-row"><span>导入时间</span><em>' + dateStr + '</em></div>' : '');
        removeBtn.style.display = 'flex';
        importBtn.textContent = '重新导入';
        importBtn.disabled = false; importBtn.style.opacity = '1';
      }
    }).catch(function (e) {
      statusEl.innerHTML = '<div class="vocab-dict-error">读取状态失败</div>';
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
      '<div class="vocab-dict-center">正在导入…</div>' +
      '<div class="vocab-dict-hint">' + escapeHtml(file.name) + ' · ' + formatSize(file.size) + '</div>';

    DictEngine.importMdx(file).then(function (meta) {
      showLocalToast('词典导入成功');
      refreshDictStatus();
    }).catch(function (err) {
      console.warn('[VocabBook] import failed:', err);
      statusEl.innerHTML =
        '<div class="vocab-dict-error">导入失败</div>' +
        '<div class="vocab-dict-error-detail">' +
        escapeHtml(String(err && err.message ? err.message : err)) + '</div>';
      importBtn.disabled = false; importBtn.style.opacity = '1';
    });
  }

  function removeDict() {
    var statusEl = dictOverlay.querySelector('[data-role="dict-status"]');
    statusEl.innerHTML = '<div class="vocab-dict-center">正在移除…</div>';
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
