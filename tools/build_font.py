#!/usr/bin/env python3
"""Subset the Galmuri pixel fonts to the characters Ghost-Tactics prints.

Galmuri (c) Lee Minseo, SIL Open Font License 1.1 - https://github.com/quiple/galmuri
The full fonts are ~0.5 MB each; the game needs a few hundred Hangul syllables, so the
subsets come out at a few KB:

    fonts/gtk9.woff2   Galmuri9  (drawn at 10 px / 20 px)
    fonts/gtk11.woff2  Galmuri11 (drawn at 12 px / 24 px)

Re-run after adding Korean text to game.js or index.php:

    pip install fonttools brotli
    python3 tools/build_font.py [path/to/galmuri/dist]

Without a path the script downloads galmuri@2.40.3 with `npm pack`.
"""
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile

from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = ['game.js', 'index.php']
FONTS = [('Galmuri9.ttf', 'fonts/gtk9.woff2'), ('Galmuri11.ttf', 'fonts/gtk11.woff2')]
VERSION = '2.40.3'


def charset():
    chars = set(chr(c) for c in range(0x20, 0x7F))      # ASCII (mixed strings use the font too)
    for name in SOURCES:
        with open(os.path.join(ROOT, name), encoding='utf-8') as f:
            chars |= {ch for ch in f.read() if ord(ch) > 0x7E}
    chars |= set('…·★♥↑→①②③④⑤“”')
    return ''.join(sorted(chars))


def galmuri_dist(arg):
    if arg:
        return arg, None
    tmp = tempfile.mkdtemp()
    subprocess.check_call(['npm', 'pack', 'galmuri@' + VERSION, '--silent'], cwd=tmp)
    with tarfile.open(os.path.join(tmp, 'galmuri-%s.tgz' % VERSION)) as t:
        t.extractall(tmp)
    return os.path.join(tmp, 'package', 'dist'), tmp


def main():
    dist, tmp = galmuri_dist(sys.argv[1] if len(sys.argv) > 1 else None)
    text = charset()
    os.makedirs(os.path.join(ROOT, 'fonts'), exist_ok=True)
    for src, dst in FONTS:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = []
        opts.hinting = False
        opts.desubroutinize = True
        font = subset.load_font(os.path.join(dist, src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        out = os.path.join(ROOT, dst)
        subset.save_font(font, out, opts)
        print('%-18s %5d chars  %6d bytes' % (dst, len(text), os.path.getsize(out)))
    lic = os.path.join(dist, 'LICENSE.txt')
    if os.path.exists(lic):
        shutil.copy(lic, os.path.join(ROOT, 'fonts', 'OFL.txt'))
    if tmp:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
