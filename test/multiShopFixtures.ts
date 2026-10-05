/**
 * Multi-shop basket fixtures (gridgo-api#117), shaped like a client's
 * `GET /me/carts/:id` on a basket printed by several shops: lines carry a
 * `groupId` and no `supplierId`, and GRIDGO's own groups and quote carry the
 * money. Figures are GRIDGO's, fee inside.
 */
import type { Basket, Cart, CartGroup, CartLineRecord, Invoice, PlatformSettings } from "@/lib/api";

export const MULTI_SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  // The platform's setting is still 75: a multi-shop basket is paid in full anyway.
  downpaymentPercent: 75,
  deliveryFeeBands: [
    { zone: "nearby", label: "Nearby", maxDistanceMeters: 4999, feeMinor: 2500 },
    { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 5000 },
    { zone: "long_distance", label: "Long Distance", maxDistanceMeters: null, feeMinor: 7500 },
  ],
};

const NAMES = ["Flyers", "Custom apparel", "Tarpaulin Print"];
const ITEMS = [44000, 19800, 7920];
const FEES = [2500, 5000, 2500];

export function multiLine(index: number, groupId: string, overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: `cline_${index}`,
    groupId,
    catalogItemId: `sci_${index}`,
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: `file_art_${index}`,
    mockupFileId: null,
    dropoff: null,
    sortOrder: index,
    listing: null,
    lineSubtotalMinor: Math.round(ITEMS[index % 3] / 1.1),
    clientLineSubtotalMinor: ITEMS[index % 3],
    ...overrides,
  } as CartLineRecord;
}

/** A draft basket with `count` shop groups, one line each. */
export function multiCart(count: 2 | 3, overrides: Partial<Cart> = {}): Cart {
  const groups: CartGroup[] = [];
  const lines: CartLineRecord[] = [];
  for (let index = 0; index < count; index++) {
    const id = `cline_${index}`;
    lines.push(multiLine(index, id, { listing: { name: NAMES[index] } as CartLineRecord["listing"] }));
    groups.push({
      id,
      label: `Shop ${String.fromCharCode(65 + index)}`,
      lineIds: [id],
      clientItemSubtotalMinor: ITEMS[index],
      deliveryFeeMinor: FEES[index],
      totalMinor: ITEMS[index] + FEES[index],
    });
  }
  return {
    id: "cart_multi",
    state: "draft",
    version: 3,
    serviceLevel: "standard",
    scheduledFor: null,
    deadline: "2026-10-26T08:00:00.000Z",
    fulfillmentMode: "delivery",
    defaultDropoff: { lat: 7.0731, lng: 125.6128, label: "San Pedro St, Davao City" },
    lines,
    groups,
    clientQuote: {
      status: "priced",
      clientItemSubtotalMinor: groups.reduce((sum, group) => sum + (group.clientItemSubtotalMinor ?? 0), 0),
      deliveryLines: groups.map((group, index) => ({
        lineIds: group.lineIds,
        distanceZone: index === 1 ? { key: "away", label: "Away" } : { key: "nearby", label: "Nearby" },
        deliveryFeeMinor: group.deliveryFeeMinor,
      })),
      deliveryFeeMinor: groups.reduce((sum, group) => sum + (group.deliveryFeeMinor ?? 0), 0),
      totalMinor: groups.reduce((sum, group) => sum + (group.totalMinor ?? 0), 0),
      downpaymentPercent: 100,
      downpaymentMinor: groups.reduce((sum, group) => sum + (group.totalMinor ?? 0), 0),
      balanceMinor: 0,
    },
    checkedOutOrderId: null,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

/** The placed basket behind three group orders. */
export function placedBasket(states: [string, string, string] = ["production", "production", "production"]): Basket {
  return {
    id: "bsk_1",
    receiptOrderId: "ord_a",
    deadline: "2026-10-26T08:00:00.000Z",
    fulfillmentMode: "delivery",
    totalMinor: 81720,
    payment: {
      amountMinor: 81720,
      method: "qr_manual",
      status: "confirmed",
      reference: "1012345678903",
      submittedAt: "2026-10-05T07:00:00.000Z",
      confirmedAt: "2026-10-05T08:00:00.000Z",
    },
    groups: (["a", "b", "c"] as const).map((letter, index) => ({
      orderId: `ord_${letter}`,
      label: `Shop ${letter.toUpperCase()}`,
      state: states[index],
      clientItemSubtotalMinor: ITEMS[index],
      deliveryFeeMinor: FEES[index],
      totalMinor: ITEMS[index] + FEES[index],
    })),
  };
}

/** The one combined receipt, as a client reads it: no shop figures, no fee split. */
export function combinedInvoice(): Invoice {
  const groups = placedBasket().groups.map((group, index) => ({
    orderId: group.orderId,
    label: group.label,
    lines: [
      {
        id: `li_${index}`,
        jobId: `job_${index}`,
        itemName: NAMES[index],
        quantity: 1,
        clientUnitPriceMinor: ITEMS[index],
        clientAmountMinor: ITEMS[index],
        artworkFileId: null,
        mockupFileId: null,
        dropoff: null,
      },
    ],
    clientItemSubtotalMinor: ITEMS[index],
    deliveryFeeMinor: FEES[index],
    totalMinor: ITEMS[index] + FEES[index],
  }));
  return {
    invoiceNumber: "GG-20261005-A",
    orderId: "ord_a",
    basketId: "bsk_1",
    issuedAt: "2026-10-05T07:00:00.000Z",
    currency: "PHP",
    lines: groups.flatMap((group) => group.lines),
    groups,
    clientItemSubtotalMinor: 71720,
    deliveryLines: [],
    deliveryFeeMinor: 10000,
    totalMinor: 81720,
    paymentPlan: { method: "qr_manual", downpaymentPercent: 100, downpaymentMinor: 81720, balanceMinor: 0 },
  };
}
