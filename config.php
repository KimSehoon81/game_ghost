<?php
/**
 * Ghost-Tactics :: configuration + PDO connection helper.
 *
 * Edit the defaults below, or set environment variables
 * (GT_DB_HOST, GT_DB_PORT, GT_DB_NAME, GT_DB_USER, GT_DB_PASS)
 * e.g. via Apache "SetEnv GT_DB_PASS secret".
 */
declare(strict_types=1);

// This file is a library: never serve it directly.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit;
}

define('DB_HOST', getenv('GT_DB_HOST') ?: '127.0.0.1');
define('DB_PORT', (int) (getenv('GT_DB_PORT') ?: 3306));
define('DB_NAME', getenv('GT_DB_NAME') ?: 'ghost_tactics');
define('DB_USER', getenv('GT_DB_USER') ?: 'root');
define('DB_PASS', getenv('GT_DB_PASS') !== false ? (string) getenv('GT_DB_PASS') : '');

// Create the database/tables automatically if they are missing
// (handy for XAMPP / MAMP "drop the folder in htdocs" installs).
define('GT_AUTO_MIGRATE', true);

define('GT_MAX_LEVEL', 999);
define('GT_TOP_N', 10);
// Minimum seconds per level a run may advance (the fastest real win is ~1.6 s).
define('GT_ADV_MIN_S', 1.0);

/**
 * Shared PDO instance (lazy). Throws PDOException on failure.
 */
function gt_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 3,
    ];
    $base = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', DB_HOST, DB_PORT);

    try {
        $pdo = new PDO($base . ';dbname=' . DB_NAME, DB_USER, DB_PASS, $opts);
    } catch (PDOException $e) {
        // 1049 = Unknown database -> try to create it once.
        $unknownDb = strpos($e->getMessage(), '1049') !== false;
        if (!GT_AUTO_MIGRATE || !$unknownDb || !preg_match('/^[A-Za-z0-9_]+$/D', DB_NAME)) {
            throw $e;
        }
        $tmp = new PDO($base, DB_USER, DB_PASS, $opts);
        $tmp->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $tmp = null;
        $pdo = new PDO($base . ';dbname=' . DB_NAME, DB_USER, DB_PASS, $opts);
    }

    if (GT_AUTO_MIGRATE) {
        gt_migrate($pdo);
    }
    return $pdo;
}

/**
 * Idempotent schema creation (kept in sync with db.sql).
 */
function gt_migrate(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `user_progress` (
            `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
            `player_id`   CHAR(32)         NOT NULL,
            `level`       INT              NOT NULL DEFAULT 1,
            `gold`        INT              NOT NULL DEFAULT 0,
            `lives`       TINYINT UNSIGNED NOT NULL DEFAULT 3,
            `power`       INT              NOT NULL DEFAULT 0,
            `best_level`  INT              NOT NULL DEFAULT 1,
            `team_json`   TEXT             NULL,
            `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_player` (`player_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rankings` (
            `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `initial`        CHAR(3)      NOT NULL,
            `level_reached`  INT          NOT NULL,
            `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_score` (`level_reached`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function gt_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('GTSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function gt_csrf_token(): string
{
    if (empty($_SESSION['gt_csrf'])) {
        $_SESSION['gt_csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['gt_csrf'];
}
