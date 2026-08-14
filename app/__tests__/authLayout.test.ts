import { readFileSync } from "node:fs";
import { join } from "node:path";

const authDir = join(__dirname, "../(auth)");
const welcome = readFileSync(join(authDir, "welcome.tsx"), "utf8");
const login = readFileSync(join(authDir, "login.tsx"), "utf8");
const signup = readFileSync(join(authDir, "signup.tsx"), "utf8");

describe("public Clerk auth layout", () => {
  it("starts with the branded welcome actions and supplied illustration", () => {
    expect(welcome).toContain("greeting.svg");
    expect(welcome).toContain('label="Sign Up"');
    expect(welcome).toContain('label="Already have an account"');
  });

  it("uses custom Clerk sign-in with password recovery and Google only", () => {
    expect(login).toContain("useSignIn");
    expect(login).toContain("resetPasswordEmailCode");
    expect(login).toContain("oauth_google");
    expect(login).toContain("PasswordField");
    expect(login).not.toMatch(/facebook/i);
  });

  it("keeps the four-field sign-up and verification in FormScreen", () => {
    expect(signup).toContain("<FormScreen");
    expect(signup).toContain('accessibilityLabel="Full name"');
    expect(signup).toContain('accessibilityLabel="Confirm password"');
    expect(signup).toContain("sendEmailCode");
    expect(signup).toContain('nativeID="clerk-captcha"');
  });

  it("keeps the legacy endpoint behind a development-only branch", () => {
    expect(login).toContain("__DEV__");
    expect(login).toContain("Use local API instead");
  });

  it("keeps login and signup on the shared page gutter", () => {
    // The captain's "stuck to the edge" was the text *inside* the field,
    // not the page chrome around it. A 32px auth-only gutter was the wrong
    // diagnosis; login and signup sit on `gg-page` like every other screen.
    expect(login).toContain("gg-page");
    expect(signup).toContain("gg-page");
    expect(welcome).toContain("gg-page");
    expect(login).not.toContain("gg-auth-page");
    expect(signup).not.toContain("gg-auth-page");
    expect(welcome).not.toContain("gg-auth-page");

    const styles = readFileSync(join(__dirname, "../../global.css"), "utf8");
    expect(styles).toMatch(/@utility gg-page \{\s*@apply px-4;/);
    expect(styles).not.toMatch(/@utility gg-auth-page/);
  });

  it("insets placeholder and value inside every gg-field", () => {
    // 12px (`px-3`) left the first letter kissing the stroke. 20px (`px-5`)
    // is the inner inset; do not substitute extra page padding for it.
    const styles = readFileSync(join(__dirname, "../../global.css"), "utf8");
    expect(styles).toMatch(
      /@utility gg-field \{\s*@apply h-12 rounded-field border border-outline bg-surface px-5 /,
    );
    expect(styles).not.toMatch(/@utility gg-field \{[^}]*\bpx-3\b/);

    const passwordField = readFileSync(
      join(__dirname, "../../components/form/PasswordField.tsx"),
      "utf8",
    );
    // Eye is `right-1` + `w-11` (48px). `pr-16` (64px) keeps the value
    // clear of that control after the shared field pad grew.
    expect(passwordField).toContain('className="gg-field pr-16"');
  });
});
