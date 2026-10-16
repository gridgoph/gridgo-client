import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import OrderSurveyScreen from "@/app/order/survey";
import { useSurvey } from "@/store/survey";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { LOW_SCORE_REPORT, sentSurvey, surveyOrder } from "@/test/surveyFixtures";

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_survey_1", from: "order" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getOrder: jest.fn(), getOrderSurvey: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

/* Its own file: one press per file (AGENTS.md, "Running and testing"). */
it("takes a low score back to the order's own issue form rather than reporting anything itself", async () => {
  const card = sentSurvey({ needsFollowUp: true, reportProblem: LOW_SCORE_REPORT });
  api.getOrder.mockResolvedValue(surveyOrder());
  api.getOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: card });
  useSurvey.setState({ surveys: { ord_survey_1: card }, status: { ord_survey_1: "ready" }, reportIntent: null });
  await renderInSafeArea(<OrderSurveyScreen />);

  fireEvent.press(screen.getByRole("button", { name: "Report a problem with this order" }));

  // Opened from the order, so the form is one step back, and open when it gets there.
  expect(useSurvey.getState().reportIntent).toBe("ord_survey_1");
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
