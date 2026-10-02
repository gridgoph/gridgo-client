import { render, screen } from "@testing-library/react-native";

import { RefundBreakdownCard } from "@/components/refund/RefundBreakdownCard";
import { PARTIAL_SETTLEMENT, refundOrder } from "@/test/refundFixtures";
import { expectNoServiceFee, setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

// The refund brief's partial refund: Printing ₱660 (₱600 principal + ₱60
// returned fee) + Delivery ₱50 = ₱710, whichever way the switch is set.
function expectSameMoney() {
  expect(screen.getByText("₱660.00")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getAllByText(/₱710\.00/).length).toBeGreaterThan(0);
  expect(screen.queryByText("₱60.00")).toBeNull();
}

it("shows no sign of a service fee in the refund breakdown while Operations hides it", async () => {
  setServiceFeeSwitch(false);
  await render(<RefundBreakdownCard settlement={PARTIAL_SETTLEMENT} order={refundOrder()} />);

  expectSameMoney();
  expectNoServiceFee(screen);
});

it("names the returned fee's rate when Operations shows it", async () => {
  setServiceFeeSwitch(true);
  await render(<RefundBreakdownCard settlement={PARTIAL_SETTLEMENT} order={refundOrder()} />);

  expectSameMoney();
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
});
