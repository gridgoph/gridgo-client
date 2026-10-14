import { View } from "react-native";

import { HeaderNotificationBell } from "@/components/HeaderNotificationBell";
import { HeaderThemeButton } from "@/components/HeaderThemeButton";

/**
 * Android's pushed-header controls: the notification bell, then the theme
 * control that was already there. One row, so the two read as one object the
 * way Cart and Chat do on a tab header.
 */
export function PushedHeaderActions() {
  return (
    <View className="flex-row items-center">
      <HeaderNotificationBell />
      <HeaderThemeButton />
    </View>
  );
}
