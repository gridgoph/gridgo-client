import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { normalizeOtp, OTP_LENGTH, otpReady } from "@/lib/otp";

type Props = {
  heading: string;
  body: string;
  code: string;
  onChangeCode: (code: string) => void;
  onSubmit: () => void;
  /** Omit when Clerk did not mail a code (TOTP / backup). */
  onResend?: () => void;
  busy: boolean;
  submitLabel: string;
  busyLabel?: string;
  error?: ReactNode;
};

/**
 * The emailed / MFA one-time code. Not the password-recovery field.
 *
 * One native input owns autofill (`oneTimeCode`); the six boxes are the
 * product surface. A second hidden field would steal the SMS code.
 */
export function OtpCodeStep({
  heading,
  body,
  code,
  onChangeCode,
  onSubmit,
  onResend,
  busy,
  submitLabel,
  busyLabel = "Checking…",
  error,
}: Props) {
  const colors = useThemeColors();
  const digits = normalizeOtp(code);
  const ready = otpReady(digits);
  const caret = Math.min(digits.length, OTP_LENGTH - 1);

  return (
    <View className="gap-7">
      <View className="gap-2">
        <Text className="text-display font-black text-text-primary" accessibilityRole="header">
          {heading}
        </Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>

      <View className="gap-3">
        <Text className="text-caption text-text-muted">Verification code</Text>
        <View className="relative">
          <View className="flex-row gap-2" pointerEvents="none">
            {Array.from({ length: OTP_LENGTH }, (_, index) => {
              const filled = Boolean(digits[index]);
              const current = !busy && index === caret && digits.length < OTP_LENGTH;
              return (
                <View
                  key={index}
                  className={
                    current
                      ? "h-14 flex-1 items-center justify-center rounded-field border-2 border-accent bg-surface"
                      : filled
                        ? "h-14 flex-1 items-center justify-center rounded-field border border-outline bg-surface-high"
                        : "h-14 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                  }
                >
                  <Text className="text-h2 font-bold text-text-primary">{digits[index] ?? ""}</Text>
                </View>
              );
            })}
          </View>
          <TextInput
            value={digits}
            onChangeText={(value) => onChangeCode(normalizeOtp(value))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            caretHidden
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (ready && !busy) onSubmit();
            }}
            accessibilityLabel="Verification code"
            style={[
              StyleSheet.absoluteFill,
              {
                color: colors.textPrimary,
                opacity: 0.02,
                fontSize: 16,
              },
            ]}
          />
        </View>
        {onResend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Resend code"
            disabled={busy}
            onPress={onResend}
            className="gg-touch -mt-1 self-start justify-center"
          >
            <Text className={busy ? "text-button text-text-muted" : "text-button text-brand"}>
              Resend code
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error}

      <PrimaryButton
        label={busy ? busyLabel : submitLabel}
        disabled={!ready || busy}
        onPress={onSubmit}
      />
    </View>
  );
}
