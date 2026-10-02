import { create } from "zustand";

import type { MatchInput } from "@/lib/api";
import type { PriorityRanking } from "@/lib/priorities";
import { usePriorities } from "@/store/priorities";

/**
 * What GRIDGO matches this one job on (gridgoph/gridgo-client#157).
 *
 * The account holds the client's usual order (`store/priorities.ts`, set at
 * onboarding). Each job asks them to confirm it or re-rank for this job only,
 * and the question can be skipped. `ranking` is the answer: null means the
 * usual order — a skip, or a confirm that changed nothing — and the match then
 * sends no ranking at all, so GRIDGO reads the saved one. A re-rank is sent
 * with this job's match and never saves the preference by itself.
 *
 * Not persisted, like the deadline beside it (`store/jobDeadline.ts`): it is
 * about this errand, and a client returning tomorrow should be asked again.
 */
type OrderRankingState = {
  ranking: PriorityRanking | null;
  set: (ranking: PriorityRanking | null) => void;
  clear: () => void;
};

export const useOrderRanking = create<OrderRankingState>((set) => ({
  ranking: null,
  set: (ranking) => set({ ranking }),
  clear: () => set({ ranking: null }),
}));

/** The order this job matches on: its own re-rank, else the usual order. */
export function useJobRanking(): PriorityRanking | null {
  const job = useOrderRanking((state) => state.ranking);
  const usual = usePriorities((state) => state.ranking);
  return job ?? usual;
}

/** The same, read once — for a handler rather than a render. */
export function jobRankingNow(): PriorityRanking | null {
  return useOrderRanking.getState().ranking ?? usePriorities.getState().ranking;
}

/**
 * A match request for this job: it carries the job's re-rank when there is
 * one, and no ranking at all otherwise, so GRIDGO matches on the saved order.
 */
export function withJobRanking(input: MatchInput): MatchInput {
  const ranking = useOrderRanking.getState().ranking;
  return ranking ? { ...input, ranking: [...ranking] } : input;
}
