import { ImageOff, Image as ImageIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  THUMB_GAP,
  THUMB_SIZE,
  THUMB_STRIP_INSET,
  clampPhotoIndex,
  thumbStripOffset,
} from "@/lib/gallery";

export type StripPhoto = {
  /** The photo's signed link; null draws the empty plate. */
  uri: string | null;
  key: string;
};

type Props = {
  photos: StripPhoto[];
  /** The photo the gallery is showing. */
  selected: number;
  onSelect: (index: number) => void;
  /** The listing sheet's board, or the full-screen viewer's black stage. */
  tone?: "surface" | "dark";
  /** Prefix for each thumbnail's test id: `<prefix>-thumb-<n>`. */
  testIDPrefix: string;
};

/**
 * The small thumbnails under a photo gallery: every photo at a glance, the one
 * in view ringed, and a tap jumps straight to one. As the client swipes the
 * gallery the ring moves with them and the strip scrolls to keep it in the
 * middle, so a listing's last photo is never off the end of a strip that does
 * not say where they are.
 *
 * The thumbnails are pictures, not separate stops for a screen reader: the
 * gallery's own position control (and the viewer's next and previous) already
 * steps through the photos, and eight more buttons saying the same would only
 * make the sheet longer to read.
 */
export function PhotoThumbStrip({
  photos,
  selected,
  onSelect,
  tone = "surface",
  testIDPrefix,
}: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  // The first placement is a jump: a viewer opened on photo 6 starts there
  // rather than gliding across from photo 1.
  const placed = useRef(false);
  const count = photos.length;
  const current = clampPhotoIndex(selected, count);
  const dark = tone === "dark";

  useEffect(() => {
    if (width <= 0) return;
    const x = thumbStripOffset(current, count, width);
    scrollRef.current?.scrollTo({ x, y: 0, animated: placed.current && !reduceMotion });
    placed.current = true;
  }, [current, count, width, reduceMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  // Ink for the empty and failed plates: the viewer is always black, so it
  // keeps to white whichever theme the app is in.
  const plateInk = dark ? "rgba(255,255,255,0.6)" : colors.textMuted;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={onLayout}
      // A strip that fits sits centred under the photo; a longer one scrolls.
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: THUMB_STRIP_INSET,
        gap: THUMB_GAP,
      }}
      testID={`${testIDPrefix}-thumbs`}
    >
      {photos.map((photo, i) => {
        const isCurrent = i === current;
        const broken = photo.uri !== null && failed.includes(photo.uri);
        return (
          <Pressable
            key={photo.key}
            testID={`${testIDPrefix}-thumb-${i}`}
            accessible={false}
            accessibilityState={{ selected: isCurrent }}
            onPress={() => onSelect(i)}
            className={
              dark
                ? "overflow-hidden rounded-sm border-2"
                : `overflow-hidden rounded-sm border-2 ${isCurrent ? "border-accent" : "border-transparent"}`
            }
            // A plain object, never a `({ pressed }) =>` function: beside a
            // className, a phone drops a style function and the thumb draws
            // zero wide (#212).
            style={{
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              // The ring says which photo; the others step back so it reads at
              // a glance, and still read as photos rather than disabled ones.
              opacity: isCurrent ? 1 : 0.6,
              ...(dark ? { borderColor: isCurrent ? "#FFFFFF" : "transparent" } : null),
            }}
          >
            {photo.uri && !broken ? (
              <Image
                source={{ uri: photo.uri }}
                resizeMode="cover"
                onError={() => {
                  const uri = photo.uri;
                  if (uri) setFailed((list) => (list.includes(uri) ? list : [...list, uri]));
                }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <View
                className={dark ? "flex-1 items-center justify-center" : "flex-1 items-center justify-center bg-surface"}
                style={dark ? { backgroundColor: "rgba(255,255,255,0.12)" } : undefined}
              >
                {broken ? (
                  <ImageOff size={16} color={plateInk} strokeWidth={2} />
                ) : (
                  <ImageIcon size={16} color={plateInk} strokeWidth={2} />
                )}
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
