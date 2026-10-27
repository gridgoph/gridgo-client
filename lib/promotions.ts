/**
 * The two launch promotions (gridgo-api `docs/VOUCHERS_API.md#launch-promotions`):
 * the Founding 30 and the Friend Pass.
 *
 * Pure. The sheet, the Vouchers screen and Account read every rule and every
 * word from here. Amounts, slots and end dates are GRIDGO's, from
 * `GET /me/promotions`, and never written into the app: Operations can change
 * them, and a client must read today's figure.
 *
 * One launch discount per person, ever: a client who holds a Founding voucher
 * or a Friend Pass is never offered either again, and a used or expired one
 * does not earn another.
 */

import { ApiError, formatPhp, type PromotionInvite, type Promotions, type Voucher } from "@/lib/api";
import { SURVEY_REWARD_MINOR } from "@/lib/survey";
import { stubAmount, VOUCHER_LABEL, VOUCHER_TIME_ZONE } from "@/lib/vouchers";

/** What the claim sheet and the Redeem card offer, or nothing. */
export type ClaimOffer =
  | { kind: "founding"; amountMinor: number; slotsLeft: number; endsAt: string }
  | { kind: "friend_pass"; amountMinor: number; endsAt: string; founderName: string | null };

export type ClaimKind = ClaimOffer["kind"];

/** The client's own launch voucher, whichever kind. */
export function launchVoucherOf(promotions: Promotions | null | undefined): Voucher | null {
  return promotions?.founding.voucher ?? promotions?.friendPass.voucher ?? null;
}

/**
 * What this client can claim now. GRIDGO decides (`claimable`, `offer`); this
 * only picks which to put first. The Founding voucher wins when both are open,
 * because it is the larger one and a friend who is already a Founder uses
 * that — GRIDGO then frees the invite so the Founder can name someone else.
 */
export function claimOffer(promotions: Promotions | null | undefined): ClaimOffer | null {
  if (!promotions || launchVoucherOf(promotions)) return null;
  const { founding, friendPass } = promotions;
  if (founding.claimable && founding.slotsLeft > 0) {
    return { kind: "founding", amountMinor: founding.amountMinor, slotsLeft: founding.slotsLeft, endsAt: founding.endsAt };
  }
  const offer = friendPass.offer;
  if (offer) {
    return {
      kind: "friend_pass",
      amountMinor: offer.amountMinor,
      endsAt: offer.endsAt,
      founderName: offer.founder?.name?.trim() || null,
    };
  }
  return null;
}

/** "Sun, 8 Nov" — the last day, in Davao time. */
export function endDay(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: VOUCHER_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}

/** "12 left", "Last one left". Never a total the client cannot check. */
export function slotsLine(slotsLeft: number): string {
  return slotsLeft === 1 ? "Last one left" : `${slotsLeft} left`;
}

export type ClaimCopy = {
  /** The sheet's title and the card's headline. */
  title: string;
  /** Under the stub: what it is. */
  name: string;
  body: string;
  action: string;
  /** "₱200" — the stub's big figure. */
  stub: string;
};

export function claimCopy(offer: ClaimOffer): ClaimCopy {
  const stub = stubAmount(offer.amountMinor);
  if (offer.kind === "founding") {
    return {
      title: `${stub} off your first order`,
      name: "Founding 30",
      body: `For GRIDGO's first clients. It comes off your whole order, printing and delivery together, once. Use it by ${endDay(offer.endsAt)}.`,
      action: `Redeem ${stub} off`,
      stub,
    };
  }
  return {
    title: offer.founderName ? `${offer.founderName} invited you` : "A friend invited you",
    name: "Friend Pass",
    body: `${stub} off your first order, from GRIDGO. It comes off your whole order, printing and delivery together, once. Use it by ${endDay(offer.endsAt)}.`,
    action: `Claim ${stub} off`,
    stub,
  };
}

/** The rule said once, beside every claim. */
export const ONE_DISCOUNT_RULE = "One launch discount per person: Founding 30 or Friend Pass, never both.";

/** Account's Vouchers row while something is waiting to be claimed. */
export function claimRowLine(offer: ClaimOffer): string {
  const stub = stubAmount(offer.amountMinor);
  return offer.kind === "founding"
    ? `Redeem ${stub} off your first order · ${slotsLine(offer.slotsLeft)}`
    : `A friend invited you: claim ${stub} off your first order`;
}

/* --------------------------------------------------------------------------
   Invite a friend
   -------------------------------------------------------------------------- */

export type InviteView =
  /** Not a Founder: no invite card. */
  | { kind: "none" }
  /** A Founder who can name a friend. `skipped` is a friend who turned out to be a Founder already. */
  | { kind: "form"; skipped: PromotionInvite | null }
  /** The friend they named, and how far it has got. */
  | { kind: "status"; invite: PromotionInvite; canInviteMore: boolean }
  /** A Founder who cannot invite now (the passes are gone, or the offer ended). */
  | { kind: "closed" };

export function inviteView(promotions: Promotions | null | undefined): InviteView {
  if (!promotions?.founding.voucher) return { kind: "none" };
  const { canInvite, invite } = promotions.friendPass;
  const invites = promotions.friendPass.invites ?? (invite ? [invite] : []);
  const live = invites.filter((row) => row.status !== "skipped_already_founder");
  const skipped = [...invites].reverse().find((row) => row.status === "skipped_already_founder") ?? null;
  const current = live.at(-1) ?? null;
  if (current) return { kind: "status", invite: current, canInviteMore: canInvite };
  if (canInvite) return { kind: "form", skipped };
  return { kind: "closed" };
}

export type InviteStage = "invited" | "claimed" | "used" | "ended" | "withdrawn";

/** Where the friend's pass stands, in words. Never colour alone. */
export function inviteStatus(invite: PromotionInvite): { stage: InviteStage; label: string; line: string } {
  const email = invite.friendEmail ?? invite.email;
  switch (invite.status) {
    case "claimed":
      return { stage: "claimed", label: "Claimed", line: `${email} claimed their Friend Pass.` };
    case "used":
      return { stage: "used", label: "Used", line: `${email} used their Friend Pass on an order.` };
    case "expired":
      return { stage: "ended", label: "Ended", line: `The Friend Pass for ${email} ended before it was used.` };
    case "void":
      return { stage: "withdrawn", label: "Withdrawn", line: `GRIDGO withdrew the Friend Pass for ${email}.` };
    default:
      if (invite.unmatchedReason === "account_already_attributed") {
        return {
          stage: "ended",
          label: "Already invited",
          line: `${email} was already invited by another Founder, so this Friend Pass cannot reach them.`,
        };
      }
      return {
        stage: "invited",
        label: "Invited",
        line: `Waiting for ${email}. They see it when they sign in to GRIDGO with that email.`,
      };
  }
}

/** Said when the friend already held a Founding voucher, so the Founder can name another. */
export function skippedLine(invite: PromotionInvite): string {
  const email = invite.friendEmail ?? invite.email;
  return `${email} already has a Founding voucher of their own, so your invite is free again. You can name someone else.`;
}

/** A light check before GRIDGO's own, so a typo is caught without a round trip. */
export function emailProblem(email: string): string | null {
  const value = email.trim();
  if (!value) return "Type your friend's email first.";
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Check the email address and try again.";
  return null;
}

/* --------------------------------------------------------------------------
   Checkout
   -------------------------------------------------------------------------- */

/** The order summary's one discount line: the launch voucher's own name, or "Voucher". */
export function discountLineLabel(voucher: Pick<Voucher, "name" | "promotionKind"> | null | undefined): string {
  if (!voucher?.promotionKind) return VOUCHER_LABEL;
  return voucher.name?.trim() || (voucher.promotionKind === "founding" ? "Founding 30" : "Friend Pass");
}

/* --------------------------------------------------------------------------
   Rewards shown before they are issued
   -------------------------------------------------------------------------- */

/** Today's survey reward, as GRIDGO set it; the default until promotions are read. */
export function surveyRewardAmount(promotions: Promotions | null | undefined): number {
  const minor = promotions?.rewards?.surveyMinor;
  return typeof minor === "number" && Number.isFinite(minor) && minor > 0 ? minor : SURVEY_REWARD_MINOR;
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

export type PromotionAction = "claim" | "invite";

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

/** Every refusal the promotion routes give, in words a client can act on. */
export function promotionErrorMessage(error: unknown, action: PromotionAction, fallback: string): string {
  switch (errorCode(error)) {
    case "promotion_sold_out":
      return action === "invite"
        ? "Every Friend Pass has been given out, so GRIDGO cannot send another invite."
        : "Every Founding voucher has been claimed.";
    case "promotion_ended":
      return "The launch offer has ended.";
    case "promotion_not_started":
      return "The launch offer has not started yet. Check again soon.";
    case "promotion_disabled":
      return "GRIDGO has paused this offer for now.";
    case "promotion_budget_reached":
      return "GRIDGO has given out every launch discount it set aside, so this offer is closed.";
    case "promotion_already_has_discount":
      return action === "invite"
        ? "That friend already has a launch discount. Name someone else."
        : `You already have a launch discount. ${ONE_DISCOUNT_RULE}`;
    case "promotion_not_founder":
      return "Only a Founding 30 holder can invite a friend.";
    case "promotion_invite_used":
      return "You have already used your invite.";
    case "promotion_self_invite":
      return "That is your own email. Type your friend's instead.";
    case "promotion_email_already_invited":
      return "Someone has already invited that email. Name another friend.";
    case "promotion_offer_unavailable":
      return "This Friend Pass is no longer waiting for you.";
    case "promotion_ineligible_account":
      return "Launch offers are for client accounts. Staff and test accounts cannot claim or send them.";
    case "invalid_promotion_email":
      return "Check the email address and try again.";
    default:
      return fallback;
  }
}

/** "₱200.00 Founding 30 voucher added." */
export function claimedLine(voucher: Voucher | null, kind: ClaimKind): string {
  const name = kind === "founding" ? "Founding 30" : "Friend Pass";
  const what = voucher ? `${formatPhp(voucher.valueMinor)} ${name} voucher` : `${name} voucher`;
  return `${what} added. GRIDGO takes it off your next order by itself.`;
}
