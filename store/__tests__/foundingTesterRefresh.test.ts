import * as api from "@/lib/api";
import { useSession } from "@/store/session";
import { useSurvey } from "@/store/survey";
import { useVouchers } from "@/store/vouchers";
import { EMPTY_SURVEY_DRAFT } from "@/lib/survey";

/**
 * The third mission usually lands on a survey, and the label can also arrive
 * on a resume: either way the account and the wallet are read again, so the
 * card, the label and the voucher show without a restart.
 */

const EARNED: api.FoundingTester = {
  eligible: true,
  label: "Founding Tester",
  awardedAt: "2026-10-20T08:00:00.000Z",
  missions: { placed: true, received: true, rated: true },
  completedCount: 3,
  rewardStatus: "issued",
  reward: { id: "vch_1", valueMinor: 1500, expiresAt: "2026-11-19T08:00:00.000Z" },
};
const CLIENT = { id: "u1", email: "client@gridgo.local", name: "Client", role: "client" as const };
const OPEN = { ...EARNED, label: null, awardedAt: null, reward: null, rewardStatus: "pending" };

beforeEach(() => {
  jest.restoreAllMocks();
  useSession.setState({ user: { ...CLIENT, foundingTester: OPEN }, source: "clerk", signingOut: false });
});

it("reads the account again after a survey goes in", async () => {
  const survey = { orderId: "ord_1", fulfillmentKind: "delivery", status: "open" } as unknown as api.OrderSurvey;
  useSurvey.setState({
    surveys: { ord_1: survey },
    drafts: { ord_1: { ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 5, easeStars: 5, priceFeeling: 3 } },
    busy: {},
  });
  jest.spyOn(api, "submitOrderSurvey").mockResolvedValue({ serverTime: new Date().toISOString(), survey });
  jest.spyOn(api, "listVouchers").mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [] });
  const getAccount = jest.spyOn(api, "getAccount").mockResolvedValue({ ...CLIENT, foundingTester: EARNED });

  await useSurvey.getState().submit("ord_1");

  expect(getAccount).toHaveBeenCalled();
});

it("reads the wallet again the moment the label arrives, and only then", () => {
  const load = jest.fn(async () => undefined);
  useVouchers.setState({ load });

  useSession.setState({ user: { ...CLIENT, foundingTester: { ...OPEN, completedCount: 2 } } });
  expect(load).not.toHaveBeenCalled();

  useSession.setState({ user: { ...CLIENT, foundingTester: EARNED } });
  expect(load).toHaveBeenCalledTimes(1);

  // The same stamp read again (a resume, a survey retry) is not news.
  useSession.setState({ user: { ...CLIENT, foundingTester: { ...EARNED } } });
  expect(load).toHaveBeenCalledTimes(1);
});
