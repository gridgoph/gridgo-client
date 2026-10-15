import { ApiError, type StoredFile } from "@/lib/api";
import {
  artworkPreviewFailure,
  artworkPreviewPlan,
  isWordPreviewRefusal,
  PREVIEW_BUSY_WAIT_MS,
  PREVIEW_COOLDOWN_MS,
  previewPageLine,
} from "@/lib/artworkPreview";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PATHS = { downloadUrlPath: "/files/f/preview-url", retryPath: "/files/f/preview" };

function file(detectedContentType: string, preview?: StoredFile["preview"], originalFilename = "art"): Pick<StoredFile, "detectedContentType" | "originalFilename" | "preview"> {
  return { detectedContentType, originalFilename, preview };
}

describe("artworkPreviewPlan", () => {
  it("reads a PDF through its preview whatever the render status, pending included", () => {
    for (const status of ["pending", "ready", "failed"]) {
      expect(artworkPreviewPlan(file("application/pdf", { status, ...PATHS }))).toBe("preview");
    }
  });

  it("reads an image artwork through its preview too, so Retry has a route", () => {
    expect(artworkPreviewPlan(file("image/png", { status: "ready", ...PATHS }))).toBe("preview");
  });

  it("never draws a Word file, with or without the API's reason", () => {
    expect(artworkPreviewPlan(file(DOCX, { status: "unsupported", error: "preview_word_not_available", ...PATHS }))).toBe("word");
    expect(artworkPreviewPlan(file(DOCX))).toBe("word");
  });

  it("falls back to the original image, or the file's name, on an API without previews", () => {
    expect(artworkPreviewPlan(file("image/jpeg"))).toBe("original");
    expect(artworkPreviewPlan(file("application/pdf"))).toBe("document");
    expect(artworkPreviewPlan(file("image/vnd.adobe.photoshop", { status: "unsupported", ...PATHS }))).toBe("document");
  });
});

describe("artworkPreviewFailure", () => {
  it("holds Retry for the API's busy and cooldown answers", () => {
    expect(artworkPreviewFailure(new ApiError(503, { error: "preview_busy" })).retryAfterMs).toBe(PREVIEW_BUSY_WAIT_MS);
    const cooldown = artworkPreviewFailure(new ApiError(429, { error: "preview_rasterization_failed" }));
    expect(cooldown.retryAfterMs).toBe(PREVIEW_COOLDOWN_MS);
    expect(cooldown.message).toMatch(/password-protected or damaged/);
    expect(cooldown.message).toMatch(/30 seconds/);
  });

  it("says why a render failed, and never shows a code", () => {
    const timeout = artworkPreviewFailure(new ApiError(503, { error: "preview_render_timeout" }));
    expect(timeout.message).toMatch(/took too long/);
    expect(timeout.message).not.toMatch(/preview_/);
    expect(artworkPreviewFailure(new ApiError(500, { error: "storage_object_missing" })).message).toMatch(/did not load/);
  });

  it("treats a dropped connection and a device-side decode failure as retryable at once", () => {
    expect(artworkPreviewFailure(new TypeError("Network request failed"))).toEqual(expect.objectContaining({ code: "network", retryAfterMs: 0 }));
    expect(artworkPreviewFailure("image_load_failed").message).toMatch(/did not load on this phone/);
  });
});

it("recognises the Word refusal so it is drawn as a notice, not an error", () => {
  expect(isWordPreviewRefusal(new ApiError(422, { error: "preview_word_not_available" }))).toBe(true);
  expect(isWordPreviewRefusal(new ApiError(422, { error: "preview_not_supported" }))).toBe(false);
});

it("names the page shown only when there is more than one", () => {
  expect(previewPageLine({ detected: { pageCount: 4 } as StoredFile["detected"] })).toBe("Page 1 of 4 shown");
  expect(previewPageLine({ detected: { pageCount: 1 } as StoredFile["detected"] })).toBeNull();
  expect(previewPageLine({})).toBe("First page shown");
});
