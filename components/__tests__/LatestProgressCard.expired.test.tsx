import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LatestProgressCard } from "@/components/LatestProgressCard";
import type { Order, ProductionPhoto } from "@/lib/api";
import { useOrderSections, ORDER_SECTIONS_FOLDED } from "@/store/orderSections";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getFileDownloadUrl: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

/** A job on the press with these photos, its history opened. */
function onThePress(photos: ProductionPhoto[]): Order {
  return {
    id: "ord_photos",
    state: "production",
    title: "Shop flyers",
    fulfillmentMode: "delivery",
    payments: {},
    timeline: [
      { at: "2026-09-28T07:00:00Z", state: "submitted", note: "Order submitted" },
      { at: "2026-09-28T07:30:00Z", state: "production", note: "On the press" },
    ],
    productionProgress: { status: "photos_available", photos },
  } as unknown as Order;
}

beforeEach(() => {
  useOrderSections.setState({ open: { ...ORDER_SECTIONS_FOLDED, history: true } });
});

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

describe("LatestProgressCard expired links", () => {
  it("re-signs an expired photo instead of calling it broken (gridgo-client#116)", async () => {
    api.getFileDownloadUrl.mockResolvedValue({
      fileId: "file_old",
      url: "https://storage.test/renewed.jpg",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      expiresInSeconds: 300,
    });
    await renderWithInsets(
      <LatestProgressCard order={onThePress([
            {
              fileId: "file_old",
              contentType: "image/jpeg",
              at: "2026-09-28T08:00:00Z",
              downloadUrl: "https://storage.test/old.jpg",
              downloadUrlExpiresAt: new Date(Date.now() - 60_000).toISOString(),
            },
          ])} />,
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
