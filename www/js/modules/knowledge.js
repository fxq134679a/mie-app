// --- 知识库 APP：教程渲染 ---

(function () {
    const STORAGE_KEY = 'knowledge_open_tutorials_v1';
    const loadOpenIds = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
    const saveOpenIds = ids => localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

    // **粗体** → <b>
    const fmt = (s) => String(s == null ? '' : s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    // ============== 教程 1：AI 主动发消息（Dylan Heartbeat） ==============
    const tutorialHeartbeat = {
        id: 'heartbeat',
        emoji: '💗',
        title: '让 AI 主动发来关心',
        subtitle: 'Dylan Heartbeat 后台模式',
        accent: '#ff7fa0',
        sections: [
            {
                heading: '它是什么？',
                body: '平时都是你主动跟 AI 说话对吧？开启 Dylan Heartbeat 之后，AI 会在你沉默一段时间后自己"醒来"，主动发条消息来关心你——"在干嘛呀？""今天累不累？""我想你了"之类的，还会推送到你手机通知栏里。'
            },
            {
                heading: '前提条件',
                body: [
                    '① 你的电脑得一直开着，Gateway 和 wake_up 两个进程在后台跑着。（不想手动？装个 pm2 让它开机自启）',
                    '② iPhone 上装了 Bark App（App Store 搜 "Bark Custom Notifications"），并且**打开过一次**让它向苹果推送服务器注册。',
                    '③ iPhone 和电脑连同一个 Wi-Fi。'
                ]
            },
            {
                heading: '怎么开？一步步来 ✨',
                steps: [
                    '打开 miemie → **微信 App → 我 → 设置 → API 设置**',
                    '滚到最上面，找到那个**粉色的 💗 Dylan Heartbeat 卡片**',
                    '把右边的开关打开 → 下面会展开一行 Gateway 地址输入框',
                    'Gateway 地址默认填的是你电脑的局域网 IP（比如 http://192.168.1.103:3000），电脑 IP 变了在这里改就行',
                    '点粉色的**「保存并启用」按钮** → 下面的服务商、API 地址、密钥会自动填上并锁住（防止手滑改乱）',
                    '🎉 搞定！现在发条消息试试，然后放下手机走开 60 分钟——AI 会醒来找你啦'
                ]
            },
            {
                heading: '设置里还有什么？',
                body: '点粉色卡片里的 **🕒 时间线 & 记忆** 折叠按钮，你会看到：',
                bullets: [
                    '💗 **注入记忆开关**（默认开）：把 AI 主动发来的消息注入到每次聊天的 system prompt，让 AI 有连续感，不会"失忆"',
                    '🔩 **沉默阈值滑块**（10–180 分钟）：控制"多久没说话 AI 才会主动找你"。改完需要重启 Gateway 生效',
                    '📜 **查看时间线**：拉取 Gateway 的时间线文件，显示最近 20 条对话（包括 AI 主动唤醒的）',
                    '🧹 **清空时间线**：一键删除 Gateway 的时间线和唤醒记录（miemie 本地聊天记录不受影响）'
                ]
            },
            {
                heading: '常见问题 ❓',
                faq: [
                    ['AI 没主动找我？', '先看看手机是不是真的 60 分钟没碰过；然后去设置里拉一下时间线，看 wake_up 有没有触发。如果时间线里什么都没有，多半是 Gateway/wake_up 进程挂了（电脑重启过？），重启一下就行。'],
                    ['Bark 推送收不到？', 'iPhone 上打开 Bark App 确认右上角显示的 Key 还是你原来那串；iPhone 设置 → 通知 → Bark → 允许通知；Bark App 本身也要开着一次（向苹果注册 device token）。'],
                    ['电脑 IP 变了怎么办？', 'Dylan Heartbeat 卡片里 Gateway 地址那行直接改就行，不用重开 miemie。改完 AI 自动就连上了。'],
                    ['不想用了？', '直接把开关关掉，点「保存并启用」→ Gateway 恢复你原来的自定义 API，完全不影响正常聊天。'],
                    ['想换个推送服务？', 'Dylan Heartbeat 支持自定义 Bark Server。编辑 .env 里的 BARK_SERVER_URL 和 BARK_PY，然后重启 Gateway。']
                ]
            }
        ]
    };

    // ============== 教程 2：角色生图 ==============
    const tutorialImageGen = {
        id: 'imagegen',
        emoji: '🎨',
        title: '让角色给你生图',
        subtitle: '角色生图 / AI 绘图设置',
        accent: '#a8c8f3',
        sections: [
            {
                heading: '它能做什么？',
                body: '让你喜欢的角色为你生成图片——比如穿什么衣服、在什么场景、做什么姿势都能跟 AI 聊。miemie 的生图模块会自动把角色的外观设定（发色、瞳色、体型、常用服装）拼进 prompt，再配合附加描述（"微笑着看镜头"、"樱花树下"）一键出图。'
            },
            {
                heading: '怎么开？',
                steps: [
                    '打开 miemie → **微信 App → 我 → 设置 → API 设置**',
                    '先把角色的人设、外貌设定好（角色设置弹窗）——发色瞳色体型服装这些细节越详细，生图越准',
                    '进入角色聊天，在输入框上面的功能栏里找 **🎨 生图** 按钮',
                    '或者直接跟角色说："帮我画一张图"，带画面感地描述你想要什么（"你穿着一件米白色针织衫，长发披下来，站在黄昏的窗边回头看我"）',
                    'AI 会把角色的外观 + 你的描述拼成 prompt，调用生图模型生成图片',
                    '⚠️ 提醒：生图会消耗更多 token，不同模型速度和效果差别很大。建议用专门的生图模型（如 SDXL / Midjourney API / 豆包 / flux 类）'
                ]
            },
            {
                heading: '生图 prompt 怎么写才好看？',
                body: '好的描述 = 主体（角色外观）+ 动作表情 + 场景 + 氛围 + 画质标签',
                bullets: [
                    '**角色外观**：角色设置里已经写了，系统会自动拼进去，不用你每次重复。但如果这次想要"换件衣服""扎个马尾"可以特别说明',
                    '**动作表情**：微笑、眨眼、侧脸、回头看镜头、手撑脸颊、奔跑、低头看书……',
                    '**场景**：樱花树下、雨夜的便利店、海边黄昏、温暖的卧室、雪中的长椅……',
                    '**氛围 / 光线**：逆光、柔光、霓虹、金色的夕阳、清冷的月光……',
                    '**画质标签**：masterpiece, best quality, 1girl, solo, anime style……（看你用的模型偏好）'
                ]
            },
            {
                heading: '例子对比 📝',
                body: [
                    '❌ 差的描述："画一张图" → AI 完全不知道画啥',
                    '⚠️ 还行的："画一张你的图，穿白色衣服" → 只有服装，没动作没场景',
                    '✨ 好的："【角色外观自动注入】→ 穿着米白色宽松针织衫，长发披下来，微微回头看镜头，站在黄昏的窗边，金色的阳光从窗外洒进来落在头发上，柔和逆光，cinematic lighting, masterpiece, best quality" → 画面感立刻出来'
                ]
            },
            {
                heading: '出图效果不好怎么办？',
                faq: [
                    ['角色看起来不像她 / 他？', '回去角色设置里补更细的外貌：瞳色 exact hex 色号、发型长度、脸型轮廓、标志性配饰。AI 生图对细节特别敏感。'],
                    ['画面太乱 or 不是想要的内容？', '把负面的东西也写清楚（"不要其他人物"、"不要水印"、"文字不要"），或者换个更强的生图模型。'],
                    ['生成好慢？', '有些模型（如 flux / DALL·E 3）确实要 10–30 秒。可以在 API 设置里换个速度快的模型试试。'],
                    ['能不能在群聊里生图？', '可以的，@ 指定某个角色让她给你画就行，系统会用那个角色的外观设定。']
                ]
            }
        ]
    };

    // ============== 教程 3：檐廊 engawa ==============
    const tutorialEngawa = {
        id: 'engawa',
        emoji: '🌙',
        title: '檐廊 · 让角色看到今天',
        subtitle: '今晚的月亮 / 今日一诗 / 每日一画',
        accent: '#5e6cff',
        sections: [
            {
                heading: '它是什么？',
                body: '聊天功能集里有一个 🌙 檐廊 按钮。点开是一个小面板，里面有四张卡片：今晚的月亮、今日一诗、每日一画、历史上的今天——都是当天的真实内容。点底部的「让 TA 看看今天 ✨」，这些内容会变成你发出去的消息，角色就会顺着聊起来。'
            },
            {
                heading: '手机上怎么用？',
                steps: [
                    '手机和电脑连**同一个 Wi-Fi**',
                    '电脑上双击 **D:\\A\\html\\mie\\启动檐廊.bat**，弹出两个黑窗口挂着别关（电脑重启后要重新双击）',
                    '手机打开 miemie → 进一个角色的聊天 → 点 ➕ → 翻到功能集**最后一页** → 点 **🌙 檐廊**',
                    '如果一直转圈或报错：点面板右上角 **⚙**，把地址改成下面这个再保存：',
                    '**http://192.168.1.103:3000/engawa/mcp**'
                ]
            },
            {
                heading: '电脑要一直开着吗？',
                body: '檐廊的内容是从你电脑上取的，所以用檐廊时：电脑得开着，而且「启动檐廊.bat」弹出的两个黑窗口要在跑。miemie 的其他功能（聊天、发动态这些）不需要电脑开着，只有檐廊需要。'
            },
            {
                heading: '常见问题 ❓',
                faq: [
                    ['那个地址会变吗？', '一般不会。但路由器重启后有小概率变。万一连不上了：电脑按 Win+R 输入 cmd 回车，再输入 ipconfig 回车，找到「IPv4 地址」，把 192.168.1.103 里的 103 换成新数字，填进檐廊的 ⚙ 里就行。'],
                    ['手机用流量（不在家）能用吗？', '檐廊不行——它要连你家 Wi-Fi 里的电脑。在外面时 miemie 其他功能照常，回家连上 Wi-Fi 檐廊就又能用了。'],
                    ['历史上的今天一直显示超时？', '正常，国内连不上维基百科，那一格看不了，其他三格不受影响。'],
                    ['月亮的月落时间看着不对劲？', '现在用的是默认的英国伦敦坐标，所以时间不对。想要你当地的月出月落时间，告诉我你的城市就行。']
                ]
            }
        ]
    };

    // ============== 教程 4：深夜电台 ==============
    const tutorialMidnight = {
        id: 'midnight',
        emoji: '📻',
        title: '深夜电台 · 只放给你听',
        subtitle: 'AI 主播 / 深夜节目 / 角色来信',
        accent: '#5b62c4',
        sections: [
            {
                heading: '它是什么？',
                body: '手机桌面上的「深夜电台」，是一台只放给一个人听的电台。你挑一个台，按下「打开收音机」，AI 主播会现写一份今晚的节目稿：先跟你聊两句，再放一两首歌，中间也许读一封角色写来的信，最后道晚安。全程有声音、有字幕、有动画，像真的在听一个深夜频率。'
            },
            {
                heading: '四个台，各是什么味？',
                table: [
                    ['FM 90.6', '故事台', '讲一个只有今晚的原创短篇，温柔、留白，结尾是暖的'],
                    ['FM 97.3', '夜話台', '睡不着就陪你聊聊天，像深夜热线那样说心事'],
                    ['FM 104.1', '音樂台', '以歌为主，每首歌前有一小段串词，说它适合深夜的哪个瞬间'],
                    ['FM 88.8', '枕話台', '声音压得很低，全程轻声加停顿，说着说着就睡着了']
                ],
                tip: '枕話台默认藏着：在首页那张写着 FM ▒▒.▒ 的卡片上长按约 1.2 秒，就能「调频」出它。'
            },
            {
                heading: '第一次开台',
                steps: [
                    '先把 API 配好：微信 App → 我 → 设置 → API 设置，填好接口地址、密钥和模型名。节目稿是 AI 现写的，没配好开不了台。',
                    '想听歌的话，电脑上要开着音乐服务：双击 D:\\A\\html\\mie\\启动檐廊.bat，弹出的黑窗口别关（里面一起起了音乐服务）。',
                    '回到手机桌面，点「深夜电台」图标，挑一个台。',
                    '点黑色小屏下面的「打开收音机」，等一会儿：先备稿，再把今晚的歌找出来，然后开始播。',
                    '不想听了点「不听了」；想直接下一段点「跳过」。'
                ]
            },
            {
                heading: '屏幕上都是些什么？',
                bullets: [
                    '**深色小屏**：像真收音机的玻璃窗，字幕和歌卡都在这儿。空台时上面写着一句「这里只有沙沙声。」',
                    '**动画**：每个台有自己的画面——故事台是山脊、夜話台是声波、音樂台是涟漪、枕話台是星图。',
                    '**今晚节目单**：小屏下面那一列是这一晚的段落，正在播的那段会亮起来，放过的会变淡。',
                    '**倍速**：播放时可以切 1× / 1.25× / 1.5×，嫌慢就调快。'
                ]
            },
            {
                heading: '让角色给电台写封信',
                body: '首页的「听众来信」里，可以请你的角色写一封短信投稿。写完存进信箱，下一次开播时主播会挑一封在节目里念出来。念完那封会标成「电台已读过」，也能在当期的文稿里翻到。',
                steps: [
                    '首页点「听众来信」',
                    '点「请角色写一封信」，选一个角色',
                    '可以顺手写一句想聊的话题（留空也行），点「写好寄出」',
                    '等它写完（几秒到十几秒），信就进信箱了',
                    '下次开台，主播会挑一封念给你听'
                ]
            },
            {
                heading: '想回头看？历期节目',
                bullets: [
                    '首页「历期节目」里，每一晚按「第 N 期」编号存着，最多留 30 晚。',
                    '点进去能看到当晚的标题、段落数、放过哪些歌、念过哪些信。',
                    '最下面是当晚的完整文稿——AI 写的那份播报稿原样都在。'
                ]
            },
            {
                heading: '右上角齿轮能改什么？',
                bullets: [
                    '**主播声音**：选一个角色当主播，用 TA 的音色和语音引擎（MiniMax / ElevenLabs 按角色分流）。',
                    '**主播怎么称呼你**：填「笨蛋」「宝宝」这种，主播就会这么叫你。',
                    '**念网易云热评**：放歌前先念一条热评，抓不到就跳过。',
                    '**垫乐音量**：说话时底下那层轻音乐的大小。'
                ]
            },
            {
                heading: '常见问题 ❓',
                faq: [
                    ['点了「打开收音机」没反应，或者直接报错？', '多半是 API 没配好或余额不够。回 设置 → API 设置 检查接口地址、密钥、模型名；用中转服务的话记得先充值，余额不够会被拒绝。'],
                    ['只有说话，没有歌？', '歌是走电脑上的音乐服务（9091 端口）去找的，确认「启动檐廊.bat」里的音乐服务窗口还开着；另外网易云接口偶尔很慢，等一会儿或者重开一次电台。'],
                    ['主播不出声，只有字幕？', '说明这个角色的语音没配好或接口失败。齿轮里换一个角色试试；还没声音就去检查语音设置（MiniMax / ElevenLabs 的密钥）。'],
                    ['热评和垫乐也没有？', '它们走的是同一个音乐服务，服务没起来就都没有——但主播说话和音效不受影响。'],
                    ['听到一半不想听了？', '点「不听了」就停。听过一半的节目也会存进历期节目，标着「未播完」。']
                ]
            }
        ]
    };

    // ============== 教程 5：藏宝地图 ==============
    const tutorialTreasureMap = {
        id: 'treasure-map',
        emoji: '🗺️',
        title: '藏宝地图 · 在真实的地方藏东西',
        subtitle: '角色藏宝 / 手机寻宝 / 多人共享',
        accent: '#a86b77',
        sections: [
            {
                heading: '它是什么？',
                body: '藏宝地图是一个独立的小服务，可以在真实的地理位置藏东西——一封信、一段语音、一个成就。寻宝人（你）的手机上只露一片模糊的圈和一句谜语，走到附近才能拿到。每个角色都可以藏，地图上会显示是谁藏的。'
            },
            {
                heading: '怎么打开？',
                steps: [
                    '电脑上双击 **D:\\A\\html\\mie\\启动藏宝地图.bat**（或 **启动檐廊.bat** 里包含了它），弹出的黑窗口别关',
                    '第一次运行会自动装依赖和 build 页面，等几分钟',
                    '浏览器自动打开 **http://127.0.0.1:8800**，输入密码 **MieMap2026** 登录',
                    '在 MIE 里：桌面点「藏宝地图」图标也能打开（iframe 方式）'
                ]
            },
            {
                heading: '两个页面，各是什么？',
                bullets: [
                    '**寻宝人页面（/）**：看地图、找东西、拆信、钉「我来过」。封着的信只露雾圈和谜语，走到了才能打开',
                    '**藏宝人工作台（/hider.html）**：在地图上点位置藏东西、加路线站点、直接发成就。顶部可以改「当前藏宝人」名字'
                ],
                tip: '在 MIE 的藏宝地图页面，右上角那颗「藏」按钮可以切换到藏宝人工作台。'
            },
            {
                heading: '怎么藏东西？',
                steps: [
                    '打开藏宝人工作台（/hider.html）',
                    '顶部「当前藏宝人」输入框填上角色名（比如「小雪」），这样地图上会显示是谁藏的',
                    '点地图上的任意位置 → 弹出藏东西表单',
                    '填「地点」（只有藏宝人看得到）和「谜语」（寻宝人看得到）',
                    '选「走多近算到」（50米~10公里），地图上露出的雾圈是它的 3 倍',
                    '勾选要藏的内容：信 / 语音 / 成就（至少一样）',
                    '点「藏好」→ 东西就藏在那儿了'
                ]
            },
            {
                heading: '多个角色一起藏',
                body: '一张地图可以被多个角色共用。每个角色藏东西时，在「当前藏宝人」填自己的名字，寻宝人就能看到是谁藏的。',
                bullets: [
                    '角色 A 藏了一封信在蓝房子 → 地图上标「A 藏的」',
                    '角色 B 藏了一段语音在咖啡馆 → 地图上标「B 藏的」',
                    '寻宝人走到附近，打开信能看到是 A 写的，听语音知道是 B 录的'
                ]
            },
            {
                heading: '手机上怎么用？',
                body: '手机 Safari 打开藏宝地图，可以加到主屏幕当 APP 用，走到附近会推送提醒。',
                steps: [
                    '手机和电脑连**同一个 Wi-Fi**',
                    '在 MIE 藏宝地图页面，点右上角**手机图标**按钮',
                    '弹出二维码 → 用 Safari 扫描（或手动输入地址）',
                    'Safari 打开后 → 点分享按钮 → **添加到主屏幕**',
                    '允许定位权限 → 走到藏东西的地方会自动提醒'
                ],
                tip: '如果手机用流量（不在同一个 Wi-Fi），需要配 HTTPS 隧道（见下面的「常见问题」）。'
            },
            {
                heading: '寻宝人怎么找？',
                steps: [
                    '打开寻宝人页面（/），地图上露出几片雾圈和谜语',
                    '点「定位我」→ 地图飞到你的位置',
                    '走近某片雾圈 → 卡片会显示「你就在这片圈里」',
                    '点「我就在这附近」→ 手机当场定位 → 信到手（状态变成「找到了」）',
                    '再点一次「打开看看」→ 拆封蜡仪式 → 看到信、听语音、解锁成就'
                ]
            },
            {
                heading: '能藏哪几样？',
                table: [
                    ['信', 'body', '一段文字，拆开了才看得到'],
                    ['语音', 'voice = { url, text }', '自己准备好的 mp3/m4a 地址，拆了自动播放'],
                    ['成就', 'badge = { name, emoji, note }', '走到就解锁，挂在成就墙上']
                ],
                tip: '一个地点可以同时藏信+语音+成就，拆开了全给。'
            },
            {
                heading: '常见问题 ❓',
                faq: [
                    ['密码是什么？', '默认密码是 **MieMap2026**，在 D:\\A\\html\\mie\\hidden-letters\\.env 里改 PASSWORD 那行，改完重启服务。'],
                    ['手机扫码打不开？', '确认手机和电脑在同一个 Wi-Fi；如果电脑防火墙拦了 8800 端口，要去防火墙放行；或者用电脑浏览器手动输入地址。'],
                    ['想用流量（不在同一个 Wi-Fi）？', '需要配 HTTPS 隧道：① 装 Cloudflare Tunnel（cloudflared）或 Tailscale Funnel；② 把隧道地址填进 MIE 藏宝地图的设置里（localStorage 的 mie_treasure_map_url）；③ 手机扫码就是隧道地址了。'],
                    ['角色藏的东西怎么区分？', '每个角色藏东西时，在「当前藏宝人」填自己的名字。地图上每封信都会显示是谁藏的，拆信时落款也是那个名字。'],
                    ['信藏错了想收回？', '藏宝人工作台 → 点地图上的钉子 → 详情里点「收回这封信」。已经被找到的信收不回。'],
                    ['数据存在哪？', 'D:\\A\\html\\mie\\hidden-letters\\data\\ 目录下的几个 JSON 文件：map.json（信/站点/成就）、track.jsonl（足迹）、last-seen.json（最后位置）。想备份直接复制这个文件夹。'],
                    ['推送收不到？', '需要配 VAPID 密钥：在 .env 里填 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY（用 npx web-push generate-vapid-keys 生成），重启服务，然后在寻宝人页面点「开通知」。']
                ]
            }
        ]
    };

    const ALL_TUTORIALS = [tutorialHeartbeat, tutorialImageGen, tutorialEngawa, tutorialMidnight, tutorialTreasureMap];

    function renderKnowledge() {
        const area = document.getElementById('knowledge-content-area');
        if (!area) return;

        area.innerHTML = `
        <div class="kb-wrap">
            <div class="kb-list-head">
                <div class="kb-list-head-title">使用教程</div>
                <div class="kb-list-head-sub">共 ${ALL_TUTORIALS.length} 篇 · 点开任意一篇看图文步骤</div>
            </div>
            <div class="kb-list">
                ${ALL_TUTORIALS.map(t => `
                <div class="kb-card" data-tutorial="${t.id}" style="--kb-accent:${t.accent}">
                    <div class="kb-card-emoji">${t.emoji}</div>
                    <div class="kb-card-body">
                        <div class="kb-card-title">${t.title}</div>
                        <div class="kb-card-sub">${t.subtitle}</div>
                    </div>
                    <div class="kb-card-arrow">›</div>
                </div>`).join('')}
            </div>
            <div class="kb-end">— 学到这里就够用了 —</div>
        </div>`;

        area.querySelectorAll('.kb-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-tutorial');
                renderTutorialDetail(ALL_TUTORIALS.find(t => t.id === id));
            });
        });
    }

    function renderTutorialDetail(t) {
        if (!t) return;
        const area = document.getElementById('knowledge-content-area');
        const stepsHTML = (sArr) => sArr.map((s, i) => `
            <div class="kb-step"><span class="kb-step-num">${i + 1}</span><span class="kb-step-text">${fmt(s)}</span></div>
        `).join('');
        const faqHTML = (faqArr) => faqArr.map(([q, a]) => `
            <div class="kb-faq">
                <div class="kb-faq-q">Q：${fmt(q)}</div>
                <div class="kb-faq-a">${fmt(a)}</div>
            </div>
        `).join('');
        const bulletsHTML = (bArr) => `<ul class="kb-list-b">${bArr.map(b => `<li>${fmt(b)}</li>`).join('')}</ul>`;
        const tableHTML = (rows) => `
            <div class="kb-table-wrap">
                <table class="kb-table">
                    ${rows.map(r => `
                    <tr>
                        <td class="kb-t-freq">${fmt(r[0])}</td>
                        <td class="kb-t-name">${fmt(r[1])}</td>
                        <td class="kb-t-desc">${fmt(r[2])}</td>
                    </tr>`).join('')}
                </table>
            </div>`;

        area.style.setProperty('--kb-accent', t.accent);

        area.innerHTML = `
        <div class="kb-wrap">
            <div class="kb-back" id="kb-back">‹ 返回教程列表</div>
            <div class="kb-hero" style="background: linear-gradient(135deg, ${t.accent}1f, ${t.accent}3d);">
                <div class="kb-hero-emoji">${t.emoji}</div>
                <div class="kb-hero-title" style="color:${t.accent};">${t.title}</div>
                <div class="kb-hero-sub" style="color:${t.accent}bb;">${t.subtitle}</div>
            </div>
            ${t.sections.map(sec => `
                <div class="kb-section">
                    <div class="kb-h2">${sec.heading}</div>
                    ${sec.body ? (Array.isArray(sec.body)
                        ? `<ul class="kb-list-n">${sec.body.map(b => `<li>${fmt(b)}</li>`).join('')}</ul>`
                        : `<p class="kb-p">${fmt(sec.body)}</p>`) : ''}
                    ${sec.table ? tableHTML(sec.table) : ''}
                    ${sec.tip ? `<div class="kb-tip">💡 ${fmt(sec.tip)}</div>` : ''}
                    ${sec.steps ? stepsHTML(sec.steps) : ''}
                    ${sec.bullets ? bulletsHTML(sec.bullets) : ''}
                    ${sec.faq ? faqHTML(sec.faq) : ''}
                </div>
            `).join('')}
            <div class="kb-end">— 完 —</div>
        </div>`;

        document.getElementById('kb-back').addEventListener('click', renderKnowledge);
        saveOpenIds([...new Set([...loadOpenIds(), t.id])]);
        // 同步滚到顶部
        const main = document.getElementById('knowledge-screen');
        if (main) main.scrollTop = 0;
    }

    window.renderKnowledge = renderKnowledge;
})();
