/**
 * One picked image streamed to `POST /files`, as a slot a form can draw:
 * sending with its progress, stored with the server's id, or failed with a
 * sentence the client can act on. Shared by the refund draft and the problem
 * report, which upload the same `refund_evidence` photos.
 *
 * Transfer progress is not success: only a `201` carrying a `fileId` makes a
 * slot `stored` (`lib/artworkUpload.ts`).
 */

import * as api from "@/lib/api";
import { artworkErrorMessage } from "@/lib/artworkUpload";

export type ImageUpload = {
  key: string;
  phase: "sending" | "stored" | "failed";
  fileName: string;
  localUri: string | null;
  /** Only a `201` with an id sets this. Transfer progress is not success. */
  fileId: string | null;
  progress: number | null;
  error: string | null;
};

export type SlotWrite = (slot: ImageUpload | ((slot: ImageUpload) => ImageUpload)) => void;

let uploadSeq = 0;

export function nextUploadKey(): string {
  return `upload-${++uploadSeq}`;
}

/** A slot that never left the phone: the picker could not read the file. */
export function failedUpload(error: string): ImageUpload {
  return { key: nextUploadKey(), phase: "failed", fileName: "", localUri: null, fileId: null, progress: null, error };
}

/**
 * Start one upload, writing its slot through `write`. `stillCurrent` is asked
 * before every later write, so an answer for a form the client has since left
 * lands nowhere. Returns the handle, or null when the image was refused before
 * sending (over `maxMiB`).
 */
export function uploadImage({
  asset,
  purpose,
  maxMiB,
  write,
  stillCurrent,
  onSettled,
}: {
  asset: api.UploadAsset & { size?: number };
  purpose: string;
  maxMiB: number;
  write: SlotWrite;
  stillCurrent: () => boolean;
  onSettled?: (key: string) => void;
}): { key: string; handle: api.UploadHandle | null } {
  const key = nextUploadKey();
  const base: ImageUpload = {
    key,
    phase: "sending",
    fileName: asset.name,
    localUri: asset.uri,
    fileId: null,
    progress: 0,
    error: null,
  };
  if (asset.size != null && asset.size > maxMiB * 1024 * 1024) {
    write({ ...base, phase: "failed", progress: null, error: `This image is over ${maxMiB} MB. Send a screenshot rather than a full photo.` });
    return { key, handle: null };
  }
  write(base);
  const handle = api.uploadFile(asset, purpose, (fraction) => {
    if (stillCurrent()) write((slot) => (slot.key === key && slot.phase === "sending" ? { ...slot, progress: fraction } : slot));
  });
  handle.done
    .then((file) => {
      if (!stillCurrent()) return;
      write((slot) => (slot.key === key ? { ...slot, phase: "stored", fileId: file.fileId, progress: 1 } : slot));
    })
    .catch((error: unknown) => {
      if (!stillCurrent()) return;
      write((slot) =>
        slot.key === key
          ? { ...slot, phase: "failed", progress: null, error: `${artworkErrorMessage(error)} GRIDGO takes JPEG, PNG or WebP images.` }
          : slot,
      );
    })
    .finally(() => onSettled?.(key));
  return { key, handle };
}

/** The ids of the slots that reached GRIDGO, in the order they were added. */
export function storedFileIds(slots: readonly ImageUpload[]): string[] {
  return slots.flatMap((slot) => (slot.phase === "stored" && slot.fileId ? [slot.fileId] : []));
}

/** Writes one slot into a list: a new slot is appended, an updater touches only its own key. */
export function writeSlot(slots: readonly ImageUpload[], key: string, next: ImageUpload | ((slot: ImageUpload) => ImageUpload)): ImageUpload[] {
  if (typeof next !== "function") {
    return slots.some((slot) => slot.key === next.key)
      ? slots.map((slot) => (slot.key === next.key ? next : slot))
      : [...slots, next];
  }
  return slots.map((slot) => (slot.key === key ? next(slot) : slot));
}
