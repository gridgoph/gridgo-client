import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ExpressShop } from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo.client.expressShops.v1";
const KEEP = 40;

export type KnownShop = Pick<ExpressShop, "name" | "address" | "location">;

type ExpressShopsStore = {
  shops: Record<string, KnownShop>;
  /** Express shops the client has seen, newest kept. */
  remember: (rows: ExpressShop[]) => void;
};

/**
 * Names of Express shops, by supplier id. An Express order names its shop
 * ("Sending to …") but the order projection carries only the shop's pin, so
 * the name comes from the shop list the client chose from — including the
 * shop an order moved to, when it was on that list.
 */
export const useExpressShops = create<ExpressShopsStore>()(
  persist(
    (set, get) => ({
      shops: {},
      remember: (rows) => {
        if (!rows.length) return;
        const next: Record<string, KnownShop> = { ...get().shops };
        for (const row of rows) {
          delete next[row.supplierId];
          next[row.supplierId] = { name: row.name, address: row.address, location: row.location };
        }
        const ids = Object.keys(next);
        for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) delete next[id];
        set({ shops: next });
      },
    }),
    { name: STORAGE_KEY, storage: createPersistStorage(), partialize: (state) => ({ shops: state.shops }) },
  ),
);
