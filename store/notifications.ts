import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { Notification } from "@/lib/api";
import * as api from "@/lib/api";
import { groupInbox, isGroupUnread } from "@/lib/notificationPresentation";

let generation = 0;
let readSequence = 0;
let appliedSequence = 0;
const cacheKey = (ownerId: string) =>
  `gridgo-notifications:${encodeURIComponent(ownerId)}`;
function saveCache(state: NotificationsState): void {
  if (!state.ownerId) return;
  const { ownerId, items, readIds, snapshot } = state;
  void AsyncStorage.setItem(
    cacheKey(ownerId),
    JSON.stringify({ ownerId, items, readIds, snapshot }),
  ).catch(() => undefined);
}

type NotificationsState = {
  ownerId: string | null;
  setOwner: (id: string | null) => void;
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
  /**
   * Mark every row of one job's card read. Each row is its own
   * `PATCH /notifications/:id`, so read state stays per row on the server;
   * a row whose patch fails comes back unread on its own.
   */
  markManyRead: (ids: readonly string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
};

/** Server truth, plus whatever this phone has already dismissed. */
export function isNotificationRead(
  notification: Notification,
  readIds: readonly string[],
): boolean {
  return notification.read || readIds.includes(notification.id);
}

/** Unread cards, not rows: one job moving five times is one thing to read. */
export function countUnreadGroups(
  items: Notification[],
  readIds: readonly string[],
): number {
  return groupInbox(items).filter((group) =>
    isGroupUnread(group, (item) => isNotificationRead(item, readIds)),
  ).length;
}

/** Drop overlay ids the server now agrees are read, or that left the window. */
function pruneReadIds(
  items: Notification[],
  readIds: readonly string[],
): string[] {
  return readIds.filter((id) =>
    items.some((item) => item.id === id && !item.read),
  );
}

export const useNotifications = create<NotificationsState>()((set, get) => ({
  ownerId: null,
  setOwner: (ownerId) => {
    if (get().ownerId === ownerId) return;
    generation++;
    readSequence++;
    set({
      ownerId,
      items: [],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
    });
    if (!ownerId) return;
    const currentGeneration = generation;
    const sequence = appliedSequence;
    void AsyncStorage.getItem(cacheKey(ownerId))
      .then((raw) => {
        if (
          !raw ||
          generation !== currentGeneration ||
          appliedSequence !== sequence
        )
          return;
        const cached = JSON.parse(raw) as Partial<NotificationsState>;
        if (cached.ownerId !== ownerId || !Array.isArray(cached.items)) return;
        set({
          items: cached.items.filter((item) => item.userId === ownerId),
          readIds: cached.readIds ?? [],
          snapshot: cached.snapshot ?? null,
        });
      })
      .catch(() => undefined);
  },
  items: [],
  readIds: [],
  snapshot: null,
  loading: false,
  error: null,
  refresh: async () => {
    const currentGeneration = generation;
    const sequence = ++readSequence;
    const hadItems = get().items.length > 0;
    set(hadItems ? { error: null } : { loading: true, error: null });
    try {
      const result = await api.listNotifications();
      if (generation !== currentGeneration || sequence !== readSequence) return;
      appliedSequence++;
      set({
        items: result.notifications,
        snapshot: result.snapshot,
        loading: false,
        error: null,
        readIds: pruneReadIds(result.notifications, get().readIds),
      });
      saveCache(get());
    } catch (e) {
      if (generation !== currentGeneration || sequence !== readSequence) return;
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
    const currentGeneration = generation;
    const { items, readIds } = get();
    const item = items.find((notification) => notification.id === id);
    if (item && isNotificationRead(item, readIds)) return;
    if (!readIds.includes(id)) set({ readIds: [...readIds, id] });
    try {
      await api.markNotificationRead(id, true);
      if (generation === currentGeneration) saveCache(get());
    } catch {
      if (generation !== currentGeneration) return;
      set({ readIds: get().readIds.filter((existing) => existing !== id) });
    }
  },
  markManyRead: async (ids) => {
    const currentGeneration = generation;
    const { items, readIds } = get();
    const unread = ids.filter((id) => {
      if (readIds.includes(id)) return false;
      const item = items.find((notification) => notification.id === id);
      return !item || !isNotificationRead(item, readIds);
    });
    if (!unread.length) return;
    set({ readIds: [...readIds, ...unread] });
    const results = await Promise.allSettled(
      unread.map((id) => api.markNotificationRead(id, true)),
    );
    if (generation !== currentGeneration) return;
    const failed = new Set(
      unread.filter((_id, index) => results[index].status === "rejected"),
    );
    if (failed.size) {
      set({ readIds: get().readIds.filter((id) => !failed.has(id)) });
    }
    saveCache(get());
  },
  markAllRead: async () => {
    const currentGeneration = generation;
    const { items, readIds, snapshot } = get();
    const unread = items.filter((item) => !isNotificationRead(item, readIds));
    if (!unread.length || !snapshot) return;
    const overlay = unread.map((item) => item.id);
    set({ readIds: [...readIds, ...overlay] });
    try {
      await api.markAllNotificationsRead(snapshot);
      if (generation === currentGeneration) saveCache(get());
    } catch {
      if (generation !== currentGeneration) return;
      const drop = new Set(overlay);
      set({ readIds: get().readIds.filter((id) => !drop.has(id)) });
    }
  },
}));

/**
 * The tab badge, counted in cards so it matches the screen. A selector rather than stored state, so the count cannot
 * drift from the list and the dismissals it is derived from.
 */
export function useUnreadCount(): number {
  return useNotifications((state) => countUnreadGroups(state.items, state.readIds));
}
