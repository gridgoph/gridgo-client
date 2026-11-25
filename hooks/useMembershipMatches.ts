import { useEffect } from "react";
import { AppState } from "react-native";

import { canJoinOrgs, useMemberships } from "@/store/memberships";
import { useSession } from "@/store/session";

/**
 * Asks GRIDGO once after sign-in, and on resume, whether an officer's list
 * names this person (gridgo-client#475). The store keeps the calls apart.
 */
export function useMembershipMatches(): void {
  const userId = useSession((state) => (canJoinOrgs(state.user) ? (state.user?.id ?? null) : null));
  useEffect(() => {
    if (!userId) return;
    void useMemberships.getState().match();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void useMemberships.getState().match();
    });
    return () => subscription.remove();
  }, [userId]);
}
