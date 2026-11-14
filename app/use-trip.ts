import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOperation, initialTrip, opSchema, type Operation, type Trip } from './model';
import { readLocalTrip, saveLocalTrip, TRIP_STORAGE_KEY, RECOVERY_STORAGE_KEY } from './local-data';

export function useTrip() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [status, setStatus] = useState<'loading' | 'saved' | 'error'>('loading');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const current = useRef(initialTrip);
  const persist = useCallback((value: Trip) => {
    current.current = value;
    setTrip(value);
    try {
      saveLocalTrip(localStorage, value);
      setRecoveryMessage('');
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    const load = () => {
      try {
        const loaded = readLocalTrip(localStorage);
        current.current = loaded.trip;
        setTrip(loaded.trip);
        setRecoveryMessage(loaded.recoveryMessage);
        setStatus(loaded.recoveryMessage ? 'error' : 'saved');
      } catch { setStatus('error'); }
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRIP_STORAGE_KEY || event.key === RECOVERY_STORAGE_KEY) load();
    };
    window.addEventListener('storage', onStorage);
    if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const mutate = useCallback((op: Operation) => {
    persist(applyOperation(current.current, opSchema.parse(op)));
  }, [persist]);
  const retry = useCallback(() => persist(current.current), [persist]);
  return { trip, status, mutate, retry, recoveryMessage };
}
