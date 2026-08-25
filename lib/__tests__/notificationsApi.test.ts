import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_LIST_LIMIT,
  NOTIFICATIONS_TIMEOUT_MS,
} from "@/lib/api";

describe("notifications API client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("asks for a bounded recent window instead of the full history", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ notifications: [], snapshot: null }),
    })) as unknown as typeof fetch;

    await listNotifications();

    const url = String((global.fetch as jest.Mock).mock.calls[0]?.[0]);
    expect(url).toContain(`/notifications?limit=${NOTIFICATION_LIST_LIMIT}`);
  });

  it("aborts a hung list so the screen can show an error instead of an endless skeleton", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    const pending = listNotifications();
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await jest.advanceTimersByTimeAsync(NOTIFICATIONS_TIMEOUT_MS);
    await assertion;
  });

  it("PATCHes one notification read", async () => {
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toContain("/notifications/ntf_1");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ read: true });
      return {
        ok: true,
        text: async () => JSON.stringify({ notification: { id: "ntf_1", read: true } }),
      };
    }) as unknown as typeof fetch;

    await markNotificationRead("ntf_1", true);
  });

  it("PATCHes the list snapshot read-all", async () => {
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toContain("/notifications/read-all");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ snapshot: "ntf_1" });
      return {
        ok: true,
        text: async () => JSON.stringify({ updatedCount: 2 }),
      };
    }) as unknown as typeof fetch;

    await expect(markAllNotificationsRead("ntf_1")).resolves.toBe(2);
  });
});
