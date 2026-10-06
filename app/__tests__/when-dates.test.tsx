import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import { SAME_DATE_NOTE } from "@/lib/basketGroups";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { DATE_EARLY, datedCart } from "@/test/multiShopFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn(), matchShop: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const mockPush = jest.fn();
const mockParams: { current: Record<string, string> } = {
  current: { subcategory: "brochures", category: "marketing_collateral" },
};
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
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
  jest.clearAllMocks();
  mockPush.mockReset();
  mockParams.current = { subcategory: "brochures", category: "marketing_collateral" };
  clearMatchPrefetch();
  useJobDeadline.getState().clear();
  useBasketGroupTarget.getState().clear();
  api.deadlineDays.mockImplementation(() => new Promise(() => {}));
  api.matchShop.mockImplementation(() => new Promise(() => {}));
  const cart = datedCart();
  useCart.setState({ cartId: cart.id, cart, hydrated: true, loading: false, busy: false, error: null });
});

/*
 * Each product keeps its own date (gridgo-client#189). A second product is
 * asked afresh, with the dates already in the order offered first; only
 * "Add more from Shop A" is held to its group's date.
 */
describe("WhenScreen, with an order already started", () => {
  it("asks for this product's own date and offers the order's dates first", async () => {
    await renderInSafeArea(<WhenScreen />);

    expect(screen.getByText("ALREADY IN YOUR ORDER")).toBeTruthy();
    expect(screen.getByLabelText("Mon 12 Oct, 1 item already on this date")).toBeTruthy();
    expect(screen.getByLabelText("Fri 16 Oct, 1 item already on this date")).toBeTruthy();
    expect(screen.getByLabelText("Tue 20 Oct, 1 item already on this date")).toBeTruthy();
    expect(screen.getByText(SAME_DATE_NOTE)).toBeTruthy();
    // Nothing forces the order's date: "no rush" and the month are both there.
    expect(screen.getByText("No rush — show me anyone")).toBeTruthy();
    expect(screen.queryByText(/shares your order's date|whole order/)).toBeNull();
    expect(api.deadlineDays).toHaveBeenCalledWith("brochures");
  });

  it("moves one checkout group to another date without offering no rush", async () => {
    mockParams.current = {
      mode: "group",
      lineIds: "cline_2",
      label: "Shop A",
      current: DATE_EARLY,
      subcategory: "brochures",
    };
    await renderInSafeArea(<WhenScreen />);

    expect(screen.getByText("New date for Shop A")).toBeTruthy();
    expect(screen.getByText(/^Needed by Mon 12 Oct now\. Every item in this group moves/)).toBeTruthy();
    expect(screen.queryByText("No rush — show me anyone")).toBeNull();
    // The group's own date is not offered as somewhere to move it.
    expect(screen.queryByLabelText(/^Mon 12 Oct/)).toBeNull();
    expect(screen.getByLabelText("Fri 16 Oct, 1 item already on this date")).toBeTruthy();
  });

  it("shows a group's date when adding more from it", async () => {
    useBasketGroupTarget.getState().set("cline_2", "Shop A", DATE_EARLY);
    await renderInSafeArea(<WhenScreen />);

    expect(screen.getByText("Mon 12 Oct")).toBeTruthy();
    expect(screen.getByText("Same shop, same date: no extra delivery fee.")).toBeTruthy();
    expect(screen.getByText("Pick a different date")).toBeTruthy();
    expect(api.deadlineDays).not.toHaveBeenCalled();
  });

  // The one press in this file goes last: see "Running and testing" in AGENTS.md.
  it("continues on the group's date and matches that group's shop", async () => {
    useBasketGroupTarget.getState().set("cline_2", "Shop A", DATE_EARLY);
    await renderInSafeArea(<WhenScreen />);

    await fireEvent.press(screen.getByText("Continue"));

    expect(useJobDeadline.getState().by).toBe(DATE_EARLY);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/rank",
      params: { subcategory: "brochures", category: "marketing_collateral" },
    });
    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({
        subcategoryCode: "brochures",
        cartId: "cart_multi",
        groupId: "cline_2",
        deadline: DATE_EARLY,
      }),
    );
  });
});
