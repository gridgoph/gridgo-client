/**
 * Client onboarding, in the order a new client meets it (gridgo-client#159).
 *
 * Features first, so nothing is asked of a client before they know why:
 * tracking, then the notification ask that tracking makes sense of, then the
 * money, the checks and the hours, and last the one answer GRIDGO needs from
 * them — their ranking, which every match is decided on. The order tutorial
 * (`lib/tour.ts`) takes over on Home once this is done.
 *
 * Nothing here asks where the client is. Tracking is something they watch, and
 * a drop-off is asked for on the delivery step of a job, where it means
 * something. Keep it that way: an address field here is the drop-off this
 * order was built to remove.
 *
 * Every picture is artwork the app already ships (`images.onboarding`), or a
 * vignette drawn from the design tokens.
 */

/** Raster beat, keyed to `images.onboarding`. */
export type OnboardingArt = "order" | "approve" | "track";

/** What fills the picture half of a feature page. */
export type OnboardingVisual =
  | { type: "art"; art: OnboardingArt }
  /** Token-drawn docket: placed at any hour, ready by the date asked for. */
  | { type: "schedule" };

export type OnboardingFeatureStep = {
  kind: "feature";
  id: "tracking" | "escrow" | "quality" | "scheduling";
  title: string;
  body: string;
  visual: OnboardingVisual;
};

/** The one permission onboarding asks for, and only from a tap. */
export type OnboardingNotificationsStep = {
  kind: "notifications";
  id: "notifications";
  title: string;
  body: string;
};

/** The client's usual order of quality, speed, cost and distance. */
export type OnboardingRankingStep = {
  kind: "ranking";
  id: "ranking";
  title: string;
  body: string;
};

export type OnboardingStep =
  | OnboardingFeatureStep
  | OnboardingNotificationsStep
  | OnboardingRankingStep;

export type OnboardingStepId = OnboardingStep["id"];

export const onboardingSteps: readonly OnboardingStep[] = [
  {
    kind: "feature",
    id: "tracking",
    title: "Watch it come to you",
    body: "Once your order is out, follow the rider on the map. Each position says when it was last updated, so you know how fresh it is. You only watch. GRIDGO never needs your location for this.",
    visual: { type: "art", art: "track" },
  },
  {
    kind: "notifications",
    id: "notifications",
    title: "Know when your job moves",
    body: "The map shows where your order is. Notifications tell you when something changes, even with GRIDGO closed.",
  },
  {
    kind: "feature",
    id: "escrow",
    title: "Your payment waits with GRIDGO",
    body: "You pay GRIDGO by QR, never the printer directly. The printer is paid once your job is done, and if something is wrong you can ask for a refund.",
    visual: { type: "art", art: "order" },
  },
  {
    kind: "feature",
    id: "quality",
    title: "Checked before it prints",
    body: "GRIDGO checks every file against a preflight list. You approve the proof before anything goes to press, and you get progress photos while it prints.",
    visual: { type: "art", art: "approve" },
  },
  {
    kind: "feature",
    id: "scheduling",
    title: "Order any hour, on your schedule",
    body: "Place a job at midnight or on a Sunday. Pick the date you need it, and GRIDGO only matches you with printers that can make it.",
    visual: { type: "schedule" },
  },
  {
    kind: "ranking",
    id: "ranking",
    title: "What matters most on a print job?",
    body: "Tap them in order. GRIDGO matches every job on it, and you can change it for one job or in Account.",
  },
] as const;
