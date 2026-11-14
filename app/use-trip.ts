import { useCallback, useEffect, useRef, useState } from 'react';
import { initialTrip, opSchema, type Operation, type Trip } from './model';
import { readLocalTrip, saveLocalTrip, TRIP_STORAGE_KEY, RECOVERY_STORAGE_KEY } from './local-data';
import { acceptInvitation, isConnected } from './connection';
import { addOperation, mirrorSharedTrip, synchronize, updateSyncState, visibleTrip, type SyncState } from './cloud-sync';
import { changesForOperation, projectChanges } from './sync-model';
import { synchronizeDocuments } from './documents';

type Status = 'loading' | 'saved' | 'saving' | 'offline' | 'error';
const JOURNAL = 'andiamo-unsent-operation-';
export function useTrip() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [status, setStatus] = useState<Status>('loading');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [conflicts, setConflicts] = useState<SyncState['conflicts']>([]);
  const current = useRef(initialTrip), alive = useRef(true), sequence = useRef(0);
  const show = useCallback((value: Trip) => { current.current = value; setTrip(value); }, []);
  const readShared = useCallback(async () => {
    const number = ++sequence.current;
    const state = await mirrorSharedTrip();
    if (!alive.current || number !== sequence.current || !state?.migrated) return;
    show(visibleTrip(state)); setConflicts(state.conflicts);
    return state;
  }, [show]);
  const refresh = useCallback(async () => {
    if (!isConnected()) {
      try {
        const loaded = readLocalTrip(localStorage);
        show(loaded.trip); setRecoveryMessage(loaded.recoveryMessage);
        setStatus(loaded.recoveryMessage ? 'error' : 'saved');
      } catch { setStatus('error'); }
      return;
    }
    setConnected(true);
    try {
      const unsent = Object.keys(localStorage).filter(key => key.startsWith(JOURNAL));
      for (const key of unsent) {
        const operation = opSchema.parse(JSON.parse(localStorage.getItem(key)!));
        await addOperation(operation); localStorage.removeItem(key);
      }
      const state = await synchronize();
      await readShared();
      await synchronizeDocuments(state.documents);
      if (alive.current) { setRecoveryMessage(''); setStatus(state.pending.length ? 'saving' : 'saved'); }
    } catch {
      await readShared().catch(() => {});
      if (alive.current) setStatus('offline');
    }
  }, [readShared, show]);
  useEffect(() => {
    alive.current = true;
    try {
      const loaded = readLocalTrip(localStorage); show(loaded.trip); setRecoveryMessage(loaded.recoveryMessage);
      if (location.hash.startsWith('#join=')) acceptInvitation(location.hash.slice(6));
    } catch { setStatus('error'); }
    setConnected(isConnected());
    refresh();
    const onConnection = () => { setConnected(isConnected()); refresh(); };
    const onCloud = () => { readShared().catch(() => setStatus('error')); };
    const onStorage = (event: StorageEvent) => {
      if (isConnected()) { readShared().catch(() => {}); return; }
      if (event.key === TRIP_STORAGE_KEY || event.key === RECOVERY_STORAGE_KEY) refresh();
    };
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(onFocus, 4000);
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('andiamo-shared-updates') : null;
    if (channel) channel.onmessage = onCloud;
    window.addEventListener('andiamo-connection', onConnection);
    window.addEventListener('andiamo-cloud-state', onCloud);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});
    return () => {
      alive.current = false; clearInterval(timer); channel?.close();
      window.removeEventListener('andiamo-connection', onConnection);
      window.removeEventListener('andiamo-cloud-state', onCloud);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [readShared, refresh, show]);
  const mutate = useCallback((op: Operation) => {
    const valid = opSchema.parse(op);
    if (isConnected()) {
      try {
        // This synchronous journal survives closing the tab even before IndexedDB commits.
        localStorage.setItem(JOURNAL + valid.id, JSON.stringify(valid));
        setStatus('saving');
        addOperation(valid).then(async () => {
          localStorage.removeItem(JOURNAL + valid.id);
          await readShared(); await refresh();
        }).catch(() => setStatus('error'));
      } catch { setStatus('error'); }
    } else {
      const value = projectChanges(current.current, changesForOperation(current.current, valid));
      show(value);
      try { saveLocalTrip(localStorage, value); setRecoveryMessage(''); setStatus('saved'); }
      catch { setStatus('error'); }
    }
  }, [readShared, refresh, show]);
  return { trip, status, mutate, retry: refresh, recoveryMessage, connected, conflicts };
}
