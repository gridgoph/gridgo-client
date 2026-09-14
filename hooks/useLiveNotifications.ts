import { clearProductCategoryCache } from "@/lib/api";
import { clearBoardCache } from "@/lib/shopBoards";
import { clearListingCache } from "@/lib/listingCache";
import { useEffect } from "react";
import { AppState } from "react-native";
import { openAlertStream, type AlertStreamHandle } from "@/lib/alertStream";
import { invalidate } from "@/lib/live";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

/** One stream for the authenticated app, independently of push permission. */
export function useLiveNotifications(): void {
  const owner = useSession((s) => s.user?.id ?? null);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    let stream: AlertStreamHandle | null = null;
    let cursor: string | null = null;
    let inboxTimer: ReturnType<typeof setTimeout> | null = null;
    let connected = false;
    const current = () => active && useSession.getState().user?.id === owner;
    const inbox = () => {
      if (!current() || inboxTimer) return;
      inboxTimer = setTimeout(() => {
        inboxTimer = null;
        if (current()) void useNotifications.getState().refresh();
      }, 80);
    };
    const reconcile = () => {
      if (current()) {
        clearBoardCache();
        clearListingCache();
        clearProductCategoryCache();
        void useSession.getState().refresh();
        inbox();
        invalidate();
      }
    };
    const start = () => {
      if (!current() || stream) return;
      reconcile();
      stream = openAlertStream({
        getResumeFrom: () => cursor,
        onNotification: (notification) => {
          if (!current()) return;
          cursor = notification.id;
          inbox();
        },
        onInvalidate: (event) => {
          if (!current()) return;
          if (
            ["catalog", "services", "availability", "settings"].includes(
              event.resource,
            )
          ) {
            clearBoardCache();
            clearListingCache();
            clearProductCategoryCache();
          }
          if (event.resource === "notifications") inbox();
          if (event.resource === "identity" || event.resource === "approvals")
            void useSession.getState().refresh();
          invalidate(event.resource);
        },
        onStatus: (live) => {
          if (!current()) return;
          connected = live;
          if (live) reconcile();
        },
        onResumeUnavailable: () => {
          cursor = null;
          reconcile();
        },
      });
    };
    if (AppState.currentState === "active" || AppState.currentState == null)
      start();
    const lifecycle = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else {
        stream?.close();
        stream = null;
        connected = false;
      }
    });
    const fallback = setInterval(() => {
      if (!connected && AppState.currentState === "active") reconcile();
    }, 30_000);
    return () => {
      active = false;
      stream?.close();
      lifecycle.remove();
      clearInterval(fallback);
      if (inboxTimer) clearTimeout(inboxTimer);
    };
  }, [owner]);
}
