// Candy Conga level generator. makeLevel(n) builds level n from its own seed, so level 37 is the same for everyone
// (fair for leaderboards). It picks a layout (how many roads, which shapes), draws each road as a dense polyline,
// rejects layouts that break the rules in levelProblems(), and places the gumball machine where it sees the most road.
// Pure JavaScript, no Phaser: tools/check.js runs it in Node to check every level and draw a contact sheet.

// ---------- Seeded random numbers (mulberry32) ----------
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
  };
}
const levelSeed = n => (Math.imul(n, 2654435761) ^ 0x51ed27) >>> 0;

// ---------- Road shapes. Each takes a box (where its center line may go) and returns [[x, y], ...] or null ----------
const TAU = Math.PI * 2;

// Lollipop Swirl: spirals in towards the middle, leaving room there for the gumball machine.
function swirlPath(b, R) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const cx = (b.x0 + b.x1) / 2 + R.range(-0.05, 0.05) * w, cy = (b.y0 + b.y1) / 2 + R.range(-0.05, 0.05) * h;
  const ax = Math.min(cx - b.x0, b.x1 - cx), ay = Math.min(cy - b.y0, b.y1 - cy, ax * 1.6);
  const inner = R.range(3.4, 4.4) * D, gap = R.range(2.1, 2.6) * D; // gap = distance between rings
  const maxTurns = (Math.min(ax, ay) - inner) / gap;
  if (maxTurns < 1) return null;
  const turns = R.range(Math.min(1.2, maxTurns), maxTurns), dir = R.chance(0.5) ? 1 : -1, a0 = R.range(0, TAU);
  const total = turns * TAU, pts = [];
  for (let th = 0; th <= total; th += 0.008) {
    const k = th / total;
    pts.push([cx + (ax - (ax - inner) * k) * Math.cos(a0 + dir * th), cy + (ay - (ay - inner) * k) * Math.sin(a0 + dir * th)]);
  }
  return pts;
}

// Donut Loop: one or two laps of a rounded square (a superellipse) that shrinks as it goes.
function donutPath(b, R) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const cx = (b.x0 + b.x1) / 2 + R.range(-0.05, 0.05) * w, cy = (b.y0 + b.y1) / 2 + R.range(-0.05, 0.05) * h;
  const ax = Math.min(cx - b.x0, b.x1 - cx) * R.range(0.9, 1), ay = Math.min(cy - b.y0, b.y1 - cy, ax * 1.5) * R.range(0.9, 1);
  const p = R.range(2.6, 4.2), gap = R.range(2.1, 2.5) * D, laps = R.range(1.05, 1.7);
  if (Math.min(ax, ay) - gap * laps < 3.5 * D) return null;
  const e = 2 / p, se = c => Math.sign(c) * Math.abs(c) ** e;
  const dir = R.chance(0.5) ? 1 : -1, a0 = R.int(0, 3) * TAU / 4 + TAU / 8, pts = [];
  for (let th = 0; th <= laps * TAU; th += 0.003) {
    const shrink = gap * th / TAU;
    pts.push([cx + (ax - shrink) * se(Math.cos(a0 + dir * th)), cy + (ay - shrink) * se(Math.sin(a0 + dir * th))]);
  }
  return pts;
}

// Ribbon Candy: back-and-forth lanes joined by U-turns. Taffy Wave is the same with wobbly lanes.
function ribbonPath(b, R, wavy) {
  // Lanes run left-right (stacked) or up-down. A lane count works if lanes stay 1.9 candies apart and at least
  // 2 candies long after the U-turns take their share; try one way, then the other.
  const lanes = horiz => {
    const [u0, u1, v0, v1] = horiz ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1];
    const main = u1 - u0, cross = v1 - v0;
    const lo = Math.max(2, Math.ceil(cross / (main - 2 * D))), hi = Math.min(horiz ? 6 : 4, Math.floor(cross / (1.9 * D)));
    return main > 4 * D && lo <= hi && { horiz, u0, u1, v0, v1, lo, hi };
  };
  const first = R.chance(0.6);
  const fit = lanes(first) || lanes(!first);
  if (!fit) return null;
  const { horiz, u0, u1, v0, v1 } = fit;
  const k = R.int(fit.lo, fit.hi), gap = (v1 - v0) / k, r = gap / 2;
  // Taffy wobble: 1-3 waves per lane, never bending tighter than about 1.6 candies.
  const waves = Math.max(1, Math.min(3, Math.round((u1 - u0 - gap) / R.range(240, 380))));
  const lam = (u1 - u0 - gap) / waves, amp = wavy ? Math.min(gap * R.range(0.12, 0.2), (lam / TAU) ** 2 / (1.6 * D)) : 0;
  const flipU = R.chance(0.5), flipV = R.chance(0.5);
  const at = (u, v) => {
    if (flipU) u = u0 + u1 - u;
    if (flipV) v = v0 + v1 - v;
    return horiz ? [u, v] : [v, u];
  };
  const pts = [], ua = u0 + r, ub = u1 - r, laneLen = ub - ua;
  for (let i = 0; i < k; i++) {
    const v = v0 + gap * (i + 0.5), fwd = i % 2 === 0;
    for (let d = 0; d <= laneLen; d += 3) {
      const t = d / laneLen;
      // sin(pi t) fades the wobble out at both ends, so lanes meet their U-turns smoothly
      pts.push(at(fwd ? ua + d : ub - d, v + amp * Math.sin(t * waves * TAU) * Math.sin(Math.PI * t)));
    }
    if (i === k - 1) break;
    const cu = fwd ? ub : ua, side = fwd ? 1 : -1;
    for (let a = 0.04; a < Math.PI; a += 0.04) pts.push(at(cu + side * r * Math.sin(a), v + r - r * Math.cos(a)));
  }
  return pts;
}

// Gummy Trail: a random walk over a grid of cells (never visiting a cell twice), smoothed into curves.
function trailPath(box, R) {
  const cell = R.range(2.9, 3.4) * D, m = cell * 0.15; // the smoothed curve bulges past the cells a little
  const b = { x0: box.x0 + m, x1: box.x1 - m, y0: box.y0 + m, y1: box.y1 - m };
  const cols = Math.floor((b.x1 - b.x0) / cell) + 1, rows = Math.floor((b.y1 - b.y0) / cell) + 1;
  if (cols < 2 || rows < 2 || cols * rows < 6) return null;
  const ox = b.x0 + ((b.x1 - b.x0) - (cols - 1) * cell) / 2, oy = b.y0 + ((b.y1 - b.y0) - (rows - 1) * cell) / 2;
  const want = Math.max(5, Math.round(cols * rows * R.range(0.45, 0.7)));
  const seen = new Set(), path = [];
  let c = R.chance(0.5) ? [R.int(0, cols - 1), R.chance(0.5) ? 0 : rows - 1] : [R.chance(0.5) ? 0 : cols - 1, R.int(0, rows - 1)];
  let dir = null;
  while (path.length < want) {
    path.push(c);
    seen.add(c[0] + c[1] * 100);
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const x = c[0] + dx, y = c[1] + dy;
      return x >= 0 && y >= 0 && x < cols && y < rows && !seen.has(x + y * 100);
    });
    if (!opts.length) break;
    const straight = dir && opts.find(o => o[0] === dir[0] && o[1] === dir[1]);
    dir = straight && R.chance(0.5) ? straight : R.pick(opts);
    c = [c[0] + dir[0], c[1] + dir[1]];
  }
  if (path.length < 5) return null;
  return catmull(path.map(([i, j]) => [ox + i * cell, oy + j * cell]), 40);
}

// A smooth curve through control points (Catmull-Rom).
function catmull(ctrl, perSeg) {
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      const f = q => 0.5 * (2 * p1[q] + (p2[q] - p0[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (3 * p1[q] - p0[q] - 3 * p2[q] + p3[q]) * t3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  return pts;
}

const FAMILIES = {
  swirl: { name: 'Lollipop Swirl', make: swirlPath },
  donut: { name: 'Donut Loop', make: donutPath },
  ribbon: { name: 'Ribbon Candy', make: (b, R) => ribbonPath(b, R, false) },
  taffy: { name: 'Taffy Wave', make: (b, R) => ribbonPath(b, R, true) },
  trail: { name: 'Gummy Trail', make: trailPath },
};
const SOLO = ['swirl', 'donut', 'ribbon', 'taffy', 'trail'];
const SMALL = ['ribbon', 'taffy', 'trail']; // the shapes that fit in part of the screen

// ---------- Helpers on polylines ----------
// Points every STEP px along a polyline, as a flat Float32Array [x0, y0, x1, y1, ...].
function resample(poly) {
  const out = [poly[0][0], poly[0][1]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    let [x0, y0] = poly[i - 1];
    const [x1, y1] = poly[i];
    let seg = Math.hypot(x1 - x0, y1 - y0);
    while (carry + seg >= STEP) {
      const t = (STEP - carry) / seg;
      x0 += (x1 - x0) * t;
      y0 += (y1 - y0) * t;
      seg -= STEP - carry;
      carry = 0;
      out.push(x0, y0);
    }
    carry += seg;
  }
  return Float32Array.from(out);
}
// Shared monsters sit on the axis between two roads. A road heading there ends at whichever of its ends is
// nearer the axis, then curves in: leaving its end the way it was going, arriving square to the axis.
const axisDist = (p, axis) => axis.x !== undefined ? Math.abs(p[0] - axis.x) : Math.abs(p[1] - axis.y);
const towardAxis = (poly, axis) => axisDist(poly[0], axis) < axisDist(poly[poly.length - 1], axis) ? poly.slice().reverse() : poly;
function connectTo(poly, [hx, hy], axis) {
  const [ex, ey] = poly[poly.length - 1], [px, py] = poly[Math.max(0, poly.length - 8)];
  const tl = Math.hypot(ex - px, ey - py) || 1, dist = Math.hypot(hx - ex, hy - ey), k = Math.max(dist * 0.45, 2.2 * D);
  const c1 = [ex + (ex - px) / tl * k, ey + (ey - py) / tl * k];
  const c2 = axis.x !== undefined ? [hx + Math.sign(ex - hx) * k, hy] : [hx, hy + Math.sign(ey - hy) * k];
  const out = poly.slice(), n = Math.max(4, Math.ceil(dist / 3));
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push([w[0] * ex + w[1] * c1[0] + w[2] * c2[0] + w[3] * hx, w[0] * ey + w[1] * c1[1] + w[2] * c2[1] + w[3] * hy]);
  }
  return out;
}
const mirror = (poly, axis) => poly.map(([x, y]) => axis.x !== undefined ? [2 * axis.x - x, y] : [x, 2 * axis.y - y]);

// ---------- Layouts ----------
// Which roads level n has. Memoized, so "not the same as the level before" can look back cheaply.
const choices = [];
function layoutChoice(n) {
  for (let m = choices.length + 1; m <= n; m++) {
    const R = makeRng(levelSeed(m) ^ 0xc0ffee);
    const count = m < 10 ? 1 : m < 35 ? (R.chance(0.45) ? 2 : 1) : (r => r < 0.3 ? 1 : r < 0.65 ? 2 : 3)(R.next());
    const list = count === 1 ? SOLO : SMALL;
    let fam = R.pick(list);
    const prev = choices[m - 2];
    if (prev && prev.count === count && prev.fam === fam) fam = list[(list.indexOf(fam) + 1) % list.length];
    choices[m - 1] = { count, fam };
  }
  return choices[n - 1];
}

// Splits the play area for 2 or 3 roads, leaving a band between them wide enough for the gumball machine.
function regionsFor(count, R, symmetric) {
  const P = PLAY, band = R.range(3.9, 4.6) * D, midX = (P.x0 + P.x1) / 2;
  const jitter = symmetric ? 0 : R.range(-0.08, 0.08);
  // hole(p): the spot on the axis nearest p, kept away from the ends of the band
  const clamp = (v, lo, hi) => Math.max(lo + 2 * D, Math.min(hi - 2 * D, v));
  if (count === 2) {
    if (R.chance(0.5)) {
      const mid = (P.y0 + P.y1) / 2 + jitter * (P.y1 - P.y0);
      return { regs: [{ ...P, y1: mid - band / 2 }, { ...P, y0: mid + band / 2 }], axis: { y: mid }, hole: p => [clamp(p[0], P.x0, P.x1), mid] };
    }
    return { regs: [{ ...P, x1: midX - band / 2 }, { ...P, x0: midX + band / 2 }], axis: { x: midX }, hole: p => [midX, clamp(p[1], P.y0, P.y1)] };
  }
  // three roads: a wide one across the top (or bottom) and two side by side
  const top = R.chance(0.5), split = P.y0 + (P.y1 - P.y0) * (top ? R.range(0.4, 0.5) : R.range(0.5, 0.6)), band2 = R.range(3.0, 3.6) * D;
  const wide = top ? { ...P, y1: split - band / 2 } : { ...P, y0: split + band / 2 };
  const row = top ? { y0: split + band / 2, y1: P.y1 } : { y0: P.y0, y1: split - band / 2 };
  return {
    regs: [{ ...P, ...row, x1: midX - band2 / 2 }, { ...P, ...row, x0: midX + band2 / 2 }, wide],
    axis: { x: midX },
    hole: p => [midX, clamp(p[1], row.y0, row.y1)],
  };
}

// One try at a layout; null if a shape didn't fit.
function attempt(R, ch) {
  if (ch.count === 1) {
    const poly = FAMILIES[ch.fam].make(PLAY, R);
    return poly && { polys: [poly], holes: [poly[poly.length - 1]], holeOf: [0], name: FAMILIES[ch.fam].name, fams: [ch.fam] };
  }
  const twin = R.chance(0.45), shared = R.chance(0.5);
  const { regs, axis, hole } = regionsFor(ch.count, R, twin);
  const fams = regs.map((_, i) => i === 0 ? ch.fam : twin && i === 1 ? ch.fam : R.pick(SMALL));
  const polys = [];
  for (let i = 0; i < regs.length; i++) {
    let poly = twin && i === 1 ? mirror(polys[0], axis) : FAMILIES[fams[i]].make(regs[i], R);
    if (!poly) return null;
    if (shared && i < 2 && !(twin && i === 1)) poly = towardAxis(poly, axis);
    // twins sharing a monster: connect the first, and its mirror image ends at the same spot
    if (twin && shared && i === 0) poly = connectTo(poly, hole(poly[poly.length - 1]), axis);
    polys.push(poly);
  }
  if (shared && !twin) {
    const a = polys[0][polys[0].length - 1], b = polys[1][polys[1].length - 1], H = hole([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    polys[0] = connectTo(polys[0], H, axis);
    polys[1] = connectTo(polys[1], H, axis);
  }
  const holes = [], holeOf = [];
  for (const p of polys) {
    const end = p[p.length - 1];
    let h = holes.findIndex(q => Math.hypot(q[0] - end[0], q[1] - end[1]) < 1);
    if (h < 0) h = holes.push(end) - 1;
    holeOf.push(h);
  }
  const names = [...new Set(fams.map(f => FAMILIES[f].name))];
  return { polys, holes, holeOf, fams, twin, shared, name: twin ? `Twin ${names[0]}` : names.slice(0, 2).join(' & ') };
}

// ---------- Rules every level must pass ----------
// Coarse samples (every 24 px) of each road, with how far along the road they are.
function samplesOf(track) {
  const out = [], every = 12;
  for (let i = 0; i < track.pts.length / 2; i += every) out.push({ x: track.pts[2 * i], y: track.pts[2 * i + 1], s: i * STEP });
  return out;
}
// roadsOnly: skip the gumball machine checks (makeLevel places it only once the roads pass).
function levelProblems(L, roadsOnly) {
  const bad = [], S = L.tracks.map(samplesOf), near = (s, t) => t.len - s.s < 4 * D; // near the road's own end
  L.tracks.forEach((t, a) => {
    const pts = t.pts;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < PLAY.x0 - 1 || pts[i] > PLAY.x1 + 1 || pts[i + 1] < PLAY.y0 - 1 || pts[i + 1] > PLAY.y1 + 1) { bad.push(`road ${a} leaves the play area`); break; }
    }
    if (t.len < [2200, 900, 700][L.tracks.length - 1]) bad.push(`road ${a} too short (${Math.round(t.len)})`);
    // no tight kinks: two points one candy apart along the road are nearly a candy apart in space
    const k = D / STEP;
    for (let i = 0; i + k < pts.length / 2; i += 4) {
      if (Math.hypot(pts[2 * (i + k)] - pts[2 * i], pts[2 * (i + k) + 1] - pts[2 * i + 1]) < 0.88 * D) { bad.push(`road ${a} turns too tightly`); break; }
    }
    // the road never comes back close to itself
    const s = S[a];
    outer: for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      if (s[j].s - s[i].s > 3 * D && Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y) < 1.6 * D) { bad.push(`road ${a} crosses itself`); break outer; }
    }
  });
  // roads keep apart, except where two run into the same monster
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const share = L.tracks[a].hole === L.tracks[b].hole;
    outer: for (const p of S[a]) for (const q of S[b]) {
      if (share && near(p, L.tracks[a]) && near(q, L.tracks[b])) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) < 1.6 * D) { bad.push(`roads ${a} and ${b} touch`); break outer; }
    }
  }
  // monsters and candy jars (where roads start) sit clear of other roads
  L.holes.forEach((h, i) => {
    S.forEach((s, a) => {
      if (s.some(p => !(L.tracks[a].hole === i && near(p, L.tracks[a])) && Math.hypot(p.x - h.x, p.y - h.y) < 1.9 * D)) bad.push(`monster ${i} sits on road ${a}`);
    });
    L.holes.forEach((g, j) => { if (j > i && Math.hypot(g.x - h.x, g.y - h.y) < 3 * D) bad.push(`monsters ${i} and ${j} too close`); });
  });
  L.tracks.forEach((t, a) => {
    const j = { x: t.pts[0], y: t.pts[1] };
    S.forEach((s, b) => { if (s.some(p => (b !== a || p.s > 4 * D) && Math.hypot(p.x - j.x, p.y - j.y) < 1.8 * D)) bad.push(`jar ${a} sits on road ${b}`); });
    if (L.holes.some(h => Math.hypot(h.x - j.x, h.y - j.y) < 2.5 * D)) bad.push(`jar ${a} next to a monster`);
  });
  const m = L.launcher;
  if (roadsOnly) return bad;
  if (!m) bad.push('no room for the gumball machine');
  else {
    if (S.some(s => s.some(p => Math.hypot(p.x - m.x, p.y - m.y) < 1.8 * D))) bad.push('machine sits on a road');
    if (L.holes.some(h => Math.hypot(h.x - m.x, h.y - m.y) < 3 * D)) bad.push('machine next to a monster');
    if (L.tracks.some(t => Math.hypot(t.pts[0] - m.x, t.pts[1] - m.y) < 2.6 * D)) bad.push('machine next to a jar');
  }
  return bad;
}

// The gumball machine goes where it's clear of everything and its aim rays hit the most road.
function placeLauncher(L, R) {
  const S = L.tracks.flatMap(samplesOf), cell = 24, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  const road = new Uint8Array(cols * rows); // cells within half a candy of a road
  for (const p of S) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const cx = Math.floor(p.x / cell) + dx, cy = Math.floor(p.y / cell) + dy;
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) road[cx + cy * cols] = 1;
  }
  const clear = [];
  for (let x = PLAY.x0 + D; x <= PLAY.x1 - D; x += 16) for (let y = PLAY.y0 + D; y <= PLAY.y1 - D; y += 16) {
    let gap = Infinity;
    for (const p of S) gap = Math.min(gap, Math.hypot(p.x - x, p.y - y));
    if (gap < 1.85 * D) continue;
    if (L.holes.some(h => Math.hypot(h.x - x, h.y - y) < 3.1 * D)) continue;
    if (L.tracks.some(t => Math.hypot(t.pts[0] - x, t.pts[1] - y) < 2.7 * D)) continue;
    clear.push({ x, y, gap });
  }
  if (!clear.length) return null;
  clear.sort((a, b) => b.gap - a.gap);
  let best = null;
  for (const c of clear.slice(0, 50)) {
    let hits = 0;
    for (let r = 0; r < 72; r++) {
      const a = r / 72 * TAU, dx = Math.cos(a) * 12, dy = Math.sin(a) * 12;
      for (let x = c.x, y = c.y; x > 0 && y > 0 && x < W && y < H; x += dx, y += dy) {
        if (road[Math.floor(x / cell) + Math.floor(y / cell) * cols]) { hits++; break; }
      }
    }
    const score = hits / 72 + R.range(0, 0.12);
    if (hits / 72 >= 0.35 && (!best || score > best.score)) best = { x: c.x, y: c.y, score };
  }
  return best && { x: best.x, y: best.y };
}

// ---------- makeLevel ----------
const levelCache = new Map();
function makeLevel(n) {
  if (levelCache.has(n)) return levelCache.get(n);
  const sp = spec(n), R = makeRng(levelSeed(n));
  let ch = layoutChoice(n), level = null, tries = 0;
  for (; !level && tries < 80; tries++) {
    if (tries === 50) ch = { count: 1, fam: 'ribbon' }; // fall back to the shape that always fits
    const lay = attempt(R, ch);
    if (!lay) continue;
    const tracks = lay.polys.map((p, i) => {
      const pts = resample(p);
      return { pts, len: (pts.length / 2 - 1) * STEP, hole: lay.holeOf[i], fam: lay.fams[i] };
    });
    const L = { n, name: lay.name, spec: sp, seed: levelSeed(n), tracks, holes: lay.holes.map(([x, y]) => ({ x, y })), fallback: tries >= 50 };
    if (levelProblems(L, true).length) continue;
    L.launcher = placeLauncher(L, R);
    if (levelProblems(L).length) continue;
    // Candies per road follow its length; more roads means more candies in all.
    const total = sp.count * [1, 1.25, 1.35][tracks.length - 1], sum = tracks.reduce((a, t) => a + t.len, 0);
    for (const t of tracks) t.count = Math.max(15, Math.round(total * t.len / sum));
    level = L;
  }
  if (!level) throw new Error(`level ${n}: no valid layout`);
  level.tries = tries;
  levelCache.set(n, level);
  return level;
}
