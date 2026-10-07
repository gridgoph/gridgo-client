import type { Order, ProductionPhoto } from "@/lib/api";
import type { HistoryRow } from "@/lib/orderHistory";

export const PACKED_UPDATE = "Your order is packed and waiting for the rider.";

export function packingPhotos(
  order: Pick<Order, "packingProgress">,
): ProductionPhoto[] {
  const photos = order.packingProgress?.photos;
  if (!Array.isArray(photos)) return [];
  return photos.filter(
    (photo) => photo && typeof photo.fileId === "string" && photo.fileId,
  );
}

/** A photo is its own update, even though attaching it never changes order state. */
export function withPackingUpdates(
  rows: HistoryRow[],
  photos: ProductionPhoto[],
): HistoryRow[] {
  if (!photos.length) return rows;
  return [
    ...rows,
    ...photos.map((photo): HistoryRow => ({
      key: `packing:${photo.fileId}`,
      at: photo.at ?? "",
      state: "packing_photo",
      title: PACKED_UPDATE,
      actor: null,
    })),
  ].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
}
