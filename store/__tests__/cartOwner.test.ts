import AsyncStorage from "@react-native-async-storage/async-storage";

import * as api from "@/lib/api";
import { ApiError, type Cart, type User } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";

/*
  gridgoph/gridgo-client#150: the basket belongs to an account, not to whether
  `user` happens to be set. It survives a launch (which always starts with no
  user while the session restores) and a same-account 401 round trip; it goes
  on a real sign-out and when a different account signs in.
*/

const CART_KEY = "gridgo.client.cart.v2";

function client(id: string): User {
  return { id, email: `${id}@gridgo.local`, name: id, role: "client" };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [],
    checkedOutOrderId: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

/** A cold launch: the saved basket comes back from storage, nobody is signed in yet. */
async function launchWith(saved: { cartId: string; ownerId: string | null }): Promise<void> {
  useSession.setState({ user: null, signingOut: false, source: null });
  useCart.getState().reset();
  await AsyncStorage.setItem(CART_KEY, JSON.stringify({ state: saved, version: 0 }));
  await useCart.persist.rehydrate();
}

async function savedCartId(): Promise<string | null> {
  return JSON.parse((await AsyncStorage.getItem(CART_KEY)) ?? "{}").state?.cartId ?? null;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe("reopening the app", () => {
  it("keeps the basket once the same account is restored", async () => {
    await launchWith({ cartId: "cart_saved", ownerId: "client-a" });

    useSession.setState({ user: client("client-a"), source: "clerk" });

    expect(useCart.getState()).toMatchObject({ cartId: "cart_saved", ownerId: "client-a" });
    expect(await savedCartId()).toBe("cart_saved");
  });

  it("keeps the basket when the account is restored before storage answers", async () => {
    // The phone's order of events when AsyncStorage is the slower of the two.
    useSession.setState({ user: null, signingOut: false });
    useCart.getState().reset();
    // Any write to the store persists it, so the launch state goes in first.
    useCart.setState({ hydrated: false });
    await AsyncStorage.setItem(CART_KEY, JSON.stringify({ state: { cartId: "cart_saved", ownerId: "client-a" }, version: 0 }));
    const restoring = useCart.persist.rehydrate();

    useSession.setState({ user: client("client-a"), source: "clerk" });
    await restoring;

    expect(useCart.getState()).toMatchObject({ cartId: "cart_saved", ownerId: "client-a" });
  });

  it("adopts a basket saved before baskets carried an owner", async () => {
    // GRIDGO still refuses it on the next read if it is someone else's.
    await launchWith({ cartId: "cart_saved", ownerId: null });

    useSession.setState({ user: client("client-a"), source: "clerk" });

    expect(useCart.getState()).toMatchObject({ cartId: "cart_saved", ownerId: "client-a" });
  });

  it("keeps the basket through a 401 that re-adopts the same account", async () => {
    await launchWith({ cartId: "cart_saved", ownerId: "client-a" });
    useSession.setState({ user: client("client-a"), source: "clerk" });

    useSession.setState({ user: null });
    useSession.setState({ user: client("client-a") });

    expect(useCart.getState().cartId).toBe("cart_saved");
  });
});

describe("signing out", () => {
  it("forgets the basket and its owner", async () => {
    jest.spyOn(api, "logout").mockResolvedValue(undefined);
    await launchWith({ cartId: "cart_saved", ownerId: "client-a" });
    useSession.setState({ user: client("client-a"), source: "clerk" });

    await useSession.getState().logout();

    expect(useCart.getState()).toMatchObject({ cartId: null, cart: null, ownerId: null });
    expect(await savedCartId()).toBeNull();
  });
});

describe("a different account signing in", () => {
  it("never inherits the previous account's basket from storage", async () => {
    await launchWith({ cartId: "cart_of_a", ownerId: "client-a" });

    useSession.setState({ user: client("client-b"), source: "clerk" });

    expect(useCart.getState()).toMatchObject({ cartId: null, cart: null, ownerId: "client-b" });
    expect(await savedCartId()).toBeNull();
  });

  it("never inherits it when the new account is restored before storage answers", async () => {
    useSession.setState({ user: null, signingOut: false });
    useCart.getState().reset();
    // Any write to the store persists it, so the launch state goes in first.
    useCart.setState({ hydrated: false });
    await AsyncStorage.setItem(CART_KEY, JSON.stringify({ state: { cartId: "cart_of_a", ownerId: "client-a" }, version: 0 }));
    const restoring = useCart.persist.rehydrate();

    useSession.setState({ user: client("client-b"), source: "clerk" });
    await restoring;

    expect(useCart.getState()).toMatchObject({ cartId: null, ownerId: "client-b" });
  });

  it("drops the basket already on screen when the account changes without a sign-out", async () => {
    await launchWith({ cartId: "cart_of_a", ownerId: "client-a" });
    useSession.setState({ user: client("client-a"), source: "clerk" });
    useCart.setState({ cart: cart({ id: "cart_of_a" }) });

    useSession.setState({ user: null });
    useSession.setState({ user: client("client-b") });

    expect(useCart.getState()).toMatchObject({ cartId: null, cart: null, ownerId: "client-b" });
  });
});

describe("a saved id GRIDGO no longer honours", () => {
  beforeEach(async () => {
    await launchWith({ cartId: "cart_stale", ownerId: "client-a" });
    useSession.setState({ user: client("client-a"), source: "clerk" });
  });

  it.each([
    ["gone", new ApiError(404, { error: "cart_not_found" })],
    ["another client's", new ApiError(403, { error: "forbidden" })],
    ["already checked out", new ApiError(409, { error: "cart_checked_out" })],
  ])("puts the change into a new basket when the saved one is %s, without an error", async (_, refusal) => {
    jest.spyOn(api, "createCart").mockResolvedValue(cart({ id: "cart_new" }));
    const work = jest
      .fn<Promise<Cart>, [string]>()
      .mockRejectedValueOnce(refusal)
      .mockResolvedValueOnce(cart({ id: "cart_new", version: 2 }));

    const result = await useCart.getState().run(work);

    expect(work.mock.calls).toEqual([["cart_stale"], ["cart_new"]]);
    expect(result.id).toBe("cart_new");
    expect(useCart.getState()).toMatchObject({ cartId: "cart_new", ownerId: "client-a", error: null, busy: false });
  });

  it("keeps a good basket when only a line is missing", async () => {
    // Also a 404, but the basket is fine: it must not be swapped for an empty one.
    const createCart = jest.spyOn(api, "createCart");
    const work = jest.fn().mockRejectedValue(new ApiError(404, { error: "line_not_found" }));

    await expect(useCart.getState().run(work)).rejects.toThrow("line_not_found");

    expect(createCart).not.toHaveBeenCalled();
    expect(useCart.getState().cartId).toBe("cart_stale");
  });

  it("drops it quietly on the next read", async () => {
    jest.spyOn(api, "getCart").mockRejectedValue(new ApiError(403, { error: "forbidden" }));

    await useCart.getState().load();

    expect(useCart.getState()).toMatchObject({ cartId: null, cart: null, error: null });
  });
});
