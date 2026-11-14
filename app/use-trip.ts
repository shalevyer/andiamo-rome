import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOperation, initialTrip, opSchema, tripSchema, type Operation, type Trip } from './model';

const KEY = 'andiamo-public-v1';
export function useTrip() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [status, setStatus] = useState<'loading' | 'saved' | 'error'>('loading');
  const current = useRef(initialTrip);
  const persist = useCallback((value: Trip) => {
    current.current = value;
    setTrip(value);
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    try {
      const cache = localStorage.getItem(KEY);
      persist(cache ? tripSchema.parse(JSON.parse(cache)) : initialTrip);
    } catch {
      persist(initialTrip);
    }
    if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }, [persist]);
  const mutate = useCallback((op: Operation) => {
    persist(applyOperation(current.current, opSchema.parse(op)));
  }, [persist]);
  const retry = useCallback(() => persist(current.current), [persist]);
  return { trip, status, mutate, retry };
}
