import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import HomeScreen from "@/app/(tabs)/home";
import { davaogo, renderHome, resetHome } from "@/test/homePromoScreen";

/** "Open link directly": the tap is the link, with no sheet (client#402). */

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

it("opens the link straight away and counts a tap", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  api.getHomePromotions.mockResolvedValue({ promotions: [davaogo({ tapAction: "link", style: "light" })] });
  await renderHome(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("DavaoGo. Partner"));

  await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://davaogo.app/"));
  expect(api.recordPromotionEvent).toHaveBeenCalledWith("promo_dgo", "tap", expect.any(String));
  expect(api.recordPromotionEvent).not.toHaveBeenCalledWith("promo_dgo", "open", expect.any(String));
  expect(screen.queryByTestId("promo-sheet")).toBeNull();
});
