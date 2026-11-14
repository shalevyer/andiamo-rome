export type MapPoint = { lat: number; lng: number; label: string };
export const normalizeLocation = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export async function geocodeLocation(location: string, endpoint: string, request: typeof fetch = fetch): Promise<MapPoint | null> {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ q: location, lat: '41.9028', lon: '12.4964', bbox: '11.8,41.5,13.2,42.3', limit: '3', lang: 'en' }).toString();
  const response = await request(url, { headers: { 'User-Agent': 'AndiamoRome/1.0 (https://shalevyer.github.io/andiamo-rome/)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('Location provider unavailable');
  const data = await response.json() as { features?: { geometry?: { type?: string; coordinates?: number[] }; properties?: Record<string, string> }[] };
  for (const feature of data.features || []) {
    const [lng, lat] = feature.geometry?.coordinates || [];
    if (feature.geometry?.type !== 'Point' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 41.5 || lat > 42.3 || lng < 11.8 || lng > 13.2) continue;
    const props = feature.properties || {};
    return { lat, lng, label: [props.name, props.street, props.housenumber, props.city].filter(Boolean).join(', ') || location };
  }
  return null;
}
