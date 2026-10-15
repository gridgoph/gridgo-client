import * as api from "@/lib/api";
import type { ArtworkAttachment, Cart, CartLineRecord, CatalogItem, StoredFile } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, updateCartLine: jest.fn(), uploadFile: jest.fn(), getFile: jest.fn() };
});

let mockPicked: { uri: string; name: string; mimeType: string; size: number }[] = [];
jest.mock("@/lib/nativeModules", () => ({
  FILE_PICKER_NEEDS_REBUILD: "rebuild",
  getDocumentPickerNative: () => ({
    getDocumentAsync: async () => ({ canceled: false, assets: mockPicked }),
  }),
}));

const updateCartLine = api.updateCartLine as jest.MockedFunction<typeof api.updateCartLine>;
const uploadFile = api.uploadFile as jest.MockedFunction<typeof api.uploadFile>;

const LISTING = { id: "sci_shirts", name: "T-shirts", acceptedFormats: [] } as unknown as CatalogItem;

function line(entries: ArtworkAttachment[]): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_lovis",
    catalogItemId: "sci_shirts",
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
  };
}

function cart(entries: ArtworkAttachment[]): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [line(entries)],
    checkedOutOrderId: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
}

function stored(fileId: string, overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    fileId,
    purpose: "artwork",
    originalFilename: `${fileId}.png`,
    declaredContentType: "image/png",
    detectedContentType: "image/png",
    size: 400_000,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-10-15T00:00:00.000Z",
    readyAt: "2026-10-15T00:00:00.000Z",
    references: [],
    artworkCheck: { status: "passed" },
    ...overrides,
  };
}

const asset = (name: string) => ({ uri: `file:///${name}`, name, mimeType: "image/png", size: 400_000 });

function entries(): ArtworkAttachment[] {
  return useCart.getState().cart?.lines[0].artworkAttachments ?? [];
}

beforeEach(() => {
  updateCartLine.mockReset();
  uploadFile.mockReset();
  useArtworkAttachments.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart([]), loading: false, busy: false, error: null });
  // GRIDGO keeps the list it is sent, and answers with the basket.
  updateCartLine.mockImplementation(async (_cartId, _lineId, input) => cart(input.artworkAttachments ?? []));
});

describe("adding files to one item", () => {
  it("puts every file of one pick on the item, each in its own write, neither over the other", async () => {
    mockPicked = [asset("front"), asset("back")];
    uploadFile.mockImplementation((picked) => ({
      done: Promise.resolve(stored(`file_${picked.name}`)),
      cancel: jest.fn(),
    }));

    await useArtworkAttachments.getState().pick("cline_1");

    expect(entries()).toEqual([
      { kind: "file", fileId: "file_front" },
      { kind: "file", fileId: "file_back" },
    ]);
    // The second write was made to the list the first one came back with.
    expect(updateCartLine).toHaveBeenCalledTimes(2);
    expect(updateCartLine.mock.calls[1][2]).toEqual({
      artworkAttachments: [
        { kind: "file", fileId: "file_front" },
        { kind: "file", fileId: "file_back" },
      ],
    });
    expect(useArtworkAttachments.getState().uploads.cline_1).toEqual([]);
  });

  it("takes only what fits under the limit, and says so", async () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({ kind: "file" as const, fileId: `file_${index}` }));
    useCart.setState({ cart: cart(nine) });
    mockPicked = [asset("a"), asset("b"), asset("c")];
    uploadFile.mockImplementation((picked) => ({ done: Promise.resolve(stored(`file_${picked.name}`)), cancel: jest.fn() }));

    await useArtworkAttachments.getState().pick("cline_1");

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(entries()).toHaveLength(10);
    expect(useArtworkAttachments.getState().notice.cline_1).toBe(
      "Only 1 more file fits on this item, so 2 were left off.",
    );
  });

  it("never puts a file that failed GRIDGO's check on the item", async () => {
    mockPicked = [asset("broken")];
    uploadFile.mockImplementation(() => ({
      done: Promise.resolve(stored("file_broken", { artworkCheck: { status: "failed", message: "The PDF ends early." } })),
      cancel: jest.fn(),
    }));

    await useArtworkAttachments.getState().pick("cline_1");

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useArtworkAttachments.getState().uploads.cline_1).toEqual([
      expect.objectContaining({ phase: "failed", refusal: "check", error: expect.stringMatching(/The PDF ends early/) }),
    ]);
  });

  it("keeps a stored file whose add was refused, and adds it on retry without sending it again", async () => {
    mockPicked = [asset("front")];
    uploadFile.mockImplementation(() => ({ done: Promise.resolve(stored("file_front")), cancel: jest.fn() }));
    updateCartLine.mockRejectedValueOnce(new api.ApiError(503, { error: "unavailable" }));

    await useArtworkAttachments.getState().pick("cline_1");
    const [failed] = useArtworkAttachments.getState().uploads.cline_1;
    expect(failed).toMatchObject({ phase: "failed", fileId: "file_front", refusal: null });

    await useArtworkAttachments.getState().retry("cline_1", failed.key);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(entries()).toEqual([{ kind: "file", fileId: "file_front" }]);
    expect(useArtworkAttachments.getState().uploads.cline_1).toEqual([]);
  });

  it("refuses a type the listing does not take before a byte moves", async () => {
    mockPicked = [{ uri: "file:///thesis.docx", name: "thesis.docx", mimeType: "application/msword", size: 1000 }];

    await useArtworkAttachments.getState().pick("cline_1", {
      accept: ["image/png"],
      check: () => false,
      rejection: (name) => `T-shirts takes PNG. ${name} is not one.`,
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(useArtworkAttachments.getState().uploads.cline_1).toEqual([
      expect.objectContaining({ phase: "failed", refusal: "format", error: "T-shirts takes PNG. thesis.docx is not one." }),
    ]);
  });
});

describe("arranging what is there", () => {
  const FRONT = { kind: "file" as const, fileId: "file_front", label: "Front" };
  const BACK = { kind: "file" as const, fileId: "file_back" };
  const LINK = { kind: "link" as const, formatCode: "canva_link", url: "https://www.canva.com/design/A/view" };

  beforeEach(() => useCart.setState({ cart: cart([FRONT, BACK, LINK]) }));

  it("moves an entry and sends the new order", async () => {
    await useArtworkAttachments.getState().move("cline_1", "file file_back", -1);

    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { artworkAttachments: [BACK, FRONT, LINK] });
  });

  it("labels an entry, and sends nothing when the label did not change", async () => {
    await useArtworkAttachments.getState().relabel("cline_1", "file file_back", " Back ");
    expect(updateCartLine).toHaveBeenLastCalledWith("cart_1", "cline_1", {
      artworkAttachments: [FRONT, { ...BACK, label: "Back" }, LINK],
    });

    updateCartLine.mockClear();
    await useArtworkAttachments.getState().relabel("cline_1", "file file_back", "Back");
    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("removes one entry and keeps the rest in order", async () => {
    await useArtworkAttachments.getState().remove("cline_1", "file file_front");

    expect(entries()).toEqual([BACK, LINK]);
  });

  it("says when GRIDGO refuses a change, and keeps what it holds", async () => {
    updateCartLine.mockRejectedValueOnce(
      new api.ApiError(400, { error: "artwork_attachment_limit_exceeded" }),
    );

    await useArtworkAttachments.getState().remove("cline_1", "file file_front");

    expect(entries()).toEqual([FRONT, BACK, LINK]);
    expect(useArtworkAttachments.getState().saveError.cline_1).toBe(
      "An item can have 10 files and design links at most. Remove one, then add this again.",
    );
  });
});
