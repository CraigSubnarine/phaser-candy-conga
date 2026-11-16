# phaser-candy-conga

**Candy Conga**: a candy chain shooter in 3D with three.js (it began in Phaser 3, hence the folder and repo name; renaming would break the live link). Chains of candies dance down candy-cane roads towards hungry monsters. Your gumball machine fires candies into the chain: line up 3 or more of a color and they pop. Clear every candy before the monsters eat them.

No build step and no asset files: the 3D models are built from shapes in code, the candy markings are painted on canvas textures, the sounds are synthesized, and every level is generated.

- **Play:** https://craigsubnarine.github.io/phaser-candy-conga/
- **Repo:** https://github.com/CraigSubnarine/phaser-candy-conga
- **Run locally:** the `gamedev` preview server at http://localhost:8765/phaser-candy-conga/ (or `node tools/server.js` from a script)
- **Controls:** phone: touch anywhere and drag to aim, let go to shoot. Tap the gumball machine, or the button at the bottom, to swap your two candies. Computer: aim with the mouse, click to shoot, right-click or Space to swap. Pause with the top-right button or Esc / P.
- **Status:** v2, live: moved from Phaser to three.js (glossy rolling candies, candy-cane curbs, 3D monsters and gumball machine, a tilted camera). Levels mode, Gauntlet, power-ups and leaderboards (Google sign-in, shared Supabase backend) all work.

## How it plays

- **The chain:** candies come out of a jar at the start of each road and roll towards a monster. Shots land in the chain and push it along. 3+ touching candies of one color pop. If that leaves the same color on both sides of the gap, the front part slides back to meet the back part, and they pop too: a **chain reaction**. One shot that pops more than once is a **combo** (x2, x3...), and each extra pop scores more.
- **Your candies:** you hold two, in random colors (only colors still on the board), and swap between them. Now and then you get a rainbow candy that matches anything.
- **Stars:** you start with 3. A candy reaching a monster costs a star, and the chain is pushed back. With no stars left, it's over.
- **Jawbreakers** (from level 25): grey candies that never match. They crack when a match pops right next to them.
- **Bonuses:** a **gap shot** (a shot that flies right through a gap in a chain, then makes a match) scores +100 per gap. Every level has a **par time** (12 s + 0.9 s per candy, shown in the HUD); clear it within par for +1000 **ace time**, on top of +500 per star left.
- **Power-ups:** combos fill the combo meter; plain matches don't. Each chain reaction is one notch: 1 for the first power-up of a level, then 2, then 3... When it's full you get a random power-up straight away (never the same one twice running), and its name flashes up. It lasts until the end of the level:
  - **Cherry Bomb:** your next shot explodes.
  - **Pop Rocks:** your next shot zaps every candy of the color it hits.
  - **Taffy Pull:** pulls every chain back.
  - **Syrup:** slows the chains for 10 s.
  - **Rainbow Drop:** your candy turns wild.
  - **Licorice Laser:** for 15 s, shots arc over everything and land where you aim.

## Modes

- **Levels:** at least 100 levels (the list grows past 100 as you unlock more). Each starts with 3 stars, and the stars you keep are its rating. Clear one to unlock the next. Best score and stars per level are saved.
- **Gauntlet:** every level, one after another, with 3 stars for the whole climb. Every 50,000 points wins back a lost star (up to 3). Your score and the level you reach are your best. This is the leaderboard mode.

## Levels are generated

`js/levels.js` builds level *n* from its own seed, so a level is the same for everyone.
- **Shapes:** Lollipop Swirl (spiral), Donut Loop (rounded-square laps; from level 40 most swirls and donuts run Inside-Out, from a jar in the middle to a monster at the edge), Ribbon Candy (back-and-forth lanes), Taffy Wave (wobbly lanes) and Gummy Trail (a random walk smoothed into curves).
- **Roads:** from level 10 a level can have 2 roads, from level 35 up to 3. They sit in split regions, sometimes as mirror-image twins, and sometimes run into one shared monster.
- **The gumball machine** goes wherever it's clear of every road and sees the most of them.
- **Rules:** every layout is checked: roads stay on screen, never touch themselves or each other, have no tight kinks, and keep jars, monsters and the machine apart. A layout that fails is thrown away and another is tried.
- **Difficulty:** `spec(n)` in `js/data.js` sets colors (3 → 6), chain speed, candy count, jawbreakers, rainbow chance and how often a candy repeats the color before it (50% → 30%: shorter runs later), rising until level 120. Chains roll 20% slower on 2-road levels and 30% slower on 3-road ones, and 15% slower for a few levels whenever a new color arrives (levels 5, 21, 51). These tweaks came from Zuma Deluxe's level tables.

## Replay and competition hooks

- A score always: candies popped, multiplied by how deep in the combo they popped, plus gap-shot, ace-time and star bonuses.
- Star ratings on 100+ levels, and a running total on the main menu.
- Gauntlet: an endless climb through every level with one set of stars (best score + level saved).
- Seeded levels: everyone gets the same level *n*, ready for per-level and Gauntlet leaderboards.
- Leaderboards and accounts (2026-11-16): optional Google sign-in through the Arcade's shared backend (`js/arcade.js`). Boards: the Gauntlet and every level (`level-<n>`), each player's best. Signed in, a cleared level or a finished Gauntlet posts its score and shows your rank on that board. The main menu shows your player name (Change name / Sign out). Stars, level bests and the Gauntlet best are kept in a cloud save. Guests play as before, and their bests post the first time they sign in.
- Next: a daily level board, then online versus on the same level.

## Code layout

- `index.html`: the page, menus and HUD (HTML/CSS), the import map for three.js and the script tags.
- `js/data.js`: constants, candies, power-ups, rules and the difficulty curve.
- `js/levels.js`: the level generator and the rules every level must pass.
- `js/chain.js`: the chain model (Board): rolling, inserting, matching, chain reactions, monsters, power-ups, the candies you hold. No three.js, so it's tested in Node.
- `js/art.js` (module): the 3D models and textures: candies, gumball machine, monsters, jars, curbs, the painted board.
- `js/ui.js`: saves, sound, menus and input.
- `js/arcade.js`: Google sign-in, leaderboards and cloud saves through the Arcade's shared Supabase backend. The same file goes in every game (see `GameDev/CLAUDE.md`); `node tools/arcade-check.js` checks its score queue.
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
