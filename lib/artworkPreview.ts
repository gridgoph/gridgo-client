import { ApiError, type StoredFile } from "@/lib/api";
import { isWordDocument } from "@/lib/artworkUpload";
import { isArtworkImage } from "@/lib/orderArtwork";

/**
 * The artwork's picture on the visual proof (gridgo-api
 * `docs/STORAGE_API.md#artwork-visual-previews`, gridgo-client#228).
 *
 * GRIDGO renders page 1 of a PDF to a PNG and signs it separately; an image is
 * its own preview. A Word file has no preview yet (the captain deferred it), and
 * the API says so as `status: "unsupported"` with `preview_word_not_available`.
 * This module decides which path a file takes and what each failure says. The
 * hook (`hooks/useArtworkImage.ts`) does the reading.
 */

/** GRIDGO's own wording for the Word refusal: the `422` body says exactly this. */
export const WORD_PREVIEW_UNAVAILABLE = "Preview not available for Word files yet - open the original";

/**
 * How a file reaches the screen.
 *
 * - `preview` — GRIDGO publishes a preview for it (`file.preview`): resolve
 *   `GET /files/:id/preview-url`, retry through `POST /files/:id/preview`.
 * - `original` — an image without a preview record (an older API, or a
 *   reference picture or refund image): its signed original is the picture.
 * - `word` — a Word file: no picture, GRIDGO's message, and the original.
 * - `document` — anything else that cannot be drawn (Photoshop, a PDF on an
 *   API without previews): the file's name stands in.
 */
export type ArtworkPreviewPlan = "preview" | "original" | "word" | "document";

export function artworkPreviewPlan(file: Pick<StoredFile, "detectedContentType" | "originalFilename" | "preview">): ArtworkPreviewPlan {
  const preview = file.preview;
  if (isWordDocument(file.detectedContentType, file.originalFilename) || preview?.error === "preview_word_not_available") return "word";
  // `pending` is not "unsupported": the read renders it on the spot.
  if (preview && preview.status !== "unsupported") return "preview";
  return isArtworkImage(file) ? "original" : "document";
}

/** A preview read that did not give a picture, in words, with how long to wait before another try. */
export type ArtworkPreviewFailure = {
  /** The API's code, or a device-side one; for tests and the failure report, never shown. */
  code: string;
  message: string;
  /** Milliseconds before Retry may run again: GRIDGO answered 429/503. */
  retryAfterMs: number;
};

export const PREVIEW_BUSY_WAIT_MS = 5_000;
/** The API refuses a second render of the same file inside 30 seconds. */
export const PREVIEW_COOLDOWN_MS = 30_000;

const REASONS: Record<string, string> = {
  preview_rasterization_failed: "GRIDGO could not make a picture of page 1. The PDF may be password-protected or damaged. Open the original to check it.",
  preview_generation_failed: "GRIDGO could not make a picture of page 1. Open the original to check it, or retry.",
  preview_output_invalid: "GRIDGO could not make a picture of page 1. Open the original to check it, or retry.",
  preview_render_timeout: "Making the picture of page 1 took too long. Retry, or open the original to check it.",
  preview_renderer_unavailable: "GRIDGO's preview maker is not running right now. Retry in a moment, or open the original.",
  preview_source_too_large: "This file is too large to preview. Open the original to check it.",
  preview_not_supported: "GRIDGO cannot preview this type of file. Open the original to check it.",
  image_load_failed: "The preview picture did not load on this phone. Check your connection and retry.",
};

const GENERIC = "The preview did not load. Check your connection and retry, or open the original.";

/** Map a failed preview read (an `ApiError`, a network error, or a device code) to what the card says. */
export function artworkPreviewFailure(error: unknown): ArtworkPreviewFailure {
  if (typeof error === "string") return { code: error, message: REASONS[error] ?? GENERIC, retryAfterMs: 0 };
  if (!(error instanceof ApiError)) return { code: "network", message: GENERIC, retryAfterMs: 0 };
  const code = error.message;
  if (error.status === 503 && code === "preview_busy") {
    return { code, message: "GRIDGO is making another preview right now. Retry in a few seconds.", retryAfterMs: PREVIEW_BUSY_WAIT_MS };
  }
  // A 429 carries the last render's own error, or `preview_retry_later`.
  if (error.status === 429) {
    const reason = REASONS[code];
    return {
      code,
      message: reason ? `${reason} You can retry in about 30 seconds.` : "GRIDGO tried this preview a moment ago. You can retry in about 30 seconds.",
      retryAfterMs: PREVIEW_COOLDOWN_MS,
    };
  }
  // Render failures are 503s as well (the API's default status): the reason
  // leads, and Retry stays open — inside the cooldown the API answers 429.
  return { code, message: REASONS[code] ?? GENERIC, retryAfterMs: 0 };
}

/** The Word refusal can still arrive as a `422` (an older file record): it is not a failure. */
export function isWordPreviewRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.message === "preview_word_not_available";
}

/** Under a PDF's picture: which page is shown, or nothing for a one-page file. */
export function previewPageLine(file: Pick<StoredFile, "detected"> | null | undefined): string | null {
  const pages = file?.detected?.pageCount;
  if (pages === 1) return null;
  return pages && pages > 1 ? `Page 1 of ${pages} shown` : "First page shown";
}
