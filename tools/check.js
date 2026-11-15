// Checks the level generator and the chain rules in Node (no browser), then draws every level on one page.
// Run from this game's folder: node tools/check.js   -> exits 1 on any failure; contact sheet in playtest-output/levels.html
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the game's plain scripts the way the page does: in order, sharing globals.
for (const f of ['data.js', 'levels.js', 'chain.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const G = name => vm.runInThisContext(name);
const [makeLevel, levelProblems, Board, pointAt, D, JAW, STEP, RULES] = ['makeLevel', 'levelProblems', 'Board', 'pointAt', 'D', 'JAW', 'STEP', 'RULES'].map(G);

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

// ---------- Levels ----------
const t0 = Date.now(), levels = [], bad = [];
for (let n = 1; n <= 150; n++) {
  try {
    const L = makeLevel(n), p = levelProblems(L);
    if (p.length) bad.push(`${n}: ${p.join(', ')}`);
    levels.push(L);
  } catch (e) { bad.push(`${n}: ${e.message}`); }
}
check('levels 1-150 generate and pass every rule', !bad.length, bad.slice(0, 5).join(' | '));
check('generating 150 levels is quick', Date.now() - t0 < 15000, `${Date.now() - t0} ms`);
const fallbacks = levels.filter(L => L.fallback).map(L => L.n);
check('few levels fall back to the plain ribbon', fallbacks.length <= 8, fallbacks.join(','));

const sum = L => L.tracks.reduce((a, t) => a + t.pts.reduce((x, v) => x + v, 0), 0) + L.launcher.x * 7 + L.launcher.y;
const again = vm.runInThisContext('levelCache.clear(), makeLevel(37)');
check('the same level number gives the same level', Math.abs(sum(again) - sum(levels[36])) < 1e-3);

const first100 = levels.slice(0, 100);
const fams = new Set(first100.flatMap(L => L.tracks.map(t => t.fam)));
check('every road shape appears in levels 1-100', fams.size === 5, [...fams].join(','));
const counts = new Set(first100.map(L => L.tracks.length));
check('1, 2 and 3 roads all appear', counts.size === 3);
check('some roads share a monster', first100.some(L => L.holes.length < L.tracks.length));
check('some multi-road levels have a monster per road', first100.some(L => L.tracks.length > 1 && L.holes.length === L.tracks.length));
const spots = new Set(first100.map(L => `${Math.floor(L.launcher.x / (W() / 3))},${Math.floor(L.launcher.y / (H() / 3))}`));
check('the gumball machine moves around the board', spots.size >= 5, `${spots.size} of 9 areas`);
let repeats = 0;
for (let i = 1; i < 100; i++) if (levels[i].name === levels[i - 1].name && levels[i].tracks.length === levels[i - 1].tracks.length) repeats++;
check('neighboring levels rarely look alike', repeats <= 5, `${repeats} repeats`);
check('later levels are harder', levels[99].spec.speed > levels[0].spec.speed && levels[99].spec.colors > levels[0].spec.colors && levels[99].spec.count > levels[0].spec.count);
function W() { return G('W'); }
function H() { return G('H'); }

// ---------- Chain rules, on a straight test road ----------
const road = len => { const pts = new Float32Array((len / STEP + 1) * 2); for (let i = 0; i < pts.length / 2; i++) { pts[2 * i] = i * STEP; pts[2 * i + 1] = 500; } return { pts, len, count: 0 }; };
// A board with one road holding exactly these colors, touching, starting 200 px in; nothing moves on its own.
function boardWith(colors, len = 4000) {
  const level = { spec: { colors: 6, speed: 0, count: 0, jaw: 0, wild: 0 }, seed: 1, tracks: [road(len)] };
  const b = new Board(level, { speed: 0 });
  const ch = b.chains[0];
  ch.rollIn = false;
  ch.orbs = colors.map((c, i) => ({ id: 1000 + i, c, s: 200 + i * D }));
  return { b, ch };
}
const colorsOf = ch => ch.orbs.map(o => o.c).join(',');
const run = (b, secs) => { for (let i = 0; i < secs * 60; i++) b.step(1 / 60); };

{
  const { b, ch } = boardWith([0, 0, 1]);
  b.insert(ch, 1, 0, -1);
  check('a shot that makes 3 of a color pops them', colorsOf(ch) === '1' && b.score === 30, colorsOf(ch));
  check('...but a plain match is no combo: the meter stays empty', b.meter === 0 && b.chainN === 0, `meter ${b.meter}`);
}
{
  const { b, ch } = boardWith([2, 1, 3]);
  b.insert(ch, 1, 0, 1);
  check('a shot with no match just joins the chain', colorsOf(ch) === '2,1,0,3' && b.meter === 0, colorsOf(ch));
  check('the candies ahead are pushed up by one candy', Math.abs(ch.orbs[3].s - (200 + 3 * D)) < 0.01);
}
{
  const { b, ch } = boardWith([3, 0, 0, 1, 1, 0, 3]);
  b.insert(ch, 3, 1, -1); // 1,1,1 pops; the 0s on both sides of the gap pull together and pop too
  run(b, 2);
  check('the magnet pulls matching colors together: a chain reaction', colorsOf(ch) === '3,3' && b.chainN >= 1, `${colorsOf(ch)} chain ${b.chainN}`);
  check('chain reactions score more', b.score === 30 + 60, `${b.score}`);
  check('a chain reaction is a combo: one notch on the meter', b.meter === 1, `meter ${b.meter}`);
  b.meter = b.meterNeed;
  b.usePick('slow');
  check('each power-up picked needs one more combo for the next', b.meter === 0 && b.meterNeed === RULES.meterFirst + RULES.meterStep, `${b.meter}/${b.meterNeed}`);
}
{
  const { b, ch } = boardWith([4, 2, 1, 1]);
  for (const o of ch.orbs.slice(2)) o.s += 100; // a gap between 2 and 1
  const before = ch.orbs.map(o => o.s).join();
  run(b, 1);
  check('runs with different colors on both sides of a gap stay put', ch.orbs.map(o => o.s).join() === before);
}
{
  const { b, ch } = boardWith([JAW, 2, 2, 5]);
  b.insert(ch, 2, 2, 1);
  check('a jawbreaker cracks when a match pops next to it', colorsOf(ch) === '5', colorsOf(ch));
}
{
  const { b, ch } = boardWith([1, JAW, 1]);
  b.insert(ch, 2, 1, 1);
  check('...but a jawbreaker never counts towards a match', colorsOf(ch) === '1,-2,1,1', colorsOf(ch));
}
{
  const { b, ch } = boardWith([1, 2, 3], 600); // the front candy is near the end of a 600 px road
  b.speed = 200;
  for (let i = 0; i < 300 && b.stars === 3; i++) b.step(1 / 60);
  check('a candy reaching the monster costs a star', b.stars === 2 && ch.orbs.length === 2, `stars ${b.stars}`);
  const s0 = ch.orbs[1].s;
  b.speed = 0;
  run(b, 1);
  check('...and pushes the chain back', ch.orbs[1].s < s0 - 100, `${Math.round(s0)} -> ${Math.round(ch.orbs[1].s)}`);
  b.stars = 1;
  b.speed = 400;
  run(b, 3);
  check('losing the last star ends it', b.dead);
}
{
  const { b, ch } = boardWith([0, 1, 2, 1, 0]);
  const p = pointAt(ch.track, ch.orbs[2].s);
  b.blast(p.x, p.y, 1.1 * D);
  check('Cherry Bomb clears the candies around it', colorsOf(ch) === '0,0', colorsOf(ch));
}
{
  const { b, ch } = boardWith([0, 1, 2, 1, 0, 1]);
  b.zap(1);
  check('Pop Rocks zaps every candy of one color', colorsOf(ch) === '0,2,0', colorsOf(ch));
}
{
  const { b, ch } = boardWith([0, 1, 2]);
  b.held = [3, 4];
  b.apply('wild');
  b.insert(ch, 1, b.take().c, 1);
  check('a rainbow candy takes the color it hits', colorsOf(ch) === '0,1,1,2', colorsOf(ch));
  b.apply('rewind');
  const s0 = ch.orbs[0].s;
  run(b, 1.2);
  check('Taffy Pull pushes every chain back', ch.orbs[0].s < s0 - 500);
  b.apply('slow');
  check('Syrup slows the chains for a while', b.slow === 10);
  b.apply('bomb');
  check('Cherry Bomb loads the next shot without using up your candy', b.take().kind === 'bomb' && b.next === null);
  const offers = b.offers();
  check('power-up offers are 3 different ones', new Set(offers).size === 3, offers.join(','));
}
{
  const { b } = boardWith([0, 0, 1]);
  b.held = [0, 5];
  b.fixHeld();
  check('you never keep holding a color that left the board', b.held[0] === 0 && b.held[1] !== 5 && [0, 1].includes(b.held[1]));
}
{
  // a real level from the start: candies roll out of the jar, roll in fast, then slow down
  const L = makeLevel(1), b = new Board(L);
  run(b, 8);
  const ch = b.chains[0];
  check('a level opens with the chain rolling in', ch.orbs.length > 5 && !ch.rollIn, `${ch.orbs.length} candies`);
  check('candies never overlap', ch.orbs.every((o, i) => i === 0 || o.s - ch.orbs[i - 1].s >= D - 0.01));
}

// ---------- Contact sheet: every level on one page, to look over by eye ----------
const out = path.resolve(__dirname, '..', 'playtest-output');
fs.mkdirSync(out, { recursive: true });
const ROAD = ['#ff5d8f', '#41c7a8', '#c98a4b'];
const cards = first100.map(L => {
  const roads = L.tracks.map((t, i) => {
    let d = '';
    for (let j = 0; j < t.pts.length / 2; j += 6) d += `${j ? 'L' : 'M'}${t.pts[2 * j].toFixed(0)} ${t.pts[2 * j + 1].toFixed(0)}`;
    return `<path d="${d}" fill="none" stroke="${ROAD[i]}" stroke-width="${D + 10}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`
      + `<circle cx="${t.pts[0]}" cy="${t.pts[1]}" r="${D * 0.7}" fill="#fff" stroke="#333" stroke-width="6"/>`;
  }).join('');
  const holes = L.holes.map(h => `<circle cx="${h.x}" cy="${h.y}" r="${D * 1.2}" fill="#7a4cff"/>`).join('');
  const m = `<circle cx="${L.launcher.x}" cy="${L.launcher.y}" r="${D * 1.1}" fill="#e63946" stroke="#fff" stroke-width="8"/>`;
  return `<figure><svg viewBox="0 0 720 1280"><rect width="720" height="1280" fill="#fff4f8"/>${roads}${holes}${m}</svg>`
    + `<figcaption><b>${L.n}</b> ${L.name}<br>${L.tracks.length} road${L.tracks.length > 1 ? 's' : ''}, ${L.spec.colors} colors, ${L.tracks.map(t => t.count).join('+')} candies${L.fallback ? ' (fallback)' : ''}</figcaption></figure>`;
}).join('\n');
fs.writeFileSync(path.join(out, 'levels.html'), `<!doctype html><meta charset="utf-8"><title>Candy Conga levels 1-100</title>
<style>body{font:13px system-ui;margin:12px;display:grid;grid-template-columns:repeat(auto-fill,150px);gap:10px}figure{margin:0}svg{width:150px;height:267px;border:1px solid #ccc}figcaption{line-height:1.3}</style>
${cards}`);
console.log(`contact sheet: ${path.join(out, 'levels.html')}`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
