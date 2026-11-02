import { changeRequestView, settledChanges } from "@/lib/orderChanges";
import { orderNextAction, orderWaitingOn } from "@/lib/orderState";
import {
  SHOP_MOVE_HEADLINE,
  SHOP_RECOVERY_ACCEPT_NOTE,
  SHOP_RECOVERY_HEADLINE,
  acceptChoice,
  alternativeLabel,
  alternativeNote,
  priceComparison,
  shopMoveLines,
  shopRecoveryAcceptNote,
  shopRecoveryHeadline,
  shopRecoveryNextAction,
  shopRecoveryNotificationCopy,
  shopRecoveryNotificationNeedsYou,
  shopRecoveryRefundNote,
  shopRecoveryView,
  shopRecoveryWithdrawNote,
} from "@/lib/shopRecovery";
import { refundOrder } from "@/test/refundFixtures";
import {
  aboveCapWithAlternatives,
  awaitingPaymentRecovery,
  pricedRecovery,
  shopMovePricing,
  shopRecovery,
  topUpChange,
} from "@/test/shopChangeFixtures";

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

/*
  gridgo-api#225: a move the client did not cause is priced by the
  substitute-shop rule. refundOrder prints at ₱1,100 to the client.
*/
describe("the substitute-shop price rule", () => {
  it("offers a cheaper shop with the difference coming back as a refund", () => {
    const order = refundOrder({ shopRecovery: pricedRecovery("cheaper") });
    const view = shopRecoveryView(order);
    expect(view).toEqual(expect.objectContaining({ kind: "offer", pricing: shopMovePricing("cheaper") }));
    const comparison = priceComparison(order, shopMovePricing("cheaper"));
    expect(comparison).toEqual({
      wasMinor: 110000,
      nowMinor: 100000,
      rows: [{ label: "Comes back to you", value: "₱100.00" }],
      note: "The new shop costs ₱100.00 less. GRIDGO sends the difference back to you as a refund.",
    });
    expect(shopRecoveryAcceptNote(shopMovePricing("cheaper"))).toMatch(/send the ₱100\.00 back/);
  });

  it("offers a same-price shop with nothing extra to pay", () => {
    const comparison = priceComparison(refundOrder(), shopMovePricing("same"));
    expect(comparison.wasMinor).toBe(comparison.nowMinor);
    expect(comparison.rows).toEqual([]);
    expect(comparison.note).toBe("Same price. You pay nothing extra.");
  });

  it("says GRIDGO covers a dearer shop within the cap", () => {
    const order = refundOrder({ shopRecovery: pricedRecovery("covered") });
    expect(shopRecoveryView(order)?.kind).toBe("offer");
    expect(priceComparison(order, shopMovePricing("covered"))).toEqual({
      wasMinor: 110000,
      nowMinor: 114000,
      rows: [
        { label: "GRIDGO covers", value: "₱40.00" },
        { label: "You pay", value: "Nothing extra" },
      ],
      note: "The new shop costs ₱40.00 more. GRIDGO covers it, so you pay nothing extra.",
    });
    expect(shopRecoveryAcceptNote(shopMovePricing("covered"))).toMatch(/nothing extra to pay/);
    expect(acceptChoice({ pricing: shopMovePricing("covered") }, false)).toEqual({});
  });

  it("offers pay the rest, another shop or a refund above the cap", () => {
    const order = refundOrder({ shopRecovery: aboveCapWithAlternatives() });
    const view = shopRecoveryView(order);
    expect(view?.kind).toBe("above_cap");
    if (view?.kind !== "above_cap") throw new Error("expected above_cap");
    expect(view.alternatives.map((option) => option.optionId)).toEqual(["option_2", "option_3"]);
    expect(priceComparison(order, view.pricing).rows).toEqual([
      { label: "GRIDGO covers", value: "₱50.00" },
      { label: "You pay", value: "₱150.00" },
    ]);
    // Consent is exactly what the client was shown.
    expect(acceptChoice({ pricing: view.pricing }, false)).toEqual({ acceptTopUpMinor: 15000 });
    expect(acceptChoice(view.alternatives[0], true)).toEqual({ optionId: "option_2" });
    expect(acceptChoice(view.alternatives[1], true)).toEqual({ optionId: "option_3", acceptTopUpMinor: 5000 });
    expect(alternativeNote(view.alternatives[0])).toMatch(/You pay nothing extra\.$/);
    expect(alternativeNote(view.alternatives[1])).toMatch(/You pay ₱50\.00 more, paid by QR before it starts\.$/);
    expect(alternativeLabel(view.alternatives[0])).toMatch(/^Pick the shop ready /);
    expect(orderNextAction(order)?.title).toBe("Choose how your order goes on");
  });

  it("hides alternatives the server says cannot be picked", () => {
    const recovery = { ...aboveCapWithAlternatives(), canPickAlternative: false };
    const view = shopRecoveryView({ shopRecovery: recovery });
    expect(view?.kind === "above_cap" && view.alternatives).toEqual([]);
  });

  it("keeps the released same-price offer when there is no pricing, or the client caused the move", () => {
    expect(shopRecoveryView({ shopRecovery: shopRecovery() })).toEqual(
      expect.objectContaining({ kind: "offer", pricing: null }),
    );
    const clientMove = pricedRecovery("not_applicable", { fault: "client" });
    expect(shopRecoveryView({ shopRecovery: clientMove })).toEqual(expect.objectContaining({ kind: "offer", pricing: null }));
    expect(shopRecoveryAcceptNote(null)).toBe(SHOP_RECOVERY_ACCEPT_NOTE);
    expect(shopRecoveryHeadline(clientMove)).toBe(SHOP_MOVE_HEADLINE);
    expect(shopRecoveryHeadline(shopRecovery())).toBe(SHOP_RECOVERY_HEADLINE);
  });

  it("asks for the top-up while it is unpaid, then waits while Operations checks it", () => {
    const unpaid = refundOrder({ shopRecovery: awaitingPaymentRecovery(), changeRequests: [topUpChange()] });
    expect(shopRecoveryView(unpaid)).toEqual(expect.objectContaining({ kind: "top_up", amountMinor: 15000 }));
    expect(orderNextAction(unpaid)?.title).toBe("Pay ₱150.00 for the new shop");
    // The generic change card never claims the top-up as the shop asking for something.
    expect(changeRequestView({ ...unpaid, productionItems: [] })).toBeNull();

    const sent = refundOrder({
      shopRecovery: awaitingPaymentRecovery(),
      changeRequests: [
        topUpChange({
          status: "pending_confirmation",
          payment: { proofFileId: "file_1", reference: "GCASH-9", submittedAt: "2026-10-05T11:00:00+08:00" },
        }),
      ],
    });
    expect(orderNextAction(sent)).toBeNull();
    expect(orderWaitingOn(sent)).toMatch(/checking your payment for the new shop/);
    expect(settledChanges(sent)).toEqual([]);
  });

  it("says where withdrawing a refund from this choice puts the client", () => {
    const fromPayment = { shopRecovery: awaitingPaymentRecovery({ status: "refund_requested", refundRequestId: "refund_1" }) };
    expect(shopRecoveryWithdrawNote(fromPayment, "refund_1")).toMatch(/back to paying the rest/);
    const fromChoice = { shopRecovery: pricedRecovery("above_cap", { status: "refund_requested", refundRequestId: "refund_1" }) };
    expect(shopRecoveryWithdrawNote(fromChoice, "refund_1")).toMatch(/back to choosing/);
    expect(shopRecoveryWithdrawNote(fromChoice, "refund_other")).toBeNull();
  });

  it("records each accepted move under Payment details without changing the total", () => {
    const lines = shopMoveLines({
      shopMoves: [
        { recoveryId: "a", at: "2026-10-05T10:00:00+08:00", status: "applied", refundMinor: 10000, refundStatus: "reserved" },
        { recoveryId: "b", at: "2026-10-06T10:00:00+08:00", status: "applied", refundMinor: 0, gridgoCoverMinor: 4000 },
        { recoveryId: "c", at: "2026-10-07T10:00:00+08:00", status: "applied", refundMinor: 2000, refundStatus: "reconciliation_required" },
        { recoveryId: "d", at: "2026-10-08T10:00:00+08:00", status: "refund_requested", gridgoCoverMinor: 5000 },
      ],
    });
    expect(lines).toEqual([
      "Your order moved to a shop that costs ₱100.00 less. It comes back to you as a credit.",
      "Your order moved to another shop. GRIDGO covered ₱40.00 of its price.",
      "Your order moved to a shop that costs ₱20.00 less. Operations will contact you about sending it back.",
    ]);
  });

  it("words the new inbox rows for the client", () => {
    const row = (body: string) => ({ type: "shop_recovery", body });
    const aboveCap = row(
      "Your order needs to move to another shop. A vetted replacement costs more than GRIDGO can cover. Pay the difference, pick another shop, or choose a full refund.",
    );
    expect(shopRecoveryNotificationCopy(aboveCap)).toEqual({
      title: SHOP_MOVE_HEADLINE,
      body: expect.stringMatching(/pay the rest, pick another shop, or choose a full refund/),
    });
    expect(shopRecoveryNotificationNeedsYou(aboveCap)).toBe(true);
    const paying = row(
      "The client chose to pay the price difference for the replacement shop. Work starts once Operations confirms the transfer.",
    );
    expect(shopRecoveryNotificationCopy(paying)?.title).toBe("Pay the rest for your new shop");
    expect(shopRecoveryNotificationCopy(paying)?.body).not.toMatch(/the client/i);
  });
});
