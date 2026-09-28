import { screen } from "@testing-library/react-native";

import RefundScreen from "@/app/order/refund";
import { renderScreen } from "@/test/renderScreen";
import { approvedRefund, refundOrder } from "@/test/refundFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    listOrderRefunds: jest.fn(),
    getFile: jest.fn(async (fileId: string) => ({ fileId, detectedContentType: "image/png", purpose: "refund_qr" })),
    getFileDownloadUrl: jest.fn(async (fileId: string) => ({ fileId, url: `https://files.test/${fileId}`, expiresAt: "", expiresInSeconds: 60 })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("keeps an approved refund visibly unsent, with the fee inside Printing", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "cancelled", refundHold: true }));
  api.listOrderRefunds.mockResolvedValue([approvedRefund()]);
  await renderScreen(<RefundScreen />);

  expect(await screen.findByText("Approved · not sent yet")).toBeTruthy();
  expect(screen.getByText("₱710.00 is approved — not sent yet")).toBeTruthy();
  expect(screen.getByLabelText("Refund stage 3 of 4: Approved")).toBeTruthy();
  // Printing carries the returned fee; no peso figure names GRIDGO's cut.
  expect(screen.getByText("₱660.00")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.queryByText("₱60.00")).toBeNull();
  expect(screen.queryByText("₱600.00")).toBeNull();
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
  expect(screen.getByText("Partial refund · ₱710.00 of ₱1,150.00 paid")).toBeTruthy();
  // Operations' decision reason is the client's to read.
  expect(screen.getByText("The shop keeps what it spent on printing so far and waives the rest.")).toBeTruthy();
  // No transfer is recorded, so there is no transfer section and nothing says refunded.
  expect(screen.queryByText("THE TRANSFER")).toBeNull();
  expect(screen.queryByText("Refunded")).toBeNull();
  // The QR can still change; withdrawal is gone once an amount is approved.
  expect(screen.getByText("Change receiving QR")).toBeTruthy();
  expect(screen.queryByText("Withdraw request")).toBeNull();
});
