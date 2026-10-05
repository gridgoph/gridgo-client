import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import { ONE_DATE_NOTE } from "@/lib/basketGroups";
import { formatDeadline } from "@/lib/deadline";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { multiCart } from "@/test/multiShopFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn(), matchShop: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "brochures", category: "marketing_collateral" }),
}));

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  mockPush.mockReset();
  clearMatchPrefetch();
  useJobDeadline.getState().clear();
  api.deadlineDays.mockImplementation(() => new Promise(() => {}));
  api.matchShop.mockImplementation(() => new Promise(() => {}));
  const cart = multiCart(2);
  useCart.setState({ cartId: cart.id, cart, hydrated: true, loading: false, busy: false, error: null });
});

/*
 * One date for the whole order (gridgo-api#117): a product joining a basket
 * that has its date is shown that date, not asked for another.
 */
describe("WhenScreen, joining a basket", () => {
  it("shows the order's date and offers no other", async () => {
    await renderInSafeArea(<WhenScreen />);

    expect(screen.getByText(formatDeadline("2026-10-26T08:00:00.000Z"))).toBeTruthy();
    expect(screen.getByText(ONE_DATE_NOTE)).toBeTruthy();
    expect(screen.getByText("Change the date for the whole order")).toBeTruthy();
    expect(screen.queryByText("No rush — show me anyone")).toBeNull();
    // The month is never asked for: there is nothing to pick.
    expect(api.deadlineDays).not.toHaveBeenCalled();
  });

  // The one press in this file goes last: see "Running and testing" in AGENTS.md.
  it("continues on the order's date and matches with the basket", async () => {
    await renderInSafeArea(<WhenScreen />);

    await fireEvent.press(screen.getByText("Continue"));

    expect(useJobDeadline.getState().by).toBe("2026-10-26T08:00:00.000Z");
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/rank",
      params: { subcategory: "brochures", category: "marketing_collateral" },
    });
    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({
        subcategoryCode: "brochures",
        cartId: "cart_multi",
        deadline: "2026-10-26T08:00:00.000Z",
      }),
    );
  });
});
