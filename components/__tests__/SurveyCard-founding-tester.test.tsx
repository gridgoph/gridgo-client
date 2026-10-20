import { cleanup, render, screen } from "@testing-library/react-native";

import { SurveyCard } from "@/components/survey/SurveyCard";
import { useSurvey } from "@/store/survey";
import { sentSurvey, survey } from "@/test/surveyFixtures";
import { voucher } from "@/test/voucherFixtures";

/* A Founding Tester survey on the order screen names no fixed amount. No presses. */

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

const ORDER = "ord_survey_1";
const show = (card: ReturnType<typeof survey>) => useSurvey.setState({ surveys: { [ORDER]: card }, status: { [ORDER]: "ready" } });

afterEach(async () => {
  await cleanup();
});

beforeEach(() => useSurvey.getState().reset());

it("says the survey is a Founding Tester step whose voucher comes with all five, without a fixed ₱15", async () => {
  show(survey({ rewardProgram: "founding_tester" }));
  await render(<SurveyCard orderId={ORDER} primary />);

  expect(screen.getByText("Counts as your Founding Tester survey step. Your voucher comes with all five steps.")).toBeTruthy();
  expect(screen.queryByText(/₱/)).toBeNull();
});

it("keeps the survey programme's ₱15 voucher line", async () => {
  show(survey({ rewardProgram: "survey" }));
  await render(<SurveyCard orderId={ORDER} primary />);
  expect(screen.getByText("₱15.00 voucher for the first three answers")).toBeTruthy();
});

it("draws the issued Founding Tester voucher's own amount once the answers are in", async () => {
  show(sentSurvey({ rewardProgram: "founding_tester", rewardStatus: "founding_tester", reward: voucher({ valueMinor: 2500 }) }));
  await render(<SurveyCard orderId={ORDER} primary />);
  expect(screen.getByText("Your ₱25.00 voucher is in your wallet. Open for its code.")).toBeTruthy();
});
