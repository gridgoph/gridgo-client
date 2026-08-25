import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ArtworkScreen from "@/app/request/artwork";
import type { Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useCart } from "@/store/cart";

const mockPick = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

// The picker itself is native. What matters here is that the card reaches it.
jest.mock("@/hooks/useArtworkUpload", () => ({
  useArtworkUpload: (initial?: { fileId?: string | null }) => ({
    state: initial?.fileId
      ? {
          phase: "stored",
          fileId: initial.fileId,
          fileName: "poster.pdf",
          progress: null,
          error: null,
          size: null,
          contentType: null,
        }
      : {
          phase: "empty",
          fileId: null,
          fileName: "",
          progress: null,
          error: null,
          size: null,
          contentType: null,
        },
    pick: mockPick,
    retry: jest.fn(),
    cancel: jest.fn(),
    attachTo: jest.fn(),
    reset: jest.fn(),
    adopt: jest.fn(),
  }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
    updateCartLine: jest.fn(),
  };
});

const ITEM: CatalogItem = {
  id: "sci_flyers",
  supplierId: "user_lovis",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: null,
  basePriceMinor: 2500,
  fromPriceMinor: 2500,
  effectivePriceMinor: 2500,
  pricingUnit: "per_package",
  packageQty: 100,
  pricingBasis: "per_unit",
  turnaroundMode: "override",
  turnaroundHours: 48,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [],
  version: 1,
  serviceVersion: 1,
};

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_lovis",
    catalogItemId: "sci_flyers",
    quantity: 1,
    optionIds: [],
    structuredSpec: { size: "A4" },
    artworkFileId: null,
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: ITEM,
    lineSubtotalMinor: 2500,
    ...overrides,
  };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [line()],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

function renderInSafeArea(ui: ReactElement) {
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

beforeEach(() => {
  // The screen measures the stored artwork to warn about a wrong-shaped file.
  // jest-expo still mocks the `ImageLoader` native module in the old callback
  // shape, and React Native 0.81 calls the promise one — so the real
  // `Image.getSize` throws "success is not a function" from a `nextTick`,
  // outside any promise chain the screen could catch. The warning it feeds is
  // covered directly in lib/__tests__/listing.test.ts.
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  mockPick.mockClear();
  useCart.setState({ cartId: "cart_1", cart: cart(), loading: false, busy: false, error: null });
});

/**
 * The reported defect: this screen asked for a file and offered no way to give
 * one. Its only control was a yellow "Go to checkout" that stayed disabled
 * until a file appeared, and the card above it was a paragraph.
 */
describe("ArtworkScreen", () => {
  it("shows where the client is in the run", async () => {
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByLabelText("Step 3 of 4: Artwork, where you are now.")).toBeTruthy();
    expect(screen.getByLabelText("Step 2 of 4: Listing, done. Go back to it.")).toBeTruthy();
  });

  it("draws no disabled yellow button while there is nothing to take to checkout", async () => {
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.queryByLabelText("Go to checkout")).toBeNull();
    expect(screen.getByText("GRIDGO needs the file before it can print this.")).toBeTruthy();
  });

  it("gives the yellow back to checkout once the file is on the line", async () => {
    useCart.setState({ cart: cart({ lines: [line({ artworkFileId: "file_art" })] }) });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByLabelText("Go to checkout")).toBeTruthy();
    // And the card stops being the button, because it is now a report.
    expect(screen.queryByLabelText("Choose your artwork file")).toBeNull();
  });

  it("opens the picker from the card itself", async () => {
    await renderInSafeArea(<ArtworkScreen />);

    fireEvent.press(screen.getByLabelText("Choose your artwork file"));
    expect(mockPick).toHaveBeenCalledTimes(1);
  });
});
