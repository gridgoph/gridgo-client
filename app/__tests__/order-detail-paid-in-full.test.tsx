import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderDetailScreen from "@/app/order/[id]";
import type { Order } from "@/lib/api";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockStackOptions = jest.fn((_options: unknown) => null);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: mockBack,
    canGoBack: () => mockCanGoBack(),
  }),
  // The screen sets its own header options when there is no history behind it.
  // Only the options matter here, so the element renders nothing.
  Stack: {
    Screen: ({ options }: { options: unknown }) =>
      mockStackOptions(options) ?? null,
  },
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

// The delivery map routes through OSRM. Tests must not touch the network, and
// the route the card draws should be a fact of the test, not of the internet.
jest.mock("@/lib/osrm", () => {
  const actual = jest.requireActual("@/lib/osrm");
  return { ...actual, fetchRoute: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const osrm = require("@/lib/osrm");

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    getTaxonomy: jest.fn(async () => ({
      categories: [],
      materials: [],
      finishes: [],
    })),
    listCatalog: jest.fn(),
    listZones: jest.fn(),
    listIssues: jest.fn(),
    getSettings: jest.fn(),
    getRiderLocation: jest.fn(),
    getFileDownloadUrl: jest.fn(),
    submitPayment: jest.fn(),
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
  // The captain's worked example: a ₱1,000 supplier price reaches the client
  // as ₱1,100 print + ₱25 delivery = ₱1,125. Commission is nowhere in it.
  subtotalMinor: 110000,
  deliveryFeeMinor: 2500,
  totalMinor: 112500,
  downpaymentMinor: 84375,
  balanceMinor: 28125,
  priceRange: {
    subtotalMinMinor: 110000,
    subtotalMaxMinor: 110000,
    deliveryFeeStatus: "final",
  },
  payments: {
    downpayment: {
      amountMinor: 84375,
      method: "qr_manual",
      status: "confirmed",
      reference: "GCASH-ABC123",
      submittedAt: "2026-08-09T09:00:00+08:00",
      confirmedAt: "2026-08-09T09:30:00+08:00",
    },
    balance: {
      amountMinor: 28125,
      method: "qr_manual",
      status: "not_submitted",
      reference: null,
      submittedAt: null,
      confirmedAt: null,
    },
  },
  payoutMilestones: [
    {
      code: "printing",
      sharePercent: 50,
      status: "pof_attached",
      pofFileIds: ["file_pof_1"],
    },
    {
      code: "packaging_qc",
      sharePercent: 15,
      status: "pending_pof",
      pofFileIds: [],
    },
    {
      code: "delivered",
      sharePercent: 25,
      status: "pending_pof",
      pofFileIds: [],
    },
    {
      code: "retention",
      sharePercent: 10,
      status: "pending_pof",
      pofFileIds: [],
    },
  ],
  paymentMethod: "qr_manual",
  paymentStatus: "downpayment_confirmed",
  promisedDate: null,
  artworkName: "opening-banner.pdf",
  artworkFileIds: [],
  createdAt: "2026-08-08T10:00:00+08:00",
  updatedAt: "2026-08-09T10:00:00+08:00",
  timeline: [
    {
      at: "2026-08-08T10:00:00+08:00",
      state: "submitted",
      by: "user_client",
      note: "",
    },
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


/** A new order: 100% up front, the balance marked `not_required`. */
function paidInFull(state: string, initialStatus: string, patch: Partial<Order> = {}): Order {
  return {
    ...baseOrder,
    state,
    downpaymentPercent: 100,
    downpaymentMinor: 112500,
    balanceMinor: 0,
    paymentStatus: initialStatus === "confirmed" ? "downpayment_confirmed" : "unpaid",
    payments: {
      initial: {
        amountMinor: 112500,
        method: "qr_manual",
        status: initialStatus,
        reference: initialStatus === "not_submitted" ? null : "GCASH-FULL1",
        submittedAt: initialStatus === "not_submitted" ? null : "2026-09-25T09:00:00+08:00",
        confirmedAt: initialStatus === "confirmed" ? "2026-09-25T09:30:00+08:00" : null,
      },
      final_online: {
        amountMinor: 0,
        method: "qr_manual",
        status: "not_required",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
    },
    ...patch,
  };
}

/** Nothing on the screen may promise a second payment. */
function expectNoSplit() {
  expect(screen.queryByText(/downpayment/i)).toBeNull();
  expect(screen.queryByText(/balance/i)).toBeNull();
  expect(screen.queryByText(/75%|25%/)).toBeNull();
  expect(screen.queryByText(/pay the remaining/i)).toBeNull();
  expect(screen.queryByText(/final payment/i)).toBeNull();
}

describe("OrderDetailScreen, paid in full", () => {
  beforeEach(() => {
    mockStackOptions.mockClear();
    mockCanGoBack.mockReturnValue(true);
    api.listCatalog.mockResolvedValue([]);
    api.listZones.mockResolvedValue([]);
    api.listIssues.mockResolvedValue([]);
    api.getSettings.mockResolvedValue({
      issueWindowHours: 24,
      serviceFeeRateBps: 0,
      deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
    });
    api.getRiderLocation.mockResolvedValue(null);
    api.getFileDownloadUrl.mockRejectedValue(new Error("no file"));
    osrm.fetchRoute.mockResolvedValue({
      routed: true,
      distanceMetres: 4200,
      durationSeconds: 600,
      coordinates: [],
      statusLabel: null,
    });
  });

  it("asks for the whole total once, as a payment in full", async () => {
    api.getOrder.mockResolvedValue(paidInFull("awaiting_initial_payment", "not_submitted"));
    await renderInSafeArea(<OrderDetailScreen />);

    // Chip and panel heading both say what is owed, without a split.
    expect(await screen.findByText("Payment due")).toBeTruthy();
    expect(screen.getAllByText("Pay in full").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₱1,125.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Show payment QR")).toBeTruthy();
    expectNoSplit();
  });

  it("says it is checking the payment, not a downpayment", async () => {
    api.getOrder.mockResolvedValue(paidInFull("initial_payment_review", "pending_confirmation"));
    await renderInSafeArea(<OrderDetailScreen />);

    expect((await screen.findAllByText(/We are checking your payment/)).length).toBeGreaterThan(0);
    expect(screen.getByText("GCASH-FULL1")).toBeTruthy();
    // Submitting is not paying.
    expect(screen.queryByText(/paid in full/i)).toBeNull();
    expectNoSplit();
  });

  it("reads paid in full on the money card and the history, with no balance step", async () => {
    api.getOrder.mockResolvedValue(
      paidInFull("out_for_delivery", "confirmed", {
        timeline: [
          { at: "2026-09-25T09:30:00+08:00", state: "payment_authorized", by: "user_ops", note: "" },
          { at: "2026-09-25T12:00:00+08:00", state: "out_for_delivery", by: "user_rider", note: "" },
        ],
      }),
    );
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Paid in full · Confirmed")).toBeTruthy();
    expect(screen.getByText("Payment confirmed")).toBeTruthy();
    // Out for delivery with nothing owed: no payment panel at all.
    expect(screen.queryByText("Show payment QR")).toBeNull();
    expect(screen.queryByText(/not needed/i)).toBeNull();
    expectNoSplit();
  });

  it("does not crash on a payment status added after this build", async () => {
    api.getOrder.mockResolvedValue(
      paidInFull("production", "some_future_status", {
        payments: {
          initial: { ...paidInFull("production", "confirmed").payments!.initial!, status: "some_future_status" },
          final_online: { ...paidInFull("production", "confirmed").payments!.final_online!, status: "another_one" },
        },
      }),
    );
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    expectNoSplit();
  });

  it("keeps a legacy 75/25 order's balance step exactly as it was", async () => {
    api.getOrder.mockResolvedValue({ ...baseOrder, state: "out_for_delivery" });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Final payment due")).toBeTruthy();
    expect(screen.getByText("Downpayment · Confirmed")).toBeTruthy();
    expect(screen.getByText("Balance · Not paid yet")).toBeTruthy();
    expect(screen.getAllByText("₱281.25").length).toBeGreaterThan(0);
  });
});
