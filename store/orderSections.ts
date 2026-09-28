import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import type { OrderSectionKey } from "@/lib/orderSections";

const STORAGE_KEY = "gridgo.client.orderSections.v1";

/**
 * Everything folded: the screen opens on what is happening and what is asked,
 * and each folded heading still says the one fact it holds.
 */
export const ORDER_SECTIONS_FOLDED: Record<OrderSectionKey, boolean> = {
  history: false,
  specifications: false,
  artwork: false,
  payment: false,
};

type OrderSectionsStore = {
  open: Record<OrderSectionKey, boolean>;
  toggle: (key: OrderSectionKey) => void;
};

/**
 * Which parts of the order screen a client keeps open (gridgo-client#129).
 *
 * Remembered per section, not per order: somebody who always checks the
 * payment breakdown wants it open on the next job too.
 */
export const useOrderSections = create<OrderSectionsStore>()(
  persist(
    (set) => ({
      open: ORDER_SECTIONS_FOLDED,
      toggle: (key) => set((state) => ({ open: { ...state.open, [key]: !state.open[key] } })),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ open: state.open }),
      // A section added later starts folded rather than undefined.
      merge: (persisted, current) => ({
        ...current,
        open: { ...current.open, ...((persisted as { open?: object } | undefined)?.open ?? {}) },
      }),
    },
  ),
);
