import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * A group invite link that opened the app before anyone was signed in
 * (gridgo-client#450). The signed-out stack has no join screen, so the token
 * waits here until the signed-in shell can open it. The join screen clears it.
 */
type PendingInviteState = {
  token: string | null;
  hold: (token: string) => void;
  clear: () => void;
};

export const usePendingGroupInvite = create<PendingInviteState>()(
  persist(
    (set) => ({
      token: null,
      hold: (token) => set({ token }),
      clear: () => set({ token: null }),
    }),
    { name: "gridgo.client.pendingGroupInvite.v1", storage: createPersistStorage() },
  ),
);

/** The invite token in an app path (`/express/group/join/<token>`), if it is one. */
export function inviteTokenInPath(path: string): string | null {
  const match = /(?:^|\/)express\/group\/join\/([-\w]{20,128})(?:[/?#]|$)/.exec(path);
  return match ? match[1] : null;
}
