/*
 * Ghost-Tactics :: sound.js
 * MSX / AY-3-8910 (PSG) style synthesizer built on the Web Audio API.
 * Three square-wave tone channels (lead, bass, arpeggio) + a noise channel
 * for drums. Every note and effect is generated at runtime: 0 KB of audio.
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------ helpers
  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteFreq(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) return 0;
    const semi = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // Chord "Am", "F#", "Bb", "C#m" -> {root semitone, minor}
  function parseChord(ch) {
    const m = /^([A-G])(#|b)?(m?)$/.exec(ch);
    if (!m) return { root: 9, minor: true };
    return {
      root: (NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12,
      minor: m[3] === 'm'
    };
  }

  // ------------------------------------------------------------ songs
  // Melody notation: one token per 16th step. NOTE = new note, "-" = hold, "." = rest.
  // Chords: one per bar, or "X/Y" for two per bar (half bar each).
  const SONGS = {
    title: {
      bpm: 92, bass: 'pump4', arp: 2,
      lead: [
        'A5 - G5 A5 - - - - G5 F5 E5 D5 C#5 - D5 -',
        '- - - - - - - - . . . . . . . .',
        'A4 - G4 A4 - - - - E4 - F4 - C#4 - D4 -',
        '- - - - - - - - . . . . . . . .',
        'A4 - G4 A4 - - - - G4 F4 E4 D4 C#4 - D4 -',
        '- - - - . . . . D5 E5 F5 G5 A5 - - -',
        'A#5 - A5 - G5 - F5 - E5 - D5 - C#5 - E5 -',
        'D5 - - - - - - - . . . . . . . .'
      ],
      chords: ['Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'Gm', 'A', 'Dm'],
      drums: [
        'K . . . . . . . K . . . . . . .',
        'K . . . . . . . K . . . S . . .'
      ]
    },
    prep: {
      bpm: 112, bass: 'pump8', arp: 1,
      lead: [
        'E5 . E5 . D5 . C5 . B4 - - . A4 - - .',
        'C5 . B4 . A4 . G#4 . A4 - - - - - . .',
        'E5 . E5 . F5 . E5 . D5 - - . C5 - - .',
        'D5 . C5 . B4 . G#4 . A4 - - - - - . .',
        'A5 . G5 . F5 . E5 . F5 - E5 . D5 - . .',
        'D5 . C5 . B4 . A4 . B4 - C5 - D5 - . .',
        'E5 . A5 . G#5 . A5 . B5 - A5 . G#5 - E5 .',
        'F5 . E5 . D5 . B4 . A4 - - - - - - .'
      ],
      chords: ['Am', 'F/E', 'Am', 'Dm/E', 'F', 'G', 'Am', 'Dm/E'],
      drums: [
        'K . h . S . h . K . h . S . h h'
      ]
    },
    battle: {
      bpm: 150, bass: 'pump8', arp: 1,
      lead: [
        'E5 . E5 . G5 . E5 . A5 . E5 . B5 - A5 .',
        'G5 . F#5 . E5 . D5 . E5 - - - B4 - - .',
        'E5 . E5 . G5 . E5 . A5 . B5 . C6 - B5 .',
        'A5 . G5 . F#5 . G5 . E5 - - - - - . .',
        'C6 . B5 . A5 . G5 . A5 . G5 . F#5 . E5 .',
        'D5 . E5 . F#5 . G5 . A5 - - . B5 - - .',
        'E6 . D6 . B5 . G5 . A5 . B5 . G5 . F#5 .',
        'E5 - - . B4 . E5 . G5 - F#5 - E5 - . .'
      ],
      chords: ['Em', 'Em', 'Em', 'D', 'Am', 'D', 'C', 'B'],
      drums: [
        'K . h K S . h . K . h K S . h S',
        'K . h K S . h . K K h . S S S S'
      ]
    }
  };

  function compileSong(song) {
    const tokens = song.lead.join(' ').trim().split(/\s+/);
    const length = tokens.length;
    const steps = Array.from({ length }, () => ({ lead: null, bass: null, arp: null, drum: null }));

    // Lead
    let cur = null;
    tokens.forEach((tk, i) => {
      if (tk === '-') { if (cur) cur.len++; }
      else if (tk === '.') { cur = null; }
      else { cur = { freq: noteFreq(tk), len: 1 }; steps[i].lead = cur; }
    });

    // Chords -> bass + arpeggio
    const halves = [];
    song.chords.forEach(c => {
      const parts = c.split('/');
      halves.push(parts[0], parts[1] || parts[0]);
    });
    halves.forEach((name, h) => {
      const ch = parseChord(name);
      const third = ch.minor ? 3 : 4;
      const tones = [0, third, 7, 12];
      for (let s = 0; s < 8; s++) {
        const i = h * 8 + s;
        if (i >= length) break;
        if (song.bass === 'pump8' && s % 2 === 0) {
          steps[i].bass = { freq: midiFreq(36 + ch.root + (s % 4 === 0 ? 0 : 12)), len: 1 };
        } else if (song.bass === 'pump4' && s % 4 === 0) {
          steps[i].bass = { freq: midiFreq(36 + ch.root + (s === 0 ? 0 : 12)), len: 3 };
        }
        if (s % song.arp === 0) {
          const k = (s / song.arp) % 4;
          steps[i].arp = { freq: midiFreq(60 + ch.root + tones[k]), len: song.arp };
        }
      }
    });

    // Drums (pattern loops over the song)
    const drumTokens = song.drums.map(d => d.trim().split(/\s+/));
    for (let i = 0; i < length; i++) {
      const pat = drumTokens[Math.floor(i / 16) % drumTokens.length];
      const tk = pat[i % 16];
      if (tk && tk !== '.') steps[i].drum = tk;
    }
    return { bpm: song.bpm, length, steps };
  }

  const COMPILED = {};
  Object.keys(SONGS).forEach(k => { COMPILED[k] = compileSong(SONGS[k]); });

  // ------------------------------------------------------------ engine
  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let muted = false;
  try { muted = global.localStorage.getItem('gt_muted') === '1'; } catch (e) { /* ignore */ }

  let song = null, songName = null, wanted = null, step = 0, nextTime = 0, timer = null;
  const lastPlay = {};

  function unlock() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      // 1-bit LFSR-flavoured noise, like the PSG noise generator.
      let lfsr = 1, v = 1;
      for (let i = 0; i < d.length; i++) {
        if (i % 3 === 0) { const bit = ((lfsr >> 0) ^ (lfsr >> 3)) & 1; lfsr = (lfsr >> 1) | (bit << 16); v = (lfsr & 1) ? 1 : -1; }
        d[i] = v;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (wanted && !song) music(wanted);
  }

  // Square tone with a PSG-like stepped envelope.
  function tone(freq, t, dur, vol, bus, slideTo, type) {
    if (!ctx || freq <= 0) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.55, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(t, dur, vol, hp, bus) {
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // [['C5', 0.1], ['E5', 0.1] ...] -> scheduled sequence
  function seq(notes, vol, t0, bus) {
    let t = t0 || ctx.currentTime;
    notes.forEach(([n, d]) => { if (n) tone(noteFreq(n), t, d * 0.95, vol, bus); t += d; });
    return t;
  }

  function scheduleStep(st, t, stepDur) {
    if (st.lead) tone(st.lead.freq, t, st.lead.len * stepDur * 0.92, 0.16, musicBus);
    if (st.bass) tone(st.bass.freq, t, st.bass.len * stepDur * 0.85, 0.15, musicBus);
    if (st.arp) tone(st.arp.freq, t, st.arp.len * stepDur * 0.6, 0.045, musicBus);
    switch (st.drum) {
      case 'K': tone(160, t, 0.09, 0.3, musicBus, 40); break;
      case 'S': noise(t, 0.12, 0.22, 1400, musicBus); break;
      case 'h': noise(t, 0.035, 0.09, 7000, musicBus); break;
    }
  }

  function tick() {
    if (!ctx || !song) return;
    const stepDur = 60 / song.bpm / 4;
    if (nextTime < ctx.currentTime - 0.25) nextTime = ctx.currentTime + 0.05; // tab was asleep
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(song.steps[step], nextTime, stepDur);
      nextTime += stepDur;
      step = (step + 1) % song.length;
    }
  }

  function music(name) {
    wanted = name;
    if (!ctx) return;            // will start on unlock()
    if (songName === name && song) return;
    stopMusic(true);
    song = COMPILED[name] || null;
    songName = name;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    timer = setInterval(tick, 25);
    tick();
  }

  function stopMusic(keepWanted) {
    if (timer) clearInterval(timer);
    timer = null; song = null; songName = null;
    if (!keepWanted) wanted = null;
  }

  // ------------------------------------------------------------ sfx
  const SFX = {
    click:   t => tone(1500, t, 0.02, 0.15),
    select:  t => { tone(988, t, 0.03, 0.18); tone(1319, t + 0.03, 0.03, 0.18); },
    place:   t => { tone(523, t, 0.04, 0.2); tone(784, t + 0.04, 0.05, 0.2); },
    attack:  t => tone(880, t, 0.06, 0.18, null, 330),
    shoot:   t => tone(1400, t, 0.06, 0.12, null, 2400),
    hit:     t => { noise(t, 0.06, 0.25, 900); tone(150, t, 0.04, 0.15, null, 80); },
    skill:   t => seq([['C6', 0.035], ['E6', 0.035], ['G6', 0.035], ['C7', 0.07]], 0.18, t),
    zap:     t => { for (let i = 0; i < 5; i++) noise(t + i * 0.035, 0.03, 0.25, 3000); tone(220, t, 0.2, 0.12, null, 1800); },
    charm:   t => seq([['E6', 0.05], ['G#6', 0.05], ['B6', 0.05], ['E7', 0.1]], 0.15, t),
    heal:    t => seq([['C5', 0.04], ['G5', 0.04], ['C6', 0.08]], 0.14, t),
    shield:  t => { tone(330, t, 0.25, 0.15, null, 660); tone(495, t + 0.05, 0.2, 0.08, null, 990); },
    curse:   t => { tone(600, t, 0.4, 0.14, null, 90); noise(t, 0.3, 0.08, 400); },
    execute: t => { tone(90, t, 0.5, 0.25, null, 35); noise(t, 0.45, 0.25, 200); seq([['C4', 0.06], ['F#3', 0.18]], 0.16, t + 0.05); },
    death:   t => tone(420, t, 0.3, 0.18, null, 55),
    buy:     t => { tone(1319, t, 0.05, 0.18); tone(1976, t + 0.05, 0.12, 0.18); },
    sell:    t => { tone(1976, t, 0.05, 0.16); tone(1319, t + 0.05, 0.1, 0.16); },
    merge:   t => seq([['C5', 0.05], ['E5', 0.05], ['G5', 0.05], ['C6', 0.05], ['E6', 0.05], ['G6', 0.05], ['C7', 0.15]], 0.17, t),
    power:   t => seq([['G4', 0.06], ['C5', 0.06], ['E5', 0.06], ['G5', 0.06], ['C6', 0.14]], 0.17, t),
    error:   t => { tone(140, t, 0.08, 0.2); tone(140, t + 0.11, 0.1, 0.2); },
    spin:    t => tone(1046, t, 0.025, 0.14),
    fight:   t => { seq([['G4', 0.08], ['G4', 0.08], ['C5', 0.22]], 0.2, t); noise(t + 0.16, 0.2, 0.15, 1500); },
    victory: t => seq([['C5', 0.1], ['E5', 0.1], ['G5', 0.1], ['C6', 0.2], [null, 0.05], ['G5', 0.1], ['C6', 0.35]], 0.2, t),
    defeat:  t => seq([['G4', 0.18], ['F#4', 0.18], ['F4', 0.18], ['E4', 0.5]], 0.2, t),
    gameover: t => {
      const end = seq([['E5', 0.15], ['D#5', 0.15], ['D5', 0.15], ['C#5', 0.3], [null, 0.1],
        ['A4', 0.12], ['G#4', 0.12], ['G4', 0.12], ['F#4', 0.6]], 0.2, t);
      tone(110, t, end - t, 0.12, null, 55);
    },
    highscore: t => seq([['C5', 0.08], ['G5', 0.08], ['C6', 0.08], ['E6', 0.08], ['G6', 0.08], ['C7', 0.3]], 0.18, t)
  };

  function play(name) {
    if (!ctx || muted) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.045) return; // avoid PSG soup
    lastPlay[name] = now;
    fn(now + 0.005);
  }

  function setMuted(m) {
    muted = !!m;
    try { global.localStorage.setItem('gt_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  global.Sound = {
    unlock,
    play,
    music,
    stopMusic: () => stopMusic(false),
    toggleMute: () => { setMuted(!muted); return muted; },
    setMuted,
    isMuted: () => muted,
    get ready() { return !!ctx; }
  };
})(window);
