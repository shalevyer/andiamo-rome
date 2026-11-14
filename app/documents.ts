export const documents = [
  { id: 'flight-mia', label: 'אישור הטיסה של מיה' },
  { id: 'flight-shalev', label: 'אישור הטיסה של Shalev' },
  { id: 'stay', label: 'אישור הלינה' },
  { id: 'insurance-mia', label: 'אישור הביטוח של מיה' },
  { id: 'insurance-terms', label: 'חוברת תנאים · מכבי 2025' },
] as const;

import { cloudRequest, digestFile, isConnected } from './connection';
import type { CloudDocument } from './cloud-sync';

type Pending = { id: string; base: string; digest: string };
type Meta = { migrated?: boolean; version?: string; pending?: Pending; conflict?: boolean };
let remote: CloudDocument[] = [];
let synchronizing: Promise<void> | undefined;
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('andiamo-local-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pdfs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(key: string): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('pdfs').objectStore('pdfs').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function write(values: Record<string, unknown>) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite'), store = tx.objectStore('pdfs');
      for (const [key, value] of Object.entries(values)) store.put(value, key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function documentAvailability() {
  return Object.fromEntries(await Promise.all(documents.map(async ({ id }) => [id, !!remote.find(d => d.id === id)?.version || !!await read<Blob>(id)])));
}
export async function documentConflicts() {
  return Object.fromEntries(await Promise.all(documents.map(async ({ id }) => [id, !!(await read<Meta>('meta:' + id))?.conflict])));
}
export async function saveDocument(id: string, file: File) {
  if (!documents.some(d => d.id === id) || file.size > 10 * 1024 * 1024 ||
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw Error('Invalid PDF');
  const previous = await read<Blob>(id), meta = await read<Meta>('meta:' + id);
  const values: Record<string, unknown> = { [id]: file, ['meta:' + id]: {
    migrated: isConnected(), version: meta?.version,
    pending: { id: crypto.randomUUID(), base: remote.find(d => d.id === id)?.version || meta?.version || '', digest: await digestFile(file) },
  } };
  if (previous) values['archive:' + id + ':' + crypto.randomUUID()] = previous;
  await write(values);
  if (isConnected()) await synchronizeDocuments(remote).catch(() => {});
}
export function synchronizeDocuments(documents: CloudDocument[]) {
  remote = documents;
  if (synchronizing) return synchronizing;
  synchronizing = synchronizeAll().finally(() => { synchronizing = undefined; window.dispatchEvent(new Event('andiamo-documents')); });
  return synchronizing;
}
async function synchronizeAll() {
  if (!isConnected()) return;
  for (const { id } of documents) {
    let meta = await read<Meta>('meta:' + id) || {};
    const local = await read<Blob>(id);
    const current = remote.find(d => d.id === id);
    if (local && !meta.migrated) {
      const digest = await digestFile(local);
      meta = { migrated: true, version: current?.version || '', ...(current?.digest === digest ? {} : { pending: { id: crypto.randomUUID(), base: '', digest } }) };
      await write({ ['meta:' + id]: meta });
    }
    if (meta.pending && !meta.conflict && local) {
      const response = await cloudRequest('/v1/documents?id=' + id, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'If-Match': meta.pending.base, 'Idempotency-Key': meta.pending.id }, body: local });
      if (response.status === 409) await write({ ['meta:' + id]: { ...meta, conflict: true } });
      else if (!response.ok) throw Error('Document waiting for a connection');
      else {
        const uploaded = await response.json() as { version: string; digest: string };
        await write({ ['meta:' + id]: { migrated: true, version: uploaded.version }, ['cache:' + uploaded.version]: local });
        remote = [...remote.filter(d => d.id !== id), { id, version: uploaded.version, digest: uploaded.digest, size: local.size }];
      }
    } else if (!meta.pending && current?.version && current.version !== meta.version) {
      await write({ ['meta:' + id]: { migrated: true, version: current.version } });
    }
  }
}
export async function shareLocalDocument(id: string) {
  const response = await cloudRequest('/v1/trip');
  if (!response.ok) throw Error('Connection unavailable');
  const snapshot = await response.json() as { documents: CloudDocument[] };
  remote = snapshot.documents;
  const meta = await read<Meta>('meta:' + id), file = await read<Blob>(id);
  if (!file) throw Error('No local document');
  await write({ ['meta:' + id]: { migrated: true, pending: { id: crypto.randomUUID(), base: remote.find(d => d.id === id)?.version || '', digest: meta?.pending?.digest || await digestFile(file) } } });
  await synchronizeDocuments(remote);
}
export async function openDocument(id: string, localOnly = false, historicalVersion = '') {
  const viewer = window.open('about:blank', '_blank');
  if (!viewer) throw Error('Popup blocked');
  viewer.opener = null;
  try {
    let file: Blob | undefined;
    const version = historicalVersion || remote.find(d => d.id === id)?.version;
    if (isConnected() && !localOnly && version) {
      file = await read<Blob>('cache:' + version);
      if (!file) {
        const response = await cloudRequest('/v1/documents?id=' + id + (historicalVersion ? '&version=' + encodeURIComponent(historicalVersion) : ''));
        if (!response.ok) throw Error('Document unavailable');
        file = await response.blob(); await write({ ['cache:' + version]: file });
      }
    } else file = await read<Blob>(id);
    if (!file) throw Error('Missing PDF');
    const url = URL.createObjectURL(file); viewer.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) { viewer.close(); throw error; }
}
