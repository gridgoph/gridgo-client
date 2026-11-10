import { act, fireEvent, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { PROMO_ROTATE_MS } from "@/lib/homePromos";
import { renderTile } from "@/test/homeRotatingTileHarness";

/** A finger on the tile holds the page (client#402). */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

it("holds still while a finger is on it", async () => {
  jest.useFakeTimers();
  const scrollSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => undefined);
  await renderTile();
  scrollSpy.mockClear();
  fireEvent(screen.getByTestId("home-rotating-tile"), "touchStart");
  await act(async () => {
    jest.advanceTimersByTime(PROMO_ROTATE_MS * 3);
  });
  expect(scrollSpy).not.toHaveBeenCalled();
  jest.useRealTimers();
});
