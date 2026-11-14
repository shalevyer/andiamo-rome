import { tripSchema, type Trip } from './model';

const MAX_BYTES = 1_000_000;
const MAX_HASH = 100_000;
const base64url = (bytes: Uint8Array) => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};
export async function createTripLink(trip: Trip, page: string) {
  const safe = tripSchema.parse({ ...trip, receipts: [] });
  const raw = new TextEncoder().encode(JSON.stringify(safe));
  if (raw.byteLength > MAX_BYTES) throw Error('Trip too large');
  const compressed = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const payload = base64url(new Uint8Array(compressed));
  if (payload.length > MAX_HASH) throw Error('Link too long');
  const url = new URL(page);
  url.search = '';
  url.hash = 'trip=g.' + payload;
  return url.href;
}
export async function readTripLink(hash: string): Promise<Trip | null> {
  if (!hash.startsWith('#trip=')) return null;
  const payload = hash.slice(6);
  if (!payload.startsWith('g.') || payload.length > MAX_HASH || !/^[\w-]+$/.test(payload.slice(2))) throw Error('Invalid link');
  const binary = atob(payload.slice(2).replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Trip too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const text = await new Blob(chunks as BlobPart[]).text();
  return tripSchema.parse(JSON.parse(text));
}
