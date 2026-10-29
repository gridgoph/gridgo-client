import type { SavedFile, SavedFilesPage } from "@/lib/api";

/** One saved file as `GET /me/files` lists it (gridgo-api `docs/STORAGE_API.md`). */
export function savedFile(overrides: Partial<SavedFile> = {}): SavedFile {
  const fileId = overrides.fileId ?? "file_banner";
  return {
    fileId,
    purpose: "artwork",
    originalFilename: "opening-banner.png",
    size: 48_231,
    detectedContentType: "image/png",
    savedAt: "2026-10-29T10:15:31.000Z",
    preview: { status: "ready", downloadUrlPath: `/files/${fileId}/preview-url`, retryPath: `/files/${fileId}/preview` },
    previewUrl: `https://storage.test/${fileId}?sig=preview`,
    downloadUrl: `https://storage.test/${fileId}?sig=original`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function savedFilesPage(files: SavedFile[], overrides: Partial<SavedFilesPage> = {}): SavedFilesPage {
  return {
    files,
    usage: { usedBytes: files.reduce((sum, file) => sum + file.size, 0), limitBytes: 500_000_000 },
    nextOffset: null,
    ...overrides,
  };
}

/** The `409 saved_files_limit_reached` body, with GRIDGO's own numbers. */
export const LIMIT_REACHED_BODY = {
  error: "saved_files_limit_reached",
  message: "My files storage is full. Delete saved files or turn off Save to My files, then try again.",
  limitBytes: 500_000_000,
  usedBytes: 490_000_000,
  fileSizeBytes: 20_000_000,
};
