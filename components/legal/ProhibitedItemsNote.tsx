import type { Href } from "expo-router";
import { Info } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { ARTWORK_RIGHTS_ID, documentFor, legalDocumentHref } from "@/lib/legal";
import { useLegalLibrary } from "@/store/legalLibrary";

export const PROHIBITED_ITEMS_NOTE =
  "Some things GRIDGO cannot print: IDs and official documents, counterfeit goods or someone else's brand without permission, hate or adult content, and products for adults only, such as alcohol or vapes.";

/** The one-line reminder, for where the link to the full list sits beside it. */
export const PROHIBITED_ITEMS_SHORT =
  "Some things GRIDGO cannot print, such as IDs, counterfeits and adult content.";

/**
 * The prohibited-items reminder, said where the artwork goes in
 * (gridgo-api#276). Calm and informational, never a gate: Operations checks
 * every file, and this only tells the client before they upload.
 *
 * The list lives in Acceptable Use and Artwork Rights, the same document the
 * rights box opens; without it the reminder still stands, unlinked.
 *
 * `compact` says it in one line where the full list is a tap away, so the
 * upload it sits over leads the screen. Without the policy to link to, the
 * whole list is said, because there is nowhere else to read it.
 */
export function ProhibitedItemsNote({
  onOpen,
  compact = false,
}: {
  onOpen: (href: Href) => void;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const policy = useLegalLibrary((state) => documentFor(state.documents, ARTWORK_RIGHTS_ID));

  useEffect(() => {
    void useLegalLibrary.getState().load();
  }, []);

  return (
    <View className="flex-row items-start gap-2">
      <Info size={14} color={colors.textMuted} style={{ marginTop: 2 }} aria-hidden />
      <View className="min-w-0 flex-1 items-start gap-1">
        <Text className="text-caption text-text-muted">
          {compact && policy ? PROHIBITED_ITEMS_SHORT : PROHIBITED_ITEMS_NOTE}
        </Text>
        {policy ? (
          <Pressable
            onPress={() => onOpen(legalDocumentHref(policy))}
            accessibilityRole="link"
            accessibilityLabel={`What GRIDGO cannot print: read the ${policy.title}`}
            hitSlop={8}
            className="gg-touch justify-center"
          >
            <Text className="text-caption font-medium text-text-primary underline">
              See what GRIDGO cannot print
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
