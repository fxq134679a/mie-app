# 第三方素材与代码

本仓库自己写的代码是 **CC BY-NC-SA 4.0（署名 · 非商业 · 相同方式共享，见 [LICENSE](LICENSE)）**，别人不能商用。下面这些第三方组件按各自的许可。

---

## 0. 灵感来源（不涉及代码）

这几样效果的起点来自下面的创作者。本仓库**没有使用她们的代码 / 素材**，
但既然想法是从她们那儿来的，就写明：

| 灵感 | 创作者 | 落在哪里 |
|---|---|---|
| 斜飘雪花外面的冰晶结霜 | 年 · X [@niannianyw](https://x.com/niannianyw) | `fx.html` 边缘冰晶；白霜图另有来源（见第 3 节） |
| 雪花落在气泡上形成积雪 | wood · X [@wooduuuuuuu](https://x.com/wooduuuuuuu) | `fx.html` 的 `setAccumulate` / 气泡顶积雪 |
| 焦散水波的来源和教程 | Sylvia · X [@Sylvia_mumu](https://x.com/Sylvia_mumu) | `caustic.html`；shader 原型见第 1 节 |
| 雨水玻璃 · 雨滴挂在玻璃上 | 396 老师 · 小红书号 `18492143860` | `glass.html`；渲染引擎见第 5 节 |
| 雨水玻璃 · 雨滴挂在玻璃上 | 游游老师「缎带骑士」· X [@Suisaeki](https://x.com/Suisaeki) | `glass.html`；渲染引擎见第 5 节 |

如果哪位不希望被这样引用，或想换一种署名方式，联系作者即可调整。

---

## 1. caustic.html —— CC BY-NC-SA 3.0（非商用）

`caustic.html` 中 `tileableCaustic()` 函数的焦散算法来自：

- **Tileable Water Caustic** — Dave Hoskins
  https://www.shadertoy.com/view/MdlXz8
- 更早的可追溯版本：**Water Turbulence** — joltz0r, 2013
  GLSL Sandbox #9824.11 — http://glslsandbox.com/e#9824.11

Shadertoy 的默认内容协议是 **Creative Commons Attribution-NonCommercial-ShareAlike 3.0**：

> 署名 — 必须注明原作者；
> 非商业 — 不得用于商业用途；
> 相同方式共享 — 修改后的作品必须使用相同协议发布。

所以 **`caustic.html` 整个文件按 CC BY-NC-SA 3.0 使用**，不适用本仓库的 CC BY-NC-SA 4.0 许可。
周围的水面波动、点击涟漪、树荫/光斑遮罩是自写的，但它们跟这段函数编在同一个 shader 里，按「相同方式共享」整体处理最稳妥。

**要商用**：本仓库整体本来就不允许商用（CC BY-NC-SA 4.0）；就算换成别的用途，也要先把 `tileableCaustic()` 换掉（自己写一份焦散，或换成其它实现）。

## 2. 斜飘雪花 —— 视觉参数参考，代码独立实现

- **Beautiful-web-effects** — yangzi0210
  https://github.com/yangzi0210/Beautiful-web-effects （`snowflake-drops/script.js`）

该仓库**没有 LICENSE 文件**，默认保留所有权利。本仓库没有搬它的 DOM + 定时器代码；
`fx.html` 里的雪花是 canvas 粒子（自己算寿命、缓动、消失），只沿用了这些视觉数值：

- 字号 3 ~ 23px（原式 `3 + 20 * Math.random()`）
- 起始透明度 0.7 ~ 1.0，结束时 0.2 ~ 0.4
- 一片雪花飘 4 ~ 11 秒（原式 `4000 + 7000 * Math.random()` ms）

数值本身不构成受版权保护的表达，但如果你的使用场景很敏感，可以把这几个数改成你自己的。

## 3. 边缘冰晶白霜 —— MIT

- **BingIndexWebFile** — Deng-Xian-Sheng
  https://github.com/Deng-Xian-Sheng/BingIndexWebFile

`fx.html` 里 `.frame_sprite` 的白霜图片（base64 内嵌）和样式类名来自这个仓库，MIT。
仓库里的 20 个 SVG 雪花不是它的：那批是从小红书可用素材里转的矢量图。

```
MIT License

Copyright (c) 2023 Deng-Xian-Sheng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 4. 闪电图 —— MIT

`assets/bolts/lightning0~4.webp` 来自：

- **flutter_weather_bg** — xiaweizi
  https://github.com/xiaweizi/flutter_weather_bg

仓库是 MIT。`Rainvvy/Weather_Bg` 是这个项目后来的安卓移植版，README 里自己写了来源；
本仓库的 5 个文件与 xiaweizi 原仓库逐字节一致。

```
MIT License

Copyright (c) 2019 xiaweizi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 5. vendor/raindrop-fx —— MIT

- **raindrop-fx** — SardineFish
  https://github.com/SardineFish/raindrop-fx

`vendor/raindrop-fx/raindrop-fx.js` 是它的浏览器构建（v1.0.8）。
完整 MIT 文本见 `vendor/raindrop-fx/LICENSE-raindrop-fx.txt`。

这个构建里还打包了两个库：

- **zogra-renderer** — SardineFish, MIT（https://github.com/SardineFish/zogra-renderer）
- **tslib** — Microsoft, 0BSD（构建产物尾部保留了 Apache 2.0 风格的通知头）

## 6. 天气数据

- **wttr.in** — https://wttr.in
  `weather.js` 用它取当前天气。wttr.in 本身是开源项目（MIT），数据源为 World Weather Online 等。
  请自行遵守其使用限制，不要高频轮询（示例是 30 分钟一次）。

## 7. 演示壁纸 —— 花瓣免费素材

`wallpapers/web_walls.js` 打包了四张横版壁纸（暮色港湾 / 云山 / 天鹅湖 / 窗边的猫）给 `index.html` 全屏演示台，
`wallpapers/walls.js` 打包了六张竖版壁纸（霜林 / 雾林 / 碧水 / 海光 / 落花 / 窗边）给 `phone.html` 手机预览。
来源为花瓣（huaban.com），下载页标注为**非版权图片、可免费使用**。
它们只用于演示页背景，不适用本仓库的 CC BY-NC-SA 4.0 许可；如果原作者有异议，联系作者会立刻替换或删除。

## 8. 没有进仓库的东西

- **雨声**：本仓库不含任何音频。
- **雨窗（Corvus 的私人功能）**、App 前端代码：都不在仓库里。

## 组件对照

| 文件 / 素材 | 来源 | 许可 |
|---|---|---|
| `fx.html` 斜飘雪花 / 垂直雨丝 / 柔光飘雪 / 柔雾 | 自写（雪花视觉参数见第 2 节） | CC BY-NC-SA 4.0 |
| `fx.html` 边缘装饰雪花（随机大小 / 缩放呼吸 / 沿边分布） | 自写；雪花图形见第 3 节 | CC BY-NC-SA 4.0 |
| `fx.html` 气泡溅水 / 积雪 / 遮挡减量 / 自动吹散 | 自写（灵感见第 0 节） | CC BY-NC-SA 4.0 |
| `fx.html` 边缘冰晶白霜 | BingIndexWebFile | MIT |
| `fx.html` 20 个 SVG 雪花 | 小红书可用素材 → Gemini 转矢量 | 素材可用 / 自制 |
| `sky.html` 晴天光网 / 多云 / 雷雨 / 霾 / 彩虹 | 自写 | CC BY-NC-SA 4.0 |
| `caustic.html` 焦散函数 | Dave Hoskins / joltz0r | **CC BY-NC-SA 3.0** |
| `caustic.html` 其余水面/涟漪/遮罩 | 自写 | CC BY-NC-SA 4.0 |
| `assets/bolts/*.webp` | xiaweizi/flutter_weather_bg | MIT |
| `vendor/raindrop-fx` | SardineFish | MIT（+ MIT zogra-renderer、0BSD tslib） |
| `weather.js` | 自写（思路参考 Corvus App） | CC BY-NC-SA 4.0 |
| `wallpapers/web_walls.js` 四张全屏壁纸 | 花瓣免费素材（标注非版权、可免费使用） | 仅演示，不适用本仓库许可 |
| `wallpapers/walls.js` 六张竖版壁纸 | 花瓣免费素材（标注非版权、可免费使用） | 仅演示，不适用本仓库许可 |
