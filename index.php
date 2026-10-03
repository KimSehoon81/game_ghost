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
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="csrf-token" content="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
<meta name="theme-color" content="#050d14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Ghost-Tactics 고스트 택틱스</title>
<link rel="preload" as="image" href="sprites.png?v=<?= htmlspecialchars($assetVer, ENT_QUOTES, 'UTF-8') ?>">
<style>
  /* Korean pixel font: Galmuri subset (SIL OFL 1.1, see fonts/OFL.txt) */
  @font-face { font-family: 'GTK9'; src: url('<?= htmlspecialchars($v('fonts/gtk9.woff2'), ENT_QUOTES, 'UTF-8') ?>') format('woff2'); font-display: swap; }
  @font-face { font-family: 'GTK11'; src: url('<?= htmlspecialchars($v('fonts/gtk11.woff2'), ENT_QUOTES, 'UTF-8') ?>') format('woff2'); font-display: swap; }
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
    font-family: 'GTK11', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
  }

  /* Layout: ad bar on top (10% of the screen height), the game fills the rest. */
  :root { --ad-h: clamp(50px, 10vh, 120px); --gap: 6px; }
  @supports (height: 100dvh) { :root { --ad-h: clamp(50px, 10dvh, 120px); } }
  body { display: flex; flex-direction: column; }

  #top-ad-bar {
    flex: 0 0 var(--ad-h); height: var(--ad-h); width: 100%;
    overflow: hidden; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
  }
  #top-ad-bar ins { width: 100%; height: 100%; }

  #game-area { flex: 1 1 auto; position: relative; min-height: 0; margin-top: var(--gap); }

  /* 4:3 retro stage. PC: fixed 640x480 whenever it fits; smaller windows scale it down. */
  #stage {
    position: absolute; left: 50%; top: 50%;
    width: 640px; height: 480px;
    width: min(640px, 100vw, calc((100vh - var(--ad-h) - var(--gap)) * 4 / 3));
    height: min(480px, 75vw, calc(100vh - var(--ad-h) - var(--gap)));
    transform: translate(-50%, -50%);
    background: #000;
    box-shadow: 0 0 0 3px #1c3448, 0 0 40px rgba(106, 156, 196, .22);
  }
  @supports (height: 100dvh) {
    #stage {
      width: min(640px, 100vw, calc((100dvh - var(--ad-h) - var(--gap)) * 4 / 3));
      height: min(480px, 75vw, calc(100dvh - var(--ad-h) - var(--gap)));
    }
  }
  #screen {
    display: block; width: 100%; height: 100%;
    image-rendering: pixelated; image-rendering: crisp-edges;
    touch-action: none; /* we handle drag ourselves */
    cursor: pointer;
  }

  /* Phones / tablets: no 640px cap, use all the space below the ad (4:3 kept). */
  @media (pointer: coarse) {
    #stage {
      width: min(100vw, calc((100vh - var(--ad-h) - var(--gap)) * 4 / 3));
      height: min(75vw, calc(100vh - var(--ad-h) - var(--gap)));
      box-shadow: none;
    }
    @supports (height: 100dvh) {
      #stage {
        width: min(100vw, calc((100dvh - var(--ad-h) - var(--gap)) * 4 / 3));
        height: min(75vw, calc(100dvh - var(--ad-h) - var(--gap)));
      }
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
    margin: 0 0 8px; font-size: 24px; letter-spacing: 1px; font-weight: normal;
    color: var(--accent); text-shadow: 3px 3px 0 #000;
    animation: blink 0.8s steps(2) infinite;
  }
  .modal p { margin: 6px 0; word-break: keep-all; font-size: 20px; font-family: 'GTK9', 'Malgun Gothic', sans-serif; }
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
  .hint { font-size: 12px; opacity: .8; }
  .err { min-height: 18px; color: var(--hot); font-size: 12px; margin: 6px 0; }
  .btn {
    display: inline-block; min-width: 130px; margin: 6px 4px 0; padding: 10px 14px;
    font: 24px 'GTK11', 'Malgun Gothic', sans-serif; letter-spacing: 1px;
    background: var(--hot); color: #fff; border: 3px solid #000;
    box-shadow: inset -4px -4px 0 #7a1414, 4px 4px 0 #000;
    cursor: pointer; touch-action: manipulation;
  }
  .btn.alt { background: #3050d8; box-shadow: inset -4px -4px 0 #1a2a70, 4px 4px 0 #000; }
  .btn:active { transform: translate(2px, 2px); box-shadow: none; }
  .btn:disabled { opacity: .5; }

  table.rank { width: 100%; border-collapse: collapse; margin: 8px 0; font-weight: bold; }
  table.rank th { color: var(--line); border-bottom: 3px solid var(--line); padding: 4px; font-size: 12px; font-weight: normal; }
  table.rank td { padding: 5px 4px; font-size: 20px; font-family: 'GTK9', 'Malgun Gothic', sans-serif; border-bottom: 1px dashed #24405a; }
  table.rank tr:nth-child(1) td { color: #f8d838; }
  table.rank tr:nth-child(2) td { color: #d8d8e8; }
  table.rank tr:nth-child(3) td { color: #f0a050; }
  table.rank tr.me td { background: #3a1420; animation: blink 0.6s steps(2) infinite; }
  #rankStatus { font-size: 12px; opacity: .85; min-height: 16px; }

  /* how to play */
  .help { text-align: left; word-break: keep-all; }
  .help h2 { animation: none; color: var(--accent); }
  .help h3 { margin: 12px 0 6px; font-size: 12px; color: var(--accent); font-weight: normal; letter-spacing: 1px; }
  .help ol, .help ul { margin: 0; padding-left: 26px; }
  .help li { margin: 4px 0; font-size: 20px; line-height: 1.25; font-family: 'GTK9', 'Malgun Gothic', sans-serif; }
  .help b { color: var(--accent); font-weight: normal; }
  .help .note { font-size: 12px; opacity: .8; margin: 8px 0 0; }
  .help .btn { display: block; margin: 14px auto 0; }
  @media (max-width: 480px) { .modal { padding: 12px 10px; } .help ol, .help ul { padding-left: 22px; } }

  #rotateHint {
    position: fixed; left: 0; right: 0; bottom: 8px; text-align: center;
    font-size: 12px; opacity: .6; pointer-events: none;
  }
  @media (orientation: landscape), (min-width: 701px) { #rotateHint { display: none; } }
  noscript { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
</style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4148146820367094" crossorigin="anonymous"></script>
</head>
<body>
<!-- ── 상단 분리형 광고 프레임 (게임과 독립, 전체 높이의 10%) ── -->
<div id="top-ad-bar" aria-label="광고">
  <ins class="adsbygoogle"
       style="display:block;width:100%;height:100%"
       data-ad-client="ca-pub-4148146820367094"
       data-ad-slot="6398772441"
       data-ad-format="horizontal"
       data-full-width-responsive="true"></ins>
</div>
<div id="game-area">
  <div id="stage">
    <canvas id="screen" width="640" height="480" aria-label="Ghost-Tactics game screen"></canvas>
  </div>
</div>
<div id="rotateHint">기기를 가로로 돌리면 더 크게 보여요</div>

<div id="overlay" class="hidden">
  <!-- High-score initial entry -->
  <div id="entryModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="entryTitle">
    <h2 id="entryTitle">신기록!</h2>
    <p>도달 레벨: <span id="entryLevel">001</span></p>
    <p>이니셜 3글자 (영문)</p>
    <div class="slots">
      <div class="slot" data-i="0"><button type="button" class="up" aria-label="다음 글자">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="이전 글자">&#9660;</button></div>
      <div class="slot" data-i="1"><button type="button" class="up" aria-label="다음 글자">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="이전 글자">&#9660;</button></div>
      <div class="slot" data-i="2"><button type="button" class="up" aria-label="다음 글자">&#9650;</button><div class="ch">A</div><button type="button" class="down" aria-label="이전 글자">&#9660;</button></div>
    </div>
    <input id="entryInput" type="text" maxlength="3" inputmode="text" autocomplete="off"
           autocapitalize="characters" spellcheck="false" pattern="[A-Z]{3}" aria-label="이니셜 (영문 3글자)">
    <div class="hint">▲▼로 고르거나 키보드로 입력 &middot; Enter = 등록</div>
    <div class="err" id="entryErr"></div>
    <button type="button" class="btn" id="entrySubmit">등록!</button>
  </div>

  <!-- Leaderboard -->
  <div id="rankModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="rankTitle">
    <h2 id="rankTitle">유령 마스터 TOP 10</h2>
    <table class="rank">
      <thead><tr><th>순위</th><th>이름</th><th>레벨</th><th>날짜</th></tr></thead>
      <tbody id="rankBody"><tr><td colspan="4">불러오는 중…</td></tr></tbody>
    </table>
    <div id="rankStatus"></div>
    <button type="button" class="btn alt" id="rankClose">닫기</button>
  </div>

  <!-- How to play -->
  <div id="helpModal" class="modal help hidden" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <h2 id="helpTitle">게임 방법</h2>
    <h3>▶ 플레이</h3>
    <ol>
      <li><b>카드</b>를 눌러 유령 구매 (대기석 16칸)</li>
      <li>유령을 <b>왼쪽 진영(3×5)</b>에 배치<br>(끌어다 놓거나, 누르고 칸 누르기)</li>
      <li><b>공격 범위</b>가 옅게 보여요<br>주황 = 근접 · 파랑 = 원거리</li>
      <li><b>[전투 시작!]</b> → 자동 전투</li>
    </ol>
    <h3>▶ 레벨업 하는 법</h3>
    <ul>
      <li><b>이기면 다음 레벨!</b> 레벨이 오를수록 적도 강해져요</li>
      <li>배치 인원은 레벨에 따라 늘어 <b>최대 9명</b> (적은 최대 15마리)</li>
      <li>같은 유령 <b>3마리 = ★ 강화</b></li>
      <li>서양·동양 2종/4종 = <b>시너지</b> · <b>제단</b> = 영구 강화</li>
      <li>지면 목숨 -1 (0이 되면 끝)</li>
    </ul>
    <h3>▶ 보스와 강한 적</h3>
    <ul>
      <li><b>5레벨마다 배경이 바뀌고 보스</b>가 2~7마리 나와요</li>
      <li>적 색깔 = 등급: <b style="color:#58b8ff">정예</b> · <b style="color:#c080ff">용사</b> · <b style="color:#ffc830">전설</b></li>
      <li>위험 기술: <b style="color:#a8e8ff">빙결</b>(얼음) · <b style="color:#7ad04a">독안개</b> · <b style="color:#ff7a2a">지옥불</b>(빨간 표시 1초 뒤 폭발) · <b style="color:#ff4060">공포의 포효</b></li>
      <li>지옥불·독안개는 <b>뭉쳐 있을수록 위험</b> → 흩어서 배치! (준비 화면 오른쪽에 경고가 떠요)</li>
      <li>보스는 체력이 절반이 되면 <b>광폭화</b></li>
    </ul>
    <h3>▶ 주의: 영구 소멸</h3>
    <ul>
      <li>전투에서 쓰러진 유령은 <b>해골 표시</b>가 붙어요</li>
      <li>해골 표시 유령이 <b>또 쓰러지면 영원히 사라져요</b></li>
      <li>같은 유령 3마리로 ★합성하면 부상이 나아요</li>
      <li>사라진 유령의 영혼은 판매가의 절반을 골드로 돌려줘요</li>
    </ul>
    <h3>▶ 저장</h3>
    <ul>
      <li><b>자동 저장</b>: 꺼도 [이어하기]로 계속</li>
      <li>전투 중에 꺼지면 그 레벨 <b>준비 화면부터</b><br>(같은 레벨에서 또 끄면 목숨 -1)</li>
    </ul>
    <p class="note">키보드: F 전투 · R 새로고침 · A 제단 · 1~5 구매 · S 판매 · M 소리 · H 도움말</p>
    <button type="button" class="btn" id="helpClose">알겠어요!</button>
  </div>
</div>

<noscript>자바스크립트를 켜야 플레이할 수 있어요.</noscript>

<script>try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ad blocked */ }</script>
<script>window.GT_ASSET_VER = <?= json_encode($assetVer) ?>;</script>
<script src="<?= htmlspecialchars($v('sprites.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
<script src="<?= htmlspecialchars($v('sound.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
<script src="<?= htmlspecialchars($v('game.js'), ENT_QUOTES, 'UTF-8') ?>"></script>
</body>
</html>
