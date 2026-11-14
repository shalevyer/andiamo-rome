'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { mapUrl, type Stop } from './model';
export const mapPinHtml = (number: number, done: boolean) => '<span><b>' + (done ? '<svg class="pin-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' : String(number)) + '</b></span>';
let loading: Promise<any> | undefined;
function leaflet() {
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve((window as any).L);
      script.onerror = () => {
        loading = undefined;
        reject(Error('map'));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export default function TripMap({
  stops,
  large = false,
  onSelect,
}: {
  stops: Stop[];
  large?: boolean;
  onSelect: (s: Stop) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false);
  const selection = useRef(onSelect);
  const boundsKey = useRef('');
  selection.current = onSelect;
  useEffect(() => {
    let disposed = false;
    leaflet()
      .then((L) => {
        if (disposed || !container.current) return;
        const m = L.map(container.current, {
          scrollWheelZoom: large,
          zoomControl: large,
          attributionControl: true,
        }).setView([41.904, 12.477], 14);
        map.current = m;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(m);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, [large]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L,
      m = map.current;
    const layer = L.featureGroup().addTo(m);
    const points = stops.filter(
      (s) => s.lat !== null && s.lng !== null
    );
    points.forEach((s, i) => {
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: 'numbered-pin' + (s.done ? ' is-done' : ''),
          html: mapPinHtml(i + 1, s.done),
          iconSize: [32, 40],
          iconAnchor: [16, 35],
        }),
        title: s.title + (s.done ? ' · כבר היינו ✓' : ''),
        zIndexOffset: s.done ? 500 : 0,
        riseOnHover: true,
        keyboard: true,
      }).addTo(layer);
      marker.on('click', () => selection.current(s));
      const label = document.createElement('span');
      label.dir = 'rtl';
      label.textContent = s.title + (s.done ? ' · כבר היינו ✓' : '');
      marker.bindTooltip(label);
    });
    L.marker([41.9081167, 12.4759667], {
      icon: L.divIcon({ className: 'home-pin', html: '<span>⌂</span>', iconSize: [32, 32] }),
      title: 'Ripetta Luxurious Suites',
    }).addTo(layer);
    const nextBounds = points.map(s => s.id + ':' + s.lat + ',' + s.lng).sort().join('|');
    if (layer.getBounds().isValid() && boundsKey.current !== nextBounds) {
      m.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 15 });
      boundsKey.current = nextBounds;
    }
    setTimeout(() => m.invalidateSize(), 50);
    return () => layer.remove();
  }, [stops, ready]);
  return (
    <div className={'map-wrap ' + (large ? 'large' : '')}>
      <div className="actual-map" ref={container} aria-label="מפת המקומות ברומא" role="region" />
      {(!ready || failed) && (
        <div className="map-loading">
          <MapPin size={24} />
          <span>{failed ? 'המפה זמינה בחיבור לאינטרנט' : 'רגע, מוצאים את רומא…'}</span>
          <a href={mapUrl('Roma, Italia')} target="_blank" rel="noreferrer">
            פתיחה במפות <ExternalLink size={13} />
          </a>
        </div>
      )}
      <div className="map-key">
        <span className="key-dot" />
        המקומות שלנו <span className="home-dot" />
        הלינה שלנו
        <span className="visited-key">✓</span> כבר היינו
      </div>
    </div>
  );
}
