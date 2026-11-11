// Derived behavior tests for TangfanOVO/have-you-eaten core.py; AGPL-3.0 provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRequest, request } from './local-book.js';

const NOW = new Date(2026, 9, 13, 12, 0, 0);
function book() {
  let state;
  return {
    call(path, body, now = NOW) {
      const next = applyRequest(state, path, body, now);
      state = next.state;
      return next.result;
    },
    data(now = NOW) { return this.call('/api/food', undefined, now); },
    snapshot() { return structuredClone(state); },
  };
}
const meal = (name = 'Noodle', city = '上海', dishes = [{ name: '面', verdict: '好吃' }]) => ({
  shop: { name }, branch: { city, area: '中心', label: '一店' },
  meal: { eaten_on: '2026-10-13', slot: '午饭' }, dishes,
});
const edit = (b, kind, id, fields) => b.call('/api/food/edit', { kind, id, fields });
const del = (b, kind, id) => b.call('/api/food/del', { kind, id });
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('empty Data has exactly the upstream top-level keys and defaults', () => {
  const d = book().data();
  assert.deepEqual(Object.keys(d), ['shops', 'branches', 'meals', 'dishes', 'logs', 'taste', 'here']);
  assert.deepEqual(d.here, { city: '', spot: '', home: '', today: '2026-10-13' });
  assert.ok(Object.values(d).slice(0, 6).every(a => a.length === 0));
});

test('log deduplicates shops, branches and dishes, not meals or individual observations', () => {
  const b = book();
  const first = b.call('/api/food/log', meal(' Noodle ', '上海', [{ name: ' Soup ', verdict: 'bad' }, { name: 'soup' }]));
  const secondBody = meal('noodle', ' 上海 ', [{ name: 'SOUP', verdict: '好吃' }]);
  secondBody.shop.cuisine = '面馆'; secondBody.branch.address = '新地址';
  b.call('/api/food/log', secondBody);
  const d = b.data();
  assert.deepEqual(first, { ok: true, shop_id: 1, branch_id: 1, meal_id: 1 });
  assert.equal(d.shops.length, 1); assert.equal(d.branches.length, 1); assert.equal(d.dishes.length, 1);
  assert.equal(d.meals.length, 2); assert.equal(d.logs.length, 3);
  assert.deepEqual(d.logs.map(l => l.verdict), ['bad', null, 'good']);
  assert.ok(d.logs.every(l => l.dish_id === 1 && l.name === null));
  assert.equal(d.shops[0].cuisine, '面馆'); assert.equal(d.branches[0].address, '新地址');
  assert.deepEqual(d.meals.map(m => m.id), [2, 1]);
  assert.deepEqual(Object.keys(d.shops[0]), ['id', 'name', 'cuisine', 'note', 'verdict', 'created_at']);
  assert.deepEqual(Object.keys(d.branches[0]), ['id', 'shop_id', 'city', 'area', 'label', 'address', 'platform', 'note']);
  assert.deepEqual(Object.keys(d.dishes[0]), ['id', 'shop_id', 'name', 'note']);
  assert.deepEqual(Object.keys(d.logs[0]), ['id', 'meal_id', 'dish_id', 'name', 'verdict', 'price', 'note']);
});

test('existing IDs, branch location and currency defaults; setting spot follows city changes', () => {
  const b = book();
  b.call('/api/settings', { city: '上海', spot: '家' });
  b.call('/api/food/log', meal());
  assert.equal(b.data().here.spot, '家');
  b.call('/api/food/log', meal('Noodle', '悉尼'));
  assert.equal(b.data().here.spot, '');
  b.call('/api/food/log', { shop: { id: 1 }, branch: { id: 2 }, dishes: [{ id: 1 }], meal: { city: '错误城市' } });
  const d = b.data();
  assert.equal(d.meals[0].city, '悉尼'); assert.equal(d.meals[0].currency, 'AUD');
  assert.equal(d.shops.length, 1); assert.equal(d.branches.length, 2); assert.equal(d.dishes.length, 1);
  const s = b.snapshot();
  assert.throws(() => b.call('/api/food/log', { shop: { id: 1 }, dishes: [] }), /城市要写/);
  assert.deepEqual(b.snapshot(), s);
});

test('free meals, addlog, source, and optional verdict preserve all original fields', () => {
  const b = book();
  b.call('/api/settings', { city: '成都' });
  const r = b.call('/api/food/log', { meal: { place: '家', how: '自己做', note: '晚餐', src: 'chat' }, dishes: [{ name: '饭', price: '¥2.50' }] });
  assert.equal(r.shop_id, null); assert.equal(r.branch_id, null);
  const added = b.call('/api/food/addlog', { meal_id: r.meal_id, dish: { name: '菜', verdict: '难吃', price: '$3' } });
  const d = b.data();
  assert.equal(d.logs.find(l => l.id === added.log_id).verdict, 'bad');
  assert.equal(d.logs[0].price, 2.5); assert.equal(d.logs[0].dish_id, null);
  assert.equal(d.meals[0].src, 'chat'); assert.equal(d.meals[0].city, '成都');
  assert.equal(d.meals[0].verdict, null); assert.equal(d.meals[0].how, '自己做');
  assert.deepEqual(Object.keys(d.meals[0]), ['id', 'branch_id', 'eaten_on', 'slot', 'place', 'city', 'photo', 'src', 'how', 'total', 'currency', 'verdict', 'note', 'created_at']);
  assert.throws(() => b.call('/api/food/log', {}), /吃了什么/);
});

test('addlog reuses dish and editing a log does not overwrite dish or other ratings', () => {
  const b = book();
  b.call('/api/food/log', meal());
  b.call('/api/food/addlog', { meal_id: 1, dish: { name: ' 面 ', verdict: 'bad' } });
  edit(b, 'log', 1, { verdict: '', note: '改了', name: '仅记录字段', dish_id: 999 });
  edit(b, 'dish', 1, { name: '新面名' });
  edit(b, 'shop', 1, { verdict: '踩雷' });
  const d = b.data();
  assert.equal(d.dishes.length, 1); assert.equal(d.dishes[0].name, '新面名');
  assert.deepEqual(d.logs.map(l => l.verdict), [null, 'bad']);
  assert.equal(d.logs[0].dish_id, 1); assert.equal(d.logs[0].name, '仅记录字段');
  assert.equal(d.shops[0].verdict, 'bad');
  assert.deepEqual(edit(b, 'log', 999, { note: '不存在' }), { ok: false });
  assert.throws(() => edit(b, 'log', 1, { dish_id: 999 }), /没有要改/);
});

test('duplicate edits reject atomically for shops, branches, dishes and taste', () => {
  const b = book();
  b.call('/api/food/log', meal('A', '上海', [{ name: '面' }, { name: '饭' }]));
  b.call('/api/food/log', meal('B'));
  b.call('/api/food/log', meal('A', '北京'));
  b.call('/api/food/taste', { item: '姜', kind: 'love' });
  b.call('/api/food/taste', { item: '葱', kind: 'hate' });
  for (const [kind, rid, fields] of [
    ['shop', 2, { name: ' a ', note: '不应提交' }],
    ['branch', 3, { city: '上海', note: '不应提交' }],
    ['dish', 2, { name: '面', note: '不应提交' }],
    ['taste', 2, { item: '姜', note: '不应提交' }],
  ]) {
    const before = b.snapshot();
    assert.throws(() => edit(b, kind, rid, fields), /同名/);
    assert.deepEqual(b.snapshot(), before);
  }
});

test('delete log/meal prunes only orphaned dishes; deleting dish keeps the meal', () => {
  const b = book();
  b.call('/api/food/log', meal()); b.call('/api/food/log', meal());
  del(b, 'log', 1);
  assert.equal(b.data().dishes.length, 1);
  del(b, 'meal', 2);
  assert.equal(b.data().dishes.length, 0); assert.equal(b.data().logs.length, 0);
  assert.equal(b.data().meals.length, 1); assert.equal(b.data().shops.length, 1);
  b.call('/api/food/addlog', { meal_id: 1, dish: { name: '新菜' } });
  del(b, 'dish', 1);
  assert.equal(b.data().logs.length, 0); assert.equal(b.data().meals.length, 1);
  assert.deepEqual(del(b, 'dish', 1), { ok: false });
});

test('branch/shop cascade matches upstream, including branch orphan dishes', () => {
  const b = book();
  b.call('/api/food/log', meal('A', '上海', [{ name: '仅此分店' }]));
  b.call('/api/food/log', meal('A', '北京', [{ name: '另一道菜' }]));
  b.call('/api/food/log', meal('B'));
  b.call('/api/food/log', { dishes: [{ name: '自制' }] });
  del(b, 'branch', 1);
  assert.equal(b.data().dishes.length, 3); // Upstream prunes only explicit meal/log deletion.
  assert.equal(b.data().logs.length, 3);
  del(b, 'shop', 1);
  const d = b.data();
  assert.deepEqual(d.shops.map(s => s.name), ['B']);
  assert.equal(d.branches.length, 1); assert.equal(d.dishes.length, 1);
  assert.equal(d.meals.length, 2); assert.equal(d.logs.length, 2);
});

test('taste deduplication, scope, movement, omitted away/note and explicit edit clearing', () => {
  const b = book();
  assert.deepEqual(b.call('/api/food/taste', { item: ' Sesame ', scope: ' Noodles ', kind: '爱吃', note: '香', away: true, src: 'chat' }), { ok: true, id: 1, moved: false });
  assert.deepEqual(b.call('/api/food/taste', { item: 'sesame', scope: 'noodles', kind: '不能吃', note: '' }), { ok: true, id: 1, moved: true });
  let t = b.data().taste[0];
  assert.equal(t.kind, 'never'); assert.equal(t.note, '香'); assert.equal(t.away, true); assert.equal(t.src, 'chat');
  b.call('/api/food/taste', { item: 'sesame', kind: 'hate' });
  assert.equal(b.data().taste.length, 2);
  assert.deepEqual(b.data().taste.map(t => t.id), [2, 1]);
  edit(b, 'taste', 1, { note: '', away: false, kind: 'love' });
  t = b.data().taste.find(t => t.id === 1);
  assert.equal(t.note, null); assert.equal(t.away, false); assert.equal(t.kind, 'love');
  assert.deepEqual(Object.keys(t), ['id', 'kind', 'item', 'scope', 'note', 'away', 'src', 'updated_at']);
  del(b, 'taste', 2); assert.equal(b.data().taste.length, 1);
});

test('local calendar switches at 05:00 including year/leap boundary; slot auto lags one hour', () => {
  const b = book();
  for (const [now, day, expectedSlot] of [
    [new Date(2026, 0, 1, 4, 59, 59), '2025-12-31', '夜宵'],
    [new Date(2026, 0, 1, 5), '2026-01-01', '夜宵'],
    [new Date(2026, 0, 1, 6), '2026-01-01', '早饭'],
    [new Date(2024, 2, 1, 4), '2024-02-29', '夜宵'],
    [new Date(2026, 0, 1, 11), '2026-01-01', '午饭'],
    [new Date(2026, 0, 1, 17), '2026-01-01', '晚饭'],
  ]) {
    const r = b.call('/api/food/log', { meal: { note: '边界', slot: 'auto' } }, now);
    const d = b.data(now), m = d.meals.find(m => m.id === r.meal_id);
    assert.equal(d.here.today, day); assert.equal(m.eaten_on, day); assert.equal(m.slot, expectedSlot);
  }
});

test('money, currency, dates and enums validate on log and edit; invalid dates never roll over', () => {
  const b = book();
  b.call('/api/food/log', { meal: { note: '测试', total: '¥1,234.565', currency: 'USD', eaten_on: '2024-02-29' } });
  assert.equal(b.data().meals[0].total, 1234.57);
  for (const [input, expected] of [['2.675', 2.67], ['2.625', 2.62], ['2.875', 2.88], ['1e2', 100], ['', null], [0, 0]]) {
    edit(b, 'meal', 1, { total: input }); assert.equal(b.data().meals[0].total, expected);
  }
  for (const fields of [
    { total: '-1' }, { total: 100000 }, { total: 'NaN' }, { total: Infinity }, { total: '0x10' },
    { total: ' ' }, { currency: 'usd' }, { currency: '123' }, { eaten_on: '2026-02-29' },
    { eaten_on: '2026-04-31' }, { eaten_on: '0000-01-01' }, { how: '飞来' },
    { slot: '下午' }, { verdict: '不错' }, { city: '' },
  ]) {
    const before = b.snapshot();
    assert.throws(() => edit(b, 'meal', 1, { note: '不能提交', ...fields }), Error);
    assert.deepEqual(b.snapshot(), before);
  }
  edit(b, 'meal', 1, { eaten_on: '20260228' });
  assert.equal(b.data().meals[0].eaten_on, '2026-02-28');
});

test('failed late dish validation rolls back shop/branch/meal/settings and prior dishes', () => {
  const b = book();
  b.call('/api/settings', { city: '上海', spot: '家' });
  const before = b.snapshot();
  for (const dishes of [[{ name: '第一道' }, { id: 999 }], [{ name: '第一道' }, { name: '第二道', price: '-2' }]]) {
    assert.throws(() => b.call('/api/food/log', meal('新店', '北京', dishes)), Error);
    assert.deepEqual(b.snapshot(), before);
  }
  b.call('/api/food/log', meal('A')); b.call('/api/food/log', meal('B'));
  const after = b.snapshot();
  assert.throws(() => b.call('/api/food/log', { shop: { id: 1 }, branch: { id: 2 }, dishes: [{ id: 2 }] }), /分店对不上/);
  assert.throws(() => b.call('/api/food/log', { shop: { id: 1 }, branch: { id: 1 }, dishes: [{ id: 2 }] }), /菜对不上/);
  assert.deepEqual(b.snapshot(), after);
});

test('input, state and returned Data do not alias; optimistic frontend deletion cannot corrupt storage', () => {
  const body = meal();
  const before = structuredClone(body);
  const first = applyRequest(undefined, '/api/food/log', body, NOW);
  assert.deepEqual(body, before);
  const second = applyRequest(first.state, '/api/food', undefined, NOW);
  second.result.shops.splice(0); second.result.meals[0].note = '污染';
  assert.equal(first.state.shops.length, 1); assert.equal(second.state.shops.length, 1);
  assert.equal(second.state.meals[0].note, null);
  const original = structuredClone(first.state);
  assert.throws(() => applyRequest(first.state, '/api/food/edit', { kind: 'meal', id: 1, fields: { note: '修改', total: -1 } }, NOW));
  assert.deepEqual(first.state, original);
});

test('40 dish limit, whitespace and Unicode truncation follow upstream', () => {
  const b = book();
  b.call('/api/food/log', meal('店', '上海', Array.from({ length: 42 }, (_, i) => ({ name: `菜${i}` }))));
  assert.equal(b.data().logs.length, 40);
  edit(b, 'dish', 1, { name: '𠀀'.repeat(121) });
  assert.equal(Array.from(b.data().dishes[0].name).length, 120);
  assert.throws(() => edit(b, 'dish', 1, { name: '  ' }), /不能空/);
});

test('uploads whitelist raster types, validate signature/size and preserve full photo on log/edit', async () => {
  assert.deepEqual(await request('/api/upload', { dataURL: png }), { ok: true, url: png });
  const b = book();
  // Large enough to catch the upstream 300/2000-character URL truncation.
  const large = 'data:image/png;base64,' + btoa('\x89PNG\r\n\x1a\n' + '\0'.repeat(3000));
  b.call('/api/food/log', { meal: { photo: large } });
  assert.equal(b.data().meals[0].photo, large);
  edit(b, 'meal', 1, { photo: large }); assert.equal(b.data().meals[0].photo, large);
  for (const dataURL of [
    'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==',
    'data:image/png;base64,AAAA', 'data:image/png;base64,@@@=',
    'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024),
  ]) {
    await assert.rejects(request('/api/upload', { dataURL }), /图片|支持/);
    const before = b.snapshot();
    assert.throws(() => edit(b, 'meal', 1, { photo: dataURL }), Error);
    assert.deepEqual(b.snapshot(), before);
  }
});

test('unsupported routes/kinds and unavailable browser storage produce Chinese Error', async () => {
  assert.throws(() => book().call('/api/nope'), /没有这个口子/);
  assert.throws(() => book().call('/api/food/edit', { kind: '__proto__' }), /没有这一种/);
  if (!globalThis.indexedDB) await assert.rejects(request('/api/food'), /浏览器不支持本地数据库/);
});

test('Data integrates with actual dice: last expressed rating survives an unrated log', async () => {
  const { pool, roll } = await import('./dice.js');
  const b = book(), name = '本地测试独有菜';
  b.call('/api/food/log', meal('测试店', '上海', [{ name, verdict: 'bad' }]));
  b.call('/api/food/log', meal('测试店', '上海', [{ name }]));
  assert.equal(pool(b.data()).some(x => x.name === name), false);
  edit(b, 'log', 2, { verdict: 'good' });
  let x = pool(b.data()).find(x => x.name === name);
  assert.equal(x.own, 'good');
  assert.deepEqual(x.hist.trail.map(t => t[1]), ['bad', 'good']);
  b.call('/api/food/log', meal('测试店', '上海', [{ name }]));
  x = pool(b.data()).find(x => x.name === name);
  assert.equal(x.own, 'good');
  edit(b, 'shop', 1, { verdict: 'bad' });
  assert.equal(pool(b.data()).some(x => x.name === name), false);
  const r = roll(b.data(), 'dish', '', '', () => 0, '家常菜');
  assert.equal(r.ok, true); assert.equal(r.only, '家常菜'); assert.equal(r.cuisine, '家常菜');
});
