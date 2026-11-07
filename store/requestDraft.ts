import { create } from "zustand";
import { persist } from "zustand/middleware";

import { parseAddress } from "@/lib/address";
import { parseDeadline } from "@/lib/deadline";
import { createPersistStorage } from "@/lib/persistStorage";
import { clampQuantity } from "@/lib/quantity";
import type { RequestDraftFields, RequestStepId } from "@/lib/requestValidation";
import { REQUEST_STEPS } from "@/lib/requestValidation";
import { DEFAULT_ZONE_CODE } from "@/lib/zones";

const STORAGE_KEY = "gridgo.client.requestDraft.v1";

/**
 * Bumped when the draft gained structured fields: the address became lines, the
 * deadline became an instant, and artwork became a server-issued file id.
 * `migrate` carries a half-finished v1 draft across rather than discarding it —
 * a request in progress has to survive an app update the same way it survives
 * an app kill.
 */
const STORAGE_VERSION = 2;

/** Catalog metadata that travels with the draft but is not user input. */
type ProductMeta = {
  productName: string;
  basePriceMinor: number;
  unit: string;
  family: string;
};

export type RequestDraftState = RequestDraftFields &
  ProductMeta & {
    stepIndex: number;
    hydrated: boolean;
    setStepIndex: (index: number) => void;
    goNext: () => void;
    goBack: () => void;
    patch: (fields: Partial<RequestDraftFields & ProductMeta>) => void;
    /** Seed draft from a catalog product (new request). */
    selectProduct: (product: {
      id: string;
      name: string;
      basePriceMinor: number;
      unit: string;
      family: string;
    }) => void;
    /** True for the launch that discarded a draft saved on the retired form. */
    retiredNotice: boolean;
    dismissRetiredNotice: () => void;
    reset: () => void;
    currentStepId: () => RequestStepId;
  };

const emptyFields: RequestDraftFields & ProductMeta & { stepIndex: number } = {
  stepIndex: 0,
  productId: "",
  productName: "",
  basePriceMinor: 0,
  unit: "",
  family: "",
  title: "",
  size: "",
  material: "",
  finish: "",
  quantity: 1,
  deadline: "",
  addressLine1: "",
  barangay: "",
  landmark: "",
  zone: DEFAULT_ZONE_CODE,
  artworkFileId: "",
  artworkName: "",
};

/** Fields written to storage. Actions and transient flags stay out. */
const PERSISTED_KEYS = [
  "stepIndex",
  "productId",
  "productName",
  "basePriceMinor",
  "unit",
  "family",
  "title",
  "size",
  "material",
  "finish",
  "quantity",
  "deadline",
  "addressLine1",
  "barangay",
  "landmark",
  "zone",
  "artworkFileId",
  "artworkName",
] as const;

type PersistedDraft = Pick<RequestDraftState, (typeof PERSISTED_KEYS)[number]>;

/**
 * Bring a v1 draft forward. The old free-text deadline is only kept when it
 * parses to a real instant, and the old single-line address is split back into
 * the structured fields so the client sees their own words, not a blank form.
 */
export function migrateDraft(persisted: unknown, version: number): PersistedDraft {
  const source = (persisted ?? {}) as Record<string, unknown>;
  const base: PersistedDraft = { ...emptyFields };

  for (const key of PERSISTED_KEYS) {
    if (source[key] !== undefined) {
      (base as Record<string, unknown>)[key] = source[key];
    }
  }

  if (version < 2) {
    const address = parseAddress(typeof source.address === "string" ? source.address : "");
    base.addressLine1 = address.line1;
    base.barangay = address.barangay;
    base.landmark = address.landmark;
    // v1 stored whatever the client typed. Keep it only if it is a real instant.
    base.deadline = parseDeadline(base.deadline)?.toISOString() ?? "";
    // v1 had no uploads at all, so nothing on the server backs the old name.
    base.artworkFileId = "";
    base.finish = "";
  }

  return base;
}

export const useRequestDraft = create<RequestDraftState>()(
  persist(
    (set, get) => ({
      ...emptyFields,
      hydrated: false,
      setStepIndex: (index) =>
        set({ stepIndex: Math.max(0, Math.min(REQUEST_STEPS.length - 1, index)) }),
      goNext: () => {
        const next = get().stepIndex + 1;
        if (next < REQUEST_STEPS.length) set({ stepIndex: next });
      },
      goBack: () => {
        const prev = get().stepIndex - 1;
        if (prev >= 0) set({ stepIndex: prev });
      },
      patch: (fields) => set(fields),
      selectProduct: (product) =>
        set({
          productId: product.id,
          productName: product.name,
          basePriceMinor: product.basePriceMinor,
          unit: product.unit,
          family: product.family,
          title: product.name,
          // Size, material and finish are chosen from what this family offers,
          // so a previous product's choices must not carry over.
          size: "",
          material: "",
          finish: "",
          quantity: clampQuantity(1, product.unit),
        }),
      retiredNotice: false,
      dismissRetiredNotice: () => set({ retiredNotice: false }),
      reset: () => set({ ...emptyFields }),
      currentStepId: () => REQUEST_STEPS[get().stepIndex]?.id ?? "details",
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createPersistStorage(),
      migrate: migrateDraft,
      partialize: (state) =>
        Object.fromEntries(
          PERSISTED_KEYS.map((key) => [key, state[key]]),
        ) as unknown as RequestDraftState,
      // Nothing leads to the retired form any more, so a draft saved on it can
      // never be finished. It is discarded here and Home says so, once.
      merge: (persisted, current) =>
        draftHasContent({ ...emptyFields, ...(persisted as Partial<PersistedDraft>) })
          ? { ...current, ...emptyFields, retiredNotice: true }
          : current,
      onRehydrateStorage: () => () => {
        // `merge` changed the store only: this write takes it off the phone too.
        if (useRequestDraft.getState().retiredNotice) useRequestDraft.getState().reset();
        useRequestDraft.setState({ hydrated: true });
      },
    },
  ),
);

export function draftFieldsFromStore(state: RequestDraftState): RequestDraftFields {
  return {
    productId: state.productId,
    unit: state.unit,
    title: state.title,
    size: state.size,
    material: state.material,
    finish: state.finish,
    quantity: state.quantity,
    deadline: state.deadline,
    addressLine1: state.addressLine1,
    barangay: state.barangay,
    landmark: state.landmark,
    zone: state.zone,
    artworkFileId: state.artworkFileId,
    artworkName: state.artworkName,
  };
}

/** True when the client has put anything into this draft worth keeping. */
export function draftHasContent(
  state: Pick<RequestDraftFields, "productId" | "artworkFileId" | "title" | "addressLine1">,
): boolean {
  return Boolean(
    state.productId ||
      state.artworkFileId ||
      state.title.trim() ||
      state.addressLine1.trim(),
  );
}
