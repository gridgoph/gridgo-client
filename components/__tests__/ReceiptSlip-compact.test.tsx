import { render, screen } from "@testing-library/react-native";

import { ReceiptSlip } from "@/components/ReceiptSlip";
import type { ReceiptView } from "@/lib/receipt";

const view: ReceiptView = {
  invoiceNumber: "GG-20261108-497917C779B0",
  orderId: "ord_497917c779b0",
  orderReference: "4979-17C7-79B0",
  issuedAt: "2026-11-08T14:13:00.000Z",
  lines: [{ id: "line_1", name: "Flyers", quantity: 1, amountLabel: "₱580.00" }],
  money: {
    printingMinor: 58000,
    deliveryFeeMinor: 8900,
    serviceFeeMinor: null,
    serviceFeeRateBps: 1000,
    totalMinor: 66900,
  },
  paymentReference: "1234567890123",
  paidInFull: true,
  paymentStatus: "checking",
};

// Sol's review of #403: on a 360 x 640 phone the invoice id wrapped and pushed the total below the fold.
describe("a compact receipt slip", () => {
  it("sets the invoice id as one line of small metadata", async () => {
    await render(<ReceiptSlip view={view} showServiceFee={false} compact />);
    const invoice = screen.getByText("GG-20261108-497917C779B0");
    expect(invoice.props.numberOfLines).toBe(1);
    expect(screen.getByLabelText("Invoice GG-20261108-497917C779B0")).toBeTruthy();
  });

  it("keeps every figure at its size", async () => {
    await render(<ReceiptSlip view={view} showServiceFee={false} compact />);
    expect(screen.getByText("₱669.00")).toBeTruthy();
    expect(screen.getAllByText("₱580.00").length).toBe(2);
    expect(screen.getByText("1234567890123")).toBeTruthy();
  });

  it("leaves a full-size slip's invoice row as it was", async () => {
    await render(<ReceiptSlip view={view} showServiceFee={false} />);
    expect(screen.getByText("GG-20261108-497917C779B0").props.numberOfLines).toBeUndefined();
  });
});
