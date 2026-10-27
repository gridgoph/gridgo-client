import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderSurveyScreen from "@/app/order/survey";
import { EMPTY_SURVEY_DRAFT } from "@/lib/survey";
import type { OrderShareRead } from "@/lib/api";
import { useOrderShare } from "@/store/orderShare";
import { useSurvey } from "@/store/survey";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { orderShare, shareRead } from "@/test/shareFixtures";
import { sentSurvey, survey, surveyOrder } from "@/test/surveyFixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_survey_1", from: "order" }),
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
    getOrderSurvey: jest.fn(),
    submitOrderSurvey: jest.fn(),
    dismissOrderSurvey: jest.fn(),
    prepareOrderShare: jest.fn(),
    listVouchers: jest.fn(async () => ({ serverTime: new Date().toISOString(), vouchers: [] })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORDER = "ord_survey_1";

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSurvey.getState().reset();
  useVouchers.getState().reset();
  useOrderShare.getState().reset();
  api.getOrder.mockResolvedValue(surveyOrder());
  const open = survey();
  api.getOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: open });
  useSurvey.setState({
    surveys: { [ORDER]: open },
    status: { [ORDER]: "ready" },
    drafts: { [ORDER]: { ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 5, easeStars: 5, priceFeeling: 3 } },
  });
  api.submitOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: sentSurvey() });
});

/* One press per file (AGENTS.md, "Running and testing"). */
it("does not push the card over wherever the client went while prepare was slow", async () => {
  let answer: (read: OrderShareRead) => void = () => undefined;
  api.prepareOrderShare.mockReturnValue(new Promise<OrderShareRead>((resolve) => (answer = resolve)));
  await renderInSafeArea(<OrderSurveyScreen />);

  fireEvent.press(screen.getByRole("button", { name: "Send answers" }));
  await waitFor(() => expect(api.prepareOrderShare).toHaveBeenCalledWith(ORDER));

  // The client taps Done before GRIDGO answers: the survey leaves the screen.
  await cleanup();
  await act(async () => answer(shareRead(orderShare({ orderId: ORDER }))));

  expect(mockPush).not.toHaveBeenCalled();
  expect(useOrderShare.getState().presenting).toBeNull();
  expect(useOrderShare.getState().hold).toBeNull();
});
