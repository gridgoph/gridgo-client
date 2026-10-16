import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useArtworkImage } from "@/hooks/useArtworkImage";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    purpose: "artwork",
    originalFilename: "menu.pdf",
    detectedContentType: "application/pdf",
    size: 40_960,
    preview: { status: "ready", downloadUrlPath: `/files/${fileId}/preview-url`, retryPath: `/files/${fileId}/preview` },
  })),
  getFilePreviewUrl: jest.fn(async (fileId: string) => ({
    fileId,
    contentType: "image/png",
    page: 1,
    url: `https://storage.test/${fileId}-${Math.random()}.png`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    expiresInSeconds: 300,
  })),
  reportFilePreviewFailure: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// One test per file: the hook writes state from an async read (AGENTS.md, "Running and testing").
it("holds a picture that will not draw on a good link as a failure, and tells GRIDGO once", async () => {
  const { result } = await renderHook(() => useArtworkImage("file_pdf"));
  await waitFor(() => expect(result.current.view.kind).toBe("image"));

  await act(async () => result.current.markUnrenderable());

  await waitFor(() => expect(result.current.view.kind).toBe("failed"));
  expect(result.current.unavailable).toBe(true);
  expect(api.reportFilePreviewFailure).toHaveBeenCalledWith("file_pdf", "image_load_failed");
  expect(api.reportFilePreviewFailure).toHaveBeenCalledTimes(1);
});
