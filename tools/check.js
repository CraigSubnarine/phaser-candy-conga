// Checks the level generator and the chain rules in Node (no browser), then draws every level on one page.
// Run from this game's folder: node tools/check.js   -> exits 1 on any failure; contact sheet in playtest-output/levels.html
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the game's plain scripts the way the page does: in order, sharing globals.
for (const f of ['data.js', 'levels.js', 'chain.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const G = name => vm.runInThisContext(name);
const [makeLevel, levelProblems, Board, pointAt, D, JAW, STEP, RULES, spec, rollQueue, makeRng] = ['makeLevel', 'levelProblems', 'Board', 'pointAt', 'D', 'JAW', 'STEP', 'RULES', 'spec', 'rollQueue', 'makeRng'].map(G);

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
  const power = b.events.find(e => e.type === 'power');
  check('a chain reaction is a combo; a full meter gives a random power-up right away', RULES.meterFirst === 1 && !!power && b.meter === 0, `meter ${b.meter}, power ${power?.id}`);
  check('...and the next power-up needs one more combo', b.meterNeed === RULES.meterFirst + RULES.meterStep, `${b.meter}/${b.meterNeed}`);
  const given = Array.from({ length: 40 }, () => b.award());
  check('every power-up comes up, never the same one twice running', new Set(given).size === 6 && given.every((id, i) => i === 0 || id !== given[i - 1]), given.slice(0, 8).join(','));
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
{
  // a tester cleared the road and waited ~15 s for candies: the jar's next candies must rush out again
  const L = makeLevel(5), b = new Board(L), ch = b.chains[0];
  while (ch.rollIn) b.step(1 / 60);
  run(b, 2);
  b.removeAll(ch, ch.orbs.filter(o => o.s > 0)); // pop every candy on the road
  let t = 0;
  while (t < 30 && !(ch.orbs.length && ch.orbs.at(-1).s > 0.2 * ch.track.len)) { b.step(1 / 60); t += 1 / 60; }
  check('a cleared road fills again quickly while the jar has candies', t < 3, `${t.toFixed(1)} s`);
  ch.orbs = [];
  b.apply('rewind');
  run(b, 3);
  check('Taffy Pull on an empty road does not stop candies coming', ch.orbs.length > 3, `${ch.orbs.length} candies`);
}

// ---------- Tuning from the Zuma Deluxe research ----------
{
  const by = k => levels.find(L => L.n > 10 && L.tracks.length === k);
  const sp = k => { const L = by(k), b = new Board(L); return b.speed / L.spec.speed; };
  check('chains roll slower on 2- and 3-road levels', Math.abs(sp(2) - 0.8) < 1e-9 && Math.abs(sp(3) - 0.7) < 1e-9, `${sp(2)}, ${sp(3)}`);
  const dips = [5, 21, 51].map(n => spec(n).speed < spec(n - 1).speed && spec(n + 5).speed > spec(n - 1).speed);
  check('chains slow down for a few levels when a new color arrives (5, 21, 51)', dips.every(Boolean), dips.join(','));
  const repeats = n => { const q = rollQueue(makeRng(9), { ...spec(n), jaw: 0, colors: 6 }, 4000); return q.filter((c, i) => i && c === q[i - 1]).length / q.length; };
  check('later levels have shorter runs of one color', repeats(1) > repeats(100) + 0.1, `${repeats(1).toFixed(2)} -> ${repeats(100).toFixed(2)}`);
}
{
  const g = new Board(makeLevel(1), { mode: 'gauntlet', stars: 1, score: RULES.starEvery - 10 });
  g.addScore(20);
  const lv = new Board(makeLevel(1), { stars: 1, score: RULES.starEvery - 10 });
  lv.addScore(20);
  const full = new Board(makeLevel(1), { mode: 'gauntlet', stars: 3, score: RULES.starEvery - 10 });
  full.addScore(20);
  check('Gauntlet: every 50,000 points wins back a star (never more than 3, and not in Levels mode)', g.stars === 2 && g.events.some(e => e.type === 'star') && lv.stars === 1 && full.stars === 3, `${g.stars} ${lv.stars} ${full.stars}`);
}
{
  const b = new Board(makeLevel(1));
  b.time = b.par - 1;
  const ace = b.clearBonus().ace;
  b.time = b.par + 1;
  check('clearing within par time scores the ace bonus', b.par > 20 && ace === RULES.aceBonus && b.clearBonus().ace === 0, `par ${b.par}`);
}
{
  const { b, ch } = boardWith([4, 2, 1, 1, 5]);
  b.chains[0].samples = Array.from({ length: 160 }, (_, i) => ({ x: i * 24, y: 500, s: i * 24 }));
  for (const o of ch.orbs.slice(2)) o.s += 300; // a gap between the 2 and the 1s
  const mid = (ch.orbs[1].s + ch.orbs[2].s) / 2;
  check('a gap in a chain is found where the road crosses it', b.gapAt(mid, 500 + 10) === 0 && b.gapAt(mid, 500 + 2 * D) === -1 && b.gapAt(100, 500) === -1);
  const p = pointAt(ch.track, ch.orbs[2].s);
  b.hit(ch, 2, p.x - 10, p.y, 1, null, 1); // through one gap, then 1,1,1 pops
  const bonus = b.events.find(e => e.type === 'bonus');
  check('a shot through a gap that makes a match scores the gap bonus', bonus?.points === RULES.gapBonus && b.score === 30 + RULES.gapBonus, `${b.score}`);
  const { b: b2, ch: c2 } = boardWith([2, 3]);
  b2.hit(c2, 0, 190, 500, 1, null, 1);
  check('...but not when it makes no match', !b2.events.some(e => e.type === 'bonus'));
}
{
  const rev = levels.filter(L => L.n <= 100 && L.rev), mid = { x: G('W') / 2, y: G('H') / 2 };
  const out = L => { const t = L.tracks[0], j = { x: t.pts[0], y: t.pts[1] }, h = L.holes[0]; return Math.hypot(j.x - mid.x, j.y - mid.y) < Math.hypot(h.x - mid.x, h.y - mid.y); };
  check('some later swirls and donuts run backwards: from a jar in the middle out to a monster at the edge', rev.length >= 3 && rev.every(L => L.n >= 40 && /Inside-Out/.test(L.name) && out(L)), rev.map(L => L.n).join(','));
}

// ---------- The browser-only modules at least parse ----------
// (plain `node --check` passes any file with `import` in it without looking; --input-type=module really parses it)
for (const f of ['game.js', 'art.js']) {
  try {
    require('child_process').execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(__dirname, '..', 'js', f)), stdio: 'pipe' });
    check(`js/${f} parses`, true);
  } catch (e) { check(`js/${f} parses`, false, String(e.stderr).split(/\r?\n/).slice(0, 4).join(' ')); }
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
