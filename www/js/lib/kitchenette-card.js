// kitchenette-cooking-card: built from web/src by `npm run build`. Edit the sources, not this file.

// src/api.ts
var OUTCOMES = /* @__PURE__ */ new Set(["great", "ok", "burnt", "spoiled"]);
function parseOutcome(v) {
  return typeof v === "string" && OUTCOMES.has(v) ? v : null;
}
function probeFromSession(s) {
  if (!s) return { status: null, outcome: null, session: null };
  const status = s.status === "served" || s.status === "cancelled" || s.status === "cooking" ? s.status : null;
  return { status, outcome: parseOutcome(s.outcome), session: s };
}
var KitchenFetchError = class extends Error {
  constructor(kind, status, message) {
    super(message);
    this.name = "KitchenFetchError";
    this.kind = kind;
    this.status = status;
  }
};
var REASON = {
  unreachable: "the kitchen server cannot be reached",
  blocked: "the browser blocked the request: this page is not on the kitchen server's list of allowed sites",
  unauthorized: "the kitchen server refused the request: the token is missing or wrong",
  not_found: "the kitchen server has no pot with this id",
  server: "the kitchen server answered with an error",
  bad_response: "the kitchen server's answer was not understood"
};
function fail(kind, status = null) {
  return new KitchenFetchError(kind, status, status === null ? REASON[kind] : `${REASON[kind]} (status ${status})`);
}
function asKitchenError(e) {
  return e instanceof KitchenFetchError ? e : fail("unreachable");
}
function parseAnswer(body) {
  const b = body && typeof body === "object" ? body : {};
  const session = b.session && typeof b.session === "object" ? b.session : null;
  return { session, timezone: typeof b.timezone === "string" ? b.timezone : "" };
}
async function fetchKitchen(base, sessionId, token) {
  const url = `${base.replace(/\/+$/, "")}/api/kitchen?session_id=${encodeURIComponent(sessionId)}`;
  let r;
  try {
    r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    let reachable = false;
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store" });
      reachable = true;
    } catch {
      reachable = false;
    }
    throw fail(reachable ? "blocked" : "unreachable");
  }
  if (r.status === 401 || r.status === 403) throw fail("unauthorized", r.status);
  if (r.status === 404) throw fail("not_found", r.status);
  if (!r.ok) throw fail("server", r.status);
  try {
    return parseAnswer(await r.json());
  } catch {
    throw fail("bad_response", r.status);
  }
}
async function fetchSession(base, sessionId, token) {
  return (await fetchKitchen(base, sessionId, token)).session;
}
function notFound() {
  return fail("not_found");
}
var CACHE_MS = 5e3;
var cache = /* @__PURE__ */ new Map();
function apiProbe(base, token) {
  return async (sessionId, fresh = false) => {
    const key = `${base}
${sessionId}`;
    const now = Date.now();
    let hit = cache.get(key);
    if (fresh || !hit || now - hit.at > CACHE_MS) {
      for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
      const p = fetchKitchen(base, sessionId, typeof token === "function" ? token() : token);
      hit = { at: now, p };
      cache.set(key, hit);
      p.catch(() => {
        if (cache.get(key)?.p === p) cache.delete(key);
      });
    }
    const answer = await hit.p;
    return { ...probeFromSession(answer.session), timezone: answer.timezone };
  };
}

// src/cookPhase.ts
var FRESH_S = 300;
var ENTER_MS = 700;
var EXIT_MS = 450;
var HOLD_MS = 2e3;
var SWAP_SLACK_MS = 150;
var OUTCOME_WAIT_MS = 6e3;
function kitchenTiming() {
  const playMs = 3e3;
  return { playMs, swapMs: playMs + SWAP_SLACK_MS, serveMs: playMs + HOLD_MS };
}
var SERVE_PLAY_MS = kitchenTiming().playMs;
var SERVE_SWAP_MS = kitchenTiming().swapMs;
var SERVE_MS = kitchenTiming().serveMs;
function isFailOutcome(o) {
  return o === "burnt" || o === "spoiled";
}
function outcomeWord(o) {
  if (o === "great") return "\u5F88\u597D";
  if (o === "burnt") return "\u7CCA\u4E86";
  if (o === "spoiled") return "\u574F\u4E86";
  return null;
}
function revealAtMs(f) {
  const dueMs = (f.startedAt + Math.max(0, f.durationSec)) * 1e3;
  if (f.outcomeAtMs === void 0) return dueMs + OUTCOME_WAIT_MS;
  return Math.min(Math.max(dueMs, f.outcomeAtMs), dueMs + OUTCOME_WAIT_MS);
}
function kitchenPhase(f, nowMs) {
  const startMs = f.startedAt * 1e3;
  const dueMs = startMs + Math.max(0, f.durationSec) * 1e3;
  if (!Number.isFinite(startMs) || !Number.isFinite(dueMs)) return "done";
  if (f.cancelledSeenAtMs !== void 0) {
    const seenLive = f.cancelledSeenAtMs > f.mountedAtMs + 50;
    if (seenLive && nowMs < f.cancelledSeenAtMs + EXIT_MS) return "exit";
    return "cancelled";
  }
  if (f.mountedAtMs >= dueMs) return "done";
  if (nowMs < dueMs) {
    const fresh = f.firstSeen && f.mountedAtMs - startMs <= FRESH_S * 1e3;
    if (fresh && nowMs < f.mountedAtMs + ENTER_MS) return "enter";
    return "stir";
  }
  const reveal = revealAtMs(f);
  if (nowMs < reveal) return "stir";
  const t = kitchenTiming();
  if (nowMs < reveal + t.serveMs) return "serve";
  if (nowMs < reveal + t.serveMs + EXIT_MS) return "exit";
  return "done";
}
function spriteOnStage(p) {
  return p === "enter" || p === "stir" || p === "serve" || p === "exit";
}
function phaseIsLive(p) {
  return p !== "done" && p !== "cancelled";
}
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtRemaining(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const h2 = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const r = s % 60;
  return h2 > 0 ? `${h2}:${pad2(m)}:${pad2(r)}` : `${pad2(m)}:${pad2(r)}`;
}
function cookProgress(startedAt, durationSec, nowMs) {
  const total = Math.max(0, durationSec);
  if (!Number.isFinite(startedAt) || total <= 0) return { remainingSec: 0, progress: 1 };
  const elapsed = Math.max(0, nowMs / 1e3 - startedAt);
  return {
    remainingSec: Math.max(0, total - elapsed),
    progress: Math.min(1, elapsed / total)
  };
}
function pickTimeZone(fromServer, fromCard) {
  for (const tz of [fromServer, fromCard]) {
    if (typeof tz !== "string" || tz.trim() === "") continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
      return tz.trim();
    } catch {
    }
  }
  return void 0;
}
function fmtHM(epochSec, timeZone) {
  const d = new Date(epochSec * 1e3);
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
      const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
      const h2 = get("hour"), m = get("minute");
      if (h2 && m) return `${h2}:${m}`;
    } catch {
    }
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtMinutes(durationSec) {
  const m = Math.round(durationSec / 60);
  if (m < 60) return `${m} \u5206\u949F`;
  const h2 = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h2} \u5C0F\u65F6` : `${h2} \u5C0F\u65F6 ${r} \u5206`;
}

// src/cookSegments.ts
var COOK_METHODS = ["stirfry", "fry", "deepfry", "boil", "steam", "bake", "mix"];
var COOK_OUTFITS = ["toque", "scarf"];
var METHOD_DEFAULT = "stirfry";
var METHOD_LABEL = {
  stirfry: "\u7092",
  fry: "\u714E",
  deepfry: "\u70B8",
  boil: "\u716E",
  steam: "\u84B8",
  bake: "\u70E4",
  mix: "\u62CC"
};
function parseMethod(v) {
  return typeof v === "string" && COOK_METHODS.includes(v) ? v : METHOD_DEFAULT;
}
function hashStr(s) {
  let h2 = 2166136261;
  for (const ch of Array.from(s)) {
    h2 ^= ch.codePointAt(0) ?? 0;
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return h2 >>> 0;
}
function outfitFor(sessionId, outfits = COOK_OUTFITS) {
  return outfits[hashStr(sessionId) % outfits.length];
}
var CLIP_MS = 3e3;
var WASH_MIN_TOTAL_S = 180;
var CHOP_FRAC = 0.2;
var CHOP_MAX_S = 300;
var TASTE_FRAC = 0.1;
var TASTE_MAX_S = 120;
var SLOT_S = 30;
var IDLE_AT_S = 12;
var IDLES = [null, "wipe", "look", "hot"];
function cookSegment(i) {
  const m = i.method;
  if (i.phase === "done" || i.phase === "cancelled") return null;
  const fail2 = isFailOutcome(i.outcome);
  const swapMs = kitchenTiming().swapMs;
  if (i.phase === "serve") {
    const k = fail2 ? "fail" : "serve";
    return i.sinceRevealMs < swapMs ? `${m}_${k}` : `${m}_${k}_last`;
  }
  if (i.phase === "exit") {
    if (i.sinceRevealMs < 0) return `${m}_main`;
    return fail2 ? `${m}_fail_last` : `${m}_serve_last`;
  }
  const startMs = i.startedAt * 1e3;
  const totalMs = Math.max(0, i.durationSec) * 1e3;
  const el = i.nowMs - startMs;
  if (el >= totalMs) return `${m}_main`;
  const fresh = i.firstSeen && i.mountedAtMs - startMs <= FRESH_S * 1e3;
  if (fresh && totalMs >= WASH_MIN_TOTAL_S * 1e3 && i.nowMs < i.mountedAtMs + CLIP_MS) return "wash";
  if (el < Math.min(totalMs * CHOP_FRAC, CHOP_MAX_S * 1e3)) return "chop";
  if (el >= totalMs - Math.min(totalMs * TASTE_FRAC, TASTE_MAX_S * 1e3)) return `${m}_taste`;
  const slot = Math.floor(el / (SLOT_S * 1e3));
  const inSlot = el - slot * SLOT_S * 1e3;
  const idle = IDLES[hashStr(`${i.sessionId}:${slot}`) % IDLES.length];
  if (idle && inSlot >= IDLE_AT_S * 1e3 && inSlot < IDLE_AT_S * 1e3 + CLIP_MS) return `${m}_${idle}`;
  return `${m}_main`;
}
function assetKey(outfit, segment) {
  return `${outfit}/${segment}`;
}

// src/manifest.ts
var METHOD_PARTS = ["main", "wipe", "look", "hot", "taste", "serve", "fail", "serve_last", "fail_last"];
function requiredSegments() {
  const segs = ["base", "wash", "chop"];
  for (const m of COOK_METHODS) for (const k of METHOD_PARTS) segs.push(`${m}_${k}`);
  return segs;
}
function missingKeys(manifest) {
  const missing = [];
  for (const o of manifest.outfits) {
    for (const s of requiredSegments()) if (manifest.files[assetKey(o, s)] === void 0) missing.push(assetKey(o, s));
  }
  return missing;
}
var SRC_CANVAS = 720;
var SRC_LINE_Y = 560;
var CANVAS_PX = 180;
var STAGE_PX = CANVAS_PX * SRC_LINE_Y / SRC_CANVAS;

// src/manifest.generated.ts
var CLAWD_MANIFEST = {
  "name": "clawd",
  "outfits": [
    "toque",
    "scarf"
  ],
  "files": {
    "toque/bake_fail": "toque/bake_fail.webp",
    "toque/bake_fail_last": "toque/bake_fail_last.png",
    "toque/bake_hot": "toque/bake_hot.webp",
    "toque/bake_look": "toque/bake_look.webp",
    "toque/bake_main": "toque/bake_main.webp",
    "toque/bake_serve": "toque/bake_serve.webp",
    "toque/bake_serve_last": "toque/bake_serve_last.png",
    "toque/bake_taste": "toque/bake_taste.webp",
    "toque/bake_wipe": "toque/bake_wipe.webp",
    "toque/base": "toque/base.png",
    "toque/boil_fail": "toque/boil_fail.webp",
    "toque/boil_fail_last": "toque/boil_fail_last.png",
    "toque/boil_hot": "toque/boil_hot.webp",
    "toque/boil_look": "toque/boil_look.webp",
    "toque/boil_main": "toque/boil_main.webp",
    "toque/boil_serve": "toque/boil_serve.webp",
    "toque/boil_serve_last": "toque/boil_serve_last.png",
    "toque/boil_taste": "toque/boil_taste.webp",
    "toque/boil_wipe": "toque/boil_wipe.webp",
    "toque/chop": "toque/chop.webp",
    "toque/deepfry_fail": "toque/deepfry_fail.webp",
    "toque/deepfry_fail_last": "toque/deepfry_fail_last.png",
    "toque/deepfry_hot": "toque/deepfry_hot.webp",
    "toque/deepfry_look": "toque/deepfry_look.webp",
    "toque/deepfry_main": "toque/deepfry_main.webp",
    "toque/deepfry_serve": "toque/deepfry_serve.webp",
    "toque/deepfry_serve_last": "toque/deepfry_serve_last.png",
    "toque/deepfry_taste": "toque/deepfry_taste.webp",
    "toque/deepfry_wipe": "toque/deepfry_wipe.webp",
    "toque/fry_fail": "toque/fry_fail.webp",
    "toque/fry_fail_last": "toque/fry_fail_last.png",
    "toque/fry_hot": "toque/fry_hot.webp",
    "toque/fry_look": "toque/fry_look.webp",
    "toque/fry_main": "toque/fry_main.webp",
    "toque/fry_serve": "toque/fry_serve.webp",
    "toque/fry_serve_last": "toque/fry_serve_last.png",
    "toque/fry_taste": "toque/fry_taste.webp",
    "toque/fry_wipe": "toque/fry_wipe.webp",
    "toque/mix_fail": "toque/mix_fail.webp",
    "toque/mix_fail_last": "toque/mix_fail_last.png",
    "toque/mix_hot": "toque/mix_hot.webp",
    "toque/mix_look": "toque/mix_look.webp",
    "toque/mix_main": "toque/mix_main.webp",
    "toque/mix_serve": "toque/mix_serve.webp",
    "toque/mix_serve_last": "toque/mix_serve_last.png",
    "toque/mix_taste": "toque/mix_taste.webp",
    "toque/mix_wipe": "toque/mix_wipe.webp",
    "toque/steam_fail": "toque/steam_fail.webp",
    "toque/steam_fail_last": "toque/steam_fail_last.png",
    "toque/steam_hot": "toque/steam_hot.webp",
    "toque/steam_look": "toque/steam_look.webp",
    "toque/steam_main": "toque/steam_main.webp",
    "toque/steam_serve": "toque/steam_serve.webp",
    "toque/steam_serve_last": "toque/steam_serve_last.png",
    "toque/steam_taste": "toque/steam_taste.webp",
    "toque/steam_wipe": "toque/steam_wipe.webp",
    "toque/stirfry_fail": "toque/stirfry_fail.webp",
    "toque/stirfry_fail_last": "toque/stirfry_fail_last.png",
    "toque/stirfry_hot": "toque/stirfry_hot.webp",
    "toque/stirfry_look": "toque/stirfry_look.webp",
    "toque/stirfry_main": "toque/stirfry_main.webp",
    "toque/stirfry_serve": "toque/stirfry_serve.webp",
    "toque/stirfry_serve_last": "toque/stirfry_serve_last.png",
    "toque/stirfry_taste": "toque/stirfry_taste.webp",
    "toque/stirfry_wipe": "toque/stirfry_wipe.webp",
    "toque/wash": "toque/wash.webp",
    "scarf/bake_fail": "scarf/bake_fail.webp",
    "scarf/bake_fail_last": "scarf/bake_fail_last.png",
    "scarf/bake_hot": "scarf/bake_hot.webp",
    "scarf/bake_look": "scarf/bake_look.webp",
    "scarf/bake_main": "scarf/bake_main.webp",
    "scarf/bake_serve": "scarf/bake_serve.webp",
    "scarf/bake_serve_last": "scarf/bake_serve_last.png",
    "scarf/bake_taste": "scarf/bake_taste.webp",
    "scarf/bake_wipe": "scarf/bake_wipe.webp",
    "scarf/base": "scarf/base.png",
    "scarf/boil_fail": "scarf/boil_fail.webp",
    "scarf/boil_fail_last": "scarf/boil_fail_last.png",
    "scarf/boil_hot": "scarf/boil_hot.webp",
    "scarf/boil_look": "scarf/boil_look.webp",
    "scarf/boil_main": "scarf/boil_main.webp",
    "scarf/boil_serve": "scarf/boil_serve.webp",
    "scarf/boil_serve_last": "scarf/boil_serve_last.png",
    "scarf/boil_taste": "scarf/boil_taste.webp",
    "scarf/boil_wipe": "scarf/boil_wipe.webp",
    "scarf/chop": "scarf/chop.webp",
    "scarf/deepfry_fail": "scarf/deepfry_fail.webp",
    "scarf/deepfry_fail_last": "scarf/deepfry_fail_last.png",
    "scarf/deepfry_hot": "scarf/deepfry_hot.webp",
    "scarf/deepfry_look": "scarf/deepfry_look.webp",
    "scarf/deepfry_main": "scarf/deepfry_main.webp",
    "scarf/deepfry_serve": "scarf/deepfry_serve.webp",
    "scarf/deepfry_serve_last": "scarf/deepfry_serve_last.png",
    "scarf/deepfry_taste": "scarf/deepfry_taste.webp",
    "scarf/deepfry_wipe": "scarf/deepfry_wipe.webp",
    "scarf/fry_fail": "scarf/fry_fail.webp",
    "scarf/fry_fail_last": "scarf/fry_fail_last.png",
    "scarf/fry_hot": "scarf/fry_hot.webp",
    "scarf/fry_look": "scarf/fry_look.webp",
    "scarf/fry_main": "scarf/fry_main.webp",
    "scarf/fry_serve": "scarf/fry_serve.webp",
    "scarf/fry_serve_last": "scarf/fry_serve_last.png",
    "scarf/fry_taste": "scarf/fry_taste.webp",
    "scarf/fry_wipe": "scarf/fry_wipe.webp",
    "scarf/mix_fail": "scarf/mix_fail.webp",
    "scarf/mix_fail_last": "scarf/mix_fail_last.png",
    "scarf/mix_hot": "scarf/mix_hot.webp",
    "scarf/mix_look": "scarf/mix_look.webp",
    "scarf/mix_main": "scarf/mix_main.webp",
    "scarf/mix_serve": "scarf/mix_serve.webp",
    "scarf/mix_serve_last": "scarf/mix_serve_last.png",
    "scarf/mix_taste": "scarf/mix_taste.webp",
    "scarf/mix_wipe": "scarf/mix_wipe.webp",
    "scarf/steam_fail": "scarf/steam_fail.webp",
    "scarf/steam_fail_last": "scarf/steam_fail_last.png",
    "scarf/steam_hot": "scarf/steam_hot.webp",
    "scarf/steam_look": "scarf/steam_look.webp",
    "scarf/steam_main": "scarf/steam_main.webp",
    "scarf/steam_serve": "scarf/steam_serve.webp",
    "scarf/steam_serve_last": "scarf/steam_serve_last.png",
    "scarf/steam_taste": "scarf/steam_taste.webp",
    "scarf/steam_wipe": "scarf/steam_wipe.webp",
    "scarf/stirfry_fail": "scarf/stirfry_fail.webp",
    "scarf/stirfry_fail_last": "scarf/stirfry_fail_last.png",
    "scarf/stirfry_hot": "scarf/stirfry_hot.webp",
    "scarf/stirfry_look": "scarf/stirfry_look.webp",
    "scarf/stirfry_main": "scarf/stirfry_main.webp",
    "scarf/stirfry_serve": "scarf/stirfry_serve.webp",
    "scarf/stirfry_serve_last": "scarf/stirfry_serve_last.png",
    "scarf/stirfry_taste": "scarf/stirfry_taste.webp",
    "scarf/stirfry_wipe": "scarf/stirfry_wipe.webp",
    "scarf/wash": "scarf/wash.webp"
  }
};

// src/seats.ts
var MAX_ANIMATED = 2;
var holders = [];
var waiters = /* @__PURE__ */ new Set();
function acquireSeat(revoke) {
  const h2 = { revoke };
  if (holders.length >= MAX_ANIMATED) {
    const oldest = holders.shift();
    oldest.revoke();
  }
  holders.push(h2);
  return h2;
}
function releaseSeat(h2) {
  const i = holders.indexOf(h2);
  if (i < 0) return;
  holders.splice(i, 1);
  [...waiters].forEach((fn) => fn());
}
function seatFree() {
  return holders.length < MAX_ANIMATED;
}
function onSeatFree(fn) {
  waiters.add(fn);
  return () => {
    waiters.delete(fn);
  };
}

// src/seen.ts
var seen = /* @__PURE__ */ new Set();
function isFirstSeen(sessionId) {
  return !seen.has(sessionId);
}
function markSeen(sessionId) {
  seen.add(sessionId);
}

// src/serifRange.generated.ts
var SERIF_RARE_RANGE = "U+3400,U+4E0C,U+4E10,U+4E15,U+4E1E,U+4E28,U+4E2C,U+4E36,U+4E3F,U+4E47,U+4E5C,U+4E69,U+4E8D,U+4E93,U+4E98,U+4E9F-4EA0,U+4EB3,U+4EB5,U+4EBB,U+4EC2-4EC4,U+4EC9,U+4EDD-4EDE,U+4EE1,U+4EE8,U+4EEB,U+4EF3,U+4EF5,U+4F09,U+4F1B,U+4F22,U+4F25,U+4F27,U+4F2B,U+4F32,U+4F3D,U+4F57-4F58,U+4F5A,U+4F5D-4F5F,U+4F64-4F65,U+4F67,U+4F74,U+4F76,U+4F7B-4F7C,U+4F7E,U+4F83,U+4F89,U+4F8F,U+4F91,U+4F94,U+4FAA,U+4FAC,U+4FC5,U+4FCE,U+4FD1,U+4FDA,U+4FDC,U+4FDF,U+4FE3,U+4FE6,U+4FE8,U+4FEA,U+4FF3,U+4FF8,U+4FFE,U+500C,U+500F,U+501C,U+5025,U+5028-5029,U+502C-502E,U+5043,U+5048,U+504C,U+504E,U+5055,U+506C,U+507B,U+507E,U+50A5,U+50A7,U+50A9,U+50BA,U+50D6,U+50E6,U+50EC-50EE,U+5106-5107,U+510B,U+5140,U+5155-5156,U+516E,U+5181-5182,U+5196,U+51A2,U+51A5,U+51AB,U+51B1,U+51BC-51BD,U+51C7,U+51CD,U+51E6,U+51EA-51EB,U+51F5,U+51FC,U+5202,U+5208,U+520D-520E,U+5216,U+522D,U+5233,U+523F-5240,U+524C,U+525C,U+525E,U+5261,U+527D,U+5281-5282,U+5290,U+5293,U+52A2,U+52AC-52AD,U+52BE,U+52D0,U+52D5-52D6,U+52F0,U+52F9,U+530D,U+530F-5310,U+5315,U+531A,U+5326,U+532E,U+533E,U+5345,U+5358,U+535F,U+5363,U+5366,U+5369,U+536E,U+537A,U+538D,U+539D,U+53A3,U+53A5,U+53AE,U+53B6,U+53CE,U+53DF,U+53E8-53E9,U+53F1,U+53F5,U+53FB,U+53FD,U+5406,U+5412,U+5416,U+5421,U+5423,U+5432,U+5443,U+544B,U+5452-5454,U+5456-5457,U+5459,U+5464,U+5466,U+5471-5472,U+5476-5477,U+5482,U+5484,U+5494,U+549A-549B,U+549D,U+54A3-54A4,U+54A6-54A7,U+54A9-54AB,U+54AD,U+54B4,U+54BB,U+54BF,U+54C2,U+54CC,U+54CF-54D0,U+54D2-54D5,U+54D9-54DA,U+54DC-54DE,U+54E7,U+54F3,U+54FD,U+54FF,U+550F,U+5511,U+5514,U+551B,U+5520,U+5522-5523,U+5527,U+552A,U+5530,U+5533,U+5537,U+553C,U+553F,U+5541,U+5549,U+5550,U+5553,U+5555-5556,U+555C,U+5567,U+556C-556D,U+5575-5577,U+557B,U+557E,U+5581,U+5583,U+5588,U+558B,U+558F,U+5591,U+5594,U+5599,U+559F,U+55B1,U+55B5,U+55B9,U+55BD-55BE,U+55C4,U+55C9,U+55CC-55CD,U+55D1-55D2,U+55D4,U+55D6,U+55DD,U+55DF,U+55E4-55E6,U+55E8,U+55EA-55EC,U+55EF,U+55F2-55F3,U+55F5,U+55F7,U+55FE,U+5600-5601,U+5608,U+560C,U+560F,U+561E-561F,U+5623-5624,U+5627,U+562C-562D,U+5639,U+564C-564D,U+5654,U+5657-5659,U+565C,U+5662,U+5664,U+5669,U+566B,U+5671,U+567B-567C,U+5685-5686,U+5693,U+56AF,U+56D4,U+56D7,U+56DD,U+56DF,U+56E1,U+56EB,U+56F3,U+56F5,U+56F9,U+56FF,U+5704,U+5709-570A,U+571C,U+5729-572A,U+572C,U+572E-572F,U+5733,U+5739,U+573B,U+5742,U+574C,U+575C,U+5768-5769,U+576B,U+576D,U+5773,U+5776,U+577B-577C,U+5785-5786,U+578C,U+5793,U+57A0-57A1,U+57A4,U+57A7,U+57A9,U+57AD,U+57B2,U+57B4,U+57B8,U+57CF,U+57D2,U+57D5,U+57D8-57DA,U+57DD,U+57E4,U+57ED,U+57EF,U+57F4,U+57F8,U+57FD,U+5800,U+5805,U+5807,U+580B,U+580D,U+5819,U+581E,U+5820,U+5844,U+584D,U+5865,U+586C,U+587E,U+5880-5881,U+5889,U+589A,U+58BC,U+58C5,U+58D1,U+5902,U+5914,U+5919,U+5924-5925,U+592D,U+593C,U+5941-5942,U+5955,U+5958,U+595A,U+5981,U+5983,U+598D,U+5997,U+599E,U+59A3-59A4,U+59A9-59AB,U+59AF,U+59B2,U+59BE,U+59CA,U+59D2,U+59D7-59D8,U+59DD,U+59E3,U+59F9,U+5A05-5A06,U+5A08-5A09,U+5A0C,U+5A11,U+5A13,U+5A23,U+5A32,U+5A34,U+5A3C,U+5A40,U+5A4A,U+5A55,U+5A62,U+5A67,U+5A75,U+5A77,U+5A7A,U+5A9B,U+5AAA,U+5AB2,U+5AB5,U+5AB8,U+5ABE,U+5AD2,U+5AD4,U+5AD6,U+5AD8,U+5ADC,U+5AE0,U+5AE3,U+5AE6,U+5AEB,U+5AF1,U+5B09,U+5B16-5B17,U+5B32,U+5B34,U+5B37,U+5B40,U+5B51,U+5B53,U+5B5A-5B5B,U+5B62,U+5B65,U+5B6C,U+5B71,U+5B73,U+5B80,U+5B84,U+5B93,U+5B95,U+5B9F,U+5BA5,U+5BB8,U+5BE4,U+5BEE,U+5BF0,U+5C15,U+5C1C,U+5C22,U+5C25,U+5C2C,U+5C34,U+5C3B,U+5C50,U+5C59,U+5C63,U+5C66,U+5C6E,U+5C7A,U+5C88,U+5C8C-5C8D,U+5C90-5C91,U+5C96,U+5C98-5C9A,U+5C9C,U+5CA2-5CA3,U+5CAB-5CAC,U+5CB1,U+5CB5,U+5CB7,U+5CBD,U+5CC1,U+5CC4,U+5CCB,U+5CD2,U+5CE4-5CE5,U+5D02-5D03,U+5D06,U+5D1B,U+5D1E,U+5D24,U+5D26-5D27,U+5D2E,U+5D34,U+5D3D-5D3E,U+5D47,U+5D4A-5D4B,U+5D58,U+5D5B,U+5D5D,U+5D69,U+5D6B-5D6C,U+5D6F,U+5D74,U+5D82,U+5D99,U+5D9D,U+5DB7,U+5DC5,U+5DDB,U+5DE3,U+5DEF,U+5DFD,U+5E0F,U+5E11,U+5E14,U+5E19,U+5E31,U+5E37,U+5E3B-5E3C,U+5E44,U+5E54,U+5E5B,U+5E5E,U+5E61,U+5E7A,U+5E80,U+5E8B,U+5E91,U+5E96,U+5EA0,U+5EA5,U+5EB3,U+5EB5,U+5EB9,U+5EBE,U+5ED1-5ED2,U+5EDB,U+5EE8,U+5EEA,U+5EF4,U+5EFE-5EFF,U+5F01,U+5F08,U+5F0B,U+5F11,U+5F29-5F2A,U+5F2D,U+5F3C,U+5F40,U+5F50,U+5F56-5F58,U+5F61,U+5F73,U+5F77,U+5F82,U+5F87,U+5F89,U+5F8C,U+5F95,U+5F99,U+5F9C,U+5FA8,U+5FAD,U+5FB5,U+5FBC,U+5FC4,U+5FC9,U+5FCF-5FD2,U+5FD6,U+5FDD,U+5FE1,U+5FE4,U+5FEA,U+5FED-5FEE,U+5FF8,U+5FFE,U+6003-6006,U+600A,U+600D,U+600F,U+6019,U+601B,U+6021,U+6026,U+6029,U+602B,U+6035,U+603C,U+603F,U+6041-6042,U+6059-605A,U+605D,U+6063,U+6067,U+606A,U+6078-607B,U+607D,U+6083,U+608C,U+6092,U+6096,U+609A-609B,U+609D,U+60AB,U+60AD,U+60B1,U+60B4,U+60BB,U+60C6,U+60D8,U+60DA,U+60DD,U+60EC,U+60F4,U+6100,U+6106,U+610D-610E,U+6115,U+6120,U+6123,U+6126,U+612B,U+614A,U+615D,U+6175,U+6194,U+619D,U+61A7,U+61A9,U+61AC,U+61B7,U+61CB,U+61D1,U+61D4,U+61F5,U+61FF,U+6206,U+620B,U+6215,U+6217,U+621B,U+621F,U+6221-6222,U+6224-6225,U+622C,U+6238,U+623D-623E,U+6243,U+6248-6249,U+624C,U+6255,U+626A,U+629F,U+62BB,U+62CA,U+62D7,U+62DA,U+62EE,U+62F6,U+6308,U+6322,U+6332,U+6339,U+6343,U+634B,U+6369,U+636D,U+6371,U+637A,U+638A,U+638E,U+63AC-63AE,U+63B0,U+63B4,U+63BC,U+63BE,U+63C4,U+63C6,U+63CE,U+63DE,U+63E0,U+63F2,U+63F6,U+63F8,U+63FF,U+640B-640C,U+641B,U+6420-6421,U+6426,U+6434,U+643F,U+6441,U+6445,U+6452,U+645E,U+646D,U+647A,U+6484,U+6496,U+6499,U+64B7-64B8,U+64BA,U+64C0,U+64D0,U+64D7-64D8,U+64E2,U+64E4,U+6509,U+6525,U+652E,U+6534-6535,U+6538,U+6549,U+6555,U+656B,U+6590,U+6593,U+659B,U+65AB,U+65BC,U+65C3-65C4,U+65C6,U+65CC,U+65CE,U+65D2,U+65D6,U+65EE-65F0,U+6600,U+6603,U+660A,U+6615,U+6619,U+661D,U+6631,U+6634-6636,U+6641-6642,U+664F,U+6654,U+6656-6657,U+665F,U+6661,U+6677,U+6684,U+668C,U+669D,U+66A7-66A8,U+66B9,U+66BE,U+66DB-66DC,U+66E6,U+66E9,U+66F7,U+670A,U+6710,U+6715,U+6726,U+6748,U+674C,U+6753,U+675E,U+6769-676A,U+6771-6773,U+6775,U+6777,U+677C,U+6787,U+678B,U+6798,U+679E,U+67A5,U+67A7-67A8,U+67AD,U+67B0,U+67B3,U+67B5,U+67B8,U+67C1,U+67C3,U+67CE,U+67D8-67DA,U+67DD,U+67E2,U+67E9,U+67F0,U+67FD,U+6800,U+6804,U+6809-680A,U+680C,U+680E,U+681D-681E,U+6829,U+6832-6833,U+683E,U+6840-6841,U+6844,U+6849-684A,U+684E,U+6855,U+6860-6862,U+6864,U+6866-6867,U+686B,U+6874,U+6877,U+6883,U+688F,U+6893,U+68B5,U+68C2,U+68E3,U+68F0,U+68F9,U+68FC,U+6901,U+690B,U+6910,U+691F-6920,U+6924,U+6934,U+6939,U+6942,U+6953,U+6957,U+695D,U+6960,U+6963,U+6966,U+696B,U+696E,U+6971,U+6978-6979,U+6980,U+6984,U+6987-6989,U+698D,U+6995,U+6998,U+699B,U+69A7,U+69AB,U+69AD,U+69B1,U+69BB,U+69C1,U+69CA,U+69CC,U+69CE,U+69D4,U+69DF-69E0,U+69ED,U+69F2,U+69FF,U+6A17-6A18,U+6A28,U+6A2F,U+6A35,U+6A3D-6A3E,U+6A44,U+6A50,U+6A58,U+6A5B,U+6A65,U+6A79,U+6A7C,U+6A8E,U+6A90-6A91,U+6A97,U+6AA0,U+6AA9,U+6AAB,U+6AFB,U+6B24,U+6B37,U+6B39,U+6B43,U+6B46,U+6B59,U+6B81-6B82,U+6B84,U+6B87,U+6B8D,U+6B92-6B93,U+6B9A-6B9B,U+6BA1,U+6BAA,U+6BB3,U+6BC2,U+6BD3,U+6BEA,U+6BF3,U+6BF5,U+6BF9,U+6BFD,U+6C05-6C07,U+6C0D,U+6C10,U+6C15,U+6C17-6C1A,U+6C21,U+6C24,U+6C29-6C2A,U+6C32,U+6C35,U+6C37,U+6C3D,U+6C46,U+6C4A,U+6C54,U+6C5C,U+6C68-6C69,U+6C74,U+6C76,U+6C85-6C86,U+6C8C,U+6C90,U+6C93-6C94,U+6CA2-6CA3,U+6CA9,U+6CAD,U+6CB1-6CB2,U+6CD0,U+6CD3-6CD4,U+6CD6-6CD7,U+6CE0,U+6CEB,U+6CEE-6CEF,U+6CF1,U+6CF6-6CF8,U+6CFA,U+6CFE,U+6D04,U+6D07,U+6D0C,U+6D0E,U+6D19-6D1A,U+6D27,U+6D2B,U+6D2E,U+6D33,U+6D35,U+6D39,U+6D43,U+6D48,U+6D4D,U+6D4F,U+6D52,U+6D54,U+6D5C,U+6D5E,U+6D60,U+6D63,U+6D6F,U+6D7C,U+6D91,U+6D93-6D94,U+6D9E,U+6DA0,U+6DAB,U+6DAE,U+6DBC,U+6DBF,U+6DC5,U+6DC7,U+6DD9,U+6DDD-6DDE,U+6DE0,U+6DE6,U+6DFC,U+6E0C,U+6E0E,U+6E11,U+6E16,U+6E1A,U+6E25,U+6E2B,U+6E32,U+6E44,U+6E4E,U+6E53-6E54,U+6E5F,U+6E6B,U+6E6E,U+6E80,U+6E86,U+6E8F,U+6E98,U+6E9F,U+6EA5,U+6EA7,U+6EB1-6EB2,U+6EB4,U+6EB7,U+6EBB,U+6EBD,U+6EC2,U+6ECF,U+6ED5,U+6ED7,U+6EDF-6EE0,U+6EE2,U+6EF9,U+6F09,U+6F15,U+6F24,U+6F29-6F2A,U+6F2D,U+6F2F,U+6F36,U+6F46-6F47,U+6F4B,U+6F51,U+6F62,U+6F64,U+6F72,U+6F74,U+6F78,U+6F7A,U+6F7C,U+6F89,U+6F8C-6F8D,U+6FA7,U+6FB6,U+6FB9,U+6FC2,U+6FC9,U+6FD1,U+6FDE,U+6FE0-6FE1,U+6FEE-6FEF,U+701A-701B,U+701E,U+7023,U+7035,U+7039,U+704F,U+705E,U+706C,U+7080,U+7085,U+7096,U+709C-709D,U+70AB,U+70B1,U+70B7,U+70BA-70BB,U+70C0,U+70CA,U+70E8,U+7110,U+7113,U+7116,U+7118,U+712F,U+7131,U+7145,U+714A,U+715C,U+7166,U+7168,U+7172-7173,U+7178,U+717A,U+7198,U+71A0,U+71A8,U+71B3,U+71B5,U+71B9,U+71D4,U+71E0,U+71E7,U+71EE,U+71F9,U+721D,U+7228,U+7230,U+723B,U+723F,U+724D,U+7252,U+7256,U+725D,U+7266,U+726E-726F,U+727E-727F,U+7284,U+728B,U+728D,U+728F,U+7292,U+729F,U+72AD,U+72B0,U+72B4,U+72B7-72B8,U+72C1,U+72C3,U+72CD-72CE,U+72D2,U+72E8-72E9,U+72EF,U+72F2-72F4,U+72F7,U+72FA-72FB,U+7301,U+7303,U+730A,U+7313,U+7315,U+7317,U+731D-731E,U+7321-7322,U+7325,U+732C,U+7331,U+7337-7339,U+734D,U+7350,U+7352,U+7357,U+7360,U+736C,U+736F,U+737E,U+738E,U+7391,U+739F,U+73A2,U+73AE,U+73B3,U+73B7,U+73BA,U+73C0,U+73C2,U+73C8-73C9,U+73CF,U+73D1,U+73D9,U+73DE,U+73E5,U+73E7,U+73E9,U+73F2,U+740A,U+740F,U+741A-741B,U+7425-7426,U+7428,U+742A,U+742C,U+742E,U+7430,U+7441,U+7455,U+7457,U+7459,U+745B-745C,U+746D,U+7477,U+747E,U+7480-7481,U+7487,U+748B,U+748E,U+7490,U+749C,U+749E,U+74A7-74A9,U+74BA,U+74D2,U+74DE,U+74E0,U+74EF,U+74F4,U+74FF,U+750D,U+750F,U+7511,U+7513,U+7519,U+752C,U+752F,U+753A,U+753E,U+7540,U+7548,U+754B,U+754E,U+755A-755B,U+7572,U+7579,U+757F,U+7583,U+758B,U+7592,U+7594,U+7596,U+759D,U+75A0,U+75A3,U+75AC,U+75B0-75B1,U+75B3-75B4,U+75B8,U+75C2-75C4,U+75CD,U+75D6,U+75E3-75E4,U+75E6-75E8,U+75EB,U+75F1,U+75FC,U+75FF-7600,U+7603,U+7605,U+760A,U+760C,U+7610,U+7615,U+7617-7619,U+761B,U+7620,U+7622,U+7625,U+762D,U+7630,U+7633,U+7635,U+763C,U+763E-7640,U+7643,U+764D,U+7654,U+7656,U+765C,U+765E,U+766B,U+766F,U+767A,U+7688,U+768E,U+7693,U+7699,U+76A4,U+76B2,U+76B4,U+76CD,U+76DE,U+76E5,U+76F1,U+76F9,U+7704,U+7707-7708,U+770D,U+7719-771A,U+7722,U+7726,U+772D,U+7735,U+7738,U+7743,U+7746-7747,U+774D,U+7750-7751,U+775A,U+7762,U+7765,U+7768,U+777D-7780,U+778C-778D,U+7791,U+779F-77A0,U+77A2,U+77B0,U+77B5,U+77BD,U+77BF,U+77CD,U+77DC,U+77E7,U+77EC,U+77F6,U+77F8,U+7800,U+7809,U+7811,U+7817-7818,U+781C-781D,U+781F,U+7823,U+7825-7826,U+7829,U+782C-782D,U+7839-783C,U+7847,U+784C,U+784E,U+7850,U+7856-7857,U+786A,U+786D,U+7887,U+7893,U+789A-789C,U+78A1,U+78A3,U+78A5,U+78B2,U+78B9,U+78C9,U+78D4,U+78D9,U+78EC,U+78F2,U+78F4,U+7905,U+7913,U+791E,U+7924,U+7934,U+793B,U+7940,U+7946,U+7949,U+7953,U+7957,U+795A-795C,U+7960,U+7962,U+7967,U+796F,U+797A,U+7980,U+7985,U+798A,U+799A,U+79A7,U+79B3,U+79BA,U+79D5,U+79E3,U+79EB,U+79ED,U+7A02-7A03,U+7A06,U+7A14,U+7A1E,U+7A23,U+7A2E,U+7A37,U+7A39,U+7A40,U+7A51,U+7A70,U+7A78-7A79,U+7A80,U+7A86,U+7A88,U+7A95,U+7AA0,U+7AA6,U+7AA8,U+7AAC-7AAD,U+7AB3,U+7AE6,U+7AFA,U+7AFD,U+7B03-7B04,U+7B08,U+7B0A,U+7B0F,U+7B15,U+7B19,U+7B1E,U+7B20,U+7B24-7B25,U+7B2A-7B2B,U+7B2E,U+7B31,U+7B33,U+7B38,U+7B3E,U+7B45,U+7B47,U+7B4C,U+7B58,U+7B5A,U+7B5D,U+7B60,U+7B62,U+7B6E,U+7B71-7B72,U+7B75,U+7B7B,U+7B85,U+7B90,U+7B9C-7B9D,U+7BA2,U+7BA6-7BA8,U+7BAA-7BAC,U+7BB4,U+7BB8,U+7BC1,U+7BCC,U+7BD1,U+7BDA,U+7BDD,U+7BE5-7BE6,U+7BEA,U+7BFC,U+7BFE,U+7C0B-7C0C,U+7C0F,U+7C16,U+7C1F,U+7C26,U+7C2A,U+7C38,U+7C40-7C41,U+7C74,U+7C7C,U+7C91,U+7C9B-7C9E,U+7CA2,U+7CB2,U+7CBC-7CBD,U+7CC1,U+7CC5,U+7CC7-7CC8,U+7CCC-7CCD,U+7CD7,U+7CE8,U+7CF8,U+7D05,U+7D50,U+7D77,U+7DA6,U+7DAE,U+7DBF,U+7E3B,U+7E47,U+7E9B,U+7E9F,U+7EA1,U+7EA3,U+7EA5,U+7EA8-7EA9,U+7EAD,U+7EB0,U+7EBE,U+7EC0-7EC2,U+7EC9,U+7ECB-7ECC,U+7ED0,U+7ED4,U+7ED7,U+7EDB,U+7EE0-7EE1,U+7EE8,U+7EEB,U+7EEE-7EEF,U+7EF1-7EF2,U+7EF6,U+7EFA-7EFB,U+7EFE,U+7F01-7F03,U+7F07-7F08,U+7F0B-7F0D,U+7F0F,U+7F11-7F12,U+7F17,U+7F19,U+7F1B-7F1C,U+7F1F,U+7F21-7F27,U+7F2A-7F2D,U+7F2F-7F33,U+7F35-7F36,U+7F42,U+7F44-7F45,U+7F54,U+7F58,U+7F5F,U+7F61,U+7F68,U+7F71,U+7F74,U+7F79,U+7F7E,U+7F81,U+7F9D,U+7F9F,U+7FA7,U+7FAF-7FB0,U+7FB2,U+7FB8,U+7FBC,U+7FBF,U+7FCA,U+7FCE,U+7FD2,U+7FD5,U+7FE1,U+7FE5-7FE6,U+7FE9,U+7FEE,U+7FF3,U+8004,U+8006,U+800B,U+8012,U+8014,U+8016,U+801C,U+8020,U+8022,U+8025-8029,U+8031,U+8035,U+8037,U+8043,U+8046,U+804D,U+8052,U+8069,U+8071,U+807F-8080,U+8093,U+809C,U+809F,U+80AB,U+80AD,U+80B1,U+80B4,U+80B7,U+80BC-80BD,U+80C2,U+80C4,U+80CD,U+80D7,U+80D9,U+80DB,U+80DD,U+80E4-80E5,U+80E7-80ED,U+80F1-80F2,U+80F4,U+80FC,U+810D-810E,U+8112,U+8114,U+8118,U+811E,U+812C,U+8132,U+8136,U+8148,U+814C,U+8153,U+8159-815A,U+8160,U+8167,U+8169,U+816D,U+8171,U+8174,U+817C-817D,U+8182,U+8188,U+8191,U+81A3,U+81A6,U+81AA,U+81BA-81BB,U+81C1,U+81CA,U+81CC,U+81E7,U+81EC,U+81FE,U+8201-8202,U+8204,U+8210,U+821B,U+8221-8223,U+8228,U+822B,U+822D,U+822F,U+8233-8234,U+8238,U+823B,U+823E,U+8244,U+8249,U+824B,U+824F,U+825A,U+825F,U+8268,U+826E,U+8274,U+8279,U+827D,U+827F,U+8284,U+8288,U+828A,U+828E-828F,U+8291,U+8297-8299,U+829F,U+82A1,U+82A4,U+82A8-82AB,U+82AE,U+82B0,U+82B4,U+82B7-82B8,U+82BE,U+82C1,U+82C4,U+82C8,U+82CA-82CC,U+82CE,U+82D2-82D3,U+82D5,U+82D8,U+82DC,U+82E0-82E1,U+82E3-82E4,U+82F4,U+82F7,U+82FB,U+8306-8309,U+830C,U+830F,U+8311,U+8314-8315,U+8317,U+831A-831C,U+832D,U+832F,U+8331,U+8333-8334,U+833A,U+833C,U+8340,U+8343,U+8347,U+834F,U+8351,U+835B-835C,U+835E-8360,U+8365-8366,U+8368-836A,U+836C-836E,U+8378,U+837B-837D,U+8385,U+8392-8393,U+8398,U+839B-839C,U+839E,U+83A0,U+83A8-83AA,U+83B0,U+83B3-83B4,U+83B6,U+83B8,U+83BA,U+83BC,U+83C0-83C1,U+83C5,U+83D4,U+83D6,U+83D8,U+83DD,U+83DF,U+83E1,U+83E5,U+83EA,U+83EF-83F0,U+83F8-83F9,U+83FD,U+8401,U+8403,U+8406,U+840B,U+840F,U+8411,U+8418,U+841C,U+8426,U+8431,U+8438,U+843C,U+8446,U+8449,U+8451,U+8459-845A,U+845C,U+8469,U+846D,U+8473,U+8476,U+8478,U+847A,U+8487-8489,U+848C,U+848E,U+8497,U+84A1,U+84AF,U+84B4,U+84B9-84BA,U+84BD,U+84BF,U+84C1,U+84CA,U+84CD,U+84D0,U+84D3,U+84E0,U+84E3,U+84E5-84E6,U+84EE,U+84F0,U+84FC,U+84FF,U+850C,U+851F,U+8526,U+8535,U+8538-853B,U+8543,U+8548,U+8556,U+8559,U+855E,U+8564,U+8568,U+8572,U+8579-857B,U+8585,U+8587,U+858F,U+859C,U+85A4,U+85A8,U+85AE,U+85B0,U+85B7,U+85B9,U+85C1,U+85D3,U+85DC,U+85FF,U+8605,U+8616,U+8627,U+8629,U+863C,U+864D,U+8654,U+8662,U+866C,U+866E,U+867A-867C,U+867F,U+868B,U+868D,U+8693,U+869D,U+86A3,U+86A7-86AA,U+86AC,U+86AF-86B1,U+86B4-86B6,U+86BA,U+86C4,U+86C9,U+86CE-86D1,U+86D8,U+86DE-86DF,U+86E9,U+86ED,U+86F1-86F4,U+86F8,U+8703,U+8707-870A,U+870D,U+8713,U+871A,U+871E,U+8722-8723,U+8725,U+8729,U+872E,U+8731,U+8734,U+8737,U+873B,U+873E-873F,U+8748,U+874C,U+8753,U+8759,U+8760,U+8763-8765,U+876E,U+8770,U+877B-877E,U+8782-8783,U+8785,U+8788,U+878B,U+8793,U+8797,U+87A2,U+87A8,U+87AB-87AD,U+87AF,U+87B3,U+87B5,U+87BD,U+87C0,U+87C4,U+87C6,U+87CA-87CB,U+87D1-87D3,U+87DB,U+87E0,U+87E5,U+87EA,U+87EE,U+87F7,U+87FE,U+8803,U+880A,U+8813,U+8816,U+881B,U+8821,U+8832,U+8839,U+883C,U+8844,U+8862,U+8864,U+8869,U+886E,U+8872,U+887D-887F,U+8882,U+8885,U+8888,U+88A2,U+88A4,U+88B7,U+88BC,U+88C6,U+88C9,U+88CE,U+88D2,U+88D8,U+88DF,U+88E2-88E3,U+88E5,U+88E8,U+88F0-88F1,U+88FC,U+88FE,U+890A,U+8913,U+8919-891B,U+8921,U+892B,U+8930,U+8934,U+8936,U+8941,U+895E,U+8966,U+897B,U+8983,U+898B,U+899A,U+89C7,U+89CA-89CC,U+89CE-89D1,U+89D6,U+89DA,U+89DC,U+89DE,U+89E5,U+89EB,U+89EF,U+89F3,U+8A07,U+8A3E,U+8A48,U+8AAD,U+8B07,U+8B19,U+8B26,U+8BA0,U+8BA6-8BA7,U+8BAA,U+8BB4-8BB5,U+8BB7,U+8BC2-8BC3,U+8BCB,U+8BCE-8BCF,U+8BD2-8BD4,U+8BD6,U+8BD8-8BD9,U+8BDC,U+8BDF-8BE0,U+8BE4,U+8BE8-8BE9,U+8BEE,U+8BF0,U+8BF3,U+8BF6,U+8BF9,U+8BFC,U+8BFF-8C00,U+8C02,U+8C04,U+8C07,U+8C0C,U+8C0F,U+8C11-8C12,U+8C14-8C16,U+8C18-8C19,U+8C1B,U+8C1D,U+8C1F-8C21,U+8C25,U+8C27,U+8C2A-8C2B,U+8C2E-8C2F,U+8C32-8C33,U+8C35-8C36,U+8C47,U+8C49,U+8C55,U+8C5A,U+8C73,U+8C78,U+8C82,U+8C85,U+8C8A,U+8C94,U+8C98,U+8D32-8D33,U+8D36,U+8D3B,U+8D3D,U+8D40,U+8D45-8D49,U+8D4D,U+8D53,U+8D55,U+8D59,U+8D5C-8D5D,U+8D67,U+8D6D,U+8D73,U+8D84,U+8D91,U+8D94,U+8DB1,U+8DB5,U+8DB8,U+8DBA,U+8DBC,U+8DBF,U+8DC4,U+8DC6,U+8DCE-8DCF,U+8DD6-8DD7,U+8DDA-8DDB,U+8DDE,U+8DE3-8DE4,U+8DEB-8DEC,U+8DF7-8DF9,U+8DFB,U+8DFD,U+8E05,U+8E09,U+8E14,U+8E1D,U+8E1F,U+8E23,U+8E2C,U+8E2E-8E2F,U+8E31,U+8E35,U+8E39-8E3A,U+8E3D,U+8E40-8E42,U+8E47,U+8E49-8E4A,U+8E51-8E52,U+8E59,U+8E69,U+8E6F-8E70,U+8E74,U+8E76,U+8E7C,U+8E85,U+8E8F-8E90,U+8E94,U+8E9C,U+8E9E,U+8ECE,U+8F6B,U+8F6D,U+8F71-8F73,U+8F75-8F7A,U+8F7C,U+8F7E,U+8F81-8F82,U+8F84,U+8F87,U+8F8B,U+8F8D-8F8F,U+8F94,U+8F98,U+8F9A,U+8FB6,U+8FD3,U+8FD5,U+8FE4-8FE6,U+8FE8-8FE9,U+8FEE,U+8FF3,U+9004-9005,U+900B,U+900D,U+9011,U+9016,U+9021,U+9026,U+902D,U+902F,U+9035-9036,U+9044,U+9050-9052,U+9058,U+905B,U+9062,U+9068,U+9074,U+907D,U+9082-9083,U+9088,U+908B,U+9095,U+9097,U+9099,U+909B,U+909D,U+90A1,U+90AC,U+90B0,U+90B3-90B4,U+90B6,U+90B8,U+90BA,U+90BE,U+90C4-90C5,U+90C7,U+90CF-90D0,U+90D3,U+90D7,U+90DB-90DC,U+90E2,U+90E6,U+90EB,U+90EF,U+90FE,U+9104,U+911E,U+9122-9123,U+912F,U+9131,U+9139,U+9143,U+9146,U+914A,U+914E-9150,U+9154,U+9161-9162,U+9164,U+9169,U+916F-9170,U+9172,U+9174,U+9179,U+917D-917E,U+9185,U+918C-918D,U+9190-9191,U+91A2-91A3,U+91AA,U+91AD-91AF,U+91B4-91B5,U+91BA,U+928E,U+92AE,U+92C8,U+933E,U+936A,U+938F,U+93CA,U+93D6,U+943E,U+9451,U+946B,U+9485-9487,U+948A-948D,U+948F-9490,U+9494-9495,U+9497,U+949A-949C,U+94A3-94A4,U+94AA-94AD,U+94AF-94B0,U+94B2,U+94B4,U+94B6-94BA,U+94BC-94BD,U+94BF,U+94C4,U+94C8-94CE,U+94D0-94D2,U+94D5-94D9,U+94DB,U+94DE-94E0,U+94E2,U+94E4-94E5,U+94E7-94EB,U+94EE-94EF,U+94F3-94F5,U+94F7,U+94F9,U+94FC-94FD,U+94FF,U+9502-9503,U+9506-9507,U+9509-950A,U+950D-950F,U+9512-9516,U+9518,U+951B,U+951D-951F,U+9522,U+9529-952C,U+9531-9532,U+9534-9538,U+953A,U+953C,U+953E-953F,U+9542,U+9544-9546,U+9549,U+954C,U+954E-954F,U+9552-9554,U+9556-9559,U+955B,U+955D-955F,U+9561-9562,U+9564-956C,U+956F,U+9571-9573,U+9589,U+958B,U+9598,U+95E9,U+95EB,U+95F1,U+95F3,U+95F5-95F6,U+95FC,U+95FE,U+9603-9604,U+9606,U+9608,U+960A-960D,U+960F,U+9612,U+9615-9617,U+9619-961A,U+961D,U+9621-9622,U+962A,U+9631,U+963C-963D,U+9642,U+9649,U+9654,U+965F,U+9667,U+966C,U+9672,U+9674,U+9688,U+968D,U+9697,U+96B0,U+96B3,U+96B9,U+96BC-96BD,U+96C9-96CA,U+96CE,U+96D2,U+96E0,U+96E9,U+96EF,U+96F3,U+9701,U+9706,U+9708,U+970E-970F,U+9727,U+972A,U+972D,U+9730,U+973E,U+9746,U+9753,U+9765,U+977C,U+9785,U+9791-9792,U+9794,U+97A3,U+97AB,U+97AF,U+97B2,U+97B4,U+97EA-97EC,U+9878,U+987C,U+9880,U+9883,U+9889,U+988C-988D,U+988F,U+9894,U+989A-989B,U+989E-989F,U+98A1-98A2,U+98A5-98A6,U+98A8,U+98D1-98D3,U+98D5,U+98D9-98DA,U+98E7-98E8,U+990D,U+992E,U+9954-9955,U+9963,U+9967-996C,U+9974,U+9977,U+997D,U+9980,U+9984,U+9987,U+998A,U+998D,U+9990-9991,U+9993-9995,U+9997-9998,U+99A5,U+99A8,U+9A75,U+9A77-9A78,U+9A7A,U+9A7D,U+9A7F-9A81,U+9A85,U+9A88,U+9A8A,U+9A90,U+9A92-9A93,U+9A96,U+9A98,U+9A9B-9AA0,U+9AA2-9AA3,U+9AA5,U+9AA7,U+9AB0-9AB1,U+9AB6-9AB7,U+9ABA,U+9ABC,U+9AC0-9AC2,U+9AC5,U+9ACB-9ACC,U+9AD1,U+9ADF,U+9AE1,U+9AE6,U+9AEB,U+9AED,U+9AEF,U+9AF9,U+9AFB,U+9B08,U+9B0F,U+9B13,U+9B1F,U+9B23,U+9B2F,U+9B32,U+9B3B,U+9B43,U+9B45,U+9B47-9B49,U+9B4D,U+9B51,U+9B5A,U+9B9F,U+9C47,U+9C56,U+9C7F,U+9C82,U+9C85-9C88,U+9C8B,U+9C8E,U+9C90-9C92,U+9C94-9C95,U+9C9A-9C9B,U+9C9E-9CA3,U+9CA5-9CA9,U+9CAB,U+9CAD-9CAE,U+9CB0-9CB7,U+9CBA-9CBD,U+9CC4-9CC7,U+9CCA-9CD0,U+9CD3-9CD5,U+9CD7-9CD9,U+9CDC-9CDD,U+9CDF,U+9CE2,U+9CE5,U+9CF4,U+9D12,U+9D3B,U+9D8F,U+9DAF,U+9DBA,U+9DF9,U+9E20,U+9E22,U+9E28-9E2C,U+9E31-9E32,U+9E36-9E3A,U+9E3E,U+9E41-9E42,U+9E44,U+9E46-9E49,U+9E4B-9E4C,U+9E4E,U+9E51,U+9E55,U+9E57-9E58,U+9E5A-9E5C,U+9E5E,U+9E63,U+9E66-9E6D,U+9E71,U+9E73,U+9E7E,U+9E82,U+9E87-9E88,U+9E8B,U+9E92,U+9E9D,U+9E9F,U+9EB4,U+9EB8,U+9EBD-9EBE,U+9EC9,U+9ECF,U+9ED2,U+9EDB-9EDD,U+9EDF-9EE0,U+9EE2,U+9EE5,U+9EE7,U+9EE9-9EEA,U+9EEF,U+9EF9,U+9EFB-9EFC,U+9EFE,U+9F0B,U+9F0D,U+9F10,U+9F17,U+9F19,U+9F22,U+9F2C,U+9F2F,U+9F37,U+9F39,U+9F3D-9F3E,U+9F44,U+9F51,U+9F80,U+9F83,U+9F85-9F8A,U+9F8C,U+9F9B,U+9FA0,U+9FFF";

// src/spring.ts
var STIFFNESS = 338.8;
var DAMPING = 19;
var MASS = 1;
var FRAME_MS = 1e3 / 60;
var MAX_MS = 1500;
var REST_PX = 0.5;
function springFrames(from, to) {
  const omega0 = Math.sqrt(STIFFNESS / MASS);
  const zeta = DAMPING / (2 * Math.sqrt(STIFFNESS * MASS));
  const omega1 = omega0 * Math.sqrt(1 - zeta * zeta);
  const x0 = to - from;
  const values = [];
  let t = 0;
  for (; t <= MAX_MS; t += FRAME_MS) {
    const s = t / 1e3;
    const envelope = Math.exp(-zeta * omega0 * s);
    values.push(to - envelope * (zeta * omega0 * x0 / omega1 * Math.sin(omega1 * s) + x0 * Math.cos(omega1 * s)));
    if (Math.abs(x0) * envelope < REST_PX) break;
  }
  values.push(to);
  return { values, durationMs: Math.min(t, MAX_MS) + FRAME_MS };
}

// src/strings.ts
var zh = {
  symbol: "\u706B",
  symbolLabel: "KITCHEN",
  eyebrow: "\u5C0F\u53A8\u623F",
  cancelled: "\u5173\u706B\u4E86",
  served: (o) => {
    const w = outcomeWord(o);
    return w ? `\u51FA\u9505\u4E86 \xB7 ${w}` : "\u51FA\u9505\u4E86";
  },
  minutes: fmtMinutes,
  footCooking: (start, duration, due) => `${start} \u4E0B\u9505 \xB7 \u505A ${duration} \xB7 ${due} \u51FA\u9505`,
  footServed: (start, duration, due) => `${start} \u4E0B\u9505 \xB7 \u505A\u4E86 ${duration} \xB7 ${due} \u51FA\u9505`,
  footCancelled: (start) => `${start} \u4E0B\u9505 \xB7 \u6CA1\u505A\u5B8C`,
  ariaCooking: (dish, remaining) => `${dish},\u5728\u706B\u4E0A,\u8FD8\u5269 ${remaining}`,
  ariaServed: (dish, served) => `${dish},${served}`,
  ariaCancelled: (dish) => `${dish},\u5173\u706B\u4E86`,
  loadFailed: (kind, status) => `\u53D6\u4E0D\u5230\u8FD9\u4E00\u9505\uFF1A${{
    unreachable: "\u8FDE\u4E0D\u4E0A\u53A8\u623F\u670D\u52A1\u3002",
    blocked: "\u6D4F\u89C8\u5668\u62E6\u4E0B\u4E86\u8FD9\u6B21\u8BFB\u53D6\uFF0C\u53A8\u623F\u670D\u52A1\u7684\u8DE8\u7AD9\u540D\u5355\u91CC\u6CA1\u6709\u8FD9\u4E2A\u9875\u9762\u3002",
    unauthorized: "\u53A8\u623F\u670D\u52A1\u62D2\u7EDD\u4E86\uFF0C\u53E3\u4EE4\u6CA1\u5E26\u6216\u4E0D\u5BF9\u3002",
    not_found: "\u53A8\u623F\u670D\u52A1\u91CC\u6CA1\u6709\u8FD9\u4E00\u9505\u3002",
    server: `\u53A8\u623F\u670D\u52A1\u51FA\u9519\u4E86${status ? `\uFF08\u72B6\u6001\u7801 ${status}\uFF09` : ""}\u3002`,
    bad_response: "\u53A8\u623F\u670D\u52A1\u7684\u56DE\u7B54\u770B\u4E0D\u61C2\u3002"
  }[kind]}`
};
var EN_OUTCOME = { great: "great", ok: null, burnt: "burnt", spoiled: "spoiled" };
var en = {
  symbol: "\u706B",
  symbolLabel: "KITCHEN",
  eyebrow: "KITCHENETTE",
  cancelled: "Heat off",
  served: (o) => {
    const w = o ? EN_OUTCOME[o] : null;
    return w ? `Served \xB7 ${w}` : "Served";
  },
  minutes: (sec) => {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h2 = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h2} h` : `${h2} h ${r} min`;
  },
  footCooking: (start, duration, due) => `On at ${start} \xB7 ${duration} \xB7 ready ${due}`,
  footServed: (start, duration, due) => `On at ${start} \xB7 cooked ${duration} \xB7 served ${due}`,
  footCancelled: (start) => `On at ${start} \xB7 not finished`,
  ariaCooking: (dish, remaining) => `${dish}, on the stove, ${remaining} left`,
  ariaServed: (dish, served) => `${dish}, ${served}`,
  ariaCancelled: (dish) => `${dish}, heat off`,
  loadFailed: (kind, status) => `Can't load this pot: ${{
    unreachable: "the kitchen server can't be reached.",
    blocked: "the browser blocked the request. This page is not on the kitchen server's list of allowed sites.",
    unauthorized: "the kitchen server refused it. The token is missing or wrong.",
    not_found: "the kitchen server has no pot with this id.",
    server: `the kitchen server answered with an error${status ? ` (status ${status})` : ""}.`,
    bad_response: "the kitchen server's answer was not understood."
  }[kind]}`
};
var STRINGS = { zh, en };
function stringsFor(lang) {
  return (lang ?? "").toLowerCase().startsWith("en") ? en : zh;
}

// src/styles.ts
var CARD_CSS = `
:host {
  display: block;
  margin: 8px 0;
  /* Text settings a host page may have set on an ancestor do not leak into the card */
  font-size: 14px; line-height: normal; font-weight: 400; font-style: normal; letter-spacing: normal;
  text-align: left; text-transform: none; text-indent: 0; word-spacing: normal;
  --_paper: var(--kitchenette-paper, #FEFEFD);
  --_ink: var(--kitchenette-ink, #2A3550);
  --_accent: var(--kitchenette-accent, #4159E8);
  --_mute: var(--kitchenette-mute, #5A6377);
  --_hair: var(--kitchenette-hair, rgba(42, 53, 80, 0.22));
  --_shadow: var(--kitchenette-shadow, #394CB3);
  --_offset: var(--kitchenette-shadow-offset, 4px);
  --_serif: var(--kitchenette-font-serif, "Kitchenette Serif", "Songti SC", "Noto Serif SC", serif);
  --_display: var(--kitchenette-font-display, "Kitchenette Bodoni 28", "Bodoni Moda", "Bodoni 72", Didot, serif);
  --_display-small: var(--kitchenette-font-display-small, "Kitchenette Bodoni 11", "Bodoni Moda", "Bodoni 72", Didot, serif);
}
:host([theme="dark"]) {
  --_paper: var(--kitchenette-paper, #111524);
  --_ink: var(--kitchenette-ink, #EDE7D6);
  --_accent: var(--kitchenette-accent, #4159E8);
  --_mute: var(--kitchenette-mute, #A8A795);
  --_hair: var(--kitchenette-hair, rgba(237, 231, 214, 0.2));
  --_shadow: var(--kitchenette-shadow, #7D8BE2);
}
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.stage {
  height: ${STAGE_PX}px;
  width: ${CANVAS_PX}px;
  overflow: hidden;
  margin-left: auto;
  margin-right: 12px;
  pointer-events: none;
}
.canvas { position: relative; width: ${CANVAS_PX}px; height: ${CANVAS_PX}px; }
.canvas img {
  position: absolute; left: 0; top: 0;
  width: ${CANVAS_PX}px; height: ${CANVAS_PX}px;
  object-fit: contain;
  user-select: none; -webkit-user-drag: none;
}
.frame { position: relative; padding-right: var(--_offset); padding-bottom: var(--_offset); }
.frame.dim { opacity: 0.55; }
.shadow { position: absolute; left: var(--_offset); top: var(--_offset); right: 0; bottom: 0; background: var(--_shadow); }
.card {
  position: relative;
  display: flex; flex-direction: row;
  background: var(--_paper);
  border: 1px solid var(--_ink);
}
.sym {
  flex: none; width: 44px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  background: var(--_accent);
  border-right: 1px dashed var(--_paper);
}
.sym-text { color: var(--_paper); font-family: var(--_serif); font-size: 15px; line-height: 18px; }
.sym-en { color: var(--_paper); font-family: var(--_display-small); font-size: 7px; letter-spacing: 1.1px; }
.body { flex: 1; min-width: 0; padding: 8px 11px; }
.top { display: flex; flex-direction: row; align-items: center; gap: 10px; }
.left { flex: 1; min-width: 0; }
.eyebrow { font-family: var(--_serif); font-size: 9.5px; letter-spacing: 1.2px; color: var(--_accent); }
.dish, .note { white-space: pre-wrap; overflow-wrap: anywhere; }
.dish { font-family: var(--_serif); font-size: 14px; line-height: 21px; font-weight: 600; color: var(--_ink); margin-top: 1px; }
.note { font-family: var(--_serif); font-size: 11.5px; line-height: 18px; color: var(--_mute); margin-top: 1px; }
.track { height: 2px; background: var(--_hair); margin-top: 8px; overflow: hidden; }
.fill { height: 2px; background: var(--_accent); }
.foot { font-family: var(--_serif); font-size: 10.5px; line-height: 16px; color: var(--_mute); margin-top: 6px; font-variant-numeric: tabular-nums; }
.right { flex: none; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
.clock { font-family: var(--_display); font-size: 26px; color: var(--_ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.state-word { font-family: var(--_serif); font-size: 12.5px; line-height: 19px; color: var(--_accent); text-align: right; }
/* The pot could not be fetched: the same card, with one line saying so */
.card.failed .dish, .card.failed .right, .card.failed .track, .card.failed .foot { display: none; }
[hidden] { display: none !important; }
`;

// src/element.ts
var TICK_MS = 250;
var CANCEL_POLL_MS = 15e3;
var OUTCOME_POLL_MS = 1500;
var CROSSFADE_MS = 120;
var HIDDEN_Y = STAGE_PX + 8;
var SCRIPT_URL = (typeof document !== "undefined" && document.currentScript) ? document.currentScript.src : (typeof location !== "undefined" ? location.href : "");
var DEFAULT_ASSETS = new URL("../../assets/clawd/", SCRIPT_URL).href;
var DEFAULT_FONTS = new URL("../fonts/", SCRIPT_URL).href;
var DISPLAY_FONTS = [
  ["Kitchenette Bodoni 11", "BodoniModa11pt-Regular.woff2"],
  ["Kitchenette Bodoni 28", "BodoniModa28pt-Regular.woff2"]
];
var SERIF_FAMILY = "Kitchenette Serif";
var SERIF_FONTS = [
  {
    weight: "400",
    file: "NotoSerifSC-Regular",
    local: ["Songti SC Regular", "STSongti-SC-Regular", "NotoSerifSC-Regular", "NotoSerifCJKsc-Regular", "SourceHanSerifSC-Regular"]
  },
  {
    weight: "700",
    file: "NotoSerifSC-Bold",
    local: ["Songti SC Bold", "STSongti-SC-Bold", "NotoSerifSC-Bold", "NotoSerifCJKsc-Bold", "SourceHanSerifSC-Bold"]
  }
];
var fontsLoaded = /* @__PURE__ */ new Set();
function ensureFonts(base) {
  if (fontsLoaded.has(base) || typeof FontFace === "undefined") return;
  fontsLoaded.add(base);
  for (const [family, file] of DISPLAY_FONTS) {
    const face = new FontFace(family, `url("${base}${file}") format("woff2")`, { display: "swap" });
    document.fonts.add(face);
    face.load().catch(() => {
    });
  }
  for (const { weight, file, local } of SERIF_FONTS) {
    const locals = local.map((name) => `local("${name}")`).join(", ");
    const src = (part) => `${locals}, url("${base}${file}.${part}.woff2") format("woff2")`;
    document.fonts.add(new FontFace(SERIF_FAMILY, src("common"), { weight, display: "swap" }));
    document.fonts.add(new FontFace(SERIF_FAMILY, src("rare"), { weight, display: "swap", unicodeRange: SERIF_RARE_RANGE }));
  }
}
var blobs = /* @__PURE__ */ new Map();
var loading = /* @__PURE__ */ new Map();
var broken = /* @__PURE__ */ new Set();
function preload(url) {
  let p = loading.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) {
        broken.add(url);
        return;
      }
      return r.blob().then((b) => {
        blobs.set(url, b);
      });
    }).catch(() => {
    });
    loading.set(url, p);
  }
  return p;
}
var packs = /* @__PURE__ */ new Map();
function imageLoads(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
function checkPack(folder, probeUrl) {
  let pack = packs.get(folder);
  if (!pack) {
    const entry = { state: "checking", ready: Promise.resolve() };
    entry.ready = fetch(probeUrl).then(async (r) => {
      if (r.ok) blobs.set(probeUrl, await r.blob());
      entry.state = r.ok ? "ok" : "missing";
    }).catch(() => imageLoads(probeUrl).then((ok) => void (entry.state = ok ? "ok" : "missing")));
    loading.set(probeUrl, entry.ready);
    packs.set(folder, entry);
    pack = entry;
  }
  return pack;
}
var h = (tag, cls, parent) => {
  const el = document.createElement(tag);
  el.className = cls;
  parent?.appendChild(el);
  return el;
};
var Base = typeof HTMLElement === "undefined" ? class {
} : HTMLElement;
var KitchenetteCookingCard = class extends Base {
  static {
    this.observedAttributes = ["api-base", "session-id", "assets", "fonts", "lang", "timezone"];
  }
  // ── configuration (properties) ──
  #session = null;
  #probe = null;
  #clock = Date.now;
  #manifest = CLAWD_MANIFEST;
  #strings = {};
  // ── state of the current mount ──
  #pot = null;
  #phase = null;
  #segment = null;
  #tick;
  #cancelPoll;
  #outcomePoll;
  #pollKey = "";
  #awaiting = false;
  #loadToken = 0;
  /** Set when the card was asked to fetch its pot and could not */
  #failure = null;
  /** The time zone the backend said its clock times are in ("" = it did not say) */
  #serverTz = "";
  #packWatched = false;
  #preloaded = false;
  // ── sprite ──
  #layers = [];
  #stillImg = null;
  #seat = null;
  #seatWanted = false;
  #offSeatFree = null;
  #slide = null;
  #lastSpritePhase = null;
  #reduced = null;
  // ── DOM ──
  #root;
  #stage;
  #canvas;
  #frame;
  #card;
  #symText;
  #symEn;
  #eyebrow;
  #dish;
  #note;
  #clockEl;
  #stateWord;
  #track;
  #fill;
  #foot;
  #wrap;
  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CARD_CSS;
    this.#root.appendChild(style);
    const wrap = this.#wrap = h("div", "wrap", this.#root);
    wrap.hidden = true;
    this.#stage = h("div", "stage", wrap);
    this.#stage.setAttribute("aria-hidden", "true");
    this.#stage.hidden = true;
    this.#canvas = h("div", "canvas", this.#stage);
    this.#frame = h("div", "frame", wrap);
    h("div", "shadow", this.#frame);
    this.#card = h("div", "card", this.#frame);
    this.#card.setAttribute("role", "group");
    const sym = h("div", "sym", this.#card);
    sym.setAttribute("aria-hidden", "true");
    this.#symText = h("span", "sym-text", sym);
    this.#symEn = h("span", "sym-en", sym);
    const body = h("div", "body", this.#card);
    const top = h("div", "top", body);
    const left = h("div", "left", top);
    this.#eyebrow = h("div", "eyebrow", left);
    this.#dish = h("div", "dish", left);
    this.#note = h("div", "note", left);
    const right = h("div", "right", top);
    this.#clockEl = h("div", "clock", right);
    this.#stateWord = h("div", "state-word", right);
    this.#track = h("div", "track", body);
    this.#fill = h("div", "fill", this.#track);
    this.#foot = h("div", "foot", body);
  }
  // ── public API ──
  /** One pot's data. Assign it directly, or leave it unset and give `api-base` + `session-id` instead. */
  get session() {
    return this.#session;
  }
  set session(s) {
    this.#session = s;
    if (!this.isConnected) return;
    if (s && this.#pot && this.#pot.id === s.id) {
      this.#take(probeFromSession(s));
      this.#render();
    } else this.#mount();
  }
  /**
   * Where the card asks whether the pot was cancelled and how it turned out. Defaults to the backend at
   * `api-base` when that attribute is set; assign your own function to use another transport or local data.
   */
  get probe() {
    return this.#probe;
  }
  set probe(fn) {
    this.#probe = fn;
    this.#pollKey = "";
    if (this.isConnected && this.#pot) this.#render();
  }
  /** The clock the card counts against, in epoch milliseconds. Defaults to Date.now. */
  get clock() {
    return this.#clock;
  }
  set clock(fn) {
    this.#clock = fn;
    if (this.isConnected) this.#mount();
  }
  /** The sprite registry. Defaults to the built-in Clawd pack; assign your own to use another character. */
  get manifest() {
    return this.#manifest;
  }
  set manifest(m) {
    this.#manifest = m;
    if (this.isConnected) this.#mount();
  }
  /** Overrides for any of the words on the card (see strings.ts) */
  get strings() {
    return this.#strings;
  }
  set strings(s) {
    this.#strings = s ?? {};
    if (!this.isConnected) return;
    if (this.#pot) this.#render();
    else this.#renderFailure();
  }
  /** The phase the pot is in right now (null before any data) */
  get phase() {
    return this.#phase;
  }
  /** The sprite segment on stage right now (null when the cook is off stage) */
  get segment() {
    return this.#segment;
  }
  /** The outfit this pot wears */
  get outfit() {
    return this.#pot ? outfitFor(this.#pot.id, this.#manifest.outfits) : null;
  }
  // ── lifecycle ──
  connectedCallback() {
    this.#reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.#reduced?.addEventListener("change", this.#onEnvChange);
    document.addEventListener("visibilitychange", this.#onEnvChange);
    this.#mount();
  }
  disconnectedCallback() {
    this.#reduced?.removeEventListener("change", this.#onEnvChange);
    document.removeEventListener("visibilitychange", this.#onEnvChange);
    this.#unmount();
  }
  attributeChangedCallback(name, old, value) {
    if (old === value || !this.isConnected) return;
    if (name === "lang" || name === "timezone") {
      if (this.#pot) this.#render();
      else if (this.#failure) this.#renderFailure();
    } else this.#mount();
  }
  #onEnvChange = () => {
    if (this.#pot) this.#render();
    else if (this.#failure && document.visibilityState !== "hidden") this.#mount();
  };
  // ── mounting: everything that is decided once per appearance in the document ──
  #unmount() {
    this.#loadToken++;
    clearInterval(this.#tick);
    clearInterval(this.#cancelPoll);
    clearInterval(this.#outcomePoll);
    this.#tick = this.#cancelPoll = this.#outcomePoll = void 0;
    this.#pollKey = "";
    this.#awaiting = false;
    this.#wantSeat(false);
    this.#clearSprite();
    this.#pot = null;
    this.#phase = null;
    this.#segment = null;
    this.#lastSpritePhase = null;
    this.#failure = null;
    this.#serverTz = "";
    this.#packWatched = false;
    this.#preloaded = false;
    this.#card.classList.remove("failed");
  }
  #mount() {
    this.#unmount();
    const fonts = this.getAttribute("fonts");
    if (fonts !== "none") ensureFonts(fonts ? withSlash(new URL(fonts, document.baseURI).href) : DEFAULT_FONTS);
    const s = this.#session;
    if (s) {
      this.#begin(s);
      return;
    }
    const id = this.getAttribute("session-id");
    const probe = this.#activeProbe();
    this.#wrap.hidden = true;
    if (!id || !probe) return;
    const token = this.#loadToken;
    probe(id, true).then((r) => {
      if (token !== this.#loadToken) return;
      if (r.timezone) this.#serverTz = r.timezone;
      if (r.session) this.#begin(r.session);
      else this.#fail(notFound());
    }).catch((e) => {
      if (token === this.#loadToken) this.#fail(asKitchenError(e), e);
    });
  }
  /** The pot could not be fetched: the card stays on the page and says so in one line */
  #fail(failure, cause = failure) {
    this.#failure = failure;
    this.#renderFailure();
    this.dispatchEvent(
      new CustomEvent("kitchenette-error", {
        detail: { kind: failure.kind, status: failure.status, message: failure.message, error: cause }
      })
    );
  }
  #renderFailure() {
    const failure = this.#failure;
    if (!failure) return;
    const t = { ...stringsFor(this.getAttribute("lang")), ...this.#strings };
    const line = t.loadFailed(failure.kind, failure.status);
    this.#stage.hidden = true;
    this.#card.classList.add("failed");
    this.#frame.classList.remove("dim");
    setText(this.#symText, t.symbol);
    setText(this.#symEn, t.symbolLabel);
    setText(this.#eyebrow, t.eyebrow);
    setText(this.#note, line);
    this.#note.hidden = false;
    this.#card.setAttribute("aria-label", line);
    this.#wrap.hidden = false;
  }
  #begin(s) {
    const now = this.#clock();
    this.#pot = {
      id: String(s.id),
      dish: String(s.dish ?? ""),
      note: String(s.note ?? ""),
      startedAt: Number(s.started_at),
      durationSec: Number(s.duration_seconds),
      method: s.method,
      mountedAtMs: now,
      // Read here, recorded later: a pot only counts as seen once its entrance has finished
      firstSeen: isFirstSeen(String(s.id)),
      cancelledSeenAtMs: void 0,
      outcome: void 0
    };
    this.#take(probeFromSession(s));
    this.#wrap.hidden = false;
    this.#render();
    if (this.#phase && phaseIsLive(this.#phase)) this.#tick = setInterval(() => this.#render(), TICK_MS);
  }
  #activeProbe() {
    if (this.#probe) return this.#probe;
    const base = this.getAttribute("api-base");
    if (!base) return null;
    return apiProbe(new URL(base, document.baseURI).href, () => this.getAttribute("token"));
  }
  #take(r) {
    const pot = this.#pot;
    if (r.timezone) this.#serverTz = r.timezone;
    if (!pot) return;
    if (r.status === "cancelled") pot.cancelledSeenAtMs ??= this.#clock();
    else if (r.status === "served") pot.outcome ??= { v: r.outcome, atMs: this.#clock() };
  }
  #check(fresh) {
    const pot = this.#pot;
    const probe = this.#activeProbe();
    if (!pot || !probe) return;
    const token = this.#loadToken;
    probe(pot.id, fresh).then((r) => {
      if (token !== this.#loadToken || this.#pot !== pot) return;
      this.#take(r);
      this.#render();
    }).catch(() => {
    });
  }
  // ── one tick: recompute everything from facts, touch the DOM only where it changed ──
  #facts(pot) {
    return {
      startedAt: pot.startedAt,
      durationSec: pot.durationSec,
      mountedAtMs: pot.mountedAtMs,
      firstSeen: pot.firstSeen,
      cancelledSeenAtMs: pot.cancelledSeenAtMs,
      outcome: pot.outcome?.v ?? null,
      outcomeAtMs: pot.outcome?.atMs
    };
  }
  #render() {
    const pot = this.#pot;
    if (!pot) return;
    const nowMs = this.#clock();
    const facts = this.#facts(pot);
    const phase = kitchenPhase(facts, nowMs);
    this.#phase = phase;
    if (phase !== "enter") markSeen(pot.id);
    const dueMs = (pot.startedAt + pot.durationSec) * 1e3;
    const cancelled = pot.cancelledSeenAtMs !== void 0;
    const visible = document.visibilityState !== "hidden";
    const cooking = !cancelled && nowMs < dueMs;
    const pollKey = `${cooking}|${visible}`;
    if (pollKey !== this.#pollKey) {
      this.#pollKey = pollKey;
      clearInterval(this.#cancelPoll);
      this.#cancelPoll = void 0;
      this.#check(false);
      if (cooking && visible) this.#cancelPoll = setInterval(() => this.#check(false), CANCEL_POLL_MS);
    }
    const awaiting = !cancelled && pot.outcome === void 0 && pot.mountedAtMs < dueMs && nowMs >= dueMs && nowMs < dueMs + OUTCOME_WAIT_MS;
    if (awaiting !== this.#awaiting) {
      this.#awaiting = awaiting;
      clearInterval(this.#outcomePoll);
      this.#outcomePoll = void 0;
      if (awaiting) {
        this.#check(true);
        this.#outcomePoll = setInterval(() => this.#check(true), OUTCOME_POLL_MS);
      }
    }
    const sinceRevealMs = nowMs - revealAtMs(facts);
    const outfit = outfitFor(pot.id, this.#manifest.outfits);
    const segment = cookSegment({
      phase,
      nowMs,
      startedAt: pot.startedAt,
      durationSec: pot.durationSec,
      mountedAtMs: pot.mountedAtMs,
      firstSeen: pot.firstSeen,
      sinceRevealMs,
      outcome: pot.outcome?.v ?? null,
      method: parseMethod(pot.method),
      sessionId: pot.id
    });
    this.#segment = segment;
    this.#renderSprite(phase, outfit, segment, visible);
    const t = { ...stringsFor(this.getAttribute("lang")), ...this.#strings };
    const p = cookProgress(pot.startedAt, pot.durationSec, nowMs);
    const onFire = !cancelled && p.remainingSec > 0;
    const served = t.served(pot.outcome?.v ?? null);
    const tz = pickTimeZone(this.#serverTz, this.getAttribute("timezone"));
    const start = fmtHM(pot.startedAt, tz);
    const due = fmtHM(pot.startedAt + pot.durationSec, tz);
    const duration = t.minutes(pot.durationSec);
    const remaining = fmtRemaining(p.remainingSec);
    setText(this.#symText, t.symbol);
    setText(this.#symEn, t.symbolLabel);
    setText(this.#eyebrow, t.eyebrow);
    setText(this.#dish, pot.dish);
    setText(this.#note, pot.note);
    this.#note.hidden = !pot.note;
    this.#frame.classList.toggle("dim", cancelled);
    this.#clockEl.hidden = !onFire;
    this.#stateWord.hidden = onFire;
    if (onFire) setText(this.#clockEl, remaining);
    else setText(this.#stateWord, cancelled ? t.cancelled : served);
    this.#track.hidden = !onFire;
    if (onFire) this.#fill.style.width = `${Math.round(p.progress * 1e3) / 10}%`;
    setText(
      this.#foot,
      cancelled ? t.footCancelled(start) : onFire ? t.footCooking(start, duration, due) : t.footServed(start, duration, due)
    );
    const label = cancelled ? t.ariaCancelled(pot.dish) : onFire ? t.ariaCooking(pot.dish, remaining) : t.ariaServed(pot.dish, served);
    if (this.#card.getAttribute("aria-label") !== label) this.#card.setAttribute("aria-label", label);
    if (!phaseIsLive(phase)) {
      clearInterval(this.#tick);
      this.#tick = void 0;
    }
  }
  // ── sprite: slide in / out, the cut line, cross-fading between clips ──
  #assetsFolder() {
    const base = this.getAttribute("assets");
    return base ? withSlash(new URL(base, document.baseURI).href) : DEFAULT_ASSETS;
  }
  /** Where a registered file is; null when it is not registered or is known not to exist */
  #assetUrl(key) {
    const file = this.#manifest.files[key];
    if (file === void 0) return null;
    const url = new URL(file, this.#assetsFolder()).href;
    return broken.has(url) ? null : url;
  }
  /**
   * Is the sprite pack there? The first card to ask sends one request for one file; until the answer is
   * in, and for good when the answer is no, nothing else is requested and the stage stays empty.
   */
  #packReady(outfit) {
    const folder = this.#assetsFolder();
    const file = this.#manifest.files[assetKey(outfit, "base")] ?? Object.values(this.#manifest.files)[0];
    if (file === void 0) return false;
    const pack = checkPack(folder, new URL(file, folder).href);
    if (pack.state === "checking" && !this.#packWatched) {
      this.#packWatched = true;
      const token = this.#loadToken;
      void pack.ready.then(() => {
        if (token === this.#loadToken && this.#pot) this.#render();
      });
    }
    if (pack.state === "ok" && !this.#preloaded) {
      this.#preloaded = true;
      this.#preloadPot();
    }
    return pack.state === "ok";
  }
  /** Fetch everything this pot can show, so a new clip is already there when its moment comes */
  #preloadPot() {
    const pot = this.#pot;
    if (!pot) return;
    const outfit = outfitFor(pot.id, this.#manifest.outfits);
    const m = parseMethod(pot.method);
    const segs = ["base", "wash", "chop", ...["main", "wipe", "look", "hot", "taste", "serve", "fail", "serve_last", "fail_last"].map((k) => `${m}_${k}`)];
    for (const s of segs) {
      const url = this.#assetUrl(assetKey(outfit, s));
      if (url) void preload(url);
    }
  }
  #wantSeat(wanted) {
    if (wanted === this.#seatWanted) return;
    this.#seatWanted = wanted;
    if (wanted) {
      const revoke = () => {
        this.#seat = null;
        if (this.#pot) this.#render();
      };
      this.#seat = acquireSeat(revoke);
      this.#offSeatFree = onSeatFree(() => {
        if (this.#seat || !seatFree()) return;
        this.#seat = acquireSeat(revoke);
        if (this.#pot) this.#render();
      });
    } else {
      this.#offSeatFree?.();
      this.#offSeatFree = null;
      if (this.#seat) {
        releaseSeat(this.#seat);
        this.#seat = null;
      }
    }
  }
  #clearSprite() {
    this.#slide?.cancel();
    this.#slide = null;
    for (const l of this.#layers) dropLayer(l);
    this.#layers = [];
    this.#stillImg?.remove();
    this.#stillImg = null;
    this.#canvas.style.transform = "";
    this.#stage.hidden = true;
  }
  #renderSprite(phase, outfit, segment, visible) {
    if (spriteOnStage(phase) && segment && !this.#packReady(outfit)) {
      this.#wantSeat(false);
      this.#clearSprite();
      return;
    }
    const url = segment ? this.#assetUrl(assetKey(outfit, segment)) : null;
    const baseUrl = this.#assetUrl(assetKey(outfit, "base"));
    if (!spriteOnStage(phase) || !segment || !url) {
      this.#wantSeat(false);
      this.#clearSprite();
      this.#lastSpritePhase = phase;
      return;
    }
    const still = !!this.#reduced?.matches || !visible;
    this.#wantSeat(!still);
    this.#stage.hidden = false;
    if (this.#lastSpritePhase !== phase) {
      const first = this.#lastSpritePhase === null;
      this.#lastSpritePhase = phase;
      if (phase === "enter" && first && !still) {
        const frames = springFrames(HIDDEN_Y, 0);
        this.#slide?.cancel();
        this.#canvas.style.transform = "translateY(0px)";
        this.#slide = this.#canvas.animate(
          frames.values.map((y) => ({ transform: `translateY(${y.toFixed(2)}px)` })),
          { duration: frames.durationMs, easing: "linear" }
        );
      } else if (phase === "exit") {
        this.#slide?.cancel();
        this.#canvas.style.transform = `translateY(${HIDDEN_Y}px)`;
        if (!still) {
          this.#slide = this.#canvas.animate(
            [{ transform: "translateY(0px)" }, { transform: `translateY(${HIDDEN_Y}px)` }],
            { duration: EXIT_MS, easing: "cubic-bezier(0.32, 0, 0.67, 0)" }
          );
        }
      }
    }
    const playable = !still && this.#seat !== null;
    if (!playable) {
      for (const l of this.#layers) dropLayer(l);
      this.#layers = [];
      if (!this.#stillImg) {
        this.#stillImg = document.createElement("img");
        this.#stillImg.alt = "";
        this.#stillImg.draggable = false;
        this.#canvas.appendChild(this.#stillImg);
      }
      const src = baseUrl ?? url;
      if (this.#stillImg.dataset.url !== src) {
        this.#stillImg.dataset.url = src;
        this.#stillImg.src = src;
      }
      return;
    }
    this.#stillImg?.remove();
    this.#stillImg = null;
    const top = this.#layers[this.#layers.length - 1];
    if (top && top.url === url) return;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    const blob = blobs.get(url);
    const objectUrl = blob ? URL.createObjectURL(blob) : null;
    if (!objectUrl) {
      img.onerror = () => {
        broken.add(url);
        if (this.#pot) this.#render();
      };
    }
    img.src = objectUrl ?? url;
    const layer = { url, img, objectUrl };
    for (const old of this.#layers.slice(0, -1)) dropLayer(old);
    this.#layers = [...this.#layers.slice(-1), layer];
    this.#canvas.appendChild(img);
    if (this.#layers.length > 1) {
      const fade = img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CROSSFADE_MS, easing: "linear" });
      fade.onfinish = () => {
        if (this.#layers[this.#layers.length - 1] !== layer) return;
        for (const old of this.#layers.slice(0, -1)) dropLayer(old);
        this.#layers = [layer];
      };
    }
  }
};
function dropLayer(l) {
  l.img.remove();
  if (l.objectUrl) URL.revokeObjectURL(l.objectUrl);
}
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function withSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
var TAG = "kitchenette-cooking-card";
function defineCookingCard() {
  if (typeof customElements !== "undefined" && !customElements.get(TAG)) customElements.define(TAG, KitchenetteCookingCard);
}

// src/index.ts
defineCookingCard();
