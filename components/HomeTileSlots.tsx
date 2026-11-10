import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * The one grid every Home tile is drawn on (Mark's symmetry pass, client#419
 * review), so the two tiles side by side share baselines, not just a box:
 * 112pt tall, 1pt border, 12pt padding leaves 86pt of content, split top to
 * bottom into a top row, a title line, a subtitle line and a footer.
 */
export const TILE_SLOTS = { top: 32, title: 26, subtitle: 16, footer: 12 } as const;
const TILE_INSET = 13; // 1pt border + 12pt padding

/** Where a 6pt pager row sits so it is centred in the footer slot of a tile whose box it overlays. */
export const TILE_FOOTER_DOTS = {
  right: TILE_INSET,
  bottom: TILE_INSET + (TILE_SLOTS.footer - 6) / 2,
  height: 6,
} as const;

type Props = {
  top: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
};

export function HomeTileSlots({ top, title, subtitle, footer }: Props) {
  return (
    <>
      <View testID="tile-slot-top" style={{ height: TILE_SLOTS.top }}>
        {top}
      </View>
      <View testID="tile-slot-title" className="justify-end" style={{ height: TILE_SLOTS.title }}>
        {title}
      </View>
      <View testID="tile-slot-subtitle" className="justify-center" style={{ height: TILE_SLOTS.subtitle }}>
        {subtitle}
      </View>
      <View testID="tile-slot-footer" className="justify-center" style={{ height: TILE_SLOTS.footer }}>
        {footer}
      </View>
    </>
  );
}
