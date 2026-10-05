import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { rescheduleRequest } from "@/test/shopChangeFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOUR = 3_600_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
});

it("asks before declining, saying work stops and what GRIDGO does next", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({ rescheduleRequest: rescheduleRequest({ requestedAt: iso(-HOUR), expiresAt: iso(23 * HOUR) }) }),
  );
  api.answerReschedule.mockResolvedValue(rescheduleRequest({ status: "declined", resolution: "no_match" }));
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByText("Decline"));
  expect(await screen.findByText("Decline the new date?")).toBeTruthy();
  expect(screen.getByText(/Work on this order stops/)).toBeTruthy();
  fireEvent.press(screen.getByText("Decline the new date"));
  await waitFor(() => expect(api.answerReschedule).toHaveBeenCalledWith("ord_refund_1", "resched_1", "decline"));
});
