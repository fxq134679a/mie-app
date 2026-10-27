#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 章鱼喷墨机 的 AppIcon(1024) 与 启动图(2732 纯色)。
纯标准库：zlib + struct，自绘 SDF 近似图形，无第三方依赖。
用法: python make-icon.py <输出目录>
"""
import zlib, struct, sys, os, math

SS = 2  # 超采样倍数

def rgba(r, g, b, a=255):
    return (r, g, b, a)

def blend(dst, src):
    sr, sg, sb, sa = src
    if sa == 255:
        return src
    dr, dg, db, da = dst
    a = sa / 255.0
    return (int(sr * a + dr * (1 - a)),
            int(sg * a + dg * (1 - a)),
            int(sb * a + db * (1 - a)), 255)

class Canvas:
    def __init__(self, w, h, bg):
        self.w, self.h = w, h
        self.px = [[bg] * w for _ in range(h)]

    def _blend(self, x, y, color):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = blend(self.px[y][x], color)

    def circle(self, cx, cy, r, color):
        r2 = r * r
        x0, x1 = int(cx - r - 1), int(cx + r + 2)
        y0, y1 = int(cy - r - 1), int(cy + r + 2)
        for y in range(max(0, y0), min(self.h, y1)):
            dy = y + 0.5 - cy
            for x in range(max(0, x0), min(self.w, x1)):
                dx = x + 0.5 - cx
                if dx * dx + dy * dy <= r2:
                    self._blend(x, y, color)

    def ellipse(self, cx, cy, rx, ry, color):
        x0, x1 = int(cx - rx - 1), int(cx + rx + 2)
        y0, y1 = int(cy - ry - 1), int(cy + ry + 2)
        for y in range(max(0, y0), min(self.h, y1)):
            dy = (y + 0.5 - cy) / ry
            for x in range(max(0, x0), min(self.w, x1)):
                dx = (x + 0.5 - cx) / rx
                if dx * dx + dy * dy <= 1.0:
                    self._blend(x, y, color)

    def capsule(self, p0, p1, r0, r1, color):
        """把一根锥形笔触拆成一串圆，沿线段插值半径。"""
        x0, y0 = p0; x1, y1 = p1
        d = math.hypot(x1 - x0, y1 - y0)
        steps = max(2, int(d / max(1.0, min(r0, r1) * 0.45)))
        for i in range(steps + 1):
            t = i / steps
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            r = r0 + (r1 - r0) * t
            self.circle(x, y, r, color)

    def bezier_tube(self, p0, p1, p2, r0, r1, color, steps=64):
        prev = p0
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
            y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
            rt = r0 + (r1 - r0) * t
            rt_prev = r0 + (r1 - r0) * ((i - 1) / steps)
            self.capsule(prev, (x, y), rt_prev, rt, color)
            prev = (x, y)

    def downsample(self, factor):
        w, h = self.w // factor, self.h // factor
        out = Canvas(w, h, (0, 0, 0, 255))
        for y in range(h):
            for x in range(w):
                rs = gs = bs = 0
                for dy in range(factor):
                    row = self.px[y * factor + dy]
                    for dx in range(factor):
                        r, g, b, _ = row[x * factor + dx]
                        rs += r; gs += g; bs += b
                n = factor * factor
                out.px[y][x] = (rs // n, gs // n, bs // n, 255)
        return out

    def to_png(self, path):
        raw = bytearray()
        for row in self.px:
            raw.append(0)  # filter type 0
            for r, g, b, a in row:
                raw += bytes((r, g, b, a))
        comp = zlib.compress(bytes(raw), 9)

        def chunk(tag, data):
            return (struct.pack('>I', len(data)) + tag + data +
                    struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

        ihdr = struct.pack('>IIBBBBB', self.w, self.h, 8, 6, 0, 0, 0)
        png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
               chunk(b'IDAT', comp) + chunk(b'IEND', b''))
        with open(path, 'wb') as f:
            f.write(png)


def make_icon():
    BODY = rgba(247, 250, 255)
    BODY_SHADE = rgba(226, 236, 250)
    INK = rgba(43, 58, 85)
    DROP = rgba(76, 119, 184)
    BG = rgba(113, 154, 224)

    c = Canvas(1024 * SS, 1024 * SS, BG)
    S = SS

    # 八条触手：从头部下缘向外散开
    for i in range(8):
        t = (i - 3.5) / 3.5
        p0 = ((512 + t * 138) * S, 560 * S)
        p1 = ((512 + t * 244) * S, (700 + abs(t) * 10) * S)
        p2 = ((512 + t * 272) * S, (762 + abs(t) * 26) * S)
        c.bezier_tube(p0, p1, p2, 42 * S, 14 * S, BODY)

    # 头（纯平涂，不加描边，免得出现一圈浅色环）
    c.ellipse(512 * S, 448 * S, 214 * S, 198 * S, BODY)

    # 眼睛
    for ex in (446, 578):
        c.ellipse(ex * S, 430 * S, 30 * S, 34 * S, INK)
        c.circle((ex + 10) * S, 418 * S, 10 * S, rgba(255, 255, 255))

    # 腮红（很淡的墨蓝）
    for bx in (404, 620):
        c.ellipse(bx * S, 492 * S, 26 * S, 14 * S, rgba(150, 180, 230, 120))

    # 喷嘴小墨点
    c.circle(206 * S, 300 * S, 26 * S, DROP)
    c.circle(168 * S, 236 * S, 14 * S, DROP)
    c.circle(840 * S, 322 * S, 18 * S, DROP)

    return c.downsample(SS)


def make_launch(size=2732):
    return Canvas(size, size, rgba(113, 154, 224))


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)

    icon = make_icon()
    icon.to_png(os.path.join(out, 'AppIcon-512@2x.png'))
    print('icon ->', os.path.join(out, 'AppIcon-512@2x.png'), icon.w, icon.h)

    splash = make_launch()
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        splash.to_png(os.path.join(out, name))
    print('splash x3 ->', out)
