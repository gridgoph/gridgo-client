import { create } from "zustand";

import * as api from "@/lib/api";
import { backGuide, nextGuide, type GuideProgress, type GuideStepId } from "@/lib/expressGuide";
import type { TourRect } from "@/lib/tour";

type ExpressGuideStore = {
  /** Whose flags `guide` holds, so another account never reads them. */
  userId: string | null;
  /** GRIDGO's flags, or null before the first read. */
  guide: api.ExpressGuide | null;
  /** The read failed or this API has no guide route. */
  unavailable: boolean;
  /** The popup opened on this launch. In memory: GRIDGO keeps the day. */
  popupOpened: boolean;
  /** A running guide, or null. In memory only: a guide is never resumed. */
  progress: GuideProgress | null;
  rects: Partial<Record<GuideStepId, TourRect>>;
  mounted: Partial<Record<GuideStepId, number>>;

  load: (userId: string | null) => Promise<void>;
  /** Records the popup for today and keeps it from opening again this launch. */
  popupShown: () => void;
  /** Step one: a file the client added to Express. Fire and forget. */
  fileAdded: (fileId: string) => void;
  start: () => void;
  next: () => void;
  back: () => void;
  /** Skip: the guide counts as seen, not completed. */
  skip: () => void;
  /** The end card's button: the guide is completed. */
  finish: () => void;
  setRect: (id: GuideStepId, rect: TourRect) => void;
  clearRect: (id: GuideStepId) => void;
  mount: (id: GuideStepId) => void;
  unmount: (id: GuideStepId) => void;
  reset: () => void;
};

let loadSeq = 0;

/**
 * GRIDGO's How to order flags for the signed-in client, and the guide while
 * it runs. Rules live in `lib/expressGuide.ts`. Nothing here is persisted:
 * the flags are the server's, and the popup day is a server date.
 */
export const useExpressGuide = create<ExpressGuideStore>((set, get) => {
  const send = (action: api.ExpressGuideAction, fileId?: string) => {
    const userId = get().userId;
    void api
      .updateExpressGuide(action, fileId)
      .then((guide) => {
        if (get().userId === userId) set({ guide, unavailable: false });
      })
      .catch(() => {
        // The next read brings GRIDGO's answer back.
      });
  };

  return {
    userId: null,
    guide: null,
    unavailable: false,
    popupOpened: false,
    progress: null,
    rects: {},
    mounted: {},

    load: async (userId) => {
      if (!userId) return;
      if (get().userId !== userId) set({ userId, guide: null, unavailable: false, popupOpened: false });
      const seq = ++loadSeq;
      try {
        const guide = await api.getExpressGuide();
        if (seq === loadSeq && get().userId === userId) set({ guide, unavailable: false });
      } catch {
        if (seq === loadSeq && get().userId === userId) set({ unavailable: get().guide === null });
      }
    },

    popupShown: () => {
      const guide = get().guide;
      set({
        popupOpened: true,
        guide: guide ? { ...guide, showPopup: false } : guide,
      });
      send("popup_shown");
    },

    fileAdded: (fileId) => send("file_added", fileId),

    start: () => set({ progress: { step: 0 }, rects: {} }),
    next: () => {
      const progress = get().progress;
      if (progress) set({ progress: nextGuide(progress) });
    },
    back: () => {
      const progress = get().progress;
      if (progress) set({ progress: backGuide(progress) });
    },
    skip: () => {
      const guide = get().guide;
      set({
        progress: null,
        rects: {},
        guide: guide ? { ...guide, guideSeen: true } : guide,
      });
      send("guide_seen");
    },
    finish: () => {
      const guide = get().guide;
      set({
        progress: null,
        rects: {},
        guide: guide ? { ...guide, guideSeen: true, guideCompleted: true } : guide,
      });
      send("guide_completed");
    },

    setRect: (id, rect) => {
      const held = get().rects[id];
      if (held && held.x === rect.x && held.y === rect.y && held.width === rect.width && held.height === rect.height)
        return;
      set((state) => ({ rects: { ...state.rects, [id]: rect } }));
    },
    clearRect: (id) =>
      set((state) => {
        if (!state.rects[id]) return {};
        const rects = { ...state.rects };
        delete rects[id];
        return { rects };
      }),
    mount: (id) =>
      set((state) => ({
        mounted: { ...state.mounted, [id]: (state.mounted[id] ?? 0) + 1 },
      })),
    unmount: (id) =>
      set((state) => ({
        mounted: {
          ...state.mounted,
          [id]: Math.max(0, (state.mounted[id] ?? 0) - 1),
        },
      })),
    reset: () =>
      set({
        userId: null,
        guide: null,
        unavailable: false,
        popupOpened: false,
        progress: null,
        rects: {},
      }),
  };
});

/** True while the guide is on screen. */
export function guideRunning(state: Pick<ExpressGuideStore, "progress">): boolean {
  return state.progress !== null;
}
