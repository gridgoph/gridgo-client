import {
  detectedPageQuantity,
  isWordDocument,
  needsManualPageTotal,
} from "@/lib/artworkUpload";
import { pageTotalError } from "@/lib/documentPages";
import { fileMatchesFormats, pickerMimeTypes, uploadLimitLine } from "@/lib/listing";
import { describeArtwork } from "@/lib/orderArtwork";
import { describeArtworkFile } from "@/lib/requestValidation";
import type { AcceptedFormat, StoredFile } from "@/lib/api";

import {
  DOCUMENT_ITEM,
  DOCX_FORMAT,
  DOCX_TYPE,
  PDF_FORMAT,
  docxDetected,
  pdfDetected,
} from "../../test/artworkPagesFixtures";

const JPEG_FORMAT: AcceptedFormat = {
  code: "jpeg", displayName: "JPEG", inputKind: "file", extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg"], active: true,
};
const PNG_FORMAT: AcceptedFormat = {
  code: "png", displayName: "PNG", inputKind: "file", extensions: ["png"], mimeTypes: ["image/png"], active: true,
};

const documents = { ...DOCUMENT_ITEM, acceptedFormats: [PDF_FORMAT, DOCX_FORMAT] };
const flyers = { ...DOCUMENT_ITEM, acceptedFormats: [JPEG_FORMAT, PDF_FORMAT, PNG_FORMAT] };

describe("a PDF and Word listing's picker", () => {
  it("offers PDF and Word, and no image type", () => {
    expect(pickerMimeTypes(documents)).toEqual(["application/pdf", DOCX_TYPE]);
  });

  it("takes a .docx and turns a photo down", () => {
    expect(fileMatchesFormats(documents, "thesis.docx", null)).toBe(true);
    expect(fileMatchesFormats(documents, "THESIS.DOCX", "application/octet-stream")).toBe(true);
    expect(fileMatchesFormats(documents, "upload", DOCX_TYPE)).toBe(true);
    expect(fileMatchesFormats(documents, "photo.jpg", "image/jpeg")).toBe(false);
    expect(fileMatchesFormats(documents, "notes.doc", "application/msword")).toBe(false);
  });

  it("leaves a PDF and image listing exactly as it was", () => {
    expect(pickerMimeTypes(flyers)).toEqual(["image/jpeg", "application/pdf", "image/png"]);
    expect(fileMatchesFormats(flyers, "thesis.docx", DOCX_TYPE)).toBe(false);
    expect(fileMatchesFormats(flyers, "poster.pdf", "application/pdf")).toBe(true);
  });
});

describe("uploadLimitLine", () => {
  it("names Word's own limit beside a PDF's", () => {
    expect(uploadLimitLine([PDF_FORMAT, DOCX_FORMAT])).toBe(
      "PDF or Word document, up to 200 MB (Word documents up to 16 MB)",
    );
  });

  it("uses Word's limit alone when Word is all a listing takes", () => {
    expect(uploadLimitLine([DOCX_FORMAT])).toBe("Word document, up to 16 MB");
  });

  it("says nothing about Word where a listing does not take it", () => {
    expect(uploadLimitLine([JPEG_FORMAT, PDF_FORMAT, PNG_FORMAT])).toBe("JPEG, PDF or PNG, up to 200 MB");
  });
});

describe("Word document pages", () => {
  it("knows a Word file by its detected type, or by its name before GRIDGO answers", () => {
    expect(isWordDocument(DOCX_TYPE)).toBe(true);
    expect(isWordDocument(null, "thesis.docx")).toBe(true);
    expect(isWordDocument("application/pdf", "thesis.docx")).toBe(false);
    expect(isWordDocument("application/pdf")).toBe(false);
  });

  it("takes a counted Word file's pages like a PDF's", () => {
    expect(detectedPageQuantity(docxDetected(12))).toBe(12);
    expect(detectedPageQuantity(docxDetected(null))).toBeNull();
  });

  it("asks for a total only for a per-page Word file that came without one", () => {
    expect(needsManualPageTotal(docxDetected(null), DOCX_TYPE, "per_page")).toBe(true);
    expect(needsManualPageTotal(docxDetected(12), DOCX_TYPE, "per_page")).toBe(false);
    expect(needsManualPageTotal(docxDetected(null), DOCX_TYPE, "per_unit")).toBe(false);
  });

  it("never asks a PDF for its total, counted or not", () => {
    expect(needsManualPageTotal(pdfDetected({ pageCount: null }), "application/pdf", "per_page")).toBe(false);
    expect(needsManualPageTotal(pdfDetected(), "application/pdf", "per_page")).toBe(false);
  });

  it("accepts a whole number of pages from 1", () => {
    expect(pageTotalError("12")).toBeNull();
    expect(pageTotalError(" 3 ")).toBeNull();
    expect(pageTotalError("")).toMatch(/how many pages/);
    expect(pageTotalError("0")).toMatch(/whole number/);
    expect(pageTotalError("2.5")).toMatch(/whole number/);
    expect(pageTotalError("-4")).toMatch(/whole number/);
  });
});

describe("describing a Word file", () => {
  it("names it as a Word document", () => {
    const file = { detectedContentType: DOCX_TYPE, size: 40_960 } as StoredFile;
    expect(describeArtwork(file)).toBe("Word document · 40 KB");
  });

  it("does not call a small Word file thin, while a small PDF still is", () => {
    const word = describeArtworkFile({ originalFilename: "thesis.docx", detectedContentType: DOCX_TYPE, size: 40_960 });
    expect(word.find((fact) => fact.id === "format")?.value).toBe("Word document");
    expect(word.find((fact) => fact.id === "size")?.tone).toBe("neutral");
    const pdf = describeArtworkFile({ originalFilename: "thesis.pdf", detectedContentType: "application/pdf", size: 40_960 });
    expect(pdf.find((fact) => fact.id === "size")?.tone).toBe("warn");
  });
});
