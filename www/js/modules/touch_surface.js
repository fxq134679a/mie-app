// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// 触感空间 · 网页触摸面：一个文件装下「记触摸 + 画面回应 + 震动 + 停手后翻译」。
// 来源：github.com/sibylsea-hub/touch-space（web/touch-surface.js 原样引入）
// 不依赖任何库，只要先引入 touch_translate.js。
//
// 用法：
//   <canvas id="touch" style="position:fixed; inset:0; width:100%; height:100%"></canvas>
//   const surface = TouchSurface.create(canvas, { onBatch: text => { /* <touch …>…</touch> */ } });
//
// 选项：effect 'ripple'|'skin'；map 'screen'|'body'|'lower'；pause 停手多久算一批（null=攒着等 flush）；
//       haptics 震动开关；background 底图；onStart/onPause/onBatch 回调。
// 返回：{ setEffect, setMap, setBackground, redraw, flush, destroy }
(function (root) {
  'use strict';
  const MAX_DROPS = 40, MAX_F = 5;

  // ---------- 着色器：画面是一张纹理，按手指算每个像素该从哪里取色 ----------
  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }';
  const FS = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime, uMode, uDpr, uAmp;
uniform vec4 uDrops[${MAX_DROPS}];   // 水纹：x, y, 起始时刻, 强度
uniform vec4 uF[${MAX_F}];           // 皮肤：x, y, 深度, 暖
uniform vec2 uO[${MAX_F}];           // 皮肤：被手指拖着走的位移
uniform vec3 uWarm;
void main(){
  vec2 p = gl_FragCoord.xy, s = p; vec3 add = vec3(0.); float mul = 1., warm = 0.;
  if (uMode < .5) {
    // 水纹：每滴起一两道圈往外走，150pt/秒，1.6 秒散完
    vec2 disp = vec2(0.); float light = 0.;
    for (int i = 0; i < ${MAX_DROPS}; i++) {
      vec4 d = uDrops[i]; float age = uTime - d.z;
      if (d.w <= 0. || age < 0. || age > 1.6) continue;
      float lam = (22. + 18. * age) * uDpr, w = lam * .55;
      vec2 v = p - d.xy; float r = length(v) + .001; float x = r - age * 150. * uDpr;
      float env = exp(-x * x / (w * w)) * exp(-age * 2.2) * d.w / (1. + r / (140. * uDpr));
      env *= smoothstep(0., 16. * uDpr, r);
      float ph = x * 6.2831 / lam; disp += v / r * sin(ph) * env; light += cos(ph) * env;
    }
    s = p - disp * 10. * uDpr * uAmp; add = vec3(light * .06 * uAmp);
  } else {
    // 皮肤：手指处陷下去一小块，被拖着走，按久了透出暖色
    vec2 L = normalize(vec2(-.55, .8));
    for (int i = 0; i < ${MAX_F}; i++) {
      vec4 f = uF[i];
      if (abs(f.z) < 1e-4 && dot(uO[i], uO[i]) < 1e-4) continue;
      float R = (34. + 8. * f.w) * uDpr; vec2 v = p - f.xy; float r2 = dot(v, v);
      float fa = exp(-r2 / (R * R)), fb = exp(-r2 / (R * R * 1.6));
      s += v * f.z * .85 * fa * uAmp - uO[i] * fb * uAmp;
      vec2 g = v / R * 2. * f.z * fa;
      add += vec3(dot(g, L) * .16 * uAmp); mul *= 1. - .18 * max(f.z, 0.) * fa; warm += f.w * max(f.z, 0.) * fa;
    }
  }
  vec3 col = texture2D(uTex, clamp(s / uRes, vec2(0.), vec2(1.))).rgb * mul + add;
  gl_FragColor = vec4(mix(col, uWarm, clamp(warm * .16, 0., .32)), 1.);
}`;

  const ramp = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const settled = s => Math.abs(s.depth) < .002 && Math.abs(s.dv) < .01 && Math.hypot(s.ox, s.oy) < .05 && Math.hypot(s.ovx, s.ovy) < .1 && s.warm < .01;
  const rgb = color => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; const v = c.fillStyle;
    return v[0] === '#' ? [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255) : v.match(/[\d.]+/g).slice(0, 3).map(x => x / 255); };
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // 力度从哪来：'pen' 触控笔真压力 / 'area' 手指面积估算 / 'none' 读不到
  function pressureSource(e) {
    if (e.pointerType === 'pen' && e.pressure > 0) return 'pen';
    if (e.pointerType === 'touch' && (e.width > 1 || e.height > 1)) return 'area';
    return 'none';
  }

  // 轻重：触控笔有真压力；手指按接触面积估（轻点半径约 12–20，按实约 40）；拿不到就当「轻轻」
  function pressureOf(e) {
    if (e.pointerType === 'pen' && e.pressure > 0) return Math.min(1, e.pressure);
    if (e.pointerType === 'touch' && (e.width > 1 || e.height > 1)) return Math.min(1, Math.max(0, (Math.max(e.width, e.height) / 2 - 12) / 32));
    return 0.3;
  }

  function create(canvas, options = {}) {
    const opt = Object.assign({ effect: 'ripple', map: 'screen', pause: 2000, haptics: true }, options);
    const T = root.TouchTranslate;
    if (!T) throw new Error('先引入 translate.js，再引入 touch-surface.js');
    let mode = opt.effect === 'skin' ? 1 : 0, map = opt.map, background = opt.background || null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const buzz = ms => { if (!opt.haptics) return; try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

    // ---------- WebGL ----------
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    let U = {}, tex;
    if (gl) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog); gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['uRes', 'uTime', 'uMode', 'uDpr', 'uAmp', 'uDrops', 'uF', 'uO', 'uWarm']) U[n] = gl.getUniformLocation(prog, n);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    }

    // ---------- 底图：默认是一张纸（淡水渍 + 细纤维 + 点阵）；没有纹理的地方看不出变形 ----------
    const src = document.createElement('canvas'), ctx = src.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    function colors() {
      const cs = getComputedStyle(canvas), v = n => cs.getPropertyValue(n).trim();
      return Object.assign({ bg: v('--bg') || '#eef1f2', blot: v('--blot') || '#b9cdd8', line: v('--muted') || '#7b8891', warm: v('--warm') || '#e9a58f' }, opt.colors);
    }
    function drawPaper(c) {
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
      const r = rng(7);
      ctx.globalAlpha = .18;
      for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, rad = 60 + r() * 160;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, c.blot); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      ctx.globalAlpha = .25; ctx.strokeStyle = c.line; ctx.lineWidth = .5;
      for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H, a = r() * Math.PI, l = 6 + r() * 22;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
      ctx.globalAlpha = .35; ctx.fillStyle = c.line;
      for (let y = 18; y < H; y += 26) for (let x = 18; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, .9, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    function redraw() {
      const c = colors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (typeof background === 'function') background(ctx, W, H);
      else if (background) ctx.drawImage(background, 0, 0, W, H);
      else drawPaper(c);
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
      gl.uniform3fv(U.uWarm, rgb(c.warm));
      wake();
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2); W = Math.max(1, r.width); H = Math.max(1, r.height);
      for (const c of [canvas, src]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      if (gl) { gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform1f(U.uDpr, dpr); }
      redraw();
    }

    // ---------- 画面物理：水纹的滴、皮肤的手指槽（弹簧） ----------
    const t0 = performance.now(), now = () => (performance.now() - t0) / 1000;
    const drops = []; let dropHead = 0; const slots = []; const fingers = new Map();
    function emitDrop(x, y, amp) { const d = { x, y, t: now(), amp };
      if (drops.length < MAX_DROPS) drops.push(d); else { drops[dropHead] = d; dropHead = (dropHead + 1) % MAX_DROPS; } }
    function newSlot(id, x, y) {
      let s = slots.find(s => !s.active && settled(s));
      if (!s) { if (slots.length < MAX_F) { s = { depth: 0, dv: 0, warm: 0 }; slots.push(s); } else s = slots.reduce((a, b) => (a.downAt < b.downAt ? a : b)); }
      Object.assign(s, { id, active: true, downAt: now(), fx: x, fy: y, cx: x, cy: y, gx: x, gy: y, gvx: 0, gvy: 0, ox: 0, oy: 0, ovx: 0, ovy: 0, hold: 0 });
      return s;
    }
    function stepSlot(s, h) {
      if (s.active) s.hold += h;
      const hr = ramp(s.hold, .35, 2.6);
      if (s.active) {
        s.cx = s.fx; s.cy = s.fy;
        const k = 40, c = 2 * Math.sqrt(k);   // 皮肤被手指黏着拖
        s.gvx += (k * (s.fx - s.gx) - c * s.gvx) * h; s.gvy += (k * (s.fy - s.gy) - c * s.gvy) * h; s.gx += s.gvx * h; s.gy += s.gvy * h;
        const dx = s.fx - s.gx, dy = s.fy - s.gy, L = Math.hypot(dx, dy), M = 24, f = L > 0 ? M * Math.tanh(L / M) / L : 0;
        s.ox = dx * f; s.oy = dy * f; s.ovx = s.ovy = 0; s.warm += (hr - s.warm) * Math.min(1, h * 1.5);
      } else {
        const k = 110, c = 7;                 // 松手：欠阻尼弹回、晃两下
        s.ovx += (-k * s.ox - c * s.ovx) * h; s.ovy += (-k * s.oy - c * s.ovy) * h; s.ox += s.ovx * h; s.oy += s.ovy * h;
        s.warm -= s.warm * Math.min(1, h * .45);
      }
      const target = s.active ? .55 + .45 * hr : 0;
      s.dv += (220 * (target - s.depth) - 15 * s.dv) * h; s.depth += s.dv * h;
    }

    // ---------- 渲染：只在有东西在动时跑，静下来一帧都不画 ----------
    let running = false, last = 0, alive = true;
    const dropArr = new Float32Array(MAX_DROPS * 4), fArr = new Float32Array(MAX_F * 4), oArr = new Float32Array(MAX_F * 2);
    const busy = () => fingers.size > 0 || (mode === 0 ? drops.some(d => now() - d.t < 1.6) : slots.some(s => s.active || !settled(s)));
    function wake() { if (!running && gl && alive) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
    function frame(ts) {
      if (!alive) { running = false; return; }
      const dt = Math.min((ts - last) / 1000, 1 / 20); last = ts;
      const steps = Math.max(1, Math.round(dt * 240));
      if (mode === 1) for (let i = 0; i < steps; i++) for (const s of slots) stepSlot(s, dt / steps);
      draw();
      if (busy()) requestAnimationFrame(frame); else { running = false; draw(); }
    }
    function draw() {
      dropArr.fill(0); fArr.fill(0); oArr.fill(0);
      drops.forEach((d, i) => dropArr.set([d.x * dpr, (H - d.y) * dpr, d.t, d.amp], i * 4));
      slots.forEach((s, i) => { fArr.set([s.cx * dpr, (H - s.cy) * dpr, s.depth, s.warm], i * 4); oArr.set([s.ox * dpr, -s.oy * dpr], i * 2); });
      gl.uniform1f(U.uTime, now()); gl.uniform1f(U.uMode, mode); gl.uniform1f(U.uAmp, reduced ? .5 : 1);
      gl.uniform4fv(U.uDrops, dropArr); gl.uniform4fv(U.uF, fArr); gl.uniform2fv(U.uO, oArr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ---------- 记下每一笔：一根手指从按下到抬起是一笔 ----------
    let strokes = [], timer = null;
    const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function flush() {
      clearTimeout(timer); timer = null;
      if (!strokes.length) return null;
      for (const f of fingers.values()) f.stroke.end = f.stroke.samples[f.stroke.samples.length - 1].t;
      const batch = strokes; strokes = [];
      const text = T.describe(batch, { w: W, h: H }, map);
      if (opt.onBatch) opt.onBatch(text, batch);
      return text;
    }
    const down = e => {
      canvas.setPointerCapture(e.pointerId);
      clearTimeout(timer); timer = null;
      const [x, y] = at(e), p = pressureOf(e), t = e.timeStamp / 1000;
      const stroke = { samples: [{ x, y, t, p }], start: t, end: t, ended: false };
      strokes.push(stroke);
      const f = { stroke, lx: x, ly: y, lt: now(), ex: x, ey: y, travel: 0 };
      fingers.set(e.pointerId, f);
      if (mode === 0) emitDrop(x, y, 1); else f.slot = newSlot(e.pointerId, x, y);
      buzz(Math.round(8 + 25 * p));                         // 按下那一下：越重越长
      if (opt.onStart) opt.onStart(strokes.length, pressureSource(e));
      wake();
    };
    const move = e => {
      const f = fingers.get(e.pointerId); if (!f) return;
      const [x, y] = at(e), p = pressureOf(e), t = now(), dt = Math.max(t - f.lt, 1 / 240);
      const step = Math.hypot(x - f.lx, y - f.ly), sp = step / dt;
      f.lx = x; f.ly = y; f.lt = t; f.travel += step;
      const lastS = f.stroke.samples[f.stroke.samples.length - 1];
      if (Math.hypot(x - lastS.x, y - lastS.y) >= 1.5) { f.stroke.samples.push({ x, y, t: e.timeStamp / 1000, p }); f.stroke.end = e.timeStamp / 1000; }
      if (mode === 0 && Math.hypot(x - f.ex, y - f.ey) > 22) { emitDrop(x, y, .35 + Math.min(sp / 2200, .5)); f.ex = x; f.ey = y; }
      if (mode === 1 && f.slot && f.slot.id === e.pointerId) { f.slot.fx = x; f.slot.fy = y; }
      if (f.travel > 60) { f.travel = 0; buzz(Math.round(5 + 15 * p)); }   // 抚的时候：每走一段轻敲一下（网页没有连续震动）
      wake();
    };
    const up = e => {
      const f = fingers.get(e.pointerId); if (!f) return;
      f.stroke.end = e.timeStamp / 1000; f.stroke.ended = true;
      if (f.slot && f.slot.id === e.pointerId) f.slot.active = false;
      fingers.delete(e.pointerId);
      if (!fingers.size) { if (opt.onPause) opt.onPause(strokes.length); if (opt.pause != null) timer = setTimeout(flush, opt.pause); }
      wake();
    };
    canvas.style.touchAction = 'none';   // 不让浏览器拿去滚动、缩放
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    const ro = new ResizeObserver(() => resize()); ro.observe(canvas);
    resize();

    return {
      setEffect(e) { mode = e === 'skin' ? 1 : 0; drops.length = 0; dropHead = 0; slots.length = 0; wake(); },
      setMap(m) { map = m; },
      setBackground(b) { background = b; redraw(); },
      redraw, flush,
      get webgl() { return !!gl; },
      /* MIE 适配：当前攒着的笔画数（含按住未松的手指），测试/调试用 */
      count() { return strokes.length + fingers.size; },
      destroy() {
        alive = false; clearTimeout(timer); ro.disconnect();
        canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      },
    };
  }

  root.TouchSurface = { create, pressureOf, pressureSource };
})(typeof window !== 'undefined' ? window : globalThis);
