/*
 * Ghost-Tactics :: game.js  (v2 - pixel asset pack edition)
 * Retro 2D tactical auto-battler. Vanilla JS + Canvas 2D.
 *
 *  - 3 x 6 battle grid (player owns the left 3 columns, enemies the right 3)
 *  - drag & drop / tap-to-place, 8-slot bench, 5-card shop, 3-copy star merges
 *  - procedural levels 1..999:  HP = BaseHP*1.045^L,  ATK = BaseATK*1.038^L
 *  - nearest-target grid AI, MP bars and 10 unique ghost skills
 *  - one indexed-colour atlas (sprites.png, ~88 KB) drawn at integer scale,
 *    tint variants derived at runtime (0 extra bytes), everything else procedural
 *  - game feel: hit-stop, trauma shake, flash, knockback, squash & stretch,
 *    cast telegraphs, crit numbers, slow-motion finales, banners
 *  - arcade 3-letter high-score entry + AJAX leaderboard (save.php)
 */
(() => {
  'use strict';

  // =====================================================================
  //  LAYOUT
  //   landscape: logical 640x480 (PC, phones held sideways)
  //   portrait : logical 480 x 760..940, the height follows the screen (phones held upright).
  //              The board is turned: enemies on top, your side at the bottom, the console
  //              (bench / shop / buttons) under it, so thumbs reach everything.
  //  applyLayout() rewrites these; everything below reads them at draw / input time.
  // =====================================================================
  const ROWS = 3, COLS = 10, PCOLS = 5;          // 3x5 per side: player up to 9 units, enemies up to 15
  const BENCH_N = 8, SHOP_N = 5;
  let W = 640, H = 480, PORTRAIT = false;
  let BOARD_X, BOARD_Y, CELL_W, CELL_H, FEET, STAGE_Y, CONSOLE_Y, FLOOR_Y, MID_Y, HUD_H;
  let BENCH_X, BENCH_Y, SLOT_W, SLOT_H, SLOT_GAP;
  let SHOP_X, SHOP_Y, CARD_W, CARD_H, CARD_GAP;
  let BTN_REROLL, BTN_ALTAR, BTN_FIGHT, BTN_SPEED, BOX_TIMER, BOX_LOG, BTN_SOUND, BTN_HELP, HIT_SOUND;
  let SYN, INFO, BTN_SELL, SELL_ZONE, BOSSBAR, TITLE_BTNS, GOLD_POS, HEART_X;

  function applyLayout(portrait, h) {
    PORTRAIT = !!portrait;
    if (!PORTRAIT) {
      W = 640; H = 480; HUD_H = 28;
      BOARD_X = 4; BOARD_Y = 116; CELL_W = 56; CELL_H = 64; FEET = 8;
      STAGE_Y = 28; CONSOLE_Y = 308; FLOOR_Y = 205; MID_Y = 200;
      BENCH_X = 66; BENCH_Y = 314; SLOT_W = 60; SLOT_H = 52; SLOT_GAP = 64;
      SHOP_X = 8; SHOP_Y = 372; CARD_W = 90; CARD_H = 104; CARD_GAP = 96;
      BTN_REROLL = { x: 492, y: 372, w: 68, h: 48 };
      BTN_ALTAR = { x: 564, y: 372, w: 68, h: 48 };
      BTN_FIGHT = { x: 492, y: 424, w: 140, h: 52 };
      BTN_SPEED = { x: 492, y: 372, w: 140, h: 48 };
      BOX_TIMER = { x: 492, y: 424, w: 140, h: 52 };
      BOX_LOG = { x: 8, y: 372, w: 478, h: 104 };
      BTN_SOUND = { x: 596, y: 3, w: 40, h: 22 };
      BTN_HELP = { x: 552, y: 3, w: 30, h: 22 };
      HIT_SOUND = { x: 586, y: 0, w: 54, h: 30 };
      SYN = { x: 4, y: 31, w: 168, h: 42 };       // synergy strip over the sky
      INFO = { x: 566, y: 116, w: 72, h: 192 };
      BTN_SELL = { x: 569, y: 268, w: 66, h: 36 };
      SELL_ZONE = { x: SHOP_X - 4, y: SHOP_Y - 4, w: BTN_REROLL.x - SHOP_X, h: H - SHOP_Y + 4 };
      BOSSBAR = { x: 180, y: 32, w: 280, h: 22 };
      GOLD_POS = { x: 256, y: 14 }; HEART_X = 158;
      TITLE_BTNS = {
        start: { x: 120, y: 272, w: 196, h: 44 },
        cont: { x: 324, y: 272, w: 196, h: 44 },
        help: { x: 120, y: 324, w: 196, h: 36 },
        rank: { x: 324, y: 324, w: 196, h: 36 },
        sound: { x: 222, y: 368, w: 196, h: 32 }
      };
    } else {
      W = 480; H = clamp(Math.round(h || 820), 760, 940); HUD_H = 46;
      STAGE_Y = HUD_H; CONSOLE_Y = H - 238;
      // console: bench label row, 8 bench slots, 5 shop cards, one row of big buttons
      BENCH_X = 10; BENCH_Y = CONSOLE_Y + 16; SLOT_W = 54; SLOT_H = 52; SLOT_GAP = 58;
      SHOP_X = 7; SHOP_Y = BENCH_Y + SLOT_H + 6; CARD_W = 90; CARD_H = 104; CARD_GAP = 94;
      const by = SHOP_Y + CARD_H + 6;
      BTN_REROLL = { x: 7, y: by, w: 106, h: 50 };
      BTN_ALTAR = { x: 119, y: by, w: 106, h: 50 };
      BTN_FIGHT = { x: 231, y: by, w: 242, h: 50 };
      BTN_SPEED = { x: 7, y: by, w: 218, h: 50 };
      BOX_TIMER = { x: 231, y: by, w: 242, h: 50 };
      BOX_LOG = { x: 7, y: SHOP_Y, w: 466, h: CARD_H };
      // HUD buttons sit on the HUD's second row: a finger's width away from the ad above
      BTN_HELP = { x: 380, y: 22, w: 38, h: 22 };
      BTN_SOUND = { x: 424, y: 22, w: 50, h: 22 };
      HIT_SOUND = { x: 420, y: 18, w: 60, h: 28 };
      // board: 3 columns x 10 rows (enemy rows on top), anchored to the console; spare height = sky
      CELL_W = 112; FEET = 5;
      CELL_H = clamp(Math.floor((CONSOLE_Y - 8 - (STAGE_Y + 36)) / 10), 42, 56);
      BOARD_X = 4; BOARD_Y = CONSOLE_Y - 8 - 10 * CELL_H;
      MID_Y = BOARD_Y + PCOLS * CELL_H;
      FLOOR_Y = STAGE_Y + 177;
      // right column: synergy + info / help / sell
      SYN = { x: 344, y: STAGE_Y + 4, w: 132, h: 44 };
      INFO = { x: 344, y: SYN.y + SYN.h + 4, w: 132, h: Math.min(300, CONSOLE_Y - 10 - (SYN.y + SYN.h + 4)) };
      BTN_SELL = { x: INFO.x + 6, y: INFO.y + INFO.h - 44, w: INFO.w - 12, h: 38 };
      SELL_ZONE = { x: 0, y: SHOP_Y - 4, w: W, h: CARD_H + 8 };
      BOSSBAR = { x: 6, y: STAGE_Y + 4, w: 332, h: 24 };
      GOLD_POS = { x: 226, y: 13 }; HEART_X = 120;
      const ty = H - 330;
      TITLE_BTNS = {
        start: { x: 60, y: ty, w: 360, h: 54 },
        cont: { x: 60, y: ty + 62, w: 360, h: 54 },
        help: { x: 60, y: ty + 124, w: 176, h: 44 },
        rank: { x: 244, y: ty + 124, w: 176, h: 44 },
        sound: { x: 140, y: ty + 176, w: 200, h: 36 }
      };
    }
  }

  // palette tokens sampled from the sheet
  const C = {
    panel: '#061119', cell: '#0c1d2c', line: '#4e6886', lineHi: '#7f9cc0', grid: '#48576e',
    sel: '#e0484f', hover: '#3ea7ca', text: '#c2d3f2', dim: '#6f86a6', gold: '#f8d838',
    hpFoe: '#db232a', hpAlly: '#4ad04a', mp: '#3bc1f4', west: '#ff9a9a', east: '#9adfff'
  };

  // =====================================================================
  //  RULES
  // =====================================================================
  const MAX_LEVEL = 999;
  const START_GOLD = 10, START_LIVES = 3, MAX_LIVES = 5;
  const REROLL_COST = 2, BATTLE_LIMIT = 60;
  const STAR_MUL = [0, 1, 1.8, 3.24];
  const HP_GROWTH = 1.045, ATK_GROWTH = 1.038;
  const ENEMY_BASE = 0.8;              // enemy BaseHP/BaseATK = spirit's base * 0.8
  const BOSS_HP = 3, BOSS_ATK = 1.5;   // bosses carry their own (larger) BaseHP/BaseATK
  const POWER_STEP = 1.06;             // altar: +6% HP/ATK per level (multiplicative)
  const CRIT_CHANCE = 0.1, CRIT_MUL = 1.5;

  // game-feel tuning (seconds / px)
  const J = {
    stopBudget: 0.18,
    stop: { crit: 0.05, skill: 0.066, aoe: 0.083, kill: 0.083, allyDown: 0.05, execute: 0.2, final: 0.133, boss: 0.25 },
    local: { melee: 0.05, ranged: 0.033, crit: 0.083, skill: 0.1, allyDown: 0.12 },
    shake: { crit: 0.22, skill: 0.3, aoe: 0.45, kill: 0.3, allyDown: 0.25, execute: 0.7, final: 0.55, boss: 0.9, bossHit: 0.1 },
    kb: { normal: [3, 0.1], crit: [6, 0.14], skill: [8, 0.16], kill: [12, 0.2] },
    castTime: 0.2
  };

  // tolerate an older sound.js (feature-detect the newer calls)
  if (typeof Sound.duck !== 'function') Sound.duck = () => {};

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  //  UTILS
  // =====================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad3 = n => String(n).padStart(3, '0');
  const inRect = (p, r, slop) => { slop = slop || 0; return p.x >= r.x - slop && p.x < r.x + r.w + slop && p.y >= r.y - slop && p.y < r.y + r.h + slop; };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  applyLayout(false);   // the real choice is made by fitStage() at boot

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SUFFIX = ['K', 'M', 'B', 'T', 'QA', 'QI', 'SX', 'SP', 'OC', 'NO', 'DC'];
  function fmt(n) {
    n = Math.max(0, Math.round(n));
    if (n < 10000) return String(n);
    let u = -1;
    while (n >= 1000 && u < SUFFIX.length - 1) { n /= 1000; u++; }
    return (n < 10 ? n.toFixed(1) : String(Math.floor(n))) + SUFFIX[u];
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  function playerId() {
    let id = store.get('gt_pid');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      const b = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(b);
      id = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      store.set('gt_pid', id);
    }
    return id;
  }

  // =====================================================================
  //  5x7 BITMAP FONT (0 bytes of assets) + styled outline variant
  // =====================================================================
  const FONT = {
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.', 'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E': '#####|#....|#....|####.|#....|#....|#####', 'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####', 'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '.###.|..#..|..#..|..#..|..#..|..#..|.###.', 'J': '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N': '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.####|#....|#....|.###.|....#|....#|####.', 'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', 'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
    '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '..##.|.#...|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
    ' ': '.....|.....|.....|.....|.....|.....|.....', '.': '.....|.....|.....|.....|.....|.##..|.##..',
    ',': '.....|.....|.....|.....|.##..|..#..|.#...', ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
    '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
    '-': '.....|.....|.....|#####|.....|.....|.....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '%': '##...|##..#|...#.|..#..|.#...|#..##|...##', '/': '.....|....#|...#.|..#..|.#...|#....|.....',
    '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
    "'": '..#..|..#..|.#...|.....|.....|.....|.....', '*': '..#..|..#..|#####|.###.|.#.#.|#...#|.....',
    '@': '.....|.#.#.|#####|#####|.###.|..#..|.....', '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
    '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...', '=': '.....|.....|#####|.....|#####|.....|.....',
    '_': '.....|.....|.....|.....|.....|.....|#####', '#': '.#.#.|#####|.#.#.|.#.#.|.#.#.|#####|.#.#.',
    '·': '.....|.....|.....|..#..|.....|.....|.....'
  };
  const GLYPH = {};
  Object.keys(FONT).forEach(k => { GLYPH[k] = FONT[k].split('|'); });
  const glyphOn = (ch, r, q) => { const g = GLYPH[ch] || GLYPH['?']; return g[r].charCodeAt(q) === 35; };

  // Glyph sprites are rendered once per (char, colour, scale) and blitted per
  // character: bounded memory, zero allocations per frame (damage numbers churn).
  const glyphCache = new Map();
  let styleSeq = 0;
  function glyphImg(ch, color, scale, shadow) {
    const key = ch + '\u0001' + color + scale + (shadow ? 's' : '');
    let c = glyphCache.get(key);
    if (c) return c;
    const sh = shadow ? scale : 0;
    c = document.createElement('canvas');
    c.width = 5 * scale + sh; c.height = 7 * scale + sh;
    const g = c.getContext('2d');
    const draw = (col, ox, oy) => {
      g.fillStyle = col;
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (glyphOn(ch, r, q)) g.fillRect(ox + q * scale, oy + r * scale, scale, scale);
    };
    if (shadow) draw('#000', sh, sh);
    draw(color, 0, 0);
    glyphCache.set(key, c);
    return c;
  }
  // outlined two-tone glyph (damage numbers, banners) styled like the sheet's DAMAGE NUMBER art
  //   st = {top, bot, out, split, alt}
  function styledGlyph(ch, st, scale, odd) {
    if (st.id == null) st.id = ++styleSeq;
    const key = '\u0002' + ch + st.id + 'x' + scale + (odd ? 'o' : '');
    let c = glyphCache.get(key);
    if (c) return c;
    const s = scale;
    c = document.createElement('canvas');
    c.width = 7 * s; c.height = 9 * s;
    const g = c.getContext('2d');
    g.fillStyle = st.out;
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (glyphOn(ch, r, q)) g.fillRect(q * s, r * s, s * 3, s * 3);
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
      if (!glyphOn(ch, r, q)) continue;
      g.fillStyle = odd && st.alt ? st.alt : r < (st.split || 2) ? st.top : st.bot;
      g.fillRect((q + 1) * s, (r + 1) * s, s, s);
    }
    glyphCache.set(key, c);
    return c;
  }

  // Plain UI text: one cached canvas per string (panels change rarely, so this
  // keeps draw calls low); bounded LRU-ish cache.
  const textCache = new Map();
  function textImage(str, color, scale, shadow) {
    const key = str + '\u0001' + color + scale + (shadow ? 's' : '');
    let c = textCache.get(key);
    if (c) return c;
    if (textCache.size > 600) textCache.clear();
    const n = str.length, sh = shadow ? scale : 0;
    c = document.createElement('canvas');
    c.width = Math.max(1, n * 6 * scale + sh); c.height = 7 * scale + sh;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) if (str[i] !== ' ') g.drawImage(glyphImg(str[i], color, scale, shadow), i * 6 * scale, 0);
    textCache.set(key, c);
    return c;
  }

  // ---- Korean text: subset of the Galmuri pixel font (fonts/gtk9.woff2 10px, fonts/gtk11.woff2 12px).
  // Any string with a non-ASCII character goes through here; the glyph band is centred on
  // the 5x7 font's 7*scale box, so every layout written for the bitmap font stays aligned.
  const NON_ASCII = /[^\x00-\x7e·]/;
  const KO_SIZE = { 1: ['GTK9', 10], 2: ['GTK11', 12], 3: ['GTK9', 20], 4: ['GTK11', 24] };
  function koFont(scale) {
    const s = KO_SIZE[scale] || ['GTK11', 12 * Math.max(1, Math.round(scale / 2))];
    return { css: s[1] + 'px ' + s[0] + ', "Malgun Gothic", "Apple SD Gothic Neo", sans-serif', px: s[1] };
  }
  const mctx = document.createElement('canvas').getContext('2d');
  const koMetric = new Map();
  function koMetrics(scale) {
    let m = koMetric.get(scale);
    if (m) return m;
    const f = koFont(scale);
    mctx.font = f.css;
    const t = mctx.measureText('가힣Ag');
    m = { f, asc: Math.ceil(t.actualBoundingBoxAscent || f.px * 0.9), desc: Math.ceil(t.actualBoundingBoxDescent || f.px * 0.2) };
    koMetric.set(scale, m);
    return m;
  }
  function koWidth(str, scale) { mctx.font = koFont(scale).css; return Math.ceil(mctx.measureText(str).width); }
  function textWidth(str, scale) {
    str = String(str); scale = scale || 1;
    return NON_ASCII.test(str) ? koWidth(str, scale) : str.length * 6 * scale - scale;
  }
  function koImage(str, color, scale, shadow) {
    const m = koMetrics(scale), sh = shadow ? Math.max(1, Math.round(m.f.px / 10)) : 0;
    const c = document.createElement('canvas');
    c.width = Math.max(1, koWidth(str, scale) + sh); c.height = m.asc + m.desc + sh;
    const g = c.getContext('2d');
    g.font = m.f.css;
    if (sh) { g.fillStyle = '#000'; g.fillText(str, sh, m.asc + sh); }
    g.fillStyle = color; g.fillText(str, 0, m.asc);
    return c;
  }
  // outlined two-tone Korean (callouts, banners), cached per string
  const koStyled = new Map();
  function koStyledImage(str, st, scale) {
    if (st.id == null) st.id = ++styleSeq;
    const key = str + '\u0003' + st.id + 'x' + scale;
    let c = koStyled.get(key);
    if (c) return c;
    if (koStyled.size > 200) koStyled.clear();
    const m = koMetrics(scale), r = Math.max(1, Math.round(m.f.px / 10));
    c = document.createElement('canvas');
    c.width = koWidth(str, scale) + 2 * r; c.height = m.asc + m.desc + 2 * r;
    const g = c.getContext('2d');
    g.font = m.f.css;
    g.fillStyle = st.out;
    for (let dy = -r; dy <= r; dy += r) for (let dx = -r; dx <= r; dx += r) g.fillText(str, r + dx, r + m.asc + dy);
    const grad = g.createLinearGradient(0, r, 0, r + m.asc + m.desc);
    const k = Math.min(0.95, (st.split || 2) / 7);
    grad.addColorStop(0, st.top); grad.addColorStop(k, st.top); grad.addColorStop(Math.min(1, k + 0.01), st.bot); grad.addColorStop(1, st.bot);
    g.fillStyle = grad;
    g.fillText(str, r, r + m.asc);
    koStyled.set(key, c);
    return c;
  }
  // the fonts arrive asynchronously: re-render cached strings once they are in
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('10px GTK9', '가'), document.fonts.load('12px GTK11', '가')])
      .then(() => { textCache.clear(); koStyled.clear(); koMetric.clear(); }).catch(() => {});
  }

  function text(str, x, y, color, scale, align, shadow) {
    str = String(str);
    if (!str.length) return;
    scale = scale || 1;
    const ko = NON_ASCII.test(str);
    if (!ko) str = str.toUpperCase();
    let img = null, w, dy = y;
    if (ko) {
      const key = str + '\u0004' + (color || '#fff') + scale + (shadow !== false ? 's' : '');
      img = textCache.get(key);
      if (!img) { if (textCache.size > 600) textCache.clear(); img = koImage(str, color || '#fff', scale, shadow !== false); textCache.set(key, img); }
      const m = koMetrics(scale);
      w = img.width - (shadow !== false ? Math.max(1, Math.round(m.f.px / 10)) : 0);
      dy = y + Math.round((7 * scale - (m.asc + m.desc)) / 2);
    } else {
      img = textImage(str, color || '#fff', scale, shadow !== false);
      w = str.length * 6 * scale - scale;
    }
    let dx = x;
    if (align === 'center') dx = x - Math.floor(w / 2);
    else if (align === 'right') dx = x - w;
    ctx.drawImage(img, Math.round(dx), Math.round(dy));
  }

  // longest prefix of str that fits in maxPx (with an ellipsis when cut)
  function fitText(str, maxPx, scale) {
    str = String(str);
    if (textWidth(str, scale) <= maxPx) return str;
    let s = str;
    while (s.length > 1 && textWidth(s + '…', scale) > maxPx) s = s.slice(0, -1);
    return s + '…';
  }

  // Damage numbers / banners: per-glyph blits (high churn -> no per-string canvases)
  function textStyled(str, x, y, st, scale, align, k) {
    str = String(str);
    if (NON_ASCII.test(str)) {
      const img = koStyledImage(str, st, scale);
      const sc = k || 1, dw = Math.round(img.width * sc), dh = Math.round(img.height * sc);
      let dx = x - dw / 2;
      if (align === 'left') dx = x;
      else if (align === 'right') dx = x - dw;
      ctx.drawImage(img, Math.round(dx), Math.round(y - dh / 2), dw, dh);
      return;
    }
    str = str.toUpperCase();
    const n = str.length;
    const sc = k || 1;
    const adv = 6 * scale * sc, gw = 7 * scale * sc, gh = 9 * scale * sc;
    const w = (n * 6 + 2) * scale * sc;
    let dx = x - w / 2;
    if (align === 'left') dx = x;
    else if (align === 'right') dx = x - w;
    const dy = Math.round(y - gh / 2);
    for (let i = 0; i < n; i++) {
      const ch = str[i];
      if (ch !== ' ') ctx.drawImage(styledGlyph(ch, st, scale, i % 2 === 1), Math.round(dx + i * adv), dy, Math.round(gw), Math.round(gh));
    }
  }

  // word wrap to `max` bitmap characters (6 px each at scale 1); Korean wraps by pixel width
  function wrap(str, max, scale) {
    str = String(str); scale = scale || 1;
    const maxPx = max * 6 * scale;
    const fits = s => textWidth(s, scale) <= maxPx;
    const words = (NON_ASCII.test(str) ? str : str.toUpperCase()).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach(w => {
      if (!cur.length) cur = w;
      else if (fits(cur + ' ' + w)) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
      while (!fits(cur) && cur.length > 1) {   // a single word wider than the line
        let i = cur.length - 1;
        while (i > 1 && !fits(cur.slice(0, i))) i--;
        lines.push(cur.slice(0, i)); cur = cur.slice(i);
      }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  const NUM = {
    normal: { top: '#f8d878', bot: '#f0b040', out: '#502000' },
    hurt: { top: '#ff8080', bot: '#d04040', out: '#400000' },
    skill: { top: '#e060d0', bot: '#9070e0', out: '#2a1850', alt: '#e060d0', split: 7 },
    crit: { top: '#ffa0a0', bot: '#e05050', out: '#400000' },
    heal: { top: '#c0f0c0', bot: '#40b060', out: '#0a3018' },
    dot: { top: '#b8a0ff', bot: '#8060d0', out: '#1a1040' },
    block: { top: '#e0f0f0', bot: '#60c0f0', out: '#0a2040' },
    exec: { top: '#ff6060', bot: '#e03030', out: '#400000' },
    banner: { top: '#f8e070', bot: '#e0b030', out: '#502000', split: 3 },
    red: { top: '#ff6060', bot: '#a01818', out: '#200000', split: 4 },
    blue: { top: '#d0f4ff', bot: '#3ea7ca', out: '#06202c', split: 3 }
  };

  // =====================================================================
  //  ATLAS (one indexed-colour image; tints derived at runtime)
  // =====================================================================
  const SP = window.GT_SPRITES || { w: 1, h: 1, frames: {} };
  const FR = SP.frames;
  let atlas = null, atlasState = 'loading';
  const TINT = {};     // w(hite) r(ed) p(ink) v(iolet) k(dark)

  function tintCanvas(color) {
    const c = document.createElement('canvas');
    c.width = atlas.width; c.height = atlas.height;
    const g = c.getContext('2d');
    g.drawImage(atlas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  (function loadAtlas() {
    const ver = window.GT_ASSET_VER ? '?v=' + encodeURIComponent(window.GT_ASSET_VER) : '';
    const img = new Image();
    let retried = false;
    img.onload = () => {
      atlas = img;
      TINT.w = tintCanvas('#ffffff'); TINT.r = tintCanvas('#ff3030');
      TINT.p = tintCanvas('#e060a0'); TINT.v = tintCanvas('#9060ff'); TINT.k = tintCanvas('#000000');
      TINT.b = tintCanvas('#3ca0ff'); TINT.g = tintCanvas('#ffc020'); TINT.i = tintCanvas('#b8f0ff');
      atlasState = 'ready';
      zoneLayer = null;
    };
    img.onerror = () => {
      if (!retried) { retried = true; img.src = 'sprites.png?r=' + Date.now(); }   // one cache-busting retry
      else atlasState = 'error';
    };
    img.src = 'sprites.png' + ver;
  })();

  // draw frame `name` with its anchor at (x, y), integer scale s (default 2)
  //   o: {flip, a (alpha), tint:'w'|'r'|'p'|'v'|'k', sx, sy (squash)}
  function spr(name, x, y, s, o) {
    const f = FR[name];
    if (!f || atlasState !== 'ready') return;
    s = s || 2;
    const src = o && o.tint ? TINT[o.tint] : atlas;
    const a = o && o.a != null ? o.a : 1;
    if (a <= 0.01) return;
    const prev = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = prev * a;
    // squash/stretch adds or drops whole native rows/columns (no uneven pixels)
    const nw = o && o.sx ? Math.max(1, Math.round(f[2] * o.sx)) : f[2];
    const nh = o && o.sy ? Math.max(1, Math.round(f[3] * o.sy)) : f[3];
    const w = nw * s, h = nh * s;
    const ax = Math.round(f[4] * nw / f[2]) * s, ay = Math.round(f[5] * nh / f[3]) * s;
    if (o && o.flip) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(src, f[0], f[1], f[2], f[3], -ax, -ay, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(src, f[0], f[1], f[2], f[3], Math.round(x) - ax, Math.round(y) - ay, w, h);
    }
    if (a < 1) ctx.globalAlpha = prev;
  }
  const fh = (name, s) => (FR[name] ? FR[name][3] * (s || 2) : 0);

  // =====================================================================
  //  ROSTER  (PRD: 10 ghosts, named skills)
  // =====================================================================
  const GHOSTS = [
    { id: 'dracula', name: '드라큘라', short: '드라큘라', origin: 'W', cls: 'melee', role: '근접 흡혈', cost: 3, hp: 640, atk: 52, range: 1, aspd: 0.9, move: 0.42, mp: 80, lifesteal: 0.2,
      color: '#e03030', skill: '피의 만찬', desc: '공격력 250% 물기. 준 피해만큼 회복 (기본 흡혈 20%)', lines: ['피를 다오!', '맛있겠군…', '목덜미가 하얗구나…', '밤은 나의 시간!'] },
    { id: 'frank', name: '프랑켄슈타인', short: '프랑켄', origin: 'W', cls: 'tank', role: '탱커', cost: 2, hp: 980, atk: 38, range: 1, aspd: 0.6, move: 0.55, mp: 100,
      color: '#60e0f0', skill: '전기 충격', desc: '대상과 주변 적에게 150% 피해 + 1.5초 기절', lines: ['찌릿찌릿!', '으어어어!', '번개 맛 좀 봐라!', '박사님… 보고 계세요?'] },
    { id: 'succubus', name: '서큐버스', short: '서큐버스', origin: 'W', cls: 'ranged', role: '원거리', cost: 3, hp: 480, atk: 46, range: 3, aspd: 0.85, move: 0.45, mp: 90, proj: 'fx_charm1',
      color: '#ff70d8', skill: '매혹', desc: '사거리 안 가장 강한 적을 3초 매혹. 제 편을 공격해요', lines: ['내 눈을 봐♥', '이리 와~', '나만 바라봐♥', '거절은 안 받아~'] },
    { id: 'mummy', name: '미라', short: '미라', origin: 'W', cls: 'tank', role: '서브 탱커', cost: 1, hp: 820, atk: 40, range: 1, aspd: 0.7, move: 0.55, mp: 90,
      color: '#e8d8a8', skill: '붕대 감기', desc: '체력이 가장 많은 적에게 120% 피해 + 2.5초 기절', lines: ['꽁꽁 묶어주마!', '붕대 발사!', '파라오의 저주다!', '삼천 년 묵은 붕대!'] },
    { id: 'werewolf', name: '늑대인간', short: '늑대인간', origin: 'W', cls: 'melee', role: '근접 딜러', cost: 2, hp: 600, atk: 58, range: 1, aspd: 1.0, move: 0.32, mp: 70,
      color: '#f08828', skill: '피의 광란', desc: '4초간 공격 속도 2배 + 체력 15% 회복', lines: ['아우우우~!', '피가 끓는다!', '보름달이 뜬다!', '야성을 깨워라!'] },
    { id: 'gumiho', name: '구미호', short: '구미호', origin: 'E', cls: 'ranged', role: '원거리 딜러', cost: 3, hp: 450, atk: 56, range: 3, aspd: 0.8, move: 0.45, mp: 80, proj: 'gumiho_proj',
      color: '#ffb030', skill: '여우 구슬', desc: '관통하는 구슬. 지나가는 모든 적에게 200% 피해', lines: ['여우 구슬!', '홀려 주마~', '꼬리 아홉 개의 힘!', '간을 내놓아라~'] },
    { id: 'jiangshi', name: '강시', short: '강시', origin: 'E', cls: 'tank', role: '근접 탱커', cost: 1, hp: 860, atk: 36, range: 1, aspd: 0.7, move: 0.6, mp: 90,
      color: '#f8d838', skill: '강철 부적', desc: '5초간 보호막: 자신 체력 50%, 주변 아군 20%', lines: ['부적 발동!', '콩! 콩!', '이마의 부적을 봐라!', '쿵! 쿵! 지켜주마!'] },
    { id: 'palcheok', name: '팔척귀신', short: '팔척귀신', origin: 'E', cls: 'melee', role: '근접 방해', cost: 2, hp: 720, atk: 44, range: 1, aspd: 0.8, move: 0.5, mp: 90,
      color: '#9a7aff', skill: '포포포', desc: '대상 주변 적을 3초 속박 + 4초간 지속 피해', lines: ['포… 포… 포…', '어딜 도망가?', '팔 척이나 되거든?', '내려다보고 있다…'] },
    { id: 'maiden', name: '처녀귀신', short: '처녀귀신', origin: 'E', cls: 'ranged', role: '원거리 암살', cost: 3, hp: 430, atk: 50, range: 3, aspd: 0.85, move: 0.45, mp: 85, proj: 'maiden_proj',
      color: '#a0c0ff', skill: '원한의 곡소리', desc: '체력이 가장 낮은 적에게 300% 피해 + 4초간 받는 피해 25%↑', lines: ['원통하다…', '흐흐흐흑…', '한을 풀어다오…', '머리카락이… 보이니?'] },
    { id: 'reaper', name: '저승사자', short: '저승사자', origin: 'E', cls: 'ranged', role: '원거리 마무리', cost: 4, hp: 520, atk: 60, range: 3, aspd: 0.75, move: 0.45, mp: 100, proj: 'reaper_proj',
      color: '#b080ff', skill: '명부 집행', desc: '체력 15% 미만 적은 즉사. 아니면 체력 비율이 가장 낮은 적에게 220%', lines: ['명부에 올랐다.', '때가 되었다.', '이름을 불러주마.', '저승길 안내하지.'] }
  ];
  const GMAP = {};
  GHOSTS.forEach(g => { GMAP[g.id] = g; });
  const COST_COLOR = ['#000', '#9aa4b4', '#58c048', '#4a8cff', '#d850ff'];

  // Enemy monster skins (sheet ENEMIES row). Enemies are possessed by ghost spirits:
  // they fight with the spirit's PRD skill, wearing the zone's monster skin.
  const MONSTERS = {
    skeleton: { name: '해골', face: 1 }, zombie: { name: '좀비', face: 1 }, ghost: { name: '유령', face: 0, float: 4 },
    slime: { name: '슬라임', face: 0, squish: true }, bat: { name: '박쥐', face: 0, float: 5 }, spider: { name: '거미', face: 0 },
    wolf: { name: '늑대', face: 1 }, ogre: { name: '오우거', face: 0 }, demon: { name: '악마', face: 0 }, dragon: { name: '드래곤', face: -1 }
  };

  // Deadly enemy-only skills: each zone owns two, bosses always know the first one.
  const ESK = {
    frost: { name: '빙결', color: '#a8e8ff', lines: ['얼어붙어라!', '영원한 겨울을!', '꽁꽁 얼려주마!', '차갑게 식어라!', '얼음 감옥이다!'] },
    poison: { name: '독안개', color: '#7ad04a', lines: ['썩어 문드러져라…', '숨 막히지?', '독기를 마셔라!', '천천히 녹아내려라…', '독안개여, 퍼져라!'] },
    meteor: { name: '지옥불 낙하', color: '#ff7a2a', lines: ['불타 없어져라!', '하늘에서 불이 내린다!', '재가 되어라!', '피할 수 있겠어?', '지옥불이여, 떨어져라!'] },
    roar: { name: '공포의 포효', color: '#ff4060', lines: ['크아아앙!!', '겁에 질려라!', '떨어라, 약한 것들아!', '포효를 들어라!', '무릎 꿇어라!'] }
  };
  const skillName = u => (u.eskill ? ESK[u.eskill].name : u.def.skill);

  // Enemy skill level: +1 every 5 levels (each new stage), bosses and legends one more.
  // Higher levels freeze / poison / terrify longer, and drop more meteors.
  const eskLevel = (L, boss, tier) => 1 + Math.floor((Math.max(1, L) - 1) / 5) + (boss ? 1 : 0) + (tier >= 3 ? 1 : 0);
  const ESKV = {
    frostT: lv => Math.min(3.2, 1.5 + 0.1 * lv),
    poisonT: lv => Math.min(8, 4.5 + 0.25 * lv),
    meteors: lv => (lv >= 12 ? 3 : lv >= 6 ? 2 : 1),
    roarR: lv => (lv >= 8 ? 3 : 2),
    roarT: lv => Math.min(1.8, 0.9 + 0.05 * lv),
    weak: lv => Math.min(0.45, 0.25 + 0.01 * lv)
  };
  function eskDesc(k, lv) {
    lv = lv || 1;
    switch (k) {
      case 'frost': return '대상 주변 적을 ' + ESKV.frostT(lv).toFixed(1) + '초간 얼려 이동·공격·기술 봉쇄';
      case 'poison': return '대상 주변 3x3에 독안개. ' + ESKV.poisonT(lv).toFixed(1).replace('.0', '') + '초간 큰 지속 피해';
      case 'meteor': { const n = ESKV.meteors(lv); return '1초 뒤 가장 붐비는 3x3' + (n > 1 ? ' 등 ' + n + '곳' : '') + '에 폭발 + 화상' + (n < 3 ? ' (Lv.' + (n < 2 ? 6 : 12) + ': 운석 +1)' : ''); }
      case 'roar': return '주변 ' + ESKV.roarR(lv) + '칸 적 기절 + 4초간 공격력 -' + Math.round(ESKV.weak(lv) * 100) + '%';
    }
    return '';
  }

  // ---- what monsters say: every pool is a shuffled deck, so lines don't repeat until it runs out
  const MON_LINES = {
    skeleton: ['달그락… 달그락…', '뼈 있는 한마디 해주지!', '내 뼈는 단단하다!', '살 따윈 필요 없어!', '관절이 쑤시는군…', '해골 군단, 진격!'],
    zombie: ['뇌… 뇌애…', '으어어… 배고파…', '썩은 내 맡아볼래?', '느리지만… 확실하게…', '같이 좀비 되자~', '살아있는 냄새가 나…'],
    ghost: ['우우우~ 무섭지?', '스르륵… 뒤를 봐…', '나랑 같이 떠돌자…', '여긴 내 무덤이야!', '차가운 손길을 느껴봐…', '보이니? 안 보이지?'],
    slime: ['말랑말랑~ 공격!', '꿀렁꿀렁!', '녹여 버릴 테다~', '귀엽다고 봐주지 마!', '찐득찐득~', '분열한다! …농담이야'],
    bat: ['끼익! 피 냄새다!', '어둠은 우리 편!', '파닥파닥! 덤벼라!', '네 목덜미가 보여…', '초음파 공격 간다!', '밤은 우리 거야!'],
    spider: ['거미줄에 걸려라~', '여덟 다리로 짓밟아주마!', '독니가 근질근질…', '사각사각…', '내 둥지에 온 걸 환영해!', '꽁꽁 묶어서 먹어야지~'],
    wolf: ['아우우우!', '사냥 시간이다!', '무리를 건드렸구나!', '이빨이 근질거려!', '냄새로 다 알아!', '달이 우리를 부른다!'],
    ogre: ['쿵! 쿵! 짓밟는다!', '작은 것들, 밥이다!', '오우거 화났다!', '머리 나쁘다? 힘 세다!', '으랏차차!', '부숴! 다 부숴!'],
    demon: ['영혼을 거두러 왔다.', '계약서에 서명해라…', '지옥의 맛을 보여주지!', '크크크… 어리석은 것들.', '네 공포가 달콤하구나.', '타락하라!'],
    dragon: ['하찮은 것들이 감히!', '불꽃 앞에 무릎 꿇어라!', '천 년을 기다렸다!', '비늘 하나 못 뚫겠지?', '하늘은 내 것이다!', '재가 되어라!']
  };
  const BOSS_LINES = {
    graveyard: ['무덤을 깨운 게 너희냐!', '여기서 영원히 잠들어라!', '묘지의 주인은 나다!', '뼈까지 부숴주마!', '너희 무덤도 파 두었다!'],
    castle: ['내 성에 발을 들이다니!', '무릎 꿇고 경배하라!', '고성의 저주를 받아라!', '피의 연회를 시작하지!', '오늘 밤은 길 것이다…'],
    forest: ['숲이 화났다!', '나무뿌리처럼 짓눌러주마!', '여긴 내 숲이다!', '으르렁! 쫓아내 주마!', '트롤 다리 밑은 못 지나간다!'],
    oriental: ['여의주를 내놓아라!', '용이 되지 못한 한을 풀리라!', '물러가라, 하찮은 귀신들!', '하늘을 가르는 비늘을 보아라!', '천 년 수행을 방해하다니!'],
    hell: ['지옥불에 타 버려라!', '여기가 너희의 끝이다!', '영겁의 불꽃을 맛봐라!', '살아서 나갈 수 없다!', '지옥의 문이 열렸다!']
  };
  const ENRAGE_LINES = ['크아아아!', '이제 진짜다!', '분노가 끓는다!', '용서 못 한다!', '각오해라!'];
  const RALLY_LINES = ['가자!', '덤벼라!', '우리가 이긴다!', '무섭지 않아!', '한 놈도 못 지나가!', '유령의 힘을 보여주자!'];
  const CHEER_LINES = ['이겼다!', '유령 만세!', '별거 아니네~', '다음 놈 나와!', '오늘 밤도 우리 거야!'];
  const GLOAT_LINES = ['크크크… 약하군.', '다시 와 봐라~', '여기가 너희 무덤이다!', '겨우 이 정도냐?', '하하하하!'];
  const lineDecks = {};
  function drawLine(key, pool) {
    if (!pool || !pool.length) return '';
    let d = lineDecks[key];
    if (!d || !d.left.length) {
      const left = pool.map((_, i) => i);
      for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = left[i]; left[i] = left[j]; left[j] = t; }
      const last = d ? d.last : -1;   // a reshuffle never starts with the line just said
      if (left.length > 1 && left[left.length - 1] === last) { const t = left[0]; left[0] = left[left.length - 1]; left[left.length - 1] = t; }
      d = lineDecks[key] = { left, last };
    }
    d.last = d.left.pop();
    return pool[d.last];
  }
  // a wave entry or battle unit -> its entrance taunt
  const tauntOf = e => (e.boss && !e.mini ? drawLine('boss:' + zoneOf(S.level).id, BOSS_LINES[zoneOf(S.level).id]) : drawLine('mon:' + e.skin, MON_LINES[e.skin]));

  // =====================================================================
  //  STAGES (sheet: GRAVEYARD 1~, CASTLE 50~, FOREST 100~, ORIENTAL 200~, HELL 500~)
  // =====================================================================
  const ZONES = [
    { id: 'graveyard', name: '묘지', from: 1, bg: 'bg_graveyard', tile: 'tl_stone', wash: 'rgba(30,60,140,0.22)',
      props: [['pr_deadtree', 40, 116, 1], ['pr_tomb', 604, 114, 1], ['ob_crow', 46, 62, 1]], amb: 'fog',
      skins: { tank: 'zombie', melee: 'skeleton', ranged: 'ghost', boss: 'ogre', bossName: '무덤 오우거' }, eskills: ['poison', 'roar'] },
    { id: 'castle', name: '고성', from: 50, bg: 'bg_castle', tile: 'tl_brick', wash: 'rgba(58,32,96,0.30)',
      props: [['pr_pillar', 30, 116, 1], ['pr_pillar', 610, 116, 1]], amb: 'bats',
      skins: { tank: 'skeleton', melee: 'wolf', ranged: 'bat', boss: 'demon', bossName: '고성의 군주' }, eskills: ['frost', 'roar'] },
    { id: 'forest', name: '숲', from: 100, bg: 'bg_forest', tile: 'tl_grass', wash: 'rgba(10,40,20,0.20)',
      props: [['ob_tree', 40, 116, 1], ['ob_bush', 600, 114, 1], ['ob_rabbit', 618, 114, 1]], amb: 'fireflies',
      skins: { tank: 'slime', melee: 'wolf', ranged: 'spider', boss: 'ogre', bossName: '숲의 트롤' }, eskills: ['roar', 'poison'] },
    { id: 'oriental', name: '동양 사원', from: 200, bg: 'bg_oriental', tile: 'tl_sand', wash: 'rgba(20,30,90,0.26)',
      props: [['pr_torii', 40, 114, 1], ['pr_lantern', 604, 112, 1]], amb: 'petals',
      skins: { tank: 'zombie', melee: 'ogre', ranged: 'ghost', boss: 'dragon', bossName: '이무기' }, eskills: ['frost', 'meteor'] },
    { id: 'hell', name: '지옥', from: 500, bg: 'bg_hell', tile: 'tl_dark', wash: 'rgba(90,10,10,0.24)',
      props: [['pr_pillar', 30, 116, 1], ['pr_pillar', 610, 116, 1]], amb: 'embers',
      skins: { tank: 'ogre', melee: 'demon', ranged: 'bat', boss: 'dragon', bossName: '지옥룡' }, eskills: ['meteor', 'frost'] }
  ];
  // the stage changes every 5 levels (graveyard -> castle -> forest -> oriental -> hell -> ...);
  // each 25-level lap gets its own colour mood so repeats never look the same
  const zoneOf = L => ZONES[Math.floor((Math.max(1, L) - 1) / 5) % ZONES.length];
  const ZONE_MOODS = [null,
    { pre: '핏빛 ', wash: 'rgba(150,0,24,0.20)' }, { pre: '독기의 ', wash: 'rgba(40,150,40,0.17)' },
    { pre: '심연의 ', wash: 'rgba(70,0,130,0.24)' }, { pre: '황금빛 ', wash: 'rgba(210,150,20,0.15)' }];
  const zoneMood = L => ZONE_MOODS[Math.floor((Math.max(1, L) - 1) / 25) % ZONE_MOODS.length];
  const zoneName = L => (zoneMood(L) ? zoneMood(L).pre : '') + zoneOf(L).name;

  // =====================================================================
  //  PROCEDURAL LEVELS (no maps stored anywhere)
  // =====================================================================
  function levelMultipliers(level) {
    const L = clamp(level | 0, 1, MAX_LEVEL);
    return { hp: Math.pow(HP_GROWTH, L), atk: Math.pow(ATK_GROWTH, L) };
  }
  // Exact PRD formula: HP = BaseHP * 1.045^L, ATK = BaseATK * 1.038^L.
  // BaseHP/ATK depend on the enemy: spirit's base * 0.8, x grade (tier), and bosses carry
  // their own base that grows with every boss wave (x3 HP / x1.5 ATK at the first one).
  const TIER_HP = [1, 1.35, 1.8, 2.5], TIER_ATK = [1, 1.15, 1.35, 1.6];
  const TIER_NAME = ['일반', '정예', '용사', '전설'];
  const TIER_COLOR = ['#c2d3f2', '#58b8ff', '#c080ff', '#ffc830'];
  const TIER_TINT = [null, 'b', 'v', 'g'];
  function enemyBase(def, boss, tier, level, mini) {
    let hp = def.hp * ENEMY_BASE, atk = def.atk * ENEMY_BASE;
    if (boss) {   // boss: true = lead boss, 'guard' = lesser boss of a multi-boss wave
      const k = Math.max(1, Math.floor((level || 5) / 5));   // n-th boss wave
      const lesser = mini || boss === 'guard';
      hp *= BOSS_HP * (1 + 0.06 * (k - 1)) * (lesser ? 0.55 : 1);
      atk *= BOSS_ATK * (1 + 0.04 * (k - 1)) * (lesser ? 0.75 : 1);
    }
    return { hp: hp * TIER_HP[tier || 0], atk: atk * TIER_ATK[tier || 0] };
  }
  function enemyStats(def, level, boss, tier, mini) {
    const b = enemyBase(def, boss, tier, level, mini), m = levelMultipliers(level);
    return { baseHp: b.hp, baseAtk: b.atk, hp: b.hp * m.hp, atk: b.atk * m.atk };
  }
  const waveSize = L => Math.min(PCOLS * ROWS, 2 + Math.floor(L * 0.45));  // enemies: up to 15 (level 29)
  const playerCap = L => Math.min(9, 3 + Math.floor(L / 3));               // you: up to 9 (level 18)
  const isBossLevel = L => L % 5 === 0;
  const bossCount = L => (isBossLevel(L) ? Math.min(7, 2 + Math.floor(L / 15)) : L >= 61 ? 2 : L >= 21 ? 1 : 0);   // 2..7 bosses

  // Deterministic wave for a level (same level => same formation).
  // Bosses stand in front, ranged spirits in the back; grades (tiers) get likelier with level
  // and some enemies swap their spirit skill for one of the zone's deadly skills.
  function genWave(level) {
    const rng = mulberry32((Math.imul(level, 2654435761) ^ 0x5bd1e995) >>> 0);
    const n = waveSize(level);
    const maxCost = level < 3 ? 2 : level < 6 ? 3 : 4;
    const pool = GHOSTS.filter(g => g.cost <= maxCost);
    const zone = zoneOf(level);
    const used = {};
    const wave = [];
    const cols = []; for (let c = PCOLS; c < COLS; c++) cols.push(c);   // front -> back
    const spot = front => {
      const order = front ? cols : cols.slice().reverse();
      const rows = [0, 1, 2];
      for (let k = 2; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = rows[k]; rows[k] = rows[j]; rows[j] = t; }
      for (const c of order) for (const r of rows) if (!used[r + ',' + c]) { used[r + ',' + c] = 1; return { r, c }; }
      return null;
    };
    const tierRoll = () => {
      const x = rng();
      const legend = Math.min(0.18, Math.max(0, (level - 40) * 0.005));
      const champ = Math.min(0.3, Math.max(0, (level - 12) * 0.008));
      const elite = Math.min(0.45, level * 0.01);
      return x < legend ? 3 : x < legend + champ ? 2 : x < legend + champ + elite ? 1 : 0;
    };
    const nb = Math.min(n, bossCount(level));
    const bossTier = Math.min(3, Math.floor((Math.floor(level / 5) - 1) / 2));
    for (let i = 0; i < n; i++) {
      const boss = i < nb;
      const def = pool[Math.floor(rng() * pool.length)];
      const at = spot(boss || def.range === 1);
      if (!at) break;
      const e = { def, r: at.r, c: at.c, boss, mini: boss && !isBossLevel(level), guard: boss && i > 0, tier: 0, skin: zone.skins[def.cls], eskill: null };
      if (boss) {
        e.skin = zone.skins.boss;
        e.tier = Math.max(0, Math.min(3, bossTier + (i === 0 && level >= 30 ? 1 : 0) - (e.mini ? 1 : 0)));
        e.eskill = i === 0 ? zone.eskills[0] : i === 1 ? zone.eskills[1] : rng() < 0.5 ? zone.eskills[i % 2] : null;   // varied boss skills
        e.big = i === 0 && level % 25 === 0;             // lap finale: the lead boss is giant
      } else {
        e.tier = tierRoll();
        const special = level >= 3 && (e.tier > 0 ? rng() < 0.4 : level >= 30 && rng() < 0.2);
        if (special) e.eskill = zone.eskills[Math.floor(rng() * zone.eskills.length)];
      }
      wave.push(e);
    }
    // from level 3 on, every wave shows at least one deadly skill
    if (level >= 3 && wave.length && !wave.some(e => e.eskill)) wave[wave.length - 1].eskill = zone.eskills[level % zone.eskills.length];
    return wave;
  }

  function shopWeights(L) {
    if (L < 4) return [0, 60, 35, 5, 0];
    if (L < 8) return [0, 45, 35, 17, 3];
    if (L < 15) return [0, 30, 35, 27, 8];
    if (L < 25) return [0, 20, 30, 35, 15];
    return [0, 15, 25, 38, 22];
  }
  function rollShopCard(L) {
    const w = shopWeights(L);
    let total = 0;
    for (let c = 1; c <= 4; c++) total += w[c];
    let x = Math.random() * total, cost = 1;
    for (let c = 1; c <= 4; c++) { x -= w[c]; if (x < 0) { cost = c; break; } }
    const opts = GHOSTS.filter(g => g.cost === cost);
    return opts[Math.floor(Math.random() * opts.length)].id;
  }

  // =====================================================================
  //  STATE
  // =====================================================================
  let uidSeq = 1;
  const S = {
    scene: 'title', time: 0,
    level: 1, gold: START_GOLD, lives: START_LIVES, power: 0, best: 0,
    roster: [], shop: [], wave: [],
    units: [], grid: null, projectiles: [],
    fx: [], floats: [], particles: [], log: [], amb: [],
    battleT: 0, speed: 1, timeScale: 1, hitstop: 0, stopBank: J.stopBudget, trauma: 0, shakeX: 0, shakeY: 0, shakeTick: 0,
    phase: 'sim', introT: 0, ending: null, flashBoard: null, dim: null, letterbox: 0,
    result: null, resultT: 0, streak: { n: 0, t: 0 }, firstBlood: false, banner: null,
    sel: null, drag: null, hover: null, mouse: { x: -1, y: -1 }, touch: false,
    msg: '', msgT: 0, modal: false, final: null, gameoverT: 0, hasSave: false,
    wipe: null, zoneCard: null, coins: [], goldShown: START_GOLD, hudPulse: 0,
    skillCount: {},
    bubbles: [], cutin: null, cutSeen: {}, cutCd: 0, saveT: 0, quits: 0, meteors: [], bosses: []
  };
  S.best = parseInt(store.get('gt_best') || '0', 10) || 0;
  const PID = playerId();

  // =====================================================================
  //  NETWORK (save.php) with graceful offline fallback
  // =====================================================================
  function timed(ms) {
    if (typeof AbortController === 'undefined') return undefined;
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }
  const API = {
    token: (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
    async post(action, data, retried) {
      const res = await fetch('save.php', {
        method: 'POST', credentials: 'same-origin', signal: timed(5000),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': API.token },
        body: JSON.stringify(Object.assign({ action }, data || {}))
      });
      let j = null;
      try { j = await res.json(); } catch (e) { throw new Error('BAD_RESPONSE'); }
      // the PHP session expired while idle: fetch a fresh token and retry once
      if (j && j.error === 'BAD_CSRF' && !retried && await API.refreshToken()) return API.post(action, data, true);
      if (!j || !j.ok) throw new Error((j && j.error) || 'HTTP_' + res.status);
      return j;
    },
    async refreshToken() {
      try {
        const res = await fetch('save.php?action=token', { credentials: 'same-origin', cache: 'no-store', signal: timed(5000) });
        const j = await res.json();
        if (j && j.ok && typeof j.token === 'string' && j.token) { API.token = j.token; return true; }
      } catch (e) { /* offline */ }
      return false;
    },
    async rankings() {
      const res = await fetch('save.php?action=rankings', { credentials: 'same-origin', cache: 'no-store', signal: timed(5000) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'ERR');
      return j.rankings;
    }
  };

  const LocalRank = {
    list() {
      try { const l = JSON.parse(store.get('gt_local_rank') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    },
    add(initial, level) {
      const l = this.list();
      const entry = { initial, level_reached: level, created_at: new Date().toISOString().slice(0, 10), t: Date.now() };
      l.push(entry);
      l.sort((a, b) => b.level_reached - a.level_reached || a.t - b.t);
      const top = l.slice(0, 10);
      store.set('gt_local_rank', JSON.stringify(top));
      return top.indexOf(entry) + 1;
    }
  };

  // =====================================================================
  //  BOARD GEOMETRY + ROSTER HELPERS
  // =====================================================================
  // Logical cell (r = lane 0..2, c = 0..9, player c < 5) -> screen rect.
  // Landscape: lanes are rows, c runs left to right. Portrait: lanes are columns and c runs
  // bottom to top (c 9 = the enemies' back row at the top of the screen).
  function cellRect(r, c) {
    if (PORTRAIT) return { x: BOARD_X + r * CELL_W, y: BOARD_Y + (COLS - 1 - c) * CELL_H, w: CELL_W, h: CELL_H };
    return { x: BOARD_X + c * CELL_W, y: BOARD_Y + r * CELL_H, w: CELL_W, h: CELL_H };
  }
  const cellCenter = (r, c) => { const q = cellRect(r, c); return { x: q.x + q.w / 2, y: q.y + q.h - FEET }; };   // feet point
  const boardRect = () => (PORTRAIT ? { x: BOARD_X, y: BOARD_Y, w: ROWS * CELL_W, h: COLS * CELL_H } : { x: BOARD_X, y: BOARD_Y, w: COLS * CELL_W, h: ROWS * CELL_H });
  const playerRect = () => (PORTRAIT ? { x: BOARD_X, y: BOARD_Y + PCOLS * CELL_H, w: ROWS * CELL_W, h: PCOLS * CELL_H } : { x: BOARD_X, y: BOARD_Y, w: PCOLS * CELL_W, h: ROWS * CELL_H });
  function cellAt(p) {
    const b = boardRect();
    if (p.x < b.x || p.x >= b.x + b.w || p.y < b.y || p.y >= b.y + b.h) return null;
    const i = Math.floor((p.x - BOARD_X) / CELL_W), j = Math.floor((p.y - BOARD_Y) / CELL_H);
    return PORTRAIT ? { r: i, c: COLS - 1 - j } : { r: j, c: i };
  }
  // drop target for a drag: nearest player cell within 20px of the board edge snaps in
  function dropCell(p) {
    const c = cellAt(p);
    if (c) return c;
    const q = playerRect();
    if (p.x >= q.x - 20 && p.x < q.x + q.w + 20 && p.y >= q.y - 20 && p.y < q.y + q.h + 20 && p.y < CONSOLE_Y + 4) {
      return cellAt({ x: clamp(p.x, q.x, q.x + q.w - 1), y: clamp(p.y, q.y, q.y + q.h - 1) });
    }
    return null;
  }
  function slotAt(p) {
    if (p.y < BENCH_Y - 2 || p.y >= BENCH_Y + SLOT_H + 2) return -1;
    const i = Math.floor((p.x - BENCH_X + 2) / SLOT_GAP);
    if (i < 0 || i >= BENCH_N) return -1;
    return (p.x - BENCH_X - i * SLOT_GAP) < SLOT_W + 2 ? i : -1;
  }
  function cardAt(p) {
    if (p.y < SHOP_Y || p.y >= SHOP_Y + CARD_H) return -1;
    const i = Math.floor((p.x - SHOP_X) / CARD_GAP);
    if (i < 0 || i >= SHOP_N) return -1;
    return (p.x - SHOP_X - i * CARD_GAP) < CARD_W ? i : -1;
  }
  const inShopZone = p => inRect(p, SELL_ZONE);
  const slotCenter = i => ({ x: BENCH_X + i * SLOT_GAP + SLOT_W / 2, y: BENCH_Y + SLOT_H - 4 });

  const rosterAtCell = (r, c) => S.roster.find(u => u.loc === 'board' && u.r === r && u.c === c) || null;
  const rosterAtSlot = i => S.roster.find(u => u.loc === 'bench' && u.slot === i) || null;
  const boardCount = () => S.roster.filter(u => u.loc === 'board').length;
  function freeSlot() {
    for (let i = 0; i < BENCH_N; i++) if (!rosterAtSlot(i)) return i;
    return -1;
  }
  const sellValue = u => GMAP[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
  const powerMul = () => Math.pow(POWER_STEP, S.power);
  const altarCost = () => 4 + 2 * S.power;

  function synergy(list) {
    const seen = { W: new Set(), E: new Set() };
    list.forEach(u => { const d = GMAP[u.id || (u.def && u.def.id)]; if (d) seen[d.origin].add(d.id); });
    const w = seen.W.size, e = seen.E.size;
    return { w, e, hp: w >= 4 ? 1.35 : w >= 2 ? 1.15 : 1, atk: e >= 4 ? 1.35 : e >= 2 ? 1.15 : 1 };
  }
  function playerStats(id, star, syn) {
    const d = GMAP[id], m = STAR_MUL[star] * powerMul();
    return { hp: d.hp * m * syn.hp, atk: d.atk * m * syn.atk };
  }

  function flash(msg) { S.msg = msg; S.msgT = 1.8; }

  // =====================================================================
  //  SHOP / ECONOMY
  // =====================================================================
  function refreshShop() {
    S.shop = [];
    for (let i = 0; i < SHOP_N; i++) S.shop.push(rollShopCard(S.level));
  }
  const countCopies = (id, star) => S.roster.filter(u => u.id === id && u.star === star).length;

  function findBoardSpot(def) {
    const cols = def.range > 1 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    for (const c of cols) for (const r of [1, 0, 2]) if (!rosterAtCell(r, c)) return { r, c };
    return null;
  }

  function buy(i) {
    const id = S.shop[i];
    if (!id) return;
    const d = GMAP[id];
    if (S.gold < d.cost) { flash('골드가 부족해요'); Sound.play('error'); return; }
    const willMerge = countCopies(id, 1) >= 2;
    const slot = freeSlot();
    const canBoard = boardCount() < playerCap(S.level);
    if (slot < 0 && !willMerge && !canBoard) { flash('대기석이 가득 찼어요'); Sound.play('error'); return; }
    S.gold -= d.cost;
    S.shop[i] = null;
    const u = { uid: uidSeq++, id, star: 1, loc: 'bench', slot: Math.max(0, slot), r: 0, c: 0, pop: 0 };
    if (canBoard && !willMerge) {
      const spot = findBoardSpot(d);
      if (spot) { u.loc = 'board'; u.r = spot.r; u.c = spot.c; }
    }
    if (u.loc === 'bench' && slot < 0) u.slot = -99;   // transient: merged immediately
    S.roster.push(u);
    Sound.play('buy');
    const merged = tryMerge(id, 1);
    const shown = merged || u;
    shown.pop = 0.25;
    saveLocalSoon();
    const p = shown.loc === 'board' ? cellCenter(shown.r, shown.c) : slotCenter(shown.slot);
    addSpr(shown.loc === 'board' ? d.id + '_spawn' : 'fx_spawn1', p.x, p.y - (shown.loc === 'board' ? 6 : 14), { dur: 0.5, s: 2, grow: true });
    S.sel = { kind: 'roster', u: shown };
  }

  function tryMerge(id, star) {
    if (star >= 3) return null;
    const copies = S.roster.filter(u => u.id === id && u.star === star);
    if (copies.length < 3) return null;
    copies.sort((a, b) => (a.loc === 'board' ? 0 : 1) - (b.loc === 'board' ? 0 : 1) || (a.slot === -99 ? 1 : 0) - (b.slot === -99 ? 1 : 0));
    const keep = copies[0];
    const gone = copies.slice(1, 3);
    S.roster = S.roster.filter(u => gone.indexOf(u) < 0);
    // a copy that was being dragged / selected no longer exists: never drop or sell it later
    if (S.drag && gone.indexOf(S.drag.u) >= 0) S.drag = null;
    if (S.sel && gone.indexOf(S.sel.u) >= 0) S.sel = { kind: 'roster', u: keep };
    if (keep.slot === -99) keep.slot = Math.max(0, freeSlot());
    keep.deaths = Math.min(keep.deaths | 0, ...gone.map(g => g.deaths | 0));   // a fresh copy heals the wound
    keep.star = star + 1;
    keep.pop = 0.3;
    Sound.play('merge');
    Sound.play('levelup');
    const p = keep.loc === 'board' ? cellCenter(keep.r, keep.c) : slotCenter(keep.slot);
    burst(p.x, p.y - 24, C.gold, 22, 150);
    for (let i = 0; i < (keep.star === 3 ? 12 : 6); i++) {
      const a = (i / (keep.star === 3 ? 12 : 6)) * Math.PI * 2;
      S.fx.push({ type: 'star', x: p.x, y: p.y - 24, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, t: 0, dur: 0.7 });
    }
    if (keep.star === 3) S.banner = { name: 'tx_levelup', t: 0, dur: 1.4, y: MID_Y - 10, s: 2 };
    else S.fx.push({ type: 'sprite', name: 'tx_levelup', x: p.x, y: p.y - 60, t: 0, dur: 0.8, s: 1, rise: 24 });
    flash(GMAP[id].name + ' ' + '*'.repeat(keep.star) + '!');
    return tryMerge(id, star + 1) || keep;
  }

  function sell(u) {
    if (S.roster.indexOf(u) < 0) return;          // already sold / merged away
    S.roster = S.roster.filter(x => x !== u);
    S.gold += sellValue(u);
    if (S.sel && S.sel.u === u) S.sel = null;
    if (S.drag && S.drag.u === u) S.drag = null;
    Sound.play('sell');
    flash('판매 +' + sellValue(u) + '골드');
    saveLocalSoon();
  }

  function reroll() {
    if (S.gold < REROLL_COST) { flash('골드가 부족해요'); Sound.play('error'); return; }
    S.gold -= REROLL_COST;
    refreshShop();
    Sound.play('spin');
    saveLocalSoon();
  }

  function altar() {
    const cost = altarCost();
    if (S.gold < cost) { flash('골드가 부족해요'); Sound.play('error'); return; }
    S.gold -= cost;
    S.power++;
    Sound.play('power');
    saveLocalSoon();
    flash('제단 ' + S.power + '단계: 모든 유령 +6%');
    S.roster.forEach(u => {
      if (u.loc !== 'board') return;
      const p = cellCenter(u.r, u.c);
      S.fx.push({ type: 'sprite', name: 'ic_lvup', x: p.x, y: p.y - 20, t: 0, dur: 0.8, s: 1, rise: 30 });
      u.pop = 0.2;
    });
  }

  // move roster unit to the cell / slot under p (swap if occupied); returns true on change
  function dropAt(u, p, cellPoint) {
    if (S.roster.indexOf(u) < 0) return false;    // stale reference (sold / merged during the drag)
    const cell = cellPoint ? dropCell(cellPoint) : cellAt(p);
    if (cell) {
      if (cell.c >= PCOLS) { flash((PORTRAIT ? '아래쪽' : '왼쪽') + ' 내 진영에 배치하세요'); Sound.play('error'); return false; }
      const other = rosterAtCell(cell.r, cell.c);
      if (other === u) return false;
      if (u.loc === 'bench' && !other && boardCount() >= playerCap(S.level)) {
        flash('지금은 ' + playerCap(S.level) + '명까지 (레벨이 오르면 늘어요)'); Sound.play('error'); return false;
      }
      if (other) {
        if (u.loc === 'bench') { other.loc = 'bench'; other.slot = u.slot; }
        else { other.r = u.r; other.c = u.c; }
        other.pop = 0.15;
      }
      u.loc = 'board'; u.r = cell.r; u.c = cell.c; u.pop = 0.2;
      Sound.play('place');
      saveLocalSoon();
      return true;
    }
    const slot = slotAt(p);
    if (slot >= 0) {
      const other = rosterAtSlot(slot);
      if (other === u) return false;
      if (other) {
        if (u.loc === 'board') { other.loc = 'board'; other.r = u.r; other.c = u.c; }
        else other.slot = u.slot;
        other.pop = 0.15;
      }
      u.loc = 'bench'; u.slot = slot; u.pop = 0.2;
      Sound.play('place');
      saveLocalSoon();
      return true;
    }
    if (inShopZone(p)) { sell(u); return true; }
    return false;
  }

  // =====================================================================
  //  GAME FLOW
  // =====================================================================
  function newGame() {
    S.level = 1; S.gold = START_GOLD; S.goldShown = START_GOLD; S.lives = START_LIVES; S.power = 0;
    S.roster = []; S.sel = null; S.drag = null; S.quits = 0;
    refreshShop();
    API.post('new_game').catch(() => {});
    enterPrep(true);
    showZoneCard();
    if (!store.get('gt_help_seen')) { store.set('gt_help_seen', '1'); setTimeout(() => { if (S.scene === 'prep' && !S.modal) UI.showHelp(); }, 1800); }
  }

  function serialize(over) {
    return Object.assign({
      v: 2, t: Date.now(), level: S.level, gold: S.gold, lives: S.lives, power: S.power, quits: S.quits | 0,
      roster: S.roster.map(u => ({ id: u.id, star: u.star, loc: u.loc, r: u.r, c: u.c, slot: u.slot, deaths: u.deaths | 0 })),
      shop: S.shop
    }, over || {});
  }

  function restore(st) {
    if (!st || typeof st !== 'object') return false;
    const lvl = parseInt(st.level, 10);
    if (!(lvl >= 1 && lvl <= MAX_LEVEL)) return false;
    S.level = lvl;
    S.gold = Math.max(0, parseInt(st.gold, 10) || 0);
    S.goldShown = S.gold;
    S.lives = clamp(parseInt(st.lives, 10) || 1, 1, MAX_LIVES);
    S.power = Math.max(0, parseInt(st.power, 10) || 0);
    S.quits = Math.max(0, parseInt(st.quits, 10) || 0);
    S.roster = [];
    const taken = {}, homeless = [];
    (Array.isArray(st.roster) ? st.roster : []).forEach(x => {
      if (!x || !GMAP[x.id]) return;
      const u = { uid: uidSeq++, id: x.id, star: clamp(x.star | 0, 1, 3), loc: x.loc === 'board' ? 'board' : 'bench', r: x.r | 0, c: x.c | 0, slot: x.slot | 0, pop: 0, deaths: clamp(x.deaths | 0, 0, 1) };
      const key = u.loc === 'board' ? 'b' + u.r + ',' + u.c : 's' + u.slot;
      const bad = u.loc === 'board' ? (u.r < 0 || u.r >= ROWS || u.c < 0 || u.c >= PCOLS) : (u.slot < 0 || u.slot >= BENCH_N);
      if (bad || taken[key]) { if (u.loc === 'bench' && u.slot >= BENCH_N) homeless.push(u); return; }
      taken[key] = 1;
      S.roster.push(u);
    });
    // saves from the old 16-slot bench: move the extras into free slots, refund the rest
    let refund = 0;
    homeless.forEach(u => {
      const s = freeSlot();
      if (s >= 0) { u.slot = s; S.roster.push(u); } else refund += sellValue(u);
    });
    if (refund) { S.gold += refund; S.goldShown = S.gold; setTimeout(() => flash('대기석이 8칸이 되어 남는 유령은 +' + refund + '골드로 바꿨어요'), 900); }
    while (boardCount() > playerCap(S.level)) {
      const u = S.roster.find(x => x.loc === 'board');
      const s = freeSlot();
      if (s < 0) { S.roster.splice(S.roster.indexOf(u), 1); continue; }
      u.loc = 'bench'; u.slot = s;
    }
    S.shop = Array.isArray(st.shop) && st.shop.length === SHOP_N ? st.shop.map(id => (GMAP[id] ? id : null)) : [];
    if (!S.shop.length) refreshShop();
    return true;
  }

  // write a run snapshot locally and to the server
  function persist(st) {
    store.set('gt_save', JSON.stringify(st));
    S.hasSave = true; savedCache = null;
    if (!st.battle) S.saveT = 1.6;
    API.post('save_progress', { player_id: PID, level: st.level, gold: st.gold, lives: st.lives, power: st.power, state: st }).catch(() => {});
  }
  function saveProgress() { persist(serialize()); }

  // prep changes (buy / sell / move / reroll / altar) survive a reload: debounced, local only
  let localSaveTimer = 0;
  function saveLocalSoon() {
    if (S.scene !== 'prep') return;
    clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => { if (S.scene === 'prep') { store.set('gt_save', JSON.stringify(serialize())); S.hasSave = true; } }, 250);
  }

  // level / lives of the saved run, for the title's CONTINUE button
  let savedCache = null;
  function savedRun() {
    if (savedCache === null) {
      try { const st = JSON.parse(store.get('gt_save') || 'null'); savedCache = st && st.level ? { level: st.level | 0, lives: st.lives | 0 } : false; } catch (e) { savedCache = false; }
    }
    return savedCache || null;
  }

  function clearProgress() {
    store.del('gt_save');
    S.hasSave = false; savedCache = null;
    API.post('clear_progress', { player_id: PID }).catch(() => {});
  }

  async function continueGame() {
    // newest snapshot wins: highest level, then latest timestamp. A local save that is
    // ahead of the server (offline play) is kept instead of silently rolled back.
    let server = null, local = null;
    try {
      const j = await API.post('load_progress', { player_id: PID });
      if (j.progress && j.progress.state) server = j.progress.state;
    } catch (e) { /* offline: local save */ }
    try { local = JSON.parse(store.get('gt_save') || 'null'); } catch (e) { local = null; }
    const rank = s => (s && typeof s === 'object' ? (parseInt(s.level, 10) || 0) * 1e13 + (Number(s.t) || 0) : -1);
    const st = rank(local) > rank(server) ? local : server;
    if (!restore(st)) { flash('저장된 게임이 없어요'); Sound.play('error'); S.hasSave = false; return; }
    S.sel = null;
    if (st.battle) {
      // the page closed during a battle: back to that level's prep screen (pre-battle team)
      S.quits++;
      if (S.quits >= 2) S.lives--;
      if (S.lives <= 0) { S.lives = 0; enterPrep(false); gameOver(false); return; }
      enterPrep(true);   // saves the resumed state (clears the battle flag)
      flash(S.quits >= 2 ? '전투 중 종료가 반복돼서 목숨 -1' : '전투 중 종료 · 레벨 ' + pad3(S.level) + ' 준비부터 다시');
      return;
    }
    enterPrep(false);
    showZoneCard();
    flash('레벨 ' + pad3(S.level) + '부터 이어서 시작!');
  }

  function enterPrep(save) {
    S.scene = 'prep';
    S.bubbles = []; S.cutin = null;
    S.units = []; S.projectiles = []; S.fx = []; S.particles = []; S.floats = [];
    S.wave = genWave(S.level);
    S.drag = null; S.ending = null; S.timeScale = 1; S.hitstop = 0; S.dim = null; S.letterbox = 0; S.flashBoard = null;
    if (S.sel && S.sel.kind !== 'roster') S.sel = null;
    if (S.level > S.best) { S.best = S.level; store.set('gt_best', String(S.best)); }
    if (save !== false) saveProgress();
    Sound.music('prep', zoneOf(S.level).id, false);
  }

  function showZoneCard() {
    S.zoneCard = { t: 0, dur: 1.6, zone: zoneOf(S.level) };
    Sound.play('zonefanfare');
  }

  // Run snapshots: a battle's result is saved the moment it happens, and its start is saved
  // too (`battle: 1`, pre-battle team and gold). Closing the page mid-fight resumes at that
  // level's prep screen; quitting the same level again costs a life, so reloading can't be
  // used to dodge a loss.
  function commitRun(level, lives, over) {
    if (lives <= 0) { store.del('gt_save'); S.hasSave = false; savedCache = null; API.post('clear_progress', { player_id: PID }).catch(() => {}); }
    else persist(serialize(Object.assign({ level, lives }, over)));
  }

  function startBattle() {
    if (boardCount() === 0) { flash('유령을 먼저 배치하세요!'); Sound.play('error'); return; }
    clearTimeout(localSaveTimer);
    commitRun(S.level, S.lives, { battle: 1 });
    S.grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    S.units = [];
    const board = S.roster.filter(u => u.loc === 'board');
    const syn = synergy(board);
    board.forEach(u => {
      const st = playerStats(u.id, u.star, syn);
      const b = spawnUnit(GMAP[u.id], u.star, 'P', u.r, u.c, st.hp, st.atk, false, null);
      b.ref = u; b.wounded = u.deaths | 0;
    });
    // enemies get a little better every level: skill damage, crowd-control time and mana gain
    const L = S.level;
    S.wave.forEach(e => {
      const st = enemyStats(e.def, L, e.guard ? 'guard' : e.boss, e.tier, e.mini);
      const u = spawnUnit(e.def, 1, 'E', e.r, e.c, st.hp, st.atk, e.boss, e.skin);
      u.tier = e.tier || 0; u.mini = !!e.mini; u.big = !!e.big; u.eskill = e.eskill || null;
      u.slv = eskLevel(L, e.boss && !e.mini, u.tier);   // skill level (shown in cut-ins / info)
      u.pow = Math.min(2.5, 1 + 0.008 * (L - 1)) * (1 + 0.06 * u.tier);
      u.ccMul = Math.min(1.6, 1 + 0.006 * (L - 1));
      u.mpMul = Math.min(1.8, 1 + 0.006 * (L - 1));
    });
    S.projectiles = []; S.fx = []; S.floats = []; S.particles = []; S.log = [];
    S.battleT = 0; S.timeScale = 1; S.hitstop = 0; S.stopBank = J.stopBudget; S.ending = null;
    S.streak = { n: 0, t: 0 }; S.firstBlood = false;
    S.bubbles = []; S.cutin = null; S.cutSeen = {}; S.cutCd = 0; S.meteors = [];
    S.sel = null; S.drag = null;
    S.scene = 'battle';
    S.bosses = S.units.filter(u => u.boss && !u.mini);
    S.boss = S.bosses[0] || null;
    // intro: staggered spawns, optional boss intro, then FIGHT!
    S.phase = 'intro'; S.introT = 0;
    S.introLen = S.boss ? 2.4 : 1.0;
    S.units.forEach(u => {
      u.spawnDelay = u.team === 'P' ? u.c * 0.06 + u.r * 0.02 : 0.2 + (u.c - PCOLS) * 0.05 + u.r * 0.02;
      u.spawnT = -u.spawnDelay;
    });
    logMsg('레벨 ' + pad3(S.level) + ' · ' + zoneName(S.level) + (S.boss ? ' · 보스 ' + S.bosses.length + '마리 등장!' : '') + ' · 적 기술 Lv.' + eskLevel(L, false, 0), C.gold);
    // opening taunts: the boss (or a random monster) speaks, a second monster chimes in, an ally answers
    const foes = S.units.filter(u => u.team === 'E');
    const lead = S.boss || foes[Math.floor(Math.random() * foes.length)];
    const other = foes.filter(u => u !== lead && !u.boss);
    const second = other.length ? other[Math.floor(Math.random() * other.length)] : null;
    if (lead) say(lead, tauntOf(lead), lead.boss ? 'boss' : 'enemy', S.boss ? 0.75 : 0.45);
    if (second && second.skin !== (lead && lead.skin)) say(second, tauntOf(second), 'enemy', S.boss ? 1.25 : 0.95);
    const allies = S.units.filter(u => u.team === 'P');
    if (allies.length) say(allies[Math.floor(Math.random() * allies.length)], drawLine('rally', RALLY_LINES), 'ally', S.introLen - 0.35);
    Sound.music('battle', zoneOf(S.level).id, !!S.boss);
    if (S.boss) { Sound.duck(0.3, 1600); Sound.play('bossroar'); }
  }

  function spawnUnit(def, star, team, r, c, hp, atk, boss, skin) {
    const p = cellCenter(r, c);
    const u = {
      uid: uidSeq++, def, star, team, r, c, x: p.x, y: p.y, fromX: p.x, fromY: p.y, moveT: 1, moveDur: def.move,
      hp, maxHp: hp, atk, range: def.range, aspd: def.aspd, mp: 0, maxMp: def.mp, lifesteal: def.lifesteal || 0,
      atkCd: rand(0.3, 0.8), target: null, retarget: 0, blocked: 0,
      stun: 0, bind: 0, charm: 0, rage: 0, curse: 0, shield: 0, shieldT: 0, dots: [], frozen: 0, weak: 0,
      alive: true, deadT: 0, boss, skin, mon: skin ? MONSTERS[skin] : null,
      // presentation state
      anim: 'idle', animT: Math.random(), atkPhase: 0, castT: 0, castHold: 0, hitT: 0, freeze: 0,
      flashT: 0, flashBig: false, redT: 0, kbx: 0, kby: 0, kbT: 0, kbDur: 0.1, kbHop: 0,
      sqx: 1, sqy: 1, sqT: 0, sqDur: 0, hpTrail: hp, trailHold: 0, chunkT: 0, face: team === 'P' ? 1 : -1,
      spawnT: 0, spawnDelay: 0, afterT: 0, bob: Math.random() * 6
    };
    S.units.push(u);
    S.grid[r][c] = u;
    return u;
  }

  function endBattle(win, timeout) {
    const interest = Math.min(5, Math.floor(S.gold / 10));
    const boss = isBossLevel(S.level);
    const gold = win ? 5 + Math.floor(S.level / 3) + interest + (boss ? 5 : 0) : 4 + Math.floor(S.level / 8) + interest;   // losing still pays enough to rebuild
    S.result = { win, timeout, gold, interest, boss: win && boss, life: win && S.level % 10 === 0 && S.lives < MAX_LIVES, lost: [], wounded: [] };
    S.gold += gold;
    // knock-outs count: the first one wounds a ghost, the second one removes it for good
    S.units.forEach(u => {
      if (u.team !== 'P' || u.alive || !u.ref || S.roster.indexOf(u.ref) < 0) return;
      const r = u.ref;
      r.deaths = (r.deaths | 0) + 1;
      if (r.deaths >= 2) {   // gone for good; its soul returns half the sell value
        const refund = Math.max(1, Math.floor(sellValue(r) / 2));
        S.result.lost.push(GMAP[r.id].name + '(+' + refund + 'G)'); S.result.refund = (S.result.refund || 0) + refund;
        S.gold += refund; S.roster.splice(S.roster.indexOf(r), 1);
      } else S.result.wounded.push(GMAP[r.id].name);
    });
    // commit the outcome now (applyResult only animates the transition)
    S.quits = 0;
    if (win) commitRun(S.level >= MAX_LEVEL ? S.level : S.level + 1, S.level >= MAX_LEVEL ? 0 : S.lives + (S.result.life ? 1 : 0));
    else commitRun(S.level, S.lives - 1);
    S.scene = 'result';
    S.resultT = 0;
    S.timeScale = 1;
    S.dim = null;
    S.meteors = [];
    Sound.stopMusic();
    if (win) {
      Sound.play('stageclear');
      S.banner = { name: 'tx_stageclear', t: 0, dur: 1.6, y: MID_Y, s: 2 };
      // survivors celebrate: sparkles + a cheer
      const alive = S.units.filter(u => u.team === 'P' && u.alive);
      alive.forEach(u => { for (let i = 0; i < 4; i++) S.fx.push({ type: 'star', x: u.x + rand(-10, 10), y: u.y - 40, vx: rand(-90, 90), vy: rand(-170, -80), t: -i * 0.08, dur: 0.9 }); });
      if (alive.length) say(alive[Math.floor(Math.random() * alive.length)], drawLine('cheer', CHEER_LINES), 'ally', 0.3);
      // coins fly from fallen foes to the HUD gold counter
      const spots = S.units.filter(u => u.team === 'E');
      const n = Math.min(10, gold);
      for (let i = 0; i < n; i++) {
        const src = spots[i % Math.max(1, spots.length)] || { x: W / 2, y: MID_Y };
        S.coins.push({ x0: src.x, y0: src.y - 20, t: -0.35 - i * 0.05, dur: 0.5, v: Math.floor(gold / n) + (i < gold % n ? 1 : 0) });
      }
    } else {
      Sound.play('defeat');
      S.banner = { text: timeout ? '시간 초과!' : '패배…', t: 0, dur: 1.6, y: MID_Y, s: 4 };
      const foes = S.units.filter(u => u.team === 'E' && u.alive);   // a survivor gloats
      if (foes.length) { const g = foes.find(u => u.boss) || foes[0]; say(g, drawLine('gloat', GLOAT_LINES), g.boss ? 'boss' : 'enemy', 0.4); }
      S.heartFall = { t: 0, x: HEART_X + (S.lives - 1) * 18 };
      if (!win) Sound.play('heartbreak');
    }
  }

  function applyResult() {
    const r = S.result;
    if (!r) return;
    S.result = null;
    S.banner = null;
    S.heartFall = null;
    S.coins = [];
    const prevZone = zoneOf(S.level);
    if (r.win) {
      if (r.life) S.lives++;
      if (S.level >= MAX_LEVEL) { gameOver(true); return; }
      S.level++;
    } else {
      S.lives--;
      if (S.lives <= 0) { gameOver(false); return; }
    }
    refreshShop();
    enterPrep(true);
    S.shopSlide = 0;
    if (r.lost.length) flash(r.lost.join(', ') + ' 영구 소멸…');
    else if (r.wounded.length && !store.get('gt_tip_wound')) { store.set('gt_tip_wound', '1'); flash('해골 표시 유령은 또 쓰러지면 사라져요'); }
    if (zoneOf(S.level) !== prevZone) showZoneCard();
  }

  function gameOver(cleared) {
    S.scene = 'gameover';
    S.final = { level: S.level, cleared, checking: false, qualifies: null };
    S.gameoverT = 0;
    S.sel = null;
    S.banner = null;
    if (S.level > S.best) { S.best = S.level; store.set('gt_best', String(S.best)); }
    API.post('save_progress', { player_id: PID, level: S.level, gold: S.gold, lives: 0, power: S.power, state: serialize() })
      .catch(() => {}).then(() => clearProgress());
    store.del('gt_save');
    S.hasSave = false; savedCache = null;
    Sound.stopMusic();
    Sound.play(cleared ? 'highscore' : 'gameover');
    // look up the leaderboard early so TOP 10! can show before the modal
    API.rankings().then(list => ({ list, online: true })).catch(() => ({ list: LocalRank.list(), online: false })).then(res => {
      if (!S.final) return;
      S.final.list = res.list; S.final.online = res.online;
      S.final.qualifies = res.list.length < 10 || S.final.level > (res.list[9].level_reached | 0);
      if (S.final.qualifies) setTimeout(() => { if (S.scene === 'gameover') Sound.play('top10'); }, 1600);
    });
  }

  function afterGameOver() {
    if (S.modal || !S.final || S.final.checking) return;
    const f = S.final;
    if (f.qualifies === null) {
      // leaderboard request still pending: never trap the player, fall back to local scores
      if (S.gameoverT < 6) return;
      f.list = LocalRank.list(); f.online = false;
      f.qualifies = f.list.length < 10 || f.level > (f.list[9].level_reached | 0);
    }
    f.checking = true;
    if (f.qualifies) UI.showEntry(f.level, f.online);
    else UI.showRanking(f.list, -1, f.online ? '' : '서버 연결 안 됨 · 이 기기 기록', () => wipeTo(toTitle));
  }

  function toTitle() {
    S.scene = 'title';
    S.units = []; S.fx = []; S.particles = []; S.floats = []; S.banner = null; S.final = null;
    S.hasSave = !!store.get('gt_save'); savedCache = null;
    S.bubbles = []; S.cutin = null;
    Sound.music('title');
  }

  // diamond wipe transition: covers, runs `mid`, uncovers
  function wipeTo(mid) {
    if (S.wipe) return;
    if (reducedMotion) { S.wipe = { t: 0, mid, fade: true, done: false }; Sound.play('wipe'); return; }
    S.wipe = { t: 0, mid, done: false };
    Sound.play('wipe');
  }

  // =====================================================================
  //  BATTLE ENGINE
  // =====================================================================
  const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const eu2 = (r1, c1, r2, c2) => (r1 - r2) * (r1 - r2) + (c1 - c2) * (c1 - c2);
  const effTeam = u => (u.charm > 0 ? (u.team === 'P' ? 'E' : 'P') : u.team);
  const isHostile = (a, b) => b !== a && b.alive && b.team !== effTeam(a);
  const hostilesOf = u => S.units.filter(v => isHostile(u, v));
  const unitName = u => (u.mon ? (u.boss ? zoneOf(S.level).skins.bossName : u.mon.name) : u.def.name);

  function findTarget(u, inRangeOnly) {
    let best = null, bs = Infinity;
    for (const v of S.units) {
      if (!isHostile(u, v)) continue;
      const d = cheb(u, v);
      if (inRangeOnly && d > u.range) continue;
      const s = d * 1000 + eu2(u.r, u.c, v.r, v.c) * 10 + v.hp / v.maxHp;
      if (s < bs) { bs = s; best = v; }
    }
    return best;
  }

  function stepToward(u, t) {
    const score = (r, c) => Math.max(Math.abs(r - t.r), Math.abs(c - t.c)) * 100 + eu2(r, c, t.r, t.c);
    let bs = score(u.r, u.c) - 1e-6, best = null;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = u.r + dr, nc = u.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || S.grid[nr][nc]) continue;
      const s = score(nr, nc);
      if (s < bs) { bs = s; best = [nr, nc]; }
    }
    if (!best) return false;
    const diagonal = u.r !== best[0] && u.c !== best[1];
    S.grid[u.r][u.c] = null;
    u.r = best[0]; u.c = best[1];
    S.grid[u.r][u.c] = u;
    u.fromX = u.x; u.fromY = u.y; u.moveT = 0;
    u.moveDur = u.def.move * (diagonal ? 1.3 : 1);
    return true;
  }

  function gainMp(u, n) {
    if (!u.alive || !u.maxMp) return;
    const was = u.mp;
    u.mp = Math.min(u.maxMp, u.mp + n * (u.mpMul || 1));
    if (was < u.maxMp && u.mp >= u.maxMp && u.team === 'P') Sound.play('mpfull');
  }

  function heal(u, amt, show) {
    if (!u.alive || amt <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    if (u.hp > u.hpTrail) u.hpTrail = u.hp;
    if (show && u.hp - before >= 1) number('+' + fmt(u.hp - before), u, 'heal');
  }

  // ---- damage pipeline: every bit of feedback flows through Juice.hit ----
  //   o: {kind: 'normal'|'crit'|'skill'|'dot'|'true', noMp, noLifesteal, melee}
  function dealDamage(src, tgt, amount, o) {
    o = o || {};
    if (!tgt.alive) return 0;
    const kind = o.kind || 'normal';
    if (src && src.pow && (kind === 'skill' || kind === 'dot')) amount *= src.pow;   // enemy skills grow per level
    if (src && src.weak > 0) amount *= 1 - (src.weakAmt || 0.3);                     // terrified: -25..45% damage
    let dmg = kind === 'true' ? amount : amount * (tgt.curse > 0 ? 1.25 : 1);
    if (kind !== 'true' && tgt.shield > 0) {
      const ab = Math.min(tgt.shield, dmg);
      tgt.shield -= ab; dmg -= ab;
      if (tgt.shield <= 0.5) { tgt.shield = 0; shieldBreak(tgt); }
      if (dmg <= 0) { number('막음', tgt, 'block'); Sound.play('block'); return 0; }
    }
    const before = tgt.hp;
    tgt.hp -= dmg;
    if (!o.noMp) gainMp(tgt, 4);
    if (src && src.alive && src.lifesteal && !o.noLifesteal && kind !== 'dot') heal(src, dmg * src.lifesteal, false);
    const killed = tgt.hp <= 0;
    Juice.hit(src, tgt, dmg, kind, killed, before, o);
    if (killed) kill(tgt, src);
    return dmg;
  }

  function shieldBreak(u) {
    burst(u.x, u.y - 28, '#d0f8ff', 12, 140);
    u.freeze = Math.max(u.freeze, 0.066);
    Sound.play('shieldbreak');
  }

  function kill(u, src) {
    u.alive = false; u.hp = 0; u.deadT = 0;
    if (S.grid[u.r][u.c] === u) S.grid[u.r][u.c] = null;
    const col = u.team === 'P' ? C.hover : (u.def.color || '#ff6060');
    // death beam + rising soul + shards
    S.fx.push({ type: 'beam', x: u.x, y: u.y, t: 0, dur: 0.3 });
    S.fx.push({ type: 'sprite', name: 'fx_spawn0', x: u.x, y: u.y - 30, t: 0, dur: 0.6, s: 2, rise: 28 });
    shards(u.x, u.y - 20, col, 10);
    shards(u.x, u.y - 20, '#ffffff', 4);
    if (u.team === 'E') {
      Juice.stop(J.stop.kill, J.shake.kill);
      Sound.play('kill');
      if (src && src.team === 'P' || (src && src.charm > 0)) streakKill(u);
    } else {
      Juice.stop(J.stop.allyDown, J.shake.allyDown);
      Sound.play('allydown');
      if (u.ref && u.wounded) {   // second knock-out: gone for good
        u.perma = true;
        S.fx.push({ type: 'soul', name: u.def.id + '_idle0', x: u.x, y: u.y, t: 0, dur: 1.4 });
        S.fx.push({ type: 'tomb', u, x: u.x, y: u.y + 2, t: 0, dur: 9999, behind: true });
        number('영구 소멸!', u, 'exec');
        logMsg(u.def.name + ' 영구 소멸! (두 번 쓰러져 부활 불가)', '#ff6060');
        say(u, '안녕히…', 'ally');
        Sound.play('heartbreak');
      } else if (u.ref) {
        number('쓰러짐 1/2', u, 'hurt');
        logMsg(u.def.name + ' 쓰러짐 · 한 번 더 쓰러지면 소멸', '#ffb070');
      }
    }
  }

  function streakKill(u) {
    if (!S.firstBlood) { S.firstBlood = true; S.callout = { text: '첫 처치!', t: 0 }; Sound.play('streak', { tier: 0 }); return; }
    S.streak.n = S.streak.t > 0 ? S.streak.n + 1 : 1;
    S.streak.t = 1.6;
    const names = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '학살!'];
    if (S.streak.n >= 2) { S.callout = { text: names[Math.min(5, S.streak.n)], t: 0 }; Sound.play('streak', { tier: S.streak.n - 2 }); }
  }

  function doAttack(u, t) {
    u.atkCd = 1 / (u.aspd * (u.rage > 0 ? 2 : 1));
    u.anim = 'atk'; u.animT = 0; u.atkPhase = 1;
    u.face = t.x >= u.x ? 1 : -1;
    squash(u, 1.18, 0.88, 0.06);
    const crit = Math.random() < CRIT_CHANCE;
    const dmg = u.atk * (crit ? CRIT_MUL : rand(0.88, 1.02));
    if (u.range > 1) {
      S.projectiles.push({ x: u.x + u.face * 10, y: u.y - 26, target: t, src: u, dmg, crit, frame: u.def.proj || 'fx_skill0', speed: 380, face: u.face });
      u.kbx = -u.face * 2; u.kby = 0; u.kbT = 0.08; u.kbDur = 0.08;
      Sound.play('shoot');
    } else {
      u.lungeT = 0.16;
      dealDamage(u, t, dmg, { kind: crit ? 'crit' : 'normal', melee: true });
      Sound.play('swing');
    }
    gainMp(u, 10);
  }

  // ---- speech bubbles + skill cut-ins (presentation only, real-time clock) ----
  // Readability rules: one bubble per unit, at most 3 on screen (enemy chatter is dropped
  // first), and each ghost gets its full-width cut-in only on its first skill of a battle.
  const REPLY = {
    stun: ['어지러워…', '으윽!', '별이 보여…'],
    charm: ['♥_♥', '주인님…?', '좋아요♥'],
    bind: ['못 움직여!', '이게 뭐야?!'],
    curse: ['으스스…', '소름 끼쳐!'],
    freeze: ['꽁꽁 얼었다…', '추, 추워!'],
    poison: ['콜록콜록!', '숨이 막혀…'],
    fear: ['무, 무서워!', '으아악!'],
    thanks: ['고마워!', '든든하다!']
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function say(u, str, kind, delay, dur) {
    if (!u || !str) return;
    const b = S.bubbles;
    for (let i = b.length - 1; i >= 0; i--) if (b[i].u === u) b.splice(i, 1);
    const important = kind === 'ally' || kind === 'boss';
    if (b.length >= 3) { if (!important) return; b.shift(); }
    if (kind === 'enemy' && b.length >= 2) return;
    b.push({ u, str, kind, t: -(delay || 0), dur: dur || (kind === 'reply' ? 0.95 : kind === 'boss' ? 1.7 : 1.35) });
  }
  function reply(v, kind) { if (v && v.alive && REPLY[kind]) say(v, pick(REPLY[kind]), 'reply', 0.3); }
  function cutIn(u, line) {
    const key = u.boss ? 'boss' : u.eskill ? 'e' + u.eskill : u.team + u.def.id;
    if (S.cutin || S.cutCd > 0 || S.cutSeen[key]) return;
    S.cutSeen[key] = 1;
    S.cutin = { u, def: u.def, boss: !!u.boss, ally: u.team === 'P', line, skill: skillName(u), lv: u.team === 'E' ? u.slv : 0, color: u.eskill ? ESK[u.eskill].color : null, t: 0, dur: 1.15, seed: (Math.random() * 1e9) | 0 };
    S.cutCd = 2.2;
  }
  function updateTalk(rdt) {
    for (let i = S.bubbles.length - 1; i >= 0; i--) {
      const b = S.bubbles[i];
      b.t += rdt;
      if (b.t >= b.dur || (b.t > 0 && !b.u.alive && b.kind !== 'ally')) S.bubbles.splice(i, 1);
    }
    if (S.cutin) { S.cutin.t += rdt; if (S.cutin.t >= S.cutin.dur) S.cutin = null; }
    if (S.cutCd > 0) S.cutCd -= rdt;
  }

  function announce(u) {
    S.skillCount[u.def.id] = (S.skillCount[u.def.id] || 0) + 1;
    const line = u.eskill ? drawLine('esk:' + u.eskill, ESK[u.eskill].lines) : drawLine('def:' + u.team + u.def.id, u.def.lines);
    if (u.team === 'P') { say(u, line, 'ally'); cutIn(u, line); }
    else if (u.boss) { say(u, line, 'boss'); cutIn(u, line); }
    else say(u, line, 'enemy');
    logMsg((u.team === 'P' ? u.def.name : unitName(u) + (u.eskill ? '' : '(' + u.def.name + ')')) + ': ' + skillName(u) + (u.slv ? ' Lv.' + u.slv : '') + '!', u.team === 'P' ? u.def.color : u.eskill ? ESK[u.eskill].color : '#ff8080');
    u.castHold = 0.32;
    u.anim = 'cast'; u.animT = 0;
    squash(u, 1.2, 0.85, 0.066);
    Sound.play('cast');
  }

  // can the unit's skill fire right now? (mirrors the guards inside castSkill)
  function skillReady(u, t) {
    const inRange = t && t.alive && isHostile(u, t) && cheb(u, t) <= u.range;
    if (u.eskill) {
      const foes = hostilesOf(u);
      switch (u.eskill) {
        case 'frost': return u.range > 1 ? !!inRange : foes.some(v => cheb(v, u) <= 1);
        case 'poison': return !!inRange;
        case 'roar': return foes.some(v => cheb(v, u) <= ESKV.roarR(u.slv || 1));
        default: return foes.length > 0;
      }
    }
    switch (u.def.id) {
      case 'dracula': case 'frank': case 'gumiho': case 'palcheok': return !!inRange;
      case 'succubus': return S.units.some(v => isHostile(u, v) && v.charm <= 0 && cheb(u, v) <= u.range);
      default: return true;
    }
  }

  // ---- the 10 unique active skills ----------------------------------------
  function castSkill(u) {
    const foes = hostilesOf(u);
    if (!foes.length) return false;
    const t = u.target && u.target.alive && isHostile(u, u.target) ? u.target : null;
    const inRange = t && cheb(u, t) <= u.range;
    const sk = { kind: 'skill' };
    if (u.eskill) return castEnemySkill(u, foes, t, inRange);

    switch (u.def.id) {
      case 'dracula': { // Blood Feast
        if (!inRange) return false;
        announce(u);
        addSpr('dracula_sfx', t.x - u.face * 6, t.y - 30, { dur: 0.35, s: 2, flip: u.face < 0, grow: true });
        addSpr('fx_attack1', t.x, t.y - 26, { dur: 0.3, s: 2, flip: u.face < 0 });
        const dealt = dealDamage(u, t, u.atk * 2.5, { kind: 'skill', noLifesteal: true });
        heal(u, dealt, true);
        stream(t.x, t.y - 26, u.x, u.y - 26, '#e03030', 16);
        addSpr('dracula_spawn', u.x, u.y - 8, { dur: 0.5, s: 2 });
        Juice.stop(J.stop.skill, J.shake.skill);
        Sound.play('bloodfeast');
        return true;
      }
      case 'frank': { // Electric Stun
        if (!inRange) return false;
        announce(u);
        const hit = foes.filter(v => cheb(v, t) <= 1);
        addSpr('frank_sfx', t.x, t.y - 16, { dur: 0.45, s: 2 });
        hit.forEach(v => {
          S.fx.push({ type: 'bolt', x: u.x, y: u.y - 34, x2: v.x, y2: v.y - 26, t: 0, dur: 0.3 });
          addSpr('frank_spawn', v.x, v.y - 4, { dur: 0.4, s: 2 });
          dealDamage(u, v, u.atk * 1.5, sk);
          if (v.alive) v.stun = Math.max(v.stun, 1.5 * (u.ccMul || 1));
        });
        reply(hit.find(v => v.alive), 'stun');
        S.flashBoard = { color: 'rgba(160,248,255,0.25)', t: 0.05 };
        Juice.stop(J.stop.aoe, J.shake.aoe);
        Sound.play('zap');
        return true;
      }
      case 'succubus': { // Charm 3s
        const cands = foes.filter(v => cheb(u, v) <= u.range && v.charm <= 0);
        if (!cands.length) return false;
        const v = cands.reduce((a, b) => (b.atk > a.atk ? b : a));
        announce(u);
        S.projectiles.push({ heart: true, x: u.x, y: u.y - 30, x0: u.x, y0: u.y - 30, target: v, src: u, t: 0, frame: 'fx_charm0', speed: 260, face: v.x >= u.x ? 1 : -1 });
        Sound.play('charm');
        return true;
      }
      case 'mummy': { // Bandage Wrap on the highest-HP foe
        const v = foes.reduce((a, b) => (b.hp > a.hp ? b : a));
        announce(u);
        S.fx.push({ type: 'reticle', u: v, t: 0, dur: 0.5, color: C.sel });
        S.fx.push({ type: 'bandage', x: u.x, y: u.y - 30, u: v, t: 0, dur: 0.55 });
        addSpr('mummy_spawn', v.x, v.y - 6, { dur: 0.6, s: 2 });
        dealDamage(u, v, u.atk * 1.2, sk);
        if (v.alive) v.stun = Math.max(v.stun, 2.5 * (u.ccMul || 1));
        reply(v, 'stun');
        Juice.stop(J.stop.skill, J.shake.skill);
        Sound.play('bandage');
        return true;
      }
      case 'werewolf': { // Blood Rage
        announce(u);
        u.rage = 4;
        heal(u, u.maxHp * 0.15, true);
        squash(u, 0.9, 1.15, 0.12);
        addSpr('werewolf_spawn', u.x, u.y - 8, { dur: 0.5, s: 2, behind: true });
        addSpr('werewolf_sfx', u.x, u.y - 20, { dur: 0.4, s: 2, flip: u.face < 0 });
        addSpr('fx_heal0', u.x - 10, u.y - 40, { dur: 0.6, s: 2, rise: 16 });
        addSpr('fx_heal0', u.x + 12, u.y - 34, { dur: 0.6, s: 2, rise: 16 });
        S.trauma = Math.min(1, S.trauma + 0.15);
        Sound.play('bloodrage');
        return true;
      }
      case 'gumiho': { // Fox Orb (piercing)
        if (!inRange) return false;
        announce(u);
        const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
        S.projectiles.push({
          pierce: true, x: u.x, y: u.y - 26, vx: (t.x - u.x) / d * 420, vy: (t.y - u.y) / d * 420,
          src: u, team: effTeam(u), dmg: u.atk * 2, hit: new Set(), frame: 'gumiho_proj', face: t.x >= u.x ? 1 : -1, first: true
        });
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          S.particles.push({ x: u.x + Math.cos(a) * 26, y: u.y - 28 + Math.sin(a) * 18, vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 60, life: 0.3, max: 0.3, color: '#ffb030', size: 2, g: 0 });
        }
        Sound.play('foxorb');
        return true;
      }
      case 'jiangshi': { // Steel Talisman
        announce(u);
        u.shield = u.maxHp * 0.5; u.shieldT = 5;
        addSpr('jiangshi_spawn', u.x, u.y - 30, { dur: 0.5, s: 2, grow: true });
        addSpr('fx_buff1', u.x, u.y - 30, { dur: 0.5, s: 2 });
        S.flashBoard = { color: 'rgba(240,192,80,0.18)', t: 0.05 };
        S.units.forEach(v => {   // allies = the side it currently fights for (charm flips it)
          if (v !== u && v.alive && effTeam(v) === effTeam(u) && cheb(u, v) <= 1) {
            v.shield = Math.max(v.shield, v.maxHp * 0.2); v.shieldT = 5;
            addSpr('fx_buff1', v.x, v.y - 30, { dur: 0.5, s: 2 });
            if (u.team === 'P' && !u.shieldThanks) { u.shieldThanks = 1; reply(v, 'thanks'); }
          }
        });
        Sound.play('shield');
        return true;
      }
      case 'palcheok': { // Po-Po-Po bind + DOT
        if (!inRange) return false;
        announce(u);
        for (let i = 0; i < 3; i++) S.floats.push({ str: '포', x: t.x - 16 + i * 16, y: t.y - 70, st: NUM.skill, scale: 2, t: -i * 0.12, dur: 0.7, vx: 0, vy: -30, g: 0 });
        addSpr('palcheok_spawn', t.x, t.y - 8, { dur: 0.8, s: 4, behind: true });
        addSpr('palcheok_sfx', t.x, t.y - 34, { dur: 0.45, s: 2, flip: u.face < 0 });
        foes.filter(v => cheb(v, t) <= 1).forEach(v => {
          v.bind = Math.max(v.bind, 3 * (u.ccMul || 1));
          v.dots.push({ dps: u.atk * 0.8, t: 4, acc: 0, src: u });
          v.flashT = 0.05; v.freeze = Math.max(v.freeze, 0.1);
        });
        reply(t, 'bind');
        Juice.stop(J.stop.aoe, 0.4);
        Sound.play('popopo');
        return true;
      }
      case 'maiden': { // Wailing Curse on lowest HP anywhere
        const v = foes.reduce((a, b) => (b.hp < a.hp ? b : a));
        announce(u);
        S.fx.push({ type: 'reticle', u: v, t: 0, dur: 0.6, color: C.sel });
        S.dim = { t: 0.45, a: 0.3, keep: [u, v] };
        addSpr('maiden_sfx', u.x + u.face * 10, u.y - 40, { dur: 0.35, s: 2, grow: true });
        S.projectiles.push({ crescent: true, x: u.x, y: u.y - 30, target: v, src: u, dmg: u.atk * 3, frame: 'maiden_proj', speed: 600, face: v.x >= u.x ? 1 : -1 });
        Sound.play('wail');
        return true;
      }
      case 'reaper': { // Death Note
        announce(u);
        const low = foes.filter(v => v.hp / v.maxHp < 0.15).sort((a, b) => a.hp - b.hp)[0];
        const v = low || foes.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
        S.fx.push({ type: 'reticle', u: v, t: 0, dur: 0.5, color: '#ff3030' });
        if (!low) {
          addSpr('reaper_sfx', v.x, v.y - 26, { dur: 0.4, s: 2, flip: v.x < u.x });
          addSpr('fx_hit1', v.x, v.y - 26, { dur: 0.3, s: 2 });
          dealDamage(u, v, u.atk * 2.2, sk);
          Sound.play('deathnote');
        }
        if (v.alive && v.hp / v.maxHp < 0.15) execute(u, v);
        else if (!low) Juice.stop(J.stop.skill, J.shake.skill);
        return true;
      }
    }
    return false;
  }

  // ---- the four deadly enemy skills ---------------------------------------
  function castEnemySkill(u, foes, t, inRange) {
    const lv = u.slv || 1;
    switch (u.eskill) {
      case 'frost': {   // freeze everything around the target (melee casters: around themselves)
        const center = u.range > 1 ? (inRange ? t : null) : u;
        if (!center) return false;
        const hit = foes.filter(v => cheb(v, center) <= 1);
        if (!hit.length) return false;
        announce(u);
        hit.forEach(v => {
          dealDamage(u, v, u.atk * 0.8, { kind: 'skill' });
          if (!v.alive) return;
          v.frozen = Math.max(v.frozen, ESKV.frostT(lv)); v.castT = 0;
          shards(v.x, v.y - 24, '#dff8ff', 8);
        });
        S.fx.push({ type: 'frost', x: center.x, y: center.y - 20, t: 0, dur: 0.5 });
        S.flashBoard = { color: 'rgba(170,230,255,0.22)', t: 0.06 };
        reply(hit.find(v => v.alive), 'freeze');
        Juice.stop(J.stop.aoe, J.shake.aoe);
        Sound.play('shieldbreak');
        return true;
      }
      case 'poison': {  // a lingering cloud: heavy damage over 5 s on the 3x3 around the target
        if (!inRange) return false;
        announce(u);
        const pt = ESKV.poisonT(lv);
        S.fx.push({ type: 'cloud', r: t.r, c: t.c, t: 0, dur: Math.max(2.6, pt * 0.6), behind: true });
        foes.filter(v => cheb(v, t) <= 1).forEach(v => { v.dots.push({ dps: u.atk * 0.4, t: pt, acc: 0, src: u }); v.redT = 0.1; });
        reply(t, 'poison');
        Sound.play('curse');
        return true;
      }
      case 'meteor': {  // telegraphed: red marks on the busiest 3x3s, 1 s later they explode (more at higher levels)
        const spots = [];
        for (let k = 0; k < ESKV.meteors(lv); k++) {
          let best = null, bn = 0;
          for (const v of foes) {
            if (spots.some(s => cheb(s, v) < 2)) continue;   // each meteor hits a different place
            const n = foes.filter(w => cheb(w, v) <= 1).length;
            if (n > bn) { bn = n; best = v; }
          }
          if (!best) break;
          spots.push({ r: best.r, c: best.c });
        }
        if (!spots.length) return false;
        announce(u);
        spots.forEach((s, k) => S.meteors.push({ r: s.r, c: s.c, t: 0, delay: 1.0 + 0.3 * k, src: u, team: u.team, dmg: u.atk * (k ? 1.5 : 2.4) }));
        Sound.play('meteorfall');
        return true;
      }
      case 'roar': {    // fear: stun everything nearby, then weaker attacks for 4 s
        const hit = foes.filter(v => cheb(v, u) <= ESKV.roarR(lv));
        if (!hit.length) return false;
        announce(u);
        hit.forEach(v => { v.stun = Math.max(v.stun, ESKV.roarT(lv)); v.weakAmt = Math.max(v.weak > 0 ? v.weakAmt || 0 : 0, ESKV.weak(lv)); v.weak = Math.max(v.weak, 4); });
        S.fx.push({ type: 'roar', x: u.x, y: u.y - 30, t: 0, dur: 0.6, big: ESKV.roarR(lv) > 2 });
        S.trauma = Math.min(1, S.trauma + 0.4);
        reply(hit[0], 'fear');
        Sound.play('bossroar');
        return true;
      }
    }
    return false;
  }

  function updateMeteors(dt) {
    for (let i = S.meteors.length - 1; i >= 0; i--) {
      const m = S.meteors[i];
      m.t += dt;
      if (m.t < m.delay) continue;
      S.meteors.splice(i, 1);
      const p = cellCenter(m.r, m.c);
      S.units.filter(v => v.alive && v.team !== m.team && cheb(v, m) <= 1).forEach(v => {
        dealDamage(m.src, v, m.dmg, { kind: 'skill' });
        if (v.alive) v.dots.push({ dps: m.src.atk * 0.25, t: 3, acc: 0, src: m.src });
      });
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = m.r + dr, c = m.c + dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        const q = cellCenter(r, c);
        addSpr('fx_hit1', q.x + rand(-6, 6), q.y - 24 + rand(-6, 6), { dur: 0.35, s: 2 });
      }
      S.fx.push({ type: 'slam', name: 'fx_exec0', x: p.x, y: p.y - 30, t: 0, dur: 0.5 });
      S.fx.push({ type: 'scorch', r: m.r, c: m.c, t: 0, dur: 6, behind: true, seed: (Math.random() * 1e9) | 0 });
      S.fx.push({ type: 'shock', x: p.x, y: p.y - 6, t: 0, dur: 0.45, color: '255,160,60' });
      burst(p.x, p.y - 20, '#ff8030', 24, 220);
      S.flashBoard = { color: 'rgba(255,120,40,0.28)', t: 0.07 };
      S.trauma = Math.min(1, S.trauma + 0.6);
      Sound.play('execute');
    }
  }

  function execute(u, v) {
    S.dim = { t: 0.5, a: 0.5, keep: [u, v] };
    addSpr('reaper_spawn', v.x, v.y - 6, { dur: 0.7, s: 2, behind: true });
    addSpr('reaper_sfx', v.x, v.y - 26, { dur: 0.4, s: 2, flip: v.x < u.x });
    S.fx.push({ type: 'slam', name: 'fx_exec0', x: v.x, y: v.y - 30, t: 0, dur: 0.5 });
    number('처형!', v, 'exec');
    dealDamage(u, v, v.hp + 1, { kind: 'true', noMp: true });
    S.flashBoard = { color: 'rgba(255,255,255,0.6)', t: 0.017, then: { color: 'rgba(224,48,48,0.25)', t: 0.034 } };
    Juice.stop(J.stop.execute, J.shake.execute);
    Sound.play('deathnote', { exec: true });
  }

  function updateUnit(u, dt) {
    if (u.stun > 0) u.stun -= dt;
    if (u.bind > 0) u.bind -= dt;
    if (u.rage > 0) u.rage -= dt;
    if (u.curse > 0) u.curse -= dt;
    if (u.charm > 0) { u.charm -= dt; if (u.charm <= 0) u.target = null; }
    if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
    if (u.frozen > 0) u.frozen -= dt;
    if (u.weak > 0) { u.weak -= dt; if (u.weak <= 0) u.weakAmt = 0; }
    if (u.boss && !u.enraged && u.hp < u.maxHp * 0.5) {   // bosses go berserk at half HP
      u.enraged = true; u.aspd *= 1.4; u.atk *= 1.25;
      number('광폭화!', u, 'exec'); say(u, drawLine('enrage', ENRAGE_LINES), 'boss');
      S.fx.push({ type: 'shock', x: u.x, y: u.y - 20, t: 0, dur: 0.5, color: '255,60,60' });
      S.trauma = Math.min(1, S.trauma + 0.3); Sound.play('bloodrage');
    }

    for (let i = u.dots.length - 1; i >= 0; i--) {
      const d = u.dots[i];
      d.t -= dt; d.acc += dt;
      while (d.acc >= 0.5) {
        d.acc -= 0.5;
        dealDamage(d.src, u, d.dps * 0.5, { kind: 'dot', noMp: true });
        if (!u.alive) return;
      }
      if (d.t <= 0) u.dots.splice(i, 1);
    }

    if (u.moveT < 1) {
      u.moveT = Math.min(1, u.moveT + dt / (u.moveDur || u.def.move));
      const p = cellCenter(u.r, u.c);
      u.x = lerp(u.fromX, p.x, u.moveT);
      u.y = lerp(u.fromY, p.y, u.moveT);
      if (u.moveT >= 1) squash(u, 1.2, 0.8, 0.05);
      if (u.moveT < 1) return;
    }
    if (u.stun > 0 || u.frozen > 0) { u.castT = 0; return; }

    // skill telegraph (CAST state): 200ms before the skill fires
    if (u.castT > 0) {
      u.castT -= dt;
      if (u.castT <= 0) {
        if (u.bind <= 0 && castSkill(u)) u.mp = 0;
        else { u.castRetry = 0.4; u.anim = 'idle'; u.castHold = 0; }
      }
      return;
    }
    if (u.castRetry > 0) u.castRetry -= dt;

    if (u.atkCd > 0) u.atkCd -= dt;
    u.retarget -= dt;
    if (!u.target || !isHostile(u, u.target) || u.retarget <= 0) {
      u.target = findTarget(u, false);
      u.retarget = 1;
    }
    const t = u.target;
    if (!t) return;

    if (u.maxMp && u.mp >= u.maxMp && u.bind <= 0 && !(u.castRetry > 0) && skillReady(u, t)) {
      u.castT = J.castTime;
      u.castSkillName = skillName(u);
      u.anim = 'cast'; u.animT = 0; u.castHold = J.castTime;
      S.floats.push({ str: skillName(u) + (u.slv ? ' Lv.' + u.slv : '') + '!', x: u.x, y: u.y - 72, st: NUM.skill, scale: 1, t: 0, dur: 0.9, vx: 0, vy: -20, g: 0 });
      return;
    }

    if (cheb(u, t) <= u.range) {
      u.blocked = 0;
      if (u.atkCd <= 0.07 && u.atkPhase === 0 && u.range === 1) { u.atkPhase = -1; u.anim = 'atk'; u.animT = 0; squash(u, 0.92, 1.08, 0.07); }
      if (u.atkCd <= 0) doAttack(u, t);
    } else if (u.bind <= 0) {
      if (stepToward(u, t)) { u.blocked = 0; u.anim = 'walk'; u.atkPhase = 0; }
      else {
        u.blocked += dt;
        if (u.blocked > 0.4) { const alt = findTarget(u, true); if (alt) u.target = alt; }
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
      const p = S.projectiles[i];
      if (p.pierce) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.random() < 0.7) S.particles.push({ x: p.x - p.vx * 0.02, y: p.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-30, 10), life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#ffe060' : '#ff8030', size: 2, g: 0 });
        for (const v of S.units) {
          if (!v.alive || v.team === p.team || p.hit.has(v)) continue;
          if (Math.hypot(v.x - p.x, v.y - 26 - p.y) < 30) {
            p.hit.add(v);
            addSpr('fx_hit0', v.x, v.y - 26, { dur: 0.25, s: 2 });
            addSpr('gumiho_spawn', v.x, v.y - 6, { dur: 0.4, s: 2 });
            v.freeze = Math.max(v.freeze, 0.05);
            dealDamage(p.src, v, p.dmg, { kind: 'skill' });
            if (p.first) { Juice.stop(0.05, 0.25); p.first = false; }
          }
        }
        const b = boardRect();
        if (p.x < b.x - 30 || p.x > b.x + b.w + 30 || p.y < b.y - 60 || p.y > CONSOLE_Y) S.projectiles.splice(i, 1);
        continue;
      }
      const t = p.target;
      if (!t.alive) { S.projectiles.splice(i, 1); continue; }
      const tx = t.x, ty = t.y - 26;
      if (p.heart) {   // charm heart: sine-wave flight
        p.t += dt;
        const dx = tx - p.x0, dy = ty - p.y0, d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, p.t * p.speed / d);
        p.x = p.x0 + dx * k + (-dy / d) * Math.sin(k * Math.PI * 3) * 6;
        p.y = p.y0 + dy * k + (dx / d) * Math.sin(k * Math.PI * 3) * 6;
        if (k >= 1) {
          S.projectiles.splice(i, 1);
          for (let h = 0; h < 5; h++) S.fx.push({ type: 'sprite', name: 'fx_charm1', x: tx + rand(-14, 14), y: ty + rand(-10, 6), t: 0, dur: 0.6, s: 2, rise: 20 });
          dealDamage(p.src, t, p.src.atk, { kind: 'skill' });
          if (t.alive) { t.charm = 3 * (p.src && p.src.ccMul || 1); t.target = null; number('매혹!', t, 'skill'); reply(t, 'charm'); }
          Juice.stop(0.05, 0.2);
        }
        continue;
      }
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (d <= stepLen + 6) {
        S.projectiles.splice(i, 1);
        if (p.crescent) {
          addSpr('maiden_spawn', t.x, t.y - 6, { dur: 0.5, s: 2, behind: true });
          addSpr('fx_debuff1', t.x, t.y - 30, { dur: 0.5, s: 2 });
          t.curse = 4;
          reply(t, 'curse');
          dealDamage(p.src, t, p.dmg, { kind: 'skill' });
          Juice.stop(J.stop.skill, J.shake.skill);
        } else {
          addSpr(p.crit ? 'fx_hit1' : 'fx_hit0', t.x, t.y - 26, { dur: 0.25, s: 2, flip: p.face < 0 });
          dealDamage(p.src, t, p.dmg, { kind: p.crit ? 'crit' : 'normal' });
        }
      } else {
        p.x += dx / d * stepLen; p.y += dy / d * stepLen;
        if (p.crescent && Math.random() < 0.6) S.particles.push({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.25, max: 0.25, color: '#a0c0ff', size: 2, g: 0 });
      }
    }
  }

  function simStep(dt) {
    S.battleT += dt;
    for (const u of S.units) if (u.alive) updateUnit(u, dt);
    updateProjectiles(dt);
    updateMeteors(dt);
    if (S.ending) return;
    let p = false, e = false;
    for (const u of S.units) if (u.alive) { if (u.team === 'P') p = true; else e = true; }
    if (!e) beginEnding(true, false);
    else if (!p) beginEnding(false, false);
    else if (S.battleT >= BATTLE_LIMIT) endBattle(false, true);
  }

  // final kill: hit-stop, slow motion, then the result
  function beginEnding(win) {
    if (win) {
      const boss = isBossLevel(S.level);
      Juice.stop(boss ? J.stop.boss : J.stop.final, boss ? J.shake.boss : J.shake.final, true);
      S.ending = { win, t: 0, dur: boss ? 1.2 : 0.9, scale: 0.25 };
      if (boss) S.flashBoard = { color: 'rgba(255,255,255,0.5)', t: 0.017 };
    } else {
      S.ending = { win, t: 0, dur: 0.6, scale: 0.4 };
    }
    Sound.play('slowmo');
  }

  // =====================================================================
  //  JUICE  (feedback layer - never changes combat numbers)
  // =====================================================================
  const Juice = {
    stop(sec, shake, force) {
      const k = 1 / Math.sqrt(S.speed);
      if (sec > 0) {
        const want = sec * k;
        const use = force ? want : Math.min(want, S.stopBank);
        S.stopBank -= Math.min(S.stopBank, use);
        S.hitstop = Math.max(S.hitstop, use);
      }
      if (shake && !reducedMotion) S.trauma = Math.min(1, S.trauma + shake);
    },
    hit(src, tgt, dmg, kind, killed, before, o) {
      const k = 1 / Math.sqrt(S.speed);
      // flash
      const big = kind === 'crit' || kind === 'skill' || kind === 'true';
      if (kind !== 'dot') {
        tgt.flashT = (big ? 0.083 : 0.05) * k; tgt.flashBig = big;
        if (tgt.team === 'P') tgt.redT = 0.083 * k;
        // knockback away from the attacker
        let dx = 1, dy = 0;
        if (src) { dx = tgt.x - src.x; dy = (tgt.y - src.y) * (PORTRAIT ? 0.8 : 0.3); const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; }
        const kb = killed ? J.kb.kill : J.kb[kind === 'true' ? 'skill' : kind] || J.kb.normal;
        const bossK = tgt.boss ? 0.5 : 1;
        tgt.kbx = dx * kb[0] * bossK; tgt.kby = dy * kb[0] * bossK; tgt.kbT = kb[1]; tgt.kbDur = kb[1];
        if (killed) tgt.kbHop = 6;
        tgt.chunkT = 0.12; tgt.trailHold = 0.3;
        // hit pose only for meaningful hits
        if (dmg >= tgt.maxHp * 0.03 || big) {
          if (tgt.anim === 'idle' || tgt.anim === 'walk') { tgt.anim = 'hit'; tgt.animT = 0; tgt.hitT = 0.18; }
          squash(tgt, 0.86, 1.12, 0.066);
        }
      }
      // local / global stops + shake
      if (kind === 'crit') {
        Juice.stop(J.stop.crit, J.shake.crit);
        tgt.freeze = Math.max(tgt.freeze, J.local.crit * k);
        if (src) src.freeze = Math.max(src.freeze, J.local.crit * k);
      } else if (kind === 'skill') {
        tgt.freeze = Math.max(tgt.freeze, J.local.skill * k);
      } else if (kind === 'normal') {
        if (o && o.melee) { tgt.freeze = Math.max(tgt.freeze, J.local.melee * k); if (src) src.freeze = Math.max(src.freeze, J.local.melee * k); }
        else tgt.freeze = Math.max(tgt.freeze, J.local.ranged * k);
        if (tgt.boss) S.trauma = Math.min(1, S.trauma + J.shake.bossHit);
      }
      // hit sparks
      if (o && o.melee) {
        addSpr(kind === 'crit' ? 'fx_attack1' : 'fx_attack0', tgt.x, tgt.y - 26, { dur: 0.22, s: 2, flip: src && src.x > tgt.x });
        if (kind === 'crit') addSpr('fx_hit0', tgt.x, tgt.y - 26, { dur: 0.22, s: 2 });
      }
      // numbers
      if (kind === 'dot') { if (dmg >= 1) number(fmt(dmg), tgt, 'dot'); }
      else if (kind === 'crit') { number(fmt(dmg), tgt, 'crit'); }
      else if (kind === 'skill' || kind === 'true') { if (kind === 'skill') number(fmt(dmg), tgt, 'skill'); }
      else number(fmt(dmg), tgt, tgt.team === 'P' ? 'hurt' : 'normal', src);
      // sound (repeated hits on the same target climb in pitch)
      if (kind === 'crit') Sound.play('crit');
      else if (kind === 'skill') Sound.play('skillhit');
      else if (kind === 'normal') {
        tgt.hitChain = (S.time - (tgt.lastHit || -9) < 1) ? Math.min(6, (tgt.hitChain || 0) + 1) : 0;
        tgt.lastHit = S.time;
        Sound.play('hit', { pitch: tgt.hitChain });
      }
    }
  };

  function squash(u, sx, sy, dur) { u.sqx = sx; u.sqy = sy; u.sqT = dur; u.sqDur = dur; }

  // floating damage numbers (pool <= 40, stacked per unit)
  function number(str, u, kind, src) {
    if (S.floats.length > 40) S.floats.shift();
    const now = S.time;
    if (u.numT && now - u.numT < 0.15) u.numTier = Math.min(3, (u.numTier || 0) + 1); else u.numTier = 0;
    u.numT = now;
    const y = u.y - 50 - u.numTier * 9;
    const away = src ? (u.x >= src.x ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
    const f = { str, x: u.x + rand(-4, 4), y, t: 0, vx: 0, vy: 0, g: 0, scale: 1, pop: 0, dur: 0.6 };
    switch (kind) {
      case 'normal': Object.assign(f, { st: NUM.normal, scale: 2, vx: away * 25, vy: -90, g: 260, pop: 0.05 }); break;
      case 'hurt': Object.assign(f, { st: NUM.hurt, scale: 2, vx: away * 25, vy: -90, g: 260, pop: 0.05 }); break;
      case 'skill': Object.assign(f, { st: NUM.skill, scale: 2, vy: -70, g: 60, pop: 0.066, dur: 0.8 }); break;
      case 'crit': Object.assign(f, { st: NUM.crit, scale: 3, vy: -120, g: 260, pop: 0.083, dur: 0.9, crit: true, vx: away * 20 }); break;
      case 'heal': Object.assign(f, { st: NUM.heal, scale: 2, vy: -40, dur: 0.7 }); break;
      case 'dot': Object.assign(f, { st: NUM.dot, vy: -20, dur: 0.45 }); break;
      case 'block': Object.assign(f, { st: NUM.block, scale: 2, vy: -60, g: 200, dur: 0.5 }); break;
      case 'exec': Object.assign(f, { st: NUM.exec, scale: 3, pop: 0.05, dur: 1.0, y: u.y - 76 }); break;
    }
    S.floats.push(f);
  }

  // =====================================================================
  //  FX helpers
  // =====================================================================
  function addSpr(name, x, y, o) {
    if (!FR[name]) return;
    if (S.fx.length > 64) S.fx.shift();
    S.fx.push({ type: 'sprite', name, x, y, t: 0, dur: o.dur || 0.4, s: o.s || 2, flip: !!o.flip, rise: o.rise || 0, grow: !!o.grow, behind: !!o.behind });
  }
  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      if (S.particles.length > 300) break;
      const a = Math.random() * Math.PI * 2, s = rand(spd * 0.3, spd);
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.3, 0.7), max: 0.7, color, size: Math.random() < 0.7 ? 2 : 4, g: 160 });
    }
  }
  function shards(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      if (S.particles.length > 300) break;
      const a = -Math.PI / 2 + rand(-1.3, 1.3), s = rand(60, 160);
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 0.8), max: 0.8, color, size: 2, g: 320, floor: y + 24, bounce: true });
    }
  }
  function stream(x1, y1, x2, y2, color, n) {
    for (let i = 0; i < n; i++) {
      const k = i / n;
      S.particles.push({ x: lerp(x1, x2, k), y: lerp(y1, y2, k), vx: (x2 - x1) * 0.9 + rand(-15, 15), vy: (y2 - y1) * 0.9 + rand(-25, 5), life: 0.25 + k * 0.25, max: 0.5, color, size: 2, g: 0 });
    }
  }
  function logMsg(str, color) {
    S.log.push({ str, color: color || '#fff' });
    if (S.log.length > 5) S.log.shift();
  }

  // presentation timers for a unit; dt is sim-scaled, rdt real
  function animateUnit(u, dt, rdt) {
    if (u.flashT > 0) { u.flashT -= rdt; if (u.flashT <= 0 && u.redT > 0) { /* red follows white */ } }
    else if (u.redT > 0) u.redT -= rdt;
    if (u.chunkT > 0) u.chunkT -= rdt;
    if (u.trailHold > 0) u.trailHold -= rdt;
    else if (u.hpTrail > u.hp) u.hpTrail = Math.max(u.hp, u.hpTrail - u.maxHp * 2.5 * rdt);
    if (u.freeze > 0) { u.freeze -= rdt; return; }
    u.animT += dt;
    if (u.sqT > 0) u.sqT -= dt;
    if (u.kbT > 0) u.kbT -= dt;
    if (u.lungeT > 0) u.lungeT -= dt;
    if (u.hitT > 0) { u.hitT -= dt; if (u.hitT <= 0 && u.anim === 'hit') { u.anim = 'idle'; u.animT = 0; } }
    if (u.castHold > 0) { u.castHold -= dt; if (u.castHold <= 0 && u.anim === 'cast') { u.anim = 'idle'; u.animT = 0; } }
    if (u.anim === 'atk' && u.atkPhase === 1 && u.animT > 0.17) { u.anim = 'idle'; u.animT = 0; u.atkPhase = 0; }
    if (u.anim === 'walk' && u.moveT >= 1) { u.anim = 'idle'; u.animT = 0; }
    if (u.spawnT < 0.4) {
      const was = u.spawnT;
      u.spawnT += rdt;
      if (was < 0 && u.spawnT >= 0 && S.scene === 'battle') {
        if (u.team === 'P' && !u.mon) { addSpr(u.def.id + '_spawn', u.x, u.y - 8, { dur: 0.5, s: 2, behind: true, grow: true }); Sound.play('spawn'); }
        else {   // monsters climb out of a dark portal in a puff of dust
          S.fx.push({ type: 'portal', x: u.x, y: u.y, t: 0, dur: 0.7, behind: true, big: !!u.boss });
          addSpr('fx_spawn1', u.x, u.y - 24, { dur: 0.45, s: 2, grow: true });
          for (let i = 0; i < 8; i++) S.particles.push({ x: u.x + rand(-14, 14), y: u.y, vx: rand(-50, 50), vy: rand(-40, -10), life: rand(0.3, 0.5), max: 0.5, color: i % 2 ? '#8a6aa8' : '#3a2a4a', size: 2, g: 60 });
          Sound.play('portal');
        }
        squash(u, 1.25, 0.8, 0.08);
      }
    }
    if (u.rage > 0 && u.alive) {
      u.afterT -= dt;
      if (u.afterT <= 0) { u.afterT = 0.066; S.fx.push({ type: 'after', u, name: unitFrame(u), x: u.x, y: u.y, flip: unitFlip(u), t: 0, dur: 0.2 }); }
    }
    if (!u.alive) u.deadT += dt;
  }

  function unitFrame(u) {
    if (u.mon) return 'en_' + u.skin;
    const id = u.def.id;
    if (!u.alive || u.stun > 0) return id + '_idle0';
    switch (u.anim) {
      case 'cast': return id + '_cast';
      case 'atk': return u.atkPhase === -1 ? id + '_atk0' : id + '_atk1';
      case 'hit': return id + '_idle1';
      case 'walk': return id + (Math.floor(u.animT / 0.11) % 2 ? '_walk1' : '_walk0');
      default: return id + (Math.floor((u.animT + u.bob) / (u.boss ? 0.44 : 0.36)) % 2 ? '_idle1' : '_idle0');
    }
  }
  function unitFlip(u) {
    if (u.mon) return u.mon.face === 1 ? u.face < 0 : u.mon.face === -1 ? u.face > 0 : false;
    return u.face < 0;
  }

  function updateFx(dt, rdt) {
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const f = S.fx[i];
      f.t += f.type === 'star' || f.type === 'sprite' && f.name && f.name.indexOf('tx_') === 0 ? rdt : dt;
      if (f.type === 'star') { f.x += f.vx * rdt; f.y += f.vy * rdt; f.vy += 200 * rdt; }
      if (f.t >= f.dur) S.fx.splice(i, 1);
    }
    for (let i = S.floats.length - 1; i >= 0; i--) {
      const f = S.floats[i];
      f.t += rdt;
      if (f.t > 0) { f.x += f.vx * rdt; f.y += f.vy * rdt; f.vy += (f.g || 0) * rdt; }
      if (f.t >= f.dur) S.floats.splice(i, 1);
    }
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g == null ? 120 : p.g) * dt;
      if (p.bounce && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.bounce = false; }
      if (p.life <= 0) S.particles.splice(i, 1);
    }
    if (S.msgT > 0) S.msgT -= rdt;
  }

  // =====================================================================
  //  AMBIENT (per zone, pooled, 48 max)
  // =====================================================================
  function updateAmbient(rdt) {
    const z = zoneOf(S.level);
    const want = { fog: 0, bats: 3, fireflies: 12, petals: 14, embers: 24 }[z.amb] || 0;
    if (S.ambZone !== z.id) { S.amb = []; S.ambZone = z.id; }
    while (S.amb.length < want) {
      const a = { x: rand(0, W), y: rand(STAGE_Y + 10, CONSOLE_Y - 20), vx: 0, vy: 0, t: rand(0, 4), life: rand(2, 4) };
      if (z.amb === 'bats') { a.y = rand(STAGE_Y + 12, STAGE_Y + 82); a.vx = rand(30, 60) * (Math.random() < 0.5 ? -1 : 1); }
      else if (z.amb === 'fireflies') { a.vx = rand(-8, 8); a.vy = rand(-6, 6); }
      else if (z.amb === 'petals') { a.y = rand(STAGE_Y, STAGE_Y + 92); a.vx = rand(10, 25); a.vy = rand(12, 24); }
      else if (z.amb === 'embers') { a.y = rand(FLOOR_Y - 5, CONSOLE_Y); a.vx = rand(-6, 6); a.vy = -rand(20, 40); }
      S.amb.push(a);
    }
    for (const a of S.amb) {
      a.t += rdt; a.x += a.vx * rdt; a.y += a.vy * rdt;
      if (z.amb === 'fireflies') { a.vx += rand(-20, 20) * rdt; a.vy += rand(-20, 20) * rdt; }
      if (a.x < -20) a.x = W + 10; if (a.x > W + 20) a.x = -10;
      if (a.y < STAGE_Y - 10 || a.y > CONSOLE_Y + 10 || (z.amb === 'embers' && a.t > a.life)) {
        a.t = 0; a.x = rand(0, W);
        a.y = z.amb === 'embers' ? rand(FLOOR_Y + 55, CONSOLE_Y) : z.amb === 'petals' ? STAGE_Y : rand(STAGE_Y + 10, CONSOLE_Y - 20);
      }
    }
    // crow fly-by (graveyard)
    if (z.id === 'graveyard') {
      S.crowT = (S.crowT == null ? rand(4, 9) : S.crowT) - rdt;
      if (S.crowT <= 0 && !S.crow) { S.crow = { x: -20, y: rand(STAGE_Y + 12, STAGE_Y + 52), t: 0 }; S.crowT = rand(9, 14); }
    }
    if (S.crow) { S.crow.t += rdt; S.crow.x += 150 * rdt; S.crow.y += Math.sin(S.crow.t * 3) * 0.4; if (S.crow.x > W + 30) S.crow = null; }
  }

  // =====================================================================
  //  RENDERING
  // =====================================================================
  const zoneLayers = new Map();
  let zoneLayer = null;   // reset when the atlas (re)loads
  // stage composite (strip at 3x + tiled floor), baked once per zone
  function getZoneLayer(z) {
    if (zoneLayer === null) zoneLayers.clear();
    const lh = PORTRAIT ? H - STAGE_Y : 280, key = z.id + lh;
    if (zoneLayers.has(key)) return zoneLayers.get(key);
    if (atlasState !== 'ready') return null;
    if (zoneLayers.size > 6) zoneLayers.clear();
    const c = document.createElement('canvas');
    c.width = 708; c.height = lh;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = C.panel; g.fillRect(0, 0, c.width, c.height);
    const f = FR[z.bg];
    if (f) g.drawImage(atlas, f[0], f[1], f[2], f[3], 0, 0, f[2] * 3, f[3] * 3);
    const t = FR[z.tile];
    const fy = FLOOR_Y - STAGE_Y;
    if (t) for (let x = 0; x < c.width; x += t[2] * 2) for (let y = fy; y < c.height; y += t[3] * 2) g.drawImage(atlas, t[0], t[1], t[2], t[3], x, y, t[2] * 2, t[3] * 2);
    g.fillStyle = 'rgba(6,17,25,0.45)'; g.fillRect(0, fy, c.width, c.height - fy);
    g.fillStyle = z.wash; g.fillRect(0, fy, c.width, c.height - fy);
    const grd = g.createLinearGradient(0, fy - 2, 0, fy + 10);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, fy - 2, c.width, 12);
    if (z.id === 'hell' && FR.tl_lava) {
      const l = FR.tl_lava;
      for (let x = 0; x < c.width; x += l[2] * 2) g.drawImage(atlas, l[0], l[1] + l[3] - 8, l[2], 8, x, c.height - 16, l[2] * 2, 16);
    }
    zoneLayer = c;
    zoneLayers.set(key, c);
    return c;
  }
  // corner props are laid out for 640 px; portrait squeezes them toward the edges
  const propX = x => (PORTRAIT ? (x < 320 ? x * 0.6 : W - (640 - x) * 0.6) : x);

  function drawStage(z, t) {
    const layer = getZoneLayer(z);
    const pan = Math.round(-34 + 34 * Math.sin((t * Math.PI * 2) / 40));
    if (layer) ctx.drawImage(layer, pan, STAGE_Y);
    else { ctx.fillStyle = C.panel; ctx.fillRect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y); }
    // lap mood (every 25 levels) + boss mood
    const mood = S.scene !== 'title' ? zoneMood(S.level) : null;
    if (mood) { ctx.fillStyle = mood.wash; ctx.fillRect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y); }
    if (isBossLevel(S.level) && S.scene !== 'title') {
      ctx.fillStyle = 'rgba(64,0,16,0.25)'; ctx.fillRect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y);
    }
    // ambient
    drawAmbient(z);
    // corner props
    z.props.forEach(p => spr(p[0], propX(p[1]), p[2] - 28 + STAGE_Y, p[3]));
  }

  function drawAmbient(z) {
    if (z.amb === 'fog') {
      const bands = PORTRAIT ? 6 : 2, gap = PORTRAIT ? 64 : 40;
      for (let i = 0; i < bands; i++) {
        const x = ((S.time * (8 + (i % 3) * 6) + i * 170) % (W + 300)) - 300;
        ctx.fillStyle = 'rgba(160,180,210,0.06)';
        ctx.fillRect(Math.round(x), FLOOR_Y - 55 + i * gap, 300, 14);
        ctx.fillRect(Math.round(x) + 40, FLOOR_Y - 59 + i * gap, 200, 6);
      }
      const a = 0.1 + 0.08 * Math.sin(S.time * Math.PI / 2);
      ctx.fillStyle = 'rgba(220,230,255,' + a.toFixed(3) + ')';
      ctx.fillRect(W - 170 + Math.round(-34 + 34 * Math.sin((S.time * Math.PI * 2) / 40)), STAGE_Y + 22, 10, 10);
    }
    for (const a of S.amb) {
      if (z.amb === 'bats') spr('en_bat', a.x, a.y, 1, { flip: a.vx > 0, sy: Math.floor(a.t * 8) % 2 ? 0.7 : 1 });
      else if (z.amb === 'fireflies') { if (Math.sin(a.t * 3 + a.life) > 0.2) { ctx.fillStyle = '#c8f060'; ctx.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); } }
      else if (z.amb === 'petals') { ctx.fillStyle = '#ffb0c8'; ctx.fillRect(Math.round(a.x), Math.round(a.y), 2, 1 + (Math.floor(a.t * 4) % 2)); }
      else if (z.amb === 'embers') { ctx.globalAlpha = clamp(1 - a.t / a.life, 0, 1); ctx.fillStyle = a.t % 0.4 < 0.2 ? '#ff9040' : '#ffd060'; ctx.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); ctx.globalAlpha = 1; }
    }
    if (S.crow) spr('ob_crow', S.crow.x, S.crow.y, 1, { sy: Math.floor(S.crow.t * 8) % 2 ? 0.7 : 1 });
  }

  function panel(x, y, w, h, fill) {
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.line; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = fill || C.panel; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = C.lineHi; ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + 3, 1, h - 6);
    ctx.fillStyle = '#000';   // cut corners
    ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + w - 2, y, 2, 2); ctx.fillRect(x, y + h - 2, 2, 2); ctx.fillRect(x + w - 2, y + h - 2, 2, 2);
  }

  function button(r, label, color, enabled, scale, sub) {
    const hot = enabled && inRect(S.mouse, r);
    ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = enabled ? (hot ? lighten(color) : color) : '#1c2836';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x + 2, r.y + r.h - 6, r.w - 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
    const s = scale || 2;
    const ty = sub ? r.y + r.h / 2 - 7 * s / 2 - 7 : r.y + r.h / 2 - 7 * s / 2 - 1;
    text(label, r.x + r.w / 2, ty, enabled ? '#fff' : '#5a6a7e', s, 'center');
    if (sub) sub(r.x + r.w / 2, r.y + r.h / 2 + 4, enabled);
  }
  function lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.min(255, v + 40);
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function costLabel(cost, enabled) {
    return (cx, cy) => {
      const s = String(cost);
      const w = 16 + s.length * 12;
      spr('ic_coin', cx - w / 2 + 7, cy + 7, 1);
      text(s, cx - w / 2 + 16, cy + 1, enabled ? C.gold : '#7a6a30', 2);
    };
  }

  function drawHUD() {
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = C.line; ctx.fillRect(0, HUD_H - 2, W, 2);
    // portrait: two rows (row 1 = level / lives / gold / units, row 2 = stage info + buttons)
    const P = PORTRAIT, r2 = P ? 26 : 0;
    text('레벨 ' + pad3(S.level), 6, 4, C.gold, 2);
    // boss pips (progress to the next boss)
    const into = S.level % 5;   // pips: progress to the next boss wave (every 5 levels)
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 4 ? (into === 0 ? C.sel : '#4a1c22') : i < (into === 0 ? 5 : into) ? C.gold : '#2a3646';
      ctx.fillRect(6 + i * 13, P ? 33 : 20, 11, 4);
    }
    const zx = P ? 80 : 84;
    text(fitText(zoneName(S.level), P ? 110 : 66, 1), zx, P ? r2 + 2 : 6, C.text, 1);
    if (isBossLevel(S.level) && Math.floor(S.time * 3) % 2 === 0) text('보스!', P ? 196 : 84, P ? r2 + 2 : 16, C.sel, 1);
    const hy = P ? 13 : 14;
    for (let i = 0; i < S.lives - (S.heartFall ? 1 : 0); i++) spr('ic_heart', HEART_X + i * 18, hy, 1);
    if (S.heartFall) {
      const k = clamp(S.heartFall.t / 0.5, 0, 1);
      spr('ic_heart', S.heartFall.x - 4 * k, hy + 40 * k * k, 1, { a: 1 - k, tint: 'r' });
      spr('ic_heart', S.heartFall.x + 4 * k, hy + 46 * k * k, 1, { a: 1 - k });
    }
    const pulse = S.hudPulse > 0 ? 1 + S.hudPulse : 1;
    spr('ic_coin', GOLD_POS.x, GOLD_POS.y, 1);
    text(fmt(S.goldShown), GOLD_POS.x + 12, (P ? 5 : 6) - (pulse > 1 ? 1 : 0), pulse > 1 ? '#fff6b0' : C.gold, 2);
    const bc = S.scene === 'battle' || S.scene === 'result' ? S.units.filter(u => u.team === 'P' && u.alive).length : boardCount();
    text('유닛 ' + bc + '/' + playerCap(S.level), P ? 304 : 340, P ? 5 : 6, C.hover, 2);
    text('최고 ' + pad3(S.best), P ? 236 : 466, P ? r2 + 2 : 4, C.text, 1);
    text('제단 ' + S.power, P ? 300 : 466, P ? r2 + 2 : 15, '#b080ff', 1);
    button(BTN_SOUND, Sound.isMuted() ? '끔' : '소리', Sound.isMuted() ? '#3a4656' : '#2a5a8a', true, 1);
    if (S.scene === 'prep') button(BTN_HELP, '?', '#5a4a1a', true, 1);
    if (S.saveT > 0) text('저장됨', P ? W - 6 : BTN_HELP.x - 6, P ? 7 : 9, 'rgba(160,230,170,' + clamp(S.saveT, 0, 1).toFixed(2) + ')', 1, 'right');
  }

  function drawBoard() {
    const prep = S.scene === 'prep';
    const alpha = prep ? 0.62 : 0.45;
    const showDrop = prep && ((S.drag && S.drag.active) || (S.sel && S.sel.kind === 'roster'));
    const dragCell = S.drag && S.drag.active ? dropCell(S.drag.feet) : null;
    const hoverCell = prep && !S.drag ? cellAt(S.mouse) : null;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.cell;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = cellRect(r, c); ctx.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4); }
    ctx.globalAlpha = 1;
    // attack range of the ghost being placed / selected: translucent cells (orange melee, blue ranged)
    const rng = prep ? placingRange() : null;
    if (rng) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = Math.max(Math.abs(r - rng.r), Math.abs(c - rng.c));
        if (d === 0 || d > rng.range) continue;
        const foe = c >= PCOLS, q = cellRect(r, c);
        ctx.fillStyle = rng.range > 1 ? 'rgba(110,190,255,' + (foe ? 0.3 : 0.15) + ')' : 'rgba(255,160,70,' + (foe ? 0.34 : 0.17) + ')';
        ctx.fillRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      }
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const q = cellRect(r, c);
      const x = q.x + 2, y = q.y + 2, w = q.w - 4, h = q.h - 4;
      ctx.strokeStyle = c < PCOLS ? C.grid : '#5e4656';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#08131d';
      ctx.fillRect(x + 1, y + h - 1, w - 1, 1); ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
      if (showDrop && c < PCOLS) {
        ctx.strokeStyle = 'rgba(62,167,202,' + (0.45 + 0.35 * Math.sin(S.time * Math.PI * 4)).toFixed(3) + ')';
        ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      }
      const hot = (dragCell && dragCell.r === r && dragCell.c === c) || (hoverCell && hoverCell.r === r && hoverCell.c === c && c < PCOLS && (S.sel && S.sel.kind === 'roster'));
      if (hot) {
        const enemy = c >= PCOLS;
        ctx.fillStyle = enemy ? 'rgba(224,72,79,0.18)' : 'rgba(62,167,202,0.28)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = enemy ? C.sel : '#48c0e8'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
    // divider between the two sides
    ctx.globalAlpha = 0.7;
    if (PORTRAIT) {
      ctx.fillStyle = C.sel; ctx.fillRect(BOARD_X, MID_Y - 1, ROWS * CELL_W, 1);
      ctx.fillStyle = C.hover; ctx.fillRect(BOARD_X, MID_Y, ROWS * CELL_W, 1);
    } else {
      ctx.fillStyle = C.hover; ctx.fillRect(BOARD_X + PCOLS * CELL_W - 1, BOARD_Y, 1, ROWS * CELL_H);
      ctx.fillStyle = C.sel; ctx.fillRect(BOARD_X + PCOLS * CELL_W, BOARD_Y, 1, ROWS * CELL_H);
    }
    ctx.globalAlpha = 1;
  }

  // origin cell + range for the overlay: the drop cell while dragging, the hovered cell while a
  // ghost is selected (tap-to-place preview), else the selected ghost's own cell
  function placingRange() {
    let u = null, cell = null;
    if (S.drag && S.drag.active) { u = S.drag.u; cell = dropCell(S.drag.feet); }
    else if (S.sel && S.sel.kind === 'roster' && S.roster.indexOf(S.sel.u) >= 0) {
      u = S.sel.u;
      const hc = cellAt(S.mouse);
      cell = hc && hc.c < PCOLS ? hc : u.loc === 'board' ? { r: u.r, c: u.c } : null;
    }
    if (!u || !cell || cell.c >= PCOLS) return null;
    return { r: cell.r, c: cell.c, range: GMAP[u.id].range };
  }

  function drawBars(u, x, y, w) {
    const bx = Math.round(x - w / 2), by = Math.round(y);
    const hh = u.boss ? 5 : 4;
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, w + 2, hh + (u.maxMp ? 4 : 2));
    const k = clamp(u.hp / u.maxHp, 0, 1), kt = clamp(u.hpTrail / u.maxHp, 0, 1);
    ctx.fillStyle = '#301010'; ctx.fillRect(bx, by, w, hh);
    if (kt > k) { ctx.fillStyle = u.chunkT > 0 ? '#ffffff' : '#f0c050'; ctx.fillRect(bx + Math.floor(w * k), by, Math.ceil(w * (kt - k)), hh); }
    const low = k < 0.25 && Math.floor(S.time * 8) % 2 === 0;
    ctx.fillStyle = u.team === 'P' ? (low ? '#a0ffa0' : C.hpAlly) : (low ? '#ff8080' : C.hpFoe);
    ctx.fillRect(bx, by, Math.ceil(w * k), hh);
    if (u.shield > 0) { ctx.fillStyle = '#d0f8ff'; ctx.fillRect(bx, by, Math.ceil(w * clamp(u.shield / u.maxHp, 0, 1)), 2); }
    if (u.maxMp) {
      const full = u.mp >= u.maxMp;
      ctx.fillStyle = '#0a1828'; ctx.fillRect(bx, by + hh + 1, w, 2);
      ctx.fillStyle = full && (u.castT > 0 ? Math.floor(S.time * 16) % 2 : 1) ? '#ffffff' : C.mp;
      ctx.fillRect(bx, by + hh + 1, Math.ceil(w * clamp(u.mp / u.maxMp, 0, 1)), 2);
    }
  }

  const STATUS_ICON = [
    ['stun', 'st_dizzy'], ['bind', 'st_seal'], ['charm', 'st_heart'], ['curse', 'st_hex'], ['rage', 'st_swords']
  ];

  function drawUnit(u) {
    if (!u.alive && u.deadT > 0.45) return;
    if (u.spawnT < 0) return;
    const scale = u.big ? 3 : 2;
    const frozen = u.freeze > 0;
    let x = u.x, y = u.y;
    const floatY = u.mon && u.mon.float ? Math.sin(S.time * 7.8 + u.bob) * u.mon.float / 2 - u.mon.float : 0;
    if (u.mon) y += floatY + (u.mon.float ? 0 : Math.round(Math.sin(S.time * 5 + u.bob)));
    if (u.kbT > 0) { const k = easeOutCubic(u.kbT / u.kbDur); x += u.kbx * k; y += u.kby * k - u.kbHop * Math.sin(Math.PI * (1 - u.kbT / u.kbDur)); }
    if (u.lungeT > 0 && u.target) {   // melee lunge toward the target (sideways or up / down)
      const k = Math.sin((u.lungeT / 0.16) * Math.PI) * 10, dx = u.target.x - u.x, dy = u.target.y - u.y, d = Math.hypot(dx, dy) || 1;
      x += d > 4 ? dx / d * k : u.face * k; y += d > 4 ? dy / d * k * 0.8 : 0;
    }
    if (u.moveT < 1) y -= Math.sin(u.moveT * Math.PI) * 6;
    if (u.stun > 0 && !frozen) x += Math.sin(S.time * 50) * 1.2;
    if (u.bind > 0 && Math.floor(S.time * 10) % 2 === 0) x += 1;
    let sx = 1, sy = 1;
    if (u.sqT > 0 && u.sqDur > 0) { const k = u.sqT / u.sqDur; sx = lerp(1, u.sqx, k); sy = lerp(1, u.sqy, k); }
    if (u.mon && u.mon.squish) sy *= 0.95 + 0.05 * Math.sin(S.time * 10 + u.bob);
    let a = 1;
    if (!u.alive) { a = [1, 0.66, 0.33, 0][Math.min(3, Math.floor(u.deadT / 0.11))]; y += Math.min(6, u.deadT * 16); if (u.mon) sy *= Math.max(0, 1 - u.deadT / 0.3); }
    if (u.spawnT >= 0 && u.spawnT < 0.12) { const k = u.spawnT / 0.12; sy *= k; a *= k; }
    // the winning side hops on the result screen
    if (S.scene === 'result' && S.result && u.alive && u.team === (S.result.win ? 'P' : 'E')) y -= Math.abs(Math.sin(S.time * 7 + u.bob)) * 7;

    // boss aura: a pulsing blood-red pool with rising wisps
    if (u.boss && !u.mini && u.alive) {
      const pa = 0.22 + 0.14 * Math.sin(S.time * 4 + u.bob), rw = (u.big ? 34 : 25) + 2 * Math.sin(S.time * 4);
      ctx.fillStyle = 'rgba(190,16,40,' + pa.toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, rw, rw * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      if (Math.random() < 0.12 && S.particles.length < 260) S.particles.push({ x: u.x + rand(-rw, rw) * 0.8, y: u.y, vx: rand(-6, 6), vy: rand(-40, -20), life: 0.7, max: 0.7, color: Math.random() < 0.5 ? '#a01830' : '#ff5060', size: 2, g: 0 });
    }

    // shadow + team ring
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, u.big ? 24 : 15, u.big ? 5 : 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = effTeam(u) === 'P' ? C.hover : u.boss ? C.gold : C.sel; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, u.big ? 26 : 17, u.big ? 6 : 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    if (u.castT > 0) {   // telegraph ring
      const k = 1 - u.castT / J.castTime;
      ctx.strokeStyle = u.def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(u.x, u.y, 6 + 16 * k, (6 + 16 * k) * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    }

    const name = unitFrame(u), flip = unitFlip(u);
    spr(name, x, y, scale, { flip, a, sx, sy });
    if (u.tier && u.alive) spr(name, x, y, scale, { flip, sx, sy, tint: TIER_TINT[u.tier], a: 0.3 });   // grade colour
    // tint overlays (flash / curse / charm)
    if (u.alive) {
      if (u.flashT > 0) spr(name, x, y, scale, { flip, sx, sy, tint: 'w', a: u.flashT < 0.017 ? 0.5 : 1 });
      else if (u.redT > 0) spr(name, x, y, scale, { flip, sx, sy, tint: 'r', a: 0.45 });
      else if (u.charm > 0) spr(name, x, y, scale, { flip, sx, sy, tint: 'p', a: 0.25 + 0.15 * Math.sin(S.time * Math.PI * 8) });
      else if (u.curse > 0) spr(name, x, y, scale, { flip, sx, sy, tint: 'v', a: 0.22 });
      else if (u.rage > 0) spr(name, x, y, scale, { flip, sx, sy, tint: 'r', a: 0.18 });
      else if (u.enraged) spr(name, x, y, scale, { flip, sx, sy, tint: 'r', a: 0.2 + 0.12 * Math.sin(S.time * 12) });
      if (u.frozen > 0) {   // ice: 50% ice-coloured overlay + a translucent block
        spr(name, x, y, scale, { flip, sx, sy, tint: 'i', a: 0.5 });
        const f = FR[name], bw = f ? f[2] * scale + 6 : 40, bh = fh(name, scale) + 4;
        const bx = Math.round(u.x - bw / 2), by = Math.round(u.y - bh + 2);
        ctx.fillStyle = 'rgba(190,240,255,0.2)'; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(225,250,255,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(bx + 3, by + 3, 2, Math.min(14, bh - 6)); ctx.fillRect(bx + 3, by + 3, Math.min(10, bw - 6), 2);
      }
    } else if (u.deadT < 0.05) spr(name, x, y, scale, { flip, tint: 'w' });
    if (!u.alive) return;

    if (u.shield > 0) {   // talisman cards orbit while shielded
      for (let i = 0; i < 3; i++) {
        const ang = S.time * 3 + i * 2.09;
        const ox = Math.cos(ang) * 18, oy = Math.sin(ang) * 6;
        ctx.fillStyle = '#000'; ctx.fillRect(Math.round(u.x + ox - 3), Math.round(u.y - 30 + oy - 4), 6, 8);
        ctx.fillStyle = '#f0c050'; ctx.fillRect(Math.round(u.x + ox - 2), Math.round(u.y - 30 + oy - 3), 4, 6);
        ctx.fillStyle = '#c02020'; ctx.fillRect(Math.round(u.x + ox - 1), Math.round(u.y - 30 + oy - 2), 2, 4);
      }
    }
    const top = u.y - fh(name, scale) - 6;
    const barW = u.boss ? 48 : 40;
    drawBars(u, u.x, top, barW);
    if (u.boss) crown(u.x, top - 8, u.mini);
    if (u.tier) for (let i = 0; i < u.tier; i++) { ctx.fillStyle = '#000'; ctx.fillRect(u.x - barW / 2 - 6, top + i * 4 - 1, 5, 5); ctx.fillStyle = TIER_COLOR[u.tier]; ctx.fillRect(u.x - barW / 2 - 5, top + i * 4, 3, 3); }
    if (u.star > 1) {
      for (let i = 0; i < u.star; i++) spr('ic_star', u.x - (u.star - 1) * 5 + i * 10, u.y + 9, 1, { sx: 0.5, sy: 0.5 });
    }
    // status icons above the bar
    let ix = u.x - barW / 2 + 6;
    for (const [key, icon] of STATUS_ICON) {
      const v = u[key];
      if (v > 0 && (v > 1 || Math.floor(S.time * 6) % 2 === 0)) { spr(icon, ix, top - 8, 1); ix += 12; }
    }
    if (u.dots.length) { spr('st_fire', ix, top - 8, 1); ix += 12; }
    if (u.shield > 0) { spr('st_orb', ix, top - 8, 1); ix += 12; }
    if (u.frozen > 0) { const qx = Math.round(ix - 4), qy = Math.round(top - 12); ctx.fillStyle = '#000'; ctx.fillRect(qx, qy, 9, 9); ctx.fillStyle = '#bff2ff'; ctx.fillRect(qx + 1, qy + 1, 7, 7); ctx.fillStyle = '#ffffff'; ctx.fillRect(qx + 2, qy + 2, 2, 2); ix += 12; }
    if (u.weak > 0) { const qx = Math.round(ix - 4), qy = Math.round(top - 12); ctx.fillStyle = '#000'; ctx.fillRect(qx, qy, 9, 9); ctx.fillStyle = '#ff5060'; ctx.fillRect(qx + 3, qy + 1, 3, 4); ctx.fillRect(qx + 1, qy + 4, 7, 2); ctx.fillRect(qx + 3, qy + 6, 3, 2); ix += 12; }
    if (u.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const ang = S.time * 6 + i * 2.1;
        spr('fx_stun0', Math.round(u.x + Math.cos(ang) * 14), Math.round(top - 2 + Math.sin(ang) * 3), 1, { sx: 0.5, sy: 0.5 });
      }
    }
    if (S.sel && S.sel.kind === 'unit' && S.sel.u === u) brackets(u.x, u.y - 30, 26, 36, effTeam(u) === 'P' ? C.hover : C.sel);
  }

  // pixel crown over bosses (silver for mini-bosses)
  function crown(x, y, mini) {
    x = Math.round(x - 5); y = Math.round(y);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 12, 8);
    ctx.fillStyle = mini ? '#c8d0dc' : C.gold;
    ctx.fillRect(x, y + 3, 10, 3); ctx.fillRect(x, y, 2, 3); ctx.fillRect(x + 4, y, 2, 3); ctx.fillRect(x + 8, y, 2, 3);
    ctx.fillStyle = '#e0484f'; ctx.fillRect(x + 4, y + 4, 2, 1);
  }

  function brackets(cx, cy, hw, hh, color) {
    const b = Math.floor(S.time * 2) % 2 ? 2 : 0;
    ctx.fillStyle = color;
    const x0 = Math.round(cx - hw - b), x1 = Math.round(cx + hw + b), y0 = Math.round(cy - hh - b), y1 = Math.round(cy + hh + b);
    [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.fillRect(dx > 0 ? x : x - 7, dy > 0 ? y : y - 1, 8, 2);
      ctx.fillRect(dx > 0 ? x : x - 1, dy > 0 ? y : y - 7, 2, 8);
    });
  }

  function drawPrepUnits() {
    const bossLv = isBossLevel(S.level);
    S.wave.forEach(e => {
      const p = cellCenter(e.r, e.c);
      const s = e.big ? 3 : 2;
      const name = 'en_' + e.skin;
      const mon = MONSTERS[e.skin];
      const flip = mon.face === 1;
      const fy = p.y + (mon.float ? Math.sin(S.time * 7.8 + e.c) * mon.float / 2 - mon.float : Math.sin(S.time * 3 + e.c));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, e.boss ? 24 : 15, e.boss ? 5 : 3.5, 0, 0, Math.PI * 2); ctx.fill();
      if (e.boss && bossLv) spr(name, p.x + 1, fy, s, { flip, tint: 'r', a: 0.4 + 0.4 * Math.abs(Math.sin(S.time * Math.PI * 1.5)) });
      spr(name, p.x, fy, s, { flip, a: e.boss ? 1 : 0.6 });
      if (e.tier) spr(name, p.x, fy, s, { flip, tint: TIER_TINT[e.tier], a: 0.3 });
      if (e.boss) crown(p.x, fy - fh(name, s) - 6, e.mini);
      if (e.eskill) { const k = ESK[e.eskill]; ctx.fillStyle = '#000'; ctx.fillRect(p.x + 9, p.y - 13, 8, 8); ctx.fillStyle = k.color; ctx.fillRect(p.x + 10, p.y - 12, 6, 6); }
      if (S.sel && S.sel.kind === 'wave' && S.sel.e === e) brackets(p.x, p.y - 28, 22, 34, C.sel);
    });
    S.roster.forEach(u => {
      if (u.loc !== 'board' || (S.drag && S.drag.active && S.drag.u === u)) return;
      const p = cellCenter(u.r, u.c);
      const d = GMAP[u.id];
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 15, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.hover; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 17, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      const k = u.pop > 0 ? u.pop / 0.25 : 0;
      const frame = d.id + (Math.floor((S.time + u.uid * 0.37) / 0.36) % 2 ? '_idle1' : '_idle0');
      spr(frame, p.x, p.y, 2, { sx: 1 + 0.25 * k, sy: 1 - 0.2 * k });
      if (u.deaths) { spr(frame, p.x, p.y, 2, { tint: 'k', a: 0.3 }); skull(p.x + 12, p.y - 58); }
      if (u.star > 1) for (let i = 0; i < u.star; i++) spr('ic_star', p.x - (u.star - 1) * 5 + i * 10, p.y + 9, 1, { sx: 0.5, sy: 0.5 });
      if (S.sel && S.sel.u === u) {
        const q = cellRect(u.r, u.c);
        ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
        ctx.strokeRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
      }
    });
  }

  function drawConsoleBase() {
    ctx.fillStyle = C.panel; ctx.fillRect(0, CONSOLE_Y, W, H - CONSOLE_Y);
    ctx.fillStyle = C.line; ctx.fillRect(0, CONSOLE_Y, W, 2);
  }

  function drawBench() {
    const nb = S.roster.filter(u => u.loc === 'bench').length;
    if (PORTRAIT) {
      text('대기석 ' + nb + '/' + BENCH_N, BENCH_X, CONSOLE_Y + 4, C.hover, 1);
      if (S.scene === 'prep') text('상점 칸에 끌어다 놓으면 판매', W - 10, CONSOLE_Y + 4, C.dim, 1, 'right');
    } else {
      text('대기석', 6, BENCH_Y + 12, C.hover, 1);
      text(nb + '/' + BENCH_N, 6, BENCH_Y + 26, C.dim, 1);
    }
    for (let i = 0; i < BENCH_N; i++) {
      const x = BENCH_X + i * SLOT_GAP, y = BENCH_Y;
      const hot = S.drag && S.drag.active && slotAt(S.drag) === i;
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, SLOT_W, SLOT_H);
      ctx.fillStyle = hot ? '#173a52' : C.cell; ctx.fillRect(x + 1, y + 1, SLOT_W - 2, SLOT_H - 2);
      ctx.strokeStyle = hot ? '#48c0e8' : C.grid; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, SLOT_W - 3, SLOT_H - 3);
      const u = rosterAtSlot(i);
      if (u && !(S.drag && S.drag.active && S.drag.u === u)) {
        const k = u.pop > 0 ? u.pop / 0.25 : 0;
        const fr = u.id + (Math.floor((S.time + u.uid * 0.37) / 0.5) % 2 ? '_idle1' : '_idle0');
        spr(fr, x + SLOT_W / 2, y + SLOT_H - 4, 1, { sx: 1 + 0.25 * k, sy: 1 - 0.2 * k });
        if (u.deaths) spr(fr, x + SLOT_W / 2, y + SLOT_H - 4, 1, { tint: 'k', a: 0.3 });
        if (u.star > 1) for (let s = 0; s < u.star; s++) spr('ic_star', x + 6 + s * 7, y + 7, 1, { sx: 0.5, sy: 0.5 });
        if (u.deaths) skull(x + SLOT_W - 10, y + 3);
        if (S.sel && S.sel.u === u) { ctx.strokeStyle = C.sel; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, SLOT_W - 4, SLOT_H - 4); }
      }
    }
  }

  // 7x7 pixel skull: "already fell once - one more and it is gone for good"
  function skull(x, y, a) {
    if (a != null) ctx.globalAlpha = a;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 9, 9);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(x + 1, y, 5, 1); ctx.fillRect(x, y + 1, 7, 3); ctx.fillRect(x + 1, y + 4, 5, 1); ctx.fillRect(x + 2, y + 5, 3, 2);
    ctx.fillStyle = '#d02020'; ctx.fillRect(x + 1, y + 2, 2, 1); ctx.fillRect(x + 4, y + 2, 2, 1);
    ctx.globalAlpha = 1;
  }

  function drawShop() {
    const slide = S.shopSlide != null && S.shopSlide < 0.18 ? (1 - easeOutCubic(S.shopSlide / 0.18)) * (H - SHOP_Y) : 0;
    ctx.save();
    ctx.translate(0, Math.round(slide));
    const dragging = S.drag && S.drag.active;
    for (let i = 0; i < SHOP_N; i++) {
      const x = SHOP_X + i * CARD_GAP, y = SHOP_Y;
      const id = S.shop[i];
      if (!id) {
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, CARD_W, CARD_H);
        ctx.fillStyle = '#08121a'; ctx.fillRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2);
        text('구매 완료', x + CARD_W / 2, y + CARD_H / 2 - 3, '#2a3a4c', 1, 'center');
        continue;
      }
      const d = GMAP[id];
      const afford = S.gold >= d.cost;
      const merge = countCopies(id, 1) >= 2;
      const hot = inRect(S.mouse, { x, y, w: CARD_W, h: CARD_H });
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, CARD_W, CARD_H);
      ctx.fillStyle = hot && afford ? '#12283a' : C.cell; ctx.fillRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2);
      ctx.strokeStyle = merge && Math.floor(S.time * 4) % 2 === 0 ? C.gold : C.grid; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, CARD_W - 3, CARD_H - 3);
      ctx.fillStyle = COST_COLOR[d.cost]; ctx.fillRect(x + 2, y + 2, CARD_W - 4, 3);
      spr(id + (hot ? '_idle1' : '_idle0'), x + CARD_W / 2, y + 60, 2, { a: afford ? 1 : 0.35 });
      text(fitText(d.name, CARD_W - 6, 1), x + CARD_W / 2, y + 62, '#fff', 1, 'center');
      text((d.origin === 'W' ? '서양' : '동양') + ' · ' + (d.range > 1 ? '원거리' : '근접'), x + CARD_W / 2, y + 73, d.origin === 'W' ? C.west : C.east, 1, 'center');
      costLabel(d.cost, afford)(x + CARD_W / 2, y + 82);
      if (merge) spr('ic_star', x + CARD_W - 12, y + 16, 1, { sx: 0.75, sy: 0.75 });
    }
    if (dragging) {
      const z = SELL_ZONE, hot = inShopZone(S.drag);
      ctx.fillStyle = hot ? 'rgba(200,30,30,0.75)' : 'rgba(160,20,20,0.6)';
      ctx.fillRect(z.x, SHOP_Y - 4, z.w, CARD_H + 8);
      text('여기에 놓으면 판매 +' + sellValue(S.drag.u) + '골드', z.x + z.w / 2, SHOP_Y + CARD_H / 2 - 7, '#fff', 2, 'center');
    }
    button(BTN_REROLL, '새로고침', '#2a5a8a', S.gold >= REROLL_COST, 1, costLabel(REROLL_COST, S.gold >= REROLL_COST));
    button(BTN_ALTAR, '제단', '#5a2a8a', S.gold >= altarCost(), 1, costLabel(altarCost(), S.gold >= altarCost()));
    button(BTN_FIGHT, '전투 시작!', '#b82a30', boardCount() > 0, 3);
    ctx.restore();
  }

  function drawBattlePanel() {
    panel(BOX_LOG.x, BOX_LOG.y, BOX_LOG.w, BOX_LOG.h);
    text('전투 기록', BOX_LOG.x + 8, BOX_LOG.y + 6, C.hover, 1);
    S.log.slice(-4).forEach((l, i) => text(fitText(l.str, BOX_LOG.w - 16, 1), BOX_LOG.x + 8, BOX_LOG.y + 19 + i * 13, l.color, 1));
    const sum = team => S.units.filter(u => u.team === team && u.alive).reduce((a, u) => a + u.hp, 0);
    const max = team => S.units.filter(u => u.team === team).reduce((a, u) => a + u.maxHp, 0) || 1;
    const bw = BOX_LOG.w - 58;
    const bar = (label, y, k, col) => {
      text(label, BOX_LOG.x + 8, y, C.text, 1);
      ctx.fillStyle = '#000'; ctx.fillRect(BOX_LOG.x + 44, y, bw, 8);
      ctx.fillStyle = col; ctx.fillRect(BOX_LOG.x + 45, y + 1, Math.ceil((bw - 2) * clamp(k, 0, 1)), 6);
    };
    bar('아군', BOX_LOG.y + 76, sum('P') / max('P'), C.hover);
    bar('적군', BOX_LOG.y + 89, sum('E') / max('E'), C.hpFoe);
    button(BTN_SPEED, '속도 x' + S.speed, '#2a5a8a', S.scene === 'battle');
    panel(BOX_TIMER.x, BOX_TIMER.y, BOX_TIMER.w, BOX_TIMER.h);
    const left = Math.max(0, Math.ceil(BATTLE_LIMIT - S.battleT));
    text('남은 시간', BOX_TIMER.x + Math.round(BOX_TIMER.w * 0.25), BOX_TIMER.y + BOX_TIMER.h / 2 - 4, C.dim, 1, 'center');
    text(String(left), BOX_TIMER.x + Math.round(BOX_TIMER.w * 0.65), BOX_TIMER.y + BOX_TIMER.h / 2 - 14, left <= 10 ? C.sel : '#fff', 4, 'center');
  }

  // compact synergy strip over the sky (the board uses the full width)
  function drawSynergy() {
    const list = S.scene === 'prep' ? S.roster.filter(u => u.loc === 'board') : S.units.filter(u => u.team === 'P');
    const s = synergy(list);
    ctx.fillStyle = 'rgba(6,17,25,0.72)'; ctx.fillRect(SYN.x, SYN.y, SYN.w, SYN.h);
    ctx.fillStyle = C.line; ctx.fillRect(SYN.x, SYN.y, SYN.w, 1); ctx.fillRect(SYN.x, SYN.y + SYN.h - 1, SYN.w, 1);
    const x = SYN.x + 5;
    text('서양 ' + s.w + '/4', x, SYN.y + 4, C.west, 1);
    text(s.w >= 4 ? '체력+35%' : s.w >= 2 ? '체력+15%' : '2명: 체력↑', x + 50, SYN.y + 4, s.w >= 2 ? '#fff' : C.dim, 1);
    text('동양 ' + s.e + '/4', x, SYN.y + 17, C.east, 1);
    text(s.e >= 4 ? '공격+35%' : s.e >= 2 ? '공격+15%' : '2명: 공격↑', x + 50, SYN.y + 17, s.e >= 2 ? '#fff' : C.dim, 1);
    const pm = powerMul(), m = levelMultipliers(S.level);
    const mf = v => (v < 100 ? v.toFixed(2) : fmt(v));
    text('제단 x' + (pm < 100 ? pm.toFixed(2) : fmt(pm)) + ' · 적 x' + mf(m.hp), x, SYN.y + 30, '#b8a0ff', 1);
  }

  function drawInfo() {
    panel(INFO.x, INFO.y, INFO.w, INFO.h);
    let def = null, star = 1, live = null, hp = 0, atk = 0, roster = null, enemy = false, skin = null, boss = false;
    const sel = S.drag && S.drag.active ? { kind: 'roster', u: S.drag.u } : S.sel;
    if (sel && sel.kind === 'roster' && S.roster.indexOf(sel.u) >= 0) {
      roster = sel.u; def = GMAP[roster.id]; star = roster.star;
      const st = playerStats(roster.id, star, synergy(S.roster.filter(u => u.loc === 'board')));
      hp = st.hp; atk = st.atk;
    } else if (sel && sel.kind === 'unit' && sel.u.alive) {
      live = sel.u; def = live.def; star = live.star; hp = live.maxHp; atk = live.atk; enemy = live.team === 'E'; skin = live.skin; boss = live.boss;
    } else if (sel && sel.kind === 'wave') {
      def = sel.e.def; enemy = true; skin = sel.e.skin; boss = sel.e.boss;
      const st = enemyStats(def, S.level, sel.e.guard ? 'guard' : boss, sel.e.tier, sel.e.mini); hp = st.hp; atk = st.atk;
    } else if (S.hover != null && S.shop[S.hover]) {
      def = GMAP[S.shop[S.hover]];
      const st = playerStats(def.id, 1, { hp: 1, atk: 1 }); hp = st.hp; atk = st.atk;
    }
    const x = INFO.x + 6, maxW = INFO.w - 11;
    // portrait has a wider panel: bigger type (scale 2) for phones
    const ts = PORTRAIT ? 2 : 1, lh = PORTRAIT ? 16 : 12, ld = PORTRAIT ? 15 : 11;
    const wr = s => wrap(s, Math.floor(maxW / (6 * ts)), ts);
    let y = INFO.y + 8;
    if (!def && S.scene !== 'prep') {
      // battle: the enemy skills in play, with their levels (portrait also explains them)
      const seen = new Map();
      for (const u of S.units) if (u.team === 'E' && u.alive && u.eskill) seen.set(u.eskill, Math.max(seen.get(u.eskill) || 0, u.slv || 1));
      const bottom = INFO.y + INFO.h - 4, put = (l, c, s, h) => { if (y + h <= bottom) text(l, x, y, c, s); y += h; };
      put(seen.size ? '적 위험 기술' : '정보', seen.size ? '#ff8080' : C.gold, ts, lh + 3);
      seen.forEach((lv, k) => {
        wr(ESK[k].name + ' Lv.' + lv).forEach(l => put(l, ESK[k].color, ts, lh));
        if (PORTRAIT) { wrap(eskDesc(k, lv), Math.floor(maxW / 6), 1).forEach(l => put(l, C.text, 1, 12)); y += 6; }
      });
      if (seen.size) y += 4;
      wr('유닛을 누르면 정보가 보여요').forEach(l => put(l, C.dim, ts, lh));
      return;
    }
    if (!def) {
      // how to play, in three short steps
      text('도움말', x, y, C.gold, ts); y += lh + 3;
      // the wave's most dangerous enemy skill replaces the last tip, with its counterplay
      const has = k => S.wave.some(e => e.eskill === k);
      const danger = has('meteor') ? ['주의! 지옥불', '흩어서 배치하세요'] : has('poison') ? ['주의! 독안개', '뭉치면 함께 중독'] : has('frost') ? ['주의! 빙결', '붙어 있으면 함께 얼어요'] : has('roar') ? ['주의! 공포의 포효', '보스 근처는 기절'] : null;
      const lv = S.wave.length ? Math.max(...S.wave.map(e => eskLevel(S.level, e.boss && !e.mini, e.tier))) : 1;
      [['① 카드로 유령 구매', '#fff'], [PORTRAIT ? '② 아래쪽 칸에 배치' : '② 왼쪽 칸에 배치', '#fff'], ['③ 전투 시작!', '#fff'], ['', 0],
        ['이기면 레벨업!', C.gold], ['같은 유령 3마리', C.hover], ['= ★ 강화', C.hover], ['', 0],
        danger ? [danger[0], '#ff8a50'] : ['언제 꺼도 저장돼요', C.dim], danger ? [danger[1], '#fff'] : ['', 0],
        PORTRAIT ? ['적 기술 Lv.' + lv, '#ff8080'] : ['', 0]].forEach(([l, c]) => {
        if (l) wr(l).forEach(w => { if (y + 7 * ts + 2 <= INFO.y + INFO.h - 3) text(w, x, y, c, ts); y += lh; }); else y += PORTRAIT ? 6 : 3;
      });
      return;
    }
    const tier = sel && sel.kind === 'wave' ? sel.e.tier : live ? live.tier : 0;
    const esk = sel && sel.kind === 'wave' ? sel.e.eskill : live ? live.eskill : null;
    if (enemy) {
      text(fitText(boss ? zoneOf(S.level).skins.bossName : MONSTERS[skin].name, maxW, ts), x, y, '#ff8080', ts); y += lh;
      text(fitText((boss ? '보스 · ' : '') + '등급 ' + TIER_NAME[tier || 0], maxW, ts), x, y, TIER_COLOR[tier || 0], ts); y += lh + 1;
    } else {
      text(fitText(def.name, maxW, ts), x, y, '#fff', ts); y += lh;
      text(star > 1 ? '★'.repeat(star) : def.origin === 'W' ? '서양' : '동양', x, y, star > 1 ? C.gold : def.origin === 'W' ? C.west : C.east, ts); y += lh + 1;
    }
    const ic = PORTRAIT ? 1 : 0.5;
    spr('ic_heart', x + (PORTRAIT ? 8 : 4), y + (PORTRAIT ? 6 : 3), 1, { sx: ic, sy: ic });
    text((live ? fmt(live.hp) + '/' : '') + fmt(hp), x + (PORTRAIT ? 20 : 11), y, '#70ff70', ts); y += ld;
    spr('ic_sword', x + (PORTRAIT ? 8 : 4), y + (PORTRAIT ? 6 : 3), 1, { sx: ic, sy: ic });
    text(fmt(atk), x + (PORTRAIT ? 20 : 11), y, '#ff9a60', ts); y += lh;
    text('사거리 ' + def.range + (def.range > 1 ? ' 원거리' : ' 근접'), x, y, def.range > 1 ? '#7fd0ff' : '#ffb070', ts); y += lh;
    text('MP ' + (live ? Math.floor(live.mp) + '/' : '') + def.mp, x, y, C.mp, ts); y += lh + 1;
    const wounded = roster ? roster.deaths : live && live.team === 'P' ? live.wounded : 0;
    if (wounded) { wr('해골 표시! 또 쓰러지면 영구 소멸').forEach(l => { text(l, x, y, '#ff7070', ts); y += ld; }); y += 2; }
    // enemy skills have a level (it rises every 5 levels; bosses and legends +1)
    const elv = enemy ? (sel.kind === 'wave' ? eskLevel(S.level, boss && !sel.e.mini, tier) : live.slv || 1) : 0;
    wr((esk ? ESK[esk].name : def.skill) + (elv ? ' Lv.' + elv : '')).forEach(l => { text(l, x, y, esk ? ESK[esk].color : def.color, ts); y += lh; });
    y += 1;
    const quote = enemy && sel.kind === 'wave' && sel.quote ? sel.quote : null;
    const bottom = roster && S.scene === 'prep' ? BTN_SELL.y : INFO.y + INFO.h - 4;
    const descLines = wr(esk ? eskDesc(esk, elv) : def.desc);
    const qLines = quote ? wr('“' + quote + '”') : [];
    descLines.slice(0, Math.max(0, Math.floor((bottom - y) / ld))).forEach(l => { text(l, x, y, C.text, ts); y += ld; });
    if (qLines.length && Math.floor((bottom - y - 4) / ld) >= qLines.length) { y += 4; qLines.forEach(l => { text(l, x, y, '#ffd0a0', ts); y += ld; }); }
    if (roster && S.scene === 'prep') button(BTN_SELL, '판매 ' + sellValue(roster) + 'G', '#8a2a30', true, PORTRAIT ? 2 : 1);
  }

  function drawFxLayer(behind) {
    for (const f of S.fx) {
      if (!!f.behind !== behind) continue;
      const k = clamp(f.t / f.dur, 0, 1);
      switch (f.type) {
        case 'sprite': {
          let s = f.s, sx = 1, sy = 1;
          if (f.grow) { const g = f.t < 0.04 ? lerp(0.6, 1.1, f.t / 0.04) : f.t < 0.08 ? lerp(1.1, 1, (f.t - 0.04) / 0.04) : 1; sx = sy = g; }
          const a = k < 0.6 ? 1 : k < 0.75 ? 0.66 : k < 0.9 ? 0.33 : 0.15;
          spr(f.name, f.x, f.y - f.rise * k, s, { flip: f.flip, a, sx, sy });
          break;
        }
        case 'after':
          if (f.u.alive) spr(f.name, f.x, f.y, f.u.boss ? 3 : 2, { flip: f.flip, tint: 'r', a: 0.4 * (1 - k) });
          break;
        case 'beam': {
          const sy = f.t < 0.05 ? f.t / 0.05 : 1;
          const sx = f.t < 0.15 ? 1 : Math.max(0, 1 - (f.t - 0.15) / 0.15);
          spr('fx_death0', f.x, f.y - 22 * sy, 2, { sx, sy });
          break;
        }
        case 'slam': {
          const s = f.t < 0.05 ? lerp(4, 3, f.t / 0.05) : 3;
          spr(f.name, f.x, f.y, 2, { sy: s / 3, a: 1 - k * k });
          break;
        }
        case 'bolt': {
          ctx.strokeStyle = '#60c0f0'; ctx.lineWidth = 3;
          const seed = Math.floor(f.t / 0.033);
          const rr = mulberry32(seed * 977 + (f.x | 0));
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          const pts = [];
          for (let i = 1; i < 6; i++) pts.push([lerp(f.x, f.x2, i / 6) + (rr() - 0.5) * 16, lerp(f.y, f.y2, i / 6) + (rr() - 0.5) * 16]);
          pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.strokeStyle = '#e0f8ff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          break;
        }
        case 'bandage': {
          const e = Math.min(1, f.t / 0.1);
          const tx = lerp(f.x, f.u.x, e), ty = lerp(f.y, f.u.y - 30, e);
          ctx.strokeStyle = '#e8d8a8'; ctx.lineWidth = 3; ctx.globalAlpha = 1 - k;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.fillStyle = '#e8d8a8';
          for (let i = 0; i < 4; i++) { const by = f.u.y - 52 + ((f.t * 90 + i * 12) % 48); ctx.fillRect(f.u.x - 14, Math.round(by), 28, 3); }
          ctx.globalAlpha = 1;
          break;
        }
        case 'reticle': {
          const s = f.t < 0.12 ? lerp(1.5, 1, f.t / 0.12) : 1;
          brackets(f.u.x, f.u.y - 30, 24 * s, 32 * s, f.color);
          break;
        }
        case 'star':
          spr('ic_star', f.x, f.y, 1, { a: 1 - k, sx: 0.75, sy: 0.75 });
          break;
        case 'frost': {
          ctx.strokeStyle = 'rgba(210,245,255,' + (1 - k).toFixed(3) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, 10 + 70 * k, (10 + 70 * k) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'cloud': {
          const a = 0.32 * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = f.r + dr, c = f.c + dc;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
            const q = cellCenter(r, c), wob = Math.sin(S.time * 3 + r * 2 + c) * 3;
            ctx.fillStyle = 'rgba(110,210,70,' + a.toFixed(3) + ')';
            ctx.beginPath(); ctx.ellipse(q.x + wob, q.y - 18, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'roar': {
          const reach = f.big ? 170 : 120;
          for (let j = 0; j < 2; j++) {
            const kk = clamp(k * 1.3 - j * 0.3, 0, 1);
            if (kk <= 0 || kk >= 1) continue;
            ctx.strokeStyle = 'rgba(255,70,90,' + (1 - kk).toFixed(3) + ')'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, 12 + reach * kk, (12 + reach * kk) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }
        case 'portal': {   // dark swirl on the ground that opens, then closes
          const o = k < 0.3 ? easeOutBack(k / 0.3) : 1 - easeInOutCubic((k - 0.3) / 0.7);
          const rx = (f.big ? 30 : 20) * Math.max(0, o), ry = rx * 0.32;
          if (rx < 1) break;
          ctx.fillStyle = 'rgba(20,6,34,0.85)';
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 1, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(176,96,255,0.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 1, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#d8a8ff';
          for (let i = 0; i < 4; i++) {   // sparks circling the rim
            const a = S.time * 7 + i * Math.PI / 2;
            ctx.fillRect(Math.round(f.x + Math.cos(a) * rx), Math.round(f.y + 1 + Math.sin(a) * ry), 2, 2);
          }
          break;
        }
        case 'shock': {    // ground shockwave ring
          const rr = 8 + 70 * easeOutCubic(k);
          ctx.strokeStyle = 'rgba(' + f.color + ',' + (1 - k).toFixed(3) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'scorch': {   // burnt ground left by a meteor, embers fading out
          const a = k < 0.7 ? 0.5 : 0.5 * (1 - (k - 0.7) / 0.3), rr = mulberry32(f.seed);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = f.r + dr, c = f.c + dc;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
            const q = cellCenter(r, c), main = !dr && !dc;
            const ox = (rr() - 0.5) * 8, ex = (rr() - 0.5) * 24, ey = (rr() - 0.5) * 4;   // fixed per scorch
            ctx.fillStyle = 'rgba(20,8,4,' + (a * (main ? 1 : 0.6)).toFixed(3) + ')';
            ctx.beginPath(); ctx.ellipse(q.x + ox, q.y - 2, main ? 22 : 15, main ? 7 : 5, 0, 0, Math.PI * 2); ctx.fill();
            if (Math.sin(S.time * 9 + r * 3 + c * 5) > 0.3 && k < 0.8) { ctx.fillStyle = '#ff8a30'; ctx.fillRect(Math.round(q.x + ex), Math.round(q.y - 3 + ey), 2, 2); }
          }
          break;
        }
        case 'soul': {   // permanently lost: the ghost floats away
          spr(f.name, f.x, f.y - 50 * k, 2, { tint: 'w', a: 0.75 * (1 - k) });
          break;
        }
        case 'tomb':
          spr('pr_tomb', f.x, f.y, 1, { a: Math.min(1, f.t / 0.3) });
          break;
      }
    }
  }

  function drawParticles() {
    for (const p of S.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of S.projectiles) {
      const flip = p.pierce ? p.vx < 0 : p.face < 0;
      if (p.pierce) spr(p.frame, p.x, p.y, 3, { flip });
      else if (p.heart) spr(p.frame, p.x, p.y, 2);
      else spr(p.frame, p.x, p.y, p.crescent ? 3 : 2, { flip });
    }
  }

  function drawFloats() {
    for (const f of S.floats) {
      if (f.t < 0) continue;
      const left = f.dur - f.t;
      ctx.globalAlpha = left > 0.15 ? 1 : left > 0.1 ? 0.66 : left > 0.05 ? 0.33 : 0.15;
      const pop = f.pop && f.t < f.pop ? 1 + (f.t < f.pop ? (1 - f.t / f.pop) : 0) * (f.scale >= 2 ? 0.5 : 1) : 1;
      let x = f.x;
      if (f.crit && f.t < 0.067) x += Math.random() < 0.5 ? -1 : 1;
      textStyled(f.str, x, f.y, f.st, f.scale, 'center', pop);
      if (f.crit) textStyled('치명타!', x, f.y - 24, NUM.banner, 1, 'center');
    }
    ctx.globalAlpha = 1;
  }

  // telegraphed meteor: pulsing red 3x3 on the ground until it lands
  function drawMeteorMarks() {
    if (!S.meteors || !S.meteors.length) return;
    for (const m of S.meteors) {
      const pulse = 0.25 + 0.2 * Math.abs(Math.sin(S.time * 14));
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = m.r + dr, c = m.c + dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        const q = cellRect(r, c);
        ctx.fillStyle = 'rgba(255,60,30,' + pulse.toFixed(3) + ')';
        ctx.fillRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      }
      const p = cellCenter(m.r, m.c), k = clamp(m.t / m.delay, 0, 1);
      ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 26, 70 * (1 - k) + 8, (70 * (1 - k) + 8) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      // the fireball itself drops in for the last 0.4 s
      const f = (m.t - (m.delay - 0.4)) / 0.4;
      if (f > 0 && f < 1) {
        const e = f * f, bx = p.x + (1 - e) * 70, by = p.y - 24 - (1 - e) * 260;
        for (let i = 1; i <= 5; i++) {   // flame trail
          ctx.fillStyle = i % 2 ? 'rgba(255,140,40,' + (0.5 - i * 0.08).toFixed(2) + ')' : 'rgba(255,220,90,' + (0.45 - i * 0.07).toFixed(2) + ')';
          const s = 12 - i * 1.5;
          ctx.fillRect(Math.round(bx + i * 7 - s / 2), Math.round(by - i * 24 - s / 2), Math.round(s), Math.round(s));
        }
        ctx.fillStyle = '#ff6a20'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.arc(bx - 2, by + 2, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBubbles() {
    if (!S.bubbles.length) return;
    const placed = [];
    for (const b of S.bubbles) {
      if (b.t < 0) continue;
      const u = b.u;
      const top = u.y - fh(unitFrame(u), u.boss ? 3 : 2) - 18;
      const w = textWidth(b.str, 1) + 12, h = 17;
      const x = clamp(Math.round(u.x - w / 2), 4, W - w - 4);
      let y = Math.max(STAGE_Y + 3, Math.round(top - h));
      for (let k = 0; k < 3; k++) {   // stack above bubbles already placed instead of overlapping
        const hit = placed.find(q => x < q.x + q.w + 2 && x + w + 2 > q.x && y < q.y + q.h + 3 && y + h + 3 > q.y);
        if (!hit) break;
        y = hit.y - h - 4;
      }
      placed.push({ x, y, w, h });
      const a = b.t < 0.08 ? b.t / 0.08 : b.t > b.dur - 0.2 ? (b.dur - b.t) / 0.2 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const p = b.t < 0.1 ? Math.round((1 - b.t / 0.1) * 2) : 0;   // little pop on appear
      const edge = b.kind === 'ally' ? C.hover : b.kind === 'reply' ? '#8792a6' : C.sel;
      const fill = b.kind === 'reply' ? '#dde3ea' : '#f7f4ea';
      ctx.fillStyle = edge;
      ctx.fillRect(x - p, y + 1 - p, w + 2 * p, h - 2 + 2 * p); ctx.fillRect(x + 1 - p, y - p, w - 2 + 2 * p, h + 2 * p);
      ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      const tx = clamp(Math.round(u.x), x + 6, x + w - 7);   // tail toward the speaker
      ctx.fillStyle = edge; ctx.fillRect(tx - 3, y + h - 1, 7, 2); ctx.fillRect(tx - 2, y + h + 1, 5, 2); ctx.fillRect(tx - 1, y + h + 3, 3, 1);
      ctx.fillStyle = fill; ctx.fillRect(tx - 2, y + h - 1, 5, 1); ctx.fillRect(tx - 1, y + h, 3, 1);
      text(b.str, x + w / 2, y + 5, '#1b2030', 1, 'center', false);
    }
    ctx.globalAlpha = 1;
  }

  const cutStyles = {};
  function drawCutIn() {
    const c = S.cutin;
    if (!c) return;
    const t = c.t, d = c.dur;
    const inK = easeOutCubic(clamp(t / 0.14, 0, 1));
    const outK = t > d - 0.16 ? clamp((t - (d - 0.16)) / 0.16, 0, 1) : 0;
    const y0 = PORTRAIT ? (c.ally ? MID_Y + 40 : BOARD_Y + 30) : 46, bh = 60;   // portrait: over the caster's half
    const col = c.ally ? c.def.color : c.color || C.sel;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y); ctx.clip();
    ctx.translate(Math.round((1 - inK) * -W + outK * outK * W), 0);
    ctx.fillStyle = 'rgba(6,12,20,0.9)'; ctx.fillRect(0, y0, W, bh);
    ctx.fillStyle = col; ctx.fillRect(0, y0, W, 2); ctx.fillRect(0, y0 + bh - 2, W, 2);
    const rr = mulberry32(c.seed);   // speed lines
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 16; i++) {
      const ly = y0 + 5 + Math.floor(rr() * (bh - 10)), len = 30 + rr() * 110;
      const lx = ((rr() * (W + 200) - t * 1100) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(Math.round(lx), ly, Math.round(len), 1);
    }
    // the caster, popping out of the band
    const frame = c.boss ? 'en_' + c.u.skin : FR[c.def.id + '_cast'] ? c.def.id + '_cast' : c.def.id + '_idle0';
    spr(frame, 78, y0 + bh - 3, c.boss ? 2 : 3, { flip: c.boss ? (MONSTERS[c.u.skin] && MONSTERS[c.u.skin].face === 1) : false });
    const who = c.boss ? zoneOf(S.level).skins.bossName : c.ally ? c.def.name : unitName(c.u);
    text(who + (c.ally ? '' : ' (적)') + (c.lv ? '  ·  기술 Lv.' + c.lv : ''), 150, y0 + 7, col, 1);
    const st = cutStyles[col] || (cutStyles[col] = { top: '#ffffff', bot: col, out: '#000000', split: 3 });
    textStyled(c.skill + '!', 150, y0 + 30, st, 3, 'left');
    if (c.line) text(fitText('“' + c.line + '”', W - 160, 2), 152, y0 + 43, '#f0f0f0', 2);
    ctx.restore();
  }

  function drawDrag() {
    if (!S.drag || !S.drag.active) return;
    const u = S.drag.u;
    spr(u.id + '_idle0', S.drag.feet.x, S.drag.feet.y, 2, { a: 0.9 });
  }

  function drawMsg() {
    if (S.msgT <= 0 || !S.msg) return;
    ctx.globalAlpha = clamp(S.msgT * 2, 0, 1);
    const msg = fitText(S.msg, W - 40, 2);
    const w = textWidth(msg, 2) + 26, my = PORTRAIT ? BOARD_Y + 8 : 57;
    panel(Math.round(W / 2 - w / 2), my, w, 30);
    text(msg, W / 2, my + 8, '#fff', 2, 'center');
    ctx.globalAlpha = 1;
  }

  // banner band: MISC TEXT sprites drop in with easeOutBack
  function drawBanner() {
    const b = S.banner;
    if (!b) return;
    const e = clamp(b.t / 0.3, 0, 1);
    const band = clamp(b.t / 0.12, 0, 1);
    ctx.fillStyle = 'rgba(6,17,25,0.78)';
    ctx.fillRect(Math.round(W / 2 - W / 2 * band), b.y - 32, Math.round(W * band), 64);
    ctx.fillStyle = C.line;
    ctx.fillRect(Math.round(W / 2 - W / 2 * band), b.y - 32, Math.round(W * band), 2);
    ctx.fillRect(Math.round(W / 2 - W / 2 * band), b.y + 30, Math.round(W * band), 2);
    const out = b.t > b.dur - 0.2 ? (b.t - (b.dur - 0.2)) / 0.2 : 0;
    const scale = lerp(1.5, 1, easeOutBack(e));
    ctx.globalAlpha = 1 - out;
    if (b.name) {
      const s = b.s;
      spr(b.name, W / 2, b.y - 16 * out, s, { sx: scale, sy: scale });
    } else if (b.text) {
      textStyled(b.text, W / 2, b.y - 16 * out, NUM.red, b.s, 'center', scale);
    }
    ctx.globalAlpha = 1;
  }

  function drawCallout() {
    const c = S.callout;
    if (!c || S.cutin) return;
    const e = clamp(c.t / 0.16, 0, 1);
    const y = lerp(40, 64, easeOutCubic(e));
    ctx.globalAlpha = c.t > 0.56 ? clamp(1 - (c.t - 0.56) / 0.12, 0, 1) : 1;
    textStyled(c.text, W / 2, y + STAGE_Y, NUM.banner, 3, 'center');
    ctx.globalAlpha = 1;
  }

  function drawZoneCard() {
    const z = S.zoneCard;
    if (!z) return;
    const a = z.t < 0.2 ? z.t / 0.2 : z.t > z.dur - 0.3 ? (z.dur - z.t) / 0.3 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    const y = MID_Y - 20;
    ctx.fillStyle = 'rgba(6,17,25,0.82)'; ctx.fillRect(0, y, W, 80);
    ctx.fillStyle = C.line; ctx.fillRect(0, y, W, 2); ctx.fillRect(0, y + 78, W, 2);
    text('레벨 ' + pad3(S.level), W / 2, y + 8, C.text, 2, 'center');
    textStyled(zoneName(S.level), W / 2, y + 42, NUM.banner, 3, 'center');
    const lv = eskLevel(S.level, false, 0);
    text('적 기술 Lv.' + lv + (lv > 1 ? ' ↑' : '') + (isBossLevel(S.level) ? '  ·  보스 등장!' : ''), W / 2, y + 62, lv > 1 ? '#ff9090' : C.dim, 1, 'center');
    ctx.globalAlpha = 1;
  }

  function drawBossIntro() {
    if (S.scene !== 'battle' || S.phase !== 'intro' || !S.boss) return;
    const t = S.introT;
    const lb = Math.min(24, (t / 0.2) * 24) * (t > 1.3 ? Math.max(0, 1 - (t - 1.3) / 0.3) : 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, STAGE_Y, W, Math.round(lb));
    ctx.fillRect(0, CONSOLE_Y - Math.round(lb), W, Math.round(lb));
    if (t > 0.4) {
      const k = easeOutCubic(clamp((t - 0.4) / 0.5, 0, 1));
      const x = Math.round(lerp(W, (W - 280) / 2, k)), py = PORTRAIT ? MID_Y - 18 : STAGE_Y + 32;
      panel(x, py, 280, 36);
      ctx.strokeStyle = C.sel; ctx.lineWidth = 2; ctx.strokeRect(x + 1, py + 1, 278, 34);
      text('보스 · ' + zoneOf(S.level).skins.bossName + (S.bosses.length > 1 ? ' ×' + S.bosses.length : '') + ' · 레벨 ' + pad3(S.level), x + 140, py + 6, C.sel, 1, 'center');
      const f = clamp((t - 0.6) / 0.5, 0, 1);
      ctx.fillStyle = '#dcdceb'; ctx.fillRect(x + 10, py + 20, 260, 8);
      ctx.fillStyle = '#000'; ctx.fillRect(x + 11, py + 21, 258, 6);
      ctx.fillStyle = C.hpFoe; ctx.fillRect(x + 11, py + 21, Math.round(258 * f), 6);
    }
  }

  function drawBossBar() {
    if (!S.boss || S.scene !== 'battle' || S.phase !== 'sim') return;
    const list = S.bosses, alive = list.filter(u => u.alive).length;
    const sum = f => list.reduce((acc, u) => acc + Math.max(0, f(u)), 0);
    const max = sum(u => u.maxHp) || 1, B = BOSSBAR, bw = B.w - 22;
    ctx.fillStyle = 'rgba(6,17,25,0.8)'; ctx.fillRect(B.x, B.y, B.w, B.h);
    text(zoneOf(S.level).skins.bossName + (list.length > 1 ? '  남은 보스 ' + alive + '/' + list.length : ''), B.x + B.w / 2, B.y + 2, C.sel, 1, 'center');
    ctx.fillStyle = '#dcdceb'; ctx.fillRect(B.x + 10, B.y + 12, bw + 2, 7);
    ctx.fillStyle = '#000'; ctx.fillRect(B.x + 11, B.y + 13, bw, 5);
    const k = clamp(sum(u => u.hp) / max, 0, 1), kt = clamp(sum(u => u.hpTrail) / max, 0, 1);
    ctx.fillStyle = '#f0c050'; ctx.fillRect(B.x + 11, B.y + 13, Math.round(bw * kt), 5);
    ctx.fillStyle = C.hpFoe; ctx.fillRect(B.x + 11, B.y + 13, Math.round(bw * k), 5);
  }

  function drawFightSlam() {
    if (S.scene !== 'battle' || S.phase !== 'intro') return;
    const t0 = S.introLen - 0.5;
    const t = S.introT - t0;
    if (t < 0) return;
    const s = t < 0.12 ? lerp(2, 1, t / 0.12) : 1;
    ctx.globalAlpha = t > 0.4 ? clamp(1 - (t - 0.4) / 0.1, 0, 1) : 1;
    textStyled('전투 시작!', W / 2, MID_Y - 10, { top: '#fff2a0', bot: C.gold, out: '#c0282e', split: 3 }, 4, 'center', s);
    ctx.globalAlpha = 1;
  }

  function drawCoins() {
    for (const c of S.coins) {
      if (c.t < 0 || c.t > c.dur) continue;
      const k = c.t / c.dur;
      const x = lerp(c.x0, GOLD_POS.x, k), y = lerp(c.y0, GOLD_POS.y, k) - Math.sin(k * Math.PI) * 50;
      spr('ic_coin', x, y, 1);
    }
  }

  function drawResultHint() {
    if (S.scene !== 'result' || !S.result) return;
    const r = S.result;
    const y0 = MID_Y + 33;
    if (S.resultT > 0.5) {
      ctx.fillStyle = 'rgba(6,17,25,0.78)'; ctx.fillRect(0, y0, W, 32);
      const line = r.win ? '+' + r.gold + '골드' + (r.interest ? ' (이자 ' + r.interest + ')' : '') + (r.life ? '  ♥+1' : '') + '  →  다음 레벨 ' + pad3(Math.min(MAX_LEVEL, S.level + 1)) : (S.lives - 1 > 0 ? '목숨 -1 (남은 목숨 ' + (S.lives - 1) + ')  +' + r.gold + '골드 · 같은 레벨 재도전' : '남은 목숨이 없어요…');
      text(fitText(line, W - 12, 1), W / 2, y0 + 5, r.win ? C.gold : '#ff8080', 1, 'center');
    }
    if (S.resultT > 0.5 && (r.lost.length || r.wounded.length)) {
      ctx.fillStyle = 'rgba(30,6,10,0.85)'; ctx.fillRect(0, y0 + 33, W, r.lost.length && r.wounded.length ? 30 : 17);
      let yy = y0 + 36;
      if (r.lost.length) { const s = fitText('영구 소멸: ' + r.lost.join(', '), W - 30, 1); spr('pr_tomb', W / 2 - textWidth(s, 1) / 2 - 10, yy + 11, 1, { sx: 0.5, sy: 0.5 }); text(s, W / 2, yy, '#ff6060', 1, 'center'); yy += 13; }
      if (r.wounded.length) text(fitText('부상(해골 표시): ' + r.wounded.join(', ') + ' · 또 쓰러지면 소멸', W - 12, 1), W / 2, yy, '#ffb070', 1, 'center');
    }
    if (S.resultT > 0.9 && Math.floor(S.time * 2) % 2 === 0) text('화면을 누르면 계속', W / 2, y0 + 19, '#fff', 1, 'center');
  }

  // ---- title -----------------------------------------------------------
  // ghost parade spot for ghost i (landscape: one row of 10; portrait: west row + east row)
  const paradeOff = () => Math.round((H - 760) * 0.35);   // tall phones: centre the parade in the spare space
  const paradeAt = i => (PORTRAIT ? { x: 48 + (i % 5) * 96, y: (i < 5 ? 222 : 338) + paradeOff() } : { x: 40 + i * 62, y: 186 });
  // logo drawn at a non-integer scale (portrait is narrower than the 2x logo)
  function sprK(name, x, y, k) {
    const f = FR[name];
    if (!f || atlasState !== 'ready') return;
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], Math.round(x - f[4] * k), Math.round(y - f[5] * k), Math.round(f[2] * k), Math.round(f[3] * k));
  }

  function drawTitle() {
    // cycle through the zones the player has reached, 8 s each with a 600 ms crossfade
    const nz = Math.max(1, Math.min(ZONES.length, Math.floor((Math.max(1, S.best) - 1) / 5) + 1));
    const slot = Math.floor(S.time / 8);
    const z = ZONES[slot % nz];
    const layer = getZoneLayer(z);
    const pan = Math.round(-34 + 34 * Math.sin((S.time * Math.PI * 2) / 40));
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);
    if (layer) {
      const into = S.time - slot * 8;
      const prevLayer = nz > 1 && into < 0.6 ? getZoneLayer(ZONES[(slot - 1 + nz) % nz]) : null;
      if (prevLayer) { ctx.drawImage(prevLayer, pan, 0); ctx.globalAlpha = into / 0.6; }
      ctx.drawImage(layer, pan, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(6,17,25,0.55)'; ctx.fillRect(0, 0, W, H);
    }
    drawAmbient(z);
    const P = PORTRAIT, gy = P ? TITLE_BTNS.start.y - 24 : 262;   // ground line of the title props
    spr('pr_deadtree', 40, gy, 1);
    if (!S.titleCrow) S.titleCrow = { t: 0, fly: -1, next: rand(8, 14) };
    const crow = S.titleCrow, cy = P ? 132 : 196;
    if (crow.fly < 0) spr('ob_crow', 50, P ? gy - 66 : cy, 1);
    else { const k = crow.fly / 2.2; spr('ob_crow', 50 + k * W, (P ? gy - 66 : cy) - Math.sin(k * Math.PI) * 120 - k * 40, 1, { sy: Math.floor(S.time * 8) % 2 ? 0.7 : 1 }); }
    spr('pr_stonelamp', 96, gy, 1);
    spr('pr_tomb', W - 60, gy, 1);
    spr('ob_cat', W - 84, gy, 1);
    spr('ob_pumpkin', W - 28, gy, 1);
    const glow = 0.15 + 0.1 * Math.sin(S.time * 9);
    ctx.fillStyle = 'rgba(255,150,40,' + glow.toFixed(3) + ')'; ctx.fillRect(W - 34, gy - 16, 14, 12);
    drawLightning(false, true); drawLightning(true, true);

    const bob = Math.round(Math.sin(S.time * Math.PI) * 2);
    if (P) sprK('tx_logo', W / 2, 62 + bob, 1.9); else spr('tx_logo', W / 2, 40 + bob, 2);
    text('유령들의 999일 밤', W / 2, P ? 92 : 70, C.text, P ? 2 : 1, 'center');
    text('최고 기록 레벨 ' + pad3(S.best), W / 2, P ? 112 : 84, C.gold, P ? 2 : 1, 'center');
    // ghost parade
    GHOSTS.forEach((g, i) => {
      const at = paradeAt(i), x = at.x, y = at.y + Math.round(Math.sin(S.time * 4 + i * 0.7) * 3);
      const pop = S.titlePop && S.titlePop.i === i ? clamp(1 - S.titlePop.t / 0.12, 0, 1) : 0;
      spr(g.id + (Math.floor(S.time * 2.5 + i) % 2 ? '_idle1' : '_idle0'), x, y, 2, { sx: 1 + 0.15 * pop, sy: 1 - 0.15 * pop });
      text(g.short, x, at.y + 6, g.origin === 'W' ? C.west : C.east, 1, 'center');
    });
    if (P) { text('서양의 전설', W / 2, 140 + paradeOff(), C.west, 2, 'center'); text('동양의 귀신', W / 2, 256 + paradeOff(), C.east, 2, 'center'); }
    else { text('서양의 전설', 164, 104, C.west, 1, 'center'); text('동양의 귀신', 474, 104, C.east, 1, 'center'); }
    drawFxLayer(false);

    button(TITLE_BTNS.start, '새 게임', '#b82a30', true);
    const sv = S.hasSave ? savedRun() : null;
    button(TITLE_BTNS.cont, '이어하기', '#2a5a8a', S.hasSave, 2, (cx, cy, on) => {
      text(sv ? '레벨 ' + pad3(sv.level) + ' · 목숨 ' + sv.lives : S.hasSave ? '저장된 게임' : '저장된 게임 없음', cx, cy + 1, on ? '#cfe8ff' : '#5a6a7e', 1, 'center');
    });
    button(TITLE_BTNS.help, '게임 방법', '#7a5a1a', true);
    button(TITLE_BTNS.rank, '랭킹', '#5a2a8a', true);
    button(TITLE_BTNS.sound, Sound.isMuted() ? '소리: 꺼짐' : '소리: 켜짐', '#2a6a4a', true, 1);
    Object.keys(TITLE_BTNS).forEach(k => { const r = TITLE_BTNS[k]; if (inRect(S.mouse, r)) brackets(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 2, r.h / 2 + 2, C.hover); });
    const hy = TITLE_BTNS.sound.y + TITLE_BTNS.sound.h;
    if (P) {
      text('자동 저장: 꺼도 [이어하기]로 계속할 수 있어요', W / 2, hy + 18, '#9fd8a8', 1, 'center');
      text('전투 중에 꺼지면 그 레벨 준비 화면부터 다시', W / 2, hy + 34, C.dim, 1, 'center');
      if (Math.floor(S.time * 2) % 2 === 0) text('터치: 끌어다 놓기 또는 탭 두 번', W / 2, hy + 62, C.dim, 1, 'center');
    } else {
      text('자동 저장: 브라우저를 꺼도 [이어하기]로 계속할 수 있어요', W / 2, 414, '#9fd8a8', 1, 'center');
      text('전투 중에 꺼지면 그 레벨의 준비 화면부터 다시 시작해요', W / 2, 428, C.dim, 1, 'center');
      if (Math.floor(S.time * 2) % 2 === 0) text('키보드: F 전투 · R 새로고침 · M 소리  |  터치: 드래그 또는 탭', W / 2, 462, C.dim, 1, 'center');
    }
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.75, S.gameoverT) + ')';
    ctx.fillRect(0, 0, W, H);
    const f = S.final;
    const t = S.gameoverT, cy = H / 2;
    if (f.cleared) {
      textStyled('축하합니다!', W / 2, cy - 100, NUM.banner, 3, 'center');
      textStyled('999레벨 모두 클리어!', W / 2, cy - 60, NUM.blue, 2, 'center');
    } else {
      // GAME OVER drops in with two bounces, then flickers
      const k = clamp(t / 0.6, 0, 1), rest = cy - 80;
      const bounce = k < 0.6 ? lerp(-60, rest, easeOutCubic(k / 0.6)) : rest - Math.abs(Math.sin((k - 0.6) / 0.4 * Math.PI * 2)) * 14 * (1 - k);
      const flick = t > 0.7 && t < 1.06 && Math.floor((t - 0.7) / 0.12) % 2 === 0;
      spr('tx_gameover', W / 2, bounce, 2, flick ? { tint: 'w' } : undefined);
    }
    const shown = Math.floor(lerp(1, f.level, clamp((t - 0.6) / 0.8, 0, 1)));
    text('도달 레벨 ' + pad3(shown), W / 2, cy - 30, '#fff', 2, 'center');
    if (f.qualifies && t > 1.6) {
      const s = 2 + 0.1 * Math.abs(Math.sin(S.time * Math.PI * 2));
      spr('tx_top10', W / 2, cy + 20, 2, { sx: s / 2, sy: s / 2 });
      if (Math.random() < 0.3 && t < 3.1) S.fx.push({ type: 'star', x: rand(W / 2 - 160, W / 2 + 160), y: cy - 10, vx: rand(-80, 80), vy: rand(-160, -60), t: 0, dur: 0.9 });
    }
    drawFxLayer(false);
    if (t > 1.8 && !S.modal && (f.qualifies !== null || t > 6) && Math.floor(S.time * 2) % 2 === 0) text('화면을 누르면 계속', W / 2, cy + 60, C.gold, 2, 'center');
  }

  function drawWipe() {
    const w = S.wipe;
    if (!w) return;
    if (w.fade) {
      const k = w.t < 0.15 ? w.t / 0.15 : Math.max(0, 1 - (w.t - 0.15) / 0.15);
      ctx.fillStyle = 'rgba(6,17,25,' + k.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.fillStyle = C.panel;
    const cover = w.t < 0.42;
    const nx = Math.ceil(W / 32), ny = Math.ceil(H / 32);
    for (let gx = 0; gx <= nx; gx++) for (let gy = 0; gy <= ny; gy++) {
      const local = cover ? (w.t - gx * 0.012) / 0.18 : 1 - (w.t - 0.42 - gx * 0.012) / 0.18;
      const k = clamp(local, 0, 1);
      if (k <= 0) continue;
      const r = 23 * k, cx = gx * 32, cy = gy * 32;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
    }
  }

  // ---- atmosphere: lightning storms, edge vignette, low-HP heartbeat ----
  function strike() { S.bolt = { t: 0, x: rand(40, W - 40), seed: (Math.random() * 1e9) | 0, boom: false }; }
  function updateAtmosphere(rdt) {
    if (S.bolt) {
      S.bolt.t += rdt;
      if (!S.bolt.boom && S.bolt.t > 0.14) { S.bolt.boom = true; Sound.play('thunder'); }
      if (S.bolt.t > 0.7) S.bolt = null;
    }
    const z = S.scene === 'title' ? null : zoneOf(S.level);
    const boss = S.scene !== 'title' && isBossLevel(S.level);
    const stormy = !z || boss || z.id === 'graveyard' || z.id === 'castle' || z.id === 'hell';
    if (stormy && S.scene !== 'gameover' && !reducedMotion && !S.modal) {
      S.boltT = (S.boltT == null ? rand(2.5, 5) : S.boltT) - rdt;
      if (S.boltT <= 0) { strike(); S.boltT = rand(8, 15) * (boss ? 0.6 : 1); }
    }
    // your side is about to fall: red pulse + heartbeat
    let danger = 0;
    if (S.scene === 'battle' && S.phase === 'sim' && !S.ending) {
      let hp = 0, max = 0, foes = false;
      for (const u of S.units) { if (u.team === 'P') { max += u.maxHp; if (u.alive) hp += u.hp; } else if (u.alive) foes = true; }
      if (foes && hp > 0 && max > 0 && hp / max < 0.35) danger = 1 - hp / max / 0.35;
    }
    S.danger = danger;
    if (danger > 0) {
      const period = 0.95 - 0.35 * danger;
      S.beatT = (S.beatT || 0) + rdt;
      if (S.beatT >= period) { S.beatT = 0; Sound.play('heartbeat'); }
    } else S.beatT = 0.6;
  }
  function drawLightning(front, full) {
    const b = S.bolt;
    if (!b) return;
    const y0 = full ? 0 : STAGE_Y, y1 = full ? H : CONSOLE_Y;
    if (front) {   // flash: bright, dip, second flicker, fade
      const t = b.t, a = t < 0.05 ? 0.32 : t < 0.09 ? 0.04 : t < 0.15 ? 0.22 : Math.max(0, 0.22 - (t - 0.15) * 0.5);
      if (a > 0.005) { ctx.fillStyle = 'rgba(225,235,255,' + a.toFixed(3) + ')'; ctx.fillRect(-10, y0, W + 20, y1 - y0); }
      return;
    }
    if (!(b.t < 0.05 || (b.t > 0.09 && b.t < 0.16))) return;
    const rr = mulberry32(b.seed), bottom = (full ? H * 0.42 : FLOOR_Y - 30);
    const pts = [[b.x, y0]];
    let x = b.x;
    for (let y = y0 + 18; y < bottom; y += 18) { x += (rr() - 0.5) * 30; pts.push([x, y]); }
    const path = (lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.stroke(); };
    path(5, 'rgba(150,180,255,0.35)'); path(2, '#f4f8ff');
    const k = 2 + Math.floor(rr() * (pts.length - 3));   // one side branch
    if (pts[k]) {
      ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]);
      let bx = pts[k][0], by = pts[k][1];
      for (let i = 0; i < 3; i++) { bx += (rr() < 0.5 ? -1 : 1) * (8 + rr() * 12); by += 14; ctx.lineTo(bx, by); }
      ctx.stroke();
    }
  }
  const vigCache = {};
  function vignetteImg(rgb, maxA) {
    const h = CONSOLE_Y - STAGE_Y, key = rgb + maxA + W + 'x' + h;
    if (vigCache[key]) return vigCache[key];
    const c = document.createElement('canvas');
    c.width = W; c.height = h;
    const g = c.getContext('2d');
    g.setTransform(W / 2, 0, 0, h / 2, W / 2, h / 2);   // elliptical: follows the stage's shape
    const grd = g.createRadialGradient(0, 0, 0.6, 0, 0, 1.42);
    grd.addColorStop(0, 'rgba(' + rgb + ',0)'); grd.addColorStop(1, 'rgba(' + rgb + ',' + maxA + ')');
    g.fillStyle = grd; g.fillRect(-1, -1, 2, 2);
    return (vigCache[key] = c);
  }
  function drawVignette() {
    if (S.scene === 'title' || S.scene === 'gameover') return;
    ctx.drawImage(vignetteImg('0,0,0', 0.55), 0, STAGE_Y);
    if (S.danger > 0) {
      const period = 0.95 - 0.35 * S.danger, ph = (S.beatT || 0) / period;
      const beat = Math.exp(-ph * 6) + 0.6 * Math.exp(-Math.max(0, ph - 0.18) * 7) * (ph > 0.18 ? 1 : 0);
      ctx.globalAlpha = clamp((0.35 + 0.65 * S.danger) * (0.45 + 0.55 * beat), 0, 1);
      ctx.drawImage(vignetteImg('200,0,24', 0.75), 0, STAGE_Y);
      ctx.globalAlpha = 1;
    }
  }

  function drawLoading() {
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);
    text(atlasState === 'error' ? 'sprites.png 파일이 없어요' : '불러오는 중…', W / 2, H / 2 - 7, atlasState === 'error' ? C.sel : C.text, 2, 'center');
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (atlasState !== 'ready') { drawLoading(); return; }
    if (S.scene === 'title') { drawTitle(); drawMsg(); drawWipe(); return; }

    const z = zoneOf(S.level);
    // battle layer (shaken)
    ctx.setTransform(1, 0, 0, 1, S.shakeX, S.shakeY);
    drawStage(z, S.time);
    drawLightning(false);
    drawBoard();
    drawMeteorMarks();
    drawFxLayer(true);
    if (S.scene === 'prep') drawPrepUnits();
    else {
      const sorted = S.units.slice().sort((a, b) => a.y - b.y);
      if (S.dim) {
        sorted.forEach(u => { if (S.dim.keep.indexOf(u) < 0) drawUnit(u); });
        ctx.fillStyle = 'rgba(0,0,0,' + S.dim.a + ')';
        ctx.fillRect(-10, STAGE_Y, W + 20, CONSOLE_Y - STAGE_Y);
        S.dim.keep.forEach(u => drawUnit(u));
      } else sorted.forEach(drawUnit);
    }
    drawFxLayer(false);
    drawParticles();
    if (S.flashBoard) { ctx.fillStyle = S.flashBoard.color; ctx.fillRect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y); }
    if (S.ending && !S.ending.win) { ctx.fillStyle = 'rgba(32,0,16,0.35)'; ctx.fillRect(0, STAGE_Y, W, CONSOLE_Y - STAGE_Y); }
    drawLightning(true);
    drawFloats();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette();

    drawBubbles();
    drawBossBar();
    drawBossIntro();
    drawFightSlam();
    drawCallout();
    drawCutIn();
    drawConsoleBase();
    drawHUD();
    drawSynergy();
    drawInfo();
    drawBench();
    if (S.scene === 'prep') drawShop();
    else drawBattlePanel();
    drawBanner();
    drawResultHint();
    drawZoneCard();
    drawCoins();
    if (S.scene === 'gameover') drawGameOver();
    drawDrag();
    drawMsg();
    drawWipe();
  }

  // =====================================================================
  //  MAIN LOOP  (real clock for feel, scaled clock for the simulation)
  // =====================================================================
  const STEP = 1 / 60;
  let acc = 0, last = performance.now();

  function frame(now) {
    const rdt = Math.min(0.1, (now - last) / 1000);
    last = now;
    S.time += rdt;
    update(rdt);
    render();
    requestAnimationFrame(frame);
  }

  function update(rdt) {
    // wipe
    if (S.wipe) {
      S.wipe.t += rdt;
      const midT = S.wipe.fade ? 0.15 : 0.42;
      if (!S.wipe.done && S.wipe.t >= midT) { S.wipe.done = true; S.wipe.mid(); }
      if (S.wipe.t >= (S.wipe.fade ? 0.3 : 0.84 + 0.25)) S.wipe = null;
    }
    if (S.zoneCard) { S.zoneCard.t += rdt; if (S.zoneCard.t >= S.zoneCard.dur) S.zoneCard = null; }
    if (S.banner) { S.banner.t += rdt; if (S.banner.t >= S.banner.dur && S.scene !== 'result') S.banner = null; }
    if (S.callout) { S.callout.t += rdt; if (S.callout.t > 0.7) S.callout = null; }
    if (S.heartFall) S.heartFall.t += rdt;
    if (S.shopSlide != null) S.shopSlide += rdt;
    if (S.hudPulse > 0) S.hudPulse -= rdt * 4;
    if (S.saveT > 0) S.saveT -= rdt;
    updateAtmosphere(rdt);
    if (S.scene === 'battle' || S.scene === 'result' || S.scene === 'prep') updateTalk(rdt);
    S.roster.forEach(u => { if (u.pop > 0) u.pop -= rdt; });
    if (S.scene !== 'title') updateAmbient(rdt);
    else {
      S.titlePop = S.titlePop || { i: -1, t: 9, next: 2.5 };
      S.titlePop.t += rdt; S.titlePop.next -= rdt;
      if (S.titlePop.next <= 0) {
        const i = Math.floor(Math.random() * GHOSTS.length);
        S.titlePop = { i, t: 0, next: 2.5 };
        const at = paradeAt(i);
        addSpr(GHOSTS[i].id + '_spawn', at.x, at.y - 6, { dur: 0.5, s: 2, grow: true });
      }
      if (S.titleCrow) {
        if (S.titleCrow.fly >= 0) { S.titleCrow.fly += rdt; if (S.titleCrow.fly > 2.2) { S.titleCrow.fly = -1; S.titleCrow.next = rand(8, 14); } }
        else { S.titleCrow.next -= rdt; if (S.titleCrow.next <= 0) S.titleCrow.fly = 0; }
      }
      if (S.ambZone !== 'title') { S.amb = []; S.ambZone = 'title'; }
    }
    // coins
    for (const c of S.coins) {
      const was = c.t;
      c.t += rdt;
      if (was < c.dur && c.t >= c.dur) { S.hudPulse = 0.25; S.goldShown = Math.min(S.gold, S.goldShown + c.v); Sound.play('coin'); }
    }
    // gold counter ticks toward the real value (coins in flight deliver their own share)
    const flying = S.coins.some(c => c.t < c.dur);
    if (!flying && S.goldShown !== S.gold) {
      const d = S.gold - S.goldShown;
      S.goldShown += Math.sign(d) * Math.max(1, Math.floor(Math.abs(d) * 0.2));
      if (Math.abs(S.gold - S.goldShown) < 1) S.goldShown = S.gold;
    }

    // shake (whole pixels, re-rolled every 2 frames)
    if (S.trauma > 0) {
      S.trauma = Math.max(0, S.trauma - 2 * rdt);
      if (++S.shakeTick % 2 === 0) {
        const t2 = S.trauma * S.trauma;
        S.shakeX = Math.round(Math.min(7, 8 * t2) * rand(-1, 1));
        S.shakeY = Math.round(Math.min(6, 6 * t2) * rand(-1, 1));
      }
    } else { S.shakeX = 0; S.shakeY = 0; }
    if (S.flashBoard) { S.flashBoard.t -= rdt; if (S.flashBoard.t <= 0) S.flashBoard = S.flashBoard.then || null; }
    if (S.dim) { S.dim.t -= rdt; if (S.dim.t <= 0) S.dim = null; }
    S.stopBank = Math.min(J.stopBudget, S.stopBank + J.stopBudget * rdt);
    if (S.streak.t > 0) S.streak.t -= rdt;

    let simDt = 0;
    if (S.scene === 'battle') {
      if (S.phase === 'intro') {
        S.introT += rdt;
        if (S.boss && S.introT > 0.2 && S.introT - rdt <= 0.2) { S.bosses.forEach(b => addSpr('fx_spawn1', b.x, b.y - 40, { dur: 0.6, s: 4, grow: true })); S.trauma = Math.min(1, S.trauma + 0.45); if (!reducedMotion) strike(); }
        if (S.introT >= S.introLen - 0.5 && S.introT - rdt < S.introLen - 0.5) Sound.play('fight');
        if (S.introT >= S.introLen) S.phase = 'sim';
      } else if (S.hitstop > 0) {
        S.hitstop -= rdt;
      } else {
        // slow-motion finale
        if (S.ending) {
          S.ending.t += rdt;
          const e = S.ending;
          S.timeScale = e.t < e.dur ? e.scale : Math.min(1, e.scale + (e.t - e.dur) / 0.15 * (1 - e.scale));
          if (e.t >= e.dur + 0.15) { endBattle(e.win, false); }
        }
        if (S.scene === 'battle') {
          simDt = rdt * S.speed * S.timeScale;
          acc += simDt;
          let n = 0;
          while (acc >= STEP && n < 12 && S.scene === 'battle') {
            if (!S.ending) simStep(STEP);
            else updateProjectiles(STEP);   // finale: AI frozen, shots still land
            acc -= STEP; n++;
          }
          if (n >= 12) acc = 0;
        }
      }
      const animDt = S.hitstop > 0 ? 0 : rdt * S.speed * S.timeScale;
      for (const u of S.units) animateUnit(u, animDt, rdt);
      updateFx(animDt || (S.phase === 'intro' ? rdt : 0), rdt);
    } else {
      acc = 0;
      if (S.scene === 'result') { S.resultT += rdt; for (const u of S.units) animateUnit(u, rdt, rdt); if (S.resultT > 3.4) applyResult(); }
      if (S.scene === 'gameover') S.gameoverT += rdt;
      updateFx(rdt, rdt);
    }
  }

  // =====================================================================
  //  INPUT  (touchstart / touchmove / touchend + mousedown fallbacks)
  // =====================================================================
  function toCanvas(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) };
  }

  function rosterAtPoint(p) {
    // sprites first (front rows win), then the cell, then the bench
    const board = S.roster.filter(u => u.loc === 'board').sort((a, b) => b.r - a.r);
    for (const u of board) {
      const f = cellCenter(u.r, u.c);
      if (p.x >= f.x - 18 && p.x <= f.x + 18 && p.y >= f.y - 60 && p.y <= f.y + 6) return u;
    }
    const cell = cellAt(p);
    if (cell && cell.c < PCOLS) { const u = rosterAtCell(cell.r, cell.c); if (u) return u; }
    const s = slotAt(p);
    return s >= 0 ? rosterAtSlot(s) : null;
  }
  function waveAtPoint(p) {
    for (const e of S.wave) {
      const f = cellCenter(e.r, e.c);
      if (p.x >= f.x - 20 && p.x <= f.x + 20 && p.y >= f.y - (e.boss ? 84 : 58) && p.y <= f.y + 6) return e;
    }
    const cell = cellAt(p);
    return cell ? S.wave.find(w => w.r === cell.r && w.c === cell.c) || null : null;
  }

  function onDown(p) {
    Sound.unlock();
    S.mouse = p;
    if (S.modal || S.wipe) return;
    if (S.scene !== 'title' && inRect(p, HIT_SOUND)) { Sound.toggleMute(); Sound.play('click'); return; }

    switch (S.scene) {
      case 'title':
        if (inRect(p, TITLE_BTNS.start, 4)) { Sound.play('select'); wipeTo(newGame); }
        else if (inRect(p, TITLE_BTNS.cont, 4) && S.hasSave) { Sound.play('select'); wipeTo(continueGame); }
        else if (inRect(p, TITLE_BTNS.rank, 4)) { Sound.play('select'); openRanking(); }
        else if (inRect(p, TITLE_BTNS.help, 4)) { Sound.play('select'); UI.showHelp(); }
        else if (inRect(p, TITLE_BTNS.sound, 4)) { Sound.toggleMute(); Sound.play('click'); }
        else Sound.music('title');
        return;

      case 'prep': {
        if (inRect(p, BTN_HELP, 3)) { Sound.play('select'); UI.showHelp(); return; }
        if (S.sel && S.sel.kind === 'roster' && inRect(p, BTN_SELL, 6)) { sell(S.sel.u); return; }
        if (inRect(p, BTN_REROLL, 2)) { reroll(); return; }
        if (inRect(p, BTN_ALTAR, 2)) { altar(); return; }
        if (inRect(p, BTN_FIGHT, 2)) { startBattle(); return; }
        const ci = cardAt(p);
        if (ci >= 0) { buy(ci); return; }
        const u = rosterAtPoint(p);
        if (u) { S.drag = { u, sx: p.x, sy: p.y, x: p.x, y: p.y, feet: feetOf(p), active: false }; return; }
        const e = waveAtPoint(p);
        if (S.sel && S.sel.kind === 'roster' && !e && (cellAt(p) || slotAt(p) >= 0)) { dropAt(S.sel.u, p); return; }
        if (e) {   // tapping a monster makes it talk (a new line every time)
          const again = S.sel && S.sel.kind === 'wave' && S.sel.e === e && S.sel.at && S.time - S.sel.at < 0.4;
          if (!again) {
            const quote = tauntOf(e), p = cellCenter(e.r, e.c);
            S.sel = { kind: 'wave', e, quote, at: S.time };
            S.bubbles = [];
            say({ x: p.x, y: p.y, alive: true, boss: e.boss, big: e.big, mon: MONSTERS[e.skin], skin: e.skin, def: e.def }, quote, e.boss ? 'boss' : 'enemy', 0, 1.8);
            Sound.play('taunt', { pitch: e.boss ? -5 : 0 });
          }
          return;
        }
        S.sel = null;
        return;
      }

      case 'battle':
      case 'result': {
        if (S.scene === 'battle' && inRect(p, BTN_SPEED, 2)) { S.speed = S.speed >= 3 ? 1 : S.speed + 1; Sound.play('click'); return; }
        if (S.scene === 'battle' && S.phase === 'intro' && S.boss && S.introT > 0.3 && S.introT < S.introLen - 0.5) { S.introT = S.introLen - 0.5; return; }
        if (S.scene === 'result' && S.resultT > 0.5) { applyResult(); return; }
        let best = null, bd = 34;
        for (const u of S.units) {
          if (!u.alive) continue;
          const d = Math.hypot(u.x - p.x, u.y - 28 - p.y);
          if (d < bd) { bd = d; best = u; }
        }
        S.sel = best ? { kind: 'unit', u: best } : null;
        if (best) Sound.play('select');
        return;
      }

      case 'gameover':
        if (S.gameoverT > 1.8) afterGameOver();
        return;
    }
  }

  // the dragged ghost is drawn above the finger on touch so it stays visible
  const feetOf = p => ({ x: p.x, y: p.y + (S.touch ? -12 : 22) });

  function onMove(p) {
    S.mouse = p;
    if (S.scene === 'prep') S.hover = cardAt(p) >= 0 ? cardAt(p) : null;
    if (!S.drag) return;
    S.drag.x = p.x; S.drag.y = p.y; S.drag.feet = feetOf(p);
    if (!S.drag.active && Math.hypot(p.x - S.drag.sx, p.y - S.drag.sy) > 8) {
      S.drag.active = true;
      S.sel = { kind: 'roster', u: S.drag.u };
      Sound.play('select');
    }
  }

  function onUp(p) {
    const d = S.drag;
    S.drag = null;
    if (!d || S.scene !== 'prep') return;
    if (d.active) dropAt(d.u, p, feetOf(p));
    else { S.sel = { kind: 'roster', u: d.u }; Sound.play('select'); }
  }

  // one finger drives the pointer: a second finger can't hijack (or drop) a drag in progress
  let touchId = null;
  const findTouch = (list, id) => { for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]; return null; };
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (touchId !== null && findTouch(e.touches, touchId)) return;   // still tracking a live finger
    const t = e.changedTouches[0];
    touchId = t.identifier;
    S.touch = true;
    onDown(toCanvas(t.clientX, t.clientY));
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = findTouch(e.changedTouches, touchId);
    if (t) onMove(toCanvas(t.clientX, t.clientY));
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const t = findTouch(e.changedTouches, touchId);
    if (!t) return;
    touchId = null;
    onUp(toCanvas(t.clientX, t.clientY));
    S.mouse = { x: -1, y: -1 };
    S.hover = null;
  }, { passive: false });
  canvas.addEventListener('touchcancel', e => {
    if (!findTouch(e.changedTouches, touchId)) return;
    touchId = null;
    S.drag = null;
    S.mouse = { x: -1, y: -1 };
    S.hover = null;
  }, { passive: true });

  canvas.addEventListener('mousedown', e => { if (e.button === 0) { S.touch = false; onDown(toCanvas(e.clientX, e.clientY)); } });
  window.addEventListener('mousemove', e => onMove(toCanvas(e.clientX, e.clientY)));
  window.addEventListener('mouseup', e => { if (e.button === 0) onUp(toCanvas(e.clientX, e.clientY)); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (S.modal) { UI.onKey(e); return; }
    Sound.unlock();
    if (S.wipe) return;
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.toggleMute(); return; }
    if ((k === 'h' || k === '?') && (S.scene === 'title' || S.scene === 'prep')) { UI.showHelp(); return; }
    if (S.scene === 'title' && (k === 'enter' || k === ' ')) { wipeTo(newGame); e.preventDefault(); return; }
    if (S.scene === 'prep') {
      if (k === 'f' || k === 'enter' || k === ' ') { startBattle(); e.preventDefault(); }
      else if (k === 'r') reroll();
      else if (k === 'a') altar();
      else if (k === 's' && S.sel && S.sel.kind === 'roster') sell(S.sel.u);
      else if (k >= '1' && k <= '5') buy(parseInt(k, 10) - 1);
      else if (k === 'escape') S.sel = null;
    } else if (S.scene === 'battle') {
      if (k === ' ' || k === 'f') { S.speed = S.speed >= 3 ? 1 : S.speed + 1; e.preventDefault(); }
    } else if (S.scene === 'result') {
      if ((k === ' ' || k === 'enter') && S.resultT > 0.5) { applyResult(); e.preventDefault(); }
    } else if (S.scene === 'gameover' && S.gameoverT > 1.8 && (k === ' ' || k === 'enter')) {
      afterGameOver(); e.preventDefault();
    }
  });

  // =====================================================================
  //  ARCADE MODALS (DOM): initials entry + leaderboard
  // =====================================================================
  const $ = id => document.getElementById(id);
  const UI = (() => {
    const overlay = $('overlay'), entryModal = $('entryModal'), rankModal = $('rankModal'), helpModal = $('helpModal');
    const input = $('entryInput'), err = $('entryErr'), submitBtn = $('entrySubmit');
    const slots = Array.from(entryModal.querySelectorAll('.slot'));
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let letters = ['A', 'A', 'A'], idx = 0, level = 0, online = true, onRankClose = null, busy = false;

    function paint() {
      slots.forEach((s, i) => {
        s.querySelector('.ch').textContent = letters[i];
        s.classList.toggle('active', i === idx);
      });
      if (document.activeElement !== input) input.value = letters.join('');
    }
    function spin(i, dir) {
      letters[i] = A[(A.indexOf(letters[i]) + dir + 26) % 26];
      idx = i;
      Sound.play('spin');
      paint();
    }
    slots.forEach((s, i) => {
      s.querySelector('.up').addEventListener('click', () => spin(i, 1));
      s.querySelector('.down').addEventListener('click', () => spin(i, -1));
      s.querySelector('.ch').addEventListener('click', () => { idx = i; paint(); });
    });
    input.addEventListener('input', () => {
      const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      input.value = v;
      for (let i = 0; i < 3; i++) letters[i] = v[i] || letters[i];
      idx = Math.min(2, v.length);
      paint();
    });
    submitBtn.addEventListener('click', submit);
    $('rankClose').addEventListener('click', closeRanking);
    $('helpClose').addEventListener('click', closeHelp);

    function open(which) {
      S.modal = true;
      overlay.classList.remove('hidden');
      entryModal.classList.toggle('hidden', which !== 'entry');
      rankModal.classList.toggle('hidden', which !== 'rank');
      helpModal.classList.toggle('hidden', which !== 'help');
    }
    function close() {
      overlay.classList.add('hidden');
      entryModal.classList.add('hidden');
      rankModal.classList.add('hidden');
      helpModal.classList.add('hidden');
      S.modal = false;
    }

    function showHelp() { if (S.modal) return; S.drag = null; open('help'); helpModal.scrollTop = 0; }
    function closeHelp() { close(); Sound.play('click'); }

    function showEntry(lvl, isOnline) {
      level = lvl; online = isOnline;
      letters = ['A', 'A', 'A']; idx = 0; busy = false;
      $('entryLevel').textContent = pad3(lvl);
      err.textContent = isOnline ? '' : '오프라인: 이 기기에만 저장돼요';
      submitBtn.disabled = false;
      input.value = '';
      open('entry');
      paint();
      Sound.play('highscore');
    }

    async function submit() {
      if (busy) return;
      const initial = letters.join('');
      if (!/^[A-Z]{3}$/.test(initial)) { err.textContent = '영문 3글자를 입력하세요'; Sound.play('error'); return; }
      busy = true; submitBtn.disabled = true; err.textContent = '저장 중…';
      const done = () => wipeTo(toTitle);
      try {
        if (!online) throw new Error('OFFLINE');
        const j = await API.post('submit_score', { initial, level });
        Sound.play('merge');
        showRanking(j.rankings, j.top10 ? j.id : -1, j.top10 ? j.rank + '위 달성!' : '현재 ' + j.rank + '위', done);
      } catch (e) {
        if (e.message === 'INVALID_INITIAL') {
          err.textContent = '영문(A-Z)만 쓸 수 있어요'; busy = false; submitBtn.disabled = false; Sound.play('error'); return;
        }
        const rank = LocalRank.add(initial, level);
        // server error codes are UPPER_SNAKE; anything else (timeout, network, HTTP_5xx) = offline
        const code = /^[A-Z_]+$/.test(e.message) ? e.message : 'OFFLINE';
        const why = code === 'OFFLINE' || code === 'DB_UNAVAILABLE' || code === 'BAD_RESPONSE' ? '서버 연결 안 됨 · 이 기기에 저장'
          : code === 'LEVEL_NOT_VERIFIED' ? '확인되지 않은 기록 · 이 기기에 저장'
          : '등록 실패(' + code + ') · 이 기기에 저장';
        showRanking(LocalRank.list(), -1, why + (rank ? ' (' + rank + '위)' : ''), done, rank);
      }
    }

    function showRanking(list, highlightId, status, cb, highlightRank) {
      onRankClose = cb || null;
      const body = $('rankBody');
      body.textContent = '';
      if (!list || !list.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4; td.textContent = '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
        tr.appendChild(td); body.appendChild(tr);
      } else {
        list.slice(0, 10).forEach((r, i) => {
          const tr = document.createElement('tr');
          if ((highlightId > 0 && r.id === highlightId) || (highlightRank && highlightRank === i + 1)) tr.className = 'me';
          [String(i + 1).padStart(2, '0'), r.initial, pad3(r.level_reached), r.created_at || ''].forEach(v => {
            const td = document.createElement('td');
            td.textContent = v;   // textContent: never inject HTML
            tr.appendChild(td);
          });
          body.appendChild(tr);
        });
      }
      $('rankStatus').textContent = status || '';
      open('rank');
    }

    function closeRanking() {
      close();
      Sound.play('click');
      const cb = onRankClose; onRankClose = null;
      if (cb) cb();
    }

    function onKey(e) {
      if (!helpModal.classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'h') { e.preventDefault(); closeHelp(); }
        return;
      }
      if (!rankModal.classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeRanking(); }
        return;
      }
      if (e.target === input) { if (e.key === 'Enter') { e.preventDefault(); submit(); } return; }
      const k = e.key;
      if (/^[a-zA-Z]$/.test(k)) { letters[idx] = k.toUpperCase(); idx = Math.min(2, idx + 1); Sound.play('spin'); paint(); e.preventDefault(); }
      else if (k === 'ArrowUp') { spin(idx, 1); e.preventDefault(); }
      else if (k === 'ArrowDown') { spin(idx, -1); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'Backspace') { idx = Math.max(0, idx - 1); paint(); e.preventDefault(); }
      else if (k === 'ArrowRight') { idx = Math.min(2, idx + 1); paint(); e.preventDefault(); }
      else if (k === 'Enter') { e.preventDefault(); submit(); }
    }

    return { showEntry, showRanking, showHelp, onKey };
  })();

  async function openRanking() {
    UI.showRanking([], -1, '불러오는 중…', null);
    try {
      const list = await API.rankings();
      UI.showRanking(list, -1, '전체 순위', null);
    } catch (e) {
      UI.showRanking(LocalRank.list(), -1, '서버 연결 안 됨 · 이 기기 기록', null);
    }
  }

  // =====================================================================
  //  BOOT
  // =====================================================================
  // Layout choice + stage size. The game area is whatever is left under (or over) the fixed
  // ad bar: a tall area gets the portrait layout, its height following the screen's shape.
  const stageEl = document.getElementById('stage'), areaEl = document.getElementById('game-area');
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function relayout(portrait, h) {
    applyLayout(portrait, h);
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    // units keep their cells; snap their screen positions to the new board
    for (const u of S.units) { const p = cellCenter(u.r, u.c); u.x = u.fromX = p.x; u.y = u.fromY = p.y; }
    S.drag = null; S.amb = []; S.ambZone = null; S.crow = null;
    S.particles = []; S.fx = S.fx.filter(f => f.type === 'tomb' || f.type === 'cloud' || f.type === 'scorch');
    S.fx.forEach(f => { if (f.type === 'tomb' && f.u) { const p = cellCenter(f.u.r, f.u.c); f.x = p.x; f.y = p.y + 2; } });
    if (S.banner) S.banner.y = S.banner.name === 'tx_levelup' ? MID_Y - 10 : MID_Y;
  }
  function fitStage() {
    const a = areaEl ? areaEl.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const aw = Math.max(1, a.width), ah = Math.max(1, a.height);
    const portrait = ah > aw * 1.15;
    const want = portrait ? clamp(Math.round(480 * ah / aw / 4) * 4, 760, 940) : 480;
    if (portrait !== PORTRAIT || (portrait && Math.abs(want - H) >= 24)) relayout(portrait, want);
    let k = Math.min(aw / W, ah / H);
    if (!coarse && !PORTRAIT) k = Math.min(k, 1);   // PC: crisp 640x480 whenever it fits
    if (stageEl) { stageEl.style.width = Math.floor(W * k) + 'px'; stageEl.style.height = Math.floor(H * k) + 'px'; }
    // pixel-perfect upscaling, but smooth when shown smaller than 1:1 in device pixels
    canvas.style.imageRendering = W * k * (window.devicePixelRatio || 1) >= W ? 'pixelated' : 'auto';
  }
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', () => setTimeout(fitStage, 250));
  fitStage();

  S.hasSave = !!store.get('gt_save');
  refreshShop();
  Sound.music('title');   // starts after the first user gesture (autoplay policy)

  // Debug / test hook (read-only helpers + state).
  window.GhostTactics = {
    levelMultipliers,
    enemyStats: (id, L, boss) => enemyStats(GMAP[id], L, !!boss),
    genWave: L => genWave(L).map(e => ({ id: e.def.id, skin: e.skin, r: e.r, c: e.c, boss: e.boss })),
    setLevel: L => { S.level = clamp(L | 0, 1, MAX_LEVEL); S.wave = genWave(S.level); },
    zoneOf: L => zoneOf(L).id,
    cap: L => playerCap(L),
    get dims() {
      return { W, H, PORTRAIT, ROWS, COLS, PCOLS, BOARD_X, BOARD_Y, CELL_W, CELL_H, BENCH_N, BENCH_X, BENCH_Y, SLOT_W, SLOT_H, SLOT_GAP,
        SHOP_X, SHOP_Y, CARD_W, CARD_H, CARD_GAP, BTN_FIGHT, BTN_SPEED, TITLE_BTNS };
    },
    // canvas-space points for tests: the middle of a cell (body, not feet), a bench slot, a shop card
    cellPoint: (r, c) => { const q = cellRect(r, c); return { x: q.x + q.w / 2, y: q.y + q.h / 2 }; },
    slotPoint: i => ({ x: BENCH_X + i * SLOT_GAP + SLOT_W / 2, y: BENCH_Y + SLOT_H / 2 }),
    cardPoint: i => ({ x: SHOP_X + i * CARD_GAP + CARD_W / 2, y: SHOP_Y + CARD_H / 2 }),
    eskLevel: (L, boss, tier) => eskLevel(L, !!boss, tier | 0),
    state: S
  };

  requestAnimationFrame(frame);
})();
