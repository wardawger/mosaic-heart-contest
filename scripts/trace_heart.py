"""Trace design/heart-reference.png into stroke paths for the site.

Each heart section is drawn in its own color. This script:
  1. finds the colored stroke pixels,
  2. labels the solid middle of every stroke with the nearest section color,
     then gives each soft edge pixel the label of the nearest middle pixel,
  3. thins each section's pixels to a one-pixel center line and splits it into
     separate lines at forks,
  4. measures the stroke width, smooths and simplifies each line,
and writes src/heart-paths.json (image pixel coordinates, y down).

Run:  python scripts/trace_heart.py   (needs numpy, scipy, scikit-image, pillow)
"""
import json
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'heart-reference.png'
OUT = ROOT / 'src' / 'heart-paths.json'

# Section colors sampled from the middle of each stroke in the reference image.
COLORS = {
    'brachiocephalic-artery': '#FEBB58',
    'left-common-carotid-artery': '#FD904C',
    'left-subclavian-artery': '#FDDC5A',
    'aorta': '#FD6E63',
    'pulmonary-artery': '#7536EC',
    'pulmonary-valve': '#5C3DF6',
    'left-pulmonary-vein': '#FE1202',
    'left-atrium': '#EC5B8A',
    'mitral-valve': '#EC9EBD',
    'aortic-valve': '#FEC6BC',
    'left-ventricle': '#F01579',
    'right-ventricle': '#0149AB',
    'right-atrium': '#1C70AB',
    'tricuspid-valve': '#7BDCDB',
    'superior-vena-cava': '#1D94F8',
    'right-pulmonary-vein': '#577BEA',
    'inferior-vena-cava': '#34B5C4',
}


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def neighbors(p, pts):
    y, x = p
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and (y + dy, x + dx) in pts:
                yield (y + dy, x + dx)


def skeleton_lines(skel):
    """Split a one-pixel skeleton into polylines between ends and forks."""
    pts = set(zip(*np.nonzero(skel)))
    deg = {p: sum(1 for _ in neighbors(p, pts)) for p in pts}
    nodes = {p for p, d in deg.items() if d != 2}
    seen_edges = set()
    lines = []

    def walk(start, nxt):
        line = [start, nxt]
        prev, cur = start, nxt
        while cur not in nodes:
            options = [q for q in neighbors(cur, pts) if q != prev and q not in line[-3:]]
            if not options:
                break
            # prefer 4-connected steps so diagonal corners don't skip
            options.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
            prev, cur = cur, options[0]
            line.append(cur)
            if cur == start:
                break
        return line

    for n in nodes:
        for nb in neighbors(n, pts):
            key = frozenset((n, nb))
            if key in seen_edges:
                continue
            line = walk(n, nb)
            for a, b in zip(line, line[1:]):
                seen_edges.add(frozenset((a, b)))
            lines.append(line)

    # closed loops with no ends or forks
    covered = {p for line in lines for p in line}
    for p in pts:
        if p in covered:
            continue
        nb = next(neighbors(p, pts), None)
        if nb is None:
            continue
        nodes.add(p)
        line = walk(p, nb)
        nodes.discard(p)
        covered.update(line)
        lines.append(line)
    return lines, deg


def smooth(line, k=3):
    a = np.array(line, float)
    if len(a) <= 2 * k + 1:
        return a
    out = a.copy()
    for i in range(k, len(a) - k):
        out[i] = a[i - k:i + k + 1].mean(0)
    return out


def rdp(a, eps):
    if len(a) < 3:
        return a
    start, end = a[0], a[-1]
    seg = end - start
    norm = np.hypot(*seg) or 1.0
    rel = a - start
    d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / norm
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(a[:i + 1], eps)[:-1], rdp(a[i:], eps)])
    return np.array([start, end])


def main():
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    h, w, _ = im.shape
    sat = im.max(2) - im.min(2)
    stroke = sat > 28
    stroke = ndi.binary_opening(stroke, iterations=1)
    stroke[:, 484:] = False  # a stray cursor mark at the right edge of the export
    core = ndi.binary_erosion(stroke, iterations=2)

    ids = list(COLORS)
    refs = np.stack([hex_rgb(COLORS[i]) for i in ids])
    dist = np.linalg.norm(im[core][:, None, :] - refs[None, :, :], axis=2)
    # where two strokes touch, their blended pixels match no section well: skip them
    good = dist.min(1) < 45
    core_label = np.full((h, w), -1)
    ys, xs = np.nonzero(core)
    core_label[ys[good], xs[good]] = dist.argmin(1)[good]

    # every stroke pixel takes the label of the nearest middle-of-stroke pixel
    _, (iy, ix) = ndi.distance_transform_edt(core_label < 0, return_indices=True)
    label = np.where(stroke, core_label[iy, ix], -1)

    # Specks of a neighbour's color along stroke edges (the artwork uses soft
    # gradients) join the section that surrounds them. The smallest real
    # section, a valve, is a few hundred pixels.
    for k in range(len(COLORS)):
        lab, n = ndi.label(label == k)
        for i in range(1, n + 1):
            comp = lab == i
            if comp.sum() >= 120:
                continue
            ring = ndi.binary_dilation(comp, iterations=2) & ~comp & (label >= 0) & (label != k)
            if ring.any():
                label[comp] = np.bincount(label[ring]).argmax()

    # stroke half-width at each pixel
    half = ndi.distance_transform_edt(stroke)

    out = {'width': w, 'height': h, 'sections': {}}
    for k, sid in enumerate(ids):
        mask = label == k
        if not mask.any():
            print('no pixels for', sid)
            continue
        skel = skeletonize(mask)
        widths = half[skel]
        sw = float(np.median(widths) * 2) if len(widths) else 10.0
        lines, deg = skeleton_lines(skel)
        paths = []
        other = (label >= 0) & (label != k)
        for line in lines:
            # drop short spurs that end in nothing (skeleton noise at stroke ends)
            dead_end = deg.get(line[0], 2) == 1 or deg.get(line[-1], 2) == 1
            if len(line) < (sw * 0.9 if dead_end else 3):
                continue
            a = smooth(line)
            caps = []
            # An end that butts against another section is drawn square and pushed
            # out to the boundary; a free end keeps its round cap.
            for end, inner in ((0, min(4, len(a) - 1)), (-1, max(-5, -len(a)))):
                y, x = a[end]
                r = int(sw * 0.8)
                y0, y1 = max(0, int(y) - r), min(h, int(y) + r + 1)
                x0, x1 = max(0, int(x) - r), min(w, int(x) + r + 1)
                yy, xx = np.mgrid[y0:y1, x0:x1]
                near = ((yy - y) ** 2 + (xx - x) ** 2 <= r * r) & other[y0:y1, x0:x1]
                butt = deg.get(line[end], 2) == 1 and near.any()
                if butt:
                    d = a[end] - a[inner]
                    d /= np.hypot(*d) or 1
                    a[end] = a[end] + d * sw * 0.65
                caps.append(not butt)
            a = rdp(a, 0.5)
            paths.append({'p': [[round(float(x), 1), round(float(y), 1)] for y, x in a], 'cap': caps})
        out['sections'][sid] = {'stroke': round(sw, 1), 'paths': paths}
        print(f'{sid:28s} stroke {sw:4.1f}px  lines {len(paths)}  points {sum(len(p["p"]) for p in paths)}')

    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
