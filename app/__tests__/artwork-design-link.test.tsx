import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ArtworkScreen from "@/app/request/artwork";
import type { ArtworkLinkCheck, Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useCart } from "@/store/cart";
import { artworkSignature, checkKey, useDesignLink } from "@/store/designLink";

const mockPick = jest.fn(async () => undefined);

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

/** A link already committed and checked: the screen is drawn from the stores alone. */
function withCheck(result: ArtworkLinkCheck | null, onLine: boolean) {
  useCart.setState({ cart: cart({ lines: [line({ artworkLinks: onLine ? [LINK] : [] })] }) });
  useDesignLink.setState({
    committed: { cline_1: URL },
    checks: { [checkKey(LINK)]: result ? { phase: "checked", check: result } : { phase: "unavailable" } },
  });
}

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useDesignLink.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart(), loading: false, busy: false, error: null });
});

/**
 * gridgoph/gridgo-client#101: the screen promised a Canva link and had no
 * field for one. Each test renders a state from the stores; none presses, so
 * the file stays clear of the double-press trap in AGENTS.md.
 */
describe("ArtworkScreen design link", () => {
  it("offers a Design link field beside the upload where the listing takes one", async () => {
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByLabelText("Design link")).toBeTruthy();
    expect(screen.getByLabelText("Choose your artwork file")).toBeTruthy();
    expect(screen.getByText("Upload the file, or paste a Canva link. Either one is enough.")).toBeTruthy();
    expect(screen.getByLabelText("How to share from Canva")).toBeTruthy();
    expect(screen.getByText("GRIDGO needs the file or a design link before it can print this.")).toBeTruthy();
  });

  it("draws no link field where the listing takes files only", async () => {
    useCart.setState({
      cart: cart({ lines: [line({ listing: { ...ITEM, acceptedFormats: [ITEM.acceptedFormats[0]] } })] }),
    });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.queryByLabelText("Design link")).toBeNull();
  });

  it("says anyone with the link can view it, and takes the link to checkout", async () => {
    withCheck(check({ ok: true, access: "public_view" }), true);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Anyone with the link can view it")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout")).toBeTruthy();
  });

  it("says anyone with the link can edit it", async () => {
    withCheck(check({ ok: true, access: "public_edit" }), true);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Anyone with the link can edit it")).toBeTruthy();
  });

  it("asks for sharing to be opened up when the link needs a sign-in, and does not move on", async () => {
    withCheck(check({ access: "sign_in_required", httpStatus: 401 }), false);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("This link is private")).toBeTruthy();
    expect(
      screen.getByText(
        "In the Share menu, set access to Anyone with the link, then paste it again. Or upload the file instead.",
      ),
    ).toBeTruthy();
    // The steps open themselves: this is the answer that needs them.
    expect(screen.getByText("Tap Copy link, then paste it here.")).toBeTruthy();
    expect(screen.queryByLabelText("Go to checkout")).toBeNull();
  });

  it("says it could not open a link with nothing behind it", async () => {
    withCheck(check({ access: "not_found", httpStatus: 404 }), false);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("We couldn't open this link")).toBeTruthy();
    expect(screen.queryByLabelText("Go to checkout")).toBeNull();
  });

  it("holds an inconclusive link back from checkout, with the fix and the upload (gridgo-api#122)", async () => {
    withCheck(check({ access: "unknown" }), true);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("We couldn't confirm anyone can open it")).toBeTruthy();
    expect(
      screen.getByText("Set sharing to Anyone with the link, then check it again. Or upload the file instead."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/Fix the link's sharing, or clear it/)).toBeTruthy();
  });

  it("says the link is being checked, and holds checkout until it answers", async () => {
    useCart.setState({ cart: cart({ lines: [line({ artworkLinks: [LINK] })] }) });
    useDesignLink.setState({ committed: { cline_1: URL }, checks: { [checkKey(LINK)]: { phase: "checking" } } });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Checking your link…")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("shows why checkout sent the client back, until the artwork changes", async () => {
    const refused = line({ artworkLinks: [LINK] });
    useCart.setState({ cart: cart({ lines: [refused] }) });
    useDesignLink.setState({
      committed: { cline_1: URL },
      checks: { [checkKey(LINK)]: { phase: "checked", check: check({ ok: true, access: "public_view" }) } },
      problems: {
        cline_1: {
          code: "artwork_link_check_failed",
          message: "Make the design viewable by anyone with the link.",
          signature: artworkSignature(refused),
        },
      },
    });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Checkout could not use this artwork")).toBeTruthy();
    expect(screen.getByText("Make the design viewable by anyone with the link.")).toBeTruthy();
  });

  it("shows no check at all on an API without one, and still moves on", async () => {
    withCheck(null, true);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.queryByText("Anyone with the link can view it")).toBeNull();
    expect(screen.queryByText("We couldn't open this link")).toBeNull();
    expect(screen.getByLabelText("Go to checkout")).toBeTruthy();
  });

  it("refuses a link from elsewhere where the shop takes Canva only", async () => {
    useDesignLink.setState({ committed: { cline_1: "https://drive.google.com/file/d/x" } });
    await renderInSafeArea(<ArtworkScreen />);

    expect(
      screen.getByText("This shop takes a Canva link. Paste one of those, or upload the file."),
    ).toBeTruthy();
  });
});
