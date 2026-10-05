import { create } from "zustand";

import * as api from "@/lib/api";

/**
 * GRIDGO's price for the listing sheet as it is filled in
 * (`POST /me/catalog-quotes`, gridgo-api#132).
 *
 * The sheet used to work the line out itself from the shop's own figures and
 * mark it up. The API now prices the configured line — tiers, multipliers,
 * minimum sizes and the fee, in its own order — and the sheet draws that.
 *
 * One quote is held: the one for what is on screen. A change waits a beat
 * (`QUOTE_DEBOUNCE_MS`) so a run of stepper taps asks once, and an answer for
 * a configuration the client has already moved past is dropped rather than
 * drawn. A store rather than `useState` because every answer lands after an
 * `await`, which is the write @testing-library/react-native 14 drops (see
 * `store/loginFlow.ts`). Nothing is persisted: a price is about this moment.
 */

export const QUOTE_DEBOUNCE_MS = 300;

export type ListingQuoteStatus =
  /** Nothing asked yet, or nothing to ask (no listing on screen). */
  | "idle"
  /** Waiting out the debounce or the answer. Drawn as a skeleton. */
  | "pending"
  | "priced"
  /** GRIDGO could not price this configuration. Drawn as "—", never zero. */
  | "none"
  /** An API without the route: the sheet falls back to its own estimate. */
  | "unsupported";

type ListingQuoteState = {
  /** What the held answer is for — the configuration, as a string. */
  key: string | null;
  status: ListingQuoteStatus;
  quote: api.CatalogQuote | null;
  /** Ask for this configuration, or settle on no price with `null`. */
  request: (key: string, input: api.CatalogQuoteInput | null) => void;
  reset: () => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;

function cancel() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** A 404 that is not the listing's own refusal: this API has no quote route. */
function routeMissing(error: unknown): boolean {
  if (!(error instanceof api.ApiError)) return false;
  if (error.status === 405 || error.status === 501) return true;
  const code = (error.body as { error?: unknown } | null | undefined)?.error;
  return error.status === 404 && code !== "catalog_item_not_found";
}

export const useListingQuote = create<ListingQuoteState>((set, get) => ({
  key: null,
  status: "idle",
  quote: null,
  request: (key, input) => {
    const held = get();
    // The same question already asked (or answered): nothing to do. An API
    // without the route stays without it for the rest of the sheet.
    if (held.key === key && held.status !== "idle") return;
    cancel();
    if (!input) {
      set({ key, status: "none", quote: null });
      return;
    }
    if (held.status === "unsupported") {
      set({ key, status: "unsupported", quote: null });
      return;
    }
    set({ key, status: "pending", quote: null });
    timer = setTimeout(() => {
      timer = null;
      api
        .catalogQuote(input)
        .then((quote) => {
          if (get().key === key) set({ status: "priced", quote });
        })
        .catch((error: unknown) => {
          if (get().key !== key) return;
          set({ status: routeMissing(error) ? "unsupported" : "none", quote: null });
        });
    }, QUOTE_DEBOUNCE_MS);
  },
  reset: () => {
    cancel();
    set({ key: null, status: "idle", quote: null });
  },
}));
