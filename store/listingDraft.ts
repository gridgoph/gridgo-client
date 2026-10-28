import { create } from "zustand";

import type { PrintLayoutCode } from "@/lib/api";
import type { ListingSelection } from "@/lib/listing";
import type { MeasurementDraft } from "@/lib/measurement";

/** What a client has answered on a listing sheet and not yet added. */
export type ListingDraft = {
  selection: ListingSelection;
  quantity: number;
  measured: MeasurementDraft;
  note: string;
  layout: PrintLayoutCode | null;
};

/**
 * The listing sheet's unfinished answers, held outside the screen.
 *
 * A screen that throws while drawing is unmounted by its error boundary and
 * drawn afresh on "Try again", which wipes its own state. Kept here, the
 * options ticked, the size typed, the quantity, the note and the layout come
 * back with it — and when the client opens the same sheet again later.
 *
 * Keyed to the basket row being changed, or else to the listing. Gone once
 * the line is added or saved, and on a change of account. Not persisted:
 * a draft is about this sitting, and the basket is what lasts.
 */
type ListingDraftState = {
  drafts: Record<string, ListingDraft>;
  keep: (key: string, draft: ListingDraft) => void;
  drop: (key: string) => void;
  clear: () => void;
};

export function listingDraftKey(itemId?: string | null, lineId?: string | null): string | null {
  if (lineId) return `line:${lineId}`;
  if (itemId) return `item:${itemId}`;
  return null;
}

export const useListingDraft = create<ListingDraftState>((set) => ({
  drafts: {},
  keep: (key, draft) => set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
  drop: (key) =>
    set((state) => {
      if (!(key in state.drafts)) return state;
      const drafts = { ...state.drafts };
      delete drafts[key];
      return { drafts };
    }),
  clear: () => set({ drafts: {} }),
}));

export function listingDraftNow(key: string | null): ListingDraft | null {
  return key ? (useListingDraft.getState().drafts[key] ?? null) : null;
}
