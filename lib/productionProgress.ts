/**
 * Progress photos: what the print shop has shown of the job while making it.
 *
 * This replaced reading the shop's payout milestones on the order screen. A
 * milestone is a share of someone else's money, and its "done" was a payout
 * stage being filed — not something a client can look at. A photo is. GRIDGO
 * will not let a job be packed until the shop has filed at least one, so the
 * gallery and its empty state are the honest answer to "has anything happened
 * on the press?" (gridgoph/gridgo-api#112).
 *
 * The contract is `productionProgress` on an order (gridgo-api
 * `src/production-progress.js`). It is additive: an API from before the
 * gallery sends no such field, and then there is nothing to say — never a
 * guessed "waiting", which would accuse a shop of skipping a step it was never
 * asked for.
 */

import type { Order, ProductionPhoto } from "@/lib/api";

export const WAITING_FOR_PHOTO = "Waiting for a progress photo";

/** On the press or being packed: a photo is expected now. */
const MAKING_STATES = ["production", "supplier_self_qc"];

/**
 * Past the press. A job only gets here without a photo when Operations moved it
 * on, or from before photos were required. Still waiting, said plainly.
 */
const AFTER_STATES = [
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
];

export type ProgressView =
  /** Newest first: the latest photo is the one a client came to see. */
  | { kind: "photos"; photos: ProductionPhoto[] }
  | { kind: "waiting"; body: string };

/**
 * What the order screen draws in its progress section, or null for nothing.
 *
 * The photos are the truth, not the `status` word beside them: the server
 * drops a photo this client may not read and recomputes the status, and a
 * status it adds later must not make an empty gallery claim to have photos.
 */
export function progressView(
  order: Pick<Order, "state" | "productionProgress">,
): ProgressView | null {
  const progress = order.productionProgress;
  if (!progress || typeof progress !== "object") return null;

  const photos = Array.isArray(progress.photos)
    ? progress.photos.filter((photo) => photo && typeof photo.fileId === "string")
    : [];
  if (photos.length) {
    return { kind: "photos", photos: [...photos].sort((a, b) => photoTime(b) - photoTime(a)) };
  }

  if (MAKING_STATES.includes(order.state)) {
    return {
      kind: "waiting",
      body: "The print shop sends a photo while your job is being made. It shows here as soon as it arrives, and your job is not packed without one.",
    };
  }
  if (AFTER_STATES.includes(order.state)) {
    return {
      kind: "waiting",
      body: "No photo came in while this job was being made. If the print shop sends one, it shows here.",
    };
  }
  return null;
}

function photoTime(photo: ProductionPhoto): number {
  const at = Date.parse(photo.at ?? "");
  return Number.isFinite(at) ? at : 0;
}

/**
 * True when this order came from an API that writes the client's history in
 * plain words (`timeline[].note` is GRIDGO's fixed wording for the state).
 *
 * The gallery field and that projection shipped together, so its presence is
 * the tell. Before it, a note was whatever the person or system that moved the
 * job typed — shop payout stages and proof codes among them — so those notes
 * are not shown at all.
 */
export function hasPlainHistory(order: Pick<Order, "productionProgress">): boolean {
  return order.productionProgress != null && typeof order.productionProgress === "object";
}
