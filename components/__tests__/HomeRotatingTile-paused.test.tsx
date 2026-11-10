import { act } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { PROMO_ROTATE_MS } from "@/lib/homePromos";
import { PROMOS, renderTile, scrollTo, tile, WIDTH } from "@/test/homeRotatingTileHarness";

/**
 * A sheet over the tile (client#402 review): the tile neither turns nor counts
 * a view under it, and counts the page once it is uncovered.
 */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

it("does not turn or count a view while covered, and counts once uncovered", async () => {
  jest.useFakeTimers();
  const scrollSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => undefined);
  const shown = await renderTile(PROMOS, jest.fn(), true);
  scrollSpy.mockClear();
  await act(async () => {
    jest.advanceTimersByTime(PROMO_ROTATE_MS * 3);
  });
  expect(scrollSpy).not.toHaveBeenCalled();
  // The page under the sheet changes (a swipe that landed as it opened).
  await act(async () => scrollTo(WIDTH));
  expect(shown).not.toHaveBeenCalled();

  await act(async () => shown.rerender(tile(PROMOS, shown, false)));
  expect(shown).toHaveBeenCalledWith(PROMOS[0]);
  jest.useRealTimers();
});
