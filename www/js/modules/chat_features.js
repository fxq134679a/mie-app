// --- 聊天辅助功能模块 ---

// 语音输入系统（Web Speech API）
function setupVoiceMessageSystem() {
    const voiceMessageBtn = document.getElementById('voice-message-btn');
    const sendVoiceModal = document.getElementById('send-voice-modal');
    const voiceMicBtn = document.getElementById('voice-mic-btn');
    const voiceCloseBtn = document.getElementById('voice-close-btn');
    const voiceSettingsBtn = document.getElementById('voice-settings-btn');
    const voiceSettingsPopup = document.getElementById('voice-settings-popup');
    const voiceLangBtn = document.getElementById('voice-lang-btn');
    const voiceLangCurrent = document.getElementById('voice-lang-current');
    const voiceLangList = document.getElementById('voice-lang-list');
    const voiceAutostartToggle = document.getElementById('voice-autostart-toggle');
    const transcriptArea = document.getElementById('voice-transcript-area');
    const transcriptText = document.getElementById('voice-transcript-text');
    const transcriptPlaceholder = document.getElementById('voice-transcript-placeholder');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    // iPhone / iPad（含 WKWebView 壳）：实时识别的行为与桌面差异很大，单独处理
    const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let recognition = null;      // 当前实时识别实例（每次录音都新建，避免复用坏实例）
    let recogSession = 0;        // 会话号：旧实例的回调全部作废，防止串台
    let speechBroken = false;    // 有 API 但启动失败过（iOS 常见）→ 后续直接走「录音 → API 转写」
    let startWatchdog = null;    // start() 之后迟迟没有 onstart 的看门狗
    let recogStarted = false;
    let captureMode = '';        // 'speech'（实时识别）/ 'audio'（MediaRecorder 录音）
    let isRecording = false;
    let inputMode = localStorage.getItem('voice_input_mode') || 'voice';
    let currentLang = localStorage.getItem('voice_lang') || 'zh-CN';
    let isAutoStart = localStorage.getItem('voice_auto_start') === 'true';
    let finalTranscript = '';
    let pressTimer = null;
    let isPressing = false;
    // 原声模式：真实录音（MediaRecorder）
    let mediaStream = null, mediaRecorder = null, audioChunks = [];
    let recStartedAt = 0, recTimerInt = null, recDiscard = false, recMaxTimer = null;
    let lastAudioCapture = null; // stopRecording(false) 后存放 { dataUrl, blob, duration }
    let fallbackCapture = false; // 无实时识别环境（WKWebView/IPA）：录音后走 API 转写
    let pendingStream = null, pendingStreamPromise = null, micDiag = '', warmLeakTimer = null; // 手势内预热的麦克风流 / 最近一次失败原因

    // 麦克风错误 → 用户能看懂的指引（IPA 里最常见是 iOS 设置里权限被关）
    function micErrText(err) {
        const n = (err && err.name) || '';
        if (n === 'NotAllowedError' || n === 'SecurityError')
            return '麦克风权限被拒绝：请到 iOS 设置 → 隐私与安全性 → 麦克风，允许「章鱼喷墨机」';
        if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return '找不到可用的麦克风';
        if (n === 'NotReadableError') return '麦克风被其他应用占用，关掉后再试';
        return (err && err.message) ? err.message : '无法访问麦克风';
    }

    // 给 getUserMedia 之类的 Promise 加超时：WKWebView 里权限弹窗/代理缺失时它可能永远不 resolve，
    // 那样用户点完按钮就完全没反应（原来就是这么卡的）。
    function withTimeout(promise, ms, msg) {
        return new Promise((resolve, reject) => {
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                reject(new Error(msg));
            }, ms);
            promise.then(
                v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
                e => { if (!done) { done = true; clearTimeout(timer); reject(e); } }
            );
        });
    }

    // iOS 必须在用户手势链里调 getUserMedia 才会弹系统授权（setTimeout 后调用会静默拒绝）。
    // 所以 touchstart 一进来就发起请求；正式录音复用这一次请求——绝对不能并发第二个
    // getUserMedia（WKWebView 对并发采集请求会卡死/拒绝）。
    function warmUpMic() {
        if (pendingStream || pendingStreamPromise || isRecording) return;
        // 语音模式的实时识别自己独占麦克风：iOS 上先 getUserMedia 再 start() 会让识别起不来。
        // 原声模式仍然需要这次手势内预热（MediaRecorder 要用）。
        if (inputMode !== 'raw' && canUseSpeech()) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            micDiag = '此环境没有麦克风接口（IPA 需要更新壳工程）';
            return;
        }
        pendingStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true })
            .then(s => { pendingStream = s; micDiag = ''; return s; })
            .catch(err => {
                pendingStreamPromise = null;
                micDiag = micErrText(err);
                throw err;
            });
        pendingStreamPromise.catch(() => {}); // 防止无人接住时刷 unhandled rejection
        // 预热了但没开始录音（点按取消等）：5 秒后还流，别占着麦克风
        clearTimeout(warmLeakTimer);
        warmLeakTimer = setTimeout(() => {
            if (pendingStream && !isRecording) {
                pendingStream.getTracks().forEach(t => t.stop());
                pendingStream = null;
            }
        }, 5000);
    }

    const langNames = {
        'zh-CN': '普通话（简体）', 'zh-TW': '普通话（繁体）',
        'en-US': 'English (US)', 'en-GB': 'English (UK)',
        'ja-JP': '日本語', 'ko-KR': '한국어',
        'fr-FR': 'Français', 'de-DE': 'Deutsch'
    };

    // 实时识别当前是否可用（API 存在，且没有在 iOS 上失败过）
    function canUseSpeech() {
        return !!(SpeechRecognition && !speechBroken);
    }

    function speechErrorText(code) {
        switch (code) {
            case 'not-allowed':
            case 'service-not-allowed':
                return '无法使用语音识别：请到 iOS 设置 → 隐私与安全性 → 麦克风，允许「章鱼喷墨机」；再到 设置 → 通用 → 键盘 → 启用听写 打开后重试';
            case 'audio-capture':
                return '麦克风被占用或不可用，请关掉其他录音/通话应用后重试';
            case 'network':
                return '语音识别需要网络连接';
            case 'language-not-supported':
                return '当前识别语言不可用，请在设置里换一种语言';
            default:
                return '语音识别出错（' + (code || '未知') + '）';
        }
    }

    function setPlaceholder(text) {
        transcriptPlaceholder.textContent = text;
        transcriptPlaceholder.style.display = '';
    }

    function resetPlaceholder() {
        if (transcriptText.innerHTML) return;
        setPlaceholder(inputMode === 'raw' ? '按住说话，发送原声语音' : '请说话……');
    }

    // 硬结束：立刻丢弃这个识别实例（降级、关闭弹窗时用）
    function killRecognition() {
        clearTimeout(startWatchdog);
        startWatchdog = null;
        recogStarted = false;
        const r = recognition;
        recognition = null;
        recogSession++; // 旧实例的回调全部作废
        if (!r) return;
        try { r.onstart = r.onresult = r.onerror = r.onend = null; } catch (e) {}
        try { if (typeof r.abort === 'function') r.abort(); else r.stop(); } catch (e) {}
    }

    // 软结束：保留 onresult 收尾（iOS 最后一次 final 结果常在 stop 之后才到），1 秒后彻底丢弃
    function stopRecognitionSoft() {
        clearTimeout(startWatchdog);
        startWatchdog = null;
        recogStarted = false;
        const r = recognition;
        recognition = null;
        if (!r) return;
        try { r.onstart = r.onerror = null; } catch (e) {}
        try { r.stop(); } catch (e) {}
        setTimeout(() => {
            try { r.onresult = null; r.onend = null; } catch (e) {}
            try { if (typeof r.abort === 'function') r.abort(); } catch (e) {}
        }, 1000);
    }

    // 从实时识别降级为「录音 → API 转写」；录音链路已经在跑就不重复开
    function switchToAudioCapture() {
        killRecognition();
        if (!isRecording || mediaRecorder) return;
        captureMode = 'audio';
        fallbackCapture = true;
        voiceMicBtn.classList.add('recording');
        sendVoiceModal.classList.add('recording-active');
        setPlaceholder('录音中…再说一次就结束');
        startAudioCapture().catch(err => {
            showToast('录音失败：' + ((err && err.message) ? err.message : '无法访问麦克风'), 5000);
            stopRecording();
        });
    }

    // 启动实时识别。secondary=true：原声模式边录音边识别，只攒文字，不接管界面。
    // 返回 false 表示这次没起来（调用方直接走录音转写），保证不会静默无反应。
    function beginSpeechRecognition(secondary) {
        killRecognition();
        const session = recogSession;
        recogStarted = false;
        let r;
        try {
            r = new SpeechRecognition();
        } catch (e) {
            return false;
        }
        recognition = r;
        r.continuous = true;
        r.interimResults = true;
        r.lang = currentLang;

        r.onstart = () => {
            if (session !== recogSession) return;
            recogStarted = true;
            clearTimeout(startWatchdog);
            startWatchdog = null;
            if (secondary) return;
            captureMode = 'speech';
            voiceMicBtn.classList.add('recording');
            sendVoiceModal.classList.add('recording-active');
            setPlaceholder('请说话……');
            closeSettingsPopup();
        };

        r.onresult = (event) => {
            if (session !== recogSession) return;
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += t;
                } else {
                    interim += t;
                }
            }
            if (secondary || inputMode === 'raw') return; // 原声模式：识别只给 AI 用，不显示文字
            const full = finalTranscript + interim;
            transcriptText.innerHTML = finalTranscript + (interim ? '<span class="interim">' + interim + '</span>' : '');
            if (full) {
                transcriptArea.classList.add('has-text');
                transcriptPlaceholder.style.display = 'none';
            }
        };

        r.onerror = (event) => {
            if (session !== recogSession) return;
            const code = (event && event.error) || '';
            console.warn('语音识别错误:', code);
            if (code === 'aborted') return; // 用户主动结束
            if (code === 'no-speech') {      // iOS 静音超时：继续听，别停
                if (!secondary) setPlaceholder('没听到声音，请再说一次');
                return;
            }
            if (secondary) { killRecognition(); return; } // 原声模式：识别挂了不影响真录音
            speechBroken = true;
            const msg = speechErrorText(code);
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                // 权限/听写被关掉：录音也拿不到麦克风，只能把开启路径讲清楚
                isRecording = false;
                captureMode = '';
                voiceMicBtn.classList.remove('recording');
                sendVoiceModal.classList.remove('recording-active');
                resetPlaceholder();
                showToast(msg, 7000);
                return;
            }
            showToast(msg + '，已切换为「录音转文字」', 5000);
            if (isRecording) switchToAudioCapture();
        };

        r.onend = () => {
            if (session !== recogSession) return;
            if (secondary || captureMode === 'audio') return;
            if (isRecording && recognition === r) {
                // iOS 说完一段会自动断开；还在录音态就接着听
                setTimeout(() => {
                    if (!isRecording || recognition !== r) return;
                    try {
                        r.start();
                    } catch (e) {
                        speechBroken = true;
                        showToast('实时识别中断，已切换为「录音转文字」');
                        switchToAudioCapture();
                    }
                }, 200);
            }
        };

        // iOS 必须在用户手势里同步 start()，否则会静默失败
        try {
            r.start();
        } catch (e) {
            console.warn('语音识别启动失败:', e);
            if (!secondary) speechBroken = true;
            return false;
        }
        if (!secondary) {
            // 有的环境 start() 既不成功也不报错：6 秒还没有 onstart 就降级，绝不静默
            clearTimeout(startWatchdog);
            startWatchdog = setTimeout(() => {
                if (session !== recogSession || recogStarted) return;
                speechBroken = true;
                showToast('实时识别没能启动，已切换为「录音转文字」', 5000);
                switchToAudioCapture();
            }, 6000);
        }
        return true;
    }

    function closeSettingsPopup() {
        voiceSettingsPopup.classList.remove('visible');
        voiceLangList.classList.remove('visible');
    }

    function updateInputModeUI() {
        document.querySelectorAll('.voice-setting-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === inputMode);
        });
        const langSection = document.getElementById('voice-lang-section');
        const autoSection = document.getElementById('voice-autostart-section');
        if (inputMode === 'voice' || inputMode === 'raw') {
            langSection.style.display = '';
            autoSection.style.display = '';
        } else {
            langSection.style.display = 'none';
            autoSection.style.display = 'none';
        }
        if (inputMode === 'raw') {
            transcriptPlaceholder.textContent = '按住说话，发送原声语音';
        } else {
            transcriptPlaceholder.textContent = '请说话……';
        }
    }

    function updateLangUI() {
        voiceLangCurrent.textContent = langNames[currentLang] || currentLang;
        document.querySelectorAll('.voice-lang-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === currentLang);
        });
    }

    function fmtRecTime(ms) {
        const s = Math.floor(ms / 1000);
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    // ===== 原声模式：麦克风真录音 =====
    async function startAudioCapture() {
        if (typeof MediaRecorder === 'undefined') {
            throw new Error('此环境不支持录音');
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(micDiag || '此环境没有麦克风接口');
        }
        // 复用手势预热的请求/流；绝不再发第二个 getUserMedia（并发请求会卡死 WKWebView）
        let stream;
        try {
            if (pendingStream) {
                stream = pendingStream;
            } else if (pendingStreamPromise) {
                stream = await withTimeout(pendingStreamPromise, 8000,
                    '麦克风没有响应：请到 iOS 设置 → 隐私与安全性 → 麦克风，允许「章鱼喷墨机」后重开 App');
            } else {
                stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 8000,
                    '麦克风没有响应：请到 iOS 设置 → 隐私与安全性 → 麦克风，允许「章鱼喷墨机」后重开 App');
            }
        } catch (err) {
            // 失败后清掉预热缓存，下一次重试才会重新发起请求
            pendingStream = null; pendingStreamPromise = null;
            throw new Error(micErrText(err));
        }
        pendingStream = null; pendingStreamPromise = null;
        clearTimeout(warmLeakTimer);
        micDiag = '';
        mediaStream = stream;
        let mime = '';
        for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
            if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
        }
        audioChunks = [];
        recDiscard = false;
        mediaRecorder = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) audioChunks.push(e.data); };
        mediaRecorder.start(250);
        recStartedAt = Date.now();
        // 录音计时显示（原声模式不显示文字，只显示时长）
        recTimerInt = setInterval(() => {
            transcriptText.textContent = fmtRecTime(Date.now() - recStartedAt);
            transcriptArea.classList.add('has-text');
            transcriptPlaceholder.style.display = 'none';
        }, 200);
        recMaxTimer = setTimeout(() => { // 最长 60 秒自动发送
            isPressing = false;
            stopRecording(false);
            setTimeout(sendVoiceMessage, 300);
        }, 60000);
    }

    // 结束录音并产出 { dataUrl, duration }；discard=true 时丢弃
    function finishAudioCapture(discard) {
        return new Promise((resolve) => {
            const done = (res) => {
                clearInterval(recTimerInt); recTimerInt = null;
                clearTimeout(recMaxTimer); recMaxTimer = null;
                if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
                mediaRecorder = null;
                resolve(res);
            };
            if (!mediaRecorder || mediaRecorder.state === 'inactive') { done(null); return; }
            const rec = mediaRecorder;
            const wasDiscard = discard || recDiscard;
            rec.onstop = () => {
                if (wasDiscard) { done(null); return; }
                const blob = new Blob(audioChunks, { type: rec.mimeType || 'audio/webm' });
                if (!blob.size) { done(null); return; }
                const duration = Math.max(1, Math.round((Date.now() - recStartedAt) / 1000));
                const reader = new FileReader();
                reader.onload = () => done({ dataUrl: reader.result, blob, duration });
                reader.onerror = () => done(null);
                reader.readAsDataURL(blob);
            };
            try { rec.stop(); } catch (e) { done(null); }
        });
    }
    function startRecording() {
        if (isRecording) return; // 点按开始后重复触发（长按定时器/第二次点击）不叠加
        if (inputMode === 'text') return;
        finalTranscript = '';
        transcriptText.innerHTML = '';
        transcriptArea.classList.remove('has-text');
        // 立刻给反馈：以前要等 onstart 才变红，iOS 上识别起不来时看起来就像「点了没反应」
        setPlaceholder('正在启动麦克风…');
        voiceMicBtn.classList.add('recording');
        sendVoiceModal.classList.add('recording-active');
        closeSettingsPopup();
        isRecording = true;

        if (inputMode === 'raw') {
            // 原声模式：录音是主链路；iOS 上并发跑实时识别会抢麦克风，跳过
            captureMode = 'audio';
            if (!IS_IOS && canUseSpeech()) beginSpeechRecognition(true);
            startAudioCapture().catch(err => {
                showToast('录音失败：' + (err && err.message ? err.message : '无法访问麦克风'), 5000);
                stopRecording();
            });
            return;
        }

        // 语音模式：优先实时识别
        if (canUseSpeech()) {
            captureMode = 'speech';
            if (beginSpeechRecognition(false)) return;
            // start() 抛错 → 落到下面的「录音 → API 转写」，并明确告诉用户
            showToast('实时识别不可用，已改为「录音转文字」', 5000);
        }

        // 无实时识别 API（IPA/WKWebView）或识别起不来：录音 → API 转写，失败再发原声
        captureMode = 'audio';
        fallbackCapture = true;
        if (!SpeechRecognition && localStorage.getItem('voice_fallback_hint') !== '1') {
            showToast('当前环境不支持实时识别，说完后将自动转成文字');
            localStorage.setItem('voice_fallback_hint', '1');
        }
        startAudioCapture().catch(err => {
            showToast('无法访问麦克风：' + (err && err.message ? err.message : '请检查权限'), 5000);
            stopRecording();
        });
    }

    // discard=false：保留录音结果供发送；默认（取消/关闭）丢弃
    function stopRecording(discard) {
        isRecording = false;
        clearTimeout(startWatchdog);
        startWatchdog = null;
        if (recognition) {
            if (discard === false) {
                // 软结束：让 iOS 最后一次 final 识别结果还能落到 finalTranscript 里
                stopRecognitionSoft();
            } else {
                killRecognition();
            }
        }
        if (mediaRecorder) {
            if (discard === false) {
                finishAudioCapture(false).then(res => { lastAudioCapture = res; });
            } else {
                recDiscard = true;
                finishAudioCapture(true);
                lastAudioCapture = null;
                fallbackCapture = false;
            }
        }
        voiceMicBtn.classList.remove('recording');
        sendVoiceModal.classList.remove('recording-active');
        captureMode = '';
        resetPlaceholder();
    }

    async function sendVoiceMessage() {
        if (inputMode === 'raw') { sendRawVoice(); return; }
        if (fallbackCapture) { sendFallbackVoice(); return; }
        const text = finalTranscript.trim();
        if (!text) { showToast('没有识别到语音内容，请再说一次'); return; }
        stopRecording();
        sendVoiceModal.classList.remove('visible');
        setTimeout(() => {
            sendMyVoiceMessage(text);
            finalTranscript = '';
            transcriptText.innerHTML = '';
            transcriptArea.classList.remove('has-text');
            transcriptPlaceholder.style.display = '';
        }, 150);
    }

    async function sendRawVoice() {
        // stopRecording(false) 已启动收尾，等录音结果就绪（最长 3 秒）
        for (let i = 0; i < 30 && !lastAudioCapture; i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        const res = lastAudioCapture;
        lastAudioCapture = null;
        if (!res || !res.dataUrl) { showToast('没有录到声音，请再试一次'); return; } // 没录到东西
        const transcript = finalTranscript.trim();
        sendVoiceModal.classList.remove('visible');
        sendMyRawVoiceMessage(res.dataUrl, res.duration, transcript);
        finalTranscript = '';
        transcriptText.innerHTML = '';
        transcriptArea.classList.remove('has-text');
        transcriptPlaceholder.style.display = '';
    }

    // 无实时识别环境的兜底发送：录音 → API 转写 → 文字语音；失败则发原声
    async function sendFallbackVoice() {
        for (let i = 0; i < 30 && !lastAudioCapture; i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        const res = lastAudioCapture;
        lastAudioCapture = null;
        fallbackCapture = false;
        if (!res || !res.blob || !res.blob.size) { showToast('没有录到声音，请再试一次'); return; } // 没录到东西
        sendVoiceModal.classList.remove('visible');
        transcriptText.innerHTML = '';
        transcriptArea.classList.remove('has-text');
        transcriptPlaceholder.style.display = '';
        showToast('识别中…');
        let transcript = '';
        try {
            transcript = await transcribeAudioBlob(res.blob);
        } catch (err) {
            console.warn('语音转写失败:', err);
        }
        if (transcript) {
            sendMyVoiceMessage(transcript);
        } else if (res.dataUrl) {
            sendMyRawVoiceMessage(res.dataUrl, res.duration, '');
            showToast('识别失败，已改为发送原声');
        }
        finalTranscript = '';
    }

    // 用已配置的 OpenAI 兼容接口做语音转文字（/v1/audio/transcriptions）
    async function transcribeAudioBlob(blob) {
        const api = db.apiSettings || {};
        if (!api.url || !api.key) throw new Error('未配置 API');
        const ext = (blob.type && blob.type.includes('mp4')) ? 'm4a' : 'webm';
        const fd = new FormData();
        fd.append('file', blob, 'voice.' + ext);
        fd.append('model', localStorage.getItem('voice_stt_model') || 'whisper-1');
        const res = await fetch(api.url.replace(/\/+$/, '') + '/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + api.key },
            body: fd
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return (data && data.text) ? String(data.text).trim() : '';
    }

    function openTextInput() {
        stopRecording();
        sendVoiceModal.classList.remove('visible');
        setTimeout(() => {
            const inputEl = document.getElementById('message-input');
            if (inputEl) inputEl.focus();
        }, 200);
    }

    // 长按检测（点按也能用：点一下开始录音，再点一下结束发送）
    let pressStartAt = 0;
    function onPressStart(e) {
        if (e) e.preventDefault();
        if (inputMode === 'text') return;
        if (isRecording) return; // 录音中再按下：交给 onPressEnd 结束发送，不重复开
        isPressing = true;
        pressStartAt = Date.now();
        if (inputMode === 'raw' || !canUseSpeech()) {
            // 录音链路：手势内立刻要权限，iOS 才会弹系统授权框
            warmUpMic();
            pressTimer = setTimeout(() => {
                if (isPressing) startRecording();
            }, 400);
        }
        // 实时识别链路不在这里 start：iOS 只认手势里同步调用的 start()，
        // 放到 400ms 定时器里会被静默拒绝（这就是原来「点了没反应」的根因之一）。
    }

    function onPressEnd(e) {
        if (e) e.preventDefault();
        clearTimeout(pressTimer);
        const wasPressing = isPressing;
        const held = wasPressing && (Date.now() - pressStartAt >= 400);
        isPressing = false;
        if (isRecording) {
            // 长按松手发送 / 点按模式下第二次点击结束发送
            stopRecording(false);
            setTimeout(sendVoiceMessage, 300);
            return;
        }
        if (!wasPressing) return;
        if (canUseSpeech()) {
            // 手指抬起仍在用户手势链里：点按、长按都从这里开始
            startRecording();
            return;
        }
        // 录音链路：长按已在 400ms 时开始录音（松手发送走上面的分支），快速点按在这里开始
        if (!held) startRecording();
    }

    voiceMicBtn.addEventListener('touchstart', onPressStart, { passive: false });
    voiceMicBtn.addEventListener('touchend', onPressEnd, { passive: false });
    voiceMicBtn.addEventListener('mousedown', onPressStart);
    voiceMicBtn.addEventListener('mouseup', onPressEnd);
    voiceMicBtn.addEventListener('mouseleave', () => { if (isPressing) onPressEnd(); });

    voiceMicBtn.addEventListener('click', () => {
        if (inputMode === 'text') return;
        if (isAutoStart) {
            if (isRecording) {
                stopRecording(false);
                setTimeout(sendVoiceMessage, 300);
            } else {
                startRecording();
            }
        }
    });

    // 设置按钮
    voiceSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        voiceSettingsPopup.classList.toggle('visible');
        voiceLangList.classList.remove('visible');
    });

    // 输入方式切换
    document.querySelectorAll('.voice-setting-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            inputMode = btn.dataset.mode;
            localStorage.setItem('voice_input_mode', inputMode);
            updateInputModeUI();
            if (inputMode === 'text') {
                closeSettingsPopup();
                setTimeout(openTextInput, 200);
            }
        });
    });

    // 语言选择
    voiceLangBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        voiceLangList.classList.toggle('visible');
    });

    document.querySelectorAll('.voice-lang-item').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLang = btn.dataset.lang;
            localStorage.setItem('voice_lang', currentLang);
            updateLangUI();
            voiceLangList.classList.remove('visible');
            if (recognition) {
                recognition.lang = currentLang;
            }
        });
    });

    // 自动录音开关
    voiceAutostartToggle.checked = isAutoStart;
    voiceAutostartToggle.addEventListener('change', () => {
        isAutoStart = voiceAutostartToggle.checked;
        localStorage.setItem('voice_auto_start', isAutoStart);
    });

    // 关闭按钮
    voiceCloseBtn.addEventListener('click', () => {
        stopRecording();
        sendVoiceModal.classList.remove('visible');
        closeSettingsPopup();
        finalTranscript = '';
        transcriptText.innerHTML = '';
        transcriptArea.classList.remove('has-text');
        transcriptPlaceholder.style.display = '';
    });

    // 点击转录区域发送
    transcriptArea.addEventListener('click', () => {
        if (inputMode === 'raw') {
            if (isRecording || mediaRecorder) {
                stopRecording(false);
                setTimeout(sendVoiceMessage, 300);
            }
            return;
        }
        if (finalTranscript.trim()) sendVoiceMessage();
    });

    // 点击弹窗外部关闭
    sendVoiceModal.addEventListener('click', (e) => {
        if (e.target === sendVoiceModal) {
            stopRecording();
            sendVoiceModal.classList.remove('visible');
            closeSettingsPopup();
        }
    });

    // 点击设置弹窗外部关闭弹窗
    document.addEventListener('click', (e) => {
        if (voiceSettingsPopup.classList.contains('visible') &&
            !voiceSettingsPopup.contains(e.target) &&
            e.target !== voiceSettingsBtn) {
            closeSettingsPopup();
        }
    });

    // 打开语音弹窗
    function openVoiceModal() {
        updateInputModeUI();
        updateLangUI();
        sendVoiceModal.classList.add('visible');
        if ((inputMode === 'voice' || inputMode === 'raw') && isAutoStart) {
            if (IS_IOS) {
                // iOS 的实时识别必须在手势里启动，setTimeout 里 start() 会被静默拒绝
                setPlaceholder('轻点中间麦克风开始');
            } else {
                setTimeout(startRecording, 400);
            }
        }
    }
    voiceMessageBtn.addEventListener('click', openVoiceModal);
    // 事件委托备份：面板 DOM 被搬移/重建后直连监听可能失效，document 级委托保证始终可用
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('#voice-message-btn');
        if (!btn) return;
        const modal = document.getElementById('send-voice-modal');
        if (modal && !modal.classList.contains('visible')) openVoiceModal();
    });
}

function sendMyVoiceMessage(text) {
    if (!text) return;
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        const content = `[${myName}的语音：${text}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{type: 'text', text: content}],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

// 原声语音消息：真实录音 + 后台识别的文字（文字只给 AI 看，界面不显示）
function sendMyRawVoiceMessage(audioDataUrl, duration, transcript) {
    if (!audioDataUrl) return;
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        const content = `[${myName}的语音：${transcript || '（未识别到语音内容）'}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{type: 'text', text: content}],
            voiceAudio: { data: audioDataUrl, duration: duration || 1 },
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

function setupPhotoVideoSystem() {
    const photoVideoBtn = document.getElementById('photo-video-btn');
    const sendPvForm = document.getElementById('send-pv-form');
    const sendPvModal = document.getElementById('send-pv-modal');
    const pvTextInput = document.getElementById('pv-text-input');

    photoVideoBtn.addEventListener('click', () => {
        sendPvForm.reset();
        sendPvModal.classList.add('visible');
    });
    sendPvForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMyPhotoVideo(pvTextInput.value.trim());
    });
}

function sendMyPhotoVideo(text) {
    if (!text) return;
    document.getElementById('send-pv-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        const content = `[${myName}发来的照片\/视频：${text}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{type: 'text', text: content}],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

function setupImageRecognition() {
    const imageRecognitionBtn = document.getElementById('image-recognition-btn');
    const imageUploadInput = document.getElementById('image-upload-input');

    imageRecognitionBtn.addEventListener('click', () => {
        imageUploadInput.click();
    });
    imageUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {
                    quality: 0.8,
                    maxWidth: 1024,
                    maxHeight: 1024
                });
                sendImageForRecognition(compressedUrl);
            } catch (error) {
                console.error('Image compression failed:', error);
                showToast('图片处理失败，请重试');
            } finally {
                e.target.value = null;
            }
        }
    });
}

async function sendImageForRecognition(base64Data) {
    if (!base64Data || isGenerating) return;
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
    const textPrompt = `[${myName}发来了一张图片：]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: base64Data,
        parts: [{type: 'text', text: textPrompt}, {type: 'image', data: base64Data}],
        timestamp: Date.now(),
    };
    if (currentChatType === 'group') {
        message.senderId = 'user_me';
    }
    chat.history.push(message);
    addMessageBubble(message, currentChatId, currentChatType);
    await saveData();
    renderChatList();
}

function setupWalletSystem() {
    const walletBtn = document.getElementById('wallet-btn');
    const sendTransferForm = document.getElementById('send-transfer-form');
    const sendTransferModal = document.getElementById('send-transfer-modal');
    const transferAmountInput = document.getElementById('transfer-amount-input');
    const transferRemarkInput = document.getElementById('transfer-remark-input');
    const acceptTransferBtn = document.getElementById('accept-transfer-btn');
    const returnTransferBtn = document.getElementById('return-transfer-btn');

    walletBtn.addEventListener('click', () => {
        if (currentChatType === 'private') {
            sendTransferForm.reset();
            // 全屏转账页：头像 + 收款人显示「备注(**真实姓名末字)」
            const chat = db.characters.find(c => c.id === currentChatId);
            const transferNameDisplay = document.getElementById('transfer-name-display');
            const transferAvatar = document.getElementById('transfer-avatar');
            if (chat && transferNameDisplay) {
                const remark = (chat.remarkName && chat.remarkName.trim()) || chat.realName || 'TA';
                const lastChar = (chat.realName || '').trim().slice(-1);
                transferNameDisplay.textContent = `${remark}(**${lastChar})`;
            }
            if (chat && transferAvatar) transferAvatar.src = chat.avatar || '';
            sendTransferModal.classList.add('visible');
        } else if (currentChatType === 'group') {
            // currentGroupAction 应该在 group_chat.js 或全局定义
            if (typeof currentGroupAction !== 'undefined') {
                currentGroupAction.type = 'transfer';
            }
            renderGroupRecipientSelectionList('转账给');
            document.getElementById('group-recipient-selection-modal').classList.add('visible');
        }
    });
    sendTransferForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = transferAmountInput.value;
        const remark = transferRemarkInput.value.trim();
        if (amount > 0) {
            sendMyTransfer(amount, remark);
        } else {
            showToast('请输入有效的金额');
        }
    });
    acceptTransferBtn.addEventListener('click', () => respondToTransfer('received'));
    returnTransferBtn.addEventListener('click', () => respondToTransfer('returned'));

    // 全屏转账页：返回按钮 + 自定义数字键盘
    const transferBackBtn = document.getElementById('transfer-back-btn');
    if (transferBackBtn) {
        transferBackBtn.addEventListener('click', () => sendTransferModal.classList.remove('visible'));
    }
    const tfKeypad = document.getElementById('tf-keypad');
    if (tfKeypad) {
        tfKeypad.addEventListener('click', (e) => {
            const key = e.target.closest('.tf-key');
            if (!key) return;
            const k = key.dataset.key;
            const v = transferAmountInput.value;
            if (k === 'del') {
                transferAmountInput.value = v.slice(0, -1);
            } else if (k === '.') {
                if (!v.includes('.')) transferAmountInput.value = (v || '0') + '.';
            } else {
                const decLen = v.includes('.') ? v.split('.')[1].length : -1;
                if (decLen >= 2) return; // 最多两位小数
                transferAmountInput.value = (v === '0') ? k : v + k;
            }
        });
    }
}

function sendMyTransfer(amount, remark) {
    const value = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(value > 0)) {
        showToast('请输入有效的金额');
        return;
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat) return;

    let transferRecipients = [];
    if (currentChatType === 'group') {
        const selected = (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients) || [];
        transferRecipients = selected.map(recipientId => chat.members.find(m => m.id === recipientId)).filter(Boolean);
        if (!transferRecipients.length) {
            showToast('请选择收款人');
            return;
        }
    }

    const totalCost = Math.round(value * (transferRecipients.length || 1) * 100) / 100;
    if (window.Wallet) {
        if (!Wallet.canAfford(totalCost)) {
            showToast(`钱包余额不足，还差 ¥${(totalCost - Wallet.balance()).toFixed(2)}`);
            return;
        }
        Wallet.spend(totalCost, {
            type: 'transfer_out',
            title: currentChatType === 'group' ? '群聊转账' : `转账给${chat.realName || '角色'}`,
            subtitle: remark ? `备注：${remark}` : `共 ${transferRecipients.length || 1} 人`
        });
    }

    document.getElementById('send-transfer-modal').classList.remove('visible');
    setTimeout(() => {
        if (currentChatType === 'private') {
            const content = `[${chat.myName}给你转账：${amount}元；备注：${remark}]`;
            const message = {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: content,
                parts: [{type: 'text', text: content}],
                timestamp: Date.now(),
                transferStatus: 'pending'
            };
            chat.history.push(message);
            addMessageBubble(message, currentChatId, currentChatType);
        } else { 
            transferRecipients.forEach(recipient => {
                const content = `[${chat.me.nickname} 向 ${recipient.realName} 转账：${amount}元；备注：${remark}]`;
                const message = {
                    id: `msg_${Date.now()}_${recipient.id}`,
                    role: 'user',
                    content: content,
                    parts: [{type: 'text', text: content}],
                    timestamp: Date.now(),
                    senderId: 'user_me'
                };
                chat.history.push(message);
                addMessageBubble(message, currentChatId, currentChatType);
            });
        }
        saveData();
        renderChatList();
    }, 100);
}

function handleReceivedTransferClick(messageId) {
    currentTransferMessageId = messageId;
    document.getElementById('receive-transfer-actionsheet').classList.add('visible');
}

async function respondToTransfer(action) {
    if (!currentTransferMessageId) return;
    const character = db.characters.find(c => c.id === currentChatId);
    const message = character.history.find(m => m.id === currentTransferMessageId);
    if (message) {
        const wasPending = message.transferStatus === 'pending';
        message.transferStatus = action;
        if (action === 'received' && wasPending && window.Wallet) {
            const amountMatch = String(message.content || '').match(/[：:]\s*([\d.]+)\s*元/);
            const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
            if (amount > 0) {
                const remarkMatch = String(message.content || '').match(/备注[：:]\s*([^\]\n]+)/);
                Wallet.income(amount, {
                    type: 'transfer_in',
                    title: `收到${character.realName}的转账`,
                    subtitle: remarkMatch ? `备注：${remarkMatch[1].trim()}` : '转账收款'
                });
            }
        }
        const cardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${currentTransferMessageId}"] .transfer-card`);
        if (cardOnScreen) {
            cardOnScreen.classList.remove('received', 'returned');
            cardOnScreen.classList.add(action);
            cardOnScreen.querySelector('.transfer-status').textContent = action === 'received' ? '已收款' : '已退回';
            cardOnScreen.style.cursor = 'default';
        }
        let contextMessageContent = (action === 'received') ? `[${character.myName}接收${character.realName}的转账]` : `[${character.myName}退回${character.realName}的转账]`;
        const contextMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: contextMessageContent,
            parts: [{type: 'text', text: contextMessageContent}],
            timestamp: Date.now()
        };
        character.history.push(contextMessage);
        await saveData();
        renderChatList();
    }
    document.getElementById('receive-transfer-actionsheet').classList.remove('visible');
    currentTransferMessageId = null;
}

function setupGiftSystem() {
    const giftBtn = document.getElementById('gift-btn');
    const sendGiftForm = document.getElementById('send-gift-form');
    const sendGiftModal = document.getElementById('send-gift-modal');
    const giftDescriptionInput = document.getElementById('gift-description-input');

    giftBtn.addEventListener('click', () => {
        if (currentChatType === 'private') {
            sendGiftForm.reset();
            sendGiftModal.classList.add('visible');
        } else if (currentChatType === 'group') {
            if (typeof currentGroupAction !== 'undefined') {
                currentGroupAction.type = 'gift';
            }
            renderGroupRecipientSelectionList('送礼物给');
            document.getElementById('group-recipient-selection-modal').classList.add('visible');
        }
    });
    sendGiftForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMyGift(giftDescriptionInput.value.trim());
    });
}

function sendMyGift(description) {
    if (!description) return;
    document.getElementById('send-gift-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);

        if (currentChatType === 'private') {
            const content = `[${chat.myName}送来的礼物：${description}]`;
            const message = {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: content,
                parts: [{type: 'text', text: content}],
                timestamp: Date.now(),
                giftStatus: 'sent'
            };
            chat.history.push(message);
            addMessageBubble(message, currentChatId, currentChatType);
        } else { 
            if (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients) {
                currentGroupAction.recipients.forEach(recipientId => {
                    const recipient = chat.members.find(m => m.id === recipientId);
                    if (recipient) {
                        const content = `[${chat.me.nickname} 向 ${recipient.realName} 送来了礼物：${description}]`;
                        const message = {
                            id: `msg_${Date.now()}_${recipientId}`,
                            role: 'user',
                            content: content,
                            parts: [{type: 'text', text: content}],
                            timestamp: Date.now(),
                            senderId: 'user_me'
                        };
                        chat.history.push(message);
                        addMessageBubble(message, currentChatId, currentChatType);
                    }
                });
            }
        }
        saveData();
        renderChatList();
    }, 100);
}

// --- 转发聊天记录弹窗逻辑 ---
window.showForwardedChatModal = function(chatContent, charName) {
    const modal = document.getElementById('forwarded-chat-modal');
    const titleEl = document.getElementById('forwarded-chat-modal-title');
    const contentEl = document.getElementById('forwarded-chat-content');
    const closeBtn = document.getElementById('close-forwarded-chat-btn');
    
    if (!modal || !titleEl || !contentEl) return;
    
    titleEl.textContent = `${charName}的聊天记录`;
    
    // 解析聊天记录内容
    const lines = chatContent.split('\n').filter(line => line.trim() !== '');
    let html = '';
    
    lines.forEach(line => {
        // 尝试匹配 "名字：内容" 或 "名字: 内容"
        const match = line.match(/^([^：:]+)[：:]([\s\S]+)$/);
        if (match) {
            const name = match[1].trim();
            const text = match[2].trim();
            
            // 简单的左右区分逻辑：如果名字是当前角色，放右边，否则放左边
            const isSelf = name === charName;
            
            html += `
                <div style="display: flex; flex-direction: column; align-items: ${isSelf ? 'flex-end' : 'flex-start'}; margin-bottom: 12px;">
                    <span style="font-size: 12px; color: #888; margin-bottom: 4px; margin-${isSelf ? 'right' : 'left'}: 4px;">${name}</span>
                    <div style="background: ${isSelf ? 'var(--primary-color)' : '#fff'}; color: ${isSelf ? '#fff' : '#333'}; padding: 8px 12px; border-radius: 12px; border-${isSelf ? 'top-right' : 'top-left'}-radius: 4px; max-width: 85%; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        ${DOMPurify.sanitize(text)}
                    </div>
                </div>
            `;
        } else {
            // 如果没有匹配到名字，作为系统提示或居中显示
            html += `<div style="text-align: center; font-size: 12px; color: #aaa; margin: 8px 0;">${DOMPurify.sanitize(line)}</div>`;
        }
    });
    
    contentEl.innerHTML = html;
    modal.classList.add('visible');
    
    // 绑定关闭事件
    const closeModal = () => {
        modal.classList.remove('visible');
        closeBtn.removeEventListener('click', closeModal);
    };
    closeBtn.addEventListener('click', closeModal);
};

function setupTimeSkipSystem() {
    const timeSkipBtn = document.getElementById('time-skip-btn');
    const timeSkipModal = document.getElementById('time-skip-modal');
    const timeSkipForm = document.getElementById('time-skip-form');
    const timeSkipInput = document.getElementById('time-skip-input');

    timeSkipBtn.addEventListener('click', () => {
        timeSkipForm.reset();
        timeSkipModal.classList.add('visible');
    });
    timeSkipModal.addEventListener('click', (e) => {
        if (e.target === timeSkipModal) timeSkipModal.classList.remove('visible');
    });
    timeSkipForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendTimeSkipMessage(timeSkipInput.value.trim());
    });
}

async function sendTimeSkipMessage(text) {
    if (!text) return;
    document.getElementById('time-skip-modal').classList.remove('visible');
    await new Promise(resolve => setTimeout(resolve, 100));
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat) return;

    const visualMessage = {
        id: `msg_visual_${Date.now()}`,
        role: 'system',
        content: `[system-display:${text}]`,
        parts: [],
        timestamp: Date.now()
    };
    const contextMessage = {
        id: `msg_context_${Date.now()}`,
        role: 'user',
        content: `[system: ${text}]`,
        parts: [{type: 'text', text: `[system: ${text}]`}],
        timestamp: Date.now()
    };
    if (currentChatType === 'group') {
        contextMessage.senderId = 'user_me';
        visualMessage.senderId = 'user_me';
    }

    chat.history.push(visualMessage, contextMessage);
    addMessageBubble(visualMessage, currentChatId, currentChatType);
    await saveData();
    renderChatList();
}

const AudioManager = {
    _audio: null,
    
    get audio() {
        if (!this._audio) {
            this._audio = new Audio();
            this._audio.addEventListener('ended', () => {
                // 可选：播放结束后的清理工作
            });
            this._audio.addEventListener('error', (e) => {
                console.warn('Audio Object Error:', e);
            });
        }
        return this._audio;
    },

    play(source) {
        if (!source) return;
        const a = this.audio;
        
        // 如果当前正在播放且源相同，可以重置进度（打断重播）
        // 如果源不同，直接切换
        try {
            a.src = source;
            a.volume = 1.0; 
            a.currentTime = 0;
            
            const p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => {
                    // 忽略 AbortError (被新的播放打断是正常的)
                    if (e.name !== 'AbortError') {
                        console.warn('播放提示音失败:', e);
                    }
                });
            }
        } catch (e) {
            console.warn('音频播放异常:', e);
        }
    },

    // 预热/解锁音频对象（用于在没有发送音效时获取播放权限）
    unlock(receiveSoundOverride) {
        const receiveSound = receiveSoundOverride || db.globalReceiveSound;
        if (receiveSound) {
            const a = this.audio;
            // 记录当前状态
            const originalSrc = a.src;
            
            // 切换到接收音效进行预热
            if (!a.src || a.src !== receiveSound) {
                 a.src = receiveSound;
            }
            
            a.volume = 0; // 静音
            const p = a.play();
            if (p) {
                p.then(() => {
                    a.pause();
                    a.currentTime = 0;
                    a.volume = 1; 
                }).catch(e => {
                    // 预热失败也不影响流程
                    a.volume = 1;
                });
            }
        }
    }
};

function playSound(source) {
    AudioManager.play(source);
}
