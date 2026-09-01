import { ApiError, type Cart } from "@/lib/api";
import { cartHasContent, useCart } from "@/store/cart";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getCart: jest.fn(), createCart: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  useCart.getState().reset();
  api.getCart.mockReset();
  api.createCart.mockReset();
});

describe("holding a basket", () => {
  it("re-reads the whole basket from the id this phone kept", async () => {
    useCart.setState({ cartId: "cart_1" });
    api.getCart.mockResolvedValue(cart({ version: 4 }));

    await useCart.getState().load();

    expect(api.getCart).toHaveBeenCalledWith("cart_1");
    expect(useCart.getState().cart?.version).toBe(4);
  });

  it("drops a basket that has already been paid for", async () => {
    // A checked-out cart is history, not a basket, and showing it as one would
    // let a client change an order that is already with Operations.
    useCart.setState({ cartId: "cart_1" });
    api.getCart.mockResolvedValue(cart({ state: "checked_out", checkedOutOrderId: "ord_1" }));

    await useCart.getState().load();

    expect(useCart.getState().cartId).toBeNull();
    expect(useCart.getState().cart).toBeNull();
  });

  it("drops an id GRIDGO no longer knows, without calling it an error", async () => {
    useCart.setState({ cartId: "cart_gone" });
    api.getCart.mockRejectedValue(new ApiError(404, { error: "cart_not_found" }));

    await useCart.getState().load();

    expect(useCart.getState().cartId).toBeNull();
    expect(useCart.getState().error).toBeNull();
  });

  it("keeps the id through a connection problem, and says so", async () => {
    useCart.setState({ cartId: "cart_1" });
    api.getCart.mockRejectedValue(new Error("Network request failed"));

    await useCart.getState().load();

    expect(useCart.getState().cartId).toBe("cart_1");
    expect(useCart.getState().error).toContain("Network request failed");
  });

  it("has nothing to read before anything has been added", async () => {
    await useCart.getState().load();
    expect(api.getCart).not.toHaveBeenCalled();
  });
});

describe("ensure", () => {
  it("opens a basket the first time and reuses it after", async () => {
    api.createCart.mockResolvedValue(cart());

    const first = await useCart.getState().ensure();
    const second = await useCart.getState().ensure();

    expect(first).toBe("cart_1");
    expect(second).toBe("cart_1");
    expect(api.createCart).toHaveBeenCalledTimes(1);
  });
});

describe("run", () => {
  it("hands the work a basket id and marks the app busy while it goes", async () => {
    api.createCart.mockResolvedValue(cart());
    let sawBusy = false;

    const result = await useCart.getState().run(async (cartId) => {
      sawBusy = useCart.getState().busy;
      return cartId;
    });

    expect(result).toBe("cart_1");
    expect(sawBusy).toBe(true);
    expect(useCart.getState().busy).toBe(false);
  });

  it("stops being busy even when the work fails", async () => {
    api.createCart.mockResolvedValue(cart());

    await expect(
      useCart.getState().run(async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(useCart.getState().busy).toBe(false);
  });
});

describe("after checkout and after sign-out", () => {
  it("spends the basket on checkout", () => {
    useCart.setState({ cartId: "cart_1", cart: cart() });
    useCart.getState().clear();
    expect(useCart.getState().cartId).toBeNull();
  });

  it("forgets the basket when the person leaves", () => {
    useCart.setState({ cartId: "cart_1", cart: cart(), busy: true, error: "x" });
    useCart.getState().reset();
    expect(useCart.getState()).toMatchObject({ cartId: null, cart: null, busy: false, error: null });
  });

  it("knows when there is anything in it", () => {
    expect(cartHasContent({ cart: null })).toBe(false);
    expect(cartHasContent({ cart: cart() })).toBe(false);
    expect(
      cartHasContent({
        cart: cart({
          lines: [
            {
              id: "cline_1",
              supplierId: "s",
              catalogItemId: "i",
              quantity: 1,
              optionIds: [],
              measurement: null,
              structuredSpec: {},
              artworkFileId: null,
              mockupFileId: null,
              dropoff: null,
              sortOrder: 0,
              listing: null,
              lineSubtotalMinor: 0,
            },
          ],
        }),
      }),
    ).toBe(true);
  });
});
