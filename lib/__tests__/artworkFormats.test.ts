import type { AcceptedFormat } from "@/lib/api";
import {
  acceptedFormatNames,
  formatRefusal,
  showsWordToPdfSteps,
  uploadSizeLine,
  wordFormatNote,
} from "@/lib/artworkFormats";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const format = (code: string, displayName: string, extensions: string[], mimeTypes: string[]): AcceptedFormat => ({
  code, displayName, inputKind: "file", extensions, mimeTypes, active: true,
});
const PDF = format("pdf", "PDF", ["pdf"], ["application/pdf"]);
const WORD = format("docx", "Word document", ["docx"], [DOCX]);
const JPEG = format("jpeg", "JPEG", ["jpg", "jpeg"], ["image/jpeg"]);
const PNG = format("png", "PNG", ["png"], ["image/png"]);

describe("the accepted list", () => {
  it("names each type once, in the shop's order", () => {
    expect(acceptedFormatNames([JPEG, PDF, PNG, JPEG])).toEqual(["JPEG", "PDF", "PNG"]);
  });

  it("states Word's own, smaller limit only where Word is taken", () => {
    expect(uploadSizeLine([JPEG, PDF])).toBe("Up to 200 MB.");
    expect(uploadSizeLine([PDF, WORD])).toBe("Up to 200 MB. Word documents up to 16 MB.");
    expect(uploadSizeLine([WORD])).toBe("Up to 16 MB.");
    expect(uploadSizeLine([])).toBe("");
  });
});

describe("the Word note before the picker", () => {
  it("tells a PDF product's client to save a Word file as PDF first", () => {
    expect(wordFormatNote("Flyers", [JPEG, PDF, PNG])).toBe(
      "Flyers does not take Word files. Save your document as a PDF first, then choose the PDF.",
    );
  });

  it("says a Word file is printed as sent, never converted, where Word is taken", () => {
    expect(wordFormatNote("Document printing", [PDF, WORD])).toBe(
      "Word documents are printed as you send them, not converted to PDF. GRIDGO checks every file before it prints.",
    );
  });

  it("stays quiet on an image-only product", () => {
    expect(wordFormatNote("Mugs", [JPEG, PNG])).toBeNull();
    expect(wordFormatNote("Mugs", [])).toBeNull();
  });
});

describe("a refused file", () => {
  it("explains a Word file on a PDF product and how to fix it", () => {
    expect(formatRefusal({ productName: "Flyers", fileName: "thesis.docx", formats: [JPEG, PDF, PNG] })).toBe(
      "Flyers does not take Word files. It takes JPEG, PDF or PNG. Save thesis.docx as a PDF, then choose the PDF.",
    );
    expect(showsWordToPdfSteps([JPEG, PDF, PNG], "thesis.docx")).toBe(true);
  });

  it("knows a Word file by the picker's type when the name does not say", () => {
    expect(showsWordToPdfSteps([PDF], "thesis", DOCX)).toBe(true);
  });

  it("names the design link as the other way in", () => {
    expect(
      formatRefusal({ productName: "Flyers", fileName: "a.docx", formats: [PDF], links: "a Canva link" }),
    ).toBe("Flyers does not take Word files. It takes PDF, or a Canva link in the Design link field. Save a.docx as a PDF, then choose the PDF.");
  });

  it("asks for an export on a product that takes neither Word nor PDF", () => {
    expect(formatRefusal({ productName: "Mugs", fileName: "mug.docx", formats: [JPEG, PNG] })).toBe(
      "Mugs does not take Word files. It takes JPEG or PNG. Export your design as one of those, then choose it again.",
    );
    expect(showsWordToPdfSteps([JPEG, PNG], "mug.docx")).toBe(false);
  });

  it("explains an old .doc file even where Word is taken", () => {
    expect(formatRefusal({ productName: "Document printing", fileName: "old.doc", formats: [PDF, WORD] })).toBe(
      "old.doc is an older Word file (.doc), which GRIDGO cannot open. In Word, save it again as a Word document (.docx) or as a PDF, then choose the new file.",
    );
    expect(showsWordToPdfSteps([PDF, WORD], "old.doc")).toBe(true);
  });

  it("keeps the plain wording for any other type", () => {
    expect(formatRefusal({ productName: "Flyers", fileName: "art.psd", formats: [PDF] })).toBe(
      "Flyers takes PDF. art.psd is none of those — export it and pick it again.",
    );
    expect(showsWordToPdfSteps([PDF], "art.psd")).toBe(false);
  });
});
