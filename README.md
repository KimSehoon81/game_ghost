# Ghost-Tactics

A retro 2D tactical auto-battler for the classic **Apache + PHP + MySQL** stack.
Pure vanilla JS, HTML5 Canvas 2D, and Web Audio. There are no frameworks and no image or audio files.

| File         | Purpose |
|--------------|---------|
| `index.php`  | Game page: 4:3 canvas stage, responsive CSS, arcade modals, CSRF token |
| `game.js`    | Engine: 3×6 grid, shop/bench, drag & drop / tap-to-place, AI, 10 ghost skills, procedural levels, leaderboard UI |
| `sound.js`   | MSX/PSG-style synth: 3 square-wave channels + noise drums, 3 BGM loops, ~25 SFX |
| `save.php`   | JSON API: progress save/load, rankings, high-score submission (`^[A-Z]{3}$`) |
| `config.php` | PDO MySQL connection + auto-migration |
| `db.sql`     | Schema (`user_progress`, `rankings`) |

## Install

1. Copy the folder into your web root (e.g. `htdocs/ghost-tactics/`).
2. Set your DB credentials in `config.php`, or through environment variables
   (`GT_DB_HOST`, `GT_DB_PORT`, `GT_DB_NAME`, `GT_DB_USER`, `GT_DB_PASS`, e.g. `SetEnv` in Apache).
3. Open `http://localhost/ghost-tactics/`.

With `GT_AUTO_MIGRATE` on (the default), the database and tables are created on the first request.
If your DB user can't create databases, import the schema manually: `mysql -u root -p < db.sql`.

Requirements: PHP 7.4+ with `pdo_mysql`, MySQL 5.7+ / MariaDB 10.3+.
If the database is unreachable, the game still runs. Progress and high scores fall back to `localStorage`.

### Opening as a popup

```html
<a href="#" onclick="window.open('ghost-tactics/index.php','ghosttactics','width=660,height=500');return false;">Play Ghost-Tactics</a>
```

## How to play

- **Buy** ghosts from the 5-card shop (tap / click). They auto-deploy while there is room. Otherwise they go to the 8-slot bench.
- **Deploy** by dragging, or tap a ghost and then tap a cell. You place on the left 3 columns of the 3×6 grid. The board cap grows with the level.
- **Merge**: 3 identical ghosts make a 2★ ghost (×1.8 stats), and 3 of those make a 3★ ghost (×3.24).
- **Synergy**: 2/4 distinct Western ghosts give +15%/+35% HP. 2/4 distinct Eastern ghosts give +15%/+35% ATK.
- **Altar**: spend gold for a permanent +6% HP/ATK for the whole team (multiplicative).
- **Fight!** Units auto-target the nearest enemy, walk the grid, attack in range, fill MP and cast skills.
- Winning gives gold (plus interest), and a boss appears every 10 levels. Losing costs a life. At 0 lives the game is over.
- Keys: `F`/`Space` fight, `R` reroll, `A` altar, `1-5` buy, `S` sell, `M` mute.

### Procedural levels (1–999)

Stage maps are never stored. Each wave is generated deterministically from the level number:

```
HP  = BaseHP  * 1.045 ^ Level
ATK = BaseATK * 1.038 ^ Level      (BaseHP/ATK = roster base * 0.8; bosses x3 HP, x1.5 ATK)
```

### Roster

| # | Ghost | Role | Skill |
|---|-------|------|-------|
| 1 | Dracula | Melee Lifesteal | **Blood Feast**: 250% ATK bite, heals all damage dealt (passive 20% lifesteal) |
| 2 | Frankenstein | Tank | **Electric Stun**: 150% ATK to target and adjacent foes, stun 1.5s |
| 3 | Succubus | Ranged | **Charm**: strongest foe in range attacks its own allies for 3s |
| 4 | Mummy | Sub-tank | **Bandage Wrap**: 120% ATK and 2.5s stun on the highest-HP foe |
| 5 | Werewolf | Melee DPS | **Blood Rage**: +100% attack speed for 4s, heal 15% |
| 6 | Gumiho | Ranged DPS | **Fox Orb**: piercing orb, 200% ATK to every foe in its path |
| 7 | Jiangshi | Melee Tank | **Steel Talisman**: 50% max-HP shield on self, 20% on adjacent allies |
| 8 | Palcheok-Gwi | Melee Disrupter | **Po-Po-Po**: binds foes around the target (no move/skill) for 3s, DOT 80% ATK/s for 4s |
| 9 | Maiden Ghost | Ranged Assassin | **Wailing Curse**: 300% ATK on the lowest-HP foe anywhere, +25% damage taken for 4s |
| 10 | Grim Reaper | Ranged Finisher | **Death Note**: executes a foe below 15% HP, otherwise 220% ATK to the lowest-HP% foe |

## API (`save.php`)

| Method | Action | Body |
|--------|--------|------|
| GET    | `?action=rankings` | none |
| POST   | `rankings`, `new_game` | none |
| POST   | `save_progress` | `player_id` (32 hex), `level`, `gold`, `lives`, `power`, `state` (JSON ≤ 8 KB) |
| POST   | `load_progress`, `clear_progress` | `player_id` |
| POST   | `submit_score` | `initial` (**must match `^[A-Z]{3}$`**), `level` |

POST requests need the `X-CSRF-Token` header (the token is issued by `index.php` in a meta tag).
There is also light anti-tamper protection:

- A run may only advance one level per `save_progress`.
- A score can't be higher than the level the session's run actually reached.
- Each run can submit only one score.
- Submissions are rate-limited.
