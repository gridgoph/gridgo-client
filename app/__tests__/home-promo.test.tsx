import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import HomeScreen from "@/app/(tabs)/home";
import { davaogo, renderHome, resetHome } from "@/test/homePromoScreen";

/**
 * Home's promo slot (client#402): the default tap opens a sheet with the
 * logo, name, tag, description and one link button. One press per file.
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

beforeEach(() => {
  resetHome();
  api.recordPromotionEvent.mockClear();
});

it("keeps Reorder alone when nothing is live", async () => {
  api.getHomePromotions.mockResolvedValue({ promotions: [] });
  await renderHome(<HomeScreen />);
  expect(await screen.findByLabelText("Reorder. No past print yet")).toBeTruthy();
  expect(screen.queryByTestId("home-rotating-scroll")).toBeNull();
});

it("opens the sheet on a tap and counts the open, not a link tap", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  api.getHomePromotions.mockResolvedValue({ promotions: [davaogo()] });
  await renderHome(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("DavaoGo. Partner"));

  expect(await screen.findByTestId("promo-sheet")).toBeTruthy();
  expect(screen.getAllByText("DavaoGo").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Partner").length).toBe(2); // the tile's caption and the sheet's tag
  expect(screen.getByText("Rides and deliveries around Davao.")).toBeTruthy();
  expect(screen.getByLabelText("Visit DavaoGo")).toBeTruthy();
  expect(api.recordPromotionEvent).toHaveBeenCalledWith("promo_dgo", "open", expect.any(String));
  expect(api.recordPromotionEvent).not.toHaveBeenCalledWith("promo_dgo", "tap", expect.any(String));
  expect(openURL).not.toHaveBeenCalled();
});
