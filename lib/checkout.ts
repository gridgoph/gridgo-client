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

import type { Cart, CartLineRecord, FulfilmentMode, ServiceLevel } from "@/lib/api";
import {
  checkKey,
  currentProblem,
  lineArtworkLinks,
  linkVerdict,
  type ArtworkProblem,
  type LinkCheckState,
} from "@/lib/designLink";
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

/**
 * The choices drawn on checkout. Multi-drop is not offered on a new basket, so
 * it is not drawn as an alternative to read and reject (ux-findings-1030 #7);
 * only a basket GRIDGO already holds as a multi-drop keeps showing it, so its
 * saved state stays visible. Pick-up follows the platform's hub switch.
 */
export function offeredTravelChoices(
  current: TravelChoice,
  pickupEnabled: boolean,
): TravelChoice[] {
  return TRAVEL_CHOICES.filter((choice) =>
    choice === "pickup" ? pickupEnabled : choice === "multi_drop" ? current === "multi_drop" : true,
  );
}

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
 * Checkout's one payment instruction, over the evidence fields. Everything
 * else about paying — which wallets, no cash, the plan — sits folded under
 * `PAYMENT_DETAILS_TITLE`, because the same model said four times pushed the
 * screenshot and reference below the fold (ux-findings-1030 #4).
 */
export const CHECKOUT_PAY_INSTRUCTION =
  "Scan the QR and pay the amount shown. Then add your wallet screenshot and its reference number, and GRIDGO confirms it by hand in working hours.";

export const PAYMENT_DETAILS_TITLE = "About paying by QR";

/** Said while folded, so the one hard rule is read before anyone opens it. */
export const PAYMENT_DETAILS_SUMMARY = "GCash, Maya or a bank e-wallet. No cash on delivery.";

/*
 * What placing the order does with the money is `paymentPlanNote` in
 * `lib/payment.ts`: the up-front share comes from `GET /settings`, so the
 * note cannot be a constant here.
 */

/**
 * What the receipt lists. It names the service fee only when Operations shows
 * the fee to clients (`serviceFeeVisibleToClient`); otherwise the fee is inside
 * Printing and the note says nothing of it.
 */
export function invoiceNote(showServiceFee: boolean): string {
  const lists = showServiceFee
    ? "printing, delivery, the service fee and your payment reference"
    : "printing, delivery, the total and your payment reference";
  return `GRIDGO issues a receipt with this order. You can open it the moment it is placed — ${lists}.`;
}

/** Screenshot rules, said before a client picks a file GRIDGO cannot store. */
export const PROOF_ACCEPTED = "JPEG, PNG or WebP";
export const PROOF_MAX_MIB = 15;
export const PROOF_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---------------------------------------------------------------------------
// Placing it
// ---------------------------------------------------------------------------

export type PlaceOrderBlocker =
  | "empty"
  | "shop_closed"
  | "price"
  | "artwork"
  | "artwork_checking"
  | "artwork_problem"
  | "layout"
  | "colour"
  | "colour_price_check"
  | "cover_spine"
  | "address"
  | "date"
  | "schedule"
  | "reference"
  | "proof"
  | "rights"
  | "approval"
  | "approval_signature"
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
  linesShopClosed = 0,
  linesUnpriced = 0,
  linesMissingArtwork,
  linesCheckingArtwork = 0,
  linesArtworkProblem = 0,
  linesMissingLayout = 0,
  linesColourUnready = 0,
  linesColourPriceCheck = 0,
  linesMissingCoverSpine = 0,
  linesMissingDropoff,
  missingBasketDate = false,
  referenceOk,
  hasProof,
  hasSettings,
  rightsAgreed = true,
  approval = "given",
}: {
  lineCount: number;
  /**
   * Lines from a shop closed for now (gridgo-api#219). GRIDGO refuses the
   * whole checkout with `shop_unavailable`, and no payment fixes that — only
   * removing them does, so it leads.
   */
  linesShopClosed?: number;
  /** Lines GRIDGO answered with no price — checkout would refuse them too. */
  linesUnpriced?: number;
  linesMissingArtwork: number;
  /** Lines whose design link GRIDGO is still checking. */
  linesCheckingArtwork?: number;
  /**
   * Lines whose artwork would be refused: a link that is private or could not
   * be confirmed, or a file or link checkout already turned down
   * (gridgo-api#122). Never a warning — checkout refuses them.
   */
  linesArtworkProblem?: number;
  /**
   * Lines whose product asks how the file sits on the paper, with no layout
   * chosen (gridgo-api `docs/PRINT_LAYOUT_API.md`). GRIDGO refuses them with
   * `print_layout_required`; the cut-off and scale warnings never block.
   */
  linesMissingLayout?: number;
  /**
   * Lines priced by colour whose pages are not all priced yet — still being
   * measured, waiting on copies or sets, or a file GRIDGO cannot measure
   * (gridgo-api `docs/COLOUR_PRICING_API.md`). Checkout refuses them with
   * `colour_analysis_required`.
   */
  linesColourUnready?: number;
  /**
   * Lines with a page in a colour level the shop has not priced. Checkout
   * refuses them with `colour_price_check_required` until the shop prices it.
   */
  linesColourPriceCheck?: number;
  /**
   * Hardbound lines with no cover and spine while GRIDGO requires them
   * (`coverSpineRequired`, gridgo-api `docs/HARDBOUND_COVER_API.md`). While
   * the switch is off a missing form never blocks.
   */
  linesMissingCoverSpine?: number;
  linesMissingDropoff: number;
  /**
   * A basket that goes out in more than one group has a product with no date.
   * Each group is printed and delivered for its own date, so GRIDGO refuses
   * the checkout without one on every line (gridgo-client#189).
   */
  missingBasketDate?: boolean;
  scheduledFor?: string | null;
  timing?: Timing;
  referenceOk: boolean;
  hasProof: boolean;
  hasSettings: boolean;
  /** The per-order artwork rights box (`docs/LEGAL_API.md`). */
  rightsAgreed?: boolean;
  /**
   * The client's approval of the basket (gridgo-client#248): `given` once
   * they tapped or signed for exactly this version, else what is still asked.
   * An API that names no approval method asks nothing.
   */
  approval?: "given" | "one_tap" | "drawn";
}): PlaceOrderBlocker[] {
  const blockers: PlaceOrderBlocker[] = [];
  if (lineCount === 0) blockers.push("empty");
  if (linesShopClosed > 0) blockers.push("shop_closed");
  if (linesUnpriced > 0) blockers.push("price");
  if (linesMissingArtwork > 0) blockers.push("artwork");
  if (linesArtworkProblem > 0) blockers.push("artwork_problem");
  if (linesMissingLayout > 0) blockers.push("layout");
  if (linesColourUnready > 0) blockers.push("colour");
  if (linesColourPriceCheck > 0) blockers.push("colour_price_check");
  if (linesMissingCoverSpine > 0) blockers.push("cover_spine");
  if (linesCheckingArtwork > 0) blockers.push("artwork_checking");
  if (linesMissingDropoff > 0) blockers.push("address");
  if (missingBasketDate) blockers.push("date");
  if (!hasProof) blockers.push("proof");
  if (!referenceOk) blockers.push("reference");
  if (!rightsAgreed) blockers.push("rights");
  if (approval === "one_tap") blockers.push("approval");
  if (approval === "drawn") blockers.push("approval_signature");
  if (!hasSettings) blockers.push("settings");
  return blockers;
}

export function blockerLine(blocker: PlaceOrderBlocker, detail?: string): string {
  switch (blocker) {
    case "empty":
      return "Add something to print first.";
    case "shop_closed":
      return detail
        ? `${detail} is from a shop that is closed for now. Remove it to place your order.`
        : "Some items are from a shop that is closed for now. Remove them to place your order.";
    case "price":
      return detail
        ? `${detail} has no price at this quantity. Open it and change the quantity.`
        : "One item has no price at this quantity. Open it and change the quantity.";
    case "artwork":
      return detail
        ? `Attach artwork to ${detail} before you place this.`
        : "Attach artwork to every item before you place this.";
    case "artwork_problem":
      return detail
        ? `GRIDGO cannot use the artwork on ${detail}. Open its Artwork to fix it.`
        : "GRIDGO cannot use the artwork on some items. Open their Artwork to fix it.";
    case "layout":
      return detail
        ? `Choose how ${detail} sits on the paper. Open its Artwork to choose.`
        : "Choose how each file sits on the paper. Open its Artwork to choose.";
    case "colour":
      return detail
        ? `GRIDGO has not finished pricing ${detail} by colour. Open its Artwork to see each page.`
        : "GRIDGO has not finished pricing every page by colour. Open each item's Artwork to see why.";
    case "colour_price_check":
      return detail
        ? `A page of ${detail} needs a price check. Operations is checking it with the shop, and you can place the order once it is priced.`
        : "Some pages need a price check. Operations is checking them with the shop, and you can place the order once they are priced.";
    case "cover_spine":
      return detail
        ? `Add the cover and spine for ${detail}. Open its Artwork to fill them in.`
        : "Add the cover and spine for each book. Open its Artwork to fill them in.";
    case "artwork_checking":
      return "Checking your design link…";
    case "address":
      return "Set a delivery address for every item.";
    case "date":
      return detail
        ? `Choose a date for ${detail}.`
        : "Choose a date for every item. Your order goes out in parts, each on its own date.";
    case "schedule":
      return "Pick the day and time you want it.";
    case "proof":
      return "Add the screenshot of your QR payment.";
    case "reference":
      return "Enter the reference number from your payment receipt.";
    case "rights":
      return "Tick the box to say you have the right to print this artwork.";
    case "approval":
      return "Tick \"I approve this order\" at the end of this page.";
    case "approval_signature":
      return "Sign to approve your order at the end of this page.";
    case "settings":
      return "GRIDGO could not read its current charges. Try again in a moment.";
  }
}

// ---------------------------------------------------------------------------
// When checkout turns the artwork down
// ---------------------------------------------------------------------------

/** The artwork refusals checkout can answer with (gridgo-api#122). */
export const ARTWORK_CHECKOUT_CODES = [
  "artwork_link_check_failed",
  "artwork_file_check_failed",
  "document_page_count_required",
  "artwork_required",
  "artwork_check_required",
  "artwork_file_format_not_accepted",
] as const;

export type ArtworkRefusal = {
  code: (typeof ARTWORK_CHECKOUT_CODES)[number];
  lineId: string | null;
  /** GRIDGO's own words when it sent some; it names the fix. */
  message: string;
};

/** Our words for each refusal, for an answer that came without a message. */
function artworkRefusalFallback(code: ArtworkRefusal["code"]): string {
  switch (code) {
    case "artwork_link_check_failed":
      return "GRIDGO could not open your design link. Set sharing to Anyone with the link, or remove the link and upload the file.";
    case "artwork_file_check_failed":
      return "GRIDGO could not read your file. Export it again and upload the new file.";
    case "document_page_count_required":
      return "Upload a document with a readable page count. If needed, export it as a PDF and upload it again.";
    case "artwork_required":
      return "Upload the artwork or add a design link anyone can view.";
    case "artwork_check_required":
      return "Your artwork changed while GRIDGO was checking it. Place the order again.";
    case "artwork_file_format_not_accepted":
      return "This item does not take that type of file. Upload the artwork in one of the formats it lists.";
  }
}

/** Reads a checkout refusal about artwork, or null for any other answer. */
export function artworkRefusalOf(body: unknown): ArtworkRefusal | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { error?: unknown; lineId?: unknown; message?: unknown };
  const code = ARTWORK_CHECKOUT_CODES.find((candidate) => candidate === record.error);
  if (!code) return null;
  const message = typeof record.message === "string" && record.message.trim() ? record.message.trim() : null;
  return {
    code,
    lineId: typeof record.lineId === "string" ? record.lineId : null,
    message: message ?? artworkRefusalFallback(code),
  };
}

/**
 * What the client is told once the order is placed: the file goes to GRIDGO
 * first, and the shop hears of the job only after it passes.
 */
export const FILE_CHECK_AFTER_PAYMENT =
  "Your file is with GRIDGO for a quick check before the shop starts. We'll tell you if anything needs fixing.";

/** Where one basket line's artwork stands with GRIDGO's check, when it is not simply fine. */
export type LineArtworkStatus = { kind: "checking" | "problem"; text: string };

/**
 * A line's artwork, read against this session's link checks and anything
 * checkout already refused. A refusal outranks a check: it is the newer word.
 */
export function lineArtworkStatus(
  line: Pick<CartLineRecord, "id" | "artworkFileId" | "artworkLinks">,
  checks: Record<string, LinkCheckState>,
  problems: Record<string, ArtworkProblem>,
): LineArtworkStatus | null {
  const refused = currentProblem(problems, line);
  if (refused) return { kind: "problem", text: refused.message };
  for (const link of lineArtworkLinks(line)) {
    const state = checks[checkKey(link)];
    if (state?.phase === "checking") return { kind: "checking", text: "Checking the design link…" };
    const verdict = linkVerdict(state);
    if (verdict?.blocks) return { kind: "problem", text: `${verdict.title}. Open Artwork to fix it.` };
  }
  return null;
}
