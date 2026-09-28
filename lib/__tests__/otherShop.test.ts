import { ApiError } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  basketContentsPhrase,
  isOtherShopRefusal,
  otherShopExplanation,
  startOverConfirmation,
} from "@/lib/otherShop";
import { basketLine, otherShopRefusal } from "@/test/otherShopFixtures";

describe("telling the one-shop rule apart from a failure", () => {
  it("recognises gridgo-api's refusal of a line from a second shop", () => {
    expect(isOtherShopRefusal(otherShopRefusal())).toBe(true);
  });

  it("does not mistake a network failure or another refusal for it", () => {
    expect(isOtherShopRefusal(new TypeError("Network request failed"))).toBe(false);
    expect(isOtherShopRefusal(new ApiError(409, { error: "below_minimum_quantity" }))).toBe(false);
    expect(isOtherShopRefusal(new ApiError(500, { error: "cart_belongs_to_another_shop" }))).toBe(false);
    expect(isOtherShopRefusal(new ApiError(409, "cart_belongs_to_another_shop"))).toBe(false);
  });

  it("is never worded as a connection problem", () => {
    const copy = userFacingError(otherShopRefusal(), "Check your connection and try again.");
    expect(copy).not.toMatch(/connect|network|reach/i);
    expect(copy).toMatch(/different shop/);
  });

  it("still words a request that never reached GRIDGO as a connection problem", () => {
    expect(userFacingError(new TypeError("Network request failed"), "fallback")).toMatch(
      /Cannot reach the server/,
    );
  });
});

describe("naming what is in the basket", () => {
  it("names one, two, or two and a count, from the listings", () => {
    const flyers = basketLine({ name: "Flyers" });
    const stickers = basketLine({ name: "Stickers" });
    const banner = basketLine({ name: "Banner" });
    const mugs = basketLine({ name: "Mugs" });
    expect(basketContentsPhrase([flyers])).toBe("Flyers");
    expect(basketContentsPhrase([flyers, stickers])).toBe("Flyers and Stickers");
    expect(basketContentsPhrase([flyers, stickers, banner, mugs])).toBe("Flyers, Stickers and 2 more");
  });

  it("explains the rule and both ways on without naming a shop", () => {
    const line = basketLine({ name: "Tarpaulin banner" });
    const copy = otherShopExplanation([line]);
    expect(copy).toContain("Tarpaulin banner");
    expect(copy).toMatch(/check out your order first/);
    expect(copy).toMatch(/start a new order with this/);
    expect(copy).not.toContain(line.supplierId);
  });

  it("says exactly what starting over removes, and that it cannot be undone", () => {
    const one = startOverConfirmation([basketLine({ name: "Tarpaulin banner" })]);
    expect(one.body).toBe(
      "This removes Tarpaulin banner from your order, along with any artwork you added to it. It cannot be undone.",
    );
    const two = startOverConfirmation([basketLine({ name: "Flyers" }), basketLine({ name: "Stickers" })]);
    expect(two.body).toContain("Flyers and Stickers");
    expect(two.body).toContain("added to them");
    expect(startOverConfirmation([]).body).toContain("everything in your order");
  });
});
