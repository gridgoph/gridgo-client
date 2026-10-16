import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { useSurvey } from "@/store/survey";
import { completedOrder, receivedOrder } from "@/test/receivedOrder";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
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

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useSurvey.getState().reset();
  api.listOrderRefunds.mockResolvedValue([]);
});

it("keeps every way to get help behind Get help", async () => {
  api.getOrder.mockResolvedValue(receivedOrder());
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByRole("button", { name: /^Get help\?/ }));

  // The refund, with its deadline, and the way to Operations.
  expect(await screen.findByText("Request a refund")).toBeTruthy();
  expect(screen.getByText(/^You can ask until /)).toBeTruthy();
  expect(screen.getByText("Message GRIDGO")).toBeTruthy();
  expect(screen.queryByText("Specifications")).toBeNull();
});
