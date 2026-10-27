// 日历 AI 引擎 (js/modules/calendar_engine.js)
// 为角色生成每周日程安排

async function calGenerateWeeklySchedule(ownerType, ownerId, weekStart, characterName, characterPersona) {
    if (ownerType !== "character") {
        return { success: false, error: "用户日程不支持 AI 生成，请手动填写。" };
    }

    const apiConfig = db.apiSettings;
    if (!apiConfig?.url || !apiConfig?.key || !apiConfig?.model) {
        return { success: false, error: "请先在 API 设置中配置 API。" };
    }

    const weekDates = calGetWeekDates(weekStart);
    const scheduleSummary = calBuildScheduleSummary(ownerType, ownerId, weekStart);

    const systemPrompt = `你是一个日程安排助手。请为角色"${characterName}"生成一周的日程安排。
角色信息：
${characterPersona || "无额外信息"}

本周已有日程：
${scheduleSummary}

请根据角色特点生成合理的日程安排。每行一条，格式：
YYYY-MM-DD|周几|开始时间|结束时间|地点|emoji|事项

规则：
- 日期范围：${weekDates[0]} 到 ${weekDates[6]}
- emoji 填一个最贴合该事项的表情符号
- 每一天最多 5 条日程，宁缺毋滥
- 直接输出日程行，不要其他说明文字`;

    const userPrompt = `请为${characterName}生成 ${weekDates[0]} 到 ${weekDates[6]} 这一周的日程安排。`;

    const removedGenerated = calClearGeneratedItems(ownerType, ownerId, weekStart);

    try {
        const rawText = await calSendLlmRequest(apiConfig, systemPrompt, userPrompt);
        const items = calParseScheduleLines(rawText, weekStart);

        if (items.length === 0) {
            calRestoreWeekItems(ownerType, ownerId, weekStart, removedGenerated);
            return { success: false, error: "生成结果为空或格式无法解析。" };
        }

        const normalized = calNormalizeGeneratedItems(items);
        calCloneWithManualEdits(ownerType, ownerId, weekStart, normalized);
        return { success: true, items: normalized };
    } catch (err) {
        calRestoreWeekItems(ownerType, ownerId, weekStart, removedGenerated);
        return { success: false, error: err.message || "生成日历失败" };
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

function calParseScheduleLines(rawText, weekStart) {
    const weekDates = new Set(calGetWeekDates(weekStart));
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
