import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { HomeRotatingTile } from "@/components/HomeRotatingTile";
import { promotionsFrom, type HomePromotion } from "@/lib/homePromos";

/**
 * Home's rotating tile (client#402) on its own. Each test file holds one
 * interacting test (AGENTS.md, Running and testing), so the setup lives here.
 * The file must also mock `expo-router`'s `useFocusEffect`.
 */

export const PROMOS: HomePromotion[] = promotionsFrom([
  {
    id: "promo_1",
    name: "DavaoGo",
    logoUrl: "https://files.example/logo.png",
    description: "Rides around Davao.",
    tag: "partner",
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    style: "yellow",
  },
]);

export const WIDTH = 170;

export async function renderTile(promos: HomePromotion[] = PROMOS, onPromoShown = jest.fn()) {
  await render(
    <HomeRotatingTile
      reorder={<Text testID="reorder-stub">Reorder</Text>}
      promos={promos}
      onPromoPress={jest.fn()}
      onPromoShown={onPromoShown}
    />,
  );
  if (promos.length) {
    await act(async () => {
      fireEvent(screen.getByTestId("home-rotating-tile"), "layout", { nativeEvent: { layout: { width: WIDTH, height: 112 } } });
    });
  }
  return onPromoShown;
}

/** A swipe that has settled at `x`. */
export function scrollTo(x: number) {
  fireEvent.scroll(screen.getByTestId("home-rotating-scroll"), {
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: WIDTH * 3, height: 112 },
      layoutMeasurement: { width: WIDTH, height: 112 },
    },
  });
}
