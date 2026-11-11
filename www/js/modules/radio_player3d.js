/* 3D 转轮播放器桥接
 * 把 ES module 版的 three.js 与 clickwheel-player-3d 暴露给经典脚本 radio.js
 * 播放器外观：clickwheel-player-3d by 2046945334-oss · CC BY-NC 4.0
 * three.js · MIT
 */
import * as THREE from '../lib/three.module.min.js';
import { createPlayer, SKINS, DEFAULT_SKIN, skinOf } from '../lib/clickwheel-player-3d/index.js?v=20261110f';

window.RadioPlayer3D = {
  THREE: THREE,
  createPlayer: createPlayer,
  SKINS: SKINS,
  DEFAULT_SKIN: DEFAULT_SKIN,
  skinOf: skinOf
};

try {
  document.dispatchEvent(new Event('radioplayer3dready'));
} catch (e) {}
