import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import type { RequestDraftFields, RequestStepId } from "@/lib/requestValidation";
import { REQUEST_STEPS } from "@/lib/requestValidation";

const STORAGE_KEY = "gridgo.client.requestDraft.v1";

export type RequestDraftState = RequestDraftFields & {
  stepIndex: number;
  productName: string;
  basePriceMinor: number;
  unit: string;
  family: string;
  hydrated: boolean;
  setStepIndex: (index: number) => void;
  goNext: () => void;
  goBack: () => void;
  patch: (fields: Partial<RequestDraftFields & {
    productName: string;
    basePriceMinor: number;
    unit: string;
    family: string;
  }>) => void;
  /** Seed draft from a catalog product (new request). */
  selectProduct: (product: {
    id: string;
    name: string;
    basePriceMinor: number;
    unit: string;
    family: string;
  }) => void;
  /** One-tap reorder: copy specs from a previous order. */
  seedFromOrder: (order: {
    productId: string;
    title: string;
    quantity: number;
    size: string;
    material: string;
    address: string;
    zone: string;
    artworkName: string | null;
    deadline: string | null;
  }, productMeta?: {
    name?: string;
    basePriceMinor?: number;
    unit?: string;
    family?: string;
  }) => void;
  reset: () => void;
  currentStepId: () => RequestStepId;
};

const emptyFields: RequestDraftFields & {
  productName: string;
  basePriceMinor: number;
  unit: string;
  family: string;
  stepIndex: number;
} = {
  stepIndex: 0,
  productId: "",
  productName: "",
  basePriceMinor: 0,
  unit: "",
  family: "",
  title: "",
  size: "",
  material: "",
  quantity: 1,
  deadline: "",
  address: "",
  zone: "davao_central",
  artworkName: "",
};

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
        }),
      seedFromOrder: (order, productMeta) =>
        set({
          stepIndex: 0,
          productId: order.productId,
          productName: productMeta?.name ?? order.title,
          basePriceMinor: productMeta?.basePriceMinor ?? 0,
          unit: productMeta?.unit ?? "",
          family: productMeta?.family ?? "",
          title: order.title,
          size: order.size,
          material: order.material,
          quantity: order.quantity,
          deadline: order.deadline ?? "",
          address: order.address,
          zone: order.zone || "davao_central",
          artworkName: order.artworkName ?? "",
        }),
      reset: () => set({ ...emptyFields }),
      currentStepId: () => REQUEST_STEPS[get().stepIndex]?.id ?? "details",
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({
        stepIndex: state.stepIndex,
        productId: state.productId,
        productName: state.productName,
        basePriceMinor: state.basePriceMinor,
        unit: state.unit,
        family: state.family,
        title: state.title,
        size: state.size,
        material: state.material,
        quantity: state.quantity,
        deadline: state.deadline,
        address: state.address,
        zone: state.zone,
        artworkName: state.artworkName,
      }),
      onRehydrateStorage: () => () => {
        useRequestDraft.setState({ hydrated: true });
      },
    },
  ),
);

export function draftFieldsFromStore(state: RequestDraftState): RequestDraftFields {
  return {
    productId: state.productId,
    title: state.title,
    size: state.size,
    material: state.material,
    quantity: state.quantity,
    deadline: state.deadline,
    address: state.address,
    zone: state.zone,
    artworkName: state.artworkName,
  };
}
