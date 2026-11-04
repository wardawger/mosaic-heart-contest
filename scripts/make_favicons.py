"""Make the site icons from the traced heart, every section in its color.

Writes to public/:
  favicon.svg           vector icon (modern browsers)
  favicon.ico           16, 32 and 48 px (older browsers, bookmarks)
  apple-touch-icon.png  180 px on white (iPhone / iPad home screen)

The strokes are drawn thicker than on the page (WEIGHT) so the heart still
reads at 16-32 px.

Run:  python scripts/make_favicons.py   (needs pillow)
"""
import json
import pathlib
import re

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATHS = json.loads((ROOT / 'src' / 'heart-paths.json').read_text())
OUT = ROOT / 'public'
WEIGHT = 1.6

# section colors, from src/sections.js
COLORS = dict(re.findall(r"id: '([a-z-]+)'.*?color: '(#[0-9A-Fa-f]{6})'", (ROOT / 'src' / 'sections.js').read_text()))


def strokes():
    """(points, width, color, round) for every stroke, hidden join pieces first."""
    out = []
    for under in (True, False):
        for sid, sec in PATHS['sections'].items():
            for p in sec['paths']:
                if bool(p.get('under')) == under:
                    out.append((p['p'], sec['stroke'] * WEIGHT, COLORS[sid], p['cap'][0] or p['cap'][1]))
    return out


def bounds(pad):
    xs = [x for pts, *_ in strokes() for x, _ in pts]
    ys = [y for pts, *_ in strokes() for _, y in pts]
    w = max(sec['stroke'] for sec in PATHS['sections'].values()) * WEIGHT / 2 + pad
    x0, y0, x1, y1 = min(xs) - w, min(ys) - w, max(xs) + w, max(ys) + w
    side = max(x1 - x0, y1 - y0)  # square, heart centered
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - side / 2, cy - side / 2, side


def svg():
    x0, y0, side = bounds(pad=4)
    lines = []
    for pts, width, color, rnd in strokes():
        cap = 'round' if rnd else 'butt'
        pts_s = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        lines.append(f'<polyline points="{pts_s}" stroke="{color}" stroke-width="{width:.1f}" stroke-linecap="{cap}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {side:.1f} {side:.1f}">'
            f'<g fill="none" stroke-linejoin="round">{"".join(lines)}</g></svg>\n')


def png(size, background=None, pad=4):
    """Draw large, then shrink, for smooth edges."""
    big = size * 8
    x0, y0, side = bounds(pad)
    k = big / side
    img = Image.new('RGBA', (big, big), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for pts, width, color, rnd in strokes():
        xy = [((x - x0) * k, (y - y0) * k) for x, y in pts]
        w = max(1, round(width * k))
        d.line(xy, fill=color, width=w, joint='curve')
        if rnd:
            for cx, cy in (xy[0], xy[-1]):
                d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=color)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    (OUT / 'favicon.svg').write_text(svg())
    png(48).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    # home-screen icons are shown on a tile: white background with room around the heart
    png(180, background=(255, 255, 255, 255), pad=60).convert('RGB').save(OUT / 'apple-touch-icon.png')
    print('wrote', ', '.join(f'public/{n}' for n in ('favicon.svg', 'favicon.ico', 'apple-touch-icon.png')))


if __name__ == '__main__':
    main()
