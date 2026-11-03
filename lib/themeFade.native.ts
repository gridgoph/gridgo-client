import {
  THEME_VEIL_IN_MS,
  THEME_VEIL_OUT_MS,
  type ThemeFade,
  type ThemeVeil,
} from "@/lib/themeTransition";

/**
 * The phone's light/dark fade. A phone has no snapshot of its own screen to
 * cross-fade without a native module, so a wash in the *new* canvas colour
 * rises over the old screen, the theme changes behind it while it is opaque,
 * and it falls away from the new screen. Brightness only ever moves one way,
 * from the old canvas to the new, so nothing flashes.
 *
 * The wash is drawn by `components/ThemeTransitionHost.tsx`; this only says
 * when it rises and falls. The web build cross-fades a real snapshot instead
 * (`lib/themeFade.ts`).
 */

/** A phone has no snapshot fade: the knob slides itself. */
export const knobTransitionName: string | undefined = undefined;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Two frames: one for React to commit the new theme, one for it to paint. */
function painted(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function createThemeFade(setVeil: (veil: ThemeVeil | null) => void): ThemeFade | null {
  return async (to, apply) => {
    try {
      setVeil({ to, phase: "in" });
      await wait(THEME_VEIL_IN_MS);
      apply();
      await painted();
      setVeil({ to, phase: "out" });
      await wait(THEME_VEIL_OUT_MS);
    } finally {
      setVeil(null);
    }
  };
}
