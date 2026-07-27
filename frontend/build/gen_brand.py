"""Genera icono de la app (fondo transparente real) y graficos NSIS del instalador
a partir del logo fuente. Fuente: glifo negro sobre fondo blanco -> se elimina el
fondo por flood-fill desde los bordes (las letras "PDF" internas se conservan)."""
import os
from collections import deque

from PIL import Image, ImageDraw, ImageFont

BUILD = os.path.dirname(os.path.abspath(__file__))
LOGO_SRC = r"C:\Users\Engelllop\Downloads\LOGO PDF-Master.png"
RENDERER_ICON = os.path.join(BUILD, "..", "src", "renderer", "src", "assets", "icon.png")

DARK_TOP = (24, 27, 33)
DARK_BOT = (15, 17, 21)


def load_glyph():
    """Logo con el fondo blanco exterior eliminado (alpha 0), recortado a su bbox."""
    im = Image.open(LOGO_SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a < 10 or (r > 180 and g > 180 and b > 180)

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    return im.crop(im.getbbox())


def invert(glyph):
    from PIL import ImageOps
    rgb = ImageOps.invert(glyph.convert("RGB"))
    rgb.putalpha(glyph.getchannel("A"))
    return rgb


def square(glyph, size, pad=0.08):
    inner = int(size * (1 - 2 * pad))
    g = glyph.copy()
    g.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(g, ((size - g.width) // 2, (size - g.height) // 2), g)
    return canvas


def font(size, weight="semibold"):
    names = {"semibold": "seguisb.ttf", "regular": "segoeui.ttf", "light": "segoeuil.ttf"}
    try:
        return ImageFont.truetype(rf"C:\Windows\Fonts\{names[weight]}", size)
    except Exception:
        return ImageFont.load_default()


def vgrad(w, h, top, bot):
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return col.resize((w, h))


def sidebar(glyph):
    W, H = 164, 314
    img = vgrad(W, H, DARK_TOP, DARK_BOT).convert("RGB")
    d = ImageDraw.Draw(img)

    mark = invert(glyph)
    mark.thumbnail((72, 72), Image.LANCZOS)
    mx, my = (W - mark.width) // 2, 92
    img.paste(mark, (mx, my), mark)

    f1 = font(17)
    t1 = "PDF Master"
    tw = d.textlength(t1, font=f1)
    d.text(((W - tw) / 2, my + mark.height + 18), t1, font=f1, fill=(245, 246, 248))

    f2 = font(10, "regular")
    t2 = "Lector y editor de PDF"
    tw2 = d.textlength(t2, font=f2)
    d.text(((W - tw2) / 2, my + mark.height + 44), t2, font=f2, fill=(148, 155, 166))

    lw = 28
    d.rectangle([(W - lw) // 2, H - 40, (W + lw) // 2, H - 39], fill=(90, 96, 106))
    img.save(os.path.join(BUILD, "installerSidebar.bmp"), "BMP")


def header(glyph):
    W, H = 150, 57
    img = Image.new("RGB", (W, H), (255, 255, 255))
    mark = glyph.copy()
    mark.thumbnail((30, 30), Image.LANCZOS)
    img.paste(mark, (W - mark.width - 14, (H - mark.height) // 2), mark)
    img.save(os.path.join(BUILD, "installerHeader.bmp"), "BMP")


def main():
    glyph = load_glyph()

    icon = square(glyph, 1024)
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(BUILD, "icon.png"))
    icon.resize((256, 256), Image.LANCZOS).save(
        os.path.join(BUILD, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    icon.resize((256, 256), Image.LANCZOS).save(RENDERER_ICON)
    print("icon.png + icon.ico + renderer icon.png (fondo transparente)")

    sidebar(glyph)
    header(glyph)
    print("installerSidebar.bmp + installerHeader.bmp")


if __name__ == "__main__":
    main()
