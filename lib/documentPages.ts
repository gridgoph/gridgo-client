import type { DocumentPages } from "@/lib/api";

/** Validate a draft without expanding large ranges into individual pages. */
export function pageRangeError(text: string, total: number): string | null {
  if (!text.trim()) return null;
  if (text.length > 1000) return "Use a shorter page range.";
  for (const part of text.split(",")) {
    const match = /^\s*([1-9]\d*)\s*(?:-\s*([1-9]\d*)\s*)?$/.exec(part);
    if (!match) return "Use page numbers or ranges, for example 1-4, 7.";
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(last) || first > last || last > total) {
      return `Choose pages from 1 to ${total}, with the smaller number first.`;
    }
  }
  return null;
}

export function documentPagesSummary(pages: DocumentPages): string {
  return `${pages.range ? `Pages ${pages.range}` : `All ${pages.total} pages`} · ${pages.printed} per copy`;
}

/** A typed page total for a Word file that did not say: a whole number from 1. */
export function pageTotalError(text: string): string | null {
  const value = text.trim();
  if (!value) return "Enter how many pages the file has.";
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return "Enter the number of pages as a whole number, for example 12.";
  }
  return null;
}
