import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderSurveyScreen from "@/app/order/survey";
import { EMPTY_SURVEY_DRAFT } from "@/lib/survey";
import { useSurvey } from "@/store/survey";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { LOW_SCORE_REPORT, sentSurvey, survey, surveyOrder } from "@/test/surveyFixtures";

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
    submitOrderSurvey: jest.fn(),
    dismissOrderSurvey: jest.fn(),
    listVouchers: jest.fn(async () => ({ serverTime: new Date().toISOString(), vouchers: [] })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORDER = "ord_survey_1";

function serve(card: ReturnType<typeof survey> | null) {
  api.getOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: card });
  useSurvey.setState({ surveys: { [ORDER]: card }, status: { [ORDER]: "ready" } });
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useSurvey.getState().reset();
  useVouchers.getState().reset();
  api.getOrder.mockResolvedValue(surveyOrder());
  api.submitOrderSurvey.mockReset();
});

/* One press per file, and it goes last (AGENTS.md, "Running and testing"). */
describe("the post-order survey", () => {
  it("numbers the three questions that count and shows the voucher being earned", async () => {
    serve(survey());
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText("How was the delivery?")).toBeTruthy();
    expect(screen.getByText("How easy was ordering in the app?")).toBeTruthy();
    expect(screen.getByText("How did the price feel?")).toBeTruthy();
    expect(screen.getByText("If you have a moment")).toBeTruthy();
    expect(screen.getByLabelText("0 of 3 answered. 3 more for your ₱15.00 voucher.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send answers" }).props.accessibilityState.disabled).toBe(true);
    // Optional, and the way out says so.
    expect(screen.getByRole("button", { name: "Skip this survey" })).toBeTruthy();
    expect(await screen.findByText("Trade fair flyers")).toBeTruthy();
  });

  it("asks about the pick-up when the order was collected", async () => {
    serve(survey({ fulfillmentKind: "pickup" }));
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText("How was picking it up?")).toBeTruthy();
    expect(screen.queryByText("How was the delivery?")).toBeNull();
  });

  it("is plain that this survey earns no voucher during the weekly limit", async () => {
    serve(survey({ rewardEligible: false, nextRewardAt: new Date(Date.now() + 86_400_000).toISOString() }));
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText(/does not come with a voucher/)).toBeTruthy();
    expect(screen.getByLabelText("0 of 3 answered.")).toBeTruthy();
  });

  it("offers the tags once a question is answered, and is ready with three answers", async () => {
    serve(survey());
    useSurvey.setState({ drafts: { [ORDER]: { ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 4, easeStars: 5, priceFeeling: 3 } } });
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByLabelText("How was the delivery?: Arrived on time")).toBeTruthy();
    expect(screen.getByLabelText("Ordering: Easy checkout")).toBeTruthy();
    expect(screen.getByText("What price would have felt right?")).toBeTruthy();
    expect(screen.getByLabelText("Ready to send. Your ₱15.00 voucher comes with it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send answers" }).props.accessibilityState.disabled).toBe(false);
  });

  it("hands over the voucher with its code once sent", async () => {
    serve(sentSurvey());
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText("Thank you")).toBeTruthy();
    expect(screen.getByText(/₱15.00 voucher is in your wallet/)).toBeTruthy();
    expect(screen.getByText("7AFD 1234 5678 9ABC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the voucher code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "See your vouchers" })).toBeTruthy();
    // No low star score inside the window: thanks, and nothing else to do.
    expect(screen.queryByText("Report a problem with this order")).toBeNull();
  });

  it("offers the issue form after a low score while the window is open, and never a refund", async () => {
    serve(sentSurvey({ needsFollowUp: true, reportProblem: LOW_SCORE_REPORT }));
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByRole("button", { name: "Report a problem with this order" })).toBeTruthy();
    expect(screen.getByText(/do not report a problem or ask for a refund/)).toBeTruthy();
  });

  it("says when a survey has closed unanswered", async () => {
    serve(survey({ status: "expired", expiresAt: new Date(Date.now() - 60_000).toISOString() }));
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText("This survey has closed")).toBeTruthy();
  });

  it("sends the three answers and turns into the thank-you", async () => {
    serve(survey());
    useSurvey.setState({
      drafts: {
        [ORDER]: {
          ...EMPTY_SURVEY_DRAFT,
          fulfillmentStars: 2,
          fulfillmentTags: ["late"],
          easeStars: 4,
          priceFeeling: 4,
          expectedPrice: "900",
          recommendScore: 0,
        },
      },
    });
    api.submitOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: sentSurvey() });
    await renderInSafeArea(<OrderSurveyScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Send answers" }));

    await waitFor(() =>
      expect(api.submitOrderSurvey).toHaveBeenCalledWith(ORDER, {
        fulfillmentStars: 2,
        fulfillmentTags: ["late"],
        easeStars: 4,
        easeTags: [],
        priceFeeling: 4,
        expectedPriceMinor: 90000,
        directShopComparison: null,
        priceWorthTags: [],
        orderAgainAtPrice: null,
        qualityStars: null,
        recommendScore: 0,
        improvementNote: null,
      }),
    );
    expect(await screen.findByText("Thank you")).toBeTruthy();
    // The wallet is read again, so Account and the wallet show the voucher.
    expect(api.listVouchers).toHaveBeenCalled();
  });
});
