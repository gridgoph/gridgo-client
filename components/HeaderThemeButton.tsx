import { Settings } from "lucide-react-native";
import { Alert } from "react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";
import { useThemeStore } from "@/store/theme";

export function HeaderThemeButton() {
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <HeaderIconButton
      icon={Settings}
      accessibilityLabel="Choose theme"
      onPress={() =>
        Alert.alert(
          "Theme",
          undefined,
          [
            { text: "System", onPress: () => setPreference("system") },
            { text: "Light", onPress: () => setPreference("light") },
            { text: "Dark", onPress: () => setPreference("dark") },
          ],
          { cancelable: true },
        )
      }
    />
  );
}
