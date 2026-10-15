import { cleanup, screen } from "@testing-library/react-native";

import AddMoreScreen from "@/app/request/add-more";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { SHOP_IDENTITY, otherListing } from "@/test/matchFixtures";
import { multiCart } from "@/test/multiShopFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  // Focus is where the list is read, as in the app.
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getCartGroupListings: jest.fn(), matchShop: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePlatformSettings } = require("@/store/platformSettings");

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  api.getCartGroupListings.mockReset();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({ issueWindowHours: 24, serviceFeeRateBps: 1000 });
  const cart = multiCart(2);
  useCart.setState({ cartId: cart.id, cart, hydrated: true, loading: false, busy: false, error: null });
  useBasketGroupTarget.getState().set("cline_0", "Shop A", "2026-11-14T06:00:00.000Z");
});

// No presses in this file: render-only tests can share it.
it("lists the group's products as GRIDGO listings, never as the shop", async () => {
  api.getCartGroupListings.mockResolvedValue({
    groupId: "cline_0",
    label: "Shop A",
    deadline: "2026-11-14T06:00:00.000Z",
    listings: [
      // A stray shop field on the payload must not reach the screen either.
      { ...otherListing("sci_a", { name: "Brochures", clientFromPriceMinor: 72500, fromPriceMinor: 66000 }), shopName: "Lovis Printshop" },
      otherListing("sci_b", { name: "Business cards", clientFromPriceMinor: 29000, fromPriceMinor: 26400 }),
    ],
    emptyReason: null,
  });
  await renderScreen(<AddMoreScreen />);

  expect(await screen.findByText("Brochures")).toBeTruthy();
  expect(api.getCartGroupListings).toHaveBeenCalledWith("cart_multi", "cline_0");
  expect(screen.getByText("More from Shop A")).toBeTruthy();
  expect(screen.getByText("Business cards")).toBeTruthy();
  // GRIDGO's own figure, never the shop's.
  expect(screen.getByText(/₱725\.00/)).toBeTruthy();
  expect(screen.queryByText(/₱660\.00/)).toBeNull();
  // One shop, one queue: no place-in-line column.
  expect(screen.queryByText("IN LINE")).toBeNull();
  const shown = JSON.stringify(screen.toJSON());
  for (const identity of SHOP_IDENTITY) expect(shown).not.toContain(identity);
});

it("says so plainly when the group has nothing more to add", async () => {
  api.getCartGroupListings.mockResolvedValue({
    groupId: "cline_0",
    label: "Shop A",
    deadline: "2026-11-14T06:00:00.000Z",
    listings: [],
    emptyReason: "deadline_not_met",
  });
  await renderScreen(<AddMoreScreen />);

  expect(await screen.findByText("Nothing more fits Sat 14 Nov")).toBeTruthy();
  expect(screen.getByText(/No more products can be added to Shop A for this date/)).toBeTruthy();
  expect(screen.getByText("Back to checkout")).toBeTruthy();
  expect(screen.getByText("Choose from every shop")).toBeTruthy();
});

it("says what failed, with a retry, when the list cannot load", async () => {
  api.getCartGroupListings.mockRejectedValue(new api.ApiError(404, { error: "cart_group_not_found" }));
  await renderScreen(<AddMoreScreen />);

  expect(await screen.findByText("These products did not load")).toBeTruthy();
  expect(screen.getByText("That shop group is no longer in your order. Add this as a new product instead.")).toBeTruthy();
});
