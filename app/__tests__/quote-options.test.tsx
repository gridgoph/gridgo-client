import { screen } from "@testing-library/react-native";

import QuoteScreen from "@/app/quotes/[id]";
import { publishedQuote } from "@/test/quoteRequest";
import { renderScreen } from "@/test/renderScreen";

/**
 * The options a client chooses from (gridgo-api#226): A, B and C with one
 * all-in price, production time and whether each is ready before the event
 * date — and never a shop, whatever the payload carries.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "qreq_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getQuoteRequest: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("shows the options as A and B with no shop identity", async () => {
  const quote = publishedQuote();
  // A leak from the server must still never reach the screen.
  Object.assign(quote.options[0], { shopName: "Secret Print Shop", supplierId: "user_shop", priceMinor: 300000 });
  api.getQuoteRequest.mockResolvedValue(quote);
  await renderScreen(<QuoteScreen />);

  expect(await screen.findByText("Option A")).toBeTruthy();
  expect(screen.getByText("Option B")).toBeTruthy();
  expect(screen.getByText("Options ready")).toBeTruthy();
  expect(screen.getByText("MATCHED FOR COST")).toBeTruthy();
  expect(screen.getByText("₱3,450.00")).toBeTruthy();
  expect(screen.getByText("₱4,120.00")).toBeTruthy();
  expect(screen.getByText("Made in 3 working days")).toBeTruthy();
  expect(screen.getByText("Ready before your date (Nov 20)")).toBeTruthy();
  expect(screen.getByText("Ready after your date (Nov 20)")).toBeTruthy();
  expect(screen.getByText(/^Prices held until /)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Accept option A" })).toBeTruthy();
  expect(screen.queryByText(/Secret Print Shop/)).toBeNull();
  expect(screen.queryByText(/₱3,000\.00/)).toBeNull();
});
