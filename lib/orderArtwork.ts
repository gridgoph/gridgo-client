import type { Order, StoredFile } from "@/lib/api";

export type ArtworkReference = { fileId: string; kind: "artwork" | "mockup"; itemName?: string };

/** Only production artwork/reference pictures; never receipts or private evidence. */
export function orderArtwork(order: Pick<Order, "artworkFileIds" | "mockupFileIds" | "productionItems">): ArtworkReference[] {
  const files: ArtworkReference[] = [];
  const seen = new Set<string>();
  function add(fileId: string | null | undefined, kind: ArtworkReference["kind"], itemName?: string) {
    if (!fileId || seen.has(fileId)) return;
    seen.add(fileId);
    files.push({ fileId, kind, ...(itemName ? { itemName } : {}) });
  }
  for (const item of order.productionItems ?? []) {
    add(item.artworkFileId, "artwork", item.itemName);
    add(item.mockupFileId, "mockup", item.itemName);
  }
  for (const id of order.artworkFileIds ?? []) add(id, "artwork");
  for (const id of order.mockupFileIds ?? []) add(id, "mockup");
  return files;
}

export function isArtworkImage(file: Pick<StoredFile, "detectedContentType">): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.detectedContentType.toLowerCase().split(";")[0].trim());
}

/** Deleted early or by retention: the record stays, the bytes are gone. */
export function isArtworkRemoved(file: Pick<StoredFile, "state">): boolean {
  return file.state === "deleted" || file.state === "delete_pending";
}

/**
 * Whether this file is the order's own artwork (or mockup). A client's copy of
 * a reference carries no `field`, so the order id and the purpose decide; the
 * slot is only checked where the API sends it.
 */
export function isOrderArtwork(file: StoredFile, orderId: string, kind: ArtworkReference["kind"]): boolean {
  return file.purpose === kind && (file.state === "ready" || isArtworkRemoved(file)) && file.references.some((ref) =>
    ref.type === "order" && ref.id === orderId && (ref.field === undefined ||
    ref.field === `${kind}FileIds` || (ref.field.startsWith("line:") && ref.field.endsWith(`:${kind}`))),
  );
}

export function describeArtwork(file: StoredFile): string {
  const mime = file.detectedContentType.toLowerCase();
  const type = mime === "application/pdf" ? "PDF" : mime === "image/vnd.adobe.photoshop" ? "Photoshop file" : mime.split("/")[1]?.toUpperCase() || "File";
  const size = file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${type} · ${size}`;
}

/** Check metadata before requesting any bytes; document previews stay documents. */
export async function readOrderArtwork(reference: ArtworkReference, orderId: string, reader: {
  getFile: (id: string) => Promise<StoredFile>;
  getDownloadUrl: (id: string) => Promise<{ url: string }>;
}): Promise<{ file: StoredFile; previewUrl: string | null }> {
  const file = await reader.getFile(reference.fileId);
  if (!isOrderArtwork(file, orderId, reference.kind)) throw new Error("not_production_artwork");
  // A removed file has no bytes to sign; its row says so instead.
  const link = isArtworkImage(file) && !isArtworkRemoved(file) ? await reader.getDownloadUrl(reference.fileId) : null;
  return { file, previewUrl: link?.url ?? null };
}
