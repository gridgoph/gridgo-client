import { render, screen } from "@testing-library/react-native";

import { ProductPreview } from "@/components/ProductPreview";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    originalFilename: fileId === "file_docx" ? "thesis.docx" : "thesis.pdf",
    detectedContentType: fileId === "file_docx" ? DOCX_TYPE : "application/pdf",
    size: 40_960,
  })),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/file" })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("names a Word file with a document mark, and never fetches it to draw", async () => {
  await render(<ProductPreview subcategoryCode="document_printing" artworkFileId="file_docx" artworkName="thesis.docx" />);

  expect(await screen.findByText("Word document")).toBeTruthy();
  expect(screen.getByText("thesis.docx")).toBeTruthy();
  expect(screen.getByText("This attachment is a document. Open the original to inspect it.")).toBeTruthy();
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
});

it("leaves a PDF's face as it was: the name alone", async () => {
  await render(<ProductPreview subcategoryCode="document_printing" artworkFileId="file_pdf" artworkName="thesis.pdf" />);

  expect(await screen.findByText("This attachment is a document. Open the original to inspect it.")).toBeTruthy();
  expect(screen.getByText("thesis.pdf")).toBeTruthy();
  expect(screen.queryByText("Word document")).toBeNull();
});
