import { cleanup, screen } from "@testing-library/react-native";

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

/*
  The order screen once the order is with the client (report 5A28D524):
  only the check window with its live countdown, the rating and "Get help?",
  with everything else folded under View details. The presses that open
  those folds have a file each (one press per test, see AGENTS.md).
*/

it("opens a delivered order on the live check window, the rating and Get help", async () => {
  api.getOrder.mockResolvedValue(receivedOrder());
  await renderScreen(<OrderDetailScreen />);

  // The check window, counting down to the expiry on the order.
  expect(await screen.findByText("Check window closes in")).toBeTruthy();
  expect(screen.getByText(/^2[01]:\d\d:\d\d$/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Everything is fine" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy();

  // Help and the record are each one folded heading, saying what they hold.
  const help = screen.getByRole("button", { name: /^Get help\? Request a refund until .+, or message/ });
  expect(help.props.accessibilityState).toEqual({ expanded: false });
  const details = screen.getByRole("button", { name: /^View details\. History, specifications, artwork and payment$/ });
  expect(details.props.accessibilityState).toEqual({ expanded: false });

  // Everything else waits behind them.
  expect(screen.queryByText("Specifications")).toBeNull();
  expect(screen.queryByText("Payment details")).toBeNull();
  expect(screen.queryByText("Full history")).toBeNull();
  expect(screen.queryByText("Request a refund")).toBeNull();
  expect(screen.queryByText("Message GRIDGO")).toBeNull();
});

it("opens a finished order on the job complete, the rating and Get help", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Job complete")).toBeTruthy();
  // The window has closed, so no clock and no report.
  expect(screen.queryByText("Check window closes in")).toBeNull();
  expect(screen.queryByText("Report a problem")).toBeNull();
  // The rating is the finished job's one yellow action.
  expect(screen.getByRole("button", { name: "Rate this order" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Get help\? Message/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^View details\./ })).toBeTruthy();
  expect(screen.queryByText("Specifications")).toBeNull();
});

it("says a rated job was rated rather than asking again", async () => {
  api.getOrder.mockResolvedValue(completedOrder({ rated: true }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("You rated this order")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Rate this order" })).toBeNull();
});

it("keeps the full screen while a refund holds the job", async () => {
  api.getOrder.mockResolvedValue(receivedOrder({ refundHold: true }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Specifications")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^View details\./ })).toBeNull();
});
