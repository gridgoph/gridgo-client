import { cleanup, screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { DATE_MID, datedBasket, placedBasket } from "@/test/multiShopFixtures";
import { groupOrder, renderPhone } from "@/test/multiShopOrderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, setParams: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_b" }),
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

jest.mock("@/lib/osrm", () => {
  const actual = jest.requireActual("@/lib/osrm");
  return { ...actual, fetchRoute: jest.fn(async () => ({ routed: false, coordinates: [] })) };
});

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    // No handover credential: an order made ready before the switch (gridgo-api#125).
    getOrderHandover: jest.fn(async () => null),
    getBasket: jest.fn(),
    getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
    listCatalog: jest.fn(async () => []),
    listZones: jest.fn(async () => []),
    listOrderRefunds: jest.fn(async () => []),
    getSettings: jest.fn(async () => ({ issueWindowHours: 24, serviceFeeRateBps: 1000, deliveryFeeBands: [] })),
    getRiderLocation: jest.fn(async () => null),
    getFileDownloadUrl: jest.fn(async () => {
      throw new Error("no file");
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

/*
 * One order view for a multi-shop basket (gridgo-api#117): the selected
 * group's own progress, with every group's state above it.
 */
describe("OrderDetailScreen, one group of several shops", () => {
  it("shows every shop group's state and which one is on screen", async () => {
    api.getOrder.mockResolvedValue(groupOrder());
    api.getBasket.mockResolvedValue(placedBasket(["delivered", "production", "out_for_delivery"]));
    await renderPhone(<OrderDetailScreen />);

    expect(await screen.findByText("One order, 3 shops")).toBeTruthy();
    expect(screen.getByLabelText("Shop A. Needed by Mon 26 Oct. Delivered.")).toBeTruthy();
    expect(screen.getByLabelText("Shop B. Needed by Mon 26 Oct. In production. Showing now.")).toBeTruthy();
    expect(screen.getByLabelText("Shop C. Needed by Mon 26 Oct. Out for delivery.")).toBeTruthy();
    expect(screen.getByText("Viewing")).toBeTruthy();
    expect(api.getBasket).toHaveBeenCalledWith("bsk_1");
    expect(screen.queryByText(/was cancelled/)).toBeNull();
  });

  it("says plainly when this group was cancelled, and asks nothing about the shared payment", async () => {
    api.getOrder.mockResolvedValue(
      groupOrder({
        state: "cancelled",
        payments: {
          initial: {
            amountMinor: 24800,
            method: "qr_manual",
            status: "pending_confirmation",
            reference: "1012345678903",
            submittedAt: "2026-10-05T07:00:00.000Z",
            confirmedAt: null,
          },
        },
      }),
    );
    api.getBasket.mockResolvedValue(placedBasket(["initial_payment_review", "cancelled", "initial_payment_review"]));
    await renderPhone(<OrderDetailScreen />);

    expect(await screen.findByText(/^Shop B was cancelled\./)).toBeTruthy();
    expect(screen.getByLabelText("Shop B. Needed by Mon 26 Oct. Cancelled. Showing now.")).toBeTruthy();
    expect(screen.queryByText(/We are checking your payment/)).toBeNull();
    expect(screen.queryByText("Show payment QR")).toBeNull();
  });

  it("lists each group with its own date, soonest first (gridgo-client#189)", async () => {
    api.getOrder.mockResolvedValue(groupOrder({ deadline: DATE_MID }));
    api.getBasket.mockResolvedValue(datedBasket(["production", "production", "delivered"]));
    await renderPhone(<OrderDetailScreen />);

    expect(await screen.findByText("One order, 2 shops on 3 dates")).toBeTruthy();
    const rows = screen.getAllByRole("tab").map((node) => node.props.accessibilityLabel as string);
    expect(rows).toEqual([
      "Shop A. Needed by Mon 12 Oct. Delivered.",
      "Shop B. Needed by Fri 16 Oct. In production. Showing now.",
      "Shop A. Needed by Tue 20 Oct. In production.",
    ]);
  });

  it("keeps the order on screen when the basket cannot be read", async () => {
    api.getOrder.mockResolvedValue(groupOrder());
    api.getBasket.mockRejectedValue(new Error("offline"));
    await renderPhone(<OrderDetailScreen />);

    expect(await screen.findByText("One order, several parts")).toBeTruthy();
    expect(screen.getByText("Custom apparel")).toBeTruthy();
    expect(screen.getAllByText("Shop B").length).toBeGreaterThan(0);
  });
});
