import type { OrderShare } from "@/lib/api";
import { orderShare, shareRead } from "@/test/shareFixtures";

/**
 * gridgo-api's card transitions (gridgo-api#318), enough to tell whether the
 * one repeat survives: a dismissal before its `shown` is refused with 409, a
 * first Maybe later makes the repeat due, and the repeat's answer closes it.
 */
export function fakeShareServer(start: OrderShare = orderShare()) {
  let share = start;
  const refuse = () => Object.assign(new Error("share_card_transition_invalid"), { status: 409, code: "share_card_transition_invalid" });
  const card = (patch: Partial<OrderShare["card"]>) => {
    share = { ...share, card: { ...share.card, ...patch } };
  };
  const at = new Date().toISOString();
  return {
    current: () => share,
    recordShareCard: async (_orderId: string, presentation: string, action: string) => {
      if (presentation === "after_survey") {
        if (action === "shown") card({ firstShownAt: at, showAfterSurvey: false });
        else if (!share.card.firstShownAt || share.card.dismissedAt) throw refuse();
        else if (action === "maybe_later") card({ dismissedAt: at, showFromOrder: true });
        else card({ dismissedAt: at, closedAt: at });
      } else if (action === "shown") {
        if (!share.card.showFromOrder) throw refuse();
        card({ repeatShownAt: at });
      } else {
        if (!share.card.repeatShownAt || share.card.closedAt) throw refuse();
        card({ closedAt: at, showFromOrder: false });
      }
      return shareRead(share);
    },
  };
}
