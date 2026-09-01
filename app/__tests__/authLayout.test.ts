import { readFileSync } from "node:fs";
import { join } from "node:path";

const authDir = join(__dirname, "../(auth)");
const welcome = readFileSync(join(authDir, "welcome.tsx"), "utf8");
const login = readFileSync(join(authDir, "login.tsx"), "utf8");
const signup = readFileSync(join(authDir, "signup.tsx"), "utf8");

describe("public Clerk auth layout", () => {
  it("starts with the branded welcome actions and supplied illustration", () => {
    expect(welcome).toContain("welcome.png");
    expect(welcome).toContain("contentFit=\"contain\"");
    expect(welcome).toContain("aspectRatio: 1");
    expect(welcome).toContain('label="Sign Up"');
    expect(welcome).toContain('label="Already have an account"');
  });

  it("uses custom Clerk sign-in with password recovery and Google only", () => {
    expect(login).toContain("useSignIn");
    expect(login).toContain("resetPasswordEmailCode");
    expect(login).toContain("oauth_google");
    expect(login).toContain("completeGoogleSso");
    expect(login).toContain("setActive");
    expect(login).toContain("PasswordField");
    expect(login).not.toMatch(/facebook/i);
  });

  it("keeps MFA verify on a real OTP step and recovery on its own form", () => {
    expect(login).toContain("OtpCodeStep");
    expect(login).toContain("shouldPreventAuthLeave");
    expect(signup).toContain("OtpCodeStep");
    expect(signup).toContain("shouldPreventAuthLeave");
    expect(login).toContain('accessibilityLabel="Recovery code"');
    expect(login).toContain("verifyCode");
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

  it("does not expose a local API sign-in fallback on the login screen", () => {
    expect(login).not.toContain("Use local API instead");
    expect(login).not.toContain("state.login");
  });

  it("refuses a non-client email before Clerk sends a verification code", () => {
    expect(login).toContain("verificationCodeGate");
    expect(login).toContain("clientEmailAvailable");
    expect(login).toContain("refuseNonClientEmail");
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

  it("leaves horizontal insets to each native field instead of NativeWind", () => {
    // On Android a gg-field px-* can clobber the TextInput's native style,
    // depending on NativeWind merge order. The shared shell must not own it.
    const styles = readFileSync(join(__dirname, "../../global.css"), "utf8");
    const fieldUtility = /@utility gg-field \{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(fieldUtility).not.toMatch(/\bpx-/);
    expect(fieldUtility).not.toMatch(/padding-(?:inline|left|right|start|end)/);
  });
});
