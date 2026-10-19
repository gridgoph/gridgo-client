/**
 * Tight, Secured and Rush on a match (gridgo-api#292, `docs/SCHEDULING_API.md`).
 *
 * GRIDGO decides the status and every time behind it; this module only says
 * them. An older API sends no `scheduling`, and then nothing here is drawn.
 */

import { formatPhp, type CatalogSpeedTier, type Scheduling } from "@/lib/api";

/** Names, not glyphs: `StatusChip` owns the Lucide registry. */
export type SchedulingChip = { tone: "warning" | "neutral"; label: string; icon: "triangle-alert" | "zap" };

/**
 * The chip a matched listing wears, or null. Secured is the ordinary case and
 * wears nothing, the same as the calendar's plain disc.
 */
export function schedulingChip(scheduling: Scheduling | null | undefined): SchedulingChip | null {
  switch (scheduling?.status) {
    case "tight":
      return { tone: "warning", label: "Tight: the shop may decline", icon: "triangle-alert" };
    case "rush":
      return { tone: "neutral", label: "Rush, costs more", icon: "zap" };
    default:
      return null;
  }
}

/**
 * The faster speed's price, in GRIDGO's own figure, or null.
 *
 * Only the tier's `client*` fields are read: they already carry GRIDGO's fee,
 * and the shop's own figure is never a client's price. Nothing is added up or
 * worked out here — the exact amount for a quantity is the listing sheet's
 * quote. A replacement rate is per unit; a surcharge is one charge.
 */
export function rushPriceLine(tier: CatalogSpeedTier | null | undefined, unit: string): string | null {
  if (!tier) return null;
  if (tier.clientPriceMinor != null) return `Rush rate ${formatPhp(tier.clientPriceMinor)} ${unit}`;
  if (tier.clientSurchargeMinor != null) return `Rush adds ${formatPhp(tier.clientSurchargeMinor)}`;
  return null;
}
