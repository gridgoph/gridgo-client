import { create } from "zustand";

import * as api from "@/lib/api";
import type { ArtworkAttachment, CartLineRecord, StoredFile } from "@/lib/api";
import {
  MAX_ARTWORK_ATTACHMENTS,
  NO_LIST_ON_THIS_API,
  attachmentKey,
  attachmentsBody,
  lineAttachments,
  moveAttachment,
  overflowNote,
  relabelAttachment,
  sameAttachments,
  slotsLeft,
  withoutAttachment,
} from "@/lib/artworkAttachments";
import {
  artworkCheckFailure,
  artworkErrorMessage,
  artworkPickRefusal,
  DOCX_CONTENT_TYPE,
  normalizeFileName,
  type ArtworkFormatCheck,
} from "@/lib/artworkUpload";
import { acceptanceAfter } from "@/lib/artworkGuidance";
import { userFacingError } from "@/lib/copy";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import { COVER_FILE_IN_USE, COVER_FILE_LABEL } from "@/lib/coverSpine";
import { useCart } from "@/store/cart";

/**
 * The files and links on each basket item, while they are being added.
 *
 * What an item holds lives on GRIDGO (`cart.lines[].artworkAttachments`) and
 * nowhere else; this store holds only what has not landed there yet — uploads
 * in flight, each with its own progress, and the errors of the ones that did
 * not make it — plus each file's storage record, which is where its name,
 * size and GRIDGO's own check come from.
 *
 * Every change to an item's list is queued behind the last one and made to
 * the list GRIDGO last sent back. Two uploads finishing a moment apart each
 * add their file; neither writes over the other.
 *
 * A store rather than component state, for the reason `store/designLink.ts`
 * gives — every answer here arrives after an `await` — and so an upload keeps
 * going if the client steps back to the listing and returns.
 */

/** One file on its way to an item. Never a success: it leaves this list when the item holds it. */
export type PendingUpload = {
  key: string;
  /** `sending` → `saving` (bytes sent, GRIDGO still storing) → `attaching` (onto the item). */
  phase: "sending" | "saving" | "attaching" | "failed";
  fileName: string;
  /** 0–1 while sending; null when the platform gives no total. */
  progress: number | null;
  error: string | null;
  /**
   * Stored on GRIDGO but not on the item — the add was refused or the
   * connection dropped. Trying again adds it; the bytes do not move twice.
   */
  fileId: string | null;
  /** Refused on this phone for its type: only a different file helps. */
  refusal: "format" | "check" | null;
  /** The file this upload takes the place of, keeping its place and label. */
  replaces?: string;
  /** The label it goes onto the item with: a separate cover page is "Cover". */
  label?: string;
};

/** Where the last change to an item's list went wrong, if it did. */
type ChangeResult = { ok: true } | { ok: false; message: string };

type AttachmentState = {
  uploads: Record<string, PendingUpload[]>;
  saving: Record<string, boolean>;
  saveError: Record<string, string | null>;
  /** The picker returned more than the item has room for. */
  notice: Record<string, string | null>;
  /** Each file's storage record; null when it could not be read. */
  files: Record<string, StoredFile | null>;
  /** The warning (`fileId:code`) whose acceptance is on its way to GRIDGO. */
  accepting: Record<string, string | null>;
  acceptError: Record<string, string | null>;
  /** Pick one or more files and send each, up to the room the item has left. */
  pick: (lineId: string, guard?: ArtworkFormatCheck & { accept: string[] }) => Promise<void>;
  /**
   * Pick one file for a hardbound book's separate cover page. It goes onto the
   * item labelled Cover, after the files already there, so it never becomes
   * the main file pages are priced from. Resolves its id once it is on the item.
   */
  pickCover: (lineId: string, guard?: ArtworkFormatCheck & { accept: string[] }) => Promise<string | null>;
  /** Pick one file to take the place of a file on the item (a better export). */
  replace: (lineId: string, fileId: string, guard?: ArtworkFormatCheck & { accept: string[] }) => Promise<void>;
  /**
   * Tick or untick one artwork warning. GRIDGO replaces the line's whole
   * acceptance list, so every other acceptance is sent again with it.
   */
  acceptWarning: (lineId: string, fileId: string, code: string, accept: boolean) => Promise<void>;
  retry: (lineId: string, key: string) => Promise<void>;
  /** Stop an upload in flight, or put away one that failed. */
  dismiss: (lineId: string, key: string) => void;
  remove: (lineId: string, entryKey: string) => Promise<void>;
  move: (lineId: string, entryKey: string, by: -1 | 1) => Promise<void>;
  relabel: (lineId: string, entryKey: string, label: string) => Promise<void>;
  /** Put a checked link on the item, after everything already there. */
  addLink: (lineId: string, entry: Extract<ArtworkAttachment, { kind: "link" }>) => Promise<ChangeResult>;
  readFile: (fileId: string, options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
};

const initial = { uploads: {}, saving: {}, saveError: {}, notice: {}, files: {}, accepting: {}, acceptError: {} };

/** Picker types when no listing narrows them; the server judges the real format. */
const PICKER_TYPES = ["application/pdf", DOCX_CONTENT_TYPE, "image/*"];

const handles = new Map<string, api.UploadHandle>();
const assets = new Map<string, api.UploadAsset>();
const chains = new Map<string, Promise<unknown>>();
const reading = new Set<string>();
let sequence = 0;
/** Bumped by `reset`, so an upload begun for the last account lands nowhere. */
let generation = 0;

function lineOf(lineId: string) {
  return useCart.getState().cart?.lines.find((entry) => entry.id === lineId) ?? null;
}

const LIMIT_REACHED = `An item can have ${MAX_ARTWORK_ATTACHMENTS} files and design links at most. Remove one, then add this again.`;

export const useArtworkAttachments = create<AttachmentState>((set, get) => {
  function patchUpload(lineId: string, key: string, change: Partial<PendingUpload> | null) {
    set((state) => {
      const list = state.uploads[lineId] ?? [];
      const next = change
        ? list.map((upload) => (upload.key === key ? { ...upload, ...change } : upload))
        : list.filter((upload) => upload.key !== key);
      return { uploads: { ...state.uploads, [lineId]: next } };
    });
  }

  function patch<K extends "saving" | "saveError" | "notice" | "accepting" | "acceptError">(key: K, lineId: string, value: AttachmentState[K][string]) {
    set((state) => ({ [key]: { ...state[key], [lineId]: value } }) as unknown as Partial<AttachmentState>);
  }

  /**
   * Change an item's list, in turn. `change` sees the list GRIDGO holds at the
   * moment this change runs, and returns the list to keep — or a reason to
   * stop. Nothing is sent when the list would not change.
   */
  function change(
    lineId: string,
    edit: (entries: ArtworkAttachment[]) => ArtworkAttachment[] | string,
    fallback: string,
    /** More of the line to change in the same write, decided against the list GRIDGO holds. */
    alongside?: (line: CartLineRecord, next: ArtworkAttachment[]) => Partial<api.CartLineChange> | null,
  ): Promise<ChangeResult> {
    const owner = generation;
    const run = async (): Promise<ChangeResult> => {
      const line = lineOf(lineId);
      if (!line || owner !== generation) return { ok: false, message: "That item is no longer in your order." };
      const current = lineAttachments(line);
      const next = edit(current);
      if (typeof next === "string") return { ok: false, message: next };
      if (sameAttachments(current, next)) return { ok: true };
      const list = attachmentsBody(line, next);
      if (!list) return { ok: false, message: NO_LIST_ON_THIS_API };
      const body = { ...list, ...(alongside?.(line, next) ?? {}) };
      patch("saving", lineId, true);
      try {
        const cart = useCart.getState();
        const updated = await cart.run((cartId) => api.updateCartLine(cartId, lineId, body));
        if (owner !== generation) return { ok: false, message: fallback };
        cart.adopt(updated);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: userFacingError(error, fallback) };
      } finally {
        patch("saving", lineId, false);
      }
    };
    const queued = (chains.get(lineId) ?? Promise.resolve()).then(run, run);
    chains.set(lineId, queued);
    return queued;
  }

  /** A change the client made to what is already there: its error is the item's. */
  async function edit(lineId: string, next: (entries: ArtworkAttachment[]) => ArtworkAttachment[], fallback: string) {
    patch("saveError", lineId, null);
    const result = await change(lineId, next, fallback);
    if (!result.ok) patch("saveError", lineId, result.message);
  }

  async function attach(lineId: string, key: string, fileId: string): Promise<boolean> {
    patchUpload(lineId, key, { phase: "attaching", error: null, fileId });
    const pending = get().uploads[lineId]?.find((upload) => upload.key === key);
    const replaces = pending?.replaces;
    const label = pending?.label;
    const result = await change(
      lineId,
      (entries) =>
        entries.some((entry) => entry.kind === "file" && entry.fileId === fileId)
          ? entries
          : replaces && entries.some((entry) => entry.kind === "file" && entry.fileId === replaces)
            ? entries.map((entry) =>
                entry.kind === "file" && entry.fileId === replaces ? { kind: "file", fileId, label: entry.label } : entry,
              )
            : entries.length >= MAX_ARTWORK_ATTACHMENTS
              ? LIMIT_REACHED
              : [...entries, label ? { kind: "file", fileId, label } : { kind: "file", fileId }],
      "Your file reached GRIDGO but did not go onto this item. Try again in a moment.",
      // A better export of the cover page: the cover follows it in the same
      // write, or GRIDGO refuses the list for dropping the cover's file.
      (line) => {
        const cover = line.coverSpine;
        if (!replaces || cover?.status !== "given" || cover.coverFileId !== replaces || cover.cover !== "separate_file") return null;
        return {
          coverSpine: {
            cover: "separate_file",
            coverFileId: fileId,
            spine: cover.spine,
          },
        };
      },
    );
    if (result.ok) patchUpload(lineId, key, null);
    else patchUpload(lineId, key, { phase: "failed", error: result.message, refusal: null });
    return result.ok;
  }

  /** Upload one picked file and put it on the item. Resolves its id once it is there. */
  async function send(lineId: string, key: string): Promise<string | null> {
    const asset = assets.get(key);
    if (!asset) return null;
    const owner = generation;
    patchUpload(lineId, key, { phase: "sending", progress: 0, error: null, refusal: null });
    const handle = api.uploadFile(asset, "artwork", (fraction) => {
      const upload = get().uploads[lineId]?.find((entry) => entry.key === key);
      if (!upload || upload.phase !== "sending") return;
      // Bytes delivered is not storage confirmed: "saving" until GRIDGO answers.
      patchUpload(lineId, key, fraction != null && fraction >= 1 ? { phase: "saving", progress: 1 } : { progress: fraction });
    });
    handles.set(key, handle);
    try {
      const file = await handle.done;
      if (owner !== generation) return null;
      set((state) => ({ files: { ...state.files, [file.fileId]: file } }));
      // Stored, but not something GRIDGO can print from: never put on the item.
      const unusable = artworkCheckFailure(file.artworkCheck);
      if (unusable) {
        patchUpload(lineId, key, { phase: "failed", error: unusable, refusal: "check" });
        return null;
      }
      assets.delete(key);
      return (await attach(lineId, key, file.fileId)) ? file.fileId : null;
    } catch (error) {
      if (owner !== generation) return null;
      const cancelled =
        error instanceof api.ApiError &&
        (error.body as { error?: string } | null)?.error === "upload_cancelled";
      if (cancelled) {
        assets.delete(key);
        patchUpload(lineId, key, null);
        return null;
      }
      patchUpload(lineId, key, { phase: "failed", error: artworkErrorMessage(error), refusal: null });
      return null;
    } finally {
      handles.delete(key);
    }
  }

  /** Open the picker for new files, or for one that takes another's place. */
  async function choose(
    lineId: string,
    guard: (ArtworkFormatCheck & { accept: string[] }) | undefined,
    replaces: string | null,
    label?: string,
  ): Promise<string[]> {
    patch("notice", lineId, null);
    const picker = getDocumentPickerNative();
    if (!picker) {
      patch("notice", lineId, FILE_PICKER_NEEDS_REBUILD);
      return [];
    }
    let result: Awaited<ReturnType<typeof picker.getDocumentAsync>>;
    try {
      result = await picker.getDocumentAsync({
        type: guard?.accept.length ? guard.accept : PICKER_TYPES,
        // A replacement is one file for one file, and a cover is one page.
        multiple: replaces == null && label == null,
        // A URI the uploader streams from; the bytes never enter JavaScript.
        copyToCacheDirectory: true,
      });
    } catch {
      patch("notice", lineId, "The file picker did not open. Try again, and check GRIDGO has access to your files.");
      return [];
    }
    if (result.canceled) return [];
    const picked = (result.assets ?? []).filter((asset) => asset?.uri);
    if (!picked.length) {
      patch("notice", lineId, "That file could not be read. Pick it again, or copy it into Files first.");
      return [];
    }
    const busy = (get().uploads[lineId] ?? []).filter((upload) => upload.phase !== "failed").length;
    const room = replaces ? 1 : Math.min(label ? 1 : Infinity, slotsLeft(lineAttachments(lineOf(lineId)).length + busy));
    const taken = picked.slice(0, room);
    patch("notice", lineId, overflowNote(picked.length, taken.length));

    const started: string[] = [];
    for (const asset of taken) {
      const key = `upload-${++sequence}`;
      const name = normalizeFileName(asset.name);
      const refused = artworkPickRefusal({ name, mimeType: asset.mimeType ?? null, size: asset.size }, guard);
      const upload: PendingUpload = {
        key,
        phase: refused ? "failed" : "sending",
        fileName: name,
        progress: refused ? null : 0,
        error: refused?.error ?? null,
        fileId: null,
        refusal: refused?.refusal ?? null,
        ...(replaces ? { replaces } : {}),
        ...(label ? { label } : {}),
      };
      set((state) => ({ uploads: { ...state.uploads, [lineId]: [...(state.uploads[lineId] ?? []), upload] } }));
      if (refused) continue;
      assets.set(key, {
        uri: asset.uri,
        name,
        mimeType: asset.mimeType ?? null,
        file: "file" in asset ? (asset as { file?: Blob }).file : undefined,
      });
      started.push(key);
    }
    const landed = await Promise.all(started.map((key) => send(lineId, key)));
    return landed.filter((fileId): fileId is string => fileId != null);
  }

  return {
    ...initial,
    pick: async (lineId, guard) => {
      await choose(lineId, guard, null);
    },
    pickCover: async (lineId, guard) => (await choose(lineId, guard, null, COVER_FILE_LABEL))[0] ?? null,
    replace: async (lineId, fileId, guard) => {
      await choose(lineId, guard, fileId);
    },
    acceptWarning: async (lineId, fileId, code, accept) => {
      if (get().accepting[lineId]) return;
      const owner = generation;
      patch("accepting", lineId, `${fileId}:${code}`);
      patch("acceptError", lineId, null);
      const run = async () => {
        const guidance = lineOf(lineId)?.artworkGuidance;
        if (!guidance || owner !== generation) return;
        const cart = useCart.getState();
        try {
          const updated = await cart.run((cartId) =>
            api.acceptArtworkWarnings(cartId, lineId, acceptanceAfter(guidance, { fileId, code, accept })),
          );
          if (owner === generation) cart.adopt(updated);
        } catch (error) {
          if (owner !== generation) return;
          const stale =
            error instanceof api.ApiError &&
            (error.body as { error?: string } | null)?.error === "artwork_warning_not_found";
          if (stale) await cart.load();
          patch(
            "acceptError",
            lineId,
            stale
              ? "This file's check changed. Look at the warnings again and choose."
              : userFacingError(error, "Your choice did not save. Try again in a moment."),
          );
        }
      };
      const queued = (chains.get(lineId) ?? Promise.resolve()).then(run, run);
      chains.set(lineId, queued);
      try {
        await queued;
      } finally {
        if (owner === generation) patch("accepting", lineId, null);
      }
    },
    retry: async (lineId, key) => {
      const upload = get().uploads[lineId]?.find((entry) => entry.key === key);
      if (!upload || upload.phase !== "failed") return;
      if (upload.fileId) await attach(lineId, key, upload.fileId);
      else await send(lineId, key);
    },
    dismiss: (lineId, key) => {
      const handle = handles.get(key);
      if (handle) {
        // The cancelled transfer removes its own row when it settles.
        handle.cancel();
        return;
      }
      assets.delete(key);
      patchUpload(lineId, key, null);
    },
    remove: async (lineId, entryKey) => {
      // GRIDGO refuses a list without the cover's file: the cover changes first.
      const cover = lineOf(lineId)?.coverSpine;
      if (cover?.status === "given" && cover.coverFileId && entryKey === attachmentKey({ kind: "file", fileId: cover.coverFileId })) {
        patch("saveError", lineId, COVER_FILE_IN_USE);
        return;
      }
      await edit(lineId, (entries) => withoutAttachment(entries, entryKey), "That did not come off this item. Try again in a moment.");
    },
    move: (lineId, entryKey, by) =>
      edit(
        lineId,
        (entries) => {
          const from = entries.findIndex((entry) => attachmentKey(entry) === entryKey);
          return moveAttachment(entries, from, from + by);
        },
        "The new order did not save. Try again in a moment.",
      ),
    relabel: (lineId, entryKey, label) =>
      edit(lineId, (entries) => relabelAttachment(entries, entryKey, label), "That label did not save. Try again in a moment."),
    addLink: (lineId, entry) =>
      change(
        lineId,
        (entries) =>
          entries.some((held) => attachmentKey(held) === attachmentKey(entry))
            ? "That link is already on this item."
            : entries.length >= MAX_ARTWORK_ATTACHMENTS
              ? LIMIT_REACHED
              : [...entries, entry],
        "Your link did not go onto this item. Try again in a moment.",
      ),
    readFile: async (fileId, options = {}) => {
      if (reading.has(fileId) || (!options.force && get().files[fileId])) return;
      reading.add(fileId);
      try {
        const file = await api.getFile(fileId);
        set((state) => ({ files: { ...state.files, [fileId]: file } }));
      } catch {
        set((state) => ({ files: { ...state.files, [fileId]: null } }));
      } finally {
        reading.delete(fileId);
      }
    },
    reset: () => {
      generation += 1;
      for (const handle of handles.values()) handle.cancel();
      handles.clear();
      assets.clear();
      chains.clear();
      reading.clear();
      set(initial);
    },
  };
});
