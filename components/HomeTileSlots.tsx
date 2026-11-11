import type { ReactNode } from "react";
import { View } from "react-native";

export const TILE_INSET = 13; // 1pt border + 12pt padding

/**
 * The shared vertical grid for Home's bottom tiles (client#419).
 *
 * Slots use `minHeight` rather than fixed `height`: at 1.0x the 112pt card
 * (1pt border + 12pt padding = 26pt inset) splits its 86pt interior across
 * top (32), title (26), subtitle (16) and footer (12); at larger system font
 * scales `<Text>` expands the upper slots naturally while `tile-slot-footer`
 * stays pinned below the text with at least 6pt clearance above the bar/dots.
 */
export const TILE_SLOTS = {
  top: 32,
  title: 26,
  subtitle: 16,
  footer: 12,
} as const;

export const HOME_TILE_MIN_HEIGHT =
  TILE_INSET * 2 + TILE_SLOTS.top + TILE_SLOTS.title + TILE_SLOTS.subtitle + TILE_SLOTS.footer;

export function tileIntrinsicHeight(bodyHeight: number): number {
  return TILE_INSET * 2 + Math.ceil(bodyHeight) + TILE_SLOTS.footer;
}

/**
 * Where a 6pt pager row sits so it aligns with the 6pt progress bar pinned to
 * the bottom of `tile-slot-footer`, strictly below the subtitle slot.
 */
export const TILE_FOOTER_DOTS = {
  right: TILE_INSET,
  bottom: TILE_INSET,
  height: 6,
} as const;

type Props = {
  top: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  /** Reports the card's unstretched content height so its row twin can match it. */
  onIntrinsicHeight?: (height: number) => void;
};

export function HomeTileSlots({ top, title, subtitle, footer, onIntrinsicHeight }: Props) {
  return (
    <View className="grow">
      <View
        testID="tile-slot-body"
        onLayout={
          onIntrinsicHeight
            ? (event) => {
                const body = Math.ceil(event.nativeEvent.layout.height);
                if (body > 0) onIntrinsicHeight(tileIntrinsicHeight(body));
              }
            : undefined
        }
      >
        <View testID="tile-slot-top" style={{ minHeight: TILE_SLOTS.top }}>
          {top}
        </View>
        <View testID="tile-slot-title" className="justify-end" style={{ minHeight: TILE_SLOTS.title }}>
          {title}
        </View>
        <View testID="tile-slot-subtitle" className="justify-center" style={{ minHeight: TILE_SLOTS.subtitle }}>
          {subtitle}
        </View>
      </View>
      <View
        testID="tile-slot-footer"
        className="mt-auto justify-end"
        style={{ minHeight: TILE_SLOTS.footer, paddingTop: 6 }}
      >
        {footer}
      </View>
    </View>
  );
}
