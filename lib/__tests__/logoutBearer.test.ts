import { captureLogoutBearer, getToken, logout, setToken, setTokenProvider } from "@/lib/api";

it("uses the captured old bearer for detach without clearing a newly signed-in token", async () => {
  let resolve!: (token: string) => void;
  setToken(null);
  setTokenProvider(() => new Promise((done) => { resolve = done; }));
  const bearer = captureLogoutBearer();
  setTokenProvider(null);
  setToken("new-account-token");
  global.fetch = jest.fn(async () => ({ ok: true } as Response)) as typeof fetch;
  resolve("old-account-token");
  await logout("installation-token", bearer);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/logout"), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer old-account-token", "X-GRIDGO-Role": "client" }),
    body: JSON.stringify({ deviceToken: "installation-token" }),
  }));
  expect(getToken()).toBe("new-account-token");
  setToken(null);
});
