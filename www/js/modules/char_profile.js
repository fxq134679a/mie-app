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
            { id: 'pc2-personality', val: p && p.personality, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '尚未生成，确认后自动生成' },
            { id: 'pc2-likes', val: p && p.likes, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '尚未生成，确认后自动生成' },
            { id: 'pc2-background', val: p && p.background, fallback: personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '尚未生成，确认后自动生成' }
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
                quoteEl.textContent = personaEmpty ? '暂无人设，先在聊天设置里填写人设吧' : '尚未生成，确认后自动生成';
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

    // 生成确认弹窗：触发生成必须经用户确认（仅联系人页面点开角色卡这一入口会调）
    function askGenerateConfirm(char, isRegen) {
        var existed = document.getElementById('cp-gen-confirm');
        if (existed) existed.remove();

        var overlay = document.createElement('div');
        overlay.id = 'cp-gen-confirm';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10010;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);';

        var card = document.createElement('div');
        card.style.cssText = 'width:280px;max-width:82vw;background:#fff;border-radius:16px;overflow:hidden;text-align:center;font-family:-apple-system,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25);';
        card.innerHTML =
            '<div style="padding:20px 18px 6px;">'
            + '<div id="cp-gen-title" style="font-size:16px;font-weight:600;color:#111;">' + (isRegen ? '重新生成角色档案？' : '生成角色档案？') + '</div>'
            + '<div style="margin-top:8px;font-size:13px;color:#666;line-height:1.5;">'
            + (isRegen ? '该角色的人设已变更，将使用新的人设重新生成档案。' : '将根据「' + (char.realName || '该角色') + '」的人设用 AI 生成一份仅供自己查看的角色档案。')
            + '</div>'
            + '</div>'
            + '<div style="display:flex;border-top:0.5px solid #d9d9de;margin-top:14px;">'
            + '<button type="button" id="cp-gen-cancel" style="flex:1;padding:13px 0;background:#fff;border:none;border-right:0.5px solid #d9d9de;font-size:15px;color:#007aff;">取消</button>'
            + '<button type="button" id="cp-gen-ok" style="flex:1;padding:13px 0;background:#fff;border:none;font-size:15px;color:#007aff;font-weight:600;">生成</button>'
            + '</div>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        var done = false;
        var close = function () {
            if (done) return;
            done = true;
            overlay.remove();
        };
        overlay.querySelector('#cp-gen-cancel').addEventListener('click', close);
        overlay.querySelector('#cp-gen-ok').addEventListener('click', function () {
            close();
            if (typeof showToast === 'function') showToast('角色档案生成中…');
            generate(char.id).catch(function (err) {
                console.warn('[char_profile] 生成失败', err);
                if (typeof showToast === 'function') showToast(err.message || '角色档案生成失败');
                paintModal(char);
            });
        });
        // 点遮罩取消
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }

    // 点开角色卡弹窗：已有档案且人设未变 → 不弹不生成（默认只生成一次）；
    // 档案缺失或人设变更/提示词版本升级 → 弹确认弹窗，用户确认后才生成
    function ensureProfile(charId) {
        var char = charById(charId);
        if (!char) return;
        paintModal(char);
        var personaEmpty = !(char.persona && char.persona.trim());
        if (personaEmpty) return;
        var stale = !char.profile || char.profile.sourcePersona !== (char.persona || '') || char.profile.promptVersion !== PROFILE_VERSION;
        if (!stale) return;
        askGenerateConfirm(char, !!char.profile);
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

    // —— 手动编辑档案：性格/喜好/语录/人设背景 全部可改 ——
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function editorField(label, id, val, rows) {
        return '<div style="margin-top:10px;">'
            + '<div style="font-size:12px;color:#666;margin-bottom:4px;">' + esc(label) + '</div>'
            + '<textarea id="' + id + '" rows="' + (rows || 2) + '" placeholder="留空则显示占位提示"'
            + ' style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #dcdce0;border-radius:8px;font-size:14px;line-height:1.5;color:#111;background:#f7f7f9;resize:none;-webkit-appearance:none;">'
            + esc(val || '') + '</textarea></div>';
    }

    function openEditor(charId) {
        var char = charById(charId);
        if (!char) return;
        var existed = document.getElementById('cp-edit-modal');
        if (existed) existed.remove();

        var p = char.profile || {};
        // 语录展示时套了「」引号，编辑框里显示去掉引号的原文
        var cleanQuote = String(p.quote || '').replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '');

        var overlay = document.createElement('div');
        overlay.id = 'cp-edit-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10012;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);padding:20px;';

        overlay.innerHTML =
            '<div style="width:340px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden;font-family:-apple-system,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25);">'
            + '<div style="padding:16px 18px 2px;font-size:16px;font-weight:600;color:#111;">编辑角色档案</div>'
            + '<div style="padding:2px 18px 0;font-size:12px;color:#999;">修改「' + esc(char.realName || char.remarkName || '该角色') + '」的档案内容，保存后立即生效</div>'
            + '<div style="flex:1;overflow-y:auto;padding:6px 18px 10px;">'
            + editorField('性格', 'cp-edit-personality', p.personality)
            + editorField('喜好', 'cp-edit-likes', p.likes)
            + editorField('语录', 'cp-edit-quote', cleanQuote)
            + editorField('人设背景', 'cp-edit-background', p.background, 4)
            + '</div>'
            + '<div style="display:flex;border-top:0.5px solid #d9d9de;">'
            + '<button type="button" id="cp-edit-cancel" style="flex:1;padding:13px 0;background:#fff;border:none;border-right:0.5px solid #d9d9de;font-size:15px;color:#007aff;">取消</button>'
            + '<button type="button" id="cp-edit-save" style="flex:1;padding:13px 0;background:#fff;border:none;font-size:15px;color:#007aff;font-weight:600;">保存</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);

        var close = function () { overlay.remove(); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#cp-edit-cancel').addEventListener('click', close);
        overlay.querySelector('#cp-edit-save').addEventListener('click', async function () {
            var get = function (id) {
                var el = overlay.querySelector('#' + id);
                return el ? String(el.value || '').trim() : '';
            };
            var profile = char.profile || {};
            profile.personality = get('cp-edit-personality');
            profile.likes = get('cp-edit-likes');
            profile.quote = get('cp-edit-quote');
            profile.background = get('cp-edit-background');
            // 手动编辑视为有效档案：与当前人设对齐，避免下次点开又弹"重新生成"把手改内容覆盖掉
            profile.sourcePersona = char.persona || '';
            profile.promptVersion = PROFILE_VERSION;
            profile.editedAt = Date.now();
            char.profile = profile;

            if (typeof saveData === 'function') await saveData();
            close();
            paintModal(char);
            try { window.dispatchEvent(new CustomEvent('char-profile-updated', { detail: { charId: charId } })); } catch (e) { /* ignore */ }
            if (typeof showToast === 'function') showToast('档案已保存');
        });
    }

    window.MieCharProfile = {
        generate: generate,
        ensureProfile: ensureProfile,
        regenerate: regenerate,
        paintModal: paintModal,
        openEditor: openEditor
    };
})();
