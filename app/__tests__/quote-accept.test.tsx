import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import QuoteScreen from "@/app/quotes/[id]";
import { useCart } from "@/store/cart";
import { voucherCart } from "@/test/checkoutVoucherHarness";
import { publishedQuote } from "@/test/quoteRequest";
import { renderScreen } from "@/test/renderScreen";

/**
 * Accepting an option opens it as its own basket and goes straight to the
 * ordinary checkout (gridgo-api#226).
 */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "qreq_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getQuoteRequest: jest.fn(), acceptQuoteOption: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("takes the chosen option to checkout in its own basket", async () => {
  const quote = publishedQuote();
  const cart = { ...voucherCart(), id: "cart_quote" };
  api.getQuoteRequest.mockResolvedValue(quote);
  api.acceptQuoteOption.mockResolvedValue({
    quoteRequest: { ...quote, status: "accepted", acceptedOption: "B", cartId: "cart_quote" },
    cart,
  });
  await renderScreen(<QuoteScreen />);

  fireEvent.press(await screen.findByRole("radio", { name: /^Option B/ }));
  await screen.findByRole("button", { name: "Accept option B" });
  fireEvent.press(screen.getByRole("button", { name: "Accept option B" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/checkout"));
  expect(api.acceptQuoteOption).toHaveBeenCalledWith("qreq_1", "B", 4);
  expect(useCart.getState().cartId).toBe("cart_quote");
});
