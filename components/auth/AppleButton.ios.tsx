import { useSignInWithApple } from "@clerk/expo/apple";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { View } from "react-native";

import type { AppleButtonProps } from "./AppleButton";
import { useThemeName } from "@/hooks/useTheme";

/**
 * Apple's own system button, as its Human Interface Guidelines ask: black on
 * Light, white on Dark, "Continue with Apple", the same 44pt height and 12pt
 * corners as the Google and Facebook buttons beside it, so it is never less
 * prominent than they are (`ProviderButtons` decides the order).
 *
 * Apple's button has no disabled state, so a tap already in flight dims it
 * and stops touches the way `gg-disabled` does for every other control.
 */
export function AppleButton({ onPress, disabled }: AppleButtonProps) {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const dark = useThemeName() === "dark";
  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-disabled" : undefined}
    >
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          dark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={{ width: "100%", height: 44 }}
        onPress={() => onPress(() => startAppleAuthenticationFlow())}
      />
    </View>
  );
}
