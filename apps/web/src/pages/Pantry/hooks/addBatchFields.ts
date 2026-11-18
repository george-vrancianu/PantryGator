import { FALLBACK_LOCATION, type StorageLocation } from '@/lib/catalog';
import { defaultExpiryDate, type IsoDate } from '@/lib/pantry';

/** Where a Batch goes: a shelf card's preset wins, then the Ingredient's Catalog default, then the fallback. */
export function locationFor(
  preset: StorageLocation | undefined,
  catalogDefault: StorageLocation | null | undefined,
): StorageLocation {
  return preset ?? catalogDefault ?? FALLBACK_LOCATION;
}

/** The expiry date a Default Expiry (in days) gives from today; null for none. */
export function expiryFrom(days: number | null): IsoDate | null {
  return days === null ? null : defaultExpiryDate(days, new Date());
}

/** The marks without `field`, as a new set. */
export function unmark<T>(marks: ReadonlySet<T>, field: T): Set<T> {
  const next = new Set(marks);
  next.delete(field);
  return next;
}
