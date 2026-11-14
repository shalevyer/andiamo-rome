import { z } from 'zod';
import { applyOperation, bookingSchema, checkSchema, stopSchema, tripSchema, type Operation, type Trip } from './model';

const value = z.unknown().refine(v => v !== undefined);
export const changeSchema = z.object({
  bucket: z.enum(['trip', 'stops', 'bookings', 'checks']),
  id: z.string().min(1).max(300), field: z.string().max(100), before: value, after: value,
});
export const syncOperationSchema = z.object({
  id: z.string().min(8).max(150), device: z.string().min(8).max(100),
  changes: z.array(changeSchema).min(1).max(2000),
});
export type Change = z.infer<typeof changeSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type Conflict = { change: Change; current: unknown };
export const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && same((a as any)[k], (b as any)[k]));
};
const schemas = { stops: stopSchema, bookings: bookingSchema, checks: checkSchema };
export function diffTrip(before: Trip, after: Trip): Change[] {
  const changes: Change[] = [];
  for (const id of ['start', 'notes'] as const)
    if (!same(before[id], after[id])) changes.push({ bucket: 'trip', id, field: '', before: before[id], after: after[id] });
  for (const id of ['days', 'dayNotes'] as const)
    for (let i = 0; i < 6; i++) if (before[id][i] !== after[id][i]) changes.push({ bucket: 'trip', id, field: String(i), before: before[id][i], after: after[id][i] });
  for (const bucket of ['stops', 'bookings', 'checks'] as const) {
    const old = new Map(before[bucket].map(item => [item.id, item]));
    const next = new Map(after[bucket].map(item => [item.id, item]));
    for (const [id, item] of old) if (!next.has(id)) changes.push({ bucket, id, field: '', before: item, after: null });
    for (const [id, item] of next) {
      const previous = old.get(id);
      if (!previous) changes.push({ bucket, id, field: '', before: null, after: item });
      else for (const field of Object.keys(schemas[bucket].shape)) {
        if (field !== 'id' && !same((previous as any)[field], (item as any)[field]))
          changes.push({ bucket, id, field, before: (previous as any)[field], after: (item as any)[field] });
      }
    }
  }
  return changes;
}
export function changesForOperation(current: Trip, operation: Operation): Change[] {
  if (operation.type === 'restore' && operation.base) return diffTrip(operation.base, operation.value);
  const base = structuredClone(current);
  if ('base' in operation && operation.base !== undefined) {
    if (['stop', 'booking', 'check', 'deleteStop', 'deleteBooking', 'deleteCheck'].includes(operation.type)) {
      const bucket = ['stop', 'deleteStop'].includes(operation.type) ? 'stops' : ['booking', 'deleteBooking'].includes(operation.type) ? 'bookings' : 'checks';
      const identity = typeof operation.value === 'string' ? operation.value : (operation.value as { id: string }).id;
      const index = base[bucket].findIndex(item => item.id === identity);
      if (index >= 0) (base[bucket] as any[])[index] = operation.base;
      else (base[bucket] as any[]).push(operation.base);
    } else if (operation.type === 'notes') base.notes = operation.base as string;
    else if (operation.type === 'day') {
      const v = operation.base as { title: string; notes: string };
      base.days[operation.value.day] = v.title; base.dayNotes[operation.value.day] = v.notes;
    }
  }
  return diffTrip(base, applyOperation(base, operation));
}
function target(trip: Trip, change: Change) {
  if (change.bucket === 'trip') {
    if (['start', 'notes'].includes(change.id) && change.field === '') return { object: trip as any, key: change.id };
    if (['days', 'dayNotes'].includes(change.id) && /^[0-5]$/.test(change.field)) return { object: (trip as any)[change.id], key: change.field };
    throw Error('Invalid trip field');
  }
  const fields = schemas[change.bucket].shape;
  if (change.field && (!Object.hasOwn(fields, change.field) || change.field === 'id')) throw Error('Invalid item field');
  const item = trip[change.bucket].find(v => v.id === change.id);
  return { object: item as any, key: change.field };
}
export function readChange(trip: Trip, change: Change): unknown {
  const t = target(trip, change);
  return change.bucket !== 'trip' && !change.field ? t.object ?? null : t.object?.[t.key] ?? null;
}
export function projectChanges(trip: Trip, changes: Change[]): Trip {
  const result = structuredClone(trip);
  for (const change of changes) {
    const t = target(result, change);
    if (change.bucket !== 'trip' && !change.field) {
      if (change.after === null) (result[change.bucket] as any[]) = result[change.bucket].filter(v => v.id !== change.id);
      else {
        const item = schemas[change.bucket].parse(change.after);
        if (item.id !== change.id) throw Error('Invalid item identity');
        const index = result[change.bucket].findIndex(v => v.id === change.id);
        if (index < 0) (result[change.bucket] as any[]).push(item);
        else (result[change.bucket] as any[])[index] = item;
      }
    } else if (t.object) t.object[t.key] = change.after;
  }
  return tripSchema.parse(result);
}
export function mergeChanges(trip: Trip, changes: Change[], tombstones: Set<string>) {
  const conflicts: Conflict[] = [];
  for (const change of changes) {
    const current = readChange(trip, change);
    const missingEditedItem = change.bucket !== 'trip' && !!change.field && !trip[change.bucket].some(v => v.id === change.id);
    const staleAdd = change.bucket !== 'trip' && !change.field && change.before === null && change.after !== null && tombstones.has(change.bucket + ':' + change.id);
    if (missingEditedItem || staleAdd || (!same(current, change.before) && !same(current, change.after))) conflicts.push({ change, current });
  }
  return conflicts.length ? { trip, conflicts } : { trip: projectChanges(trip, changes), conflicts };
}
