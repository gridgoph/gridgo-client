import type { Order } from "@/lib/api";
import {
  basketDeadlineOf,
  basketMatchContext,
  groupLetter,
  groupStateMeta,
  groupStoppedNote,
  isMultiShop,
  lineGroupKey,
  multiShopPaymentNote,
  receiptGroupStanding,
  shopGroups,
} from "@/lib/basketGroups";
import { blockerLine, placeOrderBlockers } from "@/lib/checkout";
import { multiCart } from "@/test/multiShopFixtures";

describe("isMultiShop", () => {
  it("is true only for two or more groups", () => {
    expect(isMultiShop(multiCart(2))).toBe(true);
    expect(isMultiShop(multiCart(3))).toBe(true);
    const single = multiCart(2);
    expect(isMultiShop({ ...single, groups: single.groups!.slice(0, 1) })).toBe(false);
    expect(isMultiShop({ groups: undefined })).toBe(false);
    expect(isMultiShop(null)).toBe(false);
  });
});

describe("lineGroupKey", () => {
  it("groups a multi-shop line by its group, a single-shop line by its shop", () => {
    expect(lineGroupKey({ id: "l1", groupId: "g1" })).toBe("g1");
    expect(lineGroupKey({ id: "l1", supplierId: "user_shop" })).toBe("user_shop");
    expect(lineGroupKey({ id: "l1" })).toBe("l1");
  });
});

describe("groupLetter", () => {
  it("is the plate letter from GRIDGO's label", () => {
    expect(groupLetter("Shop A")).toBe("A");
    expect(groupLetter("Shop AB")).toBe("AB");
    expect(groupLetter("Somewhere")).toBe("Somewhere");
  });
});

describe("shopGroups", () => {
  it("lays the basket out by GRIDGO's groups, with each group's own delivery and zone", () => {
    const groups = shopGroups(multiCart(3));
    expect(groups.map((group) => [group.label, group.letter, group.lines.map((line) => line.id)])).toEqual([
      ["Shop A", "A", ["cline_0"]],
      ["Shop B", "B", ["cline_1"]],
      ["Shop C", "C", ["cline_2"]],
    ]);
    expect(groups.map((group) => group.deliveryFeeMinor)).toEqual([2500, 5000, 2500]);
    expect(groups[1].zone).toEqual({ key: "away", label: "Away" });
    expect(groups[0].distanceKm).toBeNull();
  });

  it("keeps an unpriced group unpriced rather than zero", () => {
    const cart = multiCart(2);
    cart.groups![1] = { ...cart.groups![1], deliveryFeeMinor: null, totalMinor: null };
    const [, second] = shopGroups(cart);
    expect(second.deliveryFeeMinor).toBeNull();
    expect(second.totalMinor).toBeNull();
  });
});

describe("basketMatchContext", () => {
  it("sends nothing of the basket while it is empty or unstarted", () => {
    expect(basketMatchContext(null, "2026-10-20T08:00:00.000Z")).toEqual({
      deadline: "2026-10-20T08:00:00.000Z",
    });
    expect(basketMatchContext(multiCart(2, { lines: [] }), null)).toEqual({ deadline: null });
  });

  it("holds every product to the basket's one date", () => {
    expect(basketMatchContext(multiCart(2), "2026-12-01T08:00:00.000Z")).toEqual({
      cartId: "cart_multi",
      deadline: "2026-10-26T08:00:00.000Z",
    });
  });

  it("lets the job's date become the basket's while it has none", () => {
    expect(basketMatchContext(multiCart(2, { deadline: null }), "2026-11-02T08:00:00.000Z")).toEqual({
      cartId: "cart_multi",
      deadline: "2026-11-02T08:00:00.000Z",
    });
  });

  it("asks for one group's shop only while that group is still in the basket", () => {
    expect(basketMatchContext(multiCart(2), null, "cline_1")).toEqual({
      cartId: "cart_multi",
      deadline: "2026-10-26T08:00:00.000Z",
      groupId: "cline_1",
    });
    expect(basketMatchContext(multiCart(2), null, "cline_gone")).not.toHaveProperty("groupId");
  });

  it("leaves a checked-out basket out of the match", () => {
    expect(basketMatchContext(multiCart(2, { state: "checked_out" }), null)).toEqual({ deadline: null });
  });
});

describe("basketDeadlineOf", () => {
  it("is the basket's date once it has something in it", () => {
    expect(basketDeadlineOf(multiCart(2))).toBe("2026-10-26T08:00:00.000Z");
    expect(basketDeadlineOf(multiCart(2, { lines: [] }))).toBeNull();
    expect(basketDeadlineOf(multiCart(2, { deadline: null }))).toBeNull();
  });
});

describe("placing a basket without a date", () => {
  it("is blocked, and says so plainly", () => {
    const blockers = placeOrderBlockers({
      lineCount: 2,
      linesMissingArtwork: 0,
      linesMissingDropoff: 0,
      missingBasketDate: true,
      referenceOk: true,
      hasProof: true,
      hasSettings: true,
    });
    expect(blockers).toEqual(["date"]);
    expect(blockerLine("date")).toBe("Choose one date for your whole order.");
  });
});

describe("words", () => {
  it("explains why a multi-shop order is paid in full", () => {
    const note = multiShopPaymentNote(3);
    expect(note).toMatch(/printed by 3 shops/);
    expect(note).toMatch(/whole total now, in one transfer/);
    expect(note).not.toMatch(/75|25%|downpayment|balance due/i);
  });
});

describe("after checkout", () => {
  const order = (patch: Partial<Order>) =>
    ({ state: "production", groupLabel: "Shop B", basketId: "bsk_1", ...patch }) as Order;

  it("says nothing about a group that is going", () => {
    expect(groupStoppedNote(order({}))).toBeNull();
  });

  it("names a cancelled group and says the others carry on", () => {
    expect(groupStoppedNote(order({ state: "cancelled" }))).toMatch(
      /^Shop B was cancelled\. .*refunded on its own.*other shops in this order carry on/,
    );
    expect(groupStoppedNote(order({ state: "cancelled", refundDisposition: "cancelled" }))).toMatch(
      /refunded to you on its own/,
    );
  });

  it("says a group's refund leaves the others alone", () => {
    expect(groupStoppedNote(order({ refundHold: true }))).toMatch(/paused while GRIDGO reviews your refund/);
    expect(groupStoppedNote(order({ refundDisposition: "fulfilled_with_refund", state: "completed" }))).toMatch(
      /refunded to you\. The other shops/,
    );
  });

  it("marks a cancelled group on the receipt, and only that", () => {
    expect(receiptGroupStanding({ state: "cancelled" })).toMatch(/^Cancelled/);
    expect(receiptGroupStanding({ state: "production" })).toBeNull();
  });

  it("draws a group's chip in the paid-in-full words", () => {
    expect(groupStateMeta({ state: "awaiting_initial_payment" }).label).toBe("Payment due");
    expect(groupStateMeta({ state: "cancelled" })).toEqual({ label: "Cancelled", tone: "neutral", icon: "circle-x" });
    expect(groupStateMeta({ state: "delivered" }, "pickup").label).toBe("Collected");
  });
});
