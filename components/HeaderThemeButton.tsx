import { Settings } from "lucide-react-native";
import { Alert } from "react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";

/** Theme on every pushed screen. The choice is saved on the account (client#335). */
export function HeaderThemeButton() {
  const choose = useThemeStore((state) => state.choose);
  const userId = useSession((state) => state.user?.id ?? null);
  const setPreference = (preference: "system" | "light" | "dark") => void choose(preference, userId);

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
