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
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
    expiresInSeconds: 300,
  })),
  reportFilePreviewFailure: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// One test per file: the hook writes state from an async read (AGENTS.md, "Running and testing").
it("re-signs a picture that failed on an expiring link instead of calling it broken", async () => {
  const { result } = await renderHook(() => useArtworkImage("file_pdf"));
  await waitFor(() => expect(result.current.view.kind).toBe("image"));
  const first = result.current.uri;

  await act(async () => result.current.markUnrenderable());

  await waitFor(() => expect(result.current.uri).not.toBe(first));
  expect(result.current.view.kind).toBe("image");
  expect(api.getFilePreviewUrl).toHaveBeenCalledTimes(2);
  expect(api.reportFilePreviewFailure).not.toHaveBeenCalled();
});
