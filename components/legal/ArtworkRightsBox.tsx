import type { Href } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { CheckboxRow } from "@/components/form/CheckboxRow";
import { ARTWORK_RIGHTS_ID, documentFor, legalDocumentHref } from "@/lib/legal";
import { useArtworkRights } from "@/store/artworkRights";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * "I have the right to print this artwork" — required, unticked, per order.
 *
 * Agreeing to the Terms at sign-up is not enough for this (`docs/LEGAL_API.md`):
 * every order carries its own statement, recorded against the version of
 * Acceptable Use and Artwork Rights the client could open from here. Drawn
 * where the artwork goes in and again at checkout, bound to the same scope,
 * so it is one box the client meets twice rather than two boxes.
 *
 * Navigation comes in as `onOpen`: the correction card that draws this box is
 * imported where the router must not be (`nativeModules.importIsolation`).
 */
export function ArtworkRightsBox({
  scope,
  onOpen,
  disabled = false,
}: {
  /** `cartRightsScope(cartId)` or `orderRightsScope(orderId)`. */
  scope: string;
  /** Opens the policy, as `router.push`. */
  onOpen: (href: Href) => void;
  disabled?: boolean;
}) {
  const agreed = useArtworkRights((state) => state.agreed[scope] === true);
  const policy = useLegalLibrary((state) => documentFor(state.documents, ARTWORK_RIGHTS_ID));

  useEffect(() => {
    void useLegalLibrary.getState().load();
  }, []);

  return (
    <View className="gap-1">
      <CheckboxRow
        checked={agreed}
        onChange={(next) => useArtworkRights.getState().setAgreed(scope, next)}
        disabled={disabled}
        label="I have the right to print this artwork"
        hint="It is mine, or its owner said I may print it, including any logos, photos and text in it. Required for every order."
      />
      {policy ? (
        <Pressable
          onPress={() => onOpen(legalDocumentHref(policy))}
          accessibilityRole="link"
          accessibilityLabel={`Read the ${policy.title}`}
          hitSlop={8}
          className="gg-touch justify-center self-start pl-9"
        >
          <Text className="text-caption font-medium text-text-primary underline">
            Read the {policy.title}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
