import { useCallback } from "react";
import { useRouter } from "expo-router";

import { clearMatchSelections } from "@/lib/matchSelection";
import { useJobDeadline } from "@/store/jobDeadline";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { jobRankingNow, useOrderRanking } from "@/store/orderRanking";

/**
 * Leaving the "what am I printing?" screens for the match.
 *
 * Every job goes the same way: the date (`app/request/when.tsx`), then
 * delivery or pick-up with the address (`app/request/fulfilment.tsx`), then
 * confirming or re-ranking what it matches on (`app/request/rank.tsx`), then
 * the match. A basket started before the fulfilment step keeps its old way:
 * no fulfilment question, the drop-off asked first only when distance leads,
 * and the address at checkout (`lib/requestFulfilment.ts`).
 *
 * Both category screens route through this, so a job cannot start with the
 * last job's date, ranking or picks on one of them and not the other.
 */
export function useStartPrintJob() {
  const router = useRouter();

  return useCallback(
    (categoryCode: string, subcategoryCode: string) => {
      // The deadline comes before the match, because it decides which shops are
      // offered at all rather than how they are ranked. Nothing is prefetched
      // here: a match run without the date would be a different match. A new
      // job is asked its own ranking again, and no pick from an earlier match
      // may ride along onto it.
      useJobDeadline.getState().clear();
      useJobFulfilment.getState().clear();
      useOrderRanking.getState().clear();
      clearMatchSelections();
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
 * Read from the order this job matches on — its own re-rank, else the usual
 * order. Exported so the screens either side of the ranking step apply the
 * same rule the API does when it refuses a match for want of a pin. A job that
 * chose delivery or pick-up already has its point, so it is never asked.
 */
export function needsDropoffFirst(dropoff: unknown): boolean {
  if (useJobFulfilment.getState().choice) return false;
  return jobRankingNow()?.[0] === "distance" && !dropoff;
}
