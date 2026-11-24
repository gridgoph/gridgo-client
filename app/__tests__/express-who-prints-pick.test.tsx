import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { PrinterStep } from "@/components/express/PrinterStep";
import { renderScreen } from "@/test/renderScreen";
import { seedWhoPrints } from "@/test/whoPrintsFixtures";
import { useExpress } from "@/store/express";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
}));

// One press per file (RNTL 14 on React 19).
it("picking a printer replaces Just print it with that printer", async () => {
  seedWhoPrints();
  expect(useExpress.getState().fareLimit).toBe("nearby");
  await renderScreen(<PrinterStep />);
  fireEvent.press(screen.getByLabelText(/^Farther Print, shop/));
  await waitFor(() => expect(useExpress.getState()).toMatchObject({ supplierId: "shop_b", fareLimit: null }));
  expect(useExpress.getState().chosenShop?.name).toBe("Farther Print");
});
