/**
 * Shared header options for screens pushed above the tab shell.
 *
 * On iOS, the native stack labels the back control with the previous screen's
 * title. The tab group route is the filesystem name `(tabs)`, which must never
 * reach the user. Order (and similar) can also be opened from more than one
 * tab, so a single origin label would be a lie.
 *
 * The control therefore says the one word that is true from every origin:
 * **Back**. `headerBackButtonDisplayMode: "minimal"` — a bare chevron — was
 * also honest, but on a bright display, above a screen that carries its own
 * large heading, it reads as part of the artwork rather than as the way out.
 * "The user cannot tell how to get back" is the defect; a control that
 * technically exists does not fix it.
 *
 * Android's native stack shows its own arrow and ignores the label, which is
 * that platform's convention and correct. The control keeps a system
 * accessibility name on both.
 */
export const multiOriginPushedScreenOptions = {
  headerBackButtonDisplayMode: "default" as const,
  headerBackTitle: "Back",
};
