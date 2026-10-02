import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import JobRankingScreen from "@/app/request/rank";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useOrderRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, matchShop: jest.fn(), savePreferences: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

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

const FLOW = { subcategory: "tarpaulins_outdoor_banners", category: "marketing_collateral" };

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockParams = { ...FLOW };
  api.matchShop.mockReset();
  api.matchShop.mockReturnValue(new Promise(() => {}));
  api.savePreferences.mockReset();
  api.savePreferences.mockImplementation(async (ranking: string[]) => ({
    ranking,
    version: 2,
    updatedAt: "2026-10-02T00:00:00.000Z",
  }));
  clearMatchPrefetch();
  useCart.getState().reset();
  useJobDeadline.getState().set("2026-10-09T10:00:00.000Z");
  useOrderRanking.getState().clear();
  usePriorities.setState({
    ranking: ["quality", "speed", "cost", "distance"],
    loaded: true,
    saving: false,
    saveError: null,
  });
});

/*
  The one multi-press case, alone in its file (AGENTS.md "Running and
  testing"): a client taps the cards into a new order, ticks "Also make this
  my usual order", and confirms. GRIDGO saves it as the account's default
  first, and the job then simply matches on the (new) usual order.
*/
describe("JobRankingScreen — re-ranking and keeping it", () => {
  it("re-ranks by tapping, and saves the order as the usual one when asked", async () => {
    await renderInSafeArea(<JobRankingScreen />);

    // Tapping first place takes everything out; the order is then built anew.
    fireEvent.press(screen.getByLabelText("Quality"));
    await screen.findByText("Rank all four");
    fireEvent.press(screen.getByLabelText("Cost"));
    await waitFor(() =>
      expect(screen.getByLabelText("Cost").props.accessibilityValue.text).toBe("Ranked 1"),
    );
    fireEvent.press(screen.getByLabelText("Speed"));
    await waitFor(() =>
      expect(screen.getByLabelText("Speed").props.accessibilityValue.text).toBe("Ranked 2"),
    );
    fireEvent.press(screen.getByLabelText("Quality"));
    await waitFor(() =>
      expect(screen.getByLabelText("Quality").props.accessibilityValue.text).toBe("Ranked 3"),
    );
    fireEvent.press(screen.getByLabelText("Distance"));
    const keep = await screen.findByLabelText("Also make this my usual order");
    expect(
      screen.getByText("GRIDGO matches on cost, then speed, then quality, and last distance."),
    ).toBeTruthy();

    fireEvent.press(keep);
    await waitFor(() => expect(keep.props.accessibilityState).toMatchObject({ checked: true }));
    fireEvent.press(screen.getByRole("button", { name: "Find my printer" }));

    await waitFor(() =>
      expect(api.savePreferences).toHaveBeenCalledWith(["cost", "speed", "quality", "distance"]),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/match", params: FLOW }),
    );
    expect(usePriorities.getState().ranking).toEqual(["cost", "speed", "quality", "distance"]);
    // Now the usual order, so the job sends none of its own.
    expect(useOrderRanking.getState().ranking).toBeNull();
  });
});
