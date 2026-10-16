import { create } from "zustand";

import * as api from "@/lib/api";
import type { ArtworkFormatCheck } from "@/lib/artworkUpload";
import { userFacingError } from "@/lib/copy";
import {
  coverSpineErrorMessage,
  coverSpineInput,
  draftFromRecord,
  type CoverSpineDraft,
} from "@/lib/coverSpine";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";

/**
 * A hardbound book's cover and spine form, per basket item, while it is being
 * filled in (gridgo-api `docs/HARDBOUND_COVER_API.md`).
 *
 * GRIDGO takes the form whole, so what the client is typing lives here until
 * every required field passes — the live preview draws from it — and the
 * line's own `coverSpine` is what GRIDGO holds. A draft is dropped once it
 * lands, so the screen reads GRIDGO's copy again.
 *
 * A store rather than component state for the reason `store/designLink.ts`
 * gives: every answer arrives after an `await`. Nothing is persisted.
 */

type CoverSpineState = {
  drafts: Record<string, CoverSpineDraft>;
  /** Save was tried: an empty required field now says so. */
  attempted: Record<string, boolean>;
  saving: Record<string, boolean>;
  saveError: Record<string, string | null>;
  uploading: Record<string, boolean>;
  edit: (lineId: string, change: Partial<CoverSpineDraft>) => void;
  /** Send the form. Resolves true once GRIDGO holds it. */
  save: (lineId: string) => Promise<boolean>;
  /** Upload the separate cover page onto the item and choose it as the cover. */
  uploadCover: (lineId: string, guard?: ArtworkFormatCheck & { accept: string[] }) => Promise<void>;
  /** Take the form off a line whose product no longer asks for it. */
  clear: (lineId: string) => Promise<boolean>;
  reset: () => void;
};

const initial = { drafts: {}, attempted: {}, saving: {}, saveError: {}, uploading: {} };

let generation = 0;

function lineOf(lineId: string) {
  return useCart.getState().cart?.lines.find((entry) => entry.id === lineId) ?? null;
}

/** The form on screen: the client's draft, else what GRIDGO holds. */
export function coverSpineDraftOf(
  drafts: Record<string, CoverSpineDraft>,
  line: Pick<api.CartLineRecord, "id" | "coverSpine"> | null | undefined,
): CoverSpineDraft {
  if (!line) return draftFromRecord(null);
  return drafts[line.id] ?? draftFromRecord(line.coverSpine);
}

export const useCoverSpine = create<CoverSpineState>((set, get) => {
  function patch<K extends "attempted" | "saving" | "saveError" | "uploading">(key: K, lineId: string, value: CoverSpineState[K][string]) {
    set((state) => ({ [key]: { ...state[key], [lineId]: value } }) as unknown as Partial<CoverSpineState>);
  }

  function dropDraft(lineId: string) {
    set((state) => {
      const { [lineId]: _landed, ...drafts } = state.drafts;
      return { drafts };
    });
  }

  return {
    ...initial,
    edit: (lineId, change) => {
      const current = coverSpineDraftOf(get().drafts, lineOf(lineId) ?? { id: lineId, coverSpine: null });
      set((state) => ({ drafts: { ...state.drafts, [lineId]: { ...current, ...change } } }));
      patch("saveError", lineId, null);
    },
    save: async (lineId) => {
      const line = lineOf(lineId);
      if (!line || get().saving[lineId]) return false;
      const draft = coverSpineDraftOf(get().drafts, line);
      const input = coverSpineInput(draft);
      if (!input) {
        patch("attempted", lineId, true);
        return false;
      }
      const owner = generation;
      patch("saving", lineId, true);
      patch("saveError", lineId, null);
      try {
        const cart = useCart.getState();
        const updated = await cart.run((cartId) => api.updateCartLine(cartId, lineId, { coverSpine: input }));
        if (owner !== generation) return false;
        cart.adopt(updated);
        dropDraft(lineId);
        patch("attempted", lineId, false);
        return true;
      } catch (error) {
        if (owner !== generation) return false;
        const body = error instanceof api.ApiError ? error.body : null;
        patch(
          "saveError",
          lineId,
          coverSpineErrorMessage(body) ?? userFacingError(error, "Your cover and spine did not save. Try again in a moment."),
        );
        return false;
      } finally {
        if (owner === generation) patch("saving", lineId, false);
      }
    },
    uploadCover: async (lineId, guard) => {
      if (get().uploading[lineId]) return;
      const owner = generation;
      patch("uploading", lineId, true);
      patch("saveError", lineId, null);
      try {
        const fileId = await useArtworkAttachments.getState().pickCover(lineId, guard);
        if (fileId && owner === generation) get().edit(lineId, { cover: "separate_file", coverFileId: fileId });
      } finally {
        if (owner === generation) patch("uploading", lineId, false);
      }
    },
    clear: async (lineId) => {
      const owner = generation;
      try {
        const cart = useCart.getState();
        const updated = await cart.run((cartId) => api.updateCartLine(cartId, lineId, { coverSpine: null }));
        if (owner !== generation) return false;
        cart.adopt(updated);
        dropDraft(lineId);
        return true;
      } catch {
        return false;
      }
    },
    reset: () => {
      generation += 1;
      set(initial);
    },
  };
});
