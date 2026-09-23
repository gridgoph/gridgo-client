import { ChevronRight, MapPin, Package } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import {
  GRIDGO_OFFICE,
  GRIDGO_OFFICE_LABEL,
  gridgoOfficeCoordLine,
  gridgoOfficeMapUrl,
} from "@/lib/gridgoOffice";
import { balanceDue } from "@/lib/payment";

type Props = {
  order: Order;
};

/**
 * The counter slip: where a collected job ends up, and what to bring for it.
 *
 * This is the moment the whole collect route exists for, so it says the one
 * thing a client actually needs — the job is on the counter, here is where the
 * counter is — and nothing else. No rider, no map to watch, no progress bar:
 * the travelling is over and none of it was ever theirs to follow.
 *
 * It has two moods, because "ready" would be a lie while money is owed. Unpaid,
 * it is a quiet holding note and the screen's yellow belongs to the payment.
 * Paid, it takes the brand rail, because now the only thing left is the walk.
 */
export function PickupCounterCard({ order }: Props) {
  const colors = useThemeColors();
  const owes = balanceDue(order);

  return (
    <View className="gg-card-flush flex-row">
      {/* The one accent, and only once the walk is genuinely all that is left. */}
      <View
        style={{ width: 3, backgroundColor: owes ? colors.outline : colors.brand }}
        aria-hidden
      />

      <View className="min-w-0 flex-1 gap-4 p-4">
        <View className="gap-1">
          <Text className="text-overline text-text-muted">
            {owes ? "HELD AT THE COUNTER" : "READY AT THE COUNTER"}
          </Text>
          <Text className="text-h3 text-text-primary">{order.title}</Text>
          <Text className="text-body text-text-secondary">
            {owes
              ? "Your order is finished and waiting at GRIDGO Office. It is released once Operations confirms your remaining balance, so settle that before you travel."
              : "Your order is finished and waiting at GRIDGO Office. Come to the counter and give the name you ordered under."}
          </Text>
        </View>

        <View className="gg-divider" />

        <View className="flex-row items-start gap-3">
          <MapPin
            size={18}
            color={colors.textMuted}
            strokeWidth={2}
            aria-hidden
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body font-medium text-text-primary">
              {GRIDGO_OFFICE_LABEL}
            </Text>
            <Text className="text-caption text-text-muted">{GRIDGO_OFFICE.locality}</Text>
            <Text className="text-caption text-text-muted">{gridgoOfficeCoordLine()}</Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3">
          <Package
            size={18}
            color={colors.textMuted}
            strokeWidth={2}
            aria-hidden
          />
          <Text className="min-w-0 flex-1 text-caption text-text-muted">
            Anyone can collect on your behalf. They need the name the order was
            placed under.
          </Text>
        </View>

        <Pressable
          onPress={() => void Linking.openURL(gridgoOfficeMapUrl())}
          accessibilityRole="button"
          accessibilityLabel="Open GRIDGO Office in Maps"
          className="gg-touch flex-row items-center gap-1 self-start"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-primary">Open in Maps</Text>
          <ChevronRight
            size={16}
            color={colors.textPrimary}
            strokeWidth={2}
            aria-hidden
          />
        </Pressable>
      </View>
    </View>
  );
}
