import { create } from "zustand";

import type { ReorderAnswers } from "@/lib/reorder";

/** A past order's file GRIDGO still keeps. */
export type ReorderFile = { fileId: string; name: string; contentType: string };

export type ReorderJob = {
  /** The product this job is. A sheet for anything else starts empty. */
  subcategory: string;
  answers: ReorderAnswers;
  /** Null until read. Spent, and so empty, once the Artwork step has taken them. */
  files: ReorderFile[] | null;
  /** The basket line it became; from then on a sheet starts empty again. */
  lineId: string | null;
  /** What the Artwork step says about the files it was handed. */
  artworkNote: string | null;
};

/**
 * The past order a job is repeating, from Reorder to its line in the basket.
 *
 * Not persisted, like the date and delivery beside it: it belongs to this
 * errand. `useStartPrintJob` clears it, so no other job can inherit it.
 */
type ReorderJobState = {
  job: ReorderJob | null;
  start: (job: ReorderJob) => void;
  update: (fields: Partial<Pick<ReorderJob, "files" | "lineId" | "artworkNote">>) => void;
  clear: () => void;
};

export const useReorderJob = create<ReorderJobState>((set) => ({
  job: null,
  start: (job) => set({ job }),
  update: (fields) => set((state) => (state.job ? { job: { ...state.job, ...fields } } : state)),
  clear: () => set({ job: null }),
}));
