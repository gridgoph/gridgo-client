import { screen } from "@testing-library/react-native";

import { PrinterFooter, PrinterStep, printerBlocker } from "@/components/express/PrinterStep";
import { defaultPrint } from "@/lib/express";
import { renderScreen } from "@/test/renderScreen";
import { printerCard, printersRead, seedWhoPrints, WHO_PRINTS_FILE } from "@/test/whoPrintsFixtures";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
  readExpressPrinters: jest.fn(),
  createExpressDraft: jest.fn(),
}));

// gridgo-client#449 (B26328C8): "Who prints it?" — no presses in this file.

it("leads with Just print it, its fare limits read from GRIDGO's bands", async () => {
  seedWhoPrints();
  await renderScreen(<PrinterStep />);
  expect(screen.getByText("Just print it")).toBeTruthy();
  expect(screen.getByText("GRIDGO picks the fastest printer for you.")).toBeTruthy();
  expect(screen.getByLabelText("Nearby, ₱89 fare")).toBeTruthy();
  expect(screen.getByLabelText("Up to ₱149, Nearby or Away")).toBeTruthy();
  expect(screen.getByLabelText("Any, Any distance")).toBeTruthy();
  expect(screen.getByText("Printing costs the same everywhere. Only delivery changes.")).toBeTruthy();
});

it("says the list widened, and draws each printer's trust and fare up front", async () => {
  seedWhoPrints();
  await renderScreen(<PrinterStep />);
  expect(screen.getByText("Fewer than 3 printers are open nearby, so Away (₱149.00) is shown too.")).toBeTruthy();
  const shop = screen.getByLabelText(/^Corner Print, shop\. Verified\. Open now\. Ready .*Zone A · Nearby · ₱89\.00 delivery$/);
  expect(shop).toBeTruthy();
  expect(screen.getByLabelText(/^Brgy\. Buhangin, home printer\. Starter\. Open now/)).toBeTruthy();
  expect(screen.getByLabelText(/^Farther Print, shop\. Verified.*Zone B · Away · ₱149\.00 delivery$/)).toBeTruthy();
  const closed = screen.getByLabelText(/^Closed Print, shop\. Verified\. Closed/);
  expect(closed.props.accessibilityState).toMatchObject({ disabled: true });
  // Sorts and filters.
  for (const label of ["Nearby", "All Davao", "Fastest", "Top rated", "Shops only", "Verified only"]) {
    expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
  }
  expect(screen.queryByLabelText("Lowest price")).toBeNull();
});

it("shows the walk instead of a fare for pickup", async () => {
  const read = printersRead([printerCard({ deliveryFeeMinor: null, walkingTimeMinutes: 12 })]);
  seedWhoPrints({ fulfilment: "pickup", printers: read, shops: read.shops });
  await renderScreen(<PrinterStep />);
  expect(screen.getByText("Zone A · Nearby · About 12 min walk")).toBeTruthy();
  expect(screen.getByLabelText("Nearby, Within 5 km")).toBeTruthy();
});

it("for A3, shows each shop's price, offers Lowest price, and leaves the pick to the client", async () => {
  const read = printersRead([
    printerCard({ paymentTiming: "after_acceptance", quote: { clientItemSubtotalMinor: 12_000 } as never }),
    printerCard({ supplierId: "shop_2", name: "Second Print", paymentTiming: "after_acceptance", quote: { clientItemSubtotalMinor: 9_500 } as never }),
  ]);
  seedWhoPrints({ prints: [{ ...defaultPrint(WHO_PRINTS_FILE), paper: "a3" }], printers: read, shops: read.shops });
  await renderScreen(
    <>
      <PrinterStep />
      <PrinterFooter onContinue={jest.fn()} />
    </>,
  );
  expect(screen.getByText("₱120.00")).toBeTruthy();
  expect(screen.getByText("₱95.00")).toBeTruthy();
  expect(screen.getByLabelText("Lowest price")).toBeTruthy();
  expect(screen.getAllByText("A3 is priced by each shop. Pick the printer and price you want below.").length).toBeGreaterThan(0);
  expect(screen.getByText("Pick a printer for A3.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState).toMatchObject({ disabled: true });
});

describe("the printer step's footer rule", () => {
  const ready = { place: true, savedPlace: true, delivery: false, justPrintIt: false, shopPrices: false, chosen: false };

  it("asks for a printer, and says why when the order has A3", () => {
    expect(printerBlocker(ready)).toBe("Pick a printer, or let GRIDGO pick.");
    expect(printerBlocker({ ...ready, shopPrices: true })).toBe("Pick a printer for A3.");
    expect(printerBlocker({ ...ready, shopPrices: true, justPrintIt: true })).toBe("Pick a printer for A3.");
    expect(printerBlocker({ ...ready, shopPrices: true, chosen: true })).toBeNull();
    expect(printerBlocker({ ...ready, justPrintIt: true })).toBeNull();
    expect(printerBlocker({ ...ready, delivery: true, savedPlace: false, justPrintIt: true })).toBe("Choose a saved place to deliver to.");
  });
});
