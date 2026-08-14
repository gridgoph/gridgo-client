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
});
