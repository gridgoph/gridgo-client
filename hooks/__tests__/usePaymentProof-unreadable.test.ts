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

describe("usePaymentProof OCR unreadable", () => {
  it("leaves the reference empty when the screenshot has no number", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file://blank.jpg",
          name: "blank.jpg",
          mimeType: "image/jpeg",
          size: 800,
        },
      ],
    });
    mockUploadFile.mockReturnValue({
      done: Promise.resolve({ fileId: "file_proof", originalFilename: "blank.jpg" }),
      cancel: jest.fn(),
    });
    mockRecognizeReceiptFromUri.mockResolvedValue({
      text: "₱51.75\nSep 4, 2026",
      confidence: 40,
    });

    const { result } = await renderHook(() => usePaymentProof());
    await act(async () => {
      await result.current.pick();
    });

    await waitFor(() => expect(result.current.ocr.status).toBe("unreadable"));
    expect(result.current.ocr.reference).toBeNull();
  });
});
