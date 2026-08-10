import { ActivityIndicator, Modal, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  /**
   * What is happening right now, in the client's words. Changes as the work
   * moves on, so a long wait is legible instead of a single frozen label.
   */
  label: string;
  /** One quiet line under the label, where the wait needs explaining. */
  body?: string;
};

/**
 * Work that blocks the screen it started from.
 *
 * A skeleton is for a screen that has not drawn yet. This is the other case:
 * the screen is already there, the client has committed to something, and the
 * app is doing it. A scrim holds the screen still so a second tap cannot start
 * the work twice, and the label says which part of it is running.
 *
 * Deliberately not yellow. Nothing here is an action, and the screen
 * underneath has already spent its one yellow control on the button that
 * started this.
 */
export function LoadingOverlay({ visible, label, body }: Props) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        className="flex-1 items-center justify-center bg-scrim px-8"
      >
        <View className="gg-card min-w-56 items-center gap-3 px-6 py-6">
          <ActivityIndicator size="small" color={colors.textPrimary} />
          <Text className="text-center text-body-lg font-medium text-text-primary">
            {label}
          </Text>
          {body ? (
            <Text className="text-center text-caption text-text-muted">{body}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
