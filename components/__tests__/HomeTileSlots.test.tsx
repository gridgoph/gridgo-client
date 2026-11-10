import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import { HomeReorderTile } from "@/components/HomeReorderTile";
import { HOME_TILE_HEIGHT, HomeSmartTile } from "@/components/HomeSmartTile";
import { TILE_FOOTER_DOTS, TILE_SLOTS } from "@/components/HomeTileSlots";
import type { HomePromotion } from "@/lib/homePromos";
import type { SmartTileView } from "@/lib/homeSummary";

/**
 * Both Home tiles share one grid (client#419 review): the same slot heights in
 * the same order, filling a 112pt tile exactly, so titles, subtitles and the
 * footer row line up across the pair. Jest has no layout engine, so the
 * geometry is asserted on the rendered slot styles.
 */

const INSET = 13; // 1pt border + 12pt padding
const ORDER = ["top", "title", "subtitle", "footer"] as const;

function slotHeights(): number[] {
  return ORDER.map((slot) => StyleSheet.flatten(screen.getByTestId(`tile-slot-${slot}`).props.style).height as number);
}

const EXPECTED = ORDER.map((slot) => TILE_SLOTS[slot]);

const MISSIONS: SmartTileView = { kind: "missions", done: 0, total: 5, href: "/founding-tester", label: "Founding Tester" };
const ACTIVE: SmartTileView = {
  kind: "active_order",
  orderId: "ord_1",
  headline: "Order placed",
  detail: "Ready by Fri, Nov 6",
  step: 1,
  stepCount: 4,
  more: 2,
  needsPayment: false,
  href: "/order/ord_1",
  label: "Your order",
};
const PROMO: HomePromotion = {
  id: "promo_davaogo",
  name: "DavaoGo",
  logoUrl: null,
  imageUrl: null,
  description: "",
  tag: "sponsored",
  linkText: "Plan your commute",
  linkUrl: "https://davaogo.example",
  tapAction: "sheet",
  style: "light",
  color: null,
};

it("fills the 112pt tile exactly: inset + slots", () => {
  expect(INSET * 2 + EXPECTED.reduce((a, b) => a + b, 0)).toBe(HOME_TILE_HEIGHT);
});

it.each([
  ["missions", <HomeSmartTile key="m" view={MISSIONS} onPress={jest.fn()} />],
  ["active order", <HomeSmartTile key="a" view={ACTIVE} onPress={jest.fn()} />],
  ["promo", <HomePromoTile key="p" promo={PROMO} onPress={jest.fn()} />],
  ["reorder", <HomeReorderTile key="r" title="Flyers" onPress={jest.fn()} />],
])("draws the %s tile on the shared slots", async (_name, tile) => {
  await render(tile);
  expect(slotHeights()).toEqual(EXPECTED);
});

it("puts the active order's headline and detail in the same slots as the promo's name and link", async () => {
  await render(<HomeSmartTile view={ACTIVE} onPress={jest.fn()} />);
  expect(screen.getByTestId("tile-slot-title")).toHaveTextContent("Order placed");
  expect(screen.getByTestId("tile-slot-subtitle")).toHaveTextContent("Ready by Fri, Nov 6");
});

it("centres the pager dots in the footer slot, inside the border", () => {
  const footerTop = HOME_TILE_HEIGHT - INSET - TILE_SLOTS.footer;
  const dotsTop = HOME_TILE_HEIGHT - TILE_FOOTER_DOTS.bottom - TILE_FOOTER_DOTS.height;
  expect(dotsTop - footerTop).toBe(HOME_TILE_HEIGHT - INSET - (dotsTop + TILE_FOOTER_DOTS.height));
  expect(TILE_FOOTER_DOTS.right).toBe(INSET);
});
