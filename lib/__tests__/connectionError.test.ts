import * as api from "@/lib/api";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import { bridgeClerkToGridgo, clerkVerificationRejectedMessage } from "@/lib/clerkSessionBridge";
import { continuationAfterPassword, clerkPasswordIncompleteMessage } from "@/lib/clerkSignIn";
import {
  CONNECTION_ERROR_MESSAGE,
  ConnectionError,
  safeErrorText,
} from "@/lib/connectionError";
import { userFacingError } from "@/lib/copy";
import { useNotifications } from "@/store/notifications";

const FALLBACK = "Could not load this. Try again.";
const API_HOST = new URL(api.getApiBase()).hostname;

/** Every way a platform has been seen, or documented, to word a dropped request. */
const RAW_FAILURES: readonly (readonly [string, Error])[] = [
  ["React Native", new TypeError("Network request failed")],
  ["Chrome", new TypeError("Failed to fetch")],
  ["Firefox", new TypeError("NetworkError when attempting to fetch resource.")],
  ["Safari", new TypeError("Load failed")],
  ["expo/fetch, DNS", new Error(`fetch failed: java.net.UnknownHostException: Unable to resolve host "${API_HOST}": No address associated with hostname`)],
  ["expo/fetch, refused", new Error(`fetch failed: Failed to connect to /${API_HOST}:443`)],
  ["expo/fetch, TLS", new Error("fetch failed: javax.net.ssl.SSLHandshakeException: Chain validation failed")],
  ["expo/fetch, iOS", new Error("fetch failed: The Internet connection appears to be offline.")],
  ["expo/fetch, iOS host", new Error("fetch failed: A server with the specified hostname could not be found.")],
  ["expo/fetch, unknown", new Error("fetch failed: Unknown error")],
  ["Clerk", new Error('ClerkJS: Network error at "https://clerk.example.com/v1/client/sign_ins?__clerk_db_jwt=dvb_x" - TypeError: Failed to fetch. Please try again.')],
];

function expectFriendly(message: string, raw: string) {
  expect(message).toBe(CONNECTION_ERROR_MESSAGE);
  expect(message).not.toContain(api.getApiBase());
  expect(message).not.toContain(API_HOST);
  expect(message.toLowerCase()).not.toContain("http");
  expect(message).not.toContain(raw);
}

describe("a connection failure, in any platform's words", () => {
  it.each(RAW_FAILURES)("%s reads as the one message through userFacingError", (_name, raw) => {
    expectFriendly(userFacingError(raw, FALLBACK), raw.message);
  });

  it.each(RAW_FAILURES)("%s reads as the one message through clerkErrorMessage", (_name, raw) => {
    expectFriendly(clerkErrorMessage(raw, FALLBACK), raw.message);
  });

  it.each(RAW_FAILURES)("%s is a network failure to the session bridge", async (_name, raw) => {
    const result = await bridgeClerkToGridgo({
      me: async () => {
        throw raw;
      },
      activate: jest.fn(),
      awaitToken: async () => "jwt",
    });
    expect(result).toEqual({ kind: "error", message: CONNECTION_ERROR_MESSAGE, signOut: false });
  });
});

describe("the request layer", () => {
  beforeEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws a ConnectionError whose message names no address", async () => {
    const raw = `fetch failed: Unable to resolve host "${API_HOST}"`;
    jest.spyOn(global, "fetch").mockRejectedValue(new Error(raw));

    const thrown = await api.me().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ConnectionError);
    expect(api.isNetworkFailure(thrown)).toBe(true);
    expectFriendly((thrown as Error).message, raw);
    // Still there for a developer, off the screen.
    expect((thrown as ConnectionError).detail).toEqual(new Error(raw));
  });

  it("covers a connection lost while the body is being read", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("fetch failed: stream was reset: CANCEL");
      },
    } as unknown as Response);

    await expect(api.me()).rejects.toBeInstanceOf(ConnectionError);
  });

  it("covers the calls that bypass request()", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Network request failed"));

    await expect(api.clientEmailAvailable("a@example.com")).rejects.toBeInstanceOf(ConnectionError);
    await expect(api.registerDeviceUnclaimed("token", "android")).rejects.toBeInstanceOf(ConnectionError);
  });

  it("logs the raw detail in a development build only", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await api.me().catch(() => undefined);

    expect(log).toHaveBeenCalledWith("[connection] GET /auth/me:", new TypeError("Failed to fetch"));
  });
});

describe("what still reaches a client as written", () => {
  it("keeps a sentence the app wrote for a client", () => {
    const written = "The delivery address changed. Choose it again.";
    expect(userFacingError(new Error(written), FALLBACK)).toBe(written);
  });

  it("keeps a sentence the server wrote for a client", () => {
    const refusal = new api.ApiError(400, {
      error: "contact_phone_required",
      message: "Enter a Philippine mobile number, for example 0917 123 4567.",
    });
    expect(userFacingError(refusal, FALLBACK)).toBe(
      "Enter a Philippine mobile number, for example 0917 123 4567.",
    );
  });

  it("keeps Clerk's own structured sentence, and an email inside it", () => {
    const written = "ana@example.com is already taken.";
    expect(clerkErrorMessage({ errors: [{ longMessage: written }] }, FALLBACK)).toBe(written);
  });

  it("keeps the copy that merely mentions a connection", () => {
    const written = "GRIDGO could not sign you out. Check your connection and try again.";
    expect(safeErrorText(written, FALLBACK)).toBe(written);
  });
});

describe("other technical text", () => {
  it.each([
    "undefined is not a function",
    "Cannot read properties of undefined (reading 'id')",
    "JSON Parse error: Unexpected character: <",
    `Could not open https://${API_HOST}/orders`,
    `${API_HOST.includes(".") ? API_HOST : "api.example.com"} refused`,
    "10.0.2.2 refused",
    "ClerkJS: Something went wrong",
  ])("falls back rather than showing %s", (raw) => {
    expect(userFacingError(new Error(raw), FALLBACK)).toBe(FALLBACK);
  });

  it("never shows a status dump for a body with no code", () => {
    expect(userFacingError(new api.ApiError(404, "<html>nope</html>"), FALLBACK)).toBe(FALLBACK);
  });
});

describe("sign-in copy", () => {
  it("names no address and no vendor when GRIDGO refuses a fresh token", () => {
    expect(clerkVerificationRejectedMessage()).not.toMatch(/https?:|clerk/i);
    expect(clerkVerificationRejectedMessage()).not.toContain(api.getApiBase());
  });

  it("calls an attempt that never landed a connection problem, not a verification step", () => {
    for (const status of [null, undefined, "needs_identifier"]) {
      expect(continuationAfterPassword(status)).toEqual({
        kind: "blocked",
        message: CONNECTION_ERROR_MESSAGE,
      });
    }
    expect(continuationAfterPassword("needs_first_factor")).toEqual({
      kind: "blocked",
      message: clerkPasswordIncompleteMessage,
    });
  });
});

describe("the inbox store", () => {
  it("shows the one message, not the raw text, when its read cannot connect", async () => {
    const raw = `fetch failed: Unable to resolve host "${API_HOST}"`;
    jest.spyOn(global, "fetch").mockRejectedValue(new Error(raw));
    useNotifications.getState().setOwner("user_1");

    await useNotifications.getState().refresh();

    expectFriendly(useNotifications.getState().error ?? "", raw);
    jest.restoreAllMocks();
  });

  it("shows the one message when a read hits its deadline", async () => {
    const timeout = new Error(CONNECTION_ERROR_MESSAGE);
    timeout.name = "TimeoutError";
    jest.spyOn(api, "listNotifications").mockRejectedValue(timeout);
    useNotifications.getState().setOwner("user_2");

    await useNotifications.getState().refresh();

    expect(useNotifications.getState().error).toBe(CONNECTION_ERROR_MESSAGE);
    jest.restoreAllMocks();
  });

  it("never shows a sentence from the server", async () => {
    const written = "Replica db-3 is read only";
    jest.spyOn(api, "listNotifications").mockRejectedValue(new api.ApiError(500, { error: written }));
    useNotifications.getState().setOwner("user_3");

    await useNotifications.getState().refresh();

    expect(useNotifications.getState().error).toBe("Could not load notifications");
    jest.restoreAllMocks();
  });
});
