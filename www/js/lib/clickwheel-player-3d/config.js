// src/config.js — 配色、尺寸、转轮分区、转圈换算成秒、贴纸摆放、耳机线
// 这里只放纯逻辑，不碰 DOM 和 WebGL，node 里能直接测（test/config.test.js）
// 座标都以机身正面为准：中心是原点，y 朝上，机身宽 1

// 四种配色。body / wheel / center 这些是机身各部位的颜色，screen 是萤幕，ink 是贴纸用的六种颜色
export const SKINS = [
  { id: 'lime', name: '青柠绿', body: '#9fd11a', metal: 0.3, rough: 0.3, wheel: '#f4f4ef', label: '#9aa0a5', center: '#9fd11a', bezel: '#17181a', groove: '#6f9410',
    screen: { bg: '#f6f6ef', top: '#e6ebd2', ink: '#1e2316', sub: '#6a7060', accent: '#5a8500', bar: '#dadfc8' },
    ink: ['#ff5a36', '#ffd23f', '#35c3e0', '#1b1b1b', '#ffffff', '#ff8fb1'] },
  { id: 'sakura', name: '樱花粉', body: '#f2c3cf', metal: 0.12, rough: 0.34, wheel: '#fffafb', label: '#c9a3ae', center: '#f2c3cf', bezel: '#3b2a31', groove: '#d79aab',
    screen: { bg: '#fff8f8', top: '#f8e3e8', ink: '#4a2f39', sub: '#a07f8a', accent: '#c4708e', bar: '#f1dbe1' },
    ink: ['#ff7aa2', '#ffd57a', '#9ad7ff', '#5a3b46', '#ffffff', '#c69bff'] },
  { id: 'milk', name: '奶白', body: '#f4efe4', metal: 0.05, rough: 0.38, wheel: '#ffffff', label: '#b3a996', center: '#e8dfcd', bezel: '#2a2622', groove: '#d6cbb4',
    screen: { bg: '#fbf9f3', top: '#efe9dc', ink: '#3a332a', sub: '#8f8574', accent: '#b0844e', bar: '#ebe4d6' },
    ink: ['#ff8a5b', '#f6c945', '#7cc6b8', '#3a332a', '#ffffff', '#f2a0b5'] },
  { id: 'ink', name: '墨黑', body: '#2a2c31', metal: 0.4, rough: 0.28, wheel: '#3b3e45', label: '#c6c9cf', center: '#2a2c31', bezel: '#0c0c0e', groove: '#18191c',
    screen: { bg: '#1d1f24', top: '#2a2e36', ink: '#f2f3f5', sub: '#a3a8b2', accent: '#8fb4ff', bar: '#3a3f4a' },
    ink: ['#ff6b5b', '#ffd23f', '#5fd3e8', '#f2f3f5', '#1b1b1b', '#ff8fb1'] },
]
export const DEFAULT_SKIN = 'lime'
// 传 id 字串，或直接传一个自订配色物件（缺的栏位用预设配色补）
export function skinOf(skin) {
  const base = SKINS.find(s => s.id === DEFAULT_SKIN)
  if (skin && typeof skin === 'object') return { ...base, ...skin, screen: { ...base.screen, ...(skin.screen || {}) }, ink: skin.ink && skin.ink.length >= 6 ? skin.ink : base.ink }
  return SKINS.find(s => s.id === skin) || base
}

// 尺寸（世界单位）：机身、萤幕（含黑边）、转轮（inner 是中间按钮占转轮半径的比例）
export const POD = { w: 1, h: 1.62, d: 0.14, r: 0.13 }
// 机身边上一圈倒角：正面平的那块（CAP）比机身每边小 BEVEL；贴纸只贴在 CAP 里
export const BEVEL = 0.02
export const CAP = { hw: POD.w / 2 - BEVEL, hh: POD.h / 2 - BEVEL, r: POD.r - BEVEL }
export const SCREEN = { w: 0.78, h: 0.78, y: 0.35, bezel: 0.025 }
export const WHEEL = { r: 0.29, y: -0.44, inner: 0.37 }

// 转轮上按在哪：x、y 是相对转轮圆心的座标（y 朝上）
// 上 menu、左 prev、右 next、下 play、正中 center；圈外回传 null
export function wheelZone(x, y) {
  const r = Math.hypot(x, y) / WHEEL.r
  if (r > 1.02) return null
  if (r < WHEEL.inner) return 'center'
  const a = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
  if (a >= 45 && a < 135) return 'menu'
  if (a >= 135 && a < 225) return 'prev'
  if (a >= 225 && a < 315) return 'play'
  return 'next'
}
// 从角度 a0 转到 a1 转了多少弧度：顺时针为正（y 朝上的座标里顺时针是角度变小）
export function angDelta(a0, a1) {
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return -d
}
// 转过这么多弧度才算在拖进度，之前算手抖，松手照常当按键
export const SCRUB_START = 0.3
// 转一整圈走多少秒：整首歌大约转 4 圈，最少 20 秒、最多 90 秒
export const secPerTurn = dur => Math.min(90, Math.max(20, (Number(dur) || 160) / 4))
export function scrubTo(base, acc, dur) {
  const v = (Number(base) || 0) + acc / (2 * Math.PI) * secPerTurn(dur)
  const d = Number(dur) || 0
  return Math.max(0, d > 0 ? Math.min(d, v) : v)
}
export const fmt = s => { s = Math.max(0, Math.floor(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

// 机身上的手绘涂鸦贴纸：x、y 是机身正面座标，s 是直径，c 是 skin.ink 里第几个颜色
// 都避开萤幕和转轮，也不贴到倒角上（test/config.test.js 核对）
export const STICKERS = [
  { kind: 'star', x: -0.43, y: 0.52, s: 0.068, rot: 0.25, c: 0 },
  { kind: 'tri', x: 0.43, y: 0.68, s: 0.066, rot: -0.3, c: 1 },
  { kind: 'dot', x: 0.432, y: 0.42, s: 0.04, rot: 0, c: 2 },
  { kind: 'zig', x: -0.43, y: 0.16, s: 0.066, rot: 1.2, c: 1 },
  { kind: 'star', x: 0.43, y: 0.06, s: 0.06, rot: -0.2, c: 4 },
  { kind: 'dot', x: -0.435, y: 0.72, s: 0.035, rot: 0, c: 5 },
  { kind: 'xo', x: -0.33, y: -0.15, s: 0.13, rot: -0.18, c: 3 },
  { kind: 'spiral', x: 0.33, y: -0.16, s: 0.12, rot: 0.4, c: 3 },
  { kind: 'squiggle', x: -0.395, y: -0.5, s: 0.13, rot: 1.1, c: 2 },
  { kind: 'note', x: 0.395, y: -0.48, s: 0.12, rot: 0.2, c: 0 },
  { kind: 'bang', x: 0.3, y: -0.71, s: 0.11, rot: 0.15, c: 1 },
  { kind: 'heart', x: -0.3, y: -0.71, s: 0.1, rot: -0.25, c: 5 },
]

// 耳机：插头插在机身顶上，线往上走到分叉，两个耳塞上可以贴头像（左边第 0 个，右边第 1 个）
// trunk 是插头到分叉那段线经过的点，buds 是两个耳塞的圆心、朝向、半径
export const EAR = {
  jackX: 0.16, plugR: 0.032, plugH: 0.085, cableR: 0.0095, stem: 0.13, stemR: 0.032,
  trunk: [[0.16, POD.h / 2 + 0.085, 0], [0.2, 0.99, 0.03], [0.13, 1.09, 0.05], [0.07, 1.17, 0.03]],
  buds: [{ x: -0.25, y: 1.5, rot: 0.24, r: 0.15 }, { x: 0.33, y: 1.52, rot: -0.2, r: 0.15 }],
}
// 耳塞柄的下端（线接在这）：柄从耳塞往下伸，跟著耳塞歪
export const budStemBottom = b => { const L = b.r * 0.7 + EAR.stem; return [b.x + Math.sin(b.rot) * L, b.y - Math.cos(b.rot) * L, 0] }
// 分叉点到第 i 个耳塞那段线：先往外弯一点再上去
export function branchPts(i) {
  const s = EAR.trunk[EAR.trunk.length - 1], e = budStemBottom(EAR.buds[i]), dir = i ? 1 : -1
  return [s, [s[0] + (e[0] - s[0]) * 0.35 + dir * 0.06, s[1] + (e[1] - s[1]) * 0.3, 0.06], [s[0] + (e[0] - s[0]) * 0.75 + dir * 0.03, s[1] + (e[1] - s[1]) * 0.72, 0.04], e]
}
// 镜头要装下的范围（机身 + 耳机）：宽、高、中心的 y。容器宽高比照 VIEW.w / VIEW.h 最刚好
export const VIEW = { w: 1.32, h: 2.7, cy: 0.41 }
// 不要耳机时，镜头只装机身
export const VIEW_BODY = { w: 1.18, h: 1.78, cy: 0 }
