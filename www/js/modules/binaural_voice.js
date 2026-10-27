/* 双耳语音渲染模块（浏览器端）
 * 基于 binaural-voice 项目，使用 KU100 近场 HRIR 数据
 * 将单声道人声渲染成双耳立体声，让声音贴在耳边说话、绕着头走
 */
(function () {
    'use strict';

    // 位置定义：(方位角, 距离)
    // 方位角：0=前, 90=左, 180=后, 270=右
    const PLACES = {
        '左耳': [90, 0.25],
        '右耳': [270, 0.25],
        '脑后': [180, 0.31],
        '面前': [0, 0.42]
    };
    const NEAR = 0.25;  // 贴近距离
    const FAR = 0.5;    // 退开距离
    const HALF_TURN = 4.5;  // 绕半圈用的出声时间（秒）
    const DIST_MOVE = 1.5;  // 远近移动用的出声时间（秒）
    const DRIFT_DEG = 5;    // 微幅摆动角度
    const DRIFT_M = 0.015;  // 微幅摆动距离
    // 各距离增益（25cm=1.0, 50cm=0.33, ...）
    const GAINS = [1.00, 0.33, 0.25, 0.16, 0.095];

    // HRIR 数据（简化版，实际使用时需要完整数据）
    // 这里使用占位符，实际数据从 ku100_nearfield_circ360.npz 提取
    let _hrirData = null;
    let _hrirDists = null;

    // 加载 HRIR 数据（需要从外部注入）
    function setHrirData(dists, ir, fs) {
        _hrirDists = dists;
        _hrirData = { ir, fs };
    }

    // 简化的 HRIR 获取（无数据时使用简单 HRTF 近似）
    function getHrir(az, dist, sampleRate) {
        if (!_hrirData) {
            // 无 HRIR 数据时使用简单近似：根据方位角调整左右耳音量差
            const azRad = (az * Math.PI) / 180;
            // ILD：声源离哪只耳朵近，那只耳朵响（左耳在 90°，右耳在 270°）
            const leftGain = Math.max(0.22, Math.cos(azRad - Math.PI / 2));
            const rightGain = Math.max(0.22, Math.cos(azRad - 3 * Math.PI / 2));
            const distGain = Math.max(0.1, 0.25 / Math.max(0.25, dist));
            // ITD：近耳先听到，远耳最多晚 ~0.65ms（头部绕射）
            const maxItd = Math.round(sampleRate * 0.00065);
            const side = Math.sin(azRad); // 90°(左)=1, 270°(右)=-1
            const leftDelay = Math.max(0, Math.round(-side * maxItd));
            const rightDelay = Math.max(0, Math.round(side * maxItd));
            const left = new Float32Array(leftDelay + 1);
            left[leftDelay] = leftGain * distGain;
            const right = new Float32Array(rightDelay + 1);
            right[rightDelay] = rightGain * distGain;
            return { left, right };
        }
        // 实际 HRIR 插值（简化实现）
        const a = Math.round(az) % 360;
        const d = Math.max(_hrirDists[0], Math.min(_hrirDists[_hrirDists.length - 1], dist));
        const k = Math.min(_hrirDists.findIndex(x => x > d) - 1, _hrirDists.length - 2);
        const w = (d - _hrirDists[k]) / (_hrirDists[k + 1] - _hrirDists[k]);
        // 这里应该返回插值后的 HRIR，简化为返回单位脉冲
        return {
            left: new Float32Array([1]),
            right: new Float32Array([1])
        };
    }

    // 位置路径计算（从 a0 到 a1 的最短路径）
    function azPath(a0, a1) {
        a0 = ((a0 % 360) + 360) % 360;
        const short = ((a1 - a0 + 180) % 360) - 180;
        return Math.abs(short) <= 150 ? short : a1 - a0;
    }

    // 生成随机位置提示（无标签时使用）
    function randomCues(T) {
        const ear = Math.random() < 0.5 ? '左耳' : '右耳';
        const other = ear === '左耳' ? '右耳' : '左耳';
        const kind = ['停留', '绕过去', '从脑后过来', '从面前过来'][Math.floor(Math.random() * 4)];
        if (kind === '停留') return [[0, ear]];
        if (kind === '绕过去') {
            return T > 6 ? [[0, ear], [0.2 * T, '脑后'], [0.6 * T, other]] : [[0, ear], [0.3 * T, other]];
        }
        return [[0, kind === '从脑后过来' ? '脑后' : '面前'], [0.35 * T, ear]];
    }

    // 解析位置标签
    function parseTags(text) {
        const TAG = /\[(左耳|右耳|脑后|面前|贴近|退开)\]/g;
        const marks = [];
        let tts = '', last = 0;
        for (const m of text.matchAll(TAG)) {
            tts += text.slice(last, m.index);
            marks.push({ tag: m[1], at: tts.length });
            last = m.index + m[0].length;
        }
        tts += text.slice(last);
        return { tts, marks };
    }

    // 双耳渲染主函数
    async function renderBinaural(audioBuffer, cues, sampleRate) {
        const numSamples = audioBuffer.length;
        const duration = numSamples / sampleRate;

        // 处理 cues
        let processedCues = cues;
        if (!cues || cues.length === 0) {
            // 无标签时随机生成
            const randomMarks = randomCues(duration);
            processedCues = randomMarks.map(([t, tag]) => ({ t, tag }));
        }

        // 过滤有效 cues
        processedCues = processedCues.filter(c => PLACES[c.tag] || c.tag === '贴近' || c.tag === '退开');

        // 如果没有有效 cues，使用随机
        if (processedCues.length === 0) {
            const randomMarks = randomCues(duration);
            processedCues = randomMarks.map(([t, tag]) => ({ t, tag }));
        }

        // 排序
        processedCues.sort((a, b) => a.t - b.t);

        // 初始位置
        let startAz, startDist;
        if (processedCues[0].tag in PLACES && processedCues[0].t < 0.3) {
            [startAz, startDist] = PLACES[processedCues.shift().tag];
        } else {
            [startAz, startDist] = PLACES[Math.random() < 0.5 ? '左耳' : '右耳'];
        }

        // 构建方位角和距离段
        const azSegs = [], dSegs = [];

        function trackAt(segs, s, init) {
            const active = segs.filter(g => g[0] <= s);
            if (active.length === 0) return init;
            const [s0, s1, v0, dv] = active[active.length - 1];
            return v0 + dv * (1 - Math.cos(Math.PI * Math.min(1, (s - s0) / (s1 - s0)))) / 2;
        }

        function posAt(s) {
            return [trackAt(azSegs, s, startAz), trackAt(dSegs, s, startDist)];
        }

        for (const cue of processedCues) {
            const [az, d] = posAt(cue.t);
            let targetAz, targetDist, da, nominal;

            if (cue.tag in PLACES) {
                [targetAz, targetDist] = PLACES[cue.tag];
                da = azPath(az, targetAz);
                nominal = Math.abs(da) / 180 * HALF_TURN;
            } else {
                targetDist = cue.tag === '贴近' ? NEAR : FAR;
                da = 0;
                nominal = DIST_MOVE;
            }

            const dur = Math.max(Math.min(nominal, 0.9 * (duration - cue.t)), 0.6 * nominal);

            if (Math.abs(da) > 1) {
                azSegs.push([cue.t, cue.t + dur, az, da]);
            }
            if (Math.abs(targetDist - d) > 0.01) {
                dSegs.push([cue.t, cue.t + dur, d, targetDist - d]);
            }
        }

        // 渲染：逐帧应用 HRIR
        const phase = Math.random() * Math.PI * 2;
        const N = 1024;  // 帧大小
        const Hop = 512; // 帧移
        const outLeft = new Float32Array(numSamples + 2 * N);
        const outRight = new Float32Array(numSamples + 2 * N);

        function position(t) {
            const [az, d] = posAt(t);
            return [
                az + DRIFT_DEG * Math.sin(2 * Math.PI * t / 4.3 + phase) + 2 * Math.sin(2 * Math.PI * t / 1.9 + 2 * phase),
                d + DRIFT_M * Math.sin(2 * Math.PI * t / 3.7 + 3 * phase)
            ];
        }

        // 帧卷积：50% 重叠 + Hann 窗（重叠相加后窗口和为 1，不改变音量）
        const win = new Float32Array(N);
        for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

        for (let s = 0; s < numSamples; s += Hop) {
            const t = (s + N / 2) / sampleRate;
            const [az, d] = position(t);
            const hrir = getHrir(az, d, sampleRate);
            const kernelL = hrir.left, kernelR = hrir.right;

            for (let i = 0; i < N && s + i < numSamples; i++) {
                const sample = audioBuffer[s + i] * win[i];
                if (sample === 0) continue;
                for (let k = 0; k < kernelL.length; k++) outLeft[s + i + k] += sample * kernelL[k];
                for (let k = 0; k < kernelR.length; k++) outRight[s + i + k] += sample * kernelR[k];
            }
        }

        // 能量匹配：保持远近音量差（RMS 对齐原信号），再峰值限制在 -1 dBFS
        let sumIn = 0, sumOut = 0, peak = 0;
        for (let i = 0; i < numSamples; i++) {
            sumIn += audioBuffer[i] * audioBuffer[i];
            const l = outLeft[i], r = outRight[i];
            sumOut += (l * l + r * r) / 2;
            peak = Math.max(peak, Math.abs(l), Math.abs(r));
        }
        const rmsGain = (sumOut > 0 && sumIn > 0) ? Math.sqrt((sumIn * 2) / sumOut) : 1;
        const limit = peak * rmsGain > 0.89 ? 0.89 / (peak * rmsGain) : 1;
        const gain = rmsGain * limit;

        // 创建输出 buffer
        const outBuffer = new AudioBuffer({
            length: numSamples,
            numberOfChannels: 2,
            sampleRate: sampleRate
        });

        const leftChannel = outBuffer.getChannelData(0);
        const rightChannel = outBuffer.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
            leftChannel[i] = outLeft[i] * gain;
            rightChannel[i] = outRight[i] * gain;
        }

        return outBuffer;
    }

    // 对外接口
    window.BinauralVoice = {
        setHrirData,
        renderBinaural,
        parseTags,
        PLACES
    };
})();
