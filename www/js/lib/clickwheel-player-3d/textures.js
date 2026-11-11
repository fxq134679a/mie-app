// src/textures.js — 播放器的贴图（canvas 2D 画）：萤幕、转轮、中间按钮、涂鸦贴纸、耳塞、影子
// 萤幕上的字和图都在这里画；three.js 只把画好的 canvas 当贴图。不碰 WebGL，node 里能测
import { WHEEL, fmt } from './config.js'

const FAM = '"PingFang SC","PingFang TC","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif'
export const SCREEN_PX = 512
export function canvas(doc, w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c }
const font = (g, w, px) => { g.font = w + ' ' + px + 'px ' + FAM }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r)
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r); g.lineTo(x + r, y + h)
  g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath()
}
function poly(g, pts, close) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath() }
function ellip(g, s, max) {
  s = String(s || '')
  if (g.measureText(s).width <= max) return s
  while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}
function text(g, s, x, y, max, align = 'center') { g.textAlign = align; g.textBaseline = 'middle'; g.fillText(ellip(g, s, max), x, y) }
// 头像没有图时显示的字：取 label 的第一个字（英文转大写），没有就不写
export const initialOf = label => { const c = Array.from(String(label || '').trim())[0] || ''; return c.toUpperCase() }
// 播放中画三角，暂停画两竖（萤幕右上角的状态）
function playGlyph(g, x, y, s, playing) {
  if (playing) { g.beginPath(); g.moveTo(x - s * 0.45, y - s * 0.55); g.lineTo(x + s * 0.55, y); g.lineTo(x - s * 0.45, y + s * 0.55); g.closePath(); g.fill() }
  else { g.fillRect(x - s * 0.5, y - s * 0.55, s * 0.32, s * 1.1); g.fillRect(x + s * 0.18, y - s * 0.55, s * 0.32, s * 1.1) }
}
function noteGlyph(g, x, y, s, col) {
  g.save(); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * 0.09; g.lineCap = 'round'
  g.beginPath(); g.ellipse(x - s * 0.18, y + s * 0.3, s * 0.2, s * 0.15, -0.4, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(x, y + s * 0.28); g.lineTo(x, y - s * 0.45); g.quadraticCurveTo(x + s * 0.3, y - s * 0.3, x + s * 0.32, y - s * 0.05); g.stroke()
  g.restore()
}

// 萤幕：顶栏（最多两个头像 + topText + 播放状态 + 电池）、专辑封面、歌名、歌手、一句副标（例如当前歌词）、进度条
// st: { title, artist, lyric, position, duration, playing, topText, scrub, avatars: [{ label }] }
// scrub 不是 null 时表示正在转圈拖进度：进度条变粗、带一个菱形
// imgs: { cover, ava: [img, img] }，没载入到就画占位
export function drawScreen(g, S, st, imgs = {}) {
  const W = SCREEN_PX, c = S.screen
  g.save(); g.clearRect(0, 0, W, W)
  g.fillStyle = c.bg; g.fillRect(0, 0, W, W)
  const tg = g.createLinearGradient(0, 0, 0, 46); tg.addColorStop(0, c.top); tg.addColorStop(1, c.bg)
  g.fillStyle = tg; g.fillRect(0, 0, W, 46)
  g.fillStyle = c.bar; g.fillRect(0, 45, W, 2)
  const avas = (st.avatars || []).slice(0, 2)
  avas.forEach((a, i) => {
    const x = 28 + i * 24, y = 23, r = 15, im = imgs.ava && imgs.ava[i]
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath(); g.fillStyle = i ? c.accent : c.sub; g.fill(); g.clip()
    if (im) g.drawImage(im, x - r, y - r, 2 * r, 2 * r)
    else { g.fillStyle = '#ffffff'; font(g, '600', 15); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initialOf(a && a.label), x, y + 1) }
    g.restore()
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = c.top; g.stroke()
  })
  const tx = avas.length ? 28 + (avas.length - 1) * 24 + 28 : 24
  if (st.topText) { g.fillStyle = c.sub; font(g, '500', 17); text(g, st.topText, tx, 24, 410 - tx, 'left') }
  g.fillStyle = c.ink; playGlyph(g, 420, 23, 16, st.playing)
  g.strokeStyle = c.ink; g.lineWidth = 2.5; rr(g, 444, 14, 46, 19, 4); g.stroke(); g.fillRect(491, 19, 4, 9)
  g.fillStyle = c.accent; rr(g, 448, 18, 34, 11, 2); g.fill()
  // 封面：没有图就画渐层加音符
  const cs = 236, cx = (W - cs) / 2, cy = 60
  g.save(); g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.fillStyle = c.top; rr(g, cx, cy, cs, cs, 14); g.fill(); g.restore()
  g.save(); rr(g, cx, cy, cs, cs, 14); g.clip()
  if (imgs.cover) {
    const iw = imgs.cover.naturalWidth || imgs.cover.width || 1, ih = imgs.cover.naturalHeight || imgs.cover.height || 1, k = Math.max(cs / iw, cs / ih)
    g.drawImage(imgs.cover, cx + (cs - iw * k) / 2, cy + (cs - ih * k) / 2, iw * k, ih * k)
  } else {
    const cg = g.createLinearGradient(cx, cy, cx + cs, cy + cs); cg.addColorStop(0, c.top); cg.addColorStop(1, c.accent)
    g.fillStyle = cg; g.fillRect(cx, cy, cs, cs); noteGlyph(g, W / 2, cy + cs / 2, 70, 'rgba(255,255,255,0.85)')
  }
  g.restore()
  // 字
  const cur = st.scrub != null ? st.scrub : st.position
  g.fillStyle = c.ink; font(g, '700', 32); text(g, st.title || '未知歌曲', W / 2, 334, W - 60)
  g.fillStyle = c.sub; font(g, '500', 22); text(g, st.artist, W / 2, 370, W - 80)
  if (st.lyric) { g.fillStyle = c.accent; font(g, '500', 23); text(g, st.lyric, W / 2, 405, W - 70) }
  // 进度
  const bx = 44, bw = W - 88, by = 444, bh = st.scrub != null ? 12 : 8
  const fr = st.duration > 0 ? Math.min(1, Math.max(0, cur / st.duration)) : 0
  g.fillStyle = c.bar; rr(g, bx, by - bh / 2, bw, bh, bh / 2); g.fill()
  if (fr > 0) { g.fillStyle = c.accent; rr(g, bx, by - bh / 2, Math.max(bh, bw * fr), bh, bh / 2); g.fill() }
  if (st.scrub != null) { const kx = bx + bw * fr; g.fillStyle = c.ink; poly(g, [[kx, by - 13], [kx + 9, by], [kx, by + 13], [kx - 9, by]], true); g.fill() }
  g.fillStyle = c.sub; font(g, '500', 19)
  text(g, fmt(cur), bx, 478, 120, 'left')
  text(g, st.duration > 0 ? '-' + fmt(st.duration - cur) : '--:--', bx + bw, 478, 120, 'right')
  g.restore()
}

function skip(g, x, y, s, dir) { // dir 1 = 下一首（朝右），-1 = 上一首
  for (const o of [-0.5, 0.3]) {
    const bx = x + o * s * dir
    poly(g, [[bx - s * 0.4 * dir, y - s * 0.45], [bx + s * 0.4 * dir, y], [bx - s * 0.4 * dir, y + s * 0.45]], true); g.fill()
  }
  g.fillRect(dir > 0 ? x + s * 0.72 : x - s * 0.72 - s * 0.16, y - s * 0.45, s * 0.16, s * 0.9)
}
// 转轮（RingGeometry 的 uv 按外半径铺满整张图）：上 MENU、左上一首、右下一首、下播放暂停
export function drawWheel(g, S, menuLabel = 'MENU') {
  const W = 512, C = W / 2, R = W / 2, IR = R * WHEEL.inner, mid = (IR + R) / 2
  g.clearRect(0, 0, W, W)
  const rg = g.createRadialGradient(C - 60, C - 90, 20, C, C, R); rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, S.wheel)
  g.fillStyle = rg; g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 6; g.beginPath(); g.arc(C, C, IR + 3, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 4; g.beginPath(); g.arc(C, C, R - 2, 0, Math.PI * 2); g.stroke()
  g.fillStyle = S.label; font(g, '700', 38); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(menuLabel, C, C - mid)
  skip(g, C - mid, C, 26, -1); skip(g, C + mid, C, 26, 1)
  const y = C + mid, s = 24
  poly(g, [[C - s * 0.95, y - s * 0.5], [C - s * 0.15, y], [C - s * 0.95, y + s * 0.5]], true); g.fill()
  g.fillRect(C + s * 0.1, y - s * 0.5, s * 0.22, s); g.fillRect(C + s * 0.5, y - s * 0.5, s * 0.22, s)
}
// 中间按钮：机身色，刻一圈螺旋
export function drawCenter(g, S) {
  const W = 256, C = 128
  g.clearRect(0, 0, W, W)
  g.fillStyle = S.center; g.fillRect(0, 0, W, W)
  const hl = g.createRadialGradient(C - 34, C - 44, 6, C, C, C); hl.addColorStop(0, 'rgba(255,255,255,0.38)'); hl.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = hl; g.fillRect(0, 0, W, W)
  const spiral = (dx, dy) => { g.beginPath(); for (let t = 0; t <= 4.2 * Math.PI; t += 0.12) { const r = 8 + t * 7.2, x = C + dx + r * Math.cos(t), y = C + dy + r * Math.sin(t); t ? g.lineTo(x, y) : g.moveTo(x, y) } g.stroke() }
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 5; spiral(-2, -2)
  g.strokeStyle = S.groove; g.lineWidth = 8; spiral(0, 0)
}
// 手绘涂鸦贴纸：先描一圈粗白边当贴纸边，再上色，填色的再点一道高光（滴胶的亮）
const SH = {
  star: g => { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 19 : 46, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([64 + r * Math.cos(a), 66 + r * Math.sin(a)]) } return [{ f: 1, p: () => poly(g, pts, true) }] },
  tri: g => [{ f: 1, p: () => poly(g, [[64, 18], [108, 100], [20, 100]], true) }],
  dot: g => [{ f: 1, p: () => { g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2) } }],
  heart: g => [{ f: 1, p: () => { g.beginPath(); g.moveTo(64, 104); g.bezierCurveTo(14, 70, 18, 22, 52, 28); g.quadraticCurveTo(62, 30, 64, 42); g.quadraticCurveTo(66, 30, 76, 28); g.bezierCurveTo(110, 22, 114, 70, 64, 104); g.closePath() } }],
  zig: g => [{ p: () => poly(g, [[16, 78], [38, 44], [56, 80], [76, 44], [96, 80], [112, 50]]) }],
  xo: g => [{ p: () => { g.beginPath(); g.moveTo(14, 40); g.lineTo(48, 86); g.moveTo(48, 40); g.lineTo(14, 86); g.moveTo(112, 63); g.arc(88, 63, 24, 0, Math.PI * 2) } }],
  spiral: g => [{ p: () => { g.beginPath(); for (let t = 0; t <= 4 * Math.PI; t += 0.15) { const r = 4 + t * 3.3, x = 64 + r * Math.cos(t), y = 64 + r * Math.sin(t); t ? g.lineTo(x, y) : g.moveTo(x, y) } } }],
  squiggle: g => [{ p: () => { g.beginPath(); for (let x = 14; x <= 114; x += 3) { const y = 64 + Math.sin((x - 14) / 100 * Math.PI * 3) * 22; x === 14 ? g.moveTo(x, y) : g.lineTo(x, y) } } }],
  note: g => [{ p: () => { g.beginPath(); g.moveTo(74, 88); g.lineTo(74, 22); g.quadraticCurveTo(98, 30, 104, 52) } }, { f: 1, p: () => { g.beginPath(); g.ellipse(58, 92, 20, 15, -0.45, 0, Math.PI * 2) } }],
  bang: g => [{ p: () => { g.beginPath(); g.moveTo(44, 20); g.lineTo(44, 74); g.moveTo(84, 20); g.lineTo(84, 74) } }, { f: 1, p: () => { g.beginPath(); g.arc(44, 100, 9, 0, Math.PI * 2); g.moveTo(93, 100); g.arc(84, 100, 9, 0, Math.PI * 2) } }],
}
export const STICKER_KINDS = Object.keys(SH)
export function drawSticker(g, kind, color) {
  const ops = (SH[kind] || SH.dot)(g)
  g.clearRect(0, 0, 128, 128); g.lineJoin = 'round'; g.lineCap = 'round'
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'
  for (const o of ops) { o.p(); if (o.f) { g.fill(); g.lineWidth = 14 } else g.lineWidth = 26; g.stroke() }
  g.strokeStyle = color; g.fillStyle = color
  for (const o of ops) { o.p(); if (o.f) g.fill(); else { g.lineWidth = 12; g.stroke() } }
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 4
  for (const o of ops) if (o.f) { g.save(); o.p(); g.clip(); g.beginPath(); g.arc(50, 46, 26, Math.PI * 1.05, Math.PI * 1.55); g.stroke(); g.restore() }
}
// 耳塞正面：头像铺满圆；没有图就写 label 的第一个字；加一点外壳反光。i 是第几个耳塞（0 左、1 右）
export function drawBud(g, S, img, i, label) {
  const W = 256, C = 128
  g.clearRect(0, 0, W, W)
  g.save(); g.beginPath(); g.arc(C, C, C, 0, Math.PI * 2); g.closePath(); g.fillStyle = i ? S.screen.accent : S.screen.sub; g.fill(); g.clip()
  if (img) {
    const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1, k = Math.max(W / iw, W / ih)
    g.drawImage(img, (W - iw * k) / 2, (W - ih * k) / 2, iw * k, ih * k)
  } else { const t = initialOf(label); if (t) { g.fillStyle = '#ffffff'; font(g, '700', 110); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, C, C + 6) } }
  const hl = g.createRadialGradient(C - 50, C - 60, 4, C, C, C); hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = hl; g.fillRect(0, 0, W, W)
  g.restore()
}
// 机身后面那团软影子：多段缓降，避免出现明显的暗斑边界（割裂感）
export function drawShadow(g) {
  const rg = g.createRadialGradient(128, 118, 8, 128, 128, 128)
  rg.addColorStop(0, 'rgba(0,0,0,0.42)')
  rg.addColorStop(0.3, 'rgba(0,0,0,0.30)')
  rg.addColorStop(0.55, 'rgba(0,0,0,0.16)')
  rg.addColorStop(0.78, 'rgba(0,0,0,0.05)')
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256)
}