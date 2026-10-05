/**
 * Delivery or pick-up, asked before the match (gridgoph/gridgo-client#158).
 *
 * The choice used to wait for checkout, by which time GRIDGO had already
 * picked a press without knowing where the job was going. Now it is asked
 * straight after the date, and the match is measured from that point: the
 * client's address for a delivery, GRIDGO Office for a pick-up
 * (`docs/ORDER_MATCH_API.md#fulfillment-before-matching` in gridgo-api).
 *
 * A basket that already holds something decides the question for the job
 * joining it, because everything in one order travels together:
 *
 * - `ask` — nothing in the basket yet, so this job chooses.
 * - `locked` — the basket's lines were matched to a choice; the next job joins
 *   it, and GRIDGO refuses a different one (`request_fulfillment_locked`).
 * - `legacy` — the basket was started before the choice moved here. It keeps
 *   its checkout-time choice, and the match is asked the old way, because
 *   GRIDGO refuses a choice-bound pick on a basket like that
 *   (`request_fulfillment_requires_empty_cart`).
 */

import { ApiError, type Cart, type FulfilmentMode, type MatchResult, type OrderPoint, type RequestFulfilment } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";

export type FulfilmentStep = "ask" | "locked" | "legacy";

export function fulfilmentStepFor(cart: Pick<Cart, "lines" | "requestFulfillment"> | null): FulfilmentStep {
  if (!cart?.lines.length) return "ask";
  return cart.requestFulfillment ? "locked" : "legacy";
}

/** Whether a basket's travel was chosen before matching, and so cannot change at checkout. */
export function isLockedFulfilment(cart: Pick<Cart, "requestFulfillment"> | null | undefined): boolean {
  return Boolean(cart?.requestFulfillment);
}

/**
 * Whether the job's choice can go into this basket.
 *
 * An empty basket keeps the lock of the lines it used to hold, so a client who
 * emptied a delivery basket and now wants a pick-up needs a fresh one rather
 * than a refusal.
 */
export function needsFreshBasket(
  cart: Pick<Cart, "lines" | "requestFulfillment"> | null,
  choice: RequestFulfilment | null,
): boolean {
  const held = cart?.requestFulfillment;
  if (!cart || !held || !choice || cart.lines.length) return false;
  return !sameFulfilment(held, choice);
}

export function sameFulfilment(left: RequestFulfilment, right: RequestFulfilment): boolean {
  if (left.fulfillmentMode !== right.fulfillmentMode) return false;
  if (left.fulfillmentMode === "pickup") return true;
  return left.dropoff?.lat === right.dropoff?.lat && left.dropoff?.lng === right.dropoff?.lng;
}

/** The two answers, in the words on the step. */
export function fulfilmentTitle(mode: FulfilmentMode): string {
  return mode === "pickup" ? "Pick up" : "Deliver to me";
}

export function fulfilmentBlurb(mode: FulfilmentMode): string {
  return mode === "pickup"
    ? `Collect it at ${GRIDGO_OFFICE_LABEL}. A GRIDGO rider brings it there from the press.`
    : "A GRIDGO rider brings it to your door.";
}

/**
 * One line for a choice already made, read back at the match and checkout:
 * "Delivering to Bajada, Davao City" / "You collect at GRIDGO Office".
 */
export function fulfilmentSummary(choice: RequestFulfilment): string {
  if (choice.fulfillmentMode === "pickup") return `You collect at ${GRIDGO_OFFICE_LABEL}`;
  return choice.dropoff?.label ? `Delivering to ${choice.dropoff.label}` : "Delivering to your address";
}

/** What the match is asked with for a delivery, once the client has given an address. */
export function deliveryChoice(dropoff: OrderPoint): RequestFulfilment {
  return { fulfillmentMode: "delivery", dropoff };
}

/** Pick-up is matched against GRIDGO's hub; the server fills the point in. */
export const PICKUP_CHOICE: RequestFulfilment = { fulfillmentMode: "pickup", dropoff: null };

/**
 * A pick-up match as the client should read it: without distance zones.
 *
 * GRIDGO measures a pick-up from its own hub, so a zone there says how far the
 * press is from GRIDGO Office — something the client neither pays for nor
 * travels. Drawn on a match card it would read as "near you", which it is not.
 */
export function pickupMatchView(match: MatchResult): MatchResult {
  const strip = <T extends { distanceZone?: unknown; distanceKm?: number }>(listing: T): T => {
    const { distanceKm: _km, ...rest } = listing;
    return { ...rest, distanceZone: null } as T;
  };
  return {
    ...match,
    distanceZone: null,
    listings: match.listings.map(strip),
    ...(match.otherListings ? { otherListings: match.otherListings.map(strip) } : {}),
  };
}

/**
 * GRIDGO refused this line because the basket was matched for delivery or
 * pick-up another way (gridgo-api#148): a rule with a way on, never a
 * connection problem.
 */
export function isFulfilmentLockRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const code = (error.body as { error?: unknown } | null)?.error;
  return code === "request_fulfillment_locked" || code === "request_fulfillment_requires_empty_cart";
}

export const FULFILMENT_LOCK_MESSAGE =
  "Your order is already set to travel another way, and everything in one order travels together. " +
  "Check out your order first, then start this one.";
