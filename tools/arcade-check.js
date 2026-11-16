// Checks js/arcade.js (the shared accounts file every game copies) in Node, with a fake Supabase: the offline score
// queue, batching, and the cloud-save merge. Run from this game's folder: node tools/arcade-check.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const mem = {};
const inserts = []; // every batch sent to the scores table
let net = 'online'; // 'online' | 'offline' | 'refuse'
const fakeSb = {
  auth: { onAuthStateChange() {}, getSession: () => Promise.resolve({ data: { session: null } }) },
  from: () => ({
    insert: async rows => {
      if (net === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch' } };
      if (net === 'refuse') return { error: { code: '23514', message: 'check violation' } };
      inserts.push(rows);
      return { error: null };
    },
  }),
};
Object.assign(global, {
  window: { supabase: { createClient: () => fakeSb } },
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } },
  location: { origin: 'http://x', pathname: '/', search: '' },
  history: { replaceState() {} },
});
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'arcade.js'), 'utf8') + '\nglobal.createArcade = createArcade; global.mergeMax = mergeMax;');
const queue = () => JSON.parse(mem['arcade-pending'] ?? '[]');

(async () => {
  const a = createArcade('phaser-candy-conga');
  assert.strictEqual(await a.post(5), false, 'signed out: nothing posts');
  assert.strictEqual(queue().length, 0, 'signed out: nothing is queued');

  a.user = { id: 'u1' };
  net = 'offline';
  assert.strictEqual(await a.post(100, 'gauntlet'), false, 'offline: not posted');
  assert.strictEqual(queue().length, 1, 'offline: the score waits in the queue');

  net = 'online';
  mem['arcade-pending'] = JSON.stringify([...queue(), { game: 'threejs-gulp', score: 7, mode: '', seed: null, user: 'someone-else' }]);
  const posts = [a.post(200, 'level-1'), a.post(300, 'level-2')]; // posted together, as on a first sign-in
  assert.deepStrictEqual(await Promise.all(posts), [true, true], 'both report posted, though one request carried them');
  assert.strictEqual(inserts.length, 1, 'one request for the whole queue');
  assert.deepStrictEqual(inserts[0].map(r => r.score), [100, 200, 300], 'the waiting score goes up with the new ones');
  assert.ok(inserts[0].every(r => !('user' in r)), 'rows carry no user id (the database fills it in from the session)');
  assert.deepStrictEqual(queue().map(s => s.user), ['someone-else'], "another player's queued score stays for them");

  net = 'refuse';
  assert.strictEqual(await a.post(-1), false);
  assert.deepStrictEqual(queue().map(s => s.user), ['someone-else'], 'a row the database refuses is dropped, not retried forever');

  assert.deepStrictEqual(mergeMax({ a: 1, b: true, c: 'x' }, { a: 3, b: false, d: 2 }), { a: 3, b: true, c: 'x', d: 2 }, 'mergeMax keeps the larger number and any true flag');
  console.log('arcade.js: all checks passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
