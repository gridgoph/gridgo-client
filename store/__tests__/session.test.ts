import * as api from "@/lib/api";
import { CLERK_SIGNOUT_TIMEOUT_MS } from "@/lib/clerkSignIn";
import { LOGOUT_API_TIMEOUT_MS, useSession } from "@/store/session";

describe("session store", () => {
  beforeEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      signingOut: false,
      ssoInFlight: false,
      sessionWait: null,
      clerkSyncNonce: 0,
    });
    useSession.getState().registerIdentityLogout(null);
    api.setToken(null);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("does not restore a Clerk client while signing out", () => {
    useSession.setState({ signingOut: true });
    useSession.getState().adoptClerkUser({
      id: "u1",
      email: "client@gridgo.local",
      name: "Client",
      role: "client",
    });
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().signingOut).toBe(true);
  });

  it("does not clear the sign-out latch when a Clerk sync starts", () => {
    useSession.setState({ signingOut: true, loading: false });
    useSession.getState().beginClerkSync();
    expect(useSession.getState().signingOut).toBe(true);
    expect(useSession.getState().loading).toBe(false);
  });

  it("marks Google in flight so Welcome cannot paint before the callback", () => {
    useSession.getState().beginClerkSync({ google: true });
    expect(useSession.getState().ssoInFlight).toBe(true);
    useSession.getState().endClerkSync();
    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().ssoInFlight).toBe(true);
  });

  it("logout drops the user and keeps the sign-out latch", async () => {
    jest.spyOn(api, "logout").mockResolvedValue(undefined);
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
      source: "clerk",
      ssoInFlight: true,
    });
    await useSession.getState().logout();
    expect(useSession.getState()).toMatchObject({
      user: null,
      signingOut: true,
      ssoInFlight: false,
      sessionWait: null,
    });
    expect(useSession.getState().sessionWait).toBeNull();
  });

  it("adopts a Clerk-authenticated client without storing its token", () => {
    useSession.getState().adoptClerkUser({
      id: "u1",
      email: "client@gridgo.local",
      name: "Client",
      role: "client",
    });

    expect(useSession.getState()).toMatchObject({
      user: { id: "u1", role: "client" },
      source: "clerk",
      loading: false,
    });
    expect(api.getToken()).toBeNull();
  });

  it("signs out both the domain and Clerk session", async () => {
    const identityLogout = jest.fn(async () => undefined);
    useSession.getState().registerIdentityLogout(identityLogout);
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
      source: "clerk",
    });
    const logoutSpy = jest.spyOn(api, "logout").mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(logoutSpy).toHaveBeenCalled();
    expect(identityLogout).toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ user: null, source: null });
  });

  it("leaves the signed-in area before a hung API logout finishes", async () => {
    jest.useFakeTimers();
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
      source: "clerk",
    });
    jest.spyOn(api, "logout").mockReturnValue(new Promise(() => {}));
    useSession.getState().registerIdentityLogout(jest.fn(async () => undefined));

    const pending = useSession.getState().logout();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().signingOut).toBe(true);

    await jest.advanceTimersByTimeAsync(LOGOUT_API_TIMEOUT_MS);
    await pending;
    jest.useRealTimers();
  });

  it("finishes sign-out even when Clerk never answers", async () => {
    jest.useFakeTimers();
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
      source: "clerk",
    });
    jest.spyOn(api, "logout").mockResolvedValue(undefined);
    useSession.getState().registerIdentityLogout(() => new Promise(() => {}));

    const pending = useSession.getState().logout();
    expect(useSession.getState().user).toBeNull();

    await jest.advanceTimersByTimeAsync(CLERK_SIGNOUT_TIMEOUT_MS);
    await pending;
    jest.useRealTimers();
  });

  it("logout clears the user so the route guard can leave the signed-in area", async () => {
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
    });
    api.setToken("demo-token");

    const logoutSpy = jest.spyOn(api, "logout").mockResolvedValue(undefined);
    await useSession.getState().logout();

    expect(logoutSpy).toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
    logoutSpy.mockRestore();
  });

  it("clearSession drops the user without calling the network", () => {
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
      loading: true,
    });

    useSession.getState().clearSession();

    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().loading).toBe(false);
  });

  it("a 401 with a bearer token clears the session via onUnauthorized", async () => {
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Client",
        role: "client",
      },
    });
    api.setToken("stale-token");

    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(api.getToken()).toBeNull();
    expect(useSession.getState().user).toBeNull();

    fetchMock.mockRestore();
  });

  it("a login 401 does not clear session when there was no bearer token", async () => {
    api.setToken(null);
    useSession.setState({ user: null });

    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid_credentials" }),
    } as Response);

    await useSession.getState().login("bad@example.com", "wrong");

    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBe("Wrong email or password.");
    // Token stays null; unauthorized path must not run for credential failures.
    expect(api.getToken()).toBeNull();

    fetchMock.mockRestore();
  });
});
