import { ApiError } from "@/lib/api";
import {
  artworkChip,
  artworkErrorMessage,
  artworkStatusLine,
  EMPTY_ARTWORK,
  isArtworkBusy,
  normalizeFileName,
  type ArtworkUploadState,
} from "@/lib/artworkUpload";

function state(patch: Partial<ArtworkUploadState>): ArtworkUploadState {
  return { ...EMPTY_ARTWORK, ...patch };
}

describe("artworkStatusLine", () => {
  it("does not call a finished transfer a finished upload", () => {
    const sending = artworkStatusLine(state({ phase: "sending", progress: 1 }));
    const saving = artworkStatusLine(state({ phase: "saving" }));
    expect(sending).toMatch(/sending/i);
    expect(saving).toMatch(/still saving/i);
    expect(saving).not.toMatch(/uploaded|done|complete/i);
  });

  it("distinguishes stored on the server from attached to the job", () => {
    expect(artworkStatusLine(state({ phase: "stored" }))).toMatch(/saved on the server/i);
    expect(artworkStatusLine(state({ phase: "attached" }))).toMatch(/attached to this job/i);
  });

  it("shows the failure reason rather than a generic line", () => {
    expect(
      artworkStatusLine(state({ phase: "failed", error: "The connection dropped." })),
    ).toBe("The connection dropped.");
  });
});

describe("artworkChip", () => {
  it("only claims success once the server has the file", () => {
    expect(artworkChip(state({ phase: "sending" })).tone).toBe("info");
    expect(artworkChip(state({ phase: "saving" })).tone).toBe("info");
    expect(artworkChip(state({ phase: "stored" })).tone).toBe("success");
  });

  it("pairs every tone with an icon and a label", () => {
    for (const phase of ["empty", "sending", "saving", "stored", "attaching", "attached", "failed"] as const) {
      const chip = artworkChip(state({ phase }));
      expect(chip.label.length).toBeGreaterThan(0);
      expect(chip.icon.length).toBeGreaterThan(0);
    }
  });
});

describe("isArtworkBusy", () => {
  it("is true only while something is in flight", () => {
    expect(isArtworkBusy(state({ phase: "sending" }))).toBe(true);
    expect(isArtworkBusy(state({ phase: "saving" }))).toBe(true);
    expect(isArtworkBusy(state({ phase: "attaching" }))).toBe(true);
    expect(isArtworkBusy(state({ phase: "stored" }))).toBe(false);
    expect(isArtworkBusy(state({ phase: "failed" }))).toBe(false);
  });
});

describe("artworkErrorMessage", () => {
  const cases: [string, number, RegExp][] = [
    ["heic_not_supported", 415, /Most Compatible|JPEG/],
    ["file_too_large", 413, /under 200 MB/],
    ["file_type_mismatch", 415, /JPEG, PNG, WebP or PDF/],
    ["minio_unavailable", 503, /storage is offline/i],
    ["file_empty", 400, /empty/i],
  ];

  it.each(cases)("maps %s to a fix, not a code", (code, status, expected) => {
    const message = artworkErrorMessage(new ApiError(status, { error: code }));
    expect(message).toMatch(expected);
    expect(message).not.toContain(code);
  });

  it("keeps the size limit from the response when the server sends one", () => {
    const message = artworkErrorMessage(
      new ApiError(413, { error: "file_too_large", maxMiB: 20 }),
    );
    expect(message).toContain("20 MB");
  });

  it("explains a dropped connection as a retry, not a failure", () => {
    const message = artworkErrorMessage(new Error("Network request failed"));
    expect(message).toMatch(/connection dropped/i);
  });

  it("never leaks an unmapped snake_case code", () => {
    const message = artworkErrorMessage(new ApiError(400, { error: "some_new_code" }));
    expect(message).not.toContain("some_new_code");
    expect(message).toMatch(/try again/i);
  });
});

describe("normalizeFileName", () => {
  it("covers a picker that returned no name", () => {
    expect(normalizeFileName(null)).toBe("artwork");
    expect(normalizeFileName("  ")).toBe("artwork");
    expect(normalizeFileName(" banner.pdf ")).toBe("banner.pdf");
  });
});
