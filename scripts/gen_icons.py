#!/usr/bin/env python3
# 仅用标准库生成 PWA 图标（192 / 512 / maskable-512），无需任何第三方依赖。
import zlib, struct, os

def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(px[y*w*4:(y+1)*w*4])
    comp = zlib.compress(bytes(raw), 9)
    def chunk(typ, data):
        return struct.pack('>I', len(data)) + typ + data + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', comp))
        f.write(chunk(b'IEND', b''))

def make_icon(size, inset):
    px = bytearray(size * size * 4)
    bg = (31, 111, 235, 255)
    card = (255, 255, 255, 255)
    accent = (31, 111, 235, 255)
    for y in range(size):
        for x in range(size):
            i = (y*size + x) * 4
            px[i:i+4] = bytes(bg)
    x0, y0 = inset, inset
    x1, y1 = size - inset, size - inset
    for y in range(y0, y1):
        for x in range(x0, x1):
            i = (y*size + x) * 4
            px[i:i+4] = bytes(card)
    pad = int(size * 0.12)
    lh = max(4, int(size * 0.045))
    step = int(lh * 2.3)
    lx0, lx1 = x0 + pad, x1 - pad
    ly = y0 + pad + lh
    for _ in range(4):
        for y in range(ly, min(ly + lh, y1 - pad)):
            for x in range(lx0, lx1):
                i = (y*size + x) * 4
                px[i:i+4] = bytes(accent)
        ly += step
    return px

here = os.path.dirname(os.path.abspath(__file__))
icons = os.path.join(here, '..', 'icons')
icons = os.path.abspath(icons)
os.makedirs(icons, exist_ok=True)
write_png(os.path.join(icons, 'icon-192.png'), 192, 192, make_icon(192, int(192*0.12)))
write_png(os.path.join(icons, 'icon-512.png'), 512, 512, make_icon(512, int(512*0.12)))
write_png(os.path.join(icons, 'icon-maskable-512.png'), 512, 512, make_icon(512, int(512*0.18)))
print('icons written to', icons)
