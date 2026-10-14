import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/lib/api";
import { useNotificationNudge } from "@/store/notificationNudge";
import { countUnreadGroups, useNotifications, useUnreadCount } from "@/store/notifications";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listNotifications: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api") as { listNotifications: jest.Mock };

function row(id: string, orderId: string, overrides: Partial<Notification> = {}): Notification {
  return {
    id,
    userId: "user_client",
    type: "order_state_changed",
    orderId,
    orderTitle: "Flyers",
    title: `Update ${id}`,
    body: "Your order moved.",
    read: false,
    at: "2026-10-15T09:00:00+08:00",
    ...overrides,
  };
}

function serve(...rows: Notification[]) {
  api.listNotifications.mockResolvedValueOnce({
    notifications: rows,
    snapshot: rows[0]?.id ?? null,
  });
}

/**
 * #230: the bell swings and chimes once per read that brought new unread
 * updates — never for what the first read after launch or a resume finds.
 */
describe("notification nudge", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useNotifications.getState().setOwner(null);
    useNotifications.getState().setOwner("user_client");
    api.listNotifications.mockReset();
    useNotificationNudge.setState({ seq: 0, announcement: "", muted: false, lastAt: 0 });
  });

  it("sets a baseline on the first read and rings nothing", async () => {
    serve(row("n1", "ord_1"), row("n2", "ord_2"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(0);
    expect(useNotifications.getState().seenIds).toEqual(["n1", "n2"]);
  });

  it("rings once for a read that brings several new updates", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n3", "ord_1"), row("n2", "ord_2"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(1);
    expect(useNotificationNudge.getState().announcement).toBe("2 new updates");
  });

  it("names a single update for a screen reader", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n2", "ord_1", { title: "Ready for pickup" }), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().announcement).toBe("New update: Ready for pickup");
  });

  it("does not ring again for the same update on a later read", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(1);
  });

  it("does not ring for a new row the server already has as read", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n2", "ord_1", { read: true }), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(0);
  });

  it("rings once for a burst of reads close together", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    serve(row("n3", "ord_1"), row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(1);
    // The next update after the quiet window rings again.
    useNotificationNudge.setState({ lastAt: Date.now() - 60_000 });
    serve(row("n4", "ord_2"), row("n3", "ord_1"), row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(2);
  });

  it("re-baselines after the app leaves the front, so a resume does not ring", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    useNotifications.getState().rebaseline();
    serve(row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(0);
    serve(row("n3", "ord_2"), row("n2", "ord_1"), row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    expect(useNotificationNudge.getState().seq).toBe(1);
  });

  it("forgets the baseline when the account changes", async () => {
    serve(row("n1", "ord_1"));
    await useNotifications.getState().refresh();
    useNotifications.getState().setOwner("user_other");
    expect(useNotifications.getState().seenIds).toBeNull();
  });

  it("counts the bell in cards: one job moving twice is one unread", async () => {
    const items = [row("n2", "ord_1"), row("n1", "ord_1"), row("n3", "ord_2")];
    expect(countUnreadGroups(items, [])).toBe(2);
    expect(countUnreadGroups(items, ["n2"])).toBe(1);
    expect(typeof useUnreadCount).toBe("function");
  });

  it("keeps the mute switch as a phone preference", () => {
    useNotificationNudge.getState().setMuted(true);
    expect(useNotificationNudge.getState().muted).toBe(true);
    useNotificationNudge.getState().nudge("New update: x");
    // A nudge still swings the bell; only the chime listens to `muted`.
    expect(useNotificationNudge.getState().seq).toBe(1);
  });
});
