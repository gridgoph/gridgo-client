import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Notification } from "@/lib/api";
import * as api from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";

type NotificationsState = {
  items: Notification[];
  /**
   * Updates this phone has been shown and dismissed.
   *
   * The demo API has no mark-as-read route, so `read` on the record is only
   * ever what the server decided. Without this, swiping a row read would
   * un-read itself on the next refresh, which is worse than not offering the
   * gesture at all. Persisted, so it survives the app being killed. It is a
   * per-device record until the API grows `POST /notifications/:id/read`.
   */
  readIds: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

/** Server truth, plus whatever this phone has already dismissed. */
export function isNotificationRead(
  notification: Notification,
  readIds: readonly string[],
): boolean {
  return notification.read || readIds.includes(notification.id);
}

function countUnread(items: Notification[], readIds: readonly string[]): number {
  return items.filter((item) => !isNotificationRead(item, readIds)).length;
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      readIds: [],
      loading: false,
      error: null,
      refresh: async () => {
        set({ loading: true, error: null });
        try {
          const items = await api.listNotifications();
          set({ items, loading: false });
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
      markRead: (id) => {
        if (get().readIds.includes(id)) return;
        set({ readIds: [...get().readIds, id] });
      },
      markAllRead: () => {
        const { items, readIds } = get();
        const unread = items.filter((item) => !isNotificationRead(item, readIds));
        if (!unread.length) return;
        set({ readIds: [...readIds, ...unread.map((item) => item.id)] });
      },
    }),
    {
      name: "gridgo-notifications",
      storage: createPersistStorage<NotificationsState>(),
      // The list itself is server data and is fetched on every focus. Only the
      // dismissals are this phone's to remember.
      partialize: (state) => ({ readIds: state.readIds }) as NotificationsState,
    },
  ),
);

/**
 * The tab badge. A selector rather than stored state, so the count cannot
 * drift from the list and the dismissals it is derived from.
 */
export function useUnreadCount(): number {
  return useNotifications((state) => countUnread(state.items, state.readIds));
}
