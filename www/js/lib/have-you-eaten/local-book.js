// Derived from TangfanOVO/have-you-eaten core.py and web.py; AGPL-3.0 provenance.
const TABLE = new Map(Object.entries({ shop: 'shops', branch: 'branches', meal: 'meals', dish: 'dishes', log: 'logs', taste: 'taste' }));
const EDITABLE = {
  shop: ['name', 'cuisine', 'note', 'verdict'],
  branch: ['city', 'area', 'label', 'address', 'platform', 'note'],
  meal: ['eaten_on', 'slot', 'place', 'city', 'photo', 'how', 'total', 'currency', 'verdict', 'note'],
  dish: ['name', 'note'], log: ['name', 'verdict', 'price', 'note'],
  taste: ['item', 'kind', 'note', 'away', 'scope'],
};
const VIN = new Map(Object.entries({ 好吃: 'good', 一般: 'meh', 踩雷: 'bad', 难吃: 'bad', good: 'good', meh: 'meh', bad: 'bad' }));
const TKIN = new Map(Object.entries({ 爱吃: 'love', 不爱吃: 'hate', 不能吃: 'never', love: 'love', hate: 'hate', never: 'never' }));
const AU = ['悉尼', '墨尔本', '阿德莱德', '布里斯班', '珀斯', '堪培拉', '霍巴特', '达尔文', '黄金海岸', '凯恩斯'];
const SLOTS = ['早饭', '午饭', '加餐', '晚饭', '夜宵', '纯记录'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const copy = value => structuredClone(value);
const text = (v, n = 200) => v == null ? null : Array.from(String(v).trim()).slice(0, n).join('') || null;
// SQLite lower() only folds ASCII; supplied strings have already been stripped.
const key = v => String(v ?? '').replace(/^ +| +$/g, '').replace(/[A-Z]/g, c => c.toLowerCase());
const equal = (a, b) => key(a) === key(b);
const obj = v => v == null ? {} : typeof v === 'object' && !Array.isArray(v) ? v : fail('请求内容看不懂');
const id = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : fail('编号看不懂');
const curFor = city => AU.some(c => (city || '').includes(c)) ? 'AUD' : 'CNY';
const stamp = now => now.toISOString().slice(0, 19).replace('T', ' ');
function today(now) {
  const d = new Date(now);
  d.setHours(d.getHours() - 5);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function date(v, now) {
  const s = text(v, 10);
  if (!s) return today(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!match) fail('日期看不懂');
  const [, y, m, d] = match;
  const iso = `${y}-${m}-${d}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (+y < 1 || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== iso) fail('日期看不懂');
  return iso;
}
function money(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[,¥$]/g, '').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) fail('价钱看不懂');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 99999) fail('价钱不对');
  // toFixed follows the actual binary value; exact halfway values use Python's ties-to-even.
  if (Number.isInteger(n * 8) && !Number.isInteger(n * 100)) {
    const floor = Math.floor(n * 100);
    return (floor + (floor % 2)) / 100;
  }
  return Number(n.toFixed(2));
}
function currency(v, fallback = 'CNY') {
  const s = text(v, 8);
  if (!s) return fallback;
  if (!/^[A-Z]{3}$/.test(s)) fail('币种要写三位大写字母，例如 CNY');
  return s;
}
function verdict(v) {
  const s = text(v, 8);
  return s == null ? null : VIN.get(s) || fail('好吃 / 一般 / 踩雷 只认这三样');
}
function tasteKind(v) { return TKIN.get(v || '') || fail('爱吃 / 不爱吃 / 不能吃 只认这三样'); }
function how(v) {
  const s = text(v, 8);
  return !s || ['外卖', '堂食', '自取', '自己做'].includes(s) ? s : fail('外卖 / 堂食 / 自取 只认这三样');
}
function slot(v, now) {
  const s = text(v, 8);
  if (s === 'auto') {
    const h = (now.getHours() + 23) % 24;
    return h >= 5 && h < 10 ? '早饭' : h >= 10 && h < 16 ? '午饭' : h >= 16 && h < 22 ? '晚饭' : '夜宵';
  }
  return !s || SLOTS.includes(s) ? s : fail('早饭 / 午饭 / 晚饭 / 夜宵 / 纯记录 只认这几样');
}
function image(v) {
  if (typeof v !== 'string' || v.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) fail('图片太大了（最多 5 MB）');
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(v);
  if (!m || !m[2] || m[2].length % 4) fail('只支持 PNG、JPEG、WebP 或 GIF 图片 dataURL');
  const bytes = m[2].length / 4 * 3 - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) fail('图片太大了（最多 5 MB）');
  const raw = atob(m[2]);
  const sig = (...nums) => nums.every((n, i) => raw.charCodeAt(i) === n);
  const valid = m[1] === 'png' ? sig(137, 80, 78, 71, 13, 10, 26, 10)
    : m[1] === 'jpeg' ? sig(255, 216, 255)
    : m[1] === 'gif' ? /^GIF8[79]a/.test(raw)
    : raw.startsWith('RIFF') && raw.slice(8, 12) === 'WEBP';
  if (!valid) fail('图片内容与类型不符');
  return v;
}
function photo(v, n) {
  const s = v == null ? null : String(v).trim();
  return s?.startsWith('data:') ? image(s) : text(s, n);
}
function empty() {
  return { shops: [], branches: [], meals: [], dishes: [], logs: [], taste: [], here: { city: '', spot: '', home: '', today: '' } };
}
function insert(s, table, fields) {
  const row = { id: s[table].reduce((max, r) => Math.max(max, r.id), 0) + 1, ...fields };
  s[table].push(row);
  return row;
}
function dishFor(s, shopId, name) {
  return s.dishes.find(d => d.shop_id === shopId && equal(d.name, name)) || insert(s, 'dishes', { shop_id: shopId, name, note: null });
}
function addDishLog(s, mealId, shopId, d, useId = false) {
  const name = text(d.name, 120);
  let dish = null;
  if (shopId != null) {
    dish = useId && d.id ? s.dishes.find(x => x.id === id(d.id) && x.shop_id === shopId) : dishFor(s, shopId, name);
    if (!dish) fail('这道菜对不上这家店');
  } else if (!name) fail('菜名要写');
  return insert(s, 'logs', { meal_id: mealId, dish_id: dish?.id ?? null, name: dish ? null : name,
    verdict: verdict(d.verdict), price: money(d.price), note: text(d.note, 1000) });
}
function checkUnique(s, kind, row) {
  const collision = s[TABLE.get(kind)].some(other => {
    if (other.id === row.id) return false;
    if (kind === 'shop') return equal(other.name, row.name);
    if (kind === 'dish') return other.shop_id === row.shop_id && equal(other.name, row.name);
    if (kind === 'branch') return other.shop_id === row.shop_id && ['city', 'area', 'label'].every(k => equal(other[k], row[k]));
    if (kind === 'taste') return equal(other.item, row.item) && equal(other.scope, row.scope);
    return false;
  });
  if (collision) fail('已经有一条同名的了');
}
function remove(s, kind, rid) {
  const table = TABLE.get(kind);
  if (!table) fail('没有这一种');
  const target = s[table].find(r => r.id === rid);
  if (!target) return false;
  // Match SQL cascades. Only explicit log/meal deletion prunes newly orphaned dishes.
  const orphans = kind === 'log' ? [target.dish_id] : kind === 'meal' ? s.logs.filter(l => l.meal_id === rid).map(l => l.dish_id) : [];
  const shops = new Set(kind === 'shop' ? [rid] : []);
  const branches = new Set(s.branches.filter(b => (kind === 'branch' && b.id === rid) || shops.has(b.shop_id)).map(b => b.id));
  const meals = new Set(s.meals.filter(m => (kind === 'meal' && m.id === rid) || branches.has(m.branch_id)).map(m => m.id));
  const dishes = new Set(s.dishes.filter(d => (kind === 'dish' && d.id === rid) || shops.has(d.shop_id)).map(d => d.id));
  s[table] = s[table].filter(r => r.id !== rid);
  s.branches = s.branches.filter(b => !branches.has(b.id));
  s.meals = s.meals.filter(m => !meals.has(m.id));
  s.dishes = s.dishes.filter(d => !dishes.has(d.id));
  s.logs = s.logs.filter(l => !meals.has(l.meal_id) && !dishes.has(l.dish_id));
  s.dishes = s.dishes.filter(d => !orphans.includes(d.id) || s.logs.some(l => l.dish_id === d.id));
  return true;
}

/** Pure transition: never changes input; result and next state share no references. */
export function applyRequest(state, path, body, now = new Date()) {
  now = new Date(now);
  if (!Number.isFinite(+now)) fail('当前时间看不懂');
  const s = copy(state ?? empty());
  const b = obj(body);
  path = String(path).split('?')[0];
  s.here.today = today(now);
  let result;
  if (path === '/api/food' && body == null) {
    for (const table of ['shops', 'branches', 'dishes', 'logs']) s[table].sort((a, b) => a.id - b.id);
    s.meals.sort((a, b) => b.eaten_on.localeCompare(a.eaten_on) || b.id - a.id);
    s.taste.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
    result = s;
  } else if (path === '/api/settings') {
    s.here.city = text(b.city, 60) || '';
    s.here.spot = text(b.spot, 80) || '';
    result = { ok: true };
  } else if (path === '/api/upload') {
    result = { ok: true, url: image(b.dataURL) };
  } else if (path === '/api/food/log') {
    const sh = obj(b.shop), br = obj(b.branch), ml = obj(b.meal);
    const name = text(sh.name, 120), city = text(br.city, 60);
    const fromShop = Boolean(sh.id || name);
    if (fromShop && !br.id && !city) fail('城市要写 —— 不同城市的雷分开放，别挡错路');
    const m = { branch_id: null, eaten_on: date(ml.eaten_on, now), slot: slot(ml.slot, now),
      place: text(ml.place, 120), city: text(ml.city, 60) || city || s.here.city || null,
      photo: photo(ml.photo, 300), src: ml.src === 'chat' ? 'chat' : 'page', how: how(ml.how),
      total: money(ml.total), currency: currency(ml.currency, curFor(city || s.here.city)),
      verdict: verdict(ml.verdict), note: text(ml.note, 2000), created_at: stamp(now) };
    if (b.dishes != null && !Array.isArray(b.dishes)) fail('菜的列表看不懂');
    const ds = (b.dishes || []).slice(0, 40).map(obj).filter(d => text(d.name, 120) || d.id);
    if (!fromShop && !ds.length && !m.note && !m.photo) fail('吃了什么写一样呀');
    let shop = null, branch = null;
    if (fromShop) {
      shop = sh.id ? s.shops.find(r => r.id === id(sh.id)) : s.shops.find(r => equal(r.name, name));
      if (sh.id && !shop) fail('这家店不在了');
      shop ||= insert(s, 'shops', { name, cuisine: text(sh.cuisine, 40), note: null, verdict: null, created_at: stamp(now) });
      if (!shop.cuisine && text(sh.cuisine, 40)) shop.cuisine = text(sh.cuisine, 40);
      const area = text(br.area, 60) || '', label = text(br.label, 60) || '';
      branch = br.id ? s.branches.find(r => r.id === id(br.id) && r.shop_id === shop.id)
        : s.branches.find(r => r.shop_id === shop.id && equal(r.city, city) && equal(r.area, area) && equal(r.label, label));
      if (br.id && !branch) fail('这家分店对不上');
      branch ||= insert(s, 'branches', { shop_id: shop.id, city, area, label, address: text(br.address, 300), platform: text(br.platform, 40), note: null });
      for (const [k, n] of [['address', 300], ['platform', 40]]) if (!branch[k] && text(br[k], n)) branch[k] = text(br[k], n);
      m.branch_id = branch.id;
      m.city = branch.city;
      if (!ml.currency) m.currency = curFor(branch.city);
    }
    const meal = insert(s, 'meals', m);
    for (const d of ds) addDishLog(s, meal.id, shop?.id ?? null, d, true);
    if (m.city) {
      if (!equal(m.city, s.here.city)) s.here.spot = '';
      s.here.city = m.city;
    }
    result = { ok: true, shop_id: shop?.id ?? null, branch_id: branch?.id ?? null, meal_id: meal.id };
  } else if (path === '/api/food/taste') {
    const item = text(b.item, 60), scope = text(b.scope, 40) || '';
    if (!item) fail('写一样吃的呀');
    const kind = tasteKind(b.kind), note = text(b.note, 300);
    let t = s.taste.find(t => equal(t.item, item) && equal(t.scope, scope));
    const moved = Boolean(t);
    if (t) {
      t.kind = kind;
      if (note != null) t.note = note;
      if (b.away != null) t.away = Boolean(b.away);
      t.updated_at = stamp(now);
    } else t = insert(s, 'taste', { kind, item, scope, note, away: Boolean(b.away), src: b.src === 'chat' ? 'chat' : 'page', updated_at: stamp(now) });
    result = { ok: true, id: t.id, moved };
  } else if (path === '/api/food/edit') {
    const table = TABLE.get(b.kind);
    if (!table) fail('没有这一种');
    const fields = {};
    for (const [k, value] of Object.entries(obj(b.fields))) {
      if (!EDITABLE[b.kind].includes(k)) continue;
      let v = value;
      if (k === 'verdict') v = verdict(v);
      else if (k === 'how') v = how(v);
      else if (k === 'total' || k === 'price') v = money(v);
      else if (k === 'currency') v = currency(v);
      else if (k === 'photo') v = photo(v, 2000);
      else if (k === 'eaten_on') v = date(v, now);
      else if (k === 'slot') v = slot(v, now);
      else if (k === 'away') v = Boolean(v);
      else if (k === 'scope') v = text(v, 40) || '';
      else if (k === 'kind') v = tasteKind(v);
      else if (k === 'area' || k === 'label') v = text(v, 60) || '';
      else if (['name', 'city', 'item'].includes(k)) { v = text(v, 120); if (!v) fail('这一栏不能空'); }
      else v = text(v, 2000);
      fields[k] = v;
    }
    if (!Object.keys(fields).length) fail('没有要改的');
    const row = s[table].find(r => r.id === id(b.id));
    if (row) {
      Object.assign(row, fields);
      if (b.kind === 'taste') row.updated_at = stamp(now);
      checkUnique(s, b.kind, row);
    }
    result = { ok: Boolean(row) };
  } else if (path === '/api/food/addlog') {
    const d = obj(b.dish);
    if (!text(d.name, 120)) fail('菜名要写');
    const m = s.meals.find(m => m.id === id(b.meal_id));
    if (!m) fail('这一顿不在了');
    const shopId = s.branches.find(br => br.id === m.branch_id)?.shop_id ?? null;
    const log = addDishLog(s, m.id, shopId, d);
    result = { ok: true, log_id: log.id };
  } else if (path === '/api/food/del') {
    result = { ok: remove(s, b.kind, id(b.id)) };
  } else fail('没有这个口子');
  return { state: s, result: copy(result) };
}

let opening;
// MIE: 数据按角色隔离 —— iframe URL ?char=<角色id> 决定账本；不同角色互不可见。
const FOOD_CHAR = (() => {
  try {
    const raw = new URLSearchParams(location.search).get('char') || 'default';
    const safe = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return safe || 'default';
  } catch (e) { return 'default'; }
})();
function recordKey() { return 'state:' + FOOD_CHAR; }
function database() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持本地数据库')); return; }
    const req = indexedDB.open('mie-have-you-eaten', 1);
    let blocked = false;
    req.onupgradeneeded = () => req.result.createObjectStore('book');
    req.onerror = () => reject(new Error('本地数据库打开失败'));
    req.onblocked = () => {
      blocked = true;
      reject(new Error('本地数据库被占用，请关闭其它吃了吗页面后重试'));
    };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
  });
  opening.catch(() => { opening = undefined; });
  return opening;
}

export async function request(path, body) {
  try {
    // Capture caller-owned input before the first await.
    body = copy(body);
    path = String(path).split('?')[0];
    if (path === '/api/food/dice') {
      const b = obj(body);
      const { roll } = await import('./dice.js');
      return copy(await roll(await request('/api/food'), b.mode || 'dish', b.kind || '', b.want || '', undefined, b.only || ''));
    }
    if (path === '/api/upload') return applyRequest(undefined, path, body).result;
    const db = await database();
    return await new Promise((resolve, reject) => {
      const reading = path === '/api/food' && body == null;
      // No await inside this transaction: cross-tab readwrite transactions on this
      // store serialize the entire read/modify/write, not merely the final put.
      const tx = db.transaction('book', reading ? 'readonly' : 'readwrite');
      const store = tx.objectStore('book');
      let result, failure;
      const rk = recordKey();
      const get = store.get(rk);
      get.onsuccess = () => {
        try {
          const applied = applyRequest(get.result, path, body);
          result = applied.result;
          if (!reading) store.put(applied.state, rk);
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || new Error(tx.error?.name === 'QuotaExceededError' ? '本地空间不足，请清理图片后重试' : '本地保存失败，未提交本次修改'));
      tx.onerror = () => { /* Abort reports the error; never resolve before commit. */ };
    });
  } catch (e) {
    if (e instanceof Error && /[\u3400-\u9fff]/.test(e.message)) throw e;
    throw new Error('本地操作失败，请重试（' + (e?.name || '未知错误') + '）');
  }
}
