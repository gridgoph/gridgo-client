import {
  homeDistanceLine,
  homePickupPlace,
  isHomePrinter,
  mappablePickup,
  printerName,
  printerPhrase,
} from "@/lib/homePrinter";

// gridgo-api#412 (0B10F8DE): a client sees a home's barangay and a rounded distance only.

describe("homeDistanceLine", () => {
  it("reads GRIDGO's rounded-up distance as an upper bound", () => {
    expect(homeDistanceLine(500)).toBe("Within 500 m");
    expect(homeDistanceLine(1000)).toBe("Within 1 km");
    expect(homeDistanceLine(1500)).toBe("Within 1.5 km");
    expect(homeDistanceLine(12_000)).toBe("Within 12 km");
  });

  it("never claims less than GRIDGO's 500 m floor, even if a raw number slips through", () => {
    expect(homeDistanceLine(120)).toBe("Within 500 m");
    expect(homeDistanceLine(1_201)).toBe("Within 1.5 km");
  });

  it("says nothing without a distance", () => {
    expect(homeDistanceLine(null)).toBeNull();
    expect(homeDistanceLine(0)).toBeNull();
    expect(homeDistanceLine(Number.NaN)).toBeNull();
  });
});

describe("printerName", () => {
  it("names a home by its barangay and leaves a shop's name alone", () => {
    expect(printerName({ printerType: "home", barangay: "Matina Crossing", name: "Matina Crossing" })).toBe(
      "Home printer in Matina Crossing",
    );
    expect(printerName({ printerType: "home", barangay: null, name: null })).toBe("Home printer");
    expect(printerName({ printerType: "shop", name: "Corner Print", barangay: null })).toBe("Corner Print");
    expect(printerName({ name: "Legacy Print" })).toBe("Legacy Print");
    expect(printerName(null)).toBeNull();
  });

  it("reads inside a sentence for an order", () => {
    expect(printerPhrase({ printerType: "home", barangay: "Poblacion District" })).toBe(
      "the home printer in Poblacion District",
    );
    expect(printerPhrase({ printerType: "shop", name: "Corner Print" })).toBe("Corner Print");
  });
});

describe("homePickupPlace", () => {
  it("keeps the barangay before payment and adds the street after", () => {
    expect(homePickupPlace({ barangay: "Poblacion District" })).toEqual({ barangay: "Poblacion District", street: null });
    expect(homePickupPlace({ barangay: "Poblacion District", street: "Test Street" })).toEqual({
      barangay: "Poblacion District",
      street: "Test Street",
    });
  });

  it("never passes coordinates on, and falls back to the order's barangay", () => {
    const place = homePickupPlace({ lat: 7.06, lng: 125.6, label: "private" }, "Matina Crossing");
    expect(place).toEqual({ barangay: "Matina Crossing", street: null });
    expect(homePickupPlace(null)).toEqual({ barangay: null, street: null });
  });
});

describe("mappablePickup", () => {
  it("maps a shop's pin and never a home's", () => {
    const pin = { lat: 7.06, lng: 125.6, label: "Corner Print" };
    expect(mappablePickup(pin, false)).toBe(pin);
    expect(mappablePickup(pin, true)).toBeNull();
    expect(mappablePickup({ barangay: "Poblacion District" }, false)).toBeNull();
  });

  it("recognises a home printer only by printerType", () => {
    expect(isHomePrinter({ printerType: "home" })).toBe(true);
    expect(isHomePrinter({ printerType: "shop" })).toBe(false);
    expect(isHomePrinter(undefined)).toBe(false);
  });
});
