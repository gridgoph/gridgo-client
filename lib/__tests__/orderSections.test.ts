import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Order } from "@/lib/api";
import type { HistoryRow } from "@/lib/orderHistory";
import {
  artworkSummary,
  paymentSummary,
  photosByHistoryRow,
  specificationsSummary,
} from "@/lib/orderSections";
import { ORDER_SECTIONS_FOLDED, useOrderSections } from "@/store/orderSections";

const row = (state: string, at: string): HistoryRow => ({
  key: `${at}-${state}`,
  at,
  state,
  title: state,
  actor: null,
});

const rows = [
  row("submitted", "2026-09-26T08:00:00Z"),
  row("production", "2026-09-27T08:00:00Z"),
  row("supplier_self_qc", "2026-09-27T12:00:00Z"),
  row("out_for_delivery", "2026-09-28T08:00:00Z"),
];

describe("photosByHistoryRow", () => {
  it("puts each photo under the step that had begun when it was taken, newest first", () => {
    const byRow = photosByHistoryRow(rows, [
      { fileId: "press_early", at: "2026-09-27T09:00:00Z" },
      { fileId: "packing", at: "2026-09-27T13:00:00Z" },
      { fileId: "press_late", at: "2026-09-27T10:00:00Z" },
    ]);
    expect(byRow.get(rows[1].key)?.map((photo) => photo.fileId)).toEqual([
      "press_late",
      "press_early",
    ]);
    expect(byRow.get(rows[2].key)?.map((photo) => photo.fileId)).toEqual(["packing"]);
    expect(byRow.has(rows[3].key)).toBe(false);
  });

  it("keeps a photo older than every step, and one with no time, rather than losing it", () => {
    const byRow = photosByHistoryRow(rows, [
      { fileId: "before", at: "2026-09-01T00:00:00Z" },
      { fileId: "undated" },
    ]);
    expect(byRow.get(rows[0].key)?.map((photo) => photo.fileId)).toEqual(["before"]);
    // The newest making step, not the delivery that came after it.
    expect(byRow.get(rows[2].key)?.map((photo) => photo.fileId)).toEqual(["undated"]);
  });

  it("has nowhere to put a photo on a job with no history", () => {
    expect(photosByHistoryRow([], [{ fileId: "a" }]).size).toBe(0);
  });
});

describe("folded summaries", () => {
  it("says the quantity and the due date of a single-item job", () => {
    const summary = specificationsSummary(
      { quantity: 2, size: "3x6 ft", deadline: "2026-08-15T10:00:00+08:00", productionItems: undefined },
      "sqm",
    );
    expect(summary).toMatch(/^2 \S+ · 3x6 ft · Due (15 Aug|Aug 15)$/);
  });

  it("counts the items of a basket job", () => {
    const item = { id: "a", itemName: "A", quantity: 1 } as NonNullable<Order["productionItems"]>[number];
    expect(
      specificationsSummary(
        { quantity: 0, size: "", deadline: null as unknown as string, productionItems: [item, { ...item, id: "b" }] },
        "",
      ),
    ).toBe("2 items");
  });

  it("counts files and links, and defers to the proof while it is being decided", () => {
    expect(artworkSummary({ files: 2, links: 1, inProof: false })).toBe("2 files · 1 design link");
    expect(artworkSummary({ files: 0, links: 0, inProof: false })).toBe("Nothing attached yet");
    expect(artworkSummary({ files: 1, links: 0, inProof: true })).toBe("Shown in the proof above");
  });

  it("gives the fee-inclusive total, or the estimate before a shop takes the job", () => {
    expect(paymentSummary({ totalMinor: 112500 } as Order)).toBe("Total ₱1,125.00");
    expect(
      paymentSummary({
        totalMinor: null,
        subtotalMinor: null,
        priceRange: { subtotalMinMinor: 40000, subtotalMaxMinor: 52000, deliveryFeeStatus: "pending" },
      } as unknown as Order),
    ).toBe("Estimate ₱400.00 – ₱520.00");
  });
});

describe("useOrderSections", () => {
  beforeEach(() => useOrderSections.setState({ open: ORDER_SECTIONS_FOLDED }));

  it("starts folded and remembers each section on its own", async () => {
    expect(useOrderSections.getState().open).toEqual(ORDER_SECTIONS_FOLDED);
    useOrderSections.getState().toggle("payment");
    expect(useOrderSections.getState().open).toEqual({ ...ORDER_SECTIONS_FOLDED, payment: true });

    const stored = JSON.parse((await AsyncStorage.getItem("gridgo.client.orderSections.v1")) ?? "{}");
    expect(stored.state.open.payment).toBe(true);
    expect(stored.state.open.specifications).toBe(false);
  });

  it("starts a section it has never seen folded when reading an older save", async () => {
    await AsyncStorage.setItem(
      "gridgo.client.orderSections.v1",
      JSON.stringify({ state: { open: { payment: true } }, version: 0 }),
    );
    await useOrderSections.persist.rehydrate();
    expect(useOrderSections.getState().open).toEqual({ ...ORDER_SECTIONS_FOLDED, payment: true });
  });
});
