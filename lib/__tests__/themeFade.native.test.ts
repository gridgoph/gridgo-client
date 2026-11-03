import { createThemeFade } from "@/lib/themeFade.native";
import type { ThemeVeil } from "@/lib/themeTransition";

/*
  The phone's wash: it rises in the new canvas colour, the theme changes only
  once it is up, and it falls away and is gone when the fade resolves.
*/
it("changes the theme behind a risen wash, then clears it", async () => {
  const veils: (ThemeVeil | null)[] = [];
  const fade = createThemeFade((veil) => veils.push(veil));
  let veilsAtApply: (ThemeVeil | null)[] = [];

  await fade!("dark", () => {
    veilsAtApply = [...veils];
  });

  expect(veilsAtApply).toEqual([{ to: "dark", phase: "in" }]);
  expect(veils).toEqual([{ to: "dark", phase: "in" }, { to: "dark", phase: "out" }, null]);
});
