import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import { HomeReorderTile } from "@/components/HomeReorderTile";
import { HomeRotatingTile } from "@/components/HomeRotatingTile";
import { HOME_TILE_HEIGHT, HomeSmartTile } from "@/components/HomeSmartTile";
import {
  HOME_TILE_MIN_HEIGHT,
  TILE_FOOTER_DOTS,
  TILE_INSET,
  TILE_SLOTS,
  tileIntrinsicHeight,
} from "@/components/HomeTileSlots";
import type { HomePromotion } from "@/lib/homePromos";
import type { SmartTileView } from "@/lib/homeSummary";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

/**
 * Both Home tiles share one grid (client#419), using `minHeight` rather than
 * fixed `height` so large Android system font scales expand both cards together
 * without clipping text or letting the progress bar / pager dots overlap words.
 */

const ORDER = ["top", "title", "subtitle", "footer"] as const;

function slotStyles() {
  return ORDER.map((slot) => StyleSheet.flatten(screen.getByTestId(`tile-slot-${slot}`).props.style));
}

const MISSIONS: SmartTileView = { kind: "missions", done: 0, total: 5, href: "/founding-tester", label: "Founding Tester" };
const ACTIVE: SmartTileView = {
  kind: "active_order",
  orderId: "ord_1",
  headline: "Order placed",
  detail: "Ready by Fri, Nov 6",
  step: 1,
  stepCount: 4,
  more: 4,
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
  color: "#FFFFFF",
};

it("fills the 112pt 1.0x tile floor: inset + slot minimums", () => {
  const expected = ORDER.map((slot) => TILE_SLOTS[slot]);
  expect(TILE_INSET * 2 + expected.reduce((a, b) => a + b, 0)).toBe(HOME_TILE_HEIGHT);
  expect(HOME_TILE_MIN_HEIGHT).toBe(HOME_TILE_HEIGHT);
});

it("pins the pager dots at the footer inset, strictly inside the reserved footer band", () => {
  expect(TILE_FOOTER_DOTS).toEqual({ right: TILE_INSET, bottom: TILE_INSET, height: 6 });
  expect(TILE_SLOTS.footer - TILE_FOOTER_DOTS.height).toBeGreaterThanOrEqual(6);
});

it.each([
  ["missions", "smart-tile-missions", () => <HomeSmartTile view={MISSIONS} onPress={jest.fn()} />],
  ["active order", "smart-tile-active_order", () => <HomeSmartTile view={ACTIVE} onPress={jest.fn()} />],
  ["promo", "promo-tile-promo_davaogo", () => <HomePromoTile promo={PROMO} onPress={jest.fn()} />],
  ["reorder", "reorder-tile", () => <HomeReorderTile title="Flyers" onPress={jest.fn()} />],
])("draws the %s tile on flexible minHeight slots with no fixed height cap", async (_name, testId, buildTile) => {
  await render(buildTile());

  const styles = slotStyles();
  expect(styles.map((s) => s.minHeight)).toEqual(ORDER.map((slot) => TILE_SLOTS[slot]));
  // Never cap slot or card boxes with a fixed `height`: Android clips scaled text inside fixed boxes.
  for (const s of styles) {
    expect(s.height).toBeUndefined();
  }
  expect(styles[3].paddingTop).toBeGreaterThanOrEqual(6);

  const cardNode = screen.getByTestId(testId);
  expect(typeof cardNode.props.style).not.toBe("function");
  const cardStyle = StyleSheet.flatten(cardNode.props.style);
  expect(cardStyle.minHeight).toBe(HOME_TILE_HEIGHT);
  expect(cardStyle.height).toBeUndefined();
});

it("keeps Your order, Reorder and promo text unclipped and scales row floor across 360x740, 390x844, 430x932 and font scales 1.0, 1.3 and 2.0", async () => {
  await render(<HomeSmartTile view={ACTIVE} onPress={jest.fn()} />);
  expect(screen.getByText("Order placed").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Ready by Fri, Nov 6").props.numberOfLines).toBeUndefined();

  for (const width of [360, 390, 430] as const) {
    for (const fontScale of [1.0, 1.3, 2.0] as const) {
      const colWidth = Math.floor((width - 32 - 12) / 2);
      expect(colWidth).toBeGreaterThan(150);
      const scaledBodyHeight = Math.ceil(
        (TILE_SLOTS.top + TILE_SLOTS.title * (fontScale > 1 ? 2 : 1) + TILE_SLOTS.subtitle) * fontScale,
      );
      const rowHeight = Math.max(HOME_TILE_HEIGHT, tileIntrinsicHeight(scaledBodyHeight));
      await render(
        <HomeRotatingTile
          reorder={<HomeReorderTile title="Flyers" onPress={jest.fn()} />}
          promos={[PROMO]}
          onPromoPress={jest.fn()}
          onPromoShown={jest.fn()}
          minHeight={rowHeight}
        />,
      );
      const rotatorStyle = StyleSheet.flatten(screen.getByTestId("home-rotating-tile").props.style);
      expect(rotatorStyle.minHeight).toBe(rowHeight);
      expect(rotatorStyle.height).toBeUndefined();
      expect(rotatorStyle.flexBasis).toBe(0);
      expect(rotatorStyle.minWidth).toBe(0);
      expect(screen.getAllByText("Flyers", { includeHiddenElements: true })[0].props.numberOfLines).toBeUndefined();
      expect(screen.getByText("DavaoGo").props.numberOfLines).toBeUndefined();
    }
  }
});

// One event-firing test per file, placed last (AGENTS.md, "Running and testing").
it("reports HomeSmartTile's intrinsic height when scaled text wraps", async () => {
  const onIntrinsicHeight = jest.fn();
  await render(<HomeSmartTile view={ACTIVE} onPress={jest.fn()} onIntrinsicHeight={onIntrinsicHeight} />);

  fireEvent(screen.getByTestId("tile-slot-body"), "layout", {
    nativeEvent: { layout: { width: 132, height: 156 } },
  });

  expect(onIntrinsicHeight).toHaveBeenCalledWith(tileIntrinsicHeight(156));
});
