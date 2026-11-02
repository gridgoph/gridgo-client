import { fireEvent, screen } from "@testing-library/react-native";

import QuoteScreen from "@/app/quotes/[id]";
import { ApiError } from "@/lib/api";
import { publishedQuote, quoteRequest } from "@/test/quoteRequest";
import { renderScreen } from "@/test/renderScreen";

/** Accepting options that ran out is said plainly, and the quote reads expired. */

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

it("says the options expired and offers a new quote instead of checkout", async () => {
  const quote = publishedQuote();
  api.getQuoteRequest.mockResolvedValue(quote);
  api.acceptQuoteOption.mockRejectedValue(
    new ApiError(410, {
      error: "quote_expired",
      message: "This quote has expired.",
      quoteRequest: quoteRequest({ ...quote, status: "expired", validUntil: "2026-11-01T00:00:00.000Z" }),
    }),
  );
  await renderScreen(<QuoteScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "Accept option A" }));

  expect(await screen.findByText(/^These options are no longer valid/)).toBeTruthy();
  expect(screen.getByText("Expired")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Request a new quote" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Accept option/ })).toBeNull();
  expect(api.acceptQuoteOption).toHaveBeenCalledWith("qreq_1", "A", 4);
  expect(mockPush).not.toHaveBeenCalledWith("/checkout");
});
