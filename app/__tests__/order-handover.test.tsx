import { screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { deliveryHandover, hubHandover } from "@/test/handoverFixtures";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// The tracking card routes through OSRM; nothing here may reach the network.
jest.mock("@/lib/osrm", () => ({
  ...jest.requireActual("@/lib/osrm"),
  fetchRoute: jest.fn(async () => null),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const onTheShelf = { fulfillmentMode: "pickup" as const, state: "awaiting_collection" };

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
  api.getSettings.mockResolvedValue({ hubPickupEnabled: false, issueWindowHours: 24, deliveryFeeBands: [] });
  api.getOrderHandover.mockReset();
});

describe("a hub pick-up on the shelf", () => {
  it("keeps existing pickup QR, code and collection hours available while new pickup is off", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(hubHandover());
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("Show both to the hub staff")).toBeTruthy();
    expect(screen.getByLabelText("Claim QR code for the hub staff to scan")).toBeTruthy();
    expect(screen.getByText("482 913")).toBeTruthy();
    expect(screen.getByLabelText("Matching code: 4 8 2, 9 1 3")).toBeTruthy();
    expect(screen.getByText(/The staff scan the QR, then check that the code under it matches/)).toBeTruthy();
    expect(screen.getByText(/If the staff say the codes do not match, nothing is handed over/)).toBeTruthy();
    expect(screen.getByText("Mon, Wed, Fri · 9:00 AM – 5:00 PM")).toBeTruthy();
    expect(api.getOrderHandover).toHaveBeenCalledWith("ord_refund_1");
    // The credential replaces the old "give your name" counter card.
    expect(screen.queryByText("READY AT THE COUNTER")).toBeNull();
    // Nothing is missed yet, so nothing nags and nothing offers a way out.
    expect(screen.queryByText(/hub day/)).toBeNull();
    expect(screen.queryByText("Ask for redelivery")).toBeNull();
  });

  it("reminds after one missed hub day", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(hubHandover({ missedDays: 1 }));
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("1 hub day missed")).toBeTruthy();
    expect(screen.queryByText("Ask for redelivery")).toBeNull();
  });

  it("warns after two missed hub days", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(hubHandover({ missedDays: 2 }));
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("2 hub days missed")).toBeTruthy();
    expect(screen.getByText(/After a third missed day, Operations contacts you/)).toBeTruthy();
    expect(screen.queryByText("Ask for redelivery")).toBeNull();
  });

  it("offers redelivery at the client's cost after three, and says it is not forfeited", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(hubHandover({ missedDays: 3, operationsRequired: true }));
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("3 hub days missed")).toBeTruthy();
    expect(screen.getByText(/is not forfeited/)).toBeTruthy();
    expect(screen.getByText("Ask for redelivery")).toBeTruthy();
    // Still collectable while Operations follows up.
    expect(screen.getByText("482 913")).toBeTruthy();
  });

  it("says a redelivery request is with Operations, and does not offer it twice", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(
      hubHandover({
        missedDays: 3,
        operationsRequired: true,
        redeliveryRequest: { status: "pending_operations", costAccepted: true, at: "2026-10-06T02:00:00Z" },
      }),
    );
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("Redelivery requested")).toBeTruthy();
    expect(screen.queryByText("Ask for redelivery")).toBeNull();
  });

  it("holds the order while an older order's balance is owed, and still shows the codes", async () => {
    const order = refundOrder(onTheShelf);
    api.getOrder.mockResolvedValue({
      ...order,
      downpaymentPercent: 75,
      balanceMinor: 28750,
      payments: {
        downpayment: { ...order.payments!.initial!, amountMinor: 86250 },
        balance: { ...order.payments!.final_online!, amountMinor: 28750, status: "not_submitted" },
      },
    });
    api.getOrderHandover.mockResolvedValue(hubHandover());
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("HELD AT GRIDGO OFFICE")).toBeTruthy();
    expect(screen.getByText("Pay the balance before you travel")).toBeTruthy();
    expect(screen.getByText("482 913")).toBeTruthy();
  });

  it("keeps the counter card for an order made ready before the handover switch", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockResolvedValue(null);
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("READY AT THE COUNTER")).toBeTruthy();
    expect(screen.queryByLabelText("Claim QR code for the hub staff to scan")).toBeNull();
  });

  it("says the claim code did not load rather than sending the client without it", async () => {
    api.getOrder.mockResolvedValue(refundOrder(onTheShelf));
    api.getOrderHandover.mockRejectedValue(new Error("offline"));
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("Your claim code did not load")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText("READY AT THE COUNTER")).toBeNull();
  });

  it("asks for no code while the rider is still bringing it to the hub", async () => {
    api.getOrder.mockResolvedValue(refundOrder({ fulfillmentMode: "pickup", state: "out_for_delivery" }));
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findAllByText("On the way to GRIDGO Office")).toBeTruthy();
    expect(api.getOrderHandover).not.toHaveBeenCalled();
  });
});

describe("a delivery with a rider on the way", () => {
  it("shows the same code the rider sees, and what to do if they differ", async () => {
    api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
    api.getOrderHandover.mockResolvedValue(deliveryHandover());
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findByText("Match this code with your rider")).toBeTruthy();
    expect(screen.getByLabelText("Handover code: 4 8 2, 9 1 3")).toBeTruthy();
    expect(screen.getByText("If the codes do not match")).toBeTruthy();
    expect(
      screen.getByText("Do not accept the order. The rider reports it to Operations, who contact you."),
    ).toBeTruthy();
    expect(screen.getByText("Tell Operations the codes do not match")).toBeTruthy();
    // A door code is never a QR.
    expect(screen.queryByLabelText("Claim QR code for the hub staff to scan")).toBeNull();
  });

  it("draws no code card when the order has no credential", async () => {
    api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
    api.getOrderHandover.mockResolvedValue(null);
    await renderScreen(<OrderDetailScreen />);

    expect(await screen.findAllByText(/Out for delivery/i)).toBeTruthy();
    expect(screen.queryByText("Match this code with your rider")).toBeNull();
  });
});
