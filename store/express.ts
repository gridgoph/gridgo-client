import { create } from "zustand";

import * as api from "@/lib/api";
import { artworkErrorMessage, normalizeFileName } from "@/lib/artworkUpload";
import {
  changePrint,
  choicesKey,
  defaultPrint,
  EXPRESS_MAX_FILES,
  sortExpressShops,
  type ExpressChoices,
  type ExpressFulfilment,
  type ExpressPrint,
  type ExpressShop,
  type ExpressShopSort,
  type ExpressWarningCode,
} from "@/lib/express";
import { userFacingError } from "@/lib/copy";
import { useExpressShops } from "@/store/expressShops";

export type ExpressStep = "files" | "preview" | "pay";

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
  draft: DraftState;
  /** The choices the client ticked "Looks right" on; any change clears it. */
  tickedKey: string | null;
  /** A voucher the client chose by hand, re-applied to every new draft. */
  voucherId: string | null;
  voucherOff: boolean;
  /** Set once the order is placed, so the back guard lets the route go. */
  leaving: boolean;

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
  chooseShop: (supplierId: string) => void;
  refreshDraft: () => Promise<void>;
  adoptQuote: (cartId: string, quote: api.ExpressQuote) => void;
  chooseVoucher: (voucherId: string | null) => void;
  reset: () => void;
};

const handles = new Map<string, api.UploadHandle>();
let uploadSeq = 0;
let draftSeq = 0;

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
  draft: { status: "idle" } as DraftState,
  tickedKey: null,
  voucherId: null,
  voucherOff: false,
  leaving: false,
};

export function expressChoices(state: Pick<ExpressState, "prints" | "supplierId" | "fulfilment" | "place">): ExpressChoices {
  return {
    prints: state.prints,
    supplierId: state.supplierId,
    fulfilment: state.fulfilment,
    dropoff: state.place,
  };
}

/** The draft body for the current choices, or null while something is missing. */
export function draftBody(state: ExpressState): api.ExpressDraftBody | null {
  const shop = state.shops?.find((row) => row.supplierId === state.supplierId);
  if (!shop || !state.place || !state.prints.length) return null;
  if (state.fulfilment === "delivery" && !state.place.addressId) return null;
  return {
    supplierId: shop.supplierId,
    location: { lat: state.place.lat, lng: state.place.lng },
    fulfillmentMode: state.fulfilment,
    ...(state.fulfilment === "delivery"
      ? { dropoff: { lat: state.place.lat, lng: state.place.lng, label: state.place.label } }
      : {}),
    files: state.prints.map((print) => ({
      fileId: print.fileId,
      catalogItemId: shop.catalogItemIds[0],
      copies: print.copies,
      ...(print.pageRange ? { pageRange: print.pageRange } : {}),
      paper: print.paper,
      colour: print.colour,
      sides: print.sides,
      layout: print.layout,
      ...(print.note.trim() ? { note: print.note.trim() } : {}),
      acceptedWarnings: print.acceptedWarnings,
    })),
  };
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
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

  upload: (asset) => {
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
  },

  addSavedFile: async (fileId) => {
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

  setTicked: (ticked) => set({ tickedKey: ticked ? choicesKey(expressChoices(get())) : null }),

  setFulfilment: (fulfilment) => set({ fulfilment }),

  setPlace: (place) => {
    const previous = get().place;
    set({ place });
    if (!previous || previous.lat !== place.lat || previous.lng !== place.lng) void get().loadShops();
  },

  loadShops: async () => {
    const place = get().place;
    if (!place) return;
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

  chooseShop: (supplierId) => set({ supplierId }),

  refreshDraft: async () => {
    const state = get();
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
      if (errorCode(error) === "express_shop_unavailable") void get().loadShops();
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
    set({ ...INITIAL });
  },
}));
