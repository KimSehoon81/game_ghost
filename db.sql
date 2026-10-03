-- ============================================================
--  Ghost-Tactics  ::  MySQL / MariaDB schema
--  Import:  mysql -u root -p < db.sql
--  (config.php also auto-creates these tables on first request
--   when GT_AUTO_MIGRATE is enabled.)
--
--  NOTE: Stage maps are NOT stored. Enemy waves are generated
--  procedurally from the level number at runtime:
--     HP  = BaseHP  * 1.045 ^ Level
--     ATK = BaseATK * 1.038 ^ Level
-- ============================================================

CREATE DATABASE IF NOT EXISTS `ghost_tactics`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ghost_tactics`;

-- ------------------------------------------------------------
--  Per-device run save (one row per anonymous player id).
--  player_id is a random 32-hex token generated in the browser.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_progress` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `player_id`   CHAR(32)         NOT NULL,
  `level`       INT              NOT NULL DEFAULT 1,
  `gold`        INT              NOT NULL DEFAULT 0,
  `lives`       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `power`       INT              NOT NULL DEFAULT 0,
  `best_level`  INT              NOT NULL DEFAULT 1,
  `team_json`   TEXT             NULL,
  `created_at`  TIMESTAMP        NULL DEFAULT NULL,   -- set by save.php (MySQL/MariaDB 5.5 allow one auto TIMESTAMP)
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  Arcade high-score table. initial must match ^[A-Z]{3}$
--  (enforced in save.php; CHECK is honoured on MySQL 8.0.16+).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rankings` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `initial`        CHAR(3)      NOT NULL,
  `level_reached`  INT          NOT NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_score` (`level_reached`, `created_at`),
  CONSTRAINT `chk_level` CHECK (`level_reached` BETWEEN 1 AND 999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
