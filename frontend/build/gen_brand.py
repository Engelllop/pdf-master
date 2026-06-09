"""Generate the professional app icon (pure code) and NSIS installer graphics."""
import os
from PIL import Image, ImageDraw, ImageFont

BUILD = os.path.dirname(os.path.abspath(__file__))
TENKA = r"C:\Users\Engelllop\Downloads\Tenka_Izumo.png"


def load_font(size, bold=True):
    for name in (("arialbd.ttf", "ariblk.ttf") if bold else ("arial.ttf",)):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", size)
    except Exception:
        return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _draw_M(draw, size, color, dx=0, dy=0):
    """Bold geometric 'M' monogram (for 'Master') that fills most of the canvas."""
    top = int(size * 0.20) + dy
    bot = int(size * 0.80) + dy
    xl = int(size * 0.17) + dx
    xr = int(size * 0.83) + dx
    mid = int(size * 0.50) + dx
    valley = int(size * 0.55) + dy
    w = int(size * 0.155)
    pts = [(xl, bot), (xl, top), (mid, valley), (xr, top), (xr, bot)]
    draw.line(pts, fill=color, width=w, joint="curve")
    r = w / 2
    for (cx, cy) in [(xl, top), (xl, bot), (xr, top), (xr, bot)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def make_icon(size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Full-bleed vertical gradient inside a rounded square (fills the whole tile)
    top = (37, 99, 235)     # blue-600
    bot = (67, 56, 202)     # indigo-700
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        grad.putpixel((0, y), lerp(top, bot, y / size))
    grad = grad.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.20), fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # subtle depth shadow under the monogram
    _draw_M(d, size, (23, 30, 84, 130), dx=0, dy=int(size * 0.014))
    # main white monogram
    _draw_M(d, size, (255, 255, 255, 255))
    # red accent dot in the M's valley — a touch of the document/brand color
    rr = int(size * 0.052)
    cx, cy = int(size * 0.50), int(size * 0.55)
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(220, 38, 38, 255))

    return img


def cover_crop(im, tw, th, anchor_y=0.5):
    """Fill tw x th by scaling to cover and cropping (no bars, no distortion).
    anchor_y biases the vertical crop (0 = top/face, 0.5 = center)."""
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im2 = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - tw) // 2
    y = int((nh - th) * anchor_y)
    return im2.crop((x, y, x + tw, y + th))


def contain_on_bg(im, tw, th, bg):
    canvas = Image.new("RGB", (tw, th), bg)
    sw, sh = im.size
    scale = min(tw / sw, th / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    canvas.paste(im2, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def main():
    icon = make_icon(1024)
    icon.convert("RGBA").save(os.path.join(BUILD, "icon.png"))
    icon.save(os.path.join(BUILD, "icon.ico"),
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icon.png + icon.ico generados")

    if os.path.exists(TENKA):
        tk = Image.open(TENKA).convert("RGB")
        cover_crop(tk, 164, 314, anchor_y=0.30).save(os.path.join(BUILD, "installerSidebar.bmp"), "BMP")
        # Header fills the strip with a face-biased crop — no black bars, no stretching
        cover_crop(tk, 150, 57, anchor_y=0.30).save(os.path.join(BUILD, "installerHeader.bmp"), "BMP")
        print("installerSidebar.bmp + installerHeader.bmp generados")
    else:
        print("WARN: no se encontro Tenka_Izumo.png")


if __name__ == "__main__":
    main()
