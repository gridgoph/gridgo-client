/**
 * The four places one basket run passes through.
 *
 * Match → Print details → Artwork → Review & pay. The first step is where GRIDGO answers with
 * a pick, not a shopfront the client browses — the id stays `shop` because that
 * is what the route is called, but nothing a client reads says so.
 *
 * Not a wizard: every one of them is a screen
 * the client can already reach on their own, and this is only the map of where
 * they are in the run. That distinction is why the trail never gates anything —
 * a step it marks as still to come is simply a screen there is nothing to show
 * on yet, not a page being withheld.
 *
 * Deliberately unnumbered. `RequestStepper` numbers the legacy four-step
 * request form, and two numbered four-step bars in one app that count different
 * things is worse than either on its own. These are named places.
 */

export type OrderStepId = "shop" | "listing" | "artwork" | "pay";

/** Done is behind the client, current is where they are, todo is not reached. */
export type OrderStepState = "done" | "current" | "todo";

export type OrderStep = {
  id: OrderStepId;
  label: string;
  state: OrderStepState;
};

/**
 * Labels are what the client does there, in their words. "Listing" was our
 * word for the print details sheet, and a bare "Pay" read as a charge waiting
 * behind the tap; checkout is where the order is checked first, then paid.
 * The caption is the one-line task on the step the client is standing on, so
 * the bar answers "what am I doing here" without anyone tapping ahead to find out.
 */
const SEQUENCE: readonly { id: OrderStepId; label: string; caption: string }[] = [
  { id: "shop", label: "Match", caption: "Pick the print GRIDGO matched for you." },
  {
    id: "listing",
    label: "Print details",
    caption: "Choose options and quantity, then add it to your order.",
  },
  { id: "artwork", label: "Artwork", caption: "Attach the file to print." },
  { id: "pay", label: "Review & pay", caption: "Check your order, then pay by QR to place it." },
] as const;

export const ORDER_STEP_IDS: readonly OrderStepId[] = SEQUENCE.map((step) => step.id);

export function orderStepLabel(id: OrderStepId): string {
  return SEQUENCE.find((step) => step.id === id)?.label ?? "";
}

/**
 * The current step's one-line task. Unnumbered for the reason above: the
 * position is the bar's job, and the screen reader hears it there.
 */
export function orderStepCaption(current: OrderStepId): string {
  return SEQUENCE.find((step) => step.id === current)?.caption ?? "";
}

/** The whole trail, resolved against where the client is standing. */
export function orderSteps(current: OrderStepId): OrderStep[] {
  const at = SEQUENCE.findIndex((step) => step.id === current);
  return SEQUENCE.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: index < at ? "done" : index === at ? "current" : "todo",
  }));
}

/**
 * What a screen reader is told about one step.
 *
 * The position is said out loud because the bar's own ordering is visual, and
 * "Artwork" on its own does not say whether it is behind or ahead.
 */
export function orderStepAccessibilityLabel(
  step: OrderStep,
  position: number,
  reachable = true,
): string {
  const place = `Step ${position} of ${SEQUENCE.length}: ${step.label}`;
  switch (step.state) {
    case "done":
      // Only promise a way back where the screen really offers one.
      return reachable ? `${place}, done. Go back to it.` : `${place}, done.`;
    case "current":
      return `${place}, where you are now.`;
    case "todo":
      return `${place}, not reached yet.`;
  }
}

/**
 * The questions asked before the match, in the order the flow asks them.
 *
 * They sit ahead of the trail above, so a client answering them has no bar to
 * say why. `MatchPrepNote` names them once, with the one being answered.
 */
export type MatchPrepStepId = "date" | "delivery" | "priorities";

export const MATCH_PREP_STEPS: readonly { id: MatchPrepStepId; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "delivery", label: "Delivery" },
  { id: "priorities", label: "Priorities" },
] as const;

export function matchPrepAccessibilityLabel(current: MatchPrepStepId): string {
  const now = MATCH_PREP_STEPS.find((step) => step.id === current)?.label.toLowerCase() ?? "";
  return `Before we match: your date, delivery and priorities prepare the match. Now: ${now}.`;
}
