import { fireEvent, render, screen } from "@testing-library/react-native";
import * as api from "@/lib/api";
import type { ReactElement } from "react";
import { Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ArtworkScreen from "@/app/request/artwork";
import type { ArtworkLinkCheck, Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useDesignLink } from "@/store/designLink";

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
          fileName: "WorkHard.png",
          progress: null,
          error: null,
          size: 492_000,
          contentType: "image/png",
          detected: {
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
          },
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
    checkArtworkLink: jest.fn(),
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
  acceptedFormats: [
    { code: "pdf", displayName: "PDF", inputKind: "file", extensions: ["pdf"], mimeTypes: ["application/pdf"], active: true },
    { code: "canva_link", displayName: "Canva link", inputKind: "url", extensions: [], mimeTypes: [], active: true },
  ],
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
    artworkLinks: [],
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

const URL = "https://www.canva.com/design/DAF1/view";
const LINK = { formatCode: "canva_link", url: URL };

function check(overrides: Partial<ArtworkLinkCheck>): ArtworkLinkCheck {
  return {
    ok: false,
    reachable: true,
    httpStatus: 200,
    provider: "canva",
    access: "unknown",
    message: "GRIDGO could not tell who can open this page.",
    ...overrides,
  };
}

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useDesignLink.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart(), loading: false, busy: false, error: null });
});

/** One interaction per file (see AGENTS.md): a paste checks and saves the link. */
describe("ArtworkScreen design link paste", () => {
  it("checks a pasted link, shows the answer and keeps it on the line", async () => {
    (api.checkArtworkLink as jest.Mock).mockResolvedValue(check({ ok: true, access: "public_view" }));
    (api.updateCartLine as jest.Mock).mockResolvedValue(cart({ lines: [line({ artworkLinks: [LINK] })] }));
    await renderInSafeArea(<ArtworkScreen />);

    fireEvent.changeText(screen.getByLabelText("Design link"), URL);

    // A paste is checked once it has settled, not chunk by chunk.
    expect(api.checkArtworkLink).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Anyone with the link can view it", {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(api.checkArtworkLink).toHaveBeenCalledWith(LINK);
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [LINK] });
    expect(await screen.findByLabelText("Go to checkout")).toBeTruthy();
  });
});
