// --- 世界书触发引擎 (js/modules/worldbook_engine.js) ---
// 酒馆式世界书逻辑：关键词触发（主/次键、正则、大小写、全词、次键逻辑）、
// 生效范围（私聊/群聊/全部）、扫描深度、概率、互斥组、黏着/冷却/延迟、
// 递归扫描、优先级分块（破限/高/中/低）、聊天记录深度注入、字符预算截断。
// 依赖：db.js（db.worldBooks / db.worldBookTimedState / saveData）

// 关键词切分：中英文逗号、顿号、换行
function wbSplitKeys(v) {
    if (Array.isArray(v)) return v.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
    if (typeof v !== 'string') return [];
    return v.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
}

function wbToNum(v, def) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
}

// 过短关键词（拉丁字母数字不足 2 个且中文不足 2 字）不参与约束
function wbIsShortKey(key) {
    const k = String(key || '');
    if (!k) return true;
    const latin = k.match(/[a-z0-9]/gi);
    if (latin && latin.length >= 2) return false;
    const cjk = k.match(/[\u4e00-\u9fa5]/g);
    if (cjk && cjk.length >= 2) return false;
    return true;
}

// /pattern/flags 形式的正则关键词
function wbParseSlashRegex(key) {
    const m = /^\/(.*)\/([a-z]*)$/.exec(key);
    if (!m) return null;
    if (!/^[gimsuy]*$/.test(m[2] || '')) return null;
    try {
        return new RegExp(m[1], (m[2] || '').replace(/g/g, ''));
    } catch (e) {
        return null;
    }
}

function wbMatchKey(text, key, opts) {
    if (!text || !key) return false;
    if (wbIsShortKey(key)) return true;
    const re = wbParseSlashRegex(key);
    if (re) {
        try { return re.test(text); } catch (e) { return true; }
    }
    if (/[\u4e00-\u9fa5]/.test(key)) return text.indexOf(key) !== -1;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = (opts && opts.caseSensitive) ? '' : 'i';
    const whole = !(opts && opts.matchWholeWords === false);
    if (whole) {
        return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', flags).test(text);
    }
    return new RegExp(escaped, flags).test(text);
}

// 主键 + 次键逻辑组合
function wbMatchEntry(entry, text) {
    const opts = { caseSensitive: entry.caseSensitive, matchWholeWords: entry.matchWholeWords };
    if (!entry.keys.some(k => wbMatchKey(text, k, opts))) return false;
    if (!entry.selective || entry.keysSecondary.length === 0) return true;
    const sec = entry.keysSecondary.filter(k => !wbIsShortKey(k));
    if (sec.length === 0) return true;
    const results = sec.map(k => wbMatchKey(text, k, opts));
    const any = results.some(Boolean);
    const all = results.every(Boolean);
    switch (entry.selectiveLogic) {
        case 1: return !all;   // 次键未全部命中
        case 2: return !any;   // 次键都没命中
        case 3: return all;    // 全部次键命中
        default: return any;   // 任一次键命中
    }
}

// 条目归一化：补齐默认值，兼容旧字段名
function wbNormalizeEntry(e) {
    if (!e || e.type === 'folder') return null;
    const keys = wbSplitKeys(e.keys != null ? e.keys : e.key);
    const keysSecondary = wbSplitKeys(e.keysSecondary != null ? e.keysSecondary : e.keysecondary);
    return {
        id: e.id,
        name: e.name || '',
        content: e.content || '',
        category: e.category || '',
        keys: keys,
        keysSecondary: keysSecondary,
        selective: keysSecondary.length > 0,
        selectiveLogic: wbToNum(e.selectiveLogic, 0),
        constant: !!e.constant,
        entryType: e.entryType === 'jailbreak' ? 'jailbreak' : 'normal',
        priority: (e.priority === 'high' || e.priority === 'low') ? e.priority : 'medium',
        disable: e.disable === true || e.enabled === false,
        chatScope: e.chatScope === 'private' || e.chatScope === 'group' ? e.chatScope : 'all',
        scanDepth: (e.scanDepth == null || e.scanDepth === '') ? null : Math.max(1, wbToNum(e.scanDepth, 1)),
        caseSensitive: !!e.caseSensitive,
        matchWholeWords: e.matchWholeWords !== false,
        order: wbToNum(e.order, 100),
        position: wbToNum(e.position, 0) === 4 ? 4 : 0,
        depth: Math.max(0, wbToNum(e.depth, 4)),
        role: wbToNum(e.role, 0),
        useProbability: !!e.useProbability,
        probability: Math.min(100, Math.max(0, wbToNum(e.probability, 100))),
        group: e.group || '',
        groupWeight: Math.max(1, wbToNum(e.groupWeight, 100)),
        groupOverride: !!e.groupOverride,
        sticky: Math.max(0, wbToNum(e.sticky, 0)),
        cooldown: Math.max(0, wbToNum(e.cooldown, 0)),
        delay: Math.max(0, wbToNum(e.delay, 0)),
        excludeRecursion: !!e.excludeRecursion,
        preventRecursion: !!e.preventRecursion,
        delayUntilRecursion: !!e.delayUntilRecursion
    };
}

// 收集某个角色/群组绑定的条目（含全局文件夹条目，绑定 ID 已在 worldBookIds 里）
function wbCollectEntries(owner) {
    const ids = owner && Array.isArray(owner.worldBookIds) ? owner.worldBookIds : [];
    if (!ids.length || typeof db === 'undefined' || !Array.isArray(db.worldBooks)) return [];
    return ids
        .map(id => db.worldBooks.find(wb => wb && wb.id === id))
        .filter(Boolean)
        .map(wbNormalizeEntry)
        .filter(Boolean);
}

// 消息 → 扫描文本
function wbMsgText(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    let t = typeof m.content === 'string' ? m.content : '';
    if (Array.isArray(m.parts)) {
        m.parts.forEach(p => {
            if (p && typeof p.text === 'string') t += '\n' + p.text;
        });
    }
    return t;
}

// 互斥组：同组一次只留一条（组内优先 > 加权随机）
function wbResolveGroups(matched, rng) {
    const groups = {};
    matched.forEach(e => {
        if (e.group) {
            if (!groups[e.group]) groups[e.group] = [];
            groups[e.group].push(e);
        }
    });
    const pickedIds = new Set();
    const chosen = [];
    Object.keys(groups).forEach(g => {
        const list = groups[g];
        const override = list.find(e => e.groupOverride);
        if (override) {
            pickedIds.add(override.id);
            chosen.push(override);
            return;
        }
        const total = list.reduce((s, e) => s + e.groupWeight, 0);
        let r = rng() * total;
        let pick = list[list.length - 1];
        for (let i = 0; i < list.length; i++) {
            r -= list[i].groupWeight;
            if (r <= 0) { pick = list[i]; break; }
        }
        pickedIds.add(pick.id);
        chosen.push(pick);
    });
    matched.forEach(e => {
        if (!e.group && !pickedIds.has(e.id)) chosen.push(e);
    });
    return chosen;
}

// 单块渲染：条目行 + 截断
function wbRenderBlock(entries, key, blockLimit, maxEntryChars) {
    if (!entries.length) return '';
    const prefixes = {
        jailbreak: '',
        high: '> **[MUST FOLLOW]** 以下条目为必须遵守的高优先级设定：',
        medium: '> **[CONTEXT]** 以下为相关背景、世界观与指引：',
        low: '> **[DETAILS]** 以下为细节补充信息：'
    };
    let used = 0;
    const lines = [];
    entries.forEach(e => {
        if (blockLimit > 0 && used >= blockLimit) return;
        const remaining = blockLimit > 0 ? Math.max(0, blockLimit - used) : 0;
        const limit = blockLimit > 0
            ? (maxEntryChars > 0 ? Math.min(maxEntryChars, remaining) : remaining)
            : maxEntryChars;
        if (limit > 0 && limit < 80) return;
        let content = e.content || '';
        if (limit > 0 && content.length > limit) {
            content = content.slice(0, Math.max(0, limit - 18)).trimEnd() + '\n...[世界书内容已截断]';
        }
        const label = e.name || (e.keys.length ? e.keys.join('/') : '设定');
        lines.push('*【' + label + '】' + content);
        used += content.length + label.length + 4;
    });
    if (!lines.length) return '';
    const head = prefixes[key] ? prefixes[key] + '\n' : '';
    return head + lines.join('\n');
}

/**
 * 世界书主流程（对应酒馆 processWorldBook）
 * @param {Array} rawEntries 原始条目
 * @param {Array} messages 扫描用消息（对象 {content, parts} 或纯文本）
 * @param {Object} opts {scanDepth, chatType('private'|'group'|'all'), messageCount, timedState, maxRecursionSteps, maxEntryChars, blockCharLimits, rng}
 * @returns {jailbreak, high, medium, low, depthEntries, matchedCount, timed}
 */
function wbProcessWorldBooks(rawEntries, messages, opts) {
    const o = Object.assign({
        scanDepth: 5,
        chatType: 'all',
        messageCount: 0,
        timedState: null,
        maxRecursionSteps: 0,
        maxEntryChars: 0,
        blockCharLimits: null,
        rng: Math.random
    }, opts || {});
    const limits = Object.assign({ jailbreak: 0, high: 0, medium: 0, low: 0 }, o.blockCharLimits || {});
    const empty = { jailbreak: '', high: '', medium: '', low: '', depthEntries: [], matchedCount: 0, timed: [] };
    const entries = (rawEntries || []).map(wbNormalizeEntry).filter(Boolean);
    if (entries.length === 0) return empty;

    const state = o.timedState || {};
    const ts = wbToNum(o.messageCount, 0);
    const scanDepth = Math.max(1, wbToNum(o.scanDepth, 5));
    const buildScanText = depth => {
        const d = Math.max(1, wbToNum(depth, scanDepth));
        return messages.slice(-d).map(wbMsgText).filter(Boolean).join('\n');
    };

    function pass(entriesIn, scanContent, isRecursion) {
        const matched = [];
        entriesIn.forEach(entry => {
            if (entry.disable) return;
            if (o.chatType !== 'all' && entry.chatScope !== 'all' && entry.chatScope !== o.chatType) return;
            if (isRecursion && entry.excludeRecursion) return;
            if (!isRecursion && entry.delayUntilRecursion) return;
            if (!isRecursion && entry.delay > 0 && ts < entry.delay) return;
            const st = state[entry.id];
            if (!isRecursion && st && st.cooldownUntil != null && ts < st.cooldownUntil) return;
            const stickyActive = !isRecursion && st && st.stickyUntil != null && ts < st.stickyUntil;
            if (!stickyActive && !entry.constant) {
                if (!wbMatchEntry(entry, scanContent)) return;
                if (entry.useProbability && entry.probability < 100) {
                    if (!(entry.probability > 0 && 100 * o.rng() < entry.probability)) return;
                }
            }
            matched.push(entry);
        });
        return matched;
    }

    let matched = pass(entries, buildScanText(scanDepth), false);

    // 递归扫描：已命中内容再触发其他条目
    const rounds = Math.min(10, Math.max(0, wbToNum(o.maxRecursionSteps, 0)));
    if (rounds > 0) {
        for (let i = 0; i < rounds; i++) {
            const content = matched.filter(e => !e.preventRecursion).map(e => e.content).join('\n');
            if (!content.trim()) break;
            const next = pass(entries.filter(e => !matched.some(m => m.id === e.id)), content, true);
            if (next.length === 0) break;
            matched = matched.concat(next);
        }
    }

    matched = wbResolveGroups(matched, o.rng);

    // 时序状态需要回写的条目
    const timed = matched.filter(e => e.sticky > 0 || e.cooldown > 0);

    // 分块：破限 / 高 / 中 / 低，聊天深度条目单独走
    const rank = { high: 3, medium: 2, low: 1 };
    const buckets = { jailbreak: [], high: [], medium: [], low: [] };
    const depthEntries = [];
    matched.forEach((e, seq) => {
        if (e.position === 4) {
            depthEntries.push({ depth: e.depth, role: e.role, content: e.content, order: e.order, seq: seq });
        } else if (e.entryType === 'jailbreak') {
            buckets.jailbreak.push({ entry: e, seq: seq });
        } else if (rank[e.priority] === 3) {
            buckets.high.push({ entry: e, seq: seq });
        } else if (rank[e.priority] === 1) {
            buckets.low.push({ entry: e, seq: seq });
        } else {
            buckets.medium.push({ entry: e, seq: seq });
        }
    });
    const byOrder = (a, b) => (b.entry.order - a.entry.order) || (a.seq - b.seq);
    Object.keys(buckets).forEach(k => buckets[k].sort(byOrder));
    // 深度条目：深（数字大）的先插，同深度按注入顺序
    depthEntries.sort((a, b) => (b.depth - a.depth) || (b.order - a.order) || (a.seq - b.seq));

    const blockText = key => wbRenderBlock(buckets[key].map(x => x.entry), key, limits[key], o.maxEntryChars);

    return {
        jailbreak: blockText('jailbreak'),
        high: blockText('high'),
        medium: blockText('medium'),
        low: blockText('low'),
        depthEntries: depthEntries,
        matchedCount: matched.length,
        timed: timed
    };
}

// 查找条目所在根文件夹的书级递归配置
function wbMaxRecursionForEntries(rawEntries) {
    if (typeof db === 'undefined' || !Array.isArray(db.worldBooks)) return 0;
    const folders = {};
    db.worldBooks.forEach(w => { if (w && w.type === 'folder') folders[w.id] = w; });
    let maxSteps = 0;
    (rawEntries || []).forEach(e => {
        if (!e || !e.parentId) return;
        let pid = e.parentId;
        let guard = 0;
        while (pid && guard++ < 20) {
            const folder = folders[pid];
            if (!folder) break;
            if (folder.recursion === true) {
                maxSteps = Math.max(maxSteps, wbToNum(folder.maxRecursionSteps, 3));
            }
            pid = folder.parentId;
        }
    });
    return maxSteps;
}

/**
 * 面向聊天对象的一站式入口
 * @param {Object} owner 角色/群组（含 worldBookIds）
 * @param {string} chatType 'private' | 'group' | 'all'（生成器类调用传 'all' 不过滤生效范围）
 * @param {Array} messages 扫描消息
 * @param {number} messageCount 当前聊天总消息数（黏着/冷却/延迟基准）
 * @param {Object} opts {static:true 时不读不写时序状态}
 */
function wbRunForChat(owner, chatType, messages, messageCount, opts) {
    const o = opts || {};
    const entries = wbCollectEntries(owner);
    const chatKey = (chatType || 'chat') + '_' + (owner && owner.id ? owner.id : 'unknown');
    let state = {};
    if (!o.static) {
        if (typeof db === 'undefined' || !db.worldBookTimedState) {
            if (typeof db !== 'undefined') db.worldBookTimedState = {};
        }
        if (typeof db !== 'undefined') {
            if (!db.worldBookTimedState) db.worldBookTimedState = {};
            if (!db.worldBookTimedState[chatKey]) db.worldBookTimedState[chatKey] = {};
            state = db.worldBookTimedState[chatKey];
        }
    }
    const result = wbProcessWorldBooks(entries, messages || [], {
        scanDepth: 5,
        chatType: (chatType === 'private' || chatType === 'group') ? chatType : 'all',
        messageCount: messageCount || 0,
        timedState: state,
        maxRecursionSteps: wbMaxRecursionForEntries(owner && owner.worldBookIds
            ? owner.worldBookIds.map(id => (typeof db !== 'undefined' ? db.worldBooks.find(w => w && w.id === id) : null)).filter(Boolean)
            : []),
        rng: Math.random
    });
    if (!o.static && result.timed.length) {
        result.timed.forEach(e => {
            const prev = state[e.id] || {};
            state[e.id] = {
                stickyUntil: e.sticky > 0 ? (messageCount || 0) + e.sticky : prev.stickyUntil,
                cooldownUntil: e.cooldown > 0 ? (messageCount || 0) + e.cooldown : prev.cooldownUntil
            };
        });
        if (typeof saveData === 'function') {
            try { saveData().catch(() => {}); } catch (err) { /* 忽略持久化失败 */ }
        }
    }
    return result;
}

// 四个系统区块合并为一段文本
function wbBlocksText(result) {
    if (!result) return '';
    return [result.jailbreak, result.high, result.medium, result.low].filter(Boolean).join('\n\n');
}

// 全部内容（含深度条目），用于 <orange> 等内容探测
function wbAllContentText(result) {
    if (!result) return '';
    let t = wbBlocksText(result);
    if (result.depthEntries && result.depthEntries.length) {
        t += '\n' + result.depthEntries.map(d => d.content || '').join('\n');
    }
    return t;
}

// 把深度条目按位置拼进聊天记录数组（原地修改）
// depth：0 = 最新消息之后（紧贴回复），数字越大越靠前
function wbSpliceDepthEntries(historySlice, depthEntries) {
    if (!Array.isArray(historySlice) || !Array.isArray(depthEntries) || depthEntries.length === 0) return historySlice;
    const baseLen = historySlice.length;
    depthEntries.forEach(de => {
        const idx = Math.max(0, Math.min(baseLen, baseLen - Math.max(0, wbToNum(de.depth, 4))));
        const role = de.role === 2 ? 'assistant' : (de.role === 1 ? 'user' : 'system');
        const neighbor = historySlice[Math.min(idx, historySlice.length - 1)];
        historySlice.splice(idx, 0, {
            role: role,
            content: de.content || '',
            timestamp: neighbor ? neighbor.timestamp : Date.now(),
            isWorldBookDepth: true
        });
    });
    return historySlice;
}
