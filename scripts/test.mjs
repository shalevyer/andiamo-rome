import { build } from 'esbuild';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
await mkdir('work/tests', { recursive: true });
await build({ entryPoints: ['app/share.ts', 'app/model.ts', 'app/local-data.ts'], bundle: true, outdir: 'work/tests', format: 'esm', platform: 'node' });
const { createTripLink, readTripLink } = await import('../work/tests/share.js');
const { initialTrip } = await import('../work/tests/model.js');
const updated = structuredClone(initialTrip);
updated.dayNotes[2] = 'מיה הוסיפה: קפה ליד הגטו ☕';
updated.stops[0].done = true;
updated.receipts = ['example-receipt'];
const url = new URL(await createTripLink(updated, 'https://example.test/andiamo-rome/?old=1#bookings'));
assert.equal(url.pathname, '/andiamo-rome/');
assert.equal(url.search, '');
assert.deepEqual(await readTripLink(url.hash), { ...updated, receipts: [] });
assert.equal(await readTripLink('#plan'), null);
await assert.rejects(() => readTripLink('#trip=g.not-valid!'));
await assert.rejects(() => readTripLink('#trip=g.' + 'A'.repeat(100_001)));
const invalid = structuredClone(initialTrip);
invalid.bookings[0].url = 'javascript:alert(1)';
await assert.rejects(() => createTripLink(invalid, 'https://example.test/andiamo-rome/'));
assert(initialTrip.bookings.every(b => !b.reference));
const docs = await readdir('docs');
assert(docs.every(name => !/\.pdf$|\.env|sealed|secret|key/i.test(name)));
for (const name of ['app.js', 'index.html', 'sw.js']) {
  const source = await readFile('docs/' + name, 'utf8');
  assert(!source.includes('/api/'), name + ' must not call private APIs');
  assert(!source.includes('DOCUMENT_KEY'), name + ' must not contain runtime secrets');
  assert(!source.includes('wix.chatgpt.site'), name + ' must not use the private host');
}
console.log('Passed: Hebrew sharing round-trip, import validation, safe defaults, public bundle separation.');

// An older controller must fetch a newly versioned bundle, never substitute an old unversioned one.
const handlers = {};
const scope = 'https://example.test/andiamo-rome/';
const entries = new Map([[scope + 'app.js', new Response('stale code')]]);
const cache = {
  match: async request => entries.get(typeof request === 'string' ? request : request.url),
  put: async (request, response) => { entries.set(request.url, response); },
};
let fetched = 0;
const context = {
  URL, Request, Response,
  self: { registration: { scope }, location: { origin: 'https://example.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
  caches: { open: async () => cache },
  fetch: async () => { fetched++; return new Response('updated code'); },
};
vm.runInNewContext(await readFile('docs/sw.js', 'utf8'), context);
let result;
const waits = [];
handlers.fetch({ request: new Request(scope + 'app.js?v=next-version'), respondWith: value => { result = value; }, waitUntil: promise => waits.push(promise) });
assert.equal(await (await result).text(), 'updated code');
await Promise.all(waits);
assert.equal(fetched, 1);
context.fetch = async () => { throw Error('offline'); };
handlers.fetch({ request: new Request(scope + 'app.js?v=next-version'), respondWith: value => { result = value; }, waitUntil: promise => waits.push(promise) });
assert.equal(await (await result).text(), 'updated code');
console.log('Passed: updated asset versions bypass stale cache; exact cached versions work offline.');

const { readLocalTrip, saveLocalTrip, TRIP_STORAGE_KEY, RECOVERY_STORAGE_KEY, RECOVERY_ARCHIVE_PREFIX } = await import('../work/tests/local-data.js');
const storedTrip = structuredClone(initialTrip);
storedTrip.stops.push({ ...storedTrip.stops[0], id: 'mia-added-place', title: 'המקום שמיה הוסיפה' });
storedTrip.notes = 'הערות שכבר הוספנו';
const originalBytes = JSON.stringify(storedTrip, null, 2);
const values = new Map([[TRIP_STORAGE_KEY, originalBytes]]);
let writes = 0;
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { writes++; values.set(key, value); },
};
assert.deepEqual(readLocalTrip(storage).trip, storedTrip);
assert.equal(writes, 0, 'opening a new build must not write or reseed saved data');
const changed = structuredClone(storedTrip);
changed.notes += ' · עוד משהו';
saveLocalTrip(storage, changed);
assert.equal(values.get(RECOVERY_STORAGE_KEY), originalBytes);
assert.equal(JSON.parse(values.get(TRIP_STORAGE_KEY)).stops.at(-1).id, 'mia-added-place');
const broken = '{unreadable original bytes';
values.set(TRIP_STORAGE_KEY, broken);
const recovered = readLocalTrip(storage);
assert(recovered.recoveryMessage);
assert.deepEqual(recovered.trip, storedTrip);
assert.equal(values.get(TRIP_STORAGE_KEY), broken, 'an unreadable trip must remain untouched');
saveLocalTrip(storage, recovered.trip);
saveLocalTrip(storage, changed);
assert([...values].some(([key, value]) => key.startsWith(RECOVERY_ARCHIVE_PREFIX) && value === broken));
const beforeFullStorage = values.get(TRIP_STORAGE_KEY);
assert.throws(() => saveLocalTrip({
  getItem: storage.getItem,
  setItem: () => { throw Error('storage full'); },
}, storedTrip));
assert.equal(values.get(TRIP_STORAGE_KEY), beforeFullStorage);
console.log('Passed: deployments preserve additions, prior versions are backed up, unreadable originals are retained, full storage cannot replace saved data.');
