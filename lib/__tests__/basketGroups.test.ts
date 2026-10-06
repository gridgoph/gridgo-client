import type { Order } from "@/lib/api";
import {
  addMoreFromLabel,
  allGroupsPhrase,
  basketDates,
  basketGroupDeadlineOf,
  basketMatchContext,
  groupDateLine,
  groupMoneyLabel,
  groupsHeading,
  groupTag,
  lineDeadlineOf,
  placedGroupsTitle,
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
import {
  DATE_EARLY,
  DATE_LATE,
  DATE_MID,
  datedBasket,
  datedCart,
  multiCart,
  placedBasket,
} from "@/test/multiShopFixtures";

describe("isMultiShop", () => {
  it("is true only for two or more groups", () => {
    expect(isMultiShop(multiCart(2))).toBe(true);
    expect(isMultiShop(multiCart(3))).toBe(true);
    const single = multiCart(2);
    expect(isMultiShop({ ...single, groups: single.groups!.slice(0, 1) })).toBe(false);
    expect(isMultiShop({ groups: undefined })).toBe(false);
    expect(isMultiShop(null)).toBe(false);
  });

  it("follows GRIDGO's isMultiGroup when it is sent: one shop on two dates is two groups", () => {
    expect(isMultiShop(datedCart())).toBe(true);
    expect(isMultiShop({ groups: multiCart(2).groups, isMultiGroup: false })).toBe(false);
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

  it("puts the soonest date first, and keeps each group's own date", () => {
    const groups = shopGroups(datedCart());
    expect(groups.map((group) => [group.label, group.deadline, group.lines.map((line) => line.id)])).toEqual([
      ["Shop A", DATE_EARLY, ["cline_2"]],
      ["Shop B", DATE_MID, ["cline_1"]],
      ["Shop A", DATE_LATE, ["cline_0"]],
    ]);
    // Each group keeps its own delivery fee, whichever order it is drawn in.
    expect(groups.map((group) => group.deliveryFeeMinor)).toEqual([2500, 5000, 2500]);
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

  it("keeps the product's own date, even when the basket has another (gridgo-client#189)", () => {
    expect(basketMatchContext(multiCart(2), "2026-12-01T08:00:00.000Z")).toEqual({
      cartId: "cart_multi",
      deadline: "2026-12-01T08:00:00.000Z",
    });
    expect(basketMatchContext(datedCart(), null)).toEqual({ cartId: "cart_multi", deadline: null });
  });

  it("asks for one group's shop only while that group is still in the basket", () => {
    expect(basketMatchContext(datedCart(), DATE_MID, "cline_1")).toEqual({
      cartId: "cart_multi",
      deadline: DATE_MID,
      groupId: "cline_1",
    });
    // No date of its own: it takes the group's.
    expect(basketMatchContext(datedCart(), null, "cline_2")).toEqual({
      cartId: "cart_multi",
      deadline: DATE_EARLY,
      groupId: "cline_2",
    });
    expect(basketMatchContext(multiCart(2), null, "cline_gone")).not.toHaveProperty("groupId");
  });

  it("leaves a checked-out basket out of the match", () => {
    expect(basketMatchContext(multiCart(2, { state: "checked_out" }), null)).toEqual({ deadline: null });
  });
});

describe("dates", () => {
  it("reads a line's own date, else its group's, else an older basket's one date", () => {
    const cart = datedCart();
    expect(lineDeadlineOf(cart.lines[2], cart)).toBe(DATE_EARLY);
    expect(lineDeadlineOf({ id: "cline_1", deadline: null }, cart)).toBeNull();
    // An API from before: no date on the line or group, the basket's one date.
    const older = multiCart(2);
    expect(lineDeadlineOf(older.lines[0], older)).toBe("2026-10-26T08:00:00.000Z");
  });

  it("reads a placed group's date, falling back to the basket's", () => {
    expect(basketGroupDeadlineOf(datedBasket().groups[2], datedBasket())).toBe(DATE_EARLY);
    expect(basketGroupDeadlineOf(placedBasket().groups[0], placedBasket())).toBe("2026-10-26T08:00:00.000Z");
  });

  it("offers the dates already in the order, soonest first, with how many items each holds", () => {
    const dates = basketDates(datedCart());
    expect(dates.map((entry) => [entry.deadline, entry.itemCount])).toEqual([
      [DATE_EARLY, 1],
      [DATE_MID, 1],
      [DATE_LATE, 1],
    ]);
    expect(basketDates(multiCart(2)).map((entry) => entry.itemCount)).toEqual([2]);
    expect(basketDates(multiCart(2, { state: "checked_out" }))).toEqual([]);
  });

  it("says a group's date, and says it plainly when there is none", () => {
    expect(groupDateLine(DATE_EARLY)).toBe("Needed by Mon 12 Oct");
    expect(groupDateLine(null)).toBe("No set date — as soon as it is ready");
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
    expect(blockerLine("date")).toMatch(/^Choose a date for every item/);
  });
});

describe("words", () => {
  it("explains why a multi-shop order is paid in full", () => {
    const note = multiShopPaymentNote(shopGroups(multiCart(3)));
    expect(note).toMatch(/goes out as 3 shops/);
    expect(note).toMatch(/whole total now, in one transfer/);
    expect(note).not.toMatch(/75|25%|downpayment|balance due/i);
  });

  it("says one shop on two dates is two parts, paid in full all the same", () => {
    const cart = datedCart();
    const sameShop = shopGroups({ ...cart, groups: [cart.groups![0], cart.groups![2]] });
    expect(multiShopPaymentNote(sameShop)).toMatch(/goes out as 2 parts, one for each date/);
    expect(multiShopPaymentNote(shopGroups(cart))).toMatch(/2 shops on 3 dates/);
  });

  it("heads the groups by shops and dates", () => {
    const cart = datedCart();
    expect(groupsHeading(shopGroups(multiCart(2)))).toBe("2 SHOPS, ONE ORDER");
    expect(groupsHeading(shopGroups(cart))).toBe("2 SHOPS, 3 DATES, ONE ORDER");
    expect(groupsHeading(shopGroups({ ...cart, groups: [cart.groups![0], cart.groups![2]] }))).toBe(
      "2 DATES, ONE ORDER",
    );
    expect(placedGroupsTitle(shopGroups(cart))).toBe("One order, 2 shops on 3 dates");
    expect(placedGroupsTitle(shopGroups(multiCart(3)))).toBe("One order, 3 shops");
  });

  it("tells two groups from one shop apart by date wherever they are named", () => {
    const groups = shopGroups(datedCart());
    expect(groupMoneyLabel(groups[0], groups)).toBe("Shop A · Mon 12 Oct");
    expect(groupMoneyLabel(groups[0], shopGroups(multiCart(2)))).toBe("Shop A");
    expect(addMoreFromLabel("Shop A", DATE_EARLY)).toBe("Add more from Shop A for Mon 12 Oct");
    expect(addMoreFromLabel("Shop A")).toBe("Add more from Shop A");
    expect(groupTag({ groupLabel: "Shop A", deadline: DATE_LATE })).toBe("Shop A · Tue 20 Oct");
    expect(groupTag({ groupLabel: null, deadline: DATE_LATE })).toBeNull();
    expect(allGroupsPhrase(datedBasket())).toBe("all 3 parts of this order");
    expect(allGroupsPhrase(placedBasket())).toBe("all 3 shops in this order");
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
      /^Shop B was cancelled\. .*refunded on its own.*rest of this order carries on/,
    );
    expect(groupStoppedNote(order({ state: "cancelled", refundDisposition: "cancelled" }))).toMatch(
      /refunded to you on its own/,
    );
  });

  it("says a group's refund leaves the others alone", () => {
    expect(groupStoppedNote(order({ refundHold: true }))).toMatch(/paused while GRIDGO reviews your refund/);
    expect(groupStoppedNote(order({ refundDisposition: "fulfilled_with_refund", state: "completed" }))).toMatch(
      /refunded to you\. The rest of this order/,
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
