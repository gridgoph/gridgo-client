import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";

import { SurveyCard } from "@/components/survey/SurveyCard";
import { useSurvey } from "@/store/survey";
import { sentSurvey, survey } from "@/test/surveyFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, dismissOrderSurvey: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORDER = "ord_survey_1";
const show = (card: ReturnType<typeof survey> | null) =>
  useSurvey.setState({ surveys: { [ORDER]: card }, status: { [ORDER]: "ready" } });

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useSurvey.getState().reset();
  mockPush.mockClear();
});

/* One press per file, and it goes last (AGENTS.md, "Running and testing"). */
describe("the survey on the order screen", () => {
  it("offers an open survey with its reward, its deadline and a way to skip", async () => {
    show(survey());
    await render(<SurveyCard orderId={ORDER} primary />);

    expect(screen.getByText("How did your order go?")).toBeTruthy();
    expect(screen.getByText("₱15.00 voucher for the first three answers")).toBeTruthy();
    expect(screen.getByText(/^Open until /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Answer the survey" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip the survey" })).toBeTruthy();
  });

  it("never promises a voucher this survey cannot earn", async () => {
    show(survey({ rewardEligible: false }));
    await render(<SurveyCard orderId={ORDER} primary={false} />);

    expect(screen.queryByText(/voucher for the first three answers/)).toBeNull();
  });

  it("keeps a skipped survey one quiet row away until it closes", async () => {
    show(survey({ dismissedAt: new Date().toISOString() }));
    await render(<SurveyCard orderId={ORDER} primary />);

    expect(screen.getByText("Order survey")).toBeTruthy();
    expect(screen.getByText(/Skipped\. You can still answer it\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Answer the survey" })).toBeNull();
  });

  it("thanks once sent, with the way back to the voucher", async () => {
    show(sentSurvey());
    await render(<SurveyCard orderId={ORDER} primary />);

    expect(screen.getByText("Survey sent. Thank you.")).toBeTruthy();
    expect(screen.getByText(/voucher is in your wallet/)).toBeTruthy();
  });

  it("draws nothing for an order without a survey, or one that closed unanswered", async () => {
    show(survey({ status: "expired", expiresAt: new Date(Date.now() - 1000).toISOString() }));
    await render(<SurveyCard orderId={ORDER} primary />);

    expect(screen.queryByTestId("survey-card")).toBeNull();
    expect(screen.queryByTestId("survey-row")).toBeNull();
  });

  it("skips: GRIDGO is told, and the card folds to its quiet row", async () => {
    show(survey());
    const skipped = survey({ dismissedAt: new Date().toISOString() });
    api.dismissOrderSurvey.mockResolvedValue({ serverTime: new Date().toISOString(), survey: skipped });
    await render(<SurveyCard orderId={ORDER} primary />);

    fireEvent.press(screen.getByRole("button", { name: "Skip the survey" }));

    expect(await screen.findByText("Order survey")).toBeTruthy();
    expect(api.dismissOrderSurvey).toHaveBeenCalledWith(ORDER);
  });
});
