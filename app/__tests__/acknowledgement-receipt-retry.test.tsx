import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import AcknowledgementReceiptScreen from "@/app/order/acknowledgement-receipt";
import { issuedReceipt } from "@/test/acknowledgementReceiptFixtures";
import { completedOrder } from "@/test/receivedOrder";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getAcknowledgementReceipt: jest.fn(),
  getOrder: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

it("offers a retry when the read fails, and draws the receipt once it lands", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  api.getAcknowledgementReceipt
    .mockRejectedValueOnce(new TypeError("Network request failed"))
    .mockResolvedValue(issuedReceipt());
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Receipt did not load")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("AR-0000000001")).toBeTruthy();
  expect(screen.queryByText("Receipt did not load")).toBeNull();
});
