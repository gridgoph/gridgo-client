import { create } from "zustand";

import type { ReorderAnswers } from "@/lib/reorder";

/** A past order's file GRIDGO still keeps. */
export type ReorderFile = { fileId: string; name: string; contentType: string };

export type ReorderJob = {
  /** Never reused, and unchanged by `update`: what a late answer checks it is writing to. */
  id: number;
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
 *
 * `generation` moves on every start and clear, a new print and a change of
 * account included, so work still in the air can tell it has been overtaken
 * (`lib/jobTicket.ts`). Clearing a store cannot cancel a pending writer.
 */
type ReorderJobState = {
  generation: number;
  job: ReorderJob | null;
  /** Overtakes whatever is in the air, before there is a job to hold. */
  advance: () => number;
  start: (job: Omit<ReorderJob, "id">) => number;
  /** Writes to that job only; one that has been replaced takes nothing. */
  update: (id: number, fields: Partial<Pick<ReorderJob, "files" | "lineId" | "artworkNote">>) => void;
  clear: () => void;
};

export const useReorderJob = create<ReorderJobState>((set, get) => ({
  generation: 0,
  job: null,
  advance: () => {
    const generation = get().generation + 1;
    set({ generation });
    return generation;
  },
  start: (job) => {
    const id = get().generation + 1;
    set({ generation: id, job: { ...job, id } });
    return id;
  },
  update: (id, fields) =>
    set((state) => (state.job?.id === id ? { job: { ...state.job, ...fields } } : state)),
  clear: () => set((state) => ({ generation: state.generation + 1, job: null })),
}));
