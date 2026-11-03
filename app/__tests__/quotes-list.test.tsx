import { screen } from "@testing-library/react-native";

import QuotesScreen from "@/app/quotes/index";
import { quoteRequest } from "@/test/quoteRequest";
import { renderScreen } from "@/test/renderScreen";

/** My quotes says where each request stands in plain words (gridgo-api#226). */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listQuoteRequests: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("labels waiting, ready, accepted, expired and cancelled quotes", async () => {
  api.listQuoteRequests.mockResolvedValue([
    quoteRequest({ id: "q1", status: "quoting" }),
    quoteRequest({ id: "q2", status: "published", validUntil: "2099-01-01T00:00:00.000Z" }),
    quoteRequest({ id: "q3", status: "accepted", validUntil: "2099-01-01T00:00:00.000Z" }),
    quoteRequest({ id: "q4", status: "published", validUntil: "2020-01-01T00:00:00.000Z" }),
    quoteRequest({ id: "q5", status: "cancelled" }),
  ]);
  await renderScreen(<QuotesScreen />);

  expect(await screen.findByText("Waiting for options")).toBeTruthy();
  expect(screen.getByText("Options ready")).toBeTruthy();
  expect(screen.getByText("Accepted")).toBeTruthy();
  // Past its validity, a published quote is expired before the sweep says so.
  expect(screen.getByText("Expired")).toBeTruthy();
  expect(screen.getByText("Cancelled")).toBeTruthy();
});
