import { FolderOpen } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { heldFileLine } from "@/lib/myFiles";

type Props = {
  name: string;
  /** Why this item cannot take the file, when it cannot. */
  refusal: string | null;
  busy: boolean;
  onAdd: () => void;
  onDismiss: () => void;
};

/**
 * The file chosen in My files with "Use on a new order", offered on the first
 * Artwork step the client reaches. Asked, never done for them: the item they
 * opened may not be the one they meant it for.
 *
 * Monochrome — "Choose files" or "Go to checkout" keeps the screen's yellow.
 */
export function HeldFileCard({ name, refusal, busy, onAdd, onDismiss }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-3" accessibilityLabel={`From My files: ${name}`}>
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <FolderOpen size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>
        <Text className="min-w-0 flex-1 text-body text-text-primary">{refusal ?? heldFileLine(name)}</Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {refusal ? null : (
          <View className="min-w-0 flex-1">
            <SecondaryButton label={busy ? "Adding…" : "Add to this item"} disabled={busy} onPress={onAdd} />
          </View>
        )}
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={refusal ? "Dismiss" : "Not now"}
          className="min-h-11 justify-center px-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-body font-medium text-text-primary">{refusal ? "Dismiss" : "Not now"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
