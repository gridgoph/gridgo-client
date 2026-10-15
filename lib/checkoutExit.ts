/**
 * The checkout exit question (gridgo-client#243; contract: gridgo-api
 * `docs/PRICING_FEEDBACK_API.md`).
 *
 * Pure apart from `noteCheckoutVisit`. A client who reached checkout and left
 * without paying is asked once, on a later app open, what stopped them. GRIDGO
 * decides when it is due and keeps the "once" and the 7-day spacing: the app
 * only reports checkout visits, asks when it is told to, and never stacks the
 * question on top of another prompt.
 *
 * It is feedback, not a sale: no reward, no reminder of the basket, and
 * skipping is as easy as answering.
 */

import { ApiError, recordCheckoutVisit, type CheckoutExitOption } from "@/lib/api";

/**
 * Tells GRIDGO checkout was reached. Fire and forget: checkout never waits on
 * it, and a refusal (an emptied or already-paid basket) is nobody's concern.
 */
export function noteCheckoutVisit(cartId: string): void {
  recordCheckoutVisit(cartId).catch(() => undefined);
}

export const CHECKOUT_EXIT_QUESTION = "What stopped you from ordering?";
export const CHECKOUT_EXIT_OTHER = "other";
/** GRIDGO's cap on the typed answer, mirrored so the field holds to it. */
export const CHECKOUT_EXIT_OTHER_MAX = 500;

/** GRIDGO's list today, used only when a prompt arrives without one. */
export const DEFAULT_CHECKOUT_EXIT_OPTIONS: CheckoutExitOption[] = [
  { code: "price_too_high", label: "The price was too high" },
  { code: "delivery_cost_or_time", label: "Delivery cost or time" },
  { code: "still_deciding", label: "Still deciding" },
  { code: "payment_problem", label: "Trouble paying" },
  { code: "found_another_option", label: "Found another option" },
  { code: "just_browsing", label: "Just looking around" },
  { code: CHECKOUT_EXIT_OTHER, label: "Other" },
];

/** The options as sent, or the known list when a read carries none. */
export function exitOptionsFrom(options: readonly CheckoutExitOption[] | null | undefined): CheckoutExitOption[] {
  const usable = (options ?? []).filter((option) => option && typeof option.code === "string" && option.code);
  return usable.length ? usable : DEFAULT_CHECKOUT_EXIT_OPTIONS;
}

/** The answers one tap sends: every option but "Other", which needs words. */
export function oneTapOptions(options: readonly CheckoutExitOption[]): CheckoutExitOption[] {
  return options.filter((option) => option.code !== CHECKOUT_EXIT_OTHER);
}

export function offersOther(options: readonly CheckoutExitOption[]): boolean {
  return options.some((option) => option.code === CHECKOUT_EXIT_OTHER);
}

/** What is wrong with the typed answer, or null when it can be sent. */
export function otherTextProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Write a few words, or pick one of the answers above.";
  if (trimmed.length > CHECKOUT_EXIT_OTHER_MAX) return `Keep it under ${CHECKOUT_EXIT_OTHER_MAX} characters.`;
  return null;
}

/**
 * Whether the question may be asked or drawn right now. It is the last thing
 * the app puts on screen at open: only over the tab shell, only for a signed-in
 * client whose terms are agreed, and never while the launch intro, the update
 * prompt, the notification explainer, the tour or a call is up.
 */
export function exitQuestionCanShow(state: {
  ready: boolean;
  signedIn: boolean;
  onTabs: boolean;
  legalClear: boolean;
  updateShowing: boolean;
  pushExplainerOpen: boolean;
  tourShowing: boolean;
  callActive: boolean;
}): boolean {
  return (
    state.ready &&
    state.signedIn &&
    state.onTabs &&
    state.legalClear &&
    !state.updateShowing &&
    !state.pushExplainerOpen &&
    !state.tourShowing &&
    !state.callActive
  );
}

/**
 * How long the app must have been clear before it asks GRIDGO. The open-time
 * prompts all decide on the first frames after landing; waiting lets the one
 * that is due take the screen first, so the claim — which GRIDGO counts as
 * asking, even if nothing is drawn — is only made when it can be shown.
 */
export const EXIT_QUESTION_SETTLE_MS = 1_500;

export const EXIT_THANKS = "Thank you. GRIDGO reads every answer.";

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

/** True when the question is gone on GRIDGO's side, so there is nothing left to answer. */
export function isExitPromptGone(error: unknown): boolean {
  return errorCode(error) === "checkout_exit_prompt_not_found";
}

export function exitAnswerErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "invalid_checkout_exit_note":
      return `Write between 1 and ${CHECKOUT_EXIT_OTHER_MAX} characters, or pick one of the answers above.`;
    case "invalid_checkout_exit_answer":
      return "That answer did not go through. Pick another, or skip.";
    default:
      return "Your answer did not reach GRIDGO. Check your connection and try again, or skip.";
  }
}
