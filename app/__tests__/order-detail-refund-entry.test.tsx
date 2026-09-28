import { screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
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

it("offers a refund on a paid job, with what comes back said up front", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "payment_authorized", timeline: [] }));
  api.listOrderRefunds.mockResolvedValue([]);
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Request a refund")).toBeTruthy();
  expect(
    screen.getByText("Printing has not started, so everything you paid — ₱1,150.00 — comes back."),
  ).toBeTruthy();
});
