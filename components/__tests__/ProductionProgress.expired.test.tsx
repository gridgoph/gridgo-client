import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ProductionProgress } from "@/components/ProductionProgress";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getFileDownloadUrl: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function renderWithInsets(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("ProductionProgress expired links", () => {
  it("re-signs an expired photo instead of calling it broken (gridgo-client#116)", async () => {
    api.getFileDownloadUrl.mockResolvedValue({
      fileId: "file_old",
      url: "https://storage.test/renewed.jpg",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      expiresInSeconds: 300,
    });
    await renderWithInsets(
      <ProductionProgress
        view={{
          kind: "photos",
          photos: [
            {
              fileId: "file_old",
              contentType: "image/jpeg",
              at: "2026-09-28T08:00:00Z",
              downloadUrl: "https://storage.test/old.jpg",
              downloadUrlExpiresAt: new Date(Date.now() - 60_000).toISOString(),
            },
          ],
        }}
      />,
    );

    await waitFor(() => expect(api.getFileDownloadUrl).toHaveBeenCalledWith("file_old"));
    await waitFor(() =>
      expect(screen.getByTestId("sample-photo-image").props.source.uri).toBe(
        "https://storage.test/renewed.jpg",
      ),
    );
    expect(screen.queryByText(/will not load/i)).toBeNull();
  });
});
