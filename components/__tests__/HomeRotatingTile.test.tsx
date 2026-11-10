import { act, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { PROMO_ROTATE_MS } from "@/lib/homePromos";
import { renderTile, WIDTH } from "@/test/homeRotatingTileHarness";

/**
 * Home's lower-right tile (client#402): Reorder plus live partner promos.
 * One interacting test per file: swipe, touch and wrap are in
 * HomeRotatingTile-*.test.tsx.
 */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("is exactly the Reorder tile when nothing is live", async () => {
  await renderTile([]);
  expect(screen.getByTestId("reorder-stub")).toBeTruthy();
  expect(screen.queryByTestId("home-rotating-scroll")).toBeNull();
  expect(screen.queryByTestId("home-rotating-dots", { includeHiddenElements: true })).toBeNull();
});

it("leads with Reorder and draws one dot per page", async () => {
  const shown = await renderTile();
  expect(screen.getAllByTestId("reorder-stub").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("DavaoGo. Partner")).toBeTruthy();
  expect(screen.getByTestId("home-rotating-dots", { includeHiddenElements: true }).children).toHaveLength(2);
  // Reorder is on screen, not the promo: nothing counted yet.
  expect(shown).not.toHaveBeenCalled();
});

it("turns to the next page after five seconds", async () => {
  jest.useFakeTimers();
  const scrollSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => undefined);
  await renderTile();
  scrollSpy.mockClear();
  await act(async () => {
    jest.advanceTimersByTime(PROMO_ROTATE_MS - 1);
  });
  expect(scrollSpy).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(scrollSpy).toHaveBeenCalledWith({ x: WIDTH, animated: true });
});
