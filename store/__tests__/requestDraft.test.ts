import { migrateDraft } from "@/store/requestDraft";

/**
 * A half-finished request has to survive an app kill — and an app update.
 * These cover the v1 → v2 carry-over, where the address became structured and
 * the deadline became a real instant.
 */
describe("migrateDraft", () => {
  const v1 = {
    stepIndex: 1,
    productId: "prod_tarpaulin",
    productName: "Tarpaulin / Banner",
    basePriceMinor: 45000,
    unit: "sqm",
    family: "banner",
    title: "Grand opening tarpaulin",
    size: "3x6 ft",
    material: "13oz tarpaulin",
    quantity: 2,
    deadline: "2026-08-15T10:00:00+08:00",
    address: "12 J.P. Laurel Ave, Bajada, Davao City (blue gate)",
    zone: "davao_central",
    artworkName: "opening-banner.pdf",
  };

  it("keeps the specification the client already entered", () => {
    const migrated = migrateDraft(v1, 1);
    expect(migrated.title).toBe("Grand opening tarpaulin");
    expect(migrated.size).toBe("3x6 ft");
    expect(migrated.quantity).toBe(2);
    expect(migrated.stepIndex).toBe(1);
  });

  it("splits the old single-line address into the structured fields", () => {
    const migrated = migrateDraft(v1, 1);
    expect(migrated.addressLine1).toBe("12 J.P. Laurel Ave");
    expect(migrated.barangay).toBe("Bajada");
    expect(migrated.landmark).toBe("blue gate");
  });

  it("keeps a typed deadline only when it is a real instant", () => {
    expect(migrateDraft(v1, 1).deadline).toBe(
      new Date("2026-08-15T10:00:00+08:00").toISOString(),
    );
    expect(migrateDraft({ ...v1, deadline: "sometime next week" }, 1).deadline).toBe("");
  });

  it("does not carry an old file name forward as a stored upload", () => {
    const migrated = migrateDraft(v1, 1);
    expect(migrated.artworkName).toBe("opening-banner.pdf");
    expect(migrated.artworkFileId).toBe("");
  });

  it("leaves a current draft untouched", () => {
    const v2 = {
      ...v1,
      addressLine1: "9 Recto St",
      barangay: "Poblacion",
      landmark: "",
      finish: "Lamination",
      artworkFileId: "file_abc123",
      deadline: "2026-08-15T02:00:00.000Z",
    };
    const migrated = migrateDraft(v2, 2);
    expect(migrated.addressLine1).toBe("9 Recto St");
    expect(migrated.finish).toBe("Lamination");
    expect(migrated.artworkFileId).toBe("file_abc123");
  });

  it("survives a corrupt or empty stored value", () => {
    const migrated = migrateDraft(undefined, 1);
    expect(migrated.productId).toBe("");
    expect(migrated.quantity).toBe(1);
  });
});
