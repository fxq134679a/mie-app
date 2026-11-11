// src/engine.js — 用 three.js 搭播放器：机身（带倒角的烤漆）、萤幕（canvas 贴图）、转轮、中间按钮、涂鸦贴纸、耳机线
// 手势：转轮上 MENU / 左右 / 下 / 中间是按键；手指沿转轮转圈拖进度（顺时针往后），松手才跳；
//       按住机身别的地方拖会跟著歪，松手弹回；点到播放器外面算 onOutsideTap
// makeScene 不碰 WebGL（node 里能直接搭场景测）；build 才建 renderer，只在有动画或画面变了时才画
import { skinOf, POD, BEVEL, CAP, SCREEN, WHEEL, wheelZone, angDelta, SCRUB_START, scrubTo, STICKERS, EAR, branchPts, VIEW, VIEW_BODY } from './config.js'
import { canvas, drawScreen, drawWheel, drawCenter, drawSticker, drawShadow, drawBud, SCREEN_PX } from './textures.js?v=20261110f'

export const FZ = POD.d / 2 // 机身正面的 z
export const FOV = 30
const DIRS = { menu: [0, 1], prev: [-1, 0], next: [1, 0], play: [0, -1], center: [0, 0] }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const buzz = n => { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(n) } catch {} }
function roundedShape(THREE, hw, hh, r) {
  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hh - r); s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hh); s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hh + r); s.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}
// 萤幕上要显示的状态，外面传进来的栏位名称和这里一致
export const EMPTY_STATE = { title: '', artist: '', lyric: '', position: 0, duration: 0, playing: false, topText: '', scrub: null, avatars: [] }

export function makeScene(THREE, { skin, doc = globalThis.document, earphones = true, menuLabel = 'MENU', stickers = true } = {}) {
  const S = skinOf(skin)
  const textures = []
  const T = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.push(t); return t }
  const scene = new THREE.Scene()
  const root = new THREE.Group(), model = new THREE.Group()
  root.add(model); scene.add(root)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6a66, 0.9))
  const key = new THREE.DirectionalLight(0xfff6ee, 2.2); key.position.set(-1.5, 2.5, 3); scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(2, -1, 2); scene.add(fill)
  // 机身：正面平的那块是 CAP，倒角往外长 BEVEL，整体正好是 POD 的尺寸
  const bodyGeo = new THREE.ExtrudeGeometry(roundedShape(THREE, CAP.hw, CAP.hh, CAP.r), {
    depth: POD.d - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 20,
  })
  bodyGeo.translate(0, 0, -(POD.d / 2 - BEVEL))
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: S.body, metalness: S.metal, roughness: S.rough, clearcoat: 1, clearcoatRoughness: 0.08 })
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.name = 'body'; model.add(body)
  // 萤幕：黑边 + 不受光照影响的萤幕
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(THREE, SCREEN.w / 2, SCREEN.h / 2, 0.035), 12),
    new THREE.MeshStandardMaterial({ color: S.bezel, roughness: 0.25, metalness: 0.1 }))
  bezel.position.set(0, SCREEN.y, FZ + 0.001); model.add(bezel)
  const sw = SCREEN.w - 2 * SCREEN.bezel
  const scv = canvas(doc, SCREEN_PX, SCREEN_PX), sg = scv.getContext('2d'), stex = T(scv)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }))
  screen.position.set(0, SCREEN.y, FZ + 0.002); screen.name = 'screen'; model.add(screen)
  // 转轮（按下去朝按的那边歪一下）+ 中间按钮（按下去往里凹）
  const WR = WHEEL.r, IR = WR * WHEEL.inner, CR = IR * 0.9
  const wheel = new THREE.Group(); wheel.position.set(0, WHEEL.y, FZ); model.add(wheel)
  const wcv = canvas(doc, 512, 512); drawWheel(wcv.getContext('2d'), S, menuLabel)
  const face = new THREE.Mesh(new THREE.RingGeometry(IR, WR, 72, 1), new THREE.MeshStandardMaterial({ map: T(wcv), roughness: 0.42, metalness: 0 }))
  face.position.z = 0.009; face.name = 'wheel'; wheel.add(face)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, 0.009, 72, 1, true), new THREE.MeshStandardMaterial({ color: S.wheel, roughness: 0.5 }))
  rim.rotation.x = Math.PI / 2; rim.position.z = 0.0045; wheel.add(rim)
  const btn = new THREE.Group(); btn.position.set(0, WHEEL.y, FZ); model.add(btn)
  const ccv = canvas(doc, 256, 256); drawCenter(ccv.getContext('2d'), S)
  const cFace = new THREE.Mesh(new THREE.CircleGeometry(CR, 56),
    new THREE.MeshPhysicalMaterial({ map: T(ccv), roughness: S.rough, metalness: S.metal, clearcoat: 1, clearcoatRoughness: 0.1 }))
  cFace.position.z = 0.006; cFace.name = 'center'; btn.add(cFace)
  const cRim = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, 0.006, 56, 1, true), bodyMat)
  cRim.rotation.x = Math.PI / 2; cRim.position.z = 0.003; btn.add(cRim)
  // 涂鸦贴纸（滴胶那种亮）
  const stickerMeshes = stickers ? STICKERS.map((k, i) => {
    const cv = canvas(doc, 128, 128); drawSticker(cv.getContext('2d'), k.kind, S.ink[k.c])
    const m = new THREE.Mesh(new THREE.PlaneGeometry(k.s, k.s),
      new THREE.MeshPhysicalMaterial({ map: T(cv), transparent: true, alphaTest: 0.4, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }))
    m.position.set(k.x, k.y, FZ + 0.002 + i * 0.0001); m.rotation.z = k.rot; m.name = 'sticker'; model.add(m)
    return m
  }) : []
  // 影子挂在 root 上：机身歪的时候影子不跟著歪
  const shcv = canvas(doc, 256, 256); drawShadow(shcv.getContext('2d'))
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshBasicMaterial({ map: T(shcv), transparent: true, depthWrite: false, opacity: 0.55 }))
  shadow.position.set(0.04, -0.08, -0.25); root.add(shadow)

  // 萤幕和耳塞上要画的东西
  const st = { ...EMPTY_STATE }
  const imgs = { cover: null, ava: [null, null] }
  // 耳机：插头插在机身顶上、跟著机身歪；两个耳塞和分叉点挂在 root 上不跟著歪；
  // 线每帧按插头现在的位置重新拉，分叉点带一点弹簧慢半拍，看起来是线被扯著晃
  let ear = null, plugG = null, buds = [], cables = [], syncCable = () => false
  const budTex = [], budCtx = []
  const labelOf = i => (st.avatars[i] && st.avatars[i].label) || ''
  if (earphones) {
    const E = EAR
    const cableMat = new THREE.MeshStandardMaterial({ color: S.wheel, roughness: 0.45, metalness: 0 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.25, metalness: 0.85 })
    const V = a => new THREE.Vector3(a[0], a[1], a[2])
    const tubeGeo = pts => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, E.cableR, 8, false)
    const top = POD.h / 2
    plugG = new THREE.Group(); plugG.name = 'plug'; model.add(plugG)
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(E.plugR, E.plugR * 1.1, E.plugH, 24), cableMat)
    plug.position.set(E.jackX, top + E.plugH / 2, 0); plugG.add(plug)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(E.plugR * 0.62, E.plugR * 0.62, 0.016, 20), metalMat)
    ring.position.set(E.jackX, top + 0.006, 0); plugG.add(ring)
    ear = new THREE.Group(); ear.name = 'earphones'; root.add(ear)
    const TK = E.trunk.map(V), BR = [0, 1].map(i => branchPts(i).map(V))
    const split = new THREE.Mesh(new THREE.SphereGeometry(E.cableR * 2.3, 16, 12), cableMat)
    split.position.copy(TK[TK.length - 1]); ear.add(split)
    cables = [TK, BR[0], BR[1]].map(pts => { const m = new THREE.Mesh(tubeGeo(pts), cableMat); ear.add(m); return m })
    E.buds.forEach((b, i) => {
      const g = new THREE.Group(); g.position.set(b.x, b.y, 0); g.rotation.z = b.rot; g.name = 'bud'; ear.add(g)
      const shell = new THREE.Mesh(new THREE.SphereGeometry(b.r, 32, 20), new THREE.MeshPhysicalMaterial({ color: S.wheel, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }))
      shell.scale.set(1, 1, 0.45); g.add(shell)
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(E.stemR * 0.8, E.stemR, E.stem, 20), cableMat)
      stem.position.set(0, -(b.r * 0.7 + E.stem / 2), 0); g.add(stem)
      const cv = canvas(doc, 256, 256), cx = cv.getContext('2d'); drawBud(cx, S, null, i, '')
      const tx = T(cv); budTex.push(tx); budCtx.push(cx)
      const bf = new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.84, 48), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }))
      bf.position.z = b.r * 0.45 + 0.002; g.add(bf)
      const br = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.86, 0.011, 10, 48), bodyMat)
      br.position.z = b.r * 0.45; g.add(br)
      buds.push(g)
    })
    // 插头顶（机身座标）换到 root 座标，按离原位多远把整根线挪过去；越靠近耳塞挪得越少，耳塞本身不动
    const tipLocal = new THREE.Vector3(E.jackX, top + E.plugH, 0), upLocal = new THREE.Vector3(0, 1, 0)
    const tip = new THREE.Vector3(), up = new THREE.Vector3(), D = new THREE.Vector3(), sOff = new THREE.Vector3(), sTgt = new THREE.Vector3(), sVel = new THREE.Vector3()
    const W = [1, 0.62, 0.32]
    const rebuild = () => {
      const tr = [tip.clone(), tip.clone().addScaledVector(up, 0.05)]
      for (let k = 1; k < TK.length - 1; k++) tr.push(TK[k].clone().addScaledVector(D, W[k]))
      tr.push(TK[TK.length - 1].clone().add(sOff))
      const brs = BR.map(pts => pts.map((q, k) => q.clone().addScaledVector(sOff, Math.max(0, 1 - k / (pts.length - 1)) * (k ? 0.6 : 1))))
      ;[tr, brs[0], brs[1]].forEach((pts, k) => { cables[k].geometry.dispose(); cables[k].geometry = tubeGeo(pts) })
      split.position.copy(TK[TK.length - 1]).add(sOff)
    }
    let cableKey = null
    // k 是弹簧系数；k >= 1 直接到位。回传 true 表示线还在晃，下一帧还要画
    syncCable = (k = 0.18) => {
      model.updateMatrix()
      tip.copy(tipLocal).applyMatrix4(model.matrix); up.copy(upLocal).transformDirection(model.matrix)
      D.copy(tip).sub(TK[0])
      sTgt.copy(D).multiplyScalar(0.18)
      let busy = false
      if (k >= 1) { sOff.copy(sTgt); sVel.set(0, 0, 0) }
      else {
        sVel.multiplyScalar(0.72).addScaledVector(sTgt.clone().sub(sOff), k); sOff.add(sVel)
        busy = sVel.length() > 0.0004 || sTgt.distanceTo(sOff) > 0.0008
        if (!busy) { sOff.copy(sTgt); sVel.set(0, 0, 0) }
      }
      const ck = tip.toArray().concat(sOff.toArray()).map(v => v.toFixed(4)).join()
      if (ck !== cableKey) { cableKey = ck; rebuild() }
      return busy
    }
    syncCable(1)
  }

  // 萤幕：只有显示出来的东西变了才重画
  let last = ''
  const redraw = force => {
    const k = JSON.stringify([st.title, st.artist, st.lyric, Math.floor(st.scrub != null ? st.scrub : st.position), Math.floor(st.duration), st.playing, st.topText, st.scrub != null, st.avatars.map(a => a && a.label), !!imgs.cover, !!imgs.ava[0], !!imgs.ava[1]])
    if (!force && k === last) return false
    last = k; drawScreen(sg, S, st, imgs); stex.needsUpdate = true
    return true
  }
  const redrawBud = i => { if (budCtx[i]) { drawBud(budCtx[i], S, imgs.ava[i], i, labelOf(i)); budTex[i].needsUpdate = true } }
  // 回传 true 表示萤幕重画了
  const setState = o => {
    const prev = st.avatars.map(a => a && a.label).join('|')
    Object.assign(st, o)
    if (!Array.isArray(st.avatars)) st.avatars = []
    if (st.avatars.map(a => a && a.label).join('|') !== prev) { redrawBud(0); redrawBud(1) }
    return redraw(false)
  }
  const setImg = (slot, im) => {
    if (slot === 'cover') imgs.cover = im
    else { imgs.ava[slot] = im; redrawBud(slot) }
    return redraw(true)
  }
  redraw(true)
  const dispose = () => {
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()) })
    textures.forEach(t => t.dispose())
  }
  return { S, scene, root, model, body, screen, wheel, face, btn, cFace, stickers: stickerMeshes, shadow, ear, buds, plugG, cables, syncCable, st, imgs, setState, setImg, redraw, dispose, view: earphones ? VIEW : VIEW_BODY }
}

// build：建 renderer、镜头、手势。cv 是一个 <canvas>
// opts: skin、earphones、menuLabel、stickers、RoomEnvironment（three/addons 里的，传了机身才有清漆反光）、reducedMotion、
//       onCommand(cmd)（'prev' | 'next' | 'play'）、onMenu()、onSeek(秒)、onOutsideTap()
export function build(THREE, cv, opts = {}) {
  const { RoomEnvironment = null, reducedMotion = false } = opts
  const reduced = !!reducedMotion
  const cb = { onCommand: opts.onCommand, onMenu: opts.onMenu, onSeek: opts.onSeek, onOutsideTap: opts.onOutsideTap }
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
  renderer.setClearColor(0x000000, 0)
  const M = makeScene(THREE, { skin: opts.skin, earphones: opts.earphones !== false, menuLabel: opts.menuLabel || 'MENU', stickers: opts.stickers !== false, doc: cv.ownerDocument || document })
  let envRT = null
  if (RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment()
    envRT = pm.fromScene(room, 0.04); M.scene.environment = envRT.texture; M.scene.environmentIntensity = 0.55
    pm.dispose(); if (room.dispose) room.dispose()
  }
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50)
  // 动画：进场（从上面落下来）、机身歪（弹簧回正）、按键（pv 往 pt 靠）
  const A = { intro: reduced || opts.intro === false ? 1 : 0, t0: 0, rx: 0, ry: 0, trx: 0, try: 0, pv: 0, pt: 0, pz: null }
  let raf = 0, alive = true
  const frame = () => {
    raf = 0; if (!alive) return
    const t = performance.now()
    let busy = false
    if (A.intro < 1) { if (!A.t0) A.t0 = t; A.intro = Math.min(1, (t - A.t0) / 460); busy = true }
    const e = 1 - Math.pow(1 - A.intro, 3)
    M.root.position.y = (1 - e) * 0.9; M.root.rotation.x = -(1 - e) * 0.6; M.root.scale.setScalar(0.86 + 0.14 * e)
    const k = reduced ? 1 : 0.22
    A.rx += (A.trx - A.rx) * k; A.ry += (A.try - A.ry) * k
    if (Math.abs(A.trx - A.rx) + Math.abs(A.try - A.ry) > 0.0005) busy = true; else { A.rx = A.trx; A.ry = A.try }
    M.model.rotation.set(A.rx, A.ry, 0)
    if (M.syncCable(reduced ? 1 : 0.2)) busy = true
    A.pv += (A.pt - A.pv) * (reduced ? 1 : 0.45)
    if (Math.abs(A.pt - A.pv) > 0.002) busy = true; else A.pv = A.pt
    const d = DIRS[A.pz] || DIRS.center
    M.btn.position.z = FZ - (A.pz === 'center' ? 0.004 * A.pv : 0)
    M.wheel.rotation.set(A.pz && A.pz !== 'center' ? -d[1] * 0.06 * A.pv : 0, A.pz && A.pz !== 'center' ? d[0] * 0.06 * A.pv : 0, 0)
    renderer.render(M.scene, camera)
    if (busy) raf = requestAnimationFrame(frame)
  }
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(frame) }
  // 镜头：机身（和耳机）整个装得下
  const setSize = (W, H) => {
    renderer.setSize(W, H, false); camera.aspect = W / H
    const t = Math.tan(FOV * Math.PI / 360), V = M.view
    camera.position.set(0, V.cy, Math.max(V.h / (2 * t), V.w / (2 * t * camera.aspect))); camera.lookAt(0, V.cy, 0)
    camera.updateProjectionMatrix(); kick()
  }
  // 手指：射线打到正面那个平面上，换成机身座标再判断按在转轮哪块
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), nrm = new THREE.Vector3(), pt = new THREE.Vector3()
  const setRay = ev => { const r = cv.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera) }
  const frontLocal = () => {
    M.root.updateMatrixWorld(true)
    nrm.set(0, 0, 1).transformDirection(M.model.matrixWorld); pt.set(0, 0, FZ).applyMatrix4(M.model.matrixWorld)
    plane.setFromNormalAndCoplanarPoint(nrm, pt)
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3())
    return p ? M.model.worldToLocal(p) : null
  }
  const angOf = p => Math.atan2(p.y - WHEEL.y, p.x)
  const hitTargets = M.ear ? [M.model, M.ear] : [M.model]
  let G = null
  const down = ev => {
    if (G) return
    setRay(ev)
    const onPod = ray.intersectObjects(hitTargets, true).length > 0, p = frontLocal()
    const zone = onPod && p ? wheelZone(p.x, p.y - WHEEL.y) : null
    G = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, onPod, zone, a: p ? angOf(p) : 0, acc: 0, scrub: false, base: M.st.position, tick: 0, rx0: A.trx, ry0: A.try }
    try { cv.setPointerCapture(ev.pointerId) } catch {}
    if (zone) { A.pz = zone; A.pt = 1; buzz(6); kick() }
  }
  const move = ev => {
    if (!G || ev.pointerId !== G.id) return
    const dx = ev.clientX - G.x, dy = ev.clientY - G.y
    if (Math.hypot(dx, dy) > 8) G.moved = true
    if (G.zone && G.zone !== 'center') {
      setRay(ev); const p = frontLocal(); if (!p) return
      const a = angOf(p); G.acc += angDelta(G.a, a); G.a = a
      if (!G.scrub && Math.abs(G.acc) > SCRUB_START && M.st.duration > 0 && cb.onSeek) { G.scrub = true; A.pt = 0; kick() }
      if (G.scrub) {
        const tk = Math.floor(G.acc / (Math.PI / 8)); if (tk !== G.tick) { G.tick = tk; buzz(3) }
        if (M.setState({ scrub: scrubTo(G.base, G.acc, M.st.duration) })) kick()
      }
      return
    }
    if (G.onPod && !G.zone) { A.trx = clamp(G.rx0 + dy * 0.005, -0.4, 0.4); A.try = clamp(G.ry0 + dx * 0.005, -0.45, 0.45); kick() }
  }
  const up = ev => {
    if (!G || ev.pointerId !== G.id) return
    const g = G; G = null
    try { cv.releasePointerCapture(ev.pointerId) } catch {}
    if (g.zone) { A.pv = Math.max(A.pv, 0.75); A.pt = 0; kick() }
    if (ev.type === 'pointercancel') { if (g.scrub && M.setState({ scrub: null })) kick(); A.trx = 0; A.try = 0; kick(); return }
    if (g.scrub) { const sec = M.st.scrub; M.setState({ scrub: null, position: sec }); kick(); buzz(8); if (cb.onSeek) cb.onSeek(sec); return }
    if (g.zone) {
      if (g.zone === 'menu') { if (cb.onMenu) cb.onMenu() }
      else if (cb.onCommand) cb.onCommand(g.zone === 'center' ? 'play' : g.zone)
      return
    }
    if (g.onPod) { A.trx = 0; A.try = 0; kick(); return }
    if (!g.moved && cb.onOutsideTap) cb.onOutsideTap()
  }
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move)
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
  // 图：外站的图要能跨域（伺服器给 Access-Control-Allow-Origin）才画得上，不然 WebGL 会拒绝这张贴图
  const sameOrigin = src => /^(data:|blob:|\/(?!\/)|\.\.?\/)/.test(src) || (typeof location !== 'undefined' && src.startsWith(location.origin + '/'))
  const loadImg = (src, done, fail) => {
    const im = new Image()
    if (!sameOrigin(src)) im.crossOrigin = 'anonymous'
    im.onload = () => { if (alive) done(im) }
    im.onerror = () => { if (alive && fail) fail() }
    im.src = src
  }
  let coverSrc = null
  const setCover = src => {
    src = String(src || '')
    if (src === coverSrc) return
    coverSrc = src
    if (M.setImg('cover', null)) kick()
    if (!src) return
    loadImg(src, im => { if (coverSrc === src && M.setImg('cover', im)) kick() })
  }
  // avatars: [{ src, label }]，最多两个；label 在没有图、或图载入失败时显示第一个字
  let avaSrc = ['', '']
  const setAvatars = list => {
    list = (Array.isArray(list) ? list : []).slice(0, 2).map(a => (typeof a === 'string' ? { src: a, label: '' } : { src: (a && a.src) || '', label: (a && a.label) || '' }))
    if (M.setState({ avatars: list.map(a => ({ label: a.label })) })) kick()
    for (let i = 0; i < 2; i++) {
      const src = (list[i] && list[i].src) || ''
      if (src === avaSrc[i]) continue
      avaSrc[i] = src
      if (M.setImg(i, null)) kick()
      if (src) loadImg(src, im => { if (avaSrc[i] === src && M.setImg(i, im)) kick() })
    }
  }
  const update = o => { if (M.setState(o)) kick() }
  const setCallbacks = o => Object.assign(cb, o)
  const dispose = () => {
    alive = false; if (raf) cancelAnimationFrame(raf)
    cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move)
    cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up)
    if (envRT) envRT.dispose()
    M.dispose(); renderer.dispose(); try { renderer.forceContextLoss() } catch {}
  }
  return { M, setSize, update, setCover, setAvatars, setCallbacks, kick, dispose }
}