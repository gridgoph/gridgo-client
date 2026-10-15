import * as api from "@/lib/api";
import type { ArtworkAttachment, ArtworkGuidance, Cart, CartLineRecord, CatalogItem, StoredFile } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";

/**
 * gridgo-client#242: a warning is answered by ticking it (stored on GRIDGO,
 * `PUT /me/carts/:id/lines/:lineId/artwork-warnings`) or by a new file that
 * takes the old one's place.
 */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    acceptArtworkWarnings: jest.fn(),
    getCart: jest.fn(),
    updateCartLine: jest.fn(),
    uploadFile: jest.fn(),
  };
});

let mockPicked: { uri: string; name: string; mimeType: string; size: number }[] = [];
let mockMultiple: boolean | undefined;
jest.mock("@/lib/nativeModules", () => ({
  FILE_PICKER_NEEDS_REBUILD: "rebuild",
  getDocumentPickerNative: () => ({
    getDocumentAsync: async (options: { multiple?: boolean }) => {
      mockMultiple = options.multiple;
      return { canceled: false, assets: mockPicked };
    },
  }),
}));

const acceptArtworkWarnings = api.acceptArtworkWarnings as jest.MockedFunction<typeof api.acceptArtworkWarnings>;
const getCart = api.getCart as jest.MockedFunction<typeof api.getCart>;
const updateCartLine = api.updateCartLine as jest.MockedFunction<typeof api.updateCartLine>;
const uploadFile = api.uploadFile as jest.MockedFunction<typeof api.uploadFile>;

const LISTING = { id: "sci_tarp", name: "Tarpaulin", acceptedFormats: [] } as unknown as CatalogItem;

function guidance(accepted: { low?: string | null; colour?: string | null } = {}): ArtworkGuidance {
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
          { code: "low_resolution", effectiveDpi: 33, minimumDpi: 100, acceptedAt: accepted.low ?? null },
          { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: accepted.colour ?? null },
        ],
      },
    ],
    openWarningCount: [accepted.low, accepted.colour].filter((at) => !at).length,
  };
}

function line(entries: ArtworkAttachment[], lineGuidance: ArtworkGuidance | null): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_shop",
    catalogItemId: "sci_tarp",
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: entries.find((entry) => entry.kind === "file")?.fileId ?? null,
    artworkLinks: [],
    artworkAttachments: entries,
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: LISTING,
    lineSubtotalMinor: 2500,
    artworkGuidance: lineGuidance,
  };
}

function cart(entries: ArtworkAttachment[], lineGuidance: ArtworkGuidance | null = guidance()): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [line(entries, lineGuidance)],
    checkedOutOrderId: null,
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}

const BANNER = { kind: "file" as const, fileId: "file_banner", label: "Front" };
const LOGO = { kind: "file" as const, fileId: "file_logo" };

function stored(fileId: string): StoredFile {
  return {
    fileId,
    purpose: "artwork",
    originalFilename: `${fileId}.png`,
    declaredContentType: "image/png",
    detectedContentType: "image/png",
    size: 4_000_000,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-10-16T00:00:00.000Z",
    readyAt: "2026-10-16T00:00:00.000Z",
    references: [],
    artworkCheck: { status: "passed" },
  };
}

beforeEach(() => {
  acceptArtworkWarnings.mockReset();
  getCart.mockReset();
  updateCartLine.mockReset();
  uploadFile.mockReset();
  useArtworkAttachments.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart([BANNER, LOGO]), loading: false, busy: false, error: null, hydrated: true });
});

describe("accepting a warning", () => {
  it("sends the one warning ticked and keeps the basket GRIDGO answers with", async () => {
    const at = "2026-10-16T03:00:00.000Z";
    acceptArtworkWarnings.mockResolvedValue(cart([BANNER, LOGO], guidance({ low: at })));

    await useArtworkAttachments.getState().acceptWarning("cline_1", "file_banner", "low_resolution", true);

    expect(acceptArtworkWarnings).toHaveBeenCalledWith("cart_1", "cline_1", [
      { fileId: "file_banner", code: "low_resolution" },
    ]);
    const warnings = useCart.getState().cart?.lines[0].artworkGuidance?.files[0].warnings;
    expect(warnings?.[0].acceptedAt).toBe(at);
    expect(useArtworkAttachments.getState().accepting.cline_1).toBeNull();
    expect(useArtworkAttachments.getState().acceptError.cline_1).toBeNull();
  });

  it("sends every acceptance already held, because the route replaces the list", async () => {
    useCart.setState({ cart: cart([BANNER, LOGO], guidance({ low: "2026-10-16T03:00:00.000Z" })) });
    acceptArtworkWarnings.mockResolvedValue(cart([BANNER, LOGO]));

    await useArtworkAttachments.getState().acceptWarning("cline_1", "file_banner", "color_mode", true);

    expect(acceptArtworkWarnings).toHaveBeenCalledWith("cart_1", "cline_1", [
      { fileId: "file_banner", code: "low_resolution" },
      { fileId: "file_banner", code: "color_mode" },
    ]);
  });

  it("withdraws an acceptance by leaving it out", async () => {
    useCart.setState({ cart: cart([BANNER, LOGO], guidance({ low: "2026-10-16T03:00:00.000Z" })) });
    acceptArtworkWarnings.mockResolvedValue(cart([BANNER, LOGO]));

    await useArtworkAttachments.getState().acceptWarning("cline_1", "file_banner", "low_resolution", false);

    expect(acceptArtworkWarnings).toHaveBeenCalledWith("cart_1", "cline_1", []);
  });

  it("re-reads the basket and asks again when the warning has changed", async () => {
    acceptArtworkWarnings.mockRejectedValue(new api.ApiError(409, { error: "artwork_warning_not_found" }));
    getCart.mockResolvedValue(cart([BANNER, LOGO], guidance()));

    await useArtworkAttachments.getState().acceptWarning("cline_1", "file_banner", "low_resolution", true);

    expect(getCart).toHaveBeenCalledWith("cart_1");
    expect(useArtworkAttachments.getState().acceptError.cline_1).toMatch(/check changed/);
  });
});

describe("uploading a new file in place of a flagged one", () => {
  it("puts the new file where the old one was, keeping its label, from a one-file pick", async () => {
    mockPicked = [{ uri: "file:///banner-print.png", name: "banner-print.png", mimeType: "image/png", size: 9_000_000 }];
    uploadFile.mockImplementation(() => ({ done: Promise.resolve(stored("file_banner_v2")), cancel: jest.fn() }));
    updateCartLine.mockImplementation(async (_cartId, _lineId, input) => cart(input.artworkAttachments ?? [], null));

    await useArtworkAttachments.getState().replace("cline_1", "file_banner");

    expect(mockMultiple).toBe(false);
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [{ kind: "file", fileId: "file_banner_v2", label: "Front" }, LOGO],
    });
    expect(useArtworkAttachments.getState().uploads.cline_1).toEqual([]);
  });
});
