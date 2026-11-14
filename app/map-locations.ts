import { useEffect, useState } from 'react';
import { cloudRequest, isConnected } from './connection';
import type { Stop } from './model';
export type Point = { lat: number; lng: number; label: string };
type Cached = { point: Point | null; expires: number };
const CACHE = 'andiamo-map-locations-v1';
const memory = new Map<string, Cached>(), pending = new Map<string, Promise<Point | null>>();
let loaded = false;
const keyOf = (location: string) => location.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
function load() {
  if (loaded) return; loaded = true;
  try { for (const [key, value] of Object.entries(JSON.parse(localStorage.getItem(CACHE) || '{}'))) memory.set(key, value as Cached); } catch {}
}
async function locate(location: string): Promise<Point | null> {
  const key = keyOf(location); load();
  const cached = memory.get(key);
  if (cached && cached.expires > Date.now()) return cached.point;
  if (pending.has(key)) return pending.get(key)!;
  const promise = (async () => {
    const response = await cloudRequest('/v1/places?location=' + encodeURIComponent(location.trim()));
    if (!response.ok) throw Error('Location lookup unavailable');
    const data = await response.json() as { point: Point | null };
    const point = data.point;
    if (point && (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)) throw Error('Invalid map point');
    memory.set(key, { point, expires: Date.now() + (point ? 30 * 86400000 : 300000) });
    try { localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(memory))); } catch {}
    return point;
  })().finally(() => pending.delete(key));
  pending.set(key, promise); return promise;
}
export function useMapLocations(stops: Stop[]) {
  const [points, setPoints] = useState<Record<string, Point | null>>({}), [attempt, setAttempt] = useState(0);
  const locations = [...new Set(stops.filter(s => (s.lat === null || s.lng === null) && s.location.trim()).map(s => s.location.trim()))];
  const signature = JSON.stringify(locations.sort());
  useEffect(() => {
    let active = true;
    (async () => {
      if (!isConnected()) return;
      for (const location of JSON.parse(signature) as string[]) {
        try {
          const point = await locate(location);
          if (active) setPoints(old => ({ ...old, [keyOf(location)]: point }));
        } catch { /* Keep the event and retry on reconnect or an explicit refresh. */ }
        if (!active) return;
      }
    })();
    return () => { active = false; };
  }, [signature, attempt]);
  useEffect(() => {
    const retry = () => setAttempt(v => v + 1);
    window.addEventListener('online', retry); window.addEventListener('andiamo-connection', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('andiamo-connection', retry); };
  }, []);
  return {
    stops: stops.map(stop => {
      const key = keyOf(stop.location);
      const point = Object.hasOwn(points, key) ? points[key] : null;
      return (stop.lat === null || stop.lng === null) && point ? { ...stop, lat: point.lat, lng: point.lng } : stop;
    }),
    retryLocations: () => setAttempt(v => v + 1),
  };
}
