import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { liveGeneration } from "@/lib/live";
import { travelChoiceOf } from "@/lib/checkout";
import { groupSavedPlaces } from "@/lib/savedPlaces";
import { hydrateCartListings } from "@/lib/listingCache";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo.client.cart.v2";

/**
 * The basket, which lives on GRIDGO.
 *
 * Only the cart's id is kept on this phone, and only so a draft survives the
 * app being killed — everything in it is the server's: the lines, their
 * prices, the drop-offs, and whether it has been checked out. That is what
 * makes "Place Order and Home" safe to promise, and it is why a client can
 * start a basket on one device and finish it on another.
 *
 * Every mutation goes through the API and stores whatever comes back, so the
 * screens never hold a basket the server would disagree with. A cart the
 * server has lost, or that has already been checked out, is dropped here
 * rather than shown as a basket that cannot be paid for.
 */
export type CartState = {
  /** Persisted. The whole basket is re-read from GRIDGO with it. */
  cartId: string | null;
  cart: api.Cart | null;
  loading: boolean;
  /** True while a line is being added, changed or removed. */
  busy: boolean;
  error: string | null;
  hydrated: boolean;

  /** Read the basket this phone is holding, if any. */
  load: () => Promise<void>;
  setDefaultDropoff: (dropoff: api.OrderPoint) => Promise<api.Cart>;
  autofillDropoff: (isActive: () => boolean) => Promise<void>;
  /** The current draft basket, creating one the first time. */
  ensure: () => Promise<string>;
  /**
   * Get the basket ready before it is needed, and never wait on it.
   *
   * `POST /me/carts` is the first of the two calls behind "Add to my order",
   * and it is the one that has nothing to do with what the client just chose.
   * Started while they are still ticking options, it is finished long before
   * the tap, and the tap costs one round trip instead of two.
   */
  warm: () => void;
  /** Store whatever the API just returned. */
  adopt: (cart: api.Cart) => void;
  run: <T>(work: (cartId: string) => Promise<T>) => Promise<T>;
  /** After checkout: this basket is spent. */
  clear: () => void;
  /** Sign-out: forget the basket without touching the server's. */
  reset: () => void;
};

/** The single in-flight `POST /me/carts`, shared by everyone who asks. */
let creating: Promise<string> | null = null;
let loadSequence = 0;
let dropoffSequence = 0;
let dropoffMutation: Promise<unknown> = Promise.resolve();

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      cartId: null,
      cart: null,
      loading: false,
      busy: false,
      error: null,
      hydrated: false,

      load: async () => {
        const sequence = ++loadSequence;
        const cartId = get().cartId;
        if (!cartId) {
          set({ cart: null, loading: false });
          return;
        }
        set({ loading: true });
        try {
          const cart = await api.getCart(cartId);
          if (sequence !== loadSequence || get().cartId !== cartId) return;
          // A basket that has been paid for is history, not a basket.
          if (cart.state !== "draft") {
            set({ cartId: null, cart: null, error: null });
            return;
          }
          set({ cart: hydrateCartListings(cart, get().cart), error: null });
        } catch (error) {
          if (sequence !== loadSequence || get().cartId !== cartId) return;
          // 404 and 403 both mean this phone is holding an id that is no longer
          // a basket. Anything else is a connection problem worth saying.
          const status = error instanceof api.ApiError ? error.status : 0;
          if (status === 404 || status === 403) {
            set({ cartId: null, cart: null, error: null });
            return;
          }
          set({
            error:
              error instanceof Error ? error.message : "GRIDGO could not read your order.",
          });
        } finally {
          if (sequence === loadSequence) set({ loading: false });
        }
      },

      setDefaultDropoff: async (dropoff) => {
        const sequence = ++dropoffSequence;
        const owner = liveGeneration();
        return writeDefaultDropoff(dropoff, () => sequence === dropoffSequence && owner === liveGeneration());
      },

      autofillDropoff: async (isActive) => {
        const cartId = get().cartId;
        const sequence = dropoffSequence;
        const owner = liveGeneration();
        const current = () => {
          const cart = get().cart;
          return isActive() && owner === liveGeneration() && sequence === dropoffSequence &&
            get().cartId === cartId && cart !== null && cart.id === cartId && cart.state === "draft" &&
            !cart.defaultDropoff && travelChoiceOf(cart) === "delivery";
        };
        if (!cartId || !current()) return;
        const addresses = await api.listAddresses();
        if (!current()) return;
        const grouped = groupSavedPlaces(addresses);
        const chosen = addresses.find((address) => address.isDefault) ?? grouped.home ?? grouped.work ?? grouped.named[0];
        if (!chosen) return;
        await writeDefaultDropoff({
          lat: chosen.point.lat,
          lng: chosen.point.lng,
          label: chosen.point.label || chosen.addressLine || chosen.label,
        }, current);
      },

      ensure: async () => {
        const held = get().cartId;
        if (held) return held;
        // Two callers arriving together — a warm-up and the tap that overtook
        // it — must not each create a basket and leave the client's first item
        // in the one that loses. The in-flight create is shared instead.
        if (!creating) {
          creating = api
            .createCart()
            .then((cart) => {
              set({ cartId: cart.id, cart: hydrateCartListings(cart, get().cart), error: null });
              return cart.id;
            })
            .finally(() => {
              creating = null;
            });
        }
        return creating;
      },

      warm: () => {
        if (get().cartId) return;
        void get()
          .ensure()
          .catch(() => {
            // Nothing is on screen yet, so there is nothing to tell the client.
            // The tap itself creates the basket and reports its own failure.
          });
      },

      adopt: (cart) => {
        loadSequence++;
        set({ cartId: cart.id, cart: hydrateCartListings(cart, get().cart), loading: false, error: null });
      },

      run: async (work) => {
        const cartId = await get().ensure();
        set({ busy: true, error: null });
        try {
          return await work(cartId);
        } finally {
          set({ busy: false });
        }
      },

      clear: () => {
        dropoffSequence++;
        loadSequence++;
        creating = null;
        set({ cartId: null, cart: null, loading: false, error: null });
      },

      reset: () => {
        dropoffSequence++;
        loadSequence++;
        creating = null;
        set({ cartId: null, cart: null, loading: false, busy: false, error: null });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ cartId: state.cartId }) as unknown as CartState,
      onRehydrateStorage: () => () => {
        useCart.setState({ hydrated: true });
      },
    },
  ),
);

/** True when there is anything in the basket. */
export function cartHasContent(state: Pick<CartState, "cart">): boolean {
  return (state.cart?.lines.length ?? 0) > 0;
}

/** How many things are in the basket, for the badge on Home. */
export function cartLineCount(state: Pick<CartState, "cart">): number {
  return state.cart?.lines.length ?? 0;
}

function writeDefaultDropoff(dropoff: api.OrderPoint, current: () => boolean): Promise<api.Cart> {
  const write = async () => {
    if (!current()) throw new Error("The delivery address changed. Choose it again.");
    return useCart.getState().run(async (cartId) => {
      if (!current()) throw new Error("The delivery address changed. Choose it again.");
      const cart = await api.setCartDropoffs(cartId, { defaultDropoff: dropoff });
      if (!current()) throw new Error("The delivery address changed. Choose it again.");
      useCart.getState().adopt(cart);
      return cart;
    });
  };
  const pending = dropoffMutation.then(write, write);
  dropoffMutation = pending.catch(() => undefined);
  return pending;
}
