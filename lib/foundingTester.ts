/**
 * Founding Tester missions and label (gridgo-api#293; contract: gridgo-api
 * `docs/VOUCHERS_API.md#founding-tester-missions`).
 *
 * Pure. GRIDGO does all the counting — which order qualifies, whether the
 * account is eligible, when the label is earned and which voucher pays for it.
 * This module only reads the account's `foundingTester` projection into what
 * the missions card, the Account chip and the celebration draw.
 *
 * Two rules hold wherever it is drawn:
 *
 * - An account without the field, or one GRIDGO says is not eligible, shows
 *   nothing new. The missions are never guessed from the order list.
 * - The label is this client's own. It is on the account and nowhere a shop
 *   or rider could read it — this app is the client's alone.
 */

import type { FoundingTester, User } from "@/lib/api";
import { exactTime, stubAmount } from "@/lib/vouchers";

export const FOUNDING_TESTER_LABEL = "Founding Tester";

/** The mission reward, as the contract fixes it: ₱15, valid 30 days. */
export const FOUNDING_TESTER_REWARD_MINOR = 1500;
export const FOUNDING_TESTER_REWARD_DAYS = 30;

export type MissionKey = keyof FoundingTester["missions"];

/** The three missions, in the order a first order meets them. */
export const FOUNDING_TESTER_MISSIONS: readonly { key: MissionKey; title: string; detail: string }[] = [
  {
    key: "placed",
    title: "Place your first order",
    detail: "Counts once GRIDGO confirms your payment",
  },
  {
    key: "received",
    title: "Receive it",
    detail: "Counts when it is delivered to you or you pick it up",
  },
  {
    key: "rated",
    title: "Rate it",
    detail: "Counts when you send the short survey after it arrives",
  },
];

export type MissionRow = { key: MissionKey; title: string; detail: string; done: boolean };

export type FoundingTesterView =
  | { kind: "missions"; missions: MissionRow[]; doneCount: number }
  | {
      kind: "earned";
      label: string;
      awardedAt: string;
      rewardStatus: string | null;
      reward: FoundingTester["reward"];
    };

/**
 * The projection, or null when it is missing or not shaped like one. An API
 * without the field and a malformed answer are the same thing to a client:
 * nothing to draw.
 */
export function readFoundingTester(user: Pick<User, "foundingTester"> | null | undefined): FoundingTester | null {
  const value = user?.foundingTester;
  if (!value || typeof value !== "object") return null;
  const missions = value.missions;
  if (!missions || typeof missions !== "object") return null;
  return value;
}

/**
 * What the client sees, or null for nothing at all.
 *
 * Earned wins over everything: once GRIDGO has stamped `awardedAt`, the label
 * is the client's for good, even if a later launch-date change would no
 * longer let the account start the missions. Before that, the missions show
 * only while GRIDGO says the account is eligible.
 */
export function foundingTesterView(user: Pick<User, "foundingTester"> | null | undefined): FoundingTesterView | null {
  const tester = readFoundingTester(user);
  if (!tester) return null;
  if (tester.awardedAt) {
    return {
      kind: "earned",
      label: tester.label?.trim() || FOUNDING_TESTER_LABEL,
      awardedAt: tester.awardedAt,
      rewardStatus: tester.rewardStatus ?? null,
      reward: tester.reward ?? null,
    };
  }
  if (tester.eligible !== true) return null;
  const missions = FOUNDING_TESTER_MISSIONS.map((mission) => ({
    ...mission,
    done: tester.missions[mission.key] === true,
  }));
  return { kind: "missions", missions, doneCount: missions.filter((mission) => mission.done).length };
}

/** "1 of 3 done". */
export function progressLine(doneCount: number): string {
  return `${doneCount} of ${FOUNDING_TESTER_MISSIONS.length} done`;
}

/** What the missions are for, said once on the card. */
export const MISSIONS_REWARD_LINE = `Finish all three to earn the ${FOUNDING_TESTER_LABEL} label and a ${stubAmount(
  FOUNDING_TESTER_REWARD_MINOR,
)} voucher, valid ${FOUNDING_TESTER_REWARD_DAYS} days.`;

/** The card read aloud as one announcement. */
export function missionsAccessibilityLabel(view: Extract<FoundingTesterView, { kind: "missions" }>): string {
  const steps = view.missions.map((mission) => `${mission.title}: ${mission.done ? "done" : "not done yet"}`);
  return `${FOUNDING_TESTER_LABEL} missions, ${progressLine(view.doneCount)}. ${steps.join(". ")}. ${MISSIONS_REWARD_LINE}`;
}

/* --------------------------------------------------------------------------
   The celebration
   -------------------------------------------------------------------------- */

/**
 * Whether the celebration is still owed on this phone.
 *
 * Keyed on `awardedAt`, which GRIDGO never changes once stamped: reloading the
 * account, retrying a survey or reopening the app all bring back the same
 * stamp, so the celebration plays once and only once per account here.
 */
export function celebrationDue(
  userId: string | null | undefined,
  view: FoundingTesterView | null,
  celebrated: Readonly<Record<string, string>>,
): boolean {
  if (!userId || view?.kind !== "earned") return false;
  return celebrated[userId] !== view.awardedAt;
}

export type CelebrationCopy = { title: string; body: string; action: string };

/**
 * The words once all three missions count. The voucher is described from
 * GRIDGO's own answer: a survey voucher the account already had is reused as
 * the reward (`existing_survey_reward`), and promising a new ₱15 then would be
 * a voucher nobody is going to see.
 */
export function celebrationCopy(view: Extract<FoundingTesterView, { kind: "earned" }>): CelebrationCopy {
  const title = `You're a ${view.label}`;
  const done = "You placed, received and rated your first order.";
  if (view.rewardStatus === "existing_survey_reward") {
    return {
      title,
      body: `${done} The survey voucher you already earned counts as your reward, so no second voucher is added.`,
      action: "See my vouchers",
    };
  }
  if (view.reward) {
    return {
      title,
      body: `${done} A ${stubAmount(view.reward.valueMinor)} voucher is in your wallet. Use it on an order before ${exactTime(
        view.reward.expiresAt,
      )}.`,
      action: "See my voucher",
    };
  }
  return {
    title,
    body: `${done} Your ${stubAmount(FOUNDING_TESTER_REWARD_MINOR)} voucher shows in your wallet once GRIDGO has added it.`,
    action: "See my vouchers",
  };
}
