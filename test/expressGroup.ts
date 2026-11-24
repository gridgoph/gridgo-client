import type { ExpressGroup, ExpressGroupTracking } from "@/lib/api";

/** A host's read of a delivery group: two members with files, the host without. */
export function groupFixture(overrides: Partial<ExpressGroup> = {}): ExpressGroup {
  return {
    id: "grp_1",
    host: { id: "u_host", name: "Ana Cruz" },
    state: "open",
    status: "open",
    version: 1,
    fulfillmentMode: "delivery",
    closesAt: "2026-11-24T02:30:00.000Z",
    checkoutOpenedAt: null,
    payBy: null,
    quoteStatus: "priced",
    people: 3,
    printingPeople: 2,
    cancelReason: null,
    me: {
      userId: "u_host",
      name: "Ana Cruz",
      fileCount: 0,
      pageCount: 0,
      printSubtotalMinor: 0,
      deliveryShareMinor: -100,
      amountOwedMinor: -100,
      paidBack: false,
      files: [],
      review: null,
    },
    members: [
      { userId: "u_b", name: "Ben", fileCount: 1, pageCount: 3, printSubtotalMinor: 1305, deliveryShareMinor: 1300, amountOwedMinor: 2605, paidBack: false },
      { userId: "u_c", name: "Cy", fileCount: 1, pageCount: 3, printSubtotalMinor: 1305, deliveryShareMinor: 1300, amountOwedMinor: 2605, paidBack: true },
      { userId: "u_host", name: "Ana Cruz", fileCount: 0, pageCount: 0, printSubtotalMinor: 0, deliveryShareMinor: -100, amountOwedMinor: -100, paidBack: false },
    ],
    totalMinor: 5110,
    deliveryFeeMinor: 2500,
    location: { lat: 7.06, lng: 125.6 },
    dropoff: { lat: 7.06, lng: 125.6, label: "City Hall" },
    backupReceiver: null,
    cartId: null,
    tracking: null,
    ...overrides,
  } as ExpressGroup;
}

/** The same group as a member reads it: no member list, no fare, no codes. */
export function memberGroupFixture(overrides: Partial<ExpressGroup> = {}): ExpressGroup {
  const host = groupFixture();
  return groupFixture({
    me: {
      userId: "u_b",
      name: "Ben",
      fileCount: 1,
      pageCount: 3,
      printSubtotalMinor: 1305,
      deliveryShareMinor: 1300,
      amountOwedMinor: 2605,
      paidBack: false,
      files: [{ fileId: "file_b", copies: 1, paper: "a4", colour: "bw", sides: "one", layout: "fit_to_paper", acceptedWarnings: [] }],
      review: null,
    },
    members: undefined,
    totalMinor: undefined,
    deliveryFeeMinor: undefined,
    dropoff: undefined,
    backupReceiver: undefined,
    cartId: undefined,
    location: host.location,
    ...overrides,
  });
}

/** A placed pickup group, ready at the shop. */
export function readyPickupTracking(overrides: Partial<ExpressGroupTracking> = {}): ExpressGroupTracking {
  return {
    orderId: "ord_1",
    state: "ready_for_dispatch",
    fulfillmentMode: "pickup",
    updatedAt: "2026-11-24T02:47:00.000Z",
    estimatedArrivalAt: null,
    me: groupFixture().me,
    ping: null,
    riderTracking: null,
    deliveryMilestones: [],
    ...overrides,
  };
}
