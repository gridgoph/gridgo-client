import { create } from "zustand";

import * as api from "@/lib/api";
import type { SavedFile, SavedFilesUsage } from "@/lib/api";
import { deleteSavedErrorMessage, listErrorMessage, saveChoiceErrorMessage } from "@/lib/myFiles";
import { useArtworkAttachments } from "@/store/artworkAttachments";

/**
 * My files (gridgo-client#334): the saved list, the "Save to My files" ticks
 * on the Artwork step, deleting, and the one file held for a new order.
 *
 * The list is never kept on the phone — every row carries signed links that
 * live five minutes — so the screen reads it again on focus and whenever a
 * picture's link has run out. A tick's truth is the file's own `savedAt`, held
 * in `store/artworkAttachments.ts`; this store holds only the choice on its way
 * to GRIDGO, so a refused save leaves the box exactly as GRIDGO has it.
 */

export type HeldFile = { fileId: string; name: string; contentType: string };

type MyFilesState = {
  files: SavedFile[] | null;
  usage: SavedFilesUsage | null;
  nextOffset: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** The choice on its way to GRIDGO, per file. */
  pendingSave: Record<string, boolean>;
  saveError: Record<string, string | null>;
  /** The file whose delete is being asked about. */
  confirming: string | null;
  deleting: boolean;
  deleteError: string | null;
  /** Chosen with "Use on a new order"; the next Artwork step offers it. */
  held: HeldFile | null;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Tick or untick one file. Resolves whether GRIDGO now has it the new way. */
  setSaved: (fileId: string, saved: boolean) => Promise<boolean>;
  askDelete: (fileId: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<boolean>;
  hold: (file: HeldFile) => void;
  release: () => void;
  reset: () => void;
};

const initial = {
  files: null,
  usage: null,
  nextOffset: null,
  loading: false,
  loadingMore: false,
  error: null,
  pendingSave: {},
  saveError: {},
  confirming: null,
  deleting: false,
  deleteError: null,
  held: null,
};

/** Bumped by `reset`, so an answer for the last account lands nowhere. */
let generation = 0;
let reading: Promise<void> | null = null;

export const useMyFiles = create<MyFilesState>((set, get) => ({
  ...initial,
  load: () => {
    // One read at a time: a focus and a stale picture asking together are one call.
    if (reading) return reading;
    const owner = generation;
    set({ loading: true, error: null });
    const read = api
      .listSavedFiles(0)
      .then(
        (page) => {
          if (owner !== generation) return;
          set({ files: page.files, usage: page.usage, nextOffset: page.nextOffset, error: null });
        },
        (error) => {
          if (owner !== generation) return;
          set({ error: listErrorMessage(error) });
        },
      )
      .finally(() => {
        reading = null;
        if (owner === generation) set({ loading: false });
      });
    reading = read;
    return read;
  },
  loadMore: async () => {
    const { nextOffset, loadingMore, files } = get();
    if (nextOffset == null || loadingMore || !files) return;
    const owner = generation;
    set({ loadingMore: true, error: null });
    try {
      const page = await api.listSavedFiles(nextOffset);
      if (owner !== generation) return;
      const seen = new Set(files.map((file) => file.fileId));
      set({
        files: [...files, ...page.files.filter((file) => !seen.has(file.fileId))],
        usage: page.usage,
        nextOffset: page.nextOffset,
      });
    } catch (error) {
      if (owner === generation) set({ error: listErrorMessage(error) });
    } finally {
      if (owner === generation) set({ loadingMore: false });
    }
  },
  setSaved: async (fileId, saved) => {
    if (get().pendingSave[fileId] !== undefined) return false;
    const owner = generation;
    set((state) => ({
      pendingSave: { ...state.pendingSave, [fileId]: saved },
      saveError: { ...state.saveError, [fileId]: null },
    }));
    try {
      const result = await api.setFileSaved(fileId, saved);
      if (owner !== generation) return false;
      useArtworkAttachments.getState().putFile(result.file);
      set((state) => ({
        usage: result.usage,
        // Unticked here is gone from the list; a new save shows on the next read.
        files: saved || !state.files ? state.files : state.files.filter((file) => file.fileId !== fileId),
      }));
      return true;
    } catch (error) {
      if (owner !== generation) return false;
      set((state) => ({ saveError: { ...state.saveError, [fileId]: saveChoiceErrorMessage(error, saved) } }));
      return false;
    } finally {
      if (owner === generation) {
        set((state) => {
          const pendingSave = { ...state.pendingSave };
          delete pendingSave[fileId];
          return { pendingSave };
        });
      }
    }
  },
  askDelete: (fileId) => set({ confirming: fileId, deleteError: null }),
  cancelDelete: () => {
    if (!get().deleting) set({ confirming: null });
  },
  confirmDelete: async () => {
    const fileId = get().confirming;
    if (!fileId || get().deleting) return false;
    const owner = generation;
    set({ deleting: true, deleteError: null });
    try {
      const result = await api.deleteSavedFile(fileId);
      if (owner !== generation) return false;
      useArtworkAttachments.getState().putFile(result.file);
      set((state) => ({
        files: state.files?.filter((file) => file.fileId !== fileId) ?? null,
        usage: result.usage,
        confirming: null,
        held: state.held?.fileId === fileId ? null : state.held,
      }));
      return true;
    } catch (error) {
      if (owner !== generation) return false;
      const gone =
        error instanceof api.ApiError && (error.body as { error?: string } | null)?.error === "file_not_found";
      set({ deleteError: deleteSavedErrorMessage(error), confirming: null });
      if (gone) void get().load();
      return false;
    } finally {
      if (owner === generation) set({ deleting: false });
    }
  },
  hold: (file) => set({ held: file }),
  release: () => set({ held: null }),
  reset: () => {
    generation += 1;
    reading = null;
    set(initial);
  },
}));
