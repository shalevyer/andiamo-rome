import { initialTrip, tripSchema } from '../app/model';
import { mergeChanges, same, syncOperationSchema } from '../app/sync-model';
import { geocodeLocation, normalizeLocation } from './geocode';

type Env = { TRIP: DurableObjectNamespace; TRIP_KEY_SHA256: string; ALLOWED_ORIGINS: string; GEOCODER_URL?: string };
const docIds = ['flight-mia', 'flight-shalev', 'stay', 'insurance-mia', 'insurance-terms'];
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const hash = async (value: string | ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))).map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',');
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,If-Match,Idempotency-Key', 'Access-Control-Max-Age': '86400' } });
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (!env.TRIP_KEY_SHA256 || token.length < 32 || await hash(token) !== env.TRIP_KEY_SHA256) return new Response('Trip access required', { status: 401, headers });
    try {
      // Keep this name and binding unchanged on every deployment. Never reseed an existing object.
      const response = await env.TRIP.get(env.TRIP.idFromName('rome-2026-v1')).fetch(request);
      const result = new Response(response.body, response);
      for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
      return result;
    } catch {
      return new Response('Please retry; saved data was not reset.', { status: 503, headers });
    }
  },
};

export class SharedTrip {
  sql: SqlStorage;
  private lookups = new Map<string, Promise<unknown>>();
  private lookupQueue: Promise<unknown> = Promise.resolve();
  constructor(private ctx: DurableObjectState, private env: Env) {
    this.sql = ctx.storage.sql;
    ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS trip (id INTEGER PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS store_meta (id INTEGER PRIMARY KEY, store_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS revisions (revision INTEGER PRIMARY KEY, document TEXT NOT NULL, operation_id TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tombstones (bucket TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY(bucket,item_id));
        CREATE TABLE IF NOT EXISTS map_locations (query TEXT PRIMARY KEY, result TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, version TEXT);
        CREATE TABLE IF NOT EXISTS document_versions (version TEXT PRIMARY KEY, document_id TEXT NOT NULL, digest TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL, operation_id TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS document_chunks (version TEXT NOT NULL, chunk_index INTEGER NOT NULL, content BLOB NOT NULL, PRIMARY KEY(version,chunk_index));`);
      const seed = JSON.stringify({ ...initialTrip, receipts: [] });
      this.sql.exec('INSERT OR IGNORE INTO store_meta VALUES (1,?)', crypto.randomUUID());
      this.sql.exec('INSERT OR IGNORE INTO trip (id,document,revision) VALUES (1,?,0)', seed);
      this.sql.exec("INSERT OR IGNORE INTO revisions (revision,document,operation_id,created) SELECT 0,document,'initial',? FROM trip WHERE id=1", new Date().toISOString());
    });
  }
  snapshot() {
    const row = this.sql.exec<{ document: string; revision: number }>('SELECT document,revision FROM trip WHERE id=1').one();
    const documents = this.sql.exec<{ id: string; version: string | null; digest: string | null; size: number | null }>('SELECT d.id,d.version,v.digest,v.size FROM documents d LEFT JOIN document_versions v ON v.version=d.version').toArray();
    const storeId = this.sql.exec<{ store_id: string }>('SELECT store_id FROM store_meta WHERE id=1').one().store_id;
    return { trip: tripSchema.parse(JSON.parse(row.document)), revision: row.revision, documents, storeId };
  }
  async fetch(request: Request) {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/v1/places' && request.method === 'GET') {
      const location = url.searchParams.get('location')?.trim() || '';
      if (location.length < 2 || location.length > 300) return json({ error: 'Place name or address required' }, 400);
      const key = normalizeLocation(location);
      const cached = this.sql.exec<{ result: string; expires: number }>('SELECT result,expires FROM map_locations WHERE query=?', key).toArray()[0];
      if (cached && cached.expires > Date.now()) return json({ point: JSON.parse(cached.result) });
      if (!this.lookups.has(key)) {
        const lookup = this.lookupQueue.catch(() => {}).then(async () => {
          const point = await geocodeLocation(location, this.env.GEOCODER_URL || 'https://photon.komoot.io/api/');
          this.sql.exec('INSERT OR REPLACE INTO map_locations VALUES (?,?,?)', key, JSON.stringify(point), Date.now() + (point ? 30 * 86400000 : 300000));
          return point;
        });
        // One global queue for both travelers, with persistent positive and negative caching.
        this.lookupQueue = lookup.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 1100)));
        this.lookups.set(key, lookup);
        lookup.finally(() => this.lookups.delete(key)).catch(() => {});
      }
      try { return json({ point: await this.lookups.get(key) }); }
      catch { return json({ error: 'Location lookup temporarily unavailable' }, 503); }
    }
    if (path === '/v1/trip' && request.method === 'GET') return json(this.snapshot());
    if (path === '/v1/trip' && request.method === 'POST') {
      const text = await request.text();
      if (text.length > 2_000_000) return json({ error: 'Too large' }, 413);
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const parsed = syncOperationSchema.safeParse(raw);
      if (!parsed.success) return json({ error: 'Invalid change' }, 400);
      const op = parsed.data;
      return this.ctx.storage.transactionSync(() => {
        const previous = this.sql.exec<{ payload: string; status: string }>('SELECT payload,status FROM operations WHERE id=?', op.id).toArray()[0];
        if (previous && !same(JSON.parse(previous.payload), op)) return json({ error: 'Operation id reused' }, 409);
        const state = this.snapshot();
        if (previous?.status === 'applied') return json(state);
        const removed = new Set(this.sql.exec<{ bucket: string; item_id: string }>('SELECT bucket,item_id FROM tombstones').toArray().map(row => row.bucket + ':' + row.item_id));
        let merged;
        try { merged = mergeChanges(state.trip, op.changes, removed); }
        catch { return json({ error: 'Invalid change' }, 400); }
        const now = new Date().toISOString();
        if (merged.conflicts.length) {
          this.sql.exec("INSERT OR IGNORE INTO operations VALUES (?,?,'conflict',?)", op.id, JSON.stringify(op), now);
          return json({ ...state, conflicts: merged.conflicts }, 409);
        }
        const revision = state.revision + 1, document = JSON.stringify({ ...merged.trip, receipts: [] });
        this.sql.exec('UPDATE trip SET document=?,revision=? WHERE id=1', document, revision);
        this.sql.exec('INSERT INTO revisions VALUES (?,?,?,?)', revision, document, op.id, now);
        this.sql.exec("INSERT OR REPLACE INTO operations VALUES (?,?,'applied',?)", op.id, JSON.stringify(op), now);
        for (const change of op.changes) if (change.bucket !== 'trip' && !change.field && change.after === null) this.sql.exec('INSERT OR IGNORE INTO tombstones VALUES (?,?)', change.bucket, change.id);
        return json(this.snapshot());
      });
    }
    if (path === '/v1/history' && request.method === 'GET') {
      const revision = url.searchParams.get('revision');
      if (revision !== null) {
        const row = this.sql.exec<{ document: string }>('SELECT document FROM revisions WHERE revision=?', Number(revision)).toArray()[0];
        return row ? json({ trip: JSON.parse(row.document) }) : json({ error: 'Not found' }, 404);
      }
      return json({ revisions: this.sql.exec('SELECT revision,operation_id,created FROM revisions ORDER BY revision DESC LIMIT 100').toArray() });
    }
    if (path === '/v1/documents') {
      const id = url.searchParams.get('id') || '';
      if (!docIds.includes(id)) return json({ error: 'Unknown document' }, 400);
      const existing = () => this.sql.exec<{ version: string | null }>('SELECT version FROM documents WHERE id=?', id).toArray()[0]?.version || '';
      if (request.method === 'GET') {
        const version = url.searchParams.get('version') || existing();
        if (!version) return json({ error: 'Not found' }, 404);
        if (!this.sql.exec('SELECT version FROM document_versions WHERE version=? AND document_id=?', version, id).toArray().length) return json({ error: 'Not found' }, 404);
        const chunks = this.sql.exec<{ content: ArrayBuffer }>('SELECT content FROM document_chunks WHERE version=? ORDER BY chunk_index', version).toArray();
        return new Response(new Blob(chunks.map(v => v.content), { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + id + '.pdf"', 'Cache-Control': 'private,no-store', 'ETag': version } });
      }
      if (request.method === 'PUT') {
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 10 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return json({ error: 'PDF up to 10MB required' }, 400);
        const digest = await hash(bytes), opId = request.headers.get('Idempotency-Key') || '';
        if (!/^[\w-]{8,150}$/.test(opId)) return json({ error: 'Missing operation id' }, 400);
        return this.ctx.storage.transactionSync(() => {
          const prior = this.sql.exec<{ version: string; digest: string }>('SELECT version,digest FROM document_versions WHERE operation_id=?', opId).toArray()[0];
          if (prior) return prior.digest === digest ? json({ version: prior.version, digest }) : json({ error: 'Operation id reused' }, 409);
          const current = existing();
          const currentDigest = current && this.sql.exec<{ digest: string }>('SELECT digest FROM document_versions WHERE version=?', current).one().digest;
          if (currentDigest === digest) return json({ version: current, digest });
          if (current !== (request.headers.get('If-Match') || '')) return json({ error: 'Document changed on another device', version: current }, 409);
          const version = crypto.randomUUID();
          this.sql.exec('INSERT INTO document_versions VALUES (?,?,?,?,?,?)', version, id, digest, bytes.byteLength, new Date().toISOString(), opId);
          for (let n = 0; n * 262144 < bytes.byteLength; n++) this.sql.exec('INSERT INTO document_chunks VALUES (?,?,?)', version, n, bytes.slice(n * 262144, (n + 1) * 262144));
          this.sql.exec('INSERT OR REPLACE INTO documents VALUES (?,?)', id, version);
          return json({ version, digest });
        });
      }
    }
    if (path === '/v1/document-history' && request.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      if (!docIds.includes(id)) return json({ error: 'Unknown document' }, 400);
      return json({ versions: this.sql.exec('SELECT version,created,size FROM document_versions WHERE document_id=? ORDER BY created DESC', id).toArray() });
    }
    return json({ error: 'Not found' }, 404);
  }
}
