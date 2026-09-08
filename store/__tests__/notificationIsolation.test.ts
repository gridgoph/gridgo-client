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
