import { useEffect } from "react";

import { accountHold } from "@/lib/accountHold";
import { clearBoardCache } from "@/lib/shopBoards";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";

/**
 * Reads this account's matching preference as soon as there is an account.
 *
 * Mounted once, above every route, because the landing ladder waits on it: a
 * client who has never ranked is asked to before Home, and one who ranked on
 * another phone must not be asked again. Doing it here rather than in the
 * ranking screen means the answer is already in hand by the time any screen
 * needs it.
 *
 * Signing out forgets it, along with the cached shop boards: both belong to
 * the person who just left. The basket is not reset here. `user` is also empty
 * for the whole of a launch while the session restores, and resetting on that
 * threw away a saved basket every time the app was reopened (#150); the
 * session store lets go of it on a real sign-out or a change of account.
 */
export function useClientPreferences(): void {
  const userId = useSession((state) => state.user?.id ?? null);
  const held = useSession((state) => accountHold(state.user) != null);

  useEffect(() => {
    if (!userId) {
      usePriorities.getState().reset();
      clearBoardCache();
      return;
    }
    if (held) return;
    void usePriorities.getState().load();
  }, [userId, held]);
}
