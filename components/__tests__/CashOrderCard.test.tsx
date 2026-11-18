import { render, screen } from "@testing-library/react-native";
import { CashOrderCard } from "@/components/CashOrderCard";
import type { CashDetail, Order } from "@/lib/api";
const order = { id: "cash-order", totalMinor: 6900, cash: { method: "cash", status: "online_repayment_required", version: 2 } } as Order;
const detail = { version: 2, amountDueMinor: 6900, noShowApprovedAt: "2026-11-18T10:00:00Z", repaymentConfirmedAt: null } as CashDetail;
it("says the exact debt and why cash is barred, with a repayment action", async () => {
  await render(<CashOrderCard order={order} detail={detail} onRepay={jest.fn()} />);
  expect(screen.getByText("₱69.00 owed online")).toBeTruthy();
  expect(screen.getByText(/Repay the order and its delivery fare online/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Repay online" })).toBeTruthy();
});
it("shows the server's pending state without asking the client to transfer again", async () => {
  await render(<CashOrderCard order={order} detail={{ ...detail, repayment: { status: "pending", submittedAt: "2026-11-18T10:00:00Z", rejectedAt: null, rejectionReason: null } }} onRepay={jest.fn()} />);
  expect(screen.getByText("Repayment with Operations")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Repay online" })).toBeNull();
});
it("explains rejection and lets the client send replacement proof", async () => {
  await render(<CashOrderCard order={order} detail={{ ...detail, repayment: { status: "rejected", submittedAt: null, rejectedAt: "2026-11-18T11:00:00Z", rejectionReason: "Reference does not match the transfer" } }} onRepay={jest.fn()} />);
  expect(screen.getByText("Reference does not match the transfer")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Repay online" })).toBeTruthy();
});
it("does not guess repayment availability when the cash read failed", async () => {
  await render(<CashOrderCard order={order} detail="error" onRetry={jest.fn()} onRepay={jest.fn()} />);
  expect(screen.getByText("Cash status did not load")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Repay online" })).toBeNull();
});
