import { MapPinOff } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { GeoPoint } from "@/lib/tracking";

export type PinPickerProps = {
  /** Where the pin is now. Null until the client puts one down. */
  point: GeoPoint | null;
  onPick: (point: GeoPoint) => void;
  /**
   * Caption under the map: complete address, "Reading this place…", or
   * STREET_UNREAD. When omitted, the pin helper is shown.
   */
  caption?: string | null;
};

/**
 * Web fallback.
 *
 * `react-native-webview` has no web build and would render its own red "does
 * not support this platform" string, which is an internal message that must
 * never reach a client. The client can still type an address; only the pin
 * needs a device.
 */
export function PinPicker({ caption }: PinPickerProps) {
  const colors = useThemeColors();

  return (
    <View className="gg-panel items-center gap-2 py-8">
      <MapPinOff
        size={20}
        color={colors.textMuted}
        strokeWidth={2}
        aria-hidden
      />
      <Text className="text-center text-body text-text-secondary">
        The map needs the GRIDGO app on your phone.
      </Text>
      <Text className="text-center text-caption text-text-muted">
        {caption ||
          "Type the address below and GRIDGO will confirm the exact spot with you."}
      </Text>
    </View>
  );
}
