/* 初始化 MDX 解析器：注册依赖模块并暴露 window.MdictParser */
(function () {
  'use strict';
  var amd = window.__amd;

  amd.register('pako', [], function () { return window.pako; });
  amd.register('bluebird', [], function () { return window.__Bluebird; });
  amd.register('mdict-parseXml', [], function () {
    return function (str) { return (new DOMParser()).parseFromString(str, 'text/xml'); };
  });

  /* 按 index.html 中 <script> 的加载顺序依次登记匿名 AMD 模块 */
  amd.popAnon('ripemd128');      /* 脚本: ripemd128.js            */
  amd.popAnon('lzo');            /* 脚本: minilzo-decompress.js   */
  amd.popAnon('mdict-common');   /* 脚本: mdict-common.js         */
  amd.popAnon('mdict-parser');   /* 脚本: mdict-parser.js         */

  amd.require(['mdict-parser'], function (parser) {
    window.MdictParser = parser;
  });
})();
