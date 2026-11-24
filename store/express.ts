import { create } from "zustand";

import * as api from "@/lib/api";
import { artworkErrorMessage, normalizeFileName } from "@/lib/artworkUpload";
import {
  changePrint,
  choicesKey,
  defaultPrint,
  EXPRESS_MAX_FILES,
  previewKey,
  expressFileProblem,
  sortExpressShops,
  type ExpressChoices,
  type ExpressFulfilment,
  type ExpressPrint,
  type ExpressShop,
  type ExpressShopSort,
  type ExpressWarningCode,
} from "@/lib/express";
import { userFacingError } from "@/lib/copy";
import { SAMPLE_FILE, SAMPLE_PLACE, SAMPLE_SHOP, sampleDraft } from "@/lib/expressGuide";
import { useExpressGuide } from "@/store/expressGuide";
import { useExpressShops } from "@/store/expressShops";
import {
  apiErrorCode,
  A3_PICK_YOURSELF,
  NO_PRINTER_WITHIN_LIMIT,
  printerChoiceMissing,
  usesShopPrices,
  validSort,
} from "@/lib/whoPrints";

/** "printer" is "Who prints it?" — shown only when the API offers the printer choice. */
export type ExpressStep = "files" | "preview" | "printer" | "pay";

/**
 * Whether this API offers "Who prints it?" (gridgo-api B26328C8). Unknown until
 * the first `POST /express/shops` answers; an older API answers 404 and the flow
 * keeps today's three steps and shop sheet.
 */
export type WhoPrints = "unknown" | "on" | "off";

export type ExpressUpload = {
  key: string;
  name: string;
  progress: number | null;
  error: string | null;
};

/** Where the client is: the point shops are measured from, and the drop-off when delivering. */
export type ExpressPlace = { lat: number; lng: number; label: string; addressId: string | null };

type DraftState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; draft: api.ExpressDraft }
  | { status: "error"; key: string; message: string; code: string | null };

type ExpressState = {
  step: ExpressStep;
  files: api.StoredFile[];
  uploads: ExpressUpload[];
  prints: ExpressPrint[];
  /** The file the Preview step is showing. */
  activeFileId: string | null;
  fulfilment: ExpressFulfilment;
  place: ExpressPlace | null;
  shops: ExpressShop[] | null;
  shopsError: string | null;
  sort: ExpressShopSort;
  supplierId: string | null;
  /** The card the client picked, kept even when a later sort no longer lists it. */
  chosenShop: ExpressShop | null;
  whoPrints: WhoPrints;
  /** "Just print it" and how far GRIDGO may go for the fare. Null when the client picks the printer. */
  fareLimit: api.ExpressFareLimit | null;
  printerSort: api.ExpressPrinterSort;
  shopsOnly: boolean;
  verifiedOnly: boolean;
  /** The last `POST /express/shops` answer, for the widening line and the fare bands. */
  printers: api.ExpressPrintersRead | null;
  printersLoading: boolean;
  draft: DraftState;
  /** The choices the client ticked "Looks right" on; any change clears it. */
  tickedKey: string | null;
  /** A voucher the client chose by hand, re-applied to every new draft. */
  voucherId: string | null;
  voucherOff: boolean;
  /** Set once the order is placed, so the back guard lets the route go. */
  leaving: boolean;
  /**
   * How to order is drawing sample data on these screens (gridgo-client#441):
   * nothing uploads, no shop list or draft is read, and nothing can be placed.
   */
  sample: boolean;
  /**
   * Editing one person's own files for a group order (gridgo-client#451):
   * Files and Preview only. Nothing is priced here; GRIDGO works out the
   * share against the whole group once the files are saved.
   */
  group: { id: string } | null;

  /** Fills the flow with the guide's sample file, shop and price. */
  startSample: () => void;

  leave: () => void;
  goTo: (step: ExpressStep) => void;
  upload: (asset: api.UploadAsset) => void;
  addFile: (file: api.StoredFile) => void;
  addSavedFile: (fileId: string) => Promise<string | null>;
  removeFile: (fileId: string) => void;
  dismissUpload: (key: string) => void;
  showFile: (fileId: string) => void;
  changePrint: (fileId: string, change: Partial<ExpressPrint>) => void;
  acceptWarning: (fileId: string, code: ExpressWarningCode) => void;
  setTicked: (ticked: boolean) => void;
  setFulfilment: (fulfilment: ExpressFulfilment) => void;
  setPlace: (place: ExpressPlace) => void;
  loadShops: () => Promise<void>;
  setSort: (sort: ExpressShopSort) => void;
  chooseShop: (supplierId: string, card?: ExpressShop) => void;
  loadPrinters: () => Promise<void>;
  setFareLimit: (fareLimit: api.ExpressFareLimit) => void;
  setPrinterSort: (sort: api.ExpressPrinterSort) => void;
  setFilter: (filter: "shopsOnly" | "verifiedOnly", on: boolean) => void;
  /** An A3 shop declined or timed out: the same files, back on "Who prints it?". */
  startRepick: (order: Pick<api.Order, "fulfillmentMode" | "expressOrder">) => Promise<string | null>;
  refreshDraft: () => Promise<void>;
  /** Opens the flow on a group's files, filled in with what the caller already saved. */
  startGroupFiles: (groupId: string, saved: api.ExpressGroupFile[]) => Promise<string | null>;
  adoptQuote: (cartId: string, quote: api.ExpressQuote) => void;
  chooseVoucher: (voucherId: string | null) => void;
  reset: () => void;
};

const handles = new Map<string, api.UploadHandle>();
let uploadSeq = 0;
let draftSeq = 0;
let printersSeq = 0;

const INITIAL = {
  step: "files" as ExpressStep,
  files: [],
  uploads: [],
  prints: [],
  activeFileId: null,
  fulfilment: "pickup" as ExpressFulfilment,
  place: null,
  shops: null,
  shopsError: null,
  sort: "nearest" as ExpressShopSort,
  supplierId: null,
  chosenShop: null as ExpressShop | null,
  whoPrints: "unknown" as WhoPrints,
  // The easy default: GRIDGO picks the fastest nearby printer.
  fareLimit: "nearby" as api.ExpressFareLimit | null,
  printerSort: "nearby" as api.ExpressPrinterSort,
  shopsOnly: false,
  verifiedOnly: false,
  printers: null as api.ExpressPrintersRead | null,
  printersLoading: false,
  draft: { status: "idle" } as DraftState,
  tickedKey: null,
  voucherId: null,
  voucherOff: false,
  leaving: false,
  sample: false,
  group: null as { id: string } | null,
};

export function expressChoices(
  state: Pick<ExpressState, "prints" | "supplierId" | "fulfilment" | "place"> & { fareLimit?: api.ExpressFareLimit | null },
): ExpressChoices {
  return {
    prints: state.prints,
    supplierId: state.supplierId,
    fareLimit: state.fareLimit ?? null,
    fulfilment: state.fulfilment,
    dropoff: state.place,
  };
}

function draftFiles(prints: ExpressPrint[], catalogItemId: string | null): api.ExpressDraftFile[] {
  return prints.map((print) => ({
    fileId: print.fileId,
    ...(catalogItemId ? { catalogItemId } : {}),
    copies: print.copies,
    ...(print.pageRange ? { pageRange: print.pageRange } : {}),
    paper: print.paper,
    colour: print.colour,
    sides: print.sides,
    layout: print.layout,
    ...(print.note.trim() ? { note: print.note.trim() } : {}),
    acceptedWarnings: print.acceptedWarnings,
  }));
}

type PlaceBody = Pick<api.ExpressDraftBody, "location" | "fulfillmentMode" | "dropoff">;

function placeBody(state: Pick<ExpressState, "place" | "fulfilment">): PlaceBody | null {
  const place = state.place;
  if (!place) return null;
  if (state.fulfilment === "delivery" && !place.addressId) return null;
  return {
    location: { lat: place.lat, lng: place.lng },
    fulfillmentMode: state.fulfilment,
    ...(state.fulfilment === "delivery" ? { dropoff: { lat: place.lat, lng: place.lng, label: place.label } } : {}),
  };
}

/** The shop the client picked: the kept card, else the current list's row. */
function chosenCard(state: Pick<ExpressState, "supplierId" | "chosenShop" | "shops">): ExpressShop | null {
  if (!state.supplierId) return null;
  if (state.chosenShop?.supplierId === state.supplierId) return state.chosenShop;
  return state.shops?.find((row) => row.supplierId === state.supplierId) ?? null;
}

/** The draft body for the current choices, or null while something is missing. */
export function draftBody(state: ExpressState): api.ExpressDraftBody | null {
  if (!state.prints.length) return null;
  const where = placeBody(state);
  if (!where) return null;
  if (state.fareLimit && state.whoPrints !== "off") {
    // Only an API that answered the printer read can pick; A3 is never picked for the client.
    if (state.whoPrints !== "on" || usesShopPrices(state.prints)) return null;
    return { selection: "just_print_it", fareLimit: state.fareLimit, ...where, files: draftFiles(state.prints, null) };
  }
  const shop = chosenCard(state);
  if (!shop || shop.selectable === false) return null;
  return { supplierId: shop.supplierId, ...where, files: draftFiles(state.prints, shop.catalogItemIds[0] ?? null) };
}

/** The `POST /express/shops` body, or null until files and a place are ready. */
export function printersBody(state: ExpressState): Parameters<typeof api.readExpressPrinters>[0] | null {
  if (!state.prints.length || state.files.some((file) => expressFileProblem(file))) return null;
  const where = placeBody(state);
  if (!where) return null;
  return {
    ...where,
    files: draftFiles(state.prints, null),
    sort: validSort(state.printerSort, usesShopPrices(state.prints)),
    shopsOnly: state.shopsOnly,
    verifiedOnly: state.verifiedOnly,
  };
}

const errorCode = apiErrorCode;

/** A print setting saved on an order or a group, back as an editable print. */
function savedPrint(
  file: api.StoredFile,
  setting: {
    copies: number;
    pageRange?: string | null;
    paper: string;
    colour: ExpressPrint["colour"];
    sides: ExpressPrint["sides"];
    layout: string;
    note?: string | null;
    acceptedWarnings: string[];
  },
): ExpressPrint {
  const paper = (["a4", "short", "long", "a3"] as const).find((value) => value === setting.paper) ?? defaultPrint(file).paper;
  return {
    ...defaultPrint(file),
    copies: setting.copies,
    pageRange: setting.pageRange ?? null,
    paper,
    colour: setting.colour,
    sides: setting.sides,
    layout: (setting.layout as ExpressPrint["layout"]) ?? "fit_to_paper",
    note: setting.note ?? "",
    acceptedWarnings: setting.acceptedWarnings.filter(
      (code): code is ExpressWarningCode => code === "paper_size_mismatch" || code === "rgb_colour",
    ),
  };
}

/**
 * The Express order being built: files, each file's print settings, where and
 * which shop, and the internal draft gridgo-api priced. Nothing here is
 * persisted: a half-built Express order is minutes old and cheap to redo.
 */
export const useExpress = create<ExpressState>((set, get) => ({
  ...INITIAL,

  goTo: (step) => set({ step }),

  leave: () => set({ leaving: true }),

  startSample: () => {
    get().reset();
    const prints = [defaultPrint(SAMPLE_FILE)];
    const fulfilment: ExpressFulfilment = "pickup";
    const key = choicesKey({ prints, supplierId: SAMPLE_SHOP.supplierId, fulfilment, dropoff: SAMPLE_PLACE });
    set({
      sample: true,
      // The guide shows today's three steps with its one sample shop.
      whoPrints: "off",
      fareLimit: null,
      files: [SAMPLE_FILE],
      prints,
      activeFileId: SAMPLE_FILE.fileId,
      fulfilment,
      place: SAMPLE_PLACE,
      shops: [SAMPLE_SHOP],
      supplierId: SAMPLE_SHOP.supplierId,
      draft: { status: "ready", key, draft: sampleDraft() },
      tickedKey: previewKey(prints),
    });
  },

  upload: (asset) => {
    if (get().sample) return;
    if (get().files.length + get().uploads.length >= EXPRESS_MAX_FILES) return;
    const key = `upload_${++uploadSeq}`;
    const name = normalizeFileName(asset.name);
    set({ uploads: [...get().uploads, { key, name, progress: 0, error: null }] });
    const handle = api.uploadFile({ ...asset, name }, "artwork", (fraction) => {
      set({ uploads: get().uploads.map((row) => (row.key === key ? { ...row, progress: fraction } : row)) });
    });
    handles.set(key, handle);
    handle.done
      .then((file) => {
        if (!handles.has(key)) return;
        handles.delete(key);
        set({ uploads: get().uploads.filter((row) => row.key !== key) });
        get().addFile(file);
      })
      .catch((error: unknown) => {
        if (!handles.has(key)) return;
        handles.delete(key);
        set({
          uploads: get().uploads.map((row) =>
            row.key === key ? { ...row, progress: null, error: artworkErrorMessage(error) } : row,
          ),
        });
      });
  },

  addFile: (file) => {
    const state = get();
    if (state.files.some((row) => row.fileId === file.fileId)) return;
    if (state.files.length >= EXPRESS_MAX_FILES) return;
    set({
      files: [...state.files, file],
      prints: [...state.prints, defaultPrint(file)],
      activeFileId: state.activeFileId ?? file.fileId,
    });
    // A file in Express is the Founding Tester's step one ("Start an order").
    if (!state.sample && file.state === "ready") useExpressGuide.getState().fileAdded(file.fileId);
  },

  addSavedFile: async (fileId) => {
    if (get().sample) return null;
    try {
      const file = await api.getFile(fileId);
      get().addFile(file);
      return null;
    } catch (error) {
      return userFacingError(error, "That file could not be opened. Pick it again.");
    }
  },

  removeFile: (fileId) => {
    const state = get();
    const files = state.files.filter((row) => row.fileId !== fileId);
    set({
      files,
      prints: state.prints.filter((row) => row.fileId !== fileId),
      activeFileId: state.activeFileId === fileId ? (files[0]?.fileId ?? null) : state.activeFileId,
    });
  },

  dismissUpload: (key) => {
    handles.get(key)?.cancel();
    handles.delete(key);
    set({ uploads: get().uploads.filter((row) => row.key !== key) });
  },

  showFile: (fileId) => set({ activeFileId: fileId }),

  changePrint: (fileId, change) => {
    const state = get();
    const file = state.files.find((row) => row.fileId === fileId);
    if (!file) return;
    set({ prints: state.prints.map((print) => (print.fileId === fileId ? changePrint(file, print, change) : print)) });
  },

  acceptWarning: (fileId, code) => {
    set({
      prints: get().prints.map((print) =>
        print.fileId === fileId && !print.acceptedWarnings.includes(code)
          ? { ...print, acceptedWarnings: [...print.acceptedWarnings, code] }
          : print,
      ),
    });
  },

  setTicked: (ticked) => set({ tickedKey: ticked ? previewKey(get().prints) : null }),

  setFulfilment: (fulfilment) => set({ fulfilment }),

  setPlace: (place) => {
    const previous = get().place;
    set({ place });
    // "Who prints it?" reads its own list once files are ready; the older sheet reads here.
    if (get().whoPrints !== "off") return;
    if (!previous || previous.lat !== place.lat || previous.lng !== place.lng) void get().loadShops();
  },

  loadShops: async () => {
    const place = get().place;
    if (!place || get().sample || get().group) return;
    set({ shopsError: null });
    try {
      const shops = await api.listExpressShops(place, "nearest");
      if (get().place !== place) return;
      useExpressShops.getState().remember(shops);
      const current = get().supplierId;
      const keep = shops.some((shop) => shop.supplierId === current);
      set({
        shops,
        supplierId: keep ? current : (sortExpressShops(shops, "nearest")[0]?.supplierId ?? null),
      });
    } catch (error) {
      if (get().place !== place) return;
      set({ shops: get().shops, shopsError: userFacingError(error, "Shops could not load. Try again.") });
    }
  },

  setSort: (sort) => set({ sort }),

  chooseShop: (supplierId, card) =>
    set({
      supplierId,
      chosenShop: card ?? get().shops?.find((row) => row.supplierId === supplierId) ?? null,
      fareLimit: null,
    }),

  setFareLimit: (fareLimit) => set({ fareLimit }),

  setPrinterSort: (printerSort) => set({ printerSort }),

  setFilter: (filter, on) => set(filter === "shopsOnly" ? { shopsOnly: on } : { verifiedOnly: on }),

  loadPrinters: async () => {
    const state = get();
    if (state.sample || state.group || state.whoPrints === "off") return;
    const body = printersBody(state);
    if (!body) return;
    const seq = ++printersSeq;
    set({ printersLoading: true, shopsError: null });
    try {
      const read = await api.readExpressPrinters(body);
      if (seq !== printersSeq) return;
      useExpressShops.getState().remember(read.shops);
      const current = get();
      const fresh = current.supplierId ? read.shops.find((row) => row.supplierId === current.supplierId) : undefined;
      // A picked printer that closed since is let go; one this sort hides is kept.
      const lost = fresh?.selectable === false;
      set({
        whoPrints: "on",
        printers: read,
        shops: read.shops,
        printersLoading: false,
        ...(fresh ? { chosenShop: lost ? null : fresh } : {}),
        ...(lost ? { supplierId: null } : {}),
      });
    } catch (error) {
      if (seq !== printersSeq) return;
      if (printerChoiceMissing(error)) {
        // An API from before the printer choice: today's flow, today's shop sheet.
        set({
          whoPrints: "off",
          fareLimit: null,
          printersLoading: false,
          // A3 needs the printer choice (each shop's price, paid after it accepts).
          prints: get().prints.map((print) => (print.paper === "a3" ? { ...print, paper: "a4" } : print)),
        });
        if (get().step === "printer") set({ step: "pay" });
        await get().loadShops();
        return;
      }
      set({ printersLoading: false, shopsError: userFacingError(error, "Printers could not load. Try again.") });
    }
  },

  startRepick: async (order) => {
    get().reset();
    const settings = order.expressOrder?.printSettings ?? [];
    const files: api.StoredFile[] = [];
    try {
      for (const setting of settings) files.push(await api.getFile(setting.fileId));
    } catch (error) {
      return userFacingError(error, "Your files could not be opened. Start a new Express order.");
    }
    const prints: ExpressPrint[] = settings.map((setting) =>
      savedPrint(files.find((row) => row.fileId === setting.fileId) as api.StoredFile, {
        ...setting,
        pageRange: setting.pages?.range ?? null,
      }),
    );
    set({
      files,
      prints,
      activeFileId: files[0]?.fileId ?? null,
      fulfilment: order.fulfillmentMode === "delivery" ? "delivery" : "pickup",
      // A3 has no "Just print it": the client picks again.
      fareLimit: usesShopPrices(prints) ? null : "nearby",
      step: "printer",
    });
    return null;
  },

  startGroupFiles: async (groupId, saved) => {
    get().reset();
    const files: api.StoredFile[] = [];
    try {
      for (const setting of saved) files.push(await api.getFile(setting.fileId));
    } catch (error) {
      return userFacingError(error, "Your files could not be opened. Add them again.");
    }
    const prints = saved.map((setting) =>
      savedPrint(files.find((row) => row.fileId === setting.fileId) as api.StoredFile, setting),
    );
    set({
      group: { id: groupId },
      // A group takes A4, Short and Long; there is no printer to choose.
      whoPrints: "off",
      fareLimit: null,
      files,
      prints,
      activeFileId: files[0]?.fileId ?? null,
      tickedKey: prints.length ? previewKey(prints) : null,
    });
    return null;
  },

  refreshDraft: async () => {
    const state = get();
    if (state.sample || state.group) return;
    const body = draftBody(state);
    if (!body) {
      if (state.draft.status !== "idle") set({ draft: { status: "idle" } });
      return;
    }
    const key = choicesKey(expressChoices(state));
    if (state.draft.status !== "idle" && state.draft.key === key && state.draft.status !== "error") return;
    const seq = ++draftSeq;
    set({ draft: { status: "loading", key } });
    try {
      let draft = await api.createExpressDraft(body);
      if (seq !== draftSeq) return;
      const { voucherId, voucherOff } = get();
      if (voucherId || voucherOff) {
        try {
          const result = voucherId
            ? await api.applyCartVoucher(draft.cartId, { voucherId })
            : await api.removeCartVoucher(draft.cartId);
          if (result.cart.clientQuote) draft = { ...draft, quote: result.cart.clientQuote };
        } catch {
          // A voucher that no longer applies leaves GRIDGO's own pick on the draft.
        }
        if (seq !== draftSeq) return;
      }
      set({ draft: { status: "ready", key, draft } });
    } catch (error) {
      if (seq !== draftSeq) return;
      set({
        draft: {
          status: "error",
          key,
          code: errorCode(error),
          message: userFacingError(error, "GRIDGO could not price this. Try again."),
        },
      });
      const code = errorCode(error);
      if (code === "express_shop_unavailable" && state.fareLimit && state.whoPrints !== "off") {
        set({ draft: { status: "error", key, code, message: NO_PRINTER_WITHIN_LIMIT } });
      } else if (code === "express_manual_selection_required") {
        set({ draft: { status: "error", key, code, message: A3_PICK_YOURSELF } });
      } else if (code === "express_shop_unavailable") {
        void (get().whoPrints === "off" ? get().loadShops() : get().loadPrinters());
      }
    }
  },

  adoptQuote: (cartId, quote) => {
    const draft = get().draft;
    if (draft.status !== "ready" || draft.draft.cartId !== cartId) return;
    set({ draft: { ...draft, draft: { ...draft.draft, quote } } });
  },

  chooseVoucher: (voucherId) => set({ voucherId, voucherOff: voucherId == null }),

  reset: () => {
    for (const handle of handles.values()) handle.cancel();
    handles.clear();
    draftSeq++;
    printersSeq++;
    set({ ...INITIAL });
  },
}));
