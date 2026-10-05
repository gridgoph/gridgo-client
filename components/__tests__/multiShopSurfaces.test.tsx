import { cleanup, render, screen } from "@testing-library/react-native";

import { OrderCard } from "@/components/OrderCard";
import { ReceiptSlip } from "@/components/ReceiptSlip";
import { receiptFromInvoice, withGroupStanding } from "@/lib/receipt";
import { combinedInvoice, placedBasket } from "@/test/multiShopFixtures";
import { groupOrder } from "@/test/multiShopOrderScreen";

afterEach(async () => {
  await cleanup();
});

describe("ReceiptSlip, one receipt for several shops", () => {
  it("prints a section per shop group and adds them to one total", async () => {
    const view = withGroupStanding(
      { ...receiptFromInvoice(combinedInvoice()), paymentStatus: "confirmed", paidInFull: true },
      placedBasket(["delivered", "cancelled", "production"]).groups,
    );
    await render(<ReceiptSlip view={view} showServiceFee={false} />);

    expect(screen.getByTestId("receipt-group-A")).toBeTruthy();
    expect(screen.getByTestId("receipt-group-B")).toBeTruthy();
    expect(screen.getByTestId("receipt-group-C")).toBeTruthy();
    expect(screen.getByText("₱465.00")).toBeTruthy();
    expect(screen.getByText("Delivery · 3 shops")).toBeTruthy();
    expect(screen.getByText("₱717.20")).toBeTruthy();
    expect(screen.getByText("₱817.20")).toBeTruthy();
    expect(screen.getByText("Paid in full by QR")).toBeTruthy();
    // Only the cancelled group is marked, beside figures that stay as paid.
    expect(screen.getAllByText(/^Cancelled after you placed the order/)).toHaveLength(1);
  });
});

describe("OrderCard, one group of a multi-shop order", () => {
  it("carries the group's letter, never a shop", async () => {
    await render(<OrderCard order={groupOrder()} onPress={() => undefined} />);

    expect(screen.getByText("Shop B · multi-shop")).toBeTruthy();
    expect(screen.getByLabelText(/^Custom apparel, Shop B of a multi-shop order, /)).toBeTruthy();
  });

  it("is unchanged for a single-shop order", async () => {
    await render(<OrderCard order={groupOrder({ basketId: null, groupLabel: null })} onPress={() => undefined} />);

    expect(screen.queryByText(/multi-shop/)).toBeNull();
  });
});
