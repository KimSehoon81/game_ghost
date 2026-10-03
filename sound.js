/*
 * Ghost-Tactics :: sound.js
 * MSX / AY-3-8910 (PSG) style synthesizer built on the Web Audio API.
 * Square-wave tone channels (lead, bass, arpeggio) + an LFSR noise channel
 * for drums. Every note and effect is generated at runtime: 0 KB of audio.
 *
 * Sound.unlock()                  call on a user gesture (autoplay policy)
 * Sound.play(name, {pitch, tier}) pitch: semitone offset; tier: streak level
 * Sound.music(mood, zone, boss)   mood title|prep|battle; zone graveyard|castle|forest|oriental|hell
 * Sound.duck(level, ms)           music x level for ms (ms <= 0 restores now)
 * Sound.stopMusic() · toggleMute() · setMuted(b) · isMuted() · ready
 */
(function (global) {
  'use strict';
  const doc = global.document;

  // ------------------------------------------------------------ pitch helpers
  const NI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = a => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);           // midi -> Hz
  function midi(n) {                                            // "C#5" -> 73, bad -> 0
    const m = /^([A-G])(#|b)?(\d)$/.exec(n);
    return m ? (+m[3] + 1) * 12 + NI[m[1]] + acc(m[2]) : 0;
  }
  const hz = n => mf(midi(n));
  const tok = (s, n) => { const a = s.trim().split(/\s+/); while (a.length < n) a.push('.'); return a.slice(0, n); };

  // Chord "Am", "F#", "Bd" -> root (transposed, wrapped to one octave) + tones.
  // Suffix: m minor, d dim, 5 open fifth, s sus4, 7 dominant 7th.
  const CT = { '': [0, 4, 7, 12], m: [0, 3, 7, 12], d: [0, 3, 6, 12], 5: [0, 7, 12, 19], s: [0, 5, 7, 12], 7: [0, 4, 7, 10] };
  function chord(c, tr) {
    const m = /^([A-G])(#|b)?(m|d|5|s|7)?$/.exec(c) || [0, 'A', '', 'm'];
    const q = m[3] || '', t = CT[q];
    return { r: (NI[m[1]] + acc(m[2]) + tr + 24) % 12, t, iv: { r: 0, o: 12, f: q === 'd' ? 6 : 7, t: t[1] } };
  }

  // ------------------------------------------------------------ songs
  // l   lead, 16 tokens per bar (one per 16th): NOTE starts, "-" holds, "." rests.
  // c   one chord per bar, "X/Y" = two half-bar chords. Bass and arp derive from it.
  // b   bass pattern, 16 chars per bar: r root, o octave, f fifth, t third, - hold, . rest.
  // d   drum bars (loop), 16 tokens; every char of a token is a hit:
  //     K kick, S snare, h hat, o open hat, w woodblock, t tom, c crash.
  // ar  arp note length in steps (.5 = 32nds) · ap chord-tone order · ag arp gate · ao arp shift
  // tr  transpose · vib delayed lead vibrato depth · det cents of a 2nd lead osc · echo lead echo (steps)
  // lv / bv / av  lead / bass / arp volume.
  // Boss variant = zone battle song +2 semitones, +8 bpm, drum fill every 4 bars (derived, not stored).
  const BASS = {
    P8: 'r.o.r.o.r.o.r.o.', P4: 'r--.o--.r--.o--.', WK: 'r--.f--.o--.f--.', FB: 'r.f.o.f.r.f.o.f.',
    GL: 'r.rrr.rrr.rrr.rr', GO: 'r.oor.oor.oor.oo', GF: 'r.for.for.for.fo', SP: 'r-----f-o-----f-'
  };
  const DP = ['K . h . S . h . K . h . S . h h'];
  const DB = ['K . h K S . h . K . h K S . h S', 'K . h K S . h . K K h . S S S S'];
  const FILL = tok('S . S S t . t t', 8);

  const SONGS = {
    title: {
      bpm: 92, b: 'P4', ar: 2, echo: 3,
      l: ['A5 - G5 A5 - - - - G5 F5 E5 D5 C#5 - D5 -', '- - - - - - - - . . . . . . . .',
        'A4 - G4 A4 - - - - E4 - F4 - C#4 - D4 -', '- - - - - - - - . . . . . . . .',
        'A4 - G4 A4 - - - - G4 F4 E4 D4 C#4 - D4 -', '- - - - . . . . D5 E5 F5 G5 A5 - - -',
        'A#5 - A5 - G5 - F5 - E5 - D5 - C#5 - E5 -', 'D5 - - - - - - - . . . . . . . .'],
      c: 'Dm Dm Dm Dm Dm Gm A Dm',
      d: ['K . . . . . . . K . . . . . . .', 'K . . . . . . . K . . . S . . .']
    },
    graveyard: {   // D minor (stored in A minor / E minor, transposed)
      prep: {
        bpm: 112, tr: 5, b: 'P8',
        l: ['E5 . E5 . D5 . C5 . B4 - - . A4 - - .', 'C5 . B4 . A4 . G#4 . A4 - - - - - . .',
          'E5 . E5 . F5 . E5 . D5 - - . C5 - - .', 'D5 . C5 . B4 . G#4 . A4 - - - - - . .',
          'A5 . G5 . F5 . E5 . F5 - E5 . D5 - . .', 'D5 . C5 . B4 . A4 . B4 - C5 - D5 - . .',
          'E5 . A5 . G#5 . A5 . B5 - A5 . G#5 - E5 .', 'F5 . E5 . D5 . B4 . A4 - - - - - - .'],
        c: 'Am F/E Am Dm/E F G Am Dm/E', d: DP
      },
      battle: {
        bpm: 150, tr: -2, b: 'P8',
        l: ['E5 . E5 . G5 . E5 . A5 . E5 . B5 - A5 .', 'G5 . F#5 . E5 . D5 . E5 - - - B4 - - .',
          'E5 . E5 . G5 . E5 . A5 . B5 . C6 - B5 .', 'A5 . G5 . F#5 . G5 . E5 - - - - - . .',
          'C6 . B5 . A5 . G5 . A5 . G5 . F#5 . E5 .', 'D5 . E5 . F#5 . G5 . A5 - - . B5 - - .',
          'E6 . D6 . B5 . G5 . A5 . B5 . G5 . F#5 .', 'E5 - - . B4 . E5 . G5 - F#5 - E5 - . .'],
        c: 'Em Em Em D Am D C B', d: DB
      }
    },
    castle: {      // C harmonic minor, 32nd-note "organ" arps
      prep: {
        bpm: 120, b: 'WK', ar: .5, ag: .9, av: .035, det: -1200, lv: .11,
        l: ['C5 - - - Eb5 - G5 - - - F5 - Eb5 - D5 -', 'C5 - - - - - . . Ab4 - C5 - Eb5 - - .',
          'F5 - - - Eb5 - D5 - C5 - - - Ab4 - - .', 'B4 - - - - - - - G4 - B4 - D5 - - .',
          'G5 - - - Ab5 - G5 - F5 - Eb5 - D5 - C5 -', 'Ab5 - - - G5 - F5 - Eb5 - - - D5 - C5 -',
          'D5 - - - F5 - Ab5 - G5 - - - F5 - D5 -', 'Eb5 - D5 - C5 - B4 - - - - - G4 - - .'],
        c: 'Cm Ab Fm G Cm Fm Dd/G G7',
        d: ['K . . . h . . . S . . . h . h .', 'K . . . h . . K S . . . h . h h']
      },
      battle: {
        bpm: 156, b: 'GO', ar: .5, ag: .9, av: .035,
        l: ['G5 - Eb5 . C5 . Eb5 . G5 - C6 - B5 . C6 .', 'Ab5 - G5 . F5 . Eb5 . C5 - Eb5 - Ab5 - - .',
          'F5 - Ab5 . C6 . Ab5 . F5 . Eb5 . D5 . C5 .', 'B4 - D5 . G5 - - . F5 . D5 . B4 - G4 .',
          'C6 . B5 . C6 . G5 . Ab5 . G5 . Eb5 . G5 .', 'Ab5 . G5 . Ab5 . Eb5 . F5 . Eb5 . C5 . Eb5 .',
          'D5 . F5 . Ab5 . F5 . B5 - - . Ab5 - - .', 'G5 - - - F5 . Eb5 . D5 . C5 . B4 - D5 .'],
        c: 'Cm Ab Fm G Cm Ab Dd G',
        d: ['K h h K S h h h K h h K S h K h', 'K h h K S h h h K h K K S S S S']
      }
    },
    forest: {      // A dorian, bouncy, open fifths in the bass
      prep: {
        bpm: 104, b: 'FB', ar: 2,
        l: ['E5 - . E5 A5 . G5 . E5 - . D5 E5 - . .', 'F#5 - . F#5 A5 . F#5 . D5 - . E5 F#5 - . .',
          'G5 - . G5 B5 . A5 . G5 . F#5 . D5 - . .', 'E5 . D5 . C5 . B4 . A4 - - - - - . .',
          'A5 - . A5 G5 . E5 . G5 - . E5 D5 . . .', 'F#5 - . E5 D5 . E5 . F#5 - . A5 - - . .',
          'G5 . F#5 . E5 . D5 . E5 - . B4 D5 - . .', 'F#5 - E5 - D5 - B4 - C5 - B4 - A4 - B4 -'],
        c: 'Am D G Am Am D Em D', d: ['K . h . S . h K . K h . S . h .']
      },
      battle: {
        bpm: 144, b: 'GF',
        l: ['A5 . E5 A5 . E5 A5 . B5 . A5 . G5 . E5 .', 'G5 . D5 G5 . D5 G5 . A5 . G5 . F#5 . D5 .',
          'F#5 . A5 . D6 - - . C6 . A5 . F#5 . E5 .', 'E5 - . E5 D5 . C5 . B4 . C5 . A4 - - .',
          'C6 . G5 C6 . G5 E5 . G5 . C6 . D6 . E6 .', 'D6 . B5 . G5 . B5 . D6 - - . B5 . G5 .',
          'A5 . F#5 . D5 . F#5 . A5 . B5 . C6 . A5 .', 'B5 - - . G5 . E5 . B4 . D5 . E5 - - .'],
        c: 'Am G D Am C G D Em',
        d: ['K . h K S . h K . K h . S . h h', 'K . h K S . h K . K h . S S S S']
      }
    },
    oriental: {    // E in-sen (E F A B D), vibrato lead, woodblock
      prep: {
        bpm: 96, b: 'SP', ar: 2, vib: .018, echo: 3,
        l: ['E5 - - - - - F5 - E5 - - - B4 - - -', 'A4 - B4 - D5 - - - B4 - - - - - . .',
          'D5 - - - F5 - A5 - - - F5 - D5 - - -', 'E5 - - - - - - - F5 - E5 - D5 - B4 -',
          'A5 - - - - - B5 - A5 - - - E5 - - -', 'F5 - - - E5 - D5 - - - A4 - D5 - - -',
          'B4 - - - D5 - F5 - - - E5 - D5 - - -', 'E5 - - - - - - - - - - - . . . .'],
        c: 'Es E5 Dm E5 As Dm Bd E5',
        d: ['t . . . w . . . t . w . w . . .', 't . . . w . . w t . w . w w w .']
      },
      battle: {
        bpm: 140, b: 'P8', vib: .015,
        l: ['E5 - F5 . E5 . B4 . D5 - E5 . B4 - A4 .', 'D5 - F5 . A5 - - . F5 . E5 . D5 - - .',
          'B5 - A5 . B5 . E5 . F5 - E5 . B4 - D5 .', 'E5 - - - - - . . A4 . B4 . D5 . E5 .',
          'E6 - D6 . B5 . A5 . B5 - - . F5 . E5 .', 'F5 - A5 . D6 - - . A5 . F5 . D5 - E5 .',
          'F5 - E5 . D5 . B4 . D5 - F5 . B5 - A5 .', 'B5 - - - - - . . A5 . E5 . B4 - - .'],
        c: 'E5 Dm E5 As E5 Dm Bd Es',
        d: ['K . w K S . w . K . w K S . w w', 'K . w K S . w . K K w . S w S w']
      }
    },
    hell: {        // E phrygian dominant, detuned double lead
      prep: {
        bpm: 132, b: 'P8', det: 12, lv: .1,
        l: ['E5 - - - F5 - - - G#5 - - - F5 - E5 -', 'F5 - - - A5 - - - C6 - B5 - A5 - - -',
          'G#5 - - - - - F5 - E5 - - - - - . .', 'D5 - - - F5 - - - A5 - G#5 - F5 - - -',
          'A5 - - - C6 - - - E6 - D6 - C6 - - -', 'B5 - - - D6 - - - B5 - G#5 - F5 - - -',
          'A5 - - - G#5 - - - F5 - - - E5 - D5 -', 'E5 - - - - - - - - - - - . . . .'],
        c: 'E F E Dm Am G#d F E',
        d: ['K . . . . . K . S . . . . . h .', 'K . . K . . K . S . . . S . S .']
      },
      battle: {
        bpm: 172, b: 'GL', det: 12, lv: .1,
        l: ['E5 . E5 F5 E5 . G#5 . B5 . G#5 . F5 . E5 .', 'F5 . F5 G#5 F5 . A5 . C6 . A5 . G#5 . F5 .',
          'D5 . F5 . A5 . D6 - - . C6 . B5 . A5 .', 'G#5 - - . F5 . E5 . D5 . E5 - - - . .',
          'A5 . C6 . E6 . C6 . A5 . E5 . A5 . C6 .', 'C6 . A5 . F5 . A5 . C6 - D6 - C6 . A5 .',
          'B5 . D6 . B5 . G#5 . F5 . G#5 . B5 . D6 .', 'E6 - - - D6 - C6 - B5 - A5 - G#5 - F5 -'],
        c: 'E F Dm E Am F G#d E',
        d: ['K h K h S h K h K h K K S h S h', 'K h K h S h K h K K K K S S S S']
      }
    }
  };
  const ZONES = ['graveyard', 'castle', 'forest', 'oriental', 'hell'];

  // Song -> flat step list. steps[i] = {l: lead, b: bass, a: [arp], d: drum chars}
  function compile(def, tr, bpm, fill) {
    const bars = def.l.map(b => tok(b, 16)), n = bars.length * 16, steps = [];
    for (let i = 0; i < n; i++) steps.push({});
    let cur = null;
    [].concat(...bars).forEach((k, i) => {
      if (k === '-') { if (cur) cur.n++; }
      else if (k === '.' || !midi(k)) cur = null;
      else steps[i].l = cur = { f: mf(midi(k) + tr), n: 1 };
    });
    const half = [];
    def.c.trim().split(/\s+/).forEach(c => { const p = c.split('/'); half.push(chord(p[0], tr), chord(p[1] || p[0], tr)); });
    const bp = BASS[def.b] || def.b, dr = def.d.map(b => tok(b, 16)), ap = def.ap || '0123', ar = def.ar || 1;
    for (let i = 0; i < n; i++) {
      const ch = half[(i >> 3) % half.length], j = i & 15, bar = i >> 4, iv = ch.iv[bp[j]];
      if (iv !== undefined) {
        let len = 1;
        while (j + len < 16 && bp[j + len] === '-') len++;
        steps[i].b = { f: mf(36 + ch.r + iv), n: len };
      }
      let d = dr[bar % dr.length][j];
      if (fill) { if (bar % 4 === 3 && j > 7) d = FILL[j - 8]; else if (bar % 4 === 0 && !j) d += 'c'; }
      if (d !== '.') steps[i].d = d;
    }
    for (let h = 0; h < n / 8; h++) {           // arpeggio restarts every half bar
      const ch = half[h % half.length];
      for (let x = 0, k = 0; x < 8; x += ar, k++) {
        const s = steps[h * 8 + Math.floor(x)];
        (s.a = s.a || []).push({ f: mf(60 + (def.ao || 0) + ch.r + ch.t[ap[k % ap.length]]), o: x % 1, n: ar * (def.ag || .6) });
      }
    }
    return { bpm, n, steps, s: def };
  }

  // ------------------------------------------------------------ engine
  const MASTER = .55, MUSIC = .26, SFXV = .5, LOOK = .15;
  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let muted = false;
  try { muted = global.localStorage.getItem('gt_muted') === '1'; } catch (e) { /* ignore */ }

  let cur = null, pm = 1;            // SFX voice being built + its pitch multiplier
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };

  function unlock() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      const comp = ctx.createDynamicsCompressor();      // soft limiter for stacked SFX
      comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 6;
      comp.attack.value = .003; comp.release.value = .2;
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = SFXV; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      // 1-bit 17-bit LFSR noise, like the PSG noise generator.
      let lfsr = 1, v = 1;
      for (let i = 0; i < d.length; i++) {
        if (i % 3 === 0) { const bit = (lfsr ^ (lfsr >> 3)) & 1; lfsr = (lfsr >> 1) | (bit << 16); v = (lfsr & 1) ? 1 : -1; }
        d[i] = v;
      }
      const b = ctx.createBufferSource();               // silent blip: unlocks iOS output
      b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    }
    if (ctx.state !== 'running') quiet(ctx.resume());
    if (wanted && !curKey) music.apply(null, wanted);
  }

  // PSG-like envelope: 5 ms attack, hold, decay to 55 %, >= 5 ms release.
  function env(p, t, d, v) {
    const a = Math.min(.005, d * .25), r = Math.max(.005, d * .15);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(v, t + a);
    p.setValueAtTime(v, t + Math.max(a, d * .35));
    p.linearRampToValueAtTime(v * .55, t + d - r);
    p.linearRampToValueAtTime(0, t + d);
  }

  // Square tone. to: exp slide target. out: destination (default: current SFX voice).
  // m: {det: cents of a 2nd osc, vib: delayed vibrato depth ratio, lfo: [Hz, depth Hz],
  //     ramp: [[Hz, at s], ...] multi-segment slide}
  function tone(f, t, d, v, to, out, m) {
    if (!ctx || !(f > 0)) return t;
    f *= pm; d = Math.max(d, .02);
    const g = ctx.createGain(), nodes = [g], oscs = [];
    env(g.gain, t, d, v);
    g.connect(out || (cur ? cur.g : sfxBus));
    const add = det => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      if (m && m.ramp) m.ramp.forEach(r => o.frequency.exponentialRampToValueAtTime(r[0] * pm, t + r[1]));
      else if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to * pm), t + d);
      if (det) o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + d + .02);
      oscs.push(o); nodes.push(o);
    };
    add(0);
    if (m && m.det) add(m.det);
    if (m && (m.lfo || m.vib)) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      if (m.lfo) { l.frequency.value = m.lfo[0]; lg.gain.value = m.lfo[1] * pm; }
      else {                                      // vibrato fades in after 90 ms
        l.frequency.value = 5.5;
        lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + .09);
        lg.gain.linearRampToValueAtTime(f * m.vib, t + .2);
      }
      l.connect(lg); oscs.forEach(o => lg.connect(o.frequency));
      l.start(t); l.stop(t + d + .02); nodes.push(l, lg);
    }
    oscs[0].onended = () => nodes.forEach(n => n.disconnect());
    if (cur) { cur.src.push(...oscs); cur.end = Math.max(cur.end, t + d + .03); }
    return t + d;
  }

  // Filtered LFSR noise. x: {type (highpass), to: cutoff sweep target, q, a: attack s, am: [Hz, depth]}
  function noise(t, d, v, cut, out, x) {
    if (!ctx) return t;
    x = x || {};
    const a = x.a || .003; d = Math.max(d, a + .01);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), nodes = [s, f, g];
    s.buffer = noiseBuf; s.loop = true;
    f.type = x.type || 'highpass';
    f.frequency.setValueAtTime(Math.min(cut * pm, 16000), t);
    if (x.to) f.frequency.exponentialRampToValueAtTime(Math.min(x.to * pm, 16000), t + d);
    if (x.q) f.Q.value = x.q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(.001, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + .005);
    s.connect(f);
    let last = f;
    if (x.am) {                                   // amplitude LFO: growl / tremolo
      const m = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      m.gain.value = 1 - x.am[1]; lg.gain.value = x.am[1]; l.frequency.value = x.am[0];
      l.connect(lg); lg.connect(m.gain); f.connect(m); last = m;
      l.start(t); l.stop(t + d + .02); nodes.push(m, l, lg);
    }
    last.connect(g); g.connect(out || (cur ? cur.g : sfxBus));
    s.start(t, Math.random() * .9); s.stop(t + d + .02);
    s.onended = () => nodes.forEach(n => n.disconnect());
    if (cur) { cur.src.push(s); cur.end = Math.max(cur.end, t + d + .03); }
    return t + d;
  }

  // ------------------------------------------------------------ music sequencer
  const DRUM = {
    K: (t, o) => tone(160, t, .09, .3, 40, o),
    S: (t, o) => noise(t, .12, .2, 1400, o),
    h: (t, o) => noise(t, .035, .08, 7000, o),
    o: (t, o) => noise(t, .14, .07, 6000, o),
    w: (t, o) => noise(t, .03, .5, 1900, o, { type: 'bandpass', q: 5 }),
    t: (t, o) => tone(200, t, .11, .24, 80, o),
    c: (t, o) => noise(t, .5, .12, 3000, o)
  };

  let players = [], timer = 0, wanted = null, curKey = null;
  const CACHE = {};

  function scheduleStep(p, st, t, sd) {
    const s = p.c.s, g = p.g, L = st.l, lv = s.lv || .15;
    if (L) {
      const d = L.n * sd * .92, m = { det: s.det, vib: s.vib };
      tone(L.f, t, d, lv, 0, g, m);
      if (s.echo) tone(L.f, t + s.echo * sd, d, lv * .3, 0, g, m);
    }
    if (st.b) tone(st.b.f, t, st.b.n * sd * .85, s.bv || .14, 0, g);
    if (st.a) st.a.forEach(a => tone(a.f, t + a.o * sd, a.n * sd, s.av || .045, 0, g));
    if (st.d) for (const c of st.d) if (DRUM[c]) DRUM[c](t, g);
  }

  function tick() {
    const now = ctx.currentTime;
    players = players.filter(p => {
      if (p.stop && now > p.stop + .05) { p.g.disconnect(); return false; }
      const sd = 15 / p.c.bpm;
      if (p.t < now - .25) p.t = now + .05;        // tab was asleep: skip ahead, no burst
      while (p.t < now + LOOK && !(p.stop && p.t >= p.stop)) {
        if (!muted) scheduleStep(p, p.c.steps[p.i], p.t, sd);   // muted: keep time, make no nodes
        p.t += sd; p.i = (p.i + 1) % p.c.n;
      }
      return true;
    });
    if (!players.length) { clearInterval(timer); timer = 0; }
  }

  function fade(p, now, d) {
    p.stop = now + d;
    p.g.gain.cancelScheduledValues(now);
    p.g.gain.setValueAtTime(p.g.gain.value, now);
    p.g.gain.linearRampToValueAtTime(0, now + d);
  }

  function songKey(mood, zone, boss) {
    if (mood === 'title') return 'title';
    if (mood !== 'prep' && mood !== 'battle') return null;
    zone = typeof zone === 'number' ? ZONES[zone] : String(zone || '').toLowerCase();
    if (ZONES.indexOf(zone) < 0) zone = 'graveyard';
    return mood + ':' + zone + (boss && mood === 'battle' ? ':boss' : '');
  }

  function getSong(key) {
    if (!CACHE[key]) {
      const k = key.split(':'), def = k[0] === 'title' ? SONGS.title : SONGS[k[1]][k[0]], b = k[2] ? 1 : 0;
      CACHE[key] = compile(def, (def.tr || 0) + 2 * b, def.bpm + 8 * b, !!b);
    }
    return CACHE[key];
  }

  function music(mood, zone, boss) {
    const key = songKey(mood, zone, boss);
    if (!key) return;
    wanted = [mood, zone, boss];
    if (!ctx) return;                               // starts on unlock()
    if (key === curKey && players.length) return;
    const now = ctx.currentTime, live = players.filter(p => !p.stop);
    live.forEach(p => fade(p, now, .3));            // 300 ms crossfade
    players.filter(p => p.stop > now + .02).slice(0, -2).forEach(p => fade(p, now, .01));
    const g = ctx.createGain();
    g.gain.setValueAtTime(live.length ? 0 : 1, now);
    if (live.length) g.gain.linearRampToValueAtTime(1, now + .3);
    g.connect(musicBus);
    players.push({ c: getSong(key), g, i: 0, t: now + .05, stop: 0 });
    curKey = key;
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }

  function stopMusic(keepWanted) {
    if (!keepWanted) wanted = null;
    curKey = null;
    if (ctx) { const now = ctx.currentTime; players.forEach(p => { if (!p.stop) fade(p, now, .12); }); }
  }

  let duckT = 0, duckLv = 1;
  function duck(level, ms) {
    if (!ctx) return;
    clearTimeout(duckT);
    duckLv = ms > 0 ? Math.max(0, Math.min(1, +level || 0)) : 1;
    musicBus.gain.setTargetAtTime(MUSIC * duckLv, ctx.currentTime, .03);
    if (duckLv < 1) duckT = setTimeout(() => duck(1, 0), ms);
  }
  const softDuck = ms => { if (duckLv === 1) duck(.4, ms); };   // jingles; never overrides a deeper duck

  // ------------------------------------------------------------ sfx
  // run: equal-length notes (optional longer last). seq: "NOTE dur NOTE dur ...", "." = rest.
  function run(notes, d, v, t, last) {
    const a = notes.split(' ');
    a.forEach((n, i) => { const l = last && i === a.length - 1 ? last : d; tone(hz(n), t, l * .95, v); t += l; });
    return t;
  }
  function seq(s, v, t) {
    const a = s.split(' ');
    for (let i = 0; i < a.length; i += 2) { const d = +a[i + 1]; if (a[i] !== '.') tone(hz(a[i]), t, d * .95, v); t += d; }
    return t;
  }
  const st = n => Math.pow(2, n / 12);

  const SFX = {
    // --- UI / economy
    click: t => tone(1500, t, .02, .15),
    select: t => { tone(988, t, .03, .18); tone(1319, t + .03, .03, .18); },
    place: t => { tone(523, t, .04, .2); tone(784, t + .04, .05, .2); },
    buy: t => { tone(1319, t, .05, .18); tone(1976, t + .05, .12, .18); },
    sell: t => { tone(1976, t, .05, .16); tone(1319, t + .05, .1, .16); },
    coin: t => { tone(1976, t, .025, .12); tone(2637, t + .025, .04, .12); },
    merge: t => run('C5 E5 G5 C6 E6 G6 C7', .05, .17, t, .15),
    power: t => run('G4 C5 E5 G5 C6', .06, .17, t, .14),
    error: t => { tone(140, t, .08, .2); tone(140, t + .11, .1, .2); },
    spin: t => tone(1046, t, .025, .14),
    // --- combat
    attack: t => tone(880, t, .06, .18, 330),
    shoot: t => tone(1400, t, .06, .12, 2400),
    swing: t => { noise(t, .04, .1, 2000); tone(600, t, .04, .1, 300); },
    hit: (t, o) => {
      const r = st((Math.random() * 2 - 1) * (o.pitch ? .3 : 1));   // keep game.js' hit ladder audible
      tone(220 * r, t, .06, .2, 70 * r); noise(t, .05, .22, 900);
    },
    crit: t => { tone(1200, t, .03, .18, 200); tone(110, t, .12, .25, 40); noise(t, .12, .28, 1500); tone(2093, t + .03, .04, .1); },
    skill: t => run('C6 E6 G6 C7', .035, .18, t, .07),
    skillhit: t => { tone(90, t, .18, .28, 30); noise(t, .2, .25, 300); },
    block: t => { tone(1760, t, .03, .12); tone(2637, t + .03, .03, .12); },
    shieldbreak: t => { noise(t, .15, .2, 4000); run('C7 G6 C6', .03, .12, t); },
    kill: t => { tone(880, t, .22, .2, 110); noise(t, .18, .2, 600); },
    death: t => tone(420, t, .3, .18, 55),
    allydown: t => { tone(440, t, .4, .18, 55); tone(330, t + .4, .12, .16); tone(262, t + .52, .24, .16); },
    execute: t => { tone(90, t, .5, .25, 35); noise(t, .45, .25, 200); seq('C4 .06 F#3 .18', .16, t + .05); },
    cast: t => run('C5 E5 G5 C6', .05, .1, t),
    mpfull: t => run('C7 G7', .02, .06, t),
    spawn: t => tone(200, t, .08, .08, 800),
    streak: t => run('C6 E6 G6', .035, .14, t, .09),             // +2 st per opts.tier
    slowmo: t => { tone(220, t, .9, .16, 55); duck(.1, 900); },
    // --- skills
    zap: t => { for (let i = 0; i < 5; i++) noise(t + i * .035, .03, .25, 3000); tone(220, t, .2, .12, 1800); },
    charm: t => run('E6 G#6 B6 E7', .05, .15, t, .1),
    heal: t => run('C5 G5 C6', .04, .14, t, .08),
    shield: t => { tone(330, t, .25, .15, 660); tone(495, t + .05, .2, .08, 990); tone(1568, t + .1, .2, .07); },
    curse: t => { tone(600, t, .4, .14, 90); noise(t, .3, .08, 400); },
    bloodfeast: t => { noise(t, .06, .2, 1200); tone(300, t, .12, .18, 80); run('C5 Eb5 G5', .04, .12, t + .12); },
    bandage: t => { noise(t, .03, .18, 3000); tone(1500, t, .08, .12, 300); tone(120, t, .1, .2, 50); },
    bloodrage: t => tone(300, t, .4, .15, 0, null, { lfo: [8, 20], ramp: [[600, .15], [400, .4]] }),
    foxorb: t => { noise(t, .25, .15, 1500); tone(500, t, .25, .1, 1000); },
    popopo: t => [392, 440, 523].forEach((f, i) => tone(f, t + i * .12, .06, .15, f * st(-3))),
    wail: t => { tone(880, t, .5, .13, 440, null, { lfo: [6, 30] }); noise(t, .4, .06, 400); },
    deathnote: (t, o) => {                         // {tier: 1} or {exec: true} = execute version
      if (o.tier > 0 || o.exec) { SFX.execute(t); tone(131, t, .6, .15); }
      else { noise(t, .08, .2, 2000); tone(700, t, .1, .16, 150); }
    },
    // --- flow / jingles
    fight: t => { run('G4 G4 C5', .08, .2, t, .22); noise(t + .16, .2, .15, 1500); },
    victory: t => seq('C5 .1 E5 .1 G5 .1 C6 .2 . .05 G5 .1 C6 .35', .2, t),
    defeat: t => run('G4 F#4 F4 E4', .18, .2, t, .5),
    gameover: t => {
      const end = seq('E5 .15 D#5 .15 D5 .15 C#5 .3 . .1 A4 .12 G#4 .12 G4 .12 F#4 .6', .2, t);
      tone(110, t, end - t, .12, 55);
    },
    highscore: t => run('C5 G5 C6 E6 G6 C7', .08, .18, t, .3),
    stageclear: t => {
      softDuck(1300);
      seq('C5 .12 C5 .06 C5 .06 G5 .24 E5 .12 G5 .12 C6 .5', .17, t);
      seq('E4 .12 E4 .06 E4 .06 B4 .24 C5 .12 E5 .12 G5 .5', .07, t);
      seq('C3 .24 G2 .24 C3 .24 C3 .5', .13, t);
      [0, .12, .18].forEach(d => noise(t + d, .06, .14, 1400));
      noise(t + .72, .5, .12, 3000);
    },
    zonefanfare: t => {
      softDuck(1400);
      seq('G4 .1 C5 .1 E5 .1 G5 .2 E5 .1 G5 .6', .15, t);
      seq('E4 .1 G4 .1 C5 .1 E5 .2 C5 .1 E5 .6', .07, t);
      seq('C3 .3 G2 .3 C3 .6', .14, t);
      tone(160, t, .09, .2, 40); noise(t + .4, .06, .12, 1400); noise(t + .5, .06, .14, 1400); noise(t + .6, .5, .1, 3000);
    },
    levelup: t => { run('E5 G5 C6 E6', .045, .15, t); tone(1047, t + .18, .3, .12, 2093, null, { lfo: [14, 25] }); },
    top10: t => {
      softDuck(1500);
      seq('G5 .1 G5 .1 G5 .1 C6 .3 G5 .1 C6 .1 E6 .6', .15, t);
      seq('E5 .1 E5 .1 E5 .1 G5 .3 E5 .1 G5 .1 C6 .6', .07, t);
      seq('C3 .3 C3 .3 G2 .2 C3 .6', .13, t);
      for (let i = 0; i < 6; i++) noise(t + .8 + i * .1, .04, .08, 8000);
    },
    bossroar: t => {
      noise(t, 1.2, .35, 700, null, { type: 'lowpass', to: 120, q: 4, a: .12, am: [26, .45] });
      tone(180, t, 1.1, .16, 40);
      tone(120, t + .05, 1, .1, 30, null, { det: 25 });
    },
    wipe: t => noise(t, .38, .2, 300, null, { to: 7000, a: .16 }),
    // --- atmosphere
    taunt: t => { tone(300, t, .12, .1, 180, null, { lfo: [18, 30] }); tone(220, t + .1, .16, .09, 140, null, { lfo: [14, 25] }); },
    meteorfall: t => { noise(t, .9, .18, 5000, null, { type: 'lowpass', to: 300, a: .25 }); tone(900, t, .9, .06, 120); },
    thunder: t => {
      noise(t, .07, .28, 4000);
      noise(t + .06, 1.4, .3, 1200, null, { type: 'lowpass', to: 80, q: 1, a: .03, am: [7, .5] });
      tone(55, t + .06, .8, .12, 35);
    },
    heartbeat: t => { tone(70, t, .09, .3, 45); tone(62, t + .17, .11, .24, 40); },
    portal: t => { tone(160, t, .35, .06, 640, null, { lfo: [20, 40] }); noise(t, .3, .05, 2500, null, { type: 'bandpass', q: 6 }); },
    heartbreak: t => { noise(t, .05, .2, 3000); tone(1200, t, .04, .12, 600); tone(523, t + .06, .45, .15, 196, null, { lfo: [7, 12] }); }
  };

  // ------------------------------------------------------------ sfx mixer
  const MAXV = 8;
  const BIG = { crit: 1, kill: 1, execute: 1, deathnote: 1, slowmo: 1, thunder: 1 };   // bypass the throttle
  const KEEP = { fight: 1, victory: 1, defeat: 1, gameover: 1, highscore: 1, stageclear: 1,
    zonefanfare: 1, top10: 1, levelup: 1, bossroar: 1 };                        // never voice-stolen
  let voices = [], lastBig = -1;
  const lastPlay = {};

  function release(v, now) {                       // 10 ms fade, then stop + unhook
    if (v.end > now) {
      v.g.gain.setValueAtTime(1, now);
      v.g.gain.linearRampToValueAtTime(0, now + .01);
      v.src.forEach(s => { try { s.stop(now + .012); } catch (e) { /* already stopped */ } });
      setTimeout(() => v.g.disconnect(), 40);
    } else v.g.disconnect();
  }

  function play(name, opts) {
    if (!ctx || muted || (doc && doc.hidden)) return;
    const fn = SFX[name];
    if (!fn) return;
    opts = typeof opts === 'number' ? { pitch: opts } : opts || {};
    const now = ctx.currentTime, big = BIG[name];
    if (!big) {
      if (now - (lastPlay[name] || -1) < .045) return;            // avoid PSG soup
      if (name === 'hit' && now - lastBig < .025) return;          // a crit/kill already covers it
    }
    lastPlay[name] = now;
    voices = voices.filter(v => {
      if (v.end > now && !(big && v.n === 'hit' && now - v.t0 < .025)) return true;
      release(v, now); return false;                              // ended, or a hit replaced by crit/kill
    });
    if (big) lastBig = now;
    if (voices.length >= MAXV) {
      const i = voices.findIndex(v => !KEEP[v.n]);
      if (i < 0) return;
      release(voices[i], now); voices.splice(i, 1);               // steal the oldest
    }
    const g = ctx.createGain();
    g.connect(sfxBus);
    cur = { n: name, t0: now, end: now, g, src: [] };
    voices.push(cur);
    pm = st((+opts.pitch || 0) + (name === 'streak' ? 2 * Math.max(0, opts.tier | 0) : 0));
    try { fn(now + .005, opts); } finally { cur = null; pm = 1; }
  }

  function setMuted(m) {
    muted = !!m;
    try { global.localStorage.setItem('gt_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : MASTER, now, .015);
    if (muted) { voices.forEach(v => release(v, now)); voices = []; }
  }

  if (doc) doc.addEventListener('visibilitychange', () => {
    if (ctx) quiet(doc.hidden ? ctx.suspend() : ctx.resume());
  });

  global.Sound = {
    unlock,
    play,
    music,
    duck,
    stopMusic: () => stopMusic(false),
    toggleMute: () => { setMuted(!muted); return muted; },
    setMuted,
    isMuted: () => muted,
    get ready() { return !!ctx; },
    _dev: { SONGS, BASS, ZONES, compile, sfx: Object.keys(SFX) }   // for tests only
  };
})(window);
