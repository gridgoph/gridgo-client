import type { ThemeName } from "@/constants/theme";

/**
 * How a light/dark switch moves (Home's sun/moon switch, client#335).
 *
 * The colours change under a fade instead of all at once: on web the browser
 * cross-fades a snapshot of the old screen into the new one (View
 * Transitions); on a phone a wash in the new canvas colour rises, the theme
 * changes behind it, and the wash falls away. Nothing is re-mounted and
 * nothing is measured again, so no photo reloads and nothing moves.
 *
 * Reduce motion skips all of it: the theme changes at once.
 */

/** The web cross-fade, old screen out and new screen in. */
export const THEME_FADE_MS = 280;
/** The phone's wash rising over the old screen. */
export const THEME_VEIL_IN_MS = 120;
/** The wash falling away from the new screen. */
export const THEME_VEIL_OUT_MS = 160;
/** The switch's knob sliding from sun to moon. */
export const THEME_KNOB_MS = 240;

/**
 * Runs `apply` at the hidden middle of a fade and resolves when it has
 * finished. A `snapshot` fade (the web's) pictures the screen as it was before
 * `apply`, so the switch's knob must not move until `apply` either, or the
 * "before" picture would already show it on the new side.
 */
export type ThemeFade = ((to: ThemeName, apply: () => void) => Promise<void>) & { snapshot?: boolean };

/** The phone's wash: its colour, and whether it is rising or falling. */
export type ThemeVeil = { to: ThemeName; phase: "in" | "out" };

type QueueDeps = {
  /** The theme on screen right now. */
  current: () => ThemeName;
  /** Change the theme (and save the choice). */
  apply: (next: ThemeName) => void;
  /** The fade to run, or null when there is none (reduce motion, no support). */
  fade: () => ThemeFade | null;
  /** The tap the switch should show while switches are still running; null once idle. */
  onWanted: (wanted: ThemeName | null) => void;
};

/**
 * One switch at a time, and the last tap wins.
 *
 * A tap during a fade is not dropped and does not cut the fade short: it
 * becomes the next target, and once the running fade lands the queue fades
 * again if the client has since asked for the other theme. A tap for the theme
 * already on screen still goes through `apply`, so a client following the
 * phone's setting pins that theme exactly as the switch always has.
 */
export function createThemeQueue({ current, apply, fade, onWanted }: QueueDeps) {
  let wanted: ThemeName | null = null;
  let busy = false;

  return async function request(next: ThemeName): Promise<void> {
    wanted = next;
    // A tap mid-fade shows on the knob at once; so does any tap without a snapshot.
    if (busy || !fade()?.snapshot) onWanted(next);
    if (busy) return;
    busy = true;
    try {
      while (wanted !== null) {
        const target: ThemeName = wanted;
        wanted = null;
        const run = target === current() ? null : fade();
        if (run) {
          let applied = false;
          const once = () => {
            if (applied) return;
            applied = true;
            if (run.snapshot) onWanted(target);
            apply(target);
          };
          // A fade that fails still lands the theme the client asked for.
          await run(target, once).catch(() => undefined);
          once();
        } else {
          apply(target);
        }
      }
    } finally {
      busy = false;
      onWanted(null);
    }
  };
}
