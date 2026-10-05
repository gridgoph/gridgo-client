import { create } from "zustand";

import type { MatchInput, OrderPoint, RequestFulfilment } from "@/lib/api";

/**
 * How this job reaches the client, chosen before the match
 * (gridgoph/gridgo-client#158, `lib/requestFulfilment.ts`).
 *
 * `choice` null means the match is asked the old way, with no fulfilment at
 * all: a basket started before this step keeps choosing at checkout. Not
 * persisted, like the date and ranking beside it — it belongs to this errand,
 * and the basket on GRIDGO is what keeps it once a listing goes in.
 */
type JobFulfilmentState = {
  choice: RequestFulfilment | null;
  set: (choice: RequestFulfilment | null) => void;
  clear: () => void;
};

export const useJobFulfilment = create<JobFulfilmentState>((set) => ({
  choice: null,
  set: (choice) => set({ choice }),
  clear: () => set({ choice: null }),
}));

/**
 * A match request for this job, carrying its fulfilment. A delivery sends the
 * address as the drop-off; a pick-up sends none, and GRIDGO measures from its
 * hub. With no choice the legacy drop-off (the basket's own, if any) stands.
 */
export function withJobFulfilment(input: MatchInput, legacyDropoff: OrderPoint | null): MatchInput {
  const choice = useJobFulfilment.getState().choice;
  if (!choice) return { ...input, dropoff: legacyDropoff };
  if (choice.fulfillmentMode === "pickup") return { ...input, fulfillmentMode: "pickup", dropoff: null };
  return { ...input, fulfillmentMode: "delivery", dropoff: choice.dropoff };
}
