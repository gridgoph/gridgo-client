import { ApiError, type CatalogItem } from "@/lib/api";
import {
  canSaveToMyFiles,
  deleteSavedErrorMessage,
  formatStorage,
  limitReachedMessage,
  listingTakes,
  reuseRefusal,
  saveChoiceErrorMessage,
  savedDateLine,
  savedFileType,
  unavailableLine,
  usageFraction,
  usageLine,
  usageNearlyFull,
  usageRoomLine,
} from "@/lib/myFiles";

import { DOCUMENT_ITEM } from "../../test/artworkPagesFixtures";
import { SHIRT_ITEM, storedFile } from "../../test/artworkAttachmentFixtures";
import { LIMIT_REACHED_BODY, savedFile } from "../../test/myFilesFixtures";

describe("formatStorage", () => {
  it("counts in the decimal units storage is sold in", () => {
    expect(formatStorage(500_000_000)).toBe("500 MB");
    expect(formatStorage(48_231)).toBe("48 KB");
    expect(formatStorage(2_500_000)).toBe("2.5 MB");
    expect(formatStorage(20_000_000)).toBe("20 MB");
    expect(formatStorage(1_000_000_000)).toBe("1 GB");
    expect(formatStorage(512)).toBe("512 B");
  });
});

describe("usage", () => {
  const usage = { usedBytes: 48_231, limitBytes: 500_000_000 };

  it("says how much is used of the limit, and what is left", () => {
    expect(usageLine(usage)).toBe("48 KB of 500 MB used");
    expect(usageRoomLine(usage)).toBe("500 MB left. Deleting saved files frees space.");
    expect(usageNearlyFull(usage)).toBe(false);
  });

  it("warns before it is full and says what frees space once it is", () => {
    expect(usageNearlyFull({ usedBytes: 460_000_000, limitBytes: 500_000_000 })).toBe(true);
    expect(usageRoomLine({ usedBytes: 500_000_000, limitBytes: 500_000_000 })).toMatch(/full.*Delete saved files/);
    expect(usageFraction({ usedBytes: 600, limitBytes: 500 })).toBe(1);
  });

  it("treats a zero limit as saving switched off, never as a division", () => {
    expect(usageFraction({ usedBytes: 0, limitBytes: 0 })).toBe(0);
    expect(usageRoomLine({ usedBytes: 0, limitBytes: 0 })).toMatch(/switched off/);
  });
});

describe("the storage limit", () => {
  it("says how much is used, how big the file is, and that deleting frees space", () => {
    expect(limitReachedMessage(LIMIT_REACHED_BODY)).toBe(
      "My files is full: you have used 490 MB of 500 MB, and this file needs 20 MB. Delete saved files you no longer need to free space, then tick it again.",
    );
  });

  it("maps the 409 through the save-choice error", () => {
    const error = new ApiError(409, LIMIT_REACHED_BODY);
    expect(saveChoiceErrorMessage(error, true)).toMatch(/^My files is full: you have used 490 MB of 500 MB/);
  });

  it("still makes sense without the numbers", () => {
    expect(limitReachedMessage({})).toBe(
      "My files is full. Delete saved files you no longer need to free space, then tick it again.",
    );
  });
});

describe("refusals", () => {
  it("words each delete refusal with what to do", () => {
    expect(deleteSavedErrorMessage(new ApiError(409, { error: "file_in_use" }))).toMatch(/basket.*not finished/);
    expect(deleteSavedErrorMessage(new ApiError(409, { error: "file_retention_hold" }))).toMatch(/still open/);
  });

  it("says a failed untick left the file saved", () => {
    expect(saveChoiceErrorMessage(new ApiError(500, { error: "internal_error" }), false)).toMatch(/still in My files/);
  });
});

describe("canSaveToMyFiles", () => {
  it("offers the tick only on the client's own ready artwork on an API with My files", () => {
    expect(canSaveToMyFiles(storedFile("file_a", "a.png", { savedAt: null }))).toBe(true);
    expect(canSaveToMyFiles(storedFile("file_a", "a.png"))).toBe(false);
    expect(canSaveToMyFiles(storedFile("file_a", "a.png", { savedAt: null, state: "deleted" }))).toBe(false);
    expect(canSaveToMyFiles(null)).toBe(false);
  });
});

describe("describing a saved file", () => {
  it("names the type, the date and why one cannot open", () => {
    expect(savedFileType(savedFile())).toBe("PNG image");
    expect(savedFileType(savedFile({ detectedContentType: "image/jpeg" }))).toBe("JPG image");
    expect(savedFileType(savedFile({ detectedContentType: "application/pdf" }))).toBe("PDF");
    expect(savedDateLine("2026-10-29T10:15:31.000Z")).toBe("Saved 29 Oct 2026");
    expect(unavailableLine(savedFile())).toBeNull();
    expect(unavailableLine(savedFile({ unavailable: true, error: "minio_unavailable" }))).toMatch(/still saved/);
  });
});

describe("reuse", () => {
  const pngOnly: CatalogItem = SHIRT_ITEM;

  it("allows artwork the listing takes and explains everything else", () => {
    expect(reuseRefusal(savedFile(), pngOnly)).toBeNull();
    expect(reuseRefusal(savedFile({ originalFilename: "a.psd", detectedContentType: "image/vnd.adobe.photoshop" }), pngOnly))
      .toBe("T-shirts does not take this kind of file.");
    expect(reuseRefusal(savedFile({ purpose: "mockup" }), null)).toMatch(/mockup cannot be used/);
    expect(reuseRefusal(savedFile({ unavailable: true }), null)).toMatch(/cannot be opened/);
  });

  it("lets a listing that names no file types take any file", () => {
    expect(listingTakes({ ...DOCUMENT_ITEM, acceptedFormats: [] }, "a.psd", "image/vnd.adobe.photoshop")).toBe(true);
  });
});
