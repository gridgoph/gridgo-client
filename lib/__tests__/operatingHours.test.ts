import type { CheckoutNotice, OperatingStatus, Order, OrderReview, PlatformSettings } from "@/lib/api";
import { dayReasonLine, dayReasonOf, monthGrid } from "@/lib/deadlineCalendar";
import {
  checkoutNoticeView,
  closedNowLine,
  openingHoursLines,
  orderReviewView,
  reviewLength,
  reviewMoment,
  reviewStartsLine,
  reviewWaitingLine,
  upcomingClosures,
  waitingForReviewLabel,
} from "@/lib/operatingHours";
import { getOrderStateMeta, orderStateMeta, orderWaitingOn } from "@/lib/orderState";

// Friday 9 Oct 2026, 8:40 PM in Davao: after closing.
const FRIDAY_NIGHT = new Date("2026-10-09T12:40:00.000Z");

const closed: OperatingStatus = {
  timeZone: "Asia/Manila",
  isOpenNow: false,
  artworkReviewMinutes: 60,
  // Saturday 8:00 AM Davao.
  scheduledReviewAt: "2026-10-10T00:00:00.000Z",
  reviewCompletesAt: "2026-10-10T01:00:00.000Z",
  reviewDelayed: false,
};

const LAUNCH_WEEK = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1020 }));

describe("reviewMoment", () => {
  it("names today and tomorrow on Davao's calendar, not the phone's", () => {
    expect(reviewMoment("2026-10-10T00:00:00.000Z", FRIDAY_NIGHT)).toBe("tomorrow, 8:00 AM");
    // 11:30 PM Friday UTC is already Saturday in Davao.
    expect(reviewMoment("2026-10-10T03:00:00.000Z", new Date("2026-10-09T23:30:00.000Z"))).toBe(
      "today, 11:00 AM",
    );
  });

  it("dates anything further out", () => {
    expect(reviewMoment("2026-10-12T00:00:00.000Z", FRIDAY_NIGHT)).toBe("Mon 12 Oct, 8:00 AM");
  });

  it("says nothing for a missing or broken instant", () => {
    expect(reviewMoment(null, FRIDAY_NIGHT)).toBeNull();
    expect(reviewMoment("not a date", FRIDAY_NIGHT)).toBeNull();
  });
});

describe("reviewLength", () => {
  it("reads the configured minutes the way a person says them", () => {
    expect(reviewLength(60)).toBe("about 1 hour");
    expect(reviewLength(120)).toBe("about 2 hours");
    expect(reviewLength(45)).toBe("about 45 minutes");
    expect(reviewLength(90)).toBe("about 1 hr 30 min");
    expect(reviewLength(0)).toBeNull();
    expect(reviewLength(undefined)).toBeNull();
  });
});

describe("opening hours from settings", () => {
  const settings: Pick<PlatformSettings, "operatingHours"> = {
    operatingHours: {
      timeZone: "Asia/Manila",
      artworkReviewMinutes: 60,
      schedule: { utcOffsetMinutes: 480, week: LAUNCH_WEEK, closures: [{ startDay: "2026-10-12", endDay: "2026-10-13" }] },
    },
  };

  it("says the week as the API holds it", () => {
    expect(openingHoursLines(settings)).toEqual(["Mon–Sat · 8:00 AM – 5:00 PM"]);
    expect(openingHoursLines({})).toBeNull();
  });

  it("names a closure coming up", () => {
    expect(upcomingClosures(settings.operatingHours, FRIDAY_NIGHT)).toEqual(["Closed 12–13 Oct"]);
  });
});

describe("checkoutNoticeView", () => {
  const notice: CheckoutNotice = { ...closed, code: "outside_operating_hours", readyBy: "2026-10-19T06:00:00.000Z" };

  it("is null while GRIDGO is open or the API sent none", () => {
    expect(checkoutNoticeView(null)).toBeNull();
    expect(checkoutNoticeView({ ...notice, isOpenNow: true })).toBeNull();
  });

  it("passes the API's instants through, said in Davao time", () => {
    expect(checkoutNoticeView(notice, FRIDAY_NIGHT)).toEqual({
      closed: true,
      delayed: false,
      reviewAt: "tomorrow, 8:00 AM",
      length: "about 1 hour",
      readyBy: "2026-10-19T06:00:00.000Z",
    });
  });
});

describe("orders waiting for review", () => {
  const review: OrderReview = {
    ...closed,
    status: "waiting_for_review",
    label: "Waiting for review",
    outsideHoursNotice: "outside_operating_hours",
    readyBy: "2026-10-19T06:00:00.000Z",
  };
  const order = (patch: Partial<Order>): Order =>
    ({ id: "ord_1", state: "needs_qa", fulfillmentMode: "delivery", payments: {}, timeline: [], ...patch }) as unknown as Order;

  it("reads Waiting for review out of hours", () => {
    const placed = order({ review, fileCheck: { status: "pending" } as Order["fileCheck"] });
    expect(orderStateMeta(placed)).toEqual({ label: "Waiting for review", tone: "info", icon: "clock" });
    expect(orderWaitingOn(placed)).toBe(
      `GRIDGO is closed now. Your artwork is reviewed ${reviewMoment(review.scheduledReviewAt)}.`,
    );
  });

  it("keeps the ordinary chip while GRIDGO is open and nothing delayed it", () => {
    const placed = order({ review: { ...review, isOpenNow: true, outsideHoursNotice: null } });
    expect(orderStateMeta(placed)).toEqual(getOrderStateMeta("needs_qa"));
  });

  it("says a closure moved the review without moving the date", () => {
    const view = orderReviewView(order({ review: { ...review, isOpenNow: true, reviewDelayed: true } }), FRIDAY_NIGHT);
    expect(view?.delayed).toBe(true);
    expect(reviewWaitingLine(view!)).toBe(
      "A GRIDGO closure moved your artwork review to tomorrow, 8:00 AM. Your ready-by date stays the same.",
    );
  });

  it("never overrides a state that asks the client for something", () => {
    expect(orderReviewView(order({ state: "client_correction", review }))).toBeNull();
    expect(orderReviewView(order({ state: "awaiting_initial_payment", review }))).toBeNull();
  });

  it("falls back to GRIDGO's word when the label is blank", () => {
    expect(waitingForReviewLabel({ ...review, label: " " })).toBe("Waiting for review");
  });
});

describe("closed-now lines", () => {
  it("explain a later date only while closed", () => {
    expect(closedNowLine(closed, FRIDAY_NIGHT)).toBe(
      "GRIDGO is closed now. Artwork review starts tomorrow, 8:00 AM, and these dates count it.",
    );
    expect(closedNowLine({ ...closed, isOpenNow: true }, FRIDAY_NIGHT)).toBeNull();
    expect(reviewStartsLine(closed, FRIDAY_NIGHT)).toBe("Review starts tomorrow, 8:00 AM");
    expect(reviewStartsLine(null, FRIDAY_NIGHT)).toBeNull();
  });
});

describe("why a deadline day cannot be had", () => {
  it("maps the API's reasons", () => {
    expect(dayReasonOf("review_production_delivery_exceeds_deadline", true)).toBe("too_soon");
    expect(dayReasonOf("no_eligible_listing", true)).toBe("no_listing");
    expect(dayReasonOf(undefined, true)).toBe("unavailable");
    expect(dayReasonOf(undefined, false)).toBe("not_checked");
  });

  it("names the earliest date in the too-soon reason", () => {
    expect(dayReasonLine("too_soon", "2026-10-19T06:00:00.000Z")).toBe(
      "Too soon. Artwork review, printing and delivery take until Mon 19 Oct.",
    );
  });

  it("puts the reason on future cannot days only", () => {
    const days = monthGrid({
      month: new Date(2026, 9, 1),
      now: new Date(2026, 9, 9, 20, 40),
      availability: [
        { day: "2026-10-12", state: "cannot", reason: "review_production_delivery_exceeds_deadline" },
        { day: "2026-10-19", state: "open", reason: null },
      ],
    });
    const at = (key: string) => days.find((day) => day.dayKey === key);
    expect(at("2026-10-12")?.reason).toBe("too_soon");
    expect(at("2026-10-19")?.reason).toBeNull();
    expect(at("2026-10-05")?.reason).toBeNull();
    // Inside the month but past what GRIDGO answered for.
    expect(at("2026-10-30")?.reason).toBe("not_checked");
  });
});
