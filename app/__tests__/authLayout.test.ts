import { readFileSync } from "node:fs";
import { join } from "node:path";

const authDir = join(__dirname, "../(auth)");
const welcome = readFileSync(join(authDir, "welcome.tsx"), "utf8");
const login = readFileSync(join(authDir, "login.tsx"), "utf8");
const signup = readFileSync(join(authDir, "signup.tsx"), "utf8");

describe("public Clerk auth layout", () => {
  it("starts with the branded welcome actions and supplied illustration", () => {
    expect(welcome).toContain("greeting.svg");
    expect(welcome).toContain("contentFit=\"contain\"");
    expect(welcome).toContain("943 / 796");
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

  it("never loads push on the public login screen", () => {
    // Expo Go Android SDK 53 throws when `expo-notifications` is first imported.
    // Login used to pull that in through PushEnableCard → store/push. Alerts
    // belong on signed-in surfaces, so this screen must not touch the graph.
    expect(login).not.toContain("PushEnableCard");
    expect(login).not.toContain("store/push");
    expect(login).not.toContain("usePush");
    expect(login).not.toContain("expo-notifications");
  });

  it("uses the native stack header instead of a custom round back", () => {
    expect(login).not.toContain("AuthBackButton");
    expect(signup).not.toContain("AuthBackButton");
    expect(login).not.toMatch(/edges=\{\[["']top["']/);
    expect(signup).not.toMatch(/edges=\{\[["']top["']/);
  });

  it("keeps the four-field sign-up and verification in FormScreen", () => {
    expect(signup).toContain("<FormScreen");
    expect(signup).toContain('accessibilityLabel="Full name"');
    expect(signup).toContain('accessibilityLabel="Confirm password"');
    expect(signup).toContain("sendEmailCode");
    expect(signup).toContain('nativeID="clerk-captcha"');
  });

  it("does not say client accounts sign up here", () => {
    expect(signup).not.toMatch(/Client accounts/i);
    expect(login).not.toMatch(/Client accounts/i);
    expect(welcome).not.toMatch(/Client accounts/i);
    expect(signup).toContain("Suppliers, riders, and Operations use their own");
    expect(signup).toContain("GRIDGO app");
  });

  it("keeps the legacy endpoint behind a development-only branch", () => {
    expect(login).toContain("__DEV__");
    expect(login).toContain("Use local API instead");
  });
});
