import type { Order, StoredFile } from "@/lib/api";

/** A finished job with one uploaded artwork file, for the artwork section. */
export function artworkOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_art_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: "user_rider",
    state: "completed",
    productId: "prod_flyers",
    title: "Trade fair flyers",
    quantity: 200,
    size: "A5",
    material: "matte_150gsm",
    deadline: null,
    address: "12 J.P. Laurel Ave, Bajada, Davao City",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 112500,
    balanceMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: "flyer-front.pdf",
    artworkFileIds: ["file_art"],
    createdAt: "2026-09-20T10:00:00+08:00",
    updatedAt: "2026-10-01T16:12:00+08:00",
    timeline: [],
    ...overrides,
  };
}

/** The file as a client reads it: references carry no `field`. */
export function storedArtwork(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    fileId: "file_art",
    purpose: "artwork",
    originalFilename: "flyer-front.pdf",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 2_202_009,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-09-20T10:00:00+08:00",
    readyAt: "2026-09-20T10:00:00+08:00",
    references: [{ type: "order", id: "ord_art_1" }],
    ...overrides,
  };
}
