import type { CartLineRecord } from "@/lib/api";
import { gridgoPriceMinor, gridgoPriceOrNull, unpricedLineReason } from "@/lib/clientPrice";

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_printzone",
    catalogItemId: "sci_lanyard",
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: "file_art",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: null,
    lineSubtotalMinor: null,
    ...overrides,
  };
}

describe("gridgoPriceMinor", () => {
  it("adds GRIDGO's charge to the shop's figure at the platform rate", () => {
    // PrintZone's lanyard: PHP 50.00 to the shop, 10% to GRIDGO -> PHP 55.00.
    expect(gridgoPriceMinor(5000, 1000)).toBe(5500);
    expect(gridgoPriceMinor(10000, 1000)).toBe(11000);
    expect(gridgoPriceMinor(2500, 1000)).toBe(2750);
  });

  it("rounds the charge half-up at the centavo, the way the server does", () => {
    // 10% of 4 centavos is 0.4 -> 0; of 5 is 0.5 -> 1; of 15 is 1.5 -> 2.
    expect(gridgoPriceMinor(4, 1000)).toBe(4);
    expect(gridgoPriceMinor(5, 1000)).toBe(6);
    expect(gridgoPriceMinor(15, 1000)).toBe(17);
    expect(gridgoPriceMinor(0, 1000)).toBe(0);
    expect(gridgoPriceMinor(5000, 0)).toBe(5000);
  });

  it("keeps a missing price missing", () => {
    expect(gridgoPriceOrNull(null, 1000)).toBeNull();
    expect(gridgoPriceOrNull(5000, null)).toBeNull();
    expect(gridgoPriceOrNull(5000, 1000)).toBe(5500);
  });
});

describe("unpricedLineReason", () => {
  it("names the shop's minimum when the quantity is under it", () => {
    const stub = { minimumOrderQuantity: 10 } as unknown as CartLineRecord["listing"];
    expect(unpricedLineReason(line({ quantity: 1, listing: stub }))).toBe(
      "No price at this quantity — this shop takes orders of 10 and up.",
    );
  });

  it("says what to do when the reason is not the quantity", () => {
    const stub = { minimumOrderQuantity: null } as unknown as CartLineRecord["listing"];
    expect(unpricedLineReason(line({ quantity: 3, listing: stub }))).toBe(
      "No price for this pick — open it and change what you picked.",
    );
    expect(unpricedLineReason(line({ listing: null }))).toBe(
      "No price for this pick — open it and change what you picked.",
    );
  });
});
