import { act } from "@testing-library/react-native";

import { PROMOS, renderTile, scrollTo, WIDTH } from "@/test/homeRotatingTileHarness";

/** A swipe onto a promo is a view (client#402). */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

it("counts a promo as shown once a swipe settles on it", async () => {
  const shown = await renderTile();
  await act(async () => scrollTo(WIDTH));
  expect(shown).toHaveBeenCalledWith(PROMOS[0]);
});
