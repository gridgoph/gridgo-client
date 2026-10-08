import { act, renderHook } from "@testing-library/react-native";

import { useArtworkUpload, type FormatGuard } from "@/hooks/useArtworkUpload";
import { fileMatchesFormats, pickerMimeTypes } from "@/lib/listing";

import { DOCUMENT_ITEM, DOCX_FORMAT, DOCX_TYPE, PDF_FORMAT } from "../../test/artworkPagesFixtures";

const mockGetDocumentAsync = jest.fn();
const mockUploadFile = jest.fn();

jest.mock("@/lib/nativeModules", () => ({
  FILE_PICKER_NEEDS_REBUILD: "rebuild",
  getDocumentPickerNative: () => ({ getDocumentAsync: mockGetDocumentAsync }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getFile: jest.fn(async () => {
    throw new Error("not used");
  }),
}));

const documents = { ...DOCUMENT_ITEM, acceptedFormats: [PDF_FORMAT, DOCX_FORMAT] };
const guard: FormatGuard = {
  accept: pickerMimeTypes(documents),
  check: (fileName, mimeType) => fileMatchesFormats(documents, fileName, mimeType),
  rejection: (fileName) => `${fileName} is not a PDF or Word document.`,
};

function picked(asset: { name: string; mimeType: string; size: number }) {
  mockGetDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: `file://${asset.name}`, ...asset }],
  });
}

beforeEach(() => {
  mockGetDocumentAsync.mockReset();
  mockUploadFile.mockReset();
  mockUploadFile.mockReturnValue({
    done: Promise.resolve({
      fileId: "file_docx",
      originalFilename: "thesis.docx",
      detectedContentType: DOCX_TYPE,
      size: 40_960,
      detected: { kind: "document", pageCount: null },
    }),
    cancel: jest.fn(),
  });
});

it("opens the picker on PDF and Word only for a PDF and Word listing", async () => {
  mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  const { result } = await renderHook(() => useArtworkUpload(undefined, guard));
  await act(async () => {
    await result.current.pick();
  });

  expect(mockGetDocumentAsync).toHaveBeenCalledWith(
    expect.objectContaining({ type: ["application/pdf", DOCX_TYPE] }),
  );
});

it("offers Word beside PDF and images where no listing narrows the picker", async () => {
  mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  const { result } = await renderHook(() => useArtworkUpload());
  await act(async () => {
    await result.current.pick();
  });

  expect(mockGetDocumentAsync).toHaveBeenCalledWith(
    expect.objectContaining({ type: ["application/pdf", DOCX_TYPE, "image/*"] }),
  );
});

it("uploads a picked Word file and keeps what GRIDGO read from it", async () => {
  picked({ name: "thesis.docx", mimeType: DOCX_TYPE, size: 40_960 });
  const { result } = await renderHook(() => useArtworkUpload(undefined, guard));
  await act(async () => {
    await result.current.pick();
  });

  expect(mockUploadFile).toHaveBeenCalledWith(
    expect.objectContaining({ name: "thesis.docx", mimeType: DOCX_TYPE }),
    "artwork",
    expect.any(Function),
  );
  expect(result.current.state.phase).toBe("stored");
  expect(result.current.state.contentType).toBe(DOCX_TYPE);
  expect(result.current.state.detected).toEqual({ kind: "document", pageCount: null });
});

it("turns a photo down for a PDF and Word listing before it uploads", async () => {
  picked({ name: "photo.jpg", mimeType: "image/jpeg", size: 400_000 });
  const { result } = await renderHook(() => useArtworkUpload(undefined, guard));
  await act(async () => {
    await result.current.pick();
  });

  expect(mockUploadFile).not.toHaveBeenCalled();
  expect(result.current.state.phase).toBe("failed");
  expect(result.current.state.error).toBe("photo.jpg is not a PDF or Word document.");
});

it("says Word's 16 MB limit before spending data on a larger file", async () => {
  picked({ name: "thesis.docx", mimeType: DOCX_TYPE, size: 20 * 1024 * 1024 });
  const { result } = await renderHook(() => useArtworkUpload(undefined, guard));
  await act(async () => {
    await result.current.pick();
  });

  expect(mockUploadFile).not.toHaveBeenCalled();
  expect(result.current.state.error).toMatch(/Word documents have to be under 16 MB/);
});

it("still lets a PDF of the same size through", async () => {
  picked({ name: "thesis.pdf", mimeType: "application/pdf", size: 20 * 1024 * 1024 });
  const { result } = await renderHook(() => useArtworkUpload(undefined, guard));
  await act(async () => {
    await result.current.pick();
  });

  expect(mockUploadFile).toHaveBeenCalledWith(
    expect.objectContaining({ name: "thesis.pdf" }),
    "artwork",
    expect.any(Function),
  );
});
