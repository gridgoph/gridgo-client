/**
 * Optional live walk against gridgo-api.
 *
 * Skips when the API is not reachable, so a checkout with no backend still
 * passes — and skips just as quietly when no account is supplied, because it
 * no longer carries one. The password this used to hardcode was the same demo
 * credential the sign-in screen used to pre-fill, and the pilot moved those to
 * deployment configuration precisely so nothing published is a way in. A
 * password in a test file is published too.
 *
 * To run it, hand it an account:
 *
 *   GRIDGO_LIVE_EMAIL=client@gridgo.local GRIDGO_LIVE_PASSWORD=… npx jest session.live
 */
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
const LIVE_EMAIL = process.env.GRIDGO_LIVE_EMAIL ?? "";
const LIVE_PASSWORD = process.env.GRIDGO_LIVE_PASSWORD ?? "";

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
  let runnable = false;

  beforeAll(async () => {
    runnable = Boolean(LIVE_EMAIL && LIVE_PASSWORD) && (await apiReachable());
  });

  beforeEach(() => {
    useSession.setState({ user: null, loading: false, error: null });
    api.setToken(null);
  });

  it("signs in with the supplied account, then logout clears session", async () => {
    if (!runnable) {
      console.warn(skipReason("live session test"));
      return;
    }

    // Point the client at the live origin for this process.
    process.env.EXPO_PUBLIC_API_URL = API_BASE;

    await useSession.getState().login(LIVE_EMAIL, LIVE_PASSWORD);

    const afterLogin = useSession.getState();
    expect(afterLogin.error).toBeNull();
    expect(afterLogin.user?.email).toBe(LIVE_EMAIL);
    expect(afterLogin.user?.role).toBe("client");
    expect(api.getToken()).toBeTruthy();

    await useSession.getState().logout();

    expect(useSession.getState().user).toBeNull();
    expect(api.getToken()).toBeNull();
  });

  it("expired token 401 clears the session the same way as logout", async () => {
    if (!runnable) {
      console.warn(skipReason("live 401 test"));
      return;
    }

    process.env.EXPO_PUBLIC_API_URL = API_BASE;

    await useSession.getState().login(LIVE_EMAIL, LIVE_PASSWORD);
    expect(useSession.getState().user).not.toBeNull();

    // Force a dead token while keeping the user in the store (simulates expiry).
    api.setToken("tok_definitely_invalid");

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(api.getToken()).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });
});

/** Says which of the two preconditions is missing, rather than just "skipped". */
function skipReason(what: string): string {
  return LIVE_EMAIL && LIVE_PASSWORD
    ? `skip ${what}: API not reachable at ${API_BASE}`
    : `skip ${what}: set GRIDGO_LIVE_EMAIL and GRIDGO_LIVE_PASSWORD to run it`;
}
