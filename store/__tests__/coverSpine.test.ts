import * as api from "@/lib/api";
import type { ArtworkAttachment, Cart, CartLineRecord, CatalogItem, CoverSpineRecord, StoredFile } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { coverSpineDraftOf, useCoverSpine } from "@/store/coverSpine";

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

const BOOK = { id: "sci_book", name: "Hardbound thesis", acceptedFormats: [], coverSpineForm: true } as unknown as CatalogItem;
const SPINE = { institutionCode: "ABC-CS", title: "Flood Risk Mapping", author: "Sample Author", month: 10, year: 2026 };

function line(entries: ArtworkAttachment[], coverSpine: CoverSpineRecord | null = null): CartLineRecord {
  return {
    id: "cline_1",
    catalogItemId: "sci_book",
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
    listing: BOOK,
    lineSubtotalMinor: 2500,
    coverSpine,
    coverSpineRequired: false,
  };
}

function cart(entries: ArtworkAttachment[], coverSpine: CoverSpineRecord | null = null): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [line(entries, coverSpine)],
    checkedOutOrderId: null,
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
}

function stored(fileId: string): StoredFile {
  return {
    fileId,
    purpose: "artwork",
    originalFilename: `${fileId}.pdf`,
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 400_000,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-10-16T00:00:00.000Z",
    readyAt: "2026-10-16T00:00:00.000Z",
    references: [],
    artworkCheck: { status: "passed" },
  };
}

const BOOK_FILE: ArtworkAttachment = { kind: "file", fileId: "file_book" };
const COVER_FILE: ArtworkAttachment = { kind: "file", fileId: "file_cover", label: "Cover" };
const HELD: CoverSpineRecord = { status: "given", cover: "separate_file", coverFileId: "file_cover", spine: SPINE };

function heldLine() {
  return useCart.getState().cart!.lines[0];
}

beforeEach(() => {
  updateCartLine.mockReset();
  uploadFile.mockReset();
  useArtworkAttachments.getState().reset();
  useCoverSpine.getState().reset();
  useCart.setState({ cartId: "cart_1", cart: cart([BOOK_FILE]), loading: false, busy: false, error: null });
});

describe("saving a book's cover and spine", () => {
  it("sends the finished form whole and then reads GRIDGO's copy", async () => {
    updateCartLine.mockImplementation(async () =>
      cart([BOOK_FILE], { status: "given", cover: "text_only", coverFileId: null, spine: { ...SPINE, institutionCode: null } }),
    );
    const store = useCoverSpine.getState();
    store.edit("cline_1", { cover: "text_only", title: " Flood  Risk Mapping ", author: "Sample Author", month: 10, year: "2026" });

    expect(await store.save("cline_1")).toBe(true);

    expect(updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      coverSpine: { cover: "text_only", spine: { institutionCode: null, title: "Flood Risk Mapping", author: "Sample Author", month: 10, year: 2026 } },
    });
    expect(useCoverSpine.getState().drafts.cline_1).toBeUndefined();
    expect(coverSpineDraftOf(useCoverSpine.getState().drafts, heldLine()).cover).toBe("text_only");
  });

  it("keeps a half-typed form on the phone and asks for what is missing", async () => {
    const store = useCoverSpine.getState();
    store.edit("cline_1", { cover: "first_page", title: "Flood Risk Mapping" });

    expect(await store.save("cline_1")).toBe(false);

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useCoverSpine.getState().attempted.cline_1).toBe(true);
    expect(useCoverSpine.getState().drafts.cline_1.title).toBe("Flood Risk Mapping");
  });

  it("says GRIDGO's refusal for the field it names", async () => {
    updateCartLine.mockRejectedValue(
      new api.ApiError(400, { error: "invalid_cover_spine", field: "coverSpine.spine.author", reason: "too_long" }),
    );
    const store = useCoverSpine.getState();
    store.edit("cline_1", { cover: "first_page", title: "T", author: "A", month: 1, year: "2026" });

    expect(await store.save("cline_1")).toBe(false);
    expect(useCoverSpine.getState().saveError.cline_1).toBe("Keep the author to 160 characters.");
  });
});

describe("the separate cover page", () => {
  it("goes onto the item labelled Cover, after the book's file, and is chosen as the cover", async () => {
    mockPicked = [{ uri: "file:///cover.pdf", name: "cover.pdf", mimeType: "application/pdf", size: 400_000 }];
    uploadFile.mockImplementation(() => ({ done: Promise.resolve(stored("file_cover")), cancel: jest.fn() }));
    updateCartLine.mockImplementation(async (_cartId, _lineId, input) => cart(input.artworkAttachments ?? []));

    await useCoverSpine.getState().uploadCover("cline_1");

    expect(updateCartLine.mock.calls[0][2]).toEqual({
      artworkAttachments: [{ kind: "file", fileId: "file_book" }, { kind: "file", fileId: "file_cover", label: "Cover" }],
    });
    expect(useCoverSpine.getState().drafts.cline_1).toMatchObject({ cover: "separate_file", coverFileId: "file_cover" });
    expect(useCoverSpine.getState().uploading.cline_1).toBe(false);
  });

  it("cannot be removed while it is the saved cover", async () => {
    useCart.setState({ cart: cart([BOOK_FILE, COVER_FILE], HELD) });

    await useArtworkAttachments.getState().remove("cline_1", "file file_cover");

    expect(updateCartLine).not.toHaveBeenCalled();
    expect(useArtworkAttachments.getState().saveError.cline_1).toBe(
      "This file is your cover page. Choose another cover below before you remove it.",
    );
  });

  it("takes the cover with it when a better export replaces it", async () => {
    useCart.setState({ cart: cart([BOOK_FILE, COVER_FILE], HELD) });
    mockPicked = [{ uri: "file:///cover2.pdf", name: "cover2.pdf", mimeType: "application/pdf", size: 400_000 }];
    uploadFile.mockImplementation(() => ({ done: Promise.resolve(stored("file_cover2")), cancel: jest.fn() }));
    updateCartLine.mockImplementation(async (_cartId, _lineId, input) =>
      cart(input.artworkAttachments ?? [], { ...HELD, coverFileId: "file_cover2" }),
    );

    await useArtworkAttachments.getState().replace("cline_1", "file_cover");

    expect(updateCartLine.mock.calls[0][2]).toEqual({
      artworkAttachments: [{ kind: "file", fileId: "file_book" }, { kind: "file", fileId: "file_cover2", label: "Cover" }],
      coverSpine: { cover: "separate_file", coverFileId: "file_cover2", spine: SPINE },
    });
  });
});
