import { ChevronDown, CircleHelp, MapPin } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { PlatformSettings } from "@/lib/api";
import { deliveryZoneRows } from "@/lib/distanceZone";

export const DELIVERY_ZONES_QUESTION = "How does delivery distance work?";

/**
 * The answer to "how does delivery distance work?", from the live table.
 *
 * Four zones, each with its range and today's price, read from the same
 * `GET /settings` bands checkout prices with — so the help can never quote a
 * fee the sheet will not charge. Nothing is drawn on an API whose bands are
 * not named yet: the help would have to invent the words.
 */
export function DeliveryZonesHelp({
  settings,
  initiallyOpen = false,
}: {
  settings: Pick<PlatformSettings, "deliveryFeeBands"> | null;
  /** For a screen that opens with the answer showing. */
  initiallyOpen?: boolean;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(initiallyOpen);
  const rows = deliveryZoneRows(settings);
  if (!rows.length) return null;

  return (
    <View className="gg-card-flush">
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={DELIVERY_ZONES_QUESTION}
        accessibilityState={{ expanded: open }}
        className="gg-touch flex-row items-center gap-3 px-4 py-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <CircleHelp size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        <Text className="min-w-0 flex-1 text-body text-text-primary">
          {DELIVERY_ZONES_QUESTION}
        </Text>
        <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
          <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
        </View>
      </Pressable>

      {open ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          className="gap-3 border-t border-outline-subtle px-4 pb-4 pt-3"
        >
          <Text className="text-caption text-text-secondary">
            GRIDGO measures from where your job is printed to your drop-off and puts it in one of
            four zones. The zone sets the delivery fee.
          </Text>
          <View className="rounded-field border border-outline">
            {rows.map((row, index) => (
              <View
                key={row.key}
                accessible
                accessibilityLabel={`${row.label}, ${row.range}, ${row.price}`}
                className={`flex-row items-center gap-3 px-3 py-2.5${
                  index > 0 ? " border-t border-outline-subtle" : ""
                }`}
              >
                <MapPin
                  size={14}
                  color={row.outOfZone ? colors.warning : colors.textMuted}
                  strokeWidth={2}
                  aria-hidden
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-body font-medium text-text-primary">{row.label}</Text>
                  <Text className="text-caption text-text-muted">{row.range}</Text>
                </View>
                <Text className="shrink text-right text-body text-text-primary">{row.price}</Text>
              </View>
            ))}
          </View>
          <Text className="text-caption text-text-muted">
            Out of Zone is charged for every started kilometre of the whole trip, so it can cost a
            lot. GRIDGO tells you before you choose a listing that far away.
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
