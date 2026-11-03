import { Pressable, Text, View } from "react-native";

/**
 * "No fixed price for custom work?" — the way into a quote request from a
 * product a shop also lists at a set price (gridgo-api#226). Signage and 3D
 * printing are often one-off, so the listing price is not the only answer.
 */
export function QuoteInvite({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <View className="mt-2 gg-panel gap-3">
      <Text className="text-body-lg font-medium text-text-primary">No fixed price for custom work?</Text>
      <Text className="text-body text-text-secondary">
        GRIDGO asks shops to quote {name.toLowerCase()} and sends you up to three options.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="gg-btn-secondary self-start px-6"
      >
        <Text className="text-button text-text-primary">Request a quote</Text>
      </Pressable>
    </View>
  );
}
