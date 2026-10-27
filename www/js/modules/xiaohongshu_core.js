// 小红书核心逻辑 (js/modules/xiaohongshu_core.js) — 移植自 ai-virtual-phone lib/xiaohongshu-*
// 来源: lib/xiaohongshu-types.ts / lib/xiaohongshu-storage.ts / lib/xiaohongshu-engine.ts
//       lib/xiaohongshu-memory.ts / lib/xiaohongshu-character-profile.ts
// 说明:
// - 纯浏览器全局脚本（无 import/export），供 UI 模块按源函数名直接调用。
// - AI 调用统一走 xhsSendLlmRequest（仿 js/modules/calendar_engine.js 的 calSendLlmRequest），
//   支持 provider === "gemini" 与 OpenAI 兼容端点，可选 imageParts 多模态输入。
// - 存储：源项目使用 IndexedDB kv-db，这里改为 localStorage，键名与源保持一致
//   （ai_phone_xiaohongshu_state_v1 / ai_phone_xiaohongshu_events_<characterId>）。
// - 图片：源项目笔记图片存 IndexedDB（imageAssetId），mie 直接把 dataURL 存在
//   note.imageDataUrl 上；涉及图片读取/校验处均改为检查 note.imageDataUrl。

// ============================================================
// KV 存储助手（内联自 lib/kv-db.ts，localStorage 版）
// ============================================================

function xhsKvGet(key) {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function xhsKvSet(key, value) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch (err) {
        console.warn("[Xiaohongshu] localStorage 写入失败:", key, err);
    }
}

function xhsKvRemove(key) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function xhsKvKeysWithPrefix(prefix) {
    const result = [];
    if (typeof window === "undefined") return result;
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && k.startsWith(prefix)) result.push(k);
        }
    } catch {
        // ignore
    }
    return result;
}

// ============================================================
// 常量与默认值（lib/xiaohongshu-types.ts + lib/bilingual-prompt-defaults.ts）
// ============================================================

const DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT = [
    "【小红书双语输出规则（仅非中文角色使用，中文角色忽略此规则）】",
    "- 只对小红书角色生成内容生效，包括帖子标题、正文、评论、回复、图片描述、视频描述、私信正文等自然语言内容。",
    "- 不要改动结构标签、块标题或字段名，例如 #评论1、#角色回复、[标题]、[正文]、[内容]、[图片描述]、[视频描述]。",
    "- 如果某个字段内容使用非中文语言，字段值必须写成“完整原文|对应的简体中文译文”。",
    "- 如果内容本来就是中文，正常输出中文，不要添加 |译文。",
    "- 竖线 | 只作为完整原文和完整译文之间的分隔符，不要在原文或译文内部滥用。",
].join("\n");

function resolveBilingualPrompt(enabled, customPrompt, defaultPrompt) {
    if (!enabled) return "";
    const prompt = customPrompt ? String(customPrompt).trim() : "";
    return prompt || defaultPrompt;
}

const DEFAULT_XIAOHONGSHU_PROFILE = {
    nickname: "我",
    handle: "rednote_user",
    ipLocation: "未知",
    signature: "记录一点日常。",
    gender: "♀",
    followingCount: 0,
    followerCount: 0,
    likedAndSavedCount: 0,
};

const DEFAULT_XIAOHONGSHU_NPC_IDENTITY_GUARD_PROMPT = [
    "<xiaohongshu_npc_identity_guard>",
    "以下名字属于真实角色或用户，NPC 严禁冒用这些名字作为笔记作者、评论作者、回复作者、点赞/收藏/关注昵称或私信发送者：",
    "{{xiaohongshuReservedNames}}",
    "如果需要普通路人，请自创与上述名单不相同、不近似的昵称。",
    "</xiaohongshu_npc_identity_guard>",
].join("\n");

const DEFAULT_XIAOHONGSHU_NPC_FEED_PROMPT = [
    "你正在生成一个仿小红书首页内容流。",
    "请输出 6 条 #首页笔记、6 条 #视频笔记、4 条 #附近笔记，每条都要像真实小红书陌生网友内容。",
    "内容可以是生活分享、吐槽、求助、种草、城市日常、情绪记录、教程、穿搭、美食、学习、工作、旅行等。",
    "如果上下文给出用户关注的账号，可以适当提高这些账号再次出现的概率，但不要每次都出现。",
    "如果上下文给出 [用户IP属地]，#附近笔记 需要围绕该属地或同城/附近城市生成本地生活、同城吐槽、附近求助、城市日常等内容。",
    "每条笔记要包含点赞数、收藏数、评论数和 3 到 8 条评论；输出的评论只是评论区样例，不代表全部评论。",
    "如需楼中楼，使用 [评论N回复对象]评论M，其中 M 必须是前面已经出现过的评论编号。",
    "楼中楼示例：评论2回复评论1时，必须写 [评论2回复对象]评论1，不要写昵称、评论ID或其他文字。",
    "",
    "活人感要求：",
    "- 笔记以碎片化、去精致化的日常分享为主，标题正文口语化、可用网络黑话/表情/不完整句，不煽情、不装逼、不写小作文；多种形式并存（吐槽、疑问、求助、种草、踩雷、晒图、碎碎念等）。",
    "- *绝对禁止讲大道理、爹味说教、强行把日常上升高度*，内容落于实际、轻松幽默。",
    "- 评论区禁止一边倒夸作者；NPC不脸谱化，多种性格并存（尖锐的、温和的、挑事的、看戏的、蹲后续的、跑题的、抬杠的、求链接的），可体现不同观点甚至轻微争执。",
    "- *绝对禁止“引用正文/评论原文+这句太真实了/说到我心趴上了”这种格式*。",
    "",
    "输出格式：",
    "#首页笔记1",
    "[作者]昵称",
    "[标题]标题",
    "[正文]正文",
    "[配图]用一句话描述配图文字内容（不要 emoji，直接写文字）",
    "[点赞]数字",
    "[收藏]数字",
    "[评论数]数字",
    "[标签]标签1、标签2",
    "[评论1作者]昵称",
    "[评论1内容]评论内容",
    "[评论2作者]昵称",
    "[评论2回复对象]评论1",
    "[评论2内容]回复评论1的楼中楼内容",
    "",
    "#视频笔记1",
    "[作者]昵称",
    "[标题]标题",
    "[正文]发布文案",
    "[视频描述]视频画面描述",
    "[配图]用一句话描述配图文字内容（不要 emoji，直接写文字）",
    "[点赞]数字",
    "[收藏]数字",
    "[评论数]数字",
    "[标签]标签1、标签2",
    "[评论1作者]昵称",
    "[评论1内容]评论内容",
    "[评论2作者]昵称",
    "[评论2回复对象]评论1",
    "[评论2内容]回复评论1的楼中楼内容",
    "",
    "#附近笔记1",
    "[作者]昵称",
    "[标题]标题",
    "[正文]同城/附近相关正文",
    "[配图]用一句话描述配图文字内容（不要 emoji，直接写文字）",
    "[点赞]数字",
    "[收藏]数字",
    "[评论数]数字",
    "[标签]标签1、标签2",
    "[评论1作者]昵称",
    "[评论1内容]评论内容",
    "[评论2作者]昵称",
    "[评论2回复对象]评论1",
    "[评论2内容]回复评论1的楼中楼内容",
].join("\n");

const DEFAULT_XIAOHONGSHU_NPC_USER_POST_REACTION_PROMPT = [
    "你正在模拟小红书陌生网友对用户刚发布笔记的互动。",
    "根据用户笔记内容、TAG、图片内容、已有评论，生成自然的平台互动。",
    "需要输出点赞数、收藏数、前两个点赞昵称、前两个收藏昵称、评论、新增关注和私信。",
    "如果这条笔记可能吸引新粉丝，请输出 [新增关注]数字 和 [关注用户N]昵称；如果没有新增关注，可以填 0 或省略。",
    "All generated comments and replies must come from NPC Xiaohongshu strangers, not from the post author.",
    "The post author must never appear as a generated commenter, replier, liker, saver, follower, or private-message sender.",
    "Do not use the user's nickname, Xiaohongshu ID, profile name, configured persona name, or wording such as \"楼主\", \"本人\", or \"我自己\" to imply the user is interacting with their own note.",
    "绝对禁止以{{user}}身份评论、回复。",
    "评论可以包含楼中楼；如需楼中楼，使用 [评论N回复对象]评论M。",
    "楼中楼示例：评论2回复评论1时，必须写 [评论2回复对象]评论1，不要写昵称、评论ID或其他文字。",
    "",
    "活人感要求：",
    "- 评论要短、口语化，像随手一打的真实评论，可用黑话/表情/不完整句；不煽情、不装逼、不写小作文。",
    "- 评论落到具体的图/正文/TAG细节或真实反应（吐槽、好奇、共鸣、调侃、提问、求链接、踩雷提醒），*绝对禁止讲大道理、爹味说教、强行升华或客服式总结*。",
    "- 评论区禁止一边倒夸楼主；NPC不脸谱化，多种性格并存（尖锐/温和/挑事/看戏/蹲后续/抬杠/跑题），可有不同观点甚至轻微争执。",
    "- *绝对禁止“引用笔记原文+这句太真实了”这种格式*。",
    "- 私信也要口语自然，别像客服或营销号。",
    "",
    "输出格式：",
    "#用户笔记互动",
    "[点赞]数字",
    "[点赞用户1]昵称",
    "[点赞用户2]昵称",
    "[收藏]数字",
    "[收藏用户1]昵称",
    "[收藏用户2]昵称",
    "[新增关注]数字",
    "[关注用户1]昵称",
    "[关注用户2]昵称",
    "",
    "[评论1作者]昵称",
    "[评论1内容]评论内容",
    "[评论2作者]昵称",
    "[评论2回复对象]评论1",
    "[评论2内容]楼中楼回复内容",
    "",
    "#私信1",
    "[名称]昵称",
    "[正文]私信内容",
].join("\n");

const DEFAULT_XIAOHONGSHU_NPC_COMMENT_REPLY_PROMPT = [
    "你正在模拟小红书陌生网友在一条笔记评论区里继续接话。",
    "根据笔记内容、用户刚发的评论/回复、被回复评论和已有评论，生成自然的评论区回复。",
    "回复可以来自被评论的人，也可以来自其他路人；如果不适合回复，可以只输出 1 条。",
    "绝对禁止以{{user}}身份评论、回复。",
    "如需楼中楼，使用 [评论N回复评论ID]填写上下文里给出的评论ID。",
    "评论ID 示例：如果上下文里有 [评论ID]某条真实评论ID，回复这条评论时就写 [评论1回复评论ID]某条真实评论ID。",
    "不要填写“评论1”、昵称、“被回复评论ID”、“候选评论ID”等占位文字；必须完整复制上下文里的真实 [评论ID]。",
    "",
    "活人感要求：",
    "- 回复像真实评论区接话，短、口语、就事论事，可用黑话/表情/梗；不写小作文、不煽情、不装逼。",
    "- 接住对方的具体那句话自然往下聊（调侃、反问、附和、轻怼、跑题），*绝对禁止说教、爹味、强行升华或客服式回应*。",
    "- 多条回复之间性格各异、可有不同观点甚至拌嘴，禁止集体吹捧楼主或某一方。",
    "- *绝对禁止“引用对方原话+这句太真实了”这种格式*。",
    "",
    "输出格式：",
    "#评论回复",
    "[评论1作者]昵称",
    "[评论1回复评论ID]从上下文复制的真实评论ID",
    "[评论1内容]回复内容",
    "",
    "[评论2作者]昵称",
    "[评论2回复评论ID]从上下文复制的真实评论ID",
    "[评论2内容]回复内容",
].join("\n");

const DEFAULT_XIAOHONGSHU_NPC_MORE_COMMENTS_PROMPT = [
    "你正在模拟小红书陌生网友继续参与一条笔记的评论区讨论。",
    "根据笔记标题、正文、TAG、图片内容、互动数据和已有评论，生成 4 到 8 条新的自然评论。",
    "这些评论可以是普通评论，也可以是楼中楼回复；需要像真实小红书评论区，不要像机器人总结。",
    "绝对禁止以{{user}}身份评论、回复。",
    "如果回复本次新生成的前面评论，使用 [评论N回复对象]评论M，其中 M 必须是前面已经出现过的本次评论编号。",
    "如果回复已有评论，使用 [评论N回复评论ID]完整复制上下文里的真实 [评论ID]。",
    "楼中楼示例：评论2回复本次评论1时，写 [评论2回复对象]评论1；回复已有评论时，写 [评论2回复评论ID]从上下文复制的真实评论ID。",
    "",
    "活人感要求：",
    "- 评论短、口语化、就事论事，可用黑话/表情/梗；不写小作文、不煽情、不装逼，别像机器人总结。",
    "- NPC多种性格并存（尖锐/温和/挑事/看戏/蹲后续/抬杠/跑题/求链接），禁止一边倒夸楼主，可有不同观点甚至拌嘴。",
    "- 评论落到笔记/已有评论的具体点，*绝对禁止讲大道理、爹味说教、强行升华*。",
    "- *绝对禁止“引用原文+这句太真实了”这种格式*。",
    "",
    "输出格式：",
    "#更多评论",
    "[评论1作者]昵称",
    "[评论1内容]评论内容",
    "[评论2作者]昵称",
    "[评论2回复对象]评论1",
    "[评论2内容]回复评论1的楼中楼内容",
    "[评论3作者]昵称",
    "[评论3回复评论ID]从上下文复制的真实评论ID",
    "[评论3内容]回复已有评论的楼中楼内容",
].join("\n");

const DEFAULT_XIAOHONGSHU_NPC_DM_REPLY_PROMPT = [
    "你正在模拟小红书私信里的陌生网友回复用户。",
    "根据对话对象、用户刚发的私信、历史私信和相关笔记信息，生成自然的私信回复。",
    "可以连续回复 1 到 4 条消息；每条消息要像真实聊天，可以短句、口语、带 emoji，也可以分多条发。",
    "不要替用户说话，不要输出系统解释，不要输出 Markdown。",
    "别客服腔、别营销号腔，符合这个陌生网友的身份和性格，自然像真人私聊。",
    "",
    "输出格式：",
    "#私信回复1",
    "[正文]回复内容",
    "",
    "#私信回复2",
    "[正文]第二条回复内容",
].join("\n");

const DEFAULT_XIAOHONGSHU_SETTINGS = {
    bilingualTranslationEnabled: true,
    collapseBilingualTranslation: true,
    bilingualTranslationPrompt: DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT,
    npcIdentityGuardPrompt: DEFAULT_XIAOHONGSHU_NPC_IDENTITY_GUARD_PROMPT,
    npcFeedPrompt: DEFAULT_XIAOHONGSHU_NPC_FEED_PROMPT,
    npcUserPostReactionPrompt: DEFAULT_XIAOHONGSHU_NPC_USER_POST_REACTION_PROMPT,
    npcCommentReplyPrompt: DEFAULT_XIAOHONGSHU_NPC_COMMENT_REPLY_PROMPT,
    npcMoreCommentsPrompt: DEFAULT_XIAOHONGSHU_NPC_MORE_COMMENTS_PROMPT,
    npcDmReplyPrompt: DEFAULT_XIAOHONGSHU_NPC_DM_REPLY_PROMPT,
    participantCharacterIds: [],
    sendToCharacterProbability: 60,
};

// ============================================================
// 通用小工具
// ============================================================

function makeId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value, maxLength) {
    return String(value ?? "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
    return cleanText(value, maxLength)
        .replace(/\r\n?/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n");
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
}

function numberOr(value, fallback) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
    const normalized = String(value ?? "")
        .trim()
        .replace(/[,，\s]/g, "");
    if (!normalized) return fallback;
    const tenThousandMatch = /^(-?\d+(?:\.\d+)?)[wW万](?:(\d+(?:\.\d+)?)(?:[kK千])?)?$/.exec(normalized);
    if (tenThousandMatch) {
        const main = Number(tenThousandMatch[1]);
        const tail = tenThousandMatch[2] ? Number(tenThousandMatch[2]) : 0;
        if (Number.isFinite(main) && Number.isFinite(tail)) {
            return Math.max(0, Math.round(main * 10000 + tail * 1000));
        }
    }
    const thousandMatch = /^(-?\d+(?:\.\d+)?)[kK千](?:(\d+(?:\.\d+)?)(?:百)?)?$/.exec(normalized);
    if (thousandMatch) {
        const main = Number(thousandMatch[1]);
        const tail = thousandMatch[2] ? Number(thousandMatch[2]) : 0;
        if (Number.isFinite(main) && Number.isFinite(tail)) {
            return Math.max(0, Math.round(main * 1000 + tail * 100));
        }
    }
    const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(parsed)) return fallback;
    if (/[wW万]/.test(normalized)) return Math.max(0, Math.round(parsed * 10000));
    if (/[kK千]/.test(normalized)) return Math.max(0, Math.round(parsed * 1000));
    return Math.max(0, Math.round(parsed));
}

function optionalPositiveNumber(value) {
    const parsed = numberOr(value, 0);
    return parsed > 0 ? parsed : undefined;
}

function normalizeTags(value) {
    const items = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[,，、#\s]+/)
            : [];
    return Array.from(new Set(items.map(item => cleanText(item, 18)).filter(Boolean))).slice(0, 6);
}

function normalizeNameList(value) {
    const items = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[,，、\n]+/)
            : [];
    return Array.from(new Set(items.map(item => cleanText(item, 24)).filter(Boolean))).slice(0, 2);
}

function normalizeIdList(value) {
    const items = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[,，、\n]+/)
            : [];
    return Array.from(new Set(items.map(item => cleanText(item, 180)).filter(Boolean)));
}

function parseNotificationCountFromText(text) {
    const match = text.match(/等\s*([0-9][\d.,，]*(?:\.\d+)?\s*(?:[kKwW万千])?)\s*人/);
    return match ? numberOr(match[1], 1) : 1;
}

// ============================================================
// 用户身份（源 lib/settings-storage.ts resolveUserIdentity 的 mie 简化版）
// mie 没有全局用户身份系统；角色对象上的 myName 即“我对该角色的称呼/用户名”。
// ============================================================

function xhsResolveUserIdentityName(characterId) {
    if (characterId && typeof db !== "undefined" && Array.isArray(db.characters)) {
        const character = db.characters.find(item => item && item.id === characterId);
        const name = cleanText(character ? character.myName : "", 80);
        if (name) return name;
    }
    return "";
}

// ============================================================
// 存储（lib/xiaohongshu-storage.ts）
// ============================================================

const XHS_STATE_KEY = "ai_phone_xiaohongshu_state_v1";
const LEGACY_DEFAULT_NICKNAME = "我";
const LEGACY_DEFAULT_GENDER = "未设置";

function makeXiaohongshuNpcId(name) {
    const normalized = cleanText(name, 60) || "小红书用户";
    return `npc_${hashString(normalized)}`;
}

function getXiaohongshuCharacterList() {
    if (typeof db !== "undefined" && Array.isArray(db.characters)) return db.characters;
    return [];
}

function getDefaultXiaohongshuProfile() {
    const identityName = xhsResolveUserIdentityName();
    return {
        ...DEFAULT_XIAOHONGSHU_PROFILE,
        nickname: cleanText(identityName, 40) || DEFAULT_XIAOHONGSHU_PROFILE.nickname,
        gender: DEFAULT_XIAOHONGSHU_PROFILE.gender,
    };
}

function normalizeXiaohongshuProfile(raw) {
    const record = raw && typeof raw === "object" ? raw : {};
    const defaults = getDefaultXiaohongshuProfile();
    const nickname = cleanText(record.nickname, 40);
    const gender = cleanText(record.gender, 20);
    return {
        nickname: !nickname || nickname === LEGACY_DEFAULT_NICKNAME ? defaults.nickname : nickname,
        handle: cleanText(record.handle, 40) || defaults.handle,
        ipLocation: cleanText(record.ipLocation ?? record.ip_location, 40) || defaults.ipLocation,
        signature: cleanMultiline(record.signature ?? record.bio, 160) || defaults.signature,
        gender: !gender || gender === LEGACY_DEFAULT_GENDER ? defaults.gender : gender,
        followingCount: numberOr(record.followingCount ?? record.following_count, defaults.followingCount),
        followerCount: numberOr(record.followerCount ?? record.follower_count, defaults.followerCount),
        likedAndSavedCount: numberOr(record.likedAndSavedCount ?? record.liked_and_saved_count, defaults.likedAndSavedCount),
        coverImageAssetId: cleanText(record.coverImageAssetId ?? record.cover_image_asset_id, 160) || defaults.coverImageAssetId,
    };
}

function normalizeXiaohongshuSettings(raw) {
    const record = raw && typeof raw === "object" ? raw : {};
    const participantCharacterIds = Array.isArray(record.participantCharacterIds)
        ? record.participantCharacterIds.map(id => cleanText(id, 120)).filter(Boolean)
        : [];
    const probability = numberOr(record.sendToCharacterProbability, DEFAULT_XIAOHONGSHU_SETTINGS.sendToCharacterProbability);
    const npcFeedPrompt = cleanMultiline(record.npcFeedPrompt, 8000);
    return {
        bilingualTranslationEnabled: record.bilingualTranslationEnabled !== false,
        collapseBilingualTranslation: record.collapseBilingualTranslation !== false,
        bilingualTranslationPrompt: cleanMultiline(record.bilingualTranslationPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.bilingualTranslationPrompt,
        npcIdentityGuardPrompt: cleanMultiline(record.npcIdentityGuardPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.npcIdentityGuardPrompt,
        npcFeedPrompt: npcFeedPrompt && npcFeedPrompt.includes("#附近笔记") ? npcFeedPrompt : DEFAULT_XIAOHONGSHU_SETTINGS.npcFeedPrompt,
        npcUserPostReactionPrompt: cleanMultiline(record.npcUserPostReactionPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.npcUserPostReactionPrompt,
        npcCommentReplyPrompt: cleanMultiline(record.npcCommentReplyPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.npcCommentReplyPrompt,
        npcMoreCommentsPrompt: cleanMultiline(record.npcMoreCommentsPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.npcMoreCommentsPrompt,
        npcDmReplyPrompt: cleanMultiline(record.npcDmReplyPrompt, 8000) || DEFAULT_XIAOHONGSHU_SETTINGS.npcDmReplyPrompt,
        participantCharacterIds: Array.from(new Set(participantCharacterIds)),
        sendToCharacterProbability: Math.max(0, Math.min(100, probability)),
    };
}

function normalizeXiaohongshuUserInteractions(raw) {
    const record = raw && typeof raw === "object" ? raw : {};
    return {
        likedNoteIds: normalizeIdList(record.likedNoteIds ?? record.liked_note_ids),
        savedNoteIds: normalizeIdList(record.savedNoteIds ?? record.saved_note_ids),
        commentedNoteIds: normalizeIdList(record.commentedNoteIds ?? record.commented_note_ids),
    };
}

function normalizeXiaohongshuAccount(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw;
    const type = record.type === "user" || record.type === "character" || record.type === "npc" ? record.type : "npc";
    const name = cleanText(record.name ?? record.authorName ?? record.nickname, 60);
    if (!name) return null;
    const id = cleanText(record.id ?? record.authorId ?? record.author_id, 120) || (type === "npc" ? makeXiaohongshuNpcId(name) : type);
    return {
        type,
        id,
        name,
        avatar: cleanText(record.avatar, 500) || undefined,
        followedAt: typeof record.followedAt === "string" ? record.followedAt : new Date().toISOString(),
    };
}

function dedupeAccounts(accounts) {
    const seen = new Set();
    return accounts.filter((account) => {
        const key = `${account.type}:${account.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeXiaohongshuSocialGraph(raw) {
    const record = raw && typeof raw === "object" ? raw : {};
    const following = Array.isArray(record.following)
        ? record.following.map(normalizeXiaohongshuAccount).filter(account => Boolean(account))
        : [];
    const followers = Array.isArray(record.followers)
        ? record.followers.map(normalizeXiaohongshuAccount).filter(account => Boolean(account))
        : [];
    return {
        following: dedupeAccounts(following),
        followers: dedupeAccounts(followers),
    };
}

function normalizeXiaohongshuComment(raw, fallbackNoteId = "") {
    if (!raw || typeof raw !== "object") return null;
    const record = raw;
    const noteId = cleanText(record.noteId ?? record.note_id, 160) || fallbackNoteId;
    const text = cleanMultiline(record.text ?? record.content ?? record.body, 600);
    const authorName = cleanText(record.authorName ?? record.author_name, 60);
    if (!noteId || !text || !authorName) return null;
    const id = cleanText(record.id, 180) || makeId("xhs_comment");
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    return {
        id,
        noteId,
        authorType: record.authorType === "user" || record.authorType === "character" ? record.authorType : "npc",
        authorId: cleanText(record.authorId ?? record.author_id, 120) || makeXiaohongshuNpcId(authorName),
        authorName,
        text,
        replyTo: cleanText(record.replyTo ?? record.reply_to, 80) || undefined,
        replyToCommentId: cleanText(record.replyToCommentId ?? record.reply_to_comment_id, 180) || undefined,
        likeCount: numberOr(record.likeCount ?? record.like_count, 0),
        dislikeCount: numberOr(record.dislikeCount ?? record.dislike_count, 0),
        liked: record.liked === true,
        disliked: record.disliked === true,
        createdAt,
        unread: record.unread === true,
    };
}

function normalizeXiaohongshuNote(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw;
    const id = cleanText(record.id, 160) || makeId("xhs_note");
    const title = cleanText(record.title, 80);
    const body = cleanMultiline(record.body ?? record.content ?? record.text, 3000);
    const authorName = cleanText(record.authorName ?? record.author_name, 60);
    if (!title && !body) return null;
    const comments = Array.isArray(record.comments)
        ? record.comments.map(comment => normalizeXiaohongshuComment(comment, id)).filter(comment => Boolean(comment))
        : [];
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    return {
        id,
        type: record.type === "video" ? "video" : "post",
        feedScope: record.feedScope === "nearby" || record.feed_scope === "nearby" ? "nearby" : "discover",
        source: record.source === "user" || record.source === "character" ? record.source : "npc",
        authorId: cleanText(record.authorId ?? record.author_id, 120) || makeXiaohongshuNpcId(authorName || "小红书用户"),
        authorName: authorName || "小红书用户",
        title: title || body.slice(0, 18) || "未命名笔记",
        body,
        videoDescription: cleanMultiline(record.videoDescription ?? record.video_description, 500) || undefined,
        coverIcon: cleanText(record.coverIcon ?? record.cover_icon, 8) || "✦",
        tone: record.tone === "mist" || record.tone === "blush" || record.tone === "graphite" || record.tone === "card-a" || record.tone === "card-b" || record.tone === "card-c" || record.tone === "card-d" ? record.tone : "ivory",
        tags: normalizeTags(record.tags),
        likeCount: numberOr(record.likeCount ?? record.like_count, 0),
        saveCount: numberOr(record.saveCount ?? record.save_count, 0),
        commentCount: numberOr(record.commentCount ?? record.comment_count, comments.length),
        liked: record.liked === true,
        saved: record.saved === true,
        recentLikeNames: normalizeNameList(record.recentLikeNames ?? record.recent_like_names),
        recentSaveNames: normalizeNameList(record.recentSaveNames ?? record.recent_save_names),
        comments,
        imageAssetId: cleanText(record.imageAssetId ?? record.image_asset_id, 160) || undefined,
        imageDataUrl: typeof record.imageDataUrl === "string" && record.imageDataUrl ? record.imageDataUrl : undefined,
        imageDescription: cleanMultiline(record.imageDescription ?? record.image_description, 500) || undefined,
        imageWidth: optionalPositiveNumber(record.imageWidth ?? record.image_width),
        imageHeight: optionalPositiveNumber(record.imageHeight ?? record.image_height),
        imageCompressedAt: typeof record.imageCompressedAt === "string" ? record.imageCompressedAt : undefined,
        imageCleanedAt: typeof record.imageCleanedAt === "string" ? record.imageCleanedAt : undefined,
        createdAt,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : createdAt,
    };
}

function normalizeNotification(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw;
    const text = cleanMultiline(record.text, 600);
    const actorName = cleanText(record.actorName ?? record.actor_name, 60);
    if (!text || !actorName) return null;
    const type = record.type === "save" || record.type === "comment" || record.type === "dm" || record.type === "follow"
        ? record.type
        : "like";
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    const parsedCount = numberOr(
        record.count ?? record.actorCount ?? record.actor_count,
        type === "like" || type === "save" ? parseNotificationCountFromText(text) : 1,
    );
    return {
        id: cleanText(record.id, 160) || makeId("xhs_notice"),
        type,
        noteId: cleanText(record.noteId ?? record.note_id, 160) || undefined,
        actorName,
        text,
        count: type === "like" || type === "save" ? Math.max(1, Math.round(parsedCount)) : undefined,
        thumbnailText: cleanText(record.thumbnailText ?? record.thumbnail_text, 80) || undefined,
        direction: record.direction === "outgoing" ? "outgoing" : record.direction === "incoming" ? "incoming" : undefined,
        threadId: cleanText(record.threadId ?? record.thread_id, 180) || undefined,
        threadName: cleanText(record.threadName ?? record.thread_name, 60) || undefined,
        unread: record.unread !== false,
        createdAt,
    };
}

function createDefaultXiaohongshuState() {
    return {
        profile: getDefaultXiaohongshuProfile(),
        settings: { ...DEFAULT_XIAOHONGSHU_SETTINGS, participantCharacterIds: [] },
        notes: [],
        feedHiddenNoteIds: [],
        notifications: [],
        userInteractions: normalizeXiaohongshuUserInteractions(null),
        socialGraph: normalizeXiaohongshuSocialGraph(null),
        updatedAt: new Date().toISOString(),
    };
}

function loadXiaohongshuState() {
    if (typeof window === "undefined") return createDefaultXiaohongshuState();
    try {
        const raw = xhsKvGet(XHS_STATE_KEY);
        if (!raw) return createDefaultXiaohongshuState();
        const parsed = JSON.parse(raw);
        const notes = Array.isArray(parsed.notes)
            ? parsed.notes.map(normalizeXiaohongshuNote).filter(note => Boolean(note))
            : [];
        const noteSourceById = new Map(notes.map(note => [note.id, note.source]));
        const notifications = Array.isArray(parsed.notifications)
            ? parsed.notifications
                .map(normalizeNotification)
                .filter(notice => Boolean(notice))
                .filter((notice) => {
                    if (!notice.noteId) return true;
                    const source = noteSourceById.get(notice.noteId);
                    return !source || source === "user";
                })
            : [];
        const rawInteractions = parsed.userInteractions ?? parsed.user_interactions;
        const userInteractions = normalizeXiaohongshuUserInteractions(rawInteractions);
        if (!rawInteractions) {
            userInteractions.likedNoteIds = notes.filter(note => note.liked).map(note => note.id);
            userInteractions.savedNoteIds = notes.filter(note => note.saved).map(note => note.id);
            userInteractions.commentedNoteIds = notes.filter(note => note.comments.some(comment => comment.authorType === "user")).map(note => note.id);
        }
        return {
            profile: normalizeXiaohongshuProfile(parsed.profile),
            settings: normalizeXiaohongshuSettings(parsed.settings),
            notes,
            feedHiddenNoteIds: normalizeIdList(parsed.feedHiddenNoteIds ?? parsed.feed_hidden_note_ids),
            notifications,
            userInteractions,
            socialGraph: normalizeXiaohongshuSocialGraph(parsed.socialGraph ?? parsed.social_graph),
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        };
    } catch {
        return createDefaultXiaohongshuState();
    }
}

function saveXiaohongshuState(state) {
    const next = { ...state, updatedAt: new Date().toISOString() };
    xhsKvSet(XHS_STATE_KEY, JSON.stringify(next));
    return next;
}

function resetXiaohongshuState() {
    xhsKvRemove(XHS_STATE_KEY);
    return createDefaultXiaohongshuState();
}

function createUserXiaohongshuNote(input, profile) {
    const now = new Date().toISOString();
    const hasImage = Boolean(input.image && (input.image.assetId || input.image.dataUrl));
    return {
        id: makeId("xhs_user_note"),
        type: "post",
        source: "user",
        authorId: "user",
        authorName: profile.nickname || "我",
        title: cleanText(input.title, 80) || cleanMultiline(input.body, 120).slice(0, 24) || "新的笔记",
        body: cleanMultiline(input.body, 3000),
        coverIcon: hasImage ? "▧" : "✎",
        tone: "ivory",
        tags: normalizeTags(input.tags),
        likeCount: 0,
        saveCount: 0,
        commentCount: 0,
        liked: false,
        saved: false,
        recentLikeNames: [],
        recentSaveNames: [],
        comments: [],
        imageAssetId: input.image ? input.image.assetId : undefined,
        imageDataUrl: input.image && typeof input.image.dataUrl === "string" && input.image.dataUrl ? input.image.dataUrl : undefined,
        imageDescription: cleanMultiline(input.image ? input.image.description : "", 500) || undefined,
        imageWidth: optionalPositiveNumber(input.image ? input.image.width : undefined),
        imageHeight: optionalPositiveNumber(input.image ? input.image.height : undefined),
        createdAt: now,
        updatedAt: now,
    };
}

function makeXiaohongshuComment(input) {
    return {
        id: makeId("xhs_comment"),
        noteId: input.noteId,
        authorType: input.authorType,
        authorId: input.authorId || (input.authorType === "npc" ? makeXiaohongshuNpcId(input.authorName) : input.authorType),
        authorName: cleanText(input.authorName, 60) || "小红书用户",
        text: cleanMultiline(input.text, 600),
        replyTo: cleanText(input.replyTo, 80) || undefined,
        replyToCommentId: cleanText(input.replyToCommentId, 180) || undefined,
        likeCount: 0,
        dislikeCount: 0,
        liked: false,
        disliked: false,
        createdAt: new Date().toISOString(),
        unread: input.unread === true,
    };
}

function makeXiaohongshuNotification(input) {
    return {
        ...input,
        id: makeId("xhs_notice"),
        createdAt: new Date().toISOString(),
    };
}

function addNames(existing, names) {
    return Array.from(new Set([...names, ...existing].map(name => cleanText(name, 24)).filter(Boolean))).slice(0, 2);
}

// ============================================================
// 角色显示名（lib/xiaohongshu-character-profile.ts，mie 简化版）
// 源实现读取手机快照缓存里的小红书昵称；mie 直接用
// remarkName || realName（即聊天列表显示名）。
// ============================================================

function resolveCharacterXiaohongshuDisplayName(character) {
    if (!character) return "";
    return String(character.xiaohongshuName || character.remarkName || character.realName || character.name || "").trim();
}

// ============================================================
// 角色记忆事件（lib/xiaohongshu-memory.ts）
// ============================================================

const XIAOHONGSHU_EVENT_PREFIX = "ai_phone_xiaohongshu_events_";
const MAX_EVENTS_PER_CHARACTER = 120;

// 内联自 lib/prompt-time.ts formatPromptTimestamp（memory 模块用到的 formatChatTimestamp）
function xhsFormatChatTimestamp(isoStr) {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return "";
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `(${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())})`;
}

function xhsEventStorageKey(characterId) {
    return `${XIAOHONGSHU_EVENT_PREFIX}${characterId}`;
}

function cleanEventText(value, maxLength) {
    const text = String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatAuthorLabel(authorType, value, fallback) {
    const name = cleanEventText(value, 80) || fallback;
    return authorType === "user" ? `“${name}”（用户的小红书账号）` : `“${name}”`;
}

function loadXiaohongshuEventsByKey(key) {
    if (typeof window === "undefined") return [];
    try {
        const raw = xhsKvGet(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(entry => entry
                && typeof entry.id === "string"
                && typeof entry.timestamp === "string"
                && typeof entry.content === "string")
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } catch {
        return [];
    }
}

function loadXiaohongshuEvents(characterId) {
    return loadXiaohongshuEventsByKey(xhsEventStorageKey(characterId));
}

function saveXiaohongshuEventsByKey(key, events) {
    if (typeof window === "undefined") return;
    const compacted = [...events]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(-MAX_EVENTS_PER_CHARACTER);
    xhsKvSet(key, JSON.stringify(compacted));
}

function saveXiaohongshuEvents(characterId, events) {
    saveXiaohongshuEventsByKey(xhsEventStorageKey(characterId), events);
}

function upsertXiaohongshuEvent(characterId, entry) {
    const events = loadXiaohongshuEvents(characterId);
    const next = events.filter(item => item.id !== entry.id);
    next.push(entry);
    saveXiaohongshuEvents(characterId, next);
}

function xhsEventNoteTitle(note) {
    return cleanEventText(note.title || note.body.slice(0, 24) || "未命名笔记", 80);
}

function xhsEventImageText(note) {
    if (note.imageDescription && note.imageDescription.trim()) return cleanEventText(note.imageDescription, 160);
    if (note.imageDataUrl || note.imageAssetId) return "真实图片";
    if (note.videoDescription && note.videoDescription.trim()) return cleanEventText(note.videoDescription, 160);
    return "无";
}

function xhsEventBelongsToNote(entry, noteId) {
    return entry.noteId === noteId
        || entry.id === `xiaohongshu_post_${noteId}`
        || entry.content.includes(`noteId：${noteId}`)
        || entry.content.includes(`noteId:${noteId}`);
}

function recordXiaohongshuPostEvent(input) {
    const timestamp = input.note.createdAt || new Date().toISOString();
    const time = xhsFormatChatTimestamp(timestamp);
    const characterName = cleanEventText(input.characterName, 80) || "角色";
    const title = xhsEventNoteTitle(input.note);
    const body = cleanEventText(input.note.body, 500);
    const image = xhsEventImageText(input.note);

    upsertXiaohongshuEvent(input.characterId, {
        id: `xiaohongshu_post_${input.note.id}`,
        noteId: input.note.id,
        timestamp,
        content: `[小红书 ${time}] ${characterName}在小红书发布了一篇笔记，标题：“${title}”。正文：“${body}”。图片：“${image}”。`,
    });
}

function recordXiaohongshuCommentEvent(input) {
    if (!input.comment.text.trim()) return;
    const timestamp = input.comment.createdAt || new Date().toISOString();
    const time = xhsFormatChatTimestamp(timestamp);
    const characterName = cleanEventText(input.characterName, 80) || "角色";
    const authorLabel = formatAuthorLabel(input.note.source, input.note.authorName, "小红书用户");
    const title = xhsEventNoteTitle(input.note);
    const body = cleanEventText(input.comment.text, 360);

    upsertXiaohongshuEvent(input.characterId, {
        id: `xiaohongshu_comment_${input.comment.id}`,
        noteId: input.note.id,
        commentId: input.comment.id,
        timestamp,
        content: `[小红书 ${time}] ${characterName}在小红书评论了${authorLabel}的笔记《${title}》，评论：“${body}”。点赞：${input.liked ? "是" : "否"}，收藏：${input.saved ? "是" : "否"}。`,
    });
}

function recordXiaohongshuReplyEvent(input) {
    if (!input.comment.text.trim()) return;
    const timestamp = input.comment.createdAt || new Date().toISOString();
    const time = xhsFormatChatTimestamp(timestamp);
    const characterName = cleanEventText(input.characterName, 80) || "角色";
    const targetLabel = input.targetComment
        ? formatAuthorLabel(input.targetComment.authorType, input.targetComment.authorName, "某人")
        : formatAuthorLabel(undefined, input.comment.replyTo, "某人");
    const title = xhsEventNoteTitle(input.note);
    const targetBody = cleanEventText(input.targetComment ? input.targetComment.text : "", 360);
    const body = cleanEventText(input.comment.text, 360);

    upsertXiaohongshuEvent(input.characterId, {
        id: `xiaohongshu_reply_${input.comment.id}`,
        noteId: input.note.id,
        commentId: input.comment.id,
        timestamp,
        content: `[小红书 ${time}] ${characterName}在小红书回复了${targetLabel}在笔记《${title}》下的评论${targetBody ? `，${targetLabel}评论：“${targetBody}”` : ""}，回复：“${body}”。`,
    });
}

function recordXiaohongshuFollowUserEvent(input) {
    const timestamp = input.timestamp || new Date().toISOString();
    const time = xhsFormatChatTimestamp(timestamp);
    const characterName = cleanEventText(input.characterName, 80) || "角色";
    const userDisplayName = cleanEventText(input.userDisplayName, 80) || "小红书用户";

    upsertXiaohongshuEvent(input.characterId, {
        id: "xiaohongshu_follow_user",
        timestamp,
        content: `[小红书 ${time}] ${characterName}关注了“${userDisplayName}”（用户的小红书账号）。`,
    });
}

function deleteXiaohongshuProjectionEventsForNote(noteId) {
    if (!noteId || typeof window === "undefined") return;
    for (const key of xhsKvKeysWithPrefix(XIAOHONGSHU_EVENT_PREFIX)) {
        const events = loadXiaohongshuEventsByKey(key);
        const next = events.filter(entry => !xhsEventBelongsToNote(entry, noteId));
        if (next.length !== events.length) {
            saveXiaohongshuEventsByKey(key, next);
        }
    }
}

function deleteXiaohongshuProjectionEventForComment(commentId) {
    if (!commentId || typeof window === "undefined") return;
    for (const key of xhsKvKeysWithPrefix(XIAOHONGSHU_EVENT_PREFIX)) {
        const events = loadXiaohongshuEventsByKey(key);
        const next = events.filter(entry =>
            entry.commentId !== commentId
            && entry.id !== `xiaohongshu_comment_${commentId}`
            && entry.id !== `xiaohongshu_reply_${commentId}`);
        if (next.length !== events.length) {
            saveXiaohongshuEventsByKey(key, next);
        }
    }
}

function clearXiaohongshuProjectionEvents() {
    if (typeof window === "undefined") return;
    for (const key of xhsKvKeysWithPrefix(XIAOHONGSHU_EVENT_PREFIX)) {
        xhsKvRemove(key);
    }
}

function loadXiaohongshuProjectionEntries(characterId, options) {
    const events = loadXiaohongshuEvents(characterId);
    if (!options || !options.afterTimestamp) return events;
    return events.filter(entry => entry.timestamp > options.afterTimestamp);
}

// ============================================================
// 引擎（lib/xiaohongshu-engine.ts）
// ============================================================

function buildXiaohongshuBilingualInstruction(settings) {
    const prompt = resolveBilingualPrompt(
        !settings || settings.bilingualTranslationEnabled !== false,
        settings ? settings.bilingualTranslationPrompt : undefined,
        DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT,
    );
    if (!prompt) return "";
    return [
        "<xiaohongshu_bilingual_text_instruction>",
        prompt,
        "</xiaohongshu_bilingual_text_instruction>",
    ].join("\n");
}

function cleanReservedName(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function collectXiaohongshuReservedNames(context = {}) {
    const names = [];
    const add = (value) => {
        const name = cleanReservedName(value);
        if (name && !names.includes(name)) names.push(name);
    };

    getXiaohongshuCharacterList().forEach((character) => {
        if (!character) return;
        add(character.realName);
        add(character.remarkName);
        add(resolveCharacterXiaohongshuDisplayName(character));
    });

    add(xhsResolveUserIdentityName());
    add(context.userName);
    add(context.userXiaohongshuName);
    (context.extraReservedNames || []).forEach(add);

    return names;
}

function formatXiaohongshuReservedNames(context = {}) {
    const names = collectXiaohongshuReservedNames(context);
    return names.length > 0 ? names.map(name => `- ${name}`).join("\n") : "- 暂无";
}

function buildDefaultXiaohongshuNpcIdentityGuard(context = {}) {
    return DEFAULT_XIAOHONGSHU_NPC_IDENTITY_GUARD_PROMPT.replace(
        /\{\{\s*xiaohongshuReservedNames\s*\}\}/g,
        formatXiaohongshuReservedNames(context),
    );
}

function expandXiaohongshuNpcMacros(text, context = {}) {
    return text
        .replace(/\{\{\s*xiaohongshuReservedNames\s*\}\}/g, formatXiaohongshuReservedNames(context))
        .replace(/\{\{\s*xiaohongshuNpcIdentityGuard\s*\}\}/g, buildDefaultXiaohongshuNpcIdentityGuard(context));
}

function buildXiaohongshuNpcPrompt(settings, prompt, context = {}) {
    const guardTemplate = ((settings && settings.npcIdentityGuardPrompt) ?? "").trim() || DEFAULT_XIAOHONGSHU_NPC_IDENTITY_GUARD_PROMPT;
    const guard = expandXiaohongshuNpcMacros(guardTemplate, context).trim();
    const body = expandXiaohongshuNpcMacros(prompt, context).trim();
    return [guard, body].filter(Boolean).join("\n\n");
}

// 解析层剪枝：保留名单守卫只是提示词约束，模型不听话时仍会产出冒用
// 用户名的"路人"评论（实报）。朋友圈引擎早有同类剪枝，这里对齐口径：
// 命中用户名的生成评论整条丢弃，挂在它下面的楼中楼一并丢弃。
function normalizeXiaohongshuAuthorName(value) {
    return cleanReservedName(value).toLowerCase();
}

function buildXiaohongshuUserNameSet(extraNames = []) {
    const names = [
        xhsResolveUserIdentityName(),
        ...extraNames,
    ].map(normalizeXiaohongshuAuthorName).filter(Boolean);
    return new Set(names);
}

function isXiaohongshuUserAuthorName(authorName, userNames) {
    const normalized = normalizeXiaohongshuAuthorName(authorName);
    return normalized !== "" && userNames.has(normalized);
}

function getUserXiaohongshuNamesFromNote(note) {
    const names = [
        note.source === "user" ? note.authorName : "",
        ...note.comments
            .filter(comment => comment.authorType === "user")
            .map(comment => comment.authorName),
    ].map(cleanReservedName).filter(Boolean);
    return Array.from(new Set(names));
}

function getUserXiaohongshuNamesFromNotes(notes) {
    const names = notes.flatMap(note => getUserXiaohongshuNamesFromNote(note));
    return Array.from(new Set(names));
}

class XiaohongshuGenerationError extends Error {
    constructor(message, rawOutput = "", parseError) {
        super(message);
        this.name = "XiaohongshuGenerationError";
        this.rawOutput = rawOutput;
        this.parseError = parseError;
    }
}

function parseWithDebug(raw, parser, fallbackMessage) {
    try {
        return parser(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : fallbackMessage;
        throw new XiaohongshuGenerationError(fallbackMessage, raw, message);
    }
}

function parseMetric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const text = String(value ?? "")
        .trim()
        .replace(/[,，\s]/g, "");
    if (!text) return 0;
    const tenThousandMatch = /^(-?\d+(?:\.\d+)?)[wW万](?:(\d+(?:\.\d+)?)(?:[kK千])?)?$/.exec(text);
    if (tenThousandMatch) {
        const main = Number(tenThousandMatch[1]);
        const tail = tenThousandMatch[2] ? Number(tenThousandMatch[2]) : 0;
        if (Number.isFinite(main) && Number.isFinite(tail)) {
            return Math.max(0, Math.round(main * 10000 + tail * 1000));
        }
    }
    const thousandMatch = /^(-?\d+(?:\.\d+)?)[kK千](?:(\d+(?:\.\d+)?)(?:百)?)?$/.exec(text);
    if (thousandMatch) {
        const main = Number(thousandMatch[1]);
        const tail = thousandMatch[2] ? Number(thousandMatch[2]) : 0;
        if (Number.isFinite(main) && Number.isFinite(tail)) {
            return Math.max(0, Math.round(main * 1000 + tail * 100));
        }
    }
    const numeric = Number(text.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric)) return 0;
    if (/[wW万]/.test(text)) return Math.max(0, Math.round(numeric * 10000));
    if (/[kK千]/.test(text)) return Math.max(0, Math.round(numeric * 1000));
    return Math.max(0, Math.round(numeric));
}

function metricField(fields, names) {
    if (!fields) return undefined;
    for (const name of names) {
        if (fields[name] !== undefined) return fields[name];
    }
    return undefined;
}

function parseMetricField(fields, names, fallback = 0) {
    const value = metricField(fields, names);
    return value === undefined || String(value).trim() === "" ? fallback : parseMetric(value);
}

function parseBoolean(value) {
    const text = String(value ?? "").trim().toLowerCase();
    return ["是", "yes", "true", "1", "y", "喜欢", "收藏"].includes(text);
}

function parseTags(value) {
    return Array.from(new Set(String(value ?? "")
        .split(/[,，、#\s]+/)
        .map(tag => cleanText(tag, 18))
        .filter(Boolean))).slice(0, 6);
}

function stripFences(text) {
    return text
        .replace(/^```(?:text|json|markdown)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function parseBlocks(text) {
    const blocks = [];
    let current = null;
    const lines = stripFences(text).split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const blockMatch = /^#\s*([^\d#\[]+?)(\d+)?\s*$/.exec(line);
        if (blockMatch) {
            if (current) blocks.push(current);
            current = {
                title: blockMatch[1].trim(),
                number: Number(blockMatch[2] || "1"),
                fields: {},
            };
            continue;
        }
        if (!current) {
            current = { title: "全局", number: 1, fields: {} };
        }
        const fieldMatch = /^\[([^\]]+)]\s*(.*)$/.exec(line);
        if (fieldMatch) {
            current.fields[fieldMatch[1].trim()] = fieldMatch[2].trim();
        }
    }
    if (current) blocks.push(current);
    return blocks;
}

function parseBlockComments(fields, noteId, source = "npc") {
    const numbers = Object.keys(fields)
        .map(key => {
            const match = /^评论(\d+)作者$/.exec(key);
            return match ? match[1] : null;
        })
        .filter(value => Boolean(value))
        .map(Number)
        .sort((a, b) => a - b);
    const userNames = buildXiaohongshuUserNameSet();
    const prunedNumbers = new Set();
    const comments = [];
    for (const number of numbers) {
        const authorName = cleanText(fields[`评论${number}作者`], 60) || "小红书用户";
        const replyTarget = cleanText(fields[`评论${number}回复对象`], 40);
        const replyNumberMatch = /^评论(\d+)$/.exec(replyTarget);
        const replyNumber = replyNumberMatch ? replyNumberMatch[1] : null;
        if (isXiaohongshuUserAuthorName(authorName, userNames)) {
            console.warn(`[Xiaohongshu] 剪掉冒用用户名的生成评论: "${authorName}"`);
            prunedNumbers.add(number);
            continue;
        }
        if (replyNumber && prunedNumbers.has(Number(replyNumber))) {
            prunedNumbers.add(number);
            continue;
        }
        const text = cleanMultiline(fields[`评论${number}内容`], 600);
        if (!text) continue;
        comments.push(makeXiaohongshuComment({
            noteId,
            authorType: source,
            authorId: source === "npc" ? makeXiaohongshuNpcId(authorName) : source,
            authorName,
            text,
            replyTo: replyNumber ? undefined : (replyTarget || undefined),
            replyToCommentId: replyNumber ? `${noteId}_comment_${replyNumber}` : undefined,
            unread: source === "npc",
        }));
    }
    return comments;
}

/**
 * 解析 [延伸N作者/回复对象/内容] 字段族为角色侧 thread 数组。
 * - 字段名兼容 "延伸N作者"/"延伸N回复对象"/"延伸N内容"
 * - 没有任何延伸字段时返回空数组（apply 端据此回退到"只保留主评论"）
 */
function parseCharacterThreadFields(fields) {
    const numbers = Object.keys(fields)
        .map(key => {
            const match = /^延伸(\d+)作者$/.exec(key);
            return match ? match[1] : null;
        })
        .filter(value => Boolean(value))
        .map(Number)
        .sort((a, b) => a - b);
    return numbers.map((number) => {
        const authorName = cleanText(fields[`延伸${number}作者`], 60);
        const replyTo = cleanText(fields[`延伸${number}回复对象`], 60);
        return {
            number,
            authorName,
            text: cleanMultiline(fields[`延伸${number}内容`], 600),
            replyTo: replyTo || undefined,
        };
    }).filter(item => item.text && item.authorName).slice(0, 8);
}

function isCharacterXiaohongshuAuthor(authorName, characterDisplayName, characterName) {
    const normalized = authorName.trim();
    if (!normalized) return false;
    return [characterDisplayName.trim(), characterName.trim()].filter(Boolean).includes(normalized);
}

/**
 * 把角色侧 thread 评论按顺序追加到 note 上：
 * - "主评论" 或缺省 → replyToCommentId = mainCommentId
 * - "延伸N" → replyToCommentId 指向前面已生成的 thread comment
 * - 作者名匹配 character.name 或小红书显示名 → authorType="character"，否则 "npc"
 */
function appendCharacterThreadToNote(args) {
    const { note, characterDisplayName, characterName, characterId, thread, mainCommentId, shouldNotifyUser } = args;
    const appended = [];
    const numberToId = new Map();
    const userNames = buildXiaohongshuUserNameSet(getUserXiaohongshuNamesFromNote(note));
    const prunedNumbers = new Set();
    thread.forEach((item) => {
        const isCharacter = isCharacterXiaohongshuAuthor(item.authorName, characterDisplayName, characterName);
        const replyTarget = (item.replyTo || "").trim();
        const referenceMatch = /^延伸(\d+)$/.exec(replyTarget);
        if (!isCharacter && isXiaohongshuUserAuthorName(item.authorName, userNames)) {
            console.warn(`[Xiaohongshu] 剪掉冒用用户名的楼中楼评论: "${item.authorName}"`);
            prunedNumbers.add(item.number);
            return;
        }
        if (referenceMatch && prunedNumbers.has(Number(referenceMatch[1]))) {
            prunedNumbers.add(item.number);
            return;
        }
        const isMainReply = !replyTarget || /^主评论$/.test(replyTarget);
        const replyToCommentId = isMainReply
            ? mainCommentId
            : referenceMatch
                ? (numberToId.get(Number(referenceMatch[1])) || mainCommentId)
                : mainCommentId;
        const comment = makeXiaohongshuComment({
            noteId: note.id,
            authorType: isCharacter ? "character" : "npc",
            authorId: isCharacter ? characterId : makeXiaohongshuNpcId(item.authorName),
            authorName: isCharacter ? characterDisplayName : item.authorName,
            text: item.text,
            replyToCommentId,
            unread: shouldNotifyUser,
        });
        appended.push(comment);
        numberToId.set(item.number, comment.id);
    });
    const notifications = shouldNotifyUser
        ? appended
            .filter(comment => comment.authorType === "npc")
            .map(comment => makeXiaohongshuNotification({
                type: "comment",
                noteId: note.id,
                actorName: comment.authorName,
                text: comment.text,
                thumbnailText: note.title,
                unread: true,
            }))
        : [];
    return {
        note: {
            ...note,
            comments: [...note.comments, ...appended],
            commentCount: note.commentCount + appended.length,
            updatedAt: appended.length > 0 ? new Date().toISOString() : note.updatedAt,
        },
        appended,
        notifications,
    };
}

function parseNoteBlock(block, type, index, source = "npc", authorId = "npc", feedScope = "discover") {
    const noteId = makeId(type === "video" ? "xhs_video" : "xhs_note");
    const body = cleanMultiline(block.fields["正文"] ?? block.fields["内容"], 3000);
    const title = cleanText(block.fields["标题"], 80) || body.slice(0, 24);
    if (!title && !body) return null;
    const comments = parseBlockComments(block.fields, noteId, source);
    const authorName = cleanText(block.fields["作者"] ?? block.fields["落款"], 60) || "小红书用户";
    return {
        id: noteId,
        type,
        feedScope,
        source,
        authorId: source === "npc" && authorId === "npc" ? makeXiaohongshuNpcId(authorName) : authorId,
        authorName,
        title: title || "未命名笔记",
        body,
        videoDescription: cleanMultiline(block.fields["视频描述"] ?? block.fields["画面描述"], 500) || undefined,
        coverIcon: cleanText(block.fields["图标"], 8) || (type === "video" ? "▶" : "✦"),
        tone: ["ivory", "mist", "blush", "graphite", "card-a", "card-b", "card-c", "card-d"][index % 8],
        tags: parseTags(block.fields["标签"] ?? block.fields["TAG"]),
        likeCount: parseMetricField(block.fields, ["点赞", "点赞数", "赞"]),
        saveCount: parseMetricField(block.fields, ["收藏", "收藏数"]),
        commentCount: parseMetricField(block.fields, ["评论数", "评论量", "评论"], comments.length),
        liked: parseBoolean(block.fields["已赞"]),
        saved: parseBoolean(block.fields["已收藏"]),
        recentLikeNames: [block.fields["点赞用户1"], block.fields["点赞用户2"]].map(name => cleanText(name, 24)).filter(Boolean),
        recentSaveNames: [block.fields["收藏用户1"], block.fields["收藏用户2"]].map(name => cleanText(name, 24)).filter(Boolean),
        comments: comments.map((comment, idx) => ({ ...comment, id: `${noteId}_comment_${idx + 1}` })),
        imageDescription: cleanMultiline(block.fields["图片描述"] ?? block.fields["配图"], 500) || undefined,
        createdAt: new Date(Date.now() - index * 1000 * 60 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function parseXiaohongshuNpcFeed(raw) {
    const blocks = parseBlocks(raw);
    const nearbyNotes = blocks
        .filter(block => /附近笔记|同城笔记|附近/.test(block.title) && !/视频/.test(block.title))
        .slice(0, 4)
        .map((block, index) => parseNoteBlock(block, "post", index + 12, "npc", "npc", "nearby"))
        .filter(note => Boolean(note));
    const homeNotes = blocks
        .filter(block => /首页笔记|图文笔记|笔记/.test(block.title) && !/视频|附近|同城/.test(block.title))
        .slice(0, 6)
        .map((block, index) => parseNoteBlock(block, "post", index, "npc"))
        .filter(note => Boolean(note));
    const videoNotes = blocks
        .filter(block => /视频/.test(block.title))
        .slice(0, 6)
        .map((block, index) => parseNoteBlock(block, "video", index + homeNotes.length, "npc"))
        .filter(note => Boolean(note));
    return { homeNotes, videoNotes, nearbyNotes };
}

function parseXiaohongshuNpcReaction(raw, noteId) {
    const blocks = parseBlocks(raw);
    const interaction = blocks.find(block => /用户笔记互动|互动/.test(block.title)) ?? blocks[0];
    const commentFields = blocks.reduce((acc, block) => ({ ...acc, ...block.fields }), {});
    const comments = parseBlockComments(commentFields, noteId, "npc").map((comment) => ({
        authorName: comment.authorName,
        text: comment.text,
        replyTo: comment.replyTo,
        replyToCommentId: comment.replyToCommentId,
    }));
    const directMessages = blocks
        .filter(block => /私信|消息/.test(block.title))
        .map(block => ({
            name: cleanText(block.fields["名称"] ?? block.fields["作者"], 60) || "小红书用户",
            text: cleanMultiline(block.fields["正文"] ?? block.fields["内容"], 600),
        }))
        .filter(item => item.text)
        .slice(0, 6);
    const followerCount = parseMetric(metricField(interaction ? interaction.fields : undefined, ["新增关注", "关注", "粉丝"]));
    const followerNames = Array.from(new Set([
        interaction ? interaction.fields["关注用户1"] : undefined,
        interaction ? interaction.fields["关注用户2"] : undefined,
        interaction ? interaction.fields["关注用户3"] : undefined,
        ...Array.from({ length: Math.min(12, followerCount) }, (_, index) => (interaction ? interaction.fields[`关注用户${index + 1}`] : undefined)),
    ].map(name => cleanText(name, 60)).filter(Boolean))).slice(0, Math.max(2, followerCount || 0));
    return {
        likeCount: parseMetric(metricField(interaction ? interaction.fields : undefined, ["点赞", "点赞数", "赞"])),
        saveCount: parseMetric(metricField(interaction ? interaction.fields : undefined, ["收藏", "收藏数"])),
        recentLikeNames: [interaction ? interaction.fields["点赞用户1"] : undefined, interaction ? interaction.fields["点赞用户2"] : undefined].map(name => cleanText(name, 24)).filter(Boolean),
        recentSaveNames: [interaction ? interaction.fields["收藏用户1"] : undefined, interaction ? interaction.fields["收藏用户2"] : undefined].map(name => cleanText(name, 24)).filter(Boolean),
        comments,
        directMessages,
        followerNames,
    };
}

function parseXiaohongshuNpcCommentReply(raw, noteId, fallbackReplyToCommentId) {
    const blocks = parseBlocks(raw);
    const fields = blocks.reduce((acc, block) => ({ ...acc, ...block.fields }), {});
    const numbers = Object.keys(fields)
        .map(key => {
            const match = /^评论(\d+)作者$/.exec(key);
            return match ? match[1] : null;
        })
        .filter(value => Boolean(value))
        .map(Number)
        .sort((a, b) => a - b);
    const userNames = buildXiaohongshuUserNameSet();
    const prunedNumbers = new Set();
    const comments = [];
    for (const number of numbers) {
        if (comments.length >= 4) break;
        const authorName = cleanText(fields[`评论${number}作者`], 60) || "小红书用户";
        const replyValue = cleanText(fields[`评论${number}回复评论ID`] ?? fields[`评论${number}回复对象`], 180);
        const replyNumberMatch = /^评论(\d+)$/.exec(replyValue);
        const replyNumber = replyNumberMatch ? replyNumberMatch[1] : null;
        if (isXiaohongshuUserAuthorName(authorName, userNames)) {
            console.warn(`[Xiaohongshu] 剪掉冒用用户名的生成评论: "${authorName}"`);
            prunedNumbers.add(number);
            continue;
        }
        if (replyNumber && prunedNumbers.has(Number(replyNumber))) {
            prunedNumbers.add(number);
            continue;
        }
        const isEmptyReply = !replyValue || /^(无|none|null|-)$/.test(replyValue.toLowerCase()) || /被回复|候选|评论id/i.test(replyValue);
        const replyToCommentId = replyNumber
            ? `${noteId}_comment_${replyNumber}`
            : !isEmptyReply
                ? replyValue
                : fallbackReplyToCommentId;
        const text = cleanMultiline(fields[`评论${number}内容`], 600);
        if (!text) continue;
        comments.push({ authorName, text, replyToCommentId });
    }
    return { comments };
}

function parseXiaohongshuNpcMoreComments(raw) {
    const blocks = parseBlocks(raw);
    const fields = blocks.reduce((acc, block) => ({ ...acc, ...block.fields }), {});
    const numbers = Object.keys(fields)
        .map(key => {
            const match = /^评论(\d+)作者$/.exec(key);
            return match ? match[1] : null;
        })
        .filter(value => Boolean(value))
        .map(Number)
        .sort((a, b) => a - b);
    const userNames = buildXiaohongshuUserNameSet();
    const prunedNumbers = new Set();
    const comments = [];
    for (const number of numbers) {
        if (comments.length >= 8) break;
        const authorName = cleanText(fields[`评论${number}作者`], 60) || "小红书用户";
        const replyId = cleanText(fields[`评论${number}回复评论ID`], 180);
        const replyTarget = cleanText(fields[`评论${number}回复对象`], 80);
        const replyNumberMatch = /^评论(\d+)$/.exec(replyTarget);
        const replyNumber = replyNumberMatch ? replyNumberMatch[1] : null;
        if (isXiaohongshuUserAuthorName(authorName, userNames)) {
            console.warn(`[Xiaohongshu] 剪掉冒用用户名的生成评论: "${authorName}"`);
            prunedNumbers.add(number);
            continue;
        }
        if (replyNumber && prunedNumbers.has(Number(replyNumber))) {
            prunedNumbers.add(number);
            continue;
        }
        const isEmptyReplyId = !replyId || /^(无|none|null|-)$/.test(replyId.toLowerCase()) || /从上下文|真实评论id|被回复|候选|评论id/i.test(replyId);
        const text = cleanMultiline(fields[`评论${number}内容`], 600);
        if (!text) continue;
        comments.push({
            authorName,
            text,
            replyTo: !replyNumber && replyTarget ? replyTarget : undefined,
            replyToCommentId: !isEmptyReplyId
                ? replyId
                : replyNumber
                    ? `__generated_comment_${replyNumber}`
                    : undefined,
        });
    }
    return { comments };
}

function parseXiaohongshuNpcDmReply(raw) {
    const blocks = parseBlocks(raw).filter(block => /私信|回复|消息/.test(block.title));
    const messages = blocks
        .map(block => cleanMultiline(block.fields["正文"] ?? block.fields["内容"] ?? block.fields["回复"], 600))
        .filter(Boolean)
        .slice(0, 4);
    if (messages.length > 0) return { messages };
    const fallback = cleanMultiline(raw.replace(/^#.*$/gm, "").replace(/^\[[^\]]+]\s*/gm, ""), 600);
    return { messages: fallback ? [fallback] : [] };
}

function parseXiaohongshuCharacterActivity(raw, allowedNoteIds) {
    const blocks = parseBlocks(raw);
    const comments = blocks
        .filter(block => /评论/.test(block.title))
        .map(block => {
            const thread = parseCharacterThreadFields(block.fields);
            return {
                noteId: cleanText(block.fields["笔记ID"] ?? block.fields["noteId"], 180),
                text: cleanMultiline(block.fields["内容"] ?? block.fields["评论"], 600),
                liked: parseBoolean(block.fields["点赞"]),
                saved: parseBoolean(block.fields["收藏"]),
                thread: thread.length > 0 ? thread : undefined,
            };
        })
        .filter(item => item.noteId && item.text && allowedNoteIds.includes(item.noteId))
        .slice(0, 3);
    const postBlock = blocks.find(block => /发帖|笔记|视频/.test(block.title) && !/评论/.test(block.title));
    const rawPostType = cleanText(postBlock ? (postBlock.fields["类型"] ?? postBlock.fields["格式"] ?? postBlock.title) : "", 40).toLowerCase();
    const postType = /视频|video/.test(rawPostType) ? "video" : "post";
    const post = postBlock
        ? {
            type: postType,
            title: cleanText(postBlock.fields["标题"], 80),
            body: cleanMultiline(postBlock.fields["正文"] ?? postBlock.fields["内容"], 3000),
            coverIcon: cleanText(postBlock.fields["图标"], 8) || (postType === "video" ? "▶" : "✦"),
            tags: parseTags(postBlock.fields["标签"] ?? postBlock.fields["TAG"]),
            likeCount: parseMetricField(postBlock.fields, ["点赞", "点赞数", "赞"]),
            saveCount: parseMetricField(postBlock.fields, ["收藏", "收藏数"]),
            commentCount: parseMetricField(postBlock.fields, ["评论数", "评论量", "评论"], parseBlockComments(postBlock.fields, "__character_post__", "npc").length),
            recentLikeNames: [postBlock.fields["点赞用户1"], postBlock.fields["点赞用户2"]].map(name => cleanText(name, 24)).filter(Boolean),
            recentSaveNames: [postBlock.fields["收藏用户1"], postBlock.fields["收藏用户2"]].map(name => cleanText(name, 24)).filter(Boolean),
            imageDescription: postType === "post" ? (cleanMultiline(postBlock.fields["图片描述"] ?? postBlock.fields["配图"], 500) || undefined) : undefined,
            videoDescription: postType === "video"
                ? (cleanMultiline(postBlock.fields["视频描述"] ?? postBlock.fields["视频画面"] ?? postBlock.fields["图片描述"] ?? postBlock.fields["配图"], 500) || undefined)
                : undefined,
            comments: parseBlockComments(postBlock.fields, "__character_post__", "npc")
                .map((comment) => ({
                    authorName: comment.authorName,
                    text: comment.text,
                    replyTo: comment.replyTo,
                    replyToCommentId: comment.replyToCommentId,
                }))
                .slice(0, 8),
        }
        : undefined;
    return { comments, post: post && (post.title || post.body) ? post : undefined };
}

function parseXiaohongshuCharacterReaction(raw) {
    const blocks = parseBlocks(raw);
    const block = blocks.find(item => /角色互动|互动|评论|回复/.test(item.title)) ?? blocks[0];
    const thread = block ? parseCharacterThreadFields(block.fields) : [];
    return {
        comment: cleanMultiline(block ? (block.fields["评论"] ?? block.fields["内容"]) : "", 600),
        liked: parseBoolean(block ? block.fields["点赞"] : undefined),
        saved: parseBoolean(block ? block.fields["收藏"] : undefined),
        followedAuthor: parseBoolean(block ? (block.fields["关注作者"] ?? block.fields["关注"]) : undefined),
        thread: thread.length > 0 ? thread : undefined,
    };
}

function parseXiaohongshuCharacterMentionReply(raw) {
    const blocks = parseBlocks(raw);
    const block = blocks.find(item => /角色回复|回复|评论/.test(item.title)) ?? blocks[0];
    const thread = block ? parseCharacterThreadFields(block.fields) : [];
    return {
        comment: cleanMultiline(block ? (block.fields["内容"] ?? block.fields["评论"]) : "", 600),
        thread: thread.length > 0 ? thread : undefined,
    };
}

function formatFollowedAccountsForPrompt(accounts = []) {
    const names = accounts
        .filter(account => account.type !== "user")
        .map(account => account.name)
        .filter(Boolean)
        .slice(0, 12);
    if (names.length === 0) return "";
    return [
        "用户当前关注的小红书账号：",
        ...names.map(name => `- ${name}`),
        "生成内容流时，可以适当提高这些账号再次出现的概率，但不要强行全部出现。",
    ].join("\n");
}

function formatNpcFeedUserContext(userIpLocation) {
    const ipLocation = cleanText(userIpLocation, 60) || "未知";
    return [
        "用户资料上下文：",
        `[用户IP属地]${ipLocation}`,
    ].join("\n");
}

function collectCleanNames(values) {
    const names = [];
    for (const value of values) {
        const name = cleanText(value, 80);
        if (name && !names.includes(name)) names.push(name);
    }
    return names;
}

function getXiaohongshuUserProfileName() {
    const state = loadXiaohongshuState();
    return cleanText(state.profile.nickname, 80) || "小红书用户";
}

function hasCharacterFollowedUser(characterId) {
    if (!characterId) return false;
    return loadXiaohongshuState().socialGraph.followers.some(account =>
        account.type === "character" && account.id === characterId);
}

function buildXiaohongshuUserIdentityHint(input) {
    const userName = cleanText(input.userName, 80)
        || cleanText(xhsResolveUserIdentityName(input.characterId), 80)
        || "用户";
    const names = collectCleanNames([
        ...(input.xiaohongshuNames || []),
        getXiaohongshuUserProfileName(),
    ]);
    const xiaohongshuNameText = names.length > 0 ? names.join("、") : "未知";
    const followed = hasCharacterFollowedUser(input.characterId);
    const body = followed
        ? [
            "你已关注用户的小红书账号，可以明确识别该账号与用户本人的关系。",
            `用户真实身份：${userName}`,
            `用户小红书昵称/马甲：${xiaohongshuNameText}`,
            "当作者或评论者显示为上述昵称时，按用户本人处理；回复时保持自然，不要生硬暴露系统说明。",
        ]
        : [
            "你当前没有关注该小红书账号。",
            "当前作者或评论者只对你显示为公开小红书昵称；可以根据公开内容、语气、昵称、图片和已有记忆自行判断作者是否熟悉。",
            "不要直接断定对方的现实身份；如果判断不出熟悉关系，就按陌生小红书用户自然回应。",
        ];
    return [
        "<xiaohongshu_user_identity_hint>",
        ...body,
        "</xiaohongshu_user_identity_hint>",
    ].join("\n");
}

function prependXiaohongshuUserIdentityHint(context, hint) {
    return [hint.trim(), context.trim()].filter(Boolean).join("\n\n");
}

// 源实现从 settings-storage 解析全局绑定 API；mie 直接用 db.apiSettings。
function resolveGlobalApiConfig() {
    const config = typeof db !== "undefined" ? db.apiSettings : null;
    if (!config || !config.url || !config.key || !config.model) return null;
    return config;
}

// ── 视觉输入支持 ──────────────────────────────────────────────

function xhsHasNoteImage(note) {
    return Boolean(note && (note.imageDataUrl || note.imageAssetId));
}

// mie 的笔记图片直接是 dataURL（note.imageDataUrl），无需 IndexedDB 查询。
async function resolveNoteImageDataUrl(note) {
    if (!note) return null;
    if (typeof note.imageDataUrl === "string" && note.imageDataUrl) return note.imageDataUrl;
    return null;
}

function makeXiaohongshuImagePart(dataUrl) {
    const text = String(dataUrl || "");
    const match = /^data:([^;,]+)/.exec(text);
    return {
        mimeType: match ? match[1] : "image/jpeg",
        dataUrl: text,
    };
}

function xhsDataUrlToBase64(dataUrl) {
    const text = String(dataUrl || "");
    if (/^data:/i.test(text)) {
        const commaIndex = text.indexOf(",");
        if (commaIndex >= 0) return text.slice(commaIndex + 1);
    }
    return text;
}

/**
 * AI 请求统一入口（仿 js/modules/calendar_engine.js 的 calSendLlmRequest）。
 * - provider === "gemini"：POST {url}/v1beta/models/{model}:generateContent?key={key}
 *   system_instruction + contents；imageParts 转 inline_data。
 * - 其他（OpenAI 兼容）：POST {url}/v1/chat/completions，Bearer key；
 *   imageParts 转 image_url content parts。
 * imageParts: 可选数组 [{ mimeType, dataUrl }]，dataUrl 为 base64 data URL。
 */
async function xhsSendLlmRequest(apiConfig, systemPrompt, userPrompt, imageParts) {
    const baseUrl = String(apiConfig.url || "").replace(/\/+$/, "");
    const { key, model, provider } = apiConfig;
    const images = Array.isArray(imageParts) ? imageParts.filter(part => part && part.dataUrl) : [];

    let endpoint, headers, body;

    if (provider === "gemini") {
        const parts = [{ text: userPrompt }];
        for (const part of images) {
            parts.push({
                inline_data: {
                    mime_type: part.mimeType || "image/jpeg",
                    data: xhsDataUrlToBase64(part.dataUrl),
                },
            });
        }
        endpoint = `${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`;
        headers = { "Content-Type": "application/json" };
        const payload = {
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.8 },
        };
        if (systemPrompt) {
            payload.system_instruction = { parts: [{ text: systemPrompt }] };
        }
        body = JSON.stringify(payload);
    } else {
        let userContent = userPrompt;
        if (images.length > 0) {
            userContent = [{ type: "text", text: userPrompt }]
                .concat(images.map(part => ({ type: "image_url", image_url: { url: part.dataUrl, detail: "low" } })));
        }
        endpoint = `${baseUrl}/v1/chat/completions`;
        headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        };
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: userContent });
        body = JSON.stringify({
            model,
            messages,
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
        return (data?.candidates?.[0]?.content?.parts || [])
            .map(part => (part && typeof part.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("\n")
            || data?.candidates?.[0]?.content?.parts?.[0]?.text
            || "";
    }
    return data?.choices?.[0]?.message?.content || "";
}

function isVisionUnsupportedError(error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const lower = message.toLowerCase();
    const statusLooksRelevant = /api error\s+(400|413|415|422)/i.test(message)
        || /invalid_request|invalid request|invalid_argument|invalid parameters|invalid format|request_too_large|unsupported/i.test(lower)
        || /参数|格式|不支持|请求体/.test(message);
    if (!statusLooksRelevant) return false;
    return [
        "image_url",
        "input_image",
        "image input",
        "image content",
        "image block",
        "image source",
        "inline_data",
        "inlinedata",
        "file_data",
        "mime_type",
        "media_type",
        "unsupported media",
        "unsupported content",
        "unsupported content type",
        "invalid content type",
        "content must be a string",
        "content should be a string",
        "content must be string",
        "expected string",
        "expected a string",
        "expected object",
        "expected array",
        "multimodal",
        "multi-modal",
        "vision",
        "does not support images",
        "doesn't support images",
        "model does not support",
        "not support image",
        "only supports text",
        "text only",
        "request_too_large",
        "图片",
        "图像",
        "视觉",
        "多模态",
        "不支持图片",
        "不支持图像",
        "不支持多模态",
        "参数非法",
        "参数有误",
        "请求体格式错误",
        "当前模型不支持",
    ].some(keyword => lower.includes(keyword.toLowerCase()) || message.includes(keyword));
}

async function xhsSendWithOptionalVisionFallback(apiConfig, systemPrompt, userPrompt, imageParts) {
    const attemptedVision = Array.isArray(imageParts) && imageParts.length > 0;
    try {
        return await xhsSendLlmRequest(apiConfig, systemPrompt, userPrompt, imageParts);
    } catch (error) {
        if (!attemptedVision || !isVisionUnsupportedError(error)) throw error;
        console.warn("[Xiaohongshu] Vision request failed, retrying without images:", error);
        return xhsSendLlmRequest(apiConfig, systemPrompt, userPrompt, null);
    }
}

// ── 上下文格式化 ─────────────────────────────────────────────

function formatXiaohongshuFeedContext(notes) {
    if (notes.length === 0) return "暂无小红书笔记。";
    return notes
        .slice(0, 30)
        .map((note) => {
            const comments = note.comments.slice(0, 8).map((comment, index) => {
                const reply = comment.replyToCommentId
                    ? ` 回复${comment.replyToCommentId.replace(/^.*_comment_/, "评论")}`
                    : comment.replyTo
                        ? ` 回复${comment.replyTo}`
                        : "";
                return `  [评论${index + 1}] ${comment.authorName}${reply}：${comment.text}`;
            });
            return [
                `#笔记`,
                `[笔记ID]${note.id}`,
                `[类型]${note.type === "video" ? "视频" : "图文"}`,
                `[作者]${note.authorName}`,
                `[标题]${note.title}`,
                `[正文]${note.body}`,
                note.imageDescription ? `[图片内容]${note.imageDescription}` : xhsHasNoteImage(note) ? "[图片内容]有真实图片" : "",
                `[TAG]${note.tags.join("、") || "无"}`,
                `[点赞]${note.likeCount}`,
                `[收藏]${note.saveCount}`,
                `[评论数]${note.commentCount}`,
                "已有评论：",
                comments.length ? comments.join("\n") : "  暂无评论",
            ].filter(Boolean).join("\n");
        })
        .join("\n\n");
}

function formatXiaohongshuUserPostContext(note) {
    return formatXiaohongshuFeedContext([note]);
}

function formatCommentLine(comment, comments) {
    const targetName = comment.replyToCommentId
        ? (comments.find(item => item.id === comment.replyToCommentId) || {}).authorName
        : comment.replyTo;
    const reply = targetName ? ` 回复${targetName}` : "";
    return `[评论ID]${comment.id} [作者]${comment.authorName}${reply}：[内容]${comment.text}`;
}

function formatXiaohongshuCommentContext(note, userComment, targetComment) {
    const recentComments = note.comments
        .slice(-16)
        .map(comment => formatCommentLine(comment, note.comments));
    return [
        "#笔记",
        `[笔记ID]${note.id}`,
        `[类型]${note.type === "video" ? "视频" : "图文"}`,
        `[作者]${note.authorName}`,
        `[标题]${note.title}`,
        `[正文]${note.body}`,
        note.imageDescription ? `[图片内容]${note.imageDescription}` : xhsHasNoteImage(note) ? "[图片内容]有真实图片" : "",
        `[TAG]${note.tags.join("、") || "无"}`,
        `[点赞]${note.likeCount}`,
        `[收藏]${note.saveCount}`,
        `[评论数]${note.commentCount}`,
        "",
        targetComment ? "#被回复评论" : "",
        targetComment ? formatCommentLine(targetComment, note.comments) : "",
        "",
        "#当前触发的评论",
        formatCommentLine(userComment, note.comments),
        "",
        "#已有评论",
        recentComments.length ? recentComments.join("\n") : "暂无评论",
    ].filter(Boolean).join("\n");
}

function formatXiaohongshuMentionContext(note, userComment, mentionedCharacter, targetComment) {
    return [
        `[被@角色]${resolveCharacterXiaohongshuDisplayName(mentionedCharacter)}`,
        "",
        formatXiaohongshuCommentContext(note, userComment, targetComment),
    ].filter(Boolean).join("\n");
}

function formatXiaohongshuNoteCommentContext(note) {
    const comments = note.comments
        .slice(-30)
        .map(comment => formatCommentLine(comment, note.comments));
    return [
        "#笔记",
        `[笔记ID]${note.id}`,
        `[类型]${note.type === "video" ? "视频" : "图文"}`,
        `[来源]${note.source === "user" ? "用户笔记" : note.source === "character" ? "角色笔记" : "NPC笔记"}`,
        `[作者]${note.authorName}`,
        `[标题]${note.title}`,
        `[正文]${note.body}`,
        note.videoDescription ? `[视频内容]${note.videoDescription}` : "",
        note.imageDescription ? `[图片内容]${note.imageDescription}` : xhsHasNoteImage(note) ? "[图片内容]有真实图片" : "",
        `[TAG]${note.tags.join("、") || "无"}`,
        `[点赞]${note.likeCount}`,
        `[收藏]${note.saveCount}`,
        `[评论数]${note.commentCount}`,
        "",
        "#已有评论",
        comments.length ? comments.join("\n") : "暂无评论",
    ].filter(Boolean).join("\n");
}

function formatXiaohongshuDmContext(input) {
    const history = input.messages
        .slice(-20)
        .map((message) => {
            const speaker = message.direction === "outgoing" ? input.userName : input.threadName;
            return `[${speaker}] ${message.text}`;
        });
    return [
        `[对话对象]${input.threadName}`,
        `[用户昵称]${input.userName}`,
        "",
        "#用户刚发送的私信",
        input.latestUserText,
        "",
        "#历史私信",
        history.length ? history.join("\n") : "暂无历史私信",
    ].join("\n");
}

// ── 角色装配（简化版 resolveCharacterAssemblerInput）─────────────
// 源实现走 preset/worldbook/regex/memory 装配器（assemblePromptPayload），
// mie 没有该体系：直接从 db.characters 取角色，用 persona 组系统提示词，
// 小红书上下文（feedContext/userPostContext/commentContext/mentionContext）
// 作为用户消息原文传入。签名与源保持一致，下游生成函数逻辑不变。

async function resolveCharacterAssemblerInput(characterId, appTags, context, settings) {
    const character = getXiaohongshuCharacterList().find(item => item && item.id === characterId);
    if (!character) return null;
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) return null;
    const displayName = resolveCharacterXiaohongshuDisplayName(character);
    const personaText = cleanMultiline(character.persona, 6000) || "无";
    const systemPrompt = [
        `你正在以小红书用户「${displayName}」的身份活动（角色名：${character.realName || displayName}）。请完全以该角色的口吻、性格和人设完成本次小红书任务。`,
        `角色设定（人设）：${personaText}`,
        buildXiaohongshuBilingualInstruction(settings),
    ].filter(Boolean).join("\n\n");
    const userPrompt = [
        context.feedContext || "",
        context.userPostContext || "",
        context.commentContext || "",
        context.mentionContext || "",
    ].filter(Boolean).join("\n\n");
    return {
        character,
        apiConfig,
        persona: personaText,
        displayName,
        systemPrompt,
        userPrompt,
        input: { userIdentity: null },
    };
}

// ── NPC 生成函数 ─────────────────────────────────────────────

async function generateXiaohongshuNpcFeed(settings, followedAccounts = [], userIpLocation = "", userXiaohongshuName = "") {
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) throw new Error("未配置全局默认 API。");
    const prompt = [
        buildXiaohongshuNpcPrompt(
            settings,
            settings.npcFeedPrompt.trim() || DEFAULT_XIAOHONGSHU_NPC_FEED_PROMPT,
            { userXiaohongshuName },
        ),
        formatNpcFeedUserContext(userIpLocation),
        formatFollowedAccountsForPrompt(followedAccounts),
    ].filter(Boolean).join("\n\n");
    const raw = await xhsSendLlmRequest(apiConfig, "", prompt, null);
    const parsed = parseWithDebug(raw, parseXiaohongshuNpcFeed, "无法解析小红书内容");
    const notes = [...parsed.homeNotes, ...parsed.videoNotes, ...parsed.nearbyNotes];
    if (notes.length === 0) throw new XiaohongshuGenerationError("没有解析到小红书笔记。", raw);
    return notes;
}

async function generateXiaohongshuNpcReactionForUserPost(note, settings) {
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) throw new Error("未配置全局默认 API。");
    const userNames = getUserXiaohongshuNamesFromNote(note);
    const context = [
        buildXiaohongshuNpcPrompt(
            settings,
            settings.npcUserPostReactionPrompt.trim() || DEFAULT_XIAOHONGSHU_NPC_USER_POST_REACTION_PROMPT,
            { userXiaohongshuName: userNames[0], extraReservedNames: userNames },
        ),
        "",
        "<user_xiaohongshu_post>",
        formatXiaohongshuUserPostContext(note),
        "</user_xiaohongshu_post>",
        xhsHasNoteImage(note) && !note.imageDescription ? "该笔记有真实图片；如果你无法看到图片，请只根据标题、正文、TAG 与已有评论生成互动。" : "",
    ].filter(Boolean).join("\n");
    const wantVision = apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const raw = await xhsSendWithOptionalVisionFallback(apiConfig, "", context, imageParts);
    return parseWithDebug(raw, output => parseXiaohongshuNpcReaction(output, note.id), "无法解析小红书互动内容");
}

async function generateXiaohongshuNpcReplyToUserComment(note, userComment, settings, targetComment) {
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) throw new Error("未配置全局默认 API。");
    const commentContext = formatXiaohongshuCommentContext(note, userComment, targetComment);
    const userNames = Array.from(new Set([
        ...getUserXiaohongshuNamesFromNote(note),
        userComment.authorType === "user" ? userComment.authorName : "",
        targetComment && targetComment.authorType === "user" ? targetComment.authorName : "",
    ].map(cleanReservedName).filter(Boolean)));
    const prompt = [
        buildXiaohongshuNpcPrompt(
            settings,
            settings.npcCommentReplyPrompt.trim() || DEFAULT_XIAOHONGSHU_NPC_COMMENT_REPLY_PROMPT,
            { userXiaohongshuName: userNames[0], extraReservedNames: userNames },
        ),
        "",
        "<xiaohongshu_comment_context>",
        commentContext,
        "</xiaohongshu_comment_context>",
        xhsHasNoteImage(note) && !note.imageDescription ? "该笔记有真实图片；如果你无法看到图片，请只根据标题、正文、TAG 与评论区上下文生成回复。" : "",
    ].filter(Boolean).join("\n");
    const wantVision = apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const raw = await xhsSendWithOptionalVisionFallback(apiConfig, "", prompt, imageParts);
    return parseWithDebug(raw, output => parseXiaohongshuNpcCommentReply(output, note.id, userComment.id), "无法解析小红书评论回复");
}

async function generateXiaohongshuNpcMoreComments(note, settings) {
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) throw new Error("未配置全局默认 API。");
    const commentContext = formatXiaohongshuNoteCommentContext(note);
    const userNames = getUserXiaohongshuNamesFromNote(note);
    const prompt = [
        buildXiaohongshuNpcPrompt(
            settings,
            (settings.npcMoreCommentsPrompt ?? "").trim() || DEFAULT_XIAOHONGSHU_NPC_MORE_COMMENTS_PROMPT,
            { userXiaohongshuName: userNames[0], extraReservedNames: userNames },
        ),
        "",
        "<xiaohongshu_note_comment_context>",
        commentContext,
        "</xiaohongshu_note_comment_context>",
        xhsHasNoteImage(note) && !note.imageDescription ? "该笔记有真实图片；如果你无法看到图片，请只根据标题、正文、TAG 与评论区上下文生成更多评论。" : "",
    ].filter(Boolean).join("\n");
    const wantVision = apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const raw = await xhsSendWithOptionalVisionFallback(apiConfig, "", prompt, imageParts);
    return parseWithDebug(raw, parseXiaohongshuNpcMoreComments, "无法解析小红书评论内容");
}

async function generateXiaohongshuNpcDmReply(input) {
    const apiConfig = resolveGlobalApiConfig();
    if (!apiConfig) throw new Error("未配置全局默认 API。");
    const prompt = [
        buildXiaohongshuNpcPrompt(
            input.settings,
            (input.settings.npcDmReplyPrompt ?? "").trim() || DEFAULT_XIAOHONGSHU_NPC_DM_REPLY_PROMPT,
            { userXiaohongshuName: input.userName },
        ),
        "",
        "<xiaohongshu_dm_context>",
        formatXiaohongshuDmContext(input),
        "</xiaohongshu_dm_context>",
    ].join("\n");
    const raw = await xhsSendLlmRequest(apiConfig, "", prompt, null);
    return parseWithDebug(raw, parseXiaohongshuNpcDmReply, "无法解析小红书私信回复");
}

// ── 角色生成函数 ─────────────────────────────────────────────

async function generateXiaohongshuCharacterActivity(characterId, notes, settings) {
    const userNames = getUserXiaohongshuNamesFromNotes(notes);
    const context = userNames.length > 0
        ? prependXiaohongshuUserIdentityHint(
            formatXiaohongshuFeedContext(notes),
            buildXiaohongshuUserIdentityHint({ characterId, xiaohongshuNames: userNames }),
        )
        : formatXiaohongshuFeedContext(notes);
    const resolved = await resolveCharacterAssemblerInput(characterId, ["xiaohongshu", "activity"], {
        feedContext: context,
    }, settings);
    if (!resolved || !resolved.apiConfig) return null;
    const raw = await xhsSendWithOptionalVisionFallback(resolved.apiConfig, resolved.systemPrompt, resolved.userPrompt, null);
    return parseWithDebug(raw, output => parseXiaohongshuCharacterActivity(output, notes.map(note => note.id)), "无法解析小红书角色互动内容");
}

async function generateXiaohongshuCharacterReactionToUserPost(characterId, note, settings) {
    const context = prependXiaohongshuUserIdentityHint(
        formatXiaohongshuUserPostContext(note),
        buildXiaohongshuUserIdentityHint({ characterId, xiaohongshuNames: getUserXiaohongshuNamesFromNote(note) }),
    );
    const resolved = await resolveCharacterAssemblerInput(characterId, ["xiaohongshu", "reaction"], {
        userPostContext: context,
    }, settings);
    if (!resolved || !resolved.apiConfig) return null;
    const wantVision = resolved.apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const userPrompt = imageDataUrl
        ? `${resolved.userPrompt}\n\n这是当前小红书笔记配图。请结合上方的小红书上下文判断如何评论。`
        : resolved.userPrompt;
    const raw = await xhsSendWithOptionalVisionFallback(resolved.apiConfig, resolved.systemPrompt, userPrompt, imageParts);
    return parseWithDebug(raw, parseXiaohongshuCharacterReaction, "无法解析小红书角色互动内容");
}

async function generateXiaohongshuCharacterReplyToUserComment(characterId, note, userComment, targetComment, settings) {
    const userNames = collectCleanNames([
        ...getUserXiaohongshuNamesFromNote(note),
        userComment.authorType === "user" ? userComment.authorName : "",
        targetComment && targetComment.authorType === "user" ? targetComment.authorName : "",
    ]);
    const commentContext = prependXiaohongshuUserIdentityHint(
        formatXiaohongshuCommentContext(note, userComment, targetComment),
        buildXiaohongshuUserIdentityHint({ characterId, xiaohongshuNames: userNames }),
    );
    const resolved = await resolveCharacterAssemblerInput(characterId, ["xiaohongshu", "comment"], {
        commentContext,
    }, settings);
    if (!resolved || !resolved.apiConfig) return null;
    const wantVision = resolved.apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const userPrompt = imageDataUrl
        ? `${resolved.userPrompt}\n\n这是当前小红书笔记的配图。请结合上方的小红书上下文回复用户评论。`
        : resolved.userPrompt;
    const raw = await xhsSendWithOptionalVisionFallback(resolved.apiConfig, resolved.systemPrompt, userPrompt, imageParts);
    return parseWithDebug(raw, parseXiaohongshuCharacterReaction, "无法解析小红书角色回复");
}

async function generateXiaohongshuCharacterMentionReply(characterId, note, userComment, targetComment, settings) {
    const character = getXiaohongshuCharacterList().find(item => item && item.id === characterId);
    if (!character) return null;
    const userNames = collectCleanNames([
        ...getUserXiaohongshuNamesFromNote(note),
        userComment.authorType === "user" ? userComment.authorName : "",
        targetComment && targetComment.authorType === "user" ? targetComment.authorName : "",
    ]);
    const mentionContext = prependXiaohongshuUserIdentityHint(
        formatXiaohongshuMentionContext(note, userComment, character, targetComment),
        buildXiaohongshuUserIdentityHint({ characterId, xiaohongshuNames: userNames }),
    );
    const resolved = await resolveCharacterAssemblerInput(characterId, ["xiaohongshu", "mention"], {
        mentionContext,
    }, settings);
    if (!resolved || !resolved.apiConfig) return null;
    const wantVision = resolved.apiConfig.enableImageRecognition !== false;
    const imageDataUrl = wantVision ? await resolveNoteImageDataUrl(note) : null;
    const imageParts = imageDataUrl ? [makeXiaohongshuImagePart(imageDataUrl)] : null;
    const userPrompt = imageDataUrl
        ? `${resolved.userPrompt}\n\n这是当前小红书笔记的配图。请结合上方的小红书上下文回复 @ 评论。`
        : resolved.userPrompt;
    const raw = await xhsSendWithOptionalVisionFallback(resolved.apiConfig, resolved.systemPrompt, userPrompt, imageParts);
    return parseWithDebug(raw, parseXiaohongshuCharacterMentionReply, "无法解析小红书@回复");
}

async function previewXiaohongshuPromptPayload(characterId, mode, notes, settings) {
    const firstNote = notes[0];
    const latestComment = firstNote ? firstNote.comments.slice(-1)[0] : undefined;
    const character = getXiaohongshuCharacterList().find(item => item && item.id === characterId);
    const withIdentityHint = (context, names) => prependXiaohongshuUserIdentityHint(
        context,
        buildXiaohongshuUserIdentityHint({ characterId, xiaohongshuNames: names }),
    );
    const context = mode === "activity"
        ? {
            feedContext: getUserXiaohongshuNamesFromNotes(notes).length > 0
                ? withIdentityHint(formatXiaohongshuFeedContext(notes), getUserXiaohongshuNamesFromNotes(notes))
                : formatXiaohongshuFeedContext(notes),
        }
        : mode === "reaction"
            ? { userPostContext: firstNote ? withIdentityHint(formatXiaohongshuUserPostContext(firstNote), getUserXiaohongshuNamesFromNote(firstNote)) : "暂无小红书笔记。" }
            : mode === "mention"
                ? {
                    mentionContext: firstNote && latestComment && character
                        ? withIdentityHint(formatXiaohongshuMentionContext(firstNote, latestComment, character), collectCleanNames([
                            ...getUserXiaohongshuNamesFromNote(firstNote),
                            latestComment.authorType === "user" ? latestComment.authorName : "",
                        ]))
                        : "暂无可回复的 @ 评论。",
                }
                : {
                    commentContext: firstNote && latestComment
                        ? withIdentityHint(formatXiaohongshuCommentContext(firstNote, latestComment), collectCleanNames([
                            ...getUserXiaohongshuNamesFromNote(firstNote),
                            latestComment.authorType === "user" ? latestComment.authorName : "",
                        ]))
                        : "暂无可回复的小红书评论。",
                };
    const resolved = await resolveCharacterAssemblerInput(
        characterId,
        ["xiaohongshu", mode],
        context,
        settings,
    );
    if (!resolved || !resolved.apiConfig) throw new Error("未配置小红书 API。");
    const messages = [];
    if (resolved.systemPrompt) messages.push({ role: "system", content: resolved.systemPrompt });
    let userPrompt = resolved.userPrompt;
    if (firstNote && mode !== "activity") {
        const imageDataUrl = resolved.apiConfig.enableImageRecognition !== false
            ? await resolveNoteImageDataUrl(firstNote)
            : null;
        if (imageDataUrl) {
            userPrompt = `${userPrompt}\n\n这是当前小红书笔记配图。请结合小红书上下文判断如何回应。`;
        }
    }
    messages.push({ role: "user", content: userPrompt });
    return {
        messages,
        characterName: `小红书:${resolveCharacterXiaohongshuDisplayName(resolved.character)}`,
        model: resolved.apiConfig.model,
        presetName: "默认预设",
    };
}

// ── Apply（把生成结果落库为 note/通知）────────────────────────

function applyNpcReaction(note, reaction) {
    const shouldNotifyUser = note.source === "user";
    const baseCommentIndex = note.comments.length;
    const comments = reaction.comments
        .filter(comment => comment.text)
        .map((comment, index) => {
            const parsedReplyIndexMatch = /^.*_comment_(\d+)$/.exec(comment.replyToCommentId || "");
            const parsedReplyIndex = parsedReplyIndexMatch ? parsedReplyIndexMatch[1] : null;
            const replyToCommentId = parsedReplyIndex
                ? `${note.id}_comment_${baseCommentIndex + Number(parsedReplyIndex)}`
                : comment.replyToCommentId;
            return {
                ...makeXiaohongshuComment({
                    noteId: note.id,
                    authorType: "npc",
                    authorId: "npc",
                    authorName: comment.authorName,
                    text: comment.text,
                    replyTo: comment.replyTo,
                    replyToCommentId,
                    unread: true,
                }),
                id: `${note.id}_comment_${baseCommentIndex + index + 1}`,
            };
        });
    const updated = {
        ...note,
        likeCount: note.likeCount + reaction.likeCount,
        saveCount: note.saveCount + reaction.saveCount,
        recentLikeNames: addNames(note.recentLikeNames, reaction.recentLikeNames),
        recentSaveNames: addNames(note.recentSaveNames, reaction.recentSaveNames),
        comments: [...note.comments, ...comments],
        commentCount: note.commentCount + comments.length,
        updatedAt: new Date().toISOString(),
    };
    const notifications = shouldNotifyUser ? [
        reaction.likeCount > 0 ? makeXiaohongshuNotification({
            type: "like",
            noteId: note.id,
            actorName: reaction.recentLikeNames[0] || "小红书用户",
            text: `${reaction.recentLikeNames.join("、") || "有人"}等${reaction.likeCount}人赞了你的笔记`,
            count: reaction.likeCount,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        reaction.saveCount > 0 ? makeXiaohongshuNotification({
            type: "save",
            noteId: note.id,
            actorName: reaction.recentSaveNames[0] || "小红书用户",
            text: `${reaction.recentSaveNames.join("、") || "有人"}等${reaction.saveCount}人收藏了你的笔记`,
            count: reaction.saveCount,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        ...comments.map(comment => makeXiaohongshuNotification({
            type: "comment",
            noteId: note.id,
            actorName: comment.authorName,
            text: comment.text,
            thumbnailText: note.title,
            unread: true,
        })),
        ...reaction.directMessages.map(message => makeXiaohongshuNotification({
            type: "dm",
            noteId: note.id,
            actorName: message.name,
            text: message.text,
            thumbnailText: note.title,
            direction: "incoming",
            threadId: `dm:${message.name}`,
            threadName: message.name,
            unread: true,
        })),
    ].filter(item => Boolean(item)) : [];
    return { note: updated, notifications };
}

function applyCharacterReaction(note, character, reaction) {
    const shouldNotifyUser = note.source === "user";
    const displayName = resolveCharacterXiaohongshuDisplayName(character);
    const comment = makeXiaohongshuComment({
        noteId: note.id,
        authorType: "character",
        authorId: character.id,
        authorName: displayName,
        text: reaction.comment,
        unread: shouldNotifyUser,
    });
    const likeIncrement = reaction.liked && !note.recentLikeNames.includes(displayName) ? 1 : 0;
    const saveIncrement = reaction.saved && !note.recentSaveNames.includes(displayName) ? 1 : 0;
    let updated = {
        ...note,
        likeCount: note.likeCount + likeIncrement,
        saveCount: note.saveCount + saveIncrement,
        recentLikeNames: reaction.liked ? addNames(note.recentLikeNames, [displayName]) : note.recentLikeNames,
        recentSaveNames: reaction.saved ? addNames(note.recentSaveNames, [displayName]) : note.recentSaveNames,
        comments: comment.text ? [...note.comments, comment] : note.comments,
        commentCount: note.commentCount + (comment.text ? 1 : 0),
        updatedAt: new Date().toISOString(),
    };
    let threadNotifications = [];
    let threadComments = [];
    if (comment.text && reaction.thread && reaction.thread.length > 0) {
        const result = appendCharacterThreadToNote({
            note: updated,
            characterDisplayName: displayName,
            characterName: character.realName || character.remarkName || character.name,
            characterId: character.id,
            thread: reaction.thread,
            mainCommentId: comment.id,
            shouldNotifyUser,
        });
        updated = result.note;
        threadNotifications = result.notifications;
        threadComments = result.appended;
    }
    const notifications = shouldNotifyUser ? [
        reaction.liked ? makeXiaohongshuNotification({
            type: "like",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 赞了你的笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        reaction.saved ? makeXiaohongshuNotification({
            type: "save",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 收藏了你的笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        comment.text ? makeXiaohongshuNotification({
            type: "comment",
            noteId: note.id,
            actorName: displayName,
            text: comment.text,
            thumbnailText: note.title,
            unread: true,
        }) : null,
    ].filter(item => Boolean(item)) : [];
    return { note: updated, notifications: [...notifications, ...threadNotifications], mainComment: comment, threadComments };
}

function applyNpcCommentReply(note, reaction, fallbackReplyToCommentId) {
    const shouldNotifyUser = note.source === "user";
    const comments = reaction.comments
        .filter(comment => comment.text)
        .map(comment => makeXiaohongshuComment({
            noteId: note.id,
            authorType: "npc",
            authorId: "npc",
            authorName: comment.authorName,
            text: comment.text,
            replyTo: comment.replyTo,
            replyToCommentId: comment.replyToCommentId || fallbackReplyToCommentId,
            unread: true,
        }));
    const updated = {
        ...note,
        comments: [...note.comments, ...comments],
        commentCount: note.commentCount + comments.length,
        updatedAt: new Date().toISOString(),
    };
    const notifications = shouldNotifyUser ? comments.map(comment => makeXiaohongshuNotification({
        type: "comment",
        noteId: note.id,
        actorName: comment.authorName,
        text: comment.text,
        thumbnailText: note.title,
        unread: true,
    })) : [];
    return { note: updated, notifications };
}

function applyNpcMoreComments(note, reaction) {
    const baseCommentIndex = note.comments.length;
    const comments = reaction.comments
        .filter(comment => comment.text)
        .map((comment, index) => {
            const generatedReplyIndexMatch = /^__generated_comment_(\d+)$/.exec(comment.replyToCommentId || "");
            const generatedReplyIndex = generatedReplyIndexMatch ? generatedReplyIndexMatch[1] : null;
            return {
                ...makeXiaohongshuComment({
                    noteId: note.id,
                    authorType: "npc",
                    authorId: makeXiaohongshuNpcId(comment.authorName),
                    authorName: comment.authorName,
                    text: comment.text,
                    replyTo: comment.replyTo,
                    replyToCommentId: generatedReplyIndex
                        ? `${note.id}_comment_${baseCommentIndex + Number(generatedReplyIndex)}`
                        : comment.replyToCommentId,
                }),
                id: `${note.id}_comment_${baseCommentIndex + index + 1}`,
            };
        });
    return {
        ...note,
        comments: [...note.comments, ...comments],
        commentCount: note.commentCount + comments.length,
        updatedAt: new Date().toISOString(),
    };
}

function applyCharacterCommentReply(note, character, reaction, replyToCommentId) {
    const shouldNotifyUser = note.source === "user";
    const displayName = resolveCharacterXiaohongshuDisplayName(character);
    const comment = makeXiaohongshuComment({
        noteId: note.id,
        authorType: "character",
        authorId: character.id,
        authorName: displayName,
        text: reaction.comment,
        replyToCommentId,
        unread: shouldNotifyUser,
    });
    const likeIncrement = reaction.liked && !note.recentLikeNames.includes(displayName) ? 1 : 0;
    const saveIncrement = reaction.saved && !note.recentSaveNames.includes(displayName) ? 1 : 0;
    let updated = {
        ...note,
        likeCount: note.likeCount + likeIncrement,
        saveCount: note.saveCount + saveIncrement,
        recentLikeNames: reaction.liked ? addNames(note.recentLikeNames, [displayName]) : note.recentLikeNames,
        recentSaveNames: reaction.saved ? addNames(note.recentSaveNames, [displayName]) : note.recentSaveNames,
        comments: comment.text ? [...note.comments, comment] : note.comments,
        commentCount: note.commentCount + (comment.text ? 1 : 0),
        updatedAt: new Date().toISOString(),
    };
    let threadNotifications = [];
    let threadComments = [];
    if (comment.text && reaction.thread && reaction.thread.length > 0) {
        const result = appendCharacterThreadToNote({
            note: updated,
            characterDisplayName: displayName,
            characterName: character.realName || character.remarkName || character.name,
            characterId: character.id,
            thread: reaction.thread,
            mainCommentId: comment.id,
            shouldNotifyUser,
        });
        updated = result.note;
        threadNotifications = result.notifications;
        threadComments = result.appended;
    }
    const notifications = shouldNotifyUser ? [
        reaction.liked ? makeXiaohongshuNotification({
            type: "like",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 赞了这篇笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        reaction.saved ? makeXiaohongshuNotification({
            type: "save",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 收藏了这篇笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        comment.text ? makeXiaohongshuNotification({
            type: "comment",
            noteId: note.id,
            actorName: displayName,
            text: comment.text,
            thumbnailText: note.title,
            unread: true,
        }) : null,
    ].filter(item => Boolean(item)) : [];
    return { note: updated, notifications: [...notifications, ...threadNotifications], mainComment: comment, threadComments };
}

/**
 * 应用 Activity 里"角色评论别人帖子"的单条评论 + 可选延伸 thread。
 * - 主评论永远是角色本人评论
 * - 如果 thread 存在，把延伸评论按楼中楼关系挂在主评论下
 * - 返回新增的所有评论（主评论 + thread 评论）供调用方记录记忆/通知
 */
function applyCharacterActivityComment(args) {
    const { note, character, text, liked, saved, thread } = args;
    const displayName = resolveCharacterXiaohongshuDisplayName(character);
    const shouldNotifyUser = note.source === "user";
    const mainComment = makeXiaohongshuComment({
        noteId: note.id,
        authorType: "character",
        authorId: character.id,
        authorName: displayName,
        text,
        unread: shouldNotifyUser,
    });
    let updated = {
        ...note,
        likeCount: note.likeCount + (liked && !note.recentLikeNames.includes(displayName) ? 1 : 0),
        saveCount: note.saveCount + (saved && !note.recentSaveNames.includes(displayName) ? 1 : 0),
        recentLikeNames: liked ? addNames(note.recentLikeNames, [displayName]) : note.recentLikeNames,
        recentSaveNames: saved ? addNames(note.recentSaveNames, [displayName]) : note.recentSaveNames,
        comments: [...note.comments, mainComment],
        commentCount: note.commentCount + 1,
        updatedAt: new Date().toISOString(),
    };
    let threadComments = [];
    let threadNotifications = [];
    if (thread && thread.length > 0) {
        const result = appendCharacterThreadToNote({
            note: updated,
            characterDisplayName: displayName,
            characterName: character.realName || character.remarkName || character.name,
            characterId: character.id,
            thread,
            mainCommentId: mainComment.id,
            shouldNotifyUser,
        });
        updated = result.note;
        threadComments = result.appended;
        threadNotifications = result.notifications;
    }
    const mainNotifications = shouldNotifyUser ? [
        liked && !note.recentLikeNames.includes(displayName) ? makeXiaohongshuNotification({
            type: "like",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 赞了你的笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        saved && !note.recentSaveNames.includes(displayName) ? makeXiaohongshuNotification({
            type: "save",
            noteId: note.id,
            actorName: displayName,
            text: `${displayName} 收藏了你的笔记`,
            count: 1,
            thumbnailText: note.title,
            unread: true,
        }) : null,
        makeXiaohongshuNotification({
            type: "comment",
            noteId: note.id,
            actorName: displayName,
            text,
            thumbnailText: note.title,
            unread: true,
        }),
    ].filter(item => Boolean(item)) : [];
    return {
        note: updated,
        mainComment,
        threadComments,
        notifications: [...mainNotifications, ...threadNotifications],
    };
}

function applyCharacterMentionReply(note, character, reaction, replyToCommentId) {
    const shouldNotifyUser = note.source === "user";
    const displayName = resolveCharacterXiaohongshuDisplayName(character);
    const comment = makeXiaohongshuComment({
        noteId: note.id,
        authorType: "character",
        authorId: character.id,
        authorName: displayName,
        text: reaction.comment,
        replyToCommentId,
        unread: shouldNotifyUser,
    });
    let updated = {
        ...note,
        comments: comment.text ? [...note.comments, comment] : note.comments,
        commentCount: note.commentCount + (comment.text ? 1 : 0),
        updatedAt: new Date().toISOString(),
    };
    let threadNotifications = [];
    let threadComments = [];
    if (comment.text && reaction.thread && reaction.thread.length > 0) {
        const result = appendCharacterThreadToNote({
            note: updated,
            characterDisplayName: displayName,
            characterName: character.realName || character.remarkName || character.name,
            characterId: character.id,
            thread: reaction.thread,
            mainCommentId: comment.id,
            shouldNotifyUser,
        });
        updated = result.note;
        threadNotifications = result.notifications;
        threadComments = result.appended;
    }
    const notifications = shouldNotifyUser ? [
        comment.text ? makeXiaohongshuNotification({
            type: "comment",
            noteId: note.id,
            actorName: displayName,
            text: comment.text,
            thumbnailText: note.title,
            unread: true,
        }) : null,
    ].filter(item => Boolean(item)) : [];
    return { note: updated, notifications: [...notifications, ...threadNotifications], mainComment: comment, threadComments };
}
