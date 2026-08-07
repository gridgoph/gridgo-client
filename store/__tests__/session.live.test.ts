/**
 * Optional live walk against gridgo-api.
 * Skips when the API is not reachable so CI without the backend still passes.
 */
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8787";

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET" });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

describe("session live against gridgo-api", () => {
  let reachable = false;

  beforeAll(async () => {
    reachable = await apiReachable();
  });

  beforeEach(() => {
    useSession.setState({ user: null, loading: false, error: null });
    api.setToken(null);
  });

  it("signs in as client@gridgo.local, then logout clears session", async () => {
    if (!reachable) {
      console.warn("skip live session test: API not reachable at", API_BASE);
      return;
    }

    // Point the client at the live origin for this process.
    process.env.EXPO_PUBLIC_API_URL = API_BASE;

    await useSession.getState().login("client@gridgo.local", "demo");

    const afterLogin = useSession.getState();
    expect(afterLogin.error).toBeNull();
    expect(afterLogin.user?.email).toBe("client@gridgo.local");
    expect(afterLogin.user?.role).toBe("client");
    expect(api.getToken()).toBeTruthy();

    await useSession.getState().logout();

    expect(useSession.getState().user).toBeNull();
    expect(api.getToken()).toBeNull();
  });

  it("expired token 401 clears the session the same way as logout", async () => {
    if (!reachable) {
      console.warn("skip live 401 test: API not reachable at", API_BASE);
      return;
    }

    process.env.EXPO_PUBLIC_API_URL = API_BASE;

    await useSession.getState().login("client@gridgo.local", "demo");
    expect(useSession.getState().user).not.toBeNull();

    // Force a dead token while keeping the user in the store (simulates expiry).
    api.setToken("tok_definitely_invalid");

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(api.getToken()).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });
});
