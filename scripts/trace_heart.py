"""Trace design/heart-reference.png into stroke paths for the site.

Each heart section is drawn in its own color. This script:
  1. finds the colored stroke pixels and labels every one with its section,
     by color (only the solid middle of each stroke is matched; soft edge
     pixels take the label of the nearest middle pixel),
  2. thins the whole drawing, all colors together, to one connected network of
     one-pixel center lines, split into lines at forks,
  3. walks each line and cuts it wherever the section color changes, so
     neighbouring sections share the same end point and direction and meet
     without gaps (each piece runs a couple of pixels past the cut so no seam
     shows),
  4. smooths and simplifies each piece and measures each section's stroke width,
and writes src/heart-paths.json (image pixel coordinates, y down). An end that
butts against a neighbour is drawn square; a free end or a fork is round.

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

    # Fill pinholes where two strokes touch side by side, so thinning doesn't
    # leave tiny loops there.
    holes, n = ndi.label(~stroke)
    sizes = ndi.sum(~stroke, holes, range(1, n + 1))
    stroke = stroke | np.isin(holes, [i + 1 for i, sz in enumerate(sizes) if sz < 40])
    label[stroke & (label < 0)] = core_label[iy, ix][stroke & (label < 0)]

    # stroke width per section, measured on the center line
    skel = skeletonize(stroke)
    widths = {}
    for k, sid in enumerate(ids):
        vals = half[skel & (label == k)]
        # +1: the distance to the nearest blank pixel lands just under the true width
        widths[sid] = float(np.median(vals) * 2) + 1 if len(vals) else 17.0
    sw_all = float(np.median(half[skel]) * 2)

    # prune short dead-end spurs (skeleton noise at stroke ends and corners)
    for _ in range(3):
        lines, deg = skeleton_lines(skel)
        removed = False
        for line in lines:
            ends = [deg.get(line[0], 2), deg.get(line[-1], 2)]
            if 1 in ends and max(ends) >= 3 and len(line) < sw_all * 0.9:
                for p in line:
                    if deg.get(p, 2) < 3:
                        skel[p] = False
                removed = True
        if not removed:
            break
    lines, deg = skeleton_lines(skel)

    def runs_of(line):
        labs = [int(label[y, x]) for y, x in line]
        for i in range(1, len(labs)):
            if labs[i] < 0:
                labs[i] = labs[i - 1]
        for i in range(len(labs) - 2, -1, -1):
            if labs[i] < 0:
                labs[i] = labs[i + 1]
        runs = []
        for i, l in enumerate(labs):
            if runs and runs[-1][0] == l:
                runs[-1][2] = i
            else:
                runs.append([l, i, i])
        return runs

    lines = [ln for ln in lines if len(ln) >= 3]
    all_runs = [runs_of(ln) for ln in lines]
    # A fork is often a little clump of neighbouring pixels; treat each clump as
    # one joint. At each joint, note the section color of every line touching it.
    fork_px = np.zeros_like(skel)
    for p, d in deg.items():
        if d >= 3:
            fork_px[p] = True
    joints, _ = ndi.label(fork_px, structure=np.ones((3, 3)))
    joint_of = lambda p: int(joints[p]) if deg.get(p, 2) >= 3 else 0
    at_fork = {}
    for li, (ln, runs) in enumerate(zip(lines, all_runs)):
        for end, node in ((0, ln[0]), (1, ln[-1])):
            if joint_of(node):
                at_fork.setdefault(joint_of(node), []).append((li, runs[0 if end == 0 else -1][0]))

    pieces = {sid: [] for sid in ids}
    for li, (line, runs) in enumerate(zip(lines, all_runs)):
        a = smooth(line, 4)
        a[0], a[-1] = line[0], line[-1]  # forks and ends stay exactly put
        if runs[0][0] < 0:
            continue

        # Where this line meets a fork inside another section's stroke, it
        # should stop square at that stroke's edge (half its width from the
        # fork). If that stroke passes straight through the fork (two other
        # lines leave it in that color), a short stretch of that color at this
        # line's end is just the inside of that stroke: drop it. If that stroke
        # ends at the fork instead, the stretch is that stroke continuing, and
        # is kept as part of it.
        caps = [True, True]
        trim = [0.0, 0.0]
        for end in (0, 1):
            node = line[0] if end == 0 else line[-1]
            if deg.get(node, 2) < 3:
                continue
            # the fork belongs to the stroke that carries on through it (its
            # color leaves the fork on two or more lines); otherwise to the
            # color under the fork
            counts = {}
            for _, l in at_fork.get(joint_of(node), []):
                counts[l] = counts.get(l, 0) + 1
            best = max(counts.items(), key=lambda kv: kv[1], default=(-1, 0))
            lf = best[0] if best[1] >= 2 else int(label[node])
            if lf < 0 or all(r[0] == lf for r in runs):
                continue
            wf = widths[ids[lf]]
            through = sum(1 for lj, l in at_fork.get(joint_of(node), []) if lj != li and l == lf) >= 2
            edge_run = runs[0] if end == 0 else runs[-1]
            if edge_run[0] == lf:
                if through and edge_run[2] - edge_run[1] < wf * 0.9:
                    runs.pop(0 if end == 0 else -1)
                    trim[end] = wf * 0.5
                    caps[end] = False
            else:
                trim[end] = wf * 0.5
                caps[end] = False
        # a free end that only touches another section (no fork) still tucks
        # its tip underneath, so a revealed tip never sits on top of its neighbour
        tuck = [False, False]
        for end in (0, 1):
            node = line[0] if end == 0 else line[-1]
            if deg.get(node, 2) != 1:
                continue
            y, x = node
            r = int(widths[ids[runs[0 if end == 0 else -1][0]]] * 0.8)
            y0, y1, x0, x1 = max(0, y - r), min(h, y + r + 1), max(0, x - r), min(w, x + r + 1)
            own = runs[0 if end == 0 else -1][0]
            box = label[y0:y1, x0:x1]
            if ((box >= 0) & (box != own)).any():
                tuck[end] = True

        # fold runs of a few pixels into their neighbour
        changed = True
        while changed and len(runs) > 1:
            changed = False
            for j, (l, s0, s1) in enumerate(runs):
                if s1 - s0 + 1 < 6:
                    if j == 0:
                        runs[1][1] = s0
                    else:
                        runs[j - 1][2] = s1
                        if j + 1 < len(runs) and runs[j + 1][0] == runs[j - 1][0]:
                            runs[j - 1][2] = runs[j + 1][2]
                            runs.pop(j + 1)
                    runs.pop(j)
                    changed = True
                    break
        if not runs:
            continue

        # apply trims by walking in from the fork along the smoothed line
        def walk_in(start, step, dist):
            i, acc = start, 0.0
            while 0 <= i + step < len(a) and acc < dist:
                acc += float(np.hypot(*(a[i + step] - a[i])))
                i += step
            return i
        # The visible part of a line stops half a stroke short of the other
        # stroke's edge; the rest, through the joint, is drawn underneath.
        lead = [0, len(a) - 1]
        for end, step in ((0, 1), (1, -1)):
            own_w = widths[ids[(runs[0] if end == 0 else runs[-1])[0]]]
            if trim[end]:
                lead[end] = walk_in(0 if end == 0 else len(a) - 1, step, trim[end] + own_w * 0.5)
            elif tuck[end]:
                lead[end] = walk_in(0 if end == 0 else len(a) - 1, step, own_w * 0.5)
                caps[end] = False
        if trim[0] or tuck[0]:
            runs[0][1] = max(runs[0][1], lead[0])
        if trim[1] or tuck[1]:
            runs[-1][2] = min(runs[-1][2], lead[1])
        runs = [r for r in runs if r[2] > r[1]]
        if not runs:
            continue
        def emit(l, lo, hi, cap, under=None):
            if hi - lo < 2:
                return
            seg = rdp(a[lo:hi + 1], 0.3)
            piece = {'p': [[round(float(x), 2), round(float(y), 2)] for y, x in seg], 'cap': cap}
            if under is not None:
                # drawn underneath; peels with the end of the line it continues
                piece['under'] = True
                piece['u'] = under
            pieces[ids[l]].append(piece)

        overlap = 3
        for j, (l, s0, s1) in enumerate(runs):
            first, last = j == 0, j == len(runs) - 1
            lo = s0 if first else max(0, s0 - overlap)
            hi = s1 if last else min(len(a) - 1, s1 + overlap)
            emit(l, lo, hi, [caps[0] if first else False, caps[1] if last else False])
        # Past a square end at another stroke's side, carry the line on to the
        # fork underneath everything, so the join has no corner or gap; the
        # other stroke covers this part whatever either one's color.
        if trim[0] or tuck[0]:
            emit(runs[0][0], 0, runs[0][1] + overlap, [True, False], under=0)
        if trim[1] or tuck[1]:
            emit(runs[-1][0], runs[-1][2] - overlap, len(a) - 1, [False, True], under=1)

    out = {'width': w, 'height': h, 'sections': {}}
    for sid in ids:
        if not pieces[sid]:
            print('no lines for', sid)
            continue
        out['sections'][sid] = {'stroke': round(widths[sid], 1), 'paths': pieces[sid]}
        print(f"{sid:28s} stroke {widths[sid]:4.1f}px  lines {len(pieces[sid])}")

    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
