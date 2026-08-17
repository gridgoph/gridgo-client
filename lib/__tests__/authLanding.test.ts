import { authLanding, staysOnAuthScreen } from "@/lib/authLanding";

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

  it("sends a client the platform just created through first-run onboarding", () => {
    expect(
      authLanding({ user: client, pendingClerkProfile: false, justProvisioned: true }),
    ).toEqual({ kind: "onboarding" });
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
