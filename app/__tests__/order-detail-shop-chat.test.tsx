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

const reminder = "Price, specification and deadline changes require a formal change request. Chat messages do not change the order.";

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
});

it("offers the masked conversation with the print shop once it has accepted", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "production",
      timeline: [],
      clientShopChat: { status: "open", closesAt: null, participants: ["Client", "Print shop", "GRIDGO"], reminder },
    }),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByLabelText("Message the print shop")).toBeTruthy();
  expect(screen.getByText("Message GRIDGO")).toBeTruthy();
});

it("offers nothing to open before the shop accepts", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "supplier_assignment",
      timeline: [],
      clientShopChat: { status: "unavailable", closesAt: null, participants: ["Client", "Print shop", "GRIDGO"], reminder },
    }),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Message GRIDGO")).toBeTruthy();
  expect(screen.queryByLabelText(/print shop/)).toBeNull();
});
