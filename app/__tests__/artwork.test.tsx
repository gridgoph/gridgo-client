import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ArtworkScreen from "@/app/request/artwork";
import type { Cart, CartLineRecord, CatalogItem, DetectedArtwork } from "@/lib/api";
import { useCart } from "@/store/cart";
import { agreeArtworkRights } from "@/test/legalGate";

const mockPick = jest.fn(async () => undefined);

/** What GRIDGO read from the stored file. A phone screenshot unless a test says otherwise. */
const SCREENSHOT: DetectedArtwork = {
  kind: "raster",
  pageCount: 1,
  pixelWidth: 720,
  pixelHeight: 1600,
  dpi: 96,
  measureUnit: "mm",
  widthMilli: 190_500,
  heightMilli: 423_300,
  pageSize: null,
  orientation: "portrait",
};
let mockDetected: DetectedArtwork = SCREENSHOT;

jest.mock("expo-router", () => ({
  // The first-order tour registers its screen on focus (`useTourScreen`).
  useFocusEffect: () => undefined,
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
          fileName: "WorkHard.png",
          progress: null,
          error: null,
          size: 492_000,
          contentType: "image/png",
          detected: mockDetected,
        }
      : {
          phase: "empty",
          fileId: null,
          fileName: "",
          progress: null,
          error: null,
          size: null,
          contentType: null,
          detected: null,
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
  measurementKind: "none" as const,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
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
    measurement: null,
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
  // The per-order artwork box, ticked by the client (one press per test).
  agreeArtworkRights("cart:cart_1");
  // The screen measures the stored artwork to warn about a wrong-shaped file.
  // jest-expo still mocks the `ImageLoader` native module in the old callback
  // shape, and React Native 0.81 calls the promise one — so the real
  // `Image.getSize` throws "success is not a function" from a `nextTick`,
  // outside any promise chain the screen could catch. The warning it feeds is
  // covered directly in lib/__tests__/listing.test.ts.
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  mockPick.mockClear();
  mockDetected = SCREENSHOT;
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

  // Adding another product is checkout's, beside the whole basket. Here it
  // read as a step this item still owed (gridgo-client#195).
  it("offers no detour to add something else, before or after the file", async () => {
    await renderInSafeArea(<ArtworkScreen />);
    expect(screen.queryByText(/something else/i)).toBeNull();
    expect(screen.queryByLabelText("Add something else to print")).toBeNull();

    useCart.setState({ cart: cart({ lines: [line({ artworkFileId: "file_art" })] }) });
    await renderInSafeArea(<ArtworkScreen />);
    expect(screen.getByLabelText("Go to checkout")).toBeTruthy();
    expect(screen.queryByText(/something else/i)).toBeNull();
    expect(screen.queryByLabelText("Add something else to print")).toBeNull();
  });

  it("warns when the file millimetres are not the product size", async () => {
    const cards: CatalogItem = {
      ...ITEM,
      id: "sci_cards",
      subcategoryCode: "business_cards",
      name: "Business cards",
    };
    useCart.setState({
      cart: cart({
        lines: [
          line({
            catalogItemId: cards.id,
            listing: cards,
            artworkFileId: "file_art",
            structuredSpec: { size: "standard" },
          }),
        ],
      }),
    });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.getByText("480 KB")).toBeTruthy();
    expect(screen.getByText(/We read this as 720 × 1600 pixels/)).toBeTruthy();
    expect(screen.getByText("This file does not match the print size")).toBeTruthy();
    expect(screen.getByText("Standard · 50.8 × 88.9 mm · about 600 × 1050 pixels")).toBeTruthy();
    expect(screen.getByText("720 × 1600 pixels")).toBeTruthy();
    expect(screen.getByText(/carry on and it will be printed scaled to fit/)).toBeTruthy();
    // A warning, never a block: checkout stays open.
    expect(screen.getByLabelText("Go to checkout")).toBeEnabled();
  });

  // gridgo-client#196: a file made at the size shows no note, even when its
  // header still declares 72 DPI.
  it("shows no size note for an image that matches the size", async () => {
    mockDetected = {
      ...SCREENSHOT,
      pixelWidth: 2480,
      pixelHeight: 3508,
      dpi: 72,
      widthMilli: 874_900,
      heightMilli: 1_237_500,
    };
    useCart.setState({ cart: cart({ lines: [line({ artworkFileId: "file_art" })] }) });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByLabelText("Go to checkout")).toBeTruthy();
    expect(screen.queryByText("This file does not match the print size")).toBeNull();
  });

  it("gives both sizes when an image is too small for A4", async () => {
    mockDetected = { ...SCREENSHOT, pixelWidth: 595, pixelHeight: 842, dpi: null, widthMilli: null, heightMilli: null };
    useCart.setState({ cart: cart({ lines: [line({ artworkFileId: "file_art" })] }) });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("This file does not match the print size")).toBeTruthy();
    expect(screen.getByText("A4 · 210 × 297 mm · about 2480 × 3508 pixels")).toBeTruthy();
    expect(screen.getByText("595 × 842 pixels")).toBeTruthy();
  });

  it("opens the picker from the card itself", async () => {
    await renderInSafeArea(<ArtworkScreen />);

    fireEvent.press(screen.getByLabelText("Choose your artwork file"));
    expect(mockPick).toHaveBeenCalledTimes(1);
  });
});
