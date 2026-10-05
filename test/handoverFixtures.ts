import type { HubSchedule, OrderHandover } from "@/lib/api";

/** Monday, Wednesday and Friday, nine to five in Davao — the pilot fallback. */
export const HUB_SCHEDULE: HubSchedule = {
  utcOffsetMinutes: 480,
  week: [1, 3, 5].map((weekday) => ({ weekday, opensMinute: 540, closesMinute: 1020 })),
  closures: [],
};

/** A hub pick-up's credential as the owning client reads it. */
export function hubHandover(overrides: Partial<OrderHandover> = {}): OrderHandover & { qrToken: string } {
  return {
    otp: "482913",
    qrToken: "Xq3_-Zr8pLmN0oPqRsTuVwXyZaBcDeFgHiJkLmNoPqR",
    hub: { id: "primary", point: { lat: 7.0923, lng: 125.6165 }, schedule: HUB_SCHEDULE },
    readyAt: "2026-10-05T10:00:00+08:00",
    missedDays: 0,
    operationsRequired: false,
    redeliveryRequest: null,
    ...overrides,
  };
}

/** A delivery's credential: the code alone, the same one the rider sees. */
export function deliveryHandover(otp = "482913"): OrderHandover {
  return { otp };
}
