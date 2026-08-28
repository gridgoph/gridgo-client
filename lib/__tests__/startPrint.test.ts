import { startPrintHref } from "@/lib/startPrint";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";

describe("startPrintHref", () => {
  beforeEach(() => {
    useCart.getState().reset();
    useRequestDraft.getState().reset();
  });

  it("opens the catalogue when nothing is in progress", () => {
    expect(startPrintHref()).toBe("/request/category");
  });

  it("opens checkout when a basket is already started", () => {
    useCart.setState({ cartId: "cart_1" });
    expect(startPrintHref()).toBe("/checkout");
  });

  it("opens the stepper when a request is already in progress", () => {
    useRequestDraft.setState({ productId: "prod_flyers" });
    expect(startPrintHref()).toBe("/(tabs)/new-request");
  });

  it("prefers the basket over a leftover stepper draft", () => {
    useCart.setState({ cartId: "cart_1" });
    useRequestDraft.setState({ productId: "prod_flyers" });
    expect(startPrintHref()).toBe("/checkout");
  });
});
