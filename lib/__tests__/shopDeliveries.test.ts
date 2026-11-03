import { ApiError } from "@/lib/api";
import {
  combinedDateLine,
  deliveryChoice,
  deliveryChoiceError,
  deliveryFeeRowLabel,
  deliveryLabel,
  deliveryOf,
  groupTag,
  shopGroups,
} from "@/lib/basketGroups";
import { isStaleMatchRefusal } from "@/lib/matchSelection";
import { receiptFromInvoice } from "@/lib/receipt";
import { DATE_EARLY, DATE_LATE, datedInvoice } from "@/test/multiShopFixtures";
import { combinedShopCart, splitShopCart } from "@/test/shopDeliveryFixtures";

describe("one shop on two dates (gridgo-api#275)", () => {
  it("travels together by the earliest date, with the choice to deliver separately", () => {
    const cart = combinedShopCart();
    const [group] = shopGroups(cart);
    expect(group.deadline).toBe(DATE_EARLY);
    expect(combinedDateLine(group, cart)).toBe("Delivered together by Mon 12 Oct, the earliest date here.");
    expect(deliveryChoice(group, cart)).toEqual({
      separate: false,
      split: "by_deadline",
      note: "One delivery for each date (Mon 12 Oct, Tue 20 Oct), each with its own delivery fee.",
    });
  });

  it("once split, offers to combine on the shop's first delivery only", () => {
    const cart = splitShopCart();
    const [first, second] = shopGroups(cart);
    expect(deliveryChoice(first, cart)).toMatchObject({ separate: true, split: "none" });
    expect(deliveryChoice(second, cart)).toBeNull();
    expect(combinedDateLine(first, cart)).toBeNull();
  });

  it("offers nothing where splitting would change nothing", () => {
    const cart = combinedShopCart();
    const sameDay = { ...cart, lines: cart.lines.map((line) => ({ ...line, deadline: DATE_EARLY })) };
    const [group] = shopGroups(sameDay);
    expect(deliveryChoice(group, sameDay)).toBeNull();
    expect(combinedDateLine(group, sameDay)).toBeNull();
    // A shop with one product cannot be split at all.
    const single = { ...cart, groups: cart.groups!.map((g) => ({ ...g, canDeliverSeparately: false })) };
    expect(deliveryChoice(shopGroups(single)[0], single)).toBeNull();
    // A checked-out basket is never re-planned.
    const placed = { ...cart, state: "checked_out" as const };
    expect(deliveryChoice(shopGroups(placed)[0], placed)).toBeNull();
  });

  it("names each delivery only when a shop has more than one", () => {
    expect(deliveryOf({ deliveryNumber: 1, shopDeliveryCount: 2 })).toBe("Delivery 1 of 2");
    expect(deliveryOf({ deliveryNumber: 1, shopDeliveryCount: 1 })).toBeNull();
    expect(deliveryOf({})).toBeNull();
    expect(deliveryLabel({ label: "Shop A", deliveryNumber: 2, shopDeliveryCount: 2 })).toBe("Shop A, delivery 2 of 2");
    expect(deliveryLabel({ label: "Shop B" })).toBe("Shop B");
  });

  it("labels each delivery fee before paying from GRIDGO's quote", () => {
    const cart = splitShopCart();
    // The quote alone carries the numbering here: the groups do not repeat it.
    const quoteOnly = { ...cart, groups: cart.groups!.map(({ deliveryNumber, shopDeliveryCount, ...rest }) => rest) };
    const groups = shopGroups(quoteOnly);
    expect(groups.map((group) => deliveryFeeRowLabel(group, groups))).toEqual([
      "Shop A, delivery 1 of 2 · Mon 12 Oct",
      "Shop A, delivery 2 of 2 · Tue 20 Oct",
    ]);
    expect(groups.map((group) => group.deliveryFeeMinor)).toEqual([2500, 5000]);
    // A shop delivering once keeps the old row.
    const plain = [{ label: "Shop B", deadline: DATE_LATE }];
    expect(deliveryFeeRowLabel(plain[0], plain)).toBe("Delivery · Shop B");
  });

  it("names the products that cannot make the date when combining is refused", () => {
    const cart = splitShopCart();
    const refusal = new ApiError(409, { error: "deadline_not_met", lineIds: ["cline_1"], deadline: DATE_EARLY });
    expect(deliveryChoiceError(refusal, cart, "none")).toBe(
      "Tarpaulin Print cannot be ready by Mon 12 Oct, so these cannot go together. Keep separate deliveries, or choose a later date.",
    );
    const both = new ApiError(409, { error: "deadline_not_met", lineIds: ["cline_0", "cline_1"] });
    expect(deliveryChoiceError(both, cart, "by_deadline")).toBe(
      "Flyers and Tarpaulin Print cannot be ready in time. Choose a later date for them.",
    );
    expect(deliveryChoiceError(new ApiError(400, { error: "invalid_delivery_split" }), cart, "none")).toBe(
      "GRIDGO could not change how this shop delivers. Reopen your order and try again.",
    );
  });

  it("matches again when the offer was for a different delivery", () => {
    expect(isStaleMatchRefusal(new ApiError(409, { error: "select_token_delivery_mismatch" }))).toBe(true);
  });
});

describe("placed deliveries", () => {
  it("tags an order that is one of a shop's deliveries", () => {
    expect(
      groupTag({ groupLabel: "Shop A", deadline: DATE_EARLY, deliveryNumber: 1, shopDeliveryCount: 2 }),
    ).toBe("Shop A, delivery 1 of 2 · Mon 12 Oct");
    expect(groupTag({ groupLabel: "Shop A", deadline: DATE_EARLY })).toBe("Shop A · Mon 12 Oct");
  });

  it("heads each receipt section with its delivery", () => {
    const invoice = datedInvoice();
    invoice.groups = invoice.groups!.map((group, index) =>
      index === 1 ? group : { ...group, deliveryNumber: index === 2 ? 1 : 2, shopDeliveryCount: 2 },
    );
    const view = receiptFromInvoice(invoice);
    expect(view.groups!.map((group) => [group.letter, group.label])).toEqual([
      ["A", "Shop A, delivery 1 of 2"],
      ["B", "Shop B"],
      ["A", "Shop A, delivery 2 of 2"],
    ]);
  });
});
