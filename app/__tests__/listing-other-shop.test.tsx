import { fireEvent, screen } from "@testing-library/react-native";

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

/**
 * Issue report B057A39C: adding a product GRIDGO matched to a different shop
 * said it could not connect. The API had answered, with a rule — one order
 * goes to one shop — and the client was left retrying a tap that never works.
 */
describe("a product matched to a different shop from the basket's", () => {
  it("explains the rule in place of the connection error, and offers both ways on", async () => {
    await addAndMeetTheRule();

    expect(
      screen.getByText(
        "Your order already has Tarpaulin banner, and GRIDGO matched this to a different shop. One order goes to one shop, so check out your order first, or start a new order with this.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Check out my order")).toBeTruthy();
    expect(screen.getByLabelText("Start a new order with this")).toBeTruthy();
    // The tap that cannot succeed is gone, and nothing blames the connection.
    expect(screen.queryByLabelText("Add to my order")).toBeNull();
    expect(screen.queryByText(/connection|cannot reach|could not add/i)).toBeNull();
    // Nothing was removed on the client's behalf.
    expect(api.removeCartLine).not.toHaveBeenCalled();
    expect(useCart.getState().cartId).toBe("cart_held");
  });
});
