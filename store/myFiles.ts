import { Linking } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import type { SavedFile, SavedFilesPage, SavedFilesUsage } from "@/lib/api";
import {
  SAVE_UNCONFIRMED,
  deleteSavedErrorMessage,
  isExplicitRefusal,
  listErrorMessage,
  openErrorMessage,
  saveChoiceErrorMessage,
} from "@/lib/myFiles";
import { useArtworkAttachments } from "@/store/artworkAttachments";

/**
 * My files (gridgo-client#334): the saved list, the "Save to My files" ticks
 * on the Artwork step, deleting, opening, and the one file held for a new order.
 *
 * The list is never kept on the phone — every row carries signed links that
 * live five minutes — so the screen reads it again on focus and whenever a
 * picture's link has run out, and Open asks for a fresh link every time. A
 * tick's truth is the file's own `savedAt`, held in
 * `store/artworkAttachments.ts`; this store holds only the choice on its way
 * to GRIDGO. A refusal leaves the box as GRIDGO has it; a lost answer is not a
 * refusal — the change may have landed — so the file is read back before
 * anything is said, and "not confirmed" is said when even that fails.
 *
 * A page read can be overtaken by a delete or an unsave. Each such change is
 * counted; a page that answers after one is read again rather than merged, so
 * a deleted file never comes back and stale usage never replaces fresh. A
 * later page overtaken by a refresh of the first is dropped: its offset
 * belongs to the list the refresh replaced.
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
  /** GRIDGO did not answer and could not be asked again: the tick is not confirmed. */
  unconfirmed: Record<string, boolean>;
  /** Asking for a fresh link to the original, per file. */
  opening: Record<string, boolean>;
  openError: Record<string, string | null>;
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
  /** Read an unconfirmed file back from GRIDGO. */
  recheck: (fileId: string) => Promise<void>;
  /** Open the original on a link signed just now. */
  open: (fileId: string) => Promise<void>;
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
  unconfirmed: {},
  opening: {},
  openError: {},
  confirming: null,
  deleting: false,
  deleteError: null,
  held: null,
};

/** Bumped by `reset`, so an answer for the last account lands nowhere. */
let generation = 0;
let reading: Promise<void> | null = null;
/** Counts every save, unsave and delete GRIDGO confirmed. */
let changes = 0;
/** When each file left the list, by `changes`. */
const removedAt = new Map<string, number>();
/**
 * Bumped each time a first-page read replaces the list. A later page asked for
 * before that belongs to the old list and its offsets, so it is dropped.
 */
let listEpoch = 0;
/** A page that keeps being overtaken is read at most this many times. */
const PAGE_ATTEMPTS = 3;

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export const useMyFiles = create<MyFilesState>((set, get) => {
  /**
   * Read a page until no change overtakes it (or give up after a few tries).
   * `offset` is asked again on each try: a removal moves the next page up.
   */
  async function readPage(offset: () => number | null) {
    const since = changes;
    for (let attempt = 1; ; attempt++) {
      const at = offset();
      if (at == null) return null;
      const seq = changes;
      const page: SavedFilesPage = await api.listSavedFiles(at);
      const settled = changes === seq;
      if (settled || attempt >= PAGE_ATTEMPTS) {
        // A file removed since the read began never comes back with it.
        const files = page.files.filter((file) => (removedAt.get(file.fileId) ?? -1) <= since);
        return { page: { ...page, files }, settled };
      }
    }
  }

  /** The list and usage after GRIDGO confirmed a change to one file. */
  function changed(fileId: string, removed: boolean, usage: SavedFilesUsage | null) {
    changes += 1;
    if (removed) removedAt.set(fileId, changes);
    else removedAt.delete(fileId);
    set((state) => {
      const listed = state.files?.some((file) => file.fileId === fileId) ?? false;
      return {
        ...(usage ? { usage } : {}),
        ...(removed && listed
          ? {
              files: state.files!.filter((file) => file.fileId !== fileId),
              // The next page starts one place sooner now.
              nextOffset: state.nextOffset == null ? null : Math.max(0, state.nextOffset - 1),
            }
          : {}),
      };
    });
  }

  return {
    ...initial,
    load: () => {
      // One read at a time: a focus and a stale picture asking together are one call.
      if (reading) return reading;
      const owner = generation;
      set({ loading: true, error: null });
      const read = readPage(() => 0)
        .then(
          (result) => {
            if (owner !== generation || !result) return;
            const { page, settled } = result;
            listEpoch += 1;
            set((state) => ({
              files: page.files,
              usage: settled || !state.usage ? page.usage : state.usage,
              nextOffset: page.nextOffset,
              error: null,
            }));
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
      const epoch = listEpoch;
      set({ loadingMore: true, error: null });
      try {
        const result = await readPage(() => get().nextOffset);
        // A refresh replaced the list while this page was on its way: its
        // offset counted the old list, so merging it would skip files.
        if (owner !== generation || !result || epoch !== listEpoch) return;
        const { page, settled } = result;
        // Merged into the list as it is now, never the one this read began with.
        set((state) => {
          const current = state.files ?? [];
          const seen = new Set(current.map((file) => file.fileId));
          return {
            files: [...current, ...page.files.filter((file) => !seen.has(file.fileId))],
            usage: settled || !state.usage ? page.usage : state.usage,
            nextOffset: page.nextOffset,
          };
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
        unconfirmed: without(state.unconfirmed, fileId),
      }));
      const fail = (message: string, uncertain = false) =>
        set((state) => ({
          saveError: { ...state.saveError, [fileId]: message },
          unconfirmed: uncertain ? { ...state.unconfirmed, [fileId]: true } : state.unconfirmed,
        }));
      try {
        const result = await api.setFileSaved(fileId, saved);
        if (owner !== generation) return false;
        useArtworkAttachments.getState().putFile(result.file);
        changed(fileId, !saved, result.usage);
        return true;
      } catch (error) {
        if (owner !== generation) return false;
        if (isExplicitRefusal(error)) {
          fail(saveChoiceErrorMessage(error, saved));
          return false;
        }
        // No answer is not a refusal: the change may have landed. Ask GRIDGO.
        try {
          const file = await api.getFile(fileId);
          if (owner !== generation) return false;
          useArtworkAttachments.getState().putFile(file);
          if ((file.savedAt != null) === saved) {
            changed(fileId, !saved, null);
            // Usage is only sent with the list; read it again if it is on screen.
            if (get().files) void get().load();
            return true;
          }
          fail(saveChoiceErrorMessage(error, saved));
        } catch {
          if (owner === generation) fail(SAVE_UNCONFIRMED, true);
        }
        return false;
      } finally {
        if (owner === generation) set((state) => ({ pendingSave: without(state.pendingSave, fileId) }));
      }
    },
    recheck: async (fileId) => {
      if (get().pendingSave[fileId] !== undefined) return;
      const owner = generation;
      const saved = useArtworkAttachments.getState().files[fileId]?.savedAt != null;
      set((state) => ({ pendingSave: { ...state.pendingSave, [fileId]: saved } }));
      try {
        const file = await api.getFile(fileId);
        if (owner !== generation) return;
        useArtworkAttachments.getState().putFile(file);
        set((state) => ({
          unconfirmed: without(state.unconfirmed, fileId),
          saveError: { ...state.saveError, [fileId]: null },
        }));
        if (get().files) void get().load();
      } catch {
        // Still not confirmed; the same words stay up.
      } finally {
        if (owner === generation) set((state) => ({ pendingSave: without(state.pendingSave, fileId) }));
      }
    },
    open: async (fileId) => {
      if (get().opening[fileId]) return;
      const owner = generation;
      set((state) => ({
        opening: { ...state.opening, [fileId]: true },
        openError: { ...state.openError, [fileId]: null },
      }));
      try {
        // The list's link may be long past its five minutes: always sign a new one.
        const { url } = await api.getFileDownloadUrl(fileId);
        if (owner !== generation) return;
        await Linking.openURL(url);
      } catch (error) {
        if (owner === generation) set((state) => ({ openError: { ...state.openError, [fileId]: openErrorMessage(error) } }));
      } finally {
        if (owner === generation) set((state) => ({ opening: without(state.opening, fileId) }));
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
        changed(fileId, true, result.usage);
        set((state) => ({ confirming: null, held: state.held?.fileId === fileId ? null : state.held }));
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
      changes = 0;
      listEpoch = 0;
      removedAt.clear();
      set(initial);
    },
  };
});
