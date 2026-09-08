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

import { usePaymentProof } from "@/hooks/usePaymentProof";

describe("usePaymentProof OCR", () => {
  beforeEach(() => {
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

    const { result } = await renderHook(() => usePaymentProof());
    await act(async () => {
      await result.current.pick();
    });

    await waitFor(() => expect(result.current.ocr.status).toBe("filled"));
    expect(result.current.ocr.reference).toBe("1234567890123");
    expect(mockRecognizeReceiptFromUri).toHaveBeenCalledTimes(1);
    expect(mockRecognizeReceiptFromUri).toHaveBeenCalledWith("file://receipt.jpg");
  });
});
