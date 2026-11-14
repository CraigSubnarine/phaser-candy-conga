// Candy Conga art: every picture is drawn in code with Phaser Graphics and saved as a texture under a name
// ('candy-0', 'machine', 'monster-1', ...). Anything that already exists under that name (say, a PNG loaded
// later) is left alone, so drawn art can be swapped for real art one picture at a time.

// Mixes a color towards black (f < 0) or white (f > 0).
const shade = (c, f) => {
  const t = f < 0 ? 0 : 255, p = Math.abs(f), ch = s => (c >> s) & 255;
  return (Math.round(ch(16) + (t - ch(16)) * p) << 16) | (Math.round(ch(8) + (t - ch(8)) * p) << 8) | Math.round(ch(0) + (t - ch(0)) * p);
};
const starPoints = (x, y, outer, inner, n = 5, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? inner : outer, a = rot + i * Math.PI / n; return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }; });
const candyKey = c => c >= 0 ? `candy-${c}` : c === JAW ? 'candy-jaw' : 'candy-wild';
const MONSTER_COLORS = [0x8e5cf7, 0x2bb3a3, 0xff6f61, 0x4c7dff];

function drawCandy(g, x, y, r, color, mark) {
  g.fillStyle(shade(color, -0.28)).fillCircle(x, y, r);
  g.fillStyle(color).fillCircle(x, y, r - 3);
  g.fillStyle(0xffffff, 0.85).lineStyle(4, 0xffffff, 0.85);
  if (mark === 'swirl') {
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.04) {
      const a = t * Math.PI * 3.2, rr = 2 + t * (r - 9);
      if (t === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.strokePath();
  } else if (mark === 'dots') {
    for (const [dx, dy] of [[-7, 4], [7, 4], [0, -7]]) g.fillCircle(x + dx, y + dy, 3.8);
  } else if (mark === 'stripes') {
    for (const off of [-8, 0, 8]) {
      const h = Math.sqrt((r - 6) ** 2 - off ** 2), c = Math.SQRT1_2;
      g.lineBetween(x + off * c - h * c, y - off * c - h * c, x + off * c + h * c, y - off * c + h * c);
    }
  } else if (mark === 'star') {
    g.fillPoints(starPoints(x, y, 10.5, 4.6), true);
  } else if (mark === 'heart') {
    g.fillCircle(x - 4.6, y - 2.5, 5.2).fillCircle(x + 4.6, y - 2.5, 5.2).fillTriangle(x - 9.6, y - 0.5, x + 9.6, y - 0.5, x, y + 10);
  } else if (mark === 'ring') {
    g.strokeCircle(x, y, 9);
  }
  g.fillStyle(0xffffff, 0.5).fillEllipse(x - r * 0.36, y - r * 0.42, r * 0.6, r * 0.32); // shine
}

function makeArt(scene) {
  const tx = scene.textures, g = scene.make.graphics({ x: 0, y: 0, add: false });
  const make = (key, w, h, draw) => {
    if (tx.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };
  const S = D + 4, c = S / 2, r = D / 2; // candy texture size, center, radius

  CANDIES.forEach((k, i) => make(`candy-${i}`, S, S, () => drawCandy(g, c, c, r, k.color, k.mark)));
  // Rainbow: a slice of every color.
  make('candy-wild', S, S, () => {
    g.fillStyle(0xffffff).fillCircle(c, c, r);
    CANDIES.forEach((k, i) => {
      g.fillStyle(k.color).slice(c, c, r - 2.5, i * Math.PI / 3 - Math.PI / 2, (i + 1) * Math.PI / 3 - Math.PI / 2, false);
      g.fillPath();
    });
    g.fillStyle(0xffffff).fillPoints(starPoints(c, c, 9, 4), true);
    g.fillStyle(0xffffff, 0.5).fillEllipse(c - r * 0.36, c - r * 0.42, r * 0.6, r * 0.32);
  });
  // Jawbreaker: grey rings, no marking.
  make('candy-jaw', S, S, () => {
    [[r, 0x5d6275], [r - 3, 0x9aa0b4], [r - 8, 0x7d8396], [r - 13, 0xb8bdcc], [r - 18, 0x8a8fa3]].forEach(([rr, col]) => g.fillStyle(col).fillCircle(c, c, rr));
    g.fillStyle(0xffffff, 0.45).fillEllipse(c - r * 0.36, c - r * 0.42, r * 0.6, r * 0.32);
  });
  // Cherry Bomb: a dark cherry with a lit fuse.
  make('candy-bomb', S, S, () => {
    g.fillStyle(0x5a0a1c).fillCircle(c, c + 3, r - 3);
    g.fillStyle(0xa3122f).fillCircle(c, c + 3, r - 6);
    g.lineStyle(4, 0x6b4a1f).lineBetween(c + 4, c - r + 9, c + 10, c - r + 3);
    g.fillStyle(0xffd23b).fillPoints(starPoints(c + 12, c - r + 4, 6, 2.5), true);
    g.fillStyle(0xffffff, 0.45).fillEllipse(c - 7, c - 3, 12, 7);
  });
  // Pop Rocks: fizzy blue with sparkles and a lightning bolt.
  make('candy-zap', S, S, () => {
    g.fillStyle(0x1b8fd6).fillCircle(c, c, r);
    g.fillStyle(0x52d3ff).fillCircle(c, c, r - 3);
    [[-12, -6, 0xff4d6d], [10, -11, 0xffc93c], [12, 9, 0x2ec98a], [-9, 12, 0x9b5cff], [-14, 5, 0xffffff]].forEach(([dx, dy, col]) => g.fillStyle(col).fillCircle(c + dx, c + dy, 2.6));
    g.fillStyle(0xffffff).fillPoints([{ x: c + 3, y: c - 15 }, { x: c - 7, y: c + 2 }, { x: c, y: c + 2 }, { x: c - 4, y: c + 15 }, { x: c + 8, y: c - 3 }, { x: c + 1, y: c - 3 }], true);
  });

  // The gumball machine, seen from above, its chute pointing right (it turns to aim).
  make('machine', 160, 160, () => {
    g.fillStyle(0x000000, 0.14).fillCircle(84, 86, 55);
    g.fillStyle(0x9aa1b0).fillRoundedRect(80, 61, 68, 38, 11);
    g.fillStyle(0xdfe4ee).fillRoundedRect(82, 65, 60, 12, 6);
    g.fillStyle(0x4a4e5c).fillRoundedRect(136, 68, 11, 24, 5);
    g.fillStyle(0xb81f3a).fillCircle(80, 80, 54);
    g.fillStyle(0xe63946).fillCircle(80, 80, 49);
    g.fillStyle(0xffd23b).fillRoundedRect(31, 71, 10, 18, 4);
    g.fillStyle(0xffffff, 0.32).fillCircle(80, 80, 35);
    g.lineStyle(4, 0xffffff, 0.85).strokeCircle(80, 80, 35);
    g.lineStyle(5, 0xffffff, 0.6).beginPath().arc(80, 80, 27, Math.PI * 1.1, Math.PI * 1.45).strokePath();
  });
  // Monsters: a round body with eyes and horns (the mouth is its own picture, so it can open and chomp).
  MONSTER_COLORS.forEach((col, i) => make(`monster-${i}`, 150, 150, () => {
    g.fillStyle(0xfff2c9).fillTriangle(34, 40, 46, 6, 60, 30).fillTriangle(116, 40, 104, 6, 90, 30);
    g.fillStyle(shade(col, -0.3)).fillCircle(75, 78, 62);
    g.fillStyle(col).fillCircle(75, 78, 57);
    g.fillStyle(shade(col, 0.3)).fillEllipse(75, 104, 80, 44);
    g.fillStyle(0xff9cc2, 0.6).fillEllipse(33, 86, 18, 10).fillEllipse(117, 86, 18, 10);
    for (const ex of [52, 98]) {
      g.fillStyle(0xffffff).fillCircle(ex, 52, 15);
      g.fillStyle(0x2a1030).fillCircle(ex + (ex < 75 ? 2 : -2), 55, 7.5);
      g.fillStyle(0xffffff).fillCircle(ex + (ex < 75 ? 4 : 0), 52, 2.6);
    }
  }));
  make('mouth', 96, 66, () => {
    g.fillStyle(0x3a0d2e).fillEllipse(48, 33, 92, 62);
    g.fillStyle(0xff7aa8).fillEllipse(48, 50, 50, 22);
    g.fillStyle(0xffffff);
    for (const tx0 of [20, 38, 54, 70]) g.fillTriangle(tx0 - 7, 7, tx0 + 7, 7, tx0, 19);
  });
  // The candy jar each road starts from: a candy-cane ring around a dark opening.
  make('jar', 70, 70, () => {
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xff4d6d).slice(35, 35, 32, i * Math.PI / 5, (i + 1) * Math.PI / 5, false);
      g.fillPath();
    }
    g.fillStyle(0x5a2346).fillCircle(35, 35, 19);
    g.fillStyle(0x000000, 0.25).fillCircle(35, 38, 15);
  });
  make('spark', 14, 14, () => g.fillStyle(0xffffff).fillPoints(starPoints(7, 7, 7, 3, 4, 0), true));
  make('star', 44, 44, () => g.fillStyle(0xffffff).fillPoints(starPoints(22, 23, 21, 9), true));
  make('ring', 64, 64, () => g.lineStyle(5, 0xffffff, 0.95).strokeCircle(32, 32, 28));
  g.destroy();
}
