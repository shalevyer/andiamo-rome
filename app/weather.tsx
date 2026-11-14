import { useEffect, useState, useId, type CSSProperties } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, CloudMoon, Moon, Sun } from 'lucide-react';
import { cachedWeather, israelTime, ROME_WEATHER_URL, usableWeather, weatherKind, weatherLabels, weatherSchema, WEATHER_CACHE, WEATHER_REFRESH, type RomeWeather } from './weather-model';

export function IsraelTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  return <span className="israel-time" dir="ltr" aria-label={'השעה בישראל ' + israelTime(now)} title="שעון ישראל"><span>IL</span><time dateTime={now.toISOString()}>{israelTime(now)}</time></span>;
}
export function useRomeWeather() {
  const [weather, setWeather] = useState<RomeWeather | null>(() => {
    try { return cachedWeather(localStorage)?.current || null; } catch { return null; }
  });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true, running = false;
    const update = async () => {
      if (document.visibilityState === 'hidden' || running) return;
      running = true;
      try {
        const cache = cachedWeather(localStorage);
        if (cache && Date.now() - cache.fetchedAt < WEATHER_REFRESH) { if (active) setWeather(cache.current); return; }
        const response = await fetch(ROME_WEATHER_URL, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error('Weather unavailable');
        const data = await response.json() as { current?: unknown };
        const current = weatherSchema.parse(data.current);
        if (!usableWeather(current)) throw Error('Weather is outdated');
        try { localStorage.setItem(WEATHER_CACHE, JSON.stringify({ current, fetchedAt: Date.now() })); } catch {}
        if (active) { setWeather(current); setUnavailable(false); }
      } catch {
        let fallback = null;
        try { fallback = cachedWeather(localStorage)?.current || null; } catch {}
        if (active) { setWeather(fallback); setUnavailable(true); }
      } finally { running = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') update(); };
    update();
    const timer = setInterval(onVisible, WEATHER_REFRESH);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return { weather, unavailable };
}
export function WeatherAtmosphere() {
  return <div className="weather-atmosphere" aria-hidden="true"><div className="atmosphere-light" /><div className="atmosphere-cloud" /><div className="atmosphere-rain" /><div className="atmosphere-snow" /></div>;
}
export function RomeWeatherLabel({ weather, unavailable }: { weather: RomeWeather | null; unavailable: boolean }) {
  const kind = weatherKind(weather?.weather_code);
  const Icon = kind === 'rain' ? CloudRain : kind === 'storm' ? CloudLightning : kind === 'snow' ? CloudSnow : kind === 'fog' ? CloudFog : kind === 'overcast' ? Cloud : kind === 'cloudy' ? weather?.is_day ? CloudSun : CloudMoon : weather?.is_day ? Sun : Moon;
  const stale = !!weather && Date.now() - weather.time * 1000 > 30 * 60_000;
  const stamp = weather && new Intl.DateTimeFormat('he-IL', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(weather.time * 1000));
  return <div className="rome-weather-label">
    <span className="rome-weather-now">{weather && <Icon size={16} aria-hidden="true" />}<span>רומא{weather ? stale ? '' : ' עכשיו' : ''}</span>{weather && <><bdi>{Math.round(weather.temperature_2m)}°</bdi><span className="weather-description">{weatherLabels[kind]}</span></>}</span>
    <span className="weather-source">{weather ? <>{stale || unavailable ? 'עדכון אחרון ' : ''}<time dateTime={new Date(weather.time * 1000).toISOString()}>{stamp}</time><span> · </span></> : <>{unavailable ? 'יתעדכן כשיש חיבור' : 'מזג האוויר מתעדכן'}<span> · </span></>}<a href="https://open-meteo.com/" target="_blank" rel="noreferrer" aria-label="נתוני מזג האוויר: Open-Meteo">Open-Meteo</a></span>
  </div>;
}

export function RomeIllustration({ weather, unavailable }: { weather: RomeWeather | null; unavailable: boolean }) {
  const id = useId().replace(/:/g, '');
  const kind = weatherKind(weather?.weather_code);
  const wind = Math.max(14, 28 - (weather?.wind_speed_10m || 0) / 2);
  return <div className="rome-illustration" style={{ '--cloud-drift': wind + 's' } as CSSProperties}>
    <RomeWeatherLabel weather={weather} unavailable={unavailable} />
    <svg className="rome-drawing" viewBox="0 0 720 270" role="img" aria-label={'רישום ידני של רומא' + (weather ? ' · ' + weatherLabels[kind] + (weather.is_day ? ' ביום' : ' בלילה') : '')}>
      <defs>
        <linearGradient id={id + 'stone'} x2="0" y2="1"><stop stopColor="#eadfce" stopOpacity=".7"/><stop offset="1" stopColor="#faf9f6" stopOpacity="0"/></linearGradient>
        <linearGradient id={id + 'fade'} x2="0" y2="1"><stop offset=".65" stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient>
        <mask id={id + 'mask'}><path fill={'url(#' + id + 'fade)'} d="M0 0h720v270H0z"/></mask>
      </defs>
      <g className="scene-sun"><circle cx="565" cy="55" r="25"/><circle className="sun-halo" cx="565" cy="55" r="39"/></g>
      <path className="scene-moon" d="M568 29a25 25 0 1 0 24 35 25 25 0 0 1-24-35Z"/>
      <g className="scene-stars" fill="currentColor"><circle cx="455" cy="32" r="1.1"/><circle cx="650" cy="66" r="1.4"/><circle cx="535" cy="94" r=".8"/><path d="M614 19v7m-3.5-3.5h7" stroke="currentColor" strokeWidth=".7"/></g>
      <g className="scene-clouds" fill="none" stroke="#9e9ea1" strokeWidth="1" strokeLinecap="round" strokeDasharray="55 5 20 3"><path d="M426 75c10-17 38-20 51-8 8-25 47-29 63-7 22-13 52-2 55 15Z"/><path d="M88 84c14-10 28-11 43-5 5-14 34-20 47-7 12-3 30 2 34 12Z"/><path d="M577 109c14-14 42-13 54-3 16-21 48-22 64-1 13-3 26 1 33 9Z"/></g>
      <g className="rome-ink" mask={'url(#' + id + 'mask)'} fill="none" stroke="#87786b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <g className="sketch-dome">
          <path d="m345 80 2-17 14-2 5 20m-22-18 10-11 14 9m-13-10 1-17m-5 8 12-1"/>
          <path d="M309 140c-2-28 13-50 43-58 28 7 46 32 44 59m-88-2c27 3 60 5 91 3m-93 5 97 1-3 8-92-1m10 1-1 18m16-16v14m15-17v16m16-15 1 15m17-13-1 18m16-18 1 18"/>
          <path d="M321 136c0-24 12-43 30-54m-11 55c-1-20 4-40 11-53m18 53c2-21-6-41-15-54m31 55c-1-16-10-35-22-45" strokeWidth="1" opacity=".6"/>
          <path d="m307 177 94 1m-85-41c1-18 8-34 20-43m48 25 9 20" strokeWidth=".8" opacity=".3"/>
        </g>
        <g className="sketch-pine" strokeWidth="1.4">
          <path d="M124 168c-1-17-4-29-1-44m0 24 12-15m-11 5-13-13M70 118c-17-8-3-24 17-21-8-16 13-26 29-20 10-13 31-12 42 0 22-6 42 5 38 19 16 1 26 11 18 21-16 8-36 5-51 2-18 10-32 4-44 2-20 9-35 5-49-3"/>
          <path d="M77 120c17 3 29-2 40-7m17 8c10 3 20-1 31-7m-48-35 20 7m28-5 17 10" strokeWidth=".8" opacity=".35"/>
        </g>
        <g className="connected-rooftops">
          <path d="m49 231 2-59 33-17 28 9 24-16 32 5 27-17 31 11 29-9 27 18 34-1 27 19 25-6 30 8 24-14 28 1 24-17 29 7 28-15 29 18 24-6 35 16 29-4 25 20-2 50"/>
          <path d="m49 174 36-22 29 9 22-16 32 5 27-16 32 10 28-10 27 18 35 1 27 18 23-5 32 8 24-15 27 2 25-17 29 6 27-15 30 18 25-7 34 17 30-5 26 21" strokeWidth=".8" opacity=".47"/>
          <path d="m87 154 1-13 10 1-1 16m94-22v-13l12-1-1 14m246 11 1-15 11 3-1 16m124 12 1-16 11 1-1 19" strokeWidth="1.2"/>
          <path d="m83 170 2 61m52-78-1 77m59-87 1 85m57-83 1 83m61-68 1 69m53-53-1 52m53-62 2 62m52-76 1 77m56-75-1 76m59-63 1 63m57-52-2 54" strokeWidth="1.1" opacity=".74"/>
          <path d="M51 201c54-8 93-7 145-8 43-2 84 3 120 6m106-1c55-4 112-3 170 6l57 8" strokeWidth=".9" opacity=".5"/>
        </g>
        <g className="street-windows" strokeWidth="1.15" opacity=".7">
          <path d="m62 183 9-1 1 11-10 1Zm39-8 10-1 1 12-10 1m-1 20 10-1 1 13-9 1m48-47 10-1 1 12-10 1m-1 21 11-1v12l-10 1m60-51 9 1-1 12-9-1m-1 20 9 1-1 12-9-1m56-41 9 1v11l-8-1m67 15 8 1-1 10-7-1m65-4h8v11h-7m44-26 9-1v12l-8 1m47-13 9 1-1 11-8-1m58 1 9 2-1 12-8-2m44 4 9 2v12l-9-2"/>
          <path d="m97 197 20-2m32 2 19-1m40 4 16 1m218-8 17-2m40 3 17 2m40 2 18 4m38 5 18 4" opacity=".55"/>
        </g>
        <g className="street-arcade" strokeWidth="1.4">
          <path d="m274 228-1-16c0-12 15-15 16-3l1 20m11 0v-15c0-12 15-12 16 0l1 15m57-1v-16c-1-12 15-15 16-2v19m12-1-1-18c0-12 14-13 15-1l1 19m70 1v-15c0-12 15-12 15 1l1 15m13 0-1-14c0-12 15-11 16 1v14"/>
          <path d="m331 229-1-23c0-19 28-20 29 0l1 24m-16-38 1 6m-29 2 60-1" strokeWidth="1.1"/>
        </g>
        <g className="piazza-ground" strokeWidth="1" opacity=".5">
          <path d="M46 234c86-3 182-6 278-3s218-4 329 4M63 242c94-4 193-3 266-6m38 1c105-1 189 2 276 7m-345-5-80 29m164-30 92 28m-211-15 144 1m-180 11c87-3 155-4 226 0"/>
          <path d="m92 249 33-1m30-9 26 1m55 9 29 1m229-5 29 1m28-7 36 2m-15 13 31 1m-271 2 29 1m38-4 28 1" strokeWidth=".7" opacity=".55"/>
        </g>
      </g>
      <g className="scene-rain" stroke="#97a5ad" strokeWidth=".9" opacity=".42"><path d="m102 65-4 11m44 18-4 11m56-53-4 11m59 7-4 11m40-39-4 11m160 40-4 11m43-43-4 11m48 23-4 11m104-26-4 11m-8 48-4 11m-140 0-4 11m-190-23-4 11m-149 13-4 11"/></g>
      <g className="scene-snow" fill="#fff" stroke="#a7a7a0" strokeWidth=".3"><circle cx="103" cy="73" r="2"/><circle cx="186" cy="44" r="1.5"/><circle cx="243" cy="89" r="1.7"/><circle cx="481" cy="90" r="2"/><circle cx="536" cy="33" r="1.5"/><circle cx="622" cy="119" r="2"/></g>
    </svg>
  </div>;
}
