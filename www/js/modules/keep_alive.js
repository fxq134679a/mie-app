// --- 跨平台持续运行增强（后台保活） ---
// 保活方式（iOS）：
//   osc   振荡器（新）：Web Audio 凭空发声，不靠音频文件，部分机型更不易被掐
//   audio 静音音频循环：循环播放一段 55Hz 极低音量 WAV（经典方案）
//   both  两者都开（最稳）
//   pip   画中画（不占音频）：canvas 流 + PiP 小窗，小窗在系统就不挂起 App
// 浏览器仍可能被系统挂起；本模块负责提高存活率，并在恢复后补跑全局任务。
(function () {
    const HEARTBEAT_INTERVAL_MS = 15000;
    const RESUME_GAP_MS = 20000;
    const CHECKPOINT_KEY = 'uwu_keep_alive_checkpoint';
    const MODE_KEY = 'uwu_keep_alive_mode';
    const VALID_MODES = ['osc', 'audio', 'both', 'pip'];

    let enabled = false;
    let mode = 'audio';
    let audio = null;
    let audioUrl = '';
    let audioCtx = null;
    let oscNode = null;
    let oscGain = null;
    let pipVideo = null;
    let pipCanvas = null;
    let pipStream = null;
    let pipDrawTimer = null;
    let pipFallbackReason = '';
    let wakeLock = null;
    let heartbeatTimer = null;
    let lastHeartbeatAt = Date.now();
    let hiddenAt = 0;
    let gestureHandler = null;
    let listenersBound = false;
    let recoveryRunning = false;

    function getStatusElement() {
        return document.getElementById('keep-alive-status');
    }

    function setStatus(text, state) {
        const element = getStatusElement();
        if (!element) return;
        element.textContent = text;
        element.dataset.state = state || '';
    }

    /* ---------- 模式存取：db 优先，localStorage 兜底 ---------- */
    function readMode() {
        try {
            const fromDb = window.db && window.db.apiSettings && window.db.apiSettings.keepAliveMode;
            if (VALID_MODES.indexOf(fromDb) !== -1) return fromDb;
        } catch (e) { /* db 未就绪时走兜底 */ }
        try {
            const saved = localStorage.getItem(MODE_KEY);
            if (VALID_MODES.indexOf(saved) !== -1) return saved;
        } catch (e) { /* 忽略 */ }
        return 'audio';
    }

    function writeMode(m) {
        mode = m;
        try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 配额满就算了 */ }
        try {
            if (window.db) {
                window.db.apiSettings = window.db.apiSettings || {};
                window.db.apiSettings.keepAliveMode = m;
                if (typeof window.saveData === 'function') window.saveData();
            }
        } catch (e) { /* db 不可用时静默 */ }
    }

    /* ---------- 通道 1：静音音频循环 ---------- */
    function createLowImpactWavUrl() {
        const sampleRate = 8000;
        const durationSeconds = 8;
        const sampleCount = sampleRate * durationSeconds;
        const buffer = new ArrayBuffer(44 + sampleCount * 2);
        const view = new DataView(buffer);

        function writeString(offset, value) {
            for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
        }

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + sampleCount * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint16(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, sampleCount * 2, true);

        for (let i = 0; i < sampleCount; i++) {
            // 55Hz 通常低于手机扬声器的有效频段，但数据并非全静音。
            const fade = Math.min(1, i / 160, (sampleCount - i) / 160);
            const sample = Math.round(Math.sin(2 * Math.PI * 55 * i / sampleRate) * 96 * fade);
            view.setInt16(44 + i * 2, sample, true);
        }

        return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    }

    function ensureAudio() {
        if (audio) return audio;
        audioUrl = createLowImpactWavUrl();
        audio = new Audio(audioUrl);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 1;
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.addEventListener('pause', () => {
            if (enabled && mode !== 'pip') setStatus('媒体通道已暂停，等待恢复', 'paused');
        });
        audio.addEventListener('stalled', () => setStatus('媒体通道受限，等待恢复', 'paused'));
        audio.addEventListener('error', () => setStatus('媒体通道不可用', 'error'));
        return audio;
    }

    async function startAudioLoop() {
        try {
            await ensureAudio().play();
            return true;
        } catch (error) {
            console.warn('[KeepAlive] 音频通道启动失败:', error);
            return false;
        }
    }

    function stopAudioLoop() {
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
        audio = null;
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            audioUrl = '';
        }
    }

    /* ---------- 通道 2：振荡器（Web Audio） ---------- */
    async function startOscillator() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            if (oscNode) return true;
            oscNode = audioCtx.createOscillator();
            oscGain = audioCtx.createGain();
            oscNode.type = 'sine';
            oscNode.frequency.value = 55;      // 低于手机扬声器有效频段
            oscGain.gain.value = 0.0008;       // 近乎无声，但不能全 0
            oscNode.connect(oscGain).connect(audioCtx.destination);
            oscNode.start();
            return true;
        } catch (error) {
            console.warn('[KeepAlive] 振荡器启动失败:', error);
            stopOscillator();
            return false;
        }
    }

    function stopOscillator() {
        try {
            if (oscNode) { oscNode.stop(); oscNode.disconnect(); }
            if (oscGain) oscGain.disconnect();
        } catch (e) { /* 忽略 */ }
        oscNode = null;
        oscGain = null;
        if (audioCtx) {
            try { audioCtx.close(); } catch (e) { /* 忽略 */ }
            audioCtx = null;
        }
    }

    /* ---------- 通道 3：画中画（canvas 流 + PiP 小窗） ---------- */
    function drawPipFrame() {
        if (!pipCanvas) return;
        const ctx = pipCanvas.getContext('2d');
        const now = new Date();
        const t = now.getSeconds() + now.getMilliseconds() / 1000;
        ctx.fillStyle = '#101014';
        ctx.fillRect(0, 0, 64, 64);
        // 呼吸圆点：画面持续变化，防止系统判定静止画面而回收
        const r = 10 + Math.sin(t * Math.PI * 2 / 4) * 4;
        ctx.beginPath();
        ctx.arc(32, 32, r, 0, Math.PI * 2);
        ctx.fillStyle = '#5AC8A8';
        ctx.fill();
        ctx.fillStyle = '#8E8E96';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('后台连线中', 32, 52);
    }

    async function startPip() {
        pipFallbackReason = '';
        if (!('requestPictureInPicture' in HTMLVideoElement.prototype)) {
            pipFallbackReason = '此环境不支持画中画';
            return false;
        }
        if (document.pictureInPictureElement) return true; // 已经在小窗里
        try {
            if (!pipVideo) {
                pipCanvas = document.createElement('canvas');
                pipCanvas.width = 64;
                pipCanvas.height = 64;
                drawPipFrame();
                pipStream = pipCanvas.captureStream(2);
                pipVideo = document.createElement('video');
                pipVideo.muted = true;
                pipVideo.playsInline = true;
                pipVideo.setAttribute('playsinline', '');
                pipVideo.setAttribute('webkit-playsinline', '');
                pipVideo.srcObject = pipStream;
                pipVideo.style.cssText = 'position:fixed;left:-9999px;top:0;width:80px;height:80px;opacity:0.01;';
                document.body.appendChild(pipVideo);
                pipVideo.addEventListener('leavepictureinpicture', () => {
                    if (enabled && mode === 'pip') setStatus('画中画小窗已关闭，保活降级；点一下页面恢复', 'partial');
                    updateRunningStatus();
                });
            }
            if (!pipDrawTimer) pipDrawTimer = setInterval(drawPipFrame, 500);
            await pipVideo.play();
            await pipVideo.requestPictureInPicture();
            return true;
        } catch (error) {
            console.warn('[KeepAlive] 画中画启动失败:', error);
            pipFallbackReason = '画中画被系统拒绝（需要原生壳放开权限）';
            stopPip();
            return false;
        }
    }

    function stopPip() {
        try {
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        } catch (e) { /* 忽略 */ }
        if (pipDrawTimer) { clearInterval(pipDrawTimer); pipDrawTimer = null; }
        if (pipVideo) { pipVideo.remove(); pipVideo = null; }
        if (pipStream) { pipStream.getTracks().forEach(t => t.stop()); pipStream = null; }
        pipCanvas = null;
    }

    /* ---------- 媒体通道总控 ---------- */
    async function startChannels() {
        if (!enabled) return;
        if (mode === 'pip') {
            const ok = await startPip();
            if (!ok) {
                // 降级：画中画起不来就回到静音音频，别让用户裸奔
                await startAudioLoop();
                installGestureFallback();
                setStatus(pipFallbackReason || '画中画不可用，已降级静音音频', 'partial');
            }
        } else if (mode === 'osc') {
            const ok = await startOscillator();
            if (!ok) {
                await startAudioLoop();
                installGestureFallback();
            }
        } else if (mode === 'both') {
            await startOscillator();
            const ok = await startAudioLoop();
            if (!ok) installGestureFallback();
        } else {
            const ok = await startAudioLoop();
            if (!ok) {
                installGestureFallback();
                setStatus('点击页面以授权媒体通道', 'waiting');
            }
        }
        updateRunningStatus();
    }

    function stopChannels() {
        stopAudioLoop();
        stopOscillator();
        stopPip();
        pipFallbackReason = '';
        removeGestureFallback();
    }

    function channelRunning() {
        return {
            audio: !!(audio && !audio.paused),
            osc: !!(oscNode && audioCtx && audioCtx.state === 'running'),
            pip: !!document.pictureInPictureElement
        };
    }

    function isRunning() {
        const ch = channelRunning();
        return { enabled, mode, channels: ch, any: ch.audio || ch.osc || ch.pip };
    }

    function updateMediaSession(active) {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.playbackState = active ? 'playing' : 'none';
            if (active && 'MediaMetadata' in window) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'UwU 持续运行增强',
                    artist: '保持网页任务活跃'
                });
            } else if (!active) {
                navigator.mediaSession.metadata = null;
            }
        } catch (error) {
            console.debug('[KeepAlive] Media Session 不可用:', error);
        }
    }

    function removeGestureFallback() {
        if (!gestureHandler) return;
        document.removeEventListener('pointerdown', gestureHandler, true);
        document.removeEventListener('touchstart', gestureHandler, true);
        gestureHandler = null;
    }

    function installGestureFallback() {
        if (gestureHandler) return;
        gestureHandler = () => {
            removeGestureFallback();
            startChannels();
        };
        document.addEventListener('pointerdown', gestureHandler, { capture: true, once: true });
        document.addEventListener('touchstart', gestureHandler, { capture: true, once: true });
    }

    async function requestWakeLock() {
        if (!enabled || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return false;
        if (wakeLock && !wakeLock.released) return true;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                if (enabled && document.visibilityState === 'visible') {
                    setStatus('屏幕常亮被系统释放，媒体通道仍运行', 'partial');
                }
            }, { once: true });
            updateRunningStatus();
            return true;
        } catch (error) {
            console.debug('[KeepAlive] 屏幕常亮不可用:', error);
            updateRunningStatus();
            return false;
        }
    }

    function updateRunningStatus() {
        if (!enabled) {
            setStatus('未开启', 'off');
            return;
        }
        const ch = channelRunning();
        if (mode === 'pip') {
            if (ch.pip) setStatus('运行中：画中画小窗保活（不占音频）', 'running');
            else if (ch.audio) setStatus('画中画未进入，静音音频保活中', 'partial');
            else return;
        } else if (ch.audio && ch.osc) {
            setStatus('运行中：振荡器与静音音频双通道', 'running');
        } else if (ch.osc) {
            setStatus('运行中：振荡器保活', 'running');
        } else if (ch.audio) {
            if (document.visibilityState === 'hidden') setStatus('后台活跃增强运行中', 'running');
            else setStatus('运行中：静音音频循环', 'running');
        } else if (wakeLock && !wakeLock.released) {
            setStatus('运行中：屏幕常亮', 'partial');
        }
        updateMediaSession(enabled);
    }

    function writeCheckpoint(reason) {
        const checkpoint = { timestamp: Date.now(), reason: reason || 'heartbeat' };
        try {
            localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
        } catch (error) {
            console.debug('[KeepAlive] 无法保存生命周期检查点:', error);
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        lastHeartbeatAt = Date.now();
        heartbeatTimer = setInterval(() => {
            lastHeartbeatAt = Date.now();
        }, HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat() {
        if (!heartbeatTimer) return;
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    async function runRecovery(reason) {
        if (!enabled || recoveryRunning) return;
        recoveryRunning = true;
        const now = Date.now();
        const inactiveSince = hiddenAt || lastHeartbeatAt;
        const elapsedMs = Math.max(0, now - inactiveSince);

        try {
            await startChannels();
            await requestWakeLock();
            lastHeartbeatAt = now;
            hiddenAt = 0;

            if (elapsedMs >= RESUME_GAP_MS) {
                if (typeof updateClock === 'function') updateClock();
                if (typeof checkAutoReply === 'function') await checkAutoReply();
                if (typeof checkBackupReminder === 'function') await checkBackupReminder();
                window.dispatchEvent(new CustomEvent('uwu:app-resume', {
                    detail: { reason, elapsedMs, resumedAt: now }
                }));
                console.log(`[KeepAlive] 页面恢复，已补跑任务；挂起约 ${Math.round(elapsedMs / 1000)} 秒`);
            }
            updateRunningStatus();
        } finally {
            recoveryRunning = false;
        }
    }

    function handleVisibilityChange() {
        if (!enabled) return;
        if (document.visibilityState === 'hidden') {
            hiddenAt = Date.now();
            writeCheckpoint('hidden');
            updateRunningStatus();
        } else {
            runRecovery('visibilitychange');
        }
    }

    function bindLifecycleListeners() {
        if (listenersBound) return;
        listenersBound = true;
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('freeze', () => {
            if (!enabled) return;
            hiddenAt = hiddenAt || Date.now();
            writeCheckpoint('freeze');
        });
        document.addEventListener('resume', () => runRecovery('resume'));
        window.addEventListener('pagehide', () => {
            if (!enabled) return;
            hiddenAt = hiddenAt || Date.now();
            writeCheckpoint('pagehide');
        });
        window.addEventListener('pageshow', event => {
            if (enabled && event.persisted) runRecovery('pageshow');
        });
        window.addEventListener('online', () => {
            if (enabled) runRecovery('online');
        });
    }

    async function enable(options) {
        enabled = true;
        bindLifecycleListeners();
        startHeartbeat();
        mode = readMode();
        setStatus('正在启动持续运行增强…', 'starting');
        await startChannels();
        await requestWakeLock();
        updateRunningStatus();
        return isRunning().any;
    }

    async function disable() {
        enabled = false;
        removeGestureFallback();
        stopHeartbeat();
        hiddenAt = 0;

        if (wakeLock && !wakeLock.released) {
            try { await wakeLock.release(); } catch (error) {}
        }
        wakeLock = null;

        stopChannels();
        updateMediaSession(false);
        setStatus('未开启', 'off');
        return true;
    }

    async function setEnabled(value, options) {
        return value ? enable(options) : disable();
    }

    /* 切换保活方式：开了就热切换通道，没开就只记录 */
    async function setMode(next, options) {
        if (VALID_MODES.indexOf(next) === -1) return false;
        const wasEnabled = enabled;
        if (wasEnabled) await disable();
        writeMode(next);
        if (wasEnabled) await enable(options);
        window.dispatchEvent(new CustomEvent('uwu:keepalive-mode', { detail: { mode: next } }));
        return true;
    }

    window.KeepAliveManager = {
        init(value) {
            bindLifecycleListeners();
            mode = readMode();
            return setEnabled(Boolean(value), { userInitiated: false });
        },
        setEnabled,
        setMode,
        getMode: () => mode || readMode(),
        recover: runRecovery,
        isEnabled() { return enabled; },
        isRunning,
        /** 给"进入画中画"按钮用：必须在用户点击手势内调用 */
        enterPip: () => startPip()
    };

    // 兼容旧调用入口。
    window.toggleKeepAlive = value => window.KeepAliveManager.setEnabled(Boolean(value), { userInitiated: true });
})();
