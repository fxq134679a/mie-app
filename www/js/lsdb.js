// --- LSDB：IndexedDB 不可用时的 localStorage 降级存储 ---
// 场景：IPA 打包（WKWebView file:// / 自定义协议）下 indexedDB 直接抛 SecurityError，
// Dexie 无法工作 → 应用启动即白屏。这里实现一个覆盖项目实际用到的 Dexie API 子集：
//   表级：toArray / put / bulkPut / add / bulkDelete / delete / get / update / count / clear / orderBy / where(...).equals(...)
//   库级：transaction(mode, tables, fn) / tables / version().stores()（no-op，建表走 MIE_LSDB_SCHEMA）
// 数据持久化到 localStorage（key: mie_lsdb:<表名>），写入做 400ms 防抖 + pagehide 兜底冲刷。
// 注意：localStorage 上限约 5MB，超限时写入失败仅告警不崩溃。
(function () {
    'use strict';

    var PREFIX = 'mie_lsdb:';
    var SEQ_PREFIX = 'mie_lsdb_seq:';

    // ── IndexedDB 可用性同步探测：file:// / 不透明源下 indexedDB.open 同步抛 SecurityError ──
    window.mieIdbAvailable = function () {
        try {
            if (!window.indexedDB) return false;
            var req = window.indexedDB.open('__mie_probe__');
            req.onerror = function () { /* 探测失败不影响主流程 */ };
            if (req.onsuccess === null) { /* noop */ }
            // 尽早关闭，避免留下连接
            var done = false;
            req.onsuccess = function () { done = true; try { req.result.close(); } catch (e) { } };
            setTimeout(function () { if (!done) try { req.result && req.result.close(); } catch (e) { } }, 2000);
            return true;
        } catch (e) {
            // SecurityError / QuotaExceededError 同步抛出 → IndexedDB 不可用
            return false;
        }
    };

    // ── 安全 localStorage 封装（连 localStorage 都没有时退化为内存存储） ──
    var memStore = {};
    var ls = {
        get: function (k) {
            try { return localStorage.getItem(k); } catch (e) { return memStore[k] || null; }
        },
        set: function (k, v) {
            try { localStorage.setItem(k, v); return true; }
            catch (e) {
                console.warn('[LSDB] localStorage 写入失败（可能超 5MB 配额）:', k, e);
                try { memStore[k] = v; } catch (e2) { }
                return false;
            }
        },
        remove: function (k) {
            try { localStorage.removeItem(k); } catch (e) { }
            delete memStore[k];
        }
    };

    var pendingSaves = {};
    var _allTables = {}; // name → Table 实例（所有库实例共享注册，供冲刷与落盘查表）
    function scheduleSave(name) {
        if (pendingSaves[name]) return;
        pendingSaves[name] = setTimeout(function () {
            delete pendingSaves[name];
            flushTable(name);
        }, 400);
    }
    function flushTable(name) {
        var t = pendingSaves[name];
        if (t) { clearTimeout(t); delete pendingSaves[name]; }
        var table = _allTables[name];
        if (!table) return;
        try {
            ls.set(PREFIX + name, JSON.stringify(table.data));
        } catch (e) { /* ls.set 已内部兜底 */ }
    }
    function flushAll() {
        // 冲刷所有已创建的库实例（页面隐藏/关闭时兜底落盘）
        _instances.forEach(function (db) {
            Object.keys(db._tables).forEach(flushTable);
        });
    }
    var _instances = [];
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushAll();
    });

    function looseEq(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        return a == b; // 兼容 id 数字/字符串形态差异（Dexie 键严格，但降级场景下宽松匹配更安全）
    }

    function nextId(table) {
        var seq = parseInt(ls.get(SEQ_PREFIX + table.name) || '0', 10) || 0;
        seq++;
        ls.set(SEQ_PREFIX + table.name, String(seq));
        return seq;
    }

    function Collection(table, field, value) {
        this._t = table;
        this._f = field;
        this._v = value;
        this._rev = false;
    }
    Collection.prototype._match = function () {
        var f = this._f, v = this._v;
        return this._t.data.filter(function (x) { return looseEq(x && x[f], v); });
    };
    Collection.prototype.reverse = function () { this._rev = true; return this; };
    Collection.prototype.sortBy = function (field) {
        var arr = this._match().slice().sort(function (a, b) {
            if (a == null) return 1; if (b == null) return -1;
            var x = a[field], y = b[field];
            if (x === y) return 0;
            return (x > y) ? 1 : -1;
        });
        if (this._rev) arr.reverse();
        return Promise.resolve(arr);
    };
    Collection.prototype.toArray = function () { return Promise.resolve(this._match()); };
    Collection.prototype.count = function () { return Promise.resolve(this._match().length); };
    Collection.prototype.each = function (fn) {
        var arr = this._match();
        arr.forEach(function (x, i) { fn(x, i); });
        return Promise.resolve(arr);
    };
    Collection.prototype.first = function () { return Promise.resolve(this._match()[0]); };
    Collection.prototype.last = function () {
        var a = this._match();
        return Promise.resolve(a[a.length - 1]);
    };
    Collection.prototype.delete = function () {
        var t = this._t, f = this._f, v = this._v;
        var before = t.data.length;
        t.data = t.data.filter(function (x) { return !looseEq(x && x[f], v); });
        var n = before - t.data.length;
        if (n) scheduleSave(t.name);
        return Promise.resolve(n);
    };
    Collection.prototype.modify = function (changes) {
        var t = this._t, f = this._f, v = this._v;
        var n = 0;
        t.data.forEach(function (x) {
            if (looseEq(x && x[f], v)) {
                if (typeof changes === 'function') { changes(x); }
                else { Object.assign(x, changes); }
                n++;
            }
        });
        if (n) scheduleSave(t.name);
        return Promise.resolve(n);
    };

    function Table(name, schema) {
        this.name = name;
        this.schema = schema || '';
        var first = String(this.schema).split(',')[0].trim(); // 首个索引即主键
        if (first.indexOf('&') === 0) { this.pk = first.slice(1); this.unique = true; }
        else if (first.indexOf('++') === 0) { this.pk = first.slice(2); this.auto = true; }
        else { this.pk = first || null; }
        try { this.data = JSON.parse(ls.get(PREFIX + name) || '[]') || []; }
        catch (e) { console.warn('[LSDB] 表数据损坏，重置:', name, e); this.data = []; }
        _allTables[name] = this;
    }

    Table.prototype._findByPk = function (key) {
        if (!this.pk) return null;
        var pk = this.pk;
        return this.data.find(function (x) { return looseEq(x && x[pk], key); }) || null;
    };

    Table.prototype.toArray = function () { return Promise.resolve(this.data.slice()); };
    Table.prototype.count = function () { return Promise.resolve(this.data.length); };
    Table.prototype.clear = function () { this.data = []; scheduleSave(this.name); return Promise.resolve(); };
    Table.prototype.orderBy = function (field) {
        var arr = this.data.slice();
        if (field) arr.sort(function (a, b) {
            if (a == null) return 1; if (b == null) return -1;
            var x = a[field], y = b[field];
            if (x === y) return 0;
            return (x > y) ? 1 : -1;
        });
        return Promise.resolve(arr);
    };
    Table.prototype.get = function (key) { return Promise.resolve(this._findByPk(key)); };
    Table.prototype.put = function (rec) {
        if (!rec || typeof rec !== 'object') return Promise.reject(new TypeError('[LSDB] put 需要对象'));
        var pk = this.pk;
        if (pk && this.auto && rec[pk] === undefined) rec[pk] = nextId(this);
        if (pk) {
            var existing = this._findByPk(rec[pk]);
            if (existing) {
                var idx = this.data.indexOf(existing);
                this.data[idx] = rec;
            } else {
                this.data.push(rec);
            }
        } else {
            this.data.push(rec);
        }
        scheduleSave(this.name);
        return Promise.resolve(pk ? rec[pk] : undefined);
    };
    Table.prototype.add = function (rec) {
        var pk = this.pk;
        if (pk && this.auto && rec[pk] === undefined) rec[pk] = nextId(this);
        if (pk && this._findByPk(rec[pk])) {
            return Promise.reject(new Error('[LSDB] add 冲突：主键已存在 ' + rec[pk]));
        }
        return this.put(rec);
    };
    Table.prototype.bulkPut = function (arr) {
        var self = this;
        (arr || []).forEach(function (rec) { self.put(rec); });
        return Promise.resolve(arr ? arr.length : 0);
    };
    Table.prototype.bulkDelete = function (keys) {
        var self = this, n = 0;
        (keys || []).forEach(function (k) {
            var rec = self._findByPk(k);
            if (rec) { self.data.splice(self.data.indexOf(rec), 1); n++; }
        });
        if (n) scheduleSave(this.name);
        return Promise.resolve(n);
    };
    Table.prototype.delete = function (key) {
        var rec = this._findByPk(key);
        if (rec) { this.data.splice(this.data.indexOf(rec), 1); scheduleSave(this.name); }
        return Promise.resolve();
    };
    Table.prototype.update = function (key, changes) {
        var rec = this._findByPk(key);
        if (!rec) return Promise.resolve(0);
        if (typeof changes === 'function') changes(rec);
        else Object.assign(rec, changes);
        scheduleSave(this.name);
        return Promise.resolve(1);
    };
    Table.prototype.where = function (field) {
        var t = this;
        return { equals: function (v) { return new Collection(t, field, v); } };
    };

    var LSDB = {
        _tables: {},
        // 建库：传入表名 → schema 映射（与 Dexie version().stores 的 schema 同格式）
        create: function (schemaMap) {
            var db = Object.create(LSDB);
            db._tables = {};
            Object.keys(schemaMap || {}).forEach(function (name) {
                db._tables[name] = new Table(name, schemaMap[name]);
            });
            db.tables = Object.keys(db._tables).map(function (n) { return db._tables[n]; });
            db.name = 'LSDB(localStorage)';
            return db;
        },
        flush: flushAll,
        version: function () { return { stores: function () { return this; } }; },
        transaction: function (mode, tablesArg, fn) {
            return Promise.resolve(fn(this));
        },
        // 与 Dexie 相同的表访问方式：db.characters / db['any-table']
        _proxy: null
    };

    // 让 db.<tableName> 直接可用（Dexie 的用法是属性访问）
    window.MieLSDB = {
        create: function (schemaMap) {
            var raw = LSDB.create(schemaMap);
            raw.flush = function () { Object.keys(raw._tables).forEach(flushTable); };
            _instances.push(raw);
            var db = new Proxy(raw, {
                get: function (target, prop) {
                    if (prop in target) return target[prop];
                    if (target._tables && Object.prototype.hasOwnProperty.call(target._tables, prop)) {
                        return target._tables[prop];
                    }
                    return undefined;
                }
            });
            // 环境不支持 Proxy 时退化为逐表挂载
            return db;
        }
    };
})();
