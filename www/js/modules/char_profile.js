// --- 角色档案：根据人设自动生成（仅供自己查看，不进入任何对话/生成调用） ---
(function () {
    'use strict';

    var _generating = {}; // charId -> Promise，防并发
    var PROFILE_VERSION = 2; // 档案提示词版本：升级后旧档案会自动重新生成

    function charById(charId) {
        return (db.characters || []).find(function (c) { return c.id === charId; });
    }

    function buildPrompt(char) {
        return '你是角色档案撰写助手。请根据下面给定的角色设定，为该角色生成一份角色档案。'
            + '严格按照如下 JSON 格式输出，不要输出任何多余文字、不要使用 markdown 代码块：\n'
            + '{"personality":"性格描述，20~40字，多个特质用顿号分隔","likes":"喜好，若干项用顿号分隔","quote":"一句能代表TA的语录，12~30字，不要自带引号","background":"人设背景概括，60~90字，概括角色的出身、经历与当前处境，简洁凝练"}\n\n'
            + '角色姓名：' + (char.realName || '未知') + '\n'
            + '角色昵称：' + (char.remarkName || '') + '\n'
            + '角色人设：' + (char.persona || '（未提供，请合理虚构一份与名字气质相符的设定）');
    }

    function parseProfile(raw) {
        var text = String(raw || '');
        var start = text.indexOf('{');
        var end = text.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('返回内容不是有效 JSON');
        var obj = JSON.parse(text.slice(start, end + 1));
        return {
            personality: String(obj.personality || '').trim(),
            likes: String(obj.likes || '').trim(),
            quote: String(obj.quote || '').trim(),
            background: String(obj.background || '').trim()
        };
    }

    function paintModal(char) {
        var modal = document.getElementById('profile-card-modal');
        if (!modal || !modal.classList.contains('visible')) return;
        if (!char || modal.dataset.charId !== char.id) return;

        var p = char.profile;
        var personaEmpty = !(char.persona && char.persona.trim());
        var fields = [
            { id: 'pc2-personality', val: p && p.personality, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '等待生成…' },
            { id: 'pc2-likes', val: p && p.likes, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '等待生成…' },
            { id: 'pc2-background', val: p && p.background, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '等待生成…' }
        ];
        fields.forEach(function (f) {
            var el = document.getElementById(f.id);
            if (!el) return;
            if (f.val) {
                el.textContent = f.val;
                el.classList.remove('is-loading');
            } else {
                el.textContent = f.fallback;
                el.classList.add('is-loading');
            }
        });
        var quoteEl = document.getElementById('pc2-quote');
        if (quoteEl) {
            if (p && p.quote) {
                // 前后引号随语录一起输出（黑色），去掉模型自带引号避免重复
                var q = String(p.quote).replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '');
                quoteEl.textContent = '\u201C' + q + '\u201D';
                quoteEl.classList.remove('is-loading');
            } else {
                quoteEl.textContent = personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '等待生成…';
                quoteEl.classList.add('is-loading');
            }
        }

        var regenBtn = document.getElementById('pc-regen-btn');
        if (regenBtn) regenBtn.disabled = !!(_generating[char.id] || personaEmpty);
    }

    // 调 API 生成（只发送姓名与人设文本；生成结果仅存本地供查看）
    async function generate(charId, opts) {
        opts = opts || {};
        var char = charById(charId);
        if (!char) throw new Error('角色不存在');
        if (_generating[charId]) return _generating[charId];

        var task = (async function () {
            if (typeof resolveAuxiliaryApiConfig !== 'function' || typeof buildChatApiRequest !== 'function' || typeof fetchAiResponse !== 'function') {
                throw new Error('缺少 API 调用组件');
            }
            var apiConfig = resolveAuxiliaryApiConfig('charProfile');
            if (!apiConfig || !apiConfig.url || !apiConfig.key) {
                throw new Error('未配置 API，请先在 API 设置里填好接口');
            }

            var messages = [
                { role: 'system', content: '你只输出 JSON，不输出任何其他内容。' },
                { role: 'user', content: buildPrompt(char) }
            ];
            var req = buildChatApiRequest(apiConfig, messages, { temperature: 0.85 });
            var raw = await fetchAiResponse(apiConfig, req.requestBody, req.headers, req.endpoint);
            var profile = parseProfile(raw);
            profile.sourcePersona = char.persona || '';
            profile.promptVersion = PROFILE_VERSION;
            profile.generatedAt = Date.now();
            char.profile = profile;
            if (typeof saveData === 'function') await saveData();

            paintModal(char);
            if (typeof showToast === 'function') showToast('角色档案已生成');
            try { window.dispatchEvent(new CustomEvent('char-profile-updated', { detail: { charId: charId } })); } catch (e) { /* ignore */ }
            return profile;
        })();

        _generating[charId] = task;
        try {
            return await task;
        } finally {
            delete _generating[charId];
            var regenBtn = document.getElementById('pc-regen-btn');
            if (regenBtn) regenBtn.disabled = false;
        }
    }

    // 打开弹窗 / 人设变更后：档案缺失或人设已改动时自动补生成
    function ensureProfile(charId) {
        var char = charById(charId);
        if (!char) return;
        paintModal(char);
        var personaEmpty = !(char.persona && char.persona.trim());
        var stale = !char.profile || char.profile.sourcePersona !== (char.persona || '') || char.profile.promptVersion !== PROFILE_VERSION;
        if (personaEmpty || !stale) return;
        generate(charId).catch(function (err) {
            console.warn('[char_profile] 生成失败', err);
            if (typeof showToast === 'function') showToast(err.message || '角色档案生成失败');
            paintModal(char);
        });
    }

    // 聊天设置保存后调用：仅当人设非空且发生改动时才重新生成
    function maybeAutoGenerate(charId) {
        var char = charById(charId);
        if (!char) return;
        var personaEmpty = !(char.persona && char.persona.trim());
        if (personaEmpty) return;
        var stale = !char.profile || char.profile.sourcePersona !== char.persona || char.profile.promptVersion !== PROFILE_VERSION;
        if (!stale) return;
        if (_generating[charId]) return;
        if (typeof showToast === 'function') showToast('角色档案生成中…');
        generate(charId).catch(function (err) {
            console.warn('[char_profile] 自动生成失败', err);
            if (typeof showToast === 'function') showToast(err.message || '角色档案生成失败');
        });
    }

    function regenerate(charId) {
        var char = charById(charId);
        if (!char) return;
        if (_generating[charId]) return;
        var regenBtn = document.getElementById('pc-regen-btn');
        if (regenBtn) regenBtn.disabled = true;
        paintModal(char);
        generate(charId).catch(function (err) {
            console.warn('[char_profile] 重新生成失败', err);
            if (typeof showToast === 'function') showToast(err.message || '生成失败');
            paintModal(char);
        });
    }

    // 弹窗开着时收到更新事件 → 重绘
    window.addEventListener('char-profile-updated', function (e) {
        var char = charById(e.detail && e.detail.charId);
        if (char) paintModal(char);
    });

    window.MieCharProfile = {
        generate: generate,
        ensureProfile: ensureProfile,
        maybeAutoGenerate: maybeAutoGenerate,
        regenerate: regenerate,
        paintModal: paintModal
    };
})();
