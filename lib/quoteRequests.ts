/**
 * Request a quote: custom signage and 3D printing (gridgo-api#226,
 * gridgo-api `docs/QUOTE_REQUESTS_API.md`).
 *
 * Some jobs have no list price. The client sends a short brief with a file,
 * Operations collects prices from suitable shops, and the client chooses one
 * of up to three options labelled A, B and C. An accepted option is an
 * ordinary basket line, so checkout, payment and the order are the usual ones.
 *
 * Pure. Screens draw what this decides. Like matching, no shop is ever named:
 * the client projection carries none, and nothing here reads one.
 */

import { ApiError, formatPhp, type QuoteOption, type QuoteProductionTime, type QuoteRequest } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { userFacingError } from "@/lib/copy";
import { workingDaysLabel } from "@/lib/listing";
import { readyByDate } from "@/lib/readyTime";

/* -------------------------------------------------------------------------- */
/* What can be quoted                                                          */
/* -------------------------------------------------------------------------- */

export type QuoteProductType = { code: string; name: string; hint: string };

/** The taxonomy subcategories GRIDGO quotes by hand (the API's `QUOTE_PRODUCT_TYPES`). */
export const QUOTE_PRODUCT_TYPES: readonly QuoteProductType[] = [
  {
    code: "business_store_signages",
    name: "Business & store signage",
    hint: "Acrylic letters, lightboxes, LED neon",
  },
  {
    code: "three_d_printing_scale_models",
    name: "3D printing & scale models",
    hint: "Prototypes, scale models, custom parts",
  },
];

export function isQuotedProduct(code: string | null | undefined): boolean {
  return QUOTE_PRODUCT_TYPES.some((type) => type.code === code);
}

export function quoteProductName(request: Pick<QuoteRequest, "productType" | "productTypeName">): string {
  return (
    request.productTypeName?.trim() ||
    QUOTE_PRODUCT_TYPES.find((type) => type.code === request.productType)?.name ||
    "Custom job"
  );
}

export const QUOTES_ROUTE = "/quotes";

export function newQuoteHref(productType?: string | null): string {
  return isQuotedProduct(productType)
    ? `/quotes/new?productType=${encodeURIComponent(productType as string)}`
    : "/quotes/new";
}

export function quoteHref(id: string): string {
  return `/quotes/${encodeURIComponent(id)}`;
}

/** The inbox rows about a quote (`quoteRequestId` on the row). */
export const QUOTE_NOTIFICATION_TYPES = new Set([
  "quote_options_ready",
  "quote_validity_changed",
  "quote_cancelled",
  "quote_expired",
]);

export function isQuoteNotification(type: string | null | undefined): boolean {
  return Boolean(type && QUOTE_NOTIFICATION_TYPES.has(type));
}

/** Where a quote notice opens: its own quote when the row names it, else the list. */
export function quoteNotificationRoute(notification: {
  type?: string | null;
  quoteRequestId?: string | null;
}): string | null {
  if (!isQuoteNotification(notification.type)) return null;
  return notification.quoteRequestId ? quoteHref(notification.quoteRequestId) : QUOTES_ROUTE;
}

/* -------------------------------------------------------------------------- */
/* The brief                                                                   */
/* -------------------------------------------------------------------------- */

export const QUOTE_LIMITS = {
  use: 500,
  size: 200,
  notes: 300,
  quantityMax: 100_000,
} as const;

export type QuoteBriefDraft = {
  productType: string;
  /** Server-issued id of the uploaded artwork or reference. */
  referenceFileId: string | null;
  use: string;
  placement: "indoor" | "outdoor" | null;
  size: string;
  quantity: string;
  notes: string;
  /** Pesos as typed, e.g. "5,000". */
  budget: string;
  /** `YYYY-MM-DD`, as typed. */
  eventDate: string;
};

/** A draft field, or `fulfilment`: where it goes is asked on its own step. */
export type QuoteBriefField = keyof QuoteBriefDraft | "fulfilment";
export type QuoteBriefErrors = Partial<Record<QuoteBriefField, string>>;

export type QuoteBrief = {
  productType: string;
  referenceFileIds: string[];
  use: string;
  placement: "indoor" | "outdoor";
  size: string;
  quantity: number;
  notes?: string;
  budgetMinor?: number;
  eventDate?: string;
};

export const EMPTY_QUOTE_BRIEF: QuoteBriefDraft = {
  productType: "",
  referenceFileId: null,
  use: "",
  placement: null,
  size: "",
  quantity: "1",
  notes: "",
  budget: "",
  eventDate: "",
};

/** Today in Davao, `YYYY-MM-DD`: the event date is a local calendar day. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** Pesos as a client types them — "5000", "5,000", "₱5,000.50" — in centavos. */
export function pesosToMinor(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Check the brief the way gridgo-api will, and say what to fix in plain words.
 * Returns the request body only when nothing is wrong.
 */
export function checkQuoteBrief(
  draft: QuoteBriefDraft,
  today: string = manilaToday(),
): { errors: QuoteBriefErrors; brief: QuoteBrief | null } {
  const errors: QuoteBriefErrors = {};
  if (!isQuotedProduct(draft.productType)) errors.productType = "Choose signage or 3D printing.";
  if (!draft.referenceFileId) errors.referenceFileId = "Upload your artwork or a reference first.";

  const use = draft.use.trim();
  if (!use) errors.use = "Say what it is for.";
  else if (use.length > QUOTE_LIMITS.use) errors.use = `Keep it under ${QUOTE_LIMITS.use} characters.`;

  if (draft.placement !== "indoor" && draft.placement !== "outdoor") {
    errors.placement = "Choose indoor or outdoor.";
  }

  const size = draft.size.trim();
  if (!size) errors.size = "Give a size, for example 2 x 6 ft.";
  else if (size.length > QUOTE_LIMITS.size) errors.size = `Keep it under ${QUOTE_LIMITS.size} characters.`;

  const quantityText = draft.quantity.trim();
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > QUOTE_LIMITS.quantityMax) {
    errors.quantity = `Enter a whole number from 1 to ${QUOTE_LIMITS.quantityMax.toLocaleString("en-PH")}.`;
  }

  const notes = draft.notes.trim();
  if (notes.length > QUOTE_LIMITS.notes) errors.notes = `Keep notes under ${QUOTE_LIMITS.notes} characters.`;

  let budgetMinor: number | undefined;
  if (draft.budget.trim()) {
    const parsed = pesosToMinor(draft.budget);
    if (parsed == null) errors.budget = "Enter an amount in pesos, like 5,000.";
    else budgetMinor = parsed;
  }

  const eventDate = draft.eventDate.trim();
  if (eventDate) {
    if (!isCalendarDay(eventDate)) errors.eventDate = "Write the date as YYYY-MM-DD, like 2026-11-20.";
    else if (eventDate < today) errors.eventDate = "That date has passed.";
  }

  if (Object.keys(errors).length) return { errors, brief: null };
  return {
    errors,
    brief: {
      productType: draft.productType,
      referenceFileIds: [draft.referenceFileId as string],
      use,
      placement: draft.placement as "indoor" | "outdoor",
      size,
      quantity,
      ...(notes ? { notes } : {}),
      ...(budgetMinor != null ? { budgetMinor } : {}),
      ...(eventDate ? { eventDate } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The status a client should read. A published or accepted request whose
 * validity has passed is expired, even before GRIDGO's sweep records it — the
 * same rule the API reads by.
 */
export function quoteStatusOf(request: Pick<QuoteRequest, "status" | "validUntil">, now: number = Date.now()): string {
  if ((request.status === "published" || request.status === "accepted") && request.validUntil) {
    const until = Date.parse(request.validUntil);
    if (Number.isFinite(until) && until <= now) return "expired";
  }
  return request.status;
}

export type QuoteStatusView = { label: string; tone: StatusTone; icon: StatusIconName; line: string };

export function quoteStatusView(
  request: Pick<QuoteRequest, "status" | "validUntil" | "cancelledBy">,
  now: number = Date.now(),
): QuoteStatusView {
  switch (quoteStatusOf(request, now)) {
    case "requested":
    case "quoting":
      return {
        label: "Waiting for options",
        tone: "info",
        icon: "clock",
        line: "GRIDGO is asking shops for prices. We will tell you when your options are ready.",
      };
    case "published":
      return {
        label: "Options ready",
        tone: "warning",
        icon: "sparkles",
        line: "Choose one option to continue to checkout.",
      };
    case "accepted":
      return {
        label: "Accepted",
        tone: "success",
        icon: "circle-check",
        line: "Your option is in its own basket. Continue to checkout to place the order.",
      };
    case "ordered":
      return {
        label: "Ordered",
        tone: "success",
        icon: "circle-check",
        line: "This quote is now an order.",
      };
    case "expired":
      return {
        label: "Expired",
        tone: "neutral",
        icon: "clock",
        line: "These options are no longer valid. Ask GRIDGO to renew them in chat, or request a new quote.",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "neutral",
        icon: "circle-x",
        line: request.cancelledBy === "operations" ? "GRIDGO closed this quote request." : "You cancelled this quote request.",
      };
    default:
      return { label: "Updating", tone: "neutral", icon: "clock", line: "Pull down to refresh this quote." };
  }
}

export function canAcceptQuote(request: Pick<QuoteRequest, "status" | "validUntil">, now: number = Date.now()): boolean {
  return quoteStatusOf(request, now) === "published";
}

export function canCancelQuote(request: Pick<QuoteRequest, "status" | "validUntil">, now: number = Date.now()): boolean {
  return ["requested", "quoting", "published", "accepted", "expired"].includes(quoteStatusOf(request, now));
}

/** "Prices held until Tue, Nov 10, 2026 · 5:00 PM", while options can still be taken. */
export function validityLine(request: Pick<QuoteRequest, "status" | "validUntil">, now: number = Date.now()): string | null {
  const status = quoteStatusOf(request, now);
  const when = readyByDate(request.validUntil);
  if (!when) return null;
  if (status === "published" || status === "accepted") return `Prices held until ${when}`;
  if (status === "expired") return `Prices ended ${when}`;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

/** Production time only, never the ready date. */
export function productionTimeLine(time: QuoteProductionTime | null | undefined): string | null {
  if (!time) return null;
  if (time.mode === "same_day") return "Made the same day";
  if (time.mode === "days") {
    const { minDays, maxDays } = time as { minDays?: number | null; maxDays?: number | null };
    const max = typeof maxDays === "number" && maxDays > 0 ? Math.ceil(maxDays) : null;
    const min = typeof minDays === "number" && minDays > 0 ? Math.ceil(minDays) : null;
    if (max == null) return min != null ? `Made in ${workingDaysLabel(min)}` : null;
    if (min != null && min < max) return `Made in ${min}–${max} working days`;
    return `Made in ${workingDaysLabel(max)}`;
  }
  return null;
}

function eventDay(eventDate: string): string {
  const date = new Date(`${eventDate}T12:00:00+08:00`);
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

export type QuoteOptionView = {
  label: string;
  title: string;
  price: string;
  /** The matching badge, on the option GRIDGO ranked first only. */
  badge: string | null;
  production: string | null;
  readyBy: string | null;
  fit: { text: string; tone: StatusTone; icon: StatusIconName } | null;
  recommended: string | null;
  zone: QuoteOption["distanceZone"];
  rating: QuoteOption["rating"];
};

/** Up to three options, A first, each in the client's words. */
export function quoteOptionsView(request: Pick<QuoteRequest, "options" | "matchReason" | "eventDate">): QuoteOptionView[] {
  const options = [...(request.options ?? [])]
    .sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99) || left.label.localeCompare(right.label))
    .slice(0, 3);
  const badge = request.matchReason?.label?.trim() ? request.matchReason.label.trim().toUpperCase() : null;
  return options.map((option, index) => {
    const ready = readyByDate(option.readyBy);
    const fit =
      request.eventDate && option.eventDateFit === "before"
        ? { text: `Ready before your date (${eventDay(request.eventDate)})`, tone: "success" as const, icon: "circle-check" as const }
        : request.eventDate && option.eventDateFit === "after"
          ? { text: `Ready after your date (${eventDay(request.eventDate)})`, tone: "warning" as const, icon: "triangle-alert" as const }
          : null;
    return {
      label: option.label,
      title: `Option ${option.label}`,
      price: formatPhp(option.clientPriceMinor),
      badge: index === 0 ? badge : null,
      production: productionTimeLine(option.productionTime),
      readyBy: ready,
      fit,
      recommended: option.recommendedOptions?.trim() || null,
      zone: option.distanceZone ?? null,
      rating: option.rating ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                    */
/* -------------------------------------------------------------------------- */

function codeOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : error.message;
}

/** A 410 on accept carries the request as it now stands (expired). */
export function expiredQuoteFrom(error: unknown): QuoteRequest | null {
  if (!(error instanceof ApiError) || error.status !== 410) return null;
  const body = error.body as { quoteRequest?: QuoteRequest } | null;
  return body && typeof body === "object" && body.quoteRequest ? body.quoteRequest : null;
}

/** Plain words for what the quote routes refuse. */
export function quoteErrorMessage(error: unknown, fallback: string): string {
  switch (codeOf(error)) {
    case "quote_expired":
      return "These options have expired. Ask GRIDGO to renew them in chat, or request a new quote.";
    case "quote_already_accepted":
      return "You already chose an option for this quote. Continue to checkout from here.";
    case "quote_not_published":
      return "The options are not ready yet. We will tell you when they are.";
    case "quote_option_unavailable":
      return "That shop can no longer take the job. Choose another option or ask GRIDGO in chat.";
    case "invalid_quote_option":
      return "That option is no longer listed. Pull down to refresh.";
    case "quote_request_version_conflict":
      return "This quote just changed. It has been refreshed — check it and try again.";
    case "quote_request_closed":
      return "This quote request is already closed.";
    case "quote_line_locked":
      return "A quoted job keeps the product and quantity it was priced for. Cancel the quote and request a new one to change them.";
    case "reference_files_required":
      return "Upload your artwork or a reference first.";
    case "file_not_ready":
      return "That file is not ready yet. Upload it again.";
    case "invalid_event_date":
      return "Check the event date. It cannot be in the past.";
    case "invalid_quote_product_type":
      return "Choose signage or 3D printing.";
    case "dropoff_required":
      return "Choose where it should be delivered.";
    default:
      return userFacingError(error, fallback);
  }
}
