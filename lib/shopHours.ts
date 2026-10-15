/**
 * A shop's opening hours, in a client's words (gridgo-api#219,
 * `docs/SHOP_HOURS_API.md`).
 *
 * GRIDGO sends whether a shop is open now and when it next opens, worked out
 * on its own clock against the shop's week, closures and any extra hours
 * declared today. This module only says that back in Davao time. It never
 * reads the weekly schedule: the shop edits it without a release, and a copy of
 * the rule on the phone would disagree with GRIDGO the day it changed.
 *
 * Separate from GRIDGO's own hours (`lib/operatingHours.ts`), which decide when
 * artwork is reviewed. A shop being closed tonight does not stop a client
 * ordering from it; the ready-by already waits for it to open. Only a shop
 * closed for now — no reopening date — takes no new orders, and GRIDGO refuses
 * them (`shop_unavailable` at checkout, no match at all).
 */

import type { ShopBoard, ShopHours } from "@/lib/api";
import { reviewMoment } from "@/lib/operatingHours";

export type ShopHoursKind = "open" | "closed" | "paused";

export type ShopHoursView = {
  kind: ShopHoursKind;
  /** "Open now", "Closed · opens tomorrow, 8:00 AM", "Closed for now". */
  label: string;
};

export const SHOP_PAUSED_LABEL = "Closed for now";

/** Why a listing from a shop closed for now cannot be added. */
export const SHOP_PAUSED_MESSAGE =
  "This shop is closed for now and is not taking new orders. Go back and pick another listing.";

/** The same, said on a basket line already holding one. */
export const SHOP_PAUSED_LINE =
  "This shop is closed for now and is not taking new orders. Remove this item to place your order.";

/**
 * What one shop's hours say, ready to draw. Null when there is nothing honest
 * to say: an API without the field, a calendar GRIDGO cannot read, or an
 * opening already in the past — a read held from before the shop opened.
 */
export function shopHoursView(
  hours: ShopHours | null | undefined,
  now: Date = new Date(),
): ShopHoursView | null {
  if (!hours) return null;
  if (hours.temporarilyClosed) return { kind: "paused", label: SHOP_PAUSED_LABEL };
  if (hours.calendarAvailable === false) return null;
  if (hours.isOpenNow) return { kind: "open", label: "Open now" };
  if (!hours.nextOpeningAt) return { kind: "closed", label: "Closed" };
  const at = Date.parse(hours.nextOpeningAt);
  if (!Number.isFinite(at) || at <= now.getTime()) return null;
  const opens = reviewMoment(hours.nextOpeningAt, now);
  return { kind: "closed", label: opens ? `Closed · opens ${opens}` : "Closed" };
}

/** True only when GRIDGO says the shop is closed for now. */
export function shopPaused(hours: ShopHours | null | undefined): boolean {
  return hours?.temporarilyClosed === true;
}

/**
 * One line for a kind of print across every shop listing it.
 *
 * A category tile stands for every shop that prints the thing, so it is open if
 * any of them is, closed for now only if all of them are, and otherwise opens
 * at the soonest of their openings. Open draws nothing on a tile — it is the
 * ordinary case, and a wall of "Open now" says nothing — so this returns only
 * the two closed views.
 */
export function subcategoryHoursView(
  boards: readonly ShopBoard[],
  subcategoryCode: string,
  now: Date = new Date(),
): ShopHoursView | null {
  const views = boards
    .filter((board) =>
      board.services.some((service) =>
        service.items.some((item) => item.subcategoryCode === subcategoryCode),
      ),
    )
    .map((board) => ({ hours: board.hours, view: shopHoursView(board.hours, now) }));
  // One shop without a status is one that may be open: say nothing.
  if (!views.length || views.some(({ view }) => !view || view.kind === "open")) return null;
  if (views.every(({ view }) => view?.kind === "paused")) {
    return { kind: "paused", label: SHOP_PAUSED_LABEL };
  }
  const soonest = views
    .filter(({ view }) => view?.kind === "closed")
    .map(({ hours }) => hours?.nextOpeningAt ?? null)
    .filter((at): at is string => at != null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return shopHoursView(
    { isOpenNow: false, temporarilyClosed: false, nextOpeningAt: soonest ?? null },
    now,
  );
}

/** Every shop that lists this is closed for now — why matching found nobody. */
export function everyShopPaused(
  boards: readonly ShopBoard[] | null | undefined,
  subcategoryCode: string,
): boolean {
  return subcategoryHoursView(boards ?? [], subcategoryCode)?.kind === "paused";
}

/** "Shop closed, opens tomorrow, 8:00 AM" — the line as a screen reader says it. */
export function shopHoursSpoken(view: ShopHoursView): string {
  const label = view.label.replace(" · ", ", ");
  return `Shop ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}
