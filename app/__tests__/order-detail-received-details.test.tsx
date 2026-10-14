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

it("puts the history, specifications, artwork and payment one tap away under View details", async () => {
  api.getOrder.mockResolvedValue(receivedOrder());
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByRole("button", { name: /^View details\./ }));

  expect(await screen.findByText("Specifications")).toBeTruthy();
  expect(screen.getByText("Artwork and references")).toBeTruthy();
  expect(screen.getByText("Payment details")).toBeTruthy();
  expect(screen.getByText("Full history")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^View details\./ }).props.accessibilityState).toEqual({
    expanded: true,
  });
  // Opening the record does not open help.
  expect(screen.queryByText("Message GRIDGO")).toBeNull();
});
