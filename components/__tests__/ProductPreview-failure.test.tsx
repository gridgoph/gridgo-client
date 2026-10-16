import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ProductPreview } from "@/components/ProductPreview";
import { MOCKUP_LABEL } from "@/lib/productPreview";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getFile: jest.fn(async (fileId: string) => ({
      fileId,
      purpose: "artwork",
      originalFilename: "menu.pdf",
      detectedContentType: "application/pdf",
      size: 40_960,
      preview: { status: "failed", error: "preview_rasterization_failed", downloadUrlPath: `/files/${fileId}/preview-url`, retryPath: `/files/${fileId}/preview` },
    })),
    getFilePreviewUrl: jest.fn(async (fileId: string) => {
      if (fileId === "file_cooling") throw new actual.ApiError(429, { error: "preview_rasterization_failed" });
      throw new actual.ApiError(503, { error: "preview_rasterization_failed" });
    }),
    retryFilePreview: jest.fn(async () => {
      throw new actual.ApiError(503, { error: "preview_busy" });
    }),
    getFileDownloadUrl: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("holds Retry while GRIDGO's cooldown runs", async () => {
  await render(<ProductPreview family="flyer" artworkFileId="file_cooling" artworkName="menu.pdf" />);

  expect(await screen.findByText(/You can retry in about 30 seconds/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry preview (wait a moment)" }).props.accessibilityState).toEqual({ disabled: true });
});

// Presses go last in the file (see AGENTS.md, Running and testing).
it("says the preview failed and why, keeps the product shape and the original, and retries through the retry route", async () => {
  await render(<ProductPreview family="flyer" artworkFileId="file_pdf" artworkName="menu.pdf" />);

  expect(await screen.findByText("Preview did not load")).toBeTruthy();
  expect(screen.getByText(/password-protected or damaged/)).toBeTruthy();
  expect(screen.getByText(MOCKUP_LABEL)).toBeTruthy();
  expect(screen.getByText("Open original file")).toBeTruthy();
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole("button", { name: "Retry preview" }));

  await waitFor(() => expect(api.retryFilePreview).toHaveBeenCalledWith("file_pdf", "/files/file_pdf/preview"));
  // GRIDGO is rendering another file: Retry waits rather than hammering it.
  expect(await screen.findByText(/making another preview right now/)).toBeTruthy();
  // Never the original PDF as an image.
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
});
