import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";

import { useClientPreferences } from "@/hooks/useClientPreferences";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPreferences: jest.fn(() => new Promise(() => undefined)) };
});

const CART_KEY = "gridgo.client.cart.v2";

/*
  gridgoph/gridgo-client#150. The session is not persisted, so every launch
  starts with `user` empty while Clerk restores it, and the basket id has
  already come back from storage by the time the root layout's effects run
  (on web always; on a phone whenever AsyncStorage answers before first paint).
  That empty `user` is a session still restoring, not a sign-out.

  One test, because the hook writes to stores from an effect on mount (see
  AGENTS.md, "Running and testing").
*/
it("keeps the saved basket while the signed-in session is still restoring at launch", async () => {
  useSession.setState({ user: null, signingOut: false } as never);
  await AsyncStorage.setItem(CART_KEY, JSON.stringify({ state: { cartId: "cart_saved", ownerId: "client-a" }, version: 0 }));
  await useCart.persist.rehydrate();
  expect(useCart.getState().cartId).toBe("cart_saved");

  await renderHook(() => useClientPreferences());

  act(() => {
    useSession.setState({ user: { id: "client-a", role: "client" } as never });
  });

  expect(useCart.getState().cartId).toBe("cart_saved");
  expect(JSON.parse((await AsyncStorage.getItem(CART_KEY)) ?? "{}").state.cartId).toBe("cart_saved");
});
