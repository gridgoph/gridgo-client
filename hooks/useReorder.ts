import { useCallback } from "react";

import { useStartRequest } from "@/hooks/useStartRequest";
import * as api from "@/lib/api";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * Reorder a past job: a request filled in from it, exactly as the Orders tab
 * does, without silently replacing a request already in progress
 * (`useStartRequest` asks first). The catalogue is read on the tap, so a
 * screen that only offers the one reorder does not pay for it on every load.
 */
export function useReorder() {
  const seedFromOrder = useRequestDraft((s) => s.seedFromOrder);
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const reorder = useCallback(
    async (order: api.Order) => {
      const catalog = await api.listCatalog().catch(() => [] as api.CatalogProduct[]);
      const meta = catalog.find((product) => product.id === order.productId);
      start(order.title, () =>
        seedFromOrder(order, {
          name: meta?.name,
          basePriceMinor: meta?.basePriceMinor,
          unit: meta?.unit,
          family: meta?.family,
        }),
      );
    },
    [seedFromOrder, start],
  );

  return { reorder, pendingLabel, confirmReplace, cancelReplace };
}
