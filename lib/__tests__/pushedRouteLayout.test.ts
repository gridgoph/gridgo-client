import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression lock for the empty header band.
 *
 * The captain bug: `request/category` declared `title: ""`, so a full header
 * bar — 44pt on iOS, 56dp on Android, plus the status inset — was drawn above
 * the screen's own display heading carrying nothing but a back chevron. The
 * fix is a rule rather than two edits, so the next pushed route cannot bring
 * the band back:
 *
 * 1. Every root-stack screen either hides its header or goes through
 *    `pushedScreenOptions("<title>")`. No route sets a bare `title:`, and
 *    `title: ""` may not appear anywhere in the file.
 * 2. A screen rendered under a visible header never wraps itself in
 *    `edges={["top"]}` — the header has already cleared the status bar, and a
 *    second inset is a notch's worth of blank canvas. This is the same defect
 *    wearing different clothes, and `design-system` was carrying it.
 */
describe("pushed route layout contract", () => {
  const appDir = join(__dirname, "../../app");
  const layout = readFileSync(join(appDir, "_layout.tsx"), "utf8");

  /** Every `<Stack.Screen … />` in the root layout, as name + its options text. */
  const screens = [...layout.matchAll(/<Stack\.Screen\b([\s\S]*?)\/>/g)].map((match) => {
    const body = match[1];
    return {
      name: /name="([^"]+)"/.exec(body)?.[1] ?? "",
      body,
      headerHidden: body.includes("headerShown: false"),
    };
  });

  it("finds the root stack's screens", () => {
    // A rename that silently matched nothing would make every assertion below
    // vacuously pass.
    expect(screens.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        "(tabs)",
        "request/category",
        "request/[category]",
        "order/[id]",
        "settings",
        "design-system",
      ]),
    );
  });

  it("never declares an empty title", () => {
    expect(layout).not.toContain('title: ""');
  });

  it("gives every screen with a visible header a real title", () => {
    const untitled = screens
      .filter((s) => !s.headerHidden)
      .filter((s) => !/pushedScreenOptions\(\s*"[^"]+"\s*\)/.test(s.body))
      .map((s) => s.name);

    expect(untitled).toEqual([]);
  });

  it("keeps a labelled way back on every pushed screen", () => {
    // `pushedScreenOptions` is the only place the "Back" label is set, so
    // routing every titled screen through it is what guarantees the label.
    const pushed = screens.filter((s) => !s.headerHidden);
    expect(pushed.length).toBeGreaterThan(0);
    for (const screen of pushed) {
      expect(screen.body).toContain("pushedScreenOptions(");
    }
  });

  it("does not inset a screen that already sits under a header", () => {
    const doubled = screens
      .filter((s) => !s.headerHidden)
      .map((s) => ({
        name: s.name,
        // Comments explain why "top" is wrong here; only real props count.
        source: withoutComments(readFileSync(routeFile(appDir, s.name), "utf8")),
      }))
      .filter(({ source }) => /edges=\{\[[^\]]*"top"/.test(source))
      .map(({ name }) => name);

    expect(doubled).toEqual([]);
  });
});

/** `request/[category]` → `app/request/[category].tsx`. */
function routeFile(appDir: string, routeName: string): string {
  return join(appDir, `${routeName}.tsx`);
}

/** Block and line comments, so prose about a mistake is not read as the mistake. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
