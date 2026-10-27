#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成一个 6 秒的来电提示音 ring.wav（44.1k / 16bit / 单声道）。纯标准库。"""
import math, struct, sys, os

SR = 44100
DUR = 6.0
N = int(SR * DUR)

# 两声一组的小铃铛，重复三次（像老式电话的 ding-dong）
NOTES = [
    (0.00, 880.0, 0.9),   # A5
    (0.28, 660.0, 0.9),   # E5
    (1.70, 880.0, 0.9),
    (1.98, 660.0, 0.9),
    (3.40, 880.0, 0.9),
    (3.68, 660.0, 0.9),
]

PARTIALS = [(1.0, 1.00), (2.0, 0.42), (3.01, 0.18), (4.2, 0.09), (5.4, 0.05)]

buf = [0.0] * N
for start, freq, amp in NOTES:
    s0 = int(start * SR)
    length = int(1.1 * SR)
    for i in range(length):
        idx = s0 + i
        if idx >= N:
            break
        t = i / SR
        env = math.exp(-4.2 * t)            # 指数衰减
        attack = min(1.0, t / 0.006)        # 6ms 起音，避免爆音
        v = 0.0
        for mult, pa in PARTIALS:
            v += pa * math.sin(2 * math.pi * freq * mult * t)
        buf[idx] += amp * env * attack * v * 0.22

# 轻软限制，防止叠加爆表
peak = max(1e-9, max(abs(x) for x in buf))
gain = min(1.0, 0.86 / peak)

pcm = bytearray()
for x in buf:
    s = int(max(-1.0, min(1.0, x * gain)) * 32767)
    pcm += struct.pack('<h', s)

data = bytes(pcm)
header = b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + \
         struct.pack('<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16) + \
         b'data' + struct.pack('<I', len(data))

out = sys.argv[1] if len(sys.argv) > 1 else 'ring.wav'
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with open(out, 'wb') as f:
    f.write(header + data)
print('ring ->', out, len(header + data), 'bytes')
