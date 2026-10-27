# 开屏动画（Mist · 擦雾水波）

这是 `index.html` 打开时显示的全屏开屏页：手指/鼠标划过可以擦掉薄雾、推开水面；**默认停留 7 秒后自动淡出**，点右下角 `ENTER` 可以提前结束。

素材与效果来自 [eveninwinter/mist](https://github.com/eveninwinter/mist)，许可见 `LICENSE.txt`（仅限个人、学习、非商业用途）。字体许可见 `THIRD_PARTY_NOTICES.md`。

## 在应用里改（推荐）

打开 **美化 → 开屏动画**，可以：

- 关闭/开启开屏动画
- 调整停留时间（3–20 秒，默认 7 秒）
- 修改开屏文字：
  - 擦开后显示的文字（空一行分一段，最多 12 段）
  - 左上角英文/中文提示
  - 手写标题（建议英文，留空则不显示）
- 上传自己的背景图（自动压缩成本地 JPEG，擦雾和水波效果全部保留）
- 恢复默认背景 / 恢复默认文字
- 点「预览开屏」立即查看，不用重启

配置存在 `localStorage` 的 `mie_splash_config_v1`：

```json
{
  "enabled": true,
  "durationMs": 7000,
  "bg": "data:image/jpeg;base64,...",
  "quotes": ["起雾了。\n你在玻璃那边，我在这边。", "..."],
  "introEn": "TOUCH THE GLASS.",
  "introCn": "用手指擦开这层雾。",
  "title": "Mist"
}
```

- 开屏在页面解析阶段就要启动，等不了异步的 Dexie，所以用 `localStorage`。
- 背景只接受本地上传压缩后的 `data:image/...;base64,...`；远程图片会被 CORS 弄脏画布，导致 WebGL 取不到像素。
- 文字、提示、标题都可以单独改；不想自定义时删掉对应字段或点「恢复默认文字」即可。
- 原字体是按默认文案裁的子集，**换成自定义文字后会自动改用系统衬线字体**，避免出现一半缺字一半正常的情况。
- 设置保存后，**下次打开应用生效**；「预览开屏」是立即生效的。

## 怎么接进来的

- 宿主 `index.html` 里用 `window.mieSplash`（`readConfig / mount / dismiss / preview`）动态挂一个全屏 `<iframe src="mist-splash/index.html">` 遮罩（`#mist-splash-overlay`），开屏页的全局样式不会污染主程序；结束后整个 iframe 销毁。
- `index.html` 里可调：

  ```js
  var DEFAULT_MS = 7000;  // 没保存过设置时的停留时间
  var FADE_MS = 1600;     // 淡出时长（和 CSS transition 一致）
  ```

  想改淡出速度，同时改 `FADE_MS` 和 `#mist-splash-overlay { transition: opacity 1.6s ease; }`。
- `config.js` 在 `splash.js` 之前执行，读取上面的配置并替换 `.alw-photo` 的图。
- `bridge.js` 负责两边通信：点 `ENTER` 通知宿主提前淡出；宿主把刘海/底部安全区传进来（iframe 内 `env(safe-area-inset-*)` 恒为 0）。

## 想换成自己的内容

| 想改什么 | 改哪里 |
| --- | --- |
| 默认底图 | 替换 `mist.webp`（建议竖图，约 780×1698） |
| 默认擦开后文字 | `quotes.js` 的 `MistSplashDefaults.quotes`（设置面板里的「恢复默认文字」也读这里） |
| 默认左上角提示 | `quotes.js` 的 `introEn` / `introCn`，或 `index.html` 里的 `.alw-intro` |
| 默认手写标题 | `quotes.js` 的 `title`，或 `splash.js` 里的 `window.MistSplashTitle` |
| 擦痕宽度 / 一次擦开多少 | `splash.js` 搜索 `target=clamp(35-speed*.026,14,35)` / `dab(p,r,angle,now,.10)` |
| 擦痕颜色深浅 | `splash.js` 搜索 `float ink=.32+.36*a`、`vec3(.035,.130,.380)` |
| 七段文字的字体 | `splash.css` 的 `@font-face` 和 `splash.js` 里的 `textFont` |

> 两个 woff2 字体是按原模板用到的字符裁过的子集（正文 190 字、标题 75 字）。在设置面板里改文字会自动切到系统衬线字体；如果是改 `quotes.js` 里的**默认文案**，则要重裁字体，否则新字会缺字、回退成系统字体。裁剪方法见上游仓库的 `docs/customization.md`。
>
> 手写标题字体只含英文字母、数字和标点，**没有中文**；标题换中文会自动改用系统衬线字体。
