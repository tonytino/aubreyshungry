/**
 * Derive stable, unique React keys from list content instead of array
 * indices (which Biome's `noArrayIndexKey` rightly forbids). Duplicate base
 * keys get a `-2`, `-3`, … suffix in encounter order, so the result is
 * deterministic for a given input list.
 */
export function withKeys<T>(
  items: readonly T[],
  keyOf: (item: T) => string
): { item: T; key: string }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { item, key: count === 1 ? base : `${base}-${count}` };
  });
}
