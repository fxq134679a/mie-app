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

  /* ---------- 韩文字母分解（专业做法：按初声/中声/终声处理，而不是字符串猜） ---------- */
  var S_BASE = 0xAC00, S_COUNT = 11172;
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JONG_SS = 20, JONG_L = 8, JONG_B = 17, JONG_D = 7, JONG_H = 27;
  /* 初声（辅音）下标：ㅇ=11 ㅃ=8 ㅆ=10 ㅍ=17 */
  /* 中声（元音）表：下标与 Unicode 一致 */
  var JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  var JUNG_I = JUNG.indexOf.bind(JUNG);

  /* 分解一个音节 → {cho, jung, jong}（cho 下标 0-18，jong 可为 0） */
  function splitSyl(ch) {
    var c = ch.charCodeAt(0) - S_BASE;
    if (c < 0 || c >= S_COUNT) return null;
    var jong = c % 28; c = (c - jong) / 28;
    var jung = c % 21; c = (c - jung) / 21;
    return { cho: c, jung: jung, jong: jong };
  }
  /* 组合初/中/终声下标 → 音节字符 */
  function joinSyl(cho, jung, jong) {
    return String.fromCharCode(S_BASE + (cho * 21 + jung) * 28 + (jong || 0));
  }
  /* 把音节的终声换成指定下标（jung/cho 不变） */
  function withJong(ch, jongIdx) {
    var s = splitSyl(ch);
    return s ? joinSyl(s.cho, s.jung, jongIdx) : ch;
  }
  /* 把音节的中声换成指定下标 */
  function withJung(ch, jungIdx) {
    var s = splitSyl(ch);
    return s ? joinSyl(s.cho, jungIdx, s.jong) : ch;
  }
  function isHangulSyl(ch) { var c = ch.charCodeAt(0) - S_BASE; return c >= 0 && c < S_COUNT; }

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
    '구나', '는다', '는지', '을까', 'ㄹ까', '냐', '세', '니', '야',
    '서', '아', '어', '라', '러'
  ].sort(function (a, b) { return b.length - a.length; });

  /* 剥掉一个助词，剥不了返回 null（至少保留 1 个字） */  function stripSuffix(word) {
    for (var i = 0; i < KOREAN_SUFFIXES.length; i++) {
      var s = KOREAN_SUFFIXES[i];
      if (word.length > s.length && word.slice(-s.length) === s) {
        return word.slice(0, word.length - s.length);
      }
    }
    return null;
  }

  /* ---------- 不规则变形还原（专业实现：按音节分解 + 历史音变规则） ---------- */
  /* 目标：让聊天里出现的口语变形词都能还原到词典原形。
     韩语动词变形 = 词干 + 语尾，其中元音词干 + 았/었 会缩合成一个带 ㅆ 终声的音节
     （가+았→갔、보+았→봤、주+었→줬、하+았→했）。逆变换是本引擎的核心。 */

  /* ㅂ不规则：누워→눕다、고와→곱다：词干末音节补终声 ㅂ，再加 다 */
  function withFinalB(base) {
    if (!base) return null;
    var s = splitSyl(base.slice(-1));
    if (!s || s.jong !== 0) return null;
    return base.slice(0, -1) + joinSyl(s.cho, s.jung, JONG_B) + '다';
  }

  /* 去掉一个音节的终声 ㄹ（르不规则用）：몰 → 모 */
  function removeFinalL(base) {
    if (!base) return null;
    var s = splitSyl(base.slice(-1));
    if (!s || s.jong !== JONG_L) return null;
    return base.slice(0, -1) + joinSyl(s.cho, s.jung, 0);
  }

  /* 中声逆缩合表：带 ㅆ 终声的缩合音节 → 可能的词干中声（按韩语正书法）
     ㅐ→[ㅏ,ㅐ]：했→하다、냈→내다；ㅘ→[ㅗ]：봤→보다、왔→오다、샀→사다；
     ㅙ→[ㅞ]：됐→되다；ㅕ→[ㅣ]：셨→시다(마셨→마시다)、렸→리다(기다렸→기다리다)；
     ㅖ→[ㅕ,ㅣ]：폈→펴다、졌→지다；ㅝ→[ㅜ]：줬→주다；其余单元音保持自身 */
  var CONTRA_MAP = {};
  (function () {
    var put = function (k, arr) { CONTRA_MAP[JUNG_I(k)] = arr.map(function (x) { return JUNG_I(x); }); };
    put('ㅐ', ['ㅏ', 'ㅐ']); put('ㅘ', ['ㅗ']); put('ㅙ', ['ㅞ']);
    put('ㅕ', ['ㅣ']); put('ㅖ', ['ㅕ', 'ㅣ']); put('ㅝ', ['ㅜ']);
    put('ㅟ', ['ㅜ']); put('ㅚ', ['ㅗ']); put('ㅒ', ['ㅐ']);
    JUNG.forEach(function (_, i) { if (!CONTRA_MAP[i]) CONTRA_MAP[i] = [i]; });
  })();

  /* ㅆ 过去式还原：处理词末（或次末）带 ㅆ 终声的音节，返回原形候选列表
     Case1 语尾音节 았/었/였（ㅇ 初声）：整体去掉 → 词干（앉았어→앉、먹었어→먹）
     Case2 缩合音节（非 ㅇ 初声）：按中声逆缩合表还原词干（갔→가、봤→보、마셨→마시）
     Case3 ㅆ 初声（쓰-系脱落）：썼→쓰다、쌌→싸다、켰→크다
     Case4 ㅃ 初声（ㅂ不规则过去）：바빴→바쁘다（ㅃ 保留，中声→ㅡ） */
  function pastTenseVariants(word) {
    var out = [];
    var L = word.length;
    if (L < 1) return out;
    var lastS = splitSyl(word.slice(-1));
    if (!lastS || lastS.jong !== JONG_SS) return out;
    var prefix0 = function (w) { return w.slice(0, -1); };

    function stemPlus(stem) {
      if (!stem) return;
      pushUnique(out, stem);
      pushUnique(out, stem + '다');
    }

    if (lastS.cho === 11) { /* ㅇ 初声：可能是 았/었/였 本体，也可能是缩合（오+았→왔） */
      if (L >= 2) {
        var stem1 = word.slice(0, -1);
        stemPlus(stem1);
        /* ㄷ不规则：걸었어→걷다、들었어→듣다（词干末音节终声 ㄹ → ㄷ） */
        var s1 = splitSyl(stem1.slice(-1));
        if (s1 && s1.jong === JONG_L) stemPlus(stem1.slice(0, -1) + joinSyl(s1.cho, s1.jung, JONG_D));
        /* 连续过去 했었어：去掉一层后递归处理 */
        pastTenseVariants(stem1).forEach(function (v) { pushUnique(out, v); });
      }
      /* ㅇ 初声缩合：왔→오다、웠→우다/눕다、였→이다 */
      var prefix = word.slice(0, -1);
      var jm2 = CONTRA_MAP[lastS.jung] || [lastS.jung];
      jm2.forEach(function (jm) {
        if (jm === lastS.jung) return; /* 纯语尾情况上面已处理 */
        stemPlus(prefix + joinSyl(11, jm, 0));
      });
      if (lastS.jung === 14) { /* 웠：ㅂ不规则过去 누웠→눕다、고웠→곱다 */
        var vbw = withFinalB(prefix);
        if (vbw) pushUnique(out, vbw);
      }
      if (lastS.jung === 6) { /* 였：이다 계열 아니였어→아니다 */
        stemPlus(prefix + '이');
      }
    } else if (lastS.cho === 10) { /* ㅆ 初声：쓰-系脱落 썼→쓰다 */
      var m = lastS.jung;
      var stemMedials = (m === 4 || m === 6) ? [18] : [m]; /* ㅓ/ㅕ → ㅡ */
      stemMedials.forEach(function (jm) {
        var stem2 = word.slice(0, -1) + joinSyl(10, jm, 0);
        stemPlus(stem2);
      });
    } else if (lastS.cho === 8) { /* ㅃ 初声：바빴→바쁘다（ㅃ 保留，中声→ㅡ） */
      var stem3 = word.slice(0, -1) + joinSyl(8, 18, 0);
      stemPlus(stem3);
    } else {
      /* 缩合音节：按中声逆缩合表还原词干 */
      var cands = CONTRA_MAP[lastS.jung] || [lastS.jung];
      cands.forEach(function (jm) {
        var stem4 = word.slice(0, -1) + joinSyl(lastS.cho, jm, 0);
        stemPlus(stem4);
      });
      /* 미+있→밌 缩合：재밌었어→재미있다 */
      if (lastS.cho === 6 && lastS.jung === 20) {
        stemPlus(prefix0(word) + '미있');
      }
      /* 去掉 ㅆ 保留原音节（그랬→그래→(래规则)→그렇다） */
      var bare = word.slice(0, -1) + withJong(word.slice(-1), 0);
      stemPlus(bare);
      /* ㅂ不规则 过去缩合：누웠→눕다 */
      var vb = withFinalB(bare);
      if (vb) pushUnique(out, vb);
    }
    return out;
  }

  /* -겠- 未来语尾剥离：알겠어→알(+다)、모르겠네→모르(+다) */
  function wouldVariants(word) {
    var out = [];
    var idx = word.indexOf('겠');
    if (idx > 0 && idx >= word.length - 3) {
      var stem = word.slice(0, idx);
      if (stem) { pushUnique(out, stem); pushUnique(out, stem + '다'); }
    }
    return out;
  }

  /* 中声替换类不规则（无终声末音节）：
     ㅝ→ㅜ：멈춰→멈추다、배워→배우다；ㅘ→ㅗ：봐→보다、와→오다；
     ㅕ→ㅣ：느려→느리다、줘→주다、마셔→마시다、기다려→기다리다；
     ㅍ/ㅃ+ㅓ|ㅏ→ㅡ：예뻐→예쁘다、슬퍼→슬프다、아파→아프다、배고파→배고프다 */
  function vowelVariant(word) {
    var out = [];
    var s = splitSyl(word.slice(-1));
    if (!s || s.jong !== 0) return out;
    var mk = function (jung) { return word.slice(0, -1) + joinSyl(s.cho, jung, 0) + '다'; };
    if (s.cho === 17 || s.cho === 8) { /* ㅍ/ㅃ 初声 + ㅓ|ㅏ → ㅡ（ㅂ·ㅡ 脱落不规则） */
      if (s.jung === 4 || s.jung === 0) pushUnique(out, mk(18));
    }
    var rep = { 14: 13, 9: 8, 6: 20 }; /* ㅝ→ㅜ, ㅘ→ㅗ, ㅕ→ㅣ */
    if (rep[s.jung] !== undefined) pushUnique(out, mk(rep[s.jung]));
    return out;
  }

  /* 보조용언（辅助动词）剥离：해줘→해(→하다)、알려줘→알려(→알리다)、도와줘→도와(→돕다) */
  function auxVariants(word) {
    var out = [];
    var m = word.match(/^(.{1,10}?)(줘|줘서|주다|줬어|주세요)$/);
    if (m && m[1]) pushUnique(out, m[1]);
    return out;
  }

  /* 词尾变形 → 原形候选（保留原有字符串规则，叠在音节规则之上） */
  function irregularVariants(word) {
    var out = [];
    var last = word.slice(-1);
    var stem = word.slice(0, -1);

    if (last === '워' || last === '와') {
      var vb = withFinalB(stem);
      if (vb) out.push(vb);
    } else if (last === '러') {
      out.push(stem + '르다');
      var vl = removeFinalL(stem);
      if (vl) out.push(vl + '르다');
    } else if (last === '라') {
      var vl2 = removeFinalL(stem);
      if (vl2) out.push(vl2 + '르다');
    } else if (last === '져') {
      out.push(stem + '지다');
    } else if (last === '쳐') {
      out.push(stem + '치다');
    } else if (last === '돼') {
      out.push(stem + '되다');
    } else if (last === '해') {
      out.push(stem + '하다');
    } else if (last === '래') {
      out.push(stem + '렇다');
    }
    return out;
  }

  /* ㅂ니다 敬语还原：합니다→하다、입니다→이다、됩니다→되다、좋습니다→좋다
     规则：以 니다 结尾且倒数第三音节带终声 ㅂ → 去掉 ㅂ + 다 */
  function formalVariants(word) {
    var out = [];
    if (!/니다$/.test(word) || word.length < 3) return out;
    var stem = word.slice(0, -2); /* 去掉 니다 */
    var s = splitSyl(stem.slice(-1));
    if (s && s.jong === JONG_B) {
      pushUnique(out, stem.slice(0, -1) + joinSyl(s.cho, s.jung, 0) + '다');
    } else {
      pushUnique(out, stem + '다');
    }
    return out;
  }

  function pushUnique(list, w) {
    if (w && list.indexOf(w) === -1) list.push(w);
  }

  /* 生成查词候选（工作队列：每个候选自身也会被规则继续展开，保证链条完整
     如 그랬→그래→그렇다、했었→했→하다）。顺序即查词优先级。 */
  function generateCandidates(word) {
    var candidates = [word];
    for (var i = 0; i < candidates.length && candidates.length < 40; i++) {
      var w = candidates[i];
      var add = function (v) { if (v && candidates.indexOf(v) === -1 && candidates.length < 40) candidates.push(v); };
      pastTenseVariants(w).forEach(add);
      wouldVariants(w).forEach(add);
      formalVariants(w).forEach(add);
      irregularVariants(w).forEach(add);
      vowelVariant(w).forEach(add);
      auxVariants(w).forEach(add);
      /* 词干直接加 다 试动词原形（原词和已带 다 的跳过） */
      if (w !== word && !/다$/.test(w)) add(w + '다');
      /* 剥助词（控制深度防爆炸） */
      if (i < 15) {
        var stripped = stripSuffix(w);
        if (stripped && stripped !== w) add(stripped);
      }
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

  /* 启动预加载：已导入过词典就在后台静默解析，点词秒出（避免首次点击卡几秒像"没反应"） */
  setTimeout(function () {
    try { DictEngine.getMeta().catch(function () {}); } catch (e) {}
  }, 2500);
})();
