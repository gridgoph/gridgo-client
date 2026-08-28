import * as api from "@/lib/api";

describe("API Clerk token provider", () => {
  beforeEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    api.setTokenProvider(null);
  });

  it("sends the current Clerk token when no legacy session exists", async () => {
    api.setTokenProvider(async () => "clerk-session-token");
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ user: null }),
    } as Response);

    await api.me();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer clerk-session-token" }),
      }),
    );
  });

  it("keeps a development legacy token ahead of Clerk", async () => {
    const provider = jest.fn(async () => "clerk-session-token");
    api.setTokenProvider(provider);
    api.setToken("tok_local");
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ user: null }),
    } as Response);

    await api.me();

    expect(provider).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok_local" }),
      }),
    );
  });

  it("mints a fresh token once and retries rather than treating a 401 as a dead session", async () => {
    // Clerk's cached JWT is the bearer on every request; when gridgo-api
    // refuses one, a forced mint is the cheap thing to try before deciding
    // the person is signed out. Nothing may clear the session on that first
    // 401 — that is how a live Clerk session came out as "sign in again".
    const provider = jest.fn(async (options?: { force?: boolean }) =>
      options?.force ? "fresh-token" : "cached-token",
    );
    api.setTokenProvider(provider);
    const unauthorized = jest.fn();
    const stop = api.onUnauthorized(unauthorized);
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: "unauthorized" }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ user: { id: "u1" } }),
      } as Response);

    await expect(api.me()).resolves.toMatchObject({ id: "u1" });

    expect(provider).toHaveBeenNthCalledWith(1, { force: false });
    expect(provider).toHaveBeenNthCalledWith(2, { force: true });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      }),
    );
    expect(unauthorized).not.toHaveBeenCalled();

    stop();
  });

  it("gives up after one forced mint, so a really dead session still clears", async () => {
    const provider = jest.fn(async (options?: { force?: boolean }) =>
      options?.force ? "fresh-token" : "cached-token",
    );
    api.setTokenProvider(provider);
    const unauthorized = jest.fn();
    const stop = api.onUnauthorized(unauthorized);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(unauthorized).toHaveBeenCalledTimes(1);

    stop();
  });

  it("can probe /auth/me without clearing a Clerk session on 401", async () => {
    api.setTokenProvider(async () => "clerk-session-token");
    const unauthorized = jest.fn();
    const stop = api.onUnauthorized(unauthorized);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(api.me({ ignoreUnauthorized: true })).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).not.toHaveBeenCalled();
    // And it does not buy a mint either: that 401 means the identity is not
    // mapped yet, which a fresher token does not change. Activate follows.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stop();
    fetchMock.mockRestore();
  });
});
