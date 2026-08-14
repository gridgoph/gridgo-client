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
});
