import { screen } from "@testing-library/react-native";

import { PrinterStep } from "@/components/express/PrinterStep";
import { HOME_PICKUP_BEFORE_PAYMENT } from "@/lib/homePrinter";
import { renderScreen } from "@/test/renderScreen";
import { printerCard, printersRead, seedWhoPrints } from "@/test/whoPrintsFixtures";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
  readExpressPrinters: jest.fn(),
  createExpressDraft: jest.fn(),
}));

// gridgo-api#412 (0B10F8DE): home printers on "Who prints it?" — no presses in this file.

const home = (overrides = {}) =>
  printerCard({
    supplierId: "home_1",
    name: "Poblacion District",
    address: "Poblacion District",
    printerType: "home",
    verificationLevel: "verified",
    location: null,
    barangay: "Poblacion District",
    distanceMeters: 1500,
    distanceApproximate: true,
    deliveryFeeMinor: null,
    walkingTimeMinutes: 19,
    ...overrides,
  });

it("labels a home printer with its level, barangay and rounded distance, beside an unchanged shop", async () => {
  const read = printersRead([
    printerCard({ deliveryFeeMinor: null, walkingTimeMinutes: 3 }),
    home(),
    home({ supplierId: "home_2", name: "Matina Crossing", barangay: "Matina Crossing", verificationLevel: "starter", distanceMeters: 500 }),
  ]);
  seedWhoPrints({ fulfilment: "pickup", printers: read, shops: read.shops });
  await renderScreen(<PrinterStep />);
  expect(screen.getAllByText("Home printer")).toHaveLength(2);
  expect(screen.getByText("Poblacion District · Within 1.5 km")).toBeTruthy();
  expect(screen.getByText("Matina Crossing · Within 500 m")).toBeTruthy();
  expect(screen.getByLabelText("Starter")).toBeTruthy();
  expect(screen.getAllByLabelText("Verified")).toHaveLength(2);
  expect(
    screen.getByLabelText(/^Home printer in Poblacion District\. Verified\. Open now\. Ready .*Within 1\.5 km\. Zone A · Nearby · About 19 min walk$/),
  ).toBeTruthy();
  // The shop reads exactly as before: its own name, no barangay line.
  expect(screen.getByText("Corner Print")).toBeTruthy();
  expect(screen.getByLabelText(/^Corner Print, shop\. Verified\. Open now/)).toBeTruthy();
  // Nothing about the street until a home is picked for pickup.
  expect(screen.queryByText(HOME_PICKUP_BEFORE_PAYMENT)).toBeNull();
});

it("says the street comes after payment once a home is picked for pickup", async () => {
  const read = printersRead([home()]);
  seedWhoPrints({ fulfilment: "pickup", printers: read, shops: read.shops, supplierId: "home_1", chosenShop: read.shops[0], fareLimit: null });
  await renderScreen(<PrinterStep />);
  expect(screen.getByText(HOME_PICKUP_BEFORE_PAYMENT)).toBeTruthy();
});
