import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ListingScreen from "@/app/request/listing";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import {
  OTHER_SHOP_ITEM,
  basket,
  freshBasketWithFlyers,
  otherShopRefusal,
} from "@/test/otherShopFixtures";
import { renderScreen } from "@/test/renderScreen";

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
    getSettings: jest.fn(),
    createCart: jest.fn(),
    addCartLine: jest.fn(),
    removeCartLine: jest.fn(),
    getCart: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  for (const mock of [api.getCatalogItem, api.getSettings, api.createCart, api.addCartLine, api.removeCartLine, api.getCart]) {
    mock.mockReset();
  }
  api.getSettings.mockResolvedValue({ serviceFeeRateBps: 1_000, issueWindowHours: 24, deliveryFeeBands: [] });
  api.getCatalogItem.mockReturnValue(new Promise(() => {}));
  clearListingCache();
  rememberListing(OTHER_SHOP_ITEM);
  useCart.getState().reset();
  // The basket is already with another shop, and holds a banner.
  useCart.setState({ cartId: "cart_held", cart: basket() });
  api.getCart.mockResolvedValue(basket());
  api.createCart.mockResolvedValue(basket({ id: "cart_fresh", lines: [] }));
  api.removeCartLine.mockResolvedValue(basket({ lines: [] }));
  api.addCartLine.mockImplementation((cartId: string) =>
    cartId === "cart_held" ? Promise.reject(otherShopRefusal()) : Promise.resolve(freshBasketWithFlyers()),
  );
});

/** Tap "Add to my order" and wait for GRIDGO's one-shop answer to be drawn. */
async function addAndMeetTheRule() {
  await renderScreen(<ListingScreen />);
  await fireEvent.press(await screen.findByLabelText("Add to my order"));
  await screen.findByText("This needs an order of its own");
}

describe("choosing to start a new order with this", () => {
  it("asks first, says what goes, then starts the new order and moves on to artwork", async () => {
    await addAndMeetTheRule();

    await fireEvent.press(screen.getByLabelText("Start a new order with this"));
    await screen.findByText("Start a new order with this?");
    expect(
      screen.getByText(
        "This removes Tarpaulin banner from your order, along with any artwork you added to it. It cannot be undone.",
      ),
    ).toBeTruthy();
    // Asking is not doing: nothing has changed yet.
    expect(api.createCart).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("Remove and start new"));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/request/artwork",
        params: { lineId: "cline_new" },
      }),
    );
    expect(api.addCartLine).toHaveBeenLastCalledWith("cart_fresh", expect.objectContaining({ catalogItemId: "sci_flyers" }));
    expect(useCart.getState().cartId).toBe("cart_fresh");
    await waitFor(() =>
      expect(api.removeCartLine).toHaveBeenCalledWith("cart_held", "cline_tarpaulin_banner"),
    );
  });
});
