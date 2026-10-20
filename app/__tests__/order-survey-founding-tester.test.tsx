import { cleanup, screen } from "@testing-library/react-native";

import OrderSurveyScreen from "@/app/order/survey";
import { useSurvey } from "@/store/survey";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { survey, surveyOrder } from "@/test/surveyFixtures";

/* The survey screen for a Founding Tester survey: no fixed amount on the meter. No presses. */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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
    listVouchers: jest.fn(async () => ({ serverTime: new Date().toISOString(), vouchers: [] })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

it("counts the answers towards the Founding Tester step and names no fixed voucher", async () => {
  useSurvey.getState().reset();
  useVouchers.getState().reset();
  const card = survey({ rewardProgram: "founding_tester" });
  api.getOrder.mockResolvedValue(surveyOrder());
  api.getOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: card });
  useSurvey.setState({ surveys: { ord_survey_1: card }, status: { ord_survey_1: "ready" } });
  await renderInSafeArea(<OrderSurveyScreen />);

  expect(await screen.findByText("0 of 3 answered. 3 more to finish your Founding Tester survey step.")).toBeTruthy();
  expect(screen.queryByText(/voucher for the first three|₱15/)).toBeNull();
});
