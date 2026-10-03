#!/usr/bin/env python3
"""
Ghost-Tactics :: sprite atlas builder (development tool - not needed at runtime).

Input : tools/spritesheet.webp  (the GHOST-TACTICS all-in-one pixel asset pack, 2000x1125)
Output: sprites.png  - indexed-colour atlas (shared palette, 1-bit transparency, zopfli)
        sprites.js   - window.GT_SPRITES = {w, h, frames: {name: [x, y, w, h, ax, ay]}}

The sheet is AI-upscaled pixel art (portraits ~2.5x, enemies ~2x, animation frames
~1.4x, backgrounds ~1.6x). Every sprite is keyed off the navy panel, reduced back to
its native pixel grid (coverage-weighted box filter, binary alpha) and snapped to one
shared palette - the "cartridge" approach: tiny file, drawn at integer scale with
nearest-neighbour in game.

(ax, ay) is the anchor: feet (bottom-centre) for characters/props, centre for effects,
top-left for backgrounds/tiles/text.

Usage: pip install pillow numpy scipy && python3 tools/build_atlas.py [--preview] [--colors N]
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'spritesheet.webp')
OUT_DIR = os.environ.get('GT_ATLAS_OUT', ROOT)
OUT_PNG = os.path.join(OUT_DIR, 'sprites.png')
OUT_JS = os.path.join(OUT_DIR, 'sprites.js')
PNG_BUDGET = 96 * 1024

# ------------------------------------------------------------------ sheet layout
GHOST_IDS = ['dracula', 'frank', 'succubus', 'mummy', 'werewolf',
             'gumiho', 'jiangshi', 'palcheok', 'maiden', 'reaper']
# x-ranges of the 10 ghost columns (between the divider lines at 669,811,948,...)
GHOST_COLS = [(582, 668), (671, 810), (814, 947), (950, 1088), (1091, 1228),
              (1231, 1370), (1373, 1512), (1515, 1668), (1671, 1821), (1824, 1988)]
PORTRAIT_Y = (150, 291)
# animation row bands (label rows at y=320,376,436,496,562,623,679)
ROW_NAMES = ['idle', 'walk', 'attack', 'skill', 'hit', 'death', 'spawn']
ROW_BANDS = [(297, 348), (348, 406), (406, 466), (466, 529), (529, 592), (592, 651), (651, 704)]

# Which raw grid frames ship, and under which semantic name (everything else is pruned).
#   idle0/1 walk0/1 atk0/1 : loops   cast : skill pose
#   proj : basic-attack projectile   sfx / sfx2 : skill effect sprites   spawn : spawn effect
# HIT/DEATH rows are near-copies of IDLE on the sheet: the game derives them (flash,
# knockback, dissolve) instead of shipping them. Portraits are replaced by idle0 at 2x.
_COMMON = {'idle0': 'idle0', 'idle1': 'idle1', 'walk0': 'walk0', 'walk1': 'walk2',
           'atk0': 'attack0', 'atk1': 'attack1', 'spawn': 'spawn0'}
GHOST_KEEP = {
    'dracula':  dict(_COMMON, walk1='walk1', cast='skill0a', sfx='skill0b'),
    'frank':    dict(_COMMON, cast='skill0', sfx='skill1'),
    'succubus': dict(_COMMON, cast='skill1'),
    'mummy':    dict(_COMMON, cast='skill0'),
    'werewolf': dict(_COMMON, cast='skill0', sfx='skill1'),
    'gumiho':   dict(_COMMON, cast='skill0', sfx='skill1', proj='attack2'),
    'jiangshi': dict(_COMMON, cast='skill2'),
    'palcheok': dict(_COMMON, cast='skill0', sfx='skill1'),
    'maiden':   dict(_COMMON, cast='skill0', sfx='skill1', proj='attack2'),
    'reaper':   dict(_COMMON, cast='skill0', sfx='skill1', proj='attack2'),
}

S_ANIM = 1.4      # sheet px per native px
S_HALF = 2.8      # spawn bursts / projectiles: half resolution, drawn at 2x (same on-screen size)
S_PORT = 2.5
S_ENEMY = 2.75
S_FX = 2.8       # common effects: drawn at 2x like characters
S_ICON = 1.6
S_STATUS = 2.6
S_BG = 1.6
S_TEXT = 1.75

# explicit rects: name -> (rect, scale, anchor[, opts])
#   anchor: 'feet' | 'center' | 'tl'     opts: {'opaque': True} for full rectangles
RECTS = {
    # ---- enemies (sample) --------------------------------------------------
    'en_skeleton': ([30, 1025, 103, 1107], S_ENEMY, 'feet'),
    'en_zombie':   ([115, 1025, 188, 1106], S_ENEMY, 'feet'),
    'en_ghost':    ([200, 1033, 264, 1106], S_ENEMY, 'feet'),
    'en_slime':    ([280, 1056, 335, 1103], S_ENEMY, 'feet'),
    'en_bat':      ([347, 1044, 409, 1089], S_ENEMY, 'feet'),
    'en_spider':   ([421, 1055, 487, 1100], S_ENEMY, 'feet'),
    'en_wolf':     ([499, 1037, 573, 1103], S_ENEMY, 'feet'),
    'en_ogre':     ([580, 1023, 661, 1104], S_ENEMY, 'feet'),
    'en_demon':    ([671, 1029, 750, 1107], S_ENEMY, 'feet'),
    'en_dragon':   ([764, 1035, 868, 1107], S_ENEMY, 'feet'),

    # ---- common effects ------------------------------------------------------
    'fx_attack0':  ([545, 799, 587, 847], S_FX, 'center'),
    'fx_attack1':  ([537, 846, 597, 933], S_FX, 'center'),
    'fx_hit0':     ([593, 798, 636, 847], S_FX, 'center'),
    'fx_hit1':     ([594, 849, 638, 932], S_FX, 'center'),
    'fx_skill0':   ([642, 799, 689, 848], S_FX, 'center'),
    'fx_skill1':   ([642, 851, 692, 907], S_FX, 'center'),
    'fx_heal0':    ([699, 800, 734, 835], S_FX, 'center'),
    'fx_heal1':    ([698, 863, 730, 901], S_FX, 'center'),
    'fx_heal2':    ([698, 904, 734, 940], S_FX, 'center'),
    'fx_buff0':    ([743, 800, 781, 838], S_FX, 'center'),
    'fx_buff1':    ([743, 840, 787, 933], S_FX, 'center'),
    'fx_debuff0':  ([791, 799, 828, 842], S_FX, 'center'),
    'fx_debuff1':  ([789, 844, 832, 933], S_FX, 'center'),
    'fx_death0':   ([834, 800, 876, 933], S_FX, 'center'),
    'fx_spawn0':   ([884, 803, 923, 838], S_FX, 'center'),
    'fx_spawn1':   ([865, 840, 926, 939], S_FX, 'center'),
    'fx_stun0':    ([932, 802, 965, 834], S_FX, 'center'),
    'fx_stun1':    ([933, 851, 964, 887], S_FX, 'center'),
    'fx_charm0':   ([972, 804, 1008, 836], S_FX, 'center'),
    'fx_charm1':   ([972, 859, 1006, 895], S_FX, 'center'),
    'fx_bind0':    ([1017, 799, 1050, 933], S_FX, 'center'),
    'fx_exec0':    ([1059, 801, 1084, 935], S_FX, 'center'),

    # ---- status icons ---------------------------------------------------------
    'st_skull':    ([1046, 1022, 1081, 1058], S_STATUS, 'center'),
    'st_fire':     ([1143, 1017, 1178, 1054], S_STATUS, 'center'),
    'st_orb':      ([1194, 1019, 1228, 1052], S_STATUS, 'center'),
    'st_seal':    ([1243, 1015, 1282, 1053], S_STATUS, 'center'),
    'st_dizzy':    ([1045, 1057, 1082, 1100], S_STATUS, 'center'),
    'st_hex':     ([1093, 1061, 1128, 1096], S_STATUS, 'center'),
    'st_drop':     ([1144, 1059, 1177, 1097], S_STATUS, 'center'),
    'st_heart':    ([1192, 1060, 1232, 1096], S_STATUS, 'center'),
    'st_swords':   ([1244, 1061, 1279, 1095], S_STATUS, 'center'),

    # ---- UI icons -------------------------------------------------------------
    'ic_sword':    ([1107, 871, 1150, 911], S_ICON, 'center'),
    'ic_shield':   ([1161, 877, 1192, 908], S_ICON, 'center'),
    'ic_skill':    ([1207, 877, 1239, 906], S_ICON, 'center'),
    'ic_heart':    ([1250, 874, 1288, 908], S_ICON, 'center'),
    'ic_coin':     ([1300, 877, 1328, 906], S_ICON, 'center'),
    'ic_star':     ([1424, 875, 1462, 912], S_ICON, 'center'),
    'ic_lvup':     ([1468, 845, 1502, 912], S_ICON, 'center'),

    # ---- misc objects / animals ---------------------------------------------
    'ob_chest':    ([1540, 788, 1590, 832], S_ICON, 'feet'),
    'ob_tree':     ([1537, 878, 1607, 936], S_ICON, 'feet'),
    'ob_bush':     ([1613, 885, 1658, 926], S_ICON, 'feet'),
    'ob_cat':      ([1722, 881, 1767, 921], S_ICON, 'feet'),
    'ob_crow':     ([1779, 879, 1827, 923], S_ICON, 'feet'),
    'ob_rabbit':   ([1837, 879, 1873, 924], S_ICON, 'feet'),
    'ob_pumpkin':  ([1937, 877, 1982, 920], S_ICON, 'feet'),

    # ---- props ---------------------------------------------------------------
    'pr_tomb':     ([23, 705, 62, 759], S_BG, 'feet'),
    'pr_deadtree': ([186, 705, 307, 820], S_BG, 'feet'),
    'pr_lantern':  ([323, 705, 359, 768], S_BG, 'feet'),
    'pr_torii':    ([372, 705, 491, 790], S_BG, 'feet'),
    'pr_stonelamp': ([285, 815, 327, 899], S_BG, 'feet'),
    'pr_pillar':   ([342, 783, 388, 899], S_BG, 'feet'),

    # ---- text banners / logo -----------------------------------------------------
    'tx_logo':       ([8, 4, 440, 48], S_TEXT, 'center'),
    'tx_stageclear': ([1566, 1004, 1771, 1038], S_TEXT, 'center'),
    'tx_gameover':   ([1804, 1001, 1970, 1032], S_TEXT, 'center'),
    'tx_levelup':    ([1585, 1048, 1748, 1091], S_TEXT, 'center'),
    'tx_top10':      ([1804, 1047, 1955, 1091], S_TEXT, 'center'),
}

# Opaque rectangles (no keying): stage backgrounds and floor tiles.
OPAQUE = {
    'bg_graveyard': ([135, 98, 512, 192], S_BG),
    'bg_castle':    ([135, 204, 512, 300], S_BG),
    'bg_forest':    ([135, 309, 512, 405], S_BG),
    'bg_oriental':  ([135, 415, 512, 511], S_BG),
    'bg_hell':      ([135, 519, 512, 615], S_BG),
    'tl_grass':     ([22, 626, 80, 693], S_BG),
    'tl_brick':     ([87, 626, 145, 693], S_BG),
    'tl_sand':      ([151, 626, 209, 693], S_BG),
    'tl_stone':     ([279, 626, 337, 693], S_BG),
    'tl_dark':      ([344, 626, 401, 693], S_BG),
    'tl_lava':      ([406, 626, 463, 693], S_BG),
}

SPRITE_COLOURS = 103   # shared by every character / effect / icon
BG_COLOURS = 20        # per stage backdrop (5 sub-palettes)
TILE_COLOURS = 6       # per floor tile (drawn under a dark wash)

KEY_T = 13          # max-channel distance from the panel colour that counts as background


# ------------------------------------------------------------------ helpers
def border_bg(crop):
    b = np.concatenate([crop[0], crop[-1], crop[:, 0], crop[:, -1]])
    return np.median(b, 0)


def key_mask(crop):
    """Opaque mask: everything not flood-connected to the crop border through bg-like pixels."""
    bg = border_bg(crop)
    d = np.abs(crop.astype(np.int16) - bg).max(2)
    near = d < KEY_T
    lab, n = ndi.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    # enclosed pockets that are plainly panel-coloured (gaps between limbs) are background too
    for i in range(1, n + 1):
        if i in edge:
            continue
        pocket = lab == i
        if pocket.sum() >= 4 and d[pocket].mean() < KEY_T * 0.55:
            bgmask |= pocket
    mask = ~bgmask
    # drop specks
    lab2, n2 = ndi.label(mask, structure=np.ones((3, 3)))
    if n2:
        sizes = ndi.sum(mask, lab2, index=np.arange(1, n2 + 1))
        keep = np.zeros(n2 + 1, bool)
        keep[1:] = sizes >= max(6, sizes.max() * 0.02)
        mask = keep[lab2]
    return mask


def keep_main(mask, near=2):
    """Largest blob plus any blob within `near` px of it (drops loose divider slivers)."""
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n <= 1:
        return mask
    sizes = ndi.sum(mask, lab, index=np.arange(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)
    zone = ndi.binary_dilation(main, iterations=near + 1)
    keep = set(np.unique(lab[zone & mask])) - {0}
    return np.isin(lab, list(keep))


def bbox(mask):
    ys, xs = np.where(mask)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def reduce(crop, mask, scale):
    """Coverage-weighted box reduction to native pixels -> (rgb uint8, alpha bool)."""
    h, w = mask.shape
    nw, nh = max(1, round(w / scale)), max(1, round(h / scale))
    rgb = crop.astype(np.float32) * mask[..., None]
    big = Image.fromarray(np.dstack([rgb, mask * 255.0]).clip(0, 255).astype(np.uint8), 'RGBA')
    # premultiplied BOX resample
    small = np.asarray(big.resize((nw, nh), Image.BOX)).astype(np.float32)
    a = small[..., 3] / 255.0
    col = np.where(a[..., None] > 0.01, small[..., :3] / np.maximum(a[..., None], 0.01), 0)
    return col.clip(0, 255).astype(np.uint8), a >= 0.5


def anchor(alpha, kind):
    h, w = alpha.shape
    if kind == 'feet':
        xs = np.where(alpha[max(0, h - 3):].any(0))[0]
        return (int(np.median(xs)) if len(xs) else w // 2), h - 1
    if kind == 'tl':
        return 0, 0
    return w // 2, h // 2


def split_wide(mask, runs, unit, force=False):
    """Split runs wider than ~1.45 frame widths at deep valleys of column mass (touching frames)."""
    out = []
    colmass = mask.sum(0).astype(float)
    sm = np.convolve(colmass, np.ones(3) / 3, mode='same')
    for s, e in runs:
        w = e - s
        parts = int(round(w / unit))
        if w < unit * 1.45 or parts < 2:
            out.append([s, e]); continue
        mean = colmass[s:e].mean()
        cuts = []
        for j in range(1, parts):
            c = s + int(w * j / parts)
            lo, hi = max(s + 4, c - int(unit * 0.3)), min(e - 4, c + int(unit * 0.3))
            if hi <= lo:
                continue
            x = lo + int(np.argmin(sm[lo:hi]))
            if force or sm[x] < mean * 0.42:
                cuts.append(x)
        prev = s
        for c in cuts:
            out.append([prev, c]); prev = c
        out.append([prev, e])
    return out


def split_cell(mask, expected):
    """Split a cell's foreground into frames at empty column gaps."""
    cols = mask.any(0)
    runs, inrun = [], False
    for x, v in enumerate(cols):
        if v and not inrun:
            s, inrun = x, True
        elif not v and inrun:
            runs.append([s, x]); inrun = False
    if inrun:
        runs.append([s, len(cols)])
    # merge slivers (< 6px wide or tiny mass) into their nearest neighbour
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for i, (s, e) in enumerate(runs):
            mass = mask[:, s:e].sum()
            if e - s < 6 or mass < 40:
                j = i - 1 if i > 0 and (i == len(runs) - 1 or s - runs[i - 1][1] <= runs[i + 1][0] - e) else i + 1
                lo, hi = min(i, j), max(i, j)
                runs[lo] = [runs[lo][0], runs[hi][1]]
                del runs[hi]
                changed = True
                break
    return runs


def ghost_frames(arr):
    out = {}
    report = []
    for gi, gid in enumerate(GHOST_IDS):
        x0, x1 = GHOST_COLS[gi]
        # portrait
        crop = arr[PORTRAIT_Y[0]:PORTRAIT_Y[1], x0:x1]
        m = key_mask(crop)
        # portrait = largest blob in the lower part (skip the name label above)
        lab, n = ndi.label(m, structure=np.ones((3, 3)))
        if n:
            sizes = ndi.sum(m, lab, index=np.arange(1, n + 1))
            big = np.argmax(sizes) + 1
            yy = np.where(lab == big)[0]
            m = m & (np.arange(m.shape[0])[:, None] >= yy.min() - 2)
        bb = bbox(m)
        if bb:
            bx0, by0, bx1, by1 = bb
            out[(gid, 'port')] = (crop[by0:by1, bx0:bx1], m[by0:by1, bx0:bx1], S_PORT, 'feet')
        # animation rows
        for ri, rname in enumerate(ROW_NAMES):
            y0, y1 = ROW_BANDS[ri]
            crop = arr[y0:y1, x0:x1]
            m = key_mask(crop)
            expected = 2 if gid == 'dracula' else 3
            runs = split_cell(m, expected)
            if rname == 'spawn':
                runs = [[runs[0][0], runs[-1][1]]]
            elif gid == 'dracula' and rname == 'skill':
                runs = split_wide(m, runs, (x1 - x0) / 2.6, force=True)
            else:
                runs = split_wide(m, runs, (x1 - x0) / expected)
            report.append('%s.%s:%d' % (gid, rname, len(runs)))
            for k, (s, e) in enumerate(runs):
                sub = m[:, s:e]
                bb = bbox(sub)
                if not bb:
                    continue
                bx0, by0, bx1, by1 = bb
                raw = '%s%d' % (rname, k)
                if gid == 'dracula' and rname == 'skill':
                    raw = 'skill0' + 'ab'[min(k, 1)]
                out[(gid, raw)] = (crop[by0:by1, s + bx0:s + bx1], sub[by0:by1, bx0:bx1], S_ANIM, 'feet')
    return out, report


def despeckle(a, passes=2):
    """Replace isolated single pixels by their 4-neighbour majority (upscaler noise, invisible at 2x)."""
    a = a.copy()
    for _ in range(passes):
        p = np.pad(a, 1, mode='edge')
        st = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
        best = np.zeros_like(a)
        cnt = np.zeros(a.shape, int)
        for k in range(4):
            c = (st == st[k]).sum(0)
            upd = c > cnt
            best[upd] = st[k][upd]
            cnt[upd] = c[upd]
        iso = (st != a).all(0) & (cnt >= 3) & (a != 0) & (best != 0)
        a[iso] = best[iso]
    return a


def main():
    ncolors = 128
    if '--colors' in sys.argv:
        ncolors = int(sys.argv[sys.argv.index('--colors') + 1])
    sheet = Image.open(SRC).convert('RGB')
    arr = np.asarray(sheet)

    raw, report = ghost_frames(arr)
    items = {}
    for gid, keep in GHOST_KEEP.items():
        for sem, rawname in keep.items():
            if (gid, rawname) not in raw:
                raise SystemExit('missing frame %s/%s' % (gid, rawname))
            crop, m, scale, anc = raw[(gid, rawname)]
            if sem in ('sfx', 'proj', 'spawn'):
                anc = 'center'
            else:
                m = keep_main(m)
                bb = bbox(m)
                crop, m = crop[bb[1]:bb[3], bb[0]:bb[2]], m[bb[1]:bb[3], bb[0]:bb[2]]
            if sem in ('proj', 'spawn'):
                scale = S_HALF
            items['%s_%s' % (gid, sem)] = (crop, m, scale, anc)
    for name, spec in RECTS.items():
        (x0, y0, x1, y1), scale, anc = spec[0], spec[1], spec[2]
        crop = arr[y0:y1, x0:x1]
        m = key_mask(crop)
        bb = bbox(m)
        bx0, by0, bx1, by1 = bb
        items[name] = (crop[by0:by1, bx0:bx1], m[by0:by1, bx0:bx1], scale, anc)
    for name, ((x0, y0, x1, y1), scale) in OPAQUE.items():
        crop = arr[y0:y1, x0:x1]
        items[name] = (crop, np.ones(crop.shape[:2], bool), scale, 'tl')

    frames = {}
    for name, (crop, m, scale, anc) in items.items():
        rgb, alpha = reduce(crop, m, scale)
        bb = bbox(alpha)
        if not bb:
            continue
        bx0, by0, bx1, by1 = bb
        rgb, alpha = rgb[by0:by1, bx0:bx1], alpha[by0:by1, bx0:bx1]
        frames[name] = (rgb, alpha, anchor(alpha, anc))

    # ---- palette: shared sprite palette + one small sub-palette per backdrop/tile --
    def median_cut(pixels, k):
        side = int(np.ceil(np.sqrt(len(pixels))))
        pad = np.zeros((side * side, 3), np.uint8)
        pad[:len(pixels)] = pixels
        pad[len(pixels):] = pixels[0]
        q = Image.fromarray(pad.reshape(side, side, 3), 'RGB').quantize(
            colors=k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        return np.array(q.getpalette()[:3 * k], np.int32).reshape(-1, 3)

    def kmeans_pal(pixels, k):
        """Median-cut seed refined by k-means; the brightest/most saturated colours are
        weighted up so small highlights (the moon, lava sparks) keep their own entry."""
        from scipy.cluster.vq import kmeans2
        px = pixels.reshape(-1, 3).astype(np.float64)
        lum = px @ np.array([0.299, 0.587, 0.114])
        sat = px.max(1) - px.min(1)
        hot = px[(lum > np.percentile(lum, 98.5)) | (sat > np.percentile(sat, 99))]
        data = np.concatenate([px] + [hot] * 12) if len(hot) else px
        seed = median_cut(pixels.reshape(-1, 3).astype(np.uint8), k).astype(np.float64)
        cent, _ = kmeans2(data, seed, iter=12, minit='matrix')
        return np.clip(np.round(cent), 0, 255).astype(np.int32)

    def nearest(rgb, pal):
        flat = rgb.reshape(-1, 3).astype(np.int32)
        return ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(2).argmin(1).reshape(rgb.shape[:2])

    def majority3(a):
        """3x3 mode filter (removes AI speckle in flat backdrop areas)."""
        p = np.pad(a, 1, mode='edge')
        stack = np.stack([p[y:y + a.shape[0], x:x + a.shape[1]] for y in range(3) for x in range(3)])
        best, cnt = a.copy(), np.zeros(a.shape, int)
        for k in range(9):
            c = (stack == stack[k]).sum(0)
            upd = c > cnt
            best[upd] = stack[k][upd]
            cnt[upd] = c[upd]
        return np.where(cnt >= 5, best, a)

    opaque = [n for n in frames if n in OPAQUE]
    sprite_names = [n for n in frames if n not in OPAQUE]
    pix = np.concatenate([frames[n][0][frames[n][1]] for n in sprite_names])
    sprite_pal = median_cut(pix, SPRITE_COLOURS)
    palette = [sprite_pal]
    next_index = 1 + len(sprite_pal)
    sub = {}
    for n in opaque:
        k = BG_COLOURS if n.startswith('bg_') else TILE_COLOURS
        sp = kmeans_pal(frames[n][0], k)
        sub[n] = (next_index, sp)
        palette.append(sp)
        next_index += len(sp)
    if next_index > 256:
        raise SystemExit('palette overflow: %d entries' % next_index)

    def to_index(name, rgb, alpha):
        if name in sub:
            base, sp = sub[name]
            return majority3(nearest(rgb, sp) + base).astype(np.uint8)
        idx = nearest(rgb, sprite_pal) + 1        # 0 = transparent
        return np.where(alpha, idx, 0).astype(np.uint8)

    # ---- pack (shelf, tallest first, 2px gutter so outlines never bleed) ----------
    width = 512
    order = sorted(frames, key=lambda n: (n in OPAQUE, -frames[n][0].shape[0], -frames[n][0].shape[1]))
    x = y = shelf = 0
    pos = {}
    for n in order:
        h, w = frames[n][0].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 2, 0
        pos[n] = (x, y)
        x += w + 2
        shelf = max(shelf, h)
    height = y + shelf

    atlas = np.zeros((height, width), np.uint8)
    meta = {}
    for n in sorted(frames):
        rgb, alpha, (ax, ay) = frames[n]
        h, w = alpha.shape
        px, py = pos[n]
        atlas[py:py + h, px:px + w] = to_index(n, rgb, alpha)
        meta[n] = [px, py, w, h, ax, ay]

    # despeckle sprite pixels only (backdrops already got the majority filter)
    spr_mask = (atlas > 0) & (atlas < 1 + len(sprite_pal))
    atlas = np.where(spr_mask, despeckle(np.where(spr_mask, atlas, 0)), atlas).astype(np.uint8)

    out = Image.fromarray(atlas, 'P')
    flat_pal = [0, 0, 0] + np.concatenate(palette).flatten().tolist()
    out.putpalette(flat_pal + [0] * (768 - len(flat_pal)))
    tmp = OUT_PNG + '.tmp'
    out.save(tmp, 'PNG', optimize=True, transparency=0)
    data = open(tmp, 'rb').read()
    os.remove(tmp)
    try:
        import zopfli.png
        data = zopfli.png.optimize(data)
    except ImportError:
        print('(zopfli not installed - pip install zopfli for a smaller PNG)')
    with open(OUT_PNG, 'wb') as f:
        f.write(data)
    with open(OUT_JS, 'w') as f:
        f.write('/* Generated by tools/build_atlas.py from tools/spritesheet.webp - do not edit. */\n')
        f.write('window.GT_SPRITES=' + json.dumps({'w': width, 'h': height, 'frames': meta},
                                                  separators=(',', ':')) + ';\n')
    size = os.path.getsize(OUT_PNG)
    print('atlas %dx%d  frames=%d  palette=%d  png=%d bytes  js=%d bytes' % (
        width, height, len(meta), next_index, size, os.path.getsize(OUT_JS)))
    print('row splits:', ' '.join(report))
    if size > PNG_BUDGET:
        raise SystemExit('sprites.png is over the %d byte budget' % PNG_BUDGET)

    if '--preview' in sys.argv:
        prev = Image.new('RGBA', (width, height), (20, 28, 44, 255))
        prev.alpha_composite(Image.open(OUT_PNG).convert('RGBA'))
        prev = prev.resize((width * 2, height * 2), Image.NEAREST)
        prev.save(os.path.join(OUT_DIR, 'atlas_preview.png'))


if __name__ == '__main__':
    main()
