/**
 * The four places one basket run passes through.
 *
 * Match → Listing → Artwork → Pay. The first step is where GRIDGO answers with
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

const SEQUENCE: readonly { id: OrderStepId; label: string }[] = [
  { id: "shop", label: "Match" },
  { id: "listing", label: "Listing" },
  { id: "artwork", label: "Artwork" },
  { id: "pay", label: "Pay" },
] as const;

export const ORDER_STEP_IDS: readonly OrderStepId[] = SEQUENCE.map((step) => step.id);

export function orderStepLabel(id: OrderStepId): string {
  return SEQUENCE.find((step) => step.id === id)?.label ?? "";
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
export function orderStepAccessibilityLabel(step: OrderStep, position: number): string {
  const place = `Step ${position} of ${SEQUENCE.length}: ${step.label}`;
  switch (step.state) {
    case "done":
      return `${place}, done. Go back to it.`;
    case "current":
      return `${place}, where you are now.`;
    case "todo":
      return `${place}, not reached yet.`;
  }
}
