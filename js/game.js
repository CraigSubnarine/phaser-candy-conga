// Candy Conga: the 3D board (three.js). Loaded last, as a module; the plain scripts before it (data, levels, chain,
// ui) share globals with it. The rules live in chain.js (Board); this file draws the board, flies the shots,
// handles aiming and plays the effects. ui.js (menus, saves, sound, input) calls into window.game.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeCandy, setCandy, candyKey, makeMachine, makeMonster, MONSTER_COLORS, makeJar, makeCurb, boardTexture, BOARD, sparkTexture } from './art.js';

const DEG = Math.PI / 180, FOV = 34;
const TILT = 30 * DEG;  // the camera looks down at the board, leaning back this far from straight down
const SWAP_PX = 86;     // screen kept clear at the bottom for the swap button
// What the camera must always show (model coordinates): the play area plus room for the monsters and curbs.
const FRAME = { x0: -12, x1: W + 12, y0: PLAY.y0 - 80, y1: PLAY.y1 + 50 }; // (a monster at the very edge of PLAY still fits)
const ROADS = [ // candy-cane curbs and the road's fill, one style per road
  { cane: [0xff5d8f, 0xffffff], fill: '#ffd6e5' },
  { cane: [0x2ec98a, 0xffffff], fill: '#d2f7e8' },
  { cane: [0xc98a4b, 0xffe6c4], fill: '#f3d2a8' },
];
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wx = x => x - W / 2, wz = y => y - H / 2; // model x/y -> world x/z
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Renderer, scene, camera, lights ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // (three 0.186 dropped PCFSoftShadowMap)
renderer.domElement.id = 'view';
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // glossy candy
scene.environmentIntensity = 0.7;
const camera = new THREE.PerspectiveCamera(FOV, 1, 50, 9000);
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(-380, 1100, 420);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -820, right: 820, top: 900, bottom: -900, near: 300, far: 2600 });
sun.shadow.bias = -0.0006;
scene.add(new THREE.HemisphereLight(0xffffff, 0xffc4dc, 1.3), sun, sun.target);

// The ground: unlit, so the pastel colors come out exactly as painted, with a shadow catcher on top for soft shadows.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshBasicMaterial());
ground.rotation.x = -Math.PI / 2;
const boardMat = new THREE.MeshBasicMaterial();
const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0), boardMat);
board.rotation.x = -Math.PI / 2;
board.position.set(wx((BOARD.x0 + BOARD.x1) / 2), 0.2, wz((BOARD.y0 + BOARD.y1) / 2));
const shadows = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2800), new THREE.ShadowMaterial({ opacity: 0.2 }));
shadows.rotation.x = -Math.PI / 2;
shadows.position.y = 0.4;
shadows.receiveShadow = true;
scene.add(ground, board, shadows);

// ---------- Camera: fit the board between the HUD and the swap button, on any screen ----------
const cam = { dist: 2500, tz: 0, shake: 0, amp: 0 };
const v3 = new THREE.Vector3();
function placeCamera(dist, tz) {
  camera.position.set(0, Math.cos(TILT) * dist, tz + Math.sin(TILT) * dist);
  camera.lookAt(0, 0, tz);
  camera.updateMatrixWorld();
}
function frameBox() { // where FRAME's corners land on screen (-1..1), at the ground and a monster's height
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const x of [FRAME.x0, FRAME.x1]) for (const y of [FRAME.y0, FRAME.y1]) for (const h of [0, 70]) {
    v3.set(wx(x), h, wz(y)).project(camera);
    b.x0 = Math.min(b.x0, v3.x); b.x1 = Math.max(b.x1, v3.x); b.y0 = Math.min(b.y0, v3.y); b.y1 = Math.max(b.y1, v3.y);
  }
  return b;
}
function fitCamera() {
  const hud = $('hud').getBoundingClientRect().bottom + 4;
  const top = 1 - 2 * hud / innerHeight, bottom = -1 + 2 * SWAP_PX / innerHeight;
  let dist = 2500, tz = 0;
  for (let it = 0; it < 5; it++) {
    let lo = 300, hi = 40000;
    for (let k = 0; k < 30; k++) { // the nearest distance at which the frame fits
      dist = (lo + hi) / 2;
      placeCamera(dist, tz);
      const b = frameBox();
      if (b.x1 - b.x0 <= 1.96 && b.y1 - b.y0 <= top - bottom) hi = dist; else lo = dist;
    }
    placeCamera(dist = hi, tz);
    const b = frameBox(), err = (b.y1 + b.y0) / 2 - (top + bottom) / 2;
    tz -= err * dist * Math.tan(FOV / 2 * DEG); // sitting too high on screen: aim further up the board
  }
  Object.assign(cam, { dist, tz });
  placeCamera(dist, tz);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitCamera();
}

// Model point -> page pixels, and page pixels -> model point (on the plane through the candies' middles).
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -D / 2);
function toScreen(x, y, h = D / 2) {
  v3.set(wx(x), h, wz(y)).project(camera);
  return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight };
}
function toGame(px, py) {
  ndc.set(px / innerWidth * 2 - 1, 1 - py / innerHeight * 2);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(aimPlane, v3) ? { x: v3.x + W / 2, y: v3.z + H / 2 } : { x: W / 2, y: 0 };
}

// ---------- Effects: sparkle bursts ----------
const FX = 500, fxPos = new Float32Array(FX * 3).fill(1e6), fxCol = new Float32Array(FX * 3), fxVel = new Float32Array(FX * 3), fxLife = new Float32Array(FX);
const fxGeo = new THREE.BufferGeometry();
fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3));
fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 3));
scene.add(new THREE.Points(fxGeo, new THREE.PointsMaterial({ size: 34, map: sparkTexture(), vertexColors: true, transparent: true, depthWrite: false })));
let fxNext = 0;
const tmpColor = new THREE.Color();
function burst(x, y, n, color, speed = 260) {
  tmpColor.set(color);
  for (let k = 0; k < n; k++) {
    const i = fxNext++ % FX, a = Math.random() * TAU, s = speed * (0.35 + Math.random());
    fxPos.set([wx(x), D / 2, wz(y)], i * 3);
    fxVel.set([Math.cos(a) * s, 120 + Math.random() * 220, Math.sin(a) * s], i * 3);
    fxCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    fxLife[i] = 0.3 + Math.random() * 0.35;
  }
}
function updateFx(dt) {
  for (let i = 0; i < FX; i++) {
    if (fxLife[i] <= 0) continue;
    if ((fxLife[i] -= dt) <= 0) { fxPos[i * 3 + 1] = 1e6; continue; }
    fxVel[i * 3 + 1] -= 900 * dt;
    for (let k = 0; k < 3; k++) fxPos[i * 3 + k] += fxVel[i * 3 + k] * dt;
  }
  fxGeo.attributes.position.needsUpdate = fxGeo.attributes.color.needsUpdate = true;
}

// Text that floats up from a spot on the board, and a big message across the middle (both HTML, over the canvas).
function floatText(x, y, str, color = '#ff4d8d', size = 30) {
  const p = toScreen(x, y), el = document.createElement('div');
  el.className = 'float';
  el.textContent = str;
  Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, color, fontSize: `${size * Math.min(1, innerWidth / 720) * 1.25}px` });
  el.addEventListener('animationend', () => el.remove());
  $('floats').append(el);
}
function flash() {
  const el = $('flash');
  el.classList.remove('on');
  void el.offsetWidth; // restart the animation
  el.classList.add('on');
}

// Aim guide: small balls along the line; with Licorice Laser, a dark line to a ring round the candy you'll hit.
const AIM_DOTS = 80;
const aimDots = new THREE.InstancedMesh(new THREE.SphereGeometry(4.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), AIM_DOTS);
aimDots.count = 0;
aimDots.frustumCulled = false;
const ring = new THREE.Mesh(new THREE.TorusGeometry(29, 3, 8, 40), new THREE.MeshBasicMaterial({ color: 0x3a0d2e }));
ring.rotation.x = Math.PI / 2;
ring.visible = false;
const machine = makeMachine();
machine.group.scale.setScalar(1.25);
scene.add(aimDots, ring, machine.group);
const dummy = new THREE.Object3D();

// ---------- The game ----------
class Play {
  constructor() {
    this.world = new THREE.Group(); // everything that belongs to one level
    scene.add(this.world);
    this.trash = [];                // that level's geometries and textures, freed when the next one loads
  }

  // A new level (or the menu's backdrop). data: { play, mode, level, stars, score }.
  load(data) {
    for (const o of this.trash) o.dispose();
    this.trash = [];
    this.world.clear();
    this.playing = !!data?.play;
    this.mode = data?.mode || 'levels';
    this.n = data?.level || nextLevel();
    this.level = makeLevel(this.n);
    this.board = new Board(this.level, { stars: data?.stars, score: data?.score, mode: this.mode });
    this.t = 0;                          // game time that stops while paused (update() isn't called then)
    this.intro = this.playing ? 1.3 : 0; // the level card shows before the chain starts
    this.cool = 0;                       // seconds until the next shot
    this.shots = [];
    this.candies = new Map();            // candy id -> its 3D candy
    this.popping = [];                   // candies swelling up and vanishing
    this.ended = false;
    this.pending = null;                 // { t, fn }: what happens after a level ends
    this.down = null;                    // where the current touch/click started
    this.aim = null;                     // the point being aimed at
    this.angle = -Math.PI / 2;
    this.nextWarn = 0;
    this.kick = this.swapT = this.bannerT = 0;
    this.hudKey = this.heldKey = '';
    cam.shake = 0;

    const L = this.level, bg = `hsl(${Math.round((this.n * 0.137) % 1 * 360)}, 75%, 93%)`; // (three.js reads only the comma form)
    ground.material.color.set(bg);
    boardMat.map = boardTexture(L, bg, ROADS.map(r => r.fill));
    boardMat.needsUpdate = true;
    this.trash.push(boardMat.map);
    L.tracks.forEach((t, i) => {
      for (const side of [-1, 1]) {
        const curb = makeCurb(t.pts, side, ROADS[i % ROADS.length].cane);
        this.world.add(curb);
        this.trash.push(curb.geometry);
      }
      const jar = makeJar();
      jar.position.set(wx(t.pts[0]), 0, wz(t.pts[1]));
      this.world.add(jar);
    });
    this.monsters = L.holes.map((h, i) => {
      const m = makeMonster(MONSTER_COLORS[(this.n + i) % MONSTER_COLORS.length], TILT);
      m.root.position.x = wx(h.x);
      m.root.position.z = wz(h.y);
      this.world.add(m.root);
      return { ...m, chomp: 0, chains: this.board.chains.filter(ch => ch.track.hole === i) };
    });
    machine.group.position.set(wx(L.launcher.x), 0, wz(L.launcher.y));
    $('hud').style.visibility = this.playing ? 'visible' : 'hidden';
    $('banner').hidden = true;
    $('floats').replaceChildren();
    this.updateHud();
    if (!this.manual) this.render(); // (the playtest draws when it wants to)
    if (this.playing) {
      const roads = L.tracks.length === 1 ? '1 road' : `${L.tracks.length} roads`;
      this.banner(`${this.mode === 'gauntlet' ? 'GAUNTLET · ' : ''}LEVEL ${this.n}`, 1300, `${L.name} · ${roads} · par ${clock(this.board.par)}`);
      jingle([523, 659, 784], 110);
    }
  }

  label() { return `${this.mode === 'gauntlet' ? 'Gauntlet · ' : ''}Level ${this.n}`; }

  updateHud() {
    if (!this.playing) return;
    const b = this.board, st = [];
    if (b.next) st.push(`Next shot: ${POWER[b.next].name}`);
    if (b.slow > 0) st.push(`Syrup ${Math.ceil(b.slow)}`);
    if (b.laser > 0) st.push(`Laser ${Math.ceil(b.laser)}`);
    const text = st.length ? st.join(' · ') : `COMBO METER ${b.meter}/${b.meterNeed}`, time = Math.floor(b.time);
    const key = `${this.n}|${b.score}|${b.stars}|${text}|${time}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    $('hudLevel').textContent = this.label();
    $('hudScore').textContent = `Score ${b.score.toLocaleString()}`;
    $('hudStars').innerHTML = starsHtml(b.stars);
    $('meterFill').style.width = `${Math.min(1, b.meter / b.meterNeed) * 100}%`;
    $('meterText').textContent = text;
    $('hudTime').textContent = `${clock(time)} · par ${clock(b.par)}`;
    $('hudTime').classList.toggle('over', b.time > b.par);
  }

  // A big message in the middle of the screen (and an optional smaller line under it).
  banner(title, ms = 1100, sub = '') {
    $('bannerTitle').textContent = title;
    $('bannerSub').textContent = sub;
    const el = $('banner');
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    this.bannerT = ms / 1000;
  }

  update(dt) {
    this.t += dt;
    updateFx(dt);
    this.animate(dt);
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').hidden = true;
    if (!this.playing) { // menu backdrop: the chain rolls in, then waits
      if (this.board.chains.some(ch => ch.rollIn)) this.board.step(dt);
      return;
    }
    if (this.ended) {
      this.updateShots(dt);
      this.drainEvents();
      if (this.pending && (this.pending.t -= dt) <= 0) { const fn = this.pending.fn; this.pending = null; fn(); }
      return;
    }
    if (this.intro > 0) { this.intro -= dt; return; }
    this.cool -= dt;
    this.board.step(dt);
    this.updateShots(dt);
    this.drainEvents();
    this.updateHud();
    this.warn();
    if (this.board.dead) return this.finish(false);
    if (this.board.cleared && !this.shots.length) return this.finish(true);
  }

  finish(won) {
    this.ended = true;
    this.aim = this.down = null;
    const b = this.board;
    if (won) {
      const bonus = b.clearBonus();
      b.addScore(bonus.stars + bonus.ace);
      this.updateHud();
      this.banner(b.stars === 3 ? 'PERFECT!' : 'LEVEL CLEAR!', 1300, `+${bonus.stars} star bonus` + (bonus.ace ? ` · +${bonus.ace} ace time!` : ''));
      jingle([523, 659, 784, 1046, 1318]);
      this.pending = { t: 1.5, fn: () => this.mode === 'gauntlet' ? startLevel('gauntlet', this.n + 1, { stars: b.stars, score: b.score }) : levelCleared(this) };
    } else {
      this.banner('OUT OF STARS', 1200);
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
  toGame(e) { return toGame(e.clientX, e.clientY); }
  toScreen(x, y) { return toScreen(x, y); }
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
    this.swapT = 0.12;
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
    const sx = m.x + Math.cos(a) * 68, sy = m.y + Math.sin(a) * 68;
    const obj = makeCandy(kind || candyKey(c));
    this.world.add(obj.root);
    if (target) {
      this.shots.push({ obj, c, kind, x: sx, y: sy, lob: { from: { x: sx, y: sy }, to: { x: target.x, y: target.y }, ch: target.ch, orb: target.orb, tap: { x, y }, t: 0, dur: 0.3 } });
      beep(988, 70, 0.04);
    } else {
      this.shots.push({ obj, c, kind, x: sx, y: sy, vx: Math.cos(a) * RULES.shotSpeed, vy: Math.sin(a) * RULES.shotSpeed, inGap: -1, gaps: 0 });
      beep(660, 40, 0.035);
    }
    this.kick = 0.12;
    return true;
  }

  updateShots(dt) {
    for (const s of this.shots) {
      let h = D / 2;
      if (s.lob) {
        const L = s.lob, k = Math.min(1, (L.t += dt) / L.dur);
        if (L.ch.orbs.includes(L.orb)) L.to = pointAt(L.ch.track, L.orb.s); // follow the target as the chain moves
        s.x = L.from.x + (L.to.x - L.from.x) * k;
        s.y = L.from.y + (L.to.y - L.from.y) * k;
        h += Math.sin(Math.PI * k) * 160;
        if (k >= 1) { s.done = true; this.land(s, L); }
      } else {
        const steps = Math.ceil(RULES.shotSpeed * dt / (D / 3));
        for (let i = 0; i < steps && !s.done; i++) {
          s.x += s.vx * dt / steps;
          s.y += s.vy * dt / steps;
          const hit = this.board.nearest(s.x, s.y, D * 0.85);
          if (hit) { s.done = true; this.strike(s, hit.ch, hit.i, s.x, s.y); continue; }
          if (s.x < -D || s.x > W + D || s.y < -D || s.y > H + D) { s.done = true; continue; }
          const gap = this.board.gapAt(s.x, s.y); // count the gaps it flies right through (in one side, out the other)
          if (s.inGap >= 0 && gap !== s.inGap) s.gaps++;
          s.inGap = gap;
        }
      }
      s.obj.root.position.set(wx(s.x), h, wz(s.y));
      s.obj.ball.rotation.y += dt * 12;
    }
    for (const s of this.shots) if (s.done) this.world.remove(s.obj.root);
    this.shots = this.shots.filter(s => !s.done);
  }
  // A lobbed candy comes down: on its target if that's still there, else on whatever candy is nearest.
  land(s, L) {
    let ch = L.ch, i = ch.orbs.indexOf(L.orb);
    if (i < 0) {
      const near = this.board.nearest(L.to.x, L.to.y, 2 * D);
      if (!near) { burst(L.to.x, L.to.y, 6, 0xffffff); return; }
      ({ ch, i } = near);
    }
    const p = pointAt(ch.track, ch.orbs[i].s); // which side it lands on follows where you aimed
    this.strike(s, ch, i, p.x + (L.tap.x - L.to.x), p.y + (L.tap.y - L.to.y));
  }
  strike(s, ch, i, x, y) {
    const at = pointAt(ch.track, ch.orbs[i].s);
    this.hits = (this.hits || 0) + 1;
    const orb = this.board.hit(ch, i, x, y, s.c, s.kind, s.gaps || 0);
    if (orb) { orb.from = { x: s.x, y: s.y, t: this.t }; beep(330, 40, 0.03); }
    if (s.kind === 'bomb') {
      boom(280, 0.12);
      burst(at.x, at.y, 40, 0xff4d6d, 420);
      Object.assign(cam, { shake: 0.16, amp: 10 });
    } else if (s.kind === 'zap') {
      jingle([1318, 1046, 1568], 50);
      flash();
    }
  }

  // ---------- What the board did this frame ----------
  drainEvents() {
    for (const e of this.board.events) {
      if (e.type === 'pop') {
        let sx = 0, sy = 0, n = 0;
        for (const b of e.orbs) {
          const c = this.candies.get(b.id);
          if (!c) continue;
          this.candies.delete(b.id);
          if (!c.root.visible) { this.world.remove(c.root); continue; }
          const x = c.root.position.x + W / 2, y = c.root.position.z + H / 2;
          sx += x; sy += y; n++;
          burst(x, y, 6, b.c >= 0 ? CANDIES[b.c].color : 0xb8bdcc);
          this.popping.push({ c, t: 0 });
        }
        if (n) floatText(sx / n, sy / n, `+${e.points}`);
        if (e.chain) floatText(sx / n || W / 2, (sy / n || H / 2) - 50, `COMBO x${e.chain + 1}!`, '#ffb020', 36);
        beep(523 * 2 ** (e.chain * 3 / 12), 110, 0.06, 'sine');
      } else if (e.type === 'eat') {
        for (const b of e.orbs) { const c = this.candies.get(b.id); if (c) this.world.remove(c.root); this.candies.delete(b.id); }
        const m = this.monsters[e.ch.track.hole], h = this.level.holes[e.ch.track.hole];
        m.chomp = 0.36;
        boom(180, 0.1);
        beep(110, 220, 0.07, 'sawtooth');
        Object.assign(cam, { shake: 0.2, amp: 12 });
        floatText(h.x, h.y - 90, this.board.stars > 0 ? 'CHOMP! -1 ★' : 'CHOMP!', '#8e5cf7', 34);
        this.updateHud();
      } else if (e.type === 'bonus') { // a gap shot
        floatText(e.x, e.y - 95, `${e.label} +${e.points}`, '#2ec98a', 32);
        jingle([880, 1175], 60);
      } else if (e.type === 'star') { // Gauntlet: enough points to win back a star
        floatText(W / 2, H * 0.3, 'EXTRA STAR! ★', '#ffb020', 44);
        jingle([784, 988, 1175, 1568], 80);
        this.updateHud();
      } else if (e.type === 'power') { // a combo filled the meter: a random power-up, at once
        const p = POWER[e.id];
        this.banner(`${p.name.toUpperCase()}!`, 1700, p.desc);
        jingle([659, 784, 988, 1318], 70);
        if (e.id === 'rewind') beep(300, 400, 0.05, 'sine');
        this.updateHud();
      }
    }
    this.board.events.length = 0;
  }

  // Short animations that run on game time: popping candies, monsters' mouths, the machine's kick and swap.
  animate(dt) {
    for (const p of this.popping) {
      p.t += dt;
      p.c.root.scale.setScalar(1 + p.t / 0.18 * 0.7);
      if (p.t >= 0.18) this.world.remove(p.c.root);
    }
    this.popping = this.popping.filter(p => p.t < 0.18);
    for (const m of this.monsters) {
      const d = Math.max(0, ...m.chains.map(ch => this.board.danger(ch)));
      let open = 0.3 + 0.7 * clamp((d - 0.45) / 0.5, 0, 1), size = 1;
      if (m.chomp > 0) {
        m.chomp -= dt;
        open = 0.1 + 0.9 * Math.abs(Math.sin(m.chomp * Math.PI / 0.18));
        size = 1 + 0.12 * Math.sin(m.chomp * Math.PI / 0.36);
      }
      m.mouth.scale.y = open;
      m.root.scale.setScalar(size);
    }
    this.kick = Math.max(0, this.kick - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    cam.shake = Math.max(0, cam.shake - dt);
  }

  // ---------- Drawing ----------
  render() {
    const alive = new Set();
    for (const ch of this.board.chains) for (const b of ch.orbs) {
      alive.add(b.id);
      let c = this.candies.get(b.id);
      if (!c) { this.candies.set(b.id, c = makeCandy(candyKey(b.c))); this.world.add(c.root); }
      if (b.s < 0) { c.root.visible = false; continue; }
      const p = pointAt(ch.track, b.s);
      let { x, y } = p;
      if (b.from) { // a candy that just landed slides into its place
        const k = Math.min(1, (this.t - b.from.t) / 0.1);
        x = b.from.x + (x - b.from.x) * k;
        y = b.from.y + (y - b.from.y) * k;
        if (k >= 1) b.from = null;
      }
      c.root.visible = true;
      c.root.position.set(wx(x), D / 2, wz(y));
      c.root.rotation.y = -p.a;
      c.ball.rotation.set(Math.PI / 2, -b.s / (D / 2), 0); // rolls as it goes
    }
    for (const [id, c] of this.candies) if (!alive.has(id)) { this.world.remove(c.root); this.candies.delete(id); }
    // the gumball machine and the candies it holds
    const b = this.board;
    machine.group.rotation.y = -this.angle;
    machine.group.scale.setScalar(1.25 * (1 - this.kick / 0.12 * 0.08));
    setCandy(machine.cur, b.next || candyKey(b.held[b.sel]));
    setCandy(machine.other, candyKey(b.held[1 - b.sel]));
    const pop = 1 - this.swapT / 0.12 * 0.4;
    machine.cur.root.scale.setScalar(0.82 * pop);
    machine.other.root.scale.setScalar(0.72 * pop);
    machine.cur.ball.rotation.y += 0.01;
    const key = `${b.held}|${b.sel}`;
    if (this.playing && key !== this.heldKey) { this.heldKey = key; updateSwap(b.held, b.sel); }
    this.drawAim();
    // a little camera shake for bombs and chomps
    const base = camera.position.clone();
    if (cam.shake > 0) camera.position.add(v3.set((Math.random() - 0.5) * cam.amp, 0, (Math.random() - 0.5) * cam.amp));
    renderer.render(scene, camera);
    camera.position.copy(base);
  }

  drawAim() {
    aimDots.count = 0;
    ring.visible = false;
    if (!this.aim || this.ended || !this.playing || this.intro > 0) return;
    const m = this.level.launcher, a = this.angle, dots = [];
    if (this.board.laser > 0) {
      const t = this.board.nearest(this.aim.x, this.aim.y, 2 * D), end = t || this.aim, len = Math.hypot(end.x - m.x, end.y - m.y);
      for (let d = 76; d < len && dots.length < AIM_DOTS; d += 16) dots.push([m.x + (end.x - m.x) * d / len, m.y + (end.y - m.y) * d / len, 1]);
      aimDots.material.color.set(0x3a0d2e);
      if (t) { ring.position.set(wx(t.x), D / 2, wz(t.y)); ring.visible = true; }
    } else if (settings.aim) {
      for (let d = 76; d < 290; d += 18) dots.push([m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 1.1 - d / 400]);
      aimDots.material.color.set(0xffffff);
    }
    dots.forEach(([x, y, s], i) => {
      dummy.position.set(wx(x), D / 2, wz(y));
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      aimDots.setMatrixAt(i, dummy.matrix);
    });
    aimDots.count = dots.length;
    aimDots.instanceMatrix.needsUpdate = true;
  }
}

const play = new Play();
play.manual = false; // the playtest sets this and steps the game itself
window.game = play;
addEventListener('resize', resize);
resize();
play.load({ play: false, level: nextLevel() });
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (play.manual || app.state === 'paused') return; // paused: the last frame stays up
  play.update(dt);
  play.render();
});
