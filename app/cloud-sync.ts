import { initialTrip, tripSchema, type Operation, type Trip } from './model';
import { cloudRequest, isConnected, accessKey } from './connection';
import { readLocalTrip, saveLocalTrip, TRIP_STORAGE_KEY } from './local-data';
import { changesForOperation, diffTrip, projectChanges, type Change, type Conflict, type SyncOperation } from './sync-model';

export type CloudDocument = { id: string; version: string | null; digest: string | null; size: number | null };
export type CloudSnapshot = { trip: Trip; revision: number; documents: CloudDocument[]; storeId: string };
type PendingConflict = { operation: SyncOperation; details: Conflict[] };
export type SyncState = { device: string; server: Trip; revision: number; pending: SyncOperation[]; conflicts: PendingConflict[]; migrated: boolean; originalRaw: string | null; documents: CloudDocument[]; storeId: string; lastSyncedAt?: number };
export type SyncInfo = { revision: number; events: number; pending: number; lastSyncedAt: number | null; issue: string };
let databasePromise: Promise<IDBDatabase> | undefined;
function database() {
  return databasePromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('andiamo-shared-trip-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function updateSyncState(update?: (state: SyncState) => SyncState): Promise<SyncState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', update ? 'readwrite' : 'readonly');
    const store = tx.objectStore('state'), request = store.get('rome');
    let result: SyncState;
    request.onsuccess = () => {
      try {
        const old: SyncState = request.result || { device: crypto.randomUUID(), server: initialTrip, revision: -1, pending: [], conflicts: [], migrated: false, originalRaw: null, documents: [], storeId: '' };
        result = update ? update(old) : old;
        if (update) store.put(result, 'rome');
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('Save interrupted'));
  });
}
export function visibleTrip(state: SyncState) {
  return state.pending.reduce((trip, operation) => projectChanges(trip, operation.changes), state.server);
}
export function announceSync() { window.dispatchEvent(new Event('andiamo-cloud-state')); }
export async function addOperation(operation: Operation) {
  const result = await updateSyncState(state => {
    const base = state.migrated ? visibleTrip(state) : readLocalTrip(localStorage).trip;
    const changes = changesForOperation(base, operation);
    if (changes.length && !state.pending.some(v => v.id === operation.id) && !state.conflicts.some(v => v.operation.id === operation.id)) state.pending.push({ id: operation.id, device: state.device, changes });
    return state;
  });
  announceSync(); return result;
}
function acceptSnapshot(state: SyncState, snapshot: CloudSnapshot) {
  if (state.storeId && state.storeId !== snapshot.storeId) throw Error('Shared store identity changed; local data was retained.');
  if (snapshot.revision < state.revision) return state;
  state.storeId = snapshot.storeId;
  state.server = tripSchema.parse(snapshot.trip); state.revision = snapshot.revision; state.documents = snapshot.documents;
  state.lastSyncedAt = Date.now();
  return state;
}
let running: Promise<SyncState> | undefined;
let runningKey = '';
export function synchronize(): Promise<SyncState> {
  if (running) return runningKey === accessKey() ? running : running.catch(() => {}).then(() => synchronize());
  runningKey = accessKey();
  running = performSync().finally(() => { running = undefined; runningKey = ''; });
  return running;
}
async function performSync() {
  const response = await cloudRequest('/v1/trip');
  if (!response.ok) throw Error('SHARED_HTTP_' + response.status);
  const remote: CloudSnapshot = await response.json();
  let state = await updateSyncState(current => {
    if (!current.migrated) {
      const legacy = readLocalTrip(localStorage);
      current.originalRaw = localStorage.getItem(TRIP_STORAGE_KEY);
      if (!legacy.recoveryMessage && current.originalRaw !== null) {
        const changes = diffTrip(initialTrip, legacy.trip);
        const migration: SyncOperation[] = [];
        for (let i = 0; i < changes.length; i += 100) migration.push({ id: 'legacy-' + current.device + '-' + i, device: current.device, changes: changes.slice(i, i + 100) });
        current.pending = [...migration, ...current.pending];
      }
      current.migrated = true;
    }
    return acceptSnapshot(current, remote);
  });
  announceSync();
  while (state.pending.length) {
    const operation = state.pending[0];
    const saved = await cloudRequest('/v1/trip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
    if (!saved.ok && saved.status !== 409) throw Error('Update is waiting for a connection');
    const next = await saved.json() as CloudSnapshot & { conflicts?: Conflict[]; error?: string };
    if (!next.trip) throw Error(next.error || 'Could not save');
    state = await updateSyncState(current => {
      acceptSnapshot(current, next);
      current.pending = current.pending.filter(v => v.id !== operation.id);
      if (saved.status === 409 && !current.conflicts.some(v => v.operation.id === operation.id)) current.conflicts.push({ operation, details: next.conflicts || [] });
      return current;
    });
    announceSync();
  }
  return state;
}
export async function resolveConflict(id: string, keepMine: boolean) {
  const state = await updateSyncState(current => {
    const conflict = current.conflicts.find(v => v.operation.id === id);
    if (!conflict) return current;
    if (keepMine) {
      const changes: Change[] = [];
      const latest = visibleTrip(current);
      for (const original of conflict.operation.changes) {
        // A deleted item is never silently resurrected by an old edit.
        if (original.bucket !== 'trip' && original.field && !latest[original.bucket].some(v => v.id === original.id)) throw Error('הפריט נמחק במכשיר אחר. אפשר להוריד את השינוי השמור או להוסיף את הפריט מחדש.');
        if (original.bucket !== 'trip' && !original.field && original.after && !latest[original.bucket].some(v => v.id === original.id)) {
          const id = crypto.randomUUID();
          changes.push({ ...original, id, before: null, after: { ...(original.after as object), id } });
          continue;
        }
        const desired = projectChanges(latest, [original]);
        changes.push(...diffTrip(latest, desired));
      }
      if (changes.length) current.pending.push({ id: crypto.randomUUID(), device: current.device, changes });
    }
    current.conflicts = current.conflicts.filter(v => v.operation.id !== id);
    return current;
  });
  announceSync(); return state;
}
export async function mirrorSharedTrip() {
  if (!isConnected()) return null;
  const state = await updateSyncState();
  if (state.migrated) saveLocalTrip(localStorage, visibleTrip(state));
  return state;
}
