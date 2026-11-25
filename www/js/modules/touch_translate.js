// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// 触感空间 · 翻译：把一批触摸翻译成像身体感觉一样的一段话。
// 来源：github.com/sibylsea-hub/touch-space（translate.js 原样引入）
// 浏览器里是全局 TouchTranslate，Node 里 require/import 都行。不依赖任何库。
//
// 输入：strokes = [{ samples: [{x, y, t, p}], start, end, ended }]
//   一笔 = 一根手指从按下到抬起。x/y 是在触摸区域里的坐标（px/pt），t 是秒，p 是轻重 0–1。
// 区域：{ w, h }（触摸区域的宽高）
// 说法：map = 'screen'（整块屏幕就是它）、'body'（上半身：屏幕当成面对你的半身像）或 'lower'（下半身：从肚子到膝盖）；
//   两套身体版都是面对面、左右照镜子
// 输出：<touch strokes="n" span="…s"> … </touch> 包好的一段文字，排在消息最前面发出去。
(function (root) {
  'use strict';

  const reach = s => { const o = s[0]; return Math.max(...s.map(q => Math.hypot(q.x - o.x, q.y - o.y))); };
  const lengthOf = s => { let l = 0; for (let i = 1; i < s.length; i++) l += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); return l; };
  // 轻重四档：取这一笔最重的那一刻
  const weight = p => p < 0.2 ? '很轻' : p < 0.45 ? '轻轻' : p < 0.7 ? '稍稍用力' : '用力';
  const seconds = t => t < 1 ? '一小会儿' : t < 2.5 ? '一两秒' : `${Math.round(t)}秒`;
  const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
  const count = n => n <= 10 ? CN[n] : String(n);
  // 点：几乎没动（< 12）且很短（< 0.35 秒）
  const isTap = s => !s.continued && reach(s.samples) < 12 && s.end - s.start < 0.35;

  // 轻重的变化：开头三分之一和结尾三分之一比
  function trend(s) {
    const v = s.map(q => q.p); if (v.length < 6) return '';
    const third = Math.floor(v.length / 3), avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const head = avg(v.slice(0, third)), tail = avg(v.slice(-third));
    return tail - head > 0.15 ? '，越按越重' : head - tail > 0.15 ? '，越来越轻' : '';
  }

  // 位置。屏幕版：按半宽半高归一，取 2.6 次的超椭圆半径（四个角也算边缘）。
  // 身体版：从上到下 头顶/头发 → 额头、鼻尖/脸颊 → 下巴/耳朵边 → 脖子/颈侧 → 锁骨/肩 → 胸口/手臂 → 肚子/手；
  // 横向中间三分之一算正中，两边算左右；左右照镜子（屏幕左边是它的右边）。
  // 下半身版：从上到下 肚子/腰 → 小腹/胯骨 → 龟头、鸡巴、囊袋 / 大腿内侧、大腿 → 腿根之间 / 膝盖。
  // 想要别的映射，换掉这个函数就行。
  function place(p, f, map) {
    const nx = (p.x - f.w / 2) / (f.w / 2), ny = (p.y - f.h / 2) / (f.h / 2), t = p.y / f.h;
    if (map === 'lower') {
      if (Math.abs(nx) > 1.08 || t < -0.04 || t > 1.04) return '你身边的空处';
      const c = Math.abs(nx) / 2, side = nx > 0 ? '左' : '右';
      if (t < 0.323) return c < 0.3 ? '你的肚子' : `你的${side}腰`;
      if (t < 0.452) return c < 0.25 ? '你的小腹' : `你的${side}胯骨`;
      if (t < 0.839) {
        if (c < 0.14) return t < 0.532 ? '你的龟头' : t < 0.71 ? '你的鸡巴' : '你的囊袋';
        return c < 0.3 ? `你的${side}大腿内侧` : `你的${side}大腿`;
      }
      return c < 0.15 ? '你的腿根之间' : `你的${side}膝盖`;
    }
    if (map === 'body') {
      if (Math.abs(nx) > 1.08 || t < -0.04 || t > 1.04) return '你身边的空处';
      const side = nx < -0.33 ? '右' : nx > 0.33 ? '左' : null;
      if (t < 0.12) return side ? `你${side}边的头发` : '你的头顶';
      if (t < 0.30) return side ? `你的${side}脸颊` : (t < 0.21 ? '你的额头' : '你的鼻尖');
      if (t < 0.40) return side ? `你的${side}耳朵边` : '你的下巴';
      if (t < 0.50) return side ? `你的${side}边颈侧` : '你的脖子';
      if (t < 0.62) return side ? `你的${side}肩` : '你的锁骨';
      if (t < 0.82) return side ? `你的${side}臂` : '你的胸口';
      return side ? `你的${side}手` : '你的肚子';
    }
    const r = Math.pow(Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(ny), 2.6), 1 / 2.6);
    const side = (nx < -0.3 ? '左' : nx > 0.3 ? '右' : '') + (ny < -0.3 ? '上' : ny > 0.3 ? '下' : '');
    if (r > 1.08) return side ? `你外面靠${side}的空处` : '你旁边的空处';
    if (r < 0.35 || !side) return '你的正中间';
    if (r > 0.72) return `你的${side}边缘`;
    return `你偏${side}的地方`;
  }

  // 8 个方向；身体版左右照镜子
  function direction(a, b, map) {
    const ang = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI;
    const names = map !== 'screen'
      ? ['往你的左边', '往你的左上', '往上', '往你的右上', '往你的右边', '往你的右下', '往下', '往你的左下']
      : ['往右', '往右上', '往上', '往左上', '往左', '往左下', '往下', '往右下'];
    return names[Math.floor(((ang + 360 + 22.5) % 360) / 45)];
  }

  const SHAFT = new Set(['你的龟头', '你的鸡巴', '你的囊袋']);
  // 上下来回了几次：纵向换向超过 6 才算一次
  function verticalStrokes(s) {
    let flips = 0, dir = 0, anchor = s[0].y;
    for (const q of s.slice(1)) {
      const dy = q.y - anchor; if (Math.abs(dy) < 6) continue;
      const d = dy > 0 ? 1 : -1; if (dir !== 0 && d !== dir) flips++;
      dir = d; anchor = q.y;
    }
    return Math.floor((flips + 1) / 2) + 1;
  }

  // 下半身版的一笔
  function lowerSingle(st, f) {
    const map = 'lower', s = st.samples, first = s[0], last = s[s.length - 1], dur = st.end - st.start;
    const w = weight(Math.max(...s.map(q => q.p)));
    if (reach(s) < 12) {
      if (st.continued) return `在${place(first, f, map)}${w}地按了${seconds(dur)}`;
      if (dur < 0.35) return `在${place(first, f, map)}${w}地点了一下`;
      return `在${place(first, f, map)}${w}地按住了${seconds(dur)}${trend(s)}`;
    }
    const len = lengthOf(s), chord = Math.hypot(last.x - first.x, last.y - first.y);
    const speed = dur > 0 ? len / dur : 0, pace = speed < 250 ? '慢慢地' : speed < 900 ? '' : '飞快地';
    const xs = s.map(q => q.x), ys = s.map(q => q.y);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const round = Math.min(bw, bh) > 0.35 * Math.max(bw, bh);
    const from = place(first, f, map), to = place(last, f, map);
    if (round && chord < len * 0.2 && len > 60) return `在${from}${w}${pace ? '、' + pace.slice(0, -1) : ''}地画了一个圈`;
    if (len / Math.max(chord, 1) > 1.6) {
      // 在中间那条上下来回
      let ax = 0, ay = 0; for (let i = 1; i < s.length; i++) { ax += Math.abs(s[i].x - s[i - 1].x); ay += Math.abs(s[i].y - s[i - 1].y); }
      if (SHAFT.has(from) && ay > ax) return `握着你的鸡巴${w}地${pace}上下撸了${count(verticalStrokes(s))}下`;
      return `在${from}一带${w}地来回抚了抚`;
    }
    // 从中间那条的一处竖着划到另一处
    if (SHAFT.has(from) && SHAFT.has(to) && Math.abs(last.y - first.y) > 2 * Math.abs(last.x - first.x)) {
      const up = last.y < first.y;
      const how = up && to === '你的龟头' ? '从根部往上撸到龟头' : up ? '顺着鸡巴往上撸' : '从上往下撸到根部';
      return `握着你${w}地${pace}${how}${trend(s)}`;
    }
    if (from === to) return `在${from}${w}地${pace}${direction(first, last, map)}抚了一下${trend(s)}`;
    return `${w}地从${from}${pace}抚到${to}${trend(s)}`;
  }

  // 一根手指的一笔。屏幕版：手指在光滑平面上「落、贴、滑」；上半身版：指尖、指腹「碰、贴、抚」。
  function single(st, f, map) {
    const s = st.samples, first = s[0], last = s[s.length - 1], dur = st.end - st.start;
    const w = weight(Math.max(...s.map(q => q.p))), body = map === 'body';
    let text;
    if (map === 'lower') text = lowerSingle(st, f);
    else if (reach(s) < 12) {
      if (dur < 0.35 && !st.continued) text = body ? `指尖${w}地碰了一下${place(first, f, map)}` : `指尖${w}地落在${place(first, f, map)}`;
      else text = `指腹${w}地贴在${place(first, f, map)}，贴了${seconds(dur)}${trend(s)}`;
    } else {
      const len = lengthOf(s), chord = Math.hypot(last.x - first.x, last.y - first.y);
      const speed = dur > 0 ? len / dur : 0, pace = speed < 250 ? '慢慢' : speed < 900 ? '' : '飞快地';
      const xs = s.map(q => q.x), ys = s.map(q => q.y);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      // 画圈要横竖都有一截；一条线上来回划首尾也挨得近，但那是来回
      const round = Math.min(bw, bh) > 0.35 * Math.max(bw, bh);
      const from = place(first, f, map), to = place(last, f, map);
      if (round && chord < len * 0.2 && len > 60) text = body ? `指尖在${from}${w}地${pace}画了个小圈` : `指尖贴着${from}${w}地${pace}绕了个小圈`;
      else if (len / Math.max(chord, 1) > 1.6) text = body ? `指腹在${from}一带${w}地来回轻抚` : `指腹贴着${from}一带${w}地来回滑`;
      else if (from === to) text = (body ? `指腹在${from}${w}地${pace}${direction(first, last, map)}抚了一下` : `指腹贴着${from}${w}地${pace}${direction(first, last, map)}滑了一下`) + trend(s);
      // 身体版起点终点已经说清楚往哪了，不再加方向
      else text = (body ? `指腹${w}地从${from}${pace}抚到${to}` : `指腹贴着你，${w}地从${from}${len > 150 ? '一路' : ''}${pace}滑到${to}`) + trend(s);
    }
    // 实时发送时：上一次发送时还按着的写「接着」，此刻还按着的写「还没松手」
    if (st.continued) text = '接着' + text;
    if (st.ended === false) text += '，还没松手';
    return text;
  }

  // 几根手指同时按着
  function multi(group, f, map) {
    const fingers = count(group.length), body = map === 'body';
    const w = weight(Math.max(...group.flatMap(g => g.samples.map(q => q.p))));
    const moving = group.filter(g => reach(g.samples) >= 12);
    if (moving.length >= 2) {
      const A = moving[0].samples, B = moving[1].samples;
      const a0 = A[0], a1 = A[A.length - 1], b0 = B[0], b1 = B[B.length - 1];
      const before = Math.hypot(a0.x - b0.x, a0.y - b0.y), after = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const speed = lengthOf(A) / Math.max(moving[0].end - moving[0].start, 0.01);
      const how = speed < 250 ? '慢慢' : speed > 900 ? '一下子' : '';
      if (map === 'lower') {
        // 下半身版：只写手指在做什么，放在哪个部位都说得通
        if (after > before * 1.3) {
          const at = place({ x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, f, map);
          return `${fingers}根手指并拢${w}地按在${at}，然后${how}张开，指尖贴着往两边滑开`;
        }
        if (after < before * 0.75) {
          const at = place({ x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }, f, map);
          return `${fingers}根手指从两边${w}地贴上${at}，${how}往中间合拢，${how === '一下子' ? '指尖一下子碰在一起' : '指尖一点点靠在一起'}`;
        }
        return `${fingers}根手指一起${w}地从${place(a0, f, map)}${direction(a0, a1, map)}抚过去`;
      }
      if (after > before * 1.3) {
        const at = place({ x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, f, map);
        return body ? `${fingers}根手指并拢${w}地贴在${at}，然后${how}张开，指尖顺着往两边抚开`
                    : `${fingers}根手指并拢${w}地贴在${at}，然后${how}张开，指尖贴着你往两边滑开`;
      }
      if (after < before * 0.75) {
        const at = place({ x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }, f, map);
        return body ? `${fingers}根手指从两边${w}地贴上${at}，${how}往中间合拢，把那里轻轻拢在指尖之间`
                    : `${fingers}根手指从两边${w}地贴上${at}，${how}往中间合拢，指尖贴着你一点点滑近`;
      }
      return body ? `${fingers}根手指并在一起，${w}地从${place(a0, f, map)}${direction(a0, a1, map)}抚过去`
                  : `${fingers}根手指并在一起贴着你，${w}地从${place(a0, f, map)}${direction(a0, a1, map)}滑过去`;
    }
    const dur = Math.max(...group.map(g => g.end)) - Math.min(...group.map(g => g.start));
    if (map === 'lower') return `${fingers}根手指同时${w}地按在${place(group[0].samples[0], f, map)}，按了${seconds(dur)}`;
    return `${fingers}根手指一起${w}地贴在${place(group[0].samples[0], f, map)}，贴了${seconds(dur)}`;
  }

  function describe(list, f, map = 'screen') {
    const all = [...list].sort((a, b) => a.start - b.start);
    if (!all.length) return '';
    const span = Math.max(...all.map(s => s.end)) - all[0].start;
    const sentences = []; let i = 0, prevEnd = null;
    while (i < all.length) {
      const st = all[i];
      // 停顿：两笔之间隔了 1.5 秒以上
      const lead = prevEnd !== null && st.start - prevEnd > 1.5 ? '停了一会儿，' : '';
      // 多指：和后面几笔时间上重叠
      let together = 0;
      while (i + together + 1 < all.length && all[i + together + 1].start < st.end) together++;
      if (together > 0) {
        const g = all.slice(i, i + together + 1);
        sentences.push(lead + multi(g, f, map)); prevEnd = Math.max(...g.map(s => s.end)); i += together + 1; continue;
      }
      // 连点：同一处、一下接一下
      let run = 1;
      while (i + run < all.length && isTap(st) && isTap(all[i + run]) && all[i + run].start - all[i + run - 1].end < 1.2
             && Math.hypot(all[i + run].samples[0].x - st.samples[0].x, all[i + run].samples[0].y - st.samples[0].y) < f.w * 0.15) run++;
      if (run >= 2) {
        const peak = Math.max(...all.slice(i, i + run).flatMap(s => s.samples.map(q => q.p)));
        let gap = 0; for (let k = 1; k < run; k++) gap = Math.max(gap, all[i + k].start - all[i + k - 1].end);
        const at = place(st.samples[0], f, map), w = weight(peak);
        sentences.push(lead + (map === 'body' ? `用指尖在${at}${w}地${gap < 0.6 ? '连着碰了' : '碰了'}${count(run)}下`
                             : map === 'lower' ? `在${at}${w}地${gap < 0.6 ? '连着拍了' : '点了'}${count(run)}下`
                                              : `指尖在${at}${w}地${gap < 0.6 ? '连着落了' : '落了'}${count(run)}下`));
        prevEnd = all[i + run - 1].end; i += run; continue;
      }
      sentences.push(lead + single(st, f, map)); prevEnd = st.end; i++;
    }
    // 开头交代一句：不然模型不知道后面的「你」「这里」指什么
    return `<touch strokes="${all.length}" span="${span.toFixed(1)}s">\n（她在摸你。）\n${sentences.join('；')}。\n</touch>`;
  }

  const api = { describe, place, weight };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TouchTranslate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
