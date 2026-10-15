import { DoorClosed, DoorClosedLocked, DoorOpen } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { shopHoursSpoken, type ShopHoursKind, type ShopHoursView } from "@/lib/shopHours";

const LOOK = {
  open: { Icon: DoorOpen, token: "success", text: "text-success" },
  closed: { Icon: DoorClosed, token: "textSecondary", text: "text-text-secondary" },
  paused: { Icon: DoorClosedLocked, token: "warning", text: "text-warning" },
} as const satisfies Record<ShopHoursKind, unknown>;

/**
 * The shop's sign on the door: open, closed until a time, or closed for now.
 *
 * Icon, words and colour together, so it reads in grayscale. Closed is the
 * quiet ink rather than a warning — the ready-by already waits for the shop to
 * open, and a client can still order. Only closed for now, which takes no new
 * orders, is drawn as something to act on.
 *
 * `pill` sets it on a surface chip, for a line laid over a sample photo.
 */
export function ShopHoursLine({ view, pill = false }: { view: ShopHoursView | null; pill?: boolean }) {
  const colors = useThemeColors();
  if (!view) return null;
  const { Icon, token, text } = LOOK[view.kind];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={shopHoursSpoken(view)}
      className={
        pill
          ? "flex-row items-center gap-1.5 self-start rounded-pill border border-outline bg-surface px-2 py-1"
          : "flex-row items-center gap-1.5"
      }
    >
      <Icon size={14} color={colors[token]} strokeWidth={2} aria-hidden />
      <Text className={`shrink text-caption font-medium ${text}`}>{view.label}</Text>
    </View>
  );
}
