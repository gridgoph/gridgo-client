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

describe("choosing to finish the basket first", () => {
  it("opens checkout for the basket that is there, and keeps it whole", async () => {
    await addAndMeetTheRule();

    await fireEvent.press(screen.getByLabelText("Check out my order"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/checkout"));
    expect(api.createCart).not.toHaveBeenCalled();
    expect(api.removeCartLine).not.toHaveBeenCalled();
    expect(useCart.getState().cartId).toBe("cart_held");
  });
});
