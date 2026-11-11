/* ============================================================
   A 模式 · 捉宠（小克）：表情图鉴 + 桌宠配置
   移植自 A（Claude 风）的 window.PETX 模块，适配 A 模式的
   覆盖层系统（不依赖 A 的 sheet 机制）。
   素材：pet/*.svg、pet/operit/*.png、pet/emotes/*.gif
   依赖：pet/clawd-pool.js → window.ClawdPool（职业四帧）
         pet/operit/pixel.js  → window.ClawdPixel（像素雪碧图）
   配置存 localStorage.homePetX（与 A 原版同 key，行为一致）
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'homePetX';
    const $ = (id) => document.getElementById(id);

    /* ---------- 一、表情 ---------- */
    const MOOD = [
        { k: 'idle', n: '发呆', g: 'base', f: 'clawd-idle-follow.svg', d: '站着轻轻呼吸，眼睛会跟着你转。没事干的时候就这一张。' },
        { k: 'thinking', n: '思考', g: 'base', f: 'clawd-working-thinking.svg', d: '头顶冒一串思考泡，边上有一圈光在慢慢绕着走。' },
        { k: 'typing', n: '打字', g: 'base', f: 'clawd-working-typing.svg', d: '疯狂敲键盘，整个人跟着一顿一顿。' },
        { k: 'happy', n: '开心', g: 'base', f: 'clawd-happy.svg', d: '一蹦一蹦，脚基本不沾地。' },
        { k: 'error', n: '出错', g: 'base', f: 'clawd-error.svg', d: '瘫在那儿重重喘气，像刚炸过一回。' },
        { k: 'living', n: '自己找事', g: 'life', f: 'clawd-idle-living.svg', d: '十六秒的小剧场：挠头、东摸西摸、最后自己坐好。' },
        { k: 'look', n: '东张西望', g: 'life', f: 'clawd-idle-look.svg', d: '左看看右看看，还顺便挠挠壳。' },
        { k: 'bubble', n: '吹泡泡', g: 'life', f: 'clawd-idle-bubble.svg', d: '一个接一个吹泡泡，飘走了再吹一个。' },
        { k: 'reading', n: '看书', g: 'life', f: 'clawd-idle-reading.svg', d: '摸出书、戴上眼镜，眼镜滑下来再推回去。' },
        { k: 'coffee', n: '端咖啡', g: 'life', f: 'clawd-coffee-hand.svg', d: '右手托一杯咖啡，走得稳稳的。' },
        { k: 'coffeeFlip', n: '顶咖啡', g: 'life', f: 'clawd-coffee-head-flip.svg', d: '杯子翻到头顶，还能稳稳顶着。' },
        { k: 'groove', n: '听歌', g: 'life', f: 'clawd-headphones-groove.svg', d: '戴着耳机点头，越点越起劲。' },
        { k: 'notify', n: '有新消息', g: 'life', f: 'clawd-notification.svg', d: '翻个身提醒你：有动静了。' },
        { k: 'ultrathink', n: '深度思考', g: 'work', f: 'clawd-working-ultrathink.svg', d: '浑身发抖，脑子在超频跑。' },
        { k: 'designing', n: '画设计', g: 'work', f: 'clawd-designing.svg', d: '掏出画板，比划比例。' },
        { k: 'debugger', n: '抓虫', g: 'work', f: 'clawd-working-debugger.svg', d: '举着一只虫子：就是你在捣乱。' },
        { k: 'building', n: '盖楼', g: 'work', f: 'clawd-working-building.svg', d: '戴上安全帽，一块一块往上垒。' },
        { k: 'carrying', n: '搬东西', g: 'work', f: 'clawd-working-carrying.svg', d: '抱着东西一路小跑，别挡道。' },
        { k: 'sweeping', n: '扫地', g: 'work', f: 'clawd-working-sweeping.svg', d: '拿着扫帚，一路扫过去。' },
        { k: 'juggling', n: '杂耍', g: 'work', f: 'clawd-working-juggling.svg', d: '三个球在抛，一个都不许掉。' },
        { k: 'wizard', n: '巫师帽', g: 'work', f: 'clawd-working-wizard.svg', d: '戴上尖帽，但走起来还是螃蟹的横步。' },
        { k: 'boss', n: '老板皮', g: 'work', f: 'clawd-working-typing-boss.svg', d: '墨镜一戴，敲键盘的气场都不一样了。' },
        { k: 'react', n: '吓一跳', g: 'poke', f: 'clawd-react-double-jump.svg', d: '整个人弹起来，落回去再拍拍胸口。' },
        { k: 'reactDouble', n: '手忙脚乱', g: 'poke', f: 'clawd-react-double.svg', d: '两只手不知道该护哪儿。' },
        { k: 'reactLeft', n: '往左看', g: 'poke', f: 'clawd-react-left.svg', d: '脑袋扭向左边，愣一下。' },
        { k: 'reactRight', n: '往右看', g: 'poke', f: 'clawd-react-right.svg', d: '脑袋扭向右边，愣一下。' },
        { k: 'reactDrag', n: '被拎起来', g: 'poke', f: 'clawd-react-drag.svg', d: '从上面被提着，两腿左右晃荡。' },
        { k: 'annoyed', n: '被烦到', g: 'poke', f: 'clawd-react-annoyed.svg', d: '先躲一下、忍住、最后叹一口长气。' },
        { k: 'shy', n: '害羞', g: 'poke', f: 'clawd-aegyo-shy.svg', d: '缩一下、停一下、再弹回来——一次性的那种。' },
        { k: 'heartEyes', n: '星星眼', g: 'poke', f: 'clawd-heart-eyes.svg', d: '眼睛变成心形，整个人往上飘。' },
        { k: 'dizzy', n: '晕头转向', g: 'poke', f: 'clawd-dizzy.svg', d: '蚊香眼，站都站不稳。' },
        { k: 'yawn', n: '打哈欠', g: 'sleep', f: 'clawd-idle-yawn.svg', d: '伸懒腰，越伸越扁，最后收在瘫着的姿势。' },
        { k: 'doze', n: '打盹', g: 'sleep', f: 'clawd-idle-doze.svg', d: '缩成一团轻轻呼吸，眼睛闭着。' },
        { k: 'lowBattery', n: '电量低', g: 'sleep', f: 'clawd-idle-low-battery.svg', d: '快没电了，缩着慢慢喘。' },
        { k: 'collapse', n: '瘫倒', g: 'sleep', f: 'clawd-idle-collapse.svg', d: '一秒垮下去，趴在原地不动了。' },
        { k: 'collapseSleep', n: '瘫着睡', g: 'sleep', f: 'clawd-collapse-sleep.svg', d: '先垮，再睡着，呼吸里带着小 Zzz。' },
        { k: 'sleeping', n: '睡熟', g: 'sleep', f: 'clawd-sleeping.svg', d: '深睡，呼吸又慢又沉。' },
        { k: 'wake', n: '醒来', g: 'sleep', f: 'clawd-wake.svg', d: '坐起来伸个懒腰——一次性的，演完就回发呆。' },
        { k: 'outlaw', n: '摆烂', g: 'sleep', f: 'clawd-outlaw-bender.svg', d: '喝一口、抽一口、晃两下，最后倒下去。十五秒一镜到底。' },
        { k: 'aboutHero', n: '出场', g: 'sleep', f: 'clawd-about-hero.svg', d: '“Deal with it” 的定格 pose，戴墨镜那一下。' },
        { k: 'staticBase', n: '静态底图', g: 'sleep', f: 'clawd-static-base.svg', d: '不动的那张基准帧，用来对位的——这张是真不会动。' },
    ];

    /* ---------- 二、小跟班 ---------- */
    const MINI = [
        { k: 'mini:enter', n: '冒头', g: 'mini', f: 'clawd-mini-enter.svg', d: '从边上冒出来，先打个照面。' },
        { k: 'mini:peek', n: '探头', g: 'mini', f: 'clawd-mini-peek.svg', d: '探出半个脑袋看你。' },
        { k: 'mini:idle', n: '待机', g: 'mini', f: 'clawd-mini-idle.svg', d: '小小一只，在旁边待着。' },
        { k: 'mini:happy', n: '高兴', g: 'mini', f: 'clawd-mini-happy.svg', d: '高兴地晃两下。' },
        { k: 'mini:alert', n: '警觉', g: 'mini', f: 'clawd-mini-alert.svg', d: '有情况，一下就竖起来了。' },
        { k: 'mini:walk', n: '横着走', g: 'mini', f: 'clawd-mini-crabwalk.svg', d: '横着横着就过去了——螃蟹嘛。' },
        { k: 'mini:type', n: '一起敲', g: 'mini', f: 'clawd-mini-typing.svg', d: '跟着一起敲键盘。' },
        { k: 'mini:sleep', n: '睡着', g: 'mini', f: 'clawd-mini-sleep.svg', d: '小小一颗，睡过去了。' },
        { k: 'mini:enterSleep', n: '悄悄睡下', g: 'mini', f: 'clawd-mini-enter-sleep.svg', d: '悄悄挪进去，躺平。' },
    ];

    /* ---------- 二·四、clawd-icons 图标 ---------- */
    /* 图标包：TangfanOVO/clawd-icons（MIT），每个 SVG 已内联动作，可直接当桌宠播放 */
    const ICONS = (window.ClawdIconsData || []).map((x) => ({
        k: 'ic:' + x.name, n: x.label, g: 'icons', cat: x.category,
        f: 'icons/' + x.name + '.svg', d: x.desc,
    }));

    /* ---------- 二·七、灵动岛小蟹 ---------- */
    /* TangfanOVO/clawd-icons island/（MIT），六只像素蟹各 10 秒一圈，SVG 自带动画自动播 */
    const ISLAND = [
        { k: 'il:fish', n: '在钓鱼', f: 'island/fish.svg', d: '等浮漂、打瞌睡、拽空了挠头、重新抛竿，钓上小鱼看一眼又放回水里。' },
        { k: 'il:care', n: '惦记你身体', f: 'island/care.svg', d: '吹凉一杯热水，双手捧到你面前，等你接。' },
        { k: 'il:letter', n: '在给你写信', f: 'island/letter.svg', d: '写两行、抬头想、折好装信封、贴心封口，举起来给你看。' },
        { k: 'il:window', n: '在看外面', f: 'island/window.svg', d: '趴窗台听雨、伸钳子接雨，雨停了月亮出来，蹦起来。' },
        { k: 'il:travel', n: '出门走走', f: 'island/travel.svg', d: '背着登山包走路，跟飞过的鸟招手，东张西望，掏地图。' },
        { k: 'il:food', n: '在挑吃的', f: 'island/food.svg', d: '摇骰子、扔出去、落地吓一跳，冒出一碗面，搓手。' },
    ];

    /* ---------- 二·五、像素款 ---------- */
    const PXN = {
        'ai_idle': ['发呆', '呼吸带一点点晃，像素款的看家姿势。'],
        'ai_look': ['东张西望', '左瞧瞧右瞧瞧，眼睛还眨。'],
        'ai_read': ['看书', '捧着书一页一页翻，很入神。'],
        'ai_write': ['写东西', '趴在纸上写写画画。'],
        'ai_type': ['打字', '噼里啪啦一顿敲。'],
        'ai_search': ['翻资料', '翻箱倒柜在找什么。'],
        'ai_tool': ['干活', '工具抡起来，一脸认真。'],
        'ai_talk': ['说话', '钳子一张一合，跟你唠。'],
        'ai_tap': ['点两下', '伸钳子点了点，像在敲玻璃。'],
        'ai_wave': ['招手', '看到你了，钳子挥得飞快。'],
        'ai_walk': ['散步', '横着走两步——螃蟹的正经走法。'],
        'ai_happy': ['开心', '原地一蹦一蹦的。'],
        'ai_error': ['出错', '冒烟了，蔫在那儿。'],
        'ai_charge': ['充电', '插上电慢慢回血。'],
        'ai_land': ['落地', '从上面掉下来，稳稳站住。'],
        'ai_drag': ['被拎起来', '被人提着，腿在半空划。'],
        'ai_sleep': ['睡熟', '缩成一团，睡得很沉。'],
        'neo_happy': ['特别高兴', '新版小蟹，高兴得直晃。'],
        'neo_sad': ['委屈', '耷拉着钳子，谁都别理我。'],
        'neo_angry': ['生气', '气鼓鼓地横过来瞪你。'],
        'neo_shy': ['害羞', '钳子捂脸，不敢看你。'],
        'neo_shock': ['震惊', '原地弹起来，钳子全张开。'],
        'neo_confused': ['疑惑', '歪着头看你：啥意思？'],
        'neo_poke': ['被戳一下', '被戳得跳了一下。'],
        'neo_listen': ['竖钳听', '钳子贴在耳边，认真听你说。'],
        'neo_paint': ['画画', '举着画笔刷刷刷。'],
        'neo_spin': ['转圈', '滴溜溜转，转得自己发晕。'],
        'neo_surf': ['冲浪', '踩着浪头，稳得很。'],
        'neo_toast': ['举杯', '钳子举起来，敬你一个。'],
        'neo_type': ['疯狂打字', '手速起飞，屏幕都在抖。'],
        'neo_type_kb': ['敲键盘', '正经敲键盘，一下是一下。'],
        'neo_bash': ['敲终端', '黑窗口里跑命令，跑得飞起。'],
        'neo_bash_hack': ['黑客上身', '满屏代码哗哗滚，看起来很厉害。'],
        'neo_bash_npm': ['装依赖', '等 npm 装完的那几秒。'],
        'neo_bash_test': ['跑测试', '一条一条跑，心里默默祈祷。'],
        'neo_bash_err': ['脚本炸了', '跑到一半红了，抱头。'],
        'neo_done': ['交付完成', '活干完了，站起来伸个懒腰。'],
        'neo_drop': ['摔下来', '啪叽一下，坐在地上缓。'],
        'neo_fling': ['被甩飞', '划出一道弧线飞出去了。'],
        'neo_dock': ['靠边停', '贴到边上，探头看你。'],
        'neo_sleep_bubble': ['睡着冒泡', '睡着了，鼻子上的泡一鼓一鼓。'],
        'neo_sleep_cap': ['戴帽睡觉', '戴上小睡帽，呼呼大睡。'],
        'neo_jelly_full': ['果冻回血', '整个人Q弹Q弹地充能，满了才停。'],
    };
    const PX = (window.ClawdPixel ? Object.keys(window.ClawdPixel) : [])
        .filter((id) => PXN[id])
        .map((id) => {
            const a = window.ClawdPixel[id];
            return {
                k: 'px:' + id, n: PXN[id][0], g: 'px', px: id,
                d: PXN[id][1],
                f: a.f, fps: a.fps, loop: a.loop !== false,
                dur: a.f / (a.fps || 6),
            };
        });

    /* ---------- 二·六、日常斗图 ---------- */
    const EMN = {
        'chi-wo-yi-quan': ['吃我一拳', '抡圆了给你一下。'],
        'da-jiao': ['大叫', '啊——有事吗没事我喊一声。'],
        'gan-ga': ['尴尬', '钳子脚趾扣地。'],
        'hao': ['好', '行，都听你的。'],
        'jia-you': ['加油', '钳子挥起来给你打气。'],
        'lao-po': ['老婆', '见了喜欢的人，就是这么直白。'],
        'ni-xing-la': ['你醒啦', '凑过来瞅瞅你醒了没。'],
        'wu-yu': ['无语', '翻着钳子走开了。'],
        'yun': ['晕', '蚊香眼，原地转三圈。'],
    };
    const EMOTE = Object.keys(EMN).map((id) => ({
        k: 'em:' + id, n: EMN[id][0], g: 'em', f: 'emotes/' + id + '.gif', d: EMN[id][1],
    }));

    /* ---------- 三、职业 ---------- */
    const JOBD = {
        'chef-egg': '一边翻锅，一边把蛋颠起来。',
        'chef-knife': '菜刀举过头顶，剁得又稳又狠。',
        'chef-wok': '灶火直冲上来，锅铲翻飞。',
        'witch-brew': '守着坩埚搅药，白猫蹲在旁边看。',
        'post-letter': '把信举高，等你签收。',
        'post-run': '一路小跑，邮包在身后晃。',
        'post-mailbox': '踮起脚，把信塞进邮筒。',
        'post-doorbell': '按完门铃往后退半步，等你开门。',
        'post-squat': '蹲下来翻邮包，找下一封。',
        'painter-peek': '举着画笔，眯起一只眼看比例。',
        'gardener-water': '提着水壶，一勺一勺浇。',
        'keeper-lantern': '站在灯塔上举灯，海上有条小船。',
        'foreman-plan': '展开图纸，指指点点。',
        'astro-scope': '架着望远镜，星星会闪。',
        'lib-books': '托着一摞书，晃但不倒。',
        'ferry-pole': '竹篙一点，船就过去了。',
        'det-lens': '举着放大镜蹲下去，看脚印。',
        'magic-wand': '帽子一掀，兔子探出头。',
        'fisher-catch': '竿子一甩，等鱼上钩。',
        'fire-hose': '抱着水枪，水柱左右扫。',
        'astro-float': '没有重力，慢慢翻着飘。',
        'baker-peel': '拿长柄铲，把面包送进炉子。',
        'busk-uke': '抱着琴边弹边唱，脚打着拍子。',
        'writer-quill': '羽毛笔在纸上改改划划。',
        'catsit-teaser': '拿逗猫棒晃，猫在下面扑。',
        'cowboy-lasso': '绳子在头顶转圈，越转越快。',
        'racer-kart': '油门踩到底，人往后仰。',
        'ballet-arabesque': '优雅地单脚站——然后晃了一下。',
        'sci-boom': '试管一冒烟，人就飞出去了。',
        'surf-ride': '踩着板，冲上浪头。',
        'dive-float': '在水里浮着，鱼围着转。',
        'doc-listen': '举着听诊器，认真听。',
        'coffee-pour': '奶泡倒下去，画出一颗心。',
        'florist-wrap': '一张纸、一根绳，花就包好了。',
        'photo-hood': '整个人钻进黑布里对焦。',
        'pirate-swing': '抓着绳子荡过去，刀咬在嘴里。',
        'winter-scarf': '戴上围巾，雪落下来。',
    };
    const JOBS = (window.ClawdPool ? window.ClawdPool.POOL : []).map((o) => ({
        k: 'job:' + o.id, n: o.name, g: 'job', job: o.job, o,
        d: JOBD[o.id] || (o.job + '干活的样子。'),
    }));

    const ALL = MOOD.concat(ICONS, ISLAND, JOBS, MINI, PX, EMOTE);
    const BYKEY = {};
    ALL.forEach((it) => { BYKEY[it.k] = it; });

    /* ---------- 四、状态 ---------- */
    const STATES = [
        { k: 'idle', n: '发呆', d: '没在干什么，就站在那儿' },
        { k: 'typing', n: '我在打字', d: '输入框里有字，还没发出去' },
        { k: 'thinking', n: '等他开口', d: '发出去了，他还没开始说' },
        { k: 'replying', n: '正在回复', d: '字一句一句往外冒的时候' },
        { k: 'done', n: '说完了', d: '刚收尾那三秒' },
        { k: 'error', n: '出岔子', d: '报错、断线、跑挂了' },
        { k: 'night', n: '深夜', d: '凌晨到天亮，没人管的时候' },
        { k: 'away', n: '久没动', d: '放着不管五分钟以上' },
        { k: 'poke', n: '被戳一下', d: '你点他' },
        { k: 'drag', n: '被拎起来', d: '拖着他满屏跑' },
    ];

    /* ---------- 五、配置 ---------- */
    const DEFAULTS = {
        on: true, scope: 'chat',
        state: {
            idle: 'idle', typing: 'typing', thinking: 'thinking', replying: 'typing',
            done: 'happy', error: 'error', night: 'doze', away: 'doze',
            poke: '', drag: 'reactDrag',
        },
    };
    let C = null;
    function cfg() {
        if (C) return C;
        let v = null;
        try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { v = null; }
        C = Object.assign({}, DEFAULTS, v || {});
        if (!C.off || typeof C.off !== 'object') C.off = {};
        // 图标包默认不参与随机，想用再到「要播哪些」里勾上
        if (C.iv !== 1) {
            ICONS.forEach((it) => { if (!(it.k in C.off)) C.off[it.k] = 1; });
            C.iv = 1;
        }
        if (!C.state || typeof C.state !== 'object') C.state = Object.assign({}, DEFAULTS.state);
        else C.state = Object.assign({}, DEFAULTS.state, C.state);
        if (C.scope !== 'all') C.scope = 'chat';
        C.on = C.on !== false;
        return C;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg())); } catch (e) { } }
    const isOn = (k) => !cfg().off[k];
    const enabled = () => ALL.filter((it) => isOn(it.k));

    const RAND = {};
    function rollFor(state) {
        const pool = enabled();
        RAND[state] = pool.length ? pool[Math.floor(Math.random() * pool.length)].k : 'idle';
    }
    function pickFor(state) {
        const c = cfg();
        if (!STATES.some((s) => s.k === state)) {
            return (BYKEY[state] && isOn(state)) ? state : 'idle';
        }
        const hit = c.state[state];
        if (hit && BYKEY[hit]) return hit;
        if (RAND[state] && isOn(RAND[state])) return RAND[state];
        const pool = enabled();
        return pool.length ? pool[Math.floor(Math.random() * pool.length)].k : 'idle';
    }
    function nameOf(k) {
        if (!k) return '随机';
        const it = BYKEY[k];
        return it ? it.n : k;
    }

    /* ---------- 渲染工具 ---------- */
    const ONCE_MS = {
        'clawd-react-double-jump.svg': 3500,
        'clawd-react-annoyed.svg': 6000,
        'clawd-react-left.svg': 2500,
        'clawd-react-right.svg': 2500,
        'clawd-react-double.svg': 3500,
        'clawd-idle-yawn.svg': 3800,
        'clawd-idle-collapse.svg': 1000,
        'clawd-collapse-sleep.svg': 1000,
        'clawd-wake.svg': 1500,
        'clawd-mini-enter.svg': 3200,
        'clawd-mini-enter-sleep.svg': 3200,
        'clawd-about-hero.svg': 4400,
        'clawd-outlaw-bender.svg': 15000,
    };
    function imgTag(file) {
        return '<img data-pet="' + file + '" src="pet/' + file + '" alt="">';
    }
    function pxSprite(item, s) {
        const w = s, n = item.f || 1;
        return '<span class="pxsprite' + (item.loop ? '' : ' once')
            + '" style="width:' + w + 'px;height:' + w + 'px;'
            + 'background-image:url(pet/operit/' + item.px + '.png);'
            + 'background-size:' + (n * w) + 'px ' + w + 'px;'
            + '--pxe:' + (-(n - 1) * w) + 'px;'
            + 'animation-duration:' + item.dur.toFixed(2) + 's;'
            + 'animation-timing-function:steps(' + n + ',end)"></span>';
    }
    function pxReplay(el, item) {
        if (item.loop || !el) return;
        const ms = item.dur * 1000 + 1300;
        setInterval(() => {
            if (!el.isConnected) return;
            const r = el.getClientRects();
            if (!r.length) return;
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
        }, ms);
    }
    function replay(img, file) {
        const ms = ONCE_MS[file];
        if (!ms || !img) return;
        let n = 0;
        const beat = () => {
            if (!img.isConnected) return;
            const rs = img.getClientRects();
            if (rs.length) {
                const r = rs[0];
                const near = r.bottom > -260 && r.top < (window.innerHeight || 800) + 260;
                if (near) {
                    n++;
                    const url = 'pet/' + file + '?r=' + n;
                    const pre = new Image();
                    const put = () => { if (img.isConnected) img.src = url; };
                    pre.onload = put;
                    pre.onerror = put;
                    pre.src = url;
                }
            }
            setTimeout(beat, ms + 700);
        };
        setTimeout(beat, ms + 700);
    }
    function wireImgs(root) {
        if (!root) return;
        root.querySelectorAll('img[data-pet]').forEach((im) => replay(im, im.dataset.pet));
    }
    function mount(el, item) {
        if (!el || el.dataset.done) return;
        el.dataset.done = '1';
        if (item.px && window.ClawdPixel && window.ClawdPixel[item.px]) {
            el.innerHTML = pxSprite(item, 78);
            pxReplay(el.firstChild, item);
        } else if (item.o && window.ClawdPool) {
            el.innerHTML = window.ClawdPool.svg(item.o, { anim: true });
        } else {
            el.innerHTML = imgTag(item.f);
        }
        wireImgs(el);
    }

    /* ---------- 面板管理 ---------- */
    let pageEl = null;
    function panel(id) { return pageEl ? pageEl.querySelector('#' + id) : null; }
    function showPanel(id) {
        ['apx-list-panel', 'apx-one-panel', 'apx-cfg-panel', 'apx-pick-panel'].forEach((p) => {
            const el = panel(p);
            if (el) el.classList.toggle('on', p === id);
        });
        const headTitle = panel('apx-head-title');
        const headBack = panel('apx-head-back');
        const headGear = panel('apx-head-gear');
        const titles = {
            'apx-list-panel': '桌宠',
            'apx-one-panel': '这一只',
            'apx-cfg-panel': '桌宠设置',
            'apx-pick-panel': '挑一只',
        };
        if (headTitle) headTitle.textContent = titles[id] || '桌宠';
        // 返回按钮常显：列表页时点它 = 关闭整个页回聊天
        if (headBack) headBack.style.visibility = 'visible';
        if (headGear) headGear.style.visibility = id === 'apx-list-panel' ? 'visible' : 'hidden';
    }
    function backOf(id) {
        return {
            'apx-one-panel': 'apx-list-panel',
            'apx-cfg-panel': 'apx-list-panel',
            'apx-pick-panel': pickFrom === 'cfg' ? 'apx-cfg-panel' : 'apx-list-panel',
        }[id] || 'apx-list-panel';
    }

    /* ---------- 图鉴列表 ---------- */
    const GROUPS = [
        ['base', '基础'], ['life', '小日子'], ['work', '干活'],
        ['poke', '被戳一下'], ['sleep', '睡和瘫'],
    ];
    let tab = 'mood';
    let pickFrom = 'cfg';

    function card(item) {
        return '<button class="px-card" data-k="' + item.k + '">'
            + '<span class="px-stage" data-k="' + item.k + '"></span>'
            + '<span class="px-name">' + item.n + '</span>'
            + '<span class="px-mean">' + (item.d || '') + '</span>'
            + '</button>';
    }
    function grid(list) {
        return '<div class="px-grid">' + list.map(card).join('') + '</div>';
    }
    function renderList() {
        const b = panel('apxList');
        if (!b) return;
        let h = '';
        if (tab === 'mood') {
            for (const [g, name] of GROUPS) {
                const list = MOOD.filter((x) => x.g === g);
                if (!list.length) continue;
                h += '<div class="hsect">' + name + '</div>' + grid(list);
            }
        } else if (tab === 'job') {
            h = '<div class="hsect">三十七只职业，每只四帧</div>' + grid(JOBS);
        } else if (tab === 'icons') {
            h += '<div class="hsect">灵动岛 · 六只小蟹</div>' + grid(ISLAND);
            const seen = [];
            ICONS.forEach((it) => { if (seen.indexOf(it.cat) < 0) seen.push(it.cat); });
            seen.forEach((cat) => {
                const list = ICONS.filter((x) => x.cat === cat);
                h += '<div class="hsect">' + cat + '</div>' + grid(list);
            });
        } else if (tab === 'px') {
            h = '<div class="hsect">operit-clawd 的像素小蟹，逐帧播</div>' + grid(PX);
        } else if (tab === 'em') {
            h = '<div class="hsect">萌萌 Clawd 的日常，拿去斗图</div>' + grid(EMOTE);
        } else {
            h = '<div class="hsect">跟着大蟹混的那只</div>' + grid(MINI);
        }
        b.innerHTML = h;
        fillVisible();
    }
    function fillVisible() {
        const wrap = panel('apxListScroll');
        if (!wrap) return;
        const wr = wrap.getBoundingClientRect();
        const list = wrap.querySelectorAll('.px-stage:not([data-done])');
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            const r = el.getBoundingClientRect();
            if (r.bottom > wr.top - 260 && r.top < wr.bottom + 260) mount(el, BYKEY[el.dataset.k]);
        }
    }
    function renderMainPage() {
        const b = panel('apxListPanel');
        if (!b) return;
        const mine = tab === 'mood' ? MOOD.length : tab === 'job' ? JOBS.length
            : tab === 'px' ? PX.length : tab === 'em' ? EMOTE.length : MINI.length;
        let h = '<div class="sh-head"><h1>小克</h1>'
            + '<div class="sub">' + ALL.length + ' 个样子，全都会动 · 点开看它什么意思</div></div>'
            + '<div class="px-tabs">'
            + '<button data-t="mood" class="' + (tab === 'mood' ? 'on' : '') + '">表情<span class="cnt">' + MOOD.length + '</span></button>'
            + '<button data-t="icons" class="' + (tab === 'icons' ? 'on' : '') + '">图标<span class="cnt">' + (ICONS.length + ISLAND.length) + '</span></button>'
            + '<button data-t="px" class="' + (tab === 'px' ? 'on' : '') + '">像素款<span class="cnt">' + PX.length + '</span></button>'
            + '<button data-t="job" class="' + (tab === 'job' ? 'on' : '') + '">职业<span class="cnt">' + JOBS.length + '</span></button>'
            + '<button data-t="em" class="' + (tab === 'em' ? 'on' : '') + '">斗图<span class="cnt">' + EMOTE.length + '</span></button>'
            + '<button data-t="mini" class="' + (tab === 'mini' ? 'on' : '') + '">小跟班<span class="cnt">' + MINI.length + '</span></button>'
            + '</div><div id="apxList"></div>'
            + '<div class="px-tip">像素款来自 operit-clawd（AGPL-3.0），斗图那 9 张来自萌萌 Clawd 的日常；'
            + '图标来自 TangfanOVO/clawd-icons（MIT，唐幡）。'
            + 'Clawd 是 Claude Code 的吉祥物，归 Anthropic，这些都是非官方同人，请勿商用。'
            + '右上角能挑：让他只在聊天页出现，还是每个页面都跟着；也能给每个状态指定一只。</div>';
        b.innerHTML = h;
        b.querySelectorAll('.px-tabs button').forEach((btn) => {
            btn.addEventListener('click', () => { tab = btn.dataset.t; renderMainPage(); });
        });
        renderList();
    }

    /* ---------- 点开一只 ---------- */
    function openOne(k) {
        const it = BYKEY[k];
        if (!it) return;
        const body = panel('apxOneBody');
        if (!body) return;
        let stage;
        if (it.px && window.ClawdPixel && window.ClawdPixel[it.px]) stage = pxSprite(it, 168);
        else if (it.o && window.ClawdPool) stage = window.ClawdPool.svg(it.o, { anim: true });
        else stage = imgTag(it.f);
        body.innerHTML = '<div class="px-one">'
            + '<div class="big">' + stage + '</div>'
            + '<div class="nm">' + it.n + '</div>'
            + '<div class="jb">' + (it.job ? it.job : it.g === 'mini' ? '小跟班'
                : it.g === 'px' ? '像素款' : it.g === 'em' ? '日常斗图'
                : it.g === 'island' ? '灵动岛'
                : it.g === 'icons' ? ('图标 · ' + (it.cat || '')) : '表情') + '</div>'
            + '<div class="ds">' + (it.d || '') + '</div></div>';
        wireImgs(body);
        if (it.px) pxReplay(body.querySelector('.pxsprite'), it);
        showPanel('apx-one-panel');
    }

    /* ---------- 设置 ---------- */
    function renderCfg() {
        const b = panel('apxCfgBody');
        if (!b) return;
        const c = cfg();
        const on = enabled().length;
        let h = '<div class="group-label">桌宠</div><div class="group">'
            + '<button class="grow" id="apxOnRow">小克在页面上'
            + '<span class="px-sw ' + (c.on ? 'on' : '') + '"></span></button>'
            + '<button class="grow static">出现范围<span class="px-seg">'
            + '<button data-scope="chat" class="' + (c.scope === 'chat' ? 'on' : '') + '">只在聊天页</button>'
            + '<button data-scope="all" class="' + (c.scope === 'all' ? 'on' : '') + '">每个页面</button>'
            + '</span></button>'
            + (window.AMaple ? '<button class="grow" id="apxMapleRow">枫枝螃蟹在顶上'
                + '<span class="px-sw ' + (window.AMaple.isOn() ? 'on' : '') + '"></span></button>' : '')
            + '</div>';

        h += '<div class="group-label">什么状态下演哪一只 · 不选就随机</div><div class="group">';
        STATES.forEach((s) => {
            const k = c.state[s.k];
            h += '<button class="grow" data-state="' + s.k + '">' + s.n
                + '<span class="px-row-val">' + nameOf(k) + '</span>'
                + '<span class="px-row-ic">›</span></button>';
        });
        h += '</div>';

        h += '<div class="group-label">演什么</div><div class="group">'
            + '<button class="grow" id="apxEnabledRow">播放哪些表情'
            + '<span class="px-row-val">已选 ' + on + ' / ' + ALL.length + '</span>'
            + '<span class="px-row-ic">›</span></button>'
            + '<button class="grow" id="apxResetRow">恢复默认<span class="px-row-val">全开 · 只在聊天页</span></button>'
            + '</div>'
            + '<div class="px-tip">留“随机”的状态，会从你勾上的那些里随手挑一只；勾掉的不参与随机。'
            + '但哪个状态你亲手点名了某一只，就算它被勾掉也照演——你说了算。'
            + '点一下页面上那只，他会按“被戳一下”反应。</div>';
        b.innerHTML = h;

        $('apxOnRow').addEventListener('click', () => {
            c.on = !c.on; save(); applyOn(); renderCfg();
        });
        const mapleRow = $('apxMapleRow');
        if (mapleRow) mapleRow.addEventListener('click', () => {
            window.AMaple.toggle(); renderCfg();
        });
        b.querySelectorAll('[data-scope]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                c.scope = btn.dataset.scope; save(); applyScope(); renderCfg();
            });
        });
        b.querySelectorAll('[data-state]').forEach((btn) => {
            btn.addEventListener('click', () => renderPick('state', btn.dataset.state));
        });
        $('apxEnabledRow').addEventListener('click', () => renderPick('enable'));
        $('apxResetRow').addEventListener('click', () => {
            C = null;
            try { localStorage.removeItem(KEY); } catch (e) { }
            cfg(); save(); applyOn(); applyScope(); renderCfg();
        });
    }

    /* ---------- 挑一只 ---------- */
    let pickState = '';
    function pickRow(it, on) {
        return '<button class="px-pickrow ' + (on ? 'on' : '') + '" data-k="' + it.k + '">'
            + '<span class="mini"></span>'
            + '<span class="tx"><b>' + it.n + '</b><i>' + (it.d || '') + '</i></span>'
            + '<span class="bx"><span class="ic">✓</span></span></button>';
    }
    function renderPick(mode, stateKey) {
        pickFrom = mode === 'state' ? 'cfg' : 'list';
        pickState = stateKey || '';
        const c = cfg();
        const title = panel('apxPickTitle');
        const b = panel('apxPickBody');
        if (!b) return;
        let h = '';
        if (mode === 'state') {
            pickFrom = 'cfg';
            const s = STATES.find((x) => x.k === pickState);
            if (title) title.textContent = s ? s.n : '挑一只';
            h += '<div class="sh-head"><h1>' + (s ? s.n : '') + '</h1><div class="sub">'
                + (s ? s.d : '') + '</div></div><div class="group">'
                + '<button class="px-pickrow ' + (!c.state[pickState] ? 'on' : '') + '" data-k="">'
                + '<span class="mini"></span><span class="tx"><b>随机</b><i>从勾选的那些里随手挑</i></span>'
                + '<span class="bx"><span class="ic">✓</span></span></button>'
                + '</div><div class="group-label">挑一只定死</div><div class="group" id="apxPickList">'
                + ALL.map((it) => pickRow(it, c.state[pickState] === it.k)).join('')
                + '</div>';
        } else {
            pickFrom = 'list';
            if (title) title.textContent = '要播哪些';
            h += '<div class="sh-head"><h1>要播哪些</h1><div class="sub">勾上的才会出现；'
                + '关掉的连随机也轮不到</div></div>'
                + '<div class="group"><button class="grow" id="apxAllRow">全开／全关'
                + '<span class="px-row-val" id="apxAllVal">已选 ' + enabled().length + ' / ' + ALL.length + '</span></button></div>'
                + '<div class="group-label">表情</div><div class="group">'
                + MOOD.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">图标</div><div class="group">'
                + ICONS.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">灵动岛</div><div class="group">'
                + ISLAND.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">像素款</div><div class="group">'
                + PX.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">职业</div><div class="group">'
                + JOBS.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">小跟班</div><div class="group">'
                + MINI.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>'
                + '<div class="group-label">日常斗图</div><div class="group">'
                + EMOTE.map((it) => pickRow(it, isOn(it.k))).join('') + '</div>';
        }
        b.innerHTML = h;

        b.querySelectorAll('.px-pickrow').forEach((row) => {
            row.addEventListener('click', () => {
                const k = row.dataset.k;
                if (mode === 'state') {
                    c.state[pickState] = k;
                    save(); renderCfg(); showPanel('apx-cfg-panel');
                    return;
                }
                if (!k) return;
                if (isOn(k)) c.off[k] = 1; else delete c.off[k];
                save();
                row.classList.toggle('on', isOn(k));
                const av = $('apxAllVal');
                if (av) av.textContent = '已选 ' + enabled().length + ' / ' + ALL.length;
            });
        });
        const allRow = $('apxAllRow');
        if (allRow) allRow.addEventListener('click', () => {
            const all = enabled().length === ALL.length;
            if (all) ALL.forEach((it) => { c.off[it.k] = 1; });
            else { c.off = {}; }
            save(); renderPick('enable'); renderCfg();
        });
        /* 挑单只的时候也让人看看动起来的样子 */
        b.querySelectorAll('.px-pickrow .mini').forEach((m) => {
            const it = BYKEY[m.parentNode.dataset.k];
            if (!it) return;
            if (it.px && window.ClawdPixel && window.ClawdPixel[it.px]) {
                m.innerHTML = pxSprite(it, 52);
                pxReplay(m.firstChild, it);
            } else {
                m.innerHTML = it.o && window.ClawdPool
                    ? window.ClawdPool.svg(it.o, { anim: true })
                    : imgTag(it.f);
            }
        });
        wireImgs(b);
        showPanel('apx-pick-panel');
    }

    /* ---------- 桌宠状态应用（配置存着，桌宠本体后续接） ---------- */
    function applyOn() {
        document.body.classList.toggle('a-petx-off', !cfg().on);
    }
    function applyScope() {
        if (!petEl) return;
        if (cfg().scope === 'all') {
            petEl.classList.add('px-global');
        } else {
            petEl.classList.remove('px-global');
        }
    }

    /* ---------- 桌宠本体：浮在页面上的那只小蟹 ---------- */
    const PET_MAP = {
        idle: 'clawd-idle-follow.svg',
        thinking: 'clawd-working-thinking.svg',
        typing: 'clawd-working-typing.svg',
        happy: 'clawd-happy.svg',
        doze: 'clawd-idle-doze.svg',
        sleeping: 'clawd-sleeping.svg',
        wake: 'clawd-wake.svg',
        error: 'clawd-error.svg',
        react: 'clawd-react-double-jump.svg',
        reactLeft: 'clawd-react-left.svg',
        reactRight: 'clawd-react-right.svg',
        reactDouble: 'clawd-react-double.svg',
        reactDrag: 'clawd-react-drag.svg',
        annoyed: 'clawd-react-annoyed.svg',
        shy: 'clawd-aegyo-shy.svg',
        heartEyes: 'clawd-heart-eyes.svg',
        dizzy: 'clawd-dizzy.svg',
        reading: 'clawd-idle-reading.svg',
        yawn: 'clawd-idle-yawn.svg',
        look: 'clawd-idle-look.svg',
        living: 'clawd-idle-living.svg',
        bubble: 'clawd-idle-bubble.svg',
        coffee: 'clawd-coffee-hand.svg',
        coffeeFlip: 'clawd-coffee-head-flip.svg',
        groove: 'clawd-headphones-groove.svg',
        notify: 'clawd-notification.svg',
        lowBattery: 'clawd-idle-low-battery.svg',
        ultrathink: 'clawd-working-ultrathink.svg',
        designing: 'clawd-designing.svg',
        debugger: 'clawd-working-debugger.svg',
        building: 'clawd-working-building.svg',
        carrying: 'clawd-working-carrying.svg',
        sweeping: 'clawd-working-sweeping.svg',
        juggling: 'clawd-working-juggling.svg',
        boss: 'clawd-working-typing-boss.svg',
        wizard: 'clawd-working-wizard.svg',
        collapse: 'clawd-idle-collapse.svg',
        collapseSleep: 'clawd-collapse-sleep.svg',
        outlaw: 'clawd-outlaw-bender.svg',
    };
    const PET_WORK_THINK = ['thinking', 'ultrathink', 'designing', 'debugger', 'building', 'carrying', 'sweeping', 'juggling', 'wizard'];
    const PET_WORK_TYPE = ['typing', 'boss', 'wizard'];
    const PET_LIFE = ['reading', 'look', 'living', 'bubble', 'coffee', 'coffeeFlip', 'groove', 'notify',
        'px:ai_read', 'px:ai_look', 'px:ai_walk', 'px:neo_paint', 'px:neo_surf', 'px:neo_spin', 'px:neo_listen', 'px:ai_charge'];
    const PET_POKE = ['react', 'reactLeft', 'reactRight', 'reactDouble', 'heartEyes', 'shy', 'annoyed', 'dizzy',
        'px:neo_poke', 'px:neo_shock', 'px:neo_shy', 'px:neo_confused', 'px:ai_tap', 'px:ai_drag', 'px:neo_fling'];

    let petEl = null, petImg = null, petSvgBox = null;
    let petState = 'idle', petTimer = null, lastEventAt = Date.now(), pDrag = null;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const jobSvgCache = {};

    function buildPet() {
        if (petEl || !document.body) return;
        petEl = document.createElement('div');
        petEl.id = 'pet';
        petEl.innerHTML = '<img alt=""><div class="petSvg"></div>';
        document.body.appendChild(petEl);
        petImg = petEl.querySelector('img');
        petSvgBox = petEl.querySelector('.petSvg');
        try {
            const p = JSON.parse(localStorage.getItem('petPos') || 'null');
            if (p) {
                petEl.style.left = Math.min(Math.max(4, p.l), window.innerWidth - 108) + 'px';
                petEl.style.top = Math.min(Math.max(4, p.t), window.innerHeight - 108) + 'px';
                petEl.style.right = 'auto'; petEl.style.bottom = 'auto';
            }
        } catch (e) { /* ignore */ }
        wirePetDrag();
        petState = '';
        petSet('idle');
        startPetLoops();
        prefetchPetSvg();
    }
    function wirePetDrag() {
        petEl.addEventListener('pointerdown', (e) => {
            const r = petEl.getBoundingClientRect();
            pDrag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, moved: false };
            try { petEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });
        petEl.addEventListener('pointermove', (e) => {
            if (!pDrag) return;
            const dx = e.clientX - pDrag.x, dy = e.clientY - pDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 6 && !pDrag.moved) { pDrag.moved = true; petSet('reactDrag'); }
            if (!pDrag.moved) return;
            petEl.style.left = Math.min(Math.max(4, pDrag.left + dx), window.innerWidth - pDrag.w - 4) + 'px';
            petEl.style.top = Math.min(Math.max(4, pDrag.top + dy), window.innerHeight - pDrag.h - 4) + 'px';
            petEl.style.right = 'auto'; petEl.style.bottom = 'auto';
        });
        petEl.addEventListener('pointerup', () => {
            if (!pDrag) return;
            if (pDrag.moved) {
                const r = petEl.getBoundingClientRect();
                try { localStorage.setItem('petPos', JSON.stringify({ l: r.left, t: r.top })); } catch (e) { /* ignore */ }
                petSet('idle');
            } else {
                petSet(pick(PET_POKE), 1800 + Math.random() * 1200);
                petJump();
            }
            pDrag = null;
        });
    }
    /* ---------- GSAP 时间轴驱动桌宠：呼吸 → 眨眼 → 歪头 ---------- */
    const petSvgText = {};
    let currentPetKey = null, currentPetFile = null;
    let petMotionTl = null, petJumpTl = null;

    function stopPetMotion() {
        if (petMotionTl) { petMotionTl.kill(); petMotionTl = null; }
    }

    function startPetMotion() {
        stopPetMotion();
        if (!window.gsap || !petSvgBox) return;
        const breathe = petSvgBox.querySelector('.breathe-anim');
        const eyes = petSvgBox.querySelector('.eyes-blink');
        // 这一帧没有可驱动的分组（像素图等）就保留原生动画
        if (!breathe && !eyes) return;
        // 关掉 SVG 自带的 CSS 关键帧，统一交给 GSAP
        if (breathe) breathe.style.animation = 'none';
        if (eyes) eyes.style.animation = 'none';

        const rnd = gsap.utils.random;
        const tl = gsap.timeline({ repeat: -1, repeatRefresh: true });

        // 呼吸：四拍一循环，每拍时长和幅度都随机（duration 不能给函数，GSAP 不支持）
        if (breathe) {
            gsap.set(breathe, { transformOrigin: '7.5px 13px' });
            for (let i = 0; i < 4; i++) {
                tl.to(breathe, {
                    scaleX: () => rnd(1.015, 1.03),
                    scaleY: () => rnd(0.965, 0.978),
                    y: () => rnd(0.4, 0.9),
                    duration: rnd(1.25, 2.05),
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: 1,
                }, '>');
            }
        }
        // 眨眼：在呼吸之间随机插两下
        if (eyes) {
            gsap.set(eyes, { transformOrigin: '7.5px 9px' });
            for (let i = 0; i < 2; i++) {
                tl.fromTo(eyes, { scaleY: 1 }, {
                    scaleY: 0.12, duration: 0.085, ease: 'power2.inOut', yoyo: true, repeat: 1,
                }, '>-0.4');
            }
        }
        // 歪头：最后小幅倾斜再回正
        if (breathe) {
            tl.to(breathe, { rotate: () => rnd(-5, 5), duration: 0.55, ease: 'back.out(2)' }, '>-0.6')
              .to(breathe, { rotate: 0, duration: 0.85, ease: 'sine.inOut' }, '>');
        }
        petMotionTl = tl;
    }

    /* 点击时的跳跃，独立时间轴，不打断待机循环 */
    function petJump() {
        if (!window.gsap || !petEl || !cfg().on) return;
        const target = petSvgBox.classList.contains('on') ? petSvgBox : petImg;
        if (!target) return;
        if (petJumpTl) petJumpTl.kill();
        petJumpTl = gsap.timeline()
            .to(target, { y: -16, duration: 0.2, ease: 'power2.out' })
            .to(target, { y: 0, duration: 0.28, ease: 'back.out(3)' })
            .to(target, { scaleY: 0.92, scaleX: 1.04, duration: 0.09, ease: 'sine.inOut', yoyo: true, repeat: 1 });
    }

    /* 预取 SVG 文本：只有内联进 DOM，GSAP 才摸得到里面的呼吸/眨眼分组 */
    function prefetchPetSvg() {
        const files = new Set(Object.values(PET_MAP));
        ALL.forEach((it) => { if (it && it.f) files.add(it.f); });
        files.forEach((f) => {
            if (!/\.svg$/i.test(f) || petSvgText[f]) return;
            fetch('pet/' + f)
                .then((r) => (r.ok ? r.text() : ''))
                .then((txt) => {
                    if (!txt) return;
                    petSvgText[f] = txt;
                    if (currentPetFile === f) petShow(currentPetKey);
                })
                .catch(() => { /* file:// 下取不到就继续用 img */ });
        });
    }

    function petShow(key) {
        if (!petEl) return;
        const it = BYKEY[key];
        currentPetKey = key;
        if (it && it.px && window.ClawdPixel && window.ClawdPixel[it.px]) {
            currentPetFile = null;
            stopPetMotion();
            petSvgBox.innerHTML = pxSprite(it, 96);
            petSvgBox.classList.add('on');
            petImg.style.display = 'none';
            return;
        }
        if (it && it.o && window.ClawdPool) {
            currentPetFile = null;
            if (!jobSvgCache[it.k]) jobSvgCache[it.k] = window.ClawdPool.svg(it.o, { anim: true });
            petSvgBox.innerHTML = jobSvgCache[it.k];
            petSvgBox.classList.add('on');
            petImg.style.display = 'none';
            startPetMotion();
            return;
        }
        // 优先用条目自己的素材（图标包也走这里），再回落到状态默认图
        const file = (it && it.f) ? it.f : (PET_MAP[key] || PET_MAP.idle);
        currentPetFile = file;
        if (/\.svg$/i.test(file) && petSvgText[file]) {
            petSvgBox.innerHTML = petSvgText[file];
            petSvgBox.classList.add('on');
            petImg.style.display = 'none';
            startPetMotion();
            return;
        }
        stopPetMotion();
        petSvgBox.classList.remove('on');
        petSvgBox.innerHTML = '';
        petImg.style.display = '';
        petImg.src = 'pet/' + file;
    }
    function petSet(state, holdMs) {
        if (!petEl || !cfg().on) return;
        if (state === 'idle') {
            const h = new Date().getHours();
            if (h >= 0 && h < 6) state = 'night';
        }
        if (petState === state && !holdMs) return;
        const changed = petState !== state;
        petState = state;
        lastEventAt = Date.now();
        if (changed) rollFor(state);
        petShow(pickFor(state));
        if (petTimer) { clearTimeout(petTimer); petTimer = null; }
        if (holdMs) petTimer = setTimeout(() => petSet('idle'), holdMs);
    }
    function startPetLoops() {
        /* 干活时隔几秒换个花样（设置里点名了某一只就不换） */
        setInterval(() => {
            if (document.hidden || !cfg().on) return;
            if (petState === 'thinking' || petState === 'typing' || petState === 'replying') {
                if (!cfg().state[petState]) rollFor(petState);
                petShow(pickFor(petState));
            }
        }, 3800);
        /* 安静时自己过点小日子 */
        setInterval(() => {
            if (document.hidden || !cfg().on) return;
            if (petState !== 'idle' && petState !== 'calm' && petState !== 'night') return;
            if (Date.now() - lastEventAt > 3.5 * 60e3) return;
            petSet(pick(PET_LIFE), 5000 + Math.random() * 4000);
        }, 45e3);
        /* 一直没人理：打哈欠 → 犯困 → 睡熟 */
        setInterval(() => {
            if (document.hidden || !cfg().on) return;
            if (petState === 'thinking' || petState === 'typing' || petState === 'replying') return;
            const quiet = Date.now() - lastEventAt;
            if (quiet > 15 * 60e3) petSet('sleeping');
            else if (quiet > 5 * 60e3) petSet('away');
            else if (quiet > 4 * 60e3 && (petState === 'idle' || petState === 'night')) petSet('yawn', 6000);
        }, 30e3);
    }
    function boot() {
        buildPet();
        applyOn();
        applyScope();
    }

    /* ---------- 开张 ---------- */
    function build() {
        if (pageEl) return;
        pageEl = document.createElement('div');
        pageEl.id = 'a-petx-page';
        pageEl.innerHTML =
            '<div class="apx-head">' +
            '<button class="apx-hbtn" id="apx-head-back">←</button>' +
            '<div class="apx-htitle" id="apx-head-title">桌宠</div>' +
            '<button class="apx-hbtn" id="apx-head-gear">⚙</button>' +
            '</div>' +
            '<div class="apx-body">' +
            '<div class="apx-panel on" id="apx-list-panel"><div class="apx-panel-scroll" id="apxListScroll"><div id="apxListPanel"></div></div></div>' +
            '<div class="apx-panel" id="apx-one-panel"><div class="apx-panel-scroll"><div id="apxOneBody"></div></div></div>' +
            '<div class="apx-panel" id="apx-cfg-panel"><div class="apx-panel-scroll"><div id="apxCfgBody"></div></div></div>' +
            '<div class="apx-panel" id="apx-pick-panel"><div class="apx-panel-scroll"><div id="apxPickTitle" class="apx-pick-title"></div><div id="apxPickBody"></div></div></div>' +
            '</div>';
        document.body.appendChild(pageEl);

        pageEl.addEventListener('click', (e) => {
            if (e.target.id === 'apx-head-back') {
                const cur = currentPanel();
                if (cur === 'apx-list-panel') { close(); return; }
                showPanel(backOf(cur));
                return;
            }
            if (e.target.id === 'apx-head-gear') { renderCfg(); showPanel('apx-cfg-panel'); return; }
            const cardEl = e.target.closest && e.target.closest('.px-card');
            if (cardEl) { openOne(cardEl.dataset.k); return; }
        });
        const listScroll = panel('apxListScroll');
        if (listScroll) {
            let tick = null;
            listScroll.addEventListener('scroll', () => {
                if (tick) return;
                tick = setTimeout(() => { tick = null; fillVisible(); }, 90);
            }, { passive: true });
        }
    }
    function currentPanel() {
        const on = pageEl && pageEl.querySelector('.apx-panel.on');
        return on ? on.id : 'apx-list-panel';
    }

    function open() {
        build();
        applyOn();
        renderMainPage();
        showPanel('apx-list-panel');
        pageEl.classList.add('open');
    }
    function close() {
        if (pageEl) pageEl.classList.remove('open');
    }
    function isOpen() { return !!(pageEl && pageEl.classList.contains('open')); }

    window.APetX = {
        open, close, isOpen,
        MOOD, MINI, JOBS, PX, EMOTE, ISLAND, ALL, BYKEY, STATES,
        cfg, save, pickFor, rollFor, nameOf,
        pxSprite, pxReplay, renderMainPage, renderCfg, renderPick, openOne,
        boot, petSet, petShow, buildPet, applyOn, applyScope,
    };
})();
