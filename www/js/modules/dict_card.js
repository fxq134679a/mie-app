/* 词典卡片弹窗：单击/长按触发，白黑圆滑风，点击遮罩收起
   布局：单词顶部居中，收藏按钮右上角；发音标注在释义上方；无关闭叉、无发音键 */
(function () {
  'use strict';

  /* ---------- 构造 DOM（单例，首次 show 时懒创建） ---------- */
  var overlay = null;
  var cachedWord = null;    /* 最近一次查词原词（用于收藏时记录） */
  var cachedDef = null;     /* 最近一次查词结果 {html, word, found} */

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'dict-overlay';
    el.innerHTML =
      '<div class="dict-card" role="dialog" aria-label="词典卡片">' +
        '<button class="dict-fav" data-role="fav">收藏</button>' +
        '<div class="dict-word" data-role="word"></div>' +
        '<div class="dict-pron" data-role="pron"></div>' +
        '<div class="dict-body" data-role="body"></div>' +
      '</div>';
    document.body.appendChild(el);

    /* 点击遮罩空白处收起 */
    el.addEventListener('click', function (e) {
      if (e.target === el) DictCard.hide();
    });
    /* 收藏 */
    el.querySelector('[data-role="fav"]').addEventListener('click', function () {
      toggleFavorite();
    });
    /* ESC 关闭 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('visible')) DictCard.hide();
    });

    return el;
  }

  function ensureOverlay() {
    if (!overlay) overlay = buildOverlay();
    return overlay;
  }

  /* ---------- 罗马音标注（把韩语单词转成读音标注，显示在释义上方） ---------- */
  var R_INIT = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  var R_MED = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  var R_FIN = ['','k','k','k','n','n','n','t','l','g','m','b','l','t','p','l','m','p','p','t','t','ng','t','t','k','t','p','t'];
  function toRoman(word) {
    var out = '';
    for (var i = 0; i < word.length; i++) {
      var c = word.charCodeAt(i) - 0xAC00;
      if (c < 0 || c >= 11172) { out += word.charAt(i); continue; }
      var z = c % 28; c = (c - z) / 28;
      var m = c % 21; c = (c - m) / 21;
      out += R_INIT[c] + R_MED[m] + R_FIN[z];
    }
    return out;
  }

  /* ---------- 释义 HTML 清洗：去英文注释、去中文拼音、颜色改粉 ---------- */
  /* 判断一个颜色值是否偏蓝/偏红，返回粉系替换色或 null */
  function pinkifyColor(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    var r, g, b;
    var m = v.match(/^rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)\)$/);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else if (/^#[0-9a-f]{6}$/.test(v)) {
      r = parseInt(v.slice(1, 3), 16); g = parseInt(v.slice(3, 5), 16); b = parseInt(v.slice(5, 7), 16);
    } else if (/^#[0-9a-f]{3}$/.test(v)) {
      r = parseInt(v[1] + v[1], 16); g = parseInt(v[2] + v[2], 16); b = parseInt(v[3] + v[3], 16);
    } else {
      var named = { blue: [0, 0, 255], navy: [0, 0, 128], mediumblue: [0, 0, 205], darkblue: [0, 0, 139], royalblue: [65, 105, 225], dodgerblue: [30, 144, 255], deepskyblue: [0, 191, 255], red: [255, 0, 0], crimson: [220, 20, 60], darkred: [139, 0, 0], firebrick: [178, 34, 34] };
      if (named[v]) { r = named[v][0]; g = named[v][1]; b = named[v][2]; }
      else return null;
    }
    if (b > r + 40 && b > g + 40) return '#f3a8bd';   /* 蓝系 → 浅粉 */
    if (r > g + 50 && r > b + 50) return '#d0486f';  /* 红系 → 深粉 */
    return null;
  }

  /* 判断文本是否几乎全为拉丁字母（英文注释），且不含韩语/汉字 */
  function isMostlyLatin(s) {
    var compact = s.replace(/\s/g, '');
    if (!compact) return false;
    var latin = (compact.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
    var cjk = (compact.match(/[\uAC00-\uD7AF\u4E00-\u9FFF]/g) || []).length;
    return cjk === 0 && latin >= compact.length * 0.55;
  }

  function cleanMdxHtml(html) {
    var container = document.createElement('div');
    container.innerHTML = html;

    /* 1) 删除几乎全为英文/拼音的文本节点（词典里的英文注释、罗马音） */
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var dead = [];
    var n;
    while ((n = walker.nextNode())) {
      var s = n.nodeValue.trim();
      if (s && isMostlyLatin(s)) dead.push(n);
    }
    dead.forEach(function (t) { if (t.parentNode) t.parentNode.removeChild(t); });

    /* 2) 含汉字的文本：把里面的拼音/拉丁字母全部去掉，只留中文
       覆盖 爱好(àihào)、爱好 àihào、爱好(aihao) 等各种写法 */
    walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    while ((n = walker.nextNode())) {
      if (/[\u4E00-\u9FFF]/.test(n.nodeValue) && /[A-Za-z\u00C0-\u024F]/.test(n.nodeValue)) {
        n.nodeValue = n.nodeValue
          .replace(/[\(（]\s*[A-Za-z\u00C0-\u024F][^()（）]*[\)）]/g, '') /* 括号包住的拼音 */
          .replace(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\s·-]*/g, '') /* 裸拼音串 */
          .replace(/\s{2,}/g, ' ')
          .replace(/^[\s·\-]+|[\s·\-]+$/g, '');
      }
      /* 中文释义标点：不用句号，多个意思之间用顿号 、 */
      if (/[\u4E00-\u9FFF]/.test(n.nodeValue) && n.nodeValue.indexOf('。') !== -1) {
        n.nodeValue = n.nodeValue
          .replace(/。\s*/g, '、')
          .replace(/、\s*$/g, ''); /* 结尾的、去掉 */
      }
    }

    /* 3) 清理因此空掉的标签 */
    var all = container.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      /* 颜色改粉 */
      var rep = pinkifyColor(el.style && el.style.color);
      if (rep) el.style.color = rep;
      var fc = el.getAttribute && el.getAttribute('color');
      if (fc) {
        var rep2 = pinkifyColor(fc);
        if (rep2) el.setAttribute('color', rep2);
      }
      if (!el.textContent.trim() && !el.querySelector('img')) {
        el.parentNode && el.parentNode.removeChild(el);
      }
    }
    return container.innerHTML;
  }

  /* ---------- 收藏（统一走 VocabStore，它在本模块之后加载） ---------- */
  function isFavorite(word) {
    if (window.VocabStore) return !!window.VocabStore.findByWord(word);
    try {
      var list = JSON.parse(localStorage.getItem('uwu_fav_words') || '[]');
      return list.some(function (w) { return w.word === word; });
    } catch (e) { return false; }
  }

  function updateFavBtn() {
    var btn = overlay.querySelector('[data-role="fav"]');
    if (!cachedWord) { btn.classList.remove('saved'); btn.textContent = '收藏'; return; }
    if (isFavorite(cachedWord)) {
      btn.classList.add('saved');
      btn.textContent = '已收藏';
    } else {
      btn.classList.remove('saved');
      btn.textContent = '收藏';
    }
  }

  function toggleFavorite() {
    if (!cachedWord) return;
    var has = isFavorite(cachedWord);
    if (window.VocabStore) {
      if (has) {
        window.VocabStore.remove(cachedWord);
      } else {
        window.VocabStore.add({
          word: cachedWord,
          meaningPreview: cachedDef && cachedDef.found ? stripHtml(cachedDef.html).slice(0, 120) : '',
          pronunciation: cachedDef && cachedDef.found ? toRoman(cachedDef.word || cachedWord) : '',
          sourceChat: ''
        });
      }
    } else {
      try {
        var list = JSON.parse(localStorage.getItem('uwu_fav_words') || '[]');
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].word === cachedWord) { idx = i; break; }
        if (idx >= 0) list.splice(idx, 1);
        else list.push({ word: cachedWord, meaningPreview: cachedDef && cachedDef.found ? stripHtml(cachedDef.html).slice(0, 120) : '', savedAt: Date.now() });
        localStorage.setItem('uwu_fav_words', JSON.stringify(list));
      } catch (e) { /* ignore quota */ }
    }
    updateFavBtn();
  }

  function stripHtml(s) {
    return String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- 渲染 ---------- */
  function renderBody(state) {
    var body = overlay.querySelector('[data-role="body"]');
    body.className = 'dict-body';
    body.innerHTML = '';
    if (state === 'loading') { body.classList.add('loading'); body.textContent = '查词中…'; return; }
    if (state === 'not-loaded') {
      body.classList.add('not-loaded');
      body.innerHTML = '<div class="dict-need-import">请先导入韩语词典</div><div style="font-size:12px;">（在「单词本」App 的设置中导入 .mdx 文件）</div>';
      return;
    }
    if (state === 'not-found') {
      var nfWord = arguments.length > 1 ? arguments[1] : '';
      body.classList.add('empty');
      body.innerHTML =
        '<div class="dict-notfound-text">' + (nfWord ? ('没有找到「' + escapeHtml(nfWord) + '」的释义') : '没有找到') + '</div>' +
        (nfWord ? '<button class="dict-online-btn" data-role="online">联网翻译</button>' : '');
      var ob = body.querySelector('[data-role="online"]');
      if (ob) ob.addEventListener('click', function () { onlineTranslate(nfWord); });
      return;
    }
    if (state === 'interjection') {
      body.classList.add('empty');
      body.innerHTML =
        '<div class="dict-notfound-text">这是笑声/语气词，词典未收录</div>' +
        '<button class="dict-online-btn" data-role="online">联网翻译</button>';
      body.querySelector('[data-role="online"]').addEventListener('click', function () { onlineTranslate(cachedWord || ''); });
      return;
    }
    if (state === 'online-result') {
      var txt = arguments.length > 1 ? arguments[1] : '';
      body.classList.add('empty');
      body.classList.add('online-result');
      body.innerHTML =
        '<div class="dict-online-label">在线翻译结果</div>' +
        '<div class="dict-online-text">' + escapeHtml(txt) + '</div>';
      return;
    }
    if (state === 'error') {
      body.classList.add('error'); body.textContent = '查询出错，请稍后再试'; return;
    }
    if (typeof state === 'string') {
      var clean = cleanMdxHtml(state);
      var html = window.DOMPurify ? window.DOMPurify.sanitize(clean, { USE_PROFILES: { html: true } }) : clean;
      body.innerHTML = html;
    }
  }

  function setPron(word) {
    var pron = overlay.querySelector('[data-role="pron"]');
    if (!word) { pron.textContent = ''; return; }
    pron.textContent = '[' + toRoman(word) + ']';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 联网翻译缓存 ----------
     翻译过的词存 localStorage，下次词典查不到时直接显示缓存意思 */
  var ONLINE_CACHE_KEY = 'uwu_online_trans_cache';
  var ONLINE_CACHE_MAX = 800;

  function loadOnlineCache() {
    try { return JSON.parse(localStorage.getItem(ONLINE_CACHE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveOnlineCache(cache) {
    try {
      var keys = Object.keys(cache);
      if (keys.length > ONLINE_CACHE_MAX) {
        /* 超限：按时间删最旧的 200 条 */
        keys.sort(function (a, b) { return (cache[a].ts || 0) - (cache[b].ts || 0); })
            .slice(0, keys.length - ONLINE_CACHE_MAX + 200)
            .forEach(function (k) { delete cache[k]; });
      }
      localStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* quota 满：静默放弃缓存 */ }
  }
  function getCachedTrans(word) {
    if (!word) return null;
    var c = loadOnlineCache();
    return (c[word] && c[word].t) || null;
  }

  /* ---------- 联网翻译（词典查不到时兜底） ----------
     依次尝试：Google 翻译 gtx 接口 → MyMemory 免费接口 */
  function onlineTranslate(word) {
    if (!word || !window.fetch) { renderBody('error'); return; }
    var body = overlay.querySelector('[data-role="body"]');
    body.className = 'dict-body loading';
    body.textContent = '在线翻译中…';

    function showResult(txt) {
      if (!txt || !String(txt).trim()) { renderOnlineFail(); return; }
      var t = String(txt).trim().replace(/。\s*/g, '、').replace(/、\s*$/g, '');
      /* 写入翻译缓存：下次查同一个词直接显示 */
      var cache = loadOnlineCache();
      cache[word] = { t: t, ts: Date.now() };
      saveOnlineCache(cache);
      renderBody('online-result', t);
    }
    function renderOnlineFail() {
      body.className = 'dict-body empty';
      body.innerHTML =
        '<div class="dict-notfound-text">在线翻译失败，请检查网络</div>' +
        '<button class="dict-online-btn" data-role="retry">重试</button>';
      body.querySelector('[data-role="retry"]').addEventListener('click', function () { onlineTranslate(word); });
    }

    fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=' + encodeURIComponent(word))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data[0]) {
          showResult(data[0].map(function (seg) { return seg[0] || ''; }).join(''));
          return null;
        }
        throw new Error('bad response');
      })
      .catch(function () {
        /* 备用：MyMemory（无 key、支持 CORS） */
        return fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=ko|zh-CN')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var t = j && j.responseData && j.responseData.translatedText;
            if (t && !/MYMEMORY WARNING/i.test(t)) showResult(t);
            else renderOnlineFail();
          })
          .catch(renderOnlineFail);
      });
  }

  /* ---------- 对外 API ---------- */
  var DictCard = {
    show: function (word, context) {
      ensureOverlay();
      cachedWord = word;
      cachedDef = null;

      overlay.querySelector('[data-role="word"]').textContent = word;
      overlay.querySelector('[data-role="pron"]').textContent = '';
      overlay.classList.add('visible');
      renderBody('loading');
      updateFavBtn();

      if (!window.DictEngine || typeof window.DictEngine.lookup !== 'function') {
        renderBody('error');
        return;
      }
      window.DictEngine.getMeta().then(function (meta) {
        if (!meta || !meta.loaded) {
          renderBody('not-loaded');
          return null;
        }
        return window.DictEngine.lookup(word);
      }).then(function (result) {
        if (!result) return;
        cachedDef = result;
        if (!result.found) {
          var q = result.query || word;
          /* 词典查不到 → 先看有没有翻译缓存，有就直接显示 */
          var cachedTrans = getCachedTrans(word) || getCachedTrans(q);
          if (cachedTrans) {
            setPron(q);
            /* 旧缓存里的；也统一成、 */
            renderBody('online-result', String(cachedTrans).replace(/；\s*/g, '、').replace(/、\s*$/g, ''));
            return;
          }
          if (result.reason === 'interjection') { renderBody('interjection'); return; }
          renderBody('not-found', q);
          return;
        }
        /* 读音标注：优先用词典命中的原形词，否则用查询词 */
        setPron(result.word || result.query || word);
        renderBody(result.html);
      }).catch(function (e) {
        renderBody('error');
        console.warn('[DictCard] lookup error:', e);
      });
    },

    hide: function () {
      if (!overlay) return;
      overlay.classList.remove('visible');
    }
  };

  window.DictCard = DictCard;
})();
