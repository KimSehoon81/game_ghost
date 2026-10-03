<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';
gt_session_start();
$csrf = gt_csrf_token();
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Cache-busting query strings so redeploys are picked up immediately.
$assetVer = (string) (@filemtime(__DIR__ . '/sprites.png') ?: '1');
$v = static function (string $f): string {
    $t = @filemtime(__DIR__ . '/' . $f);
    return $f . '?v=' . ($t ?: '1');
};
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="csrf-token" content="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
<meta name="theme-color" content="#050d14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Ghost-Tactics</title>
<link rel="preload" as="image" href="sprites.png?v=<?= htmlspecialchars($assetVer, ENT_QUOTES, 'UTF-8') ?>">
<style>
  :root {
    --bg: #050d14;
    --ink: #f0f4f8;
    --accent: #f8c838;
    --hot: #e83a3a;
    --panel: #0c1a26;
    --line: #6a9cc4;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    background: var(--bg); color: var(--ink);
    overflow: hidden;
    touch-action: manipulation;
    -webkit-user-select: none; user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    font-family: "Courier New", Courier, monospace;
  }

  /* 4:3 retro stage. PC: fixed 640x480. */
  #stage {
    position: absolute; left: 50%; top: 50%;
    width: 640px; height: 480px;
    transform: translate(-50%, -50%);
    background: #000;
    box-shadow: 0 0 0 3px #1c3448, 0 0 40px rgba(106, 156, 196, .22);
  }
  #screen {
    display: block; width: 100%; height: 100%;
    image-rendering: pixelated; image-rendering: crisp-edges;
    touch-action: none; /* we handle drag ourselves */
    cursor: pointer;
  }

  /* Mobile / windows smaller than the stage: full-viewport scaling, keep 4:3. */
  @media (max-width: 639px), (max-height: 479px), (pointer: coarse) {
    #stage {
      width: 100vw; height: 75vw;
      max-height: 100vh; max-width: 133.333vh;
      box-shadow: none;
    }
    @supports (height: 100dvh) {
      #stage { max-height: 100dvh; max-width: 133.333dvh; }
    }
  }

  /* ---------- arcade modals (initials / leaderboard) ---------- */
  #overlay {
    position: fixed; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    background: rgba(2, 6, 10, .8);
  }
  .hidden { display: none !important; }
  .modal {
    width: min(92vw, 440px);
    max-height: 94vh; overflow: auto;
    background: var(--panel);
    border: 3px solid var(--line);
    box-shadow: 0 0 0 4px #000, 8px 8px 0 4px rgba(0, 0, 0, .6);
    padding: 16px 14px; text-align: center;
    image-rendering: pixelated;
  }
  .modal h2 {
    margin: 0 0 8px; font-size: 22px; letter-spacing: 2px;
    color: var(--accent); text-shadow: 3px 3px 0 #000;
    animation: blink 0.8s steps(2) infinite;
  }
  .modal p { margin: 6px 0; font-weight: bold; letter-spacing: 1px; }
  @keyframes blink { 50% { color: var(--hot); } }

  .slots { display: flex; justify-content: center; gap: 14px; margin: 14px 0 10px; }
  .slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .slot button {
    width: 56px; height: 40px; font-size: 20px; line-height: 1;
    background: #16304a; color: var(--ink);
    border: 3px solid #000; box-shadow: inset -3px -3px 0 #0a1824;
    cursor: pointer; touch-action: manipulation;
  }
  .slot button:active { transform: translateY(2px); box-shadow: none; }
  .slot .ch {
    width: 56px; height: 66px; display: flex; align-items: center; justify-content: center;
    font-size: 46px; font-weight: bold; color: var(--accent);
    background: #000; border: 3px solid #555; text-shadow: 3px 3px 0 #6a1010;
  }
  .slot.active .ch { border-color: var(--accent); box-shadow: 0 0 10px var(--accent); }
  #entryInput {
    width: 120px; font: bold 22px "Courier New", monospace; text-align: center;
    letter-spacing: 8px; text-transform: uppercase;
    background: #000; color: var(--ink); border: 3px solid #555; padding: 4px;
    -webkit-user-select: text; user-select: text;
  }
  .hint { font-size: 12px; opacity: .75; }
  .err { min-height: 18px; color: var(--hot); font-weight: bold; font-size: 14px; margin: 6px 0; }
  .btn {
    display: inline-block; min-width: 130px; margin: 6px 4px 0; padding: 10px 14px;
    font: bold 18px "Courier New", monospace; letter-spacing: 2px;
    background: var(--hot); color: #fff; border: 3px solid #000;
    box-shadow: inset -4px -4px 0 #7a1414, 4px 4px 0 #000;
    cursor: pointer; touch-action: manipulation;
  }
  .btn.alt { background: #3050d8; box-shadow: inset -4px -4px 0 #1a2a70, 4px 4px 0 #000; }
  .btn:active { transform: translate(2px, 2px); box-shadow: none; }
  .btn:disabled { opacity: .5; }

  table.rank { width: 100%; border-collapse: collapse; margin: 8px 0; font-weight: bold; }
  table.rank th { color: var(--line); border-bottom: 3px solid var(--line); padding: 4px; font-size: 14px; }
  table.rank td { padding: 5px 4px; font-size: 16px; border-bottom: 1px dashed #24405a; }
  table.rank tr:nth-child(1) td { color: #f8d838; }
  table.rank tr:nth-child(2) td { color: #d8d8e8; }
  table.rank tr:nth-child(3) td { color: #f0a050; }
  table.rank tr.me td { background: #3a1420; animation: blink 0.6s steps(2) infinite; }
  #rankStatus { font-size: 12px; opacity: .8; min-height: 16px; }

  #rotateHint {
    position: fixed; left: 0; right: 0; bottom: 8px; text-align: center;
    font-size: 12px; opacity: .6; pointer-events: none;
  }
  @media (orientation: landscape), (min-width: 701px) { #rotateHint { display: none; } }
  noscript { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div id="stage">
  <canvas id="screen" width="640" height="480" aria-label="Ghost-Tactics game screen"></canvas>
</div>
<div id="rotateHint">ROTATE YOUR DEVICE FOR A BIGGER SCREEN</div>

<div id="overlay" class="hidden">
  <!-- High-score initial entry -->
  <div id="entryModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="entryTitle">
    <h2 id="entryTitle">NEW HIGH SCORE!</h2>
    <p>LEVEL REACHED: <span id="entryLevel">001</span></p>
    <p>ENTER YOUR INITIALS</p>
    <div class="slots">
      <div class="slot" data-i="0"><button type="button" class="up" aria-label="next letter">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="previous letter">&#9660;</button></div>
      <div class="slot" data-i="1"><button type="button" class="up" aria-label="next letter">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="previous letter">&#9660;</button></div>
      <div class="slot" data-i="2"><button type="button" class="up" aria-label="next letter">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="previous letter">&#9660;</button></div>
    </div>
    <input id="entryInput" type="text" maxlength="3" inputmode="text" autocomplete="off"
           autocapitalize="characters" spellcheck="false" pattern="[A-Z]{3}" aria-label="Initials (3 letters A-Z)">
    <div class="hint">SPIN THE SLOTS OR TYPE A-Z &middot; ENTER = OK</div>
    <div class="err" id="entryErr"></div>
    <button type="button" class="btn" id="entrySubmit">OK!</button>
  </div>

  <!-- Leaderboard -->
  <div id="rankModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="rankTitle">
    <h2 id="rankTitle">TOP 10 GHOST MASTERS</h2>
    <table class="rank">
      <thead><tr><th>#</th><th>NAME</th><th>LEVEL</th><th>DATE</th></tr></thead>
      <tbody id="rankBody"><tr><td colspan="4">LOADING...</td></tr></tbody>
    </table>
    <div id="rankStatus"></div>
    <button type="button" class="btn alt" id="rankClose">CLOSE</button>
  </div>
</div>

<noscript>Ghost-Tactics needs JavaScript enabled.</noscript>

<script>window.GT_ASSET_VER = <?= json_encode($assetVer) ?>;</script>
<script src="<?= htmlspecialchars($v('sprites.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
<script src="<?= htmlspecialchars($v('sound.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
<script src="<?= htmlspecialchars($v('game.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
</body>
</html>
