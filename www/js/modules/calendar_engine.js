// 日历 AI 引擎 (js/modules/calendar_engine.js)
// 为角色生成日程安排（支持任意日期范围 + 日常生活预设 / 自定义内容）

// options: { note }  note=自定义内容（空则按日常生活生成）
async function calGenerateScheduleRange(ownerType, ownerId, rangeStart, days, characterName, characterPersona, options = {}) {
    if (ownerType !== "character") {
        return { success: false, error: "用户日程不支持 AI 生成，请手动填写。" };
    }

    const apiConfig = db.apiSettings;
    if (!apiConfig?.url || !apiConfig?.key || !apiConfig?.model) {
        return { success: false, error: "请先在 API 设置中配置 API。" };
    }

    const nDays = Math.max(1, Math.min(31, parseInt(days, 10) || 7));
    const rangeDates = [];
    for (let i = 0; i < nDays; i++) rangeDates.push(calAddDays(rangeStart, i));
    const allowed = new Set(rangeDates);
    const rangeEnd = rangeDates[rangeDates.length - 1];

    // 人设 + 世界书 + 最近聊天内容
    const char = (typeof db !== "undefined" && Array.isArray(db.characters))
        ? db.characters.find(c => c.id === ownerId) : null;
    const worldBookText = (char?.worldBookIds || [])
        .map(id => (typeof db !== "undefined" && db.worldBooks ? db.worldBooks.find(wb => wb.id === id) : null))
        .filter(Boolean).map(wb => wb.content).join("\n");
    const chatText = calBuildRecentChatText(char);

    const scheduleSummary = calBuildRangeScheduleSummary(ownerType, ownerId, rangeDates);
    const note = (options.note || "").trim();

    const systemPrompt = `你是一个日程安排助手。请为角色"${characterName}"生成 ${rangeStart} 到 ${rangeEnd} 共 ${nDays} 天的日程计划。
角色信息：
${characterPersona || "无额外信息"}
${worldBookText ? `\n世界书设定（必须遵守）：\n${worldBookText}\n` : ""}${chatText ? `\n与用户的最近聊天内容（供参考角色近况）：\n${chatText}\n` : ""}
已有日程（这些保留，不要重复安排）：
${scheduleSummary}
${note ? `\n用户要求（最高优先级，必须严格按照以下内容安排）：\n${note}\n注意：如果用户要求里写了"早上/中午/下午/晚上"等时间词，对应事项必须安排在对应时间段（早上约07:00-12:00，中午约11:00-13:00，下午约13:00-18:00，晚上约18:00-23:00）。\n` : ""}
请根据以上信息生成合理的日程安排。每行一条，格式：
YYYY-MM-DD|周几|开始时间|结束时间|地点|emoji|事项

规则：
- 日期范围：${rangeStart} 到 ${rangeEnd}
- emoji 填一个最贴合该事项的表情符号
- 每天最多 5 条日程，宁缺毋滥
- 直接输出日程行，不要其他说明文字`;

    const userPrompt = `请为${characterName}生成 ${rangeStart} 到 ${rangeEnd} 的日程计划。`;

    // 增量生成：不再清除范围内已有计划，旧计划留在原日期/原时段
    const touchedWeeks = [...new Set(rangeDates.map(d => calGetWeekStartIso(calParseIsoDate(d))))];
    const existingKeys = new Set();
    for (const ws of touchedWeeks) {
        const plan = calLoadWeekPlan(ownerType, ownerId, ws);
        for (const it of (plan?.items || [])) {
            existingKeys.add(`${it.date}|${it.startTime}|${(it.title || "").trim()}`);
        }
    }

    try {
        const rawText = await calSendLlmRequest(apiConfig, systemPrompt, userPrompt);
        const items = calParseScheduleLines(rawText, null, allowed);

        if (items.length === 0) {
            return { success: false, error: "生成结果为空或格式无法解析。" };
        }

        const normalized = calNormalizeGeneratedItems(items);
        // 与已有计划完全重复的跳过，其余全部追加
        const fresh = normalized.filter(it => {
            const key = `${it.date}|${it.startTime}|${it.title}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
        });

        // 按所属周合并保存（保留各周全部已有计划）
        const byWeek = new Map();
        for (const item of fresh) {
            const ws = calGetWeekStartIso(calParseIsoDate(item.date));
            if (!byWeek.has(ws)) byWeek.set(ws, []);
            byWeek.get(ws).push(item);
        }
        for (const [ws, weekItems] of byWeek) {
            const plan = calLoadWeekPlan(ownerType, ownerId, ws);
            calReplaceWeekItems(ownerType, ownerId, ws, [...(plan?.items || []), ...weekItems]);
        }
        return { success: true, items: fresh };
    } catch (err) {
        return { success: false, error: err.message || "生成日历失败" };
    }
}

function calBuildRangeScheduleSummary(ownerType, ownerId, rangeDates) {
    const items = calGetAllItemsForOwner(ownerType, ownerId).filter(it => rangeDates.includes(it.date));
    if (!items.length) return "（范围内暂无日程）";
    const grouped = new Map();
    for (const item of calSortItems(items)) {
        if (!grouped.has(item.date)) grouped.set(item.date, []);
        grouped.get(item.date).push(item);
    }
    return rangeDates.map(date => {
        const list = grouped.get(date) || [];
        if (!list.length) return `${date} ${calGetWeekdayLabel(date)}：暂无安排`;
        const body = list.map(i => `${i.startTime}-${i.endTime}${i.location ? " @" + i.location : ""} ${i.title}`).join("；");
        return `${date} ${calGetWeekdayLabel(date)}：${body}`;
    }).join("\n");
}

// 取角色私聊最近 30 条文本消息作为生成参考
function calBuildRecentChatText(char) {
    try {
        const history = char?.history;
        if (!Array.isArray(history) || !history.length) return "";
        const lines = [];
        for (const msg of history.slice(-30)) {
            if (typeof msg?.content !== "string" || !msg.content.trim()) continue;
            if (msg.content.startsWith("[") && msg.content.includes("的表情包")) continue;
            const who = msg.role === "user" ? "用户" : "角色";
            lines.push(`${who}: ${msg.content.slice(0, 120)}`);
        }
        return lines.slice(-30).join("\n").slice(0, 3000);
    } catch {
        return "";
    }
}

async function calSendLlmRequest(apiConfig, systemPrompt, userPrompt) {
    const { url, key, model, provider } = apiConfig;

    let endpoint, headers, body;

    if (provider === "gemini") {
        endpoint = `${url}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.8 },
        });
    } else {
        endpoint = `${url}/v1/chat/completions`;
        headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        };
        body = JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.8,
        });
    }

    const response = await fetch(endpoint, { method: "POST", headers, body });
    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`API 错误: ${response.status} ${errText.slice(0, 200)}`);
    }

    const data = await response.json();

    if (provider === "gemini") {
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    return data?.choices?.[0]?.message?.content || "";
}

function calParseScheduleLines(rawText, weekStart, allowedDates) {
    const weekDates = allowedDates
        ? allowedDates
        : new Set(calGetWeekDates(weekStart));
    const text = rawText.replace(/^```[a-zA-Z]*\s*/g, "").replace(/\s*```$/g, "").trim();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const parsed = [];
    for (const rawLine of lines) {
        const line = rawLine.replace(/^[-*]\s*/, "").replace(/^\d+[.)、]\s*/, "").trim();
        if (!line.includes("|")) continue;
        const parts = line.split("|").map(p => p.trim());
        if (parts.length < 6) continue;

        const date = parts[0];
        const startTime = calNormalizeTime(parts[2]);
        const endTime = calNormalizeTime(parts[3]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !weekDates.has(date)) continue;
        if (!startTime || !endTime || !calIsTimeRangeAllowed(startTime, endTime)) continue;

        const location = parts[4] === "无" ? "" : parts[4];
        let emoji = "";
        let title;
        if (parts.length >= 7) {
            const candidate = calSanitizeEmoji(parts[5]);
            if (candidate && Array.from(parts[5]).length <= 3) {
                emoji = candidate;
                title = parts.slice(6).join("|");
            } else {
                title = parts.slice(5).join("|");
            }
        } else {
            title = parts[5];
        }
        if (!title.trim()) continue;

        parsed.push({ date, startTime, endTime, location, title, emoji });
    }
    return parsed;
}

function calCreateDefaultDraft(date) {
    return {
        date,
        startTime: "09:00",
        endTime: "10:00",
        location: "",
        title: "",
        emoji: "",
        source: "manual",
    };
}
