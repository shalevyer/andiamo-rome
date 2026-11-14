import { initialTrip, tripSchema, type Trip } from './model';

// Keep this key stable across deployments. Loading a build must never reseed an existing trip.
export const TRIP_STORAGE_KEY = 'andiamo-public-v1';
export const RECOVERY_STORAGE_KEY = 'andiamo-public-recovery-v1';
export const RECOVERY_ARCHIVE_PREFIX = 'andiamo-public-unreadable-';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readLocalTrip(storage: StorageLike) {
  const raw = storage.getItem(TRIP_STORAGE_KEY);
  if (raw === null) return { trip: initialTrip, recoveryMessage: '' };
  try {
    return { trip: tripSchema.parse(JSON.parse(raw)), recoveryMessage: '' };
  } catch {
    // Do not replace or "repair" the original. Keep its exact bytes available for recovery.
    try {
      const backup = storage.getItem(RECOVERY_STORAGE_KEY);
      if (backup !== null) return {
        trip: tripSchema.parse(JSON.parse(backup)),
        recoveryMessage: 'מוצג הגיבוי הקודם. העותק האחרון לא נפתח ונשמר במלואו לשחזור.',
      };
    } catch {}
    return {
      trip: initialTrip,
      recoveryMessage: 'העותק השמור לא נפתח. הוא נשמר במלואו לשחזור ולא הוחלף בתוכנית ההתחלתית.',
    };
  }
}

export function saveLocalTrip(storage: StorageLike, value: Trip) {
  const next = JSON.stringify(tripSchema.parse(value));
  const previous = storage.getItem(TRIP_STORAGE_KEY);
  if (previous === next) return;
  // Save the old bytes first. If storage is full, abort without changing the existing trip.
  if (previous !== null) {
    let readable = false;
    try { tripSchema.parse(JSON.parse(previous)); readable = true; } catch {}
    if (!readable) storage.setItem(RECOVERY_ARCHIVE_PREFIX + crypto.randomUUID(), previous);
    storage.setItem(RECOVERY_STORAGE_KEY, previous);
  }
  storage.setItem(TRIP_STORAGE_KEY, next);
}
