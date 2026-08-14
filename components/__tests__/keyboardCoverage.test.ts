import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The rule, rather than the seven edits that established it.
 *
 * The captain's report was "typing covers the field". The two screens they
 * happened to be on were only the two they happened to be on: every form in the
 * app had the same defect in one of two shapes. Some wrapped React Native's
 * `KeyboardAvoidingView`, which pads a container but never scrolls, so on a
 * form longer than a phone the space appeared at the bottom while the caret
 * stayed under the keyboard — and which does nothing at all on Android under
 * the edge-to-edge that Expo SDK 54 makes mandatory. Others (the request
 * stepper, the order screen) had no keyboard handling whatsoever.
 *
 * So the fix is a shell every screen with an input opens through, and this test
 * is what stops the eighth form from skipping it. It reads the sources rather
 * than rendering, because what is being asserted is a composition rule; the
 * behaviour itself is native and cannot be proven in Jest or in a browser.
 */
describe("keyboard coverage contract", () => {
  const root = join(__dirname, "../..");
  const appDir = join(root, "app");
  const componentsDir = join(root, "components");

  const routes = sourceFiles(appDir).filter((file) => !file.includes("__tests__"));

  it("finds the app's routes", () => {
    // A move that silently matched nothing would make the rule vacuous.
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.some((file) => file.endsWith("login.tsx"))).toBe(true);
  });

  /**
   * Components that render a field of their own, so a route that only shows
   * one of them still counts as a form. The order screen is exactly that case:
   * its two inputs — the payment reference and an issue description — are
   * inside `PaymentPanel` and `IssueWindowCard`, and the route's own source
   * mentions neither `TextInput` nor `TextField`.
   */
  const inputComponents = sourceFiles(componentsDir)
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /<TextInput\b|<TextField\b/.test(readFileSync(file, "utf8")))
    .map((file) => file.split("/").pop()!.replace(/\.tsx?$/, ""));

  it("finds the components that carry a field", () => {
    expect(inputComponents.sort()).toEqual(
      expect.arrayContaining(["IssueWindowCard", "OptionPicker", "PaymentPanel", "TextField"]),
    );
  });

  it("opens every route with a text input through a keyboard-aware shell", () => {
    const offenders = routes
      .filter((file) => takesTypedInput(readFileSync(file, "utf8"), inputComponents))
      .filter((file) => !isKeyboardAware(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));

    // `FormScreen` for a scrolling form; a `KeyboardAvoidingView` from
    // react-native-keyboard-controller where the content is a sheet rather than
    // a scroll (`order/request-changes`, which is a platform form sheet).
    expect(offenders).toEqual([]);
  });

  it("never reaches for React Native's own KeyboardAvoidingView", () => {
    const files = [...routes, ...sourceFiles(componentsDir)].filter(
      (file) => !file.includes("__tests__"),
    );

    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /import\s*\{[^}]*\bKeyboardAvoidingView\b[^}]*\}\s*from\s*"react-native"/.test(
          source,
        );
      })
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it("lets a scrolling form dismiss the keyboard by tapping outside it", () => {
    // `handled` is what makes a tap on the background dismiss while a tap on a
    // button still presses it. `always` would swallow the dismissal; the
    // default would swallow the press.
    const shell = readFileSync(join(componentsDir, "FormScreen.tsx"), "utf8");
    expect(shell).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("keeps a screen under a header off the top edge", () => {
    // `FormScreen` passes `edges` straight to SafeAreaView, so the existing
    // pushed-route rule still has to hold through it. Only screens that own
    // their top edge — the tab shell, welcome, and full-bleed routes — may
    // claim it. Login and signup sit under the native stack header.
    const claiming = routes
      .filter((file) => /edges=\{\[[^\]]*"top"/.test(withoutComments(readFileSync(file, "utf8"))))
      .map((file) => relative(root, file));

    expect(claiming.sort()).toEqual([
      "app/(auth)/welcome.tsx",
      "app/(tabs)/account.tsx",
      "app/(tabs)/home.tsx",
      "app/(tabs)/new-request.tsx",
      "app/(tabs)/notifications.tsx",
      "app/(tabs)/orders.tsx",
      "app/onboarding.tsx",
    ]);
  });
});

describe("sign-in screen", () => {
  const source = readFileSync(join(__dirname, "../../app/(auth)/login.tsx"), "utf8");

  /**
   * The screen used to open with a demo account and its password already typed
   * into the fields. On a laptop that is convenience; on the hosted pilot's
   * public domain it hands a way in to anyone who opens the app. The pilot's
   * demo passwords come from deployment configuration now, so a credential
   * written here is both a giveaway and a stale one.
   */
  it("starts both credential fields empty", () => {
    expect(source).toContain('const [email, setEmail] = useState("")');
    expect(source).toContain('const [password, setPassword] = useState("")');
  });

  it("names no account and no password anywhere on the screen", () => {
    const rendered = withoutComments(source);
    expect(rendered).not.toMatch(/@gridgo\.local/);
    expect(rendered).not.toMatch(/\bdemo\b/i);
  });
});

/** Every `.ts`/`.tsx` under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * A screen takes typed input if it renders a field itself, or renders one of
 * the components that does.
 */
function takesTypedInput(source: string, inputComponents: string[]): boolean {
  if (/<TextInput\b|<TextField\b/.test(source)) return true;
  return inputComponents.some((name) => new RegExp(`<${name}\\b`).test(source));
}

function isKeyboardAware(source: string): boolean {
  return (
    /<FormScreen\b/.test(source) ||
    /from "react-native-keyboard-controller"/.test(source)
  );
}

/** Prose about a mistake must not be read as the mistake. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
