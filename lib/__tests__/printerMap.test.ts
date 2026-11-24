import { buildMapHtml, parseMapMessage, printerMapModel } from "@/lib/mapHtml";
import {
  distanceLabel,
  fareReach,
  homesOffMapLine,
  mapCountLine,
  noFitLine,
  nothingFits,
  printerPins,
  unavailableLine,
} from "@/lib/printerMap";
import { printerCard, widenedPrinters, WHO_PRINTS_BANDS } from "@/test/whoPrintsFixtures";

// gridgo-client#468 (C49D5A3E): the map on Express "Who prints it?".

it("reads distances the way a client says them", () => {
  expect(distanceLabel(40)).toBe("100 m");
  expect(distanceLabel(820)).toBe("800 m");
  expect(distanceLabel(1000)).toBe("1 km");
  expect(distanceLabel(6240)).toBe("6.2 km");
  expect(distanceLabel(12_600)).toBe("13 km");
  expect(distanceLabel(null)).toBeNull();
});

it("rings the fare limit's reach from GRIDGO's bands, and has no ring for Any or a picked printer", () => {
  expect(fareReach(WHO_PRINTS_BANDS, "nearby", "delivery")).toEqual({ meters: 5000, label: "Nearby · 5 km" });
  expect(fareReach(WHO_PRINTS_BANDS, "up_to_149", "delivery")).toEqual({ meters: 10_000, label: "Up to ₱149 · 10 km" });
  expect(fareReach(WHO_PRINTS_BANDS, "up_to_149", "pickup")?.label).toBe("A bit farther · 10 km");
  expect(fareReach(WHO_PRINTS_BANDS, "any", "delivery")).toBeNull();
  expect(fareReach(WHO_PRINTS_BANDS, null, "delivery")).toBeNull();
  expect(fareReach([], "nearby", "delivery")).toBeNull();
});

it("never pins a home printer, and marks the picked shop", () => {
  const { pins } = printerPins(widenedPrinters(), { supplierId: "shop_b", fareLimit: null, noFit: false });
  expect(pins.map((pin) => pin.id)).toEqual(["shop_1", "shop_b", "shop_closed"]);
  expect(pins.find((pin) => pin.id === "shop_b")).toMatchObject({ selected: true, open: true, distance: "1.2 km" });
  expect(pins.find((pin) => pin.id === "shop_closed")).toMatchObject({ open: false, selected: false });
  // With Just print it on, nothing is picked.
  expect(printerPins(widenedPrinters(), { supplierId: "shop_b", fareLimit: "nearby", noFit: false }).pins.some((pin) => pin.selected)).toBe(false);
});

it("frames and captions the nearest open printers when nothing fits", () => {
  const cards = [
    printerCard({ supplierId: "far", distanceMeters: 9000, location: { lat: 7.1, lng: 125.6 } }),
    printerCard({ supplierId: "near", distanceMeters: 6200, location: { lat: 7.09, lng: 125.6 } }),
    printerCard({ supplierId: "shut", distanceMeters: 800, selectable: false, isOpenNow: false, openStatus: "closed" }),
  ];
  const { pins, frame } = printerPins(cards, { supplierId: null, fareLimit: "nearby", noFit: true });
  expect(frame).toEqual(["near", "far"]);
  expect(pins.filter((pin) => pin.flagged).map((pin) => pin.id)).toEqual(["far", "near"]);
  expect(noFitLine(cards)).toBe(
    "The nearest open printers are 6.2 km and 9 km away, past your limit. Allow a farther one, or tap a pin to pick it.",
  );
  expect(noFitLine([cards[2]])).toMatch(/^No printer is open right now/);
  expect(nothingFits({ fareLimit: "nearby", draftCode: "express_shop_unavailable" })).toBe(true);
  expect(nothingFits({ fareLimit: "any", draftCode: "express_shop_unavailable" })).toBe(false);
  expect(nothingFits({ fareLimit: "nearby", draftCode: "network" })).toBe(false);
});

it("says a home printer's distance as an upper bound, never as a pin", () => {
  const home = printerCard({ supplierId: "home", printerType: "home", location: null, barangay: "Brgy. Buhangin", distanceMeters: 6100 });
  expect(noFitLine([home])).toBe("The nearest open printer is within 6.5 km away, past your limit. Allow a farther one, or tap a pin to pick it.");
  expect(mapCountLine(widenedPrinters())).toBe("3 shops · 1 home printer");
  expect(homesOffMapLine(widenedPrinters())).toMatch(/^The home printer isn't pinned/);
  expect(homesOffMapLine([printerCard()])).toBeNull();
});

it("says why a pin cannot be picked", () => {
  expect(unavailableLine(printerCard({ name: "Closed Print", isOpenNow: false }), "delivery")).toBe("Closed Print is closed now. Pick an open printer.");
  expect(unavailableLine(printerCard({ name: "Late Print", selectable: false }), "delivery")).toMatch(/can't deliver now/);
});

it("draws printers on the map page and reads a pin tap back", () => {
  const { pins, frame } = printerPins(widenedPrinters(), { supplierId: null, fareLimit: "nearby", noFit: false });
  const model = printerMapModel({
    theme: "light",
    place: { lat: 7.07, lng: 125.61, label: "Home" },
    printers: pins,
    frame,
    reach: fareReach(WHO_PRINTS_BANDS, "nearby", "delivery"),
    routeColor: "#FFDE58",
  });
  expect(model).toMatchObject({ dropoff: { lat: 7.07, lng: 125.61 }, dropoffLabel: "Home" });
  expect(model.pickable).toBeFalsy();
  const html = buildMapHtml(model);
  expect(html).toContain("drawPrinters(m, bounds)");
  expect(html).toContain("Corner Print");
  expect(html).not.toContain("Brgy. Buhangin");
  expect(parseMapMessage(JSON.stringify({ type: "printer", id: "shop_b" }))).toEqual({ type: "printer", id: "shop_b" });
  expect(parseMapMessage(JSON.stringify({ type: "printer", id: "" }))).toBeNull();
});
