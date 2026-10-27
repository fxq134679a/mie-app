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

let currentKaomojiSubCategory = 0;

async function setupStickerSystem() {
    const stickerMenuBtn = document.getElementById('sticker-menu-btn');
    const stickerMenuActionSheet = document.getElementById('sticker-menu-actionsheet');
    const stickerCategoryBar = document.getElementById('sticker-category-bar');
    
    const menuMultiSelectBtn = document.getElementById('menu-multi-select-btn');
    const menuBatchImportBtn = document.getElementById('menu-batch-import-btn');
    const menuAddNewBtn = document.getElementById('menu-add-new-btn');
    const menuCancelBtn = document.getElementById('menu-cancel-btn');

    const deleteSelectedStickersBtn = document.getElementById('delete-selected-stickers-btn');
    const moveStickerGroupBtn = document.getElementById('move-sticker-group-btn');
    const stickerManageBar = document.getElementById('sticker-manage-bar');
    const selectAllStickersBtn = document.getElementById('select-all-stickers-btn');

    const moveStickerModal = document.getElementById('move-sticker-modal');
    const moveTargetGroupInput = document.getElementById('move-target-group-input');
    const confirmMoveStickerBtn = document.getElementById('confirm-move-sticker-btn');
    const cancelMoveStickerBtn = document.getElementById('cancel-move-sticker-btn');
    const existingGroupsList = document.getElementById('existing-groups-list');

    const batchAddStickerModal = document.getElementById('batch-add-sticker-modal');
    const batchAddStickerForm = document.getElementById('batch-add-sticker-form');
    const stickerUrlsTextarea = document.getElementById('sticker-urls-textarea');
    const batchStickerGroupInput = document.getElementById('batch-sticker-group');
    const addStickerModal = document.getElementById('add-sticker-modal');
    const addStickerForm = document.getElementById('add-sticker-form');
    const stickerNameInput = document.getElementById('sticker-name');
    const stickerGroupInput = document.getElementById('sticker-group');
    const stickerEditIdInput = document.getElementById('sticker-edit-id');
    const stickerPreview = document.getElementById('sticker-preview');
    const stickerUrlInput = document.getElementById('sticker-url-input');
    const stickerFileUpload = document.getElementById('sticker-file-upload');
    const addStickerModalTitle = document.getElementById('add-sticker-modal-title');

    stickerMenuBtn.addEventListener('click', () => {
        if (isStickerManageMode) {
            exitStickerManageMode();
        } else {
            stickerMenuActionSheet.classList.add('visible');
        }
    });

    menuCancelBtn.addEventListener('click', () => stickerMenuActionSheet.classList.remove('visible'));

    const menuAddKaomojiBtn = document.getElementById('menu-add-kaomoji-btn');
    const menuManageKaomojiBtn = document.getElementById('menu-manage-kaomoji-btn');
    const addKaomojiModal = document.getElementById('add-kaomoji-modal');
    const kaomojiTextInput = document.getElementById('kaomoji-text-input');
    const kaomojiCategorySelect = document.getElementById('kaomoji-category-select');
    const kaomojiNewCategoryInput = document.getElementById('kaomoji-new-category-input');
    const cancelAddKaomojiBtn = document.getElementById('cancel-add-kaomoji-btn');
    const confirmAddKaomojiBtn = document.getElementById('confirm-add-kaomoji-btn');
    const manageKaomojiModal = document.getElementById('manage-kaomoji-modal');
    const kaomojiManageList = document.getElementById('kaomoji-manage-list');
    const closeManageKaomojiBtn = document.getElementById('close-manage-kaomoji-btn');

    menuAddKaomojiBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        kaomojiTextInput.value = '';
        kaomojiNewCategoryInput.value = '';
        kaomojiCategorySelect.innerHTML = '';
        KAOMOJI_DATA.forEach((kao, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${kao.name} (${kao.items.length})`;
            kaomojiCategorySelect.appendChild(opt);
        });
        addKaomojiModal.classList.add('visible');
    });

    cancelAddKaomojiBtn.addEventListener('click', () => addKaomojiModal.classList.remove('visible'));

    confirmAddKaomojiBtn.addEventListener('click', () => {
        const text = kaomojiTextInput.value.trim();
        if (!text) return showToast('请输入颜文字内容');
        const newCatName = kaomojiNewCategoryInput.value.trim();
        if (newCatName) {
            KAOMOJI_DATA.push({ name: newCatName, items: [text] });
            showToast(`已添加到新分类「${newCatName}」`);
        } else {
            const idx = parseInt(kaomojiCategorySelect.value);
            if (isNaN(idx) || !KAOMOJI_DATA[idx]) return showToast('请选择分类');
            KAOMOJI_DATA[idx].items.push(text);
            showToast(`已添加到「${KAOMOJI_DATA[idx].name}」`);
        }
        addKaomojiModal.classList.remove('visible');
        if (currentStickerCategory === 'kaomoji') renderStickerGrid();
    });

    menuManageKaomojiBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        renderKaomojiManageList();
        manageKaomojiModal.classList.add('visible');
    });

    closeManageKaomojiBtn.addEventListener('click', () => {
        manageKaomojiModal.classList.remove('visible');
        if (currentStickerCategory === 'kaomoji') renderStickerGrid();
    });

    function renderKaomojiManageList() {
        kaomojiManageList.innerHTML = '';
        KAOMOJI_DATA.forEach((kao, catIdx) => {
            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom:12px; border:1px solid #eee; border-radius:10px; overflow:hidden;';
            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#f8f8f8; font-weight:600; font-size:14px;';
            header.innerHTML = `<span>${kao.name} (${kao.items.length})</span>`;
            const delCatBtn = document.createElement('button');
            delCatBtn.textContent = '删除分类';
            delCatBtn.style.cssText = 'font-size:12px; color:#e53935; background:none; border:none; cursor:pointer;';
            delCatBtn.addEventListener('click', () => {
                if (confirm(`确定删除分类「${kao.name}」及其所有颜文字吗？`)) {
                    KAOMOJI_DATA.splice(catIdx, 1);
                    renderKaomojiManageList();
                    showToast('分类已删除');
                }
            });
            header.appendChild(delCatBtn);
            section.appendChild(header);

            const itemContainer = document.createElement('div');
            kao.items.forEach((item, itemIdx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-top:1px solid #f0f0f0; font-size:13px;';
                const textSpan = document.createElement('span');
                textSpan.textContent = item;
                textSpan.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;';
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display:flex; gap:8px; flex-shrink:0;';
                const upBtn = document.createElement('button');
                upBtn.textContent = '↑';
                upBtn.style.cssText = 'font-size:14px; color:#666; background:none; border:none; cursor:pointer; padding:2px 6px;';
                upBtn.disabled = itemIdx === 0;
                upBtn.addEventListener('click', () => {
                    [kao.items[itemIdx], kao.items[itemIdx - 1]] = [kao.items[itemIdx - 1], kao.items[itemIdx]];
                    renderKaomojiManageList();
                });
                const downBtn = document.createElement('button');
                downBtn.textContent = '↓';
                downBtn.style.cssText = 'font-size:14px; color:#666; background:none; border:none; cursor:pointer; padding:2px 6px;';
                downBtn.disabled = itemIdx === kao.items.length - 1;
                downBtn.addEventListener('click', () => {
                    [kao.items[itemIdx], kao.items[itemIdx + 1]] = [kao.items[itemIdx + 1], kao.items[itemIdx]];
                    renderKaomojiManageList();
                });
                const delBtn = document.createElement('button');
                delBtn.textContent = '删除';
                delBtn.style.cssText = 'font-size:12px; color:#e53935; background:none; border:none; cursor:pointer; padding:2px 6px;';
                delBtn.addEventListener('click', () => {
                    kao.items.splice(itemIdx, 1);
                    renderKaomojiManageList();
                });
                btnGroup.appendChild(upBtn);
                btnGroup.appendChild(downBtn);
                btnGroup.appendChild(delBtn);
                row.appendChild(textSpan);
                row.appendChild(btnGroup);
                itemContainer.appendChild(row);
            });
            section.appendChild(itemContainer);
            kaomojiManageList.appendChild(section);
        });
    }

    menuMultiSelectBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        enterStickerManageMode();
    });

    function enterStickerManageMode() {
        isStickerManageMode = true;
        stickerManageBar.style.display = 'block';
        
        stickerMenuBtn.innerHTML = '<span style="font-size:14px; font-weight:bold; color:var(--primary-color);">完成</span>';
        selectedStickerIds.clear();
        updateStickerSelectCount();
        renderStickerGrid(); 
    }

    function exitStickerManageMode() {
        isStickerManageMode = false;
        stickerManageBar.style.display = 'none';
        
        stickerMenuBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" /></svg>';
        selectedStickerIds.clear();
        renderStickerGrid();
    }

    function updateStickerSelectCount() {
        const count = selectedStickerIds.size;
        document.getElementById('sticker-select-count').textContent = `已选 ${count} 项`;
        deleteSelectedStickersBtn.disabled = count === 0;
        moveStickerGroupBtn.disabled = count === 0;
    }

    menuBatchImportBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        batchAddStickerModal.classList.add('visible');
        stickerUrlsTextarea.value = '';
        batchStickerGroupInput.value = '';
    });

    menuAddNewBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        addStickerModalTitle.textContent = '添加新表情';
        addStickerForm.reset();
        stickerEditIdInput.value = '';
        stickerPreview.innerHTML = '<span>预览</span>';
        stickerUrlInput.disabled = false;
        addStickerModal.classList.add('visible');
    });

    selectAllStickersBtn.addEventListener('click', () => {
        let stickersToSelect = [];
        
        if (currentStickerCategory === 'recent') {
            stickersToSelect = [...db.myStickers]
                .sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0))
                .slice(0, 20);
        } else if (currentStickerCategory === 'all') {
            stickersToSelect = [...db.myStickers];
        } else if (currentStickerCategory === 'ungrouped') {
            stickersToSelect = db.myStickers.filter(s => !s.group);
        } else {
            stickersToSelect = db.myStickers.filter(s => s.group === currentStickerCategory);
        }

        stickersToSelect.forEach(s => selectedStickerIds.add(s.id));
        
        updateStickerSelectCount();
        renderStickerGrid();
        showToast(`已全选当前分组 ${stickersToSelect.length} 个表情`);
    });

    deleteSelectedStickersBtn.addEventListener('click', async () => {
        if (selectedStickerIds.size === 0) return;
        if (confirm(`确定要删除这 ${selectedStickerIds.size} 个表情吗？`)) {
            const idsToDelete = Array.from(selectedStickerIds);

            await dexieDB.myStickers.bulkDelete(idsToDelete);

            db.myStickers = db.myStickers.filter(s => !selectedStickerIds.has(s.id));
            
            await saveData();
            
            showToast('表情已彻底删除');
            exitStickerManageMode();
        }
    });

    moveStickerGroupBtn.addEventListener('click', () => {
        existingGroupsList.innerHTML = '';
        const groups = [...new Set(db.myStickers.map(s => s.group).filter(g => g))];
        groups.forEach(g => {
            const option = document.createElement('option');
            option.value = g;
            existingGroupsList.appendChild(option);
        });
        
        moveTargetGroupInput.value = '';
        moveStickerModal.classList.add('visible');
    });

    cancelMoveStickerBtn.addEventListener('click', () => moveStickerModal.classList.remove('visible'));

    confirmMoveStickerBtn.addEventListener('click', async () => {
        const newGroup = moveTargetGroupInput.value.trim();
        
        db.myStickers.forEach(s => {
            if (selectedStickerIds.has(s.id)) {
                s.group = newGroup;
            }
        });
        
        await saveData();
        showToast('分组已更新');
        moveStickerModal.classList.remove('visible');
        exitStickerManageMode();
        renderStickerCategories();
        renderKaomojiSubBar();
        renderStickerGrid();
    });

    stickerCategoryBar.addEventListener('click', (e) => {
        const item = e.target.closest('.sticker-category-item');
        if (item) {
            currentStickerCategory = item.dataset.category;
            if (currentStickerCategory === 'kaomoji') {
                currentKaomojiSubCategory = 0;
            }
            renderStickerCategories();
            renderKaomojiSubBar();
            renderStickerGrid(); 
        }
    });

    batchAddStickerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textInput = stickerUrlsTextarea.value.trim();
        const groupName = batchStickerGroupInput.value.trim();
        if (!textInput) return showToast('请输入数据');
        const lines = textInput.split('\n');
        const newStickers = [];
        for (const line of lines) {
            let trimmedLine = line.trim().replace('：', ':');
            if (!trimmedLine) continue;
            const colonIndex = trimmedLine.indexOf(':');
            if (colonIndex <= 0) continue;
            const name = trimmedLine.substring(0, colonIndex).trim();
            const url = trimmedLine.substring(colonIndex + 1).trim();
            if (name && url.startsWith('http')) {
                newStickers.push({
                    id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: name,
                    data: url,
                    group: groupName,
                    lastUsedTime: Date.now() 
                });
            }
        }
        if (newStickers.length > 0) {
            db.myStickers.push(...newStickers);
            await saveData();
            batchAddStickerModal.classList.remove('visible');
            showToast(`导入 ${newStickers.length} 个表情`);
            renderStickerCategories();
            renderKaomojiSubBar();
            renderStickerGrid();
        } else {
            showToast('格式错误');
        }
    });

    addStickerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = stickerNameInput.value.trim();
        const group = stickerGroupInput.value.trim();
        const id = stickerEditIdInput.value;
        const previewImg = stickerPreview.querySelector('img');
        const data = previewImg ? previewImg.src : null;
        if (!name || !data) return showToast('请填写完整');
        
        const stickerData = { name, data, group, lastUsedTime: Date.now() };
        
        if (id) {
            const index = db.myStickers.findIndex(s => s.id === id);
            if (index > -1) db.myStickers[index] = { ...db.myStickers[index], ...stickerData };
        } else {
            stickerData.id = `sticker_${Date.now()}`;
            db.myStickers.push(stickerData);
        }
        await saveData();
        addStickerModal.classList.remove('visible');
        showToast('保存成功');
        renderStickerCategories();
        renderKaomojiSubBar();
        renderStickerGrid();
    });
    
    stickerUrlInput.addEventListener('input', (e) => {
        stickerPreview.innerHTML = `<img src="${e.target.value}" alt="预览">`;
        stickerFileUpload.value = '';
    });
    stickerFileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 200, maxHeight: 200});
                stickerPreview.innerHTML = `<img src="${compressedUrl}" alt="预览">`;
                stickerUrlInput.value = '';
                stickerUrlInput.disabled = true;
            } catch (error) {
                showToast('压缩失败');
            }
        }
    });

    const stickerToggleBtn = document.getElementById('sticker-toggle-btn');
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

function renderStickerCategories() {
    const bar = document.getElementById('sticker-category-bar');
    bar.innerHTML = '';

    const groups = [...new Set(db.myStickers.map(s => s.group).filter(g => g))];
    
    const categories = [
        { id: 'kaomoji', name: '颜文字' },
        { id: 'recent', name: '最近使用' },
        { id: 'all', name: '全部' },
        ...groups.map(g => ({ id: g, name: g })),
        { id: 'ungrouped', name: '未分类' }
    ];

    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = `sticker-category-item ${currentStickerCategory === cat.id ? 'active' : ''}`;
        item.textContent = cat.name;
        item.dataset.category = cat.id;
        bar.appendChild(item);
    });
}

function renderKaomojiSubBar() {
    const subBar = document.getElementById('kaomoji-sub-bar');
    if (currentStickerCategory !== 'kaomoji') {
        subBar.style.display = 'none';
        return;
    }
    subBar.style.display = 'flex';
    subBar.innerHTML = '';
    KAOMOJI_DATA.forEach((kao, idx) => {
        const pill = document.createElement('div');
        pill.className = `kaomoji-sub-pill ${currentKaomojiSubCategory === idx ? 'active' : ''}`;
        pill.textContent = kao.name;
        pill.addEventListener('click', () => {
            currentKaomojiSubCategory = idx;
            renderKaomojiSubBar();
            renderStickerGrid();
        });
        subBar.appendChild(pill);
    });
}

function renderStickerGrid() {
    const container = document.getElementById('sticker-grid-container');
    container.innerHTML = '';

    let stickersToShow = [];
    let isKaomoji = false;

    if (currentStickerCategory === 'kaomoji') {
        isKaomoji = true;
        container.style.display = 'block';
        container.style.padding = '4px 0';
        const kao = KAOMOJI_DATA[currentKaomojiSubCategory];
        if (!kao || kao.items.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; padding:20px;">该分类下没有颜文字</p>';
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'kaomoji-grid';
        kao.items.forEach(k => {
            const item = document.createElement('button');
            item.className = 'kaomoji-item';
            item.textContent = k;
            item.addEventListener('click', () => {
                const input = document.getElementById('message-input');
                if (input) {
                    const start = input.selectionStart || 0;
                    const end = input.selectionEnd || 0;
                    const text = input.value;
                    input.value = text.substring(0, start) + k + text.substring(end);
                    input.selectionStart = input.selectionEnd = start + k.length;
                    input.focus();
                }
            });
            grid.appendChild(item);
        });
        container.appendChild(grid);
        return;
    } else if (currentStickerCategory === 'recent') {
        container.style.display = '';
        container.style.padding = '';
        stickersToShow = [...db.myStickers]
            .sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0))
            .slice(0, 20);
        if (stickersToShow.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">还没有使用过表情包哦</p>';
            return;
        }
    } else if (currentStickerCategory === 'all') {
        stickersToShow = [...db.myStickers];
    } else if (currentStickerCategory === 'ungrouped') {
        stickersToShow = db.myStickers.filter(s => !s.group);
    } else {
        stickersToShow = db.myStickers.filter(s => s.group === currentStickerCategory);
    }

    if (stickersToShow.length === 0) {
        container.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">该分组下没有表情</p>';
        return;
    }

    stickersToShow.forEach(sticker => {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        
        if (isStickerManageMode) {
            item.classList.add('is-managing');
            if (selectedStickerIds.has(sticker.id)) {
                item.classList.add('is-selected');
            }
        }
        
        item.innerHTML = `<img src="${sticker.data}" alt="${sticker.name}"><span style="font-size:10px; margin-top:4px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; text-align:center;">${sticker.name}</span>`;

        item.addEventListener('click', () => {
            if (isStickerManageMode) {
                if (selectedStickerIds.has(sticker.id)) {
                    selectedStickerIds.delete(sticker.id);
                    item.classList.remove('is-selected');
                } else {
                    selectedStickerIds.add(sticker.id);
                    item.classList.add('is-selected');
                }
                const count = selectedStickerIds.size;
                document.getElementById('sticker-select-count').textContent = `已选 ${count} 项`;
                document.getElementById('delete-selected-stickers-btn').disabled = count === 0;
                document.getElementById('move-sticker-group-btn').disabled = count === 0;
            } else {
                sendSticker(sticker);
            }
        });

        container.appendChild(item);
    });
}

function handleStickerLongPress(stickerId) {
    if (isStickerManageMode) return;
    clearTimeout(longPressTimer);
    currentStickerActionTarget = stickerId;
    document.getElementById('sticker-actionsheet').classList.add('visible');
}

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
