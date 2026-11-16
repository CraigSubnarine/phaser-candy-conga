// Candy Conga: constants, candies, power-ups and the difficulty curve. Plain script (shared globals, loaded first);
// tools/check.js also runs it in Node, so nothing here may touch Phaser or the page.

const W = 720, H = 1280;          // game size (portrait); Phaser scales it to fit the screen
const D = 46;                     // candy diameter, and the spacing between candies along a road
const STEP = 2;                   // px between the points of a road (levels.js resamples every road to this)
// Road center lines stay inside this box: the HUD sits above it, the swap button below it.
const PLAY = { x0: 40, x1: 680, y0: 165, y1: 1150 };

// Six candy colors, each with its own white marking so they can be told apart without color.
const CANDIES = [
  { name: 'Cherry', color: 0xff4d6d, css: '#ff4d6d', mark: 'swirl' },
  { name: 'Lemon', color: 0xffc93c, css: '#ffc93c', mark: 'dots' },
  { name: 'Mint', color: 0x2ec98a, css: '#2ec98a', mark: 'stripes' },
  { name: 'Blueberry', color: 0x3d8bff, css: '#3d8bff', mark: 'star' },
  { name: 'Grape', color: 0x9b5cff, css: '#9b5cff', mark: 'heart' },
  { name: 'Orange', color: 0xff8a2b, css: '#ff8a2b', mark: 'ring' },
];
const WILD = -1;                  // rainbow candy: takes the color of whatever it hits (shooter only)
const JAW = -2;                   // jawbreaker: never matches, cracks when a match pops right next to it

// One at random when the combo meter fills (chain reactions fill it, plain matches don't). Every one of them ends when the level ends.
const POWERUPS = [
  { id: 'bomb', name: 'Cherry Bomb', desc: 'Your next shot explodes and clears every candy around it.' },
  { id: 'zap', name: 'Pop Rocks', desc: 'Your next shot zaps every candy of the color it hits, on every road.' },
  { id: 'rewind', name: 'Taffy Pull', desc: 'Pulls every chain back down its road.' },
  { id: 'slow', name: 'Syrup', desc: 'Chains crawl at a third of their speed for 10 seconds.' },
  { id: 'wild', name: 'Rainbow Drop', desc: 'Your selected candy turns rainbow: it matches any color.' },
  { id: 'laser', name: 'Licorice Laser', desc: 'For 15 seconds your shots arc over everything and land where you aim.' },
];
const POWER = Object.fromEntries(POWERUPS.map(p => [p.id, p]));

const RULES = {
  shotSpeed: 1500,     // px/s
  cooldown: 0.15,      // seconds between shots
  rollSpeed: 8,        // a level opens with the chain rolling in this many times faster...
  rollIn: 0.3,         // ...until its front is this far along the road
  magnet: 420,         // px/s a chain slides back to join a matching color behind it
  breachTime: 0.8,     // a candy reaching a monster pushes the chain back this long...
  breachBack: 0.25,    // ...by this share of the road
  rewindTime: 1.0, rewindBack: 0.2,
  slowTime: 10, slowMul: 0.35,
  laserTime: 15,
  bombRadius: 2.2 * D,
  meterFirst: 1,       // chain reactions for the first power-up of a level...
  meterStep: 1,        // ...and each pick after that needs one more
  starBonus: 500,      // points per star left when a level is cleared
  roadSpeed: [1, 0.8, 0.7], // chains roll slower on levels with 2 or 3 roads (more to watch at once)
  starEvery: 50000,    // Gauntlet: every this many points wins back a lost star (up to 3)
  gapBonus: 100,       // a shot that passes right through a gap in a chain, then makes a match
  parBase: 12, parPerCandy: 0.9, // par time (s) = base + per candy in the level...
  aceBonus: 1000,      // ...and clearing it within par ("ace time") scores this
};

// The difficulty curve: everything a level asks of you, from its number. Stops rising after level 120.
// A new candy color arrives at levels 5, 21 and 51; the chains slow down 15% then, easing back over 5 levels.
const NEW_COLOR = [5, 21, 51];
function spec(n) {
  const k = Math.min(n, 120) - 1;
  const dip = NEW_COLOR.reduce((f, a) => n >= a && n < a + 5 ? 1 - 0.15 * (1 - (n - a) / 5) : f, 1);
  return {
    colors: n <= 4 ? 3 : n <= 20 ? 4 : n <= 50 ? 5 : 6,
    speed: 30 * (1 + 0.006 * k) * dip,       // px/s the chain rolls (one road; more roads roll slower)
    group: 0.5 - 0.2 * k / 119,              // chance a candy repeats the color before it: runs get shorter later
    count: Math.round(30 + k * 0.5),         // candies in the whole level (spread over its roads)
    jaw: n < 25 ? 0 : Math.min(0.12, 0.03 + (n - 25) * 0.001), // share of jawbreakers
    wild: n <= 3 ? 0 : 0.04,                 // chance a candy you're handed is a rainbow
  };
}
