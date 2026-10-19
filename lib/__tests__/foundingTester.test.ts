import type { FoundingTester } from "@/lib/api";
import {
  celebrationCopy,
  celebrationDue,
  foundingTesterView,
  missionsAccessibilityLabel,
  MISSIONS_REWARD_LINE,
  progressLine,
  readFoundingTester,
  type FoundingTesterView,
} from "@/lib/foundingTester";

function tester(patch: Partial<FoundingTester> = {}): FoundingTester {
  return {
    eligible: true,
    label: null,
    awardedAt: null,
    missions: { placed: false, received: false, rated: false },
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
  missions: { placed: true, received: true, rated: true },
  completedCount: 3,
  rewardStatus: "issued",
  reward: { id: "vch_1", valueMinor: 1500, expiresAt: "2026-11-19T08:00:00.000Z" },
});

function earned(user: { foundingTester: FoundingTester }): Extract<FoundingTesterView, { kind: "earned" }> {
  const view = foundingTesterView(user);
  if (view?.kind !== "earned") throw new Error("expected an earned view");
  return view;
}

describe("the missions, as GRIDGO counted them", () => {
  it.each([
    [{ placed: false, received: false, rated: false }, 0, [false, false, false]],
    [{ placed: true, received: false, rated: false }, 1, [true, false, false]],
    [{ placed: true, received: true, rated: false }, 2, [true, true, false]],
    // A historical account can read 3/3 for a moment before its own profile
    // reconciliation stamps the label; it is still the missions until then.
    [{ placed: true, received: true, rated: true }, 3, [true, true, true]],
  ])("ticks each mission done (%j → %i of 3)", (missions, count, ticks) => {
    const view = foundingTesterView({ foundingTester: tester({ missions, completedCount: count }) });
    expect(view?.kind).toBe("missions");
    if (view?.kind !== "missions") return;
    expect(view.doneCount).toBe(count);
    expect(view.missions.map((mission) => mission.done)).toEqual(ticks);
    expect(progressLine(view.doneCount)).toBe(`${count} of 3 done`);
  });

  it("lists them in order, in plain words, with the reward said in words", () => {
    const view = foundingTesterView({ foundingTester: tester() });
    if (view?.kind !== "missions") throw new Error("expected missions");
    expect(view.missions.map((mission) => mission.title)).toEqual(["Place your first order", "Receive it", "Rate it"]);
    expect(MISSIONS_REWARD_LINE).toBe(
      "Finish all three to earn the Founding Tester label and a ₱15 voucher, valid 30 days.",
    );
    expect(missionsAccessibilityLabel(view)).toMatch(/^Founding Tester missions, 0 of 3 done\. Place your first order: not done yet/);
  });
});

describe("nothing new for an account the missions are not for", () => {
  it("shows nothing to an ineligible account", () => {
    expect(
      foundingTesterView({
        foundingTester: tester({ eligible: false, rewardStatus: "ineligible", missions: { placed: true, received: false, rated: false } }),
      }),
    ).toBeNull();
  });

  it("shows nothing when the API sends no projection, or a broken one", () => {
    expect(foundingTesterView({})).toBeNull();
    expect(foundingTesterView({ foundingTester: null })).toBeNull();
    expect(foundingTesterView(null)).toBeNull();
    expect(readFoundingTester({ foundingTester: { eligible: true } as never })).toBeNull();
    expect(readFoundingTester({ foundingTester: "yes" as never })).toBeNull();
  });
});

describe("the earned label", () => {
  it("is the client's once GRIDGO stamps awardedAt", () => {
    const view = earned({ foundingTester: earnedTester });
    expect(view.label).toBe("Founding Tester");
    expect(view.awardedAt).toBe(AWARDED_AT);
  });

  it("stays earned after a launch-date change makes the account ineligible", () => {
    const view = foundingTesterView({ foundingTester: { ...earnedTester, eligible: false } });
    expect(view?.kind).toBe("earned");
  });

  it("falls back to the label's name when GRIDGO leaves it out", () => {
    expect(earned({ foundingTester: { ...earnedTester, label: null } }).label).toBe("Founding Tester");
  });
});

describe("the celebration plays once per awardedAt", () => {
  const view = foundingTesterView({ foundingTester: earnedTester });

  it("is due the first time this phone sees the stamp", () => {
    expect(celebrationDue("u1", view, {})).toBe(true);
  });

  it("is not due again for the same stamp — a reload or a survey retry", () => {
    expect(celebrationDue("u1", view, { u1: AWARDED_AT })).toBe(false);
  });

  it("is owed to each account on the phone separately", () => {
    expect(celebrationDue("u2", view, { u1: AWARDED_AT })).toBe(true);
  });

  it("is never due before the label, or with nobody signed in", () => {
    expect(celebrationDue("u1", foundingTesterView({ foundingTester: tester() }), {})).toBe(false);
    expect(celebrationDue("u1", null, {})).toBe(false);
    expect(celebrationDue(null, view, {})).toBe(false);
  });
});

describe("what the celebration says about the voucher", () => {
  it("names the new voucher and the moment it runs out, in Davao", () => {
    const copy = celebrationCopy(earned({ foundingTester: earnedTester }));
    expect(copy.title).toBe("You're a Founding Tester");
    expect(copy.body).toBe(
      "You placed, received and rated your first order. A ₱15 voucher is in your wallet. Use it on an order before Thu, 19 Nov, 4:00 PM.",
    );
    expect(copy.action).toBe("See my voucher");
  });

  it("promises no second voucher when an earlier survey voucher is reused", () => {
    const copy = celebrationCopy(
      earned({ foundingTester: { ...earnedTester, rewardStatus: "existing_survey_reward" } }),
    );
    expect(copy.body).toMatch(/survey voucher you already earned counts as your reward/);
    expect(copy.body).not.toMatch(/₱15 voucher is in your wallet/);
  });

  it("says the voucher is coming when GRIDGO has not attached it yet", () => {
    const copy = celebrationCopy(earned({ foundingTester: { ...earnedTester, reward: null } }));
    expect(copy.body).toMatch(/shows in your wallet once GRIDGO has added it/);
  });
});
