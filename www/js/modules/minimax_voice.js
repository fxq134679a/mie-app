/* MiniMax 语音合成（TTS）模块
 * 配置存 localStorage（uwu_minimax_voice），含 GroupId / API Key / 声音模型 / 默认音色ID / 每角色音色ID
 * 对外暴露 window.MinimaxVoice
 */
(function () {
    const LS_KEY = 'uwu_minimax_voice';

    function load() {
        try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
    }
    function save(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

    function resolveVoiceId(characterId) {
        const cfg = load();
        return (characterId && cfg.charVoices && cfg.charVoices[characterId]) || cfg.defaultVoiceId || '';
    }

    /* ===== 双引擎：每个角色可选 MiniMax 或 ElevenLabs（默认 MiniMax） ===== */
    function resolveEngine(characterId) {
        const cfg = load();
        return (characterId && cfg.charEngines && cfg.charEngines[characterId] === 'elevenlabs') ? 'elevenlabs' : 'minimax';
    }
    function resolveElVoiceId(characterId) {
        const cfg = load();
        return (characterId && cfg.charElVoices && cfg.charElVoices[characterId]) || cfg.elVoiceId || '';
    }

    /* ===== 语音缓存（IndexedDB 持久化，刷新后仍可播放） ===== */
    const TTS_DB = 'uwu_tts_db';
    const TTS_STORE = 'audio';
    const TTS_LIMIT = 300;

    function openTtsDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(TTS_DB, 2);
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains(TTS_STORE)) {
                    const s = d.createObjectStore(TTS_STORE);
                    s.createIndex('createdAt', 'createdAt');
                }
                if (!d.objectStoreNames.contains('sfx')) {
                    d.createObjectStore('sfx', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /* ===== 自定义音效库（IndexedDB 持久化，每个标记可存多个，播放时随机） ===== */
    async function listSfx(name) {
        try {
            const d = await openTtsDb();
            return await new Promise((resolve) => {
                const req = d.transaction('sfx').objectStore('sfx').getAll();
                req.onsuccess = () => resolve((req.result || []).filter(r => r.name === name));
                req.onerror = () => resolve([]);
            });
        } catch (e) { return []; }
    }
    async function addSfx(name, blob, meta) {
        const m = meta || {};
        const d = await openTtsDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction('sfx', 'readwrite');
            tx.objectStore('sfx').add({ id: 'sfx_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name, blob, builtIn: !!m.builtIn, label: m.label || '', createdAt: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }
    async function delSfx(id) {
        const d = await openTtsDb();
        return new Promise((resolve) => {
            const tx = d.transaction('sfx', 'readwrite');
            tx.objectStore('sfx').delete(id);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    }

    function ttsCacheKey(text, voiceId) {
        return `${voiceId}|${text}`;
    }

    async function getCachedAudio(text, voiceId) {
        try {
            const d = await openTtsDb();
            return await new Promise((resolve) => {
                const r = d.transaction(TTS_STORE).objectStore(TTS_STORE).get(ttsCacheKey(text, voiceId));
                r.onsuccess = () => resolve(r.result ? r.result.blob : null);
                r.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }

    async function putCachedAudio(text, voiceId, blob) {
        try {
            const d = await openTtsDb();
            const tx = d.transaction(TTS_STORE, 'readwrite');
            const store = tx.objectStore(TTS_STORE);
            store.put({ blob, createdAt: Date.now() }, ttsCacheKey(text, voiceId));
            const countReq = store.count();
            countReq.onsuccess = () => {
                if (countReq.result > TTS_LIMIT) {
                    const idx = store.index('createdAt');
                    const cursorReq = idx.openCursor();
                    let toDelete = countReq.result - TTS_LIMIT;
                    cursorReq.onsuccess = (ev) => {
                        const cursor = ev.target.result;
                        if (cursor && toDelete > 0) { cursor.delete(); toDelete--; cursor.continue(); }
                    };
                }
            };
        } catch (e) { /* 缓存失败不影响播放 */ }
    }

    let _captureHook = null;
    function setCaptureHook(fn) { _captureHook = fn; }
    function playBlob(blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        _currentAudio = audio;
        audio.onended = () => { if (_currentAudio === audio) _currentAudio = null; URL.revokeObjectURL(url); };
        if (_captureHook) { try { _captureHook(blob); } catch (e) {} }
        audio.play();
        return audio;
    }

    /* ===== 声音效果标记（亲密音效插播） ===== */
    const SFX_RE = /（(轻喘|吻|水声)）/g;
    /* 内置默认音效：首次使用时自动导入到音效管理，可试听、可删除 */
    const SFX_BUILTIN = [
        { key: 'breath1', name: '轻喘', label: '轻喘 1' },
        { key: 'breath2', name: '轻喘', label: '轻喘 2' },
        { key: 'breath3', name: '轻喘', label: '轻喘 3' },
        { key: 'kiss1', name: '吻', label: '吻 1' },
        { key: 'kiss2', name: '吻', label: '吻 2' },
        { key: 'water1', name: '水声', label: '水声 1' },
        { key: 'water2', name: '水声', label: '水声 2' }
    ];
    function b64ToBlob(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: 'audio/wav' });
    }
    let _sfxSeedP = null;
    function ensureSfxSeeded() {
        if (_sfxSeedP) return _sfxSeedP;
        _sfxSeedP = (async () => {
            try {
                if (localStorage.getItem('uwu_sfx_seeded') === '1') return;
                const data = window.MIE_SFX_DATA || {};
                const byName = {};
                for (const it of SFX_BUILTIN) (byName[it.name] = byName[it.name] || []).push(it);
                for (const name of Object.keys(byName)) {
                    const existing = await listSfx(name);
                    if (existing.length) continue;
                    for (const it of byName[name]) {
                        if (!data[it.key]) continue;
                        await addSfx(name, b64ToBlob(data[it.key]), { builtIn: true, label: it.label });
                    }
                }
                localStorage.setItem('uwu_sfx_seeded', '1');
            } catch (e) { _sfxSeedP = null; }
        })();
        return _sfxSeedP;
    }
    /* 播放一个音效采样，带随机变化：约15%跳过；短采样约40%只播一段（渐出收尾）；
       长采样（>4秒）永远随机截取2~5秒片段（位置随机），避免每次都整段播完 */
    async function playSfx(name) {
        await ensureSfxSeeded();
        const list = await listSfx(name);
        if (!list.length) return null;
        const roll = Math.random();
        if (roll < 0.15) return null;
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        const blob = list[Math.floor(Math.random() * list.length)].blob;
        const audio = new Audio(URL.createObjectURL(blob));
        /* 采样随机放慢一点（最多-3%），听感更自然不重样 */
        audio.playbackRate = 0.97 + Math.random() * 0.03;
        _currentAudio = audio;
        return new Promise(resolve => {
            let settled = false;
            const finish = (ok) => { if (!settled) { settled = true; if (_currentAudio === audio) _currentAudio = null; URL.revokeObjectURL(audio.src); resolve(ok ? audio : null); } };
            audio.onended = () => finish(true);
            audio.onerror = () => finish(false);
            /* 被外部 stop()/暂停时也要结束等待，并广播 ended 让气泡动画复位 */
            audio.onpause = () => { if (!settled) { audio.dispatchEvent(new Event('ended')); finish(true); } };
            audio.play().catch(() => finish(false));
            audio.addEventListener('loadedmetadata', () => {
                if (settled || !isFinite(audio.duration) || !audio.duration) return;
                const dur = audio.duration;
                let cut = 0, start = 0;
                if (dur > 4) {
                    const len = Math.min(dur * 0.6, 2 + Math.random() * 3);
                    start = Math.random() * Math.max(0, dur - len);
                    cut = len;
                } else if (roll < 0.55) {
                    cut = dur * (0.35 + Math.random() * 0.4);
                } else return;
                try { audio.currentTime = start; } catch (e) {}
                setTimeout(() => {
                    if (settled || audio.paused) return;
                    let steps = 0;
                    const fade = setInterval(() => {
                        steps++;
                        audio.volume = Math.max(0, audio.volume - 0.25);
                        if (audio.volume <= 0 || steps > 6) {
                            clearInterval(fade);
                            audio.pause();
                        }
                    }, 12);
                }, cut * 1000);
            });
        });
    }

    /* 水声垫底：真录水声循环铺在语音底下（音量约人声峰下12dB），0.5秒淡入；说完留1秒再1.4秒淡出 */
    let _waterBed = null;
    async function startWaterBed() {
        if (_waterBed) return;
        const list = await listSfx('水声');
        if (!list.length) return;
        const blob = list[Math.floor(Math.random() * list.length)].blob;
        const audio = new Audio(URL.createObjectURL(blob));
        audio.loop = true;
        const target = 0.2 + Math.random() * 0.08;
        _waterBed = { audio, target };
        audio.play().catch(() => {});
        let i = 0;
        const iv = setInterval(() => {
            if (!_waterBed || _waterBed.audio !== audio) { clearInterval(iv); return; }
            i++;
            audio.volume = Math.min(target, audio.volume + target / 10);
            if (i >= 10) clearInterval(iv);
        }, 50);
    }
    function stopWaterBed(fast) {
        if (!_waterBed) return;
        const bed = _waterBed; _waterBed = null;
        const startVol = bed.audio.volume;
        let i = 0;
        const iv = setInterval(() => {
            i++;
            bed.audio.volume = Math.max(0, startVol * (1 - i / 14));
            if (bed.audio.volume <= 0 || i >= 14) {
                clearInterval(iv);
                bed.audio.pause();
                bed.audio.loop = false;
                URL.revokeObjectURL(bed.audio.src);
            }
        }, fast ? 30 : 100);
    }

    /* 把含标记的文本切成段：{type:'tts'|'sfx', text|name} */
    function splitBySfx(text) {
        const segs = [];
        let last = 0, m;
        SFX_RE.lastIndex = 0;
        while ((m = SFX_RE.exec(text))) {
            if (m.index > last) {
                const t = text.slice(last, m.index).trim();
                if (t) segs.push({ type: 'tts', text: t });
            }
            segs.push({ type: 'sfx', name: m[1] });
            last = m.index + m[0].length;
        }
        if (last < text.length) {
            const t = text.slice(last).trim();
            if (t) segs.push({ type: 'tts', text: t });
        }
        if (!segs.length) segs.push({ type: 'tts', text: text });
        return segs;
    }

    /* 顺序播放：文本段 → MiniMax TTS；（吻）（轻喘）→ 音效采样插播；（水声）→ 循环垫底背景音。
       返回最后一段的 audio（保持 ended 事件兼容） */
    let _stopSeq = false;
    async function speakSequence(text, characterId, onSegment) {
        _stopSeq = false;
        const segs = splitBySfx(text);
        let lastAudio = null;
        let hadWater = false;
        for (let i = 0; i < segs.length; i++) {
            if (_stopSeq) break;
            const seg = segs[i];
            const isLast = i === segs.length - 1;
            if (onSegment) onSegment(seg, i, segs);
            if (seg.type === 'sfx') {
                if (seg.name === '水声') { hadWater = true; startWaterBed(); continue; }
                const a = await playSfx(seg.name);
                if (isLast) lastAudio = a;
            } else {
                const a = await speak(seg.text, characterId);
                if (isLast) lastAudio = a;
                else if (a) await new Promise(r => a.addEventListener('ended', r, { once: true }));
            }
        }
        if (hadWater) setTimeout(() => { if (!_stopSeq) stopWaterBed(false); }, 1000);
        return lastAudio;
    }

    async function speak(text, characterId) {
        if (resolveEngine(characterId) === 'elevenlabs') return speakEl(text, characterId);
        const cfg = load();
        if (!cfg.apiKey || !cfg.groupId) throw new Error('请先在设置中配置 MiniMax Group ID 和 API Key');
        const voiceId = resolveVoiceId(characterId);
        if (!voiceId) throw new Error('未设置音色ID，请在语音设置中填写');
        const model = cfg.voiceModel || 'speech-01-turbo';
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        const cached = await getCachedAudio(text, voiceId);
        if (cached) return playBlob(cached);
        const resp = await fetch(`https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(cfg.groupId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
                model: model,
                text: text,
                stream: false,
                voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0 },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
            })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.base_resp && data.base_resp.status_code !== 0) throw new Error(data.base_resp.status_msg || '合成失败');
        if (!data.data || !data.data.audio) throw new Error('未返回音频数据');
        const hex = data.data.audio;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        putCachedAudio(text, voiceId, blob);
        return playBlob(blob);
    }

    /* ElevenLabs 合成：POST /v1/text-to-speech/{voice_id}，返回二进制音频 */
    async function speakEl(text, characterId) {
        const cfg = load();
        if (!cfg.elApiKey) throw new Error('请先在设置中配置 ElevenLabs API Key');
        const voiceId = resolveElVoiceId(characterId);
        if (!voiceId) throw new Error('未设置 ElevenLabs 音色ID，请在语音设置中填写');
        const model = cfg.elModel || 'eleven_multilingual_v2';
        const vs = {
            stability: (typeof cfg.elStability === 'number' ? cfg.elStability : 0.35),
            similarity_boost: 0.8
        };
        if (model.indexOf('eleven_v4') !== 0) vs.style = 0.3;
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }

        // 双耳语音模式
        if (cfg.elBinaural && window.BinauralVoice) {
            return speakElBinaural(text, voiceId, model, vs, cfg.elApiKey);
        }

        const cached = await getCachedAudio('el|' + text, voiceId + '|' + model);
        if (cached) return playBlob(cached);
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': cfg.elApiKey },
            body: JSON.stringify({
                text: text,
                model_id: model,
                voice_settings: vs
            })
        });
        if (!resp.ok) {
            let msg = 'HTTP ' + resp.status;
            try { const j = await resp.json(); if (j.detail && j.detail.message) msg = j.detail.message; } catch (e) {}
            throw new Error('ElevenLabs合成失败：' + msg);
        }
        const blob = await resp.blob();
        if (!blob || !blob.size) throw new Error('ElevenLabs未返回音频');
        putCachedAudio('el|' + text, voiceId + '|' + model, blob);
        return playBlob(blob);
    }

    /* ElevenLabs 双耳语音合成 */
    async function speakElBinaural(text, voiceId, model, vs, apiKey) {
        // 1. 解析位置标签
        const { tts, marks } = window.BinauralVoice.parseTags(text);

        // 2. 使用 /with-timestamps 端点获取音频和时间戳
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=pcm_24000`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
            body: JSON.stringify({
                text: tts,
                model_id: model,
                voice_settings: vs
            })
        });
        if (!resp.ok) {
            let msg = 'HTTP ' + resp.status;
            try { const j = await resp.json(); if (j.detail && j.detail.message) msg = j.detail.message; } catch (e) {}
            throw new Error('ElevenLabs合成失败：' + msg);
        }
        const data = await resp.json();

        // 3. 将标签位置转换为时间戳
        const starts = data.alignment?.character_start_times_seconds || [];
        const cues = marks.map(m => ({
            tag: m.tag,
            t: starts[Math.min(m.at, starts.length - 1)] || 0
        }));

        // 4. 解码 PCM 音频
        const pcmData = base64ToUint8Array(data.audio_base64);
        const sampleRate = 24000;
        const numSamples = pcmData.length / 3; // 24-bit = 3 bytes
        const audioBuffer = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            const b0 = pcmData[i * 3];
            const b1 = pcmData[i * 3 + 1];
            const b2 = pcmData[i * 3 + 2];
            const val = (b0 | (b1 << 8) | (b2 << 16));
            audioBuffer[i] = (val > 0x7fffff ? val - 0x1000000 : val) / 0x7fffff;
        }

        // 5. 应用双耳渲染
        const renderedBuffer = await window.BinauralVoice.renderBinaural(audioBuffer, cues, sampleRate);

        // 6. 转换为 WAV blob 并播放
        const wavBlob = audioBufferToWav(renderedBuffer);
        return playBlob(wavBlob);
    }

    // Base64 解码
    function base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // AudioBuffer 转 WAV
    function audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const headerLength = 44;
        const totalLength = headerLength + dataLength;
        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

        // WAV 头
        writeString(view, 0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        // 音频数据
        const channels = [];
        for (let ch = 0; ch < numChannels; ch++) {
            channels.push(buffer.getChannelData(ch));
        }
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    let _currentAudio = null;
    function stop() {
        _stopSeq = true;
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        stopWaterBed(true);
    }

    // ===== 设置页交互 =====
    function initSettingsUI() {
        const cfg = load();
        const groupEl = document.getElementById('minimax-group-id');
        const keyEl = document.getElementById('minimax-api-key');
        const modelEl = document.getElementById('minimax-voice-model');
        const defaultVoiceEl = document.getElementById('minimax-default-voice-id');
        if (!groupEl) return;
        groupEl.value = cfg.groupId || '';
        keyEl.value = cfg.apiKey || '';
        if (modelEl) modelEl.value = cfg.voiceModel || 'speech-01-turbo';
        if (defaultVoiceEl) defaultVoiceEl.value = cfg.defaultVoiceId || '';

        document.getElementById('minimax-save-btn')?.addEventListener('click', () => {
            const c = load();
            c.groupId = groupEl.value.trim();
            c.apiKey = keyEl.value.trim();
            c.voiceModel = (modelEl ? modelEl.value.trim() : '') || 'speech-01-turbo';
            c.defaultVoiceId = defaultVoiceEl ? defaultVoiceEl.value.trim() : '';
            save(c);
            showToast('语音设置已保存');
        });

        document.getElementById('minimax-char-voice-btn')?.addEventListener('click', openCharVoiceModal);
        document.getElementById('minimax-sfx-btn')?.addEventListener('click', openSfxModal);

        const elKeyEl = document.getElementById('elevenlabs-api-key');
        const elVoiceEl = document.getElementById('elevenlabs-voice-id');
        const elModelEl = document.getElementById('elevenlabs-model');
        const elStabEl = document.getElementById('elevenlabs-stability');
        const elBinauralEl = document.getElementById('elevenlabs-binaural');
        if (elKeyEl) {
            elKeyEl.value = cfg.elApiKey || '';
            if (elVoiceEl) elVoiceEl.value = cfg.elVoiceId || '';
            if (elModelEl) elModelEl.value = cfg.elModel || 'eleven_multilingual_v2';
            if (elStabEl) elStabEl.value = (typeof cfg.elStability === 'number' ? cfg.elStability : 0.35);
            if (elBinauralEl) elBinauralEl.checked = !!cfg.elBinaural;
            document.getElementById('elevenlabs-save-btn')?.addEventListener('click', () => {
                const c = load();
                c.elApiKey = elKeyEl.value.trim();
                c.elVoiceId = elVoiceEl ? elVoiceEl.value.trim() : '';
                c.elModel = elModelEl ? elModelEl.value.trim() : 'eleven_multilingual_v2';
                const st = parseFloat(elStabEl ? elStabEl.value : '0.35');
                c.elStability = isNaN(st) ? 0.35 : Math.min(1, Math.max(0, st));
                c.elBinaural = elBinauralEl ? elBinauralEl.checked : false;
                save(c);
                showToast('ElevenLabs 设置已保存' + (c.elBinaural ? '（双耳语音已开启）' : ''));
            });
        }
    }

    /* ElevenLabs AI 音效生成：POST /v1/sound-generation，返回音频 blob */
    const EL_SFX_PROMPTS = {
        '轻喘': 'A soft gentle female breath, quiet exhale very close to the microphone, intimate, natural, not theatrical',
        '吻': 'A single soft wet kiss sound, short and natural, close up',
        '水声': 'Water bubbling and trickling softly, wet intimate sounds, close up, natural ambience'
    };
    async function genSfxWithElevenLabs(name) {
        const cfg = load();
        if (!cfg.elApiKey) throw new Error('请先在设置中配置 ElevenLabs API Key');
        const resp = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': cfg.elApiKey },
            body: JSON.stringify({ text: EL_SFX_PROMPTS[name] || name, duration_seconds: name === '水声' ? 8 : 2 })
        });
        if (!resp.ok) {
            let msg = 'HTTP ' + resp.status;
            try { const j = await resp.json(); if (j.detail && j.detail.message) msg = j.detail.message; } catch (e) {}
            throw new Error('音效生成失败：' + msg);
        }
        const j = await resp.json();
        if (!j.audio_base64) throw new Error('音效生成未返回音频');
        const bin = atob(j.audio_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: 'audio/mpeg' });
    }

    /* ===== 音效管理弹窗 ===== */
    function openSfxModal() {
        let overlay = document.getElementById('minimax-sfx-modal');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'minimax-sfx-modal';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const SFX_LABELS = { '轻喘': '轻喘', '吻': '吻', '水声': '水声' };
        const escLabel = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        async function render() {
            await ensureSfxSeeded();
            const sections = [];
            for (const key of Object.keys(SFX_LABELS)) {
                const list = await listSfx(key);
                const rows = list.map(item => `
                    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f5faff;border-radius:10px;margin-bottom:6px;">
                        <span style="flex:1;font-size:12px;color:#5f7d99;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.builtIn ? '<b style="font-weight:600;color:#4a7bb5;">内置</b> · ' : ''}${escLabel(item.label || '采样')} · ${new Date(item.createdAt).toLocaleString()}</span>
                        <button type="button" data-sfx-play="${item.id}" style="padding:4px 12px;border-radius:14px;border:1px solid #d3e3f8;background:#fff;color:#1a1a1a;cursor:pointer;font-size:12px;">试听</button>
                        <button type="button" data-sfx-del="${item.id}" style="padding:4px 10px;border-radius:14px;border:1px solid #f3d3d3;background:#fff;color:#c0392b;cursor:pointer;font-size:12px;">删除</button>
                    </div>`).join('');
                sections.push(`
                    <div style="margin-bottom:14px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                            <b style="font-size:13px;color:#1a1a1a;">${SFX_LABELS[key]}</b>
                            <span style="font-size:11px;color:#9ab0c5;">共 ${list.length} 个 · 播放时随机选一个</span>
                        </div>
                        ${rows || '<div style="font-size:12px;color:#b8c9da;padding:2px 0 6px;">暂无音效，可点击下方添加</div>'}
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <label style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:16px;border:1px dashed #b9d4ef;color:#4a7bb5;font-size:12px;cursor:pointer;background:#f0f7ff;">
                                ＋ 添加音效
                                <input type="file" accept="audio/*" multiple data-sfx-add="${key}" style="display:none;">
                            </label>
                            <button type="button" data-sfx-gen="${key}" style="padding:7px 16px;border-radius:16px;border:1px dashed #cdb9ef;color:#7b4ab5;font-size:12px;cursor:pointer;background:#f7f0ff;">⚡ AI生成</button>
                        </div>
                    </div>`);
            }
            overlay.querySelector('#sfx-body').innerHTML = sections.join('');
            overlay.querySelectorAll('[data-sfx-play]').forEach(btn => btn.addEventListener('click', () => {
                const id = btn.dataset.sfxPlay;
                dGetSfx(id).then(rec => { if (rec) playBlob(rec.blob); });
            }));
            overlay.querySelectorAll('[data-sfx-del]').forEach(btn => btn.addEventListener('click', async () => {
                await delSfx(btn.dataset.sfxDel);
                render();
            }));
            overlay.querySelectorAll('[data-sfx-add]').forEach(inp => inp.addEventListener('change', async () => {
                const files = Array.from(inp.files || []);
                for (const f of files) await addSfx(inp.dataset.sfxAdd, f, { label: f.name });
                inp.value = '';
                render();
            }));
            overlay.querySelectorAll('[data-sfx-gen]').forEach(btn => btn.addEventListener('click', async () => {
                const key = btn.dataset.sfxGen;
                btn.disabled = true;
                btn.textContent = '生成中…';
                try {
                    const blob = await genSfxWithElevenLabs(key);
                    await addSfx(key, blob, { label: 'ElevenLabs生成' });
                    showToast('音效已生成');
                } catch (e) {
                    showToast(e.message || '音效生成失败');
                }
                render();
            }));
        }
        overlay.innerHTML = `
            <div style="width:520px;max-width:92%;background:#fff;padding:18px;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,0.12);">
                <h3 style="margin:0 0 6px 0;font-size:16px;color:#1a1a1a;">音效管理</h3>
                <p style="margin:0 0 10px 0;font-size:12px;color:#5f7d99;">语音播放到（轻喘）（吻）（水声）标记处会随机插播一个音效。已内置几个默认音效，可直接试听，不需要的可删除，也可以添加自己的采样。</p>
                <div id="sfx-body" style="max-height:420px;overflow:auto;border:1px solid #eef4fb;border-radius:12px;padding:12px;">加载中…</div>
                <div style="display:flex;justify-content:flex-end;margin-top:14px;">
                    <button type="button" id="sfx-close" style="padding:8px 24px;border-radius:12px;border:1px solid #d3e3f8;background:#fff;color:#1a1a1a;cursor:pointer;">关闭</button>
                </div>
            </div>`;
        overlay.querySelector('#sfx-close').addEventListener('click', () => overlay.remove());
        render();
    }
    async function dGetSfx(id) {
        try {
            const d = await openTtsDb();
            return await new Promise((resolve) => {
                const req = d.transaction('sfx').objectStore('sfx').get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }

    function openCharVoiceModal() {
        const chars = (typeof db !== 'undefined' && db.characters) ? db.characters : [];
        if (!chars.length) return showToast('暂无角色');
        let overlay = document.getElementById('minimax-char-voice-modal');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'minimax-char-voice-modal';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center;';
        const cfg = load();
        const rows = chars.map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f4fa;">
                <img src="${c.avatar || ''}" onerror="this.style.visibility='hidden'" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;min-width:0;font-size:14px;font-weight:600;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name || c.realName || '未命名'}</div>
                        <select data-char-engine="${c.id}" style="padding:4px 6px;border:1px solid #d3e3f8;border-radius:8px;background:#f5faff;font-size:12px;flex-shrink:0;">
                            <option value="minimax" ${(cfg.charEngines && cfg.charEngines[c.id] !== 'elevenlabs') ? 'selected' : ''}>MiniMax</option>
                            <option value="elevenlabs" ${(cfg.charEngines && cfg.charEngines[c.id] === 'elevenlabs') ? 'selected' : ''}>ElevenLabs</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:6px;margin-top:5px;">
                        <input type="text" data-char-voice="${c.id}" value="${(cfg.charVoices && cfg.charVoices[c.id]) || ''}" placeholder="MiniMax音色ID" style="flex:1;min-width:0;padding:5px 8px;border:1px solid #d3e3f8;border-radius:8px;background:#f5faff;font-size:12px;">
                        <input type="text" data-char-elvoice="${c.id}" value="${(cfg.charElVoices && cfg.charElVoices[c.id]) || ''}" placeholder="ElevenLabs音色ID" style="flex:1;min-width:0;padding:5px 8px;border:1px solid #d3e3f8;border-radius:8px;background:#f5faff;font-size:12px;">
                    </div>
                </div>
            </div>`).join('');
        overlay.innerHTML = `
            <div style="width:540px;max-width:92%;background:#fff;padding:18px;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,0.12);">
                <h3 style="margin:0 0 6px 0;font-size:16px;color:#1a1a1a;">角色语音设置</h3>
                <p style="margin:0 0 10px 0;font-size:12px;color:#5f7d99;">给每个角色选语音引擎（MiniMax / ElevenLabs），并填对应的音色ID；不填音色ID时用设置页里的默认音色</p>
                <div style="max-height:380px;overflow:auto;border:1px solid #eef4fb;border-radius:12px;padding:6px 12px;">${rows}</div>
                <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
                    <button type="button" id="mm-cv-clear" style="padding:8px 16px;border-radius:12px;border:1px solid #d3e3f8;background:#fff;color:#1a1a1a;cursor:pointer;">全部清除</button>
                    <button type="button" id="mm-cv-save" style="padding:8px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#e8f1fd,#d6e6fb);color:#1a1a1a;font-weight:600;cursor:pointer;">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#mm-cv-save').addEventListener('click', () => {
            const c = load();
            c.charVoices = c.charVoices || {};
            c.charElVoices = c.charElVoices || {};
            c.charEngines = c.charEngines || {};
            overlay.querySelectorAll('[data-char-voice]').forEach(input => {
                const val = input.value.trim();
                if (val) c.charVoices[input.dataset.charVoice] = val;
                else delete c.charVoices[input.dataset.charVoice];
            });
            overlay.querySelectorAll('[data-char-elvoice]').forEach(input => {
                const val = input.value.trim();
                if (val) c.charElVoices[input.dataset.charElvoice] = val;
                else delete c.charElVoices[input.dataset.charElvoice];
            });
            overlay.querySelectorAll('[data-char-engine]').forEach(sel => {
                if (sel.value === 'elevenlabs') c.charEngines[sel.dataset.charEngine] = 'elevenlabs';
                else delete c.charEngines[sel.dataset.charEngine];
            });
            save(c);
            overlay.remove();
            showToast('角色语音设置已保存');
        });
        overlay.querySelector('#mm-cv-clear').addEventListener('click', () => {
            const c = load();
            delete c.charVoices;
            delete c.charElVoices;
            delete c.charEngines;
            save(c);
            overlay.remove();
            showToast('已清除全部角色语音设置');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettingsUI);
    } else {
        initSettingsUI();
    }

    window.MinimaxVoice = { speak, speakSequence, playSfx, hasSfxMarkers: (t) => { SFX_RE.lastIndex = 0; return SFX_RE.test(String(t)); }, stop, resolveVoiceId, resolveEngine, resolveElVoiceId, load, save, getCachedAudio, putCachedAudio, listSfx, addSfx, delSfx, setCaptureHook };
})();
