import * as api from "@/lib/api";
import { choicesKey, defaultPrint } from "@/lib/express";
import { draftBody, expressChoices, printersBody, useExpress } from "@/store/express";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    readExpressPrinters: jest.fn(),
    listExpressShops: jest.fn(),
    createExpressDraft: jest.fn(),
    getFile: jest.fn(),
    applyCartVoucher: jest.fn(),
    removeCartVoucher: jest.fn(),
  };
});

const FILE: api.StoredFile = {
  fileId: "file_1",
  state: "ready",
  detectedContentType: "application/pdf",
  detected: { pageCount: 4, pageSize: "A4", widthMilli: 210_000, heightMilli: 297_000 },
} as api.StoredFile;

const HOME = { lat: 7.07, lng: 125.61, label: "Home", addressId: "addr_1" };

function card(overrides: Partial<api.ExpressShop> = {}): api.ExpressShop {
  return {
    supplierId: "shop_1",
    catalogItemIds: ["item_1"],
    name: "Corner Print",
    address: "Davao",
    location: { lat: 7.07, lng: 125.61 },
    distanceMeters: 900,
    rating: null,
    jobsAhead: 0,
    readyAt: "2026-11-24T06:00:00.000Z",
    isNew: false,
    busy: false,
    selectable: true,
    isOpenNow: true,
    openStatus: "open",
    ...overrides,
  };
}

function read(shops: api.ExpressShop[], expandedZones: string[] = []): api.ExpressPrintersRead {
  return { shops, sort: "nearby", expanded: expandedZones.length > 0, expandedZones, expansionReason: null, fareBands: [] };
}

function seed(overrides: Partial<ReturnType<typeof useExpress.getState>> = {}) {
  useExpress.setState({ files: [FILE], prints: [defaultPrint(FILE)], place: HOME, step: "printer", ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  useExpress.getState().reset();
});

describe("the printer read", () => {
  it("sends the preview's files without a shop, with the sort and filters", async () => {
    seed({ printerSort: "fastest", verifiedOnly: true });
    jest.mocked(api.readExpressPrinters).mockResolvedValue(read([card()]));
    await useExpress.getState().loadPrinters();
    const body = jest.mocked(api.readExpressPrinters).mock.calls[0][0];
    expect(body).toMatchObject({ fulfillmentMode: "pickup", sort: "fastest", shopsOnly: false, verifiedOnly: true });
    expect(body.files[0]).not.toHaveProperty("catalogItemId");
    expect(body).not.toHaveProperty("supplierId");
    expect(useExpress.getState()).toMatchObject({ whoPrints: "on", shops: [card()] });
  });

  it("sends the drop-off for delivery, and waits for a saved place", () => {
    seed({ fulfilment: "delivery", place: { ...HOME, addressId: null } });
    expect(printersBody(useExpress.getState())).toBeNull();
    seed({ fulfilment: "delivery" });
    expect(printersBody(useExpress.getState())).toMatchObject({ dropoff: { lat: 7.07, lng: 125.61, label: "Home" } });
  });

  it("drops Lowest price once the order no longer has A3", () => {
    seed({ printerSort: "lowest_price" });
    expect(printersBody(useExpress.getState())?.sort).toBe("nearby");
  });

  it("steps aside on an API without the printer choice and keeps today's shop list", async () => {
    seed({ step: "printer", prints: [{ ...defaultPrint(FILE), paper: "a3" }] });
    jest.mocked(api.readExpressPrinters).mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
    jest.mocked(api.listExpressShops).mockResolvedValue([card()]);
    await useExpress.getState().loadPrinters();
    const state = useExpress.getState();
    expect(state).toMatchObject({ whoPrints: "off", fareLimit: null, step: "pay", supplierId: "shop_1" });
    // A3 needs the printer choice, so it goes back to A4.
    expect(state.prints[0].paper).toBe("a4");
    expect(api.listExpressShops).toHaveBeenCalled();
  });

  it("keeps the flow on a passing failure", async () => {
    seed();
    jest.mocked(api.readExpressPrinters).mockRejectedValue(new api.ApiError(500, { error: "boom" }));
    await useExpress.getState().loadPrinters();
    expect(useExpress.getState().whoPrints).toBe("unknown");
    expect(useExpress.getState().shopsError).toBeTruthy();
  });

  it("lets a picked printer go once it closed", async () => {
    seed({ whoPrints: "on", fareLimit: null, supplierId: "shop_1", chosenShop: card() });
    jest.mocked(api.readExpressPrinters).mockResolvedValue(read([card({ selectable: false, openStatus: "closed" })]));
    await useExpress.getState().loadPrinters();
    expect(useExpress.getState()).toMatchObject({ supplierId: null, chosenShop: null });
  });
});

describe("drafts", () => {
  it("Just print it sends the selection and fare limit, never a shop", () => {
    seed({ whoPrints: "on", fareLimit: "up_to_149", supplierId: "shop_9" });
    const body = draftBody(useExpress.getState());
    expect(body).toMatchObject({ selection: "just_print_it", fareLimit: "up_to_149" });
    expect(body).not.toHaveProperty("supplierId");
  });

  it("Just print it obeys Shops only and Verified only, and a filter change makes a new draft", () => {
    seed({ whoPrints: "on", fareLimit: "nearby", shopsOnly: true });
    expect(draftBody(useExpress.getState())).toMatchObject({ selection: "just_print_it", shopsOnly: true });
    expect(draftBody(useExpress.getState())).not.toHaveProperty("verifiedOnly");
    const before = choicesKey(expressChoices(useExpress.getState()));
    useExpress.getState().setFilter("verifiedOnly", true);
    expect(draftBody(useExpress.getState())).toMatchObject({ shopsOnly: true, verifiedOnly: true });
    expect(choicesKey(expressChoices(useExpress.getState()))).not.toBe(before);
  });

  it("a manual pick is not re-drafted by a filter change", () => {
    seed({ whoPrints: "on", fareLimit: null, supplierId: "shop_1", chosenShop: card() });
    const before = choicesKey(expressChoices(useExpress.getState()));
    useExpress.getState().setFilter("shopsOnly", true);
    expect(choicesKey(expressChoices(useExpress.getState()))).toBe(before);
    expect(draftBody(useExpress.getState())).not.toHaveProperty("shopsOnly");
  });

  it("does not let GRIDGO pick before the API has said it can", () => {
    seed({ whoPrints: "unknown", fareLimit: "nearby" });
    expect(draftBody(useExpress.getState())).toBeNull();
  });

  it("never lets GRIDGO pick for A3", () => {
    seed({ whoPrints: "on", fareLimit: "nearby", prints: [{ ...defaultPrint(FILE), paper: "a3" }] });
    expect(draftBody(useExpress.getState())).toBeNull();
  });

  it("a picked card is drafted with its own listing, even when a later sort hides it", () => {
    seed({ whoPrints: "on" });
    useExpress.getState().chooseShop("shop_2", card({ supplierId: "shop_2", catalogItemIds: ["item_2"] }));
    useExpress.setState({ shops: [card()] });
    const body = draftBody(useExpress.getState());
    expect(useExpress.getState().fareLimit).toBeNull();
    expect(body).toMatchObject({ supplierId: "shop_2" });
    expect(body?.files[0].catalogItemId).toBe("item_2");
  });

  it("says plainly when no printer fits the fare limit", async () => {
    seed({ whoPrints: "on", fareLimit: "nearby" });
    jest.mocked(api.createExpressDraft).mockRejectedValue(new api.ApiError(409, { error: "express_shop_unavailable" }));
    await useExpress.getState().refreshDraft();
    const draft = useExpress.getState().draft;
    expect(draft.status).toBe("error");
    expect(draft.status === "error" && draft.message).toMatch(/No open printer fits that fare limit/);
  });

  it("re-reads printers when a picked printer became unavailable", async () => {
    seed({ whoPrints: "on", fareLimit: null, supplierId: "shop_1", chosenShop: card() });
    jest.mocked(api.createExpressDraft).mockRejectedValue(new api.ApiError(409, { error: "express_shop_unavailable" }));
    jest.mocked(api.readExpressPrinters).mockResolvedValue(read([card()]));
    await useExpress.getState().refreshDraft();
    expect(api.readExpressPrinters).toHaveBeenCalled();
  });
});

describe("re-pick after an A3 decline", () => {
  it("brings the same files and settings back to Who prints it?", async () => {
    jest.mocked(api.getFile).mockResolvedValue(FILE);
    const failure = await useExpress.getState().startRepick({
      fulfillmentMode: "delivery",
      expressOrder: {
        status: "cancelled",
        originalSupplierId: "shop_1",
        currentSupplierId: "shop_1",
        declineCount: 1,
        acceptBy: null,
        events: [],
        refundRequired: false,
        repickRequired: true,
        paymentTiming: "after_acceptance",
        printSettings: [
          {
            fileId: "file_1",
            pages: { total: 4, range: "1-2", printed: 2 },
            copies: 3,
            colour: "colour",
            paper: "a3",
            sides: "two",
            layout: "fit_to_paper",
            note: "Staple",
            acceptedWarnings: ["paper_size_mismatch"],
          },
        ],
      },
    });
    expect(failure).toBeNull();
    const state = useExpress.getState();
    expect(state).toMatchObject({ step: "printer", fulfilment: "delivery", fareLimit: null, files: [FILE] });
    expect(state.prints[0]).toMatchObject({ copies: 3, pageRange: "1-2", paper: "a3", colour: "colour", sides: "two", note: "Staple" });
  });

  it("says so when a file can no longer be opened", async () => {
    jest.mocked(api.getFile).mockRejectedValue(new api.ApiError(404, { error: "file_not_found" }));
    const failure = await useExpress.getState().startRepick({
      fulfillmentMode: "pickup",
      expressOrder: {
        status: "cancelled",
        originalSupplierId: "shop_1",
        currentSupplierId: null,
        declineCount: 1,
        acceptBy: null,
        events: [],
        refundRequired: false,
        printSettings: [{ fileId: "gone", pages: null, copies: 1, colour: "bw", paper: "a3", sides: "one", layout: "fit_to_paper", note: "", acceptedWarnings: [] }],
      },
    });
    expect(failure).toBeTruthy();
  });
});
