/**
 * What a listing takes as an uploaded file, said before the picker opens, and
 * what to do when the file chosen is not one of them.
 *
 * A shop chooses its own artwork types. Word files are accepted only where the
 * shop allows them (gridgo-api#198), and GRIDGO never converts one to PDF, so a
 * client holding a Word document for a PDF-only product has one fix: save it as
 * a PDF first. They should read that before they pick, and again, with the
 * steps, if they pick the Word file anyway (gridgo-client#227).
 */

import type { AcceptedFormat } from "@/lib/api";
import { ARTWORK_MAX_MIB, DOCX_CONTENT_TYPE, DOCX_MAX_MIB } from "@/lib/artworkUpload";
import { formatSentence, isWordFormat } from "@/lib/listing";

/** The format names, once each, in the shop's order: what the card lists. */
export function acceptedFormatNames(formats: AcceptedFormat[]): string[] {
  return [...new Set(formats.map((format) => format.displayName))];
}

function takesPdf(formats: AcceptedFormat[]): boolean {
  return formats.some((format) => format.code === "pdf" || format.mimeTypes.includes("application/pdf"));
}

/** "Up to 200 MB. Word documents up to 16 MB." — the limits under the list. */
export function uploadSizeLine(formats: AcceptedFormat[]): string {
  if (!formats.length) return "";
  if (!formats.some(isWordFormat)) return `Up to ${ARTWORK_MAX_MIB} MB.`;
  if (formats.every(isWordFormat)) return `Up to ${DOCX_MAX_MIB} MB.`;
  return `Up to ${ARTWORK_MAX_MIB} MB. Word documents up to ${DOCX_MAX_MIB} MB.`;
}

type WordFile = "docx" | "doc" | null;

/** A Word file by its name or the picker's type; `.doc` is the older format GRIDGO cannot read at all. */
function wordFile(fileName: string, mimeType?: string | null): WordFile {
  const name = fileName.toLowerCase();
  const mime = mimeType?.toLowerCase().split(";")[0].trim() ?? "";
  if (name.endsWith(".docx") || mime === DOCX_CONTENT_TYPE) return "docx";
  if (name.endsWith(".doc") || mime === "application/msword") return "doc";
  return null;
}

/**
 * The one line under the list about Word, or null when there is nothing to say.
 *
 * A product that takes Word says it is printed as sent: nothing converts it,
 * and GRIDGO still checks it. A product that takes PDF but not Word says so
 * before the client picks, with the fix. One that takes neither stays quiet —
 * nobody designs a mug in Word, and the refusal still explains if they try.
 */
export function wordFormatNote(productName: string, formats: AcceptedFormat[]): string | null {
  if (!formats.length) return null;
  if (formats.some(isWordFormat)) {
    return "Word documents are printed as you send them, not converted to PDF. GRIDGO checks every file before it prints.";
  }
  if (takesPdf(formats)) {
    return `${productName} does not take Word files. Save your document as a PDF first, then choose the PDF.`;
  }
  return null;
}

/** How to turn a Word document into a PDF, in the apps a client is likely to have. */
export const WORD_TO_PDF_STEPS = [
  "Open the document in Word or Google Docs.",
  "In Word, choose File › Save As and pick PDF. In Google Docs, choose File › Download › PDF.",
  "Come back here and choose the PDF.",
] as const;

/** True when the steps above are the fix for the file just refused. */
export function showsWordToPdfSteps(
  formats: AcceptedFormat[],
  fileName: string,
  mimeType?: string | null,
): boolean {
  if (!formats.length || !wordFile(fileName, mimeType) || !takesPdf(formats)) return false;
  return wordFile(fileName, mimeType) === "doc" || !formats.some(isWordFormat);
}

/**
 * Why the chosen file was refused and what to send instead, in the shop's terms.
 *
 * `links` is the design-link phrase ("a Canva link") when the listing takes one.
 */
export function formatRefusal({
  productName,
  fileName,
  mimeType,
  formats,
  links,
}: {
  productName: string;
  fileName: string;
  mimeType?: string | null;
  formats: AcceptedFormat[];
  links?: string | null;
}): string {
  const takes = `${formatSentence(formats)}${links ? `, or ${links} in the Design link field` : ""}`;
  const word = wordFile(fileName, mimeType);
  const takesWord = formats.some(isWordFormat);

  if (word === "doc" && takesWord) {
    return `${fileName} is an older Word file (.doc), which GRIDGO cannot open. ` +
      `In Word, save it again as a Word document (.docx) or as a PDF, then choose the new file.`;
  }
  if (word && !takesWord) {
    if (takesPdf(formats)) {
      return `${productName} does not take Word files. It takes ${takes}. ` +
        `Save ${fileName} as a PDF, then choose the PDF.`;
    }
    return `${productName} does not take Word files. It takes ${takes}. ` +
      `Export your design as one of those, then choose it again.`;
  }
  return `${productName} takes ${takes}. ${fileName} is none of those — export it and pick it again.`;
}
