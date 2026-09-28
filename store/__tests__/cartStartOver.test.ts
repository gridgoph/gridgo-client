import { ApiError } from "@/lib/api";
import { useCart } from "@/store/cart";
import { basket, basketLine, freshBasketWithFlyers } from "@/test/otherShopFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, createCart: jest.fn(), addCartLine: jest.fn(), removeCartLine: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HELD = basket({
  lines: [basketLine({ name: "Tarpaulin banner" }), basketLine({ name: "Stickers" })],
});

beforeEach(() => {
  useCart.getState().reset();
  api.createCart.mockReset();
  api.addCartLine.mockReset();
  api.removeCartLine.mockReset();
  useCart.setState({ cartId: HELD.id, cart: HELD });
  api.createCart.mockResolvedValue(basket({ id: "cart_fresh", lines: [] }));
  api.removeCartLine.mockResolvedValue(basket({ lines: [] }));
});

describe("starting a new order for a product from another shop", () => {
  it("fills a new basket, then empties the old one", async () => {
    api.addCartLine.mockResolvedValue(freshBasketWithFlyers());

    const result = await useCart
      .getState()
      .startOver((cartId) => api.addCartLine(cartId, { catalogItemId: "sci_flyers" }));

    expect(api.addCartLine).toHaveBeenCalledWith("cart_fresh", { catalogItemId: "sci_flyers" });
    expect(result.id).toBe("cart_fresh");
    expect(useCart.getState().cartId).toBe("cart_fresh");
    expect(useCart.getState().cart?.lines.map((line) => line.id)).toEqual(["cline_new"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.removeCartLine.mock.calls).toEqual([
      ["cart_held", "cline_tarpaulin_banner"],
      ["cart_held", "cline_stickers"],
    ]);
    expect(useCart.getState().busy).toBe(false);
  });

  it("keeps the old basket, untouched, when the new line is refused", async () => {
    api.addCartLine.mockRejectedValue(new ApiError(409, { error: "below_minimum_quantity" }));

    await expect(
      useCart.getState().startOver((cartId) => api.addCartLine(cartId, { catalogItemId: "sci_flyers" })),
    ).rejects.toBeInstanceOf(ApiError);

    expect(useCart.getState().cartId).toBe("cart_held");
    expect(useCart.getState().cart?.lines).toHaveLength(2);
    expect(api.removeCartLine).not.toHaveBeenCalled();
    expect(useCart.getState().busy).toBe(false);
  });
});
