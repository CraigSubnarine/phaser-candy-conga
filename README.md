# phaser-candy-conga

**Candy Conga**: a candy chain shooter in 3D with three.js (it began in Phaser 3, hence the folder and repo name; renaming would break the live link). Chains of candies dance down candy-cane roads towards hungry monsters. Your gumball machine fires candies into the chain: line up 3 or more of a color and they pop. Clear every candy before the monsters eat them.

No build step and no asset files: the 3D models are built from shapes in code, the candy markings are painted on canvas textures, the sounds are synthesized, and every level is generated.

- **Play:** https://craigsubnarine.github.io/phaser-candy-conga/
- **Repo:** https://github.com/CraigSubnarine/phaser-candy-conga
- **Run locally:** the `gamedev` preview server at http://localhost:8765/phaser-candy-conga/ (or `node tools/server.js` from a script)
- **Controls:** phone: touch anywhere and drag to aim, let go to shoot. Tap the gumball machine, or the button at the bottom, to swap your two candies. Computer: aim with the mouse, click to shoot, right-click or Space to swap. Pause with the top-right button or Esc / P.
- **Status:** v2, live: moved from Phaser to three.js (glossy rolling candies, candy-cane curbs, 3D monsters and gumball machine, a tilted camera). Levels mode, Gauntlet and power-ups all work; the leaderboard (shared Supabase backend) is next.

## How it plays

- **The chain:** candies come out of a jar at the start of each road and roll towards a monster. Shots land in the chain and push it along. 3+ touching candies of one color pop. If that leaves the same color on both sides of the gap, the front part slides back to meet the back part, and they pop too: a **chain reaction**. One shot that pops more than once is a **combo** (x2, x3...), and each extra pop scores more.
- **Your candies:** you hold two, in random colors (only colors still on the board), and swap between them. Now and then you get a rainbow candy that matches anything.
- **Stars:** you start with 3. A candy reaching a monster costs a star, and the chain is pushed back. With no stars left, it's over.
- **Jawbreakers** (from level 25): grey candies that never match. They crack when a match pops right next to them.
- **Power-ups:** combos fill the combo meter; plain matches don't. Each chain reaction is one notch: 1 for the first power-up of a level, then 2, then 3... When it's full you get a random power-up straight away (never the same one twice running), and its name flashes up. It lasts until the end of the level:
  - **Cherry Bomb:** your next shot explodes.
  - **Pop Rocks:** your next shot zaps every candy of the color it hits.
  - **Taffy Pull:** pulls every chain back.
  - **Syrup:** slows the chains for 10 s.
  - **Rainbow Drop:** your candy turns wild.
  - **Licorice Laser:** for 15 s, shots arc over everything and land where you aim.

## Modes

- **Levels:** at least 100 levels (the list grows past 100 as you unlock more). Each starts with 3 stars, and the stars you keep are its rating. Clear one to unlock the next. Best score and stars per level are saved.
- **Gauntlet:** every level, one after another, with 3 stars for the whole climb. Your score and the level you reach are your best. This is the leaderboard mode.

## Levels are generated

`js/levels.js` builds level *n* from its own seed, so a level is the same for everyone.
- **Shapes:** Lollipop Swirl (spiral), Donut Loop (rounded-square laps), Ribbon Candy (back-and-forth lanes), Taffy Wave (wobbly lanes) and Gummy Trail (a random walk smoothed into curves).
- **Roads:** from level 10 a level can have 2 roads, from level 35 up to 3. They sit in split regions, sometimes as mirror-image twins, and sometimes run into one shared monster.
- **The gumball machine** goes wherever it's clear of every road and sees the most of them.
- **Rules:** every layout is checked: roads stay on screen, never touch themselves or each other, have no tight kinks, and keep jars, monsters and the machine apart. A layout that fails is thrown away and another is tried.
- **Difficulty:** `spec(n)` in `js/data.js` sets colors (3 → 6), chain speed, candy count, jawbreakers and rainbow chance, rising until level 120.

## Replay and competition hooks

- A score always: candies popped, multiplied by how deep in the combo they popped, plus a star bonus per level.
- Star ratings on 100+ levels, and a running total on the main menu.
- Gauntlet: an endless climb through every level with one set of stars (best score + level saved).
- Seeded levels: everyone gets the same level *n*, ready for per-level and Gauntlet leaderboards.
- Next: Supabase leaderboards (Gauntlet, per level, a daily level), then online versus on the same level.

## Code layout

- `index.html`: the page, menus and HUD (HTML/CSS), the import map for three.js and the script tags.
- `js/data.js`: constants, candies, power-ups, rules and the difficulty curve.
- `js/levels.js`: the level generator and the rules every level must pass.
- `js/chain.js`: the chain model (Board): rolling, inserting, matching, chain reactions, monsters, power-ups, the candies you hold. No three.js, so it's tested in Node.
- `js/art.js` (module): the 3D models and textures: candies, gumball machine, monsters, jars, curbs, the painted board.
- `js/ui.js`: saves, sound, menus and input.
- `js/game.js` (module): the three.js scene: camera fit, drawing the board, shots, aiming (a ray onto the board), effects, HUD.

## Testing

- `node tools/check.js`: generates levels 1-150 and checks every rule, determinism and variety, plus the chain rules on a test road. It writes `playtest-output/levels.html`, a contact sheet of levels 1-100.
- `node tools/playtest.js`: plays the real page headlessly on a phone and a desktop screen. It covers:
  - menus, the levels grid, real taps, swapping, pause and auto-pause
  - a bot that clears levels 1, 2 and a 2-road and a 3-road level
  - breaches and failing a level
  - a real combo giving a random power-up, and every power-up's effect
  - the Gauntlet carrying stars and score
  - every level 1-100 building in the game

  It runs WebGL on SwiftShader (headless Chromium has no GPU), saves screenshots to `playtest-output/` (git-ignored) and needs `playwright-core`; see `GameDev/CLAUDE.md` for the `NODE_PATH` on this PC.

## What I learned

- **A chain on a path:** keep each candy's distance along the road (`s`), not its x/y. Only the back candy moves; a "resolve" pass pushes anything touching it. Gaps, the magnet and inserts are then just number shuffling, and easy to test without a browser.
- **Generated levels:** generate, validate, retry. Cheap shape generators plus a strict rule checker make far more variety than hand-made levels. Check the roads first and place the player only after they pass, or most of the time goes on layouts that get thrown away.
