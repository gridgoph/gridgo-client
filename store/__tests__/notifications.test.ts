import AsyncStorage from "@react-native-async-storage/async-storage";
import { waitFor } from "@testing-library/react-native";

import type { Notification } from "@/lib/api";
import { useNotifications } from "@/store/notifications";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api") as {
  listNotifications: jest.Mock;
  markNotificationRead: jest.Mock;
  markAllNotificationsRead: jest.Mock;
};

const assignment: Notification = {
  id: "ntf_1",
  userId: "user_client",
  type: "supplier_assignment_final_price",
  orderId: "ord_demo_1",
  orderTitle: "Grand opening tarpaulin",
  orderState: "production",
  title: "Supplier assigned and final price ready",
  body: "A supplier accepted your order.",
  read: false,
  at: "2026-08-09T09:12:00+08:00",
};

describe("notifications store", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useNotifications.getState().setOwner(null);
    useNotifications.getState().setOwner("user_client");
    api.listNotifications.mockReset();
    api.markNotificationRead.mockReset();
    api.markAllNotificationsRead.mockReset();
    api.listNotifications.mockResolvedValue({
      notifications: [assignment],
      snapshot: assignment.id,
    });
    api.markNotificationRead.mockResolvedValue({ ...assignment, read: true });
    api.markAllNotificationsRead.mockResolvedValue(1);
    useNotifications.setState({
      items: [],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
    });
  });

  it("does not optimistically mark rows when there is no server snapshot", async () => {
    useNotifications.setState({ items: [assignment], snapshot: null, readIds: [] });
    await useNotifications.getState().markAllRead();
    expect(useNotifications.getState().readIds).toEqual([]);
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("does not flip loading when a list is already on screen", async () => {
    useNotifications.setState({
      items: [assignment],
      loading: false,
      error: null,
    });
    let finish: (value: {
      notifications: Notification[];
      snapshot: string | null;
    }) => void = () => undefined;
    api.listNotifications.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const pending = useNotifications.getState().refresh();

    expect(useNotifications.getState().loading).toBe(false);
    expect(useNotifications.getState().items).toEqual([assignment]);

    finish({ notifications: [assignment], snapshot: assignment.id });
    await pending;
    expect(useNotifications.getState().loading).toBe(false);
  });

  it("keeps existing rows when a hung refresh later errors", async () => {
    useNotifications.setState({
      items: [assignment],
      loading: false,
      error: null,
    });
    api.listNotifications.mockRejectedValue(
      new Error("The operation was aborted."),
    );

    await useNotifications.getState().refresh();

    expect(useNotifications.getState().loading).toBe(false);
    expect(useNotifications.getState().items).toEqual([assignment]);
    expect(useNotifications.getState().error).toBeTruthy();
  });

  it("persists the list so the next visit can paint without the network", async () => {
    await useNotifications.getState().refresh();

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(
        "gridgo-notifications:user_client",
      );
      expect(raw ? JSON.parse(raw).items?.[0]?.id : null).toBe("ntf_1");
    });
  });

  it("marks a row read through PATCH and only keeps the id as an optimistic overlay", async () => {
    await useNotifications.getState().refresh();
    await useNotifications.getState().markRead("ntf_1");

    expect(api.markNotificationRead).toHaveBeenCalledWith("ntf_1", true);
    expect(useNotifications.getState().readIds).toContain("ntf_1");
  });

  it("marks the list read through PATCH /notifications/read-all with the snapshot", async () => {
    await useNotifications.getState().refresh();
    await useNotifications.getState().markAllRead();

    expect(api.markAllNotificationsRead).toHaveBeenCalledWith("ntf_1");
  });
});
