import { act } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { renderTile, scrollTo, WIDTH } from "@/test/homeRotatingTileHarness";

/** Past the last promo the tile lands back on Reorder (client#402). */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

it("wraps past the last promo back to Reorder without a backwards slide", async () => {
  const scrollSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => undefined);
  const shown = await renderTile();
  scrollSpy.mockClear();
  // The copy of Reorder after the last promo.
  await act(async () => scrollTo(WIDTH * 2));
  expect(scrollSpy).toHaveBeenCalledWith({ x: 0, animated: false });
  expect(shown).not.toHaveBeenCalled();
});
