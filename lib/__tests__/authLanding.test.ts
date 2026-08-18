import { authLanding, shouldPreventAuthLeave, staysOnAuthScreen } from "@/lib/authLanding";

const client = { accountType: "individual" as const, orgName: undefined };

describe("authLanding", () => {
  it("keeps a signed-out visitor on the auth screen", () => {
    const landing = authLanding({
      user: null,
      pendingClerkProfile: false,
      justProvisioned: false,
    });
    expect(landing).toEqual({ kind: "signed_out" });
    expect(staysOnAuthScreen(landing)).toBe(true);
  });

  it("sends an adopted client home", () => {
    const landing = authLanding({
      user: client,
      pendingClerkProfile: false,
      justProvisioned: false,
    });
    expect(landing).toEqual({ kind: "home" });
    expect(staysOnAuthScreen(landing)).toBe(false);
  });

  it("sends a just-activated complete client home, not first-run onboarding", () => {
    expect(
      authLanding({ user: client, pendingClerkProfile: false, justProvisioned: true }),
    ).toEqual({ kind: "home" });
  });

  it("never sends an existing client to onboarding", () => {
    expect(
      authLanding({
        user: { accountType: "business", orgName: "Davao Events Co." },
        pendingClerkProfile: false,
        justProvisioned: false,
      }),
    ).toEqual({ kind: "home" });
  });

  it("asks for the missing profile before anything else", () => {
    expect(
      authLanding({
        // Business without the name the lockup reads.
        user: { accountType: "business", orgName: "" },
        pendingClerkProfile: false,
        justProvisioned: true,
      }),
    ).toEqual({ kind: "complete_profile" });
    expect(
      authLanding({ user: null, pendingClerkProfile: true, justProvisioned: false }),
    ).toEqual({ kind: "complete_profile" });
  });
});

describe("shouldPreventAuthLeave", () => {
  it("holds the code step only while the person is still signed out", () => {
    expect(shouldPreventAuthLeave({ kind: "signed_out" }, true)).toBe(true);
    expect(shouldPreventAuthLeave({ kind: "signed_out" }, false)).toBe(false);
  });

  it("lets a successful adopt leave even if the code step is still showing", () => {
    expect(shouldPreventAuthLeave({ kind: "home" }, true)).toBe(false);
    expect(shouldPreventAuthLeave({ kind: "complete_profile" }, true)).toBe(false);
    expect(shouldPreventAuthLeave({ kind: "onboarding" }, true)).toBe(false);
  });
});
