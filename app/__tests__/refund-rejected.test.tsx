import { screen } from "@testing-library/react-native";

import RefundScreen from "@/app/order/refund";
import { renderScreen } from "@/test/renderScreen";
import { refund, refundOrder } from "@/test/refundFixtures";

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

it("gives the rejection reason and a way to talk it through", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "production" }));
  api.listOrderRefunds.mockResolvedValue([
    refund({
      status: "rejected",
      version: 3,
      kind: "complaint",
      history: [
        { kind: "requested", reason: "Colours are off.", at: "2026-09-28T10:00:00+08:00" },
        { kind: "rejected", reason: "The proof you approved shows these exact colours.", at: "2026-09-28T11:00:00+08:00" },
      ],
    }),
  ]);
  await renderScreen(<RefundScreen />);

  expect((await screen.findAllByText("Not approved")).length).toBeGreaterThan(0);
  expect(screen.getByText("WHY IT WAS NOT APPROVED")).toBeTruthy();
  expect(screen.getByText("The proof you approved shows these exact colours.")).toBeTruthy();
  expect(screen.getByText("Message GRIDGO support")).toBeTruthy();
  expect(screen.getByText("Something is wrong with it")).toBeTruthy();
  expect(screen.queryByText("WHAT COMES BACK")).toBeNull();
  expect(screen.queryByLabelText(/Refund stage/)).toBeNull();
});
