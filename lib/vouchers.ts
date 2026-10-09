/**
 * GRIDGO-funded vouchers (gridgo-api#204, report 63AFAA4A; contract:
 * gridgo-api `docs/VOUCHERS_API.md`).
 *
 * Pure. The screens read every rule and every word from here.
 *
 * Money rules that hold wherever a voucher is drawn:
 *
 * - GRIDGO works the discount out. The quote, the order and the invoice carry
 *   `voucherDiscountMinor` already out of the total; it is drawn as its own
 *   line, never subtracted again — the same rule as the organization discount.
 * - The line says "Voucher" and a peso amount, nothing about where inside
 *   GRIDGO's charges it comes from. GRIDGO's fee in pesos is on no client
 *   screen, and with Operations' `serviceFeeVisibleToClient` off no fee
 *   wording is either.
 * - A voucher and the organization discount never stack. GRIDGO applies the
 *   larger; this module says which, so a client is never left wondering where
 *   the other one went.
 */

import { ApiError, formatPhp, type CartQuote, type Voucher, type VoucherList } from "@/lib/api";

export const VOUCHER_LABEL = "Voucher";
/** One voucher over a multi-shop basket, as GRIDGO splits it across the groups. */
export const VOUCHER_SHARE_LABEL = "Voucher share";
export const VOUCHERS_ROUTE = "/vouchers";
export const VOUCHER_TIME_ZONE = "Asia/Manila";

/** The rules a client needs once, worded for them. */
export const VOUCHER_TERMS =
  "Paid for by GRIDGO. One per order. It cannot be swapped for cash or given to someone else.";

/* --------------------------------------------------------------------------
   Time: the server's clock, ticking on the phone
   -------------------------------------------------------------------------- */

/**
 * How far the phone's clock is from GRIDGO's, from one read. A phone set five
 * minutes fast must not show a voucher as expired that GRIDGO still honours.
 */
export function clockOffsetMs(serverTime: string | null | undefined, phoneNow: number = Date.now()): number {
  const server = serverTime ? Date.parse(serverTime) : Number.NaN;
  return Number.isFinite(server) ? server - phoneNow : 0;
}

/** Milliseconds until `expiresAt` on GRIDGO's clock; never negative. */
export function msLeft(expiresAt: string, serverNow: number): number {
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) ? Math.max(0, end - serverNow) : 0;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type ExpiryTone = "calm" | "soon" | "urgent" | "over";

/** Amber under 48 hours, red under 24 — the issue's own thresholds. */
export function expiryTone(remainingMs: number): ExpiryTone {
  if (remainingMs <= 0) return "over";
  if (remainingMs < DAY) return "urgent";
  if (remainingMs < 2 * DAY) return "soon";
  return "calm";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The countdown in words, coarse where a coarse figure is honest and finer as
 * the end nears: "5 days left", "1 day 6 h left", "9 h 59 min left",
 * "4 min 10 s left". Always words with the colour, never colour alone.
 */
export function countdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days >= 2) return `${plural(days, "day")} left`;
  if (days === 1) return hours ? `1 day ${hours} h left` : "1 day left";
  if (hours >= 1) return `${hours} h ${minutes} min left`;
  if (minutes >= 1) return `${minutes} min ${seconds} s left`;
  return `${seconds} s left`;
}

/** How often the countdown needs to redraw to stay true. */
export function countdownTickMs(remainingMs: number): number {
  return remainingMs > 0 && remainingMs < HOUR ? 1000 : 30_000;
}

/** "Fri, 16 Oct, 4:00 PM" — the exact moment, in Davao time. */
export function exactTime(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "—";
  // Assembled from parts: engines disagree on the order of day and month.
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: VOUCHER_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")}, ${shortTime(iso)}`;
}

/** "4:00 PM" in Davao time. */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: VOUCHER_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------------------------
   The wallet
   -------------------------------------------------------------------------- */

export type WalletTab = "available" | "used" | "expired";
export const WALLET_TABS: readonly WalletTab[] = ["available", "used", "expired"];
export const WALLET_TAB_LABEL: Record<WalletTab, string> = {
  available: "Available",
  used: "Used",
  expired: "Expired",
};

/**
 * Which tab a wallet item belongs on, on the clock as it stands now — an
 * available voucher whose moment passes while the screen is open moves to
 * Expired without a reload. Void sits under Expired, as GRIDGO files it.
 */
export function walletTabOf(voucher: Pick<Voucher, "status" | "expiresAt">, serverNow: number): WalletTab {
  if (voucher.status === "used") return "used";
  if (voucher.status === "available") return msLeft(voucher.expiresAt, serverNow) > 0 ? "available" : "expired";
  return "expired";
}

/** One tab's vouchers: soonest to expire first on Available, newest first elsewhere. */
export function walletTab(vouchers: readonly Voucher[], tab: WalletTab, serverNow: number): Voucher[] {
  const list = vouchers.filter((voucher) => walletTabOf(voucher, serverNow) === tab);
  return list.sort((a, b) =>
    tab === "available"
      ? Date.parse(a.expiresAt) - Date.parse(b.expiresAt)
      : Date.parse(b.expiresAt) - Date.parse(a.expiresAt),
  );
}

export type VoucherState =
  /** Ready to use. */
  | { kind: "ready" }
  /** Held for an order: on this basket, or one already placed. */
  | { kind: "held"; onThisBasket: boolean; until: string }
  /** GRIDGO paused the offer; the voucher is kept but cannot be used now. */
  | { kind: "paused" }
  | { kind: "used" }
  | { kind: "expired" }
  | { kind: "void" };

export function voucherState(voucher: Voucher, serverNow: number, cartId: string | null = null): VoucherState {
  const tab = walletTabOf(voucher, serverNow);
  if (tab === "used") return { kind: "used" };
  if (tab === "expired") return voucher.status === "void" ? { kind: "void" } : { kind: "expired" };
  if (voucher.reservation) {
    return {
      kind: "held",
      onThisBasket: Boolean(cartId) && voucher.reservation.cartId === cartId,
      until: voucher.reservation.expiresAt,
    };
  }
  return voucher.redeemable ? { kind: "ready" } : { kind: "paused" };
}

/** The one line under a voucher that says where it stands, when the tone alone cannot. */
export function voucherStateLine(state: VoucherState, voucher: Voucher): string | null {
  switch (state.kind) {
    case "held":
      return state.onThisBasket
        ? `Held for your current order until ${shortTime(state.until)}. Place the order before then.`
        : "Held for an order. It is used once GRIDGO confirms the payment, and comes back here if that order does not go through.";
    case "paused":
      return "GRIDGO has paused this offer. It stays in your wallet, but it cannot be used right now.";
    case "used":
      return "Used on an order.";
    case "expired":
      return `Expired ${exactTime(voucher.expiresAt)}.`;
    case "void":
      return "Withdrawn by GRIDGO.";
    default:
      return null;
  }
}

/** What a wallet item is called: its offer's name, or plainly what it is. */
export function voucherTitle(voucher: Pick<Voucher, "name" | "valueMinor">): string {
  return voucher.name?.trim() || `${formatPhp(voucher.valueMinor)} voucher`;
}

/** "₱15" for a whole amount, "₱12.50" otherwise — the stub's big figure. */
export function stubAmount(minor: number): string {
  return minor % 100 === 0 ? `₱${(minor / 100).toLocaleString("en-PH")}` : formatPhp(minor);
}

/** Account's line for the wallet row. */
export function walletSummary(list: VoucherList | null, serverNow: number): string {
  const ready = list ? walletTab(list.vouchers, "available", serverNow) : [];
  if (!ready.length) return "Add a voucher code, or see the ones you have used";
  const first = ready[0];
  const count = ready.length === 1 ? `${formatPhp(first.valueMinor)} voucher` : `${ready.length} vouchers`;
  return `${count} · the next expires ${exactTime(first.expiresAt)}`;
}

/** How many wallet items can be used now, for a count beside the row. */
export function readyCount(list: VoucherList | null, serverNow: number): number {
  if (!list) return 0;
  return walletTab(list.vouchers, "available", serverNow).filter((voucher) => voucher.redeemable).length;
}

/* --------------------------------------------------------------------------
   Codes
   -------------------------------------------------------------------------- */

/** A code as GRIDGO compares it: trimmed and upper case. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Letters, digits and hyphens, 4 to 40 — GRIDGO's own rule, checked before a wrong guess is counted. */
export function codeShapeProblem(code: string): string | null {
  const normalized = normalizeCode(code);
  if (!normalized) return "Type the code first.";
  if (!/^[A-Z0-9-]{4,40}$/.test(normalized)) {
    return "A voucher code is 4 to 40 letters, numbers or hyphens. Check it and try again.";
  }
  return null;
}

export type CodeOutcome =
  | { ok: true; message: string; voucher: Voucher; usable: boolean }
  | { ok: false; message: string; lockedUntil: string | null };

/**
 * What adding a code came to, in words. Claiming is idempotent: a code whose
 * voucher is already in the wallet answers with that voucher, used or expired
 * as it may be, and the client is told so rather than "added".
 */
export function codeAdded(result: { voucher: Voucher; issued: boolean }, serverNow: number): CodeOutcome {
  const { voucher, issued } = result;
  const amount = formatPhp(voucher.valueMinor);
  const tab = walletTabOf(voucher, serverNow);
  if (tab === "used") {
    return { ok: true, usable: false, voucher, message: "You have already used the voucher from this code." };
  }
  if (tab === "expired") {
    return {
      ok: true,
      usable: false,
      voucher,
      message:
        voucher.status === "void"
          ? "GRIDGO withdrew the voucher from this code."
          : `The voucher from this code expired ${exactTime(voucher.expiresAt)}.`,
    };
  }
  return {
    ok: true,
    usable: true,
    voucher,
    message: issued
      ? `${amount} voucher added. Use it before ${exactTime(voucher.expiresAt)}.`
      : `This ${amount} voucher is already in your wallet.`,
  };
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

/** When a locked code entry opens again, from a `429 voucher_code_locked`. */
export function lockedUntilOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || errorCode(error) !== "voucher_code_locked") return null;
  const retryAt = (error.body as { retryAt?: unknown }).retryAt;
  return typeof retryAt === "string" && Number.isFinite(Date.parse(retryAt)) ? retryAt : null;
}

/**
 * Every refusal a code or a voucher can meet, in plain words. Never a code
 * name: "voucher_code_invalid" is not something a client can act on.
 */
export function voucherErrorMessage(error: unknown, fallback: string): string {
  switch (errorCode(error)) {
    case "voucher_code_invalid":
      return "GRIDGO does not recognise that code. Check each letter and try again. Codes that have ended stop working too.";
    case "voucher_code_locked": {
      const until = lockedUntilOf(error);
      return until
        ? `Too many codes that did not work. You can try again at ${shortTime(until)}.`
        : "Too many codes that did not work. Wait 15 minutes, then try again.";
    }
    case "voucher_campaign_unavailable":
      return "This offer has ended, so its code no longer works.";
    case "voucher_campaign_cap_reached":
      return "Every voucher from this code has been claimed.";
    case "voucher_unavailable":
    case "voucher_expired_or_unavailable":
      return "This voucher cannot be used on this order. It may have expired, or it is held for another order.";
    case "voucher_already_checked_out":
      return "This voucher is already on an order you placed. It is used once GRIDGO confirms that payment.";
    case "voucher_not_better_than_organization":
      return "Your organization discount saves as much or more on this order, so it stays. The voucher stays in your wallet.";
    case "cart_checked_out":
    case "cart_not_found":
      return "This order has already been placed. Start a new order to use a voucher.";
    default:
      return fallback;
  }
}

/* --------------------------------------------------------------------------
   Checkout
   -------------------------------------------------------------------------- */

export type CheckoutVoucherView =
  /** GRIDGO has no total yet, so nothing can come off it. */
  | { kind: "waiting"; candidates: Voucher[] }
  /** A voucher is on this order. */
  | {
      kind: "applied";
      voucher: Voucher;
      /** What actually comes off — can be less than the face value. */
      amountMinor: number;
      /** Held (POST apply) rather than previewed (GRIDGO's automatic pick). */
      heldUntil: string | null;
      /** True when the client is an organization and the voucher won. */
      replacedOrganization: boolean;
      /** Others the client could switch to. */
      others: Voucher[];
    }
  /** The organization discount is larger (or equal) and stays. */
  | { kind: "organization"; candidates: Voucher[] }
  /** Several could apply and GRIDGO does not pick between them. */
  | { kind: "choose"; candidates: Voucher[]; removed: boolean }
  /** Nothing in the wallet fits; the code field is the way in. */
  | { kind: "none" };

/**
 * Wallet vouchers that could go on this basket: available, unexpired, and
 * either free or already held for this very basket.
 */
export function checkoutCandidates(
  wallet: readonly Voucher[] | null,
  cartId: string | null,
  serverNow: number,
): Voucher[] {
  if (!wallet) return [];
  return walletTab([...wallet], "available", serverNow).filter((voucher) =>
    voucher.reservation ? Boolean(cartId) && voucher.reservation.cartId === cartId : voucher.redeemable,
  );
}

export function checkoutVoucherView({
  quote,
  candidates,
  isOrganization,
  removed,
}: {
  quote: CartQuote | null | undefined;
  candidates: Voucher[];
  isOrganization: boolean;
  /** The client took the voucher off this basket in this session. */
  removed: boolean;
}): CheckoutVoucherView {
  const applied = quote?.voucher ?? null;
  const amountMinor = quote?.voucherDiscountMinor ?? 0;
  if (applied && amountMinor > 0) {
    return {
      kind: "applied",
      voucher: applied,
      amountMinor,
      heldUntil: applied.reservation?.expiresAt ?? null,
      replacedOrganization: isOrganization,
      others: candidates.filter((voucher) => voucher.id !== applied.id),
    };
  }
  if (!candidates.length) return { kind: "none" };
  if (!quote || quote.totalMinor == null) return { kind: "waiting", candidates };
  if (quote.discountKind === "organization" && (quote.organizationDiscountMinor ?? 0) > 0 && !removed) {
    return { kind: "organization", candidates };
  }
  return { kind: "choose", candidates, removed };
}

/**
 * The note under an applied voucher. A voucher only ever comes off GRIDGO's
 * own charges, so on a small order less than its face value may apply — and
 * the rest is not kept, which is worth saying before, not after.
 */
export function appliedNote(view: Extract<CheckoutVoucherView, { kind: "applied" }>): string {
  const parts: string[] = [];
  if (view.amountMinor < view.voucher.valueMinor) {
    parts.push(
      `${formatPhp(view.amountMinor)} of this ${formatPhp(view.voucher.valueMinor)} voucher applies here, because a voucher cannot take off more than GRIDGO charges. The rest is not kept.`,
    );
  }
  if (view.replacedOrganization) {
    parts.push("It saves more than your organization discount on this order, so it applies instead. The two never combine.");
  }
  parts.push(
    view.heldUntil
      ? `Held for this order until ${shortTime(view.heldUntil)}.`
      : "Applied automatically. GRIDGO holds it for you when you place the order.",
  );
  return parts.join(" ");
}

/** Where the voucher's value comes from, worded to the fee switch. */
export function voucherRuleLine(showServiceFee: boolean): string {
  return showServiceFee
    ? "A voucher comes off GRIDGO's service fee first, then delivery. It never lowers the printing price and never takes the total below zero."
    : "A voucher never lowers the printing price and never takes the total below zero.";
}

/** "−₱15.00": a true minus, so it never reads as a hyphenated amount. */
export function voucherAmount(minor: number): string {
  return `−${formatPhp(minor)}`;
}

/** What a quote, order or invoice took off for a voucher; zero when none. */
export function voucherDiscountOf(source: { voucherDiscountMinor?: number | null } | null | undefined): number {
  const minor = source?.voucherDiscountMinor;
  return typeof minor === "number" && Number.isFinite(minor) && minor > 0 ? minor : 0;
}

/* --------------------------------------------------------------------------
   Inbox
   -------------------------------------------------------------------------- */

export const VOUCHER_NOTIFICATION_TYPES = ["voucher_issued", "voucher_expiry_48h", "voucher_expiry_24h"] as const;

export function isVoucherNotification(type: string | null | undefined): boolean {
  return (VOUCHER_NOTIFICATION_TYPES as readonly string[]).includes(type ?? "");
}

/**
 * The inbox copy for a voucher notice. GRIDGO's own body is written for email
 * (it prints the expiry as a raw timestamp), so the card says it again in the
 * app's words; the amount and expiry are read from that body when present and
 * simply left out when not.
 */
export function voucherNotificationCopy(
  type: string | null | undefined,
  body: string,
): { title: string; body: string; expiresAt: string | null } | null {
  if (!isVoucherNotification(type)) return null;
  const amount = /PHP\s?(\d+(?:\.\d{2})?)/.exec(body);
  const expiry = /Expires (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(body);
  const expiresAt = expiry && Number.isFinite(Date.parse(expiry[1])) ? expiry[1] : null;
  const value = amount ? formatPhp(Math.round(Number(amount[1]) * 100)) : null;
  const what = value ? `Your ${value} voucher` : "Your voucher";
  if (type === "voucher_issued") {
    return {
      title: value ? `${value} voucher from GRIDGO` : "A voucher from GRIDGO",
      body: `${what} is in your wallet. GRIDGO pays for it.`,
      expiresAt,
    };
  }
  return {
    title: type === "voucher_expiry_24h" ? "Your voucher expires within a day" : "Your voucher expires within 2 days",
    body: `${what} expires${expiresAt ? ` ${exactTime(expiresAt)}` : " soon"}. Use it on an order before then.`,
    expiresAt,
  };
}
