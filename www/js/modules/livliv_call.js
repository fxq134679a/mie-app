// js/modules/livliv_call.js
// LivLiv 2.5D 通话形象模块（ES module，经 <script type="module"> 加载）
// 依赖：/livliv/pkg/index.js（Player）、/livliv/pkg/voice.js（createSpeech）
// 职责：语音通话页中央渲染角色画布、TTS 播放时口型同步、台词情绪联动表情、摄像头自视图开关

import { Player } from '/livliv/pkg/index.js';
import { createSpeech } from '/livliv/pkg/voice.js';

const CHARACTERS = [
    { id: 'k01', name: 'Sena' },
    { id: 'k02', name: 'Elio' },
    { id: 'd01', name: 'Yui' },
    { id: 'd02', name: 'Leo' },
    { id: 'd03', name: 'Nana' },
    { id: 's01', name: 'Hana' },
    { id: 'q02', name: 'Mochi' },
    { id: 'q03', name: 'Kotaro' },
    { id: 'p01', name: 'Kujira' }
];

/* 台词关键词 → 表情/动作映射（表情 ID 跨模型统一：smile/shy/angry/sad） */
const REACT_RULES = [
    { re: /笑|哈哈|嘿嘿|嘻嘻|开心|高兴|好耶|太好了|喜欢你|爱你/, exp: 'smile', act: null },
    { re: /害羞|脸红|不好意思|讨厌啦|人家|抱抱/, exp: 'shy', act: 'shy' },
    { re: /生气|气死|哼|讨厌|不理你|怒/, exp: 'angry', act: 'shake' },
    { re: /哭|难过|委屈|呜|伤心|对不起|想你/, exp: 'sad', act: null }
];

function supportsLivliv() {
    try { return typeof Player === 'function' && Player.isSupported(); } catch (e) { return false; }
}

const LivlivCall = {
    CHARACTERS,
    supported: supportsLivliv(),

    _player: null,
    _speech: null,
    _modelId: null,
    _waiters: [],
    _camStream: null,
    _canvas: null,
    _hideTimer: null,

    /* ---- 舞台可见性：只在 AI 说话时出现 ---- */
    _stageEl: function () {
        return document.getElementById('vc-livliv-stage');
    },
    showStage: function () {
        const stage = this._stageEl();
        if (!stage || !this._player) return;
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        stage.style.display = 'flex';
        requestAnimationFrame(() => stage.classList.add('on'));
    },
    hideStage: function (delay) {
        const stage = this._stageEl();
        if (!stage) return;
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        const doHide = () => {
            stage.classList.remove('on');
            setTimeout(() => { if (!stage.classList.contains('on')) stage.style.display = 'none'; }, 350);
        };
        if (delay) this._hideTimer = setTimeout(doHide, delay);
        else doHide();
    },

    /* ---- 挂载：把角色画到通话页中央的 canvas ---- */
    mount: async function (canvas, modelId) {
        if (!this.supported || !canvas) return false;
        this._canvas = canvas;
        const id = (modelId && CHARACTERS.some(c => c.id === modelId)) ? modelId : 'k01';
        try {
            if (!this._player) {
                canvas.width = 1024;
                canvas.height = 1536;
                this._player = new Player(canvas, { followPointer: 'canvas', idle: true });
            }
            if (this._modelId !== id || true) {
                // 每次通话重新 load：保证状态干净（load 会替换正在运行的模型）
                const base = new URL('livliv/characters/' + id + '/', location.href).href;
                await this._player.load(base);
                this._modelId = id;
            }
            return true;
        } catch (e) {
            console.warn('LivLiv 形象加载失败:', e);
            return false;
        }
    },

    /* ---- 语音：接管 MinimaxVoice 的播放（say 自带播放 + 口型驱动） ---- */
    ensureSpeech: function () {
        if (!this._player) return null;
        if (!this._speech) {
            const self = this;
            this._speech = createSpeech(this._player);
            this._speech.onIdle = () => {
                // 说完这一句：放完结尾缓冲再退场
                self.hideStage(900);
                const ws = self._waiters; self._waiters = [];
                ws.forEach(cb => { try { cb(); } catch (e) {} });
            };
        }
        return this._speech;
    },

    unlock: function () {
        try { if (this._speech) this._speech.unlock(); } catch (e) {}
    },

    /* playBlob 钩子：blob 交给 LivLiv speech 播放并驱动口型；返回带 addEventListener('ended') 的假 audio */
    playBlobHook: function (blob) {
        const speech = this.ensureSpeech();
        if (!speech) return null;
        this.showStage();
        speech.say(blob);
        const self = this;
        return {
            addEventListener: function (type, cb) {
                if (type !== 'ended' || typeof cb !== 'function') return;
                if (!speech.busy) { queueMicrotask(cb); return; }
                self._waiters.push(cb);
            }
        };
    },

    /* 中断播放（挂断时用） */
    stopSpeech: function () {
        try { if (this._speech) this._speech.stop(); } catch (e) {}
        const ws = this._waiters; this._waiters = [];
        ws.forEach(cb => { try { cb(); } catch (e) {} });
        this.hideStage();
    },

    /* ---- 台词情绪联动：按关键词切换表情 / 小动作 ---- */
    react: function (content) {
        if (!this._player || !content) return;
        const text = String(content);
        for (const rule of REACT_RULES) {
            if (rule.re.test(text)) {
                try { this._player.setExpression(rule.exp); } catch (e) {}
                if (rule.act) { try { this._player.act(rule.act); } catch (e) {} }
                return;
            }
        }
        // 无情绪词：随机点头，保持"活人感"
        if (Math.random() < 0.35) {
            try { this._player.act('nod'); } catch (e) {}
        }
    },

    /* ---- 摄像头自视图 ---- */
    startCamera: async function () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        try {
            this.stopCamera();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 720 } }, audio: false
            });
            this._camStream = stream;
            return stream;
        } catch (e) {
            console.warn('摄像头开启失败:', e);
            return false;
        }
    },

    stopCamera: function () {
        if (this._camStream) {
            this._camStream.getTracks().forEach(t => t.stop());
            this._camStream = null;
        }
    },

    /* ---- 通话结束清理 ---- */
    destroy: function () {
        this.stopCamera();
        this.stopSpeech();
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        try {
            if (this._speech) { this._speech.dispose && this._speech.dispose(); }
        } catch (e) {}
        this._speech = null;
        try { if (this._player) this._player.dispose(); } catch (e) {}
        this._player = null;
        this._modelId = null;
        this._canvas = null;
    }
};

window.LivlivCall = LivlivCall;
