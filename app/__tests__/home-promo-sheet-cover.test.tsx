import { act, fireEvent, screen } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { davaogo, renderHome, resetHome } from "@/test/homePromoScreen";

/**
 * The review's case (client#402): with two promos live, opening A's sheet must
 * not count B while the sheet covers the tile, even if the page under it moves.
 */

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOrders: jest.fn(async () => []),
  getProductCategories: jest.fn(async () => []),
  getCart: jest.fn(async () => null),
  getHomeSummary: jest.fn(async () => {
    throw new Error("offline");
  }),
  getFeaturedPrints: jest.fn(async () => ({ items: [] })),
  getHomePromotions: jest.fn(),
  recordPromotionEvent: jest.fn(async () => undefined),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => resetHome());

it("counts no view for a promo that turns into place under an open sheet", async () => {
  api.getHomePromotions.mockResolvedValue({
    promotions: [davaogo(), davaogo({ id: "promo_b", name: "Second Partner", linkText: "Visit Second" })],
  });
  await renderHome(<HomeScreen />);
  const tile = await screen.findByTestId("home-rotating-tile");
  await act(async () => {
    fireEvent(tile, "layout", { nativeEvent: { layout: { width: 160, height: 112 } } });
  });

  fireEvent.press(screen.getByLabelText("DavaoGo. Partner"));
  expect(await screen.findByTestId("promo-sheet")).toBeTruthy();

  // The tile behind the sheet settles on B (as the five-second turn would).
  await act(async () => {
    fireEvent.scroll(screen.getByTestId("home-rotating-scroll"), {
      nativeEvent: { contentOffset: { x: 320, y: 0 }, contentSize: { width: 640, height: 112 }, layoutMeasurement: { width: 160, height: 112 } },
    });
  });

  const views = api.recordPromotionEvent.mock.calls.filter((call: unknown[]) => call[1] === "view").map((call: unknown[]) => call[0]);
  expect(views).not.toContain("promo_b");
  expect(api.recordPromotionEvent).toHaveBeenCalledWith("promo_dgo", "open", expect.any(String));
});
