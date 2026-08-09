import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderDetailScreen from "@/app/order/[id]";
import type { Order } from "@/lib/api";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: "ord_demo_1" }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    listOrders: jest.fn(),
    creditBalance: jest.fn(),
    listCatalog: jest.fn(),
    listZones: jest.fn(),
    listIssues: jest.fn(),
    getRiderLocation: jest.fn(),
    getFileDownloadUrl: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const baseOrder: Order = {
  id: "ord_demo_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: null,
  state: "production",
  productId: "prod_tarpaulin",
  title: "Grand opening tarpaulin",
  quantity: 2,
  size: "3x6 ft",
  material: "13oz tarpaulin",
  deadline: "2026-08-15T10:00:00+08:00",
  address: "12 J.P. Laurel Ave, Bajada, Davao City",
  zone: "davao_central",
  totalMinor: 90000,
  deliveryFeeMinor: 15100,
  paymentMethod: "pilot_credit",
  paymentStatus: "authorized",
  codEligible: true,
  promisedDate: null,
  artworkName: "opening-banner.pdf",
  artworkFileIds: [],
  createdAt: "2026-08-08T10:00:00+08:00",
  updatedAt: "2026-08-09T10:00:00+08:00",
  timeline: [
    { at: "2026-08-08T10:00:00+08:00", state: "submitted", by: "user_client", note: "" },
    {
      at: "2026-08-09T10:00:00+08:00",
      state: "production",
      by: "user_supplier",
      note: "On the press this afternoon",
    },
  ],
};

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

function setOrder(patch: Partial<Order>) {
  api.getOrder.mockResolvedValue({ ...baseOrder, ...patch });
}

describe("OrderDetailScreen", () => {
  beforeEach(() => {
    setOrder({});
    api.listOrders.mockResolvedValue([]);
    api.creditBalance.mockResolvedValue({ clientId: "user_client", balanceMinor: 500000, ledger: [] });
    api.listCatalog.mockResolvedValue([
      {
        id: "prod_tarpaulin",
        name: "Tarpaulin / Banner",
        family: "banner",
        basePriceMinor: 45000,
        unit: "sqm",
      },
    ]);
    api.listZones.mockResolvedValue([
      {
        id: "zone_central",
        code: "davao_central",
        name: "Davao Central (Bajada / JP Laurel)",
        deliveryFeeMinor: 15100,
        active: true,
      },
    ]);
    api.listIssues.mockResolvedValue([]);
    api.getRiderLocation.mockResolvedValue(null);
    api.getFileDownloadUrl.mockRejectedValue(new Error("no file"));
  });

  it("opens with what is happening, in plain language", async () => {
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    // Header says what is happening; the timeline carries the supplier's own note.
    expect(screen.getAllByText(/on the press/i).length).toBeGreaterThan(1);
    // No snake_case state, enum or error code reaches the screen.
    expect(screen.queryByText(/[a-z]+_[a-z]+/)).toBeNull();
  });

  it("shows the operations note and the actor on the timeline", async () => {
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("On the press this afternoon")).toBeTruthy();
    expect(screen.getByText(/Supplier ·/)).toBeTruthy();
  });

  it("turns a rejection into a correction on the same job", async () => {
    setOrder({
      state: "client_correction",
      timeline: [
        ...baseOrder.timeline,
        {
          at: "2026-08-09T11:00:00+08:00",
          state: "client_correction",
          by: "user_ops",
          note: "Bleed is missing on all four edges",
        },
      ],
    });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Replace the artwork")).toBeTruthy();
    // Shown as the reason to act on, and kept on the record below.
    expect(screen.getAllByText("Bleed is missing on all four edges").length).toBe(2);
    expect(screen.getByText("Choose a corrected file")).toBeTruthy();
    expect(screen.getByText(/history, price and any payment stay/i)).toBeTruthy();
  });

  it("asks for a considered decision on a proof, not a row tap", async () => {
    setOrder({ state: "supplier_proof_review", proofFileIds: ["file_proof_1"] });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Approve the print proof")).toBeTruthy();
    expect(screen.getByText("Approve & continue")).toBeTruthy();
    expect(screen.getByText("Request changes")).toBeTruthy();
  });

  it("says a delivery has no shared position rather than showing nothing", async () => {
    setOrder({
      state: "out_for_delivery",
      riderId: "user_rider",
      dropoff: { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" },
      pickup: { lat: 7.064, lng: 125.6085, label: "PrintRight Davao" },
    });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText(/has not shared a position/i)).toBeTruthy();
    expect(screen.getByText("No location shared")).toBeTruthy();
  });

  it("offers a real issue report while the window is open", async () => {
    setOrder({
      state: "issue_window_open",
      timeline: [
        ...baseOrder.timeline,
        {
          at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          state: "issue_window_open",
          by: "system",
          note: "",
        },
      ],
    });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Report a problem")).toBeTruthy();
    expect(screen.getByText(/Delivered 1 hour ago/)).toBeTruthy();
    // A countdown would imply an expiry no server enforces.
    expect(screen.queryByText(/remaining|left to report/i)).toBeNull();
  });

  it("recovers from a failed load with a retry rather than a blank screen", async () => {
    api.getOrder.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText(/Cannot reach the server/i)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
