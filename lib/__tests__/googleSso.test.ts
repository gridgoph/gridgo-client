import { completeGoogleSso } from "@/lib/googleSso";

describe("completeGoogleSso", () => {
  it("does not start SSO again when Clerk is already signed in", async () => {
    const startSSOFlow = jest.fn();
    const setActive = jest.fn();

    await expect(
      completeGoogleSso({
        alreadySignedIn: true,
        startSSOFlow,
        setActive,
      }),
    ).resolves.toEqual({ status: "already_signed_in" });

    expect(startSSOFlow).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("calls setActive when SSO creates a session", async () => {
    const setActiveFromFlow = jest.fn(async () => undefined);
    const fallbackSetActive = jest.fn(async () => undefined);

    await expect(
      completeGoogleSso({
        alreadySignedIn: false,
        startSSOFlow: async () => ({
          createdSessionId: "sess_google",
          setActive: setActiveFromFlow,
        }),
        setActive: fallbackSetActive,
      }),
    ).resolves.toEqual({ status: "activated", sessionId: "sess_google" });

    expect(setActiveFromFlow).toHaveBeenCalledWith({ session: "sess_google" });
    expect(fallbackSetActive).not.toHaveBeenCalled();
  });

  it("uses the caller setActive when the SSO result omits it", async () => {
    const setActive = jest.fn(async () => undefined);

    await expect(
      completeGoogleSso({
        alreadySignedIn: false,
        startSSOFlow: async () => ({ createdSessionId: "sess_google" }),
        setActive,
      }),
    ).resolves.toEqual({ status: "activated", sessionId: "sess_google" });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_google" });
  });

  it("stays silent when the person cancels the Google sheet", async () => {
    const setActive = jest.fn();

    await expect(
      completeGoogleSso({
        alreadySignedIn: false,
        startSSOFlow: async () => ({
          createdSessionId: null,
          authSessionResult: { type: "dismiss" },
        }),
        setActive,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(setActive).not.toHaveBeenCalled();
  });
});
