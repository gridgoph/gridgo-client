#!/usr/bin/env python3
"""Rasterise the GRIDGO 3×3 mark onto a black launcher plate.

Captain correction 2026-08-19: do not invent a white plate. Pure-black
dots vanish on #000000 and punch holes that show a light adaptive
background as white dots. The nine dots are:

  top-right      #FFDE58
  middle-right   #5B5B5B
  bottom-right   #5B5B5B
  other six      #2A2A2A

Geometry matches the landing favicon viewBox (centres 8/24/40, r=5).

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

PLATE = (0x00, 0x00, 0x00, 255)
DOT_CHARCOAL = (0x2A, 0x2A, 0x2A, 255)
DOT_GRAY = (0x5B, 0x5B, 0x5B, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
MONO_DOT = (0xF0, 0xF0, 0xF0, 255)

# favicon.svg viewBox="0 0 48 48": centres at 8/24/40, r=5.
CENTRES = (8, 24, 40)
RADIUS = 5
VIEW = 48

# Android adaptive icons are 108dp; the unmasked safe zone is the inner 66dp.
SAFE_ZONE = 66 / 108

# Super-sample then Lanczos-down so the dots stay round, not stair-stepped.
SCALE = 4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def dot_fill(col: int, row: int, *, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return MONO_DOT
    if col == 2 and row == 0:
        return DOT_YELLOW
    if col == 2:
        return DOT_GRAY
    return DOT_CHARCOAL


def draw_mark(
    size: int,
    *,
    mono: bool = False,
    inner_ratio: float = 1.0,
    plate: tuple[int, int, int, int] | None = PLATE,
) -> Image.Image:
    """Paint the 3×3 mark into a size×size canvas.

    `inner_ratio` is the fraction of the canvas the 48-unit viewBox occupies
    (centred). 66/108 puts every dot inside Android's adaptive safe zone.

    Default plate is opaque black so no transparent hole can show a light
    adaptive background through. Pass plate=None only for the splash image
    that sits on the splash backgroundColor.
    """
    big = size * SCALE
    fill = plate if plate is not None else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (big, big), fill)
    draw = ImageDraw.Draw(canvas)

    inner = size * inner_ratio
    origin = (size - inner) / 2
    unit = inner / VIEW

    for row, cy in enumerate(CENTRES):
        for col, cx in enumerate(CENTRES):
            color = dot_fill(col, row, mono=mono)
            px = (origin + cx * unit) * SCALE
            py = (origin + cy * unit) * SCALE
            r = RADIUS * unit * SCALE
            draw.ellipse((px - r, py - r, px + r, py + r), fill=color)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, name: str) -> None:
    path = OUT / name
    if image.mode == "RGBA" and all(px[3] == 255 for px in (image.getpixel((0, 0)),)):
        image = image.convert("RGB")
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.size[0]}×{image.size[1]} {image.mode})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Home-screen / iOS icon: opaque black plate, mark inset so the squircle
    # mask does not clip a corner dot.
    save_png(draw_mark(1024, inner_ratio=0.70).convert("RGB"), "icon.png")

    # Adaptive layers. Foreground is an opaque black tile plus all nine
    # dots (no holes). Background is the same black. Monochrome is nine
    # light dots on black so themed icons still show the full grid.
    save_png(draw_mark(1024, inner_ratio=SAFE_ZONE).convert("RGB"), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True, inner_ratio=SAFE_ZONE).convert("RGB"), "android-icon-monochrome.png")

    # Splash: same nine-dot recipe, transparent canvas, so light (#ffffff)
    # and dark (#000000) splash backgrounds both carry the mark. Charcoal
    # reads on both; do not invert to white.
    save_png(draw_mark(1024, inner_ratio=0.72, plate=None), "splash-icon.png")
    save_png(draw_mark(1024, inner_ratio=0.72, plate=None), "splash-icon-dark.png")

    # Web tab icon: same black plate as the launcher.
    save_png(draw_mark(48, inner_ratio=0.84).convert("RGB"), "favicon.png")


if __name__ == "__main__":
    main()
