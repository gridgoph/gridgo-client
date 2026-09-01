import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  title: string;
  body?: string;
  /** Invitation to act — empty screens are never a shrug. */
  actionLabel?: string;
  onAction?: () => void;
  /** A quieter way out, under the invitation. */
  altActionLabel?: string;
  onAltAction?: () => void;
};

/** Empty list / empty panel: say what is missing and the next step. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  altActionLabel,
  onAltAction,
}: Props) {
  return (
    <View className="gg-panel items-center py-8">
      <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
      {body ? <Text className="mt-2 text-center text-body text-text-muted">{body}</Text> : null}
      {actionLabel && onAction ? (
        <View className="mt-4 w-full max-w-xs gap-2">
          <SecondaryButton label={actionLabel} onPress={onAction} />
          {altActionLabel && onAltAction ? (
            <Pressable
              onPress={onAltAction}
              accessibilityRole="button"
              className="gg-touch items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text className="text-button text-text-secondary">{altActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
