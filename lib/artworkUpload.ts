/**
 * Artwork upload lifecycle.
 *
 * Transfer progress is not success. `POST /files` streams the bytes, and only
 * the `201` carrying a `fileId` proves MinIO holds the object and the record
 * is `ready` — so the bar reaching 100% moves the card into a distinct
 * "still saving" state rather than a tick. See `docs/STORAGE_API.md` in
 * gridgo-api for the contract these states mirror.
 */

import { ApiError, type DetectedArtwork } from "@/lib/api";

export type ArtworkPhase =
  | "empty"
  /** Bytes are moving. `progress` is 0–1 when the platform reports it. */
  | "sending"
  /** Transfer finished; the server is still storing and verifying. */
  | "saving"
  /** The server returned a file id. The bytes are safe, not yet on a job. */
  | "stored"
  /** Binding the stored file to the order. */
  | "attaching"
  /** The order holds this file. */
  | "attached"
  | "failed";

export type ArtworkUploadState = {
  phase: ArtworkPhase;
  /** Name of the file the client picked, shown from the moment it is chosen. */
  fileName: string;
  /** Server-issued id. Only ever set from a `201` response. */
  fileId: string | null;
  /** 0–1 while sending; null when the platform gives no total. */
  progress: number | null;
  /** Bytes and detected format, once the server has told us. */
  size: number | null;
  contentType: string | null;
  /**
   * What the file says its own size and page count are.
   *
   * Read by GRIDGO from the uploaded bytes rather than by this phone: nothing
   * here can open a PDF, and the round trip that measured an image by
   * downloading it again told us pixels and nothing about paper.
   */
  detected: DetectedArtwork | null;
  /** What went wrong and what to do about it. */
  error: string | null;
};

export const EMPTY_ARTWORK: ArtworkUploadState = {
  phase: "empty",
  fileName: "",
  fileId: null,
  progress: null,
  size: null,
  contentType: null,
  detected: null,
  error: null,
};

/** True while the client must not leave or re-pick. */
export function isArtworkBusy(state: ArtworkUploadState): boolean {
  return state.phase === "sending" || state.phase === "saving" || state.phase === "attaching";
}

/** The one line under the file name that says where the upload actually is. */
export function artworkStatusLine(state: ArtworkUploadState): string {
  switch (state.phase) {
    case "empty":
      return "No artwork chosen yet.";
    case "sending":
      return state.progress == null
        ? "Sending your file…"
        : `Sending your file — ${Math.round(state.progress * 100)}%.`;
    case "saving":
      return "Sent. The server is still saving it — keep this screen open.";
    case "stored":
      return "Saved on the server. It goes onto the job when you send this request.";
    case "attaching":
      return "Attaching it to this job…";
    case "attached":
      return "Attached to this job.";
    case "failed":
      return state.error ?? "The upload did not finish.";
  }
}

export type ArtworkChip = {
  tone: "success" | "warning" | "error" | "info" | "neutral";
  label: string;
  icon: "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen";
};

/** Status is always icon + label + colour, readable with no colour at all. */
export function artworkChip(state: ArtworkUploadState): ArtworkChip {
  switch (state.phase) {
    case "empty":
      return { tone: "neutral", label: "No file", icon: "square-pen" };
    case "sending":
      return { tone: "info", label: "Sending", icon: "clock" };
    case "saving":
      return { tone: "info", label: "Saving on server", icon: "clock" };
    case "stored":
      return { tone: "success", label: "Uploaded", icon: "circle-check" };
    case "attaching":
      return { tone: "info", label: "Attaching", icon: "clock" };
    case "attached":
      return { tone: "success", label: "On this job", icon: "circle-check" };
    case "failed":
      return { tone: "error", label: "Upload failed", icon: "circle-x" };
  }
}

/** Purpose limits, mirrored from the contract so the app can say them first. */
export const ARTWORK_MAX_BYTES = 209_715_200;
export const ARTWORK_MAX_MIB = 200;
export const ARTWORK_ACCEPTED = "JPEG, PNG, WebP or PDF";

/**
 * Turn a storage-API failure into a sentence that names the problem and the
 * fix. Codes from the contract's error table never reach the screen.
 */
export function artworkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string; maxMiB?: number } | null;
    const code = typeof body?.error === "string" ? body.error : "";

    switch (code) {
      case "file_empty":
        return "That file is empty. Export it again and pick the new file.";
      case "filename_required":
        return "That file arrived without a name. Rename it in Files, then pick it again.";
      case "file_too_large": {
        const limit = body?.maxMiB ?? ARTWORK_MAX_MIB;
        return `Artwork has to be under ${limit} MB. Flatten the layers or export at a lower resolution, then pick it again.`;
      }
      case "heic_not_supported":
        return "iPhone HEIC photos cannot be printed from. In Settings › Camera, choose Most Compatible, or export the image as JPEG first.";
      case "content_type_not_allowed":
      case "purpose_media_type_not_allowed":
      case "file_type_mismatch":
        return `Artwork has to be ${ARTWORK_ACCEPTED}. Export it in one of those formats and pick it again.`;
      case "multipart_required":
      case "invalid_multipart":
      case "file_required":
        return "The file did not arrive intact. Pick it again.";
      case "minio_unavailable":
        return "File storage is offline right now. Your job details are safe — try the upload again in a moment.";
      case "storage_object_missing":
      case "storage_object_mismatch":
      case "file_metadata_invalid":
      case "file_not_ready":
        return "The server could not confirm that file. Upload it again.";
      case "file_not_found":
        return "That file is no longer on the server. Pick it and upload again.";
      case "order_not_found":
        return "This job was not found. Open it again from Orders.";
      case "forbidden":
        return "You cannot attach artwork to this job. Open one of your own orders.";
      case "unauthorized":
        return "Your session expired. Sign in again, then upload the file.";
      default:
        if (error.status >= 500) {
          return "The server had a problem storing that file. Try the upload again.";
        }
        return "The upload did not finish. Pick the file and try again.";
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("load failed") ||
      message.includes("timeout")
    ) {
      return "The connection dropped before the file finished sending. Check your signal and try again.";
    }
  }

  return "The upload did not finish. Pick the file and try again.";
}

/**
 * The name the picker gave us, or a usable default.
 * iOS sometimes hands back an asset with no name at all.
 */
export function normalizeFileName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "artwork";
}


/** Millimetres from the thousandths the platform stores. */
function mm(milli: number): number {
  return Math.round(milli / 100) / 10;
}

/**
 * What GRIDGO read, in one line a client can check at a glance.
 *
 * The point is verification, not decoration: a person who exported the wrong
 * artboard finds out here, before paying, from the file itself. So it leads
 * with the name they would recognise — "A4" — and falls back to the
 * measurement when the size has no name.
 *
 * Null when the file said nothing. A screen must then ask rather than showing
 * an empty confident sentence.
 */
export function detectedSummary(detected: DetectedArtwork | null): string | null {
  if (!detected) return null;

  const parts: string[] = [];
  if (detected.pageSize) {
    // Orientation only where it distinguishes something. "A4 square" is not a
    // thing, and saying "A4 portrait" for every upright page is noise.
    parts.push(
      detected.orientation === "landscape" ? `${detected.pageSize} landscape` : detected.pageSize,
    );
  } else if (detected.widthMilli && detected.heightMilli) {
    parts.push(`${mm(detected.widthMilli)} × ${mm(detected.heightMilli)} mm`);
  } else if (detected.pixelWidth && detected.pixelHeight) {
    // Pixels are the honest answer when no density was declared, and saying so
    // is what stops a client assuming GRIDGO knows the printed size.
    parts.push(`${detected.pixelWidth} × ${detected.pixelHeight} pixels`);
  }

  if (detected.pageCount && detected.pageCount > 1) {
    parts.push(`${detected.pageCount} pages`);
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * The proportions to judge a size mismatch against.
 *
 * Physical size first: it is what gets printed. Pixels are the fallback, and
 * for a ratio they are just as good — a 2:3 image is 2:3 at any density.
 */
export function detectedProportions(
  detected: DetectedArtwork | null,
): { width: number; height: number } | null {
  if (!detected) return null;
  if (detected.widthMilli && detected.heightMilli) {
    return { width: detected.widthMilli, height: detected.heightMilli };
  }
  if (detected.pixelWidth && detected.pixelHeight) {
    return { width: detected.pixelWidth, height: detected.pixelHeight };
  }
  return null;
}

/**
 * How many pages a per-page listing should start at.
 *
 * A ten-page PDF priced by the page is ten, and making the client count their
 * own document is the exact work the upload already did. Only a PDF answers:
 * an image is one page and does not need saying, and a file that would not
 * state a count leaves the stepper where it was.
 */
export function detectedPageQuantity(detected: DetectedArtwork | null): number | null {
  if (detected?.kind !== "pdf") return null;
  const pages = detected.pageCount;
  return pages && pages > 0 ? pages : null;
}


/**
 * The offer to take the page count from the file itself.
 *
 * A document priced by the page is billed pages times copies, and those are
 * two different numbers — a client who left the page count at one is about to
 * buy a tenth of their own document. GRIDGO knows the real figure by the time
 * the file lands, so it says so.
 *
 * An offer rather than a rewrite: somebody may deliberately want two pages of
 * a ten-page file, and a number that changes itself is a total nobody chose.
 *
 * Null when there is nothing to offer — another pricing unit, no page count,
 * or a page count the line already carries.
 */
export function pageCountOffer(
  detected: DetectedArtwork | null,
  pricingUnit: string | null | undefined,
  currentPages: number | null | undefined,
): { pages: number; message: string } | null {
  if (pricingUnit !== "per_page") return null;
  const pages = detectedPageQuantity(detected);
  if (!pages || pages === currentPages) return null;
  const has = currentPages
    ? `This order is set to ${currentPages} ${currentPages === 1 ? "page" : "pages"}.`
    : "This order has no page count yet.";
  return { pages, message: `Your file has ${pages} pages. ${has}` };
}
