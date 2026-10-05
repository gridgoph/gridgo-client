import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { DELIVERY_MISMATCH_REASON } from "@/lib/handover";
import { deliveryHandover } from "@/test/handoverFixtures";
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
jest.mock("@/lib/osrm", () => ({
  ...jest.requireActual("@/lib/osrm"),
  fetchRoute: jest.fn(async () => null),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// Two presses: the only test in this file (see AGENTS.md, Running and testing).
it("reports a code mismatch to Operations only after the client confirms", async () => {
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
  api.getOrderHandover.mockResolvedValue(deliveryHandover());
  api.escalateHandover.mockResolvedValue(undefined);
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByText("Tell Operations the codes do not match"));
  expect(await screen.findByText("Tell Operations the codes do not match?")).toBeTruthy();
  expect(api.escalateHandover).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Tell Operations"));
  await waitFor(() =>
    expect(api.escalateHandover).toHaveBeenCalledWith("ord_refund_1", DELIVERY_MISMATCH_REASON),
  );
  expect(await screen.findByText(/Operations has your report/)).toBeTruthy();
});
