import type { ArtworkAttachment } from "@/lib/api";
import {
  MAX_ARTWORK_ATTACHMENTS,
  NO_LIST_ON_THIS_API,
  attachmentCountLabel,
  attachmentInput,
  attachmentKey,
  attachmentLimitLine,
  attachmentsBody,
  cleanLabel,
  lineAttachments,
  mainFileId,
  moveAttachment,
  overflowNote,
  relabelAttachment,
  sameAttachments,
  slotsLeft,
  withoutAttachment,
} from "@/lib/artworkAttachments";
import { artworkSignature, lineArtworkLinks, lineArtworkSummary, lineHasArtwork } from "@/lib/designLink";

const FRONT: ArtworkAttachment = { kind: "file", fileId: "file_front", label: "Front" };
const BACK: ArtworkAttachment = { kind: "file", fileId: "file_back", label: "Back" };
const LOGO: ArtworkAttachment = {
  kind: "link",
  formatCode: "canva_link",
  url: "https://www.canva.com/design/ABC/view",
  label: "Logo design",
};

describe("lineAttachments", () => {
  it("reads the ordered list where GRIDGO sends one", () => {
    expect(lineAttachments({ artworkFileId: "file_front", artworkLinks: [], artworkAttachments: [BACK, FRONT] })).toEqual([
      BACK,
      FRONT,
    ]);
  });

  // The projection gridgo-api itself makes of an older line.
  it("reads an older line as its file, then its links", () => {
    expect(
      lineAttachments({
        artworkFileId: "file_front",
        artworkLinks: [{ formatCode: "canva_link", url: LOGO.url }],
      }),
    ).toEqual([
      { kind: "file", fileId: "file_front" },
      { kind: "link", formatCode: "canva_link", url: LOGO.url },
    ]);
    expect(lineAttachments(null)).toEqual([]);
  });

  it("names the first file as the main one, wherever the links sit", () => {
    expect(mainFileId([LOGO, BACK, FRONT])).toBe("file_back");
    expect(mainFileId([LOGO])).toBeNull();
  });
});

describe("a write", () => {
  it("sends the whole list in order, without the signed download links", () => {
    const signed: ArtworkAttachment = { ...FRONT, downloadUrl: "https://minio/x", downloadUrlExpiresAt: "2026-10-15T00:00:00Z" };
    expect(attachmentsBody({ artworkAttachments: [] }, [signed, LOGO])).toEqual({
      artworkAttachments: [
        { kind: "file", fileId: "file_front", label: "Front" },
        { kind: "link", formatCode: "canva_link", url: LOGO.url, label: "Logo design" },
      ],
    });
  });

  it("files one file and its links in the old fields on a GRIDGO from before the list", () => {
    expect(attachmentsBody({ artworkFileId: null, artworkLinks: [] }, [{ kind: "file", fileId: "f" }, LOGO])).toEqual({
      artworkFileId: "f",
      artworkLinks: [{ formatCode: "canva_link", url: LOGO.url }],
    });
    expect(attachmentsBody({ artworkFileId: "f" }, [])).toEqual({ artworkFileId: null, artworkLinks: [] });
  });

  it("refuses what the old fields cannot hold rather than losing a file", () => {
    expect(attachmentsBody({ artworkFileId: "f" }, [FRONT, BACK])).toBeNull();
    expect(attachmentsBody({ artworkFileId: "f" }, [LOGO, FRONT])).toBeNull();
    expect(NO_LIST_ON_THIS_API).toMatch(/only one file/);
  });

  it("keeps labels to one trimmed line of at most 80 characters", () => {
    expect(cleanLabel("  Logo\nPDF  ")).toBe("Logo PDF");
    expect(cleanLabel("   ")).toBeUndefined();
    expect(cleanLabel("x".repeat(90))).toHaveLength(80);
    expect(attachmentInput({ kind: "file", fileId: "f", label: " " })).toEqual({ kind: "file", fileId: "f" });
  });
});

describe("changing the list", () => {
  const list = [FRONT, BACK, LOGO];

  it("moves one entry up or down, and stays put at either end", () => {
    expect(moveAttachment(list, 2, 1)).toEqual([FRONT, LOGO, BACK]);
    expect(moveAttachment(list, 0, -1)).toBe(list);
    expect(moveAttachment(list, 2, 3)).toBe(list);
  });

  it("removes and relabels by the entry, not by its place", () => {
    expect(withoutAttachment(list, attachmentKey(BACK))).toEqual([FRONT, LOGO]);
    expect(relabelAttachment(list, attachmentKey(LOGO), "Sleeve")[2]).toEqual({ ...LOGO, label: "Sleeve" });
    expect(relabelAttachment(list, attachmentKey(FRONT), "")[0]).toEqual({ kind: "file", fileId: "file_front" });
  });

  it("treats a change of label or order as a change", () => {
    expect(sameAttachments(list, [FRONT, BACK, LOGO])).toBe(true);
    expect(sameAttachments(list, [BACK, FRONT, LOGO])).toBe(false);
    expect(sameAttachments(list, [{ ...FRONT, label: "Face" }, BACK, LOGO])).toBe(false);
  });
});

describe("the limit, said on screen", () => {
  it("counts files and links together towards ten", () => {
    expect(MAX_ARTWORK_ATTACHMENTS).toBe(10);
    expect(slotsLeft(3)).toBe(7);
    expect(slotsLeft(12)).toBe(0);
    expect(attachmentLimitLine(0)).toBe("Add up to 10 files and design links to this item.");
    expect(attachmentLimitLine(9)).toBe("1 more file or link can go on this item.");
    expect(attachmentLimitLine(10)).toBe(
      "This item has 10 files and links, the most it can take. Remove one to add another.",
    );
    expect(attachmentCountLabel(4)).toBe("4 of 10 files and links used");
  });

  it("says when a pick held more files than the item has room for", () => {
    expect(overflowNote(3, 3)).toBeNull();
    expect(overflowNote(4, 2)).toBe("Only 2 more files fit on this item, so 2 were left off.");
    expect(overflowNote(2, 0)).toBe("This item already has 10 files and links. Remove one to add another.");
  });
});

describe("a basket line's artwork", () => {
  const line = { artworkFileId: "file_front", artworkLinks: [{ formatCode: "canva_link", url: LOGO.url }] };

  it("is any one file or link, and every link on it is checked", () => {
    expect(lineHasArtwork({ ...line, artworkAttachments: [LOGO] })).toBe(true);
    expect(lineHasArtwork({ artworkFileId: null, artworkLinks: [], artworkAttachments: [] })).toBe(false);
    expect(lineArtworkLinks({ ...line, artworkAttachments: [FRONT, LOGO, { ...LOGO, url: "https://www.canva.com/design/DEF/view" }] })).toHaveLength(2);
  });

  it("is summed up on the checkout row", () => {
    expect(lineArtworkSummary({ ...line, artworkAttachments: [FRONT, BACK, LOGO] })).toBe("3 files and links attached");
    expect(lineArtworkSummary({ ...line, artworkAttachments: [FRONT, BACK] })).toBe("2 artwork files attached");
    expect(lineArtworkSummary({ ...line, artworkAttachments: [FRONT, LOGO] })).toBe("Artwork and Canva link attached");
    expect(lineArtworkSummary({ ...line, artworkAttachments: [FRONT] })).toBe("Artwork attached");
  });

  it("changes signature when a secondary file changes, so an old checkout refusal clears", () => {
    expect(artworkSignature({ ...line, artworkAttachments: [FRONT, BACK] })).not.toBe(
      artworkSignature({ ...line, artworkAttachments: [FRONT] }),
    );
  });
});
