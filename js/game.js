// Candy Conga: the game scene. Loaded last (after data, levels, chain, art and ui). The rules live in chain.js
// (Board); this file draws the board, flies the shots, handles aiming and plays the effects.

const FONT = 'Fredoka';
const ROADS = [ // candy-cane edges and the road's fill, one style per road
  { edge: 0xff5d8f, edge2: 0xffffff, fill: 0xffd6e5 },
  { edge: 0x2ec98a, edge2: 0xffffff, fill: 0xd2f7e8 },
  { edge: 0xc98a4b, edge2: 0xffe6c4, fill: 0xf3d2a8 },
];
const label = (scene, x, y, str, size, color = '#4a2040') =>
  scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#ffffff', strokeThickness: Math.round(size / 5), align: 'center' });

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create(data) {
    makeArt(this);
    this.playing = !!data?.play;
    this.mode = data?.mode || 'levels';
    this.n = data?.level || nextLevel();
    this.level = makeLevel(this.n);
    this.board = new Board(this.level, { stars: data?.stars, score: data?.score });
    this.t = 0;                         // game time that stops while paused (update() isn't called then)
    this.intro = this.playing ? 1.3 : 0; // the level card shows before the chain starts
    this.cool = 0;                      // seconds until the next shot
    this.shots = [];
    this.sprites = new Map();           // candy id -> image
    this.ended = false;
    this.pending = null;                // { t, fn }: what happens after a level ends
    this.down = null;                   // where the current touch/click started
    this.aim = null;                    // the point being aimed at
    this.angle = -Math.PI / 2;
    this.nextWarn = 0;

    this.drawBoard();
    const L = this.level;
    for (const t of L.tracks) this.add.image(t.pts[0], t.pts[1], 'jar').setDepth(2);
    this.monsters = L.holes.map((h, i) => {
      const body = this.add.image(h.x, h.y - 22, `monster-${(this.n + i) % MONSTER_COLORS.length}`).setScale(0.85).setDepth(4);
      const mouth = this.add.image(h.x, h.y + 4, 'mouth').setScale(0.85, 0.3).setDepth(4);
      return { body, mouth, chains: this.board.chains.filter(ch => ch.track.hole === i) };
    });
    // The gumball machine: turns to aim; the candy you'll shoot sits in the chute, the other in the globe.
    this.cur = this.add.image(60, 0, 'candy-0').setScale(0.82);
    this.other = this.add.image(0, 0, 'candy-0').setScale(0.82);
    this.machine = this.add.container(L.launcher.x, L.launcher.y, [this.add.image(0, 0, 'machine'), this.cur, this.other]).setDepth(5);
    this.aimG = this.add.graphics().setDepth(6);
    this.ring = this.add.image(0, 0, 'ring').setDepth(6).setVisible(false);
    this.fx = this.add.particles(0, 0, 'spark', { speed: { min: 90, max: 280 }, lifespan: { min: 250, max: 600 }, scale: { start: 1.3, end: 0 }, emitting: false }).setDepth(7);
    this.makeHud();
    this.heldKey = '';
    this.render();
    if (this.playing) {
      const roads = L.tracks.length === 1 ? '1 road' : `${L.tracks.length} roads`;
      this.banner(`${this.mode === 'gauntlet' ? 'GAUNTLET · ' : ''}LEVEL ${this.n}`, 1300, 60, `${L.name} · ${roads}`);
      jingle([523, 659, 784], 110);
    }
  }

  label() { return `${this.mode === 'gauntlet' ? 'Gauntlet · ' : ''}Level ${this.n}`; }

  // Background, sprinkles and the roads, drawn once into a single picture.
  drawBoard() {
    const L = this.level, R = makeRng(L.seed ^ 0xbeef), g = this.make.graphics({ add: false });
    g.fillStyle(Phaser.Display.Color.HSLToColor((this.n * 0.137) % 1, 0.75, 0.93).color).fillRect(0, 0, W, H);
    for (let i = 0; i < 170; i++) {
      const x = R.range(0, W), y = R.range(0, H), a = R.range(0, TAU);
      g.lineStyle(6, CANDIES[R.int(0, CANDIES.length - 1)].color, 0.3).lineBetween(x, y, x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    L.tracks.forEach((t, i) => {
      const pal = ROADS[i % ROADS.length], p = t.pts, n = p.length / 2;
      for (let j = 0; j < n; j += 3) g.fillStyle(Math.floor(j / 12) % 2 ? pal.edge2 : pal.edge).fillCircle(p[2 * j], p[2 * j + 1], D / 2 + 9);
      g.fillStyle(pal.fill);
      for (let j = 0; j < n; j += 3) g.fillCircle(p[2 * j], p[2 * j + 1], D / 2 + 3);
      g.fillCircle(p[2 * n - 2], p[2 * n - 1], D / 2 + 3);
    });
    this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(0).draw(g);
    g.destroy();
  }

  makeHud() {
    const panel = this.add.graphics().setDepth(10);
    panel.fillStyle(0xffffff, 0.72).fillRoundedRect(10, 8, W - 20, 112, 22);
    this.levelText = label(this, 28, 16, '', 30);
    this.scoreText = label(this, 28, 56, '', 26, '#ff4d8d');
    this.starImgs = [0, 1, 2].map(i => this.add.image(452 + i * 48, 48, 'star').setDepth(10));
    this.meterG = this.add.graphics().setDepth(10);
    this.statusText = label(this, 300, 104, '', 18, '#4a2040').setOrigin(0.5);
    for (const o of [this.levelText, this.scoreText, this.statusText]) o.setDepth(11);
    this.hud = [panel, this.levelText, this.scoreText, this.meterG, this.statusText, ...this.starImgs];
    for (const o of this.hud) o.setVisible(this.playing);
    this.updateHud();
  }

  updateHud() {
    if (!this.playing) return;
    const b = this.board;
    this.levelText.setText(this.label());
    this.scoreText.setText(`Score ${b.score.toLocaleString()}`);
    this.starImgs.forEach((s, i) => s.setTint(i < b.stars ? 0xffb020 : 0xead0dc));
    const full = Math.min(1, b.meter / b.meterNeed);
    this.meterG.clear().fillStyle(0xf3d6e3).fillRoundedRect(24, 94, 552, 20, 10).fillStyle(0xff4d8d).fillRoundedRect(24, 94, Math.max(20, 552 * full), 20, 10);
    const st = [];
    if (b.next) st.push(`Next shot: ${POWER[b.next].name}`);
    if (b.slow > 0) st.push(`Syrup ${Math.ceil(b.slow)}`);
    if (b.laser > 0) st.push(`Laser ${Math.ceil(b.laser)}`);
    this.statusText.setText(st.length ? st.join(' · ') : `COMBO METER ${b.meter}/${b.meterNeed}`);
  }

  // A big message in the middle of the screen (and an optional smaller line under it).
  banner(str, ms = 1100, size = 56, sub = '') {
    const t = label(this, W / 2, H * 0.44, str, size).setOrigin(0.5).setDepth(12).setAlpha(0).setScale(0.6);
    const parts = [t];
    if (sub) parts.push(label(this, W / 2, H * 0.44 + size * 0.95, sub, Math.round(size * 0.5), '#ff4d8d').setOrigin(0.5).setDepth(12).setAlpha(0));
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: parts, alpha: 1, duration: 200, yoyo: true, hold: ms - 400, onComplete: () => parts.forEach(p => p.destroy()) });
  }
  floatText(x, y, str, color = '#ff4d8d', size = 30) {
    const t = label(this, x, y, str, size, color).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    if (!this.playing) { // menu backdrop: the chain rolls in, then waits
      if (this.board.chains.some(ch => ch.rollIn)) this.board.step(dt);
      this.render();
      return;
    }
    if (this.ended) {
      this.updateShots(dt);
      this.drainEvents();
      this.render();
      if (this.pending && (this.pending.t -= dt) <= 0) { const fn = this.pending.fn; this.pending = null; fn(); }
      return;
    }
    if (this.intro > 0) { this.intro -= dt; this.render(); return; }
    this.cool -= dt;
    this.board.step(dt);
    this.updateShots(dt);
    this.drainEvents();
    this.render();
    this.updateHud();
    this.warn();
    if (this.board.dead) return this.finish(false);
    if (this.board.cleared && !this.shots.length) return this.finish(true);
    if (this.board.meter >= this.board.meterNeed) openPick(this.board.offers());
  }

  finish(won) {
    this.ended = true;
    this.aim = this.down = null;
    const b = this.board;
    if (won) {
      const bonus = b.stars * RULES.starBonus;
      b.score += bonus;
      this.updateHud();
      this.banner(b.stars === 3 ? 'PERFECT!' : 'LEVEL CLEAR!', 1300, 64, `+${bonus} star bonus`);
      jingle([523, 659, 784, 1046, 1318]);
      this.pending = { t: 1.5, fn: () => this.mode === 'gauntlet' ? startLevel('gauntlet', this.n + 1, { stars: b.stars, score: b.score }) : levelCleared(this) };
    } else {
      this.banner('OUT OF STARS', 1200, 60);
      boom(400, 0.1);
      this.pending = { t: 1.3, fn: () => this.mode === 'gauntlet' ? gauntletOver(this) : levelFailed(this) };
    }
  }

  // A heartbeat beep while a chain is close to its monster.
  warn() {
    const d = Math.max(...this.board.chains.map(ch => this.board.danger(ch)));
    if (d > 0.85 && this.t > this.nextWarn) {
      this.nextWarn = this.t + 0.7;
      beep(196, 90, 0.05, 'sine');
    }
  }

  // ---------- Input (called from ui.js) ----------
  toGame(e) { return { x: this.scale.transformX(e.pageX), y: this.scale.transformY(e.pageY) }; }
  nearMachine(p) { return Math.hypot(p.x - this.level.launcher.x, p.y - this.level.launcher.y) < 64; }
  pointerDown(e) {
    if (this.ended) return;
    this.down = this.toGame(e);
    this.aimAt(this.down);
  }
  pointerMove(e) {
    if (!this.ended) this.aimAt(this.toGame(e));
  }
  // Let go to shoot. A tap on the gumball machine swaps instead.
  pointerUp(e) {
    const down = this.down;
    this.down = null;
    if (!e || !down || this.ended) { this.aim = null; return; }
    const p = this.toGame(e);
    if (this.nearMachine(p) && this.nearMachine(down)) this.swap();
    else this.fireAt(p.x, p.y);
    if (e.pointerType !== 'mouse') this.aim = null;
  }
  aimAt(p) {
    this.aim = p;
    const m = this.level.launcher;
    if (Math.hypot(p.x - m.x, p.y - m.y) > 12) this.angle = Math.atan2(p.y - m.y, p.x - m.x);
  }
  swap() {
    if (this.ended || !this.playing) return;
    this.board.swap();
    beep(784, 45, 0.035);
    this.tweens.add({ targets: [this.cur, this.other], scale: { from: 0.5, to: 0.82 }, duration: 120 });
  }

  // ---------- Shots ----------
  fireAt(x, y) {
    if (this.ended || this.intro > 0 || this.cool > 0 || !this.playing) return false;
    const m = this.level.launcher, a = Math.atan2(y - m.y, x - m.x);
    this.angle = a;
    // Licorice Laser: the candy arcs over everything to the candy nearest where you aimed
    const target = this.board.laser > 0 ? this.board.nearest(x, y, 2 * D) : null;
    const { c, kind } = this.board.take();
    this.cool = RULES.cooldown;
    this.fired = (this.fired || 0) + 1;
    const sx = m.x + Math.cos(a) * 60, sy = m.y + Math.sin(a) * 60;
    const sp = this.add.image(sx, sy, kind ? `candy-${kind}` : candyKey(c)).setDepth(8);
    if (target) {
      this.shots.push({ sp, c, kind, lob: { from: { x: sx, y: sy }, to: { x: target.x, y: target.y }, ch: target.ch, orb: target.orb, tap: { x, y }, t: 0, dur: 0.3 } });
      beep(988, 70, 0.04);
    } else {
      this.shots.push({ sp, c, kind, x: sx, y: sy, vx: Math.cos(a) * RULES.shotSpeed, vy: Math.sin(a) * RULES.shotSpeed });
      beep(660, 40, 0.035);
    }
    this.machine.setScale(0.92);
    this.tweens.add({ targets: this.machine, scale: 1, duration: 120 });
    return true;
  }

  updateShots(dt) {
    for (const s of this.shots) {
      if (s.lob) {
        const L = s.lob, k = Math.min(1, (L.t += dt) / L.dur);
        if (L.ch.orbs.includes(L.orb)) L.to = pointAt(L.ch.track, L.orb.s); // follow the target as the chain moves
        s.sp.setPosition(L.from.x + (L.to.x - L.from.x) * k, L.from.y + (L.to.y - L.from.y) * k).setScale(1 + 0.8 * Math.sin(Math.PI * k));
        if (k >= 1) { s.done = true; this.land(s, L); }
        continue;
      }
      const steps = Math.ceil(RULES.shotSpeed * dt / (D / 3));
      for (let i = 0; i < steps && !s.done; i++) {
        s.x += s.vx * dt / steps;
        s.y += s.vy * dt / steps;
        const hit = this.board.nearest(s.x, s.y, D * 0.85);
        if (hit) { s.done = true; this.strike(s, hit.ch, hit.i, s.x, s.y); }
        else if (s.x < -D || s.x > W + D || s.y < -D || s.y > H + D) s.done = true;
      }
      s.sp.setPosition(s.x, s.y);
      s.sp.rotation += dt * 12;
    }
    for (const s of this.shots) if (s.done) s.sp.destroy();
    this.shots = this.shots.filter(s => !s.done);
  }
  // A lobbed candy comes down: on its target if that's still there, else on whatever candy is nearest.
  land(s, L) {
    let ch = L.ch, i = ch.orbs.indexOf(L.orb);
    if (i < 0) {
      const near = this.board.nearest(L.to.x, L.to.y, 2 * D);
      if (!near) { this.fx.explode(6, L.to.x, L.to.y); return; }
      ({ ch, i } = near);
    }
    const p = pointAt(ch.track, ch.orbs[i].s); // which side it lands on follows where you aimed
    this.strike(s, ch, i, p.x + (L.tap.x - L.to.x), p.y + (L.tap.y - L.to.y));
  }
  strike(s, ch, i, x, y) {
    const at = pointAt(ch.track, ch.orbs[i].s);
    this.hits = (this.hits || 0) + 1;
    const orb = this.board.hit(ch, i, x, y, s.c, s.kind);
    if (orb) { orb.from = { x: s.sp.x, y: s.sp.y, t: this.t }; beep(330, 40, 0.03); }
    if (s.kind === 'bomb') {
      boom(280, 0.12);
      this.fx.particleTint = 0xff4d6d;
      this.fx.explode(30, at.x, at.y);
      this.cameras.main.shake(160, 0.006);
    } else if (s.kind === 'zap') {
      jingle([1318, 1046, 1568], 50);
      this.cameras.main.flash(120, 255, 255, 255);
    }
  }

  // ---------- What the board did this frame ----------
  drainEvents() {
    for (const e of this.board.events) {
      if (e.type === 'pop') {
        let sx = 0, sy = 0, n = 0;
        for (const b of e.orbs) {
          const sp = this.sprites.get(b.id);
          if (!sp) continue;
          this.sprites.delete(b.id);
          if (!sp.visible) { sp.destroy(); continue; }
          sx += sp.x; sy += sp.y; n++;
          this.fx.particleTint = b.c >= 0 ? CANDIES[b.c].color : 0xb8bdcc;
          this.fx.explode(6, sp.x, sp.y);
          this.tweens.add({ targets: sp, scale: 1.6, alpha: 0, duration: 220, onComplete: () => sp.destroy() });
        }
        if (n) this.floatText(sx / n, sy / n, `+${e.points}`);
        if (e.chain) this.floatText(sx / n || W / 2, (sy / n || H / 2) - 50, `COMBO x${e.chain + 1}!`, '#ffb020', 36);
        beep(523 * 2 ** (e.chain * 3 / 12), 110, 0.06, 'sine');
      } else if (e.type === 'eat') {
        for (const b of e.orbs) { this.sprites.get(b.id)?.destroy(); this.sprites.delete(b.id); }
        const m = this.monsters[e.ch.track.hole];
        this.tweens.add({ targets: m.mouth, scaleY: 0.1, duration: 90, yoyo: true, repeat: 1 });
        this.tweens.add({ targets: m.body, scale: 1, duration: 120, yoyo: true });
        boom(180, 0.1);
        beep(110, 220, 0.07, 'sawtooth');
        this.cameras.main.shake(200, 0.008);
        this.floatText(m.body.x, m.body.y - 80, this.board.stars > 0 ? 'CHOMP! -1 ★' : 'CHOMP!', '#8e5cf7', 34);
        this.updateHud();
      }
    }
    this.board.events.length = 0;
  }

  // ---------- Drawing every frame ----------
  render() {
    const alive = new Set();
    for (const ch of this.board.chains) for (const b of ch.orbs) {
      alive.add(b.id);
      let sp = this.sprites.get(b.id);
      if (!sp) this.sprites.set(b.id, sp = this.add.image(0, 0, candyKey(b.c)).setDepth(3));
      if (b.s < 0) { sp.setVisible(false); continue; }
      const p = pointAt(ch.track, b.s);
      let { x, y } = p;
      if (b.from) { // a candy that just landed slides into its place
        const k = Math.min(1, (this.t - b.from.t) / 0.1);
        x = b.from.x + (x - b.from.x) * k;
        y = b.from.y + (y - b.from.y) * k;
        if (k >= 1) b.from = null;
      }
      sp.setVisible(true).setPosition(x, y).setRotation(b.s / (D / 2));
    }
    for (const [id, sp] of this.sprites) if (!alive.has(id)) { sp.destroy(); this.sprites.delete(id); }
    // monsters open wider as their chain gets close
    for (const m of this.monsters) {
      const d = Math.max(0, ...m.chains.map(ch => this.board.danger(ch)));
      if (!this.tweens.isTweening(m.mouth)) m.mouth.scaleY = 0.85 * (0.3 + 0.7 * Phaser.Math.Clamp((d - 0.45) / 0.5, 0, 1));
    }
    // the gumball machine and the candies it holds
    const b = this.board;
    this.machine.rotation = this.angle;
    const curKey = b.next ? `candy-${b.next}` : candyKey(b.held[b.sel]), otherKey = candyKey(b.held[1 - b.sel]);
    if (this.cur.texture.key !== curKey) this.cur.setTexture(curKey);
    if (this.other.texture.key !== otherKey) this.other.setTexture(otherKey);
    const key = `${b.held}|${b.sel}`;
    if (this.playing && key !== this.heldKey) { this.heldKey = key; updateSwap(b.held, b.sel); }
    this.drawAim();
  }

  // Aim guide: a short dotted line; with Licorice Laser, a line all the way to the candy you'll land on.
  drawAim() {
    const g = this.aimG.clear();
    this.ring.setVisible(false);
    if (!this.aim || this.ended || !this.playing || this.intro > 0) return;
    const m = this.level.launcher, a = this.angle;
    if (this.board.laser > 0) {
      const t = this.board.nearest(this.aim.x, this.aim.y, 2 * D), end = t || this.aim, len = Math.hypot(end.x - m.x, end.y - m.y);
      g.fillStyle(0x3a0d2e, 0.8);
      for (let d = 70; d < len; d += 16) g.fillCircle(m.x + (end.x - m.x) * d / len, m.y + (end.y - m.y) * d / len, 4);
      if (t) this.ring.setPosition(t.x, t.y).setVisible(true).setTint(0x3a0d2e);
    } else if (settings.aim) {
      g.fillStyle(0xffffff, 0.85);
      for (let d = 70; d < 280; d += 18) g.fillCircle(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 5 - d / 90);
    }
  }

  // ---------- Power-ups ----------
  powerPicked(id) {
    this.board.usePick(id);
    this.banner(POWER[id].name.toUpperCase(), 900, 48);
    if (id === 'rewind') beep(300, 400, 0.05, 'sine');
    this.updateHud();
  }
}

// Phaser draws text once, so wait (briefly) for the font before starting the game.
Promise.race([document.fonts?.load(`700 32px ${FONT}`), new Promise(r => setTimeout(r, 2000))]).finally(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: '#ffe3ee',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: Play,
  });
});
