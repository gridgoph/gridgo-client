import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import AddMoreScreen from "@/app/request/add-more";
import { listingNow } from "@/lib/listingCache";
import { clearMatchSelections, matchSelectionFor } from "@/lib/matchSelection";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { otherListing, topListing, topPickMatch } from "@/test/matchFixtures";
import { multiCart } from "@/test/multiShopFixtures";
import { renderScreen } from "@/test/renderScreen";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  // Focus is where the list is read, as in the app.
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
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

// One press per file: see "Running and testing" in AGENTS.md.
it("matches the tapped product to the group and opens its sheet with that pick", async () => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({ issueWindowHours: 24, serviceFeeRateBps: 1000 });
  clearMatchSelections();
  const cart = {
    ...multiCart(2),
    requestFulfillment: {
      fulfillmentMode: "delivery" as const,
      dropoff: { lat: 7.0707, lng: 125.6087, label: "Sample drop-off, Davao City" },
    },
  };
  useCart.setState({ cartId: cart.id, cart, hydrated: true, loading: false, busy: false, error: null });
  useBasketGroupTarget.getState().set("cline_0", "Shop A", "2026-11-14T06:00:00.000Z");
  api.getCartGroupListings.mockResolvedValue({
    groupId: "cline_0",
    label: "Shop A",
    deadline: "2026-11-14T06:00:00.000Z",
    listings: [
      otherListing("sci_flyers", { name: "Flyers", subcategoryCode: "flyers", selectToken: undefined }),
      otherListing("sci_brochures", { name: "Brochures", subcategoryCode: "brochures", selectToken: undefined }),
    ],
    emptyReason: null,
  });
  // The match leads with another listing: the tapped one must be found by id.
  api.matchShop.mockResolvedValue(
    topPickMatch({
      matchRequestId: "req_group",
      listings: [topListing("sci_other_first"), topListing("sci_brochures", { name: "Brochures", selectToken: "tok_brochures" })],
    }),
  );

  await renderScreen(<AddMoreScreen />);
  await fireEvent.press(await screen.findByLabelText(/^Brochures,/));

  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  const input = api.matchShop.mock.calls[0][0];
  expect(input).toMatchObject({
    subcategoryCode: "brochures",
    cartId: "cart_multi",
    groupId: "cline_0",
    fulfillmentMode: "delivery",
    dropoff: { lat: 7.0707, lng: 125.6087 },
  });
  // The group keeps its own date: the match is not asked for one.
  expect(input).not.toHaveProperty("deadline");
  expect(useJobDeadline.getState().by).toBe("2026-11-14T06:00:00.000Z");
  expect(matchSelectionFor("sci_brochures")).toMatchObject({ matchRequestId: "req_group", selectToken: "tok_brochures" });
  expect(listingNow("sci_brochures")?.name).toBe("Brochures");
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/listing", params: { itemId: "sci_brochures" } });
  // Still adding to Shop A: the sheet's add clears the target once the line exists.
  expect(useBasketGroupTarget.getState().groupId).toBe("cline_0");
});
