import * as api from "@/lib/api";
import type { ArtworkLinkCheck, Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useCart } from "@/store/cart";
import { artworkSignature, checkKey, currentProblem, useDesignLink } from "@/store/designLink";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, checkArtworkLink: jest.fn(), updateCartLine: jest.fn() };
});

const checkArtworkLink = api.checkArtworkLink as jest.MockedFunction<typeof api.checkArtworkLink>;
const updateCartLine = api.updateCartLine as jest.MockedFunction<typeof api.updateCartLine>;

const URL_OK = "https://www.canva.com/design/DAF1/view";
const LINK = { formatCode: "canva_link", url: URL_OK };

const LISTING = {
  id: "sci_flyers",
  name: "Flyers",
  acceptedFormats: [
    { code: "pdf", displayName: "PDF", inputKind: "file", extensions: ["pdf"], mimeTypes: ["application/pdf"], active: true },
    { code: "canva_link", displayName: "Canva link", inputKind: "url", extensions: [], mimeTypes: [], active: true },
  ],
} as unknown as CatalogItem;

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_lovis",
    catalogItemId: "sci_flyers",
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: null,
    artworkLinks: [],
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: LISTING,
    lineSubtotalMinor: 2500,
    ...overrides,
  };
}

function cart(lines: CartLineRecord[]): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines,
    checkedOutOrderId: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };
}

function checked(overrides: Partial<ArtworkLinkCheck>): ArtworkLinkCheck {
  return {
    ok: false,
    reachable: true,
    httpStatus: 200,
    provider: "canva",
    access: "unknown",
    message: "Could not confirm access.",
    ...overrides,
  };
}

beforeEach(() => {
  checkArtworkLink.mockReset();
  updateCartLine.mockReset();
  useDesignLink.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart([line()]), loading: false, busy: false, error: null });
  updateCartLine.mockImplementation(async (_cartId, _lineId, input) =>
    cart([line({ artworkLinks: input.artworkLinks ?? [] })]),
  );
});

describe("design link store", () => {
  it("keeps a public link on the line", async () => {
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(checkArtworkLink).toHaveBeenCalledWith(LINK);
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [LINK] });
    expect(useCart.getState().cart?.lines[0].artworkLinks).toEqual([LINK]);
  });

  it("does not keep an inconclusive link: checkout would refuse it (gridgo-api#122)", async () => {
    useCart.setState({ cart: cart([line({ artworkLinks: [LINK] })]) });
    checkArtworkLink.mockResolvedValue(checked({ access: "unknown" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1", { recheck: true });

    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [] });
  });

  it("does not keep a link that asks people to sign in, and drops the one it replaces", async () => {
    useCart.setState({
      cart: cart([line({ artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/OLD/view" }] })]),
    });
    checkArtworkLink.mockResolvedValue(checked({ access: "sign_in_required" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [] });
    expect(useDesignLink.getState().checks[checkKey(LINK)]).toMatchObject({ phase: "checked" });
  });

  it("keeps the full design address a Canva short link resolved to", async () => {
    const full = "https://www.canva.com/design/DAF1/token/view";
    checkArtworkLink.mockResolvedValue(
      checked({ ok: true, access: "public_view", url: full, formatCode: "canva_link" }),
    );

    await useDesignLink.getState().commit("https://canva.link/abc123", "cline_1");

    expect(checkArtworkLink).toHaveBeenCalledWith({ formatCode: "canva_link", url: "https://canva.link/abc123" });
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkLinks: [{ formatCode: "canva_link", url: full }],
    });
  });

  it("saves without a check on an API that has none", async () => {
    checkArtworkLink.mockResolvedValue(null);

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(useDesignLink.getState().checks[checkKey(LINK)]).toEqual({ phase: "unavailable" });
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [LINK] });
    expect(useDesignLink.getState().saveError.cline_1).toBeNull();
  });

  it("says so when an older API drops the link it was sent", async () => {
    checkArtworkLink.mockResolvedValue(null);
    updateCartLine.mockImplementation(async () => {
      const { artworkLinks: _dropped, ...old } = line();
      return cart([old as CartLineRecord]);
    });

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(useDesignLink.getState().saveError.cline_1).toBe(
      "GRIDGO could not keep a design link on this item yet. Upload the file instead.",
    );
  });

  it("checks a pasted link once, not again when the field is left", async () => {
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await Promise.all([
      useDesignLink.getState().commit(URL_OK, "cline_1"),
      useDesignLink.getState().commit(URL_OK, "cline_1"),
    ]);

    expect(checkArtworkLink).toHaveBeenCalledTimes(1);
    expect(updateCartLine).toHaveBeenCalledTimes(1);
  });

  it("never calls the API for an address the field can refuse itself", async () => {
    await useDesignLink.getState().commit("https://drive.google.com/file/d/x", "cline_1");

    expect(checkArtworkLink).not.toHaveBeenCalled();
    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("holds a link it could not check yet (a rate limit) off the line, to be checked again", async () => {
    checkArtworkLink.mockRejectedValue(
      new api.ApiError(429, { error: "artwork_link_rate_limited", message: "Wait a minute." }),
    );

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    // Not a broken link — `blocks` is for a link GRIDGO refuses outright —
    // but not one checkout would take either.
    expect(useDesignLink.getState().checks[checkKey(LINK)]).toMatchObject({ phase: "failed", blocks: false });
    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("checks a saved link once, however many screens ask", async () => {
    let answer!: (value: ArtworkLinkCheck) => void;
    checkArtworkLink.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const first = useDesignLink.getState().verify(LINK);
    const second = useDesignLink.getState().verify(LINK);
    expect(useDesignLink.getState().checks[checkKey(LINK)]).toEqual({ phase: "checking" });
    answer(checked({ ok: true, access: "public_view" }));
    await Promise.all([first, second]);
    await useDesignLink.getState().verify(LINK);

    expect(checkArtworkLink).toHaveBeenCalledTimes(1);
    expect(useDesignLink.getState().checks[checkKey(LINK)]).toMatchObject({ phase: "checked" });
  });

  it("keeps checkout's refusal against the artwork it was about", () => {
    const refused = line({ artworkLinks: [LINK] });
    useDesignLink.getState().setProblem("cline_1", {
      code: "artwork_link_check_failed",
      message: "Make the design viewable by anyone with the link.",
      signature: artworkSignature(refused),
    });

    expect(currentProblem(useDesignLink.getState().problems, refused)?.message).toMatch(/viewable/);
    // A new link (or a file instead) is new artwork: the old refusal is moot.
    expect(currentProblem(useDesignLink.getState().problems, line({ artworkFileId: "file_2" }))).toBeNull();
  });

  it("clears the line when the field is emptied", async () => {
    useCart.setState({ cart: cart([line({ artworkLinks: [LINK] })]) });

    await useDesignLink.getState().commit("", "cline_1");

    expect(checkArtworkLink).not.toHaveBeenCalled();
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkLinks: [] });
  });
});
