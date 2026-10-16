import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ArtworkScreen from "@/app/request/artwork";
import * as api from "@/lib/api";
import type { ArtworkGuidance, Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { agreeArtworkRights } from "@/test/legalGate";

/**
 * gridgo-client#242: ticking a warning on the artwork screen records the
 * acceptance on GRIDGO for that file and warning, and checkout stays open.
 * One press per file (see the testing notes in AGENTS.md).
 */

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_tarp" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    acceptArtworkWarnings: jest.fn(),
    getFile: jest.fn(async () => {
      throw new Error("not read in this test");
    }),
    getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/banner.png" })),
    getSettings: jest.fn(async () => {
      throw new Error("settings are not read in this test");
    }),
  };
});

const acceptArtworkWarnings = api.acceptArtworkWarnings as jest.MockedFunction<typeof api.acceptArtworkWarnings>;

const TARP = {
  id: "sci_tarp",
  name: "Tarpaulin",
  subcategoryCode: "tarpaulins_outdoor_banners",
  pricingUnit: "per_area",
  measureUnit: "ft",
  acceptedFormats: [],
  optionGroups: [],
  photos: [],
  prepSteps: [],
} as unknown as CatalogItem;

function guidance(acceptedAt: string | null): ArtworkGuidance {
  return {
    subcategoryCode: "tarpaulins_outdoor_banners",
    minimumDpi: 100,
    acceptsRgb: false,
    expectedColorMode: "cmyk",
    orderedSize: { widthMilli: 914_400, heightMilli: 1_828_800 },
    files: [
      {
        fileId: "file_banner",
        colorMode: "rgb",
        pixelWidth: 1200,
        pixelHeight: 2400,
        effectiveDpi: 33,
        warnings: [
          { code: "low_resolution", effectiveDpi: 33, minimumDpi: 100, acceptedAt },
          { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
        ],
      },
    ],
    openWarningCount: acceptedAt ? 1 : 2,
  };
}

function cart(acceptedAt: string | null = null): Cart {
  const line: CartLineRecord = {
    id: "cline_tarp",
    supplierId: "user_shop",
    catalogItemId: "sci_tarp",
    quantity: 1,
    optionIds: [],
    measurement: { width: 3000, height: 6000 },
    structuredSpec: {},
    artworkFileId: "file_banner",
    artworkAttachments: [{ kind: "file", fileId: "file_banner" }],
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: TARP,
    lineSubtotalMinor: 79_200,
    artworkGuidance: guidance(acceptedAt),
  };
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [line],
    checkedOutOrderId: null,
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}

beforeEach(() => {
  agreeArtworkRights("cart:cart_1");
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useArtworkAttachments.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart(), loading: false, busy: false, error: null, hydrated: true });
});

it("records the ticked warning on GRIDGO and keeps checkout open", async () => {
  acceptArtworkWarnings.mockResolvedValue(cart("2026-10-16T07:42:00.000Z"));
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ArtworkScreen />
    </SafeAreaProvider>,
  );

  expect(screen.getByText("33 DPI at the size ordered, 100 recommended")).toBeTruthy();
  expect(screen.getByLabelText("Go to checkout")).toBeEnabled();

  fireEvent.press(screen.getByRole("checkbox", { name: "Print it at this resolution" }));

  await waitFor(() =>
    expect(acceptArtworkWarnings).toHaveBeenCalledWith("cart_1", "cline_tarp", [
      { fileId: "file_banner", code: "low_resolution" },
    ]),
  );
  expect(await screen.findByText("Accepted 16 Oct, 3:42 PM")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Print it at this resolution" })).toBeChecked();
  expect(screen.getByLabelText("Go to checkout")).toBeEnabled();
});
