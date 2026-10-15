import * as api from "@/lib/api";
import type { ArtworkLinkCheck, Cart, CartLineRecord, CatalogItem } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
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
    artworkAttachments: [],
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
  useArtworkAttachments.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart([line()]), loading: false, busy: false, error: null });
  // GRIDGO keeps the list it was sent, and the legacy links beside it.
  updateCartLine.mockImplementation(async (_cartId, _lineId, input) => {
    const entries = input.artworkAttachments ?? [];
    return cart([
      line({
        artworkAttachments: entries,
        artworkLinks: entries.flatMap((entry) => (entry.kind === "link" ? [{ formatCode: entry.formatCode, url: entry.url }] : [])),
      }),
    ]);
  });
});

const FILE = { kind: "file" as const, fileId: "file_front", label: "Front" };

describe("design link store", () => {
  it("adds a public link after what the item already holds, and empties the field", async () => {
    useCart.setState({ cart: cart([line({ artworkFileId: "file_front", artworkAttachments: [FILE] })]) });
    useDesignLink.getState().setDraft("cline_1", URL_OK);
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(checkArtworkLink).toHaveBeenCalledWith(LINK);
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [FILE, { kind: "link", ...LINK }],
    });
    expect(useCart.getState().cart?.lines[0].artworkLinks).toEqual([LINK]);
    // The link is on the item, where its row says so: the field is free again.
    expect(useDesignLink.getState().drafts.cline_1).toBe("");
  });

  it("files a link in the old fields on a GRIDGO from before the list", async () => {
    const { artworkAttachments: _none, ...older } = line({ artworkFileId: "file_front" });
    useCart.setState({ cart: cart([older as CartLineRecord]) });
    updateCartLine.mockImplementation(async (_cartId, _lineId, input) =>
      cart([{ ...older, artworkLinks: input.artworkLinks ?? [] } as CartLineRecord]),
    );
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkFileId: "file_front",
      artworkLinks: [LINK],
    });
    expect(useDesignLink.getState().saveError.cline_1).toBeNull();
  });

  it("does not add an inconclusive link: checkout would refuse it (gridgo-api#122)", async () => {
    checkArtworkLink.mockResolvedValue(checked({ access: "unknown" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("does not add a link that asks people to sign in, and leaves the others alone", async () => {
    const old = { kind: "link" as const, formatCode: "canva_link", url: "https://www.canva.com/design/OLD/view" };
    useCart.setState({ cart: cart([line({ artworkAttachments: [old] })]) });
    checkArtworkLink.mockResolvedValue(checked({ access: "sign_in_required" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useCart.getState().cart?.lines[0].artworkAttachments).toEqual([old]);
    expect(useDesignLink.getState().checks[checkKey(LINK)]).toMatchObject({ phase: "checked" });
  });

  it("does not add the same link twice", async () => {
    useCart.setState({ cart: cart([line({ artworkAttachments: [{ kind: "link", ...LINK }] })]) });
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useDesignLink.getState().saveError.cline_1).toBe("That link is already on this item.");
  });

  it("refuses an eleventh file or link, before asking GRIDGO", async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ kind: "file" as const, fileId: `file_${index}` }));
    useCart.setState({ cart: cart([line({ artworkAttachments: ten })]) });
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useDesignLink.getState().saveError.cline_1).toMatch(/10 files and design links at most/);
  });

  it("keeps the full design address a Canva short link resolved to", async () => {
    const full = "https://www.canva.com/design/DAF1/token/view";
    checkArtworkLink.mockResolvedValue(
      checked({ ok: true, access: "public_view", url: full, formatCode: "canva_link" }),
    );

    await useDesignLink.getState().commit("https://canva.link/abc123", "cline_1");

    expect(checkArtworkLink).toHaveBeenCalledWith({ formatCode: "canva_link", url: "https://canva.link/abc123" });
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [{ kind: "link", formatCode: "canva_link", url: full }],
    });
  });

  it("saves without a check on an API that has none", async () => {
    checkArtworkLink.mockResolvedValue(null);

    await useDesignLink.getState().commit(URL_OK, "cline_1");

    expect(useDesignLink.getState().checks[checkKey(LINK)]).toEqual({ phase: "unavailable" });
    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkAttachments: [{ kind: "link", ...LINK }] });
    expect(useDesignLink.getState().saveError.cline_1).toBeNull();
  });

  it("says so when an older API drops the link it was sent", async () => {
    checkArtworkLink.mockResolvedValue(null);
    const { artworkLinks: _links, artworkAttachments: _list, ...old } = line();
    useCart.setState({ cart: cart([old as CartLineRecord]) });
    updateCartLine.mockImplementation(async () => cart([old as CartLineRecord]));

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
    const refused = line({ artworkLinks: [LINK], artworkAttachments: [{ kind: "link", ...LINK }] });
    useDesignLink.getState().setProblem("cline_1", {
      code: "artwork_link_check_failed",
      message: "Make the design viewable by anyone with the link.",
      signature: artworkSignature(refused),
    });

    expect(currentProblem(useDesignLink.getState().problems, refused)?.message).toMatch(/viewable/);
    // A new link (or a file instead) is new artwork: the old refusal is moot.
    expect(
      currentProblem(useDesignLink.getState().problems, line({ artworkAttachments: [{ kind: "file", fileId: "file_2" }] })),
    ).toBeNull();
  });

  it("leaves the item alone when the field is emptied: links come off by their own Remove", async () => {
    useCart.setState({ cart: cart([line({ artworkAttachments: [{ kind: "link", ...LINK }] })]) });

    await useDesignLink.getState().commit("", "cline_1");

    expect(checkArtworkLink).not.toHaveBeenCalled();
    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("checks a saved link again when asked, even after it passed", async () => {
    checkArtworkLink.mockResolvedValue(checked({ ok: true, access: "public_view" }));
    await useDesignLink.getState().verify(LINK);
    await useDesignLink.getState().verify(LINK, { force: true });

    expect(checkArtworkLink).toHaveBeenCalledTimes(2);
  });
});
