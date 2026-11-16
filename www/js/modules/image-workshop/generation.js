// --- 生图核心逻辑 ---
let currentGeneratedImage = null;
let currentGeneratedPayload = null;

// 参考图只借长相，不借动作：跟随强度压低，并给模型一句明确说明
const WS_REF_STRENGTH = 0.5;
const WS_REF_EXTRACT = 1.0;
const WS_REF_APPEARANCE_NOTE = 'the reference image is used only for the character face, hair and body; do not copy its pose, gesture, camera angle, framing or background';

// 接口形态由地址推断：NovelAI 风格的完整地址发原生生图请求体，其余按 OpenAI 图片兼容
function detectImageApiKind(rawUrl) {
    const url = String(rawUrl || '').toLowerCase();
    if (/\/ai\/generate-image(-stream)?$/.test(url) || url.includes('novelai')) return 'native';
    return 'openai';
}

function openAIBaseUrl(rawUrl) {
    let url = String(rawUrl || '').trim().replace(/\/+$/, '');
    url = url.replace(/\/images\/(generations|edits)$/i, '');
    if (!/\/v1$/i.test(url)) url += '/v1';
    return url;
}

function initWorkshopGeneration() {
    const generateBtn = document.getElementById('workshop-generate-btn');
    const saveCacheBtn = document.getElementById('workshop-save-cache-btn');
    const downloadBtn = document.getElementById('workshop-download-btn');
    const previewActions = document.getElementById('workshop-preview-actions');

    if (!generateBtn) return;
    
    // 保存到缓存按钮
    if (saveCacheBtn) {
        saveCacheBtn.addEventListener('click', async () => {
            if (!currentGeneratedImage || !currentGeneratedPayload) {
                showToast('没有可保存的图片');
                return;
            }
            await saveToHistory(currentGeneratedImage, currentGeneratedPayload);
            showToast('已保存到缓存');
            // 保存后隐藏保存按钮，避免重复保存
            saveCacheBtn.style.display = 'none';
        });
    }

    // 下载按钮
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!currentGeneratedImage) {
                showToast('没有可下载的图片');
                return;
            }
            const a = document.createElement('a');
            // 判断是 URL 还是 Base64
            if (currentGeneratedImage.startsWith('http')) {
                a.href = currentGeneratedImage;
                a.target = '_blank'; // URL 可能跨域，最好在新窗口打开
            } else {
                a.href = `data:image/png;base64,${currentGeneratedImage}`;
                a.download = `workshop_${Date.now()}.png`;
            }
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }
    
    generateBtn.addEventListener('click', async () => {
        if (isGenerating) {
            showToast('正在生成中，请稍候...');
            return;
        }

        const settings = db.workshopSettings;
        const { url: apiUrl, key: apiKey } = getWorkshopImageApi();
        const model = getWorkshopImageModel();

        if (!apiUrl || !apiKey) {
            showToast('请先配置 API 地址和密钥');
            return;
        }

        if (!model) {
            showToast('请先选择模型');
            return;
        }

        // zk8：测试生图使用当前角色的专属生图配置（与隔空投送同一份）
        const char = (typeof getWorkshopActiveChar === 'function') ? getWorkshopActiveChar() : null;
        if (!char) {
            showToast('请先在顶部选择一个角色');
            return;
        }
        const boundChar = ensureWorkshopBoundChar(char.id);
        if (!boundChar.imgGenPositive) {
            showToast('请先在角色生图配置里填写正面提示词');
            return;
        }

        isGenerating = true;
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = '⏳ 生成中...';
        generateBtn.disabled = true;

        try {
            let genSettings = {
                ...settings,
                positivePrompt: boundChar.imgGenPositive,
                negativePrompt: boundChar.imgGenNegative || '',
                characterPrompt: '',
                aspectRatio: boundChar.imgGenAspectRatio || settings.aspectRatio || '3:4'
            };
            // 参考图注入（与隔空投送同链路）
            genSettings = await workshopRefsToVibeSettings(genSettings, boundChar.imgGenRefs);

            const { imageData, payload } = await window.executeImageGeneration(genSettings);

            // 暂存数据并渲染图片
            currentGeneratedImage = imageData;
            currentGeneratedPayload = payload;
            renderPreviewImage(imageData);

            // 显示操作按钮
            if (previewActions) {
                previewActions.style.display = 'flex';
                if (saveCacheBtn) saveCacheBtn.style.display = 'block'; // 恢复保存按钮显示
            }

            showToast('生成成功！请选择是否保存。');

        } catch (error) {
            console.error('Generation error:', error);
            showToast('生成失败: ' + error.message);
        } finally {
            isGenerating = false;
            generateBtn.innerHTML = originalText;
            generateBtn.disabled = false;
        }
    });
}

// --- 参考图 → 生图请求注入（NovelAI/自定义协议的 vibe 参考图；openai 协议自动忽略） ---
// 返回新的 settings 副本，不改原对象、不落库；没有参考图时显式关掉 vibe，避免旧数据串进来
// 参考图只当作「长相样本」：NovelAI 侧压低跟随强度，动作与视角由提示词决定
async function workshopRefsToVibeSettings(baseSettings, refs) {
    const images = [];
    for (const ref of (refs || [])) {
        if (!ref.src) continue;
        let b64 = ref.src;
        if (b64.includes(',')) b64 = b64.split(',')[1];
        if (b64.startsWith('/9j/')) {
            b64 = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png').split(',')[1]);
                };
                img.src = 'data:image/jpeg;base64,' + b64;
            });
        }
        const encoding = b64.replace(/\r?\n|\r|\s/g, '');
        if (encoding) images.push({ encoding, infoExtracted: WS_REF_EXTRACT, refStrength: WS_REF_STRENGTH });
    }
    if (!images.length) return { ...baseSettings, vibe: { enabled: false } };
    const activeId = 'ws_char_refs';
    const entry = images.length === 1
        ? { id: activeId, base64: images[0].encoding, type: 'single' }
        : { id: activeId, type: 'group', images };
    return {
        ...baseSettings,
        vibe: { enabled: true, activeImageId: activeId, infoExtracted: WS_REF_EXTRACT, refStrength: WS_REF_STRENGTH },
        vibeLibrary: [entry]
    };
}

// 取出随请求发出的参考图 base64（单图与组图都支持）
function workshopRefBaselines(settings) {
    const library = Array.isArray(settings.vibeLibrary) ? settings.vibeLibrary : [];
    const out = [];
    library.forEach(item => {
        if (!item) return;
        if (item.type === 'group' && Array.isArray(item.images)) {
            item.images.forEach(img => { if (img && img.encoding) out.push(img.encoding); });
        } else if (item.base64) {
            out.push(item.base64);
        }
    });
    return out.map(b64 => String(b64).replace(/\s/g, '')).filter(Boolean);
}

function base64ToBlob(b64, mimeType) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
}

// 变量替换功能已下线，但历史扩写预设仍会让模型吐出 {{角色名}} 占位，发请求前统一抹掉
// 只吃含中文的双花括号，避免误伤原生接口 {{权重}} 语法
function stripVarTokens(text) {
    return String(text || '')
        .replace(/\{\{[^{}]*[\u4e00-\u9fff][^{}]*\}\}/g, ' ')
        .replace(/,\s*,/g, ',')
        .replace(/^\s*,\s*/, '')
        .replace(/\s*,\s*$/, '')
        .trim();
}

// --- 统一生图调用函数 ---
window.executeImageGeneration = async function(settings, customPrompt = null) {
    const { url: apiUrl, key: apiKey } = getWorkshopImageApi();
    const model = getWorkshopImageModel();

    if (!apiUrl || !apiKey || !model) {
        throw new Error(`未配置 API，请先在工坊中完成设置`);
    }

    const refImages = workshopRefBaselines(settings);
    const cleanUrl = apiUrl.replace(/\/+$/, '');
    const native = detectImageApiKind(cleanUrl) === 'native';

    let payload;
    let finalApiUrl;
    let body;
    let sendJson = true;

    if (!native) {
        // 最终提示词 = 角色正面提示词 + 本次扩写内容；反面提示词与参考图说明由 buildGPTPayload 追加
        const rawPrompt = [settings.positivePrompt, customPrompt || settings.characterPrompt]
            .filter(Boolean).join(', ');
        payload = await buildGPTPayload(settings, rawPrompt, refImages.length);
        console.log('【统一生图】发送给 OpenAI 兼容接口的请求:', JSON.stringify(payload, null, 2));
        if (refImages.length) {
            finalApiUrl = `${openAIBaseUrl(cleanUrl)}/images/edits`;
            const form = new FormData();
            Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));
            refImages.forEach((b64, i) => {
                form.append(refImages.length > 1 ? 'image[]' : 'image', base64ToBlob(b64, 'image/png'), `ref_${i + 1}.png`);
            });
            body = form;
            sendJson = false;
        } else {
            finalApiUrl = `${openAIBaseUrl(cleanUrl)}/images/generations`;
            body = JSON.stringify(payload);
        }
    } else {
        payload = await buildNovelAIPayload(settings, customPrompt);
        finalApiUrl = /\/ai\/generate-image(-stream)?$/.test(cleanUrl)
            ? cleanUrl
            : `${cleanUrl}/ai/generate-image`;
        body = JSON.stringify(payload);
        console.log('【统一生图】发送给原生生图接口的最终提示词:', payload.input);
    }

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    if (sendJson) headers['Content-Type'] = 'application/json';
    if (/generate-image-stream$/.test(finalApiUrl)) headers['Accept'] = 'text/event-stream';

    const response = await fetch(finalApiUrl, {
        method: 'POST',
        headers: headers,
        body: body
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`生图 API 请求失败 (${response.status}): ${errorText}`);
    }

    let imageData = '';
    if (typeof window.parseImageResponse === 'function') {
        imageData = await window.parseImageResponse(response, 'auto');
    } else {
        throw new Error("未找到图片解析函数");
    }

    return { imageData, payload };
};

// --- 全局图片响应解析函数 ---
window.parseImageResponse = async function(response, expectedFormat = 'auto') {
    const contentType = response.headers.get('content-type') || '';
    console.log('Response Content-Type:', contentType);
    let imageData = '';
    
    // 处理 Server-Sent Events (SSE) 流式响应
    if (expectedFormat === 'sse' || contentType.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let buffer = '';

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                // 尝试解析 SSE 格式
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保留最后一行可能不完整的

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const dataStr = line.substring(5).trim();
                        if (dataStr) {
                            try {
                                const dataObj = JSON.parse(dataStr);
                                
                                // 如果返回了错误信息
                                if (dataObj.event_type === 'error' || dataObj.code) {
                                    throw new Error(`NovelAI 错误: ${dataObj.message || JSON.stringify(dataObj)}`);
                                }

                                // 忽略中间过程图
                                if (dataObj.event_type === 'intermediate') {
                                    continue;
                                }

                                // NovelAI stream 接口通常在 dataObj.b64 中返回图片
                                if (dataObj.b64) {
                                    imageData = dataObj.b64;
                                    done = true; // 拿到图片就结束
                                    break;
                                } else if (dataObj.image) {
                                    imageData = dataObj.image;
                                    done = true;
                                    break;
                                } else if (dataObj.images && dataObj.images.length > 0) {
                                    imageData = dataObj.images[0];
                                    done = true;
                                    break;
                                }
                            } catch (e) {
                                // 如果是我们主动抛出的 NovelAI 错误，继续向上抛出
                                if (e.message.startsWith('NovelAI 错误')) {
                                    throw e;
                                }
                                // 否则忽略 JSON 解析错误
                            }
                        }
                    }
                }
            }
        }
    } else {
        // 非流式响应：读取为 ArrayBuffer 进行智能嗅探
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        if (bytes.length === 0) {
            throw new Error('API 返回了空数据');
        }
        
        // 嗅探魔数 (Magic Numbers)
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
        const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
        const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
        const isJson = bytes[0] === 0x7B || bytes[0] === 0x5B; // '{' or '['
        
        if (isZip) {
            console.log('Detected ZIP file, attempting standard parsing...');
            try {
                const view = new DataView(arrayBuffer);
                let eocdOffset = -1;
                
                // 从末尾向前搜索 EOCD (0x06054b50)
                for (let i = bytes.length - 22; i >= 0; i--) {
                    if (view.getUint32(i, true) === 0x06054b50) {
                        eocdOffset = i;
                        break;
                    }
                }
                
                if (eocdOffset === -1) throw new Error("未找到 ZIP EOCD 标记");
                
                // 读取 Central Directory 信息
                const entryCount = view.getUint16(eocdOffset + 10, true);
                const cdOffset = view.getUint32(eocdOffset + 16, true);
                const unzipEntry = async (compressedData, compMethod) => {
                    if (compMethod === 0) return compressedData;
                    if (compMethod !== 8) return null;

                    const ds = new DecompressionStream('deflate-raw');
                    const stream = new Blob([compressedData]).stream().pipeThrough(ds);
                    return new Uint8Array(await new Response(stream).arrayBuffer());
                };
                const detectImageMime = (data) => {
                    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
                    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg';
                    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
                        && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp';
                    return null;
                };

                let cursor = cdOffset;
                let imageBytes = null;
                let mimeType = null;
                for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
                    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
                        throw new Error(`无效的 Central Directory 条目: ${entryIndex}`);
                    }

                    const compMethod = view.getUint16(cursor + 10, true);
                    const compSize = view.getUint32(cursor + 20, true);
                    const nameLen = view.getUint16(cursor + 28, true);
                    const extraLen = view.getUint16(cursor + 30, true);
                    const commentLen = view.getUint16(cursor + 32, true);
                    const lfhOffset = view.getUint32(cursor + 42, true);
                    const fileName = new TextDecoder('utf-8').decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
                    cursor += 46 + nameLen + extraLen + commentLen;

                    if (fileName.endsWith('/')) continue;
                    if (lfhOffset + 30 > bytes.length || view.getUint32(lfhOffset, true) !== 0x04034b50) continue;

                    const localNameLen = view.getUint16(lfhOffset + 26, true);
                    const localExtraLen = view.getUint16(lfhOffset + 28, true);
                    const dataOffset = lfhOffset + 30 + localNameLen + localExtraLen;
                    if (dataOffset + compSize > bytes.length) continue;

                    const candidate = await unzipEntry(bytes.slice(dataOffset, dataOffset + compSize), compMethod);
                    const candidateMime = candidate && detectImageMime(candidate);
                    if (candidateMime) {
                        imageBytes = candidate;
                        mimeType = candidateMime;
                        break;
                    }
                }

                if (!imageBytes || !mimeType) throw new Error('ZIP 中未找到 PNG、JPEG 或 WebP 图片');
                const blob = new Blob([imageBytes], { type: mimeType });
                imageData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error('ZIP parsing failed:', e);
                throw new Error('从 ZIP 提取图片失败: ' + e.message);
            }
        } else if (isPng || isJpg || isWebp) {
            console.log('Detected raw image stream');
            let mimeType = isPng ? 'image/png' : (isJpg ? 'image/jpeg' : 'image/webp');
            const blob = new Blob([bytes], { type: mimeType });
            imageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } else if (isJson || contentType.includes('application/json')) {
            console.log('Detected JSON response');
            const text = new TextDecoder('utf-8').decode(bytes);
            const data = JSON.parse(text);
            
            // 递归查找图片
            const findImageInJson = (obj) => {
                if (typeof obj === 'string') {
                    if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(obj)) return obj.slice(obj.indexOf(',') + 1);
                    if (obj.startsWith('iVBORw0KGgo') || obj.startsWith('/9j/') || obj.startsWith('UklGR')) return obj;
                    if (obj.startsWith('http://') || obj.startsWith('https://')) return obj;
                }
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const res = findImageInJson(item);
                        if (res) return res;
                    }
                } else if (typeof obj === 'object' && obj !== null) {
                    // 优先匹配常见字段名
                    const keys = ['b64_json', 'image', 'url', 'image_url', 'b64', 'base64', 'images', 'data'];
                    for (const k of keys) {
                        if (obj[k]) {
                            const res = findImageInJson(obj[k]);
                            if (res) return res;
                        }
                    }
                    // 兜底遍历所有字段
                    for (const key in obj) {
                        const res = findImageInJson(obj[key]);
                        if (res) return res;
                    }
                }
                return null;
            };
            
            imageData = findImageInJson(data);
            if (!imageData) {
                throw new Error('未在 JSON 响应中找到图片数据');
            }
        } else {
            // 兜底：尝试作为文本读取，看是否是错误信息
            const text = new TextDecoder('utf-8').decode(bytes);
            if (text.length < 1000) {
                throw new Error('未知的响应格式: ' + text);
            } else {
                throw new Error('未知的响应格式，且无法解析为图片');
            }
        }
    }
    
    if (!imageData) {
        throw new Error('获取图片数据失败');
    }
    
    return imageData;
};

// 角色比例 → OpenAI 图片接口支持的尺寸
function openAIImageSize(settings, model) {
    const ratio = settings.aspectRatio || '1:1';
    const sizes = String(model).includes('dall-e-3')
        ? { '1:1': '1024x1024', '3:4': '1024x1792', '4:3': '1792x1024', '9:16': '1024x1792', '16:9': '1792x1024' }
        : { '1:1': '1024x1024', '3:4': '1024x1536', '4:3': '1536x1024', '9:16': '1024x1536', '16:9': '1536x1024' };
    return sizes[ratio] || '1024x1024';
}

// --- 生图请求体构建（OpenAI 图片兼容） ---
async function buildGPTPayload(settings, rawPrompt, refCount = 0) {
    let finalPrompt = rawPrompt;
    let stylePrompts = [];
    
    // 1. 标签检测与替换
    if (settings.gptTags && settings.gptTags.length > 0) {
        settings.gptTags.forEach(tag => {
            if (tag.enabled !== false && tag.name && tag.prompt && finalPrompt.includes(tag.name)) {
                // 移除标签
                finalPrompt = finalPrompt.replace(new RegExp(tag.name, 'g'), '');
                // 收集风格提示词
                stylePrompts.push(tag.prompt);
            }
        });
    }
    
    // 清理占位变量与多余的逗号
    finalPrompt = stripVarTokens(finalPrompt);
    
    // 2. 拼接最终提示词：风格在前，描述在后，反面提示词与参考图说明收尾
    if (stylePrompts.length > 0) {
        finalPrompt = `${stylePrompts.join(', ')}, ${finalPrompt}`;
    }
    if (settings.negativePrompt) {
        finalPrompt += `\nDo not include: ${settings.negativePrompt}`;
    }
    if (refCount) {
        finalPrompt += `\nNote: ${WS_REF_APPEARANCE_NOTE}`;
    }

    const model = getWorkshopImageModel();
    const payload = {
        model: model,
        prompt: finalPrompt,
        n: 1,
        size: openAIImageSize(settings, model)
    };

    // gpt-image 系模型固定返回 base64，只有 dall-e 系需要这个字段
    if (/dall-e/.test(model)) payload.response_format = 'b64_json';
    if (model === 'dall-e-3') {
        if (settings.gptQuality) payload.quality = settings.gptQuality;
        if (settings.gptStyle) payload.style = settings.gptStyle;
    }
    
    return payload;
}

// 注意：函数前面加上了 async 关键字
async function buildNovelAIPayload(settings, customCharacterPrompt = null) {
    const builtinParams = {
        steps: 28,
        scale: 5.0, 
        sampler: "k_euler",
        seed: Math.floor(Math.random() * 4294967296) 
    };
    
    const qualityTags = "best quality, very aesthetic, absurdres";
    const negativeQualityTags = "lowres, (bad), text, error, missing, extra, fewer, cropped, jpeg artifacts, worst quality, bad quality, watermark, displeasing, unfinished, chromatic aberration, scan, scan artifacts";
    
    let finalPositive = '';
    if (settings.positivePrompt) finalPositive += `${settings.positivePrompt}, `;
    
    const charPrompt = stripVarTokens(customCharacterPrompt !== null ? customCharacterPrompt : settings.characterPrompt);
    if (charPrompt) finalPositive += `${charPrompt}, `;
    
    finalPositive += qualityTags;
    if (settings.vibe && settings.vibe.enabled) finalPositive += `, ${WS_REF_APPEARANCE_NOTE}`;

    const finalNegative = `${settings.negativePrompt ? settings.negativePrompt + ', ' : ''}${negativeQualityTags}`;

    // 比例 → 尺寸（zk8：支持全部比例；未配置时默认竖版 3:4）
    const RATIO_SIZES = {
        '1:1': [1024, 1024],
        '3:4': [896, 1152],
        '4:3': [1152, 896],
        '9:16': [768, 1344],
        '16:9': [1344, 768]
    };
    let width = 896, height = 1152;
    if (RATIO_SIZES[settings.aspectRatio]) {
        [width, height] = RATIO_SIZES[settings.aspectRatio];
    }

    const currentModel = getWorkshopImageModel();
    const payload = {
        input: finalPositive, 
        model: currentModel,
        action: "generate",
        parameters: {
            width: width,
            height: height,
            negative_prompt: finalNegative, 
            ...builtinParams
        }
    };

    if (currentModel && currentModel.includes('diffusion-4')) {
        payload.parameters.params_version = 3;
        payload.parameters.v4_prompt = {
            caption: {
                base_caption: finalPositive,
                char_captions: []
            },
            use_coords: false,
            use_order: true
        };
        payload.parameters.v4_negative_prompt = {
            caption: {
                base_caption: finalNegative,
                char_captions: []
            }
        };
    }
    
    // --- 核心修复：处理 Vibe 数据 (多图支持) ---
    if (settings.vibe && settings.vibe.enabled && settings.vibe.activeImageId) {
        const activeLibItem = (settings.vibeLibrary || []).find(l => l.id === settings.vibe.activeImageId);
        if (activeLibItem) {
            const refImages = [];
            const refInfoExtracted = [];
            const refStrength = [];

            if (activeLibItem.type === 'group' && activeLibItem.images && activeLibItem.images.length > 0) {
                // 处理预设组
                for (const img of activeLibItem.images) {
                    if (img.encoding) {
                        refImages.push(img.encoding);
                        refInfoExtracted.push(img.infoExtracted !== undefined ? img.infoExtracted : 1.0);
                        refStrength.push(img.refStrength !== undefined ? img.refStrength : 0.6);
                    }
                }
            } else {
                // 处理单图
                if (activeLibItem.encoding) {
                    refImages.push(activeLibItem.encoding);
                    refInfoExtracted.push(settings.vibe.infoExtracted !== undefined ? settings.vibe.infoExtracted : 1.0);
                    refStrength.push(settings.vibe.refStrength !== undefined ? settings.vibe.refStrength : 0.6);
                } else if (activeLibItem.base64) {
                    let b64 = activeLibItem.base64;
                    if (b64.includes(',')) {
                        b64 = b64.split(',')[1];
                    }
                    
                    if (b64.startsWith('/9j/')) {
                        b64 = await new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                resolve(canvas.toDataURL('image/png').split(',')[1]);
                            };
                            img.src = 'data:image/jpeg;base64,' + b64;
                        });
                    }
                    
                    b64 = b64.replace(/\r?\n|\r|\s/g, '');
                    
                    refImages.push(b64);
                    refInfoExtracted.push(settings.vibe.infoExtracted !== undefined ? settings.vibe.infoExtracted : 1.0);
                    refStrength.push(settings.vibe.refStrength !== undefined ? settings.vibe.refStrength : 0.6);
                }
            }

            if (refImages.length > 0) {
                payload.parameters.reference_image_multiple = refImages;
                payload.parameters.reference_information_extracted_multiple = refInfoExtracted;
                payload.parameters.reference_strength_multiple = refStrength;
            }
        }
    }
    
    return payload;
}

// 将二进制转为 base64 的辅助函数
function arrayBufferToB64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function renderPreviewImage(imageData) {
    const previewArea = document.getElementById('workshop-preview-area');
    if (!previewArea) return;
    
    let src = '';
    if (imageData.startsWith('http') || imageData.startsWith('data:')) {
        src = imageData;
    } else {
        src = `data:image/png;base64,${imageData}`;
    }
    
    previewArea.innerHTML = `<img src="${src}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">`;
}
