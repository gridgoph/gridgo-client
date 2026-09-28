/**
 * The order screen's shape: one latest-progress docket that opens onto the
 * job's whole history, then three folding sections (gridgo-client#129).
 *
 * Everything here is pure so the screen only composes. What a history row may
 * say is still `lib/orderHistory.ts`; this module only decides which row leads,
 * where each progress photo sits in the story, and the one line a folded
 * section shows in place of its body.
 */

import type { Order, ProductionPhoto } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { parseDeadline } from "@/lib/deadline";
import type { HistoryRow } from "@/lib/orderHistory";
import { formatPriceRange, orderTotalMinor } from "@/lib/orderState";
import { describeQuantity } from "@/lib/quantity";

/** Every part of the screen that folds. Remembered per section, per phone. */
export type OrderSectionKey = "history" | "specifications" | "artwork" | "payment";

/** The steps a shop's photo is taken in: on the press, or checking and packing. */
const MAKING_STATES = ["production", "supplier_self_qc"];

/**
 * Which history row each progress photo belongs under, newest photo first.
 *
 * A photo sits under the last step that had begun when it was taken, so the
 * story reads "On the press" and then the pictures from the press. A photo
 * older than every step belongs to the first one. A photo with no time goes
 * with the newest making step, else the newest step, rather than being lost.
 */
export function photosByHistoryRow(
  rows: readonly HistoryRow[],
  photos: readonly ProductionPhoto[],
): Map<string, ProductionPhoto[]> {
  const byRow = new Map<string, ProductionPhoto[]>();
  if (!rows.length) return byRow;

  const times = rows.map((row) => Date.parse(row.at));
  const making = [...rows].reverse().find((row) => MAKING_STATES.includes(row.state));
  const fallback = (making ?? rows[rows.length - 1]).key;

  for (const photo of photos) {
    const at = Date.parse(photo.at ?? "");
    let key = fallback;
    if (Number.isFinite(at)) {
      key = rows[0].key;
      rows.forEach((row, index) => {
        if (Number.isFinite(times[index]) && times[index] <= at) key = row.key;
      });
    }
    byRow.set(key, [...(byRow.get(key) ?? []), photo]);
  }

  for (const [key, list] of byRow) {
    byRow.set(key, [...list].sort((a, b) => photoTime(b) - photoTime(a)));
  }
  return byRow;
}

function photoTime(photo: ProductionPhoto): number {
  const at = Date.parse(photo.at ?? "");
  return Number.isFinite(at) ? at : 0;
}

/** "3 updates", "1 photo": a count a folded control says out loud. */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A due date in the line under a folded heading: "Due 15 Aug". */
function shortDate(value: string | null | undefined): string | null {
  const date = parseDeadline(value ?? null);
  if (!date) return null;
  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
  });
}

/** What the job is and when it is wanted, in one line. */
export function specificationsSummary(
  order: Pick<Order, "quantity" | "size" | "deadline" | "productionItems">,
  unit: string,
): string {
  const items = order.productionItems ?? [];
  const parts: string[] = [];
  if (items.length > 1) {
    parts.push(countLabel(items.length, "item", "items"));
  } else {
    // One item: its quantity. Its name is the job's title, already on screen.
    // With no unit the fallback noun is "items", and "2 items" reads as two
    // different things rather than two of one.
    const count = items[0]?.quantity ?? order.quantity;
    const quantity = unit ? describeQuantity(count, unit) : Number.isFinite(Number(count)) ? `Quantity ${count}` : "—";
    if (quantity !== "—") parts.push(quantity);
    if (!items.length && order.size) parts.push(order.size);
  }
  const due = shortDate(order.deadline);
  if (due) parts.push(`Due ${due}`);
  return parts.join(" · ") || "Order details and deadline";
}

/** How many files and links travel with the job. */
export function artworkSummary({
  files,
  links,
  inProof,
}: {
  files: number;
  links: number;
  inProof: boolean;
}): string {
  if (inProof && !links) return "Shown in the proof above";
  const parts: string[] = [];
  if (files) parts.push(countLabel(files, "file", "files"));
  if (links) parts.push(countLabel(links, "design link", "design links"));
  return parts.join(" · ") || "Nothing attached yet";
}

/**
 * The total a client pays, or the estimate before there is one. Fee-inclusive
 * like every figure a client reads; GRIDGO's cut is never its own peso amount.
 */
export function paymentSummary(order: Order): string {
  const total = orderTotalMinor(order);
  if (total != null) return `Total ${formatPhp(total)}`;
  const range = order.priceRange;
  if (range) {
    return `Estimate ${formatPriceRange(range.subtotalMinMinor, range.subtotalMaxMinor)}`;
  }
  return "Priced once a shop takes the job";
}
