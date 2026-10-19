/**
 * GRIDGO's opening hours, in a client's words (gridgo-api#203,
 * `docs/OPERATING_HOURS_API.md`).
 *
 * Artwork is reviewed only while GRIDGO is open. Everything that depends on
 * that — when a review starts, when it finishes, the ready-by it leads to —
 * arrives from the API already worked out. This module only says those
 * instants back in Davao time; it never counts opening hours itself, because
 * Super Admin edits the week and the closures without a release and a copy of
 * the rule on the phone would disagree with the order the day it changed.
 *
 * The client's own clocks are not touched: the issue window and the checkout
 * hold stay real time, so nothing here is used for them.
 */

import type {
  CheckoutNotice,
  OperatingHours,
  OperatingStatus,
  Order,
  OrderReview,
  PlatformSettings,
} from "@/lib/api";
import { formatEarliestDay, SHOP_TIME_ZONE } from "@/lib/deadlineCalendar";
import { hubHoursLines, upcomingClosureLines } from "@/lib/hubPickup";

/** GRIDGO's word for an order whose artwork waits for opening hours. */
export const WAITING_FOR_REVIEW = "Waiting for review";
export const REVIEW_DELAYED = "Review delayed";

/** Manila keeps +08:00 all year, and the API fixes the schedule to it. */
const DAVAO_OFFSET_MS = 480 * 60_000;

/** `YYYY-MM-DD` of an instant on Davao's calendar. */
function davaoDayKey(at: Date): string {
  return new Date(at.getTime() + DAVAO_OFFSET_MS).toISOString().slice(0, 10);
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function davaoTime(at: Date): string {
  return at.toLocaleTimeString("en-PH", {
    timeZone: SHOP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "today, 8:00 AM", "tomorrow, 8:00 AM", "Mon 12 Oct, 8:00 AM".
 *
 * The near days are named because that is how a person plans round them: a
 * client ordering at 9 PM wants to read "tomorrow", not work out that
 * Saturday is tomorrow.
 */
export function reviewMoment(value: string | null | undefined, now: Date = new Date()): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const gap = dayNumber(davaoDayKey(at)) - dayNumber(davaoDayKey(now));
  const day = gap === 0 ? "today" : gap === 1 ? "tomorrow" : formatEarliestDay(at);
  return `${day}, ${davaoTime(at)}`;
}

/** "about 1 hour", "about 45 minutes", "about 1 hr 30 min". */
export function reviewLength(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  return `about ${hours} hr ${rest} min`;
}

/**
 * "Mon–Sat · 8:00 AM – 5:00 PM", one line per set of days sharing hours.
 * Null on an API without the setting: no hours are better than invented ones.
 */
export function openingHoursLines(
  settings: Pick<PlatformSettings, "operatingHours"> | null | undefined,
): string[] | null {
  return hubHoursLines(settings?.operatingHours?.schedule);
}

/**
 * "Mon–Sat, 8:00 AM – 5:00 PM" — when GRIDGO's team reviews artwork, as one
 * phrase for the date step's header. Null on an API without the setting.
 */
export function reviewHoursPhrase(
  settings: Pick<PlatformSettings, "operatingHours"> | null | undefined,
): string | null {
  const lines = openingHoursLines(settings);
  return lines?.length ? lines.map((line) => line.replace(" · ", ", ")).join("; ") : null;
}

/** Closures in the next month, "Closed 25–26 Dec". */
export function upcomingClosures(
  hours: OperatingHours | null | undefined,
  now: Date = new Date(),
): string[] {
  return upcomingClosureLines(hours?.schedule, now);
}

/**
 * What one timing object says, ready to draw.
 *
 * `reviewAt` is when review starts and `length` how long it takes; `readyBy`
 * is GRIDGO's client promise, passed through untouched.
 */
export type ReviewScheduleView = {
  closed: boolean;
  delayed: boolean;
  reviewAt: string | null;
  length: string | null;
  readyBy: string | null;
};

function scheduleView(
  timing: OperatingStatus,
  readyBy: string | null | undefined,
  now: Date,
): ReviewScheduleView {
  return {
    closed: !timing.isOpenNow,
    delayed: Boolean(timing.reviewDelayed),
    reviewAt: reviewMoment(timing.scheduledReviewAt, now),
    length: reviewLength(timing.artworkReviewMinutes),
    readyBy: readyBy ?? null,
  };
}

/**
 * The checkout notice, or null while GRIDGO is open.
 *
 * Read only from the cart's own `checkoutNotice`: the API sets it while closed
 * and clears it the moment it opens. Paying is never held back by it.
 */
export function checkoutNoticeView(
  notice: CheckoutNotice | null | undefined,
  now: Date = new Date(),
): ReviewScheduleView | null {
  if (!notice || notice.isOpenNow) return null;
  return scheduleView(notice, notice.readyBy, now);
}

/** States in which an order is simply waiting on GRIDGO's first look. */
const BEFORE_REVIEW = new Set(["submitted", "needs_qa", "initial_payment_review", "downpayment_review"]);

/**
 * An order whose artwork waits for opening hours, or whose review a closure
 * moved (gridgo-api#203). The client has nothing to do; the chip says
 * "Waiting for review" and the card says when.
 *
 * During opening hours an ordinary pending check keeps its own wording — the
 * review is happening, not waiting.
 */
export function orderReviewView(
  order: Pick<Order, "state"> & { review?: OrderReview | null },
  now: Date = new Date(),
): ReviewScheduleView | null {
  const review = order.review;
  if (!review || review.status !== "waiting_for_review") return null;
  if (!BEFORE_REVIEW.has(order.state)) return null;
  if (review.isOpenNow && !review.reviewDelayed) return null;
  return scheduleView(review, review.readyBy, now);
}

/** The chip label, the API's own when it sent one. */
export function waitingForReviewLabel(review: OrderReview | null | undefined): string {
  return review?.label?.trim() || WAITING_FOR_REVIEW;
}

/** One sentence for Home and the order docket. */
export function reviewWaitingLine(view: ReviewScheduleView): string {
  if (view.delayed && view.reviewAt) {
    return `A GRIDGO closure moved your artwork review to ${view.reviewAt}. Your ready-by date stays the same.`;
  }
  if (view.reviewAt) {
    return `GRIDGO is closed now. Your artwork is reviewed ${view.reviewAt}.`;
  }
  return "GRIDGO is closed now. Your artwork is reviewed when it opens.";
}

/** The line under the earliest date while GRIDGO is closed. */
export function closedNowLine(status: OperatingStatus | null | undefined, now: Date = new Date()): string | null {
  if (!status || status.isOpenNow) return null;
  const at = reviewMoment(status.scheduledReviewAt, now);
  return at
    ? `GRIDGO is closed now. Artwork review starts ${at}, and these dates count it.`
    : null;
}

/**
 * Under a match's ready-by while GRIDGO is closed: "Review starts tomorrow,
 * 8:00 AM". The date above already counts it; this says why it is later.
 */
export function reviewStartsLine(
  status: OperatingStatus | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!status || status.isOpenNow) return null;
  const at = reviewMoment(status.scheduledReviewAt, now);
  return at ? `Review starts ${at}` : null;
}
