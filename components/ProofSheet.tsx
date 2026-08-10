import { Image } from "expo-image";
import { Text, View } from "react-native";

import { useArtworkImage } from "@/hooks/useArtworkImage";

type Props = {
  fileId: string | null | undefined;
  /** What this document is, in the client's words. */
  caption: string;
};

/**
 * The proof itself, at the size a decision can be made from.
 *
 * This is the actual file the supplier intends to print — not a mockup — so it
 * carries no mockup label. When the file is a PDF the phone cannot rasterise
 * it, and the card says so rather than showing an empty frame.
 */
export function ProofSheet({ fileId, caption }: Props) {
  const { uri, unavailable, markUnrenderable } = useArtworkImage(fileId);

  return (
    <View className="gg-card-flush">
      <View className="border-b border-outline-subtle bg-surface-variant px-4 py-3">
        <Text className="text-caption text-text-muted">{caption}</Text>
      </View>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", aspectRatio: 4 / 3 }}
          contentFit="contain"
          transition={0}
          onError={markUnrenderable}
          accessibilityLabel={caption}
        />
      ) : (
        <View className="items-center gap-2 px-4 py-8">
          <Text className="text-center text-body text-text-secondary">
            {unavailable
              ? "This proof is a PDF, so it cannot be shown here."
              : "Loading the proof…"}
          </Text>
          {unavailable ? (
            <Text className="text-center text-caption text-text-muted">
              Check it on a larger screen before approving, or ask Operations to send it to
              you.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
