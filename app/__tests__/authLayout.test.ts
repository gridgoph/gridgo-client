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

  it("gives login and signup a wider gutter than gg-page", () => {
    // 16px (`gg-page` / `px-4`) leaves field shells flush to the phone
    // edge. Auth forms own a 32px gutter; Home and Orders stay on `gg-page`.
    expect(login).toContain("gg-auth-page");
    expect(signup).toContain("gg-auth-page");
    expect(login).not.toContain("gg-page");
    expect(signup).not.toContain("gg-page");
    expect(welcome).toContain("gg-page");
    expect(welcome).not.toContain("gg-auth-page");

    const styles = readFileSync(join(__dirname, "../../global.css"), "utf8");
    expect(styles).toMatch(/@utility gg-page \{\s*@apply px-4;/);
    expect(styles).toMatch(/@utility gg-auth-page \{\s*@apply px-8;/);
  });
});
