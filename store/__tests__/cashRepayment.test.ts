import * as api from "@/lib/api";
import { useCashRepayment } from "@/store/cashRepayment";
import { useCashPayment } from "@/store/checkoutPayment";
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getOrderCash: jest.fn(), submitCashRepayment: jest.fn() }));
const detail = { version: 3, status: "cash_debt", amountDueMinor: 6900, noShowApprovedAt: "2026-11-18T10:00:00Z", collectedAt: null, repaymentConfirmedAt: null };
beforeEach(() => {
  jest.clearAllMocks();
  useCashRepayment.getState().reset();
  useCashPayment.getState().bind("ord_1");
  useCashPayment.getState().setReference("1234567890123");
  useCashPayment.getState().setProof({ phase: "stored", fileName: "proof.jpg", fileId: "proof", localUri: null, progress: 1, error: null });
  jest.mocked(api.getOrderCash).mockResolvedValue(detail);
});
it("submits the server's exact amount and version and shows pending without calling it paid", async () => {
  await useCashRepayment.getState().load("ord_1");
  jest.mocked(api.submitCashRepayment).mockResolvedValue({ version: 4, status: "cash_debt", repayment: { status: "pending", submittedAt: "2026-11-18T11:00:00Z", rejectedAt: null, rejectionReason: null } });
  await useCashRepayment.getState().submit("ord_1");
  expect(api.submitCashRepayment).toHaveBeenCalledWith("ord_1", { expectedVersion: 3, amountMinor: 6900, reference: "1234567890123", proofFileId: "proof" }, expect.any(String));
  expect(useCashRepayment.getState().cash?.repayment?.status).toBe("pending");
  expect(useCashRepayment.getState().cash?.repaymentConfirmedAt).toBeNull();
});
it("reuses the key on a lost response, blocks double taps, and changes key for changed proof", async () => {
  await useCashRepayment.getState().load("ord_1");
  jest.mocked(api.submitCashRepayment).mockRejectedValue(new Error("Network error"));
  await Promise.all([useCashRepayment.getState().submit("ord_1"), useCashRepayment.getState().submit("ord_1")]);
  expect(api.submitCashRepayment).toHaveBeenCalledTimes(1);
  await useCashRepayment.getState().submit("ord_1");
  expect(jest.mocked(api.submitCashRepayment).mock.calls[1][2]).toBe(jest.mocked(api.submitCashRepayment).mock.calls[0][2]);
  useCashPayment.getState().setReference("9876543210987");
  await useCashRepayment.getState().submit("ord_1");
  expect(jest.mocked(api.submitCashRepayment).mock.calls[2][2]).not.toBe(jest.mocked(api.submitCashRepayment).mock.calls[0][2]);
});
it("does not submit after Operations already has the proof", async () => {
  jest.mocked(api.getOrderCash).mockResolvedValue({ ...detail, repayment: { status: "pending", submittedAt: null, rejectedAt: null, rejectionReason: null } });
  await useCashRepayment.getState().load("ord_1");
  await useCashRepayment.getState().submit("ord_1");
  expect(api.submitCashRepayment).not.toHaveBeenCalled();
});
