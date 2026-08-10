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
  /** Lets the OS offer the right keyboard and the right autofill. */
  keyboardType?: TextInputProps["keyboardType"];
  textContentType?: TextInputProps["textContentType"];
  secureTextEntry?: boolean;
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
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
  keyboardType,
  textContentType,
  secureTextEntry,
  onSubmitEditing,
}: Props) {
  const colors = useThemeColors();
  return (
    <TextInput
      className={multiline ? "gg-field h-auto min-h-24 py-3" : "gg-field"}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      maxLength={maxLength}
      keyboardType={keyboardType}
      textContentType={textContentType}
      secureTextEntry={secureTextEntry}
      onSubmitEditing={onSubmitEditing}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
