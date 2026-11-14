import { SYNC_URL } from './sync-config';

const ACCESS = 'andiamo-shared-access-v1';
export function accessKey() { return localStorage.getItem(ACCESS) || ''; }
export function isConnected() { return !!SYNC_URL && !!accessKey(); }
export function invitationLink(page = location.href) {
  const url = new URL(page); url.search = ''; url.hash = 'join=' + accessKey(); return url.href;
}
export function acceptInvitation(value: string) {
  let key = value.trim();
  if (key.includes('#join=')) key = key.split('#join=')[1].split(/[&\s]/)[0];
  if (!/^[\w-]{43}$/.test(key)) throw Error('קישור ההצטרפות אינו תקין');
  localStorage.setItem(ACCESS, key);
  if (location.hash.startsWith('#join=')) history.replaceState(null, '', '#plan');
  window.dispatchEvent(new Event('andiamo-connection'));
}
export async function cloudRequest(path: string, init: RequestInit = {}) {
  if (!isConnected()) throw Error('Open the shared trip invitation first');
  return fetch(SYNC_URL + path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: 'Bearer ' + accessKey() }, cache: 'no-store', signal: init.signal || AbortSignal.timeout(20_000) });
}
export async function digestFile(file: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
}
