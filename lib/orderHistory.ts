/**
 * The order's history as a client may read it.
 *
 * gridgo-api#112: a client's history used to show whatever was typed when the
 * job moved — a shop payout stage being released, a proof code. None of that
 * is the client's business. Current APIs send the client a plain projection
 * (`{at, state, note}`, the note being GRIDGO's fixed wording for the state);
 * this module is the client's half of the same rule, and the half that still
 * holds when the phone reaches an API from before it.
 *
 * - An entry naming a shop payout stage (`milestoneCode`) is never drawn.
 * - `payout_released` is the platform's internal ending; to a client the job
 *   is completed, and two "Completed" rows in a row are one.
 * - A row reads GRIDGO's plain note from the plain projection (`plainNotes`),
 *   and the client's own label for the state otherwise. The label also wins
 *   where it depends on how the job reaches the client: a collecting client is
 *   never told their job is out for delivery.
 * - An older payload's notes were free text, so none of them are drawn: a
 *   denylist of words that might be internal is exactly the kind of guess
 *   that leaked the first time.
 */

import type { Order } from "@/lib/api";
import { actorLabel } from "@/lib/copy";
import { getOrderStateMeta, latestNoteForState } from "@/lib/orderState";
import { hasPlainHistory } from "@/lib/productionProgress";

export type HistoryEntry = {
  at: string;
  state: string;
  by?: string;
  note?: string;
  milestoneCode?: string;
};

export type HistoryRow = {
  key: string;
  at: string;
  state: string;
  title: string;
  /** "You", "Operations", "Supplier"… Only when the payload names one. */
  actor: string | null;
};

type Options = {
  plainNotes: boolean;
  fulfillmentMode?: string | null;
  paidInFull?: boolean;
};

/** Oldest first, as the payload stores it. */
export function historyRows(
  timeline: readonly HistoryEntry[] | null | undefined,
  { plainNotes, fulfillmentMode, paidInFull = false }: Options,
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const entry of Array.isArray(timeline) ? timeline : []) {
    if (!entry || typeof entry.state !== "string" || entry.milestoneCode) continue;
    const state = entry.state === "payout_released" ? "completed" : entry.state;
    if (rows.at(-1)?.state === state) continue;

    const label = getOrderStateMeta(state, fulfillmentMode, paidInFull).label;
    const modeSpecific = label !== getOrderStateMeta(state, null, paidInFull).label;
    const note = plainNotes && !modeSpecific ? entry.note?.trim() : "";
    rows.push({
      key: `${entry.at}-${state}-${rows.length}`,
      at: entry.at,
      state,
      title: note || label,
      actor: entry.by ? actorLabel(entry.by) : null,
    });
  }
  return rows;
}

/**
 * Operations' reason for turning the artwork back, or null for none.
 *
 * The plain projection carries it as its own field (`correction`), because its
 * timeline note is only GRIDGO's fixed wording for the step — "Artwork needs a
 * change" is not a reason anyone can act on. An API from before the plain
 * projection still wrote the reason as the correction step's note, so that is
 * where an older payload's reason is read from.
 */
export function correctionReason(
  order: Pick<Order, "correction" | "productionProgress" | "timeline">,
): string | null {
  const reason = order.correction?.reason?.trim();
  if (reason) return reason;
  if (hasPlainHistory(order)) return null;
  return latestNoteForState(order.timeline, "client_correction");
}
