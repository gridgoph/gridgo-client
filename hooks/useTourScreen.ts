import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";

import type { TourScreen } from "@/lib/tour";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * Tells the tour which screen is up. Every screen with a tour step calls this
 * once; the overlay at the root draws that screen's step, if the tour has one
 * for it right now.
 *
 * Focus rather than mount: Home stays mounted under every pushed screen, and a
 * card drawn for a screen nobody is looking at would sit over the wrong one.
 * `enabled` holds the step back while the screen is still loading, so the card
 * never explains a control that has not been drawn yet.
 */
export function useTourScreen(screen: TourScreen, enabled = true) {
  const accountId = useSession((s) => s.user?.id ?? null);
  const hydrated = useTour((s) => s.hydrated);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated || !enabled) return;
      const token = useTour.getState().arrive(accountId, screen);
      return () => useTour.getState().leave(token);
    }, [accountId, enabled, hydrated, screen]),
  );
}

/** Home's once-only start, for a client with nothing on press. */
export function useTourAutoStart(firstTime: boolean) {
  const accountId = useSession((s) => s.user?.id ?? null);
  const hydrated = useTour((s) => s.hydrated);

  useEffect(() => {
    if (accountId && hydrated && firstTime) useTour.getState().autoStart(accountId, true);
  }, [accountId, hydrated, firstTime]);
}
