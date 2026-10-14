import { cleanup, screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { useSurvey } from "@/store/survey";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { survey } from "@/test/surveyFixtures";

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

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useSurvey.getState().reset();
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrderSurvey.mockClear();
});

it("reads the survey with a handed-over order and offers it under the job", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "completed", rated: true, timeline: [] }));
  api.getOrderSurvey.mockResolvedValue({
    serverTime: new Date().toISOString(),
    survey: survey({ orderId: "ord_refund_1" }),
  });
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("How did your order go?")).toBeTruthy();
  expect(api.getOrderSurvey).toHaveBeenCalledWith("ord_refund_1");
  expect(screen.getByRole("button", { name: "Answer the survey" })).toBeTruthy();
});

it("never asks about a survey while the job is still going", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "production", timeline: [] }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(api.getOrderSurvey).not.toHaveBeenCalled();
  expect(screen.queryByText("How did your order go?")).toBeNull();
});
