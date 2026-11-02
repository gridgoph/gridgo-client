import { useEffect } from "react";

import { accountHold } from "@/lib/accountHold";
import { getAccountThemePreference } from "@/lib/api";
import { subscribeLive } from "@/lib/live";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";

/**
 * Reads the theme saved on the account once a client is signed in, and again
 * when another phone changes it (an `identity` invalidation). Mounted once at
 * the root, after the phone's own copy has been read back, so a tap made
 * before this launch is never overwritten by the account's older value.
 */
export function useAccountTheme(): void {
  const userId = useSession((s) => s.user?.id ?? null);
  const held = useSession((s) => accountHold(s.user) != null);
  const hydrated = useThemeStore((s) => s.hydrated);

  useEffect(() => {
    if (!userId || held || !hydrated) return;
    let cancelled = false;
    const read = () => {
      void getAccountThemePreference()
        .then((account) => {
          if (!cancelled) return useThemeStore.getState().adoptAccount(userId, account);
        })
        .catch(() => {
          // The phone's copy stays on screen.
        });
    };
    read();
    const unsubscribe = subscribeLive((resource) => {
      if (resource === "identity" || resource === "*") read();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId, held, hydrated]);
}
