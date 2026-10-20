import AsyncStorage from "@react-native-async-storage/async-storage";

import * as api from "@/lib/api";
import { INSTALLATION_ID_KEY, installationId, isUuidV4, newUuidV4, resetInstallationIdCacheForTests } from "@/lib/installationId";
import { resetFoundingTesterCallsForTests, useFoundingTester } from "@/store/foundingTester";
import { useSession } from "@/store/session";
import { refundOrder } from "@/test/refundFixtures";

/**
 * The installation ID and the two calls only this app makes for the client
 * (gridgo-api docs/FOUNDING_TESTER_API.md): one UUID v4 per installation, sent
 * for every account that signs in on it, and "Track your order" once per order.
 */

const OPEN: api.FoundingTester = {
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: true, placed: true, tracked: false, received: false, rated: false },
  completedCount: 2,
  rewardStatus: "pending",
  reward: null,
};
const INVITES: api.TesterInvites = { code: null, link: null, invited: 0, joined: 0, completed: 0 };
const read = (foundingTester: api.FoundingTester = OPEN): api.FoundingTesterRead => ({
  serverTime: new Date().toISOString(),
  foundingTester,
  invites: INVITES,
});
const client = (id: string) => ({ id, email: `${id}@example.test`, name: id, role: "client" as const, foundingTester: OPEN });

/** Lets the subscriber's fire-and-forget calls settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  resetInstallationIdCacheForTests();
  resetFoundingTesterCallsForTests();
  useSession.setState({ user: null, signingOut: false, source: "clerk" });
});

it("makes a UUID v4", () => {
  for (let i = 0; i < 20; i++) expect(isUuidV4(newUuidV4())).toBe(true);
  expect(isUuidV4("client-1234")).toBe(false);
});

it("makes the ID once and reads the same one back after a cold start", async () => {
  const first = await installationId();
  expect(isUuidV4(first)).toBe(true);
  expect(await AsyncStorage.getItem(INSTALLATION_ID_KEY)).toBe(first);

  resetInstallationIdCacheForTests();
  expect(await installationId()).toBe(first);
});

it("sends the same installation for every account that signs in on this phone, across a sign-out", async () => {
  const record = jest.spyOn(api, "recordTesterInstallation").mockImplementation(async () => read());

  useSession.setState({ user: client("user_a") } as never);
  await settle();
  await settle();
  expect(record).toHaveBeenCalledTimes(1);
  const sent = record.mock.calls[0][0];
  expect(isUuidV4(sent)).toBe(true);

  // Sign out the way the app does, then a different person signs in.
  useSession.getState().clearSession();
  useSession.setState({ user: client("user_b") } as never);
  await settle();
  await settle();

  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls[1][0]).toBe(sent);
  expect(await AsyncStorage.getItem(INSTALLATION_ID_KEY)).toBe(sent);
});

it("lays GRIDGO's answer onto the account, so the step ticks without another read", async () => {
  jest.spyOn(api, "recordTesterInstallation").mockResolvedValue(read());
  const track = jest
    .spyOn(api, "acknowledgeTesterTracking")
    .mockResolvedValue(read({ ...OPEN, missions: { ...OPEN.missions, tracked: true }, completedCount: 3 }));
  useSession.setState({ user: client("user_a") } as never);
  await settle();

  await useFoundingTester.getState().acknowledgeTracking(refundOrder({ id: "ord_paid", state: "production" }));

  expect(track).toHaveBeenCalledWith("ord_paid", expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(useSession.getState().user?.foundingTester?.missions.tracked).toBe(true);
});

it("tells GRIDGO about tracking once per order, and does not send a refused one again", async () => {
  jest.spyOn(api, "recordTesterInstallation").mockResolvedValue(read());
  const track = jest.spyOn(api, "acknowledgeTesterTracking").mockRejectedValue(new api.ApiError(409, { error: "tester_order_not_placed" }));
  useSession.setState({ user: client("user_a") } as never);
  await settle();

  const paid = refundOrder({ id: "ord_paid", state: "production" });
  await useFoundingTester.getState().acknowledgeTracking(paid);
  // Refused, then opened again (a focus, a live refresh): not sent again this launch.
  await useFoundingTester.getState().acknowledgeTracking(paid);
  expect(track).toHaveBeenCalledTimes(1);
});

it("sends a cancelled or unpaid order too, and lets GRIDGO decide whether a failure counts it (review finding 1)", async () => {
  jest.spyOn(api, "recordTesterInstallation").mockResolvedValue(read());
  const track = jest
    .spyOn(api, "acknowledgeTesterTracking")
    .mockResolvedValue(read({ ...OPEN, missions: { ...OPEN.missions, tracked: true }, completedCount: 3 }));
  useSession.setState({ user: client("user_a") } as never);
  await settle();

  const failed = refundOrder({
    id: "ord_shop_failure",
    state: "cancelled",
    payments: { initial: { amountMinor: 1000, method: "qr_manual", status: "pending_confirmation", reference: "X", submittedAt: null, confirmedAt: null } },
  } as Partial<api.Order>);
  await useFoundingTester.getState().acknowledgeTracking(failed);

  expect(track).toHaveBeenCalledWith("ord_shop_failure", expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(useSession.getState().user?.foundingTester?.missions.tracked).toBe(true);
});

it("registers the installation before it asks for the invite (review finding 9)", async () => {
  let finish: (value: api.FoundingTesterRead) => void = () => {};
  jest.spyOn(api, "recordTesterInstallation").mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const invite = jest.spyOn(api, "createTesterInvite").mockResolvedValue(read());
  useSession.setState({ user: client("user_a") } as never);
  await settle();
  expect(useFoundingTester.getState().installation).toEqual({ userId: "user_a", status: "pending" });

  const loading = useFoundingTester.getState().loadInvite();
  await settle();
  expect(invite).not.toHaveBeenCalled();

  finish(read());
  await loading;
  expect(useFoundingTester.getState().installation).toEqual({ userId: "user_a", status: "settled" });
  expect(invite).toHaveBeenCalledTimes(1);
  expect(useFoundingTester.getState().inviteStatus).toBe("ready");
});

it("says a failed registration failed, and tries it again before the invite (review finding 9)", async () => {
  const record = jest.spyOn(api, "recordTesterInstallation").mockRejectedValueOnce(new api.ApiError(503, { error: "unavailable" }));
  record.mockResolvedValue(read());
  jest.spyOn(api, "createTesterInvite").mockResolvedValue(read());
  useSession.setState({ user: client("user_a") } as never);
  await settle();
  await settle();
  expect(useFoundingTester.getState().installation).toEqual({ userId: "user_a", status: "failed" });

  await useFoundingTester.getState().loadInvite();
  expect(record).toHaveBeenCalledTimes(2);
  expect(useFoundingTester.getState().installation).toEqual({ userId: "user_a", status: "settled" });
});

it("keeps the open surveys GRIDGO lists, soonest to close first (review finding 6)", async () => {
  jest.spyOn(api, "recordTesterInstallation").mockResolvedValue(read());
  const base = {
    status: "open" as const,
    fulfillmentKind: "delivery" as const,
    openedAt: "2026-10-18T08:00:00.000Z",
    dismissedAt: null,
    submittedAt: null,
    answers: null,
    needsFollowUp: false,
    rewardStatus: null,
    reward: null,
    rewardEligible: false,
    nextRewardAt: null,
    reportProblem: null,
  };
  jest.spyOn(api, "listOpenSurveys").mockResolvedValue({
    serverTime: "2026-10-21T08:00:00.000Z",
    surveys: [
      { ...base, orderId: "ord_later", expiresAt: "2026-10-27T08:00:00.000Z" },
      { ...base, orderId: "ord_shop_failure", expiresAt: "2026-10-24T08:00:00.000Z" },
    ],
  });
  useSession.setState({ user: client("user_a") } as never);
  await settle();

  await useFoundingTester.getState().loadOpenSurveys();
  expect(useFoundingTester.getState().openSurveys).toEqual(["ord_shop_failure", "ord_later"]);
});
