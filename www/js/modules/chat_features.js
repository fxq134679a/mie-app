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
    let recognition = null;
    let isRecording = false;
    let inputMode = localStorage.getItem('voice_input_mode') || 'voice';
    let currentLang = localStorage.getItem('voice_lang') || 'zh-CN';
    let isAutoStart = localStorage.getItem('voice_auto_start') === 'true';
    let finalTranscript = '';
    let pressTimer = null;
    let isPressing = false;

    const langNames = {
        'zh-CN': '普通话（简体）', 'zh-TW': '普通话（繁体）',
        'en-US': 'English (US)', 'en-GB': 'English (UK)',
        'ja-JP': '日本語', 'ko-KR': '한국어',
        'fr-FR': 'Français', 'de-DE': 'Deutsch'
    };

    function initRecognition() {
        if (!SpeechRecognition) return;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = currentLang;

        recognition.onstart = () => {
            isRecording = true;
            voiceMicBtn.classList.add('recording');
            sendVoiceModal.classList.add('recording-active');
            closeSettingsPopup();
        };

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += t;
                } else {
                    interim += t;
                }
            }
            const full = finalTranscript + interim;
            transcriptText.innerHTML = finalTranscript + (interim ? '<span class="interim">' + interim + '</span>' : '');
            if (full) {
                transcriptArea.classList.add('has-text');
                transcriptPlaceholder.style.display = 'none';
            }
        };

        recognition.onerror = (event) => {
            console.warn('语音识别错误:', event.error);
            stopRecording();
        };

        recognition.onend = () => {
            if (isRecording) {
                try { recognition.start(); } catch (e) {}
            }
        };
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
        if (inputMode === 'voice') {
            langSection.style.display = '';
            autoSection.style.display = '';
        } else {
            langSection.style.display = 'none';
            autoSection.style.display = 'none';
        }
    }

    function updateLangUI() {
        voiceLangCurrent.textContent = langNames[currentLang] || currentLang;
        document.querySelectorAll('.voice-lang-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === currentLang);
        });
    }

    function startRecording() {
        if (!recognition) {
            initRecognition();
            if (!recognition) return;
        }
        finalTranscript = '';
        transcriptText.innerHTML = '';
        transcriptArea.classList.remove('has-text');
        transcriptPlaceholder.style.display = '';
        try {
            recognition.start();
        } catch (e) {
            try { recognition.stop(); } catch (e2) {}
            setTimeout(() => { try { recognition.start(); } catch (e3) {} }, 100);
        }
    }

    function stopRecording() {
        isRecording = false;
        if (recognition) {
            try { recognition.stop(); } catch (e) {}
        }
        voiceMicBtn.classList.remove('recording');
        sendVoiceModal.classList.remove('recording-active');
    }

    function sendVoiceMessage() {
        const text = finalTranscript.trim();
        if (!text) return;
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

    function openTextInput() {
        stopRecording();
        sendVoiceModal.classList.remove('visible');
        setTimeout(() => {
            const inputEl = document.getElementById('message-input');
            if (inputEl) inputEl.focus();
        }, 200);
    }

    // 长按检测
    function onPressStart(e) {
        if (e) e.preventDefault();
        if (inputMode !== 'voice') return;
        isPressing = true;
        pressTimer = setTimeout(() => {
            if (isPressing) startRecording();
        }, 400);
    }

    function onPressEnd(e) {
        if (e) e.preventDefault();
        clearTimeout(pressTimer);
        if (isPressing && isRecording) {
            stopRecording();
            setTimeout(sendVoiceMessage, 300);
        }
        isPressing = false;
    }

    voiceMicBtn.addEventListener('touchstart', onPressStart, { passive: false });
    voiceMicBtn.addEventListener('touchend', onPressEnd, { passive: false });
    voiceMicBtn.addEventListener('mousedown', onPressStart);
    voiceMicBtn.addEventListener('mouseup', onPressEnd);
    voiceMicBtn.addEventListener('mouseleave', () => { if (isPressing) onPressEnd(); });

    voiceMicBtn.addEventListener('click', () => {
        if (inputMode !== 'voice') return;
        if (isAutoStart) {
            if (isRecording) {
                stopRecording();
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
    voiceMessageBtn.addEventListener('click', () => {
        updateInputModeUI();
        updateLangUI();
        sendVoiceModal.classList.add('visible');
        if (inputMode === 'voice' && isAutoStart) {
            setTimeout(startRecording, 400);
        }
    });

    initRecognition();
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
}

function sendMyTransfer(amount, remark) {
    document.getElementById('send-transfer-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
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
            if (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients) {
                currentGroupAction.recipients.forEach(recipientId => {
                    const recipient = chat.members.find(m => m.id === recipientId);
                    if (recipient) {
                        const content = `[${chat.me.nickname} 向 ${recipient.realName} 转账：${amount}元；备注：${remark}]`;
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

function handleReceivedTransferClick(messageId) {
    currentTransferMessageId = messageId;
    document.getElementById('receive-transfer-actionsheet').classList.add('visible');
}

async function respondToTransfer(action) {
    if (!currentTransferMessageId) return;
    const character = db.characters.find(c => c.id === currentChatId);
    const message = character.history.find(m => m.id === currentTransferMessageId);
    if (message) {
        message.transferStatus = action;
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
