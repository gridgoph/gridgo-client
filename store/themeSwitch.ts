import { create } from "zustand";

import type { ThemeName } from "@/constants/theme";
import { currentThemeName } from "@/hooks/useTheme";
import { createThemeFade } from "@/lib/themeFade";
import { createThemeQueue, type ThemeVeil } from "@/lib/themeTransition";
import { useThemeStore } from "@/store/theme";

type ThemeSwitchState = {
  /** The theme the client last tapped, while switches are still landing. */
  wanted: ThemeName | null;
  /** The phone's wash while it is on screen (`lib/themeFade.native.ts`). */
  veil: ThemeVeil | null;
  /** False under reduce motion: the theme then changes at once. */
  animate: boolean;
};

/**
 * The light/dark switch's motion, kept apart from where the choice is saved:
 * `store/theme.ts` `choose` still shows and saves it, exactly as before. This
 * only decides when `choose` runs, under a fade (`lib/themeTransition.ts`).
 */
export const useThemeSwitch = create<ThemeSwitchState>()(() => ({
  wanted: null,
  veil: null,
  animate: true,
}));

let account: string | null = null;

const fade = createThemeFade((veil) => useThemeSwitch.setState({ veil }));

const request = createThemeQueue({
  current: currentThemeName,
  apply: (next) => void useThemeStore.getState().choose(next, account),
  fade: () => (useThemeSwitch.getState().animate ? fade : null),
  onWanted: (wanted) => useThemeSwitch.setState({ wanted }),
});

/** A tap on the switch: fade to `next` and save it on `userId`'s account. */
export function switchTheme(next: ThemeName, userId: string | null): Promise<void> {
  account = userId;
  return request(next);
}
