import { invalidate } from "@/lib/live";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderDetailScreen from "@/app/order/[id]";
import type { Order } from "@/lib/api";
import { useOrderPayment } from "@/store/checkoutPayment";

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

function setOrder(patch: Partial<Order>) {
  api.getOrder.mockResolvedValue({ ...baseOrder, ...patch });
}

describe("OrderDetailScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockStackOptions.mockClear();
    mockCanGoBack.mockReturnValue(true);
    setOrder({});
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
        active: true,
      },
    ]);
    api.listIssues.mockResolvedValue([]);
    api.getSettings.mockResolvedValue({
      issueWindowHours: 24,
      deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
    });
    api.submitPayment.mockImplementation(async () => ({
      ...baseOrder,
      state: "downpayment_review",
    }));
    api.getRiderLocation.mockResolvedValue(null);
    api.getFileDownloadUrl.mockRejectedValue(new Error("no file"));
    osrm.fetchRoute.mockResolvedValue({
      routed: true,
      distanceMetres: 4200,
      durationSeconds: 600,
      coordinates: [
        [125.6085, 7.064],
        [125.6137, 7.0853],
      ],
      statusLabel: null,
    });
  });

  it("updates an already open order from a silent event without push or navigation", async () => {
    setOrder({ title: "Before the server update" });
    await renderInSafeArea(<OrderDetailScreen />);
    expect(await screen.findByText("Before the server update")).toBeTruthy();
    setOrder({ title: "Updated by Operations" });
    await act(async () => {
      invalidate("orders");
    });
    await waitFor(() =>
      expect(screen.getByText("Updated by Operations")).toBeTruthy(),
    );
  });

  it("ignores an older focus response after a newer live read", async () => {
    let finishCatalog!: (catalog: unknown[]) => void;
    api.listCatalog.mockImplementationOnce(() => new Promise((resolve) => { finishCatalog = resolve; }));
    setOrder({ title: "Old focus response" });
    await renderInSafeArea(<OrderDetailScreen />);
    setOrder({ title: "New live response" });
    await act(async () => { invalidate("orders"); });
    expect(await screen.findByText("New live response")).toBeTruthy();
    await act(async () => { finishCatalog([]); });
    expect(screen.queryByText("Old focus response")).toBeNull();
    expect(screen.getByText("New live response")).toBeTruthy();
  });

  it("keeps a submitted payment after an older live read finishes", async () => {
    const payable: Order = {
      ...baseOrder,
      state: "awaiting_downpayment",
      paymentStatus: "unpaid",
      payments: {
        ...baseOrder.payments!,
        downpayment: {
          ...baseOrder.payments!.downpayment!,
          status: "not_submitted",
          reference: null,
          submittedAt: null,
          confirmedAt: null,
        },
      },
    };
    api.getOrder.mockResolvedValue(payable);
    api.submitPayment.mockResolvedValue({
      ...payable,
      state: "downpayment_review",
      paymentStatus: "downpayment_pending",
      payments: {
        ...payable.payments,
        downpayment: {
          ...payable.payments!.downpayment!,
          status: "pending_confirmation",
          reference: "1234567890123",
          submittedAt: "2026-09-15T10:00:00Z",
        },
      },
    });
    await renderInSafeArea(<OrderDetailScreen />);
    await screen.findByText("Review payment details");

    let finishCatalog!: (catalog: unknown[]) => void;
    api.listCatalog.mockImplementationOnce(() => new Promise((resolve) => {
      finishCatalog = resolve;
    }));
    await act(async () => { invalidate("orders"); });
    await waitFor(() => expect(finishCatalog).toBeDefined());
    // The receipt screenshot is already uploaded; the panel only needs the reference.
    await act(async () => {
      useOrderPayment.getState().setProof({
        phase: "stored", fileName: "receipt.jpg", fileId: "file_proof", localUri: null, progress: 1, error: null,
      });
    });
    await fireEvent.changeText(screen.getByLabelText("Payment reference"), "1234567890123");
    await fireEvent.press(screen.getByText("Review payment details"));
    await fireEvent.press(await screen.findByText("Send receipt for checking"));
    await screen.findAllByText(/We are checking your downpayment/);

    await act(async () => { finishCatalog([]); });
    expect(screen.queryByText("Review payment details")).toBeNull();
    expect(screen.getAllByText(/We are checking your downpayment/).length).toBeGreaterThan(0);
  });

  it("opens a job that never stored a history instead of crashing", async () => {
    setOrder({ timeline: undefined as never });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    expect(
      screen.getByText(/Nothing has happened on this job yet/),
    ).toBeTruthy();
  });

  it("opens with what is happening, in plain language", async () => {
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    // Header says what is happening; the timeline carries the supplier's own note.
    expect(screen.getAllByText(/on the press/i).length).toBeGreaterThan(1);
    // The reference remains visible while the workflow state is human-readable.
    // The reference tag, not the raw key: `ord_demo_1` reads as DEMO_1.
    expect(screen.getByText("DEMO_1")).toBeTruthy();
    expect(screen.queryByText(baseOrder.state, { exact: true })).toBeNull();
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
    expect(
      screen.getAllByText("Bleed is missing on all four edges").length,
    ).toBe(2);
    expect(screen.getByText("Choose a corrected file")).toBeTruthy();
    expect(
      screen.getByText(/history, price and any payment stay/i),
    ).toBeTruthy();
  });

  it("asks for a considered decision on the artwork proof, not a row tap", async () => {
    setOrder({ state: "proof_approval" });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Approve your artwork proof")).toBeTruthy();
    expect(screen.getByText("Approve & continue")).toBeTruthy();
    expect(screen.getByText("Request changes")).toBeTruthy();
  });

  it("does not show undefined items when a checkout order omitted quantity", async () => {
    setOrder({
      title: "Flyers",
      quantity: undefined as unknown as number,
      size: "",
      material: "",
      address: "",
      artworkName: null,
      artworkFileIds: [],
    });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText("Flyers")).toBeTruthy();
    expect(screen.queryByText(/undefined items/i)).toBeNull();
    expect(screen.getByText("Quantity")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the client's money as subtotal, delivery and total — never a commission", async () => {
    await renderInSafeArea(<OrderDetailScreen />);

    await screen.findByText("Grand opening tarpaulin");
    expect(screen.getByText("₱1,100.00")).toBeTruthy();
    expect(screen.getByText("₱25.00")).toBeTruthy();
    expect(screen.getByText("₱1,125.00")).toBeTruthy();
    // The supplier's own price and GRIDGO's 10% are withheld by the server;
    // a screen that renders either has misread the contract.
    expect(screen.queryByText("₱1,000.00")).toBeNull();
    expect(screen.queryByText("₱100.00")).toBeNull();
    expect(screen.queryByText(/commission/i)).toBeNull();
  });

  it("asks for the downpayment by QR, and never for cash or credits", async () => {
    setOrder({
      state: "awaiting_downpayment",
      paymentStatus: "unpaid",
      payments: {
        downpayment: {
          amountMinor: 84375,
          method: "qr_manual",
          status: "not_submitted",
          reference: null,
          submittedAt: null,
          confirmedAt: null,
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
    });
    await renderInSafeArea(<OrderDetailScreen />);

    // The panel leads with the installment and the QR-plus-receipt flow.
    expect(await screen.findByText("Initial payment due")).toBeTruthy();
    // Once as the amount due, once on the money card's ledger below it.
    expect(screen.getAllByText("₱843.75").length).toBeGreaterThan(0);
    expect(screen.getByText("Show payment QR")).toBeTruthy();
    expect(screen.getByText("Review payment details")).toBeTruthy();
    // Cash is named once, to say it is gone — an ex-pilot client would
    // otherwise go looking for it. What must not exist is a way to choose it.
    expect(screen.queryByText(/pay with cash/i)).toBeNull();
    expect(screen.queryByText(/pilot credits/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /cash|credits/i })).toBeNull();
  });

  it("sits in the waiting state honestly while Operations checks a payment", async () => {
    setOrder({
      state: "downpayment_review",
      paymentStatus: "downpayment_pending",
      payments: {
        downpayment: {
          amountMinor: 84375,
          method: "qr_manual",
          status: "pending_confirmation",
          reference: "GCASH-ABC123",
          submittedAt: "2026-08-09T09:00:00+08:00",
          confirmedAt: null,
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
    });
    await renderInSafeArea(<OrderDetailScreen />);

    // Once as the card's heading, once as the line under the job title.
    expect(
      (await screen.findAllByText(/We are checking your downpayment/)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("GCASH-ABC123")).toBeTruthy();
    // Submitting a reference is not paying. Nothing here may say it is.
    expect(screen.queryByText(/paid in full/i)).toBeNull();
  });

  it("shows the supplier's milestones instead of a print proof to approve", async () => {
    await renderInSafeArea(<OrderDetailScreen />);

    await screen.findByText("Grand opening tarpaulin");
    expect(screen.getByText("Printing")).toBeTruthy();
    expect(screen.getByText("Packaging")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    // Retention is a hold-back on someone else's payout, and the shares are
    // shares of the supplier's earnings. Neither is the client's business.
    expect(screen.queryByText(/retention/i)).toBeNull();
    expect(screen.queryByText(/50%|15%|10%/)).toBeNull();
  });

  it("says a delivery has no shared position rather than showing nothing", async () => {
    setOrder({
      state: "out_for_delivery",
      riderId: "user_rider",
      dropoff: { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" },
      // Client-facing: GRIDGO withholds the press's own pin and sends its own.
      pickup: { lat: 7.13267, lng: 125.611265, label: "GRIDGO Office" },
    });
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText(/has not shared a position/i)).toBeTruthy();
    expect(screen.getByText("No location shared")).toBeTruthy();
  });

  it("reports road distance from the rider, and never an ETA", async () => {
    setOrder({
      state: "out_for_delivery",
      riderId: "user_rider",
      dropoff: { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" },
      // Client-facing: GRIDGO withholds the press's own pin and sends its own.
      pickup: { lat: 7.13267, lng: 125.611265, label: "GRIDGO Office" },
    });
    api.getRiderLocation.mockResolvedValue({
      id: "ping_1",
      orderId: "ord_demo_1",
      riderId: "user_rider",
      lat: 7.07,
      lng: 125.611,
      accuracy: null,
      at: new Date().toISOString(),
    });

    await renderInSafeArea(<OrderDetailScreen />);

    expect(
      await screen.findByText(/4\.2 km from your drop-off by road/),
    ).toBeTruthy();
    // OSRM returns a travel time; presenting it would read as a promise.
    expect(screen.queryByText(/10 min|arriv/i)).toBeNull();
    expect(screen.getByText(/does not publish a live ETA/i)).toBeTruthy();
  });

  it("still draws the delivery when OSRM cannot be reached", async () => {
    setOrder({
      state: "out_for_delivery",
      riderId: "user_rider",
      dropoff: { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" },
      // Client-facing: GRIDGO withholds the press's own pin and sends its own.
      pickup: { lat: 7.13267, lng: 125.611265, label: "GRIDGO Office" },
    });
    api.getRiderLocation.mockResolvedValue({
      id: "ping_1",
      orderId: "ord_demo_1",
      riderId: "user_rider",
      lat: 7.07,
      lng: 125.611,
      accuracy: null,
      at: new Date().toISOString(),
    });
    osrm.fetchRoute.mockResolvedValue(
      jest
        .requireActual("@/lib/osrm")
        .fallbackRoute(
          { lat: 7.07, lng: 125.611 },
          { lat: 7.0853, lng: 125.6137 },
        ),
    );

    await renderInSafeArea(<OrderDetailScreen />);

    // Falls back to the straight line, and says which one the client reads.
    expect(await screen.findByText(/in a straight line/i)).toBeTruthy();
    expect(screen.getByLabelText(/Map showing GRIDGO/)).toBeTruthy();
    expect(screen.queryByLabelText(/print shop/i)).toBeNull();
  });

  it("offers a real issue report while the window is open", async () => {
    setOrder({
      state: "issue_window_open",
      issueWindowOpenedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      // Rounded down deliberately, so the card never promises more time than
      // the platform will actually allow: 23h and change reads as "about 23".
      issueWindowExpiresAt: new Date(
        Date.now() + 23 * 60 * 60 * 1000 + 60_000,
      ).toISOString(),
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
    // The platform really expires the window under v2 and stamps the expiry on
    // the order, so both halves of the clock are honest to show.
    expect(
      screen.getByText(/Delivered 1 hour ago · Closes in about 23 hours/),
    ).toBeTruthy();
  });

  it("recovers from a failed load with a retry rather than a blank screen", async () => {
    api.getOrder.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<OrderDetailScreen />);

    expect(await screen.findByText(/Cannot reach the server/i)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  describe("when there is nothing behind this screen", () => {
    // A notification tap, a deep link, or a cold start on this route. The
    // native stack hides its own back control with no history, and an order is
    // not a tab — without a way out the client is left to OS gestures.
    it("puts a way back in the header", async () => {
      mockCanGoBack.mockReturnValue(false);
      await renderInSafeArea(<OrderDetailScreen />);

      await screen.findByText("Grand opening tarpaulin");
      expect(mockStackOptions).toHaveBeenCalled();
      const options = mockStackOptions.mock.calls.at(-1)?.[0] as {
        headerLeft?: unknown;
      };
      expect(typeof options.headerLeft).toBe("function");
    });

    it("leaves the header alone when the stack can go back on its own", async () => {
      await renderInSafeArea(<OrderDetailScreen />);

      await screen.findByText("Grand opening tarpaulin");
      expect(mockStackOptions).not.toHaveBeenCalled();
    });

    it("sends the failed-load escape to Orders rather than into an empty stack", async () => {
      mockCanGoBack.mockReturnValue(false);
      api.getOrder.mockRejectedValue(new Error("Network request failed"));
      await renderInSafeArea(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByText("Back to orders"));

      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/orders");
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  /**
   * Two endings, and the client only sees their own.
   *
   * A collected job is carried between two of GRIDGO's own places. Handing the
   * client a rider to watch dresses an errand of ours up as their delivery, and
   * sends them out of the door while the package is still on the road.
   */
  describe("a collected order", () => {
    const collecting = {
      fulfillmentMode: "pickup" as const,
      pickup: { lat: 7.13267, lng: 125.611265, label: "GRIDGO Office" },
    };

    const settled = {
      downpayment: { ...baseOrder.payments!.downpayment! },
      balance: { ...baseOrder.payments!.balance!, status: "confirmed" as const },
    };

    it("shows no rider while it is being carried to the office", async () => {
      setOrder({ ...collecting, state: "out_for_delivery", payments: settled });
      // Call history carries across tests in this file; only this render counts.
      api.getRiderLocation.mockClear();

      await renderInSafeArea(<OrderDetailScreen />);

      expect(
        await screen.findByText("On the way to GRIDGO Office"),
      ).toBeTruthy();
      expect(screen.queryByText(/out for delivery/i)).toBeNull();
      // Nothing asks the platform where the rider is, so nothing can draw them.
      expect(api.getRiderLocation).not.toHaveBeenCalled();
    });

    it("gives the counter and the address once it is on the shelf", async () => {
      setOrder({
        ...collecting,
        state: "awaiting_collection",
        payments: settled,
      });

      await renderInSafeArea(<OrderDetailScreen />);

      expect(await screen.findByText("READY AT THE COUNTER")).toBeTruthy();
      expect(screen.getByText("Open in Maps")).toBeTruthy();
      // The address they shopped with is not where this job is.
      expect(screen.getByText("Collect at")).toBeTruthy();
      expect(screen.queryByText("Deliver to")).toBeNull();
    });

    it("holds it, rather than calling it ready, while the balance is owed", async () => {
      setOrder({ ...collecting, state: "awaiting_collection" });

      await renderInSafeArea(<OrderDetailScreen />);

      expect(await screen.findByText("HELD AT THE COUNTER")).toBeTruthy();
      expect(screen.queryByText("READY AT THE COUNTER")).toBeNull();
      // The screen's one yellow control is the payment, not the walk.
      expect(screen.getAllByText(/remaining balance/i).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe("a finished job", () => {
    const finished: Partial<Order> = {
      state: "completed",
      riderId: "user_rider",
      paymentStatus: "paid",
      payments: {
        ...baseOrder.payments!,
        balance: {
          ...baseOrder.payments!.balance!,
          status: "confirmed",
          reference: "GCASH-XYZ789",
          submittedAt: "2026-08-11T09:00:00+08:00",
          confirmedAt: "2026-08-11T09:30:00+08:00",
        },
      },
      timeline: [
        ...baseOrder.timeline,
        { at: "2026-08-11T16:12:00+08:00", state: "delivered", by: "user_rider", note: "" },
        { at: "2026-08-11T16:12:00+08:00", state: "issue_window_open", by: "system", note: "" },
        {
          at: "2026-08-12T16:12:00+08:00",
          state: "completed",
          by: "system",
          note: "Issue window expired with no active claim",
        },
      ],
    };

    it("says the job is complete and that nothing was wrong, instead of a shrug", async () => {
      setOrder(finished);

      await renderInSafeArea(<OrderDetailScreen />);

      expect(await screen.findByText("Job complete")).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByText(/check window closed with nothing reported/)).toBeTruthy(),
      );
      expect(screen.getByText("Closed, nothing reported")).toBeTruthy();
      expect(screen.getByText("Paid in full, ₱1,125.00")).toBeTruthy();
      // The old one-liner and the "we will tell your phone" offer both belong
      // to a job that is still going.
      expect(screen.queryByText("This job is closed.")).toBeNull();
      expect(screen.queryByText("Get these on your phone")).toBeNull();
      expect(screen.queryByText("Get GRIDGO news on this phone")).toBeNull();
      // The rating prompt stays the finished job's one action.
      expect(screen.getByText("How did it go?")).toBeTruthy();
    });

    it("tells a client who reported a problem that it was settled, not that nothing happened", async () => {
      setOrder(finished);
      api.listIssues.mockResolvedValue([
        {
          id: "iss_1",
          orderId: "ord_demo_1",
          clientId: "user_client",
          description: "Colour is washed out across all 200 flyers",
          kind: "material_quality",
          status: "resolved",
          createdAt: "2026-08-11T18:00:00+08:00",
          updatedAt: "2026-08-12T09:00:00+08:00",
          resolvedAt: "2026-08-12T09:00:00+08:00",
          resolution: "Reprinted",
        },
      ]);

      await renderInSafeArea(<OrderDetailScreen />);

      expect(await screen.findByText("Job complete")).toBeTruthy();
      expect(await screen.findByText(/problem you reported was settled/)).toBeTruthy();
      expect(screen.queryByText(/nothing reported/)).toBeNull();
    });

    it("speaks of collecting for a job fetched from the counter", async () => {
      setOrder({ ...finished, fulfillmentMode: "pickup" });

      await renderInSafeArea(<OrderDetailScreen />);

      expect(await screen.findByText("Job complete")).toBeTruthy();
      expect(await screen.findByText(/collected at GRIDGO Office/)).toBeTruthy();
      // The fact row and the timeline entry both say it; neither says delivered
      // to a person who fetched the job themselves.
      expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
      expect(screen.queryByText(/was delivered/)).toBeNull();
    });
  });
});
