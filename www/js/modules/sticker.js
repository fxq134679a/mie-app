// --- 表情包管理 (js/modules/sticker.js) ---

// 颜文字数据
const KAOMOJI_DATA = [
  {"name":"抱抱","items":["꜀(˘꒳˘ ꜀)","(っ꒪ཀ꒪)っ","꜀(^. .^꜀  )꜆੭","─=≡Σ((( つ•̀ω•́)つ"]},
  {"name":"坏","items":["(￢‿￢)","(→_→)","(◔_◔)","( ¬  ¬˶)","(￢、)"]},
  {"name":"震惊","items":["| ू•ૅω•́)ᵎᵎ","| ू•ૅω•́)ﾉ","=͟͟͞͞ʕ ⸝⸝⸝⁰ ༝ ⁰ ʔ",".(꒪꒪)？","◔‸？","(⑉0-0⑉)","=͟͟͞͞(⌓꒪*)","♡°͈▵°͈)","Σ(๑°꒳°๑)ᵎᵎ","(°ー°〃)","(๑°⌓°)","(´⊙ω⊙`)","( ゜- ゜)つロ","(⊙o⊙)","◍ᯅ⁰◍ .ᐟ.ᐟ","(ﾟДﾟﾟдﾟ)!?","{{(°△°; \"}}!","₍⸍•д•⸌₎","(′ʘ⌄ʘ‵)","( ˚ཫ˚ )","(◍꒳꒪◍)՞","⁉️(ᴼ ▯ᵒ◍)","(ૈ  ᵒ̌▱๋ᵒ̌ )ૈ=͟͟͞͞ ","⁽⁽◞(ͦᴗ̵̍ͦ=͟͟͞ ꒪ͦᴗ̵̍꒪ͦ)◟⁾⁾"]},
  {"name":"迷惑","items":["(˘•ω•˘ )？","( ´◔ ‸◔')"]},
  {"name":"无奈","items":["╮( •́ω•̀ )╭","(-ι_- )","(´-﹏-`；)"]},
  {"name":"尴尬","items":["(•́ω•̀ ٥)","⦁֊⦁꧞","(´･ω･`)"]},
  {"name":"冷脸萌","items":["(ㅍ_ㅍ)","(•̅灬•̅ )","(҂`･ｪ･´)","՞˶･֊･˶՞","(⩌⩌)","(ᐡ.ᯣกᐡ)","( ˶˙ ᴥ ˙ )","՞⩌⩌՞","ᗜ - ᗜ","=⩌⩊=","( ᓀ◞ᓂ..)","Ծ‸Ծ","(ᯣ_ᯣ)","(눈_눈)"]},
  {"name":"亲亲","items":["( ˘ ³˘)","(づ￣ ³￣)づ～","❤´｀","(๑˘ ³๑)♡","( ˘ ³˘)〜♡〜(˘ε˘ )","(⸝⸝> 3( / _ ᖛ )","(  ^   )ε・ )","(⸝> ૩(>_<⸝⸝)","(ˆ⸝> ꇴ <ˆ)ε <⸝⸝ˆ)",":(っ´ᾥ´)`ᾥ´c):","( ˘ ³˘))`꒳' 𓂂)"]},
  {"name":"捂脸","items":["(っ´꒳´c)","(っ˘ω˘ς )"]},
  {"name":"害羞","items":["꒰⌗´͈ ᵕ `͈⌗꒱","(ᐥᐜᐥ)♡︎ᐝ","₍⸝⸝•ω•⸝⸝ᐢ","(՞,,⁃  ⁃,,՞)","すき (◍ˊ⩊ˋ◍)","(● ˘∇ ˘●)","(＊❛ω❛＊)","( ᵔ ᗜ ᵔ˶ )","(•́⌄•́)૭✧","૮ྀི⸝⸝ɞ̴̶̷ ·̫ ⸝⸝꒱ྀིა","(ꈍꈍ","♪ *ꈍꈍ)ﾉ","ʕ ⸝⸝⁰⃙̴ ༝ ⃚⃙̴ ʔ","ʕ ⸝⸝⸝⁰ ༝ ⁰ ʔ","ʕ ⸝⸝⸝ ༝ ⁰ ⸝ʔ","(⸝⸝ ╸▵╺⸝⸝)⋆⁺₊⋆","૮(˶ᵔ ᵕ ᵔ)ა","( ´͈  `͈ )◞","*͈͈ˬᴗ͈ෆ","(˶ᵔ ᵕ ˶)"]},
  {"name":"馋","items":["～(￣▽￣～)","(っ˘﹃˘ς)","( ﹃¯ )♡","ˊᜊˋ˶","⸝⸝''⸝⸝՞","(⁎⁍̴̀﹃̴́⁎)","(◍´△`◍)","(◍´O`◍)"]},
  {"name":"严肃","items":["(⑉･̆-･̆⑉)"]},
  {"name":"伤心","items":["(ˆт · тˆ)","(īī ^ īī)","( ˘̩̩ε˘̩ƪ)","(  ⩌⤚⩌ )","/ᐠ> ˕ <マ੭","(｡•́_ก̀｡)","(⸝⸝><⸝⸝)","(っ ̯ -｡)","ˆɞ̴̶̷ . ̴̶̷𓂂 ིྀིྀིི","˃̣̣ก","ᵕ᷄≀ ̠ᵕ᷅","‎꒰ᐢ ｡> ༝ ก ᐢ ꒱","˰̮⛻̴⃠⸝⸝̼⸝֪⛻̴⃠︣","(ᵒ̴̶̷̥́ _ ᵒ̴̶̷̣̥̀)","꧞  ꧞"]},
  {"name":"傲娇","items":["o(´^｀)o"]},
  {"name":"失落","items":["₍ᐢ๑ ̯ᐢ₎"]},
  {"name":"不高兴","items":["๑'~'๑","(▼ヘ▼#)","(‸↼‶)","(๑᷅^‾᷅๑)","(ㅎ‸ㅎ).ᐟ.ᐟ","⦕(>ロ<)⦖","૮₍。·· 。₎ა","૮ - ⤙ - ₎ა","₍ ˃ ⤙ ˂ ₎ა.","(◦`~´◦)","(ྀི･̆･̆⌯)ྀི","-᷅ ⤙ -᷄","(๑`^´๑)"]},
  {"name":"卖萌","items":["ʕ ྀི . . . ིʔᜊ","- ̗̀ʚ ๑'~'๑ ɞ  ̖́-","˚₊*(ˊo̶̶̷̤ . o̴̶̷̤ॢ)*₊˚","(`•ө•´◍)","(･∞･ﾐэ )Э",".+°⊹⁺˖໋⸝⸝  𑣧⃙̴ཻ꙯⃩⃔͡᷍ ⸝𑌻̢⸝̠⸝⃬⸝ ⃙̴ཻ̑⃩⃔⃕᷍ ⸝⸝ ᩚ ˖ᕀ̑⸝͂˖໋̟","ᜊ(♡ ¯꒳​¯ )","ᜊ( ´꒳` )ᜊ","૮꒰ • ༝ •˶꒱ა ♡","⊹⁺˖໋̟⸝⸝  𑣧⃙̴ཻ꙯⃩⃔͡᷍ ⸝𑌻̢⸝̠⸝⃬⸝ ⃙̴ཻ̑⃩⃔⃕᷍ ⸝⸝ ᩚ ˖ᕀ̑⸝͂˖⁺໋̟⊹","⁺ꉂ  ᳐˶ᵒ ᵕ ˂˶  ᳐ฅ໑ ₊","꒰ঌ⌯'ᵕ'⌯໒","(。•̀ᴗ-)✧","₍՞˶⦁⦁˶՞₎੭ﾞ","𖦹‎´༥`𖦹‎."]},
  {"name":"猫咪","items":["ꉂ ･ ･ ིྀ","ꉂ ᳐˶ ᵕ ˂˶ ฅ","ᓚᘏ","(ᐡ⦁⩊⦁⸝⸝ᐡ )₊୭","^⌯⌯^ ੭","^.  ̫ .^","（𓐍ˊˋ𓐍） ﾞ","₍˄·͈༝·͈˄*₎ ̑̑","₍˄·͈༝·͈˄₎","≽^⦁𖥦^ ≼🐾","^𖥦⌯^ ི","^ ̳- ̫ • ̳^ฅ","^•𐃷•^ฅ","⦮_  ̫ _","^_   ̫  _ ̥`","ฅ՞••՞ฅ"]},
  {"name":"睡觉","items":["ʢᴗ.ᴗʡᶻ","(՞_  ̫ _՞)ᐝ","(´-ωก`)☡z","≡( ε:)","z ₍^_    _^₎","^_   ̫  _ ̥`"," _   ̫  _  ੭"]},
  {"name":"双人","items":["(′。-ω(-ω-。`)","(ˆ .  ̫ . ).  ̫ . ꜀ˆ)","(/^-^(^ ^*)/","ɷ(   ᳐⊃⦁⦁ )⦁⩊ ⊂  ᳐ )","(ᐡ´• ·̫•)ﾉ(-‧̫ -`)","( U - ·̫ - )ﾉ( •̥ ·̫ •̥Ｕ )","꒰ U - ·̫ - ꒱ﾉ꒰ •̥ · •̥Ｕ ꒱","( - ·̫ - )ﾉ( •̥ ·̫ •̥ )","( ᵕ ⸝⸝- · - )ﾉ( •̥ · •̥⸝ ᵕ )♡","( U⩌⩊)ﾉ( ᴛ ω ᴛＵ )","(  '-' )ノ('ᴗ' Ｕ)","( ू•ૅω•́)ﾉ(ᵒ̴̶̷̥́ _ ᵒ̴̶̷̥̀)","ʕ՞˃ ꇴ ˂˶ ིʔﾉ( ᵒ̴̶̷̥́ _ ᵒ̴̶̷̣̥̀ )","( ᵒ̴̶̷́ _ ᵒ̴̶̷̣̥̀ )꜆੭=͟͟͞͞  (՞˶˃ ꇴ ˂˶ ྀིԅ)","( ・▽・)>♡<( ・▽ ・ )","(ㆆ⩊ㆆ)♡ (⎚灬⎚)","(´･･)ﾉ(._.`)","(╯‵□′)╯︵ /(.□ . \\)","‎⊹ ｡*₍ᐢ .  ̫.ᐢ₎ ₍ᐢ. ̫ .⑅ᐢ₎⊹ ･｡",".°⑅ପ₍ᐢ｡•༝•｡ᐢ₎₍ᐢ｡•༝•｡ᐢ₎ଓ°."]},
  {"name":"丑陋","items":["༼´༎ຶ𓂏༎ຶ༽","（༎ຶ-༎ຶ）","ꈨຶꎁຶ","(;´༎ຶД༎ຶ`)","༎ຶ༎ຶ","(;´༎༎ຶ`)","༼༎ຶ෴༎ຶ","（𓁹𓁹）","༼;´༎ຶ   ༎ຶ","༗.̫̮ ༗","𓃟❤︎","༼༎ຶ_༎ຶ༽ᕗ","（𓁹𓁹)","༼   ༎ຶ ෴ ༎ຶ༽","( ఠൠఠ )ﾉ","༼   ༎ຶ༎ຶ༽","༼ ༎ຶ ෴ ༎ຶ༽","༼    *꒪ั꒪ั*༽༽༾","(◉◞હ̱◟◉)༿"]}
];

// 颜文字正式存在 db.kaomojiData 里（用户可增删），上面那份只是第一次进来时的出厂种子
function kaoList() {
    if (!Array.isArray(db.kaomojiData) || db.kaomojiData.length === 0) {
        db.kaomojiData = KAOMOJI_DATA.map(k => ({ name: k.name, items: [...k.items] }));
    }
    return db.kaomojiData;
}

// 一条颜文字可以是纯文本，也可以是 { d: 描述, t: 文本 }
function kaoText(x) { return (x && typeof x === 'object') ? String(x.t || '') : String(x == null ? '' : x); }
function kaoDesc(x) { return (x && typeof x === 'object') ? String(x.d || '') : ''; }

function saveKaomoji() {
    try { saveData(); } catch (e) { /* 存不上也不影响当前会话 */ }
}

// 全部分类打散混在一起
function kaoAllMixed() {
    const out = [];
    kaoList().forEach(k => k.items.forEach(t => out.push(kaoText(t))));
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

let currentKaomojiCat = -1;   // -1 = 随机混排，其余为 kaoList() 下标
let kaomojiMixedPool = [];    // 随机顺序定一次，翻列表时不会自己跳

function refreshKaomojiPool() {
    kaomojiMixedPool = kaoAllMixed();
}

function kaomojiItemsToShow() {
    if (currentKaomojiCat === -1) {
        if (!kaomojiMixedPool.length) refreshKaomojiPool();
        return kaomojiMixedPool;
    }
    const cat = kaoList()[currentKaomojiCat];
    return cat ? cat.items.map(kaoText) : [];
}

async function setupStickerSystem() {
    const categoryBar = document.getElementById('sticker-category-bar');
    const stickerToggleBtn = document.getElementById('sticker-toggle-btn');

    categoryBar.addEventListener('click', (e) => {
        const chip = e.target.closest('.sticker-category-item');
        if (!chip) return;
        const id = chip.dataset.category;

        // 已经停在「颜文字」上再点一次 = 弹分类；从别的分类切过来则是随机混排全部
        if (id === 'kaomoji' && currentStickerCategory === 'kaomoji') {
            if (kaoPopIsOpen()) closeKaomojiPopup();
            else openKaomojiPopup(chip);
            return;
        }
        closeKaomojiPopup();
        currentStickerCategory = id;
        if (id === 'kaomoji') currentKaomojiCat = -1;
        renderStickerCategories();
        renderStickerGrid();
    });

    stickerToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const msgInput = document.getElementById('message-input');
        const isKeyboardOpen = (document.activeElement === msgInput);

        if (msgInput) msgInput.blur(); // 强制收起键盘

        if (isKeyboardOpen) {
             // 键盘 -> 面板：无动画
             showPanel('sticker', true);
        } else {
            if (chatExpansionPanel.classList.contains('visible') && panelStickerArea.style.display !== 'none') {
                showPanel('none'); // 面板 -> 关闭：默认有动画
            } else {
                // 关闭 -> 面板 或 面板(功能) -> 面板(表情)：默认有动画
                showPanel('sticker');
            }
        }
    });
}

// —— 颜文字分类浮层（贴在面板上方，液态玻璃）——
let kaoPop = null;
let kaoPopBackdrop = null;

function kaoPopIsOpen() {
    return !!(kaoPop && kaoPop.classList.contains('open'));
}

function kaoCountTotal() {
    return kaoList().reduce((n, k) => n + k.items.length, 0);
}

function kaoPopChip(text, count) {
    const btn = document.createElement('button');
    btn.className = 'kao-pop-chip';
    const name = document.createElement('span');
    name.textContent = text;
    const num = document.createElement('em');
    num.textContent = count;
    btn.appendChild(name);
    btn.appendChild(num);
    return btn;
}

function fillKaomojiPopup() {
    const chips = kaoPop.querySelector('.kao-pop-chips');
    chips.innerHTML = '';

    const mixed = kaoPopChip('全部', kaoCountTotal());
    if (currentKaomojiCat === -1) mixed.classList.add('on');
    mixed.addEventListener('click', () => {
        currentKaomojiCat = -1;
        refreshKaomojiPool();
        closeKaomojiPopup();
        renderStickerGrid();
    });
    chips.appendChild(mixed);

    kaoList().forEach((cat, idx) => {
        const btn = kaoPopChip(cat.name, cat.items.length);
        if (currentKaomojiCat === idx) btn.classList.add('on');
        btn.addEventListener('click', () => {
            currentKaomojiCat = idx;
            closeKaomojiPopup();
            renderStickerGrid();
        });
        chips.appendChild(btn);
    });
}

function createKaomojiPopup() {
    kaoPopBackdrop = document.createElement('div');
    kaoPopBackdrop.className = 'kao-pop-backdrop';
    kaoPopBackdrop.addEventListener('click', closeKaomojiPopup);

    kaoPop = document.createElement('div');
    kaoPop.className = 'kao-pop';

    const title = document.createElement('div');
    title.className = 'kao-pop-title';
    title.textContent = '颜文字分类';
    kaoPop.appendChild(title);

    const chips = document.createElement('div');
    chips.className = 'kao-pop-chips';
    kaoPop.appendChild(chips);

    document.body.appendChild(kaoPopBackdrop);
    document.body.appendChild(kaoPop);
}

function openKaomojiPopup(anchor) {
    const bar = document.getElementById('sticker-category-bar');
    if (!bar) return;
    if (!kaoPop) createKaomojiPopup();
    fillKaomojiPopup();

    const barRect = bar.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(barRect.width - 24, 220), 330);
    let left = barRect.left + 12;
    if (left + width > window.innerWidth - 10) left = Math.max(10, window.innerWidth - 10 - width);

    kaoPop.style.width = width + 'px';
    kaoPop.style.left = left + 'px';
    kaoPop.style.bottom = (window.innerHeight - barRect.top + 10) + 'px';
    kaoPop.style.setProperty('--kao-arrow-x', Math.round(anchorRect.left + anchorRect.width / 2 - left) + 'px');

    kaoPopBackdrop.classList.add('open');
    kaoPop.classList.add('open');
}

function closeKaomojiPopup() {
    if (!kaoPop) return;
    kaoPop.classList.remove('open');
    kaoPopBackdrop.classList.remove('open');
}

function renderStickerCategories() {
    const bar = document.getElementById('sticker-category-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const groups = [...new Set(db.myStickers.map(s => s.group).filter(g => g))];

    const categories = [
        { id: 'kaomoji', name: '颜文字' },
        { id: 'all', name: '全部' },
        ...groups.map(g => ({ id: g, name: g })),
        { id: 'ungrouped', name: '未分类' }
    ];

    if (!categories.some(c => c.id === currentStickerCategory)) currentStickerCategory = 'all';

    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = `sticker-category-item ${currentStickerCategory === cat.id ? 'active' : ''}`;
        item.textContent = cat.name;
        item.dataset.category = cat.id;
        bar.appendChild(item);
    });
}

function renderStickerGrid() {
    const container = document.getElementById('sticker-grid-container');
    if (!container) return;
    container.innerHTML = '';

    if (currentStickerCategory === 'kaomoji') {
        container.className = 'sticker-grid kao';

        const items = kaomojiItemsToShow();
        const line = document.createElement('div');
        line.className = 'kao-mode-line';
        const text = document.createElement('span');
        text.textContent = currentKaomojiCat === -1
            ? '全部'
            : ((kaoList()[currentKaomojiCat] || {}).name || '该分类');
        line.appendChild(text);
        container.appendChild(line);

        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'sticker-empty';
            empty.textContent = '这一类还没有颜文字';
            container.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'kaomoji-grid';
        items.forEach(k => {
            const item = document.createElement('button');
            item.className = 'kaomoji-item';
            item.textContent = k;
            item.addEventListener('click', () => {
                const input = document.getElementById('message-input');
                if (!input) return;
                const start = input.selectionStart || 0;
                const end = input.selectionEnd || 0;
                const value = input.value;
                input.value = value.substring(0, start) + k + value.substring(end);
                input.selectionStart = input.selectionEnd = start + k.length;
                input.focus();
            });
            grid.appendChild(item);
        });
        container.appendChild(grid);
        return;
    }

    container.className = 'sticker-grid';

    let stickersToShow = [];
    if (currentStickerCategory === 'all') {
        stickersToShow = [...db.myStickers];
    } else if (currentStickerCategory === 'ungrouped') {
        stickersToShow = db.myStickers.filter(s => !s.group);
    } else {
        stickersToShow = db.myStickers.filter(s => s.group === currentStickerCategory);
    }

    if (stickersToShow.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'sticker-empty';
        empty.textContent = '这一组还没有表情';
        container.appendChild(empty);
        return;
    }

    stickersToShow.forEach(sticker => {
        const item = document.createElement('div');
        item.className = 'sticker-item';

        const img = document.createElement('img');
        img.src = sticker.data;
        img.alt = sticker.name;
        const name = document.createElement('span');
        name.className = 'sticker-item-name';
        name.textContent = sticker.name;

        item.appendChild(img);
        item.appendChild(name);
        item.addEventListener('click', () => sendSticker(sticker));
        container.appendChild(item);
    });
}


// 「更多 · 表情包」页改完数据后叫一下，面板这边跟着刷新
window.MieStickerPanel = {
    refreshStickers() {
        closeKaomojiPopup();
        renderStickerCategories();
        renderStickerGrid();
    },
    refreshKaomoji() {
        currentKaomojiCat = -1;
        refreshKaomojiPool();
        closeKaomojiPopup();
        renderStickerGrid();
    }
};

async function sendSticker(sticker) {
    const dbSticker = db.myStickers.find(s => s.id === sticker.id);
    if (dbSticker) {
        dbSticker.lastUsedTime = Date.now();
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
    
    const messageContentForAI = `[${myName}发送的表情包：${sticker.name}]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageContentForAI,
        parts: [{type: 'text', text: messageContentForAI}],
        timestamp: Date.now(),
        stickerData: sticker.data 
    };
    if (currentChatType === 'group') {
        message.senderId = 'user_me';
    }
    chat.history.push(message);
    addMessageBubble(message, currentChatId, currentChatType);
    
    await saveData(); 
    renderChatList();
    
    showPanel('none');
}
