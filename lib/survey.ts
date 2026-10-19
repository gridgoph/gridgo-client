/**
 * The post-order survey (report 81CA4493; contract: gridgo-api
 * `docs/SURVEY_API.md`).
 *
 * Pure. The card on the order screen, the survey screen and the inbox row
 * read every rule and every word from here.
 *
 * What the survey is, and is not:
 *
 * - It is GRIDGO asking how the whole order went — the hand-over, ordering in
 *   the app, the price. It is not the shop rating (`lib/rating.ts`), which
 *   steers matching; these answers never touch a shop, a price or a refund.
 * - It is optional. Skipping only stops the order screen offering it first;
 *   the order keeps a quiet way back in until the survey closes.
 * - The first three answers are the ones that count for the voucher, and the
 *   reward is the same whatever they say. A low score is never "rewarded
 *   less", and it never opens a report on its own.
 */

import {
  ApiError,
  formatPhp,
  type OrderSurvey,
  type SurveyAnswers,
  type SurveyFulfillmentKind,
  type SurveyOptions,
} from "@/lib/api";
import { exactTime } from "@/lib/vouchers";

/** GRIDGO's survey reward: one ₱15 voucher, at most one in any 7 days. */
export const SURVEY_REWARD_MINOR = 1500;
/** The note's cap, mirrored so the field holds to it rather than be refused. */
export const SURVEY_NOTE_MAX = 2_000;
/** How many questions count towards the voucher. */
export const SURVEY_REQUIRED = 3;

export const SURVEY_NOTIFICATION_TYPE = "order_survey_available";

export function isSurveyNotification(type: string | null | undefined): boolean {
  return type === SURVEY_NOTIFICATION_TYPE;
}

/** Where a survey opens. `from=order` lets the screen go back rather than forward to the order. */
export function surveyRoute(orderId: string, from?: "order"): string {
  return `/order/survey?orderId=${encodeURIComponent(orderId)}${from ? `&from=${from}` : ""}`;
}

/** Only an order handed over to the client can have a survey; anything else is never asked about. */
const SURVEY_STATES: readonly string[] = ["delivered", "issue_window_open", "completed", "payout_released"];

export function canHaveSurvey(state: string | null | undefined): boolean {
  return SURVEY_STATES.includes(state ?? "");
}

/* --------------------------------------------------------------------------
   Options and their words
   -------------------------------------------------------------------------- */

/** What GRIDGO accepts today, used until the server's own list is read. */
export const DEFAULT_SURVEY_OPTIONS: SurveyOptions = {
  fulfillmentTags: {
    delivery: ["on_time", "late", "friendly_rider", "clear_updates", "hard_to_contact", "careful_handling", "damaged_package", "other"],
    pickup: ["easy_to_find", "ready_on_time", "long_wait", "helpful_staff", "clear_instructions", "inconvenient_hours", "damaged_package", "other"],
  },
  easeTags: ["easy_to_find_product", "clear_options", "easy_checkout", "upload_difficulty", "confusing_steps", "payment_difficulty", "slow_app", "other"],
  priceFeeling: ["very_cheap", "cheap", "fair", "expensive", "very_expensive"],
  directShopComparison: ["much_cheaper", "cheaper", "about_the_same", "more_expensive", "much_more_expensive", "not_sure"],
  priceWorthTags: [
    "print_quality",
    "on_time",
    "door_delivery",
    "no_shop_visits",
    "quality_check",
    "easy_ordering",
    "clear_upfront_price",
    "helpful_support",
    "other",
    "not_worth_it",
  ],
  orderAgainAtPrice: ["yes", "maybe", "no"],
};

const TAG_LABEL: Record<string, string> = {
  on_time: "Arrived on time",
  late: "Arrived late",
  friendly_rider: "Friendly rider",
  clear_updates: "Clear updates",
  hard_to_contact: "Hard to reach the rider",
  careful_handling: "Handled with care",
  damaged_package: "Package damaged",
  easy_to_find: "Easy to find",
  ready_on_time: "Ready on time",
  long_wait: "Long wait",
  helpful_staff: "Helpful staff",
  clear_instructions: "Clear instructions",
  inconvenient_hours: "Hours did not suit me",
  easy_to_find_product: "Found what I needed",
  clear_options: "Clear options",
  easy_checkout: "Easy checkout",
  upload_difficulty: "Uploading was hard",
  confusing_steps: "Confusing steps",
  payment_difficulty: "Paying was hard",
  slow_app: "App felt slow",
  other: "Something else",
};

/**
 * A tag's words. A code this build has never seen is still offered — GRIDGO
 * accepts it — in plain words made from the code, never the code itself.
 */
export function tagLabel(code: string): string {
  const known = TAG_LABEL[code];
  if (known) return known;
  const words = code.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : code;
}

export function fulfillmentTagsFor(options: SurveyOptions | null | undefined, kind: SurveyFulfillmentKind): string[] {
  return (options ?? DEFAULT_SURVEY_OPTIONS).fulfillmentTags[kind] ?? DEFAULT_SURVEY_OPTIONS.fulfillmentTags[kind];
}

export function easeTagsFor(options: SurveyOptions | null | undefined): string[] {
  return (options ?? DEFAULT_SURVEY_OPTIONS).easeTags ?? DEFAULT_SURVEY_OPTIONS.easeTags;
}

/* --------------------------------------------------------------------------
   The pricing questions (gridgo-api `docs/PRICING_FEEDBACK_API.md`)

   Three optional questions after the price, none of them counted for the
   voucher: answering them, or not, never changes the reward.
   -------------------------------------------------------------------------- */

export const DIRECT_SHOP_QUESTION = "Compared with ordering directly from a print shop, GRIDGO was…";
export const PRICE_WORTH_QUESTION = "What made the price worth it?";
export const ORDER_AGAIN_QUESTION = "Would you order again at this price?";

/** The one answer that says the opposite of every other, so it is sent alone. */
export const NOT_WORTH_IT = "not_worth_it";

const DIRECT_SHOP_LABEL: Record<string, string> = {
  much_cheaper: "Much cheaper",
  cheaper: "Cheaper",
  about_the_same: "About the same",
  more_expensive: "More expensive",
  much_more_expensive: "Much more expensive",
  not_sure: "Not sure",
};

const PRICE_WORTH_LABEL: Record<string, string> = {
  print_quality: "Print quality",
  on_time: "Ready on time",
  door_delivery: "Delivered to my door",
  no_shop_visits: "No trips to print shops",
  quality_check: "Artwork checked before printing",
  easy_ordering: "Easy ordering",
  clear_upfront_price: "Clear price up front",
  helpful_support: "Helpful support",
  other: "Something else",
  not_worth_it: "It was not worth it",
};

const ORDER_AGAIN_LABEL: Record<string, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

function wordsFor(labels: Record<string, string>, code: string): string {
  return labels[code] ?? tagLabel(code);
}

export function directShopLabel(code: string): string {
  return wordsFor(DIRECT_SHOP_LABEL, code);
}

export function priceWorthLabel(code: string): string {
  return wordsFor(PRICE_WORTH_LABEL, code);
}

export function orderAgainLabel(code: string): string {
  return wordsFor(ORDER_AGAIN_LABEL, code);
}

export function directShopOptionsFor(options: SurveyOptions | null | undefined): string[] {
  return options?.directShopComparison ?? DEFAULT_SURVEY_OPTIONS.directShopComparison ?? [];
}

export function orderAgainOptionsFor(options: SurveyOptions | null | undefined): string[] {
  return options?.orderAgainAtPrice ?? DEFAULT_SURVEY_OPTIONS.orderAgainAtPrice ?? [];
}

/**
 * The reasons the price was worth it, without "not worth it", which the
 * screen draws apart as the opposite answer. A door delivery is never offered
 * on an order that was collected.
 */
export function priceWorthTagsFor(options: SurveyOptions | null | undefined, kind: SurveyFulfillmentKind): string[] {
  const all = options?.priceWorthTags ?? DEFAULT_SURVEY_OPTIONS.priceWorthTags ?? [];
  return all.filter((code) => code !== NOT_WORTH_IT && !(kind === "pickup" && code === "door_delivery"));
}

/** Whether this GRIDGO offers "It was not worth it". */
export function offersNotWorthIt(options: SurveyOptions | null | undefined): boolean {
  return (options?.priceWorthTags ?? DEFAULT_SURVEY_OPTIONS.priceWorthTags ?? []).includes(NOT_WORTH_IT);
}

/**
 * Turns a reason on or off. "Not worth it" clears every reason, and any
 * reason clears "not worth it": GRIDGO refuses the two together.
 */
export function toggleWorthTag(tags: readonly string[], code: string): string[] {
  if (tags.includes(code)) return tags.filter((tag) => tag !== code);
  if (code === NOT_WORTH_IT) return [NOT_WORTH_IT];
  return [...tags.filter((tag) => tag !== NOT_WORTH_IT), code];
}

/** A single choice that a second tap on the same answer takes back. */
export function toggleChoice(current: string | null, code: string): string | null {
  return current === code ? null : code;
}

/** The price scale, cheapest first: what GRIDGO stores as 1 to 5. */
export const PRICE_FEELINGS = ["Very cheap", "Cheap", "Fair", "Expensive", "Very expensive"] as const;

export function priceFeelingLabel(value: number): string | null {
  return PRICE_FEELINGS[value - 1] ?? null;
}

/** The two questions whose wording depends on how the order reached them. */
export function fulfillmentQuestion(kind: SurveyFulfillmentKind): { title: string; short: string } {
  return kind === "pickup"
    ? { title: "How was picking it up?", short: "pick-up" }
    : { title: "How was the delivery?", short: "delivery" };
}

/** What a recommendation score means, so a number is never the whole answer. */
export function recommendWord(score: number | null): string {
  if (score == null) return "Not answered";
  if (score <= 6) return `${score} out of 10, not likely`;
  if (score <= 8) return `${score} out of 10, maybe`;
  return `${score} out of 10, very likely`;
}

/* --------------------------------------------------------------------------
   The draft
   -------------------------------------------------------------------------- */

/** Answers as the screen holds them: 0 and empty mean "not answered". */
export type SurveyDraft = {
  fulfillmentStars: number;
  fulfillmentTags: string[];
  easeStars: number;
  easeTags: string[];
  priceFeeling: number;
  /** As typed, in pesos. */
  expectedPrice: string;
  directShopComparison: string | null;
  priceWorthTags: string[];
  orderAgainAtPrice: string | null;
  qualityStars: number;
  recommendScore: number | null;
  improvementNote: string;
};

export const EMPTY_SURVEY_DRAFT: SurveyDraft = {
  fulfillmentStars: 0,
  fulfillmentTags: [],
  easeStars: 0,
  easeTags: [],
  priceFeeling: 0,
  expectedPrice: "",
  directShopComparison: null,
  priceWorthTags: [],
  orderAgainAtPrice: null,
  qualityStars: 0,
  recommendScore: null,
  improvementNote: "",
};

/** Turns a tag on or off, keeping the list distinct. */
export function toggleTag(tags: readonly string[], code: string): string[] {
  return tags.includes(code) ? tags.filter((tag) => tag !== code) : [...tags, code];
}

/** How many of the three counted questions are answered. */
export function requiredAnswered(draft: SurveyDraft): number {
  return [draft.fulfillmentStars, draft.easeStars, draft.priceFeeling].filter((value) => value >= 1).length;
}

/**
 * A typed peso amount in centavos. Empty is "no answer"; anything that is not
 * a plain amount ("about 500", "₱1,2,3") is `invalid` so the field can say so
 * rather than send something GRIDGO would read differently.
 */
export function parsePesos(text: string): number | null | "invalid" {
  const cleaned = text.replace(/[₱,\s]/g, "").replace(/^php/i, "");
  if (!cleaned) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return "invalid";
  return Math.round(Number(cleaned) * 100);
}

export function expectedPriceProblem(text: string): string | null {
  return parsePesos(text) === "invalid" ? "Type an amount in pesos, like 450 or 1,250.50." : null;
}

/** Whether the draft can be sent: the three counted answers, and nothing malformed. */
export function canSend(draft: SurveyDraft): boolean {
  return requiredAnswered(draft) === SURVEY_REQUIRED && !expectedPriceProblem(draft.expectedPrice);
}

/** The first counted question still unanswered, said as what to do. */
export function missingLine(draft: SurveyDraft, kind: SurveyFulfillmentKind): string | null {
  if (!draft.fulfillmentStars) return `Rate the ${fulfillmentQuestion(kind).short} to continue.`;
  if (!draft.easeStars) return "Rate how easy ordering was to continue.";
  if (!draft.priceFeeling) return "Say how the price felt to continue.";
  return null;
}

/**
 * The body GRIDGO takes. Tags are filtered to the ones offered for this
 * order, so a list read before the order's hand-over kind was known can never
 * send a delivery tag on a pick-up.
 */
export function toSubmission(
  draft: SurveyDraft,
  kind: SurveyFulfillmentKind,
  options: SurveyOptions | null | undefined,
): SurveyAnswers {
  const fulfillment = fulfillmentTagsFor(options, kind);
  const ease = easeTagsFor(options);
  const expected = parsePesos(draft.expectedPrice);
  const note = draft.improvementNote.trim();
  const worth = draft.priceWorthTags.filter(
    (tag) => priceWorthTagsFor(options, kind).includes(tag) || (tag === NOT_WORTH_IT && offersNotWorthIt(options)),
  );
  return {
    fulfillmentStars: draft.fulfillmentStars,
    fulfillmentTags: draft.fulfillmentTags.filter((tag) => fulfillment.includes(tag)),
    easeStars: draft.easeStars,
    easeTags: draft.easeTags.filter((tag) => ease.includes(tag)),
    priceFeeling: draft.priceFeeling,
    expectedPriceMinor: typeof expected === "number" ? expected : null,
    directShopComparison:
      draft.directShopComparison && directShopOptionsFor(options).includes(draft.directShopComparison)
        ? draft.directShopComparison
        : null,
    // Alone or not at all: a draft can only hold it alone, but GRIDGO refuses the pair outright.
    priceWorthTags: worth.includes(NOT_WORTH_IT) ? [NOT_WORTH_IT] : worth,
    orderAgainAtPrice:
      draft.orderAgainAtPrice && orderAgainOptionsFor(options).includes(draft.orderAgainAtPrice)
        ? draft.orderAgainAtPrice
        : null,
    qualityStars: draft.qualityStars >= 1 ? draft.qualityStars : null,
    recommendScore: draft.recommendScore,
    improvementNote: note ? note.slice(0, SURVEY_NOTE_MAX) : null,
  };
}

/* --------------------------------------------------------------------------
   Where a survey stands
   -------------------------------------------------------------------------- */

export type SurveyView =
  /** Open and not skipped: the order screen offers it. */
  | { kind: "invite"; survey: OrderSurvey }
  /** Skipped, still open: a quiet way back in. */
  | { kind: "skipped"; survey: OrderSurvey }
  /** Answered: thanks, and the voucher when there is one. */
  | { kind: "sent"; survey: OrderSurvey };

/**
 * What the order screen draws. An expired survey that was never answered
 * draws nothing: there is nothing left to do and nothing worth reporting.
 * Expiry is checked on GRIDGO's clock too, so a card left on screen past its
 * moment does not offer a survey GRIDGO would refuse.
 */
export function surveyView(survey: OrderSurvey | null | undefined, serverNow: number): SurveyView | null {
  if (!survey) return null;
  if (survey.status === "submitted" || survey.submittedAt) return { kind: "sent", survey };
  if (survey.status !== "open" || !(Date.parse(survey.expiresAt) > serverNow)) return null;
  return survey.dismissedAt ? { kind: "skipped", survey } : { kind: "invite", survey };
}

export function isSurveyOpen(survey: OrderSurvey | null | undefined, serverNow: number): boolean {
  const view = surveyView(survey, serverNow);
  return view?.kind === "invite" || view?.kind === "skipped";
}

/** "Open until Wed, 21 Oct, 4:00 PM" — the moment, never a countdown that can drift. */
export function openUntilLine(survey: Pick<OrderSurvey, "expiresAt">): string {
  return `Open until ${exactTime(survey.expiresAt)}`;
}

/** The reward line before answering, or null when this survey cannot earn one now. */
export function rewardOffer(survey: Pick<OrderSurvey, "rewardEligible">): string | null {
  return survey.rewardEligible
    ? `Answer the first three questions and GRIDGO adds a ${formatPhp(SURVEY_REWARD_MINOR)} voucher to your wallet.`
    : null;
}

/**
 * Why there is no reward offer, so its absence is never a mystery. Only the
 * weekly limit is explained: with no next reward date the survey carries no
 * voucher at all (a store-review account, gridgo-api#284), and saying the
 * client already had one would be untrue.
 */
export function noRewardLine(survey: Pick<OrderSurvey, "rewardEligible" | "nextRewardAt">): string | null {
  if (survey.rewardEligible || !hasNextReward(survey)) return null;
  return `This survey does not come with a voucher: you had one in the last 7 days. Your next survey can earn one from ${exactTime(survey.nextRewardAt ?? "")}.`;
}

function hasNextReward(survey: Pick<OrderSurvey, "nextRewardAt">): boolean {
  return survey.nextRewardAt != null && Date.parse(survey.nextRewardAt) > 0;
}

export type SurveyThanks = {
  title: string;
  body: string;
  /** Present only when a voucher came with these answers. */
  rewardIssued: boolean;
};

/** What the screen says once the answers are in. */
export function surveyThanks(survey: OrderSurvey): SurveyThanks {
  if (survey.rewardStatus === "issued" && survey.reward) {
    return {
      title: "Thank you",
      body: `Your ${formatPhp(survey.reward.valueMinor)} voucher is in your wallet. It comes off a future order at checkout.`,
      rewardIssued: true,
    };
  }
  // GRIDGO also answers "cooldown" for a survey that never carried a voucher;
  // only a next reward date says one really came this week.
  if (survey.rewardStatus === "cooldown" && hasNextReward(survey)) {
    return {
      title: "Thank you",
      body: "Your answers reached GRIDGO. You already had a survey voucher in the last 7 days, so this one does not add another.",
      rewardIssued: false,
    };
  }
  return { title: "Thank you", body: "Your answers reached GRIDGO.", rewardIssued: false };
}

/**
 * The way to the issue form after a low star score, only while GRIDGO says
 * the window is open. Said plainly that the survey itself reported nothing.
 */
export const REPORT_PROBLEM_TITLE = "Something wrong with the order itself?";
export const REPORT_PROBLEM_BODY =
  "Report it while the issue window is open and Operations will review it. Your survey answers do not report a problem or ask for a refund.";
export const REPORT_PROBLEM_LABEL = "Report a problem with this order";

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

/** True when GRIDGO says the survey can no longer be answered. */
export function isSurveyClosed(error: unknown): boolean {
  return errorCode(error) === "survey_closed";
}

export function surveyErrorMessage(error: unknown, fallback: string): string {
  switch (errorCode(error)) {
    case "survey_closed":
      return "This survey has closed. Surveys stay open for 7 days after an order is handed over.";
    case "invalid_survey_answers":
    case "invalid_survey_tags":
      return "Some answers did not go through. Check the three numbered questions and send again.";
    case "invalid_survey_expected_price":
      return "The price you expected did not go through. Type it in pesos, like 450, or leave it empty.";
    case "invalid_survey_note":
      return `Your note is too long. Keep it under ${SURVEY_NOTE_MAX.toLocaleString("en-PH")} characters.`;
    case "order_not_found":
      return "GRIDGO could not find this order's survey.";
    default:
      return fallback;
  }
}

/* --------------------------------------------------------------------------
   Inbox
   -------------------------------------------------------------------------- */

/**
 * The inbox row for the invitation. GRIDGO's body is written for every
 * channel; the row says the same in the app's words, and keeps the reward's
 * limit beside it so the voucher is never promised to someone who has had
 * one this week.
 */
export function surveyNotificationCopy(): { title: string; body: string; hint: string } {
  return {
    title: "How did your order go?",
    body: "A short survey, about 30 seconds. It is optional and stays open for 7 days.",
    hint: "Opens the survey",
  };
}

const SURVEY_OPEN_MS = 7 * 24 * 3_600_000;

/**
 * The callout under the invitation, while the survey can still be open. The
 * row carries no survey state, so its own age is the honest limit: a week
 * after the invitation the survey has closed and nothing is offered. The
 * voucher is offered only when this survey, as last read, can earn one;
 * unknown or not eligible reads as a plain invitation.
 */
export function surveyNotificationCallout(
  at: string,
  rewardEligible: boolean | null = null,
  now: number = Date.now(),
): { title: string; detail: string } | null {
  const sent = Date.parse(at);
  if (Number.isFinite(sent) && now - sent >= SURVEY_OPEN_MS) return null;
  if (rewardEligible !== true) {
    return { title: "Three quick questions", detail: "The rest are optional." };
  }
  return {
    title: `${formatPhp(SURVEY_REWARD_MINOR)} voucher for the first three answers`,
    detail: "One survey voucher every 7 days.",
  };
}
