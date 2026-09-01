import { useCallback } from "react";
import { useRouter } from "expo-router";

import { prefetchMatch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { usePriorities } from "@/store/priorities";

/**
 * Leaving the "what am I printing?" screens for the match.
 *
 * One decision lives here: whether GRIDGO has to ask where the job is going
 * before it can match. It does when the client put distance first and the
 * basket has no address yet — the matcher refuses without a drop-off in that
 * case, because "nearest" has no meaning until it knows what it is near.
 * Everyone else goes straight to the shop and gives the address at checkout,
 * where it is needed for the delivery charge instead.
 *
 * Both category screens route through this, so the rule cannot be right on one
 * of them and missing on the other.
 */
export function useStartPrintJob() {
  const router = useRouter();

  return useCallback(
    (categoryCode: string, subcategoryCode: string) => {
      const { cart, cartId } = useCart.getState();
      const dropoff = cart?.defaultDropoff ?? null;
      const needsDropoff = needsDropoffFirst(dropoff);

      // The deadline comes before the match, because it decides which shops are
      // offered at all rather than how they are ranked. Nothing is prefetched
      // here: a match run without the date would be a different match.
      useJobDeadline.getState().clear();
      router.push({
        pathname: "/request/when",
        params: { subcategory: subcategoryCode, category: categoryCode },
      });
    },
    [router],
  );
}

/**
 * Whether the drop-off has to come first.
 *
 * Read from the ranking held for this account. Exported so the match screen can
 * apply the same rule when the API refuses a match for want of a pin.
 */
export function needsDropoffFirst(dropoff: unknown): boolean {
  return usePriorities.getState().ranking?.[0] === "distance" && !dropoff;
}
