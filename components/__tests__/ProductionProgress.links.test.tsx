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

const inFive = () => new Date(Date.now() + 5 * 60_000).toISOString();

describe("ProductionProgress photo links", () => {
  beforeEach(() => {
    api.getFileDownloadUrl.mockReset();
  });

  it("asks for a link when storage could not sign the photo with the order", async () => {
    api.getFileDownloadUrl.mockResolvedValue({
      fileId: "file_unsigned",
      url: "https://storage.test/fresh.jpg",
      expiresAt: inFive(),
      expiresInSeconds: 300,
    });
    await renderWithInsets(
      <ProductionProgress
        view={{
          kind: "photos",
          photos: [{ fileId: "file_unsigned", contentType: "image/jpeg", at: "2026-09-28T08:00:00Z" }],
        }}
      />,
    );

    expect(api.getFileDownloadUrl).toHaveBeenCalledWith("file_unsigned");
    await waitFor(() =>
      expect(screen.getByTestId("sample-photo-image").props.source.uri).toBe(
        "https://storage.test/fresh.jpg",
      ),
    );
  });
});
