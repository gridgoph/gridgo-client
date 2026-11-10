import { create } from "zustand";

import { getHomePromotions, recordPromotionEvent } from "@/lib/api";
import {
  claimPromotionView,
  promotionSessionId,
  promotionsFrom,
  type HomePromotion,
  type PromotionEventType,
} from "@/lib/homePromos";
import { useSession } from "@/store/session";

type HomePromosStore = {
  /** The live promos, kept for the account that asked. */
  promos: HomePromotion[];
  owner: string | null;
  load: (userId: string | null) => Promise<void>;
  clear: () => void;
};

let sequence = 0;

/**
 * `GET /me/promotions/home`, re-read on every Home focus so an edit on the
 * Promotions page shows without a release. Never persisted. A failed read
 * keeps what is on screen; with nothing read the tile is plain Reorder.
 */
export const useHomePromos = create<HomePromosStore>()((set, get) => ({
  promos: [],
  owner: null,
  load: async (userId) => {
    if (!userId) {
      get().clear();
      return;
    }
    const mine = ++sequence;
    if (get().owner !== userId) set({ promos: [], owner: userId });
    try {
      const promos = promotionsFrom(await getHomePromotions());
      if (mine === sequence) set({ promos });
    } catch {
      // Reorder stands on its own; nothing to say.
    }
  },
  clear: () => {
    sequence++;
    set({ promos: [], owner: null });
  },
}));

/** The promos, only while they belong to the account signed in now. */
const NONE: HomePromotion[] = [];
export function useOwnHomePromos(): HomePromotion[] {
  const userId = useSession((s) => s.user?.id ?? null);
  return useHomePromos((s) => (userId && s.owner === userId ? s.promos : NONE));
}

/** Fire-and-forget: a lost count never touches the screen. */
export function trackHomePromo(promoId: string, type: PromotionEventType): void {
  if (type === "view" && !claimPromotionView(promoId)) return;
  recordPromotionEvent(promoId, type, promotionSessionId()).catch(() => undefined);
}
