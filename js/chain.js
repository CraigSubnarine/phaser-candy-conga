// Candy Conga chain model: candies rolling along roads, shots landing in the chain, matches, chain reactions,
// jawbreakers, monsters eating candies, power-ups and the two candies you hold. Pure JavaScript (no Phaser), so
// tools/check.js can test it in Node; game.js only draws what's in here.
//
// A road is a polyline with a point every STEP px. Each candy's place is `s`, its distance along the road. A chain's
// candies are kept sorted by s (index 0 is at the back). Candies one D apart are touching; the touching run at the
// back is pushed forward, runs ahead of a gap stand still (or slide back to a matching color: the magnet).

function pointAt(track, s) {
  const p = track.pts, last = p.length / 2 - 1;
  const f = Math.max(0, Math.min(s, track.len)) / STEP, i = Math.min(Math.floor(f), last - 1), t = f - i;
  const x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * i + 2], y1 = p[2 * i + 3];
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) };
}

const TOUCH = D + 0.5; // candies this close (or closer) along the road are touching
const sameColor = (a, b) => a >= 0 && a === b;
let candyId = 1;

// The candies a road will send out, rolled from the level's seed: runs of a color are common, jawbreakers rare.
function rollQueue(R, sp, count) {
  const q = [];
  for (let i = 0; i < count; i++) {
    if (i > 3 && sp.jaw && q[i - 1] !== JAW && R.chance(sp.jaw)) { q.push(JAW); continue; }
    const prev = q[i - 1];
    q.push(prev >= 0 && R.chance(0.42) ? prev : R.int(0, sp.colors - 1));
  }
  return q;
}

class Board {
  // opts: stars and score carried in (Gauntlet), speed override (tests).
  constructor(level, opts = {}) {
    this.level = level;
    this.spec = level.spec;
    this.rng = makeRng(level.seed ^ 0x5bd1e995);
    this.speed = opts.speed ?? this.spec.speed;
    this.stars = opts.stars ?? 3;
    this.score = opts.score ?? 0;
    this.combo = 0;        // shots in a row that made a match
    this.chainN = 0;       // chain reactions from the last shot
    this.meter = 0;        // combo points towards the next power-up
    this.meterNeed = RULES.meterFirst;
    this.slow = 0;         // seconds of Syrup left
    this.laser = 0;        // seconds of Licorice Laser left
    this.next = null;      // 'bomb' | 'zap': what the next shot is
    this.events = [];      // for the scene: pops, eats, inserts (it drains this every frame)
    this.dead = false;
    this.chains = level.tracks.map(track => ({ track, orbs: [], queue: rollQueue(this.rng, this.spec, track.count), rollIn: true, retreat: 0, retreatV: 0 }));
    this.held = [this.rollHeld(), this.rollHeld()];
    this.sel = 0;
  }

  get cleared() { return this.chains.every(ch => !ch.queue.length && !ch.orbs.length); }
  danger(ch) { return ch.orbs.length ? Math.max(0, ch.orbs[ch.orbs.length - 1].s / ch.track.len) : 0; }

  step(dt) {
    this.slow = Math.max(0, this.slow - dt);
    this.laser = Math.max(0, this.laser - dt);
    for (const ch of this.chains) this.stepChain(ch, dt);
    this.fixHeld();
  }

  stepChain(ch, dt) {
    const o = ch.orbs, len = ch.track.len;
    // new candies come out of the jar at the start of the road (not while the chain is being pushed back)
    while (ch.retreat <= 0 && ch.queue.length && (!o.length || o[0].s > 0)) o.unshift({ id: candyId++, c: ch.queue.shift(), s: o.length ? Math.min(o[0].s - D, 0) : 0 });
    if (!o.length) return;
    // where the gaps are now, to spot candies that come into contact during this step
    const gapFronts = new Set();
    for (let j = 1; j < o.length; j++) if (o[j].s - o[j - 1].s > TOUCH) gapFronts.add(o[j]);
    if (ch.retreat > 0) { // pushed back: the whole chain slides back down the road
      const d = ch.retreatV * Math.min(dt, ch.retreat);
      ch.retreat -= dt;
      for (const b of o) b.s -= d;
    } else {
      if (ch.rollIn && (o[o.length - 1].s >= RULES.rollIn * len || !ch.queue.length)) ch.rollIn = false;
      // only the back candy moves; resolve() pushes everything touching it
      o[0].s += this.speed * (this.slow > 0 ? RULES.slowMul : 1) * (ch.rollIn ? RULES.rollSpeed : 1) * dt;
    }
    this.resolve(o);
    // magnet: a run ahead of a gap slides back when the colors on both sides of the gap match
    for (let j = 1; j < o.length; j++) {
      const gap = o[j].s - o[j - 1].s;
      if (gap <= TOUCH || !sameColor(o[j - 1].c, o[j].c)) continue;
      const pull = Math.min(RULES.magnet * dt, gap - D);
      let k = j;
      do o[k].s -= pull; while (++k < o.length && o[k].s - o[k - 1].s <= TOUCH + pull);
    }
    this.resolve(o);
    // two runs that just touched with the same color at the join: a chain reaction
    for (let j = 1; j < o.length; j++) {
      if (gapFronts.has(o[j]) && o[j].s - o[j - 1].s <= TOUCH && sameColor(o[j - 1].c, o[j].c)) { this.matchAt(ch, j, true); break; }
    }
    // a candy reaching the monster gets eaten: lose a star, and the chain is pushed back
    if (o.length && ch.retreat <= 0 && o[o.length - 1].s >= len - D / 2) {
      const eaten = o.pop();
      this.stars--;
      this.events.push({ type: 'eat', ch, orbs: [eaten] });
      if (this.stars <= 0) this.dead = true;
      ch.retreat = RULES.breachTime;
      ch.retreatV = RULES.breachBack * len / RULES.breachTime;
    }
  }

  // Candies never overlap: each one sits at least a candy ahead of the one behind it.
  resolve(o) {
    for (let i = 1; i < o.length; i++) if (o[i].s < o[i - 1].s + D) o[i].s = o[i - 1].s + D;
  }

  // A run of 3+ touching candies of one color around index k pops (with any jawbreaker right next to it).
  matchAt(ch, k, reaction) {
    const o = ch.orbs, c = o[k]?.c;
    if (!(c >= 0)) return 0;
    let a = k, b = k;
    while (a > 0 && o[a - 1].c === c && o[a].s - o[a - 1].s <= TOUCH) a--;
    while (b < o.length - 1 && o[b + 1].c === c && o[b + 1].s - o[b].s <= TOUCH) b++;
    if (b - a + 1 < 3) return 0;
    if (a > 0 && o[a - 1].c === JAW && o[a].s - o[a - 1].s <= TOUCH) a--;
    if (b < o.length - 1 && o[b + 1].c === JAW && o[b + 1].s - o[b].s <= TOUCH) b++;
    const popped = o.splice(a, b - a + 1);
    if (reaction) this.chainN++;
    else this.combo++;
    const points = Math.round(popped.length * 10 * (1 + this.chainN) * (1 + 0.5 * (this.combo - 1)));
    this.score += points;
    this.meter += points;
    this.events.push({ type: 'pop', ch, orbs: popped, color: c, points, chain: this.chainN, combo: this.combo });
    return popped.length;
  }

  // A shot (color c) reached candy i of chain ch at (x, y). kind: null, 'bomb' or 'zap'. Returns the new candy, if any.
  hit(ch, i, x, y, c, kind) {
    const orb = ch.orbs[i], p = pointAt(ch.track, orb.s);
    if (kind === 'bomb' || kind === 'zap') {
      if (kind === 'bomb') this.blast(p.x, p.y, RULES.bombRadius);
      else this.zap(orb.c);
      return null;
    }
    // which side of the candy did it hit, along the road?
    const side = (x - p.x) * Math.cos(p.a) + (y - p.y) * Math.sin(p.a) > 0 ? 1 : -1;
    return this.insert(ch, i, c, side);
  }

  insert(ch, i, c, side) {
    const o = ch.orbs, hit = o[i];
    if (c === WILD) c = hit.c >= 0 ? hit.c : (o[i + side]?.c >= 0 ? o[i + side].c : this.rollHeld(true));
    const k = side > 0 ? i + 1 : i, orb = { id: candyId++, c, s: side > 0 ? hit.s + D : hit.s };
    o.splice(k, 0, orb);
    this.resolve(o);
    this.chainN = 0;
    this.events.push({ type: 'insert', ch, orb });
    if (!this.matchAt(ch, k, false)) this.combo = 0;
    return orb;
  }

  // Cherry Bomb: everything on screen within r of (x, y) pops, jawbreakers too.
  blast(x, y, r) {
    for (const ch of this.chains) {
      const popped = ch.orbs.filter(b => { if (b.s < 0) return false; const p = pointAt(ch.track, b.s); return Math.hypot(p.x - x, p.y - y) <= r; });
      this.removeAll(ch, popped);
    }
  }
  // Pop Rocks: every candy of that color, on every road.
  zap(c) { for (const ch of this.chains) this.removeAll(ch, ch.orbs.filter(b => b.c === c)); }
  removeAll(ch, popped) {
    if (!popped.length) return;
    const gone = new Set(popped);
    ch.orbs = ch.orbs.filter(b => !gone.has(b));
    const points = popped.length * 10;
    this.score += points;
    this.events.push({ type: 'pop', ch, orbs: popped, color: popped[0].c, points, chain: 0, combo: this.combo, power: true });
  }

  // The nearest candy on screen within r of (x, y).
  nearest(x, y, r) {
    let best = null;
    for (const ch of this.chains) ch.orbs.forEach((b, i) => {
      if (b.s < 0 || b.s > ch.track.len) return;
      const p = pointAt(ch.track, b.s), d = Math.hypot(p.x - x, p.y - y);
      if (d <= r && (!best || d < best.d)) best = { ch, i, orb: b, x: p.x, y: p.y, d };
    });
    return best;
  }

  // ---------- The two candies you hold ----------
  presentColors() {
    const set = new Set();
    for (const ch of this.chains) for (const b of ch.orbs) if (b.c >= 0) set.add(b.c);
    if (!set.size) for (const ch of this.chains) for (const c of ch.queue) if (c >= 0) set.add(c);
    return set;
  }
  // Only colors still on the board, so you're never stuck holding one you can't use. Sometimes a rainbow.
  rollHeld(noWild) {
    if (!noWild && this.rng.chance(this.spec.wild)) return WILD;
    const present = [...this.presentColors()];
    return present.length ? this.rng.pick(present) : this.rng.int(0, this.spec.colors - 1);
  }
  fixHeld() {
    const present = this.presentColors();
    if (!present.size) return;
    for (let i = 0; i < 2; i++) if (this.held[i] >= 0 && !present.has(this.held[i])) this.held[i] = this.rollHeld(true);
  }
  swap() { this.sel = 1 - this.sel; }
  // What the next shot is; firing refills only the slot you fired from. Bombs and zaps don't use up your candy.
  take() {
    if (this.next) { const kind = this.next; this.next = null; return { c: this.held[this.sel], kind }; }
    const c = this.held[this.sel];
    this.held[this.sel] = this.rollHeld();
    return { c, kind: null };
  }

  // ---------- Power-ups ----------
  offers() {
    const pool = POWERUPS.map(p => p.id), out = [];
    while (out.length < 3) out.push(pool.splice(this.rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }
  // Called when the meter is full and a power-up has been picked.
  usePick(id) {
    this.meter = Math.max(0, this.meter - this.meterNeed);
    this.meterNeed = Math.round(this.meterNeed * RULES.meterGrow);
    this.apply(id);
  }
  apply(id) {
    if (id === 'bomb' || id === 'zap') this.next = id;
    else if (id === 'rewind') for (const ch of this.chains) { ch.retreat = RULES.rewindTime; ch.retreatV = RULES.rewindBack * ch.track.len / RULES.rewindTime; }
    else if (id === 'slow') this.slow = RULES.slowTime;
    else if (id === 'wild') this.held[this.sel] = WILD;
    else if (id === 'laser') this.laser = RULES.laserTime;
  }
}
