import { THEME_FADE_MS, THEME_KNOB_MS, type ThemeFade, type ThemeVeil } from "@/lib/themeTransition";

/**
 * The web build's light/dark fade: the browser's View Transitions API
 * snapshots the screen as it is, the theme changes underneath, and the old
 * snapshot cross-fades into the live new screen. It is a picture of the page,
 * so photos are never fetched again and nothing is laid out twice.
 *
 * The switch's knob is named on its own (`knobTransitionName`), so the
 * browser slides it from sun to moon while the rest of the screen fades; the
 * sun and moon are named after it so they stay drawn above the sliding knob.
 * Taps fall through the snapshot to the live page, so a second tap mid-fade
 * is never lost (`lib/themeTransition.ts` queues it).
 *
 * A browser without the API gets no fade: the theme changes at once, as it
 * always did. The phone's wash is `lib/themeFade.native.ts`.
 */

const STYLE_ID = "gg-theme-fade";
const KNOB = "gg-theme-knob";

type ViewTransition = { finished: Promise<void> };
type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransition;
};

function installStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
::view-transition { pointer-events: none; }
::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
  animation-duration: ${THEME_FADE_MS}ms;
  animation-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
}
::view-transition-group(${KNOB}), ::view-transition-old(${KNOB}), ::view-transition-new(${KNOB}) {
  animation-duration: ${THEME_KNOB_MS}ms;
  animation-timing-function: cubic-bezier(0.33, 1, 0.68, 1);
}
`;
  doc.head.appendChild(style);
}

function supported(): boolean {
  return typeof document !== "undefined" && typeof (document as TransitionDocument).startViewTransition === "function";
}

/**
 * The knob's `view-transition-name` while the browser can slide it; the knob
 * then jumps to its new side and the browser draws the slide. Undefined where
 * there is no snapshot fade, and the knob slides itself.
 */
export const knobTransitionName: string | undefined = supported() ? KNOB : undefined;

/** The theme lands through stores, which React commits in a microtask; one task outlasts it. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The web build draws no wash, so `setVeil` is never called here. */
export function createThemeFade(_setVeil: (veil: ThemeVeil | null) => void): ThemeFade | null {
  if (!supported()) return null;
  const doc = document as TransitionDocument;
  installStyle(doc);

  const fade: ThemeFade = async (_to, apply) => {
    const transition = doc.startViewTransition!.call(doc, async () => {
      apply();
      await nextTask();
    });
    await transition.finished;
  };
  fade.snapshot = true;
  return fade;
}
