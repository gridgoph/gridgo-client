/* global jest, beforeEach, afterEach, it, expect */
const React = require("react");
const { create, act } = require("react-test-renderer");
const { usePaymentProof } = require("@/hooks/usePaymentProof");
const { useCheckoutPayment, useOrderPayment } = require("@/store/checkoutPayment");
const { setLiveOwner } = require("@/lib/live");
const mockOcr = jest.fn();
const mockUpload = jest.fn();
jest.mock("@/lib/nativeModules", () => ({ getDocumentPickerNative: () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file://receipt.jpg", name: "receipt.jpg", mimeType: "image/jpeg", size: 1000 }] }) }) }));
jest.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, uploadFile: (...args) => mockUpload(...args) }));
jest.mock("@/lib/receiptOcrRecognize", () => ({ recognizeReceiptFromUri: (...args) => mockOcr(...args) }));
let proof;
let view;
function Probe({ owner = "order:one:balance" }) {
  const result = usePaymentProof(owner, useOrderPayment);
  React.useEffect(() => { proof = result; });
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mockOcr.mockReset(); mockUpload.mockReset();
  useCheckoutPayment.getState().reset(); useOrderPayment.getState().reset();
  setLiveOwner("client");
  useCheckoutPayment.getState().bind("cart");
  useCheckoutPayment.getState().setReference("checkout-reference");
  mockUpload.mockReturnValue({ done: Promise.resolve({ fileId: "receipt", originalFilename: "receipt.jpg" }), cancel: jest.fn() });
  mockOcr.mockResolvedValue({ text: "Ref. No. 1234567890123", confidence: 90 });
  await act(async () => { view = create(React.createElement(Probe)); });
});
afterEach(async () => { await act(async () => view.unmount()); });
it("uploads and reads the order receipt without altering checkout's draft", async () => {
  await act(async () => { await proof.pick(); });
  expect(proof.state.fileId).toBe("receipt");
  expect(proof.ocr.status).toBe("filled");
  expect(useOrderPayment.getState().reference).toBe("1234567890123");
  expect(useCheckoutPayment.getState().reference).toBe("checkout-reference");
  expect(mockUpload.mock.calls[0][1]).toBe("payment_proof");
});
it("keeps manual corrections while OCR is pending and allows unreadable receipts", async () => {
  let finish;
  mockOcr.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { await proof.pick(); });
  expect(proof.ocr.status).toBe("reading");
  await act(async () => useOrderPayment.getState().setReference("9876543210000"));
  await act(async () => finish({ text: "Ref. No. 1234567890123", confidence: 90 }));
  expect(useOrderPayment.getState().reference).toBe("9876543210000");
  mockOcr.mockResolvedValueOnce({ text: "unreadable", confidence: 0 });
  await act(async () => { await proof.pick(); });
  expect(proof.ocr.status).toBe("unreadable");
  expect(proof.state.phase).toBe("stored");
  expect(useOrderPayment.getState().reference).toBe("9876543210000");
});
it("ignores OCR completion after moving to another order or changing account", async () => {
  let finish;
  mockOcr.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { await proof.pick(); });
  await act(async () => view.update(React.createElement(Probe, { owner: "order:two:balance" })));
  await act(async () => finish({ text: "Ref. No. 1234567890123", confidence: 90 }));
  expect(useOrderPayment.getState().reference).toBe("");
  expect(proof.state.fileId).toBeNull();
  mockOcr.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { await proof.pick(); });
  setLiveOwner("other-client");
  await act(async () => finish({ text: "Ref. No. 9999999999999", confidence: 90 }));
  expect(useOrderPayment.getState().reference).toBe("");
});
