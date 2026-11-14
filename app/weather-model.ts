import { z } from 'zod';
export const WEATHER_CACHE = 'andiamo-rome-weather-v1';
export const WEATHER_REFRESH = 15 * 60_000;
export const WEATHER_MAX_AGE = 60 * 60_000;
export const ROME_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=41.9028&longitude=12.4964&current=temperature_2m,is_day,weather_code,wind_speed_10m&timezone=Europe%2FRome&timeformat=unixtime&forecast_days=1';
export const weatherSchema = z.object({
  time: z.number().finite().positive(),
  temperature_2m: z.number().finite().min(-90).max(65),
  is_day: z.union([z.literal(0), z.literal(1)]),
  weather_code: z.number().int().min(0).max(99),
  wind_speed_10m: z.number().finite().min(0).max(500),
});
export type RomeWeather = z.infer<typeof weatherSchema>;
export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm' | 'neutral';
export function weatherKind(code?: number): WeatherKind {
  if (code === undefined) return 'neutral';
  if (code <= 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if ([45, 48].includes(code)) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  return 'neutral';
}
export const weatherLabels: Record<WeatherKind, string> = { clear: 'בהיר', cloudy: 'מעונן חלקית', overcast: 'מעונן', fog: 'ערפילי', rain: 'גשום', snow: 'שלג', storm: 'סוער', neutral: 'מזג האוויר ברומא' };
export function usableWeather(weather: RomeWeather, now = Date.now()) {
  return weather.time * 1000 <= now + 30 * 60_000 && now - weather.time * 1000 <= WEATHER_MAX_AGE;
}
export function cachedWeather(storage: Pick<Storage, 'getItem'>, now = Date.now()): { current: RomeWeather; fetchedAt: number } | null {
  try {
    const data = JSON.parse(storage.getItem(WEATHER_CACHE) || 'null');
    const current = weatherSchema.parse(data.current);
    if (!Number.isFinite(data.fetchedAt) || data.fetchedAt > now + 60_000 || !usableWeather(current, now)) return null;
    return { current, fetchedAt: data.fetchedAt };
  } catch { return null; }
}
export function israelTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
