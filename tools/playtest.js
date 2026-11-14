// Headless playtest for Candy Conga: drives the real page in Chromium on a phone and a desktop screen, checks the
// main flows, saves screenshots to playtest-output/ and exits 1 on any failure or page error.
// Run from this game's folder: node tools/playtest.js   (needs the playwright or playwright-core package + its Chromium)
const path = require('path');
const fs = require('fs');
const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();
const { serve } = require('./server');

let url; // the game, served over http like GitHub Pages does (set when the server starts)
const out = path.resolve(__dirname, '..', 'playtest-output');
fs.mkdirSync(out, { recursive: true });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

// Installed in the page: step the game a frame at a time (much faster than real time), and a bot that keeps the
// Licorice Laser on so every shot lands exactly where it aims, and aims at candies its color can match.
function installHarness() {
  window.__T = performance.now();
  window.__step = n => { for (let i = 0; i < n; i++) { __T += 1000 / 60; game.step(__T, 1000 / 60); } };
  window.__fix = () => { scene().tweens.getDelta = () => 1000 / 60; }; // tweens normally follow the wall clock
  window.__orbs = () => scene().board.chains.reduce((a, ch) => a + ch.orbs.length, 0);
  window.__botShot = () => {
    const s = scene(), b = s.board;
    if (s.cool > 0 || s.intro > 0 || s.ended) return;
    b.laser = Math.max(b.laser, 1);
    let best = null;
    for (const slot of [b.sel, 1 - b.sel]) {
      const c = b.held[slot];
      for (const ch of b.chains) ch.orbs.forEach((o, i) => {
        if (o.s < D || o.s > ch.track.len - D / 2 || !(c === WILD ? o.c >= 0 : o.c === c)) return;
        const pair = j => ch.orbs[j]?.c === o.c && Math.abs(ch.orbs[j].s - o.s) <= D + 1;
        const score = (pair(i - 1) || pair(i + 1) ? 2 : 1) + o.s / ch.track.len;
        if (!best || score > best.score) best = { slot, ch, o, score };
      });
    }
    if (!best) for (const ch of b.chains) { // nothing to match: drop it on the candy nearest a monster
      const o = ch.orbs[ch.orbs.length - 1];
      if (o && o.s >= 0 && (!best || o.s / ch.track.len > best.score)) best = { slot: b.sel, ch, o, score: o.s / ch.track.len };
    }
    if (!best) return;
    if (best.slot !== b.sel) s.swap();
    const p = pointAt(best.ch.track, best.o.s);
    s.fireAt(p.x, p.y);
  };
  // Play until expr is true (or the level ends), picking the first power-up whenever the meter fills.
  window.__bot = (expr, maxSeconds) => {
    const until = new Function(`return ${expr}`);
    for (let f = 0; f < maxSeconds * 60 && !until(); f++) {
      if (app.state === 'pick') { document.querySelector('#pickCards button').click(); continue; }
      if (app.state !== 'playing') break;
      __botShot();
      __step(1);
    }
    return until();
  };
  // Game coordinates -> page coordinates (for real taps and clicks).
  window.__screen = (x, y) => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + x * r.width / W, y: r.top + y * r.height / H }; };
}

const visible = (page, id) => page.evaluate(i => !document.getElementById(i).hidden && !document.getElementById('ui').hidden, id);
const state = page => page.evaluate(() => app.state);

async function run(browser, name, options, full) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location()?.url ?? ''}`.trim()); });
  // After fast-forwarding, the game's real clock would try to catch up minutes at once and stall the next painted
  // frame; resetting it first keeps screenshots quick.
  const shot = file => page.evaluate(() => game.loop.resetDelta())
    .then(() => page.screenshot({ path: path.join(out, `${name}-${file}.png`), timeout: 15000 }))
    .catch(e => check(`${name}: screenshot ${file}`, false, e.message.split('\n')[0]));
  const tap = async (x, y) => {
    const p = await page.evaluate(([x, y]) => __screen(x, y), [x, y]);
    if (options.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  };
  const start = async (mode, level, carry) => {
    await page.evaluate(([m, n, c]) => { startLevel(m, n, c); }, [mode, level, carry]);
    await page.evaluate(() => { __step(1); __fix(); });
  };

  await page.goto(url);
  await page.waitForFunction(() => typeof scene === 'function' && !!scene() && !!scene().board, null, { timeout: 15000 });
  await page.evaluate(installHarness);
  await page.evaluate(() => { __fix(); __step(120); }); // let the menu backdrop roll in
  check(`${name}: main menu on load`, await visible(page, 'main'));
  check(`${name}: Back to Arcade link`, await page.evaluate(() => !!document.querySelector('#main a[href="../"]')));
  await shot('01-menu');

  // ---------- Levels screen ----------
  await page.click('#main [data-action=levels]');
  const grid = await page.evaluate(() => ({ count: document.querySelectorAll('#levelGrid button').length, one: !document.querySelector('[data-level="1"]').disabled, two: document.querySelector('[data-level="2"]').disabled }));
  check(`${name}: levels grid lists 100 levels, 1 open and 2 locked`, grid.count === 100 && grid.one && grid.two, JSON.stringify(grid));
  await shot('02-levels');
  await page.click('[data-level="1"]');
  await page.evaluate(() => { __step(1); __fix(); __step(30); });
  check(`${name}: level 1 starts with its card`, (await state(page)) === 'playing' && (await page.evaluate(() => scene().intro > 0 && scene().n === 1)));
  await shot('03-level-card');
  await page.evaluate(() => __step(60 * 4));
  check(`${name}: the chain rolls in`, await page.evaluate(() => __orbs() > 8 && scene().board.chains[0].orbs.at(-1).s > 300));
  await shot('04-level-1');

  // ---------- Real input ----------
  const target = await page.evaluate(() => { const ch = scene().board.chains[0], o = ch.orbs.at(-1); return pointAt(ch.track, o.s); });
  const before = await page.evaluate(() => ({ fired: scene().fired || 0, hits: scene().hits || 0 }));
  await tap(target.x, target.y);
  await page.evaluate(() => __step(40));
  const after = await page.evaluate(() => ({ fired: scene().fired || 0, hits: scene().hits || 0 }));
  check(`${name}: a real ${options.hasTouch ? 'tap' : 'click'} fires a candy that lands in the chain`, after.fired === before.fired + 1 && after.hits === before.hits + 1, JSON.stringify(after));
  const sel0 = await page.evaluate(() => scene().board.sel);
  await page.click('#swapBtn');
  check(`${name}: the swap button swaps candies (and doesn't shoot)`, (await page.evaluate(() => scene().board.sel)) !== sel0 && (await page.evaluate(() => scene().fired)) === after.fired);
  const m = await page.evaluate(() => scene().level.launcher);
  await page.evaluate(() => __step(20));
  await tap(m.x, m.y);
  check(`${name}: tapping the gumball machine swaps too`, (await page.evaluate(() => scene().board.sel)) === sel0 && (await page.evaluate(() => scene().fired)) === after.fired);
  await page.click('#pauseBtn');
  check(`${name}: pause button pauses without shooting`, (await state(page)) === 'paused' && (await page.evaluate(() => scene().fired)) === after.fired);
  await shot('05-pause');
  await page.click('#pause [data-action=settings]');
  check(`${name}: settings opens from pause`, await visible(page, 'settings'));
  await page.click('#settings [data-action=back]');
  await page.click('#pause [data-action=resume]');
  check(`${name}: resume`, (await state(page)) === 'playing');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check(`${name}: hiding the page pauses`, (await state(page)) === 'paused');
  await page.evaluate(() => { delete document.hidden; resumeGame(); });

  // ---------- Clear level 1 ----------
  const cleared = await page.evaluate(() => __bot(`app.state === 'clear'`, 300));
  const saved = await page.evaluate(() => ({ stars: progress.stars[1], unlocked: progress.unlocked, board: scene().board.stars }));
  check(`${name}: the bot clears level 1, its stars are saved and level 2 unlocks`, cleared && saved.stars === saved.board && saved.unlocked === 2, JSON.stringify(saved));
  await shot('06-clear');
  if (!full) return finish();

  await page.click('#clear [data-action=next]');
  await page.evaluate(() => { __step(1); __fix(); });
  check(`${name}: Next starts level 2`, await page.evaluate(() => app.state === 'playing' && scene().n === 2));
  check(`${name}: the bot clears level 2`, await page.evaluate(() => __bot(`app.state === 'clear'`, 300)));

  // ---------- Bigger levels: 2 and 3 roads ----------
  const multi = await page.evaluate(() => [2, 3].map(k => Array.from({ length: 90 }, (_, i) => i + 10).find(n => makeLevel(n).tracks.length === k)));
  for (const n of multi) {
    await start('levels', n);
    await page.evaluate(() => __bot('scene().t > 7', 10));
    await shot(`07-level-${n}`);
    const ok = await page.evaluate(() => __bot(`app.state === 'clear'`, 600));
    check(`${name}: the bot clears level ${n} (${await page.evaluate(k => makeLevel(k).tracks.length, n)} roads)`, ok, await page.evaluate(() => `stars ${scene().board.stars}, ${__orbs()} candies left`));
  }

  // ---------- Breaches ----------
  await start('levels', 5);
  await page.evaluate(() => { __step(60 * 3); scene().board.speed = 3000; });
  await page.evaluate(() => { for (let i = 0; i < 600 && scene().board.stars === 3; i++) __step(1); });
  const breach = await page.evaluate(() => { const ch = scene().board.chains[0]; return { stars: scene().board.stars, retreat: ch.retreat > 0, head: ch.orbs.at(-1).s }; });
  await page.evaluate(() => { scene().board.speed = 0; __step(60); });
  const pushed = await page.evaluate(() => scene().board.chains[0].orbs.at(-1).s);
  check(`${name}: a candy reaching a monster costs a star and pushes the chain back`, breach.stars === 2 && breach.retreat && pushed < breach.head - 200, `${Math.round(breach.head)} -> ${Math.round(pushed)}`);
  await page.evaluate(() => { scene().board.speed = 3000; for (let i = 0; i < 1500 && app.state === 'playing'; i++) __step(1); });
  check(`${name}: losing all 3 stars fails the level`, await visible(page, 'failed'));
  await shot('08-failed');

  // ---------- Power-ups ----------
  await start('levels', 30);
  await page.evaluate(() => { __step(60 * 5); scene().board.meter = scene().board.meterNeed; __step(1); });
  const pick = await page.evaluate(() => [...document.querySelectorAll('#pickCards button')].map(b => b.dataset.power));
  check(`${name}: a full combo meter offers 3 different power-ups`, (await state(page)) === 'pick' && new Set(pick).size === 3, pick.join(','));
  await shot('09-pick');
  await page.click('#pickCards button');
  check(`${name}: picking one resumes play`, (await state(page)) === 'playing' && (await page.evaluate(() => scene().board.meter < scene().board.meterNeed)));
  const power = await page.evaluate(() => {
    const s = scene(), b = s.board, res = {};
    b.slow = b.laser = 0; b.next = null;
    // aim (with the laser, to land exactly) at a candy well inside the screen
    const pickOrb = () => { for (const ch of b.chains) for (const o of ch.orbs) if (o.s > ch.track.len * 0.1 && o.s < ch.track.len * 0.9 && o.c >= 0) return { ch, o, p: pointAt(ch.track, o.s) }; };
    const fire = t => { s.cool = 0; b.laser = 1; s.fireAt(t.p.x, t.p.y); __step(30); b.laser = 0; };
    let t = pickOrb();
    const near = b.chains.flatMap(ch => ch.orbs.filter(o => o.s >= 0 && Math.hypot(pointAt(ch.track, o.s).x - t.p.x, pointAt(ch.track, o.s).y - t.p.y) < D * 0.9));
    s.powerPicked('bomb');
    res.bombLoaded = b.next === 'bomb';
    fire(t);
    res.bomb = near.every(o => !b.chains.some(ch => ch.orbs.includes(o))) && b.next === null;
    t = pickOrb();
    const sameColor = b.chains.flatMap(ch => ch.orbs.filter(o => o.c === t.o.c)); // (new ones may roll out of the jar after)
    s.powerPicked('zap');
    fire(t);
    res.zap = sameColor.length > 1 && sameColor.every(o => !b.chains.some(ch => ch.orbs.includes(o)));
    const ch0 = b.chains[0], head0 = ch0.orbs.at(-1)?.s ?? 0;
    s.powerPicked('rewind');
    __step(70);
    res.rewind = (ch0.orbs.at(-1)?.s ?? 0) < head0 - 100;
    s.powerPicked('slow');
    __step(1);
    res.slow = b.slow > 9 && s.statusText.text.includes('Syrup');
    s.powerPicked('wild');
    __step(1);
    res.wild = b.held[b.sel] === WILD && document.getElementById('dot0').classList.contains('wild');
    s.powerPicked('laser');
    s.cool = 0;
    t = pickOrb();
    s.fireAt(t.p.x, t.p.y);
    res.laser = b.laser > 14 && !!s.shots.at(-1)?.lob;
    __step(30);
    return res;
  });
  for (const [k, ok] of Object.entries(power)) check(`${name}: power-up works: ${k}`, ok);
  await page.evaluate(() => { scene().aimAt(scene().board.chains[0].orbs.length ? pointAt(scene().board.chains[0].track, scene().board.chains[0].orbs.at(-1).s) : { x: 360, y: 640 }); scene().board.laser = 10; __step(1); });
  await shot('10-laser');

  // ---------- Gauntlet ----------
  await page.evaluate(() => toMenu());
  await page.click('#main [data-action=gauntlet]');
  check(`${name}: Gauntlet explains itself first`, await visible(page, 'gauntletInfo'));
  await page.click('#gauntletInfo [data-action=startGauntlet]');
  await page.evaluate(() => { __step(1); __fix(); });
  check(`${name}: the Gauntlet starts at level 1 with 3 stars`, await page.evaluate(() => scene().mode === 'gauntlet' && scene().n === 1 && scene().board.stars === 3));
  await page.evaluate(() => { __step(200); scene().board.chains[0].orbs.at(-1).s = scene().board.chains[0].track.len; __step(1); }); // lose a star on purpose
  await page.evaluate(() => { __bot('scene().n === 2', 300); __step(1); __fix(); });
  const g2 = await page.evaluate(() => ({ n: scene().n, stars: scene().board.stars, score: scene().board.score, mode: scene().mode }));
  check(`${name}: clearing a Gauntlet level goes straight on, carrying stars and score`, g2.n === 2 && g2.mode === 'gauntlet' && g2.stars === 2 && g2.score > 500, JSON.stringify(g2));
  // (racing chains close gaps into chain reactions; keep the power-up pick out of the way)
  await page.evaluate(() => { __step(90); Object.assign(scene().board, { speed: 3000, meterNeed: Infinity }); for (let i = 0; i < 2000 && app.state === 'playing'; i++) __step(1); });
  const over = await page.evaluate(() => ({ best: store.get('conga-gauntlet-best', {}), text: document.getElementById('overText').textContent }));
  check(`${name}: running out of stars ends the Gauntlet and saves the best`, (await visible(page, 'over')) && over.best.level === 2 && over.best.score > 0, JSON.stringify(over));
  await shot('11-gauntlet-over');

  // ---------- Every level 1-100 builds ----------
  const errs0 = errors.length;
  const sizes = await page.evaluate(() => {
    const roads = [0, 0, 0, 0];
    for (let n = 1; n <= 100; n++) { startLevel('levels', n); __step(2); roads[scene().level.tracks.length]++; }
    return roads;
  });
  check(`${name}: levels 1-100 all build in the game`, errors.length === errs0, `roads: ${sizes.slice(1).join('/')}`);
  for (const n of [10, 35, 60, 100]) {
    await start('levels', n);
    await page.evaluate(() => __step(60 * 5));
    await shot(`12-level-${n}`);
  }
  await page.evaluate(() => toMenu());
  check(`${name}: main menu shows the stars earned`, (await page.evaluate(() => document.getElementById('mainStars').textContent)).includes('/ 300'));
  return finish();

  async function finish() {
    check(`${name}: no page errors`, !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

(async () => {
  const server = await serve(path.resolve(__dirname, '..'));
  url = `${server.url}/index.html`;
  const browser = await chromium.launch();
  try {
    await run(browser, 'phone', { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true);
    await run(browser, 'desktop', { viewport: { width: 1280, height: 800 } }, false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
})();
