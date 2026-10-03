<?php
/**
 * Ghost-Tactics :: JSON API
 *
 *   GET  save.php?action=rankings                 -> top 10 leaderboard
 *   GET  save.php?action=token                    -> fresh CSRF token (after the session expired)
 *   POST save.php  {action:"rankings"}            -> same
 *   POST save.php  {action:"new_game"}            -> reset the run in this session
 *   POST save.php  {action:"save_progress", player_id, level, gold, lives, power, state}
 *   POST save.php  {action:"load_progress", player_id}
 *   POST save.php  {action:"clear_progress", player_id}
 *   POST save.php  {action:"submit_score", initial:"ABC", level}
 *
 * POST requests must carry the session CSRF token in the X-CSRF-Token header
 * (or a "csrf" field). Bodies may be JSON or form-encoded.
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

gt_session_start();

function respond(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $error, int $code = 400): void
{
    respond(['ok' => false, 'error' => $error], $code);
}

/** Strict integer in [min,max], or null. Accepts ints and digit strings only. */
function int_in($v, int $min, int $max): ?int
{
    if (is_int($v)) {
        $n = $v;
    } elseif (is_string($v) && preg_match('/^-?\d{1,10}$/D', $v)) {
        $n = (int) $v;
    } elseif (is_float($v) && floor($v) === $v) {
        $n = (int) $v;
    } else {
        return null;
    }
    return ($n >= $min && $n <= $max) ? $n : null;
}

function valid_player_id($v): ?string
{
    return (is_string($v) && preg_match('/^[a-f0-9]{32}$/D', $v)) ? $v : null;
}

function fetch_top(PDO $db): array
{
    $stmt = $db->query(
        'SELECT id, initial, level_reached, DATE_FORMAT(created_at, "%Y-%m-%d") AS created_at
           FROM rankings
          ORDER BY level_reached DESC, created_at ASC, id ASC
          LIMIT ' . (int) GT_TOP_N
    );
    $rows = $stmt->fetchAll();
    foreach ($rows as $i => &$r) {
        $r['rank'] = $i + 1;
        $r['id'] = (int) $r['id'];
        $r['level_reached'] = (int) $r['level_reached'];
    }
    return $rows;
}

// ---------------------------------------------------------------- routing
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$in = [];

if ($method === 'GET') {
    $action = (string) ($_GET['action'] ?? 'rankings');
    if ($action === 'token') {
        // Same-origin JSON only (no CORS), so other sites cannot read it.
        respond(['ok' => true, 'token' => gt_csrf_token()]);
    }
    if ($action !== 'rankings') {
        fail('METHOD_NOT_ALLOWED', 405);
    }
} elseif ($method === 'POST') {
    $ctype = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ctype, 'application/json') !== false) {
        $raw = file_get_contents('php://input', false, null, 0, 32768);
        $in = json_decode((string) $raw, true);
        if (!is_array($in)) {
            fail('BAD_JSON');
        }
    } else {
        $in = $_POST;
    }
    $action = is_string($in['action'] ?? null) ? $in['action'] : '';

    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($in['csrf'] ?? '');
    if (!is_string($token) || empty($_SESSION['gt_csrf']) || !hash_equals($_SESSION['gt_csrf'], $token)) {
        fail('BAD_CSRF', 403);
    }
} else {
    header('Allow: GET, POST');
    fail('METHOD_NOT_ALLOWED', 405);
}

try {
    switch ($action) {

        // ------------------------------------------------------ leaderboard
        case 'rankings':
            respond(['ok' => true, 'rankings' => fetch_top(gt_db())]);
            break;

        // ------------------------------------------------------ new run
        case 'new_game':
            $_SESSION['gt_run_level'] = 1;
            $_SESSION['gt_run_t'] = microtime(true);
            respond(['ok' => true]);
            break;

        // ------------------------------------------------------ save
        case 'save_progress':
            $pid   = valid_player_id($in['player_id'] ?? null);
            $level = int_in($in['level'] ?? null, 1, GT_MAX_LEVEL);
            $gold  = int_in($in['gold'] ?? 0, 0, 1000000000);
            $lives = int_in($in['lives'] ?? 0, 0, 9);
            $power = int_in($in['power'] ?? 0, 0, 100000);
            if ($pid === null || $level === null || $gold === null || $lives === null || $power === null) {
                fail('INVALID_PROGRESS');
            }
            $state = $in['state'] ?? null;
            $json = is_string($state) ? $state : json_encode($state);
            if (!is_string($json) || strlen($json) > 8000 || !is_array(json_decode($json, true))) {
                fail('INVALID_STATE');
            }

            $db = gt_db();

            // Progression guard: a run gains at most one level per GT_ADV_MIN_S
            // seconds (a real battle takes longer). Skipping k levels at once
            // (saves lost while offline) needs k * GT_ADV_MIN_S since the last
            // accepted advance, so forged saves can never outpace real play.
            $now = microtime(true);
            $run = $_SESSION['gt_run_level'] ?? null;
            $since = $_SESSION['gt_run_t'] ?? null;
            if ($run === null || $since === null) {
                // Fresh session (expired cookie): resume from the stored run.
                $q = $db->prepare('SELECT level, UNIX_TIMESTAMP(updated_at) AS t FROM user_progress WHERE player_id = ?');
                $q->execute([$pid]);
                $known = $q->fetch();
                if ($run === null) {
                    $run = $known ? (int) $known['level'] : 1;
                }
                $since = $known ? min((float) $known['t'], $now) : $now;
            }
            $run = (int) $run;
            $steps = $level - $run;
            if ($steps > 0 && $now - (float) $since < $steps * GT_ADV_MIN_S) {
                fail($steps === 1 ? 'TOO_FAST' : 'PROGRESS_REJECTED', $steps === 1 ? 429 : 409);
            }
            if ($steps > 0 || !isset($_SESSION['gt_run_t'])) {
                $_SESSION['gt_run_t'] = $steps > 0 ? $now : (float) $since;
            }
            $_SESSION['gt_run_level'] = $level;

            $stmt = $db->prepare(
                'INSERT INTO user_progress (player_id, level, gold, lives, power, best_level, team_json)
                 VALUES (:pid, :lvl, :gold, :lives, :power, :lvl2, :team)
                 ON DUPLICATE KEY UPDATE
                    level = VALUES(level), gold = VALUES(gold), lives = VALUES(lives),
                    power = VALUES(power), team_json = VALUES(team_json),
                    best_level = GREATEST(best_level, VALUES(level))'
            );
            $stmt->execute([
                ':pid' => $pid, ':lvl' => $level, ':gold' => $gold, ':lives' => $lives,
                ':power' => $power, ':lvl2' => $level, ':team' => $json,
            ]);
            respond(['ok' => true]);
            break;

        // ------------------------------------------------------ load
        case 'load_progress':
            $pid = valid_player_id($in['player_id'] ?? null);
            if ($pid === null) {
                fail('INVALID_PLAYER');
            }
            $q = gt_db()->prepare(
                'SELECT level, gold, lives, power, best_level, team_json, updated_at
                   FROM user_progress WHERE player_id = ?'
            );
            $q->execute([$pid]);
            $row = $q->fetch();
            if (!$row || (int) $row['lives'] <= 0) {
                respond(['ok' => true, 'progress' => null]);
            }
            $_SESSION['gt_run_level'] = (int) $row['level'];
            $_SESSION['gt_run_t'] = microtime(true);
            respond(['ok' => true, 'progress' => [
                'level'      => (int) $row['level'],
                'gold'       => (int) $row['gold'],
                'lives'      => (int) $row['lives'],
                'power'      => (int) $row['power'],
                'best_level' => (int) $row['best_level'],
                'state'      => json_decode((string) $row['team_json'], true),
                'updated_at' => $row['updated_at'],
            ]]);
            break;

        // ------------------------------------------------------ clear
        case 'clear_progress':
            $pid = valid_player_id($in['player_id'] ?? null);
            if ($pid === null) {
                fail('INVALID_PLAYER');
            }
            $q = gt_db()->prepare('UPDATE user_progress SET lives = 0, team_json = NULL WHERE player_id = ?');
            $q->execute([$pid]);
            respond(['ok' => true]);
            break;

        // ------------------------------------------------------ high score
        case 'submit_score':
            $initial = $in['initial'] ?? null;
            // Strict server-side validation: exactly three uppercase A-Z letters.
            if (!is_string($initial) || !preg_match('/^[A-Z]{3}$/D', $initial)) {
                fail('INVALID_INITIAL');
            }
            $level = int_in($in['level'] ?? null, 1, GT_MAX_LEVEL);
            if ($level === null) {
                fail('INVALID_LEVEL');
            }
            // Only the level this session's run actually reached may be submitted.
            $run = (int) ($_SESSION['gt_run_level'] ?? 0);
            if ($level > $run) {
                fail('LEVEL_NOT_VERIFIED', 409);
            }
            $now = time();
            if (isset($_SESSION['gt_last_submit']) && $now - (int) $_SESSION['gt_last_submit'] < 3) {
                fail('TOO_FAST', 429);
            }

            $db = gt_db();
            $ins = $db->prepare('INSERT INTO rankings (initial, level_reached) VALUES (?, ?)');
            $ins->execute([$initial, $level]);
            $id = (int) $db->lastInsertId();

            $_SESSION['gt_last_submit'] = $now;
            unset($_SESSION['gt_run_level']); // one submission per run

            $r = $db->prepare(
                'SELECT COUNT(*) FROM rankings
                  WHERE level_reached > :lvl
                     OR (level_reached = :lvl2 AND id < :id)'
            );
            $r->execute([':lvl' => $level, ':lvl2' => $level, ':id' => $id]);
            $rank = (int) $r->fetchColumn() + 1;

            respond([
                'ok'       => true,
                'id'       => $id,
                'rank'     => $rank,
                'top10'    => $rank <= GT_TOP_N,
                'rankings' => fetch_top($db),
            ]);
            break;

        default:
            fail('UNKNOWN_ACTION');
    }
} catch (PDOException $e) {
    error_log('[ghost-tactics] DB error: ' . $e->getMessage());
    fail('DB_UNAVAILABLE', 503);
}
