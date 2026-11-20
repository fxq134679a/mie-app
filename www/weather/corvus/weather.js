/*!
 * weather.js —— 实时天气 → 特效参数（零依赖、纯前端）
 *
 * 数据源：https://wttr.in/<城市>?format=j1&lang=zh-cn
 *   · wttr.in 允许跨域（Access-Control-Allow-Origin: *），浏览器里可以直接 fetch
 *   · 城市留空 = 按访问者 IP 自动定位
 *   · 查不到返回 null，调用方保持上一次的天气，不要乱跳
 *
 * 用法：
 *   const r = await WeatherFX.fetchWeather('银川');
 *   const plan = WeatherFX.plan(r);
 *   WeatherFX.apply(plan, { sky: skyFrame.contentWindow, fx: fxFrame.contentWindow });
 *
 * 六种状态：clear 晴 / cloudy 多云 / rain 雨 / snow 雪 / storm 雷雨 / fog 雾
 * 小中大三级：precipMM ≥ 4 大雨雪，≥ 0.5 中，其余小
 * （这三级的分法和 Corvus App 里一致。）
 */
(function (root) {
  'use strict';

  const CACHE_KEY = 'weatherfx.last';
  const DEFAULT_TIMEOUT = 10000;

  /* ---------- 抓天气 ---------- */

  async function fetchWeather(city, opts) {
    opts = opts || {};
    const timeout = opts.timeout || DEFAULT_TIMEOUT;
    const q = String(city == null ? '' : city).trim();
    const url = 'https://wttr.in/' + encodeURIComponent(q) + '?format=j1&lang=zh-cn';

    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ac ? setTimeout(function () { ac.abort(); }, timeout) : 0;
    try {
      const res = await fetch(url, {
        signal: ac ? ac.signal : undefined,
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      return parse(await res.json());
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function parse(json) {
    const cur = json && json.current_condition && json.current_condition[0];
    if (!cur) return null;

    const code = parseInt(cur.weatherCode, 10) || 0;
    const desc = pickValue(cur.weatherDesc) || '';
    // wttr 的 lang=zh-cn 会把中文放在 lang_zh-cn；偶尔回落成 lang_xx
    const zh = pickValue(cur['lang_zh-cn']) || pickValue(cur.lang_xx) || '';
    const precip = parseFloat(cur.precipMM) || 0;
    const temp = parseInt(cur.temp_C, 10) || 0;
    const kind = classify(code, zh || desc);

    return {
      kind: kind,
      label: zh || desc || fallbackLabel(kind),
      temp: temp,
      precip: precip,
      level: precip >= 4 ? 3 : precip >= 0.5 ? 2 : 1,   // 3 大 / 2 中 / 1 小
      text: zh || desc
    };
  }

  function pickValue(arr) {
    return arr && arr[0] && arr[0].value ? String(arr[0].value) : '';
  }

  /* ---------- 认字 ----------
     先看文字（中文优先），认不出来再按 WW 天气代码兜底。
     雨夹雪 / 冻雨一律算雪；霾、浮尘算雾。 */
  function classify(code, desc) {
    const d = String(desc || '').toLowerCase();
    if (d.indexOf('雷') >= 0 || d.indexOf('thunder') >= 0 || d.indexOf('storm') >= 0 ||
        d.indexOf('冰雹') >= 0 || d.indexOf('hail') >= 0) return 'storm';
    if (d.indexOf('雪') >= 0 || d.indexOf('snow') >= 0 || d.indexOf('sleet') >= 0 ||
        d.indexOf('冻雨') >= 0 || d.indexOf('icing') >= 0) return 'snow';
    if (d.indexOf('雾') >= 0 || d.indexOf('fog') >= 0 || d.indexOf('mist') >= 0 ||
        d.indexOf('霾') >= 0 || d.indexOf('haze') >= 0) return 'fog';
    if (d.indexOf('雨') >= 0 || d.indexOf('rain') >= 0 || d.indexOf('drizzle') >= 0 ||
        d.indexOf('shower') >= 0) return 'rain';
    if (d.indexOf('阴') >= 0 || d.indexOf('云') >= 0 || d.indexOf('overcast') >= 0 ||
        d.indexOf('cloud') >= 0) return 'cloudy';
    if (d.indexOf('晴') >= 0 || d.indexOf('clear') >= 0 || d.indexOf('sunny') >= 0 ||
        d.indexOf('fair') >= 0) return 'clear';

    const c = Number(code) || 0;
    if (c === 113) return 'clear';
    if (c === 116 || c === 119 || c === 122) return 'cloudy';
    if (c === 143 || c === 248 || c === 260) return 'fog';
    if ([200, 386, 389, 392, 395].indexOf(c) >= 0) return 'storm';
    if ([179, 227, 230, 281, 284, 311, 314, 317, 320, 323, 326, 329, 332, 335, 338,
         350, 362, 365, 368, 371, 374, 377].indexOf(c) >= 0) return 'snow';
    if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].indexOf(c) >= 0) return 'rain';
    return 'cloudy';
  }

  function fallbackLabel(kind) {
    return { clear: '晴', cloudy: '多云', rain: '雨', snow: '雪', storm: '雷雨', fog: '雾' }[kind] || '天气';
  }

  /* ---------- 天气 → 该怎么画 ----------
     返回 { sky: {kind, strength} | null, fx: {effect, count, speed, opacity} | null }
     跟 App 里 withAutoWeather() 用的是同一张表：
       晴 / 多云 / 雷雨 → sky.html 的天空层
       雾              → fx.html 柔雾 60 / 1× / 70
       雨              → fx.html 垂直雨丝 40·65·100 / 0.9× / 100
       雪（小/中）     → fx.html 柔光飘雪 50·70 / 1× / 90
       雪（大）        → fx.html 斜飘雪花 70 / 0.55× / 100 */
  function plan(reading, opts) {
    opts = opts || {};
    const clearStrength  = opts.clearStrength  != null ? opts.clearStrength  : 100;
    const cloudyStrength = opts.cloudyStrength != null ? opts.cloudyStrength : 55;
    const stormStrength  = opts.stormStrength  != null ? opts.stormStrength  : 50;
    if (!reading) return { sky: null, fx: null };

    switch (reading.kind) {
      case 'clear':
        return { sky: { kind: 'clear', strength: clearStrength }, fx: null };
      case 'cloudy':
        return { sky: { kind: 'cloudy', strength: cloudyStrength }, fx: null };
      case 'storm':
        return { sky: { kind: 'storm', strength: stormStrength }, fx: null };
      case 'fog':
        return { sky: null, fx: { effect: 'soft-fog', count: 60, speed: 1, opacity: 70 } };
      case 'rain':
        return {
          sky: null,
          fx: {
            effect: 'rain-streak',
            count: reading.level === 3 ? 100 : reading.level === 2 ? 65 : 40,
            speed: 0.9,
            opacity: 100
          }
        };
      case 'snow':
        if (reading.level >= 3) {
          return { sky: null, fx: { effect: 'slant-snow', count: 70, speed: 0.55, opacity: 100 } };
        }
        return {
          sky: null,
          fx: { effect: 'soft-snow', count: reading.level === 2 ? 70 : 50, speed: 1, opacity: 90 }
        };
      default:
        return { sky: null, fx: null };
    }
  }

  /* ---------- 把 plan 发给两个 iframe ----------
     pages: { sky: iframe.contentWindow, fx: iframe.contentWindow }
     postMessage 不受 file:// 跨源限制，本地双击打开也能用。
     注意 fx 层的显示/隐藏由宿主做（本函数只管参数）：plan.fx 为 null 时宿主把
     雨雪那层收掉，plan.sky 为 null 时把天空层设成 'none'。 */
  function apply(plan, pages) {
    pages = pages || {};
    const skyWin = pages.sky;
    const fxWin = pages.fx;

    if (skyWin) {
      skyWin.postMessage({
        type: 'weather-sky', op: 'setState',
        value: plan && plan.sky ? plan.sky.kind : 'none'
      }, '*');
      if (plan && plan.sky && plan.sky.strength != null) {
        skyWin.postMessage({ type: 'weather-sky', op: 'setStrength', value: plan.sky.strength }, '*');
      }
    }

    if (fxWin && plan && plan.fx) {
      const f = plan.fx;
      fxWin.postMessage({ type: 'weather-fx', op: 'setEffect',  value: f.effect  }, '*');
      fxWin.postMessage({ type: 'weather-fx', op: 'setCount',   value: f.count   }, '*');
      fxWin.postMessage({ type: 'weather-fx', op: 'setSpeed',   value: f.speed   }, '*');
      fxWin.postMessage({ type: 'weather-fx', op: 'setOpacity', value: f.opacity }, '*');
    }
  }

  /* ---------- 自动刷新 ----------
     进页面查一次，之后每 30 分钟一次；失败保留上一次，不把画面清掉。
     const stop = WeatherFX.auto({ city:'银川', onReading: r => console.log(r) });
     stop(); // 停 */
  function auto(options) {
    options = options || {};
    const interval = options.intervalMs || 30 * 60 * 1000;
    let stopped = false;
    let timer = 0;

    async function tick() {
      if (stopped) return;
      const reading = await fetchWeather(options.city, { timeout: options.timeout });
      if (stopped) return;
      if (reading) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(reading)); } catch (_) {}
        if (options.onReading) options.onReading(reading, plan(reading, options));
      } else if (options.onFail) {
        options.onFail();
      }
      timer = setTimeout(tick, interval);
    }

    tick();
    return function stop() { stopped = true; clearTimeout(timer); };
  }

  function loadCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  const api = {
    fetchWeather: fetchWeather,
    classify: classify,
    plan: plan,
    apply: apply,
    auto: auto,
    loadCached: loadCached,
    fallbackLabel: fallbackLabel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WeatherFX = api;
})(typeof window !== 'undefined' ? window : globalThis);
