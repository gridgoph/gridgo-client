import { View } from "react-native";

/**
 * Placeholder shapes shown while a screen's real content is on its way.
 *
 * Deliberately still. A pulse fast enough to sit inside the 160–240ms motion
 * budget would strobe, and a slower one is motion carrying no meaning — so the
 * skeleton holds the layout and a line of copy says what is loading. Nothing
 * here is announced to a screen reader; the surrounding screen owns that.
 */

type BlockProps = {
  /** Tailwind width utility — skeleton lines are ragged, not uniform. */
  width: string;
  /** Height utility. Defaults to a body line. */
  height?: string;
};

export function SkeletonLine({ width, height = "h-4" }: BlockProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`${width} ${height} rounded-sm bg-surface-variant`}
    />
  );
}

/** A card-shaped placeholder: a heading line, a body line, a short meta line. */
export function SkeletonCard() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="gg-card gap-3"
    >
      <SkeletonLine width="w-2/3" height="h-5" />
      <SkeletonLine width="w-full" />
      <SkeletonLine width="w-1/3" height="h-3" />
    </View>
  );
}

/** `count` card placeholders with the list's own rhythm. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}
