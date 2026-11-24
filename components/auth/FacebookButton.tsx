import { Pressable, Text, View, type PressableProps } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

/**
 * "Continue with Facebook", built like `GoogleButton` beside it: the same
 * outlined secondary control, so no provider outranks another and the
 * screen's one yellow button stays the email form's. Facebook's own blue
 * mark is the only colour, as its brand guidelines ask; the white "f" is
 * painted under it so the mark reads the same on Light and Dark.
 */
export function FacebookButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Facebook"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-center justify-center gap-3">
            <FacebookMark />
            <Text className="text-button text-text-primary">Continue with Facebook</Text>
          </View>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

function FacebookMark() {
  return (
    <View aria-hidden>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={11} fill="#FFFFFF" />
        <Path
          fill="#0866FF"
          d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.931-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"
        />
      </Svg>
    </View>
  );
}
