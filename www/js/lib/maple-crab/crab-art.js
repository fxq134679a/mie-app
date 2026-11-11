/* 螃蟹的身子是 clawd-tank 的 Clawd（MIT，Copyright (c) 2026 Marcio Granzotto Rodrigues），许可全文见 CREDITS.md。
   ══ 螃蟹的样子（crab-art.js）══
   底子是 clawd-tank 的静态身子：躯干 11×7、手 2×2、腿 1×2、方眼，颜色 #DE886D。
   这个文件里的姿势（单手吊着树枝、两手各抓一股绳）、表情和头上的小记号，是在这个身子上另画的；
   crab/ 里六张会动的（喝热水、钓鱼、挑吃的、写信、出门、看雨）也是同一个身子加自己画的道具。

   maple-crab.js 画螃蟹只走这里，接口是：
   window.MapleCrabArt = {
     faces:   [{ key, name }, …]       长按「螃蟹」那一类、切字游戏里丢上来的，都从这张表里取
     scenes:  [{ key, name, src }, …]  会动的那几张（独立的 SVG 文件，用 <img> 放）
     hurt:    'teary'                   切字时刀碰到螃蟹，它换成哪张脸
     face(key, size) → '<svg …>'    一张静态的表情；key 不认识就画默认那张。带 xmlns、颜色写死，能直接当 data URI 用
     live(pose) → { html, tilt, body:[x,y], zz:[x,y] }
       pose：'hang' 一只手抓着枫枝梢、另一只挥；'swing' 两只手各抓一股绳
       html 挂在一个 0×0 的点上，这个点就是抓手处（hang）或绳头（swing）
       tilt 静止时整只歪多少（弧度）；body 身子中心离那个点多远（px，没转之前）；zz 打瞌睡时 z 从哪儿冒（px）
   }
   live 的 html 里用这些类，外面按状态在外层加 .sleep / .fly / .held，本文件注进去的样式负责怎么动：
     .mc-eye.open / .shut / .squint   平常 / 打瞌睡 / 被拽着或在空中
     .mc-blink 眨眼那层    .mc-wave 空着的那只手    .mc-lg.a / .mc-lg.b 两组腿 */
(function () {
  'use strict';
  if (window.MapleCrabArt) return;

  var BODY = '#DE886D', EYE = '#000000', U = 40 / 17;      /* live 里一格多少 px */
  function r(x, y, w, h, cls) { return '<rect' + (cls ? ' class="' + cls + '"' : '') + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>'; }

  /* ── 身子（clawd-tank 的底）＋ 几种手的摆法 ── */
  var TORSO = r(2, 6, 11, 7);
  function legs(live) { return r(3, 13, 1, 2, live && 'mc-lg a') + r(5, 13, 1, 2, live && 'mc-lg b') + r(9, 13, 1, 2, live && 'mc-lg a') + r(11, 13, 1, 2, live && 'mc-lg b'); }
  var ARMS = {
    sides: r(0, 9, 2, 2) + r(13, 9, 2, 2),
    up: r(0, 5, 2, 2) + r(13, 5, 2, 2) + r(1, 7, 1, 2) + r(13, 7, 1, 2),        /* 两只手举过头 */
    hang: r(0, 9, 2, 2, 'mc-wave') + r(13, 7, 2, 2) + r(13, 5, 2, 2),         /* 右手往上举两格去抓树枝，左手留在身侧挥 */
    swing: r(0, 7, 2, 2) + r(13, 7, 2, 2)                                     /* 两只手各抬高两格，一手攥一股绳 */
  };

  /* ── 眼睛和小记号 ── */
  var G = function (fill, inner, extra) { return '<g fill="' + fill + '"' + (extra || '') + '>' + inner + '</g>'; };
  var LINE = ' fill="none" stroke="#000" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round" shape-rendering="auto"';
  var EYES = {
    norm: G(EYE, r(4, 8, 1, 2) + r(10, 8, 1, 2)),
    happy: '<g' + LINE + '><polyline points="3.4,9.6 4.5,8.4 5.6,9.6"/><polyline points="9.4,9.6 10.5,8.4 11.6,9.6"/></g>',
    squint: G(EYE, r(4, 8, 1, 1) + r(5, 9, 1, 1) + r(4, 10, 1, 1) + r(10, 8, 1, 1) + r(9, 9, 1, 1) + r(10, 10, 1, 1)),   /* 三格的 > < */
    shut: G(EYE, r(3.5, 9, 2, .5) + r(9.5, 9, 2, .5)),
    wide: G(EYE, r(3.5, 7.5, 2, 2.5) + r(9.5, 7.5, 2, 2.5)) + G('#fff', r(3.5, 7.5, .8, .8) + r(9.5, 7.5, .8, .8)),
    dizzy: '<g fill="none" stroke="#000" stroke-width=".6" shape-rendering="auto"><circle cx="4.5" cy="9" r="1"/><circle cx="10.5" cy="9" r="1"/></g>'
  };
  var BLUSH = G('#F2A58D', r(2.6, 10.4, 1.8, .9) + r(10.6, 10.4, 1.8, .9));
  var SPARK = G('#F7CC4A', r(1, 1, 1, 1) + r(0, 2, 3, 1) + r(1, 3, 1, 1) + r(13, 0, 1, 1) + r(12, 1, 3, 1) + r(13, 2, 1, 1));
  var HEART = '<path d="M11.5 2.2c.6-.9 2-.5 1.8.6-.2.8-1.8 1.9-1.8 1.9s-1.6-1.1-1.8-1.9c-.2-1.1 1.2-1.5 1.8-.6z" fill="#E86A7A" shape-rendering="auto"/>';
  var BANG = G('#D9573F', r(7, 0, 1.2, 3) + r(7, 3.8, 1.2, 1.1));
  var ASK = G('#8C847C', r(12, 0, 3, 1) + r(14, 1, 1, 1) + r(13, 2, 1, 1) + r(13, 4, 1, 1));                     /* 3×5 的像素 ? */
  var ZED = G('#8C847C', r(12, 0, 3, 1) + r(14, 1, 1, 1) + r(13, 2, 1, 1) + r(12, 3, 1, 1) + r(12, 4, 3, 1));      /* 3×5 的像素 z */
  var BROW = G(EYE, '<rect x="3" y="6.6" width="2.4" height=".5" transform="rotate(15 4.2 6.8)"/><rect x="9.6" y="6.6" width="2.4" height=".5" transform="rotate(-15 10.8 6.8)"/>');
  var TEARS = G('#40C4FF', r(4, 10, 1, 2) + r(10, 10, 1, 1.5));
  var STARS = G('#F7CC4A', r(3, 2, 1, 1) + r(7, .5, 1, 1) + r(11, 2, 1, 1));

  var FACE = {
    norm:     { eyes: EYES.norm },
    happy:    { eyes: EYES.happy, arms: 'up', extra: SPARK },
    shy:      { eyes: EYES.shut + BLUSH, extra: HEART },
    startled: { eyes: EYES.wide, extra: BANG },
    sulky:    { eyes: EYES.norm + BROW, extra: ASK },
    dizzy:    { eyes: EYES.dizzy, extra: STARS },
    sleepy:   { eyes: EYES.shut, extra: ZED },
    teary:    { eyes: EYES.norm + TEARS },
    squint:   { eyes: EYES.squint + BLUSH },
    stare:    { eyes: EYES.wide }
  };
  var FACES = [
    { key: 'happy', name: '高兴' }, { key: 'shy', name: '害羞' }, { key: 'startled', name: '被戳' },
    { key: 'sulky', name: '不高兴' }, { key: 'dizzy', name: '晕了' }, { key: 'sleepy', name: '睡了' },
    { key: 'teary', name: '哭哭' }, { key: 'squint', name: '><' }, { key: 'stare', name: '盯着你' }
  ];
  function face(key, size) {
    var F = FACE[key] || FACE.norm, s = size || 40;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 17 17" width="' + s + '" height="' + s + '" shape-rendering="crispEdges" aria-hidden="true">' +
      (F.extra || '') + G(BODY, legs(false) + TORSO + ARMS[F.arms || 'sides']) + F.eyes + '</svg>';
  }

  /* ── 会动的那几张：独立文件，跟这个脚本放在一起的 crab/ 里 ── */
  var HERE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/?#]*([?#].*)?$/, '') : ''; })();
  var SCENES = [['care', '喝热水'], ['fish', '钓鱼'], ['food', '挑吃的'], ['letter', '写信'], ['travel', '出门'], ['window', '看雨']]
    .map(function (x) { return { key: x[0], name: x[1], src: HERE + 'crab/' + x[0] + '.svg', zoom: 1.6, focus: [.5, .6] }; });   /* 小格子里放大看中间 */

  /* ── 挂着的那只 ── */
  function live(pose) {
    var swing = pose === 'swing', vb = swing ? [-1, -4, 17, 21] : [-1, 0, 17, 17], o = swing ? [7.5, -3] : [14, 5.5];   /* o＝抓手处 / 绳头，在格子里的位置 */
    var px = function (v) { return Math.round(v * U * 100) / 100 + 'px'; };
    var inner = (swing ? '<path d="M7.5 -3L1 7.2M7.5 -3L14 7.2" stroke="#B9AE9F" stroke-width=".7" stroke-linecap="round" fill="none" shape-rendering="auto"/>' : '') +
      G(BODY, legs(true) + TORSO + ARMS[swing ? 'swing' : 'hang']) +
      '<g class="mc-eye open"><g class="mc-blink">' + EYES.norm + '</g></g><g class="mc-eye shut">' + EYES.shut + '</g><g class="mc-eye squint">' + EYES.squint + '</g>';
    var html = '<svg class="mc-art" viewBox="' + vb.join(' ') + '" shape-rendering="crispEdges" aria-hidden="true" style="position:absolute;overflow:visible;left:' + px(vb[0] - o[0]) + ';top:' + px(vb[1] - o[1]) +
      ';width:' + px(vb[2]) + ';height:' + px(vb[3]) + ';transform-origin:' + px(o[0] - vb[0]) + ' ' + px(o[1] - vb[1]) + '">' + inner + '</svg>';
    return {
      html: html, tilt: swing ? 0 : -0.52,                                    /* 单手吊着按物理该歪得更多，歪 30° 还认得出是它 */
      body: [(7.5 - o[0]) * U, (9.5 - o[1]) * U],
      zz: swing ? [(13 - o[0]) * U, (3 - o[1]) * U] : [-36, -24]
    };
  }

  /* 动的样式跟着这只螃蟹走：换文件时一起换掉 */
  var css = document.createElement('style');
  css.textContent =
    '.mc-crab .mc-eye.shut,.mc-crab .mc-eye.squint{display:none}' +
    '.mc-crab.sleep:not(.fly):not(.held) .mc-eye.open{display:none}.mc-crab.sleep:not(.fly):not(.held) .mc-eye.shut{display:inline}' +
    '.mc-crab.fly .mc-eye.open,.mc-crab.held .mc-eye.open,.mc-crab.fly .mc-eye.shut,.mc-crab.held .mc-eye.shut{display:none}' +
    '.mc-crab.fly .mc-eye.squint,.mc-crab.held .mc-eye.squint{display:inline}' +
    '.mc-crab .mc-blink{transform-box:fill-box;transform-origin:center;animation:mc-blink 5s infinite}' +
    '@keyframes mc-blink{0%,95%,100%{transform:none}97%{transform:scaleY(.1)}}' +
    /* 腿：拎起来那样一前一后晃（clawd-tank 里的晃法） */
    '.mc-crab .mc-lg{transform-box:fill-box;transform-origin:top center}' +
    '.mc-crab.fly .mc-lg.a,.mc-crab.held .mc-lg.a{animation:mc-dangle-a .5s infinite linear}' +
    '.mc-crab.fly .mc-lg.b,.mc-crab.held .mc-lg.b{animation:mc-dangle-b .5s infinite linear}' +
    '@keyframes mc-dangle-a{0%,100%{transform:rotate(0) scaleY(1)}50%{transform:rotate(-25deg) scaleY(.7)}}' +
    '@keyframes mc-dangle-b{0%,100%{transform:rotate(-25deg) scaleY(.7)}50%{transform:rotate(0) scaleY(1)}}' +
    /* 空着的那只手：绕贴着身子那条边转，隔一会儿挥两下 */
    '.mc-crab .mc-wave{transform-box:fill-box;transform-origin:100% 50%;animation:mc-wave 2.8s infinite ease-in-out}' +
    '.mc-crab.sleep .mc-wave{animation:none}' +
    '@keyframes mc-wave{0%,58%,100%{transform:rotate(0)}64%,78%{transform:rotate(62deg)}71%,85%{transform:rotate(32deg)}}' +
    '@media (prefers-reduced-motion:reduce){.mc-crab .mc-wave,.mc-crab .mc-blink{animation:none}}';
  (document.head || document.documentElement).appendChild(css);

  window.MapleCrabArt = { faces: FACES, scenes: SCENES, hurt: 'teary', face: face, live: live };
})();
