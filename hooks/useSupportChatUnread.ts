import { useEffect } from "react";

import { getSupportChatMe } from "@/lib/api";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

/** Keeps the header badge honest while the client is signed in. */
export function useSupportChatUnread(): void {
  const owner = useSession((s) => s.user?.id ?? null);
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);

  useEffect(() => {
    if (!owner) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const pull = () => {
      void getSupportChatMe()
        .then((me) => {
          if (!cancelled) setUnreadCount(me.thread?.unreadCount ?? 0);
        })
        .catch(() => {});
    };
    pull();
    const stream = openSupportChatStream({
      onEvent: (event) => {
        if (!cancelled) setUnreadCount(event.thread.unreadCount ?? 0);
      },
    });
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [owner, setUnreadCount]);
}
