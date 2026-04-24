"""Render a moodboard as a static 2D PNG for the A/B viewer.

Paints each element onto a 1280×800 canvas proportionally scaled to its
position/size fields. Text and palette elements get simple fills so the
snapshot looks plausible without requiring a full frontend render.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from pipeline.core.dataset import Moodboard, MoodboardElement

CANVAS_W, CANVAS_H = 1280, 800
CANVAS_BG = (245, 245, 245)

_DEFAULT_SIZES = {
    "image":   (300, 200),
    "video":   (400, 225),
    "model":   (300, 300),
    "text":    (200, 40),
    "palette": (150, 100),
}


def render(moodboard: Moodboard, out_path: Path) -> None:
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    for elem in moodboard.elements:
        _paint_element(canvas, draw, elem, moodboard.base_dir)

    canvas.save(out_path)


def _paint_element(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    elem: MoodboardElement,
    base_dir: Path,
) -> None:
    default_w, default_h = _DEFAULT_SIZES.get(elem.type, (200, 200))
    w = int(default_w * elem.size.get("x", 1.0))
    h = int(default_h * elem.size.get("y", 1.0))
    x = int(elem.position.get("x", 0))
    y = int(elem.position.get("y", 0))

    if elem.type in ("image", "video") and elem.path:
        try:
            img = Image.open(base_dir / elem.path).convert("RGB")
            img = img.resize((w, h), Image.LANCZOS)
            canvas.paste(img, (x, y))
            draw.rectangle([x, y, x + w, y + h], outline=(200, 200, 200), width=1)
            return
        except Exception:
            pass  # fall through to placeholder

    if elem.type == "palette" and elem.colors:
        _draw_palette(draw, elem.colors, x, y, w, h)
        return

    if elem.type == "text":
        draw.rectangle([x, y, x + w, y + h], fill=(255, 255, 255), outline=(180, 180, 180))
        text = elem.text or ""
        draw.text((x + 4, y + 4), text, fill=(60, 60, 60))
        return

    # Generic placeholder (model, unknown, failed image)
    draw.rectangle([x, y, x + w, y + h], fill=(230, 230, 230), outline=(160, 160, 160))
    label = elem.type.upper()
    draw.text((x + 4, y + 4), label, fill=(100, 100, 100))


def _draw_palette(
    draw: ImageDraw.ImageDraw,
    colors: list[str],
    x: int,
    y: int,
    w: int,
    h: int,
) -> None:
    n = len(colors)
    if n == 0:
        return
    swatch_w = w // n
    for i, hex_color in enumerate(colors):
        rgb = _hex_to_rgb(hex_color)
        sx = x + i * swatch_w
        draw.rectangle([sx, y, sx + swatch_w, y + h], fill=rgb)
    draw.rectangle([x, y, x + w, y + h], outline=(160, 160, 160))


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))  # type: ignore
