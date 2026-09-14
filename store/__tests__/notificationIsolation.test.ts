import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNotifications } from "../notifications";
import * as api from "@/lib/api";
jest.mock("@/lib/api", () => ({
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));
it("clears the old account and ignores its late request", async () => {
  let resolve!: (data: unknown) => void;
  (api.listNotifications as jest.Mock).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  useNotifications.getState().setOwner("a");
  const pending = useNotifications.getState().refresh();
  useNotifications.getState().setOwner("b");
  resolve({
    notifications: [{ id: "a-secret", userId: "a", title: "Private order" }],
    snapshot: "a-secret",
  });
  await pending;
  expect(useNotifications.getState().items).toEqual([]);
  expect(useNotifications.getState().snapshot).toBeNull();
});

it.each([false, true])("hydrates during refresh unless server data landed: %s", async (succeeded) => {
  useNotifications.getState().setOwner(null);
  let hydrate!: (raw: string) => void;
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise((resolve) => { hydrate = resolve; }));
  let finish!: (value: Awaited<ReturnType<typeof api.listNotifications>>) => void;
  let fail!: (error: Error) => void;
  jest.mocked(api.listNotifications).mockReturnValueOnce(new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  }));
  useNotifications.getState().setOwner("cached-owner");
  const refreshing = useNotifications.getState().refresh();
  const cached = { id: "cached", userId: "cached-owner", read: false };
  const fresh = { id: "fresh", userId: "cached-owner", read: false };
  if (succeeded) {
    finish({ notifications: [fresh as api.Notification], snapshot: "fresh" });
    await refreshing;
  }
  hydrate(JSON.stringify({ ownerId: "cached-owner", items: [cached], snapshot: "cached" }));
  await Promise.resolve();
  if (!succeeded) {
    fail(new Error("Offline"));
    await refreshing;
  }
  expect(useNotifications.getState().items).toEqual([succeeded ? fresh : cached]);
});
