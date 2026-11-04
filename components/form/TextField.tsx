import { TextInput, type TextInputProps } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  multiline?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  returnKeyType?: TextInputProps["returnKeyType"];
  maxLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
  /** Defaults to 96; larger multiline destinations may preserve their composition. */
  multilineMinHeight?: number;
  /** Lets the OS offer the right keyboard and the right autofill. */
  keyboardType?: TextInputProps["keyboardType"];
  textContentType?: TextInputProps["textContentType"];
  secureTextEntry?: boolean;
  autoCorrect?: boolean;
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  /** So a form can hold its reason back until the field is left. */
  onBlur?: TextInputProps["onBlur"];
  /** Red outline while the value is missing or invalid. */
  invalid?: boolean;
};

/**
 * Free text, where the content genuinely is free text: a job title, a street
 * line, a note. Anything the platform already defines uses a picker instead.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  multiline,
  autoCapitalize = "sentences",
  returnKeyType,
  maxLength,
  autoFocus,
  editable,
  multilineMinHeight = 96,
  keyboardType,
  textContentType,
  secureTextEntry,
  autoCorrect,
  onSubmitEditing,
  onBlur,
  invalid = false,
}: Props) {
  const colors = useThemeColors();
  const shell = multiline ? "gg-field h-auto py-3" : "gg-field";
  return (
    <TextInput
      className={invalid ? `${shell} border-error` : shell}
      style={{
        paddingStart: 16,
        paddingEnd: 16,
        includeFontPadding: false,
        textAlignVertical: multiline ? "top" : "center",
        ...(multiline ? { minHeight: multilineMinHeight } : {}),
      }}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      maxLength={maxLength}
      autoFocus={autoFocus}
      editable={editable}
      keyboardType={keyboardType}
      textContentType={textContentType}
      secureTextEntry={secureTextEntry}
      autoCorrect={autoCorrect}
      onSubmitEditing={onSubmitEditing}
      onBlur={onBlur}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
