#!/usr/bin/env python3
"""Generate media/icon.png (the extension marketplace icon).

Run from the repository root:
    python scripts/make_icon.py

Only depends on Pillow; the icon is a dark rounded square with a timestamp
bracket motif and waveform bars.
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 256
OUT = Path(__file__).resolve().parent.parent / "media" / "icon.png"

BG = (30, 30, 46, 255)        # #1E1E2E
CYAN = (137, 180, 250, 255)   # #89B4FA
BLUE = (137, 220, 235, 255)   # #89DCEB
MAUVE = (203, 166, 247, 255)  # #CBA6F7


def bracket(draw: ImageDraw.ImageDraw, x: int, mirrored: bool) -> None:
    """Draw one square bracket (left by default, mirrored = right)."""
    bar_w = 18
    tick = 36
    y0, y1 = 76, 180
    if not mirrored:
        draw.rounded_rectangle([x, y0, x + bar_w, y1], radius=9, fill=CYAN)
        draw.rounded_rectangle([x, y0, x + tick, y0 + bar_w], radius=9, fill=CYAN)
        draw.rounded_rectangle([x, y1 - bar_w, x + tick, y1], radius=9, fill=CYAN)
    else:
        draw.rounded_rectangle([x, y0, x + bar_w, y1], radius=9, fill=CYAN)
        draw.rounded_rectangle([x - tick + bar_w, y0, x + bar_w, y0 + bar_w], radius=9, fill=CYAN)
        draw.rounded_rectangle([x - tick + bar_w, y1 - bar_w, x + bar_w, y1], radius=9, fill=CYAN)


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([16, 16, 240, 240], radius=56, fill=BG)

    bracket(draw, 62, mirrored=False)
    bracket(draw, 194, mirrored=True)

    bars = [(102, 56, BLUE), (123, 96, CYAN), (144, 68, MAUVE)]
    for x, height, color in bars:
        top = 128 - height // 2
        draw.rounded_rectangle([x, top, x + 14, top + height], radius=7, fill=color)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"icon written to {OUT}")


if __name__ == "__main__":
    main()
