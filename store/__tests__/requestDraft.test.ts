import AsyncStorage from "@react-native-async-storage/async-storage";

import { migrateDraft, useRequestDraft } from "@/store/requestDraft";

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

/**
 * A draft saved on the retired form can never be finished, so the launch that
 * finds one discards it and Home says so once.
 */
describe("a draft saved on the retired form", () => {
  const KEY = "gridgo.client.requestDraft.v1";
  const stored = (state: Record<string, unknown>) => JSON.stringify({ state, version: 2 });

  beforeEach(async () => {
    await AsyncStorage.clear();
    useRequestDraft.getState().reset();
    useRequestDraft.getState().dismissRetiredNotice();
  });

  it("is discarded at launch, on the phone too, with one notice", async () => {
    await AsyncStorage.setItem(KEY, stored({ productId: "prod_flyer", title: "Flyers", addressLine1: "12 Laurel" }));

    await useRequestDraft.persist.rehydrate();

    expect(useRequestDraft.getState()).toEqual(
      expect.objectContaining({ retiredNotice: true, productId: "", title: "", addressLine1: "", hydrated: true }),
    );
    const left = await AsyncStorage.getItem(KEY);
    expect(left).not.toContain("prod_flyer");
    expect(left).not.toContain("retiredNotice");
  });

  it("says nothing on the next launch", async () => {
    await AsyncStorage.setItem(KEY, stored({ productId: "prod_flyer", title: "Flyers" }));
    await useRequestDraft.persist.rehydrate();
    useRequestDraft.getState().dismissRetiredNotice();

    await useRequestDraft.persist.rehydrate();

    expect(useRequestDraft.getState().retiredNotice).toBe(false);
  });

  it("says nothing to a phone with no draft", async () => {
    await AsyncStorage.setItem(KEY, stored({ title: " ", productId: "" }));

    await useRequestDraft.persist.rehydrate();

    expect(useRequestDraft.getState().retiredNotice).toBe(false);
  });
});
