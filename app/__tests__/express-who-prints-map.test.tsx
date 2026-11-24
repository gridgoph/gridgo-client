import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { PrinterStep } from "@/components/express/PrinterStep";
import { choicesKey } from "@/lib/express";
import { NO_PRINTER_WITHIN_LIMIT } from "@/lib/whoPrints";
import { expressChoices, useExpress } from "@/store/express";
import { renderScreen } from "@/test/renderScreen";
import { printerCard, printersRead, seedWhoPrints } from "@/test/whoPrintsFixtures";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
}));

// gridgo-client#468 (C49D5A3E). One press per file (RNTL 14 on React 19): the
// no-fit test presses nothing, so it goes first.

it("when nothing open fits the limit, the map says how far the nearest open printers are", async () => {
  const read = printersRead([
    printerCard({ supplierId: "far", name: "Far Print", distanceMeters: 6200, zone: { code: "B", key: "away", label: "Away" } }),
    printerCard({ supplierId: "shut", name: "Shut Print", distanceMeters: 900, isOpenNow: false, selectable: false, openStatus: "closed" }),
  ]);
  seedWhoPrints({ printers: read, shops: read.shops });
  const key = choicesKey(expressChoices(useExpress.getState()));
  useExpress.setState({ draft: { status: "error", key, code: "express_shop_unavailable", message: NO_PRINTER_WITHIN_LIMIT } });
  await renderScreen(<PrinterStep />);
  expect(
    screen.getByText("The nearest open printer is 6.2 km away, past your limit. Allow a farther one, or tap a pin to pick it."),
  ).toBeTruthy();
  expect(screen.getByText("Nearby · 5 km")).toBeTruthy();
  expect(screen.getByLabelText("Printers on the map: 2 shops").props.accessibilityState).toMatchObject({ expanded: true });
  // The list stays.
  expect(screen.getByLabelText(/^Far Print, shop/)).toBeTruthy();
});

it("tapping a pin on the map picks that printer, the same as its card", async () => {
  seedWhoPrints();
  await renderScreen(<PrinterStep />);
  expect(screen.getByText("3 shops · 1 home printer")).toBeTruthy();
  expect(screen.getByText(/^The home printer isn't pinned/)).toBeTruthy();
  fireEvent(screen.getByTestId("printer-map"), "message", { nativeEvent: { data: JSON.stringify({ type: "printer", id: "shop_b" }) } });
  await waitFor(() => expect(useExpress.getState()).toMatchObject({ supplierId: "shop_b", fareLimit: null }));
  expect(useExpress.getState().chosenShop?.name).toBe("Farther Print");
});
