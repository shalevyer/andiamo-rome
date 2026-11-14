import { useCallback, useEffect, useRef, useState } from 'react';
import { initialTrip, opSchema, type Operation, type Trip } from './model';
import { readLocalTrip, saveLocalTrip, TRIP_STORAGE_KEY, RECOVERY_STORAGE_KEY } from './local-data';
import { listenForInvitations, isConnected, accessKey } from './connection';
import { addOperation, mirrorSharedTrip, synchronize, updateSyncState, visibleTrip, type SyncState, type SyncInfo } from './cloud-sync';
import { changesForOperation, projectChanges } from './sync-model';
import { synchronizeDocuments } from './documents';

type Status = 'loading' | 'saved' | 'saving' | 'offline' | 'error';
const JOURNAL = 'andiamo-unsent-operation-';
function syncErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('SHARED_HTTP_401')) return 'קישור הטיול במכשיר הזה לא אושר. פתחו שוב את קישור הטיול המשותף המלא.';
  if (message.includes('SHARED_HTTP_403')) return 'החיבור לטיול המשותף נחסם. פתחו את הקישור ב־Safari או ב־Chrome.';
  if (message.includes('store identity')) return 'זהות הטיול בענן השתנתה. העותק במכשיר נשמר ולא הוחלף.';
  if (error instanceof DOMException && ['QuotaExceededError', 'SecurityError', 'InvalidStateError', 'UnknownError'].includes(error.name)) return 'הדפדפן לא אפשר לפתוח את השמירה המקומית. פתחו את הקישור ב־Safari או ב־Chrome; אל תמחקו נתוני אתר.';
  return 'לא הצלחנו לאמת את העדכון מול הטיול המשותף. העותק והשינויים במכשיר נשמרו. אפשר לנסות שוב.';
}
export function useTrip() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [status, setStatus] = useState<Status>('loading');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [conflicts, setConflicts] = useState<SyncState['conflicts']>([]);
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({ revision: -1, events: 0, pending: 0, lastSyncedAt: null, issue: '' });
  const [syncIssue, setSyncIssue] = useState('');
  const current = useRef(initialTrip), alive = useRef(true), sequence = useRef(0);
  const show = useCallback((value: Trip) => { current.current = value; setTrip(value); }, []);
  const readShared = useCallback(async () => {
    const number = ++sequence.current;
    const state = await mirrorSharedTrip();
    if (!alive.current || number !== sequence.current || !state?.migrated) return;
    show(visibleTrip(state)); setConflicts(state.conflicts);
    setSyncInfo({ revision: state.revision, events: state.server.stops.length, pending: state.pending.length, lastSyncedAt: state.lastSyncedAt || null, issue: '' });
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
    const connection = accessKey();
    try {
      const unsent = Object.keys(localStorage).filter(key => key.startsWith(JOURNAL));
      for (const key of unsent) {
        const operation = opSchema.parse(JSON.parse(localStorage.getItem(key)!));
        await addOperation(operation); localStorage.removeItem(key);
      }
      const state = await synchronize();
      await readShared();
      await synchronizeDocuments(state.documents);
      if (connection !== accessKey()) return;
      if (alive.current && connection === accessKey()) { setRecoveryMessage(''); setSyncIssue(''); setStatus(state.pending.length ? 'saving' : 'saved'); }
      return await updateSyncState();
    } catch (error) {
      await readShared().catch(() => {});
      if (alive.current && connection === accessKey()) { setSyncIssue(syncErrorText(error)); setStatus('offline'); }
    }
  }, [readShared, show]);
  useEffect(() => {
    alive.current = true;
    try {
      const loaded = readLocalTrip(localStorage); show(loaded.trip); setRecoveryMessage(loaded.recoveryMessage);
    } catch { setStatus('error'); }
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
    const stopInvitations = listenForInvitations(error => { setSyncIssue(syncErrorText(error)); setStatus('error'); });
    window.addEventListener('andiamo-cloud-state', onCloud);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    setConnected(isConnected());
    refresh();
    if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});
    return () => {
      alive.current = false; clearInterval(timer); channel?.close();
      window.removeEventListener('andiamo-connection', onConnection);
      window.removeEventListener('andiamo-cloud-state', onCloud);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
      stopInvitations();
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
  return { trip, status, mutate, retry: refresh, recoveryMessage, connected, conflicts, syncInfo: { ...syncInfo, issue: syncIssue } };
}
