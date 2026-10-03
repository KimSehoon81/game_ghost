/*
 * Ghost-Tactics :: game.js
 * Retro 2D tactical auto-battler. Vanilla JS + Canvas 2D, no external assets.
 *
 *  - 3 x 6 battle grid (player owns the left 3 columns, enemies the right 3)
 *  - drag & drop / tap-to-place unit placement, 8-slot bench, 5-card shop
 *  - procedural levels 1..999:  HP = BaseHP*1.045^L,  ATK = BaseATK*1.038^L
 *  - nearest-target grid AI, MP bars and 10 unique ghost skills
 *  - arcade 3-letter high-score entry + AJAX leaderboard (save.php)
 */
(() => {
  'use strict';

  // =====================================================================
  //  CONSTANTS & LAYOUT (logical 640x480 canvas)
  // =====================================================================
  const W = 640, H = 480;
  const ROWS = 3, COLS = 6, PCOLS = 3;
  const CELL_W = 80, CELL_H = 72, BOARD_X = 80, BOARD_Y = 40;
  const BENCH_N = 8, BENCH_X = 66, BENCH_Y = 262, SLOT_W = 60, SLOT_H = 62, SLOT_GAP = 64;
  const SHOP_N = 5, SHOP_X = 8, SHOP_Y = 332, CARD_W = 90, CARD_H = 142, CARD_GAP = 96;
  const BTN_REROLL = { x: 492, y: 332, w: 140, h: 34 };
  const BTN_ALTAR = { x: 492, y: 370, w: 140, h: 34 };
  const BTN_FIGHT = { x: 492, y: 408, w: 140, h: 66 };
  const BTN_SPEED = { x: 492, y: 332, w: 140, h: 34 };
  const BTN_SOUND = { x: 592, y: 6, w: 42, h: 22 };
  const BTN_SELL = { x: 565, y: 228, w: 70, h: 24 };
  const INFO = { x: 562, y: 40, w: 76, h: 216 };
  const SYN = { x: 2, y: 40, w: 76, h: 216 };

  const MAX_LEVEL = 999;
  const START_GOLD = 10, START_LIVES = 3, MAX_LIVES = 5;
  const REROLL_COST = 2, BATTLE_LIMIT = 60;
  const STAR_MUL = [0, 1, 1.8, 3.24];
  const HP_GROWTH = 1.045, ATK_GROWTH = 1.038;
  const ENEMY_BASE = 0.8;        // enemy BaseHP/BaseATK = roster base * 0.8
  const POWER_STEP = 1.06;       // altar: +6% HP/ATK per level (multiplicative)

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // =====================================================================
  //  UTILS
  // =====================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad3 = n => String(n).padStart(3, '0');
  const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

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
  //  5x7 BITMAP FONT
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
    '_': '.....|.....|.....|.....|.....|.....|#####', '#': '.#.#.|#####|.#.#.|.#.#.|.#.#.|#####|.#.#.'
  };
  const GLYPH = {};
  Object.keys(FONT).forEach(k => { GLYPH[k] = FONT[k].split('|'); });

  const textCache = new Map();
  function textImage(str, color, scale, shadow) {
    const key = str + '\u0001' + color + '\u0001' + scale + (shadow ? 's' : '');
    let c = textCache.get(key);
    if (c) return c;
    const sh = shadow ? scale : 0;
    c = document.createElement('canvas');
    c.width = Math.max(1, str.length * 6 * scale + sh);
    c.height = 7 * scale + sh;
    const g = c.getContext('2d');
    const draw = (col, ox, oy) => {
      g.fillStyle = col;
      for (let i = 0; i < str.length; i++) {
        const gl = GLYPH[str[i]] || GLYPH['?'];
        for (let r = 0; r < 7; r++) {
          const row = gl[r];
          for (let q = 0; q < 5; q++) if (row.charCodeAt(q) === 35) g.fillRect(ox + (i * 6 + q) * scale, oy + r * scale, scale, scale);
        }
      }
    };
    if (shadow) draw('#000', sh, sh);
    draw(color, 0, 0);
    if (textCache.size > 900) textCache.clear();
    textCache.set(key, c);
    return c;
  }

  function text(str, x, y, color, scale, align, shadow) {
    str = String(str).toUpperCase();
    if (!str.length) return;
    scale = scale || 1;
    const img = textImage(str, color || '#fff', scale, shadow !== false);
    const w = str.length * 6 * scale - scale;
    let dx = x;
    if (align === 'center') dx = x - Math.floor(w / 2);
    else if (align === 'right') dx = x - w;
    ctx.drawImage(img, Math.round(dx), Math.round(y));
  }

  function wrap(str, max) {
    const words = String(str).toUpperCase().split(/\s+/);
    const lines = [];
    let cur = '';
    words.forEach(w => {
      if (!cur.length) cur = w;
      else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // =====================================================================
  //  PIXEL SPRITES (12x12, palette keyed)
  // =====================================================================
  const PAL = {
    K: '#1a1428', k: '#4a3a64', W: '#f8f8f8', w: '#b8b8c8', S: '#f4c8a0', P: '#dde4f4',
    R: '#e03030', r: '#8a1a1a', G: '#58c048', g: '#2e7a2a', B: '#4060e0', b: '#24306e',
    Y: '#f8d838', O: '#f08828', M: '#d850b8', m: '#82287a', N: '#9a6a3a', n: '#5a3a1a',
    T: '#e8d8a8', t: '#a89868', C: '#60e0f0', L: '#a0a0b0', l: '#606070'
  };

  const SPRITES = {
    dracula: [
      '....KKKK....', '...KKKKKK...', '..KKPPPPKK..', '..KPRPPRPK..', '..KPPPPPPK..', '...KPWWPK...',
      '.rKKKPPKKKr.', 'rRrKKKKKKrRr', 'rRrKKRRKKrRr', 'rRKKKRRKKKRr', '.r.KKKKKK.r.', '...KK..KK...'
    ],
    frank: [
      '..KKKKKKKK..', '..KKKKKKKK..', '..GGGGGGGG..', '..GKGGGGKG..', '..GGGGGGGG..', '..GKKKKKKG..',
      'L.gGGGGGGg.L', '.nnnnnnnnnn.', 'GnnnnbbnnnnG', 'GnnnnbbnnnnG', '..bbbbbbbb..', '..KK....KK..'
    ],
    succubus: [
      '.K........K.', '..KmmmmmmK..', '..mmSSSSmm..', '..mSMSSMSm..', '..mSSSSSSm..', '.m.mSRRSm.m.',
      'MM.MMMMMM.MM', 'MMMMSMMSMMMM', 'M..MMMMMM..M', '...MMMMMM...', '...MM..MM...', '...S....S...'
    ],
    mummy: [
      '....TTTT....', '...TTTTTT...', '...ttTTtt...', '...TYTTYT...', '...TTTTTT...', '....tTTt....',
      '..TTTTTTTT..', '.TtTTTTTTtT.', '.T.ttTTtt.T.', '...TTTTTT...', '...Tt..tT...', '...TT..TT...'
    ],
    werewolf: [
      '.N........N.', '.NN.NNNN.NN.', '..NNNNNNNN..', '..NYNNNNYN..', '..NNNNNNNN..', '...NnWWnN...',
      '..NNnnnnNN..', '.NNNNTTNNNN.', 'NN.NTTTTN.NN', 'W..NNNNNN..W', '...NN..NN...', '..WN....NW..'
    ],
    gumiho: [
      '.O........O.', '.OO.OOOO.OO.', '..OOWWWWOO..', '..OWKWWKWO..', '..OWWWWWWO..', '...OWRRWO...',
      '...RRRRRR...', 'O.RRWWWWRR.O', 'OO.RRWWRR.OO', 'WOO.RRRR.OOW', '.WO.RR.RR.OW', '....W...W...'
    ],
    jiangshi: [
      '..KKKKKKKK..', '.KKKKKKKKKK.', '...PPYYPP...', '...PKYYKP...', '...PPYYPP...', '....PPPP....',
      'BBBBBBBBBBBB', 'PBBBBYYBBBBP', '...BBBBBB...', '...BBBBBB...', '...BB..BB...', '...KK..KK...'
    ],
    palcheok: [
      '....KKKK....', '...KKKKKK...', '...KPPPPK...', '...KRPPRK...', '...KPPPPK...', '...KKPPKK...',
      '...KWWWWK...', '...KWWWWK...', '..WWWWWWWW..', '..PWWWWWWP..', '...WWWWWW...', '...WWwwWW...'
    ],
    maiden: [
      '...KKKKKK...', '..KKKKKKKK..', '..KKPPPPKK..', '..KKRPPRKK..', '..KKPPPPKK..', '..KKKrrKKK..',
      '..KWWWWWWK..', '.KKWWWWWWKK.', '.PKWWWWWWKP.', '..KWWWWWWK..', '...WWWWWW...', '....wWWw....'
    ],
    reaper: [
      '....KKKK....', '....KkkK....', 'KKKKKKKKKKKK', '...PPPPPP...', '...PKPPKP...', '...PPPPPP...',
      '....PrrP....', '..KKKKKKKK..', '.KKKKKKKKKK.', '.PKKKKKKKKP.', '..KKKKKKKK..', '..KK....KK..'
    ]
  };

  // =====================================================================
  //  GHOST ROSTER
  // =====================================================================
  const GHOSTS = [
    { id: 'dracula', name: 'Dracula', origin: 'W', role: 'Melee Lifesteal', cost: 3, hp: 640, atk: 52, range: 1, aspd: 0.9, move: 0.42, mp: 80,
      color: '#e03030', skill: 'Blood Feast', desc: 'Bite for 250% ATK, heal all damage dealt. Passive 20% lifesteal.' },
    { id: 'frank', name: 'Frankenstein', origin: 'W', role: 'Tank', cost: 2, hp: 980, atk: 38, range: 1, aspd: 0.6, move: 0.55, mp: 100,
      color: '#60e0f0', skill: 'Electric Stun', desc: 'Shock target and adjacent foes: 150% ATK, stun 1.5s.' },
    { id: 'succubus', name: 'Succubus', origin: 'W', role: 'Ranged', cost: 3, hp: 480, atk: 46, range: 3, aspd: 0.85, move: 0.45, mp: 90,
      color: '#ff70d8', skill: 'Charm', desc: 'Charm strongest foe in range 3s. It attacks its own allies.' },
    { id: 'mummy', name: 'Mummy', origin: 'W', role: 'Sub-Tank', cost: 1, hp: 820, atk: 40, range: 1, aspd: 0.7, move: 0.55, mp: 90,
      color: '#e8d8a8', skill: 'Bandage Wrap', desc: 'Wrap the highest-HP foe: 120% ATK, stun 2.5s.' },
    { id: 'werewolf', name: 'Werewolf', origin: 'W', role: 'Melee DPS', cost: 2, hp: 600, atk: 58, range: 1, aspd: 1.0, move: 0.32, mp: 70,
      color: '#f08828', skill: 'Blood Rage', desc: '+100% attack speed for 4s and heal 15% max HP.' },
    { id: 'gumiho', name: 'Gumiho', origin: 'E', role: 'Ranged DPS', cost: 3, hp: 450, atk: 56, range: 3, aspd: 0.8, move: 0.45, mp: 80,
      color: '#ffb030', skill: 'Fox Orb', desc: 'Piercing orb: 200% ATK to every foe in its path.' },
    { id: 'jiangshi', name: 'Jiangshi', origin: 'E', role: 'Melee Tank', cost: 1, hp: 860, atk: 36, range: 1, aspd: 0.7, move: 0.6, mp: 90,
      color: '#f8d838', skill: 'Steel Talisman', desc: 'Shield self 50% max HP, adjacent allies 20%, for 5s.' },
    { id: 'palcheok', name: 'Palcheok-Gwi', origin: 'E', role: 'Melee Disrupter', cost: 2, hp: 720, atk: 44, range: 1, aspd: 0.8, move: 0.5, mp: 90,
      color: '#9a7aff', skill: 'Po-Po-Po', desc: 'Bind foes around target 3s (no move/skill), DOT 80% ATK/s 4s.' },
    { id: 'maiden', name: 'Maiden Ghost', origin: 'E', role: 'Ranged Assassin', cost: 3, hp: 430, atk: 50, range: 3, aspd: 0.85, move: 0.45, mp: 85,
      color: '#c0d0ff', skill: 'Wailing Curse', desc: 'Lowest-HP foe anywhere: 300% ATK, cursed +25% dmg taken 4s.' },
    { id: 'reaper', name: 'Grim Reaper', origin: 'E', role: 'Ranged Finisher', cost: 4, hp: 520, atk: 60, range: 3, aspd: 0.75, move: 0.45, mp: 100,
      color: '#b080ff', skill: 'Death Note', desc: 'Execute a foe under 15% HP. Else 220% ATK to lowest HP% foe.' }
  ];
  const GMAP = {};
  GHOSTS.forEach(g => { GMAP[g.id] = g; });
  const COST_COLOR = ['#000', '#a0a0b0', '#58c048', '#4a8cff', '#d850ff'];

  // Pre-render each sprite in 3 flavours: player (cyan rim), enemy (red rim, mirrored), flash (white).
  function buildSprite(rows, rim, flip, solid) {
    const c = document.createElement('canvas');
    c.width = 14; c.height = 14;
    const g = c.getContext('2d');
    const on = (x, y) => y >= 0 && y < 12 && x >= 0 && x < 12 && rows[y][x] !== '.';
    if (rim) {
      g.fillStyle = rim;
      for (let y = -1; y <= 12; y++) for (let x = -1; x <= 12; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) {
          g.fillRect((flip ? 11 - x : x) + 1, y + 1, 1, 1);
        }
      }
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = solid || PAL[ch] || '#f0f';
      g.fillRect((flip ? 11 - x : x) + 1, y + 1, 1, 1);
    }
    return c;
  }
  const SPR = {};
  GHOSTS.forEach(gd => {
    const rows = SPRITES[gd.id];
    SPR[gd.id] = {
      P: buildSprite(rows, '#7fd8ff', false),
      E: buildSprite(rows, '#ff4a4a', true),
      FP: buildSprite(rows, null, false, '#ffffff'),
      FE: buildSprite(rows, null, true, '#ffffff')
    };
  });

  // =====================================================================
  //  PROCEDURAL LEVELS (no maps stored anywhere)
  // =====================================================================
  function levelMultipliers(level) {
    const L = clamp(level | 0, 1, MAX_LEVEL);
    return { hp: Math.pow(HP_GROWTH, L), atk: Math.pow(ATK_GROWTH, L) };
  }
  function enemyStats(def, level, boss) {
    const m = levelMultipliers(level);
    return {
      hp: def.hp * ENEMY_BASE * m.hp * (boss ? 3 : 1),     // HP  = BaseHP  * 1.045^L
      atk: def.atk * ENEMY_BASE * m.atk * (boss ? 1.5 : 1) // ATK = BaseATK * 1.038^L
    };
  }
  const squadSize = L => Math.min(9, 1 + Math.ceil(L / 2));
  const playerCap = L => squadSize(L);
  const isBossLevel = L => L % 10 === 0;

  // Deterministic wave for a level (same level => same formation).
  function genWave(level) {
    const rng = mulberry32((Math.imul(level, 2654435761) ^ 0x5bd1e995) >>> 0);
    const n = squadSize(level);
    const maxCost = level < 3 ? 2 : level < 6 ? 3 : 4;
    const pool = GHOSTS.filter(g => g.cost <= maxCost);
    const used = {};
    const wave = [];
    for (let i = 0; i < n; i++) {
      const def = pool[Math.floor(rng() * pool.length)];
      const prefs = def.range > 1 ? [5, 4, 3] : [3, 4, 5];
      let placed = false;
      for (const c of prefs) {
        const rows = [0, 1, 2].sort(() => rng() - 0.5);
        for (const r of rows) {
          if (!used[r + ',' + c]) { used[r + ',' + c] = 1; wave.push({ def, r, c, boss: false }); placed = true; break; }
        }
        if (placed) break;
      }
    }
    if (isBossLevel(level) && wave.length) {
      // the toughest-looking (highest base HP) unit becomes the boss
      wave.reduce((a, b) => (b.def.hp > a.def.hp ? b : a)).boss = true;
    }
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
    scene: 'title',
    time: 0,
    level: 1, gold: START_GOLD, lives: START_LIVES, power: 0, best: 0,
    roster: [],          // {uid,id,star,loc:'board'|'bench',r,c,slot}
    shop: [],            // ghost ids or null
    wave: [],            // preview of next enemies
    units: [], grid: null, projectiles: [],
    fx: [], floats: [], particles: [], log: [],
    battleT: 0, speed: 1, result: null, resultT: 0,
    sel: null, drag: null, hover: null, mouse: { x: -1, y: -1 },
    msg: '', msgT: 0, shake: 0,
    modal: false, final: null, gameoverT: 0,
    hasSave: false,
    skillCount: {}       // debug/telemetry: casts per ghost id
  };
  S.best = parseInt(store.get('gt_best') || '0', 10) || 0;

  const PID = playerId();

  // =====================================================================
  //  NETWORK (save.php) with graceful offline fallback
  // =====================================================================
  const API = {
    token: (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
    async post(action, data) {
      const res = await fetch('save.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': API.token },
        body: JSON.stringify(Object.assign({ action }, data || {}))
      });
      let j = null;
      try { j = await res.json(); } catch (e) { throw new Error('BAD_RESPONSE'); }
      if (!j || !j.ok) throw new Error((j && j.error) || 'HTTP_' + res.status);
      return j;
    },
    async rankings() {
      const res = await fetch('save.php?action=rankings', { credentials: 'same-origin', cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'ERR');
      return j.rankings;
    }
  };

  const LocalRank = {
    list() {
      try {
        const l = JSON.parse(store.get('gt_local_rank') || '[]');
        return Array.isArray(l) ? l : [];
      } catch (e) { return []; }
    },
    add(initial, level) {
      const l = this.list();
      const entry = { initial, level_reached: level, created_at: new Date().toISOString().slice(0, 10), t: Date.now() };
      l.push(entry);
      l.sort((a, b) => b.level_reached - a.level_reached || a.t - b.t);
      const top = l.slice(0, 10);
      store.set('gt_local_rank', JSON.stringify(top));
      return top.indexOf(entry) + 1; // 0 = did not make the local top 10
    }
  };

  // =====================================================================
  //  ROSTER HELPERS
  // =====================================================================
  const rosterAtCell = (r, c) => S.roster.find(u => u.loc === 'board' && u.r === r && u.c === c) || null;
  const rosterAtSlot = i => S.roster.find(u => u.loc === 'bench' && u.slot === i) || null;
  const boardCount = () => S.roster.filter(u => u.loc === 'board').length;
  function freeSlot() {
    for (let i = 0; i < BENCH_N; i++) if (!rosterAtSlot(i)) return i;
    return -1;
  }
  function sellValue(u) { return GMAP[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9); }
  const powerMul = () => Math.pow(POWER_STEP, S.power);
  const altarCost = () => 5 + 3 * S.power;

  function synergy(list) {
    const seen = { W: new Set(), E: new Set() };
    list.forEach(u => { const d = GMAP[u.id || (u.def && u.def.id)]; seen[d.origin].add(d.id); });
    const w = seen.W.size, e = seen.E.size;
    return {
      w, e,
      hp: w >= 4 ? 1.35 : w >= 2 ? 1.15 : 1,
      atk: e >= 4 ? 1.35 : e >= 2 ? 1.15 : 1
    };
  }

  function playerStats(id, star, syn) {
    const d = GMAP[id], m = STAR_MUL[star] * powerMul();
    return { hp: d.hp * m * syn.hp, atk: d.atk * m * syn.atk };
  }

  function cellAt(p) {
    if (p.x < BOARD_X || p.x >= BOARD_X + COLS * CELL_W || p.y < BOARD_Y || p.y >= BOARD_Y + ROWS * CELL_H) return null;
    return { r: Math.floor((p.y - BOARD_Y) / CELL_H), c: Math.floor((p.x - BOARD_X) / CELL_W) };
  }
  function slotAt(p) {
    if (p.y < BENCH_Y || p.y >= BENCH_Y + SLOT_H) return -1;
    const i = Math.floor((p.x - BENCH_X) / SLOT_GAP);
    if (i < 0 || i >= BENCH_N) return -1;
    return (p.x - BENCH_X - i * SLOT_GAP) < SLOT_W ? i : -1;
  }
  function cardAt(p) {
    if (p.y < SHOP_Y || p.y >= SHOP_Y + CARD_H) return -1;
    const i = Math.floor((p.x - SHOP_X) / CARD_GAP);
    if (i < 0 || i >= SHOP_N) return -1;
    return (p.x - SHOP_X - i * CARD_GAP) < CARD_W ? i : -1;
  }
  const inShopZone = p => p.y >= SHOP_Y - 4 && p.x < BTN_REROLL.x - 2;
  const cellCenter = (r, c) => ({ x: BOARD_X + c * CELL_W + CELL_W / 2, y: BOARD_Y + r * CELL_H + CELL_H / 2 + 4 });

  function flash(msg) { S.msg = msg; S.msgT = 2; }

  // =====================================================================
  //  SHOP / ECONOMY
  // =====================================================================
  function refreshShop() {
    S.shop = [];
    for (let i = 0; i < SHOP_N; i++) S.shop.push(rollShopCard(S.level));
  }

  function countCopies(id, star) { return S.roster.filter(u => u.id === id && u.star === star).length; }

  function buy(i) {
    const id = S.shop[i];
    if (!id) return;
    const d = GMAP[id];
    if (S.gold < d.cost) { flash('NOT ENOUGH GOLD'); Sound.play('error'); return; }
    const willMerge = countCopies(id, 1) >= 2;
    const slot = freeSlot();
    const canBoard = boardCount() < playerCap(S.level);
    if (slot < 0 && !willMerge && !canBoard) { flash('BENCH FULL'); Sound.play('error'); return; }

    S.gold -= d.cost;
    S.shop[i] = null;
    const u = { uid: uidSeq++, id, star: 1, loc: 'bench', slot: Math.max(0, slot), r: 0, c: 0 };
    // Convenience: auto-deploy onto the board while there is room.
    if (canBoard && !willMerge) {
      const spot = findBoardSpot(d);
      if (spot) { u.loc = 'board'; u.r = spot.r; u.c = spot.c; }
    }
    if (u.loc === 'bench' && slot < 0) u.slot = -99; // transient: will be merged immediately
    S.roster.push(u);
    Sound.play('buy');
    const merged = tryMerge(id, 1);
    S.sel = { kind: 'roster', u: merged || u };
  }

  function findBoardSpot(def) {
    const cols = def.range > 1 ? [0, 1, 2] : [2, 1, 0];
    for (const c of cols) for (const r of [1, 0, 2]) if (!rosterAtCell(r, c)) return { r, c };
    return null;
  }

  function tryMerge(id, star) {
    if (star >= 3) return null;
    const copies = S.roster.filter(u => u.id === id && u.star === star);
    if (copies.length < 3) return null;
    copies.sort((a, b) => (a.loc === 'board' ? 0 : 1) - (b.loc === 'board' ? 0 : 1) || (a.slot === -99 ? 1 : 0) - (b.slot === -99 ? 1 : 0));
    const keep = copies[0];
    const gone = copies.slice(1, 3);
    S.roster = S.roster.filter(u => gone.indexOf(u) < 0);
    if (keep.slot === -99) { keep.slot = Math.max(0, freeSlot()); }
    keep.star = star + 1;
    Sound.play('merge');
    flash(GMAP[id].name + ' ' + '*'.repeat(keep.star) + ' !');
    const p = keep.loc === 'board' ? cellCenter(keep.r, keep.c) : slotCenter(keep.slot);
    burst(p.x, p.y, '#f8d838', 26, 140);
    addFx({ type: 'ring', x: p.x, y: p.y, color: '#f8d838', dur: 0.5, r: 40 });
    return tryMerge(id, star + 1) || keep;
  }

  function sell(u) {
    S.roster = S.roster.filter(x => x !== u);
    S.gold += sellValue(u);
    if (S.sel && S.sel.u === u) S.sel = null;
    Sound.play('sell');
    flash('SOLD +' + sellValue(u) + 'G');
  }

  function reroll() {
    if (S.gold < REROLL_COST) { flash('NOT ENOUGH GOLD'); Sound.play('error'); return; }
    S.gold -= REROLL_COST;
    refreshShop();
    Sound.play('spin');
  }

  function altar() {
    const cost = altarCost();
    if (S.gold < cost) { flash('NOT ENOUGH GOLD'); Sound.play('error'); return; }
    S.gold -= cost;
    S.power++;
    Sound.play('power');
    flash('ALTAR LV ' + S.power + ': ALL GHOSTS +6%');
    S.roster.forEach(u => {
      if (u.loc !== 'board') return;
      const p = cellCenter(u.r, u.c);
      burst(p.x, p.y, '#b080ff', 10, 90);
    });
  }

  function slotCenter(i) { return { x: BENCH_X + i * SLOT_GAP + SLOT_W / 2, y: BENCH_Y + SLOT_H / 2 + 2 }; }

  // Move roster unit `u` to the cell / slot under point p (swap if occupied).
  function dropAt(u, p) {
    const cell = cellAt(p);
    if (cell) {
      if (cell.c >= PCOLS) { flash('DEPLOY ON YOUR SIDE (LEFT)'); Sound.play('error'); return false; }
      const other = rosterAtCell(cell.r, cell.c);
      if (other === u) return false;
      if (u.loc === 'bench' && !other && boardCount() >= playerCap(S.level)) {
        flash('UNIT CAP ' + playerCap(S.level) + ' (RISES WITH LEVEL)'); Sound.play('error'); return false;
      }
      if (other) {
        if (u.loc === 'bench') { other.loc = 'bench'; other.slot = u.slot; }
        else { other.r = u.r; other.c = u.c; }
      }
      u.loc = 'board'; u.r = cell.r; u.c = cell.c;
      Sound.play('place');
      return true;
    }
    const slot = slotAt(p);
    if (slot >= 0) {
      const other = rosterAtSlot(slot);
      if (other === u) return false;
      if (other) {
        if (u.loc === 'board') { other.loc = 'board'; other.r = u.r; other.c = u.c; }
        else other.slot = u.slot;
      }
      u.loc = 'bench'; u.slot = slot;
      Sound.play('place');
      return true;
    }
    if (inShopZone(p)) { sell(u); return true; }
    return false;
  }

  // =====================================================================
  //  GAME FLOW
  // =====================================================================
  function newGame() {
    S.level = 1; S.gold = START_GOLD; S.lives = START_LIVES; S.power = 0;
    S.roster = []; S.sel = null; S.drag = null;
    refreshShop();
    API.post('new_game').catch(() => {});
    enterPrep(true);
  }

  function serialize() {
    return {
      v: 1, level: S.level, gold: S.gold, lives: S.lives, power: S.power,
      roster: S.roster.map(u => ({ id: u.id, star: u.star, loc: u.loc, r: u.r, c: u.c, slot: u.slot })),
      shop: S.shop
    };
  }

  function restore(st) {
    if (!st || typeof st !== 'object') return false;
    const lvl = parseInt(st.level, 10);
    if (!(lvl >= 1 && lvl <= MAX_LEVEL)) return false;
    S.level = lvl;
    S.gold = Math.max(0, parseInt(st.gold, 10) || 0);
    S.lives = clamp(parseInt(st.lives, 10) || 1, 1, MAX_LIVES);
    S.power = Math.max(0, parseInt(st.power, 10) || 0);
    S.roster = [];
    const taken = {};
    (Array.isArray(st.roster) ? st.roster : []).forEach(x => {
      if (!GMAP[x.id]) return;
      const u = { uid: uidSeq++, id: x.id, star: clamp(x.star | 0, 1, 3), loc: x.loc === 'board' ? 'board' : 'bench', r: x.r | 0, c: x.c | 0, slot: x.slot | 0 };
      const key = u.loc === 'board' ? 'b' + u.r + ',' + u.c : 's' + u.slot;
      const bad = u.loc === 'board' ? (u.r < 0 || u.r >= ROWS || u.c < 0 || u.c >= PCOLS) : (u.slot < 0 || u.slot >= BENCH_N);
      if (bad || taken[key]) return;
      taken[key] = 1;
      S.roster.push(u);
    });
    S.shop = Array.isArray(st.shop) && st.shop.length === SHOP_N ? st.shop.map(id => (GMAP[id] ? id : null)) : [];
    if (!S.shop.length) refreshShop();
    return true;
  }

  function saveProgress() {
    const st = serialize();
    store.set('gt_save', JSON.stringify(st));
    S.hasSave = true;
    API.post('save_progress', { player_id: PID, level: S.level, gold: S.gold, lives: S.lives, power: S.power, state: st })
      .catch(() => {});
  }

  function clearProgress() {
    store.del('gt_save');
    S.hasSave = false;
    API.post('clear_progress', { player_id: PID }).catch(() => {});
  }

  async function continueGame() {
    let st = null;
    try {
      const j = await API.post('load_progress', { player_id: PID });
      if (j.progress && j.progress.state) st = j.progress.state;
    } catch (e) { /* offline: fall back to local */ }
    if (!st) {
      try { st = JSON.parse(store.get('gt_save') || 'null'); } catch (e) { st = null; }
    }
    if (!restore(st)) { flash('NO SAVE FOUND'); Sound.play('error'); S.hasSave = false; return; }
    S.sel = null;
    enterPrep(false);
  }

  function enterPrep(save) {
    S.scene = 'prep';
    S.units = []; S.projectiles = []; S.fx = []; S.particles = []; S.floats = [];
    S.wave = genWave(S.level);
    S.drag = null;
    if (S.sel && S.sel.kind !== 'roster') S.sel = null;
    if (S.level > S.best) { S.best = S.level; store.set('gt_best', String(S.best)); }
    if (save !== false) saveProgress();
    Sound.music('prep');
  }

  function startBattle() {
    if (boardCount() === 0) { flash('PLACE A GHOST ON THE BOARD!'); Sound.play('error'); return; }
    S.grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    S.units = [];
    const board = S.roster.filter(u => u.loc === 'board');
    const syn = synergy(board);
    board.forEach(u => {
      const st = playerStats(u.id, u.star, syn);
      spawnUnit(GMAP[u.id], u.star, 'P', u.r, u.c, st.hp, st.atk, false);
    });
    S.wave.forEach(e => {
      const st = enemyStats(e.def, S.level, e.boss);
      spawnUnit(e.def, 1, 'E', e.r, e.c, st.hp, st.atk, e.boss);
    });
    S.projectiles = []; S.fx = []; S.floats = []; S.particles = [];
    S.log = [];
    S.battleT = 0;
    S.sel = null; S.drag = null;
    S.scene = 'battle';
    logMsg('LEVEL ' + pad3(S.level) + (isBossLevel(S.level) ? ' - BOSS WAVE!' : '') + ' - FIGHT!', '#f8d838');
    Sound.play('fight');
    Sound.music('battle');
  }

  function spawnUnit(def, star, team, r, c, hp, atk, boss) {
    const p = cellCenter(r, c);
    const u = {
      uid: uidSeq++, def, star, team, r, c, x: p.x, y: p.y, fromX: p.x, fromY: p.y, moveT: 1,
      hp, maxHp: hp, atk, range: def.range, aspd: def.aspd, mp: 0, maxMp: def.mp,
      atkCd: rand(0.15, 0.6), target: null, retarget: 0, blocked: 0,
      stun: 0, bind: 0, charm: 0, rage: 0, curse: 0, shield: 0, shieldT: 0, dots: [],
      alive: true, deadT: 0, flash: 0, lunge: 0, lx: 0, ly: 0, boss, bob: Math.random() * 6
    };
    S.units.push(u);
    S.grid[r][c] = u;
    return u;
  }

  function endBattle(win, timeout) {
    const interest = Math.min(5, Math.floor(S.gold / 10));
    const boss = isBossLevel(S.level);
    const gold = win ? 5 + Math.min(5, Math.floor(S.level / 5)) + interest + (boss ? 5 : 0) : 3 + interest;
    S.result = { win, timeout, gold, interest, boss: win && boss, life: win && boss && S.lives < MAX_LIVES };
    S.scene = 'result';
    S.resultT = 0;
    Sound.stopMusic();
    Sound.play(win ? 'victory' : 'defeat');
  }

  function applyResult() {
    const r = S.result;
    S.result = null;
    S.gold += r.gold;
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
  }

  function gameOver(cleared) {
    S.scene = 'gameover';
    S.final = { level: S.level, cleared };
    S.gameoverT = 0;
    S.sel = null;
    if (S.level > S.best) { S.best = S.level; store.set('gt_best', String(S.best)); }
    // make sure the server knows the final level before the run is cleared
    API.post('save_progress', { player_id: PID, level: S.level, gold: S.gold, lives: 0, power: S.power, state: serialize() })
      .catch(() => {})
      .then(() => clearProgress());
    store.del('gt_save');
    S.hasSave = false;
    Sound.stopMusic();
    Sound.play(cleared ? 'highscore' : 'gameover');
  }

  async function afterGameOver() {
    if (S.modal || S.final.checking) return;
    S.final.checking = true;
    const level = S.final.level;
    let list = null, online = true;
    try { list = await API.rankings(); } catch (e) { online = false; list = LocalRank.list(); }
    const qualifies = list.length < 10 || level > (list[9].level_reached | 0);
    if (qualifies) UI.showEntry(level, online);
    else UI.showRanking(list, -1, online ? '' : 'OFFLINE - LOCAL SCORES', () => toTitle());
  }

  function toTitle() {
    S.scene = 'title';
    S.units = []; S.fx = []; S.particles = []; S.floats = [];
    S.hasSave = !!store.get('gt_save');
    Sound.music('title');
  }

  // =====================================================================
  //  BATTLE ENGINE
  // =====================================================================
  const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const eu2 = (r1, c1, r2, c2) => (r1 - r2) * (r1 - r2) + (c1 - c2) * (c1 - c2);
  const effTeam = u => (u.charm > 0 ? (u.team === 'P' ? 'E' : 'P') : u.team);
  // Does `a` want to hit `b`? A charmed unit turns on its own side.
  const isHostile = (a, b) => b !== a && b.alive && b.team !== effTeam(a);
  const hostilesOf = u => S.units.filter(v => isHostile(u, v));

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

  function gainMp(u, n) { if (u.alive) u.mp = Math.min(u.maxMp, u.mp + n); }

  function heal(u, amt, show) {
    if (!u.alive || amt <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    if (show && u.hp - before >= 1) floatText('+' + fmt(u.hp - before), u.x, u.y - 28, '#70ff70');
  }

  function dealDamage(src, tgt, amount, o) {
    o = o || {};
    if (!tgt.alive) return 0;
    let dmg = o.trueDmg ? amount : amount * (tgt.curse > 0 ? 1.25 : 1) * rand(0.92, 1.08);
    if (!o.trueDmg && tgt.shield > 0) {
      const ab = Math.min(tgt.shield, dmg);
      tgt.shield -= ab; dmg -= ab;
      if (dmg <= 0) { floatText('BLOCK', tgt.x, tgt.y - 24, '#60e0f0'); return 0; }
    }
    tgt.hp -= dmg;
    tgt.flash = 0.08;
    const col = o.color || (o.skill ? '#f8d838' : tgt.team === 'P' ? '#ff7070' : '#ffffff');
    floatText(fmt(dmg), tgt.x + rand(-8, 8), tgt.y - 24, col, o.skill ? 2 : 1);
    if (!o.noMp) gainMp(tgt, 4);
    if (src && src.alive && src.def.id === 'dracula' && !o.noLifesteal && !o.dot) heal(src, dmg * 0.2, false);
    if (!o.dot) Sound.play('hit');
    if (tgt.hp <= 0) kill(tgt);
    return dmg;
  }

  function kill(u) {
    u.alive = false; u.hp = 0; u.deadT = 0;
    if (S.grid[u.r][u.c] === u) S.grid[u.r][u.c] = null;
    burst(u.x, u.y, u.team === 'P' ? '#7fd8ff' : '#ff6060', 18, 120);
    addFx({ type: 'ghost', x: u.x, y: u.y, dur: 0.9 });
    Sound.play('death');
  }

  function doAttack(u, t) {
    u.atkCd = 1 / (u.aspd * (u.rage > 0 ? 2 : 1));
    if (u.range > 1) {
      S.projectiles.push({ x: u.x, y: u.y - 10, target: t, src: u, dmg: u.atk, color: u.def.color, speed: 380 });
      Sound.play('shoot');
    } else {
      u.lunge = 0.16;
      const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
      u.lx = (t.x - u.x) / d; u.ly = (t.y - u.y) / d;
      dealDamage(u, t, u.atk);
      Sound.play('attack');
    }
    gainMp(u, 10);
  }

  function announce(u) {
    S.skillCount[u.def.id] = (S.skillCount[u.def.id] || 0) + 1;
    floatText(u.def.skill + '!', u.x, u.y - 44, u.def.color, 1, 1.1);
    logMsg((u.team === 'P' ? '' : 'FOE ') + u.def.name + ': ' + u.def.skill + '!', u.team === 'P' ? u.def.color : '#ff8080');
    addFx({ type: 'ring', x: u.x, y: u.y, color: u.def.color, dur: 0.35, r: 30 });
    Sound.play('skill');
  }

  // ---- the 10 unique active skills -----------------------------------
  function castSkill(u) {
    const foes = hostilesOf(u);
    if (!foes.length) return false;
    const t = u.target && u.target.alive && isHostile(u, u.target) ? u.target : null;
    const inRange = t && cheb(u, t) <= u.range;

    switch (u.def.id) {
      case 'dracula': { // Blood Feast
        if (!inRange) return false;
        announce(u);
        const dealt = dealDamage(u, t, u.atk * 2.5, { skill: true, noLifesteal: true, color: '#ff3030' });
        heal(u, dealt, true);
        stream(t.x, t.y, u.x, u.y, '#e03030', 14);
        Sound.play('heal');
        return true;
      }
      case 'frank': { // Electric Stun
        if (!inRange) return false;
        announce(u);
        foes.filter(v => cheb(v, t) <= 1).forEach(v => {
          addFx({ type: 'bolt', x: u.x, y: u.y - 10, x2: v.x, y2: v.y, color: '#a0f8ff', dur: 0.35 });
          dealDamage(u, v, u.atk * 1.5, { skill: true, color: '#a0f8ff' });
          if (v.alive) v.stun = Math.max(v.stun, 1.5);
        });
        S.shake = 0.25;
        Sound.play('zap');
        return true;
      }
      case 'succubus': { // Charm 3s
        const cands = foes.filter(v => cheb(u, v) <= u.range && v.charm <= 0);
        if (!cands.length) return false;
        const v = cands.reduce((a, b) => (b.atk > a.atk ? b : a));
        announce(u);
        addFx({ type: 'heart', x: v.x, y: v.y - 20, dur: 0.8 });
        stream(u.x, u.y, v.x, v.y, '#ff70d8', 10);
        dealDamage(u, v, u.atk, { skill: true, color: '#ff70d8' });
        if (v.alive) { v.charm = 3; v.target = null; floatText('CHARMED', v.x, v.y - 36, '#ff70d8'); }
        Sound.play('charm');
        return true;
      }
      case 'mummy': { // Bandage Wrap on the highest-HP foe
        const v = foes.reduce((a, b) => (b.hp > a.hp ? b : a));
        announce(u);
        addFx({ type: 'line', x: u.x, y: u.y, x2: v.x, y2: v.y, color: '#e8d8a8', dur: 0.5, w: 4 });
        dealDamage(u, v, u.atk * 1.2, { skill: true });
        if (v.alive) v.stun = Math.max(v.stun, 2.5);
        return true;
      }
      case 'werewolf': { // Blood Rage
        announce(u);
        u.rage = 4;
        heal(u, u.maxHp * 0.15, true);
        burst(u.x, u.y, '#ff4020', 14, 80);
        Sound.play('heal');
        return true;
      }
      case 'gumiho': { // Fox Orb (piercing)
        if (!inRange) return false;
        announce(u);
        const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
        S.projectiles.push({
          pierce: true, x: u.x, y: u.y - 6, vx: (t.x - u.x) / d * 420, vy: (t.y - u.y) / d * 420,
          src: u, team: effTeam(u), dmg: u.atk * 2, hit: new Set(), color: '#ffb030'
        });
        return true;
      }
      case 'jiangshi': { // Steel Talisman
        announce(u);
        u.shield = u.maxHp * 0.5; u.shieldT = 5;
        S.units.forEach(v => {
          if (v !== u && v.alive && v.team === u.team && cheb(u, v) <= 1) {
            v.shield = Math.max(v.shield, v.maxHp * 0.2); v.shieldT = 5;
            addFx({ type: 'ring', x: v.x, y: v.y, color: '#60e0f0', dur: 0.4, r: 26 });
          }
        });
        Sound.play('shield');
        return true;
      }
      case 'palcheok': { // Po-Po-Po bind + DOT
        if (!inRange) return false;
        announce(u);
        floatText('PO-PO-PO!', t.x, t.y - 50, '#9a7aff', 1);
        foes.filter(v => cheb(v, t) <= 1).forEach(v => {
          v.bind = Math.max(v.bind, 3);
          v.dots.push({ dps: u.atk * 0.8, t: 4, acc: 0, src: u });
          addFx({ type: 'chain', x: v.x, y: v.y, dur: 0.6 });
        });
        Sound.play('curse');
        return true;
      }
      case 'maiden': { // Wailing Curse on lowest HP anywhere
        const v = foes.reduce((a, b) => (b.hp < a.hp ? b : a));
        announce(u);
        addFx({ type: 'wail', x: v.x, y: v.y, dur: 0.7 });
        v.curse = 4;
        dealDamage(u, v, u.atk * 3, { skill: true, color: '#c0d0ff' });
        Sound.play('curse');
        return true;
      }
      case 'reaper': { // Death Note
        announce(u);
        const low = foes.filter(v => v.hp / v.maxHp < 0.15).sort((a, b) => a.hp - b.hp)[0];
        const v = low || foes.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
        if (!low) dealDamage(u, v, u.atk * 2.2, { skill: true, color: '#b080ff' });
        if (v.alive && v.hp / v.maxHp < 0.15) {
          addFx({ type: 'skull', x: v.x, y: v.y, dur: 0.9 });
          floatText('EXECUTE!', v.x, v.y - 44, '#ff3030', 2);
          dealDamage(u, v, v.hp + 1, { trueDmg: true, skill: true, color: '#ff3030' });
          S.shake = 0.3;
          Sound.play('execute');
        }
        return true;
      }
    }
    return false;
  }

  function updateUnit(u, dt) {
    if (u.flash > 0) u.flash -= dt;
    if (u.lunge > 0) u.lunge -= dt;
    if (u.stun > 0) u.stun -= dt;
    if (u.bind > 0) u.bind -= dt;
    if (u.rage > 0) u.rage -= dt;
    if (u.curse > 0) u.curse -= dt;
    if (u.charm > 0) { u.charm -= dt; if (u.charm <= 0) u.target = null; }
    if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }

    for (let i = u.dots.length - 1; i >= 0; i--) {
      const d = u.dots[i];
      d.t -= dt; d.acc += dt;
      while (d.acc >= 0.5) {
        d.acc -= 0.5;
        dealDamage(d.src, u, d.dps * 0.5, { noMp: true, dot: true, color: '#b89aff' });
        if (!u.alive) return;
      }
      if (d.t <= 0) u.dots.splice(i, 1);
    }

    if (u.moveT < 1) {
      u.moveT = Math.min(1, u.moveT + dt / (u.moveDur || u.def.move));
      const p = cellCenter(u.r, u.c);
      u.x = lerp(u.fromX, p.x, u.moveT);
      u.y = lerp(u.fromY, p.y, u.moveT);
      if (u.moveT < 1) return;
    }
    if (u.stun > 0) return;
    if (u.atkCd > 0) u.atkCd -= dt;
    gainMp(u, 3 * dt); // passive MP generation so blocked back-liners still cast

    u.retarget -= dt;
    if (!u.target || !isHostile(u, u.target) || u.retarget <= 0) {
      u.target = findTarget(u, false);
      u.retarget = 1;
    }
    const t = u.target;
    if (!t) return;

    if (u.mp >= u.maxMp && u.bind <= 0 && castSkill(u)) { u.mp = 0; return; }

    if (cheb(u, t) <= u.range) {
      u.blocked = 0;
      if (u.atkCd <= 0) doAttack(u, t);
    } else if (u.bind <= 0) {
      if (stepToward(u, t)) u.blocked = 0;
      else {
        u.blocked += dt;
        if (u.blocked > 0.4) {
          const alt = findTarget(u, true);
          if (alt) u.target = alt;
        }
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
      const p = S.projectiles[i];
      if (p.pierce) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.random() < 0.6) S.particles.push({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, color: '#ffe060', size: 3 });
        for (const v of S.units) {
          if (!v.alive || v.team === p.team || p.hit.has(v)) continue;
          if (Math.hypot(v.x - p.x, v.y - p.y) < 30) {
            p.hit.add(v);
            dealDamage(p.src, v, p.dmg, { skill: true, color: '#ffb030' });
            burst(v.x, v.y, '#ffb030', 6, 60);
          }
        }
        if (p.x < BOARD_X - 20 || p.x > BOARD_X + COLS * CELL_W + 20 || p.y < BOARD_Y - 20 || p.y > BOARD_Y + ROWS * CELL_H + 20) S.projectiles.splice(i, 1);
        continue;
      }
      const t = p.target;
      if (!t.alive) { S.projectiles.splice(i, 1); continue; }
      const dx = t.x - p.x, dy = (t.y - 10) - p.y, d = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (d <= stepLen + 6) {
        dealDamage(p.src, t, p.dmg);
        S.projectiles.splice(i, 1);
      } else {
        p.x += dx / d * stepLen; p.y += dy / d * stepLen;
      }
    }
  }

  function simStep(dt) {
    S.battleT += dt;
    for (const u of S.units) if (u.alive) updateUnit(u, dt);
    updateProjectiles(dt);
    let p = false, e = false;
    for (const u of S.units) if (u.alive) { if (u.team === 'P') p = true; else e = true; }
    if (!e) endBattle(true, false);
    else if (!p) endBattle(false, false);
    else if (S.battleT >= BATTLE_LIMIT) endBattle(false, true);
  }

  // =====================================================================
  //  FX
  // =====================================================================
  function addFx(f) { f.t = 0; S.fx.push(f); }
  function floatText(str, x, y, color, scale, dur) { S.floats.push({ str, x, y, color, scale: scale || 1, t: 0, dur: dur || 0.8 }); }
  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(spd * 0.3, spd);
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.3, 0.7), max: 0.7, color, size: Math.random() < 0.5 ? 2 : 3 });
    }
  }
  function stream(x1, y1, x2, y2, color, n) {
    for (let i = 0; i < n; i++) {
      const k = i / n;
      S.particles.push({ x: lerp(x1, x2, k), y: lerp(y1, y2, k) - 10, vx: (x2 - x1) * 0.8 + rand(-15, 15), vy: (y2 - y1) * 0.8 + rand(-25, 5), life: 0.25 + k * 0.25, max: 0.5, color, size: 3 });
    }
  }
  function logMsg(str, color) {
    S.log.push({ str: str.toUpperCase(), color: color || '#fff' });
    if (S.log.length > 6) S.log.shift();
  }

  function updateFx(dt) {
    for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; f.t += dt; if (f.t >= f.dur) S.fx.splice(i, 1); }
    for (let i = S.floats.length - 1; i >= 0; i--) { const f = S.floats[i]; f.t += dt; f.y -= 28 * dt; if (f.t >= f.dur) S.floats.splice(i, 1); }
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
      if (p.life <= 0) S.particles.splice(i, 1);
    }
    for (const u of S.units) if (!u.alive) u.deadT += dt;
    if (S.shake > 0) S.shake -= dt;
    if (S.msgT > 0) S.msgT -= dt;
  }

  // =====================================================================
  //  RENDERING
  // =====================================================================
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  (function paintBackground() {
    const g = bg.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0b0716'); grd.addColorStop(0.55, '#1a0f2e'); grd.addColorStop(1, '#0e0a18');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const rng = mulberry32(1234);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rng() < 0.2 ? '#7fd8ff' : '#c8c0e0';
      g.globalAlpha = 0.3 + rng() * 0.6;
      g.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 1, 1);
    }
    g.globalAlpha = 1;
    // moon
    g.fillStyle = '#f0e8c0'; g.beginPath(); g.arc(560, 120, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8d0a8'; g.fillRect(548, 110, 6, 6); g.fillRect(566, 126, 8, 5); g.fillRect(556, 132, 4, 4);
    // graveyard silhouettes
    g.fillStyle = '#120c20';
    for (let x = 0; x < W; x += 34) {
      const h = 10 + Math.floor(rng() * 16);
      g.fillRect(x + 6, 252 - h, 14, h);
      g.fillRect(x + 4, 252 - h + 4, 18, 3);
    }
    g.fillRect(0, 252, W, 8);
  })();

  function panel(x, y, w, h, fill, border) {
    ctx.fillStyle = border || '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill || '#1c1430';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  }

  function button(r, label, color, enabled, scale) {
    const hot = enabled && inRect(S.mouse, r);
    ctx.fillStyle = '#000';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = enabled ? (hot ? lighten(color) : color) : '#3a3448';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(r.x + 2, r.y + r.h - 6, r.w - 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
    const s = scale || 2;
    text(label, r.x + r.w / 2, r.y + r.h / 2 - (7 * s) / 2 - 1, enabled ? '#fff' : '#888', s, 'center');
  }
  function lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.min(255, v + 40);
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  function drawSprite(def, team, x, y, scale, opts) {
    opts = opts || {};
    const set = SPR[def.id];
    const img = opts.flash ? (team === 'E' ? set.FE : set.FP) : set[team === 'E' ? 'E' : 'P'];
    const s = 14 * scale;
    ctx.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }

  function drawStars(star, x, y, color) {
    if (star <= 1) return;
    text('*'.repeat(star), x, y, color || '#f8d838', 1, 'center');
  }

  function drawHUD() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#2a1f44';
    ctx.fillRect(0, 32, W, 2);
    text('LV ' + pad3(S.level), 8, 10, '#f8d838', 2);
    if (isBossLevel(S.level) && Math.floor(S.time * 3) % 2 === 0) text('BOSS', 8, 26, '#ff4040', 1);
    let hearts = '';
    for (let i = 0; i < S.lives; i++) hearts += '@';
    text(hearts, 112, 10, '#ff4060', 2);
    text('G ' + fmt(S.gold), 186, 10, '#f8d838', 2);
    const bc = S.scene === 'battle' || S.scene === 'result' ? S.units.filter(u => u.team === 'P' && u.alive).length : boardCount();
    text('UNIT ' + bc + '/' + playerCap(S.level), 296, 10, '#7fd8ff', 2);
    text('BEST ' + pad3(S.best), 448, 10, '#c8c0e0', 1);
    text('ALTAR ' + S.power, 448, 20, '#b080ff', 1);
    button(BTN_SOUND, Sound.isMuted() ? 'OFF' : 'SND', Sound.isMuted() ? '#60506a' : '#3050d8', true, 1);
  }

  function drawBoard() {
    const prep = S.scene === 'prep';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = BOARD_X + c * CELL_W, y = BOARD_Y + r * CELL_H;
      const mine = c < PCOLS;
      const odd = (r + c) % 2;
      ctx.fillStyle = mine ? (odd ? '#25304a' : '#2c3a58') : (odd ? '#3e2232' : '#48283a');
      ctx.fillRect(x, y, CELL_W, CELL_H);
      ctx.fillStyle = mine ? '#34446a' : '#5a3048';
      ctx.fillRect(x, y, CELL_W, 2);
      ctx.fillRect(x, y, 2, CELL_H);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + CELL_H - 2, CELL_W, 2);
    }
    // divider
    ctx.fillStyle = '#000';
    ctx.fillRect(BOARD_X + PCOLS * CELL_W - 1, BOARD_Y, 2, ROWS * CELL_H);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, COLS * CELL_W + 2, ROWS * CELL_H + 2);

    if (prep && (S.drag && S.drag.active || S.sel && S.sel.kind === 'roster')) {
      const p = S.drag && S.drag.active ? S.drag : null;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < PCOLS; c++) {
        const x = BOARD_X + c * CELL_W, y = BOARD_Y + r * CELL_H;
        const hot = p && cellAt(p) && cellAt(p).r === r && cellAt(p).c === c;
        ctx.strokeStyle = hot ? '#f8d838' : 'rgba(127,216,255,' + (0.25 + 0.2 * Math.sin(S.time * 6)) + ')';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
      }
    }
  }

  function drawBars(x, y, hp, maxHp, mp, maxMp, shield, team) {
    const w = 44, bx = Math.round(x - w / 2), by = Math.round(y);
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 1, by - 1, w + 2, 9);
    const k = clamp(hp / maxHp, 0, 1);
    ctx.fillStyle = '#401010';
    ctx.fillRect(bx, by, w, 4);
    ctx.fillStyle = team === 'P' ? (k > 0.3 ? '#40d040' : '#e0c020') : '#e83838';
    ctx.fillRect(bx, by, Math.ceil(w * k), 4);
    if (shield > 0) {
      ctx.fillStyle = '#d0f8ff';
      ctx.fillRect(bx, by, Math.ceil(w * clamp(shield / maxHp, 0, 1)), 2);
    }
    ctx.fillStyle = '#101838';
    ctx.fillRect(bx, by + 5, w, 2);
    ctx.fillStyle = mp >= maxMp ? '#ffffff' : '#4a8cff';
    ctx.fillRect(bx, by + 5, Math.ceil(w * clamp(mp / maxMp, 0, 1)), 2);
  }

  function drawBattleUnit(u) {
    if (!u.alive && u.deadT > 0.35) return;
    const bob = Math.sin(S.time * 4 + u.bob) * 2;
    let x = u.x, y = u.y + bob;
    if (u.lunge > 0) { const k = Math.sin((u.lunge / 0.16) * Math.PI) * 10; x += u.lx * k; y += u.ly * k; }
    if (u.stun > 0) x += Math.sin(S.time * 50) * 1.5;
    // ground shadow / team ring
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(Math.round(u.x - 18), Math.round(u.y + 22), 36, 5);
    ctx.fillStyle = u.team === 'P' ? '#2a7ab0' : '#a02a2a';
    ctx.fillRect(Math.round(u.x - 14), Math.round(u.y + 23), 28, 3);

    ctx.save();
    if (!u.alive) ctx.globalAlpha = Math.max(0, 1 - u.deadT / 0.35);
    else if (u.charm > 0) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(S.time * 12);
    const sc = u.boss ? 5 : 4;
    drawSprite(u.def, u.team, x, y, sc, { flash: u.flash > 0 });
    if (u.rage > 0) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff2000'; ctx.fillRect(x - 22, y - 26, 44, 50); }
    ctx.restore();
    if (!u.alive) return;

    if (u.shield > 0) {
      ctx.strokeStyle = 'rgba(96,224,240,' + (0.5 + 0.3 * Math.sin(S.time * 8)) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(x - 26), Math.round(y - 30), 52, 56);
    }
    drawBars(u.x, u.y - 36 - (u.boss ? 6 : 0), u.hp, u.maxHp, u.mp, u.maxMp, u.shield, u.team);
    drawStars(u.star, u.x, u.y + 18, '#f8d838');
    if (u.boss) text('BOSS', u.x, u.y - 48, '#ff4040', 1, 'center');

    // status icons
    let ix = u.x - 20;
    const icon = (s, col) => { text(s, ix, u.y - 26, col, 1); ix += 8; };
    if (u.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = S.time * 6 + i * 2.1;
        ctx.fillStyle = '#f8d838';
        ctx.fillRect(Math.round(u.x + Math.cos(a) * 14 - 1), Math.round(y - 30 + Math.sin(a) * 4), 3, 3);
      }
    }
    if (u.charm > 0) icon('@', '#ff70d8');
    if (u.curse > 0) icon('!', '#c0d0ff');
    if (u.bind > 0) icon('#', '#9a7aff');
    if (u.dots.length) icon('%', '#b89aff');
    if (S.sel && S.sel.kind === 'unit' && S.sel.u === u) {
      ctx.strokeStyle = '#f8d838'; ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(u.x - 30), Math.round(u.y - 34), 60, 64);
    }
  }

  function drawPrepUnits() {
    // enemy preview (deterministic wave for this level)
    S.wave.forEach(e => {
      const p = cellCenter(e.r, e.c);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.1 * Math.sin(S.time * 2 + e.r + e.c);
      drawSprite(e.def, 'E', p.x, p.y + Math.sin(S.time * 3 + e.c) * 2, e.boss ? 5 : 4);
      ctx.restore();
      if (e.boss) text('BOSS', p.x, p.y - 44, '#ff4040', 1, 'center');
      if (S.sel && S.sel.kind === 'wave' && S.sel.e === e) {
        ctx.strokeStyle = '#ff6060'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 30, p.y - 34, 60, 64);
      }
    });
    text('NEXT WAVE', BOARD_X + PCOLS * CELL_W + 6, BOARD_Y + 4, 'rgba(255,140,140,0.8)', 1);

    S.roster.forEach(u => {
      if (u.loc !== 'board' || (S.drag && S.drag.active && S.drag.u === u)) return;
      const p = cellCenter(u.r, u.c);
      const d = GMAP[u.id];
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(p.x - 18, p.y + 22, 36, 5);
      drawSprite(d, 'P', p.x, p.y + Math.sin(S.time * 3 + u.uid) * 2, 4);
      drawStars(u.star, p.x, p.y + 18);
      if (S.sel && S.sel.u === u) {
        ctx.strokeStyle = '#f8d838'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 30, p.y - 34, 60, 64);
      }
    });
  }

  function drawBench() {
    text('BENCH', 8, BENCH_Y + 4, '#7fd8ff', 1);
    text(S.roster.filter(u => u.loc === 'bench').length + '/' + BENCH_N, 8, BENCH_Y + 14, '#7fd8ff', 1);
    for (let i = 0; i < BENCH_N; i++) {
      const x = BENCH_X + i * SLOT_GAP, y = BENCH_Y;
      const hot = S.drag && S.drag.active && slotAt(S.drag) === i;
      panel(x, y, SLOT_W, SLOT_H, hot ? '#3a2e58' : '#161024', hot ? '#f8d838' : '#000');
      const u = rosterAtSlot(i);
      if (u && !(S.drag && S.drag.active && S.drag.u === u)) {
        drawSprite(GMAP[u.id], 'P', x + SLOT_W / 2, y + SLOT_H / 2 - 2, 3);
        drawStars(u.star, x + SLOT_W / 2, y + SLOT_H - 11);
        if (S.sel && S.sel.u === u) {
          ctx.strokeStyle = '#f8d838'; ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, SLOT_W - 2, SLOT_H - 2);
        }
      }
    }
  }

  function drawShop() {
    const dragging = S.drag && S.drag.active;
    for (let i = 0; i < SHOP_N; i++) {
      const x = SHOP_X + i * CARD_GAP, y = SHOP_Y;
      const id = S.shop[i];
      if (!id) {
        panel(x, y, CARD_W, CARD_H, '#120c1e', '#000');
        text('SOLD', x + CARD_W / 2, y + CARD_H / 2 - 3, '#4a3a64', 1, 'center');
        continue;
      }
      const d = GMAP[id];
      const afford = S.gold >= d.cost;
      const merge = countCopies(id, 1) >= 2;
      const hot = inRect(S.mouse, { x, y, w: CARD_W, h: CARD_H });
      const border = merge && Math.floor(S.time * 4) % 2 === 0 ? '#f8d838' : COST_COLOR[d.cost];
      panel(x, y, CARD_W, CARD_H, hot && afford ? '#2c2244' : '#1c1430', border);
      ctx.fillStyle = border; ctx.fillRect(x + 2, y + 2, CARD_W - 4, 2);
      ctx.save();
      if (!afford) ctx.globalAlpha = 0.4;
      drawSprite(d, 'P', x + CARD_W / 2, y + 40, 4);
      ctx.restore();
      text(d.name.length > 14 ? d.name.slice(0, 14) : d.name, x + CARD_W / 2, y + 76, '#fff', 1, 'center');
      text(d.origin === 'W' ? 'WESTERN' : 'EASTERN', x + CARD_W / 2, y + 88, d.origin === 'W' ? '#ff9a9a' : '#9adfff', 1, 'center');
      const roleLines = wrap(d.role, 14);
      roleLines.forEach((ln, k) => text(ln, x + CARD_W / 2, y + 100 + k * 9, '#a8a0c0', 1, 'center'));
      text(d.cost + 'G', x + CARD_W / 2, y + CARD_H - 18, afford ? '#f8d838' : '#806020', 2, 'center');
      if (merge) text('3X!', x + CARD_W - 6, y + 8, '#f8d838', 1, 'right');
    }
    if (dragging) {
      ctx.fillStyle = 'rgba(160,20,20,0.55)';
      ctx.fillRect(SHOP_X - 4, SHOP_Y - 4, BTN_REROLL.x - SHOP_X, CARD_H + 8);
      text('DROP HERE TO SELL +' + sellValue(S.drag.u) + 'G', (BTN_REROLL.x + SHOP_X) / 2 - 4, SHOP_Y + CARD_H / 2 - 7, '#fff', 2, 'center');
    }
    button(BTN_REROLL, 'REROLL ' + REROLL_COST + 'G', '#3050d8', S.gold >= REROLL_COST);
    button(BTN_ALTAR, 'ALTAR ' + altarCost() + 'G', '#7a3aa8', S.gold >= altarCost());
    button(BTN_FIGHT, 'FIGHT!', '#d03030', boardCount() > 0, 3);
  }

  function drawBattlePanel() {
    panel(SHOP_X, SHOP_Y, BTN_REROLL.x - SHOP_X - 6, CARD_H, '#120c1e', '#000');
    text('BATTLE LOG', SHOP_X + 8, SHOP_Y + 8, '#7fd8ff', 1);
    S.log.forEach((l, i) => text(l.str.slice(0, 76), SHOP_X + 8, SHOP_Y + 24 + i * 12, l.color, 1));
    // team strength bars
    const sum = team => S.units.filter(u => u.team === team && u.alive).reduce((a, u) => a + u.hp, 0);
    const max = team => S.units.filter(u => u.team === team).reduce((a, u) => a + u.maxHp, 0) || 1;
    const bar = (label, y, k, col) => {
      text(label, SHOP_X + 8, y, '#fff', 1);
      ctx.fillStyle = '#000'; ctx.fillRect(SHOP_X + 50, y - 1, 410, 9);
      ctx.fillStyle = col; ctx.fillRect(SHOP_X + 51, y, Math.ceil(408 * clamp(k, 0, 1)), 7);
    };
    bar('ALLY', SHOP_Y + 104, sum('P') / max('P'), '#40c0ff');
    bar('FOES', SHOP_Y + 120, sum('E') / max('E'), '#ff4848');

    button(BTN_SPEED, 'SPEED X' + S.speed, '#3050d8', S.scene === 'battle');
    panel(BTN_ALTAR.x, BTN_ALTAR.y, BTN_ALTAR.w, BTN_ALTAR.h + 70, '#120c1e', '#000');
    const left = Math.max(0, Math.ceil(BATTLE_LIMIT - S.battleT));
    text('TIME', BTN_ALTAR.x + BTN_ALTAR.w / 2, BTN_ALTAR.y + 12, '#a8a0c0', 1, 'center');
    text(String(left), BTN_ALTAR.x + BTN_ALTAR.w / 2, BTN_ALTAR.y + 28, left <= 10 ? '#ff4040' : '#fff', 4, 'center');
    text('AUTO BATTLE', BTN_ALTAR.x + BTN_ALTAR.w / 2, BTN_ALTAR.y + 72, '#7fd8ff', 1, 'center');
    text('TAP UNIT = INFO', BTN_ALTAR.x + BTN_ALTAR.w / 2, BTN_ALTAR.y + 84, '#6a6080', 1, 'center');
  }

  function drawSynergy() {
    panel(SYN.x, SYN.y, SYN.w, SYN.h);
    const list = S.scene === 'prep' ? S.roster.filter(u => u.loc === 'board') : S.units.filter(u => u.team === 'P');
    const s = synergy(list);
    let y = SYN.y + 8;
    const x = SYN.x + 6;
    text('SYNERGY', x, y, '#f8d838', 1); y += 14;
    text('WEST ' + s.w + '/4', x, y, '#ff9a9a', 1); y += 10;
    text(s.w >= 4 ? '+35% HP' : s.w >= 2 ? '+15% HP' : '2: +HP', x, y, s.w >= 2 ? '#fff' : '#6a6080', 1); y += 14;
    text('EAST ' + s.e + '/4', x, y, '#9adfff', 1); y += 10;
    text(s.e >= 4 ? '+35% ATK' : s.e >= 2 ? '+15% ATK' : '2: +ATK', x, y, s.e >= 2 ? '#fff' : '#6a6080', 1); y += 16;
    text('ALTAR', x, y, '#b080ff', 1); y += 10;
    text('LV ' + S.power, x, y, '#fff', 1); y += 10;
    text('X' + powerMul().toFixed(2), x, y, '#fff', 1); y += 16;
    text('FOE X', x, y, '#ff8080', 1); y += 10;
    const m = levelMultipliers(S.level);
    const mf = v => (v < 100 ? v.toFixed(2) : fmt(v));
    text('HP ' + mf(m.hp * ENEMY_BASE), x, y, '#fff', 1); y += 10;
    text('AT ' + mf(m.atk * ENEMY_BASE), x, y, '#fff', 1); y += 16;
    text('NEXT', x, y, '#a8a0c0', 1); y += 10;
    text(isBossLevel(S.level) ? 'BOSS!' : 'BOSS ' + pad3(Math.ceil(S.level / 10) * 10), x, y, isBossLevel(S.level) ? '#ff4040' : '#a8a0c0', 1);
  }

  function drawInfo() {
    panel(INFO.x, INFO.y, INFO.w, INFO.h);
    let def = null, star = 1, live = null, hp = 0, atk = 0, roster = null, enemy = false;
    const sel = S.drag && S.drag.active ? { kind: 'roster', u: S.drag.u } : S.sel;
    if (sel && sel.kind === 'roster' && S.roster.indexOf(sel.u) >= 0) {
      roster = sel.u; def = GMAP[roster.id]; star = roster.star;
      const st = playerStats(roster.id, star, synergy(S.roster.filter(u => u.loc === 'board')));
      hp = st.hp; atk = st.atk;
    } else if (sel && sel.kind === 'unit') {
      live = sel.u; def = live.def; star = live.star; hp = live.maxHp; atk = live.atk; enemy = live.team === 'E';
    } else if (sel && sel.kind === 'wave') {
      def = sel.e.def; enemy = true;
      const st = enemyStats(def, S.level, sel.e.boss); hp = st.hp; atk = st.atk;
    } else if (S.hover != null && S.shop[S.hover]) {
      def = GMAP[S.shop[S.hover]];
      const st = playerStats(def.id, 1, { hp: 1, atk: 1 }); hp = st.hp; atk = st.atk;
    }
    const x = INFO.x + 5;
    let y = INFO.y + 7;
    if (!def) {
      text('INFO', x, y, '#f8d838', 1); y += 14;
      ['TAP A GHOST', 'TO INSPECT.', '', 'DRAG OR TAP', 'THEN TAP A', 'CELL TO', 'DEPLOY.', '', '3 SAME =', 'STAR UP!'].forEach(l => { text(l, x, y, '#a8a0c0', 1); y += 10; });
      return;
    }
    text(def.name.slice(0, 12), x, y, enemy ? '#ff8080' : '#fff', 1); y += 10;
    text((enemy ? 'FOE ' : '') + (star > 1 ? '*'.repeat(star) : def.origin === 'W' ? 'WEST' : 'EAST'), x, y, enemy ? '#ff6060' : '#f8d838', 1); y += 12;
    text('HP ' + (live ? fmt(live.hp) + '/' : '') + fmt(hp), x, y, '#70ff70', 1); y += 10;
    text('ATK ' + fmt(atk), x, y, '#ff9a60', 1); y += 10;
    text('RANGE ' + def.range, x, y, '#a8a0c0', 1); y += 10;
    text('ASPD ' + def.aspd, x, y, '#a8a0c0', 1); y += 10;
    text('MP ' + (live ? Math.floor(live.mp) + '/' : '') + def.mp, x, y, '#4a8cff', 1); y += 13;
    const skillLines = wrap(def.skill, 11);
    skillLines.forEach(l => { text(l, x, y, def.color, 1); y += 9; });
    y += 2;
    wrap(def.desc, 11).slice(0, (roster ? 8 : 10) - skillLines.length).forEach(l => { text(l, x, y, '#c8c0e0', 1); y += 9; });
    if (roster && S.scene === 'prep') button(BTN_SELL, 'SELL ' + sellValue(roster) + 'G', '#a03030', true, 1);
  }

  function drawFx() {
    for (const f of S.fx) {
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      switch (f.type) {
        case 'ring':
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.x, f.y, 6 + f.r * k, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'bolt': {
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          for (let i = 1; i < 6; i++) ctx.lineTo(lerp(f.x, f.x2, i / 6) + rand(-8, 8), lerp(f.y, f.y2, i / 6) + rand(-8, 8));
          ctx.lineTo(f.x2, f.y2); ctx.stroke();
          break;
        }
        case 'line':
          ctx.strokeStyle = f.color; ctx.lineWidth = f.w || 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.fillStyle = f.color;
          for (let i = 0; i < 4; i++) ctx.fillRect(f.x2 - 22, f.y2 - 18 + i * 10, 44, 3);
          break;
        case 'heart':
          text('@', f.x, f.y - 20 * k, '#ff70d8', 3, 'center');
          break;
        case 'chain':
          ctx.strokeStyle = '#9a7aff'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(f.x, f.y - 6 + i * 10, 24, 6, 0, 0, Math.PI * 2); ctx.stroke(); }
          break;
        case 'wail':
          ctx.strokeStyle = '#c0d0ff'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(f.x, f.y, 10 + (k * 40 + i * 12) % 48, 0, Math.PI * 2); ctx.stroke(); }
          break;
        case 'skull':
          text('X', f.x, f.y - 30 - 10 * k, '#ff3030', 5, 'center');
          break;
        case 'ghost':
          ctx.fillStyle = '#e0e8ff';
          ctx.globalAlpha = 0.6 * (1 - k);
          ctx.fillRect(f.x - 6, f.y - 10 - 50 * k, 12, 12);
          ctx.fillRect(f.x - 8, f.y - 4 - 50 * k, 16, 8);
          ctx.fillStyle = '#000';
          ctx.fillRect(f.x - 4, f.y - 6 - 50 * k, 2, 2); ctx.fillRect(f.x + 2, f.y - 6 - 50 * k, 2, 2);
          break;
      }
      ctx.restore();
    }
    for (const p of S.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of S.projectiles) {
      ctx.fillStyle = '#000';
      if (p.pierce) {
        ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
        ctx.fillStyle = p.color; ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      } else {
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
        ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
    }
    for (const f of S.floats) {
      ctx.globalAlpha = clamp(1.4 - f.t / f.dur, 0, 1);
      text(f.str, f.x, f.y, f.color, f.scale, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawDrag() {
    if (!S.drag || !S.drag.active) return;
    const d = GMAP[S.drag.u.id];
    ctx.save();
    ctx.globalAlpha = 0.85;
    drawSprite(d, 'P', S.drag.x, S.drag.y - 10, 4);
    ctx.restore();
    drawStars(S.drag.u.star, S.drag.x, S.drag.y + 10);
  }

  function drawMsg() {
    if (S.msgT <= 0 || !S.msg) return;
    ctx.globalAlpha = clamp(S.msgT, 0, 1);
    const w = S.msg.length * 12 + 24;
    panel(W / 2 - w / 2, 136, w, 30, '#2a0c18', '#f8d838');
    text(S.msg, W / 2, 144, '#fff', 2, 'center');
    ctx.globalAlpha = 1;
  }

  function drawResult() {
    const r = S.result;
    if (!r) return;
    const k = Math.min(1, S.resultT * 3);
    ctx.fillStyle = 'rgba(0,0,0,' + 0.5 * k + ')';
    ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL_W, ROWS * CELL_H);
    panel(170, 82, 300, 140, '#1c1430', r.win ? '#f8d838' : '#e03030');
    const title = r.win ? (S.level >= MAX_LEVEL ? 'ALL CLEAR!' : 'VICTORY!') : r.timeout ? 'TIME UP!' : 'DEFEAT';
    text(title, W / 2, 96, r.win ? '#f8d838' : '#ff4040', 4, 'center');
    text('+' + r.gold + ' GOLD' + (r.interest ? ' (INT ' + r.interest + ')' : ''), W / 2, 136, '#f8d838', 2, 'center');
    if (r.win) text(r.boss ? (r.life ? 'BOSS SLAIN! +1 LIFE' : 'BOSS SLAIN! +5 GOLD') : 'NEXT: LEVEL ' + pad3(Math.min(MAX_LEVEL, S.level + 1)), W / 2, 162, '#7fd8ff', 1, 'center');
    else text(S.lives - 1 > 0 ? 'LIFE LOST - ' + (S.lives - 1) + ' LEFT' : 'NO LIVES LEFT...', W / 2, 162, '#ff8080', 1, 'center');
    if (S.resultT > 0.8 && Math.floor(S.time * 2) % 2 === 0) text('TAP TO CONTINUE', W / 2, 196, '#fff', 1, 'center');
  }

  // ---- title -------------------------------------------------------
  const TITLE_BTNS = {
    start: { x: 220, y: 262, w: 200, h: 34 },
    cont: { x: 220, y: 302, w: 200, h: 34 },
    rank: { x: 220, y: 342, w: 200, h: 34 },
    sound: { x: 220, y: 382, w: 200, h: 34 }
  };

  function drawTitle() {
    ctx.drawImage(bg, 0, 0);
    const wob = Math.sin(S.time * 2) * 3;
    text('GHOST-TACTICS', W / 2 + 3, 50 + wob + 3, '#5a1030', 4, 'center', false);
    text('GHOST-TACTICS', W / 2, 50 + wob, '#f8d838', 4, 'center');
    text('RETRO AUTO-BATTLER  - 999 LEVELS OF THE NIGHT -', W / 2, 92, '#ff70d8', 1, 'center');
    GHOSTS.forEach((g, i) => {
      const x = 46 + i * 61, y = 160 + Math.sin(S.time * 3 + i * 0.7) * 6;
      drawSprite(g, i < 5 ? 'P' : 'E', x, y, 3);
      text(g.name.split(/[ -]/)[0].slice(0, 9), x, 192, g.origin === 'W' ? '#ff9a9a' : '#9adfff', 1, 'center');
    });
    text('WESTERN LEGENDS', 168, 122, '#ff9a9a', 1, 'center');
    text('EASTERN SPIRITS', 472, 122, '#9adfff', 1, 'center');
    text('BEST LEVEL ' + pad3(S.best), W / 2, 222, '#c8c0e0', 2, 'center');

    button(TITLE_BTNS.start, 'NEW GAME', '#d03030', true);
    button(TITLE_BTNS.cont, 'CONTINUE', '#3050d8', S.hasSave);
    button(TITLE_BTNS.rank, 'RANKING', '#7a3aa8', true);
    button(TITLE_BTNS.sound, Sound.isMuted() ? 'SOUND: OFF' : 'SOUND: ON', '#2a6a3a', true);

    text('BUY GHOSTS - DEPLOY ON THE LEFT - FIGHT! 3 COPIES MERGE INTO A STAR.', W / 2, 432, '#a8a0c0', 1, 'center');
    text('WEST/EAST SYNERGIES - ALTAR POWER-UPS - BOSS EVERY 10 LEVELS', W / 2, 444, '#a8a0c0', 1, 'center');
    if (Math.floor(S.time * 2) % 2 === 0) text('PC: MOUSE + KEYS (F=FIGHT R=REROLL M=MUTE)  MOBILE: TOUCH', W / 2, 462, '#6a6080', 1, 'center');
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.8, S.gameoverT) + ')';
    ctx.fillRect(0, 0, W, H);
    const f = S.final;
    if (f.cleared) {
      text('CONGRATULATIONS!', W / 2, 140, '#f8d838', 3, 'center');
      text('ALL 999 LEVELS CLEARED', W / 2, 180, '#7fd8ff', 2, 'center');
    } else {
      text('GAME OVER', W / 2, 140, Math.floor(S.time * 3) % 2 ? '#ff4040' : '#a01818', 5, 'center');
    }
    text('LEVEL REACHED ' + pad3(f.level), W / 2, 220, '#fff', 2, 'center');
    if (S.gameoverT > 1.5 && !S.modal && Math.floor(S.time * 2) % 2 === 0) text('TAP TO CONTINUE', W / 2, 270, '#f8d838', 2, 'center');
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.scene === 'title') { drawTitle(); drawMsg(); return; }

    ctx.drawImage(bg, 0, 0);
    if (S.shake > 0) ctx.setTransform(1, 0, 0, 1, Math.round(rand(-3, 3)), Math.round(rand(-3, 3)));
    drawBoard();
    if (S.scene === 'prep') drawPrepUnits();
    else {
      const sorted = S.units.slice().sort((a, b) => a.y - b.y);
      sorted.forEach(drawBattleUnit);
    }
    drawFx();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    drawHUD();
    drawSynergy();
    drawInfo();
    drawBench();
    if (S.scene === 'prep') drawShop();
    else drawBattlePanel();
    if (S.scene === 'result') drawResult();
    if (S.scene === 'gameover') drawGameOver();
    drawDrag();
    drawMsg();
  }

  // =====================================================================
  //  MAIN LOOP
  // =====================================================================
  const STEP = 1 / 60;
  let acc = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    S.time += dt;
    if (S.scene === 'battle') {
      acc += dt * S.speed;
      let n = 0;
      while (acc >= STEP && n < 12 && S.scene === 'battle') { simStep(STEP); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
      updateFx(dt * S.speed);
    } else {
      acc = 0;
      updateFx(dt);
    }
    if (S.scene === 'result') {
      S.resultT += dt;
      if (S.resultT > 3.2) applyResult();
    }
    if (S.scene === 'gameover') S.gameoverT += dt;
    render();
    requestAnimationFrame(frame);
  }

  // =====================================================================
  //  INPUT  (touchstart / touchmove / touchend + mousedown fallbacks)
  // =====================================================================
  function toCanvas(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) };
  }

  function rosterAtPoint(p) {
    const cell = cellAt(p);
    if (cell) return rosterAtCell(cell.r, cell.c);
    const s = slotAt(p);
    return s >= 0 ? rosterAtSlot(s) : null;
  }

  function onDown(p) {
    Sound.unlock();
    S.mouse = p;
    if (S.modal) return;

    if (inRect(p, BTN_SOUND) && S.scene !== 'title') { Sound.toggleMute(); Sound.play('click'); return; }

    switch (S.scene) {
      case 'title':
        if (inRect(p, TITLE_BTNS.start)) { Sound.play('select'); newGame(); }
        else if (inRect(p, TITLE_BTNS.cont) && S.hasSave) { Sound.play('select'); continueGame(); }
        else if (inRect(p, TITLE_BTNS.rank)) { Sound.play('select'); openRanking(); }
        else if (inRect(p, TITLE_BTNS.sound)) { Sound.toggleMute(); Sound.play('click'); }
        else Sound.music('title');
        return;

      case 'prep': {
        if (S.sel && S.sel.kind === 'roster' && inRect(p, BTN_SELL)) { sell(S.sel.u); return; }
        if (inRect(p, BTN_REROLL)) { reroll(); return; }
        if (inRect(p, BTN_ALTAR)) { altar(); return; }
        if (inRect(p, BTN_FIGHT)) { startBattle(); return; }
        const ci = cardAt(p);
        if (ci >= 0) { buy(ci); return; }
        const u = rosterAtPoint(p);
        if (u) { S.drag = { u, sx: p.x, sy: p.y, x: p.x, y: p.y, active: false }; return; }
        // tap-to-place: selected unit + tap on empty cell/slot
        if (S.sel && S.sel.kind === 'roster' && (cellAt(p) || slotAt(p) >= 0)) {
          const cell = cellAt(p);
          if (cell && cell.c >= PCOLS) {
            const e = S.wave.find(w => w.r === cell.r && w.c === cell.c);
            if (e) { S.sel = { kind: 'wave', e }; Sound.play('select'); return; }
          }
          dropAt(S.sel.u, p);
          return;
        }
        const cell = cellAt(p);
        if (cell) {
          const e = S.wave.find(w => w.r === cell.r && w.c === cell.c);
          if (e) { S.sel = { kind: 'wave', e }; Sound.play('select'); return; }
        }
        S.sel = null;
        return;
      }

      case 'battle':
      case 'result': {
        if (S.scene === 'battle' && inRect(p, BTN_SPEED)) { S.speed = S.speed >= 3 ? 1 : S.speed + 1; Sound.play('click'); return; }
        if (S.scene === 'result' && S.resultT > 0.4) { applyResult(); return; }
        let best = null, bd = 34;
        for (const u of S.units) {
          if (!u.alive) continue;
          const d = Math.hypot(u.x - p.x, u.y - p.y);
          if (d < bd) { bd = d; best = u; }
        }
        S.sel = best ? { kind: 'unit', u: best } : null;
        if (best) Sound.play('select');
        return;
      }

      case 'gameover':
        if (S.gameoverT > 1.5) afterGameOver();
        return;
    }
  }

  function onMove(p) {
    S.mouse = p;
    if (S.scene === 'prep') S.hover = cardAt(p) >= 0 ? cardAt(p) : null;
    if (!S.drag) return;
    S.drag.x = p.x; S.drag.y = p.y;
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
    if (d.active) {
      dropAt(d.u, p);
    } else {
      // a tap on a unit toggles selection
      if (S.sel && S.sel.u === d.u) S.sel = null;
      else { S.sel = { kind: 'roster', u: d.u }; Sound.play('select'); }
    }
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onDown(toCanvas(t.clientX, t.clientY));
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onMove(toCanvas(t.clientX, t.clientY));
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = toCanvas(t.clientX, t.clientY);
    onUp(p);
    S.mouse = { x: -1, y: -1 }; // no hover state on touch
    S.hover = null;
  }, { passive: false });
  canvas.addEventListener('touchcancel', () => { S.drag = null; }, { passive: true });

  canvas.addEventListener('mousedown', e => { if (e.button === 0) onDown(toCanvas(e.clientX, e.clientY)); });
  window.addEventListener('mousemove', e => onMove(toCanvas(e.clientX, e.clientY)));
  window.addEventListener('mouseup', e => { if (e.button === 0) onUp(toCanvas(e.clientX, e.clientY)); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (S.modal) { UI.onKey(e); return; }
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.toggleMute(); return; }
    if (S.scene === 'title' && (k === 'enter' || k === ' ')) { newGame(); e.preventDefault(); return; }
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
      if (k === ' ' || k === 'enter') { applyResult(); e.preventDefault(); }
    } else if (S.scene === 'gameover' && S.gameoverT > 1.5 && (k === ' ' || k === 'enter')) {
      afterGameOver(); e.preventDefault();
    }
  });

  // =====================================================================
  //  ARCADE MODALS (DOM): initials entry + leaderboard
  // =====================================================================
  const $ = id => document.getElementById(id);
  const UI = (() => {
    const overlay = $('overlay'), entryModal = $('entryModal'), rankModal = $('rankModal');
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

    function open(which) {
      S.modal = true;
      overlay.classList.remove('hidden');
      entryModal.classList.toggle('hidden', which !== 'entry');
      rankModal.classList.toggle('hidden', which !== 'rank');
    }
    function close() {
      overlay.classList.add('hidden');
      entryModal.classList.add('hidden');
      rankModal.classList.add('hidden');
      S.modal = false;
    }

    function showEntry(lvl, isOnline) {
      level = lvl; online = isOnline;
      letters = ['A', 'A', 'A']; idx = 0; busy = false;
      $('entryLevel').textContent = pad3(lvl);
      err.textContent = isOnline ? '' : 'OFFLINE: SCORE WILL BE SAVED LOCALLY';
      submitBtn.disabled = false;
      input.value = '';
      open('entry');
      paint();
      Sound.play('highscore');
    }

    async function submit() {
      if (busy) return;
      const initial = letters.join('');
      if (!/^[A-Z]{3}$/.test(initial)) { err.textContent = 'EXACTLY 3 LETTERS A-Z'; Sound.play('error'); return; }
      busy = true; submitBtn.disabled = true; err.textContent = 'SAVING...';
      try {
        if (!online) throw new Error('OFFLINE');
        const j = await API.post('submit_score', { initial, level });
        Sound.play('merge');
        showRanking(j.rankings, j.top10 ? j.id : -1, j.top10 ? 'YOU ARE RANK #' + j.rank + '!' : 'RANK #' + j.rank, toTitle);
      } catch (e) {
        if (e.message === 'INVALID_INITIAL') {
          err.textContent = 'INVALID INITIALS (A-Z ONLY)'; busy = false; submitBtn.disabled = false; Sound.play('error'); return;
        }
        const rank = LocalRank.add(initial, level);
        const why = e.message === 'OFFLINE' || e.message === 'DB_UNAVAILABLE' || e.message === 'BAD_RESPONSE' || /^HTTP_|fetch/i.test(e.message)
          ? 'SERVER OFFLINE - SAVED LOCALLY' : 'NOT ACCEPTED (' + e.message + ') - SAVED LOCALLY';
        showRanking(LocalRank.list(), -1, why + (rank ? ' (#' + rank + ')' : ''), toTitle, rank);
      }
    }

    function showRanking(list, highlightId, status, cb, highlightRank) {
      onRankClose = cb || null;
      const body = $('rankBody');
      body.textContent = '';
      if (!list || !list.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4; td.textContent = 'NO SCORES YET - BE THE FIRST!';
        tr.appendChild(td); body.appendChild(tr);
      } else {
        list.slice(0, 10).forEach((r, i) => {
          const tr = document.createElement('tr');
          if ((highlightId > 0 && r.id === highlightId) || (highlightRank && highlightRank === i + 1)) tr.className = 'me';
          [String(i + 1).padStart(2, '0'), r.initial, pad3(r.level_reached), r.created_at || ''].forEach(v => {
            const td = document.createElement('td');
            td.textContent = v; // textContent: never inject HTML
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

    return { showEntry, showRanking, onKey };
  })();

  async function openRanking() {
    UI.showRanking([], -1, 'LOADING...', null);
    try {
      const list = await API.rankings();
      UI.showRanking(list, -1, 'ONLINE LEADERBOARD', null);
    } catch (e) {
      UI.showRanking(LocalRank.list(), -1, 'SERVER OFFLINE - LOCAL SCORES', null);
    }
  }

  // =====================================================================
  //  BOOT
  // =====================================================================
  // Pixel-perfect upscaling, but smooth when the canvas is shown smaller
  // than 1:1 in device pixels (nearest-neighbour would drop pixel rows).
  function fitRendering() {
    const r = canvas.getBoundingClientRect();
    canvas.style.imageRendering = r.width * (window.devicePixelRatio || 1) >= W ? 'pixelated' : 'auto';
  }
  window.addEventListener('resize', fitRendering);
  window.addEventListener('orientationchange', () => setTimeout(fitRendering, 200));
  fitRendering();

  S.hasSave = !!store.get('gt_save');
  refreshShop();
  Sound.music('title'); // starts after the first user gesture (autoplay policy)

  // Debug / test hook (read-only helpers).
  window.GhostTactics = {
    levelMultipliers, enemyStats: (id, L) => enemyStats(GMAP[id], L, false), genWave: L => genWave(L).map(e => ({ id: e.def.id, r: e.r, c: e.c, boss: e.boss })),
    setLevel: L => { S.level = clamp(L | 0, 1, MAX_LEVEL); S.wave = genWave(S.level); },
    state: S
  };

  requestAnimationFrame(frame);
})();
