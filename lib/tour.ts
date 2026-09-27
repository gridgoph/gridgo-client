/**
 * The first-order tour: a short walk from Home to checkout, one lit control at
 * a time.
 *
 * Every step belongs to a screen that already exists, in the order a first job
 * actually moves through them (`lib/startPrint.ts`, `hooks/useStartPrintJob.ts`):
 * Home → what you are printing → when → the match → the listing → artwork →
 * checkout. The tour never navigates. A step on a later screen waits until the
 * client gets there on their own, and a client who taps ahead is met by the
 * step for the screen they reached rather than dragged back to the one they
 * skipped.
 *
 * Everything here is pure so the rules can be tested without a screen: which
 * step shows where, what Next and Back do, and when a tour starts at all. The
 * store (`store/tour.ts`) keeps one `TourProgress` per account on this phone.
 */

/** A screen the tour has something to say on. Two routes can share one. */
export type TourScreen = "home" | "pick" | "when" | "match" | "listing" | "artwork" | "checkout";

export type TourStepId =
  | "home.search"
  | "home.categories"
  | "pick"
  | "when"
  | "match"
  | "listing"
  | "artwork"
  | "checkout";

export type TourStep = {
  id: TourStepId;
  screen: TourScreen;
  title: string;
  body: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "home.search",
    screen: "home",
    title: "Start with what you need",
    body: "Know what you want printed? Search for it here: tarpaulin, tote bag, lanyard.",
  },
  {
    id: "home.categories",
    screen: "home",
    title: "Or browse the categories",
    body: "Each one lists what GRIDGO prints in it. Tap one to see real samples.",
  },
  {
    id: "pick",
    screen: "pick",
    title: "Choose what you're printing",
    body: "Tap the closest match. You set the exact size, material and quantity later.",
  },
  {
    id: "when",
    screen: "when",
    title: "Pick the day you need it",
    body: "Only days a printer can make are open. No deadline? Choose No rush below.",
  },
  {
    id: "match",
    screen: "match",
    title: "GRIDGO found your printer",
    body: "GRIDGO matched this job to one printer. Tap a listing to set it up.",
  },
  {
    id: "listing",
    screen: "listing",
    title: "Set your specs",
    body: "Choose size, material and quantity on this sheet. The total here follows every pick. Tap Add to my order when it looks right.",
  },
  {
    id: "artwork",
    screen: "artwork",
    title: "Add your artwork",
    body: "Upload your design file, or paste a design link where the listing takes one. GRIDGO checks it before anything prints.",
  },
  {
    id: "checkout",
    screen: "checkout",
    title: "Pay and place your order",
    body: "Scan GRIDGO's QR Ph code, add the payment reference, then place the order. Operations checks your artwork and payment next.",
  },
];

export const TOUR_LENGTH = TOUR_STEPS.length;

/**
 * Where one account's tour stands on this phone.
 *
 * No record at all means the tour has never been offered. `done` covers both
 * finishing and skipping — either way the client has seen enough, and only
 * Replay brings it back.
 */
export type TourProgress = { status: "active"; step: number } | { status: "done" };

export function startTour(): TourProgress {
  return { status: "active", step: 0 };
}

/** Skip is always one tap and always final. */
export function skipTour(): TourProgress {
  return { status: "done" };
}

/**
 * The automatic start: once, for a client with no tour on record and nothing
 * on press. A returning client with orders is not a first-time client and is
 * never shown it unasked; Replay is how they get it.
 */
export function shouldAutoStart(progress: TourProgress | undefined, firstTime: boolean): boolean {
  return progress === undefined && firstTime;
}

export function currentStep(progress: TourProgress | undefined): TourStep | null {
  if (!progress || progress.status !== "active") return null;
  return TOUR_STEPS[progress.step] ?? null;
}

/** The step to draw on `screen`, or null when the tour has nothing to say there. */
export function visibleStep(
  progress: TourProgress | undefined,
  screen: TourScreen | null,
): TourStep | null {
  const step = currentStep(progress);
  return step && screen && step.screen === screen ? step : null;
}

/** Past the last step is the end of the tour. */
export function nextStep(progress: TourProgress): TourProgress {
  if (progress.status !== "active") return progress;
  const step = progress.step + 1;
  return step >= TOUR_LENGTH ? { status: "done" } : { status: "active", step };
}

/**
 * Back only moves within the screen the client is on. The step before this
 * screen's first lives on the screen they came from, and the tour does not
 * navigate — the system back does that.
 */
export function canGoBack(progress: TourProgress): boolean {
  if (progress.status !== "active" || progress.step === 0) return false;
  return TOUR_STEPS[progress.step - 1]?.screen === TOUR_STEPS[progress.step]?.screen;
}

export function backStep(progress: TourProgress): TourProgress {
  if (progress.status !== "active" || !canGoBack(progress)) return progress;
  return { status: "active", step: progress.step - 1 };
}

/**
 * The client reached `screen`. If its first step is ahead of where the tour
 * stands — they tapped the lit control, or went their own way — the tour moves
 * up to meet them. A screen whose steps are already behind the tour stays
 * quiet: going back to Home mid-order does not start the tour over.
 */
export function arriveAt(progress: TourProgress, screen: TourScreen): TourProgress {
  if (progress.status !== "active") return progress;
  const first = TOUR_STEPS.findIndex((step) => step.screen === screen);
  if (first > progress.step) return { status: "active", step: first };
  return progress;
}

/**
 * The Next button says what it will do. "Next" stays on this screen; "Got it"
 * puts the card away until the client reaches the next screen; "Done" ends it.
 */
export function nextLabel(progress: TourProgress): "Next" | "Got it" | "Done" {
  if (progress.status !== "active" || progress.step >= TOUR_LENGTH - 1) return "Done";
  const here = TOUR_STEPS[progress.step];
  const after = TOUR_STEPS[progress.step + 1];
  return here && after && here.screen === after.screen ? "Next" : "Got it";
}

/** Read aloud and drawn as dots: which step of how many. */
export function stepPosition(progress: TourProgress): { index: number; count: number } {
  return {
    index: progress.status === "active" ? progress.step : TOUR_LENGTH - 1,
    count: TOUR_LENGTH,
  };
}

export type TourRect = { x: number; y: number; width: number; height: number };

/**
 * Where the instruction card goes: under the lit control when it fits there,
 * over it when it fits there instead, and pinned to the bottom edge when the
 * control fills the screen. Coordinates are window pixels.
 */
export function placeCard({
  target,
  cardHeight,
  windowHeight,
  insetTop,
  insetBottom,
  gap = 16,
}: {
  target: TourRect | null;
  cardHeight: number;
  windowHeight: number;
  insetTop: number;
  insetBottom: number;
  gap?: number;
}): { top: number; side: "below" | "above" | "pinned" } {
  const floor = windowHeight - insetBottom - gap;
  const pinned = { top: Math.max(insetTop + gap, floor - cardHeight), side: "pinned" as const };
  if (!target) return pinned;

  const below = target.y + target.height + gap;
  if (below + cardHeight <= floor) return { top: below, side: "below" };

  const above = target.y - gap - cardHeight;
  if (above >= insetTop + gap) return { top: above, side: "above" };

  return pinned;
}
