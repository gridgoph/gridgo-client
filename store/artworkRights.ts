import { create } from "zustand";

import type { ArtworkRightsBody } from "@/lib/api";
import {
  ARTWORK_RIGHTS_ID,
  ARTWORK_RIGHTS_UNREAD,
  artworkRightsBody,
  documentFor,
} from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * The per-order artwork box: "I have the right to print this artwork".
 *
 * Keyed by what it will be recorded against — a basket (recorded at checkout
 * for every order it becomes) or an order (recorded at attach). Ticked where
 * the artwork goes in and shown again at checkout, so it is one box, never
 * two. Memory only, and never pre-ticked by anything but the client's own tap.
 */
type ArtworkRightsState = {
  agreed: Record<string, boolean>;
  setAgreed: (scope: string, agreed: boolean) => void;
};

export const useArtworkRights = create<ArtworkRightsState>((set, get) => ({
  agreed: {},
  setAgreed: (scope, agreed) => set({ agreed: { ...get().agreed, [scope]: agreed } }),
}));

export function cartRightsScope(cartId: string): string {
  return `cart:${cartId}`;
}

export function orderRightsScope(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * The statement to send with checkout or attach, or null to send nothing.
 *
 * Null only for an API with no legal library, whose routes would ignore the
 * fields. Against a current API a ticked box always names the exact version
 * of Acceptable Use and Artwork Rights in effect, and a library that will not
 * load throws rather than letting the order go without one.
 */
export async function artworkRightsPayload(): Promise<ArtworkRightsBody | null> {
  const library = useLegalLibrary.getState();
  if (library.status !== "ready") await library.load();
  const { documents, status } = useLegalLibrary.getState();
  if (status === "unsupported") return null;
  const policy = documentFor(documents, ARTWORK_RIGHTS_ID);
  // Sending nothing would place the order with no statement on record.
  if (!policy) throw new Error(ARTWORK_RIGHTS_UNREAD);
  return artworkRightsBody(policy.id, await legalContext());
}
