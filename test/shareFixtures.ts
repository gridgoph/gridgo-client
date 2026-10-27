import type { OrderShare, OrderShareRead } from "@/lib/api";

export const SHARE_LINK = "https://forms.example/signup?code=0123456789ABCDEF01234567";

/** GRIDGO's share answer for a delivered order, card due after the survey. */
export function orderShare(overrides: Partial<OrderShare> = {}, card: Partial<OrderShare["card"]> = {}): OrderShare {
  return {
    orderId: "ord_refund_1",
    available: true,
    firstName: "Ana",
    foundingTester: false,
    inviteCode: "0123456789ABCDEF01234567",
    inviteLink: SHARE_LINK,
    ...overrides,
    card: {
      firstShownAt: null,
      dismissedAt: null,
      repeatShownAt: null,
      closedAt: null,
      showAfterSurvey: true,
      showFromOrder: false,
      ...card,
    },
  };
}

export function shareRead(share: OrderShare): OrderShareRead {
  return { serverTime: new Date().toISOString(), share };
}
