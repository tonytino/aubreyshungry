import type { Unit } from "~/content/shopping-list";

/**
 * Format an ingredient quantity for display, e.g. `"1.5 lb"`, `"2 tbsp"`,
 * or for a bare count (unit `""`) just `"2"`. Quantities are rounded to two
 * decimals with trailing zeros trimmed, so summed floating-point quantities
 * (0.30000000000000004) render sanely.
 */
export function formatQuantity(quantity: number, unit: Unit): string {
  const rounded = Math.round(quantity * 100) / 100;
  const amount = String(rounded);
  return unit === "" ? amount : `${amount} ${unit}`;
}
