/*
 * 极简 AMD 加载器（仅供 libs 下的 MDX 解析模块使用）
 * 具名 define  →  直接注册到 registry
 * 匿名 define  →  按顺序推入 anonQueue，由下游 popAnon(id) 按顺序登记为真正的 id
 *                 这样脚本加载顺序与登记顺序严格一致，无需猜测哪个匿名是哪个模块
 * 不做 CJS 判定、不处理 require 字符串
 */
(function (root) {
  'use strict';
  var registry = {};
  var anonQueue = [];
  var anonCounter = 0;

  function resolveModule(id) {
    var m = registry[id];
    if (!m) throw new Error('[amd-shim] 模块未注册: ' + id);
    if (m.resolved) return m.value;
    m.resolved = true;
    var args = [];
    for (var i = 0; i < m.deps.length; i++) args.push(resolveModule(m.deps[i]));
    m.value = m.factory.apply(null, args);
    return m.value;
  }

  /* 注册一个模块（内部） */
  function register(id, deps, factory) {
    registry[id] = { deps: deps || [], factory: factory, resolved: false, value: undefined };
  }

  /* 注册匿名 define 为具名模块：从队列头部弹出，用 id 命名 */
  function popAnon(id) {
    if (anonQueue.length === 0) throw new Error('[amd-shim] 没有待登记的匿名模块: ' + id);
    var item = anonQueue.shift();
    register(id, item.deps, item.factory);
  }

  function define(a, b, c) {
    var name = null, deps = [], factory = null;
    if (typeof a === 'string') {
      name = a;
      if (Array.isArray(b)) { deps = b; factory = c; }
      else { factory = b; }
    } else if (Array.isArray(a)) {
      deps = a; factory = b;
    } else {
      factory = a;
    }
    if (name !== null) {
      register(name, deps, factory);
    } else {
      /* 匿名模块：入队，等下游 popAnon 登记 */
      anonQueue.push({ deps: deps, factory: factory, auto: '__anon_' + (anonCounter++) });
    }
  }
  define.amd = {};

  function amdRequire(deps, cb) {
    var values = [];
    for (var i = 0; i < deps.length; i++) values.push(resolveModule(deps[i]));
    if (cb) cb.apply(null, values);
  }

  root.__amd = { define: define, require: amdRequire, register: register, popAnon: popAnon, resolve: resolveModule };
  root.define = define;
})(typeof globalThis !== 'undefined' ? globalThis : this);
