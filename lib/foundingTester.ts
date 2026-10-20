/**
 * Founding Tester path and label (gridgo-api#293, client#323; contract:
 * gridgo-api `docs/FOUNDING_TESTER_API.md`).
 *
 * Pure. GRIDGO does all the counting — which order qualifies, whether the
 * account is eligible, when the label is earned and which voucher pays for it.
 * This module only reads the account's `foundingTester` projection into what
 * the path card, the Account chip, the invite screen and the celebration draw.
 *
 * Three rules hold wherever it is drawn:
 *
 * - An account without the field, or one GRIDGO says is not eligible, shows
 *   nothing new. The steps are never guessed from the order list — the order
 *   list only decides where the next step's button leads.
 * - A step the API does not send is not drawn. An API from before the path
 *   sends three; drawing five there would hold two the client can never tick.
 * - The label is this client's own. It is on the account and nowhere a shop
 *   or rider could read it — this app is the client's alone.
 */

import type { FoundingTester, Order, OrderSurvey, TesterInvites, User } from "@/lib/api";
import { isFinishedOrderState } from "@/lib/homeJobs";
import { installmentUnderReview, isInstallmentConfirmed, paymentInstallment, payableInstallment } from "@/lib/payment";
import { canHaveSurvey, isSurveyOpen, surveyRoute } from "@/lib/survey";
import { exactTime, stubAmount } from "@/lib/vouchers";

export const FOUNDING_TESTER_LABEL = "Founding Tester";
export const INVITE_TITLE = "Invite a friend";
export const INVITE_ROUTE = "/invite";

/**
 * How long a programme voucher lasts once issued, as the contract fixes it.
 * The amount is never written here: the client read carries it only once a
 * voucher exists (`reward.valueMinor`), so every promise before then is
 * amount-neutral.
 */
export const FOUNDING_TESTER_REWARD_DAYS = 30;

/** Shown while all five count but GRIDGO has not issued the reward (`paused`). Contract wording. */
export const REWARD_AWAITING = "Reward awaiting approval/budget";

export type MissionKey = keyof FoundingTester["missions"];

/** The five steps, in the order a first order meets them. Titles are the API's own. */
export const FOUNDING_TESTER_STEPS: readonly { key: MissionKey; title: string; detail: string }[] = [
  { key: "added", title: "Add an item to your cart", detail: "Counts once something is in your order" },
  { key: "placed", title: "Place your order", detail: "Counts once GRIDGO confirms your payment" },
  { key: "tracked", title: "Track your order", detail: "Counts when you open your paid order to follow it" },
  { key: "received", title: "Receive your order", detail: "Counts when it is delivered to you or you pick it up" },
  { key: "rated", title: "Complete the survey", detail: "Counts when you send the short survey after it arrives" },
];

export type StepStatus = "done" | "next" | "later";

export type StepRow = { key: MissionKey; title: string; detail: string; status: StepStatus };

export type FoundingTesterView =
  | {
      kind: "missions";
      steps: StepRow[];
      doneCount: number;
      /** Every step counts, but the label and voucher have not landed yet. */
      complete: boolean;
      rewardStatus: string | null;
    }
  | {
      kind: "earned";
      label: string;
      awardedAt: string;
      rewardStatus: string | null;
      reward: FoundingTester["reward"];
    };

export type MissionsView = Extract<FoundingTesterView, { kind: "missions" }>;
export type EarnedView = Extract<FoundingTesterView, { kind: "earned" }>;

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
 * longer let the account start the path, or the voucher was voided. Before
 * that, the path shows only while GRIDGO says the account is eligible.
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
  const sent = FOUNDING_TESTER_STEPS.filter((step) => typeof tester.missions[step.key] === "boolean");
  let nextTaken = false;
  const steps = sent.map((step): StepRow => {
    if (tester.missions[step.key] === true) return { ...step, status: "done" };
    if (nextTaken) return { ...step, status: "later" };
    nextTaken = true;
    return { ...step, status: "next" };
  });
  const doneCount = steps.filter((step) => step.status === "done").length;
  return {
    kind: "missions",
    steps,
    doneCount,
    complete: steps.length > 0 && doneCount === steps.length,
    rewardStatus: tester.rewardStatus ?? null,
  };
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** "2 of 5 done". */
export function progressLine(view: Pick<MissionsView, "doneCount" | "steps">): string {
  return `${view.doneCount} of ${view.steps.length} done`;
}

/** What the path is for, said once on the card. */
export function rewardLine(view: Pick<MissionsView, "steps">): string {
  return `Finish all ${countWord(view.steps.length)} to earn the ${FOUNDING_TESTER_LABEL} label and a voucher, valid ${FOUNDING_TESTER_REWARD_DAYS} days.`;
}

/** The line under a finished path while the reward has not landed. */
export function completeLine(view: Pick<MissionsView, "rewardStatus">): string {
  if (view.rewardStatus === "paused") return REWARD_AWAITING;
  if (view.rewardStatus === "voided") return "GRIDGO cancelled this reward.";
  return "All done. GRIDGO is adding your label and voucher.";
}

/** The card's heading and count, read aloud as one announcement. */
export function pathAccessibilityLabel(view: MissionsView): string {
  const tail = view.complete ? completeLine(view) : rewardLine(view);
  return `${FOUNDING_TESTER_LABEL} steps, ${progressLine(view)}. ${tail}`;
}

/** One step read aloud: where it sits and whether it is done. */
export function stepAccessibilityLabel(step: StepRow, index: number, total: number): string {
  const status = step.status === "done" ? "done" : step.status === "next" ? "next step" : "not done yet";
  return `Step ${index + 1} of ${total}, ${step.title}, ${status}`;
}

/* --------------------------------------------------------------------------
   Where the next step leads
   -------------------------------------------------------------------------- */

export type StepAction = { label: string; href: string };

export type StepContext = {
  /** The client's orders, newest first. Absent where the screen has not read them (Account). */
  orders?: readonly Order[];
  /**
   * Orders whose survey GRIDGO says is open now (`GET /me/surveys`), soonest
   * to close first. Absent until read; empty when none is open.
   */
  openSurveyOrderIds?: readonly string[];
  /** Whether a basket with something in it is open (`cartIsOpen`). */
  cartOpen: boolean;
  /** Where the yellow "+" would start a print (`startPrintHref`). */
  startHref: string;
};

const ORDERS_TAB = "/(tabs)/orders";

function orderHref(order: Order): string {
  return `/order/${encodeURIComponent(order.id)}`;
}

function newestFirst(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * Paid and still running: the order most likely to be the one that counts.
 * Only a preference for where a button leads — GRIDGO decides what counts,
 * and an order cancelled for a shop or GRIDGO failure can count without a
 * confirmed payment.
 */
function isPaidAndRunning(order: Order): boolean {
  return order.state !== "cancelled" && isInstallmentConfirmed(paymentInstallment(order, "downpayment"));
}

/**
 * The action that completes a step, for the step that is next. It opens the
 * thing that does the step — a print to start, a checkout, the order's own
 * tracking screen, its survey — and never claims the step itself: GRIDGO ticks
 * it once it has really happened. Where the order is unknown, the Orders tab.
 * Null when there is nothing to open yet: no survey is open (`stepWaiting`).
 */
export function stepAction(key: MissionKey, context: StepContext): StepAction | null {
  const orders = context.orders ? newestFirst(context.orders) : null;
  switch (key) {
    case "added":
      return { label: "Choose something to print", href: context.startHref };
    case "placed": {
      const waiting = orders?.find(
        (order) => order.state !== "cancelled" && (payableInstallment(order) || installmentUnderReview(order)),
      );
      if (waiting) return { label: "See your order", href: orderHref(waiting) };
      if (context.cartOpen) return { label: "Go to checkout", href: "/checkout" };
      if (!orders) return { label: "Open your orders", href: ORDERS_TAB };
      return { label: "Choose something to print", href: context.startHref };
    }
    case "tracked": {
      // The newest paid job first; else the newest order of any kind, which
      // GRIDGO may still count (a failure). Opening it is what tracks it.
      const target = orders?.find((order) => isPaidAndRunning(order)) ?? orders?.[0];
      return target ? { label: "Track your order", href: orderHref(target) } : { label: "Open your orders", href: ORDERS_TAB };
    }
    case "received": {
      const live = orders?.find((order) => isPaidAndRunning(order) && !isFinishedOrderState(order.state));
      return live ? { label: "See where it is", href: orderHref(live) } : { label: "Open your orders", href: ORDERS_TAB };
    }
    case "rated": {
      // GRIDGO's own list of open surveys decides, never the order's state or age.
      if (!context.openSurveyOrderIds) return { label: "Open your orders", href: ORDERS_TAB };
      const open = context.openSurveyOrderIds[0];
      return open ? { label: "Answer the survey", href: surveyRoute(open) } : null;
    }
  }
}

/** Said on the next step when there is nothing to open for it yet. */
export function stepWaiting(key: MissionKey): string | null {
  return key === "rated" ? "No survey is open for you right now. One opens when an order is handed to you." : null;
}

/**
 * Whether opening an order's tracking screen should tell GRIDGO the client
 * tracked it: an eligible account that has placed an order and is still
 * short of the step. Which order qualifies is GRIDGO's call alone — a paid
 * job, or one cancelled for a shop or GRIDGO failure — so any order the client
 * opens is offered, and one that does not qualify is refused
 * (`409 tester_order_not_placed`) and not sent again.
 */
export function shouldAcknowledgeTracking(user: Pick<User, "foundingTester"> | null | undefined): boolean {
  const view = foundingTesterView(user);
  if (view?.kind !== "missions") return false;
  const status = (key: MissionKey) => view.steps.find((entry) => entry.key === key)?.status;
  return status("tracked") !== undefined && status("tracked") !== "done" && status("placed") === "done";
}

/**
 * Whether an order's survey is worth reading. A handed-over order may have
 * one; so may any order of an eligible tester, because GRIDGO opens the survey
 * route for one that failed through the shop or GRIDGO — a cancelled job
 * included — and says which by answering the read (null when there is none).
 */
export function mayHaveSurvey(user: Pick<User, "foundingTester"> | null | undefined, order: Pick<Order, "state">): boolean {
  return canHaveSurvey(order.state) || readFoundingTester(user)?.eligible === true;
}

/** The orders whose survey is open now, soonest to close first, from `GET /me/surveys`. */
export function openSurveyOrderIds(surveys: readonly OrderSurvey[], serverNow: number): string[] {
  return surveys
    .filter((survey) => isSurveyOpen(survey, serverNow))
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
    .map((survey) => survey.orderId);
}

/* --------------------------------------------------------------------------
   Invite a friend
   -------------------------------------------------------------------------- */

/**
 * Who sees "Invite a friend": any client on a GRIDGO that runs the programme
 * (it sends the projection). Inviting is not the missions — a client who
 * joined after the launch date can still invite; it is the friend who must be
 * eligible to earn. GRIDGO refuses a review account (`403 tester_client_required`).
 */
export function canInvite(user: Pick<User, "foundingTester"> | null | undefined): boolean {
  return readFoundingTester(user) !== null;
}

/** The promise, said plainly on the invite screen. No amount: the client read carries none before issue. */
export function inviteExplainer(): string {
  return `When a friend signs up with your link and finishes all five ${FOUNDING_TESTER_LABEL} steps, you each get an invite voucher, valid ${FOUNDING_TESTER_REWARD_DAYS} days. Your friend's comes on top of their own ${FOUNDING_TESTER_LABEL} voucher. Signing up alone does not earn one.`;
}

/** What an invite voucher depends on, so a finished friend is never read as a voucher issued. */
export const INVITE_CONDITIONS =
  "Invite vouchers depend on GRIDGO's checks. Your friend must be able to join the Founding Tester steps, and must not share a phone number, a phone or a delivery address with you or with a friend you invited before. GRIDGO also has a monthly voucher budget, so some vouchers wait for approval.";

export type InviteCount = { key: "invited" | "joined" | "completed"; label: string; detail: string; value: number };

/** The three counts, in the order a friend reaches them. */
export function inviteCounts(invites: TesterInvites): InviteCount[] {
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return [
    { key: "invited", label: "Invited", detail: "Sent the sign-up form with your code", value: count(invites.invited) },
    { key: "joined", label: "Joined", detail: "Have a GRIDGO account", value: count(invites.joined) },
    { key: "completed", label: "Completed", detail: "Finished all five steps. Vouchers still depend on GRIDGO's checks", value: count(invites.completed) },
  ];
}

/** The text a share sheet sends: a line of why, then the link unchanged. */
export function shareMessage(link: string): string {
  return `I'm testing GRIDGO, the print shop app for Davao. Sign up with my link: ${link}`;
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
 *
 * And only for an award this installation saw arrive (`seenOpen`: it read the
 * account before it had the label). A label already there the first time this
 * installation reads the account — a reinstall, cleared storage, another
 * phone — is history, not news, and is acknowledged without a celebration
 * (`awardIsHistory`). GRIDGO keeps no record of which phone celebrated.
 */
export function celebrationDue(
  userId: string | null | undefined,
  view: FoundingTesterView | null,
  celebrated: Readonly<Record<string, string>>,
  seenOpen: Readonly<Record<string, boolean>>,
): boolean {
  if (!userId || view?.kind !== "earned") return false;
  return celebrated[userId] !== view.awardedAt && seenOpen[userId] === true;
}

/** An award this installation never saw arrive: to be recorded as celebrated, silently. */
export function awardIsHistory(
  userId: string | null | undefined,
  view: FoundingTesterView | null,
  celebrated: Readonly<Record<string, string>>,
  seenOpen: Readonly<Record<string, boolean>>,
): boolean {
  if (!userId || view?.kind !== "earned") return false;
  return celebrated[userId] !== view.awardedAt && seenOpen[userId] !== true;
}

export type CelebrationCopy = { title: string; body: string; action: string };

/**
 * The words once all five steps count. The voucher is described from
 * GRIDGO's own answer: a survey voucher the account already had is reused as
 * the reward (`existing_survey_reward`), and promising a new voucher then would be
 * a voucher nobody is going to see.
 */
export function celebrationCopy(view: EarnedView): CelebrationCopy {
  const title = `You're a ${view.label}`;
  const done = "You finished all five steps, from your first cart to the survey.";
  if (view.rewardStatus === "existing_survey_reward") {
    return {
      title,
      body: `${done} The survey voucher you already earned counts as your reward, so no second voucher is added.`,
      action: "See my vouchers",
    };
  }
  // Voided, or the voucher is no longer there to spend (used, expired, void):
  // never "use it before…".
  const spendable = view.reward && (view.reward.status == null || view.reward.status === "available");
  if (view.rewardStatus === "voided" || (view.reward && !spendable)) {
    return { title, body: `${done} The label is yours to keep.`, action: "See my vouchers" };
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
    body: `${done} Your voucher shows in your wallet once GRIDGO has added it.`,
    action: "See my vouchers",
  };
}
