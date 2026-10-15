import { render, screen } from "@testing-library/react-native";

import { ProductPreview } from "@/components/ProductPreview";
import { WORD_PREVIEW_UNAVAILABLE } from "@/lib/artworkPreview";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    purpose: "artwork",
    originalFilename: fileId.startsWith("file_docx") ? "thesis.docx" : "thesis.pdf",
    detectedContentType: fileId.startsWith("file_docx") ? DOCX_TYPE : "application/pdf",
    size: 40_960,
    // An API with previews says why a Word file has none; an older one sends nothing.
    ...(fileId === "file_docx"
      ? { preview: { status: "unsupported", error: "preview_word_not_available", downloadUrlPath: "/files/file_docx/preview-url", retryPath: "/files/file_docx/preview" } }
      : {}),
  })),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/file" })),
  getFilePreviewUrl: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("says a Word file has no preview yet in GRIDGO's words, keeps Open original, and never fetches it to draw", async () => {
  await render(<ProductPreview subcategoryCode="document_printing" artworkFileId="file_docx" artworkName="thesis.docx" />);

  expect(await screen.findByText(WORD_PREVIEW_UNAVAILABLE)).toBeTruthy();
  expect(screen.getByText("Word document")).toBeTruthy();
  expect(screen.getByText("thesis.docx")).toBeTruthy();
  expect(screen.getByText("Open original file")).toBeTruthy();
  // Not an error: nothing to retry until GRIDGO can convert Word files.
  expect(screen.queryByText("Preview did not load")).toBeNull();
  expect(screen.queryByText("Retry preview")).toBeNull();
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
  expect(api.getFilePreviewUrl).not.toHaveBeenCalled();
});

it("treats a Word file the same on an API that sends no preview record", async () => {
  await render(<ProductPreview subcategoryCode="document_printing" artworkFileId="file_docx_old" artworkName="thesis.docx" />);

  expect(await screen.findByText(WORD_PREVIEW_UNAVAILABLE)).toBeTruthy();
  expect(api.getFilePreviewUrl).not.toHaveBeenCalled();
});

it("leaves a PDF's face as it was on an API without previews: the name alone", async () => {
  await render(<ProductPreview subcategoryCode="document_printing" artworkFileId="file_pdf" artworkName="thesis.pdf" />);

  expect(await screen.findByText("This attachment is a document. Open the original to inspect it.")).toBeTruthy();
  expect(screen.getByText("thesis.pdf")).toBeTruthy();
  expect(screen.queryByText("Word document")).toBeNull();
  expect(api.getFilePreviewUrl).not.toHaveBeenCalled();
});
