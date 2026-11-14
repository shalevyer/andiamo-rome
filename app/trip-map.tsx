'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { mapUrl, type Stop } from './model';
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
      (s) => s.lat !== null && s.lng !== null && s.category !== 'transfer'
    );
    points.forEach((s, i) => {
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: 'numbered-pin',
          html: '<span><b>' + (i + 1) + '</b></span>',
          iconSize: [32, 40],
          iconAnchor: [16, 35],
        }),
        title: s.title,
        keyboard: true,
      }).addTo(layer);
      marker.on('click', () => selection.current(s));
      const label = document.createElement('span');
      label.dir = 'rtl';
      label.textContent = s.title;
      marker.bindTooltip(label);
    });
    L.marker([41.9081167, 12.4759667], {
      icon: L.divIcon({ className: 'home-pin', html: '<span>⌂</span>', iconSize: [32, 32] }),
      title: 'Ripetta Luxurious Suites',
    }).addTo(layer);
    if (layer.getBounds().isValid())
      m.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 15 });
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
      </div>
    </div>
  );
}
