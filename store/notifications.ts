import { create } from "zustand";

import type { Notification } from "@/lib/api";
import * as api from "@/lib/api";

type NotificationsState = {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function countUnread(items: Notification[]): number {
  return items.filter((n) => !n.read).length;
}

/**
 * In-app notification list + tab badge count.
 * There is no mark-as-read endpoint in the demo API; unread is server truth.
 */
export const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const items = await api.listNotifications();
      set({ items, unreadCount: countUnread(items), loading: false });
    } catch (e) {
      set({
        loading: false,
        error:
          e instanceof Error && !/^[a-z0-9_]+$/i.test(e.message)
            ? e.message
            : "Could not load notifications",
      });
    }
  },
}));
