// src/index.js — 纯 JS 入口：createPlayer(container, options)
// 只负责外观和手势，不播放声音。播放、暂停、切歌、跳转都通过回呼交给你自己的播放器
import { build } from './engine.js?v=20261110f'
export { SKINS, DEFAULT_SKIN, skinOf, VIEW, VIEW_BODY } from './config.js'

const SR_CSS = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;'

/**
 * @param {HTMLElement} container  播放器放在这个元素里，大小跟著它走（宽高比建议 1.32 : 2.7，不要耳机时 1.18 : 1.78）
 * @param {object} options
 *   THREE            必填，import * as THREE from 'three'
 *   RoomEnvironment  选填，three/addons/environments/RoomEnvironment.js 的 RoomEnvironment；传了机身才有清漆反光
 *   skin             'lime' | 'sakura' | 'milk' | 'ink'，或自订配色物件
 *   earphones        是否显示耳机（预设 true）
 *   stickers         是否贴涂鸦贴纸（预设 true）
 *   menuLabel        转轮上方的字（预设 'MENU'）
 *   intro            是否播放进场动画（预设 true）
 *   reducedMotion    关掉动画；不传时跟著系统的「减少动态效果」
 *   state            萤幕初始内容，栏位同 update()
 *   cover            封面图片网址
 *   avatars          [{ src, label }]，最多两个，显示在萤幕顶栏和两个耳塞上
 *   onCommand(cmd)   按了转轮：'prev' | 'next' | 'play'（中间按钮和下方都是 'play'）
 *   onMenu()         按了 MENU
 *   onSeek(seconds)  转圈拖进度后松手；不传就不能转圈拖进度
 *   onOutsideTap()   点到播放器外面的空白处
 *   onError(err)     浏览器不支援 WebGL、或 WebGL 中途挂掉
 */
export function createPlayer(container, options = {}) {
  const { THREE } = options
  if (!THREE) throw new Error('createPlayer 需要传入 THREE')
  if (!container) throw new Error('createPlayer 需要一个容器元素')
  const doc = container.ownerDocument || document
  const win = doc.defaultView || window
  if (win.getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const cv = doc.createElement('canvas')
  cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;-webkit-tap-highlight-color:transparent;'
  container.appendChild(cv)
  const cb = { onCommand: options.onCommand, onMenu: options.onMenu, onSeek: options.onSeek, onOutsideTap: options.onOutsideTap, onError: options.onError }
  let reduced = options.reducedMotion
  if (reduced == null) { try { reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { reduced = false } }
  let e
  try {
    e = build(THREE, cv, {
      skin: options.skin, earphones: options.earphones, stickers: options.stickers, menuLabel: options.menuLabel, intro: options.intro,
      RoomEnvironment: options.RoomEnvironment || null, reducedMotion: reduced,
      onCommand: c => cb.onCommand && cb.onCommand(c),
      onMenu: () => cb.onMenu && cb.onMenu(),
      onSeek: options.onSeek ? s => cb.onSeek && cb.onSeek(s) : undefined,
      onOutsideTap: () => cb.onOutsideTap && cb.onOutsideTap(),
    })
  } catch (err) {
    cv.remove()
    if (cb.onError) cb.onError(err)
    throw err
  }
  cv.addEventListener('webglcontextlost', ev => { ev.preventDefault(); if (cb.onError) cb.onError(new Error('WebGL context lost')) })
  // 读屏软体看不到 3D 画面，放几个看不见的按钮给它们用
  const sr = doc.createElement('div'); sr.style.cssText = SR_CSS
  const mk = (txt, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = txt; b.addEventListener('click', ev => { ev.stopPropagation(); fn() }); sr.appendChild(b); return b }
  mk('上一首', () => cb.onCommand && cb.onCommand('prev'))
  const playBtn = mk('播放', () => cb.onCommand && cb.onCommand('play'))
  mk('下一首', () => cb.onCommand && cb.onCommand('next'))
  mk(options.menuLabel || 'MENU', () => cb.onMenu && cb.onMenu())
  container.appendChild(sr)
  container.setAttribute('role', 'group')
  const label = () => { const s = e.M.st; container.setAttribute('aria-label', '播放器：' + (s.title || '未知歌曲') + (s.artist ? ' - ' + s.artist : '')); playBtn.textContent = s.playing ? '暂停' : '播放' }
  const fit = () => { const r = container.getBoundingClientRect(); e.setSize(Math.max(1, r.width), Math.max(1, r.height)) }
  fit()
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
  if (ro) ro.observe(container); else win.addEventListener('resize', fit)
  if (options.state) e.update(options.state)
  if (options.avatars) e.setAvatars(options.avatars)
  if (options.cover) e.setCover(options.cover)
  label()
  let dead = false
  return {
    /** 改萤幕内容：{ title, artist, lyric, position, duration, playing, topText }，只传要改的栏位 */
    update(o) { if (dead) return; e.update(o || {}); label() },
    /** 换封面，传空字串回到预设的渐层 */
    setCover(src) { if (!dead) e.setCover(src) },
    /** 换头像：[{ src, label }] */
    setAvatars(list) { if (!dead) e.setAvatars(list) },
    /** 换回呼函式 */
    setCallbacks(o) { Object.assign(cb, o || {}) },
    /** 容器大小变了但浏览器没有 ResizeObserver 时，自己呼叫 */
    resize: fit,
    get state() { return { ...e.M.st } },
    destroy() {
      if (dead) return
      dead = true
      if (ro) ro.disconnect(); else win.removeEventListener('resize', fit)
      e.dispose(); cv.remove(); sr.remove()
      container.removeAttribute('aria-label'); container.removeAttribute('role')
    },
  }
}