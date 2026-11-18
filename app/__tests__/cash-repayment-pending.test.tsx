import { screen } from "@testing-library/react-native";
import CashRepaymentScreen from "@/app/order/cash-repayment";
import { useCashRepayment } from "@/store/cashRepayment";
import { usePlatformSettings } from "@/store/platformSettings";
import { CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: "ord_cash" }), useRouter: () => ({ back: jest.fn() }),
  useFocusEffect: (effect: () => void) => { const { useEffect } = jest.requireActual("react"); useEffect(effect, [effect]); },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getOrderCash: async () => ({ version: 6, status: "cash_debt", amountDueMinor: 10350, noShowApprovedAt: "2026-11-18T10:00:00Z", repaymentConfirmedAt: null, repayment: { status: "pending", submittedAt: "2026-11-18T11:00:00Z", rejectedAt: null, rejectionReason: null } }) }));
jest.mock("@/hooks/usePaymentProof", () => ({ usePaymentProof: () => ({ state: { phase: "empty", fileId: null }, ocr: { status: "idle" }, pick: jest.fn(), reset: jest.fn() }) }));
it("restores pending repayment from GRIDGO without a reference form or another payment ask", async () => {
  useCashRepayment.getState().reset();
  usePlatformSettings.getState().adopt(CHECKOUT_SETTINGS);
  await renderInSafeArea(<CashRepaymentScreen />);
  await screen.findByText("Repayment with Operations");
  expect(screen.queryByLabelText("Payment reference")).toBeNull();
  expect(screen.queryByText("Review repayment")).toBeNull();
  expect(screen.queryByText("Paid in full")).toBeNull();
});
