import { render, screen } from "@testing-library/react-native";

import { ProductPreview } from "@/components/ProductPreview";
import { MOCKUP_LABEL } from "@/lib/productPreview";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const mockLater = new Date(Date.now() + 300_000).toISOString();

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    purpose: "artwork",
    originalFilename: fileId === "file_pdf" ? "menu.pdf" : "flyer.png",
    detectedContentType: fileId === "file_pdf" ? "application/pdf" : "image/png",
    size: 40_960,
    detected: fileId === "file_pdf" ? { kind: "pdf", pageCount: 3 } : { kind: "raster", pageCount: 1 },
    preview: {
      // `pending` is drawn by reading it: GRIDGO renders on the first read.
      status: fileId === "file_pdf" ? "pending" : "ready",
      downloadUrlPath: `/files/${fileId}/preview-url`,
      retryPath: `/files/${fileId}/preview`,
    },
  })),
  getFilePreviewUrl: jest.fn(async (fileId: string) => ({
    fileId,
    contentType: fileId === "file_pdf" ? "image/png" : "image/png",
    page: 1,
    url: `https://storage.test/${fileId}.png`,
    expiresAt: mockLater,
    expiresInSeconds: 300,
  })),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://storage.test/original" })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("composites page 1 of a PDF into the product, from GRIDGO's preview and never the original", async () => {
  await render(<ProductPreview family="flyer" artworkFileId="file_pdf" artworkName="menu.pdf" />);

  const picture = await screen.findByLabelText("Mockup of menu.pdf, page 1");
  expect(picture.props.source).toEqual([expect.objectContaining({ uri: "https://storage.test/file_pdf.png" })]);
  expect(screen.getByText("Page 1 of 3 shown")).toBeTruthy();
  expect(screen.getByText(MOCKUP_LABEL)).toBeTruthy();
  expect(screen.getByText("Open original file")).toBeTruthy();
  expect(api.getFilePreviewUrl).toHaveBeenCalledWith("file_pdf", "/files/file_pdf/preview-url");
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
  expect(screen.queryByText("Preview did not load")).toBeNull();
});

it("composites image artwork as before, with no page line", async () => {
  await render(<ProductPreview family="flyer" artworkFileId="file_png" artworkName="flyer.png" />);

  const picture = await screen.findByLabelText("Mockup of flyer.png");
  expect(picture.props.source).toEqual([expect.objectContaining({ uri: "https://storage.test/file_png.png" })]);
  expect(screen.queryByText(/shown$/)).toBeNull();
});
