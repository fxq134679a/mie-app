/* ══ 枫枝螃蟹（maple-crab.js）══
   跟 maple-crab.css、crab-art.js 一起用。聊天页顶栏下面挂一只螃蟹：
   吊在一根从右边伸进来的枫枝梢上（枫枝），或者抓着一根绳子（秋千）。

   ① 点它、或者往下拽：顶栏下面长出一排「未读 · 去哪儿 · 长按 · 设置 · 玩一下」，点哪个，底下像一滴水那样涨出下拉
   ② 长按它：弹出一排小东西（颜文字 / 螃蟹 / 小字章 / 小东西），选一个满屏落下来；按住不放一阵一阵地来
   ③ 「玩一下 › 切字」：这页聊天里的字一个个蹦出来给你切，混着丢上来的螃蟹，切到螃蟹就结束
   ④ 枫枝是一根悬臂弹簧，螃蟹是吊在梢上的摆；侧枝和每片叶子各是一个小角弹簧。叶子自己会飘，拽狠了会被甩掉，落在打字框上沿

   螃蟹长什么样全在 crab-art.js（window.MapleCrabArt），这里只管它在哪、怎么动。
   对外只有 window.MapleCrab。零依赖。 */
(function () {
  'use strict';
  if (window.MapleCrab) return;

  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var SVGNS = 'http://www.w3.org/2000/svg';
  var DEG = 180 / Math.PI;
  var SEQ = 0;
  function f1(v) { return v.toFixed(1); }
  function f3(v) { return Math.round(v * 1000) / 1000; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rr2(a, b) { return a + (b - a) * Math.random(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function seeded(seed) { var s = seed; return function () { return (s = s * 16807 % 2147483647) / 2147483647; }; }
  function art() { return window.MapleCrabArt; }

  /* ── 一片枫叶的叶形：每一裂从指缝到尖是一道往外鼓的弧；五裂为主，偶尔七裂。叶心 (0,0)，中间那裂长 1、尖朝上 ── */
  function leafShape(rnd) {
    var rr = function (a, b) { return a + (b - a) * rnd(); };
    var seven = rnd() < .3, A = seven ? [-142, -98, -50, 0, 50, 98, 142] : [-125, -62, 0, 62, 125],
      Ls = seven ? [.34, .64, .88, 1, .88, .64, .34] : [.57, .83, 1, .83, .57];
    var skew = rr(-7, 7), rs = rr(.24, .3), bs = seven ? .13 : .17;
    var lobes = A.map(function (a, i) { return { a: a + skew * (1 - Math.abs(a) / 160) + rr(-4, 4), L: Ls[i] * (a ? rr(.86, 1.08) : rr(.94, 1.04)), bl: rr(.17, .23), br: rr(.17, .23), bend: rr(-.04, .04) }; });
    var n = lobes.length, pol = function (a, r) { return [Math.sin(a / DEG) * r, -Math.cos(a / DEG) * r]; }, Q = function (p) { return f3(p[0]) + ' ' + f3(p[1]); };
    var sinus = function (i) { return i < 0 ? pol(lobes[0].a - 24, bs) : i >= n - 1 ? pol(lobes[n - 1].a + 24, bs) : pol((lobes[i].a + lobes[i + 1].a) / 2, rs * Math.min(1, (lobes[i].L + lobes[i + 1].L) / 2 + .25)); };
    var out = 'M' + Q(pol(180, bs * .9)) + 'L' + Q(sinus(-1)), shade = '', veins = '';
    lobes.forEach(function (lo, i) {
      var th = lo.a / DEG, u = [Math.sin(th), -Math.cos(th)], nr = [Math.cos(th), Math.sin(th)], L = lo.L,
        tip = [u[0] * L + nr[0] * lo.bend, u[1] * L + nr[1] * lo.bend],
        cl = [u[0] * L * .52 - nr[0] * L * lo.bl, u[1] * L * .52 - nr[1] * L * lo.bl], cr = [u[0] * L * .52 + nr[0] * L * lo.br, u[1] * L * .52 + nr[1] * L * lo.br], s2 = sinus(i);
      out += 'Q' + Q(cl) + ' ' + Q(tip) + 'Q' + Q(cr) + ' ' + Q(s2);
      shade += 'M0 0L' + Q(tip) + 'Q' + Q(cr) + ' ' + Q(s2) + 'Z';
      veins += 'M0 0L' + Q([tip[0] * .86, tip[1] * .86]);
    });
    return { outline: out + 'Z', shade: shade, veins: veins };
  }
  /* 额外飘的叶子、「小东西」里的叶子都用这几种叶形（固定种子：每次打开都一样） */
  var SHAPES = (function () { var r = seeded(4099); return Array.from({ length: 6 }, function () { return leafShape(r); }); })();

  /* ── 长按出来的几类。type 决定怎么画：text 原样显示、stamp 一枚小字章、crab 一张螃蟹表情、svg 给好的图 ── */
  var KAO = ['(｡•́︿•̀｡)', '(´･ω･`)', '(≧▽≦)', 'ヾ(•ω•`)o', '(๑•̀ㅂ•́)و✧', '(つд⊂)', '(｡･ω･｡)ﾉ♡', '(╯°□°）╯', '(￣▽￣)', '(*/ω＼*)', 'ฅ^•ﻌ•^ฅ', '(；′⌒`)'];
  var STAMPS = ['戳', '理我', '在吗', '哼', '抱抱', '好耶', '饿了', '晚安', '坏蛋', '嘿嘿'];
  function heart(c) { return function (s) { return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '"><path d="M12 20.5s-7.3-4.4-9.3-9C1.3 8.1 3.3 4.6 6.7 4.6c2 0 3.5 1.1 5.3 3.1 1.8-2 3.3-3.1 5.3-3.1 3.4 0 5.4 3.5 4 6.9-2 4.6-9.3 9-9.3 9z" fill="' + c + '"/></svg>'; }; }
  function leafIcon(f, e, k) { return function (s) { var sh = SHAPES[k]; return '<svg viewBox="-1.15 -1.12 2.3 2.24" width="' + s + '" height="' + s + '"><path d="' + sh.outline + '" fill="' + f + '" stroke="' + e + '" stroke-width=".04"/><path d="' + sh.veins + '" fill="none" stroke="' + e + '" stroke-width=".04" stroke-opacity=".7"/></svg>'; }; }
  var BITS = [
    { name: '喜欢', svg: heart('#d9573f') }, { name: '粉粉的', svg: heart('#f2a0a8') },
    { name: '红叶', svg: leafIcon('#d4553a', '#a2303b', 2) }, { name: '青叶', svg: leafIcon('#76b05a', '#4d8b45', 1) }, { name: '黄叶', svg: leafIcon('#e9a13f', '#b8771f', 3) },
    { name: '星星', svg: function (s) { return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '"><path d="M12 2.8l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="#f2c14e" stroke="#c99a2e" stroke-width=".8" stroke-linejoin="round"/></svg>'; } },
    { name: '小螃蟹', svg: function (s) { return art().face('', s); } }
  ];
  function defaultSets() {
    var s = [
      { key: 'kao', label: '颜文字', type: 'text', items: KAO.slice() },
      { key: 'crab', label: '螃蟹', type: 'crab', items: art().faces.map(function (f) { return f.key; }) },
      { key: 'stamp', label: '小字章', type: 'stamp', items: STAMPS.slice() },
      { key: 'bits', label: '小东西', type: 'svg', items: BITS.slice() }
    ];
    if (art().scenes && art().scenes.length) s.splice(2, 0, { key: 'doing', label: '在干嘛', type: 'img', items: art().scenes.slice() });
    return s;
  }
  function stampSVG(t, s) {
    var two = t.length > 1, vw = two ? 30 : 24;
    return '<svg viewBox="0 0 ' + vw + ' 24" width="' + (two ? s * 1.25 : s) + '" height="' + s + '"><rect x="1.2" y="1.2" width="' + (vw - 2.4) + '" height="21.6" rx="4" style="fill:var(--card,#fffdfa);stroke:var(--accent,#b5533a)" stroke-width="1.6"/>' +
      '<text x="' + vw / 2 + '" y="16.3" text-anchor="middle" font-size="' + (two ? 10 : 11.5) + '" font-weight="800" style="fill:var(--accent,#b5533a)" font-family="PingFang SC,Hiragino Sans GB,sans-serif">' + esc(t) + '</text></svg>';
  }
  /* 把一类补齐成 { name(x), wide(x), icon(x, size) } */
  function normSet(S) {
    var t = S.type || 'text', faceName = function (k) { var f = art().faces.filter(function (x) { return x.key === k; })[0]; return f ? f.name : k; };
    var d = {
      text: { name: function (x) { return String(x); }, wide: function () { return true; }, icon: function (x, s) { return '<span class="mc-kao" style="font-size:' + Math.round(s * .36) + 'px">' + esc(x) + '</span>'; } },
      stamp: { name: function (x) { return String(x); }, wide: function (x) { return String(x).length > 1; }, icon: function (x, s) { return stampSVG(String(x), s); } },
      crab: { name: faceName, wide: function () { return false; }, icon: function (x, s) { return art().face(x, s); } },
      svg: { name: function (x) { return x.name || ''; }, wide: function () { return false; }, icon: function (x, s) { return typeof x.svg === 'function' ? x.svg(s) : String(x.svg).replace('<svg', '<svg width="' + s + '" height="' + s + '"'); } },
      img: { name: function (x) { return x.name || ''; }, wide: function () { return false; }, icon: function (x, s) {
        var im = '<img class="mc-img" src="' + esc(x.src) + '" alt="" draggable="false"';
        if (!x.zoom || s >= 50) return im + ' width="' + s + '" height="' + s + '">';
        /* 小格子里只看中间那一块：图四周留了很多空，按 zoom 放大、以 focus 为中心裁 */
        var Sz = Math.round(s * x.zoom), f = x.focus || [.5, .5];
        return '<span class="mc-crop" style="width:' + s + 'px;height:' + s + 'px">' + im + ' width="' + Sz + '" height="' + Sz + '" style="left:' + Math.round(s / 2 - f[0] * Sz) + 'px;top:' + Math.round(s / 2 - f[1] * Sz) + 'px"></span>';
      } }
    }[t] || {};
    return { key: S.key, label: S.label || S.key, type: t, items: S.items || [], name: S.name || d.name, wide: S.wide || d.wide, icon: S.render || d.icon };
  }

  var MENUS = [{ k: 'unread', t: '未读' }, { k: 'go', t: '去哪儿' }, { k: 'press', t: '长按' }, { k: 'settings', t: '设置' }, { k: 'play', t: '玩一下' }];
  /* 「设置」那张下拉：单选几组在上，勾选在下，最底下收起 */
  var RADIOS = [
    { k: 'carrier', t: '挂在', ops: [['branch', '枫枝'], ['swing', '秋千']] },
    { k: 'variant', t: '那行小字', ops: [['line', '一行字'], ['drop', '水滴']] },
    { k: 'season', t: '季节', ops: [['green', '夏天'], ['red', '秋天']] },
    { k: 'speed', t: '切字速度', ops: [[.5, '慢'], [.75, '中'], [1, '快']] }
  ];
  var TOGGLES = [{ k: 'move', t: '移动' }, { k: 'doze', t: '没人理就打瞌睡' }, { k: 'wind', t: '有风' }, { k: 'leaves', t: '飘叶子' }, { k: 'up', t: '长按的东西往上冒' }];
  var CHECK = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  var MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>';
  /* 每个字底下那道手画波浪，各画各的 */
  function wob(i) { var r = function (n) { return ((Math.sin(i * 12.9 + n * 78.2) * 43758.5) % 1 + 1) % 1; }; var d = 'M0 ' + (3 + r(0) * 1.5); for (var s = 1; s <= 4; s++) d += ' Q' + (s * 10 - 5) + ' ' + (1 + r(s) * 4) + ' ' + (s * 10) + ' ' + (2.5 + r(s + 9) * 1.5); return d; }
  function ul(i) { return '<svg class="mc-ul" viewBox="0 0 40 6" preserveAspectRatio="none"><path pathLength="1" d="' + wob(i) + '"/></svg>'; }

  function mount(host, o) {
    o = o || {};
    if (!art()) throw new Error('MapleCrab：先加载 crab-art.js');
    var uid = ++SEQ;
    var pick = function (s) { return !s ? null : typeof s === 'string' ? host.querySelector(s) : s; };
    var bar = pick(o.bar), chat = pick(o.chat), ipt = pick(o.input);
    if (!bar) throw new Error('MapleCrab.mount：要给 bar（顶栏）');
    var PLACES = (o.places || []).slice();
    var SETS = (o.sets || defaultSets()).map(normSet);
    var TRIG = MENUS.filter(function (t) { return !o.menus || o.menus.indexOf(t.k) >= 0; });
    var S = { carrier: 'branch', variant: 'line', season: 'green', speed: .5, wind: false, leaves: !REDUCE, doze: true, up: false, press: SETS[0] && SETS[0].key, shown: true, offX: 0, offY: 0, move: false };
    Object.keys(S).forEach(function (k) { if (o[k] !== undefined) S[k] = o[k]; });
    var mid = 0;
    function normMsg(m) { return { id: m.id != null ? m.id : 'mc' + (++mid), place: m.place, text: m.text, at: m.at || '' }; }
    var MSGS = (o.unread || []).map(normMsg);
    function emit(name, a) { var f = o[name]; if (typeof f === 'function') { try { f(a); } catch (e) { console.error(e); } } }
    function placeName(k) { for (var i = 0; i < PLACES.length; i++) if (PLACES[i].key === k) return PLACES[i].label; return k; }
    function setByKey(k) { return SETS.filter(function (x) { return x.key === k; })[0] || SETS[0]; }

    /* ── 搭 DOM：那一排塞在顶栏后面（正常文档流，打开时把聊天往下推），其余都是盖在 host 上的层 ── */
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.classList.add('mc-host');
    bar.classList.add('mc-bar');
    function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
    function mks(tag, at, par) { var e = document.createElementNS(SVGNS, tag); for (var k in at) e.setAttribute(k, at[k]); if (par) par.appendChild(e); return e; }
    var fold = mk('div', 'mc-fold'), row = mk('div', 'mc-row');
    fold.appendChild(row); bar.insertAdjacentElement('afterend', fold);
    var gooA = 'mc-goo-a' + uid, gooB = 'mc-goo-b' + uid;
    var defs = mks('svg', { 'class': 'mc-defs', width: 0, height: 0, 'aria-hidden': 'true' });
    defs.innerHTML = '<filter id="' + gooB + '"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>' +
      '<filter id="' + gooA + '"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>';
    var tree = mks('svg', { 'class': 'mc-tree', 'aria-hidden': 'true' });
    tree.innerHTML = '<path class="t-stemsB" fill="none" stroke="#6e4535" stroke-width=".9" stroke-linecap="round"/><g class="t-leavesB"></g><g class="t-bark"></g>' +
      '<path class="t-lo" fill="none" stroke="#3e2c22" stroke-width="1.6" stroke-linecap="round" opacity=".28"/><path class="t-hi" fill="none" stroke="#b39883" stroke-width="1" stroke-linecap="round" opacity=".55"/>' +
      '<path class="t-stems" fill="none" stroke="#8e5240" stroke-width="1" stroke-linecap="round"/><g class="t-leaves"></g><path class="mc-hit" fill="none" stroke="transparent" stroke-width="26"/>';
    var T = function (c) { return tree.querySelector('.' + c); };
    var ropeL = mks('svg', { 'class': 'mc-rope', 'aria-hidden': 'true' });
    var ropePath = mks('path', { fill: 'none', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ropeL);
    function crabEl(pose) {
      var L = art().live(pose), e = mk('div', 'mc-crab mc-' + pose, '<div class="mc-shake">' + L.html + '<span class="mc-zz a">z</span><span class="mc-zz b">z</span></div>');
      e.setAttribute('role', 'button'); e.tabIndex = 0;
      e.setAttribute('aria-label', '螃蟹：点一下打开顶上那一排，长按丢小东西');
      e.querySelectorAll('.mc-zz').forEach(function (z) { z.style.left = L.zz[0] + 'px'; z.style.top = L.zz[1] + 'px'; });
      e.addEventListener('animationend', function (ev) { if (ev.target.classList.contains('mc-shake')) e.classList.remove('tick', 'poked'); });   /* 一扁、一哆嗦放完就摘，下一次才放得出来 */
      return { el: e, L: L, svg: e.querySelector('.mc-art') };
    }
    var CB = crabEl('hang'), CS = crabEl('swing'), crabB = CB.el, crabS = CS.el;
    var toast = mk('div', 'mc-toast'); toast.setAttribute('role', 'status');
    var dd = mk('div', 'mc-dd', '<div class="mc-gg" style="filter:url(#' + gooB + ')"><i class="tb"></i><i class="pb"></i></div><div class="mc-ct"></div>');
    var ddc = dd.querySelector('.mc-ct'), BLOB = { tb: dd.querySelector('.tb'), pb: dd.querySelector('.pb') };
    var pill = mk('div', 'mc-pill'), rain = mk('div', 'mc-rain');
    var game = mk('div', 'mc-game', '<canvas></canvas><div class="mc-hud"><span><b>0</b>分</span><button type="button" class="mc-ch mc-gx">不玩了</button></div>' +
      '<div class="mc-over" role="dialog"><b></b><span></span><div class="mc-bt"><button type="button" class="mc-ch main mc-gre">再来' + ul(7) + '</button><i>·</i><button type="button" class="mc-ch mc-gq">不玩了</button></div></div>');
    [defs, tree, ropeL, crabB, crabS, toast, dd, pill, rain, game].forEach(function (e) { host.appendChild(e); });

    /* ── 尺寸：只在开始和 host 变大小时量，帧里不读布局 ── */
    var W = 0, H = 0, BAR = 0, rowH = 0;
    function measure() { var hr = host.getBoundingClientRect(), br = bar.getBoundingClientRect(); W = host.clientWidth; H = host.clientHeight; BAR = br.bottom - hr.top - host.clientTop; if (row) rowH = row.offsetHeight || rowH; }
    measure();

    var hint = o.hints !== false;
    function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('on'); }, 1200); }

    /* ═══════════ 头顶那一排 ═══════════ */
    var open = false, menu = null, fh = 0, fv = 0, fraf = 0, flast = 0, hold = 0;
    var mode = 'gone', cx = 0, cy = 0;               /* 枫枝上那只：gone / fall / hang / up */
    var sw = { on: false, leaving: false };            /* 秋千那只 */
    var N = 9, P = [];
    function AX() { return W * .8 + (S.offX || 0); }
    function AY() { return BAR + rowH + (S.offY || 0); }   /* 定高，不用正在弹的 fh，不然一展开就往下掉 */
    function render() {
      row.className = 'mc-row ' + S.variant + (open ? ' on' : ''); var n = MSGS.length;
      var lab = function (t, i, dl) {
        return '<span class="mc-w' + (t.k === 'unread' && !n ? ' zero' : '') + (menu === t.k ? ' cur' : '') + '" data-k="' + t.k + '" role="button" tabindex="0" style="--d:' + dl + 'ms">' + t.t +
          (t.k === 'unread' ? '<sup class="n">' + (n || '') + '</sup>' + (S.variant === 'line' ? ul(i) : '') : '') + '</span>';
      };
      if (S.variant === 'line') row.innerHTML = '<div class="mc-in">' + TRIG.map(function (t, i) { return lab(t, i, i * 55); }).join('') + '</div>';
      else {
        blobs = [];
        row.innerHTML = '<div class="mc-in"><div class="mc-gl" style="filter:url(#' + gooA + ')">' + TRIG.map(function () { return '<s></s><b></b>'; }).join('') + TRIG.map(function () { return '<i></i>'; }).join('') +
          '</div><div class="mc-lb">' + TRIG.map(function (t, i) { return lab(t, i, 800 + i * 110); }).join('') + '</div></div>';
        requestAnimationFrame(function () { drip(open); });
      }
      rowH = row.offsetHeight || rowH;
    }
    /* 水滴：先在螃蟹那儿凝一滴，再从最远的那颗起一颗颗流到自己底下；藏起来倒过来 */
    var blobs = [], graf = 0, glast = 0;
    function srcX() { var x = S.carrier === 'swing' ? AX() : mode === 'hang' ? cx - 8 : W * .62; return { x: Math.max(24, Math.min(W - 44, x)) - 14, w: 28 }; }
    function drip(on) {
      var inn = row.querySelector('.mc-in'), lb = row.querySelector('.mc-lb'); if (!lb) return;
      var rr = inn.getBoundingClientRect(), r0 = row.getBoundingClientRect(), now = performance.now();
      var n = TRIG.length, step = Math.min(110, 600 / Math.max(1, n)), sr = srcX(), src = { x: sr.x - (rr.left - r0.left), w: sr.w };
      var gb = row.querySelectorAll('.mc-gl b'), gs = row.querySelectorAll('.mc-gl s');
      Array.prototype.forEach.call(row.querySelectorAll('.mc-gl i'), function (el, i) {
        var s = lb.children[i].getBoundingClientRect();
        var b = blobs[i] || (blobs[i] = { x: src.x + 7, y: -30, w: 14, vx: 0, vy: 0, vw: 0, tr: [{ f: .4, x: src.x + 14, y: -30, vx: 0, vy: 0 }] });
        b.el = el; b.tr[0].el = gb[i]; b.neck = gs[i];
        var home = { tx: s.left - rr.left - 11, ty: 0, tw: s.width + 22 }, drop = { tx: src.x, ty: 0, tw: src.w }, up = { tx: src.x + 7, ty: -30, tw: 14 }, back = Math.min(70, 300 / Math.max(1, n));
        b.plan = on ? [Object.assign({ at: now, k: 70 }, drop), Object.assign({ at: now + 380 + i * step, k: 55 }, home)]
          : [Object.assign({ at: now + (n - 1 - i) * back, k: 90 }, drop), Object.assign({ at: now + (n - 1) * back + 260, k: 80 }, up)];
      });
      if (!graf) { glast = now; graf = requestAnimationFrame(gstep); }
    }
    function gstep(now) {
      var dt = Math.min(.033, (now - glast) / 1000), busy = false; glast = now;
      blobs.forEach(function (b) {
        if (!b || !b.plan) return;
        var p = b.plan[0]; b.plan.forEach(function (s) { if (s.at <= now) p = s; }); if (p !== b.plan[b.plan.length - 1]) busy = true;
        var k = p.k, c = 2 * Math.sqrt(k) * .62;
        ['x', 'y', 'w'].forEach(function (q) { var t = p['t' + q]; b['v' + q] += (-k * (b[q] - t) - c * b['v' + q]) * dt; b[q] += b['v' + q] * dt; if (Math.abs(b[q] - t) > .3 || Math.abs(b['v' + q]) > .3) busy = true; });
        b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; b.el.style.width = Math.max(4, b.w) + 'px';
        var cx2 = b.x + b.w / 2;
        b.tr.forEach(function (t) {
          var tk = k * t.f, tc = 2 * Math.sqrt(tk) * .7;
          t.vx += (-tk * (t.x - cx2) - tc * t.vx) * dt; t.x += t.vx * dt; t.vy += (-tk * (t.y - b.y) - tc * t.vy) * dt; t.y += t.vy * dt;
          if (Math.abs(t.x - cx2) > .3 || Math.abs(t.vx) > .3) busy = true; t.el.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px)';
        });
        var t0 = b.tr[0], x0 = Math.min(cx2, t0.x), nw = Math.abs(cx2 - t0.x), nh = Math.max(0, 12 - nw / 14);   /* 两颗之间那道水颈：越远越细 */
        b.neck.style.width = nw + 'px'; b.neck.style.height = nh + 'px'; b.neck.style.transform = 'translate(' + x0 + 'px,' + (40.5 + (b.y + t0.y) / 2 - nh / 2) + 'px)';
      });
      graf = busy ? requestAnimationFrame(gstep) : 0;
    }
    /* 展开：高度走弹簧；水滴收起时等水珠聚回去再合上 */
    function setOpen(on) {
      if (!on) closeMenu();
      if (on && !open) { render(); void row.offsetWidth; }
      open = on; row.classList.toggle('on', on);
      if (S.variant === 'drop') { drip(on); hold = on ? 0 : performance.now() + Math.min(70 * Math.max(0, TRIG.length - 1), 300) + 300; }
      if (!fraf) { flast = performance.now(); fraf = requestAnimationFrame(fstep); }
      wake();
    }
    function fstep(now) {
      var dt = Math.min(.033, (now - flast) / 1000), keep = open || now < hold, t = keep ? row.offsetHeight : 0, k = 300, c = 2 * Math.sqrt(k) * .6; flast = now;
      fv += (-k * (fh - t) - c * fv) * dt; fh += fv * dt; fold.style.height = Math.max(0, fh) + 'px'; wake();
      if (now < hold || Math.abs(fh - t) > .4 || Math.abs(fv) > .4) fraf = requestAnimationFrame(fstep); else { fh = t; fold.style.height = t + 'px'; fraf = 0; }
    }
    row.addEventListener('click', function (e) { var w = e.target.closest('.mc-w'); if (!w) return; touch(); openMenu(w.dataset.k); });
    row.addEventListener('keydown', function (e) { var w = e.target.closest('.mc-w'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); touch(); openMenu(w.dataset.k); } });
    function refreshCount() {
      var n = MSGS.length, w = row.querySelector('.mc-w[data-k="unread"]');
      if (w) { w.classList.toggle('zero', !n); var c = w.querySelector('.n'); if (c && n) c.textContent = n; }
      emit('onUnread', n); wake();
    }

    /* ═══════════ 下拉：按钮那儿一小滴＋底下一大滴，过 goo 连成一滴水往下涨 ═══════════ */
    var B = { tb: { x: 0, y: 0, w: 0, h: 0, v: {}, t: { x: 0, y: 0, w: 0, h: 0 } }, pb: { x: 0, y: 0, w: 0, h: 0, v: {}, t: { x: 0, y: 0, w: 0, h: 0 } } };
    var ddraf = 0, ddlast = 0, ddR = { x: 0, y: 0, w: 0, h: 0 };   /* 下拉内容占的那一块：水滴涨到哪儿，字露到哪儿 */
    function item(i, attrs, inner, cls) { return '<button type="button" class="mc-it ' + (cls || '') + '" ' + attrs + ' style="--i:' + i + '">' + inner + '</button>'; }
    function menuHTML(k) {
      var i = 0, h = '';
      if (k === 'unread') {
        if (!MSGS.length) return '<div class="mc-empty">都看过了</div>';
        var groups = []; MSGS.forEach(function (m) { if (groups.indexOf(m.place) < 0) groups.push(m.place); });
        groups.forEach(function (g) {
          h += '<div class="mc-lbl">' + esc(placeName(g)) + '</div>';
          MSGS.forEach(function (m) { if (m.place === g) h += item(i++, 'data-m="' + esc(m.id) + '"', '<span class="tx">' + esc(m.text) + '</span><span class="sh">' + esc(m.at) + '</span>'); });
        });
        return h + '<div class="mc-sep"></div>' + item(i, 'data-act="allread"', '<span class="tx">都标成看过了</span>', 'mute');
      }
      if (k === 'go') return PLACES.length ? PLACES.map(function (p) { return item(i++, 'data-go="' + esc(p.key) + '"', '<span>' + esc(p.label) + '</span>'); }).join('') : '<div class="mc-empty">没有设去处</div>';
      if (k === 'press') return '<div class="mc-lbl">长按螃蟹出来哪一种</div>' + SETS.map(function (St) {
        return item(i++, 'data-set="' + esc(St.key) + '" role="menuitemradio" aria-checked="' + (S.press === St.key) + '"', '<span class="ck">' + (S.press === St.key ? CHECK : '') + '</span><span class="tx">' + esc(St.label) + '</span><span class="prev">' + St.items.slice(0, 3).map(function (x) { return St.icon(x, 18); }).join('') + '</span>');
      }).join('');
      if (k === 'settings') {
        RADIOS.forEach(function (R) {
          h += '<div class="mc-rg"><div class="mc-lbl">' + R.t + '</div><div class="mc-segs" role="group" aria-label="' + R.t + '">' + R.ops.map(function (op) {
            var on = S[R.k] === op[0]; return item(i++, 'data-r="' + R.k + '" data-v="' + op[0] + '" aria-pressed="' + on + '"', op[1], on ? 'on' : '');
          }).join('') + '</div></div>';
        });
        h += '<div class="mc-sep"></div>' + TOGGLES.map(function (t) { return item(i++, 'data-opt="' + t.k + '" role="menuitemcheckbox" aria-checked="' + !!S[t.k] + '"', '<span class="ck">' + (S[t.k] ? CHECK : '') + '</span><span class="tx">' + t.t + '</span>'); }).join('');
        return h + '<div class="mc-sep"></div>' + item(i, 'data-act="hide"', '<span class="tx">藏起来</span>', 'warn');
      }
      if (k === 'play') return item(i++, 'data-play="slice"', '<span class="tx">切字</span>') + item(i, 'data-play="toss"', '<span class="tx">丢它点东西</span>');
      return '';
    }
    /* 量那个字最后停在哪儿，不算它身上正在走的动画：那一排刚长出来时字还在往下滑（translateY），按下去时还缩着（scale），
       照当下量，水滴会长歪、冒出这一行（没有未读、点螃蟹现开那一排、马上点「设置」时最明显） */
    function settled(el) {
      var r = el.getBoundingClientRect(), m = getComputedStyle(el).transform, tx = 0, ty = 0;
      if (m && m !== 'none') { var v = m.slice(m.indexOf('(') + 1, -1).split(',').map(parseFloat); if (v.length === 6) { tx = v[4]; ty = v[5]; } else if (v.length === 16) { tx = v[12]; ty = v[13]; } }
      var w = el.offsetWidth, h = el.offsetHeight; return { l: (r.left + r.right) / 2 - tx - w / 2, t: (r.top + r.bottom) / 2 - ty - h / 2, w: w, h: h };
    }
    function trigRect(k) { var el = row.querySelector('.mc-w[data-k="' + k + '"]'); if (!el) return null; var pr = host.getBoundingClientRect(), r = settled(el); return { x: r.l - pr.left, y: r.t - pr.top, w: r.w, h: r.h }; }
    var PW = { go: 240, unread: 290, play: 170, settings: 250, press: 250 };
    function openMenu(k, again) {
      if (menu === k && !again) { closeMenu(); return; }
      var r = trigRect(k); if (!r) return; var was = !!menu; menu = k;
      row.querySelectorAll('.mc-w').forEach(function (w) { w.classList.toggle('cur', w.dataset.k === k); });
      ddc.className = 'mc-ct' + (k === 'go' ? ' grid' : ''); ddc.setAttribute('role', 'menu'); ddc.innerHTML = menuHTML(k);
      var pw = Math.min(PW[k] || 250, W - 16); ddc.style.width = pw + 'px'; var ph = ddc.offsetHeight,
        left = Math.max(8, Math.min(W - 8 - pw, r.x + r.w / 2 - pw / 2)), top = r.y + r.h + 9;
      ddc.style.left = left + 'px'; ddc.style.top = top + 'px';
      B.tb.t = { x: r.x - 7, y: r.y - 3, w: r.w + 14, h: r.h + 6 };
      if (!was) { Object.assign(B.tb, { x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 }); Object.assign(B.pb, { x: r.x + r.w / 2 - 11, y: r.y + r.h - 5, w: 22, h: 16 }); }
      B.pb.t = { x: left, y: top, w: pw, h: ph }; ddR = { x: left, y: top, w: pw, h: ph };
      if (!again) { dd.classList.remove('on'); void dd.offsetWidth; } dd.classList.add('on'); kick();
    }
    function closeMenu() {
      if (!menu) return; menu = null;
      if (ddc.contains(document.activeElement)) document.activeElement.blur();   /* 焦点别留在看不见的按钮上 */
      row.querySelectorAll('.mc-w.cur').forEach(function (w) { w.classList.remove('cur'); }); dd.classList.remove('on');
      var t = B.tb.t; B.pb.t = { x: t.x + t.w / 2 - 10, y: t.y + t.h - 8, w: 20, h: 12 }; B.tb.t = { x: t.x + t.w / 2, y: t.y + t.h / 2, w: 0, h: 0 }; kick();
      setTimeout(function () { if (!menu) { Object.assign(B.pb.t, { x: t.x + t.w / 2, y: t.y + t.h - 4, w: 0, h: 0 }); kick(); } }, 260);   /* 先缩回按钮底下成一小滴，再收没 */
    }
    function rebuildMenu() { if (!menu) return; ddc.innerHTML = menuHTML(menu); B.pb.t.h = ddR.h = ddc.offsetHeight; kick(); }
    /* 设置变了：开着的那张下拉原地改勾，不重画（重画会把每一项的淡入再放一遍） */
    function syncMenu() {
      var mark = function (b, on, attr) { b.setAttribute(attr, String(on)); var ck = b.querySelector('.ck'); if (ck) ck.innerHTML = on ? CHECK : ''; else b.classList.toggle('on', on); };
      if (menu === 'settings') {
        ddc.querySelectorAll('[data-r]').forEach(function (b) { mark(b, String(S[b.dataset.r]) === b.dataset.v, 'aria-pressed'); });
        ddc.querySelectorAll('[data-opt]').forEach(function (b) { mark(b, !!S[b.dataset.opt], 'aria-checked'); });
      } else if (menu === 'press') ddc.querySelectorAll('[data-set]').forEach(function (b) { mark(b, S.press === b.dataset.set, 'aria-checked'); });
    }
    function kick() { if (!ddraf) { ddlast = performance.now(); ddraf = requestAnimationFrame(ddStep); } }
    function ddStep(now) {
      var dt = Math.max(0, Math.min(.033, (now - ddlast) / 1000)), busy = false; ddlast = now;
      ['tb', 'pb'].forEach(function (n) {
        var b = B[n];
        ['x', 'y', 'w', 'h'].forEach(function (q) {
          var k = n === 'pb' ? (q === 'h' ? 170 : 230) : 320, c = 2 * Math.sqrt(k) * (n === 'pb' ? .6 : .75);
          b.v[q] = (b.v[q] || 0) + (-k * (b[q] - b.t[q]) - c * (b.v[q] || 0)) * dt; b[q] += b.v[q] * dt;
          if (Math.abs(b[q] - b.t[q]) > .3 || Math.abs(b.v[q]) > .3) busy = true;
        });
        var el = BLOB[n], w = Math.max(0, b.w), h = Math.max(0, b.h);
        el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.borderRadius = Math.min(n === 'pb' ? 14 : 99, w / 2, h / 2) + 'px';
      });
      var b = B.pb, r = ddR, px = function (v) { return Math.max(0, v).toFixed(1) + 'px'; };   /* 内容只在那滴水里面露出来 */
      ddc.style.clipPath = 'inset(' + px(b.y - r.y) + ' ' + px(r.x + r.w - b.x - b.w) + ' ' + px(r.y + r.h - b.y - b.h) + ' ' + px(b.x - r.x) + ' round 14px)';
      ddraf = busy ? requestAnimationFrame(ddStep) : 0;
      if (!busy && !menu) ['tb', 'pb'].forEach(function (n) { B[n].w = B[n].h = 0; BLOB[n].style.width = BLOB[n].style.height = '0px'; });   /* 停稳了又没开着：两滴都清干净 */
    }
    ddc.addEventListener('click', function (e) {
      var r = e.target.closest('[data-r]');
      if (r) { var v = r.dataset.v, R = RADIOS.filter(function (x) { return x.k === r.dataset.r; })[0]; set(r.dataset.r, R.ops.filter(function (op) { return String(op[0]) === v; })[0][0]); touch(); return; }
      var b = e.target.closest('.mc-it'); if (!b) return; touch(); var d = b.dataset;
      if (d.m) { var m = MSGS.filter(function (x) { return String(x.id) === d.m; })[0]; if (!m) return; MSGS = MSGS.filter(function (x) { return x !== m; }); refreshCount(); b.classList.add('gone'); setTimeout(rebuildMenu, 200); emit('onRead', m); return; }
      if (d.act === 'allread') { var all = MSGS; MSGS = []; refreshCount(); rebuildMenu(); setTimeout(closeMenu, 700); emit('onAllRead', all); return; }
      if (d.go) { closeMenu(); setTimeout(function () { setOpen(false); }, 260); emit('onGo', d.go); return; }
      if (d.set) { set('press', d.set); if (hint) say('长按出来：' + setByKey(d.set).label); return; }
      if (d.opt) { set(d.opt, !S[d.opt]); return; }
      if (d.play) { closeMenu(); setOpen(false); play(d.play); return; }
      if (d.act === 'hide') hide();
    });
    function onDocDown(e) {
      if (menu && !dd.contains(e.target) && !row.contains(e.target)) closeMenu();
      if (pill.classList.contains('on') && !pill.contains(e.target) && !crabB.contains(e.target) && !crabS.contains(e.target)) closePill();
    }
    document.addEventListener('pointerdown', onDocDown);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePill(); closeMenu(); } });

    /* ═══════════ 枫枝：从右边伸进来的悬臂。梢往下弯 d（端部受力的挠曲线），d 是个弹簧 ═══════════ */
    var LB = function () { return W * .46; }, BY = function () { return AY() + 42; }, SG = .9;   /* 螃蟹抓在梢前一点 */
    var d = 0, dv = 0, dRest = 0, toff = 0, toffV = 0, treeHidden = false;
    function treeOn() { return S.shown && S.carrier === 'branch'; }
    function toffT() { return treeOn() ? 0 : W * .62; }
    toff = toffT();
    function shape(s) { var L = LB(), u = s / L; return { x: W + 6 - s + toff + (S.offX || 0), y: BY() - 16 * u * u + d * u * u * (3 - u) / 2 }; }
    function knot(s) { var u = s / LB(); return (1.6 * Math.sin(s * .07 + .8) + .7 * Math.sin(s * .21)) * Math.max(0, 1 - Math.max(0, u - .72) / .16); }   /* 自然的起伏；抓手那截收平 */
    var rnd = seeded(97531), rr = function (a, b) { return a + (b - a) * rnd(); };
    /* 侧枝：p 挂在哪根（-1＝主枝）、t 在母枝哪儿、a 往哪边伸（弧度）、len 多长、bend 一路弯多少、w 根多粗 */
    var BRS = [
      { p: -1, t: .15, a: .68, len: 58, bend: -.6, w: 3.4 },       /* 往上那根，上半截藏在顶栏后头 */
      { p: 0, t: .52, a: -.66, len: 23, bend: .3, w: 1.5 },        /* 它半路岔出去的小杈 */
      { p: -1, t: .37, a: -.5, len: 42, bend: .6, w: 2.6 },        /* 往下那根，梢头翘起来 */
      { p: -1, t: .59, a: .44, len: 27, bend: -.18, w: 1.8 },      /* 短的往上 */
      { p: -1, t: .74, a: -.42, len: 8, bend: 0, w: 1.7, stub: 1 } /* 断了的小桩 */
    ];
    /* 叶子：长在哪根、t 在哪儿、side 往上 1 / 往下 -1、pa 叶柄离枝多少、pl 叶柄多长、ba 叶片往前收多少、R 多大、back 在枝后面 */
    var LEAVES = [
      { p: -1, t: .07, side: 1, pa: 1.15, pl: 10, ba: .3, R: 11.5, back: 1 }, { p: -1, t: .27, side: -1, pa: 1.05, pl: 9, ba: .2, R: 12, back: 1 },
      { p: -1, t: .48, side: 1, pa: .95, pl: 10, ba: .15, R: 12.5 }, { p: -1, t: .66, side: -1, pa: 1.25, pl: 8, ba: .05, R: 10.5, back: 1 },
      { p: -1, t: .85, side: -1, pa: .85, pl: 9, ba: .35, R: 11.5 },
      { p: -1, t: 1, side: 1, pa: .3, pl: 7, ba: .05, R: 10, drop: 1 },   /* 梢上那片：螃蟹抓上来那一下多半震掉它 */
      { p: -1, t: .97, side: -1, pa: .7, pl: 5, ba: .2, R: 6.5 },
      { p: 0, t: .4, side: -1, pa: 1.0, pl: 9, ba: .2, R: 12, back: 1 }, { p: 0, t: 1, side: 1, pa: .18, pl: 8, ba: 0, R: 13.5 }, { p: 0, t: .86, side: -1, pa: .95, pl: 10, ba: .3, R: 10.5 },
      { p: 1, t: 1, side: -1, pa: .3, pl: 8, ba: .1, R: 12 }, { p: 1, t: .55, side: 1, pa: 1.15, pl: 6, ba: .25, R: 8 },
      { p: 2, t: .5, side: -1, pa: .85, pl: 9, ba: .2, R: 12.5 }, { p: 2, t: 1, side: 1, pa: .32, pl: 8, ba: .05, R: 13 }, { p: 2, t: .9, side: -1, pa: .75, pl: 10, ba: .35, R: 9.5 },
      { p: 3, t: 1, side: 1, pa: .12, pl: 7, ba: 0, R: 12 }, { p: 3, t: .68, side: -1, pa: 1.3, pl: 6, ba: .4, R: 8.5 }
    ];
    /* 颜色：夏天一套（深青到嫩黄绿）、秋天一套（深红到橙黄），两套不混；换的时候一片一片换过去 */
    var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    var hex = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); };
    var mix = function (a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); };
    var rgb = function (c) { return 'rgb(' + c.map(Math.round).join(',') + ')'; };
    var GREEN = ['#4d8b45', '#5f9e4f', '#76b05a', '#91c068', '#b5cb69'].map(hex), RED = ['#a2303b', '#bf3f31', '#d4553a', '#e1773a', '#e9a13f'].map(hex);
    var pal = function (Pp, x) { var f = clamp(x, 0, 1) * (Pp.length - 1), i = Math.min(Pp.length - 2, Math.floor(f)); return mix(Pp[i], Pp[i + 1], f - i); };
    var DK = hex('#1f2a1c'), DKR = hex('#3a0f14'), LT = hex('#fff6d8');
    var autumn = S.season === 'red' ? 1 : 0, autumnTo = autumn, sraf = 0, slast = 0;
    function tint(g, r, k, back, small) { var c = mix(pal(GREEN, g), pal(RED, r), k); if (small) c = mix(c, LT, .1); var dk = mix(DK, DKR, k); if (back) c = mix(c, dk, .22); return { fill: rgb(c), edge: rgb(mix(c, dk, .45)), vein: rgb(mix(c, dk, .35)) }; }
    function leafColor(l) { return tint(l.g, l.rp, smooth(l.dl * .6, l.dl * .6 + .4, autumn), l.back, l.R < 13); }
    function mainPts() { var L = LB(), n = 28, a = []; for (var i = 0; i <= n; i++) { var s = L * i / n, p = shape(s); a.push({ x: p.x, y: p.y + knot(s), w: 1.8 + 7 * Math.pow(1 - i / n, .85) }); } return a; }
    function at(p, t) { var f = t * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), r = f - i, A = p[i], Bq = p[i + 1]; return { x: A.x + (Bq.x - A.x) * r, y: A.y + (Bq.y - A.y) * r, w: A.w + (Bq.w - A.w) * r, th: Math.atan2(Bq.y - A.y, Bq.x - A.x) }; }
    function subPts(b, par) {
      var o0 = at(par, b.t), n = 8, w0 = Math.min(b.w, o0.w * .8), a = [], x = o0.x, y = o0.y;
      for (var j = 0; j <= n; j++) { var u = j / n; a.push({ x: x, y: y, w: w0 * (1 - u) + (b.stub ? w0 * .85 : .6) * u }); var ang = o0.th + b.a + b.bend * u + b.th * Math.pow(u, .8); x += Math.cos(ang) * b.len / n; y += Math.sin(ang) * b.len / n; }
      return a;
    }
    function tube(p, cap) {
      var L = [], R = [];
      for (var i = 0; i < p.length; i++) { var A = p[Math.max(0, i - 1)], Bq = p[Math.min(p.length - 1, i + 1)], dx = Bq.x - A.x, dy = Bq.y - A.y, m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, h = p[i].w / 2; L.push(f1(p[i].x + nx * h) + ',' + f1(p[i].y + ny * h)); R.push(f1(p[i].x - nx * h) + ',' + f1(p[i].y - ny * h)); }
      var t = p[p.length - 1], u = p[p.length - 2];
      return 'M' + L.join('L') + (cap ? 'L' : 'Q' + f1(t.x * 2 - u.x) + ',' + f1(t.y * 2 - u.y) + ' ') + R[R.length - 1] + 'L' + R.reverse().join('L') + 'Z';   /* 小桩是平口，别的梢是圆的 */
    }
    function edgeLine(p, k, side, frac) {
      var s = '', e = Math.floor(p.length * frac);
      for (var i = 0; i < e; i++) { var A = p[Math.max(0, i - 1)], Bq = p[Math.min(p.length - 1, i + 1)], dx = Bq.x - A.x, dy = Bq.y - A.y, m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m; if (ny > 0) { nx = -nx; ny = -ny; } s += (i ? 'L' : 'M') + f1(p[i].x + nx * p[i].w * k * side) + ',' + f1(p[i].y + ny * p[i].w * k * side); }
      return s;
    }
    function allPts() { var M = mainPts(), Pp = [M]; BRS.forEach(function (b, i) { Pp[i + 1] = subPts(b, Pp[b.p + 1]); }); return Pp; }
    function leafPose(l, Pp) {
      var o0 = at(Pp[l.p + 1], l.t), psi = o0.th + l.side * l.pa + l.ph * .35, beta = o0.th + l.betaR + l.ph,
        C = { x: o0.x + Math.cos(psi) * l.pl * .6, y: o0.y + Math.sin(psi) * l.pl * .6 }, E = { x: C.x + Math.cos(beta) * l.pl * .45, y: C.y + Math.sin(beta) * l.pl * .45 };
      return { o: o0, C: C, E: E, beta: beta };
    }
    /* 搭起来：每片叶子自己的形、正侧、颜色早晚；静止朝向记成相对枝子的角，弹的时候跟着枝子转 */
    BRS.forEach(function (b) { b.th = 0; b.tv = 0; b.ta = 0; b.k = Math.min(1400, 9000 / b.len) * rr(.9, 1.1); b.uM = b.p < 0 ? b.t : BRS[b.p].t; b.r = Math.max(18, b.len * .5); });   /* 越短越硬 */
    (function () {
      var Pp = allPts();
      LEAVES.forEach(function (l) {
        l.R *= 1.5; l.pl *= 1.25; var o0 = at(Pp[l.p + 1], l.t), psi = o0.th + l.side * l.pa, down = Math.PI / 2, beta = psi - l.side * l.ba;
        beta += Math.atan2(Math.sin(down - beta), Math.cos(down - beta)) * rr(.08, .22);   /* 叶片自己的重量：往下耷一点 */
        l.betaR = beta - o0.th; l.shape = leafShape(rnd); l.sx = (rnd() < .15 ? rr(.58, .72) : rr(.78, 1)) * (rnd() < .5 ? -1 : 1); l.sy = rr(.88, 1);
        l.g = l.drop ? .98 : (rnd() < .14 ? rr(.75, .95) : rr(.05, .62)); l.rp = l.drop ? .9 : rr(0, 1); l.dl = clamp(rnd() * .8 + (l.back ? .15 : 0) - (l.t > .9 ? .15 : 0), 0, 1);
        l.ph = 0; l.pv = 0; l.k = rr(150, 240); l.uM = l.p < 0 ? l.t : BRS[l.p].uM; l.r = Math.max(16, l.pl + l.R * .6);
      });
    })();
    function leafG(sh, R, par) {
      var g = mks('g', {}, par);
      var ol = mks('path', { d: sh.outline, fill: 'currentColor', 'stroke-width': f3(.9 / R), 'stroke-linejoin': 'round', 'stroke-opacity': '.6' }, g);
      mks('path', { d: sh.shade, fill: '#2a1408', 'fill-opacity': '.1', stroke: 'none' }, g);
      var v = mks('path', { d: sh.veins, fill: 'none', 'stroke-width': f3(.7 / R), 'stroke-linecap': 'round', 'stroke-opacity': '.7' }, g);
      return { g: g, o: ol, v: v };
    }
    function paintG(x, c) { x.g.setAttribute('color', c.fill); x.o.setAttribute('stroke', c.edge); x.v.setAttribute('stroke', c.vein); }
    LEAVES.forEach(function (l) { var x = leafG(l.shape, l.R, T(l.back ? 't-leavesB' : 't-leaves')); l.el = x.g; l.gx = x; });
    var BARK = [mks('path', { fill: '#6f5545' }, T('t-bark'))];
    BRS.forEach(function (b) { var e = mks('path', { fill: b.p < 0 ? '#76503f' : '#82513f' }); T('t-bark').insertBefore(e, BARK[0]); BARK.push(e); });   /* 侧枝画在主枝底下，接口才像长在一起 */
    function paintLeaves() { LEAVES.forEach(function (l) { l.col = leafColor(l); paintG(l.gx, l.col); }); }
    paintLeaves();
    function seasonStep(now) {
      var dt = Math.min(.05, (now - slast) / 1000), dA = autumnTo - autumn, stp = dt * .5; slast = now;
      autumn = Math.abs(dA) <= stp ? autumnTo : autumn + Math.sign(dA) * stp; paintLeaves(); sraf = autumn !== autumnTo ? requestAnimationFrame(seasonStep) : 0;
    }
    /* 弹：挂在主枝 u 处的一点跟着梢的加速度 acc·f(u) 动；枝子和叶片因为惯性往反方向甩一下，再自己弹回来 */
    var fsh = function (u) { return u * u * (3 - u) / 2; }, treeE = 0;
    function stepTree(dt, acc) {
      var e = 0, cl = function (v, m) { return clamp(v, -m, m); };
      BRS.forEach(function (b) {
        var P0 = b.p < 0 ? 0 : BRS[b.p].ta, dir = Math.cos(Math.PI + b.a);
        b.ta = -b.k * b.th - 2 * Math.sqrt(b.k) * .13 * b.tv - .3 * acc * fsh(b.uM) * dir / b.r - .5 * P0; b.tv = cl(b.tv + b.ta * dt, 8); b.th = cl(b.th + b.tv * dt, .35); e = Math.max(e, Math.abs(b.th) + Math.abs(b.tv) * .05);
      });
      LEAVES.forEach(function (l) {
        if (l.gone) return; var P0 = l.p < 0 ? 0 : BRS[l.p].ta, dir = Math.cos(Math.PI + l.betaR);
        var a = -l.k * l.ph - 2 * Math.sqrt(l.k) * .12 * l.pv - .14 * acc * fsh(l.uM) * dir / l.r - .4 * P0; l.pv = cl(l.pv + a * dt, 9); l.ph = cl(l.ph + l.pv * dt, .45); e = Math.max(e, Math.abs(l.ph) + Math.abs(l.pv) * .05);
      });
      treeE = e;
    }
    var drawSig = '';
    function drawTree() {
      var sig = f1(d) + '|' + f1(toff) + '|' + f1(BY()) + '|' + W + '|' + (S.offX || 0) + '|' + (treeE > .0005 ? treeE : 0) + '|' + LEAVES.filter(function (l) { return l.gone; }).length;
      if (sig === drawSig) return; drawSig = sig;   /* 树没动就不重画 */
      var Pp = allPts(), M = Pp[0];
      BARK.forEach(function (el, i) { el.setAttribute('d', tube(Pp[i], i > 0 && BRS[i - 1].stub)); });
      T('t-hi').setAttribute('d', edgeLine(M, .24, 1, .8) + BRS.map(function (b, i) { return b.p < 0 && !b.stub ? edgeLine(Pp[i + 1], .2, 1, .6) : ''; }).join(''));
      T('t-lo').setAttribute('d', edgeLine(M, .3, -1, .85));
      T('mc-hit').setAttribute('d', 'M' + M.filter(function (_, i) { return i % 3 === 0; }).map(function (q) { return f1(q.x) + ',' + f1(q.y); }).join('L'));
      var sB = '', sF = '';
      LEAVES.forEach(function (l) {
        if (l.gone) { l.el.style.display = 'none'; return; } l.el.style.display = '';
        var lp = leafPose(l, Pp), s = 'M' + f1(lp.o.x) + ',' + f1(lp.o.y) + 'Q' + f1(lp.C.x) + ',' + f1(lp.C.y) + ' ' + f1(lp.E.x) + ',' + f1(lp.E.y);
        if (l.back) sB += s; else sF += s;
        l.x = lp.E.x; l.y = lp.E.y; l.ang = lp.beta;
        l.el.setAttribute('transform', 'translate(' + f1(lp.E.x) + ',' + f1(lp.E.y) + ') rotate(' + f1(lp.beta * DEG + 90) + ') scale(' + f3(l.R * l.sx) + ',' + f3(l.R * l.sy) + ')');
      });
      T('t-stemsB').setAttribute('d', sB); T('t-stems').setAttribute('d', sF);
    }

    /* ── 枫枝上那只：吊在梢上的摆。phi＝身子偏离静止歪角的角度；不在枝上时是自由落体（来时从天上掉，走时往上蹦） ── */
    var TILT = CB.L.tilt, vx = 0, vy = 0, phi = 0, pv = 0, sway = 0;
    function grip() { return shape(LB() * SG); }
    function arrive() { mode = 'fall'; var g = grip(); cx = g.x + (Math.random() - .5) * 10; cy = -40; vx = 0; vy = 60; phi = (Math.random() < .5 ? -1 : 1) * .35; pv = 0; crabB.classList.add('here'); setFly(true); wake(); }
    function leave() {
      if (mode === 'gone') return;
      mode = 'up'; vx = -40; vy = -Math.sqrt(2 * 1400 * (Math.max(0, cy) + 150));   /* 按它在哪儿算刚好蹦出屏幕的劲儿 */
      dRest = 0; dv -= 140; setFly(true); wake();
    }
    function catchIt() {
      mode = 'hang'; var g = grip(); cx = g.x; cy = g.y; dRest = 22; dv += vy * .55; vy = 0; pv += (Math.random() < .5 ? -1 : 1) * 1.6; setFly(false);
      var lf = LEAVES.filter(function (l) { return l.drop && !l.gone; })[0]; if (lf && Math.random() < .85) dropLeaf(lf);
    }
    var flyOn = false;
    function setFly(f) { if (f !== flyOn) { flyOn = f; crabB.classList.toggle('fly', f); } }

    /* ── 落叶：平时隔几秒飘一片；拽狠了甩掉几片、过几秒原处显回来；飘的时候荡、摆、翻面，落在打字框上沿侧躺着，最多攒九片 ── */
    var FALL = [], LANDED = [], fraf2 = 0, flast2 = 0;
    function ibox() { if (!ipt || !ipt.offsetParent) return null; var r = ipt.getBoundingClientRect(), p = host.getBoundingClientRect(); return { top: r.top - p.top, left: r.left - p.left, right: r.right - p.left }; }
    function runFall() { if (!fraf2) { flast2 = performance.now(); fraf2 = requestAnimationFrame(fallStep); } }
    function spawnFall(a) {
      var Sz = a.R * 2.6, el = mks('svg', { viewBox: '-1.3 -1.3 2.6 2.6', 'class': 'mc-fleaf', 'aria-hidden': 'true' });
      el.style.width = el.style.height = Sz + 'px'; var x = leafG(a.shape, a.R, el); paintG(x, a.col); x.g.setAttribute('transform', 'scale(' + f3(a.sx) + ',' + f3(a.sy) + ')'); host.appendChild(el);
      FALL.push({ el: el, S: Sz, R: a.R, x: a.x, y: a.y, vx: a.vx || 0, vy: a.vy || 0, rot0: a.rot, rot: a.rot, fl: 1, t: 0, w: rr2(2, 3.2), ph: rr2(0, 6.28), amp: rr2(16, 30),
        term: rr2(62, 92) * (a.R < 12 ? .85 : 1), spin: rr2(-35, 35), flipW: rr2(1.1, 2.4), wind: rr2(-12, 6), op: 1 });
      runFall();
    }
    function fallStep(now) {
      var dt = Math.min(.033, (now - flast2) / 1000), ib = ibox(); flast2 = now;
      for (var i = FALL.length - 1; i >= 0; i--) {
        var f = FALL[i]; if (f.done) continue; f.t += dt; var rot, fl;
        if (f.landed) { var k = Math.min(1, f.k += dt / .45), e = 1 - Math.pow(1 - k, 3); f.y = f.fy + (f.ly - f.fy) * e; rot = f.frot + (f.lrot - f.frot) * e; fl = f.ffl + (f.lfl - f.ffl) * e; if (k >= 1) f.done = true; }
        else {
          if (f.brush) { f.vy += 900 * dt; f.op -= dt * 1.4; } else { f.vy += (f.term - f.vy) * Math.min(1, dt * 1.6); f.vx += (f.wind + windX + Math.cos(f.t * f.w + f.ph) * f.amp - f.vx) * Math.min(1, dt * 2.2); }
          f.x += f.vx * dt; f.y += f.vy * dt; rot = f.rot0 + f.spin * f.t + Math.sin(f.t * f.w + f.ph) * 42;
          var c = Math.cos(f.t * f.flipW + f.ph); fl = Math.abs(c) < .2 ? (c < 0 ? -.2 : .2) : c;   /* 翻面 */
          if (f.y > H + f.S || f.op <= 0) { f.el.remove(); FALL.splice(i, 1); continue; }
          if (ib && !f.brush && f.vy > 0 && f.y + f.R * .3 >= ib.top && f.y < ib.top + 12 && f.x > ib.left + f.R * .5 && f.x < ib.right - f.R * .5) land(f, rot, fl, ib);
        }
        f.rot = rot; f.fl = fl; f.el.style.transform = 'translate(' + f1(f.x - f.S / 2) + 'px,' + f1(f.y - f.S / 2) + 'px) rotate(' + f1(rot) + 'deg) scale(' + f3(fl) + ',1)'; f.el.style.opacity = Math.max(0, f.op);
      }
      fraf2 = FALL.some(function (q) { return !q.done; }) ? requestAnimationFrame(fallStep) : 0;
    }
    function land(f, rot, fl, ib) {
      f.landed = true; clearTimeout(f.rmT); f.rmT = setTimeout(function () { fadeLanded(f); }, rr2(5500, 9000));
      f.k = 0; f.fy = f.y; f.frot = rot; f.ffl = fl;
      var near = LANDED.filter(function (g) { return Math.abs(g.x - f.x) < f.R * 1.2; }).length;
      f.ly = ib.top - f.R * .08 - near * f.R * .2;                                                 /* 搭在上沿；旁边有了就叠高一点 */
      f.lrot = (Math.random() < .5 ? -1 : 1) * rr2(72, 108); f.lrot += Math.round((rot - f.lrot) / 360) * 360;   /* 侧躺，转最近的那边 */
      f.lfl = (fl < 0 ? -1 : 1) * rr2(.62, .78);
      LANDED.push(f); if (LANDED.length > 9) brush(LANDED[0], true);
    }
    function fadeLanded(f) {
      var i = LANDED.indexOf(f); if (i < 0) return; LANDED.splice(i, 1); f.el.style.transition = 'opacity 1.4s ease'; f.el.style.opacity = '0';
      setTimeout(function () { f.el.remove(); var j = FALL.indexOf(f); if (j >= 0) FALL.splice(j, 1); }, 1500);
    }
    function brush(f, quiet) {
      clearTimeout(f.rmT); f.el.style.transition = ''; var i = LANDED.indexOf(f); if (i >= 0) LANDED.splice(i, 1); var ib = ibox(), midX = ib ? (ib.left + ib.right) / 2 : W / 2;
      f.landed = false; f.done = false; f.brush = true; f.rot0 = f.rot; f.t = 0; f.spin = rr2(-220, 220) * (quiet ? .3 : 1);
      f.vx = (f.x < midX ? -1 : 1) * rr2(50, 120) * (quiet ? .3 : 1); f.vy = -rr2(50, 110) * (quiet ? .2 : 1); runFall();
    }
    function brushAll(quiet) { LANDED.slice().forEach(function (f) { brush(f, quiet); }); }
    if (ipt) ipt.addEventListener('focus', function () { brushAll(false); });   /* 一点打字框，上面的叶子被拂下去 */
    function detach(l, vx0, vy0) {
      if (l.gone) return; l.gone = true; drawSig = ''; wake();
      spawnFall({ shape: l.shape, col: l.col, R: l.R, sx: l.sx, sy: l.sy, x: l.x, y: l.y, rot: l.ang * DEG + 90, vx: vx0, vy: vy0 });
      clearTimeout(l.rt); l.rt = setTimeout(function () { regrow(l); }, rr2(3200, 6500));
    }
    function regrow(l) {
      if (!l.gone) return; l.gone = false; drawSig = ''; l.back0 = performance.now(); var el = l.el; el.style.transition = 'none'; el.style.opacity = '0'; wake();
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = 'opacity 1.8s ease'; el.style.opacity = '1'; }); });
    }
    function dropLeaf(l) { detach(l, rr2(-25, 10), rr2(10, 40)); }
    function extraLeaf(big) {
      var liveL = LEAVES.filter(function (l) { return !l.gone && l.x != null; }); if (!liveL.length) return;
      var s = liveL[Math.floor(Math.random() * liveL.length)], R = big ? rr2(15, 21) : rr2(8, 12);
      spawnFall({ shape: SHAPES[Math.floor(Math.random() * SHAPES.length)], col: tint(Math.random() < .15 ? rr2(.7, .95) : rr2(.05, .6), Math.random(), autumn, false, R < 13),
        R: R, sx: rr2(.6, 1) * (Math.random() < .5 ? -1 : 1), sy: rr2(.85, 1), x: s.x + rr2(-10, 10), y: s.y + rr2(-6, 10), rot: rr2(0, 360), vx: rr2(-20, 20), vy: rr2(0, 25) });
    }
    function shedCheck(dt) {
      var s = Math.max(0, (Math.abs(dv) - 520) / 400); if (!s) return;   /* 梢的速度过了 520px/s 才算拽狠了（螃蟹接住那一下不到） */
      var gone = LEAVES.filter(function (l) { return l.gone; }).length, cap = Math.ceil(LEAVES.length * .45), now = performance.now();
      LEAVES.forEach(function (l) { if (gone >= cap || l.gone || now - (l.back0 || 0) < 2000) return; if (Math.random() < s * 2.2 * dt * (.4 + fsh(l.uM))) { detach(l, rr2(-50, 50), dv * fsh(l.uM) * .45); gone++; } });
      if (S.leaves && Math.random() < s * 7 * dt) extraLeaf(Math.random() < .5);
    }
    var ambT = 0;
    (function ambient() {
      if (!document.hidden && treeOn() && S.leaves && FALL.filter(function (f) { return !f.landed && !f.brush; }).length < (S.wind ? 8 : 4)) extraLeaf(Math.random() < .45);
      ambT = setTimeout(ambient, S.wind ? rr2(900, 2400) : rr2(4500, 10000));   /* 有风的时候掉得勤 */
    })();

    /* ═══════════ 秋千：一根 N 节的绳（verlet），顶端钉在顶栏下沿，末端是螃蟹；有新的就带着弹簧往下跳（蹦极） ═══════════ */
    var RG = 1400, DAMP = .92, ropeLen = 0, ropeV = 0, lastT = 0, jumping = false, swHeld = null, swDown = null, swGrab = { x: 0, y: 0 }, swMoved = false, slack = 1, recoil = 0, swClicked = false;
    function ropeTarget() { if (sw.leaving) return 0; return open ? 22 : MSGS.length ? 46 : sleeping ? 8 : 28; }
    function segLen() { return ropeLen / N; }
    function swingEnter() {
      sw.on = true; sw.leaving = false; ropeLen = 0; lastT = 0; jumping = false; P = [];
      for (var i = 0; i <= N; i++) P.push({ x: AX(), y: AY(), px: AX(), py: AY() });
      crabS.classList.remove('bye'); crabS.classList.add('here'); ropeL.style.display = ''; wake();
    }
    function swingLeave() { if (!sw.on) return; sw.leaving = true; swHeld = null; crabS.classList.remove('held'); crabS.classList.add('bye'); wake(); }
    function swingHop() { if (!sw.on || swHeld) return; jumping = true; ropeLen = Math.max(2, ropeLen - 22); ropeV = 0; wake(); }
    function ropeStep(dt) {
      var rt = ropeTarget();
      if (rt > lastT + .5) { jumping = true; ropeV = (rt - lastT) * 9; P[N].px = P[N].x + (Math.random() < .5 ? -1.2 : 1.2); }   /* 往下：起跳，顺手往一边歪一点 */
      else if (rt < lastT - .5) jumping = false;
      lastT = rt;
      if (jumping) { var k = 150, c = 2 * Math.sqrt(k) * .26; ropeV += (-k * (ropeLen - rt) - c * ropeV) * dt; ropeLen += ropeV * dt; if (Math.abs(ropeLen - rt) < .3 && Math.abs(ropeV) < 4) { jumping = false; ropeLen = rt; ropeV = 0; } }
      else { ropeLen += (rt - ropeLen) * (1 - Math.exp(-dt * 4)); if (Math.abs(rt - ropeLen) < .05) ropeLen = rt; }
      var fly = jumping && !swHeld; if (crabS.classList.contains('fly') !== fly) crabS.classList.toggle('fly', fly);
      var ax = AX(), ay = AY(), wx = windX * 9 * dt * dt;
      for (var i = 1; i <= N; i++) { var p = P[i]; if (swHeld && i === N) continue; var vx0 = (p.x - p.px) * DAMP, vy0 = (p.y - p.py) * DAMP; p.px = p.x; p.py = p.y; p.x += vx0 + wx; p.y += vy0 + RG * dt * dt; }
      P[0].x = ax; P[0].y = ay;
      if (swHeld) { P[N].px = P[N].x; P[N].py = P[N].y; P[N].x = swHeld.x; P[N].y = swHeld.y; }   /* 拽着时「上一刻」跟着手走，松手只带走最后一下的手速 */
      var L = segLen();
      if (swHeld) slack = Math.max(1, Math.hypot(swHeld.x - ax, swHeld.y - ay) / Math.max(.01, L * N)); else if (slack > 1) { slack = 1 + (slack - 1) * .82; if (slack < 1.003) slack = 1; }
      for (var it = 0; it < 14; it++) {
        for (i = 0; i < N; i++) {
          var a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, dd2 = Math.hypot(dx, dy) || 1, mx = L * slack, diff = (dd2 - (dd2 > mx ? mx : dd2)) / dd2;   /* 只管不许更长，短了随它弯 */
          if (i === 0) { b.x -= dx * diff; b.y -= dy * diff; } else if (swHeld && i + 1 === N) { a.x += dx * diff; a.y += dy * diff; } else { a.x += dx * diff / 2; a.y += dy * diff / 2; b.x -= dx * diff / 2; b.y -= dy * diff / 2; }
        }
        P[0].x = ax; P[0].y = ay;
      }
      if (swHeld) {   /* 拉到绳长的 92% 开始绷，到 100% 整根是直的 */
        var hx = P[N].x, hy = P[N].y, q = Math.hypot(hx - ax, hy - ay) / Math.max(.01, L * N), t = clamp((q - .92) / .08, 0, 1);
        if (t > 0) for (i = 1; i < N; i++) { var fq = i / N; P[i].x += (ax + (hx - ax) * fq - P[i].x) * t; P[i].y += (ay + (hy - ay) * fq - P[i].y) * t; }
      }
      for (i = 1; i <= N; i++) { var pp = P[i], lim = i === N ? ay + 3 : ay; if (pp.y < lim) { pp.y = lim; if (pp.py < lim) pp.py = lim; } }   /* 顶栏是天花板 */
      if (!swHeld && recoil > 0) { recoil--; P.forEach(function (p2) { var a1 = p2.x - p2.px, b1 = p2.y - p2.py, v = Math.hypot(a1, b1); if (v > 3) { p2.px = p2.x - a1 * 3 / v; p2.py = p2.y - b1 * 3 / v; } }); }
      /* 画 */
      var s = 'M' + f1(P[0].x) + ',' + f1(P[0].y);
      for (i = 1; i < N; i++) s += ' Q' + f1(P[i].x) + ',' + f1(P[i].y) + ' ' + f1((P[i].x + P[i + 1].x) / 2) + ',' + f1((P[i].y + P[i + 1].y) / 2);
      ropePath.setAttribute('d', s + ' L' + f1(P[N].x) + ',' + f1(P[N].y));
      crabS.style.left = P[N].x + 'px'; crabS.style.top = P[N].y + 'px';
      var A1 = P[N], B1 = P[N - 3]; CS.svg.style.transform = 'rotate(' + Math.atan2(-(A1.x - B1.x), Math.max(.1, A1.y - B1.y)) + 'rad)';
      if (sw.leaving && ropeLen < .6 && !swHeld) { sw.on = false; sw.leaving = false; crabS.classList.remove('here', 'bye', 'fly', 'held'); ropeL.style.display = 'none'; afterGone(); return false; }
      var v = P.reduce(function (sum, p3) { return sum + Math.abs(p3.x - p3.px) + Math.abs(p3.y - p3.py); }, 0);
      return v > .05 || !!swHeld || ropeLen !== ropeTarget() || jumping;
    }
    function reach(qq) {   /* 橡皮绳：多出绳长的那段越往外越费劲，最多再抻出 ~110 */
      var ax = AX(), ay = AY(), dx = qq.x - ax, dy = qq.y - ay, dist = Math.hypot(dx, dy) || 1, L = segLen() * N, give = 110, r = dist <= L ? dist : L + give * Math.tanh((dist - L) / give);
      return { x: ax + dx * r / dist, y: Math.max(ay + 3, ay + dy * r / dist) };
    }

    /* ═══════════ 拽、点、长按 ═══════════ */
    var held = null, grab = { x: 0, y: 0 }, down = null, moved = false, clicked = false, lpT = 0, lpFired = false;
    function loc(e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function gripRestY() { var u = SG; return BY() - 16 * u * u + 22 * u * u * (3 - u) / 2; }
    function tickClick(el) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); if (navigator.vibrate) navigator.vibrate(8); }
    crabB.addEventListener('pointerdown', function (e) {
      if (mode !== 'hang' || S.move) return; try { crabB.setPointerCapture(e.pointerId); } catch (_) {}
      down = loc(e); grab = { x: cx - down.x, y: cy - down.y }; held = { x: cx, y: cy }; moved = false; lpFired = false; crabB.classList.add('held'); touch(); wake();
      clearTimeout(lpT); lpT = setTimeout(function () { if (held && !moved) { lpFired = true; openPill(true); } }, 420);   /* 按住不动 0.42 秒＝长按 */
    });
    crabS.addEventListener('pointerdown', function (e) {
      if (!sw.on || sw.leaving || S.move) return; try { crabS.setPointerCapture(e.pointerId); } catch (_) {}
      swDown = loc(e); swGrab = { x: P[N].x - swDown.x, y: P[N].y - swDown.y }; swMoved = false; lpFired = false; swHeld = { x: P[N].x, y: P[N].y }; crabS.classList.add('held'); touch(); wake();
      clearTimeout(lpT); lpT = setTimeout(function () { if (swHeld && !swMoved) { lpFired = true; openPill(true); } }, 420);
    });
    [crabB, crabS].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch(); setOpen(!open); } else if (e.key === 'ContextMenu') { e.preventDefault(); openPill(false); } }); });
    function onMove(e) {
      if (picking) { hotAt(e); return; }
      if (held) {
        if (e.pointerType === 'mouse' && e.buttons === 0) return letGo();
        var f = loc(e); held = { x: f.x + grab.x, y: f.y + grab.y }; if (Math.hypot(f.x - down.x, f.y - down.y) > 5) { moved = true; clearTimeout(lpT); }
        var over = held.y - gripRestY() > 40; if (over && !clicked) tickClick(crabB); clicked = over;   /* 拉过那条线：一扁、震一下，像拉灯 */
      } else if (swHeld) {
        if (e.pointerType === 'mouse' && e.buttons === 0) return swLetGo();
        var g = loc(e), qq = { x: g.x + swGrab.x, y: g.y + swGrab.y }; if (Math.hypot(g.x - swDown.x, g.y - swDown.y) > 5) { swMoved = true; clearTimeout(lpT); }
        swHeld = reach(qq);
        var over2 = qq.y - AY() - segLen() * N > 40; if (over2 && !swClicked) tickClick(crabS); swClicked = over2;
      }
    }
    function letGo() { if (!held) return; held = null; clicked = false; crabB.classList.remove('held'); dv = clamp(dv, -500, 500); pv = clamp(pv, -4, 4); wake(); }
    function swLetGo() {
      if (!swHeld) return; swHeld = null; swClicked = false; recoil = 24; crabS.classList.remove('held');
      P.forEach(function (p) { var a = p.x - p.px, b = p.y - p.py, v = Math.hypot(a, b); if (v > 2.5) { p.px = p.x - a * 2.5 / v; p.py = p.y - b * 2.5 / v; } }); wake();
    }
    function onUp(e) {
      if (picking) { picking = false; var k = hotKey(e); clearHot(); if (k) pickIt(k); return; }   /* 长按着滑到哪个上松手，就是哪个 */
      clearTimeout(lpT);
      if (held) { letGo(); if (!moved && !lpFired) setOpen(!open); }
      else if (swHeld) { swLetGo(); if (!swMoved && !lpFired) setOpen(!open); }   /* 只有老老实实点一下才开那一排；拽它只是荡 */
    }
    function onCancel() { letGo(); swLetGo(); }
    addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onCancel); addEventListener('blur', onCancel);
    T('mc-hit').addEventListener('pointerdown', function () { dv += 160; touch(); wake(); });   /* 点树枝：抖一下 */

    /* 移动模式：开着的时候，在页面任何地方按住拖，整枝（枫枝或秋千）跟着手指走；松手才存 */
    var mv = { id: 0, x: 0, y: 0 };
    host.addEventListener('pointerdown', function (e) {
      if (!S.move || mv.id) return;
      if (e.target.closest('.mc-bar, .mc-fold, .mc-dd, .mc-pill, .mc-game')) return;
      var p = loc(e); mv.id = e.pointerId; mv.x = p.x; mv.y = p.y;
      try { host.setPointerCapture(e.pointerId); } catch (_) { }
      e.preventDefault();
    });
    function moveDrag(e) {
      if (!mv.id || e.pointerId !== mv.id) return;
      var p = loc(e), top = BAR + rowH;
      set('offX', clamp(Math.round((S.offX || 0) + p.x - mv.x), -W, W), true);
      set('offY', clamp(Math.round((S.offY || 0) + p.y - mv.y), -top, H - top - 90), true);
      mv.x = p.x; mv.y = p.y;
    }
    function moveDrop(e) { if (mv.id && e.pointerId === mv.id) { mv.id = 0; touch(); emit('onSettings', settings()); } }
    addEventListener('pointermove', moveDrag); addEventListener('pointerup', moveDrop); addEventListener('pointercancel', moveDrop);

    /* ═══════════ 一帧 ═══════════ */
    var raf = 0, last = 0, calm = 0, dvEnd = 0, windX = 0, artRot = '';
    function tick(now) {
      var dt = Math.max(0, Math.min(.033, (now - last) / 1000)), u = SG, fu = u * u * (3 - u) / 2; last = now; sway += dt;   /* dt 不许是负的 */
      if (held) {
        var want = (held.y - (BY() - 16 * u * u)) / fu, D = 90, nd = want > 0 ? D * Math.tanh(want / D) : -30 * Math.tanh(-want / 30);   /* 往下越拽越拽不动，往上只让一点 */
        dv = (nd - d) / Math.max(dt, .008); d = nd; var g = grip(), np = clamp(Math.atan2(g.x - held.x, Math.max(12, held.y - g.y + 20)), -1.1, 1.1);
        pv = (np - phi) / Math.max(dt, .008); phi = np;
      } else {
        var k = 190, c = 2 * Math.sqrt(k) * .11; dv += (-k * (d - dRest) - c * dv) * dt; d += dv * dt;   /* 树枝：阻尼小，多弹几下 */
        if (mode === 'hang') { var ay = -(-k * (d - dRest) - c * dv) * fu, w2 = Math.max(300, 1400 + ay * .5) / 26; pv += (-w2 * Math.sin(phi) - 1.5 * pv) * dt; phi += pv * dt; if (Math.abs(phi) > 1.25) { phi = Math.sign(phi) * 1.25; pv *= -.3; } }   /* 单手吊着荡不过头顶 */
      }
      /* 风：一阵一阵的，枝子上下颤、叶子抖、螃蟹被往一边推、落叶往左飘 */
      var wAcc = 0;
      if (S.wind) { var gst = Math.max(0, Math.sin(sway * .8) + .55 * Math.sin(sway * 2.1 + 1) + .3 * Math.sin(sway * 4.7 + 2)); windX = -34 * gst; wAcc = gst * 650 * Math.sin(sway * 9.3); if (!held) dv += gst * 380 * Math.sin(sway * 5.3) * dt; if (mode === 'hang' && !held) pv -= gst * 1.1 * dt; }
      else windX *= .97;
      stepTree(dt, (dv - dvEnd) / Math.max(dt, .008) + wAcc); dvEnd = dv; shedCheck(dt);
      if (mode === 'fall') { vy += 1400 * dt; cx += (grip().x - cx) * Math.min(1, dt * 6); cy += vy * dt; phi += -phi * dt * 2; if (cy >= grip().y) catchIt(); }
      else if (mode === 'up') {
        vy += 1400 * dt; cx += vx * dt; cy += vy * dt;
        if ((cy < -90 && vy < 0) || (vy > 0 && cy > H + 60)) { mode = 'gone'; crabB.classList.remove('here'); setFly(false); afterGone(); }
      } else if (mode === 'hang') { var gg = grip(); cx = gg.x; cy = gg.y; }
      stepToff(dt); if (!treeHidden) drawTree();
      if (mode !== 'gone') { crabB.style.left = cx + 'px'; crabB.style.top = cy + 'px'; var rs = 'rotate(' + f3(TILT + phi) + 'rad)'; if (rs !== artRot) { artRot = rs; CB.svg.style.transform = rs; } }
      var swBusy = sw.on ? ropeStep(dt) : false;
      var busy = held || mode === 'fall' || mode === 'up' || Math.abs(dv) > .5 || Math.abs(d - dRest) > .2 || Math.abs(pv) > .01 || Math.abs(phi) > .003 || treeE > .004 || S.wind ||
        Math.abs(toff - toffT()) > .5 || Math.abs(toffV) > .5 || swBusy;
      calm = busy ? 0 : calm + 1; raf = calm > 20 ? 0 : requestAnimationFrame(tick);
    }
    function wake() { calm = 0; if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
    function stepToff(dt) {
      var Tt = toffT(), k = 110, c = 2 * Math.sqrt(k) * .8; toffV += (-k * (toff - Tt) - c * toffV) * dt; toff += toffV * dt;
      var out = Tt !== 0 && Math.abs(toff - Tt) < 1 && Math.abs(toffV) < 1;
      if (out) toff = Tt;
      if (out !== treeHidden) { treeHidden = out; tree.style.display = out ? 'none' : ''; drawSig = ''; }
    }

    /* ── 走了以后：还开着就按现在的挂法再来一只 ── */
    function afterGone() {
      if (!S.shown) return;
      setTimeout(function () {
        if (!S.shown || mode !== 'gone' || sw.on) return;
        if (S.carrier === 'branch') arrive(); else swingEnter();
      }, S.carrier === 'branch' ? 450 : 250);
    }
    function setCarrier(c) {
      S.carrier = c; closePill(); drawSig = ''; wake();
      if (!S.shown) return;
      if (mode !== 'gone') leave(); else if (sw.on) swingLeave(); else afterGone();   /* 先让现在那只走，走完了 afterGone 接上 */
    }
    function hide() {
      if (!S.shown) return; S.shown = false; setOpen(false); closePill(); closeMenu(); endGame();
      if (mode !== 'gone') leave(); if (sw.on) swingLeave(); wake(); emit('onHide');
    }
    function show() {
      if (S.shown) return; S.shown = true; drawSig = ''; wake();
      if (mode === 'gone' && !sw.on) afterGone(); emit('onShow');
    }

    /* ── 打瞌睡：没未读，过几秒在枝上眯着冒 z；有未读的时候放着二十多秒也会眯；一碰就醒 ── */
    var lastTouch = performance.now(), sleeping = false;
    function touch() { lastTouch = performance.now(); setSleep(false); }
    function setSleep(v) { if (v === sleeping) return; sleeping = v; crabB.classList.toggle('sleep', v); crabS.classList.toggle('sleep', v); wake(); }
    var dozeT = setInterval(function () {
      var settled = (mode === 'hang' && !held) || (sw.on && !sw.leaving && !swHeld);
      setSleep(!!S.doze && settled && performance.now() - lastTouch > (MSGS.length ? 25000 : 7000));
    }, 800);
    /* 来了一条：在枝上就蹦一下重新抓稳（树枝被坠得一弹），秋千就再跳一次，不在就来 */
    function hop() { if (mode !== 'hang' || held) return; mode = 'fall'; var g = grip(); cx = g.x; cy = g.y - 1; vy = -330; dRest = 0; dv -= 90; setFly(true); wake(); }
    function push(m) {
      m = normMsg(m); MSGS.unshift(m); touch(); refreshCount();
      if (S.shown) { if (S.carrier === 'branch') { if (mode === 'hang') hop(); else if (mode === 'gone' && !sw.on) arrive(); } else if (sw.on) swingHop(); }
      if (menu === 'unread') rebuildMenu();
      if (hint) say(placeName(m.place) + ' 来了一条');
      return m;
    }

    /* ═══════════ 长按：一排，选一个满屏落下来 ═══════════ */
    var picking = false, holdT = 0, combo = 0, comboT = 0;
    function curSet() { return setByKey(S.press); }
    function crabAt() {   /* 螃蟹身子中心在 host 里哪儿 */
      if (S.carrier === 'swing' && sw.on) { var bs = CS.L.body; return { x: P[N].x + bs[0], y: P[N].y + bs[1] }; }
      var b = CB.L.body, a = TILT + phi; return { x: cx + b[0] * Math.cos(a) - b[1] * Math.sin(a), y: cy + b[0] * Math.sin(a) + b[1] * Math.cos(a) };
    }
    function fillPill(big) {
      var St = curSet(); if (!St) return; var list = big ? St.items : St.items.slice(0, 5), sz = St.type === 'text' ? 34 : St.type === 'crab' || St.type === 'img' ? 36 : 28;
      pill.classList.toggle('big', !!big); pill.style.setProperty('--bw', Math.min(W - 16, big && St.type === 'text' ? 330 : 250) + 'px');
      pill.innerHTML = list.map(function (x, i) { return '<button type="button" class="mc-pk' + (St.wide(x) ? ' wide' : '') + '" data-i="' + St.items.indexOf(x) + '" style="--i:' + i + '" aria-label="' + esc(St.name(x)) + '">' + St.icon(x, sz) + '</button>'; }).join('') +
        (!big && St.items.length > 5 ? '<button type="button" class="mc-pk more" data-i="more" style="--i:5" aria-label="全部">' + MORE + '</button>' : '');
      if (!big) { var mx = W - 16, ks = Array.prototype.slice.call(pill.querySelectorAll('.mc-pk:not(.more)')); while (pill.offsetWidth > mx && ks.length > 2) ks.pop().remove(); }   /* 一排放不下就少放几个，剩下的都在「…」里 */
    }
    function placePill() {
      var pw = pill.offsetWidth || 260, ph = pill.offsetHeight || 50, c = crabAt(), left = clamp(c.x - pw * .55, 8, Math.max(8, W - 8 - pw)), top = c.y + 30, lim = H - 70 - ph;
      if (top > lim) top = Math.max(64, lim);
      pill.style.left = left + 'px'; pill.style.top = top + 'px'; pill.style.setProperty('--tx', clamp(c.x - left, 18, pw - 18) + 'px');
    }
    function openPill(fromHold) {
      if (held) { held = null; clicked = false; crabB.classList.remove('held'); }   /* 长按不算拽：原地松开 */
      if (swHeld) { swHeld = null; swClicked = false; crabS.classList.remove('held'); }
      picking = !!fromHold; closeMenu(); fillPill(false); placePill(); pill.classList.add('on');
      tickClick(S.carrier === 'swing' ? crabS : crabB);
    }
    function expandPill() { fillPill(true); pill.classList.remove('on'); void pill.offsetWidth; placePill(); pill.classList.add('on'); }   /* 「…」：整排重新弹一次，变成一格一格的全部 */
    function closePill() { pill.classList.remove('on'); picking = false; stopHold(); clearHot(); }
    function hotKey(e) { var el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest && el.closest('.mc-pk'); return b && pill.contains(b) ? b.dataset.i : null; }
    function hotAt(e) { var k = hotKey(e); pill.querySelectorAll('.mc-pk').forEach(function (b) { b.classList.toggle('hot', b.dataset.i === k); }); }
    function clearHot() { pill.querySelectorAll('.mc-pk.hot').forEach(function (b) { b.classList.remove('hot'); }); }
    function stopHold() { clearInterval(holdT); holdT = 0; }
    function pickIt(k) { if (k === 'more') expandPill(); else react(+k); }
    pill.addEventListener('pointerdown', function (e) {
      e.stopPropagation(); var b = e.target.closest('.mc-pk'); if (!b) return; e.preventDefault();   /* 先把这次点击拦在这一排里：点「…」时手指下那颗会被换掉 */
      var k = b.dataset.i; if (k === 'more') { expandPill(); return; }
      b.classList.add('hot'); react(+k); stopHold(); holdT = setInterval(function () { react(+k); }, 550);
    });
    pill.addEventListener('keydown', function (e) { var b = e.target.closest('.mc-pk'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickIt(b.dataset.i); } });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { pill.addEventListener(t, function () { stopHold(); if (!picking) clearHot(); }); });
    function burst(x) {
      var St = curSet(), up = !!S.up, n = REDUCE ? 2 : 5;
      for (var i = 0; i < n; i++) {
        if (rain.childElementCount > 60) break;
        var Sz = St.type === 'text' ? 44 : St.type === 'img' ? Math.round(rr2(60, 76)) : Math.round(rr2(30, 44)), el = document.createElement('div'); el.className = 'mc-p'; el.innerHTML = St.icon(x, Sz); rain.appendChild(el);
        var x0 = rr2(10, W - 10 - Sz), drift = rr2(-70, 70), tilt = rr2(8, 26) * (Math.random() < .5 ? -1 : 1), dur = rr2(1700, 2500), y0 = up ? H + 10 : -Sz - 10, y1 = up ? -Sz * 2 : H + Sz;
        el.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px)';
        var kf = function (f, dx, r, sc, op, bl) { return { transform: 'translate(' + (x0 + dx) + 'px,' + (y0 + (y1 - y0) * f) + 'px) rotate(' + r + 'deg) scale(' + sc + ')', opacity: op, filter: 'blur(' + bl + 'px)', offset: f }; };
        el.animate([kf(0, 0, 0, .6, 0, 0), kf(.1, drift * .15, tilt, 1.12, 1, 0), kf(.5, drift * .55, -tilt * .6, 1, 1, 0), kf(.82, drift * .85, tilt * .4, .9, 1, 0), kf(1, drift, tilt * .3, .8, 0, Sz * .12)],
          { duration: dur, delay: i * 180 + rr2(0, 80), easing: up ? 'cubic-bezier(.4,.3,.5,1)' : 'cubic-bezier(.45,.08,.75,.6)', fill: 'both' }).onfinish = (function (e2) { return function () { e2.remove(); }; })(el);
      }
    }
    function poke() { var el = S.carrier === 'swing' ? crabS : crabB; el.classList.remove('poked'); void el.offsetWidth; el.classList.add('poked'); }
    function react(i) {
      var St = curSet(), x = St.items[i]; if (x == null) return;
      burst(x); touch(); combo++; clearTimeout(comboT); comboT = setTimeout(function () { combo = 0; bang(); }, 1300);
      poke(); dv += 60; wake(); if (navigator.vibrate) navigator.vibrate(6);
      if (hint) say(combo > 1 ? St.name(x) + ' ×' + combo : St.name(x));
      emit('onReact', { set: St.key, item: x, name: St.name(x), combo: combo });
    }
    /* 停手以后螃蟹愣一下，头上冒个「！」 */
    function bang() {
      if (!(mode === 'hang' || sw.on)) return; var c = crabAt(), b = document.createElement('div'); b.className = 'mc-bang'; b.textContent = '！';
      b.style.left = (c.x - 26) + 'px'; b.style.top = (c.y - 42) + 'px'; host.appendChild(b); setTimeout(function () { b.remove(); }, 1100);
    }

    /* ═══════════ 切字：刀是线段对圆判断（快划一下整个跨过去也算切到）；切开的两半顺着刀口往两边分开；越切越快；切到螃蟹就结束 ═══════════ */
    var gcv = game.querySelector('canvas'), gx = gcv.getContext('2d'), GG = 900, G = null, graf2 = 0, glast2 = 0, gBest = 0, GC = {};
    var CRAB_IMG = art().faces.map(function (f) { var im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art().face(f.key, 64)); return im; });
    var HURT = (function () { var i = art().faces.map(function (f) { return f.key; }).indexOf(art().hurt); if (i >= 0) return CRAB_IMG[i]; var im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art().face(art().hurt, 64)); return im; })();
    function gSize() { var r = host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); gcv.width = Math.round(r.width * dpr); gcv.height = Math.round(r.height * dpr); gx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height }; }
    function pageChars() {   /* 这页聊天里每一个字现在在哪 */
      var pr = host.getBoundingClientRect(), out = []; if (!chat) return out;
      var els = o.bubble ? chat.querySelectorAll(o.bubble) : [chat];
      Array.prototype.forEach.call(els, function (b) {
        var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), nd, fs = parseFloat(getComputedStyle(b).fontSize) || 15;
        while ((nd = tw.nextNode())) {
          for (var i = 0; i < nd.data.length; i++) {
            var ch = nd.data[i]; if (!ch.trim()) continue; var rg = document.createRange(); rg.setStart(nd, i); rg.setEnd(nd, i + 1);
            var r = rg.getBoundingClientRect(); if (r.width && r.top > pr.top && r.bottom < pr.bottom) out.push({ ch: ch, x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2, sz: fs });
          }
        }
      });
      return out;
    }
    function token(n, fb) { var v = getComputedStyle(host).getPropertyValue(n).trim(); return v || fb; }
    function startGame() {
      if (G) return; closeMenu(); closePill(); if (open) setOpen(false);
      var sz = gSize(), cs = pageChars();
      GC = { ink: token('--ink', '#2e2a26'), bg: token('--bg', '#f4f1ec'), accent: token('--accent', '#b5533a') };
      G = { w: sz.w, h: sz.h, pieces: [], halves: [], dots: [], pops: [], trail: [], stroke: [], score: 0, combo: 0, comboT: 0, over: false, spawn: 1.7, t: 0, flash: 0, prev: null, down: false, pool: cs.map(function (c) { return c.ch; }) };
      if (!G.pool.length) G.pool = Array.from('切一切');
      if (chat) chat.classList.add('mc-shatter');
      cs.forEach(function (c, i) { G.pieces.push({ x: c.x, y: c.y, vx: rr2(-90, 90), vy: -rr2(280, 560), rot: 0, vr: rr2(-3, 3), ch: c.ch, crab: -1, delay: i * .014, size: c.sz }); });   /* 开场：一个个从气泡里蹦出来 */
      game.classList.add('on'); game.querySelector('.mc-over').classList.remove('on'); game.querySelector('.mc-hud b').textContent = '0'; touch();
      if (!graf2) { glast2 = performance.now(); graf2 = requestAnimationFrame(gStep); }
      emit('onPlay', 'slice');
    }
    function throwOne() {
      var w = G.w, h = G.h, isCrab = G.t > 1.5 && Math.random() < .16, apex = rr2(.42, .72), x = w * rr2(.14, .86);
      G.pieces.push({ x: x, y: h + 30, vx: (w / 2 - x) * .28 + rr2(-45, 45), vy: -Math.sqrt(2 * GG * h * apex), rot: rr2(0, 6.28), vr: rr2(-3.4, 3.4),
        ch: isCrab ? '' : G.pool[Math.floor(Math.random() * G.pool.length)], crab: isCrab ? Math.floor(Math.random() * CRAB_IMG.length) : -1, delay: 0, size: 28 });
    }
    function segDist(ax, ay, bx, by, px, py) { var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0; return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }
    function sweep(ax, ay, bx, by) {
      for (var i = G.pieces.length - 1; i >= 0 && !G.over; i--) {
        var p = G.pieces[i]; if (p.delay > 0 || p.bonk) continue; var r = p.crab >= 0 ? 22 : p.size * .6 + 9;   /* 字擦边就算；螃蟹不放宽，好躲 */
        if (segDist(ax, ay, bx, by, p.x, p.y) <= r) cutP(i, Math.atan2(by - ay, bx - ax));
      }
    }
    function cutP(i, ang) {
      var p = G.pieces[i]; G.pieces.splice(i, 1); if (p.crab >= 0) { bonk(p, ang); return; }
      var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2), kick = rr2(150, 240);
      [0, 1].forEach(function (sd) { var sg = sd ? 1 : -1; G.halves.push(Object.assign({}, p, { vx: p.vx + nx * kick * sg, vy: p.vy + ny * kick * sg, vr: p.vr + sg * 2.2, cutA: ang - p.rot, side: sd, life: 1.4 })); });
      for (var k = 0; k < 7; k++) { var a = rr2(0, 6.28), v = rr2(60, 220); G.dots.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rr2(.4, .8), r: rr2(1.2, 2.8), sq: false }); }   /* 溅墨点 */
      G.comboT = .45; G.combo++; G.score += G.combo; if (G.combo >= 3) G.pops.push({ x: p.x, y: p.y - 22, t: 0, txt: '连切 ×' + G.combo });
      game.querySelector('.mc-hud b').textContent = G.score; if (navigator.vibrate) navigator.vibrate(4);
    }
    /* 刀碰到螃蟹切不开：换成哭的那张，顺着刀的方向打着转弹飞，头上一个「痛！」 */
    function bonk(p, ang) {
      p.bonk = true; p.hurt = true; p.vx = Math.cos(ang) * 260 + rr2(-40, 40); p.vy = -rr2(260, 360); p.vr = (Math.random() < .5 ? -1 : 1) * rr2(7, 11); G.pieces.push(p);
      for (var k = 0; k < 10; k++) { var a = rr2(0, 6.28), v = rr2(60, 200); G.dots.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rr2(.5, .9), r: rr2(1.4, 2.6), sq: true }); }
      G.pops.push({ x: p.x, y: p.y - 28, t: 0, txt: '痛！' }); gameOver();
    }
    function gameOver() {
      G.over = true; G.flash = 1; var ov = game.querySelector('.mc-over');
      ov.querySelector('b').textContent = Math.random() < .5 ? '螃蟹痛痛 T^T' : '被你敲到了 T^T';
      var best = gBest; gBest = Math.max(gBest, G.score);
      ov.querySelector('span').textContent = G.score + ' 分' + (G.score > best && best > 0 ? '，新纪录' : best > G.score ? '，最好 ' + best : '');
      poke(); setTimeout(bang, 300);   /* 树上那只也吓得一哆嗦 */
      setTimeout(function () { if (G) ov.classList.add('on'); }, 450); if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }
    function gStep(now) {
      var rdt = Math.max(0, Math.min(.05, (now - glast2) / 1000)); glast2 = now; if (!G) { graf2 = 0; return; }
      var dt = rdt * S.speed; G.t += dt;   /* 字和螃蟹按放慢的时间走；刀痕、连切、闪红按真时间 */
      if (G.flash > 0) G.flash = Math.max(0, G.flash - rdt * 2.5); if (G.comboT > 0) { G.comboT -= rdt; if (G.comboT <= 0) G.combo = 0; }
      var st = G.stroke;
      if (!G.over) for (var i = 0; i + 1 < st.length; i += 2) { var bx = st[i], by = st[i + 1]; G.trail.push(bx, by, 0); if (G.prev) sweep(G.prev.x, G.prev.y, bx, by); G.prev = { x: bx, y: by }; }
      st.length = 0; for (i = 2; i < G.trail.length; i += 3) G.trail[i] += rdt; while (G.trail.length && G.trail[2] > .22) G.trail.splice(0, 3);
      G.pieces.forEach(function (p) { if (p.delay > 0) { p.delay -= dt; return; } p.vy += GG * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.size < 28) p.size = Math.min(28, p.size + dt * 40); });
      G.halves.forEach(function (q) { q.vy += GG * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.life -= dt; });
      G.dots.forEach(function (d2) { d2.vy += GG * .6 * dt; d2.x += d2.vx * dt; d2.y += d2.vy * dt; d2.life -= dt; });
      G.pops.forEach(function (pp) { pp.t += rdt; });
      G.pieces = G.pieces.filter(function (p) { return p.y < G.h + 60 || p.vy < 0; }); G.halves = G.halves.filter(function (q) { return q.life > 0 && q.y < G.h + 80; });
      G.dots = G.dots.filter(function (d2) { return d2.life > 0; }); G.pops = G.pops.filter(function (p) { return p.t < .9; });
      if (!G.over) { G.spawn -= dt * Math.min(2.2, 1 + G.score * .012); if (G.spawn <= 0) { G.spawn = .95; var n = 2 + Math.floor(Math.random() * 3); for (i = 0; i < n; i++) throwOne(); } }   /* 越切越快 */
      gPaint(); graf2 = requestAnimationFrame(gStep);
    }
    function gPaint() {
      var w = G.w, h = G.h; gx.clearRect(0, 0, w, h); gx.globalAlpha = .3; gx.fillStyle = GC.bg; gx.fillRect(0, 0, w, h); gx.globalAlpha = 1;
      var drawP = function (p, cl) {
        gx.save(); gx.translate(p.x, p.y); gx.rotate(p.rot);
        if (cl) { var R = 40; gx.beginPath(); gx.save(); gx.rotate(cl.cutA); gx.rect(-R, cl.side ? 0 : -R, 2 * R, R); gx.restore(); gx.clip(); }   /* 只画刀口这一边 */
        if (p.crab >= 0) { var im = p.hurt ? HURT : CRAB_IMG[p.crab]; if (im.complete) gx.drawImage(im, -27, -27, 54, 54); }
        else { gx.fillStyle = GC.ink; gx.font = '600 ' + p.size + 'px -apple-system,"PingFang SC",sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText(p.ch, 0, 1); }
        gx.restore();
      };
      G.halves.forEach(function (q) { gx.globalAlpha = clamp(q.life / .6, 0, 1); drawP(q, q); }); gx.globalAlpha = 1;
      G.pieces.forEach(function (p) { drawP(p, null); });
      G.dots.forEach(function (d2) { gx.globalAlpha = clamp(d2.life * 2, 0, 1); if (d2.sq) { gx.fillStyle = '#f2c14e'; gx.fillRect(d2.x - d2.r, d2.y - d2.r, d2.r * 2, d2.r * 2); } else { gx.fillStyle = GC.ink; gx.beginPath(); gx.arc(d2.x, d2.y, d2.r, 0, 6.283); gx.fill(); } });
      var tr = G.trail; gx.strokeStyle = GC.accent; gx.lineCap = 'round';
      for (var i = 3; i < tr.length; i += 3) { var k = Math.max(0, 1 - tr[i + 2] / .22); gx.globalAlpha = k * .9; gx.lineWidth = Math.max(1, 7 * k); gx.beginPath(); gx.moveTo(tr[i - 3], tr[i - 2]); gx.lineTo(tr[i], tr[i + 1]); gx.stroke(); }   /* 刀痕越往后越细 */
      gx.font = '700 14px -apple-system,"PingFang SC",sans-serif'; gx.textAlign = 'center'; gx.fillStyle = GC.accent;
      G.pops.forEach(function (pp) { gx.globalAlpha = Math.max(0, 1 - pp.t / .9); gx.fillText(pp.txt, pp.x, pp.y - pp.t * 30); });
      gx.globalAlpha = 1; if (G.flash > 0) { gx.globalAlpha = G.flash * .3; gx.fillStyle = GC.accent; gx.fillRect(0, 0, w, h); gx.globalAlpha = 1; }
    }
    function endGame() { if (!G) return; G = null; game.classList.remove('on'); game.querySelector('.mc-over').classList.remove('on'); if (chat) chat.classList.remove('mc-shatter'); }   /* 字回到气泡里 */
    function gpos(e) { var r = gcv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    gcv.addEventListener('pointerdown', function (e) { if (!G || G.over) return; try { gcv.setPointerCapture(e.pointerId); } catch (_) {} G.down = true; G.prev = gpos(e); });
    gcv.addEventListener('pointermove', function (e) { if (!G || !G.down) return; var p = gpos(e); G.stroke.push(p.x, p.y); if (G.stroke.length > 64) G.stroke.splice(0, G.stroke.length - 64); });
    addEventListener('pointerup', function () { if (G) { G.down = false; G.prev = null; } });
    game.querySelector('.mc-gx').onclick = endGame; game.querySelector('.mc-gq').onclick = endGame;
    game.querySelector('.mc-gre').onclick = function () { endGame(); setTimeout(startGame, 60); };
    function play(k) {
      if (k === 'slice') setTimeout(startGame, 300);
      else if (k === 'toss') { if (mode === 'hang' || sw.on) setTimeout(function () { openPill(false); }, 350); emit('onPlay', 'toss'); }
    }

    /* ═══════════ 设置 ═══════════ */
    function set(k, v, quiet) {
      if (!(k in S) || k === 'shown') return;
      var was = S[k]; if (was === v) return;
      if (k === 'carrier') setCarrier(v);
      else S[k] = v;
      if (k === 'variant') { if (open) { open = false; setOpen(true); } else render(); if (menu) setTimeout(function () { if (menu) openMenu(menu, true); }, 30); }
      if (k === 'season') { autumnTo = v === 'red' ? 1 : 0; if (!sraf) { slast = performance.now(); sraf = requestAnimationFrame(seasonStep); } }
      if (k === 'doze') { if (!v) setSleep(false); else lastTouch = 0; }
      if (k === 'wind') wake();
      if (k === 'offX' || k === 'offY') { drawSig = ''; wake(); }
      if (k === 'move') host.classList.toggle('mc-moving', !!v);
      syncMenu(); if (!quiet) emit('onSettings', settings());
    }
    function settings() { var c = {}; Object.keys(S).forEach(function (k) { c[k] = S[k]; }); return c; }
    function again() {
      setOpen(false); closePill(); closeMenu(); endGame();
      LEAVES.forEach(function (l) { clearTimeout(l.rt); l.gone = false; l.el.style.opacity = '1'; l.ph = l.pv = 0; }); drawSig = '';
      if (!S.shown) { show(); return; }
      if (mode !== 'gone') leave(); else if (sw.on) swingLeave(); else afterGone();
    }

    /* ── 开起来：先空着，0.7 秒后从天上来 ── */
    render(); refreshCount();
    if (treeOn()) { tree.style.display = ''; } else { treeHidden = true; tree.style.display = 'none'; }
    ropeL.style.display = 'none';
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); drawSig = ''; wake(); }).observe(host);
    else addEventListener('resize', function () { measure(); drawSig = ''; wake(); });
    drawTree(); wake();
    if (S.shown) setTimeout(function () { if (mode === 'gone' && !sw.on && S.shown) { if (S.carrier === 'branch') arrive(); else swingEnter(); } }, 700);

    return {
      open: function () { setOpen(true); }, close: function () { setOpen(false); },
      unread: function () { return MSGS.slice(); },
      setUnread: function (list) { MSGS = (list || []).map(normMsg); refreshCount(); if (open && !menu) render(); if (menu === 'unread') rebuildMenu(); },
      push: push,
      set: set, settings: settings,
      show: show, hide: hide,
      play: function (k) { closeMenu(); setOpen(false); play(k || 'slice'); },
      again: again,
      brush: function () { brushAll(true); },
      toast: say
    };
  }

  window.MapleCrab = { mount: mount, defaultSets: defaultSets, version: '1.0.0' };
})();
