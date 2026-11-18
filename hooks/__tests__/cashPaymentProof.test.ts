import { act, renderHook } from "@testing-library/react-native";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import { useCashPayment, useCheckoutPayment } from "@/store/checkoutPayment";
const mockUpload = jest.fn();
jest.mock("@/lib/nativeModules", () => ({ getDocumentPickerNative: () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file://receipt.jpg", name: "receipt.jpg", mimeType: "image/jpeg", size: 1000 }] }) }) }));
jest.mock("@/lib/api", () => ({ uploadFile: (...args: unknown[]) => mockUpload(...args) }));
jest.mock("@/lib/receiptOcrRecognize", () => ({ recognizeReceiptFromUri: async () => ({ text: "Ref. No. 1234567890123", confidence: 90 }) }));
it("uploads repayment proof with the cash purpose and leaves checkout's draft intact", async () => {
  useCashPayment.getState().reset();
  useCheckoutPayment.getState().bind("cart");
  useCheckoutPayment.getState().setReference("checkout-reference");
  mockUpload.mockReturnValue({ done: Promise.resolve({ fileId: "cash-proof" }), cancel: jest.fn() });
  const { result } = await renderHook(() => usePaymentProof("ord_cash", useCashPayment, "cash_repayment_proof"));
  await act(async () => { await result.current.pick(); });
  expect(mockUpload.mock.calls[0][1]).toBe("cash_repayment_proof");
  expect(useCashPayment.getState().proof.fileId).toBe("cash-proof");
  expect(useCashPayment.getState().reference).toBe("1234567890123");
  expect(useCheckoutPayment.getState().reference).toBe("checkout-reference");
});
