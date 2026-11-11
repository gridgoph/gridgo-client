import { act, screen } from "@testing-library/react-native";

import { PROMOS, renderTile, scrollTo, WIDTH } from "@/test/homeRotatingTileHarness";

/** On a promo with a card image the rotation's dots are white, like the rest of its ink (client#425). */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

it("draws the dots in white over a card image", async () => {
  await renderTile([{ ...PROMOS[0], cardImageUrl: "https://files.example/card.jpg" }]);
  await act(async () => scrollTo(WIDTH));
  const dots = screen.getByTestId("home-rotating-dots", { includeHiddenElements: true });
  const colours = dots.children.map((dot) => (typeof dot === "string" ? null : dot.props.style.backgroundColor));
  expect(colours).toEqual(["#FFFFFFD9", "#FFFFFF"]);
});
