import { screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { refund, refundOrder } from "@/test/refundFixtures";
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

it("makes an open refund the job's whole action zone and asks for no payment", async () => {
  // A delivered job inside its issue window, on the old two-half plan with the
  // balance still open: without the hold it would ask for the balance and for
  // "Everything is fine".
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "issue_window_open",
      refundHold: true,
      issueWindowOpenedAt: "2026-09-28T09:00:00+08:00",
      issueWindowExpiresAt: "2099-09-29T09:00:00+08:00",
    }),
  );
  api.listOrderRefunds.mockResolvedValue([refund({ status: "reviewed", version: 2 })]);
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Operations is working out your refund")).toBeTruthy();
  expect(screen.getByText("View refund")).toBeTruthy();
  expect(screen.queryByText("Everything is fine")).toBeNull();
  expect(screen.queryByText("Report a problem")).toBeNull();
  expect(screen.queryByText("Request a refund")).toBeNull();
});
