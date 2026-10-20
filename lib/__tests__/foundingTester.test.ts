import type { FoundingTester, Order, OrderSurvey } from "@/lib/api";
import {
  awardIsHistory,
  canInvite,
  celebrationCopy,
  celebrationDue,
  completeLine,
  foundingTesterView,
  inviteCounts,
  INVITE_CONDITIONS,
  inviteExplainer,
  mayHaveSurvey,
  openSurveyOrderIds,
  pathAccessibilityLabel,
  progressLine,
  readFoundingTester,
  REWARD_AWAITING,
  rewardLine,
  shareMessage,
  shouldAcknowledgeTracking,
  stepAction,
  stepWaiting,
  type FoundingTesterView,
  type MissionsView,
} from "@/lib/foundingTester";
import { refundOrder } from "@/test/refundFixtures";

const NONE = { added: false, placed: false, tracked: false, received: false, rated: false };
const ALL = { added: true, placed: true, tracked: true, received: true, rated: true };

function tester(patch: Partial<FoundingTester> = {}): FoundingTester {
  return {
    eligible: true,
    label: null,
    awardedAt: null,
    missions: { ...NONE },
    completedCount: 0,
    rewardStatus: "pending",
    reward: null,
    ...patch,
  };
}

const AWARDED_AT = "2026-10-20T08:00:00.000Z";
const earnedTester = tester({
  label: "Founding Tester",
  awardedAt: AWARDED_AT,
  missions: { ...ALL },
  completedCount: 5,
  rewardStatus: "issued",
  reward: { id: "vch_1", valueMinor: 1500, expiresAt: "2026-11-19T08:00:00.000Z" },
});

function earned(user: { foundingTester: FoundingTester }): Extract<FoundingTesterView, { kind: "earned" }> {
  const view = foundingTesterView(user);
  if (view?.kind !== "earned") throw new Error("expected an earned view");
  return view;
}

function path(missions: FoundingTester["missions"], patch: Partial<FoundingTester> = {}): MissionsView {
  const view = foundingTesterView({ foundingTester: tester({ missions, ...patch }) });
  if (view?.kind !== "missions") throw new Error("expected the path");
  return view;
}

describe("the five steps, as GRIDGO counted them", () => {
  it("lists them in the path's order, under the API's own names", () => {
    expect(path(NONE).steps.map((step) => step.title)).toEqual([
      "Add an item to your cart",
      "Place your order",
      "Track your order",
      "Receive your order",
      "Complete the survey",
    ]);
  });

  it.each([
    [NONE, 0, ["next", "later", "later", "later", "later"]],
    [{ ...NONE, added: true }, 1, ["done", "next", "later", "later", "later"]],
    [{ ...NONE, added: true, placed: true }, 2, ["done", "done", "next", "later", "later"]],
    [{ ...ALL, received: false, rated: false }, 3, ["done", "done", "done", "next", "later"]],
    [{ ...ALL, rated: false }, 4, ["done", "done", "done", "done", "next"]],
  ])("marks each step done, the first open one next (%j)", (missions, count, statuses) => {
    const view = path(missions);
    expect(view.steps.map((step) => step.status)).toEqual(statuses);
    expect(view.doneCount).toBe(count);
    expect(progressLine(view)).toBe(`${count} of 5 done`);
    expect(view.complete).toBe(false);
  });

  it("makes a step next even when a later one already counts — the steps need not happen in order", () => {
    // Tracking can be acknowledged on one order while another is the one received.
    const view = path({ ...NONE, added: true, placed: true, received: true });
    expect(view.steps.map((step) => step.status)).toEqual(["done", "done", "next", "done", "later"]);
    expect(view.doneCount).toBe(3);
  });

  it("says the reward in words, counted from the steps it shows", () => {
    const view = path(NONE);
    expect(rewardLine(view)).toBe("Finish all five to earn the Founding Tester label and a voucher, valid 30 days.");
    expect(pathAccessibilityLabel(view)).toBe(
      "Founding Tester steps, 0 of 5 done. Finish all five to earn the Founding Tester label and a voucher, valid 30 days.",
    );
  });

  it("draws only the three steps an API from before the path sends", () => {
    const view = path({ placed: true, received: false, rated: false });
    expect(view.steps.map((step) => step.key)).toEqual(["placed", "received", "rated"]);
    expect(progressLine(view)).toBe("1 of 3 done");
    expect(rewardLine(view)).toMatch(/^Finish all three/);
  });
});

describe("all five done, before the label lands", () => {
  it("says the reward is waiting on approval or the month's budget when GRIDGO paused it", () => {
    const view = path(ALL, { rewardStatus: "paused", completedCount: 5 });
    expect(view.complete).toBe(true);
    expect(completeLine(view)).toBe(REWARD_AWAITING);
    expect(REWARD_AWAITING).toBe("Reward awaiting approval/budget");
    expect(pathAccessibilityLabel(view)).toBe("Founding Tester steps, 5 of 5 done. Reward awaiting approval/budget");
  });

  it("says it is on its way while GRIDGO has not reconciled it yet", () => {
    expect(completeLine(path(ALL))).toBe("All done. GRIDGO is adding your label and voucher.");
  });

  it("never promises a voucher GRIDGO voided", () => {
    expect(completeLine(path(ALL, { rewardStatus: "voided" }))).toBe("GRIDGO cancelled this reward.");
  });
});

describe("nothing new for an account the path is not for", () => {
  it("shows nothing to an ineligible account", () => {
    expect(
      foundingTesterView({ foundingTester: tester({ eligible: false, rewardStatus: "ineligible", missions: { ...NONE, placed: true } }) }),
    ).toBeNull();
  });

  it("shows nothing when the API sends no projection, or a broken one", () => {
    expect(foundingTesterView({})).toBeNull();
    expect(foundingTesterView({ foundingTester: null })).toBeNull();
    expect(foundingTesterView(null)).toBeNull();
    expect(readFoundingTester({ foundingTester: { eligible: true } as never })).toBeNull();
    expect(readFoundingTester({ foundingTester: "yes" as never })).toBeNull();
    expect(canInvite({})).toBe(false);
  });
});

describe("where the next step leads", () => {
  const start = { cartOpen: false, startHref: "/request/category" };
  const unpaid = refundOrder({
    id: "ord_unpaid",
    state: "awaiting_initial_payment",
    createdAt: "2026-10-02T08:00:00+08:00",
    payments: { initial: { amountMinor: 1000, method: "qr_manual", status: "not_submitted", reference: null, submittedAt: null, confirmedAt: null } },
  } as Partial<Order>);
  const paid = refundOrder({ id: "ord_paid", state: "production", createdAt: "2026-10-01T08:00:00+08:00" });
  const delivered = refundOrder({ id: "ord_delivered", state: "issue_window_open", createdAt: "2026-09-20T08:00:00+08:00" });
  const cancelled = refundOrder({ id: "ord_cancelled", state: "cancelled", createdAt: "2026-10-05T08:00:00+08:00" });

  it("starts a print for the cart step, wherever the yellow + would", () => {
    expect(stepAction("added", start)).toEqual({ label: "Choose something to print", href: "/request/category" });
    expect(stepAction("added", { ...start, startHref: "/(tabs)/new-request" })?.href).toBe("/(tabs)/new-request");
  });

  it("opens the order waiting on its payment, else checkout, else a new print", () => {
    expect(stepAction("placed", { ...start, orders: [unpaid, paid] })).toEqual({ label: "See your order", href: "/order/ord_unpaid" });
    expect(stepAction("placed", { ...start, orders: [], cartOpen: true })).toEqual({ label: "Go to checkout", href: "/checkout" });
    expect(stepAction("placed", { ...start, orders: [] })).toEqual({ label: "Choose something to print", href: "/request/category" });
    // Account has not read the orders: the Orders tab, never a guess.
    expect(stepAction("placed", start)?.href).toBe("/(tabs)/orders");
  });

  it("opens the newest paid order's tracking screen for the tracking step first", () => {
    expect(stepAction("tracked", { ...start, orders: [delivered, cancelled, paid, unpaid] })).toEqual({
      label: "Track your order",
      href: "/order/ord_paid",
    });
  });

  it("still opens a cancelled order GRIDGO may count through a shop or GRIDGO failure (review finding 1)", () => {
    // The failure is GRIDGO's to record; the client opens the order and GRIDGO decides.
    const failed = refundOrder({ id: "ord_shop_failure", state: "cancelled", createdAt: "2026-10-05T08:00:00+08:00" });
    expect(stepAction("tracked", { ...start, orders: [failed] })?.href).toBe("/order/ord_shop_failure");
    expect(stepAction("tracked", { ...start, orders: [] })?.href).toBe("/(tabs)/orders");
  });

  it("opens the paid job still on its way for the receive step", () => {
    expect(stepAction("received", { ...start, orders: [delivered, paid] })?.href).toBe("/order/ord_paid");
  });

  it("opens the survey GRIDGO says is open, never one picked by order state or age (review finding 6)", () => {
    // ord_expired is newer and handed over, but its survey is not open; ord_open's is.
    const expired = refundOrder({ id: "ord_expired", state: "completed", createdAt: "2026-10-10T08:00:00+08:00" });
    const openOne = refundOrder({ id: "ord_open", state: "issue_window_open", createdAt: "2026-09-01T08:00:00+08:00" });
    expect(stepAction("rated", { ...start, orders: [expired, openOne], openSurveyOrderIds: ["ord_open"] })).toEqual({
      label: "Answer the survey",
      href: "/order/survey?orderId=ord_open",
    });
  });

  it("opens a cancelled failure order's survey when GRIDGO lists it as open (review finding 1)", () => {
    const failed = refundOrder({ id: "ord_shop_failure", state: "cancelled" });
    expect(stepAction("rated", { ...start, orders: [failed], openSurveyOrderIds: ["ord_shop_failure"] })?.href).toBe(
      "/order/survey?orderId=ord_shop_failure",
    );
  });

  it("offers no survey when none is open, and says why", () => {
    expect(stepAction("rated", { ...start, orders: [delivered], openSurveyOrderIds: [] })).toBeNull();
    expect(stepWaiting("rated")).toMatch(/No survey is open for you right now/);
    // The list not read yet: the Orders tab, never a guessed survey.
    expect(stepAction("rated", { ...start, orders: [delivered] })?.href).toBe("/(tabs)/orders");
  });
});

describe("which surveys are open", () => {
  const NOW = Date.parse("2026-10-21T08:00:00.000Z");
  const survey = (orderId: string, patch: Partial<OrderSurvey> = {}): OrderSurvey => ({
    orderId,
    status: "open",
    fulfillmentKind: "delivery",
    openedAt: "2026-10-18T08:00:00.000Z",
    expiresAt: "2026-10-25T08:00:00.000Z",
    dismissedAt: null,
    submittedAt: null,
    answers: null,
    needsFollowUp: false,
    rewardStatus: null,
    reward: null,
    rewardEligible: false,
    nextRewardAt: null,
    reportProblem: null,
    ...patch,
  });

  it("keeps open and skipped ones, soonest to close first, and drops sent or expired ones", () => {
    expect(
      openSurveyOrderIds(
        [
          survey("ord_late", { expiresAt: "2026-10-27T08:00:00.000Z" }),
          survey("ord_skipped", { dismissedAt: "2026-10-19T08:00:00.000Z", expiresAt: "2026-10-24T08:00:00.000Z" }),
          survey("ord_sent", { status: "submitted", submittedAt: "2026-10-19T08:00:00.000Z" }),
          survey("ord_gone", { expiresAt: "2026-10-21T08:00:00.000Z" }),
        ],
        NOW,
      ),
    ).toEqual(["ord_skipped", "ord_late"]);
  });
});

describe("whose survey is worth reading on the order screen", () => {
  it("reads a cancelled order's survey for an eligible tester, whom a failure can qualify (review finding 1)", () => {
    expect(mayHaveSurvey({ foundingTester: tester() }, { state: "cancelled" })).toBe(true);
  });

  it("keeps the handed-over rule for everyone else", () => {
    expect(mayHaveSurvey({}, { state: "cancelled" })).toBe(false);
    expect(mayHaveSurvey({}, { state: "completed" })).toBe(true);
    expect(mayHaveSurvey({ foundingTester: tester({ eligible: false }) }, { state: "production" })).toBe(false);
  });
});

describe("when opening an order counts as tracking it", () => {
  const user = (missions: FoundingTester["missions"], patch: Partial<FoundingTester> = {}) => ({
    foundingTester: tester({ missions, ...patch }),
  });

  it("asks for an eligible account that has placed an order and is still short of the step", () => {
    expect(shouldAcknowledgeTracking(user({ ...NONE, added: true, placed: true }))).toBe(true);
  });

  it("leaves which order counts to GRIDGO — a cancelled failure order included (review finding 1)", () => {
    // Nothing about the order is read: GRIDGO refuses one that does not qualify.
    expect(shouldAcknowledgeTracking(user({ ...NONE, added: true, placed: true }))).toBe(true);
    expect(shouldAcknowledgeTracking.length).toBe(1);
  });

  it("does not ask before an order is placed, once the step is done, or for an account the path is not for", () => {
    expect(shouldAcknowledgeTracking(user({ ...NONE, added: true }))).toBe(false);
    expect(shouldAcknowledgeTracking(user({ ...NONE, placed: true, tracked: true }))).toBe(false);
    expect(shouldAcknowledgeTracking(user({ ...NONE, placed: true }, { eligible: false }))).toBe(false);
    expect(shouldAcknowledgeTracking({ foundingTester: earnedTester })).toBe(false);
    expect(shouldAcknowledgeTracking(null)).toBe(false);
    // An API from before the path has no tracking step to count.
    expect(shouldAcknowledgeTracking(user({ placed: true, received: false, rated: false }))).toBe(false);
  });
});

describe("invite a friend", () => {
  it("is offered on the path and after the label", () => {
    expect(canInvite({ foundingTester: tester() })).toBe(true);
    expect(canInvite({ foundingTester: { ...earnedTester, eligible: false } })).toBe(true);
  });

  it("is offered to a client who joined after the launch date, who cannot earn the label (review finding 3)", () => {
    expect(canInvite({ foundingTester: tester({ eligible: false, rewardStatus: "ineligible" }) })).toBe(true);
  });

  it("says when both get a voucher without naming an amount GRIDGO has not sent (review finding 8)", () => {
    expect(inviteExplainer()).toBe(
      "When a friend signs up with your link and finishes all five Founding Tester steps, you each get an invite voucher, valid 30 days. Your friend's comes on top of their own Founding Tester voucher. Signing up alone does not earn one.",
    );
    expect(`${inviteExplainer()} ${INVITE_CONDITIONS}`).not.toMatch(/₱/);
  });

  it("says the checks and the budget apply, and that Completed is not a voucher issued (review finding 7)", () => {
    expect(INVITE_CONDITIONS).toMatch(/must be able to join the Founding Tester steps/);
    expect(INVITE_CONDITIONS).toMatch(/with a friend you invited before/);
    expect(INVITE_CONDITIONS).toMatch(/monthly voucher budget/);
    const completed = inviteCounts({ code: "C", link: null, invited: 1, joined: 1, completed: 1 }).find((c) => c.key === "completed");
    expect(completed?.detail).toMatch(/Vouchers still depend on GRIDGO's checks/);
  });

  it("counts invited, joined and completed in that order, and never a negative or broken count", () => {
    expect(inviteCounts({ code: "C", link: null, invited: 3, joined: 2, completed: 1 }).map((c) => [c.label, c.value])).toEqual([
      ["Invited", 3],
      ["Joined", 2],
      ["Completed", 1],
    ]);
    expect(inviteCounts({ code: null, link: null, invited: -1, joined: Number.NaN, completed: "2" as never }).map((c) => c.value)).toEqual([
      0, 0, 0,
    ]);
  });

  it("shares GRIDGO's link unchanged", () => {
    const link = "https://forms.example.test/signup?entry.123=ABC123";
    expect(shareMessage(link)).toContain(link);
  });
});

describe("the earned label", () => {
  it("is the client's once GRIDGO stamps awardedAt", () => {
    const view = earned({ foundingTester: earnedTester });
    expect(view.label).toBe("Founding Tester");
    expect(view.awardedAt).toBe(AWARDED_AT);
  });

  it("stays earned after a launch-date change makes the account ineligible, or the voucher is voided", () => {
    expect(foundingTesterView({ foundingTester: { ...earnedTester, eligible: false } })?.kind).toBe("earned");
    expect(foundingTesterView({ foundingTester: { ...earnedTester, rewardStatus: "voided" } })?.kind).toBe("earned");
  });

  it("falls back to the label's name when GRIDGO leaves it out", () => {
    expect(earned({ foundingTester: { ...earnedTester, label: null } }).label).toBe("Founding Tester");
  });
});

describe("the celebration plays once per awardedAt", () => {
  const view = foundingTesterView({ foundingTester: earnedTester });
  const seen = { u1: true, u2: true };

  it("is due the first time this phone sees the stamp arrive", () => {
    expect(celebrationDue("u1", view, {}, seen)).toBe(true);
  });

  it("is not due again for the same stamp — a reload or a survey retry", () => {
    expect(celebrationDue("u1", view, { u1: AWARDED_AT }, seen)).toBe(false);
  });

  it("is owed to each account on the phone separately", () => {
    expect(celebrationDue("u2", view, { u1: AWARDED_AT }, seen)).toBe(true);
  });

  it("is not replayed after the app's storage is lost — an old award is history (review finding 5)", () => {
    // A reinstall: nothing celebrated, and this installation never saw the account without the label.
    expect(celebrationDue("u1", view, {}, {})).toBe(false);
    expect(awardIsHistory("u1", view, {}, {})).toBe(true);
    // Seen arriving here, it is news, not history.
    expect(awardIsHistory("u1", view, {}, seen)).toBe(false);
    expect(awardIsHistory("u1", view, { u1: AWARDED_AT }, {})).toBe(false);
  });

  it("is never due before the label — a paused reward included — or with nobody signed in", () => {
    expect(celebrationDue("u1", foundingTesterView({ foundingTester: tester() }), {}, seen)).toBe(false);
    expect(
      celebrationDue("u1", foundingTesterView({ foundingTester: tester({ missions: ALL, rewardStatus: "paused" }) }), {}, seen),
    ).toBe(false);
    expect(celebrationDue("u1", null, {}, seen)).toBe(false);
    expect(celebrationDue(null, view, {}, seen)).toBe(false);
  });
});

describe("what the celebration says about the voucher", () => {
  it("names the new voucher and the moment it runs out, in Davao", () => {
    const copy = celebrationCopy(earned({ foundingTester: earnedTester }));
    expect(copy.title).toBe("You're a Founding Tester");
    expect(copy.body).toBe(
      "You finished all five steps, from your first cart to the survey. A ₱15 voucher is in your wallet. Use it on an order before Thu, 19 Nov, 4:00 PM.",
    );
    expect(copy.action).toBe("See my voucher");
  });

  it("draws the amount GRIDGO sent, not a figure of its own", () => {
    const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, reward: { ...earnedTester.reward!, valueMinor: 2500 } } }));
    expect(copy.body).toMatch(/A ₱25 voucher is in your wallet/);
  });

  it("promises no second voucher when an earlier survey voucher is reused", () => {
    const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, rewardStatus: "existing_survey_reward" } }));
    expect(copy.body).toMatch(/survey voucher you already earned counts as your reward/);
    expect(copy.body).not.toMatch(/₱15 voucher is in your wallet/);
  });

  it("promises no voucher GRIDGO voided", () => {
    const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, rewardStatus: "voided" } }));
    expect(copy.body).not.toMatch(/in your wallet/);
    expect(copy.body).toMatch(/The label is yours to keep/);
  });

  it("promises nothing to spend once the voucher is used or expired", () => {
    for (const status of ["used", "expired", "void"]) {
      const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, reward: { ...earnedTester.reward!, status } } }));
      expect(copy.body).not.toMatch(/Use it on an order/);
    }
  });

  it("says the voucher is coming when GRIDGO has not attached it yet, without an amount (review finding 8)", () => {
    const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, reward: null } }));
    expect(copy.body).toMatch(/shows in your wallet once GRIDGO has added it/);
    expect(copy.body).not.toMatch(/₱/);
  });
});
