import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import { useArtworkImage } from "@/hooks/useArtworkImage";

type Props = {
  /** A refund image bound to this client's request: QR, evidence or transfer screenshot. */
  fileId: string;
  /** Says what the image is, for the viewer and a screen reader. */
  alt: string;
  /** `plate` for a QR or transfer screenshot; `thumb` for an evidence row. */
  size?: "plate" | "thumb";
};

/**
 * A private refund image, read through a short-lived signed link.
 *
 * The link is asked for when the image is drawn and never kept: refund QRs
 * and transfer screenshots are only for this client and Operations. A read
 * that fails says so and offers another try, rather than an empty frame.
 */
export function RefundImage({ fileId, alt, size = "plate" }: Props) {
  const { uri, unavailable, markUnrenderable, retry } = useArtworkImage(fileId);
  const [open, setOpen] = useState(false);
  const box = size === "plate" ? { height: 200, width: "100%" as const } : { height: 72, width: 72 };

  if (unavailable) {
    return (
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel={`${alt} could not load. Try again`}
        className="items-center justify-center rounded-field border border-outline bg-surface-variant px-3"
        style={box}
      >
        <Text className="text-center text-caption text-text-muted">
          {size === "plate" ? "This image did not load. Tap to try again." : "Retry"}
        </Text>
      </Pressable>
    );
  }
  if (!uri) {
    return (
      <View style={box} accessibilityLabel={`Loading ${alt}`}>
        <SkeletonBlock className={size === "plate" ? "h-48 w-full" : "h-16 w-16"} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={`Open ${alt}`}>
        <View className="overflow-hidden rounded-field bg-surface-variant" style={box}>
          <Image
            source={{ uri }}
            resizeMode={size === "plate" ? "contain" : "cover"}
            accessibilityLabel={alt}
            onError={markUnrenderable}
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      </Pressable>
      <SamplePhotoViewer photos={[{ uri, alt }]} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
