import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Notification } from "@/lib/api";
import * as api from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";

type NotificationsState = {
  items: Notification[];
  /**
   * Optimistic overlay until `PATCH /notifications/:id` (or read-all) lands.
   * Server `read` is the source of truth after refresh; this set only covers
   * swipes this phone has not yet seen come back on the list.
   */
  readIds: string[];
  /** Echoed to `PATCH /notifications/read-all`. Null until the first list. */
  snapshot: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
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

/** Drop overlay ids the server now agrees are read, or that left the window. */
function pruneReadIds(items: Notification[], readIds: readonly string[]): string[] {
  return readIds.filter((id) => items.some((item) => item.id === id && !item.read));
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
      refresh: async () => {
        const hadItems = get().items.length > 0;
        set(hadItems ? { error: null } : { loading: true, error: null });
        try {
          const result = await api.listNotifications();
          set({
            items: result.notifications,
            snapshot: result.snapshot,
            loading: false,
            error: null,
            readIds: pruneReadIds(result.notifications, get().readIds),
          });
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
      markRead: async (id) => {
        const { items, readIds } = get();
        const item = items.find((notification) => notification.id === id);
        if (item && isNotificationRead(item, readIds)) return;
        if (!readIds.includes(id)) set({ readIds: [...readIds, id] });
        try {
          await api.markNotificationRead(id, true);
        } catch {
          set({ readIds: get().readIds.filter((existing) => existing !== id) });
        }
      },
      markAllRead: async () => {
        const { items, readIds, snapshot } = get();
        const unread = items.filter((item) => !isNotificationRead(item, readIds));
        if (!unread.length) return;
        const overlay = unread.map((item) => item.id);
        set({ readIds: [...readIds, ...overlay] });
        if (!snapshot) return;
        try {
          await api.markAllNotificationsRead(snapshot);
        } catch {
          const drop = new Set(overlay);
          set({ readIds: get().readIds.filter((id) => !drop.has(id)) });
        }
      },
    }),
    {
      name: "gridgo-notifications",
      storage: createPersistStorage<NotificationsState>(),
      partialize: (state) =>
        ({
          items: state.items,
          readIds: state.readIds,
          snapshot: state.snapshot,
        }) as NotificationsState,
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
