import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockGetDocumentAsync = jest.fn();
const mockRecognizeReceiptFromUri = jest.fn();
const mockUploadFile = jest.fn();

jest.mock("@/lib/nativeModules", () => ({
  FILE_PICKER_NEEDS_REBUILD: "rebuild",
  getDocumentPickerNative: () => ({ getDocumentAsync: mockGetDocumentAsync }),
}));

jest.mock("@/lib/api", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

jest.mock("@/lib/receiptOcrRecognize", () => ({
  recognizeReceiptFromUri: (...args: unknown[]) => mockRecognizeReceiptFromUri(...args),
}));

import { setLiveOwner } from "@/lib/live";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import { useCheckoutPayment } from "@/store/checkoutPayment";

describe("usePaymentProof OCR", () => {
  beforeEach(() => {
    useCheckoutPayment.getState().reset();
    mockGetDocumentAsync.mockReset();
    mockRecognizeReceiptFromUri.mockReset();
    mockUploadFile.mockReset();
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file://receipt.jpg",
          name: "receipt.jpg",
          mimeType: "image/jpeg",
          size: 1200,
        },
      ],
    });
    mockUploadFile.mockReturnValue({
      done: Promise.resolve({ fileId: "file_proof", originalFilename: "receipt.jpg" }),
      cancel: jest.fn(),
    });
  });

  it("fills the reference from a GCash screenshot, once per pick", async () => {
    mockRecognizeReceiptFromUri.mockResolvedValue({
      text: "Ref. No. 1234567890123\n₱51.75",
      confidence: 82,
    });

    const { result } = await renderHook(() => usePaymentProof("cart_1"));
    await act(async () => {
      await result.current.pick();
    });

    await waitFor(() => expect(result.current.ocr.status).toBe("filled"));
    expect(result.current.ocr.reference).toBe("1234567890123");
    expect(mockRecognizeReceiptFromUri).toHaveBeenCalledTimes(1);
    expect(mockRecognizeReceiptFromUri).toHaveBeenCalledWith("file://receipt.jpg");
  });
  it.each(["filled", "unreadable", "manual"])("replaces a receipt safely when the next OCR is %s", async (outcome) => {
    mockRecognizeReceiptFromUri.mockResolvedValueOnce({ text: "Ref No. 1234567890123", confidence: 90 });
    const { result } = await renderHook(() => usePaymentProof("cart_1"));
    await act(async () => { await result.current.pick(); });
    expect(useCheckoutPayment.getState().reference).toBe("1234567890123");
    if (outcome === "manual") {
      await act(async () => { useCheckoutPayment.getState().setReference("manual-reference"); });
    }
    let finish!: (raw: { text: string; confidence: number }) => void;
    mockRecognizeReceiptFromUri.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    mockUploadFile.mockReturnValueOnce({ done: Promise.resolve({ fileId: "receipt-b" }), cancel: jest.fn() });
    await act(async () => { await result.current.pick(); });
    expect(useCheckoutPayment.getState().proof.fileId).toBe("receipt-b");
    expect(useCheckoutPayment.getState().reference).toBe(outcome === "manual" ? "manual-reference" : "");
    await act(async () => { finish({ text: outcome === "unreadable" ? "Blank" : "Ref No. 9044838604781", confidence: 90 }); });
    expect(useCheckoutPayment.getState().reference).toBe(
      outcome === "manual" ? "manual-reference" : outcome === "unreadable" ? "" : "9044838604781",
    );
  });

  it.each(["bind", "reset", "owner"])("ignores late upload and OCR after %s changes", async (boundary) => {
    let upload!: (file: unknown) => void;
    let recognize!: (raw: unknown) => void;
    mockUploadFile.mockReturnValueOnce({ done: new Promise((resolve) => { upload = resolve; }), cancel: jest.fn() });
    mockRecognizeReceiptFromUri.mockReturnValueOnce(new Promise((resolve) => { recognize = resolve; }));
    const hook = await renderHook(() => usePaymentProof("cart_1"));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.pick(); });
    await hook.unmount();
    if (boundary === "bind") useCheckoutPayment.getState().bind("cart_2");
    if (boundary === "reset") {
      useCheckoutPayment.getState().reset();
      useCheckoutPayment.getState().bind("cart_1");
    }
    if (boundary === "owner") setLiveOwner("another-owner");
    const before = useCheckoutPayment.getState();
    await act(async () => {
      mockUploadFile.mock.calls[0][2](0.75);
      upload({ fileId: "old-receipt" });
      recognize({ text: "Ref No. 1234567890123", confidence: 90 });
      await pending;
    });
    expect(useCheckoutPayment.getState()).toBe(before);
    setLiveOwner(null);
  });

  it("keeps an in-flight receipt when checkout unmounts for an address", async () => {
    let upload!: (file: unknown) => void;
    mockUploadFile.mockReturnValueOnce({ done: new Promise((resolve) => { upload = resolve; }), cancel: jest.fn() });
    mockRecognizeReceiptFromUri.mockResolvedValueOnce({ text: "Ref No. 1234567890123", confidence: 90 });
    const hook = await renderHook(() => usePaymentProof("cart_1"));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.pick(); });
    await hook.unmount();
    upload({ fileId: "same-cart-receipt" });
    await pending;
    expect(useCheckoutPayment.getState().proof.fileId).toBe("same-cart-receipt");
    expect(useCheckoutPayment.getState().reference).toBe("1234567890123");
  });

});
