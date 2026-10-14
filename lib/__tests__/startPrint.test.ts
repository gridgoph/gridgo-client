import { startPrintHref } from "@/lib/startPrint";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { checkoutCart } from "@/test/checkoutFixtures";

describe("startPrintHref", () => {
  beforeEach(() => {
    useCart.getState().reset();
    useRequestDraft.getState().reset();
  });

  it("opens the catalogue when nothing is in progress", () => {
    expect(startPrintHref()).toBe("/request/category");
  });

  it("opens checkout when the basket has something in it", () => {
    useCart.setState({ cartId: "cart_1", cart: checkoutCart() });
    expect(startPrintHref()).toBe("/checkout");
  });

  // gridgoph/gridgo-client#250: an empty or finished basket is no basket.
  it("opens the catalogue when the remembered basket is empty", () => {
    useCart.setState({ cartId: "cart_1", cart: checkoutCart({ lines: [] }) });
    expect(startPrintHref()).toBe("/request/category");
  });

  it("opens the catalogue when the remembered basket has been checked out", () => {
    useCart.setState({
      cartId: "cart_1",
      cart: checkoutCart({ state: "checked_out", checkedOutOrderId: "ord_1" }),
    });
    expect(startPrintHref()).toBe("/request/category");
  });

  it("opens the catalogue when the remembered basket has not been read yet", () => {
    useCart.setState({ cartId: "cart_1", cart: null });
    expect(startPrintHref()).toBe("/request/category");
  });

  it("opens the stepper when a request is already in progress", () => {
    useRequestDraft.setState({ productId: "prod_flyers" });
    expect(startPrintHref()).toBe("/(tabs)/new-request");
  });

  it("opens the stepper over an empty remembered basket", () => {
    useCart.setState({ cartId: "cart_1", cart: checkoutCart({ lines: [] }) });
    useRequestDraft.setState({ productId: "prod_flyers" });
    expect(startPrintHref()).toBe("/(tabs)/new-request");
  });

  it("prefers the basket over a leftover stepper draft", () => {
    useCart.setState({ cartId: "cart_1", cart: checkoutCart() });
    useRequestDraft.setState({ productId: "prod_flyers" });
    expect(startPrintHref()).toBe("/checkout");
  });
});
