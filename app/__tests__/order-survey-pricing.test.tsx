import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderSurveyScreen from "@/app/order/survey";
import { EMPTY_SURVEY_DRAFT } from "@/lib/survey";
import { useSurvey } from "@/store/survey";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { sentSurvey, survey, surveyOrder } from "@/test/surveyFixtures";

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

function serve(card: ReturnType<typeof survey>) {
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
describe("the survey's pricing questions", () => {
  it("asks the three after the price, all optional, without touching the voucher meter", async () => {
    serve(survey());
    useSurvey.setState({
      drafts: {
        [ORDER]: {
          ...EMPTY_SURVEY_DRAFT,
          fulfillmentStars: 4,
          easeStars: 5,
          directShopComparison: "cheaper",
          priceWorthTags: ["on_time"],
          orderAgainAtPrice: "yes",
        },
      },
    });
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByText("Compared with ordering directly from a print shop, GRIDGO was…")).toBeTruthy();
    expect(screen.getByText("What made the price worth it?")).toBeTruthy();
    expect(screen.getByText("Would you order again at this price?")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Compared with a print shop: Cheaper" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Worth it for: Ready on time").props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText("Price: It was not worth it").props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole("radio", { name: "Order again at this price: Yes" }).props.accessibilityState.selected).toBe(true);
    // Three pricing answers do not stand in for the counted price question.
    expect(screen.getByLabelText("2 of 3 answered. One more for your ₱15.00 voucher.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send answers" }).props.accessibilityState.disabled).toBe(true);
  });

  it("offers no door delivery on a collected order", async () => {
    serve(survey({ fulfillmentKind: "pickup" }));
    await renderInSafeArea(<OrderSurveyScreen />);

    expect(screen.getByLabelText("Worth it for: No trips to print shops")).toBeTruthy();
    expect(screen.queryByLabelText("Worth it for: Delivered to my door")).toBeNull();
  });

  it("sends the pricing answers with the three, and the voucher comes as before", async () => {
    serve(survey());
    useSurvey.setState({
      drafts: {
        [ORDER]: {
          ...EMPTY_SURVEY_DRAFT,
          fulfillmentStars: 5,
          easeStars: 4,
          priceFeeling: 4,
          directShopComparison: "about_the_same",
          priceWorthTags: ["not_worth_it"],
          orderAgainAtPrice: "maybe",
        },
      },
    });
    api.submitOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: sentSurvey() });
    await renderInSafeArea(<OrderSurveyScreen />);
    expect(screen.getByLabelText("Ready to send. Your ₱15.00 voucher comes with it.")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Send answers" }));

    await waitFor(() =>
      expect(api.submitOrderSurvey).toHaveBeenCalledWith(
        ORDER,
        expect.objectContaining({
          priceFeeling: 4,
          directShopComparison: "about_the_same",
          priceWorthTags: ["not_worth_it"],
          orderAgainAtPrice: "maybe",
        }),
      ),
    );
    expect(await screen.findByText(/₱15.00 voucher is in your wallet/)).toBeTruthy();
  });
});
