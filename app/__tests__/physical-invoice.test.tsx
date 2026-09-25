import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PhysicalInvoiceScreen from "@/app/order/physical-invoice";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

describe("physical invoice request", () => {
  it("asks for the contact, the office and the hours", async () => {
    api.getPhysicalInvoice.mockResolvedValue(null);
    await render(wrap(<PhysicalInvoiceScreen />));

    expect(await screen.findByText("Request a physical invoice")).toBeTruthy();
    expect(screen.getByLabelText("Contact person")).toBeTruthy();
    expect(screen.getByLabelText("Office address")).toBeTruthy();
    expect(screen.getByLabelText("Operating hours")).toBeTruthy();
    expect(screen.getByText(/when nobody will be at the drop-off/i)).toBeTruthy();
  });

  it("sends the three fields", async () => {
    api.getPhysicalInvoice.mockResolvedValue(null);
    api.requestPhysicalInvoice.mockResolvedValue({
      orderId: "ord_1",
      contactPerson: "Ana Reyes",
      officeAddress: "12 Laurel",
      operatingHours: "Mon–Fri 9am–5pm",
      requestedAt: "2026-09-21T06:00:00.000Z",
    });

    await render(wrap(<PhysicalInvoiceScreen />));
    await screen.findByText("Request a physical invoice");

    await fireEvent.changeText(screen.getByLabelText("Contact person"), "Ana Reyes");
    await fireEvent.changeText(screen.getByLabelText("Office address"), "12 Laurel");
    await fireEvent.changeText(screen.getByLabelText("Operating hours"), "Mon–Fri 9am–5pm");
    await waitFor(() =>
      expect(screen.getByLabelText("Operating hours").props.value).toBe("Mon–Fri 9am–5pm"),
    );
    await fireEvent.press(screen.getByText("Send request"));

    await waitFor(() =>
      expect(api.requestPhysicalInvoice).toHaveBeenCalledWith("ord_1", {
        contactPerson: "Ana Reyes",
        officeAddress: "12 Laurel",
        operatingHours: "Mon–Fri 9am–5pm",
      }),
    );
    expect(await screen.findByText("Physical invoice requested")).toBeTruthy();
  });

  it("shows the promised delivery when GRIDGO has set one", async () => {
    api.getPhysicalInvoice.mockResolvedValue({
      orderId: "ord_1",
      contactPerson: "Ana Reyes",
      officeAddress: "12 Laurel",
      operatingHours: "Mon–Fri 9am–5pm",
      requestedAt: "2026-09-21T06:00:00.000Z",
      promisedDeliveryAt: "2026-09-21T02:00:00.000Z",
    });

    await render(wrap(<PhysicalInvoiceScreen />));

    expect(await screen.findByText("Promised delivery")).toBeTruthy();
    expect(screen.getByText("Physical invoice requested")).toBeTruthy();
  });
});
