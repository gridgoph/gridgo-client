import type { Order, OrderSurvey } from "@/lib/api";
import { voucher } from "@/test/voucherFixtures";

/** An order's survey the way `GET /orders/:id/survey` writes it (gridgo-api `docs/SURVEY_API.md`). */
export function survey(overrides: Partial<OrderSurvey> = {}): OrderSurvey {
  const now = Date.now();
  return {
    orderId: "ord_survey_1",
    status: "open",
    fulfillmentKind: "delivery",
    openedAt: new Date(now - 3_600_000).toISOString(),
    expiresAt: new Date(now + 6 * 86_400_000).toISOString(),
    dismissedAt: null,
    submittedAt: null,
    answers: null,
    needsFollowUp: false,
    rewardStatus: null,
    reward: null,
    rewardEligible: true,
    nextRewardAt: null,
    reportProblem: null,
    ...overrides,
  };
}

/** The same survey once sent with three low-ish answers and a ₱15 reward. */
export function sentSurvey(overrides: Partial<OrderSurvey> = {}): OrderSurvey {
  const now = Date.now();
  return survey({
    status: "submitted",
    submittedAt: new Date(now - 60_000).toISOString(),
    answers: {
      fulfillmentStars: 4,
      fulfillmentTags: ["on_time"],
      easeStars: 5,
      easeTags: [],
      priceFeeling: 3,
      expectedPriceMinor: null,
      qualityStars: null,
      recommendScore: 9,
      improvementNote: null,
    },
    rewardStatus: "issued",
    reward: voucher({
      id: "vch_survey_1",
      name: "Thank you for your order feedback",
      issuedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
      code: "7AFD123456789ABC",
    }),
    rewardEligible: false,
    nextRewardAt: new Date(now + 7 * 86_400_000).toISOString(),
    ...overrides,
  });
}

export const LOW_SCORE_REPORT = {
  label: "Report a problem with this order",
  path: "/orders/ord_survey_1/issues",
  method: "POST",
};

/** Just enough order for the survey's heading and price context. */
export function surveyOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_survey_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "issue_window_open",
    productId: "prod_flyers",
    title: "Trade fair flyers",
    quantity: 200,
    size: "A5",
    material: "matte_150gsm",
    deadline: null,
    address: "12 J.P. Laurel Ave, Bajada, Davao City",
    zone: "davao_central",
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    createdAt: "2026-10-08T10:00:00+08:00",
    updatedAt: "2026-10-14T16:12:00+08:00",
    timeline: [],
    ...overrides,
  } as Order;
}
