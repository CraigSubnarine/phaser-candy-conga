// Candy Conga menus, saves, sound and input. The menus are plain HTML on top of the game canvas.

// Settings and progress are saved in this browser. Private windows can block storage, so every access is guarded.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const settings = { sound: true, aim: true, ...store.get('conga-settings', {}) };
const saveSettings = () => store.set('conga-settings', settings);
// Levels mode: best stars and score per level, and the highest level unlocked. Gauntlet: best score and level.
const progress = { stars: {}, best: {}, unlocked: 1, ...store.get('conga-progress', {}) };
const saveProgress = () => store.set('conga-progress', progress);
let gauntletBest = { score: 0, level: 0, ...store.get('conga-gauntlet-best', {}) };

// ---------- Sound: tiny synth notes and noise bursts, no audio files. ----------
// Browsers (iPhones especially) only allow sound after a tap or key press, so the audio is created on the first one.
let audio;
function unlockAudio() { try { audio ??= new AudioContext(); audio.resume(); } catch {} }
addEventListener('pointerup', unlockAudio);
addEventListener('keydown', unlockAudio);
function beep(freq, ms = 60, vol = 0.05, type = 'triangle') {
  if (!audio || !settings.sound) return;
  try {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {}
}
function boom(ms = 140, vol = 0.08) {
  if (!audio || !settings.sound) return;
  try {
    const len = Math.floor(audio.sampleRate * ms / 1000), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource(), g = audio.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(audio.destination);
    src.start();
  } catch {}
}
const jingle = (notes, gap = 90) => notes.forEach((f, i) => setTimeout(() => beep(f, 110, 0.05), i * gap));

// ---------- Menus ----------
const $ = id => document.getElementById(id);
// The whole game is in one of these states; only 'playing' accepts game input.
// 'menu' | 'levels' | 'playing' | 'paused' | 'clear' | 'failed' | 'over'
const app = { state: 'menu', settingsFrom: 'main', mode: 'levels', level: 1 };
const scene = () => window.game; // the 3D board (js/game.js, a module that loads after this script)
const levelsShown = () => Math.max(100, progress.unlocked); // the generator never runs out; the list grows past 100
const nextLevel = () => Math.min(progress.unlocked, levelsShown());
const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
const starsHtml = n => '<span>' + '&#9733;'.repeat(n) + '</span><span class="off">' + '&#9733;'.repeat(3 - n) + '</span>';

// Show one menu screen (or none, while playing) and put keyboard focus on its main button.
function showScreen(id) {
  $('ui').hidden = !id;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id) $(id).querySelector('.primary, button')?.focus({ preventScroll: true });
  const playing = app.state === 'playing';
  $('pauseBtn').hidden = !playing;
  $('swapBtn').hidden = !playing;
}
function updateMain() {
  $('mainStars').innerHTML = `&#9733; ${totalStars()} / ${levelsShown() * 3}`;
  $('mainBest').textContent = gauntletBest.score ? `Gauntlet best: ${gauntletBest.score.toLocaleString()} (level ${gauntletBest.level})` : 'Gauntlet: not tried yet';
  $('playBtn').textContent = `Play level ${nextLevel()}`;
}
// The two candies you hold, shown on the swap button (the bigger dot is the one you'll shoot).
function updateSwap(held, sel) {
  for (let i = 0; i < 2; i++) {
    const dot = $(`dot${i}`), c = held[i === 0 ? sel : 1 - sel];
    dot.className = `dot${i === 0 ? ' sel' : ''}${c === WILD ? ' wild' : ''}`;
    dot.style.background = c >= 0 ? CANDIES[c].css : '';
  }
}

// Loading a level wipes every candy, shot and effect of the last one.
const restartScene = data => scene().load(data);
function startLevel(mode, level, carry = {}) {
  app.state = 'playing';
  app.mode = mode;
  app.level = level;
  restartScene({ play: true, mode, level, ...carry });
  showScreen(null);
  document.activeElement?.blur();
}
function toMenu() {
  app.state = 'menu';
  restartScene({ play: false, level: nextLevel() });
  updateMain();
  showScreen('main');
}
function openLevels() {
  app.state = 'levels';
  const grid = $('levelGrid'), next = nextLevel();
  grid.replaceChildren(...Array.from({ length: levelsShown() }, (_, i) => {
    const n = i + 1, b = document.createElement('button'), stars = progress.stars[n] || 0, locked = n > progress.unlocked;
    b.dataset.level = n;
    b.disabled = locked;
    if (n === next) b.className = 'next';
    b.innerHTML = `${n}<small>${locked ? '&middot;' : '&#9733;'.repeat(stars) + '&#9734;'.repeat(3 - stars)}</small>`;
    b.setAttribute('aria-label', locked ? `Level ${n}, locked` : `Level ${n}, ${stars} star${stars === 1 ? '' : 's'}`);
    return b;
  }));
  showScreen('levels');
  grid.querySelector('.next')?.scrollIntoView({ block: 'center' });
  grid.querySelector('.next')?.focus({ preventScroll: true });
}
function openGauntlet() {
  $('gauntletBest').textContent = gauntletBest.score ? `Your best: ${gauntletBest.score.toLocaleString()}, reaching level ${gauntletBest.level}.` : '';
  showScreen('gauntletInfo');
}
// Pausing just stops the game's update (the last frame stays on screen).
function pauseGame() {
  if (app.state !== 'playing') return;
  app.state = 'paused';
  const s = scene();
  $('pauseInfo').textContent = `${s.label()} · Score ${s.board.score.toLocaleString()}`;
  showScreen('pause');
}
function resumeGame() {
  app.state = 'playing';
  showScreen(null);
  document.activeElement?.blur();
}
function openSettings() {
  app.settingsFrom = app.state === 'paused' ? 'pause' : 'main';
  showScreen('settings');
}

// ---------- End of a level ----------
function levelCleared(s) {
  const n = s.n, b = s.board, prevBest = progress.best[n] || 0;
  progress.stars[n] = Math.max(progress.stars[n] || 0, b.stars);
  progress.best[n] = Math.max(prevBest, b.score);
  progress.unlocked = Math.max(progress.unlocked, n + 1);
  saveProgress();
  app.state = 'clear';
  $('clearTitle').textContent = b.stars === 3 ? 'PERFECT!' : 'LEVEL CLEAR!';
  $('clearStars').innerHTML = starsHtml(b.stars);
  $('clearScore').textContent = `Level ${n} · Score ${b.score.toLocaleString()}`;
  $('clearBest').textContent = b.score > prevBest ? (prevBest ? 'New best score!' : '') : `Best: ${prevBest.toLocaleString()}`;
  showScreen('clear');
}
function levelFailed(s) {
  app.state = 'failed';
  $('failedText').textContent = `Level ${s.n}: the monsters ate one candy too many. Score ${s.board.score.toLocaleString()}.`;
  showScreen('failed');
}
function gauntletOver(s) {
  const score = s.board.score, best = score > gauntletBest.score;
  if (best) {
    gauntletBest = { score, level: s.n };
    store.set('conga-gauntlet-best', gauntletBest);
  }
  app.state = 'over';
  $('overScore').textContent = `Score ${score.toLocaleString()}`;
  $('overText').textContent = `You reached level ${s.n}.` + (best ? ' New best!' : ` Best: ${gauntletBest.score.toLocaleString()} (level ${gauntletBest.level}).`);
  showScreen('over');
}

$('ui').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !scene()) return;
  if (btn.dataset.level) return startLevel('levels', Number(btn.dataset.level));
  const action = btn.dataset.action;
  if (action === 'play') startLevel('levels', nextLevel());
  else if (action === 'levels') openLevels();
  else if (action === 'gauntlet') openGauntlet();
  else if (action === 'startGauntlet') startLevel('gauntlet', 1, { stars: 3, score: 0 });
  else if (action === 'next') startLevel('levels', app.level + 1);
  else if (action === 'replay') startLevel('levels', app.level);
  else if (action === 'resume') resumeGame();
  else if (action === 'menu') toMenu();
  else if (action === 'settings') openSettings();
  else if (action === 'back') showScreen(app.settingsFrom);
});
$('pauseBtn').addEventListener('click', pauseGame);
$('swapBtn').addEventListener('click', () => app.state === 'playing' && scene()?.swap());
for (const [id, key] of [['sound', 'sound'], ['aimGuide', 'aim']]) {
  $(id).checked = settings[key];
  $(id).addEventListener('change', e => { settings[key] = e.target.checked; saveSettings(); });
}
addEventListener('keydown', e => {
  const key = e.key?.toLowerCase();
  if (key === ' ' && app.state === 'playing') { e.preventDefault(); scene()?.swap(); }
  if (key !== 'escape' && key !== 'p') return;
  if (app.state === 'playing') pauseGame();
  else if (app.state === 'paused') resumeGame();
});
// Switching apps or tabs mid-level opens the pause menu.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// Aiming listens on the whole page, so a thumb anywhere (even below the game) can aim. Touch: drag to aim, let go to
// shoot. Mouse: the machine follows the pointer, click to shoot, right-click to swap.
let aiming = false;
addEventListener('pointerdown', e => {
  if (e.target.closest?.('button, a, label, input') || app.state !== 'playing') return; // menu taps aren't game input
  if (e.button === 2) return scene()?.swap();
  aiming = true;
  scene()?.pointerDown(e);
});
addEventListener('pointermove', e => { if (app.state === 'playing' && (aiming || e.pointerType === 'mouse')) scene()?.pointerMove(e); });
addEventListener('pointerup', e => {
  if (!aiming) return;
  aiming = false;
  if (app.state === 'playing') scene()?.pointerUp(e);
});
addEventListener('pointercancel', () => { aiming = false; scene()?.pointerUp(null); });
addEventListener('contextmenu', e => e.preventDefault());

updateMain();
