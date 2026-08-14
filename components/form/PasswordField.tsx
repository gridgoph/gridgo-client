import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = Pick<
  TextInputProps,
  "onBlur" | "onSubmitEditing" | "returnKeyType" | "textContentType"
> & {
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
};

/** GRIDGO field primitive with an accessible show/hide password action. */
export function PasswordField({
  value,
  onChangeText,
  accessibilityLabel,
  placeholder,
  onBlur,
  onSubmitEditing,
  returnKeyType,
  textContentType,
}: Props) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  return (
    <View className="relative justify-center">
      <TextInput
        className="gg-field"
        style={{
          paddingStart: 16,
          paddingEnd: 64,
          includeFontPadding: false,
          textAlignVertical: "center",
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!visible}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? `Hide ${accessibilityLabel}` : `Show ${accessibilityLabel}`}
        onPress={() => setVisible((current) => !current)}
        className="gg-touch absolute right-1 h-11 w-11 items-center justify-center"
      >
        {visible ? (
          <EyeOff size={20} color={colors.textMuted} />
        ) : (
          <Eye size={20} color={colors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}
