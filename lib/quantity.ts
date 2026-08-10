/**
 * Quantity bounds and wording, keyed by the catalog unit.
 *
 * A stepper needs real bounds, and the review screen needs to say what a
 * quantity of 4 actually means — four square metres, or four packs of 100.
 */

export type QuantityBounds = {
  min: number;
  max: number;
  step: number;
  /** Singular and plural of what one unit is. */
  one: string;
  many: string;
};

const BOUNDS: Record<string, QuantityBounds> = {
  sqm: { min: 1, max: 500, step: 1, one: "sqm", many: "sqm" },
  sheet: { min: 1, max: 2000, step: 1, one: "sheet", many: "sheets" },
  pack100: { min: 1, max: 200, step: 1, one: "pack of 100", many: "packs of 100" },
  box100: { min: 1, max: 200, step: 1, one: "box of 100", many: "boxes of 100" },
  piece: { min: 1, max: 1000, step: 1, one: "piece", many: "pieces" },
};

const FALLBACK: QuantityBounds = {
  min: 1,
  max: 1000,
  step: 1,
  one: "item",
  many: "items",
};

export function quantityBounds(unit: string | null | undefined): QuantityBounds {
  if (!unit) return FALLBACK;
  return BOUNDS[unit] ?? FALLBACK;
}

/** Keep a quantity inside its bounds and on its step. */
export function clampQuantity(value: number, unit: string | null | undefined): number {
  const bounds = quantityBounds(unit);
  if (!Number.isFinite(value)) return bounds.min;
  const stepped = Math.round(value / bounds.step) * bounds.step;
  return Math.min(bounds.max, Math.max(bounds.min, stepped));
}

/** "4 packs of 100" — what the client is actually ordering. */
export function describeQuantity(
  value: number,
  unit: string | null | undefined,
): string {
  const bounds = quantityBounds(unit);
  const noun = value === 1 ? bounds.one : bounds.many;
  return `${value} ${noun}`;
}

/** Why the stepper stopped, so a disabled control is never silent. */
export function quantityLimitNote(
  value: number,
  unit: string | null | undefined,
): string | null {
  const bounds = quantityBounds(unit);
  if (value >= bounds.max) {
    return `${bounds.max} ${bounds.many} is the most a single request covers. Split larger runs across two jobs, or ask Operations.`;
  }
  if (value <= bounds.min) {
    return null;
  }
  return null;
}
