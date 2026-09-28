import { fireEvent, screen } from "@testing-library/react-native";

import ListingScreen from "@/app/request/listing";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import {
  OTHER_SHOP_ITEM,
  basket,
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
});

describe("a tap that never reaches GRIDGO", () => {
  it("still says the server could not be reached, and offers no basket choice", async () => {
    api.addCartLine.mockReset();
    api.addCartLine.mockRejectedValue(new TypeError("Network request failed"));
    await renderScreen(<ListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Add to my order"));

    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
    expect(screen.queryByText("This needs an order of its own")).toBeNull();
    expect(screen.getByLabelText("Add to my order")).toBeTruthy();
  });
});
