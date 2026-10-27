// --- 通话记录模块（跨角色聚合 + 语音回放） ---
// 音频存储：IndexedDB uwu_call_db / callAudio，键为 audioId（callRecordId:msgIndex）

const CALL_DB = 'uwu_call_db';
const CALL_STORE = 'callAudio';

function openCallDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CALL_DB, 1);
        req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains(CALL_STORE)) {
                const s = d.createObjectStore(CALL_STORE, { keyPath: 'id' });
                s.createIndex('recordId', 'recordId');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

window.CallAudioStore = {
    async put(id, blob, recordId) {
        try {
            const d = await openCallDb();
            await new Promise((resolve, reject) => {
                const tx = d.transaction(CALL_STORE, 'readwrite');
                tx.objectStore(CALL_STORE).put({ id, recordId, blob, createdAt: Date.now() });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { console.warn('通话音频保存失败:', e); }
    },
    async get(id) {
        try {
            const d = await openCallDb();
            return await new Promise((resolve) => {
                const r = d.transaction(CALL_STORE).objectStore(CALL_STORE).get(id);
                r.onsuccess = () => resolve(r.result ? r.result.blob : null);
                r.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    },
    async deleteByRecord(recordId) {
        try {
            const d = await openCallDb();
            await new Promise((resolve) => {
                const tx = d.transaction(CALL_STORE, 'readwrite');
                const idx = tx.objectStore(CALL_STORE).index('recordId');
                const req = idx.openCursor(IDBKeyRange.only(recordId));
                req.onsuccess = (ev) => {
                    const cursor = ev.target.result;
                    if (cursor) { cursor.delete(); cursor.continue(); }
                };
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
        } catch (e) { /* 忽略 */ }
    }
};

const CR_PLAY_SVG = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg>`;
const CR_PAUSE_SVG = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/></svg>`;

const CallRecordsModule = {
    _audio: null,
    _btn: null,

    open: function() {
        this.render();
        switchScreen('call-records-screen');
    },

    render: function() {
        const list = document.getElementById('cr-list');
        if (!list) return;
        this._stopAudio();
        list.innerHTML = '';

        const entries = [];
        const collect = (chats, type) => {
            (chats || []).forEach(chat => {
                (chat.callHistory || []).forEach(rec => {
                    entries.push({ rec, chat, type });
                });
            });
        };
        collect(db.characters, 'private');
        collect(db.groups, 'group');

        if (!entries.length) {
            list.innerHTML = '<div class="cr-empty">暂无通话记录</div>';
            return;
        }

        entries.sort((a, b) => b.rec.startTime - a.rec.startTime);

        entries.forEach(({ rec, chat, type }) => {
            const name = type === 'private' ? (chat.remarkName || chat.name) : chat.name;
            const avatar = chat.avatar || 'https://i.postimg.cc/1zsGZ85M/Camera_1040g3k831o3b7f1bkq105oaltnigkev8gp3kia8.jpg';
            const date = new Date(rec.startTime);
            const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            const durMin = Math.floor(rec.duration / 60);
            const durSec = rec.duration % 60;
            const durationStr = `${durMin}分${durSec.toString().padStart(2, '0')}秒`;
            const typeText = rec.type === 'video' ? '视频通话' : '语音通话';

            const item = document.createElement('div');
            item.className = 'cr-item';

            const header = document.createElement('div');
            header.className = 'cr-header';
            const typeIcon = rec.type === 'video'
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>`;
            header.innerHTML = `
                <div class="cr-avatar" style="background-image:url('${avatar}')"></div>
                <div class="cr-info">
                    <div class="cr-name">${name}</div>
                    <div class="cr-sub"><span class="cr-type-icon ${rec.type}">${typeIcon}</span><span>${typeText} · ${durationStr}</span></div>
                </div>
                <div class="cr-date">${dateStr}</div>
                <div class="cr-arrow"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg></div>
            `;

            const detail = document.createElement('div');
            detail.className = 'cr-detail';

            let html = '';
            if (rec.summary) {
                html += `<div class="cr-summary"><div class="cr-summary-label">通话总结</div>${rec.summary}</div>`;
            }
            const ctx = rec.context || [];
            if (ctx.length) {
                const myName = chat.myName || '我';
                ctx.forEach((msg, i) => {
                    const isUser = msg.role === 'user';
                    const roleTag = isUser ? myName : name;
                    if (msg.type === 'sound') {
                        html += `
                            <div class="cr-sound-hint">
                                <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="6" width="2.5" height="4" rx="1"/><rect x="6.75" y="3" width="2.5" height="10" rx="1"/><rect x="11.5" y="6" width="2.5" height="4" rx="1"/></svg>
                                <span>${msg.content}</span>
                            </div>
                        `;
                        return;
                    }
                    if (msg.type === 'visual') {
                        html += `
                            <div class="cr-msg visual ${isUser ? 'user' : 'assistant'}">
                                <div class="cr-role-tag">${roleTag}</div>
                                <div class="cr-msg-row"><div class="cr-bubble">${msg.content}</div></div>
                            </div>
                        `;
                    } else {
                        const audioId = msg.audioId
                            ? `<button class="cr-play-btn" data-audio-id="${msg.audioId}">${CR_PLAY_SVG}</button>`
                            : '';
                        html += `
                            <div class="cr-msg ${isUser ? 'user' : 'assistant'}">
                                <div class="cr-role-tag">${roleTag}</div>
                                <div class="cr-msg-row">
                                    ${audioId}
                                    <div class="cr-bubble">${msg.content}</div>
                                </div>
                            </div>
                        `;
                    }
                });
            } else {
                html += '<div class="cr-audio-tip">无通话内容</div>';
            }
            detail.innerHTML = html;

            header.addEventListener('click', () => {
                const isOpen = item.classList.contains('open');
                document.querySelectorAll('.cr-item.open').forEach(el => el.classList.remove('open'));
                if (!isOpen) item.classList.add('open');
                else this._stopAudio();
            });

            detail.querySelectorAll('.cr-play-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._togglePlay(btn.dataset.audioId, btn);
                });
            });

            item.appendChild(header);
            item.appendChild(detail);
            list.appendChild(item);
        });
    },

    _togglePlay: async function(audioId, btn) {
        if (this._audio && this._btn === btn) {
            this._stopAudio();
            return;
        }
        this._stopAudio();
        const blob = await window.CallAudioStore.get(audioId);
        if (!blob) {
            showToast('音频不存在或已被清理');
            return;
        }
        const audio = new Audio(URL.createObjectURL(blob));
        this._audio = audio;
        this._btn = btn;
        btn.classList.add('playing');
        btn.innerHTML = CR_PAUSE_SVG;
        audio.onended = () => this._stopAudio();
        audio.onerror = () => this._stopAudio();
        audio.play().catch(() => this._stopAudio());
    },

    _stopAudio: function() {
        if (this._audio) {
            try { this._audio.pause(); } catch (e) {}
            if (this._audio.src) URL.revokeObjectURL(this._audio.src);
            this._audio = null;
        }
        if (this._btn) {
            this._btn.classList.remove('playing');
            this._btn.innerHTML = CR_PLAY_SVG;
            this._btn = null;
        }
    }
};

window.CallRecordsModule = CallRecordsModule;
