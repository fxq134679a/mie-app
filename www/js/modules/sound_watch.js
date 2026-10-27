// js/modules/sound_watch.js
// 通话环境音识别：麦克风 → 16kHz 重采样 → YAMNet(tfjs) → 白名单过滤 → 连续两窗确认 → 冷却后回调
// 参考：https://github.com/Aria-duet/ai-hears-your-body
// 模型本地路径 assets/yamnet（model.json + 4 shards，约 15.6MB）

const YAMNET_MODEL_URL = 'assets/yamnet/model.json';
const TFJS_SRC = 'js/lib/tf.min.js';
const SW_SAMPLE_RATE = 16000;
const SW_WINDOW = 15600;   // 0.975s
const SW_MIN_STREAK = 2;   // 连续两窗过门槛才报
const SW_REPORT_GAP = 5000;    // 同名冷却
const SW_CONTINUE_GAP = 20000; // 冷却后再报视为"还在继续"

// YAMNet 类别编号 → 报给TA的名字 + 门槛（编号已对照官方 yamnet_class_map.csv）
const SOUND_WATCH_ENTRIES = [
    { i: 282, name: '水声', t: 0.35 }, { i: 438, name: '水声', t: 0.35 }, { i: 439, name: '水声', t: 0.35 },
    { i: 442, name: '水声', t: 0.35 }, { i: 291, name: '水声', t: 0.35 }, { i: 446, name: '水声', t: 0.35 },
    { i: 364, name: '水声', t: 0.35 },
    { i: 441, name: '黏湿水声', t: 0.28 }, { i: 440, name: '黏湿水声', t: 0.28 },
    { i: 444, name: '细水流声', t: 0.30 }, { i: 443, name: '细水流声', t: 0.30 },
    { i: 368, name: '冲马桶声', t: 0.50 },
    { i: 461, name: '拍打声', t: 0.38 }, { i: 58, name: '拍打声', t: 0.38 }, { i: 454, name: '拍打声', t: 0.38 },
    { i: 466, name: '鞭打声', t: 0.40 },
    { i: 517, name: '震动声', t: 0.38 }, { i: 125, name: '震动声', t: 0.38 }, { i: 370, name: '震动声', t: 0.38 },
    { i: 376, name: '震动声', t: 0.38 }, { i: 490, name: '震动声', t: 0.38 },
    { i: 22, name: '呻吟', t: 0.30 }, { i: 33, name: '呻吟', t: 0.30 },
    { i: 21, name: '呜咽', t: 0.35 },
    { i: 40, name: '喘息', t: 0.35 }, { i: 36, name: '喘息', t: 0.55 },
    { i: 39, name: '倒抽气', t: 0.40 },
    { i: 19, name: '哭声', t: 0.40 },
    { i: 11, name: '尖叫', t: 0.45 }
];
const SOUND_WATCH_MAP = {};
SOUND_WATCH_ENTRIES.forEach(e => { SOUND_WATCH_MAP[e.i] = e; });

const AmbientSoundWatch = {
    active: false,
    paused: false,

    _model: null,
    _ctx: null,
    _src: null,
    _proc: null,
    _buf: null,
    _bufLen: 0,
    _hop: 0,
    _write: 0,
    _filled: 0,
    _pending: 0,
    _busy: false,
    _streakName: null,
    _streak: 0,
    _lastReport: {},
    _onSound: null,

    supported: function() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
            (window.AudioContext || window.webkitAudioContext));
    },

    _loadScript: function(src) {
        return new Promise((resolve, reject) => {
            // 页面里有 AMD loader，tf 的 UMD 会误走 define 分支而不挂到 window，加载期间先屏蔽
            const savedDefine = (typeof window.define === 'function') ? window.define : undefined;
            if (savedDefine) window.define = undefined;
            const restore = () => { if (savedDefine) window.define = savedDefine; };
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => { restore(); resolve(); };
            s.onerror = () => { restore(); reject(new Error('加载失败: ' + src)); };
            document.head.appendChild(s);
        });
    },

    _ensureModel: async function() {
        if (this._model) return;
        if (!window.tf) await this._loadScript(TFJS_SRC);
        this._model = await window.tf.loadGraphModel(YAMNET_MODEL_URL);
        // 预热一次，编译 shader，避免第一次真实推理卡顿
        const warm = this._model.predict(window.tf.zeros([SW_WINDOW]));
        (Array.isArray(warm) ? warm : [warm]).forEach(t => t.dispose());
    },

    start: async function(stream, onSound) {
        if (this.active) return true;
        this._onSound = onSound;
        try {
            await this._ensureModel();
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            if (ctx.state === 'suspended') {
                try { await ctx.resume(); } catch (e) {}
            }
            const src = ctx.createMediaStreamSource(stream);
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            const sink = ctx.createGain();
            sink.gain.value = 0;

            this._bufLen = Math.ceil(ctx.sampleRate * 0.975);
            this._hop = Math.ceil(ctx.sampleRate * 0.5);
            this._buf = new Float32Array(this._bufLen);
            this._write = 0;
            this._filled = 0;
            this._pending = 0;
            this._streakName = null;
            this._streak = 0;
            this._lastReport = {};
            this.paused = false;

            proc.onaudioprocess = (e) => this._onAudio(e.inputBuffer.getChannelData(0));
            src.connect(proc);
            proc.connect(sink);
            sink.connect(ctx.destination);

            this._ctx = ctx;
            this._src = src;
            this._proc = proc;
            this.active = true;
            return true;
        } catch (e) {
            console.warn('环境音识别启动失败:', e);
            this.stop();
            return false;
        }
    },

    stop: function() {
        this.active = false;
        this.paused = false;
        try { if (this._proc) this._proc.disconnect(); } catch (e) {}
        try { if (this._src) this._src.disconnect(); } catch (e) {}
        try { if (this._ctx) this._ctx.close(); } catch (e) {}
        this._proc = null;
        this._src = null;
        this._ctx = null;
        this._buf = null;
        this._onSound = null;
    },

    // TTS 播放期间暂停识别，避免把角色的声音当成用户身边的声音
    pause: function(p) {
        this.paused = !!p;
        if (p) { this._streakName = null; this._streak = 0; }
    },

    // 供测试：直接喂一段 16kHz 波形，返回命中的 {name, score} 或 null
    classifyWave: async function(wave) {
        await this._ensureModel();
        return this._score(wave);
    },

    _onAudio: function(chunk) {
        if (!this.active) return;
        for (let i = 0; i < chunk.length; i++) {
            this._buf[this._write] = chunk[i];
            this._write = (this._write + 1) % this._bufLen;
        }
        this._filled = Math.min(this._filled + chunk.length, this._bufLen);
        this._pending += chunk.length;
        if (this._pending >= this._hop && !this._busy && !this.paused) {
            this._pending = 0;
            this._classify();
        }
    },

    _ringToWave: function() {
        const wave = new Float32Array(SW_WINDOW);
        const readStart = (this._write - this._filled + this._bufLen) % this._bufLen;
        for (let i = 0; i < SW_WINDOW; i++) {
            const pos = i / (SW_WINDOW - 1) * (this._filled - 1);
            const i0 = Math.floor(pos);
            const frac = pos - i0;
            const a = this._buf[(readStart + i0) % this._bufLen];
            const b = this._buf[(readStart + Math.min(i0 + 1, this._filled - 1)) % this._bufLen];
            wave[i] = a + (b - a) * frac;
        }
        return wave;
    },

    _score: async function(wave) {
        const input = window.tf.tensor1d(wave);
        let best = null;
        try {
            const out = this._model.predict(input);
            const scores = Array.isArray(out) ? out[0] : out;
            const data = await scores.data();
            const frames = scores.shape[0] || 1;
            const maxScore = {};
            for (let f = 0; f < frames; f++) {
                for (const idxStr in SOUND_WATCH_MAP) {
                    const idx = +idxStr;
                    const v = data[f * 521 + idx];
                    if (v > (maxScore[idx] || 0)) maxScore[idx] = v;
                }
            }
            for (const idxStr in maxScore) {
                const idx = +idxStr;
                const entry = SOUND_WATCH_MAP[idx];
                if (maxScore[idx] >= entry.t && (!best || maxScore[idx] > best.score)) {
                    best = { name: entry.name, score: maxScore[idx] };
                }
            }
            (Array.isArray(out) ? out : [out]).forEach(t => { if (t !== scores) t.dispose(); });
            scores.dispose();
        } finally {
            input.dispose();
        }
        return best;
    },

    _classify: async function() {
        if (this._busy || !this._buf) return;
        this._busy = true;
        try {
            const wave = this._ringToWave();
            const best = await this._score(wave);
            if (!this.active) return;
            if (best && best.name === this._streakName) this._streak++;
            else { this._streakName = best ? best.name : null; this._streak = best ? 1 : 0; }

            if (best && this._streak >= SW_MIN_STREAK) {
                const now = Date.now();
                const last = this._lastReport[best.name] || 0;
                if (now - last >= SW_REPORT_GAP) {
                    const continuing = last > 0 && (now - last) < SW_CONTINUE_GAP;
                    this._lastReport[best.name] = now;
                    if (this._onSound) {
                        try { this._onSound(best.name, continuing); } catch (e) {}
                    }
                }
            }
        } catch (e) {
            console.warn('环境音识别出错:', e);
        } finally {
            this._busy = false;
        }
    }
};

window.AmbientSoundWatch = AmbientSoundWatch;
