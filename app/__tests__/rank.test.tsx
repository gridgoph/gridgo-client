import { fireEvent, render, screen } from "@testing-library/react-native";
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

/** What a priority's card is announcing right now. */
function rankOf(label: string): string {
  return screen.getByLabelText(label).props.accessibilityValue.text;
}

/*
  gridgo-client#157: every job asks the client to confirm or re-rank their
  usual order, and the question can be skipped. One press per test; the
  multi-press cases live in rank-usual.test.tsx.
*/
describe("JobRankingScreen — asked on every job", () => {
  it("opens on the usual order, ready to confirm in one tap", async () => {
    await renderInSafeArea(<JobRankingScreen />);

    expect(screen.getByText("What matters most for this job?")).toBeTruthy();
    expect(rankOf("Quality")).toBe("Ranked 1");
    expect(rankOf("Speed")).toBe("Ranked 2");
    expect(rankOf("Cost")).toBe("Ranked 3");
    expect(rankOf("Distance")).toBe("Ranked 4");
    expect(screen.getByRole("button", { name: "Find my printer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    // Nothing new to save, so nothing offers to save it.
    expect(screen.queryByLabelText("Also make this my usual order")).toBeNull();
  });

  it("can be skipped: the match runs on the usual order, and nothing is sent as this job's", async () => {
    useOrderRanking.getState().set(["speed", "quality", "cost", "distance"]);
    await renderInSafeArea(<JobRankingScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Skip" }));

    expect(useOrderRanking.getState().ranking).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/match", params: FLOW });
    const sent = api.matchShop.mock.calls[0][0];
    expect(sent).toMatchObject({
      subcategoryCode: "tarpaulins_outdoor_banners",
      deadline: "2026-10-09T10:00:00.000Z",
    });
    expect(sent).not.toHaveProperty("ranking");
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "cost", "distance"]);
  });

  it("matches a re-ranked job on its own order, leaving the usual order alone", async () => {
    // The order on the cards is this job's re-rank (as a client sees it after
    // tapping the cards into a new order); confirming sends it with the match.
    useOrderRanking.getState().set(["cost", "speed", "quality", "distance"]);
    await renderInSafeArea(<JobRankingScreen />);
    expect(rankOf("Cost")).toBe("Ranked 1");

    fireEvent.press(screen.getByRole("button", { name: "Find my printer" }));

    expect(useOrderRanking.getState().ranking).toEqual(["cost", "speed", "quality", "distance"]);
    expect(api.matchShop.mock.calls[0][0]).toMatchObject({
      ranking: ["cost", "speed", "quality", "distance"],
    });
    expect(api.savePreferences).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/match", params: FLOW });
  });

  it("asks where the job is going first when this job puts distance first", async () => {
    useOrderRanking.getState().set(["distance", "quality", "speed", "cost"]);
    await renderInSafeArea(<JobRankingScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Find my printer" }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/where", params: FLOW });
    // No pin yet, so GRIDGO is not asked: it would refuse.
    expect(api.matchShop).not.toHaveBeenCalled();
  });

  it("from Change on the match, goes back to it with the new order", async () => {
    mockParams = { ...FLOW, returnTo: "match" };
    useOrderRanking.getState().set(["speed", "cost", "quality", "distance"]);
    await renderInSafeArea(<JobRankingScreen />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Keep this order" }));

    expect(mockBack).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useOrderRanking.getState().ranking).toEqual(["speed", "cost", "quality", "distance"]);
  });
});
