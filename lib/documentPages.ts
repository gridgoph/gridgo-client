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
