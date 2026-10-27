/* 叽哩叽哩 (jili) — 静态外壳
 * 依赖顺序：jili_core.js → jili_html.js → jili.js（均为全局 <script>，无模块）
 * 只负责搭静态骨架：.jl-root + .jl-main + .jl-tabbar + 覆盖层/弹层挂载点。
 * 所有内容渲染与交互在 jili.js 中完成。
 */
"use strict";

function injectJiliHTML() {
  var screen = document.getElementById("jili-screen");
  if (!screen) return;
  screen.innerHTML =
    '<div class="jl-root" id="jili-root">' +
      '<div class="jl-main" id="jili-main"></div>' +
      '<div class="jl-tabbar" id="jili-tabbar"></div>' +
      '<div class="jili-ovhost" id="jili-ov"></div>' +
      '<div class="jili-modalhost" id="jili-modals"></div>' +
    "</div>";
}

injectJiliHTML();
