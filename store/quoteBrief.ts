import { create } from "zustand";

import { EMPTY_QUOTE_BRIEF, type QuoteBriefDraft, type QuoteBriefErrors } from "@/lib/quoteRequests";

/**
 * The quote brief being written (`app/quotes/new.tsx`).
 *
 * A store rather than screen state: the brief has to outlive a trip to the
 * delivery step and back, and an error the client must see is a store write
 * so it re-renders reliably (see AGENTS.md "Running and testing"). Not
 * persisted — a half-written brief belongs to this visit.
 */
type QuoteBriefState = {
  draft: QuoteBriefDraft;
  errors: QuoteBriefErrors;
  busy: boolean;
  /** Why the last send failed, in plain words. */
  error: string | null;
  start: (productType: string) => void;
  set: <K extends keyof QuoteBriefDraft>(field: K, value: QuoteBriefDraft[K]) => void;
  setErrors: (errors: QuoteBriefErrors) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
};

export const useQuoteBrief = create<QuoteBriefState>((set) => ({
  draft: EMPTY_QUOTE_BRIEF,
  errors: {},
  busy: false,
  error: null,
  start: (productType) => set({ draft: { ...EMPTY_QUOTE_BRIEF, productType }, errors: {}, busy: false, error: null }),
  set: (field, value) =>
    set((state) => {
      const errors = { ...state.errors };
      delete errors[field];
      return { draft: { ...state.draft, [field]: value }, errors };
    }),
  setErrors: (errors) => set({ errors }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
