import { create } from "zustand";

import type * as api from "@/lib/api";
import { failedUpload, uploadImage, writeSlot, type ImageUpload } from "@/lib/imageUpload";
import { MAX_PROBLEM_PHOTOS, PROBLEM_PHOTO_MAX_MIB } from "@/lib/issueWindow";
import { pickImage } from "@/lib/pickImage";

/**
 * The photos going with a problem report, uploaded the way refund evidence
 * is (`refund_evidence`). Held in a store rather than the card's own state so
 * an upload answering after the picker closes still reaches the screen, and
 * so leaving the order and coming back keeps what was already sent.
 */
type State = {
  /** The order these photos belong to. A different order starts empty. */
  orderId: string | null;
  photos: ImageUpload[];
};

type Actions = {
  reset: () => void;
  /** Pick and upload one photo for this order's report. Another order's photos are dropped first. */
  addPhoto: (orderId: string) => Promise<void>;
  removePhoto: (key: string) => void;
};

const UNREADABLE = "That photo could not be read. Take it again, or pick it from Photos.";

const handles = new Map<string, api.UploadHandle>();

function cancelAll() {
  for (const handle of handles.values()) handle.cancel();
  handles.clear();
}

export const useProblemReport = create<State & Actions>((set, get) => ({
  orderId: null,
  photos: [],
  reset: () => {
    cancelAll();
    set({ photos: [] });
  },
  addPhoto: async (orderId) => {
    if (get().orderId !== orderId) {
      cancelAll();
      set({ orderId, photos: [] });
    }
    if (get().photos.length >= MAX_PROBLEM_PHOTOS) return;
    const picked = await pickImage(UNREADABLE);
    if (!picked) return;
    if ("error" in picked) {
      set((state) => ({ photos: [...state.photos, failedUpload(picked.error)] }));
      return;
    }
    let key = "";
    const started = uploadImage({
      asset: picked.asset,
      purpose: "refund_evidence",
      maxMiB: PROBLEM_PHOTO_MAX_MIB,
      write: (next) =>
        set((state) => {
          if (typeof next !== "function") key = next.key;
          return { photos: writeSlot(state.photos, key, next) };
        }),
      stillCurrent: () => get().orderId === orderId,
      onSettled: (settled) => handles.delete(settled),
    });
    if (started.handle) handles.set(started.key, started.handle);
  },
  removePhoto: (key) => {
    handles.get(key)?.cancel();
    handles.delete(key);
    set((state) => ({ photos: state.photos.filter((photo) => photo.key !== key) }));
  },
}));
