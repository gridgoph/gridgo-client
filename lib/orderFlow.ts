/**
 * Where this basket run started, so the step trail can go back to it.
 *
 * The match screen is reached with a category and a subcategory in its params,
 * and every screen after it — listing, artwork, checkout — has dropped them.
 * Threading two more params through four screens to answer one back button is
 * how params rot; holding the pair in memory the way `lib/listingCache.ts`
 * holds a listing costs nothing and cannot go stale in a way that matters.
 *
 * In memory on purpose. A client who kills the app and reopens checkout has no
 * run in progress to go back to, and the trail falls back to the category
 * screen — which is the honest answer, not a guessed shop.
 */

export type OrderFlow = {
  categoryCode: string;
  subcategoryCode: string;
};

let held: OrderFlow | null = null;

/** Called by the match screen: this is the run the client is on. */
export function rememberOrderFlow(flow: OrderFlow): void {
  if (!flow.categoryCode || !flow.subcategoryCode) return;
  held = flow;
}

export function orderFlowNow(): OrderFlow | null {
  return held;
}

/** Checkout spends the basket, so the run it belonged to is over. */
export function clearOrderFlow(): void {
  held = null;
}
