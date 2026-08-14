import * as api from "@/lib/api";
import { useSession } from "@/store/session";

describe("session store", () => {
  beforeEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
    useSession.getState().registerIdentityLogout(null);
    api.setToken(null);
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
