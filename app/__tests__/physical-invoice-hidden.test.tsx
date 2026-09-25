import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PhysicalInvoiceScreen from "@/app/order/physical-invoice";

// No features mock: this file runs against the real switch, which is off for
// the pilot (gridgoph/gridgo-web#61). A deep link or old history can still
// land here, so the screen must hold up without the form.
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getPhysicalInvoice: jest.fn(),
    requestPhysicalInvoice: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const wrap = (node: ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame, insets }}>{node}</SafeAreaProvider>
);

describe("physical invoice while paused for the pilot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("says requests are paused instead of offering the form", async () => {
    api.getPhysicalInvoice.mockResolvedValue(null);
    await render(wrap(<PhysicalInvoiceScreen />));

    expect(await screen.findByText("Printed invoices are not available yet")).toBeTruthy();
    expect(screen.getByText("Back to the order")).toBeTruthy();
    expect(screen.queryByText("Request a physical invoice")).toBeNull();
    expect(screen.queryByText("Send request")).toBeNull();
    expect(screen.queryByLabelText("Contact person")).toBeNull();
    expect(api.requestPhysicalInvoice).not.toHaveBeenCalled();
  });

  it("still shows a request that was filed before the pause", async () => {
    api.getPhysicalInvoice.mockResolvedValue({
      orderId: "ord_1",
      contactPerson: "Ana Reyes",
      officeAddress: "12 J.P. Laurel Ave",
      operatingHours: "Mon–Fri 9am–5pm",
      requestedAt: "2026-09-20T02:00:00.000Z",
      promisedDeliveryAt: null,
    });
    await render(wrap(<PhysicalInvoiceScreen />));

    expect(await screen.findByText("Physical invoice requested")).toBeTruthy();
    expect(screen.getByText("Ana Reyes")).toBeTruthy();
    expect(screen.getByText("GRIDGO has not set a delivery time yet.")).toBeTruthy();
    expect(screen.queryByText("Printed invoices are not available yet")).toBeNull();
  });
});
