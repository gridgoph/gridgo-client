import { orderNextAction, orderWaitingOn } from "@/lib/orderState";
import {
  SHOP_RECOVERY_HEADLINE,
  shopRecoveryNextAction,
  shopRecoveryNotificationCopy,
  shopRecoveryNotificationNeedsYou,
  shopRecoveryRefundNote,
  shopRecoveryView,
} from "@/lib/shopRecovery";
import { refundOrder } from "@/test/refundFixtures";
import { shopRecovery } from "@/test/shopChangeFixtures";

describe("shopRecoveryView", () => {
  it("offers the replacement with its own ready date", () => {
    const view = shopRecoveryView({ shopRecovery: shopRecovery() });
    expect(view).toEqual(expect.objectContaining({ kind: "offer", promiseBy: "2026-10-09T17:00:00+08:00" }));
  });

  it("leaves only the refund when no shop can take it", () => {
    const view = shopRecoveryView({
      shopRecovery: shopRecovery({ replacement: null, canAccept: false }),
    });
    expect(view?.kind).toBe("no_match");
  });

  it("hands an Operations review to Operations", () => {
    const view = shopRecoveryView({
      shopRecovery: shopRecovery({ status: "ops_review", replacement: null, canAccept: false }),
    });
    expect(view?.kind).toBe("operations");
  });

  it.each(["accepted", "refund_requested", "refunded", "invented_later"])(
    "has nothing to decide once the recovery is %s",
    (status) => {
      expect(shopRecoveryView({ shopRecovery: shopRecovery({ status }) })).toBeNull();
    },
  );

  it("has nothing to decide on an order without a failure", () => {
    expect(shopRecoveryView({ shopRecovery: null })).toBeNull();
    expect(shopRecoveryView({})).toBeNull();
  });
});

describe("the refund note", () => {
  it("names what comes back when the client has paid", () => {
    expect(shopRecoveryRefundNote(refundOrder())).toMatch(/All ₱1,150\.00 you paid comes back/);
  });

  it("says the order is cancelled for nothing when nothing was paid", () => {
    const unpaid = refundOrder({ payments: {} });
    expect(shopRecoveryRefundNote(unpaid)).toMatch(/cancelled and nothing is charged/);
  });
});

describe("the one action", () => {
  it("puts the choice ahead of anything the order's state asks", () => {
    const order = refundOrder({ state: "supplier_assigned", shopRecovery: shopRecovery() });
    expect(orderNextAction(order)?.title).toBe("Choose the new shop or a refund");
  });

  it("asks for a refund decision when there is no replacement", () => {
    expect(
      shopRecoveryNextAction({ shopRecovery: shopRecovery({ replacement: null, canAccept: false }) })?.title,
    ).toBe("Choose a full refund");
  });

  it("asks nothing while Operations has it, and says they will be in touch", () => {
    const order = refundOrder({ shopRecovery: shopRecovery({ status: "ops_review", canAccept: false }) });
    expect(orderNextAction(order)).toBeNull();
    expect(orderWaitingOn(order)).toMatch(/Operations will contact you/);
  });

  it("steps aside for an open refund", () => {
    const order = refundOrder({ refundHold: true, shopRecovery: shopRecovery() });
    expect(orderNextAction(order)).toBeNull();
  });
});

describe("inbox rows", () => {
  const row = (body: string) => ({ type: "shop_recovery", body });

  it("words the offer for the client and asks them to choose", () => {
    const offered = row(
      "The original shop could not fulfil your order. A vetted replacement is available. Accept the revised date or choose a full refund.",
    );
    expect(shopRecoveryNotificationCopy(offered)?.title).toBe(SHOP_RECOVERY_HEADLINE);
    expect(shopRecoveryNotificationNeedsYou(offered)).toBe(true);
  });

  it("never shows the shop-facing wording about 'the client'", () => {
    const accepted = row("The client accepted a replacement match.");
    const copy = shopRecoveryNotificationCopy(accepted);
    expect(copy?.title).toBe("New shop on your order");
    expect(copy?.body).not.toMatch(/the client/i);
    expect(shopRecoveryNotificationNeedsYou(accepted)).toBe(false);
  });

  it("tells the client Operations will contact them on a review", () => {
    const review = row("The shop cannot fulfil this order. Operations is reviewing the next step.");
    expect(shopRecoveryNotificationCopy(review)?.body).toMatch(/Operations will contact you/);
    expect(shopRecoveryNotificationNeedsYou(review)).toBe(false);
  });

  it("leaves other types alone", () => {
    expect(shopRecoveryNotificationCopy({ type: "refund_paid", body: "" })).toBeNull();
  });
});

it("asks for no payment while Operations settles a shop that dropped the job", () => {
  // An older two-half order whose balance would otherwise be due.
  const order = refundOrder({
    state: "ready_for_dispatch",
    downpaymentPercent: 75,
    balanceMinor: 28750,
    payments: {
      downpayment: { amountMinor: 86250, method: "qr_manual", status: "confirmed", reference: "R1", submittedAt: null, confirmedAt: null },
      balance: { amountMinor: 28750, method: "qr_manual", status: "not_submitted", reference: null, submittedAt: null, confirmedAt: null },
    },
  });
  expect(orderNextAction(order)?.icon).toBe("wallet");
  expect(orderNextAction({ ...order, shopRecovery: shopRecovery({ status: "ops_review", canAccept: false }) })).toBeNull();
});
