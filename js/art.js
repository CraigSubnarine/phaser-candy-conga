// Candy Conga art, built in code for three.js: candy spheres (their markings painted on canvas textures), the
// gumball machine, the monsters, the jars, the candy-cane curbs and the board under it all. No image files.
// The board's world space: x right and z down the screen (model x/y minus the board's center), y up.
import * as THREE from 'three';

export const css = c => `#${c.toString(16).padStart(6, '0')}`;
const starPath = (g, x, y, outer, inner, n = 5, rot = -Math.PI / 2) => {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? inner : outer, a = rot + i * Math.PI / n; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath();
};
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const texture = (cv, repeat) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; // canvas colors are sRGB; without this they look washed out
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const std = (color, roughness = 0.45, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

// ---------- Candies ----------
// Each candy's texture wraps round it (equirectangular, 256 x 128). Its poles point sideways, across the road, so as
// it rolls the band round its middle passes over the top: the marking is drawn 4 times round that band, so one copy
// always faces the camera. Every color keeps its own white marking, so they can be told apart without color.
function motif(g, x, y, mark) {
  g.fillStyle = g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 5;
  g.lineCap = g.lineJoin = 'round';
  if (mark === 'swirl') {
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.04) { const a = t * Math.PI * 3.2, r = 2 + t * 15; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.stroke();
  } else if (mark === 'dots') {
    for (const [dx, dy] of [[-8, 5], [8, 5], [0, -8]]) { g.beginPath(); g.arc(x + dx, y + dy, 4.4, 0, Math.PI * 2); g.fill(); }
  } else if (mark === 'stripes') {
    for (const off of [-9, 0, 9]) { g.beginPath(); g.moveTo(x + off - 7, y - 11); g.lineTo(x + off + 7, y + 11); g.stroke(); } // three slanted stripes
  } else if (mark === 'star') {
    starPath(g, x, y, 14, 6); g.fill();
  } else if (mark === 'heart') {
    g.beginPath(); g.arc(x - 5.5, y - 3, 6.2, 0, Math.PI * 2); g.arc(x + 5.5, y - 3, 6.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 11.5, y - 1); g.lineTo(x + 11.5, y - 1); g.lineTo(x, y + 12); g.fill();
  } else if (mark === 'ring') {
    g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke();
  } else if (mark === 'burst') {
    g.fillStyle = '#ffd23b'; starPath(g, x, y, 15, 6, 8, 0); g.fill();
  } else if (mark === 'bolt') {
    g.beginPath();
    for (const [dx, dy] of [[3, -16], [-8, 2], [0, 2], [-4, 16], [9, -3], [1, -3]]) g.lineTo(x + dx, y + dy);
    g.fill();
  }
}
const BANDS = [32, 96, 160, 224];
function candyCanvas(key) {
  const cv = canvas(256, 128), g = cv.getContext('2d');
  const fill = col => { g.fillStyle = css(col); g.fillRect(0, 0, 256, 128); };
  if (key === 'wild') { // a rainbow: a slice of every color round it, with white stars
    CANDIES.forEach((k, i) => { g.fillStyle = k.css; g.fillRect(i * 256 / 6, 0, 256 / 6 + 1, 128); });
    for (const u of BANDS) { g.fillStyle = '#fff'; starPath(g, u, 64, 12, 5); g.fill(); }
  } else if (key === 'jaw') { // a jawbreaker: grey layers, no marking
    const greys = ['#5d6275', '#9aa0b4', '#7d8396', '#b8bdcc'];
    for (let v = 0; v < 128; v += 16) { g.fillStyle = greys[(v / 16) % 4]; g.fillRect(0, v, 256, 16); }
  } else if (key === 'bomb') { // Cherry Bomb: dark cherry with fuse sparks
    fill(0x9e1230);
    for (const u of BANDS) motif(g, u, 64, 'burst');
  } else if (key === 'zap') { // Pop Rocks: fizzy blue with a lightning bolt and sparkles
    fill(0x3fc6ff);
    for (const u of BANDS) motif(g, u, 64, 'bolt');
    ['#ff4d6d', '#ffc93c', '#2ec98a', '#9b5cff', '#ffffff'].forEach((c, i) => { g.fillStyle = c; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc((i * 53 + k * 43) % 256, 20 + ((i * 37 + k * 29) % 90), 3, 0, Math.PI * 2); g.fill(); } });
  } else {
    fill(CANDIES[key].color);
    for (const u of BANDS) motif(g, u, 64, CANDIES[key].mark);
  }
  return cv;
}
// Candy materials by color index (0-5), 'wild', 'jaw', 'bomb' or 'zap'. Made once and shared by every candy.
const candyMats = {};
export const candyKey = c => c >= 0 || typeof c === 'string' ? c : c === JAW ? 'jaw' : 'wild';
export function candyMaterial(key) {
  return candyMats[key] ??= new THREE.MeshPhysicalMaterial({ map: texture(candyCanvas(key)), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
}
export const candyGeo = new THREE.SphereGeometry(D / 2, 28, 18);
// One candy: the outer group sits on the road and faces along it; the ball inside lies on its side (poles across the
// road) and spins about its poles to roll.
export function makeCandy(key) {
  const root = new THREE.Group(), ball = new THREE.Mesh(candyGeo, candyMaterial(key));
  ball.castShadow = true;
  ball.rotation.x = Math.PI / 2;
  root.add(ball);
  root.position.y = D / 2;
  return { root, ball, key };
}
export function setCandy(c, key) {
  if (c.key === key) return;
  c.key = key;
  c.ball.material = candyMaterial(key);
}

// ---------- The gumball machine ----------
// Faces +x (its chute), and turns about y to aim. cur: the candy you'll shoot, at the chute. other: the spare, in the globe.
export function makeMachine() {
  const g = new THREE.Group(), red = std(0xe63946, 0.3), cast = m => { m.castShadow = true; return m; };
  const base = cast(new THREE.Mesh(new THREE.CylinderGeometry(42, 48, 30, 32), red));
  base.position.y = 15;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(42, 4, 10, 40), std(0xdfe4ee, 0.25, { metalness: 0.5 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 30;
  const chute = cast(new THREE.Mesh(new THREE.BoxGeometry(44, 14, 30), std(0x9aa1b0, 0.35, { metalness: 0.3 })));
  chute.position.set(46, 8, 0);
  const knob = cast(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 20), std(0xffd23b, 0.3)));
  knob.rotation.z = Math.PI / 2;
  knob.position.set(-48, 16, 0);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(36, 32, 18), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.04, clearcoat: 1, depthWrite: false }));
  globe.position.y = 62;
  globe.renderOrder = 2; // drawn after the candies inside it
  const cap = cast(new THREE.Mesh(new THREE.SphereGeometry(11, 16, 10), red));
  cap.position.y = 98;
  g.add(base, rim, chute, knob, globe, cap);
  // a few gumballs in the bottom of the globe
  const ball = new THREE.SphereGeometry(8, 14, 10);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, r = 10 + (i % 3) * 7, m = new THREE.Mesh(ball, std(CANDIES[i % 6].color, 0.3));
    m.position.set(Math.cos(a) * r, 36 + (i % 4) * 4, Math.sin(a) * r);
    g.add(m);
  }
  const cur = makeCandy(0), other = makeCandy(0);
  cur.root.position.set(68, D / 2 * 0.82, 0);
  cur.root.scale.setScalar(0.82);
  other.root.position.set(0, 64, 0);
  other.root.scale.setScalar(0.72);
  g.add(cur.root, other.root);
  return { group: g, cur, other };
}

// ---------- Monsters ----------
export const MONSTER_COLORS = [0x8e5cf7, 0x2bb3a3, 0xff6f61, 0x4c7dff];
// A round monster sitting over the end of a road, its face tilted up towards the camera. mouth opens (scale.y) as
// the chain gets close, and chomps when it eats.
export function makeMonster(color, tilt) {
  const root = new THREE.Group(), face = new THREE.Group();
  root.add(face);
  face.rotation.x = -(Math.PI / 2 - tilt) * 0.85; // its front (+z) turned up to look at the camera
  const body = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), std(color, 0.5));
  body.castShadow = true;
  body.scale.set(1, 0.92, 0.9);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 14), std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), 0.5));
  belly.scale.set(1.2, 0.8, 0.5);
  belly.position.set(0, -16, 32);
  face.add(body, belly);
  const white = std(0xffffff, 0.2), dark = std(0x2a1030, 0.2), cream = std(0xfff2c9, 0.4), blush = std(0xff9cc2, 0.6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(13, 18, 12), white);
    eye.position.set(side * 19, 18, 38);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(6.5, 14, 10), dark);
    pupil.position.set(side * 17, 16, 49);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(7, 24, 12), cream);
    horn.position.set(side * 26, 44, 4);
    horn.rotation.z = -side * 0.35;
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), blush);
    cheek.scale.set(1.4, 0.8, 0.4);
    cheek.position.set(side * 36, 0, 32);
    face.add(eye, pupil, horn, cheek);
  }
  const mouth = new THREE.Group(), inside = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 14), std(0x3a0d2e, 0.8));
  inside.scale.set(1, 1, 0.35);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 10), std(0xff7aa8, 0.6));
  tongue.scale.set(1.1, 0.5, 0.3);
  tongue.position.set(0, -10, 5);
  mouth.add(inside, tongue);
  mouth.position.set(0, -12, 42);
  face.add(mouth);
  root.position.y = 36;
  return { root, face, mouth };
}

// ---------- Jars and curbs ----------
// Candy-cane stripes, for curbs and jars.
function caneTexture(a, b) {
  const cv = canvas(128, 32), g = cv.getContext('2d');
  g.fillStyle = css(b); g.fillRect(0, 0, 128, 32);
  g.fillStyle = css(a);
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 32, 32); g.lineTo(x + 16, 32); g.fill(); }
  return texture(cv, true);
}
const caneMats = new Map();
const caneMaterial = (a, b) => caneMats.get(`${a}-${b}`) ?? caneMats.set(`${a}-${b}`, std(0xffffff, 0.3, { map: caneTexture(a, b) })).get(`${a}-${b}`);
export function makeJar() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(25, 9, 12, 32), caneMaterial(0xff4d6d, 0xffffff));
  ring.material.map.repeat.set(3, 1);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 7;
  ring.castShadow = true;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(19, 24), std(0x5a2346, 0.9));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 1;
  g.add(ring, hole);
  return g;
}
// A striped tube along one side of a road (side -1 or 1), lying on the board. pts: the road's points (model x/y).
export function makeCurb(pts, side, colors) {
  const n = pts.length / 2, every = 4, off = D / 2 + 7, r = 8, seg = 8, pos = [], uv = [], idx = [];
  let rings = 0;
  for (let i = 0; i < n; i += every) {
    const j0 = Math.max(0, i - 2), j1 = Math.min(n - 1, i + 2);
    let tx = pts[2 * j1] - pts[2 * j0], ty = pts[2 * j1 + 1] - pts[2 * j0 + 1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty * side, ny = tx * side, cx = pts[2 * i] + nx * off - W / 2, cz = pts[2 * i + 1] + ny * off - H / 2;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(cx + nx * Math.cos(a) * r, 4 + Math.sin(a) * r, cz + ny * Math.cos(a) * r);
      uv.push(i * STEP / 110, k / seg); // a stripe every ~27 px
    }
    rings++;
  }
  for (let q = 0; q < rings - 1; q++) for (let k = 0; k < seg; k++) {
    const a = q * (seg + 1) + k, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, caneMaterial(colors[0], colors[1]));
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------- The board ----------
// The pastel ground with sprinkles and the roads' fill, painted once per level onto one big canvas texture. It covers
// BOARD (model coordinates), more than the play area, so wide screens still see sprinkles.
export const BOARD = { x0: -360, y0: -160, x1: W + 360, y1: H + 160 }, BOARD_SCALE = 1.5;
export function boardTexture(level, bg, roadFills) {
  const S = BOARD_SCALE, cv = canvas((BOARD.x1 - BOARD.x0) * S, (BOARD.y1 - BOARD.y0) * S), g = cv.getContext('2d');
  g.setTransform(S, 0, 0, S, -BOARD.x0 * S, -BOARD.y0 * S);
  g.fillStyle = bg;
  g.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
  const R = makeRng(level.seed ^ 0xbeef);
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.globalAlpha = 0.3;
  for (let i = 0; i < 420; i++) {
    const x = R.range(BOARD.x0, BOARD.x1), y = R.range(BOARD.y0, BOARD.y1), a = R.range(0, TAU);
    g.strokeStyle = CANDIES[R.int(0, CANDIES.length - 1)].css;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
  }
  g.globalAlpha = 1;
  g.lineJoin = 'round';
  const road = (t, width, color) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    for (let i = 0; i < t.pts.length / 2; i += 2) g.lineTo(t.pts[2 * i], t.pts[2 * i + 1]);
    g.stroke();
  };
  level.tracks.forEach(t => road(t, D + 30, 'rgba(90,30,70,0.10)')); // a soft shadow round each road
  level.tracks.forEach((t, i) => road(t, D + 12, roadFills[i % roadFills.length]));
  return texture(cv);
}

// A 4-point sparkle for the pop particles.
export function sparkTexture() {
  const cv = canvas(32, 32), g = cv.getContext('2d');
  g.fillStyle = '#fff';
  starPath(g, 16, 16, 15, 4, 4, 0);
  g.fill();
  return texture(cv);
}
