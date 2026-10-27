// 开屏文案默认值
// 宿主（美化设置）和开屏 iframe 都会加载这个文件，改默认文案只改这里。
window.MistSplashDefaults = {
  quotes: [
    "起雾了。\n你在玻璃那边，我在这边。",
    "Fog keeps every hand that touched it,\nand lets go when no one looks.",
    "擦开一点，就多一点光；\n再擦一点，就看见外面在下雨。",
    "有些东西不必看得太清楚。隔着一层雾，屋檐是软的，路灯是圆的，连走过的陌生人都像认识了很久。等雾真散了，反倒什么都硬起来——所以我只擦开一小块，刚好够看见你。",
    "雨停很久了，窗上还在滴。",
    "All night the rain writes on the glass.\nBy morning it is wiped clean.",
    "把手放上来。\n你会发现我这边，也是凉的。"
  ],
  introEn: "TOUCH THE GLASS.",
  introCn: "用手指擦开这层雾。",
  title: "Mist"
};

// splash.js 实际读取的数组（config.js 会在它之后按用户设置覆盖）
window.MistSplashQuotes = window.MistSplashDefaults.quotes.slice();
