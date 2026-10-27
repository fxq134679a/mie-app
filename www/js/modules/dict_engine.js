/* 韩语词典引擎：MDX 词典导入、IndexedDB 持久化、查词（含韩语助词剥离重试） */
(function () {
  'use strict';
  if (!window.Dexie) { console.error('[DictEngine] 缺少 Dexie，无法持久化词典'); }
  if (!window.MdictParser) { console.error('[DictEngine] 缺少 MdictParser（libs/mdict-*）'); }

  var DB_NAME = 'uwu_dict_db';
  var DICT_ID = 'korean'; /* 当前固定为韩语词典，后续可扩展多语言 */

  var db = new Dexie(DB_NAME);
  db.version(1).stores({ dicts: 'id' });

  var _parserRes = null;   /* 已解析的词典资源 {mdx: lookupFn} */
  var _meta = null;        /* {fileName, size, importedAt, description} */
  var _loadingPromise = null;

  /* ---------- 韩语助词剥离 ---------- */
  /* 常见助词/词尾，按长度降序保证最长匹配优先 */
  var KOREAN_SUFFIXES = [
    '이라든가', '이라든지', '에서는', '에서도', '에게서', '한테서', '으로써', '으로서',
    '이라는', '까지는', '까지도', '이라고', '라고', '부터는', '에서', '에게', '한테',
    '으로', '으로', '보다', '처럼', '만큼', '마다', '조차', '마저', '밖에', '까지',
    '부터', '들의', '라는', '과의', '과는', '과도', '와의', '와는', '와도', '이랑',
    '습니까', '습니다', '었어요', '았어요', '겠어요', '군요', '네요', '어요', '아요',
    '니까', '지만', '해서', '세요', '었다', '았다', '였다', '한다', '이다', '겠다',
    '이나', '들', '과', '와', '랑', '나', '은', '는', '이', '가', '을', '를',
    '에', '도', '만', '의', '로', '요', '여', '께', '뿐',
    /* 口语词尾/终结词尾（如 연락했네? → 연락） */
    '입니다', '네', '다', '지', '죠', '까', '고', '면', '게', '더', '데',
    '했', '였', '았', '었', '하', '됐',
    /* 连接词尾（오늘따라 → 오늘，누워서 → 누워） */
    '따라', '치고', '라도', '이든', '든지', '든가', '아서', '어서', '라서', '여서',
    '는데', '은데', 'ㄴ데', '느라고', '자마자', '다가', '더니', '면서', '으면',
    '서', '아', '어', '라', '러'
  ].sort(function (a, b) { return b.length - a.length; });

  /* 剥掉一个助词，剥不了返回 null（至少保留 1 个字） */
  function stripSuffix(word) {
    for (var i = 0; i < KOREAN_SUFFIXES.length; i++) {
      var s = KOREAN_SUFFIXES[i];
      if (word.length > s.length && word.slice(-s.length) === s) {
        return word.slice(0, word.length - s.length);
      }
    }
    return null;
  }

  /* 生成查词候选：原词 → 剥一层 → 剥二层 → 剥三层（去重），每层附带 ㅂ 不规则变形还原 */
  /* ---------- 不规则变形还原 ----------
     目标：让聊天里出现的口语变形词都能还原到词典原形 */
  /* ㅂ 不规则：누워→눕다、도와→돕다、추워→춥다、쉬워→쉽다
     规则：词尾为 워/와 时，去掉该音节并给前一个音节补终声 ㅂ，再加 다 */
  function withFinalB(base) {
    if (!base) return null;
    var c = base.charCodeAt(base.length - 1) - 0xAC00;
    if (c < 0 || c >= 11172 || c % 28 !== 0) return null; /* 已有终声或非音节文字 */
    return base.slice(0, -1) + String.fromCharCode(0xAC00 + (c - c % 28) + 17) + '다';
  }

  /* 去掉一个音节的终声 ㄹ（르不规则用）：몰 → 모 */
  function removeFinalL(base) {
    if (!base) return null;
    var c = base.charCodeAt(base.length - 1) - 0xAC00;
    if (c < 0 || c >= 11172 || c % 28 !== 8) return null;
    return base.slice(0, -1) + String.fromCharCode(0xAC00 + (c - c % 28));
  }

  /* 词尾变形 → 原形候选 */
  function irregularVariants(word) {
    var out = [];
    var last = word.slice(-1);
    var stem = word.slice(0, -1);

    if (last === '워' || last === '와') {
      /* ㅂ不规则：누워→눕다、고와→곱다 */
      var vb = withFinalB(stem);
      if (vb) out.push(vb);
    } else if (last === '러') {
      /* 러不规则：흘러→흐르다 */
      out.push(stem + '르다');
      var vl = removeFinalL(stem);
      if (vl) out.push(vl + '르다');   /* 르缩略：몰라→모르다 */
    } else if (last === '라') {
      var vl2 = removeFinalL(stem);
      if (vl2) out.push(vl2 + '르다'); /* 빨라→빠르다、몰라→모르다 */
    } else if (last === '져') {
      out.push(stem + '지다');         /* 부서져→부서지다 */
    } else if (last === '쳐') {
      out.push(stem + '치다');         /* 치어→쳐 变形类 */
    } else if (last === '돼') {
      out.push(stem + '되다');         /* 돼→되다 */
    } else if (last === '해') {
      out.push(stem + '하다');         /* 해→하다 */
    } else if (last === '래') {
      out.push(stem + '렇다');         /* 그래→그렇다 */
    } else if (last === '빠') {
      out.push(stem + '쁘다');         /* 바빠→바쁘다 */
    }
    return out;
  }

  function pushUnique(list, w) {
    if (w && list.indexOf(w) === -1) list.push(w);
  }

  function generateCandidates(word) {
    var candidates = [word];
    irregularVariants(word).forEach(function (v) { pushUnique(candidates, v); });
    var cur = word;
    for (var depth = 0; depth < 3; depth++) {
      var stripped = stripSuffix(cur);
      if (!stripped || stripped === cur || candidates.indexOf(stripped) !== -1) break;
      candidates.push(stripped);
      irregularVariants(stripped).forEach(function (v) { pushUnique(candidates, v); });
      /* 词干直接加 다 试查动词原形：가요→가→가다、자요→자→자다 */
      if (!/다$/.test(stripped)) pushUnique(candidates, stripped + '다');
      cur = stripped;
    }
    return candidates;
  }

  /* ---------- 词典加载 ---------- */
  /* 解析器返回的 resources.mdx 是 Promise（resolve 为查词函数），统一归一化 */
  function normalizeResources(resources) {
    return Promise.resolve(resources.mdx).then(function (mdxLookup) {
      return { mdx: mdxLookup };
    });
  }

  function ensureLoaded() {
    if (_parserRes) return Promise.resolve(_parserRes);
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = db.dicts.get(DICT_ID).then(function (record) {
      if (!record) { _loadingPromise = null; return null; }
      _meta = {
        fileName: record.fileName,
        size: record.size,
        importedAt: record.importedAt,
        description: record.description || ''
      };
      var file = new File([record.data], record.fileName);
      return window.MdictParser([file]).then(normalizeResources).then(function (resources) {
        _parserRes = resources;
        if (resources.mdx && resources.mdx.description) {
          _meta.description = resources.mdx.description;
        }
        return resources;
      });
    });
    return _loadingPromise;
  }

  /* ---------- 查词策略 ---------- */
  /* 词头归一化：去尾随空格 + 去同形词编号（如 "사랑 1  " → "사랑"） */
  function normKey(k) {
    return String(k).replace(/\s+$/, '').replace(/\s+\d+$/, '');
  }

  function collectDefs(defs) {
    var arr = Array.isArray(defs) ? defs : [defs];
    return arr.filter(function (d) { return typeof d === 'string' && d; });
  }

  /* 直接精确查（适配键头干净的词典） */
  function findByExact(mdx, cand) {
    return mdx(cand).then(function (defs) {
      var arr = collectDefs(defs);
      return arr.length ? arr : null;
    }).catch(function () { return null; });
  }

  /* 通配符搜索 + offset 定位（适配带同形词编号/尾随空格的词典，如 Naver） */
  function findByWildcard(mdx, cand) {
    return mdx({ phrase: cand + '* ', max: 100 }).then(function (keys) {
      var list = Array.isArray(keys) ? keys : [];
      var hits = list.filter(function (k) { return normKey(k) === cand; });
      if (!hits.length) return null;
      var q = new String(hits[0]);
      q.offset = hits[0].offset;
      return mdx(q).then(function (defs) {
        var arr = collectDefs(defs);
        return arr.length ? arr : null;
      });
    }).catch(function () { return null; });
  }

  /* ---------- 对外 API ---------- */
  var DictEngine = {
    /* 导入 .mdx 文件（File 对象）：先解析验证，再持久化到 IndexedDB */
    importMdx: function (file) {
      if (!window.MdictParser) return Promise.reject(new Error('解析库未就绪'));
      if (!file || !/\.mdx$/i.test(file.name)) {
        return Promise.reject(new Error('请选择 .mdx 词典文件'));
      }
      return file.arrayBuffer().then(function (buf) {
        return window.MdictParser([file]).then(normalizeResources).then(function (resources) {
          var description = (resources.mdx && resources.mdx.description) || '';
          var record = {
            id: DICT_ID,
            fileName: file.name,
            size: buf.byteLength,
            importedAt: Date.now(),
            description: description,
            data: buf
          };
          return db.dicts.put(record).then(function () {
            _parserRes = resources;
            _meta = { fileName: record.fileName, size: record.size, importedAt: record.importedAt, description: description };
            return _meta;
          });
        });
      });
    },

    /* 查词：先查原词，查不到自动剥离助词重试（返回 Promise） */
    lookup: function (word) {
      if (!word || !word.trim()) return Promise.resolve({ found: false, query: word, reason: 'empty' });
      var query = word.trim().replace(/[.,!?;:~"'`·…、。，！？；：「」『』（）()\[\]]+$/g, '');
      if (!query) return Promise.resolve({ found: false, query: word, reason: 'empty' });
      /* 笑声/语气词（ㅋㅋㅋ、ㅎㅎ、ㅠㅠ等）词典不会收录，直接提示 */
      if (/^[ㅋㅎㅠㅜㅊㅋ.~\s]+$/.test(query)) {
        return Promise.resolve({ found: false, query: query, reason: 'interjection' });
      }
      return ensureLoaded().then(function (resources) {
        if (!resources || !resources.mdx) {
          return { found: false, query: query, reason: 'dict-not-loaded' };
        }
        var candidates = generateCandidates(query);
        var tried = [];
        var i = 0;
        function tryNext() {
          if (i >= candidates.length) {
            return Promise.resolve({ found: false, query: query, tried: tried });
          }
          var cand = candidates[i++];
          tried.push(cand);
          return findByExact(resources.mdx, cand).then(function (r1) {
            if (r1) return { found: true, query: query, word: cand, html: r1.join('\n') };
            return findByWildcard(resources.mdx, cand).then(function (r2) {
              if (r2) return { found: true, query: query, word: cand, html: r2.join('\n') };
              return tryNext();
            });
          });
        }
        return tryNext();
      });
    },

    /* 是否已导入过词典 */
    hasDictionary: function () {
      return db.dicts.get(DICT_ID).then(function (r) { return !!r; });
    },

    /* 词典是否已加载可用 */
    isReady: function () { return !!_parserRes; },

    /* 元信息：Promise<{loaded, fileName, size, importedAt, description}> */
    getMeta: function () {
      return ensureLoaded().then(function (resources) {
        return {
          loaded: !!resources,
          fileName: _meta ? _meta.fileName : '',
          size: _meta ? _meta.size : 0,
          importedAt: _meta ? _meta.importedAt : 0,
          description: _meta ? _meta.description : ''
        };
      });
    },

    /* 移除词典 */
    remove: function () {
      return db.dicts.delete(DICT_ID).then(function () {
        _parserRes = null; _meta = null; _loadingPromise = null;
      });
    },

    /* 供调试/测试：生成剥词候选列表 */
    _generateCandidates: generateCandidates
  };

  window.DictEngine = DictEngine;
})();
