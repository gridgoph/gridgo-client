import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { readyByDate } from "@/lib/readyTime";
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

/* gridgo-supplier#101: the shop asked for more time. One press, last. */
const pending = () =>
  rescheduleRequest({ requestedAt: iso(-3 * HOUR), expiresAt: iso(21 * HOUR - 60_000) });

it("shows the proposed date, the reason and the 24-hour window", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: pending() }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Your shop asked for more time")).toBeTruthy();
  expect(screen.getByText("The large-format printer needs a part replaced.")).toBeTruthy();
  expect(screen.getByText(readyByDate("2026-10-10T17:00:00+08:00")!)).toBeTruthy();
  expect(screen.getByText("3 days later")).toBeTruthy();
  expect(screen.getByText("20 hours left to answer")).toBeTruthy();
  expect(screen.getByText(/your original date stays and Operations will/)).toBeTruthy();
  expect(screen.getByText("Accept the new date")).toBeTruthy();
  expect(screen.getByText("Decline")).toBeTruthy();
});

it("says the original date stands once the window has passed", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({ rescheduleRequest: rescheduleRequest({ requestedAt: iso(-25 * HOUR), expiresAt: iso(-HOUR) }) }),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("The time to answer passed")).toBeTruthy();
  expect(screen.queryByText("Accept the new date")).toBeNull();
});

it("tells the client Operations will contact them when the request is routed there", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({ rescheduleRequest: rescheduleRequest({ status: "operations_required", resolution: "operations_required" }) }),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Operations will contact you")).toBeTruthy();
  expect(screen.queryByText("Accept the new date")).toBeNull();
});

it("leaves the order alone after the new date is accepted", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: rescheduleRequest({ status: "accepted" }) }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(screen.queryByText("Your shop asked for more time")).toBeNull();
});

it("accepts the new date", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: pending() }));
  api.answerReschedule.mockResolvedValue(rescheduleRequest({ status: "accepted" }));
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByText("Accept the new date"));
  await waitFor(() => expect(api.answerReschedule).toHaveBeenCalledWith("ord_refund_1", "resched_1", "accept"));
});
