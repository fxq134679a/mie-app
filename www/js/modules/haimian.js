/* 海绵音乐 · 角色唱歌模块（zk12）
 * 让角色用自己的嗓音翻唱歌曲。全链路照《海绵音乐 AI 翻唱 · 保姆级全代码教程（对外版）》实测逻辑移植：
 *   TTS 合成固定台词 → 上传 VOD → 注册音色(source=2) → 轮询就绪
 *   搜歌(网易云) → by_link 导入 → 拉 LRC 过滤制作名单 → 谱重心算降调 → 三段式 prompt
 *   → 提交翻唱 → 轮询任务 → 下载成品 wav → IndexedDB 存储 → 聊天音乐卡片播放
 * 网络层：设备内走 Capacitor 原生桥 HaimianBridge（海绵不发 CORS 头，浏览器层被拦）；
 *         无桥环境（桌面调试）回退 fetch，拦截时给出明确提示。
 * 配置存 localStorage('uwu_haimian')：cookie / voiceIds(按角色) / voiceGender(按角色)
 * 成品存 IndexedDB('uwu_songs_db' / 'songs')
 * 对外暴露 window.Haimian = { openSongPanel, openSettings, cloneVoice, status }
 */
(function () {
    'use strict';

    const LS_KEY = 'uwu_haimian';
    /* 所有接口 URL 必带的 query string（教程附录 D，照抄别改） */
    const Q = 'app_name=goat&aid=588628&app_id=588628&app_version=1.0.0.1685&channel=online&device_platform=web&region=CN&language=zh';
    const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    /* 音色克隆固定台词（平台声纹校验用，汉字必须一字不差） */
    const CLONE_SCRIPT = '今天天气很好，阳光从窗帘的缝隙里照进来，让整个房间都变得明亮。我准备收拾一下出门，沿着街边慢慢走到附近的咖啡馆，找一个靠窗的位置坐坐。想点一杯热拿铁，再选一块小蛋糕，一边看看路上的行人，一边整理最近的想法。';
    const SONGS_LIMIT = 30; // 成品最多保留条数（wav 体积大，滚动淘汰最旧的）
    const SONG_DB = 'uwu_songs_db';

    function load() {
        try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
    }
    function save(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg || {})); }

    function toast(msg) {
        if (typeof cToast === 'function') { cToast(msg); return; }
        if (typeof showToast === 'function') { showToast(msg); return; }
        console.log('[Haimian] ' + msg);
    }

    /* ================= 网络层：原生桥优先，fetch 兜底 ================= */
    function bridge() {
        const C = window.Capacitor;
        if (C && C.Plugins && C.Plugins.HaimianBridge) return C.Plugins.HaimianBridge;
        return null;
    }
    function hasNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }

    function bytesToB64(u8) {
        let s = '';
        const CH = 0x8000;
        for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        return btoa(s);
    }
    function b64ToBytes(b64) {
        const s = atob(b64);
        const u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        return u8;
    }

    /* 统一请求：返回 {status, text, bytes}
     * opts: headers(obj), body(string|Uint8Array|null), timeout(ms), needBytes(bool)
     * 大文件用 bridge.downloadToFile + readChunk 分块拉回（还能给进度） */
    async function hmReq(method, url, opts) {
        opts = opts || {};
        const headers = Object.assign({ 'User-Agent': UA }, opts.headers || {});
        const br = bridge();
        if (br) {
            const bodyB64 = opts.body == null ? '' : (typeof opts.body === 'string'
                ? bytesToB64(new TextEncoder().encode(opts.body)) : bytesToB64(opts.body));
            if (opts.needBytes && br.downloadToFile) {
                const t0 = Date.now();
                const dl = await br.downloadToFile({
                    method: method, url: url, headers: headers,
                    timeoutMs: opts.timeout || 300000
                });
                if (!dl || dl.status >= 400) {
                    try { await br.removeFile({ path: dl && dl.path }); } catch (e) {}
                    throw new Error('HTTP ' + ((dl && dl.status) || 'error'));
                }
                let u8 = new Uint8Array(dl.size || 0);
                const CH = 2 * 1024 * 1024;
                for (let off = 0; off < (dl.size || 0); off += CH) {
                    const len = Math.min(CH, dl.size - off);
                    const r = await br.readChunk({ path: dl.path, offset: off, length: len });
                    u8.set(b64ToBytes(r.b64), off);
                    if (opts.onProgress) opts.onProgress(Math.min(1, (off + len) / dl.size), Date.now() - t0);
                }
                try { await br.removeFile({ path: dl.path }); } catch (e) {}
                return { status: dl.status, text: '', bytes: u8 };
            }
            const r = await br.request({
                method: method, url: url, headers: headers, bodyB64: bodyB64,
                timeoutMs: opts.timeout || 30000
            });
            if (!r || r.status == null) throw new Error('原生桥无响应');
            return { status: r.status, text: r.bodyText != null ? r.bodyText : (r.bodyB64 ? new TextDecoder().decode(b64ToBytes(r.bodyB64)) : ''), bytes: null };
        }
        /* 无桥回退：浏览器环境（海绵不发 CORS 头，多半会被拦，明确报错引导） */
        const init = { method: method, headers: Object.assign({}, headers) };
        if (opts.body != null) {
            init.body = opts.body instanceof Uint8Array ? opts.body.buffer.slice(opts.body.byteOffset, opts.body.byteOffset + opts.body.byteLength) : opts.body;
            if (opts.body instanceof Uint8Array) init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/octet-stream';
        }
        let resp;
        try {
            resp = await fetch(url, init);
        } catch (e) {
            throw new Error(hasNative()
                ? '网络请求失败：' + e.message
                : '海绵音乐接口被浏览器跨域拦截，需要在 App（原生桥）内使用。桌面端请配置代理或仅做界面调试');
        }
        const text = opts.needBytes ? '' : await resp.text();
        const bytes = opts.needBytes ? new Uint8Array(await resp.arrayBuffer()) : null;
        return { status: resp.status, text: text, bytes: bytes };
    }
    async function hmJson(method, url, opts) {
        const r = await hmReq(method, url, opts);
        let data = null;
        try { data = JSON.parse(r.text); } catch (e) { throw new Error('接口返回非 JSON（HTTP ' + r.status + '）：' + String(r.text).slice(0, 120)); }
        return { status: r.status, data: data };
    }

    /* ================= WebCrypto：AWS4 签名 + CRC32 ================= */
    async function hmac(keyBytes, msg) {
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
        return new Uint8Array(sig);
    }
    async function sha256Hex(bytesOrStr) {
        const bytes = typeof bytesOrStr === 'string' ? new TextEncoder().encode(bytesOrStr) : bytesOrStr;
        const h = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function crc32(u8) {
        let table = crc32._t;
        if (!table) {
            table = crc32._t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                table[n] = c >>> 0;
            }
        }
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
    }
    const QS_SAFE = '!~*()-_.';
    function qsEnc(v) { return encodeURIComponent(String(v)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); }
    async function aws4Sign(method, params, body, tok) {
        body = body || '';
        const canonQs = Object.keys(params).sort().map(k => k + '=' + qsEnc(params[k])).join('&');
        const now = new Date();
        const xdate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const d8 = xdate.slice(0, 8);
        const bh = await sha256Hex(typeof body === 'string' ? body : body);
        const host = 'vod.bytedanceapi.com';
        const hd = { host: host, 'x-amz-content-sha256': bh, 'x-amz-date': xdate, 'x-amz-security-token': tok.st };
        const ks = Object.keys(hd).sort();
        const ch = ks.map(k => k + ':' + hd[k] + '\n').join('');
        const sh = ks.join(';');
        const canon = [method, '/', canonQs, ch, sh, bh].join('\n');
        const scope = d8 + '/cn-north-1/vod/aws4_request';
        const sts = 'AWS4-HMAC-SHA256\n' + xdate + '\n' + scope + '\n' + (await sha256Hex(canon));
        let k = await hmac(new TextEncoder().encode('AWS4' + tok.sk), d8);
        k = await hmac(k, 'cn-north-1'); k = await hmac(k, 'vod'); k = await hmac(k, 'aws4_request');
        const sig = [...await hmac(k, sts)].map(b => b.toString(16).padStart(2, '0')).join('');
        const auth = 'AWS4-HMAC-SHA256 Credential=' + tok.ak + '/' + scope + ', SignedHeaders=' + sh + ', Signature=' + sig;
        return { xdate, auth, bh };
    }
    function signedUrl(params) {
        return 'https://vod.bytedanceapi.com/?' + Object.keys(params).map(k => k + '=' + qsEnc(params[k])).join('&');
    }

    /* ================= 音频处理：解码 → 重采样 → WAV(PCM16 单声道) ================= */
    let _ac = null;
    function audioCtx() {
        if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
        return _ac;
    }
    async function decodeBlob(blob) {
        const ab = await blob.arrayBuffer();
        return await audioCtx().decodeAudioData(ab);
    }
    async function resampleMono(buf, targetRate) {
        const dur = buf.duration;
        const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * targetRate)), targetRate);
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(off.destination);
        src.start();
        const out = await off.startRendering();
        return out.getChannelData(0);
    }
    function encodeWav(f32, rate) {
        const n = f32.length;
        const buf = new ArrayBuffer(44 + n * 2);
        const dv = new DataView(buf);
        const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
        dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
        ws(36, 'data'); dv.setUint32(40, n * 2, true);
        let o = 44;
        for (let i = 0; i < n; i++, o += 2) {
            const v = Math.max(-1, Math.min(1, f32[i]));
            dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
        }
        return new Uint8Array(buf);
    }

    /* TTS 合成台词（复用语音模块的双引擎；返回任意可解码音频 Blob） */
    async function synthScriptAudio(characterId) {
        if (!window.MinimaxVoice || typeof window.MinimaxVoice.synthBytes !== 'function') {
            throw new Error('语音模块未就绪（MinimaxVoice.synthBytes 缺失）');
        }
        return await window.MinimaxVoice.synthBytes(CLONE_SCRIPT, characterId);
    }

    /* ================= 音色克隆（一次性，免费） ================= */
    async function uploadToVod(wavBytes, onStep) {
        onStep = onStep || (() => {});
        onStep('获取上传凭证');
        const r = await hmJson('POST', 'https://www.haimian.com/jd/api/v1/video/get_auth_token?' + Q, {
            headers: { Cookie: load().cookie, 'Content-Type': 'application/json' }, body: '{}'
        });
        if (r.status !== 200 || !r.data || !r.data.data) throw new Error('上传凭证获取失败（多半是 cookie 过期）：' + String(r.text).slice(0, 120));
        const tok = r.data.data;
        const s = Math.random().toString(36).slice(2, 12);
        const ap = { Action: 'ApplyUploadInner', Version: '2020-11-19', SpaceName: 'jd_video_play', FileType: 'video', IsInner: 1, FileSize: wavBytes.length, s: s };
        onStep('申请上传通道');
        const sig = await aws4Sign('GET', ap, '', { ak: tok.access_key, sk: tok.secret_key, st: tok.auth_token });
        const ar = await hmJson('GET', signedUrl(ap), {
            headers: { Authorization: sig.auth, 'X-Amz-Date': sig.xdate, 'x-amz-security-token': tok.auth_token, 'X-Amz-Content-Sha256': sig.bh, Host: 'vod.bytedanceapi.com' }
        });
        const res = ar.data && ar.data.Result;
        if (!res) throw new Error('ApplyUpload 失败：HTTP ' + ar.status);
        let ua = res.UploadAddress || (res.InnerUploadAddress && res.InnerUploadAddress.UploadNodes && res.InnerUploadAddress.UploadNodes[0]) || {};
        if (Array.isArray(ua)) ua = ua[0] || {};
        const vid = ua.Vid || (ua.Vids && ua.Vids[0]) || '';
        let hostTos = Array.isArray(ua.UploadHost) ? ua.UploadHost[0] : ua.UploadHost;
        if (!hostTos) hostTos = 'tos-d-x-hl.snssdk.com';
        const si = ua.StoreInfos && ua.StoreInfos[0];
        if (!si) throw new Error('上传地址解析失败');
        const uri = si.StoreUri, authTos = si.Auth, sessionKey = ua.SessionKey;

        onStep('上传台词音频');
        const initR = await hmReq('POST', 'https://' + hostTos + '/upload/v1/' + uri + '?uploadmode=part&phase=init', {
            headers: { Authorization: authTos, 'X-Storage-U': '', 'Content-Length': '0' }, body: ''
        });
        let uploadId = '';
        try { uploadId = JSON.parse(initR.text).data.uploadid; } catch (e) { throw new Error('上传 init 失败：' + initR.text.slice(0, 120)); }
        const crc = crc32(wavBytes);
        const tr = await hmReq('POST', 'https://' + hostTos + '/upload/v1/' + uri + '?uploadid=' + uploadId + '&phase=transfer&part_number=1', {
            headers: { Authorization: authTos, 'X-Storage-U': '', 'Content-CRC32': crc, 'Content-Type': 'application/octet-stream' },
            body: wavBytes, timeout: 300000
        });
        if (tr.status >= 400 || tr.text.indexOf('Success') < 0) throw new Error('上传 transfer 失败：' + tr.text.slice(0, 160));
        const fin = await hmReq('POST', 'https://' + hostTos + '/upload/v1/' + uri + '?uploadmode=part&phase=finish&uploadid=' + uploadId, {
            headers: { Authorization: authTos, 'X-Storage-U': '', 'Content-Type': 'text/plain;charset=UTF-8' },
            body: '1:' + crc
        });
        if (fin.status >= 400 || fin.text.indexOf('Success') < 0) throw new Error('上传 finish 失败：' + fin.text.slice(0, 160));

        onStep('提交确认');
        const co = { Action: 'CommitUploadInner', Version: '2020-11-19', SpaceName: 'jd_video_play' };
        const body = JSON.stringify({ SessionKey: sessionKey, Functions: [{ name: 'GetMeta' }] });
        const sig2 = await aws4Sign('POST', co, body, { ak: tok.access_key, sk: tok.secret_key, st: tok.auth_token });
        const cr = await hmJson('POST', signedUrl(co), {
            headers: { Authorization: sig2.auth, 'X-Amz-Date': sig2.xdate, 'x-amz-security-token': tok.auth_token, 'X-Amz-Content-Sha256': sig2.bh, 'Content-Type': 'application/json', Host: 'vod.bytedanceapi.com' },
            body: body
        });
        if (cr.status >= 400) throw new Error('Commit 失败：HTTP ' + cr.status);
        return vid;
    }

    async function cloneVoice(characterId, opts) {
        opts = opts || {};
        const cfg = load();
        if (!cfg.cookie) throw new Error('请先在设置里填入海绵音乐 Cookie');
        const chars = (typeof db !== 'undefined' && db.characters) || [];
        const char = chars.find(c => c.id === characterId);
        const charName = char ? (char.realName || char.remarkName || char.name || '我的AI') : '我的AI';
        const onStep = opts.onStep || (() => {});
        onStep('用角色嗓音合成台词（15~30秒干声）');
        const audioBlob = await synthScriptAudio(characterId);
        onStep('转码为单声道 WAV');
        const decoded = await decodeBlob(audioBlob);
        const f32 = await resampleMono(decoded, 32000);
        if (f32.length / 32000 < 14) throw new Error('台词音频太短（' + (f32.length / 32000).toFixed(1) + 's，需要 15~30s），检查 TTS 语速配置');
        if (f32.length / 32000 > 32) throw new Error('台词音频太长（' + (f32.length / 32000).toFixed(1) + 's，需要 15~30s），调快 TTS 语速后重试');
        const wav = encodeWav(f32, 32000);
        const vid = await uploadToVod(wav, onStep);
        onStep('注册音色');
        const reg = await hmJson('POST', 'https://www.haimian.com/jd/api/v1/generate/voice/register?' + Q, {
            headers: { Cookie: cfg.cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ lyrics: CLONE_SCRIPT, vid: vid, source: 2, title: charName })
        });
        if (!reg.data || reg.data.status_code !== 0) throw new Error('音色注册失败：' + String(reg.text).slice(0, 160));
        const voiceId = reg.data.data && reg.data.data.voice_id;
        if (!voiceId) throw new Error('注册成功但未返回 voice_id：' + String(reg.text).slice(0, 160));
        cfg.voiceIds = cfg.voiceIds || {}; cfg.voiceIds[characterId] = String(voiceId);
        if (opts.voiceGender) { cfg.voiceGender = cfg.voiceGender || {}; cfg.voiceGender[characterId] = opts.voiceGender; }
        save(cfg);
        onStep('等待音色训练（约1~2分钟）');
        for (let i = 0; i < 90; i++) {
            await new Promise(r2 => setTimeout(r2, 3000));
            const info = await hmJson('GET', 'https://www.haimian.com/jd/api/v1/generate/voice/info/' + voiceId + '?' + Q, {
                headers: { Cookie: cfg.cookie }, timeout: 15000
            });
            const st = info.data && info.data.data && info.data.data.status;
            if (st === 2) { onStep('音色训练完成'); return String(voiceId); }
            if (st === 3) throw new Error('音色训练失败：检查 TTS 素材（干声？15~30s？台词一字不差？）');
            onStep('训练中…(' + (i + 1) + ')');
        }
        throw new Error('音色训练超时');
    }
    function voiceIdOf(characterId) {
        const cfg = load();
        return (cfg.voiceIds && cfg.voiceIds[characterId]) || '';
    }

    /* ================= 歌曲管线 ================= */
    async function searchSongs(name) {
        const r = await hmJson('GET', 'https://music.163.com/api/search/get/?type=1&s=' + encodeURIComponent(name) + '&limit=8', {
            headers: { Referer: 'https://music.163.com/' }, timeout: 20000
        });
        const songs = (r.data && r.data.result && r.data.result.songs) || [];
        return songs.map(s => ({
            id: s.id, name: s.name,
            artist: (s.artists || []).map(a => a.name).join('/'),
            durationMs: s.duration || 0
        }));
    }
    async function importByLink(songId) {
        const r = await hmJson('POST', 'https://www.haimian.com/jd/api/v1/generate/import_music/by_link?' + Q, {
            headers: { Cookie: load().cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ share_link: 'https://music.163.com/song?id=' + songId })
        });
        if (!r.data || r.data.status_code !== 0) throw new Error('原曲导入失败：' + String(r.text).slice(0, 160));
        const importId = r.data.data && r.data.data.item && r.data.data.item.import_id;
        if (!importId) throw new Error('导入成功但未返回 import_id');
        return importId;
    }
    /* 制作名单过滤正则（不区分大小写，漏一条都会被当成歌词补位） */
    const CREDIT_RE = /作词|作曲|编曲|监制|企划|混音|母带|录音|吉他|贝斯|键盘|鼓|和声|编排|制作|出品|发行|OP\/?SP|幕后的?音乐|字幕组|^by\b|\bby[:：]/i;
    function cleanLrc(raw) {
        return String(raw || '').split(/\r?\n/)
            .filter(l => !/^\[(ti|ar|al|by|offset|au|re|ve):/i.test(l))
            .filter(l => !CREDIT_RE.test(l.replace(/^\[[^\]]*\]\s*/, '')))
            .map(l => l.replace(/ +$/, ''))
            .join('\n').trim();
    }
    async function fetchLrc(songId) {
        const r = await hmJson('GET', 'https://music.163.com/api/song/lyric?id=' + songId + '&lv=1', {
            headers: { Referer: 'https://music.163.com/' }, timeout: 20000
        });
        const lyric = r.data && r.data.lrc && r.data.lrc.lyric;
        if (!lyric) throw new Error('这首歌拿不到歌词（纯音乐或版权限制），换一首吧');
        return cleanLrc(lyric);
    }
    async function downloadOriginal(songId, onProgress) {
        let url = 'https://music.163.com/song/media/outer/url?id=' + songId + '.mp3';
        let r = await hmReq('GET', url, { headers: { Referer: 'https://music.163.com/' }, needBytes: true, timeout: 120000, onProgress });
        if (!r.bytes || r.bytes.length < 200000) {
            url = 'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + songId + '&br=320';
            const g = await hmJson('GET', url, { timeout: 20000 });
            const dl = g.data && (g.data.url || g.data);
            if (typeof dl !== 'string') throw new Error('原曲下载失败（直链不可用）');
            r = await hmReq('GET', dl, { needBytes: true, timeout: 180000, onProgress });
        }
        if (!r.bytes || r.bytes.length < 200000) throw new Error('原曲下载失败（直链 403 或空文件）');
        return r.bytes;
    }
    /* 谱重心计算（FFT 移植自教程 spectral_centroid.py） */
    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const ur = re[i + k], ui = im[i + k];
                    const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                    const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                    re[i + k] = ur + vr; im[i + k] = ui + vi;
                    re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
                    const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
                }
            }
        }
    }
    async function spectralCentroid(bytes, onProgress) {
        const buf = await decodeBlob(new Blob([bytes]));
        const dur = buf.duration;
        const SR = 22050;
        const f32 = await resampleMono(buf, SR);
        const NFFT = 4096, HOP = 2048;
        const win = new Float32Array(NFFT);
        for (let i = 0; i < NFFT; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (NFFT - 1)));
        const freqs = new Float32Array(NFFT / 2 + 1);
        for (let i = 0; i <= NFFT / 2; i++) freqs[i] = i * SR / NFFT;
        const cs = [];
        const total = Math.max(1, (f32.length - NFFT) / HOP | 0);
        const re = new Float32Array(NFFT), im = new Float32Array(NFFT);
        for (let i = 0; i + NFFT <= f32.length; i += HOP) {
            let mean = 0;
            for (let k = 0; k < NFFT; k++) mean += f32[i + k];
            mean /= NFFT;
            for (let k = 0; k < NFFT; k++) { re[k] = (f32[i + k] - mean) * win[k]; im[k] = 0; }
            fft(re, im);
            let s = 0, sw = 0;
            for (let k = 0; k <= NFFT / 2; k++) {
                const fq = freqs[k];
                if (fq < 80 || fq > 2000) continue;
                const p = (re[k] * re[k] + im[k] * im[k]);
                s += p; sw += p * fq;
            }
            if (s > 1e-8) cs.push(sw / s);
            if (onProgress && (i / HOP) % 40 === 0) onProgress(Math.min(1, (i / HOP) / total));
        }
        if (!cs.length) return 0;
        cs.sort((a, b) => a - b);
        return cs[Math.floor(cs.length / 2)];
    }
    function intervalName(n) {
        return { 5: '纯四度', 6: '大三度', 7: '纯五度', 8: '小六度', 9: '小七度', 10: '大七度', 11: '纯八度' }[n] || '';
    }
    /* 降调决策：n<=1 不降；1~4 死区取 7；>=5 按音程名（教程三条规律） */
    function decideTranspose(centroid) {
        if (!centroid || centroid <= 0) return { n: 0 };
        const n = Math.ceil(12 * Math.log2(centroid / 314));
        if (n <= 1) return { n: 0 };
        if (n >= 5) return { n: n, interval: intervalName(n) };
        return { n: 7, interval: '纯五度' };
    }
    function buildPrompt(centroid, origIsFemale, targetGender) {
        const parts = ['改编翻唱，保持原曲旋律、和弦、段落结构和节奏速度，不重新编曲，不改前后奏和间奏。'];
        const origG = origIsFemale ? '女' : '男';
        const tgtG = targetGender === 'female' ? '女' : '男';
        const same = origG === tgtG;
        if (!same) {
            const t = decideTranspose(centroid);
            if (t.n > 0) {
                if (tgtG === 'male') {
                    parts.push('原曲为' + origG + '声演唱，必须将整体调性降低' + t.n + '个半音（' + t.interval + '）至男声舒适音域演唱，不要保持原曲的高音调性，男声自然音域在C2到C4之间，确保人声不偏高不夹嗓，声音出来就是沉稳男声不是' + origG + '声高音。');
                } else {
                    parts.push('原曲为' + origG + '声演唱，必须将整体调性提升' + t.n + '个半音（' + (t.interval || '纯五度') + '）至女声自然音域演唱，不要保持原曲的低音调性，确保人声自然不压嗓不闷，声音出来就是清亮女声不是' + origG + '声低音。');
                }
            }
        }
        parts.push(tgtG === 'male'
            ? '温柔青年男声，音色温暖柔和，气声轻唱贴耳近麦，breathy close-miked，咬字连贯legato，情绪克制细腻，副歌falsetto轻柔过渡不硬顶，混响弱。'
            : '空灵温柔女声，气声轻唱贴耳近麦，breathy close-miked，咬字连贯legato，副歌自然过渡不硬顶，混响弱。');
        parts.push('前奏间奏尾奏保持纯器乐，不要加入人声哼唱呜声或即兴填充。');
        return parts.join('');
    }
    async function submitCover(importId, voiceId, prompt, lyrics, title) {
        const r = await hmJson('POST', 'https://www.haimian.com/jd/api/v1/generate/song_adaptation/create?' + Q, {
            headers: { Cookie: load().cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_item: [{ item: { item_id: importId, item_type: 4 } }],
                voice_id: parseInt(voiceId, 10), /* 必须 int，字符串会 111111 */
                voice_source: 'user_record',
                prompt: prompt, lyrics: lyrics, batch_size: 1, title: title
            })
        });
        if (!r.data || r.data.status_code !== 0) {
            const msg = (r.data && r.data.status_info && r.data.status_info.status_msg) || ('HTTP ' + r.status);
            throw new Error('翻唱提交被拒：' + msg + '（版权歌/特殊字符/违禁词，或换歌重试）');
        }
        const d = r.data.data || {};
        const tasks = d.tasks || [];
        const taskId = (tasks[0] && tasks[0].task_id) || d.task_id;
        if (!taskId) throw new Error('提交成功但未返回 task_id');
        return taskId;
    }
    async function pollTask(taskId, onStep) {
        for (let i = 0; i < 96; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const r = await hmJson('GET', 'https://www.haimian.com/jd/api/v1/generate/task/' + taskId + '?' + Q, {
                headers: { Cookie: load().cookie }, timeout: 15000
            });
            const d = (r.data && r.data.data) || {};
            let payload = {};
            try { payload = JSON.parse(d.payload || '{}'); } catch (e) {}
            if (d.status === 3 || (payload.vid && payload.progress === 100)) {
                if (!payload.vid) throw new Error('任务完成但无 vid：' + String(r.text).slice(0, 160));
                return payload.vid;
            }
            if (d.status === 4 || d.status === 5) throw new Error('翻唱生成失败（status=' + d.status + '），可能是版权或音频指纹问题，换歌重试');
            onStep('生成中… ' + (payload.progress != null ? payload.progress + '%' : ''));
        }
        throw new Error('生成超时（超过8分钟）');
    }
    async function fetchSongUrl(vid) {
        const r = await hmJson('POST', 'https://www.haimian.com/jd/api/v1/video/video_urls/get?' + Q, {
            headers: { Cookie: load().cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ vid: [vid], format_type: 1 })
        });
        const url = r.data && r.data.data && r.data.data.video_urls && r.data.data.video_urls[vid] && r.data.data.video_urls[vid].origin_video_url;
        if (!url) throw new Error('拿不到成品下载地址（URL 可能已过期）');
        return url;
    }

    /* ================= 成品存储（IndexedDB） ================= */
    function openSongsDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(SONG_DB, 1);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('songs')) req.result.createObjectStore('songs', { keyPath: 'id' }); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
    async function saveSong(rec) {
        const d = await openSongsDb();
        const tx = d.transaction('songs', 'readwrite');
        tx.objectStore('songs').put(rec);
        await txDone(tx);
        /* 滚动淘汰最旧的 */
        const tx2 = d.transaction('songs', 'readwrite');
        const store = tx2.objectStore('songs');
        const all = await new Promise(res => { const q = store.getAll(); q.onsuccess = () => res(q.result || []); });
        if (all.length > SONGS_LIMIT) {
            all.sort((a, b) => a.createdAt - b.createdAt);
            for (const old of all.slice(0, all.length - SONGS_LIMIT)) store.delete(old.id);
        }
        await txDone(tx2);
        return rec.id;
    }
    async function getSong(id) {
        const d = await openSongsDb();
        return await new Promise(res => { const q = d.transaction('songs').objectStore('songs').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
    }
    async function deleteSong(id) {
        const d = await openSongsDb();
        const tx = d.transaction('songs', 'readwrite');
        tx.objectStore('songs').delete(id);
        await txDone(tx);
    }

    /* ================= 播放 ================= */
    let _songAudio = null, _songPlayingEl = null;
    async function togglePlay(el) {
        const id = el && el.dataset && el.dataset.song;
        if (!id) return;
        if (_songAudio && _songPlayingEl === el) {
            _songAudio.pause(); _songAudio = null;
            el.classList.remove('playing'); _songPlayingEl = null;
            return;
        }
        if (_songAudio) { _songAudio.pause(); _songAudio = null; if (_songPlayingEl) _songPlayingEl.classList.remove('playing'); }
        const rec = await getSong(id);
        if (!rec || !rec.blob) { toast('歌曲文件不存在或已被清理'); return; }
        const url = URL.createObjectURL(rec.blob);
        _songAudio = new Audio(url);
        _songPlayingEl = el;
        el.classList.add('playing');
        _songAudio.addEventListener('ended', () => { el.classList.remove('playing'); _songAudio = null; _songPlayingEl = null; URL.revokeObjectURL(url); });
        _songAudio.addEventListener('error', () => { el.classList.remove('playing'); _songAudio = null; _songPlayingEl = null; });
        try { await _songAudio.play(); } catch (e) { el.classList.remove('playing'); toast('播放失败：' + e.message); }
    }

    /* ================= 全链路：点一首歌 ================= */
    async function makeSong(env, songInfo, onStep, voiceGender) {
        /* env: {chatId, charId, charName, sendSong(content, song)} 由调用方(C模式)提供 */
        const cfg = load();
        if (!cfg.cookie) throw new Error('请先在设置里填入海绵音乐 Cookie');
        const voiceId = voiceIdOf(env.charId);
        if (!voiceId) await cloneVoice(env.charId, { voiceGender: voiceGender, onStep });
        const vid = voiceIdOf(env.charId);
        if (!vid) throw new Error('音色未就绪');

        if (songInfo.durationMs > 5 * 60 * 1000) throw new Error('这首歌超过 5 分钟（' + Math.round(songInfo.durationMs / 60000) + '分钟），大概率被静默退回，换一首或选短版本');
        onStep('导入原曲');
        const importId = await importByLink(songInfo.id);
        onStep('拉取歌词');
        const lyrics = await fetchLrc(songInfo.id);
        if (lyrics.replace(/\[\d+:\d+(\.\d+)?\]/g, '').trim().length < 20) throw new Error('歌词太短，疑似纯音乐，换一首吧');
        onStep('下载原曲分析音域');
        const origBytes = await downloadOriginal(songInfo.id, p => onStep('下载原曲 ' + Math.round(p * 100) + '%'));
        onStep('计算谱重心（约几秒）');
        const centroid = await spectralCentroid(origBytes, p => onStep('分析音域 ' + Math.round(p * 100) + '%'));
        const gender = voiceGender || (load().voiceGender || {})[env.charId] || 'male';
        const origFemale = centroid >= 380;
        const prompt = buildPrompt(centroid, origFemale, gender);
        onStep('提交翻唱任务');
        const taskId = await submitCover(importId, vid, prompt, lyrics, songInfo.name);
        onStep('等待生成（约2~4分钟，可切去干别的）');
        const songVid = await pollTask(taskId, s => onStep('生成中… ' + s.replace('生成中…', '').trim()));
        onStep('下载成品');
        const url = await fetchSongUrl(songVid);
        const resp = await hmReq('GET', url, { needBytes: true, timeout: 300000, onProgress: p => onStep('下载成品 ' + Math.round(p * 100) + '%') });
        if (!resp.bytes || !resp.bytes.length) throw new Error('成品下载失败（文件为空）');
        onStep('入库');
        const blob = new Blob([resp.bytes], { type: 'audio/wav' });
        let duration = 0;
        try { duration = Math.round((await decodeBlob(blob)).duration); } catch (e) {}
        const songId = 'song_' + Date.now();
        await saveSong({ id: songId, title: songInfo.name, artist: songInfo.artist, charId: env.charId, blob: blob, duration: duration, createdAt: Date.now() });
        const content = '[' + env.charName + '唱的歌：' + songInfo.name + '；id=' + songId + ']';
        env.sendSong(content, { id: songId, title: songInfo.name, duration: duration });
        return songId;
    }

    /* ================= UI：进度浮层 / 点歌面板 / 设置 ================= */
    function ensureOverlay(id) {
        let ov = document.getElementById(id);
        if (ov) ov.remove();
        ov = document.createElement('div');
        ov.id = id;
        ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        return ov;
    }
    function progressOverlay(title) {
        const ov = ensureOverlay('hm-progress');
        ov.innerHTML = '<div style="width:300px;max-width:86%;background:#fff;border-radius:18px;padding:20px;text-align:center;">' +
            '<div style="font-size:15px;color:#1a1a1a;font-weight:bold;margin-bottom:10px;">' + escH(title) + '</div>' +
            '<div id="hm-progress-step" style="font-size:12px;color:#888;">准备中…</div>' +
            '<div style="margin-top:12px;height:4px;background:#eee;border-radius:2px;overflow:hidden;"><div id="hm-progress-bar" style="height:100%;width:8%;background:#1a1a1a;border-radius:2px;transition:width .4s;"></div></div>' +
            '<div style="margin-top:12px;"><button type="button" id="hm-progress-hide" style="font-size:12px;color:#999;background:none;border:none;cursor:pointer;">隐藏（后台继续）</button></div></div>';
        ov.querySelector('#hm-progress-hide').addEventListener('click', () => { ov.style.display = 'none'; });
        return {
            step(t) {
                const el = ov.querySelector('#hm-progress-step');
                if (el) el.textContent = t;
                const bar = ov.querySelector('#hm-progress-bar');
                if (bar) bar.style.width = Math.min(96, parseInt(bar.style.width, 10) + 9) + '%';
            },
            done() { ov.remove(); },
            fail(msg) {
                ov.innerHTML = '<div style="width:320px;max-width:86%;background:#fff;border-radius:18px;padding:20px;">' +
                    '<div style="font-size:15px;color:#c0392b;font-weight:bold;margin-bottom:8px;">失败了</div>' +
                    '<div style="font-size:12px;color:#555;line-height:1.6;">' + escH(msg) + '</div>' +
                    '<div style="text-align:right;margin-top:14px;"><button type="button" id="hm-progress-ok" style="padding:7px 22px;border-radius:12px;border:none;background:#1a1a1a;color:#fff;font-size:13px;cursor:pointer;">知道啦</button></div></div>';
                ov.querySelector('#hm-progress-ok').addEventListener('click', () => ov.remove());
            }
        };
    }
    function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function openSongPanel(env) {
        if (!load().cookie) { openSettings(); return; }
        const ov = ensureOverlay('hm-song-panel');
        ov.innerHTML = '<div style="width:340px;max-width:90%;background:#fff;border-radius:18px;padding:18px;">' +
            '<div style="font-size:16px;font-weight:bold;color:#1a1a1a;margin-bottom:12px;">点一首歌 🎤</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<input id="hm-song-q" type="text" placeholder="歌名（可带歌手）" style="flex:1;border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px;font-size:14px;outline:none;">' +
            '<button id="hm-song-go" style="border:none;background:#1a1a1a;color:#fff;border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;">搜歌</button></div>' +
            '<div id="hm-song-list" style="margin-top:12px;max-height:300px;overflow:auto;font-size:13px;"></div>' +
            '<div style="text-align:right;margin-top:12px;"><button id="hm-song-close" style="font-size:12px;color:#999;background:none;border:none;cursor:pointer;">关闭</button></div></div>';
        ov.querySelector('#hm-song-close').addEventListener('click', () => ov.remove());
        ov.querySelector('#hm-song-go').addEventListener('click', doSearch);
        ov.querySelector('#hm-song-q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
        setTimeout(() => ov.querySelector('#hm-song-q').focus(), 80);
        async function doSearch() {
            const q = ov.querySelector('#hm-song-q').value.trim();
            const listEl = ov.querySelector('#hm-song-list');
            if (!q) return;
            listEl.innerHTML = '<div style="color:#999;padding:8px;">搜索中…</div>';
            try {
                const songs = await searchSongs(q);
                if (!songs.length) { listEl.innerHTML = '<div style="color:#999;padding:8px;">没搜到，换个关键词</div>'; return; }
                listEl.innerHTML = songs.map((s, i) => {
                    const dm = Math.round((s.durationMs || 0) / 1000);
                    return '<div class="hm-song-item" data-i="' + i + '" style="padding:9px 6px;border-bottom:1px solid #f0f0f0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">' +
                        '<div><div style="color:#1a1a1a;">' + escH(s.name) + '</div><div style="font-size:11px;color:#999;margin-top:2px;">' + escH(s.artist) + '</div></div>' +
                        '<div style="font-size:11px;color:#bbb;">' + Math.floor(dm / 60) + ':' + String(dm % 60).padStart(2, '0') + '</div></div>';
                }).join('');
                listEl.querySelectorAll('.hm-song-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const s = songs[parseInt(item.dataset.i, 10)];
                        ov.remove();
                        startSong(env, s);
                    });
                });
            } catch (e) {
                listEl.innerHTML = '<div style="color:#c0392b;padding:8px;">' + escH(e.message) + '</div>';
            }
        }
    }
    function startSong(env, songInfo) {
        const p = progressOverlay('《' + songInfo.name + '》录制中');
        let genFem = (load().voiceGender || {})[env.charId] || 'male';
        p.step('准备…');
        makeSong(env, songInfo, t => p.step(t), genFem)
            .then(() => { p.done(); toast('唱完啦，去聊天里听吧 🎵'); })
            .catch(e => { console.error('[Haimian]', e); p.fail(e.message || String(e)); });
    }

    function openSettings() {
        const cfg = load();
        const ov = ensureOverlay('hm-settings');
        const chars = (typeof db !== 'undefined' && db.characters) || [];
        const native = hasNative() && bridge();
        ov.innerHTML = '<div style="width:380px;max-width:92%;background:#fff;border-radius:18px;padding:18px;max-height:80vh;overflow:auto;">' +
            '<div style="font-size:16px;font-weight:bold;color:#1a1a1a;margin-bottom:4px;">海绵音乐 · 角色唱歌</div>' +
            '<div style="font-size:11px;color:#999;line-height:1.6;margin-bottom:12px;">电脑浏览器登录海绵音乐 → F12 → Network → 任意请求 → 复制整串 Cookie 粘贴到下面（约能用 3 天，过期重新抓）。每天免费额度可唱约 20 首。' +
            (native ? '' : '<b style="color:#c0392b">当前环境无原生桥，接口会被浏览器拦截，请在 App 内使用。</b>') + '</div>' +
            '<textarea id="hm-cookie" placeholder="粘贴完整 Cookie（一行）" style="width:100%;height:70px;border:1px solid #e5e5ea;border-radius:10px;padding:8px;font-size:12px;outline:none;resize:vertical;box-sizing:border-box;"></textarea>' +
            '<div style="text-align:right;margin:8px 0 14px;"><button id="hm-cookie-save" style="border:none;background:#1a1a1a;color:#fff;border-radius:10px;padding:7px 18px;font-size:13px;cursor:pointer;">保存 Cookie</button></div>' +
            '<div style="font-size:13px;font-weight:bold;color:#1a1a1a;margin-bottom:8px;">角色音色（每个角色一次性免费克隆）</div>' +
            '<div id="hm-char-list"></div>' +
            '<div style="text-align:right;margin-top:14px;"><button id="hm-set-close" style="font-size:12px;color:#999;background:none;border:none;cursor:pointer;">关闭</button></div></div>';
        ov.querySelector('#hm-set-close').addEventListener('click', () => ov.remove());
        const ta = ov.querySelector('#hm-cookie');
        ta.value = cfg.cookie || '';
        ov.querySelector('#hm-cookie-save').addEventListener('click', () => {
            const c = load(); c.cookie = ta.value.trim(); save(c);
            toast('Cookie 已保存');
        });
        renderCharList();
        function renderCharList() {
            const c = load();
            const el = ov.querySelector('#hm-char-list');
            if (!chars.length) { el.innerHTML = '<div style="color:#999;font-size:12px;">暂无角色</div>'; return; }
            el.innerHTML = chars.map(ch => {
                const vid = (c.voiceIds || {})[ch.id] || '';
                const g = (c.voiceGender || {})[ch.id] || 'male';
                return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
                    '<div><div style="font-size:13px;color:#1a1a1a;">' + escH(ch.realName || ch.remarkName || ch.name || ch.id) + '</div>' +
                    '<div style="font-size:10px;color:' + (vid ? '#27ae60' : '#bbb') + ';margin-top:2px;">' + (vid ? ('音色已就绪 · ' + (g === 'male' ? '男声' : '女声')) : '未克隆') + '</div></div>' +
                    '<div style="display:flex;gap:6px;align-items:center;">' +
                    '<select data-gsel="' + escH(ch.id) + '" style="border:1px solid #e5e5ea;border-radius:8px;font-size:11px;padding:3px 4px;"><option value="male"' + (g === 'male' ? ' selected' : '') + '>男声</option><option value="female"' + (g === 'female' ? ' selected' : '') + '>女声</option></select>' +
                    '<button data-clone="' + escH(ch.id) + '" style="border:none;background:#1a1a1a;color:#fff;border-radius:9px;padding:5px 12px;font-size:11px;cursor:pointer;">' + (vid ? '重新克隆' : '克隆音色') + '</button></div></div>';
            }).join('');
            el.querySelectorAll('[data-clone]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const cid = btn.dataset.clone;
                    const gsel = el.querySelector('[data-gsel="' + cid + '"]');
                    const gender = gsel ? gsel.value : 'male';
                    const p = progressOverlay('音色克隆');
                    try {
                        await cloneVoice(cid, { voiceGender: gender, onStep: t => p.step(t) });
                        p.done(); toast('音色克隆完成 ✅'); renderCharList();
                    } catch (e) { p.fail(e.message || String(e)); }
                });
            });
        }
    }

    /* ================= 导出 ================= */
    window.Haimian = {
        openSongPanel: openSongPanel,
        openSettings: openSettings,
        cloneVoice: cloneVoice,
        makeSong: makeSong,
        togglePlay: togglePlay,
        getSong: getSong,
        deleteSong: deleteSong,
        voiceIdOf: voiceIdOf,
        hasNative: hasNative
    };

    /* 设置页入口（海绵音乐卡片「设置」按钮） */
    function initEntry() {
        const btn = document.getElementById('haimian-open-settings');
        if (btn) btn.addEventListener('click', openSettings);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEntry);
    else initEntry();
})();
