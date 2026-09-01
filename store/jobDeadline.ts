import { create } from "zustand";

/**
 * When the client needs this job by.
 *
 * Asked once, before any shop is chosen, because it is the only thing that can
 * be asked that early: a date means the same thing at every shop, whatever unit
 * that shop sells in. Quantity cannot come first for the same reason in
 * reverse — "how many" has no meaning until a listing says what one is.
 *
 * It lives here rather than on the cart because the cart does not exist yet
 * when it is asked, and rather than in the route because the drop-off screen
 * can come between the question and the match.
 *
 * Not persisted. A deadline is about this errand, and a client returning
 * tomorrow to a stale "by 5pm yesterday" would be worse than being asked again.
 */
type JobDeadlineState = {
  /** ISO instant, or null for "no rush" — which filters nobody out. */
  by: string | null;
  /** False until the client has actually answered, so a skip is not a null. */
  answered: boolean;
  set: (by: string | null) => void;
  clear: () => void;
};

export const useJobDeadline = create<JobDeadlineState>((set) => ({
  by: null,
  answered: false,
  set: (by) => set({ by, answered: true }),
  clear: () => set({ by: null, answered: false }),
}));
