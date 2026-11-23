import type { DeliveryFeeBand, ExpressPrintersRead, ExpressShop, StoredFile } from "@/lib/api";
import { defaultPrint } from "@/lib/express";
import { useExpress } from "@/store/express";

/** GRIDGO's bands as `POST /express/shops` echoes them (`fareBands`). */
export const WHO_PRINTS_BANDS: DeliveryFeeBand[] = [
  { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 8900 },
  { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 14900 },
  { zone: "long_distance", label: "Long distance", maxDistanceMeters: 15000, feeMinor: 22900 },
  { zone: "out_of_zone", label: "Out of zone", maxDistanceMeters: null, baseFeeMinor: 22900, perKmMinor: 1500 },
];

export const WHO_PRINTS_FILE = {
  fileId: "file_1",
  state: "ready",
  detectedContentType: "application/pdf",
  detected: { pageCount: 4, pageSize: "A4", widthMilli: 210_000, heightMilli: 297_000 },
} as StoredFile;

export function printerCard(overrides: Partial<ExpressShop> = {}): ExpressShop {
  return {
    supplierId: "shop_1",
    catalogItemIds: ["item_1"],
    name: "Corner Print",
    address: "Davao",
    location: { lat: 7.07, lng: 125.61 },
    distanceMeters: 1200,
    rating: null,
    jobsAhead: 0,
    readyAt: "2026-11-24T06:00:00.000Z",
    isNew: false,
    busy: false,
    printerType: "shop",
    verificationLevel: "verified",
    isOpenNow: true,
    selectable: true,
    openStatus: "open",
    zone: { code: "A", key: "nearby", label: "Nearby" },
    deliveryFeeMinor: 8900,
    deliveryFareMinor: 8900,
    walkingTimeMinutes: null,
    barangay: null,
    distanceApproximate: false,
    quote: null,
    paymentTiming: "checkout",
    ...overrides,
  };
}

/** Two nearby, one Away after widening, one home printer, one closed. */
export function widenedPrinters(): ExpressShop[] {
  return [
    printerCard(),
    printerCard({ supplierId: "home_1", name: "Brgy. Buhangin", printerType: "home", verificationLevel: "starter", location: null, barangay: "Brgy. Buhangin", distanceApproximate: true }),
    printerCard({ supplierId: "shop_b", name: "Farther Print", zone: { code: "B", key: "away", label: "Away" }, deliveryFeeMinor: 14900, deliveryFareMinor: 14900 }),
    printerCard({ supplierId: "shop_closed", name: "Closed Print", isOpenNow: false, selectable: false, openStatus: "closed", readyAt: null }),
  ];
}

export function printersRead(shops: ExpressShop[], expandedZones: string[] = []): ExpressPrintersRead {
  return {
    shops,
    sort: "nearby",
    expanded: expandedZones.length > 0,
    expandedZones,
    expansionReason: expandedZones.length ? "fewer_than_three_open_printers" : null,
    fareBands: WHO_PRINTS_BANDS,
  };
}

/** The Express store on "Who prints it?" with a printer read already landed. */
export function seedWhoPrints(overrides: Partial<ReturnType<typeof useExpress.getState>> = {}) {
  const read = printersRead(widenedPrinters(), ["B"]);
  useExpress.getState().reset();
  useExpress.setState({
    step: "printer",
    files: [WHO_PRINTS_FILE],
    prints: [defaultPrint(WHO_PRINTS_FILE)],
    place: { lat: 7.07, lng: 125.61, label: "Home", addressId: "addr_1" },
    fulfilment: "delivery",
    whoPrints: "on",
    printers: read,
    shops: read.shops,
    ...overrides,
  });
}
