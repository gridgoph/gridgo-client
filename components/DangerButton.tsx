import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  label: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

/**
 * The button for an action that cannot be undone.
 *
 * Yellow is the attention budget for the step a client wants to take, so a
 * deletion never wears it. This carries the error token on its border and
 * label, which keeps the meaning legible in greyscale. Same component as the
 * supplier and rider apps' `DangerButton`.
 */
export function DangerButton({ label, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={
        disabled
          ? "gg-btn gg-disabled border border-error bg-surface"
          : "gg-btn border border-error bg-surface"
      }
    >
      {({ pressed }) => (
        <>
          <Text className="text-button text-error">{label}</Text>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
