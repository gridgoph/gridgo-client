/**
 * My files — the client's opt-in artwork library (gridgo-client#334, gridgo-api
 * `docs/STORAGE_API.md` "My files").
 *
 * Artwork follows the 30-day rule unless the client ticks "Save to My files";
 * a ticked file stays until they delete it or close the account. The library
 * has one limit per client, set by Super Admin and sent with every answer as
 * `usage`. This module holds the words and the arithmetic; the API decides.
 */

import { ApiError, type CatalogItem, type SavedFile, type SavedFilesUsage, type StoredFile } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { isWordDocument } from "@/lib/artworkUpload";
import { fileFormats, fileMatchesFormats } from "@/lib/listing";
import { manilaDay } from "@/lib/organization";

export const MY_FILES_ROUTE = "/my-files";

export const SAVE_TO_MY_FILES_LABEL = "Save to My files";

/** The line under the tick: what saving means, and nothing it does not. */
export const SAVE_TO_MY_FILES_HINT = "Saved files stay in My files until you delete them.";

/** Whether this file can be ticked at all: the client's own artwork on an API with My files. */
export function canSaveToMyFiles(file: StoredFile | null | undefined): file is StoredFile {
  return Boolean(file && file.savedAt !== undefined && file.state === "ready" && (file.purpose === "artwork" || file.purpose === "mockup"));
}

/**
 * Storage in the units people buy it in: 1 MB is a million bytes, so the
 * platform's 500 000 000-byte default reads "500 MB", not "476.8 MB".
 */
export function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${trim(bytes / 1_000_000)} MB`;
  return `${trim(bytes / 1_000_000_000)} GB`;
}

/** One decimal under ten, whole numbers above, and never a trailing ".0". */
function trim(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return String(rounded);
}

/** How full the library is, 0–1. A zero limit with nothing saved is empty, not full. */
export function usageFraction(usage: SavedFilesUsage): number {
  if (usage.limitBytes <= 0) return usage.usedBytes > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, usage.usedBytes / usage.limitBytes));
}

/** "48 KB of 500 MB used" */
export function usageLine(usage: SavedFilesUsage): string {
  return `${formatStorage(usage.usedBytes)} of ${formatStorage(usage.limitBytes)} used`;
}

/** Nearly full is said before it is full, so a save is not the first the client hears of it. */
export function usageNearlyFull(usage: SavedFilesUsage): boolean {
  return usage.limitBytes > 0 ? usageFraction(usage) >= 0.9 : true;
}

/** What is left to save into, or why nothing is. */
export function usageRoomLine(usage: SavedFilesUsage): string {
  if (usage.limitBytes <= 0) return "Saving new files is switched off right now. Files you already saved stay here.";
  const left = Math.max(0, usage.limitBytes - usage.usedBytes);
  if (left === 0) return "My files is full. Delete saved files you no longer need to make room.";
  return `${formatStorage(left)} left. Deleting saved files frees space.`;
}

type LimitBody = { limitBytes?: unknown; usedBytes?: unknown; fileSizeBytes?: unknown };

const bytesOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * `409 saved_files_limit_reached`, said with GRIDGO's own numbers: how much is
 * used of how much, how big this file is, and what frees space.
 */
export function limitReachedMessage(body: LimitBody | null | undefined): string {
  const limit = bytesOf(body?.limitBytes);
  const used = bytesOf(body?.usedBytes);
  const size = bytesOf(body?.fileSizeBytes);
  if (limit === 0) {
    return "Saving to My files is switched off right now, so this file follows the usual 30-day rule.";
  }
  const fullness =
    limit != null && used != null
      ? `My files is full: you have used ${formatStorage(used)} of ${formatStorage(limit)}`
      : "My files is full";
  const file = size != null ? `, and this file needs ${formatStorage(size)}` : "";
  return `${fullness}${file}. Delete saved files you no longer need to free space, then tick it again.`;
}

function codeOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
}

/** Ticking or unticking "Save to My files" did not land. */
export function saveChoiceErrorMessage(error: unknown, saved: boolean): string {
  switch (codeOf(error)) {
    case "saved_files_limit_reached":
      return limitReachedMessage((error as ApiError).body as LimitBody);
    case "saved_file_purpose_not_allowed":
      return "Only artwork and design mockups can be saved to My files.";
    case "file_not_ready":
      return "This file is still being stored, or is being deleted. Wait a moment and try again.";
    case "file_not_found":
      return "That file is no longer in your account. Upload it again to save it.";
    default: {
      // Which way the box stands, then why: the tick has already gone back.
      const lead = saved ? "This file was not saved to My files." : "This file is still in My files.";
      return `${lead} ${userFacingError(error, "Check your connection and try again.")}`;
    }
  }
}

/** Deleting a saved file was refused, or did not reach GRIDGO. */
export function deleteSavedErrorMessage(error: unknown): string {
  switch (codeOf(error)) {
    case "file_in_use":
      return "This file is on an item in your basket or on an order that is not finished. Remove it from the basket, or wait until the order is completed, then delete it.";
    case "file_retention_hold":
      return "Something is still open on an order that uses this file, so GRIDGO keeps it for now. Try again once that is settled.";
    case "file_not_found":
      return "That file is no longer in My files. Your list has been refreshed.";
    default:
      return userFacingError(error, "This file was not deleted. Check your connection and try again.");
  }
}

/** The list could not be read. */
export function listErrorMessage(error: unknown): string {
  return userFacingError(error, "GRIDGO could not load My files. Check your connection and try again.");
}

/** "PNG image", "PDF", "Word document" — what kind of file, in words. */
export function savedFileType(file: Pick<SavedFile, "detectedContentType" | "originalFilename">): string {
  const mime = file.detectedContentType.toLowerCase();
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/vnd.adobe.photoshop") return "Photoshop file";
  if (isWordDocument(mime)) return "Word document";
  if (mime.startsWith("image/")) return `${mime.slice(6).replace("jpeg", "jpg").toUpperCase()} image`;
  const extension = file.originalFilename.split(".").pop();
  return extension && extension !== file.originalFilename ? `${extension.toUpperCase()} file` : "File";
}

/** "Design mockup" where it is one; artwork is the ordinary case and goes unsaid. */
export function savedFileKind(file: Pick<SavedFile, "purpose">): string | null {
  return file.purpose === "mockup" ? "Design mockup" : null;
}

/** "Saved 29 Oct 2026", in Davao time. */
export function savedDateLine(savedAt: string): string {
  const day = manilaDay(savedAt);
  return day ? `Saved ${day}` : "Saved";
}

/** Why a saved file cannot be opened right now, or null when it can. */
export function unavailableLine(file: Pick<SavedFile, "unavailable" | "error">): string | null {
  if (!file.unavailable) return null;
  return file.error === "minio_unavailable"
    ? "File storage is offline right now. The file is still saved — try again in a moment."
    : "GRIDGO could not open this file just now. It is still saved — try again later.";
}

/**
 * Whether a saved file can go on this basket item, or the reason it cannot.
 * The API judges again at checkout; this only keeps the offer honest.
 */
export function reuseRefusal(
  file: Pick<SavedFile, "purpose" | "originalFilename" | "detectedContentType" | "unavailable">,
  listing: CatalogItem | null,
): string | null {
  if (file.purpose !== "artwork") return "A design mockup cannot be used as print artwork.";
  if (file.unavailable) return "This file cannot be opened right now.";
  if (listing && !listingTakes(listing, file.originalFilename, file.detectedContentType)) {
    return `${listing.name} does not take this kind of file.`;
  }
  return null;
}

/** A listing that names no file types takes any file; GRIDGO's own check judges it. */
export function listingTakes(listing: CatalogItem, name: string, contentType: string): boolean {
  return fileFormats(listing).length === 0 || fileMatchesFormats(listing, name, contentType);
}

export const DELETE_SAVED_CONFIRM = {
  question: (name: string) => `Delete ${name}?`,
  body: "GRIDGO deletes the file itself, not just its place in My files. This cannot be undone. Orders that already used it keep their history.",
};

/** The prompt on the Artwork step after "Use on a new order". */
export function heldFileLine(name: string): string {
  return `${name} from My files is ready to add. GRIDGO uses the saved copy — nothing is uploaded again.`;
}
