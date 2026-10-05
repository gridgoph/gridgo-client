import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { hubHandover } from "@/test/handoverFixtures";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

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

// Two presses: the only test in this file (see AGENTS.md, Running and testing).
it("asks before requesting redelivery, says the cost is the client's, then sends it", async () => {
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrder.mockResolvedValue(refundOrder({ fulfillmentMode: "pickup", state: "awaiting_collection" }));
  api.getOrderHandover.mockResolvedValue(hubHandover({ missedDays: 3, operationsRequired: true }));
  api.requestHubRedelivery.mockResolvedValue({ status: "pending_operations", costAccepted: true, at: "2026-10-06T02:00:00Z" });
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByText("Ask for redelivery"));
  expect(await screen.findByText("Ask for redelivery?")).toBeTruthy();
  expect(screen.getByText(/The delivery is at your own cost/)).toBeTruthy();
  expect(api.requestHubRedelivery).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByText("Ask for redelivery").at(-1)!);
  await waitFor(() => expect(api.requestHubRedelivery).toHaveBeenCalledWith("ord_refund_1"));
});
