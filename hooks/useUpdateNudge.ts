import { useEffect } from "react";
import { AccessibilityInfo, AppState } from "react-native";

import { accountHold } from "@/lib/accountHold";
import { shouldChime } from "@/lib/notificationNudge";
import { loadUpdateChime } from "@/lib/updateChime";
import { useNotificationNudge } from "@/store/notificationNudge";
import { useSession } from "@/store/session";

/**
 * The sound half of the bell (#230), mounted once at the root.
 *
 * Every bell on screen swings on its own when `seq` moves; this plays the
 * chime once for the whole app — two bells mounted (a tab bar under a pushed
 * screen) must not ring twice — and says the update aloud to a screen reader,
 * so the swing and the chime never carry the news alone.
 *
 * The player lives as long as the signed-in session that can receive updates.
 */
export function useUpdateNudge(): void {
  const owner = useSession((s) => s.user?.id ?? null);
  const held = useSession((s) => accountHold(s.user) != null);

  useEffect(() => {
    if (!owner || held) return;
    const chime = loadUpdateChime();
    const unsubscribe = useNotificationNudge.subscribe((state, previous) => {
      if (state.seq === previous.seq) return;
      if (shouldChime({ muted: state.muted, appState: AppState.currentState })) chime?.play();
      if (state.announcement) AccessibilityInfo.announceForAccessibility(state.announcement);
    });
    return () => {
      unsubscribe();
      chime?.release();
    };
  }, [owner, held]);
}
