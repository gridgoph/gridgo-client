import type {
  ArtworkAttachment,
  ArtworkAttachmentInput,
  ArtworkLink,
  CartLineRecord,
} from "@/lib/api";

/**
 * Several files and design links on one item (report C6625C57,
 * gridgo-api#243 — `docs/ORDER_MATCH_API.md` "Multiple artwork attachments").
 *
 * The list is ordered, and the order means something: the first **file** is
 * the main file — GRIDGO prices pages from it and draws the preview from the
 * first image or PDF — and the rest are references for the shop, such as a
 * separate high-resolution logo. Files and links count together towards one
 * limit per item. A label ("Front", "Logo PDF") is optional.
 *
 * Every write replaces the whole list, so a change is always made to the list
 * GRIDGO last sent back, never to a copy the screen kept.
 */

/** Files and links together, per item. The API refuses an eleventh. */
export const MAX_ARTWORK_ATTACHMENTS = 10;
export const ATTACHMENT_LABEL_MAX = 80;

type AttachmentLine = Pick<CartLineRecord, "artworkFileId" | "artworkLinks" | "artworkAttachments">;

/**
 * What GRIDGO holds for this item, in order.
 *
 * An API from before attachments sends only the primary file and the links;
 * those read as that file followed by the links, the same projection GRIDGO
 * itself makes of an older line.
 */
export function lineAttachments(line: Partial<AttachmentLine> | null | undefined): ArtworkAttachment[] {
  if (!line) return [];
  if (Array.isArray(line.artworkAttachments)) return line.artworkAttachments;
  return [
    ...(line.artworkFileId ? [{ kind: "file" as const, fileId: line.artworkFileId }] : []),
    ...(Array.isArray(line.artworkLinks) ? line.artworkLinks : []).map((link) => ({
      kind: "link" as const,
      ...link,
    })),
  ];
}

/** Whether this API keeps an ordered list at all, rather than one file and its links. */
export function keepsAttachmentList(line: Partial<AttachmentLine> | null | undefined): boolean {
  return Array.isArray(line?.artworkAttachments);
}

export function attachmentFileIds(entries: ArtworkAttachment[]): string[] {
  return entries.flatMap((entry) => (entry.kind === "file" ? [entry.fileId] : []));
}

export function attachmentLinks(entries: ArtworkAttachment[]): ArtworkLink[] {
  return entries.flatMap((entry) =>
    entry.kind === "link" ? [{ formatCode: entry.formatCode, url: entry.url }] : [],
  );
}

/** The main file: GRIDGO's `artworkFileId`, and what pages and size are read from. */
export function mainFileId(entries: ArtworkAttachment[]): string | null {
  return attachmentFileIds(entries)[0] ?? null;
}

/** A label as GRIDGO stores it: one trimmed line, or nothing. */
export function cleanLabel(text: string | null | undefined): string | undefined {
  const clean = (text ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, ATTACHMENT_LABEL_MAX) : undefined;
}

/** The writable half of an entry: signed download links are GRIDGO's, not ours. */
export function attachmentInput(entry: ArtworkAttachment): ArtworkAttachmentInput {
  const label = cleanLabel(entry.label);
  const base =
    entry.kind === "file"
      ? { kind: "file" as const, fileId: entry.fileId }
      : { kind: "link" as const, formatCode: entry.formatCode, url: entry.url };
  return label ? { ...base, label } : base;
}

export function attachmentKey(entry: Pick<ArtworkAttachment, "kind"> & { fileId?: string; url?: string; formatCode?: string }): string {
  return entry.kind === "file" ? `file ${entry.fileId}` : `link ${entry.formatCode} ${entry.url}`;
}

export function sameAttachments(a: ArtworkAttachment[], b: ArtworkAttachment[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return attachmentKey(entry) === attachmentKey(other) && cleanLabel(entry.label) === cleanLabel(other.label);
    })
  );
}

export function moveAttachment(entries: ArtworkAttachment[], from: number, to: number): ArtworkAttachment[] {
  if (from < 0 || from >= entries.length || to < 0 || to >= entries.length || from === to) return entries;
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function withoutAttachment(entries: ArtworkAttachment[], key: string): ArtworkAttachment[] {
  return entries.filter((entry) => attachmentKey(entry) !== key);
}

export function relabelAttachment(entries: ArtworkAttachment[], key: string, label: string): ArtworkAttachment[] {
  return entries.map((entry) => {
    if (attachmentKey(entry) !== key) return entry;
    const { label: _old, ...rest } = entry;
    const clean = cleanLabel(label);
    return (clean ? { ...rest, label: clean } : rest) as ArtworkAttachment;
  });
}

/**
 * The PATCH body for a new list.
 *
 * Against an API that keeps the list, the list itself. Against one from
 * before, the same thing in its two old fields — which can hold one file,
 * first, and any links after it. Anything else it cannot keep: `null`, and
 * the screen says so rather than sending a list that would lose a file.
 */
export function attachmentsBody(
  line: Partial<AttachmentLine>,
  entries: ArtworkAttachment[],
): { artworkAttachments: ArtworkAttachmentInput[] } | { artworkFileId: string | null; artworkLinks: ArtworkLink[] } | null {
  if (keepsAttachmentList(line)) return { artworkAttachments: entries.map(attachmentInput) };
  const files = attachmentFileIds(entries);
  // Labels are not offered against this API, so none are lost here.
  const fileFirst = files.length === 0 || entries[0].kind === "file";
  if (files.length > 1 || !fileFirst) return null;
  return { artworkFileId: files[0] ?? null, artworkLinks: attachmentLinks(entries) };
}

/** Said when an older GRIDGO cannot keep what was asked. */
export const NO_LIST_ON_THIS_API =
  "GRIDGO can keep only one file, and its links, on this item for now. Remove the extra file to go on.";

export function slotsLeft(used: number): number {
  return Math.max(0, MAX_ARTWORK_ATTACHMENTS - used);
}

/** The limit, said where a client chooses what to add. */
export function attachmentLimitLine(used: number): string {
  const left = slotsLeft(used);
  if (left === 0) {
    return `This item has ${MAX_ARTWORK_ATTACHMENTS} files and links, the most it can take. Remove one to add another.`;
  }
  if (used === 0) return `Add up to ${MAX_ARTWORK_ATTACHMENTS} files and design links to this item.`;
  return `${left} more ${left === 1 ? "file or link" : "files or links"} can go on this item.`;
}

/** The meter's words: what a screen reader hears for the ten cells. */
export function attachmentCountLabel(used: number): string {
  return `${used} of ${MAX_ARTWORK_ATTACHMENTS} files and links used`;
}

/** A picker that returned more than the item has room for. */
export function overflowNote(chosen: number, kept: number): string | null {
  if (chosen <= kept) return null;
  const left = chosen - kept;
  return kept === 0
    ? `This item already has ${MAX_ARTWORK_ATTACHMENTS} files and links. Remove one to add another.`
    : `Only ${kept} more ${kept === 1 ? "file fits" : "files fit"} on this item, so ${left} ${left === 1 ? "was" : "were"} left off.`;
}

/** How one entry reads in a list, before its file's own name is known. */
export function attachmentSummary(entries: ArtworkAttachment[]): string {
  const files = attachmentFileIds(entries).length;
  const links = entries.length - files;
  const parts: string[] = [];
  if (files) parts.push(files === 1 ? "1 file" : `${files} files`);
  if (links) parts.push(links === 1 ? "1 design link" : `${links} design links`);
  return parts.join(" and ");
}
