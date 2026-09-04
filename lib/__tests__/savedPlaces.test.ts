import type { ClientAddress } from "@/lib/api";
import { groupSavedPlaces, isHomeLabel, isWorkLabel, savedPlacesDetail } from "@/lib/savedPlaces";

function place(label: string, id = label): ClientAddress {
  return {
    id,
    label,
    addressLine: `${label} street, Davao City`,
    point: { lat: 7.07, lng: 125.61, label: `${label} street, Davao City` },
    isDefault: false,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("saved place labels", () => {
  it("matches Home and Work without caring about case", () => {
    expect(isHomeLabel("Home")).toBe(true);
    expect(isHomeLabel(" home ")).toBe(true);
    expect(isHomeLabel("Hometown")).toBe(false);
    expect(isWorkLabel("WORK")).toBe(true);
    expect(isWorkLabel("Office")).toBe(false);
  });
});

describe("groupSavedPlaces", () => {
  it("pulls Home and Work out of the named list", () => {
    const grouped = groupSavedPlaces([place("Office"), place("home"), place("Work"), place("Shop")]);
    expect(grouped.home?.label).toBe("home");
    expect(grouped.work?.label).toBe("Work");
    expect(grouped.named.map((row) => row.label)).toEqual(["Office", "Shop"]);
  });

  it("treats a missing Home or Work as an invitation, not a hole", () => {
    const grouped = groupSavedPlaces([place("Shop")]);
    expect(grouped.home).toBeNull();
    expect(grouped.work).toBeNull();
    expect(grouped.named).toHaveLength(1);
  });
});

describe("savedPlacesDetail", () => {
  it("invites a client with nothing saved to add Home", () => {
    expect(savedPlacesDetail([])).toMatch(/home/i);
    expect(savedPlacesDetail(null)).toMatch(/home/i);
  });

  it("lists what is actually saved", () => {
    expect(savedPlacesDetail([place("Home"), place("Work")])).toBe("Home · Work");
  });
});
