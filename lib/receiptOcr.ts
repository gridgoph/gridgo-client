/**
 * Pull a wallet reference out of receipt OCR text.
 *
 * GRIDGO matches GCash / Maya / InstaPay transfers by the reference printed
 * on the screenshot. Dates, amounts and the "Ref. No." label itself are not
 * that number. An empty or weak read returns null — never a guessed value.
 */

import { MAX_REFERENCE_LENGTH, MIN_REFERENCE_LENGTH } from "@/lib/payment";

export const OCR_UNREADABLE = "The number could not be read. Type it.";
export const OCR_READING = "Reading the reference from your screenshot…";

/** Overall Tesseract confidence below this, with a short unlabeled token, is discarded. */
export const OCR_LOW_CONFIDENCE = 25;

const LABEL =
  /(?:instapay\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?/i;

const LABELED_CAPTURE =
  /(?:instapay\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?[:.\s-]*([A-Z0-9][A-Z0-9 \-]{6,})/i;

const TOKEN = /[A-Z0-9][A-Z0-9 \-]{6,31}/gi;

const MONTH =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;

const WALLET_WORD = /^(GCASH|MAYA|INSTAPAY|REFERENCE|NUMBER|PHP|PHPESO)$/;

export function stripReferenceToken(raw: string): string {
  return raw.replace(/[\s\-]/g, "").toUpperCase();
}

export function looksLikeDate(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return true;
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(text)) return true;
  if (MONTH.test(text)) return true;
  if (/^\d{8}$/.test(stripReferenceToken(text))) return true;
  return false;
}

export function looksLikeAmount(raw: string): boolean {
  const text = raw.trim();
  if (/(?:₱|php)\s*\d/i.test(text)) return true;
  if (/\d{1,3}(?:,\d{3})+\.\d{2}/.test(text)) return true;
  if (/^\d+\.\d{2}$/.test(text)) return true;
  return false;
}

function isCandidate(token: string): boolean {
  if (token.length < Math.max(8, MIN_REFERENCE_LENGTH)) return false;
  if (token.length > MAX_REFERENCE_LENGTH) return false;
  if (!/[0-9]/.test(token)) return false;
  if (WALLET_WORD.test(token)) return false;
  if (/^0?9\d{9}$/.test(token)) return false;
  if (/^\d{8}$/.test(token)) return false;
  return true;
}

function accept(raw: string): string | null {
  if (looksLikeDate(raw) || looksLikeAmount(raw)) return null;
  const token = stripReferenceToken(raw);
  return isCandidate(token) ? token : null;
}

/**
 * The reference Operations can match, or null when the text does not contain
 * one we can trust. Never invents a number from leftover digits.
 */
export function extractPaymentReference(text: string): string | null {
  const source = text.replace(/\u00a0/g, " ").trim();
  if (!source) return null;

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (looksLikeDate(line) || looksLikeAmount(line)) continue;

    const labeled = line.match(LABELED_CAPTURE);
    if (labeled?.[1]) {
      const hit = accept(labeled[1]);
      if (hit) return hit;
    }

    if (LABEL.test(line)) {
      const rest = line.replace(LABEL, "").replace(/^[:.\s-]+/, "");
      const fromRest = rest ? accept(rest) : null;
      if (fromRest) return fromRest;
      const next = lines[i + 1];
      if (next) {
        const fromNext = accept(next);
        if (fromNext) return fromNext;
      }
    }
  }

  const unlabeled: string[] = [];
  for (const match of source.match(TOKEN) ?? []) {
    const hit = accept(match);
    if (hit) unlabeled.push(hit);
  }
  if (unlabeled.length === 0) return null;

  const gcash = unlabeled.find((token) => /^\d{13}$/.test(token));
  if (gcash) return gcash;

  unlabeled.sort((a, b) => b.length - a.length);
  const best = unlabeled[0];
  // Unlabeled short runs are how OCR invents a "reference" from a date or a
  // phone. Demand a wallet-length token when there was no label.
  return best.length >= 10 ? best : null;
}

export function referenceFromOcr(result: {
  text: string;
  confidence: number;
} | null): string | null {
  if (!result) return null;
  const extracted = extractPaymentReference(result.text);
  if (!extracted) return null;
  if (result.confidence < OCR_LOW_CONFIDENCE && extracted.length < 12) return null;
  return extracted;
}

export type ReceiptOcrStatus = "idle" | "reading" | "filled" | "unreadable";

export type ReceiptOcrState = {
  status: ReceiptOcrStatus;
  reference: string | null;
};

export const OCR_IDLE: ReceiptOcrState = { status: "idle", reference: null };

/** What the Payment reference field should show after an OCR result. */
export function nextReferenceFromOcr(current: string, ocr: ReceiptOcrState): string {
  if (ocr.status === "filled" && ocr.reference) return ocr.reference;
  if (ocr.status === "unreadable") return "";
  return current;
}
