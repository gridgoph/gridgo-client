/**
 * The checkout sheet's rules and words.
 *
 * How the job travels, when it is wanted, and how it is paid for. Collecting
 * means one place — GRIDGO's own office, see `lib/gridgoOffice.ts` — and never
 * the press that printed it: a rider brings the finished job to the counter the
 * client has been dealing with all along. Everything
 * offered here is something GRIDGO can actually do; anything it cannot is shown
 * as unavailable with the reason, rather than left out. A client who cannot
 * find express delivery assumes the app is broken — one who reads "not open in
 * Davao yet" knows where they stand.
 */

import type { Cart, FulfilmentMode, ServiceLevel } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";

// ---------------------------------------------------------------------------
// How it travels
// ---------------------------------------------------------------------------

/**
 * What the client picks, which is one more choice than the platform has.
 *
 * GRIDGO knows two fulfilment modes: delivery and pickup. Multi-drop is not a
 * third — it is a delivery whose lines carry their own addresses, which is
 * exactly what `PUT /me/carts/:id/dropoffs` writes. Keeping it a separate
 * choice on the sheet is right, because to a client it is a different decision;
 * turning it into `delivery` on the way out is what keeps that honest.
 */
export type TravelChoice = "delivery" | "pickup" | "multi_drop";

export const TRAVEL_CHOICES: readonly TravelChoice[] = [
  "delivery",
  "pickup",
  "multi_drop",
] as const;

export function travelLabel(choice: TravelChoice): string {
  switch (choice) {
    case "delivery":
      return "Delivery";
    case "pickup":
      return "Pickup";
    case "multi_drop":
      return "Multi-drop";
  }
}

export function travelBlurb(choice: TravelChoice): string {
  switch (choice) {
    case "delivery":
      return "A GRIDGO rider brings the whole order to one address.";
    case "pickup":
      return `You collect at ${GRIDGO_OFFICE_LABEL}. No delivery charge.`;
    case "multi_drop":
      return "One print run, split across several addresses.";
  }
}

export function travelCaveat(choice: TravelChoice): string | null {
  switch (choice) {
    case "delivery":
      return null;
    case "pickup":
      return "A GRIDGO rider brings your finished job to the office. Operations tells you when it is there to collect.";
    case "multi_drop":
      return "Each shop is charged for its farthest drop, so delivery is priced per shop rather than per address.";
  }
}

/** What the platform is told. Multi-drop is a delivery with its own addresses. */
export function fulfilmentModeFor(choice: TravelChoice): FulfilmentMode {
  return choice === "pickup" ? "pickup" : "delivery";
}

/**
 * Which choice a basket represents.
 *
 * A delivered basket whose lines carry their own drop-offs is a multi-drop; one
 * that leans on the basket's single address is an ordinary delivery. Read from
 * the cart rather than remembered on the phone, so reopening the sheet shows
 * what GRIDGO actually holds.
 */
export function travelChoiceOf(cart: Cart | null): TravelChoice {
  if (!cart) return "delivery";
  if (cart.fulfillmentMode === "pickup") return "pickup";
  return cart.lines.some((line) => line.dropoff) ? "multi_drop" : "delivery";
}

// ---------------------------------------------------------------------------
// When it is wanted
// ---------------------------------------------------------------------------

/** The two the platform accepts, plus the one it does not. */
export type Timing = ServiceLevel | "express";

export const TIMINGS: readonly Timing[] = ["standard", "scheduled", "express"] as const;

export function timingLabel(timing: Timing): string {
  switch (timing) {
    case "standard":
      return "Standard";
    case "scheduled":
      return "Scheduled";
    case "express":
      return "Express";
  }
}

export function timingBlurb(timing: Timing): string {
  switch (timing) {
    case "standard":
      return "Goes out as soon as it is printed and packed.";
    case "scheduled":
      return "Held until a day and time you choose.";
    case "express":
      return "Not open in Davao yet. GRIDGO will say here when it is.";
  }
}

/** Express is listed and refused: the platform has no service level for it. */
export function isTimingAvailable(timing: Timing): timing is ServiceLevel {
  return timing !== "express";
}

// ---------------------------------------------------------------------------
// Paying
// ---------------------------------------------------------------------------

/**
 * The only way to pay.
 *
 * Checkout accepts `qr_manual` and nothing else. Cash on delivery and Pilot
 * Credits are both retired server-side, so neither is offered anywhere on this
 * sheet — a client who picks one meets a refusal they cannot act on.
 */
export const PAYMENT_CHOICE_LABEL = "QR Ph";

export const PAYMENT_CHOICE_BLURB =
  "Scan with GCash, Maya or your bank app, then send GRIDGO the receipt and its reference number.";

/**
 * What placing the order actually does with the money.
 *
 * The 75% is submitted, never taken: no money moves through GRIDGO, and
 * Operations matches the reference against the GRIDGO wallet by hand. Nothing
 * on this sheet may read as paid.
 */
export const PAYMENT_SPLIT_NOTE =
  "You send 75% now and the rest before delivery. GRIDGO checks your reference against its wallet by hand, so it is confirmed in working hours rather than instantly.";

export const INVOICE_NOTE =
  "GRIDGO issues an invoice with this order, and you can open it from the order the moment it is placed.";

/** Screenshot rules, said before a client picks a file GRIDGO cannot store. */
export const PROOF_ACCEPTED = "JPEG, PNG or WebP";
export const PROOF_MAX_MIB = 15;
export const PROOF_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---------------------------------------------------------------------------
// Placing it
// ---------------------------------------------------------------------------

export type PlaceOrderBlocker =
  | "empty"
  | "artwork"
  | "address"
  | "schedule"
  | "reference"
  | "proof"
  | "settings";

/** Quiet helper on the basket lines. Swipe is not the only remove path. */
export const SWIPE_TO_DELETE_HINT = "Swipe left to delete";

/**
 * What still stands between the basket and a placed order.
 *
 * In the order the client should fix them, so the helper line under the button
 * names one thing at a time rather than a list of everything wrong.
 *
 * Timing is not a checkout question — `app/request/when.tsx` already asked —
 * so a missing Standard/Scheduled picker here is never a blocker. The cart
 * keeps whatever `serviceLevel` / `scheduledFor` it already has.
 */
export function placeOrderBlockers({
  lineCount,
  linesMissingArtwork,
  linesMissingDropoff,
  referenceOk,
  hasProof,
  hasSettings,
}: {
  lineCount: number;
  linesMissingArtwork: number;
  linesMissingDropoff: number;
  scheduledFor?: string | null;
  timing?: Timing;
  referenceOk: boolean;
  hasProof: boolean;
  hasSettings: boolean;
}): PlaceOrderBlocker[] {
  const blockers: PlaceOrderBlocker[] = [];
  if (lineCount === 0) blockers.push("empty");
  if (linesMissingArtwork > 0) blockers.push("artwork");
  if (linesMissingDropoff > 0) blockers.push("address");
  if (!hasProof) blockers.push("proof");
  if (!referenceOk) blockers.push("reference");
  if (!hasSettings) blockers.push("settings");
  return blockers;
}

export function blockerLine(blocker: PlaceOrderBlocker, detail?: string): string {
  switch (blocker) {
    case "empty":
      return "Add something to print first.";
    case "artwork":
      return detail
        ? `Attach artwork to ${detail} before you place this.`
        : "Attach artwork to every item before you place this.";
    case "address":
      return "Set a delivery address for every item.";
    case "schedule":
      return "Pick the day and time you want it.";
    case "proof":
      return "Add the screenshot of your QR payment.";
    case "reference":
      return "Enter the reference number from your payment receipt.";
    case "settings":
      return "GRIDGO could not read its current charges. Try again in a moment.";
  }
}
