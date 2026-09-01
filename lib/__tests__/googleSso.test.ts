import {
  completeGoogleSso,
  createdSessionIdFromSsoReload,
  finishGoogleSsoReturn,
  googleSsoCreatedSessionId,
  googleSsoRotatingTokenNonce,
  reloadClerkSignInForSso,
} from "@/lib/googleSso";

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

describe("Google SSO native return", () => {
  it("reads createdSessionId from either callback spelling", () => {
    expect(googleSsoCreatedSessionId({ createdSessionId: "sess_google" })).toBe("sess_google");
    expect(googleSsoCreatedSessionId({ created_session_id: ["sess_google"] })).toBe("sess_google");
    expect(googleSsoCreatedSessionId({})).toBeNull();
  });

  it("reads the rotating token nonce Clerk puts on the native redirect", () => {
    expect(googleSsoRotatingTokenNonce({ rotating_token_nonce: "nonce_1" })).toBe("nonce_1");
    expect(googleSsoRotatingTokenNonce({ rotatingTokenNonce: ["nonce_1"] })).toBe("nonce_1");
    expect(googleSsoRotatingTokenNonce({})).toBeNull();
  });

  it("does not start SSO when Clerk is already signed in on the callback", async () => {
    const setActive = jest.fn();

    await expect(
      finishGoogleSsoReturn({
        alreadySignedIn: true,
        createdSessionId: "sess_google",
        setActive,
      }),
    ).resolves.toEqual({ status: "already_signed_in" });

    expect(setActive).not.toHaveBeenCalled();
  });

  it("calls setActive when the callback carries a created session", async () => {
    const setActive = jest.fn(async () => undefined);

    await expect(
      finishGoogleSsoReturn({
        alreadySignedIn: false,
        createdSessionId: "sess_google",
        setActive,
      }),
    ).resolves.toEqual({ status: "activated", sessionId: "sess_google" });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_google" });
  });

  it("stays incomplete until Clerk is signed in or a session id appears", async () => {
    const setActive = jest.fn();

    await expect(
      finishGoogleSsoReturn({
        alreadySignedIn: false,
        createdSessionId: null,
        setActive,
      }),
    ).resolves.toEqual({ status: "incomplete" });

    expect(setActive).not.toHaveBeenCalled();
  });

  it("activates the session created by a nonce reload", async () => {
    const finalize = jest.fn(async () => ({ error: null }));

    await expect(
      createdSessionIdFromSsoReload(
        {
          __internal_future: {
            createdSessionId: "sess_google",
            firstFactorVerification: { status: "verified" },
            finalize,
          },
        },
        jest.fn(),
      ),
    ).resolves.toBe("sess_google");

    expect(finalize).toHaveBeenCalled();
  });

  it("transfers a new Google account then finalizes that session", async () => {
    const signInFinalize = jest.fn();
    const signUpFinalize = jest.fn(async () => ({ error: null }));
    const transfer = jest.fn(async () => ({
      createdSessionId: "sess_new",
      finalize: signUpFinalize,
    }));

    await expect(
      createdSessionIdFromSsoReload(
        {
          createdSessionId: null,
          firstFactorVerification: { status: "transferable" },
          finalize: signInFinalize,
        },
        transfer,
      ),
    ).resolves.toBe("sess_new");

    expect(transfer).toHaveBeenCalled();
    expect(signInFinalize).not.toHaveBeenCalled();
    expect(signUpFinalize).toHaveBeenCalled();
  });

  it("reloads Clerk's sign-in with the rotating token nonce", async () => {
    const reload = jest.fn(async () => ({ createdSessionId: "sess_google" }));

    await expect(
      reloadClerkSignInForSso({ client: { signIn: { reload } } }, "nonce_1"),
    ).resolves.toEqual({ createdSessionId: "sess_google" });

    expect(reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce_1" });
  });
});
