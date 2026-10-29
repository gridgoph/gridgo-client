import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { diagnosticHeadline, diagnosticLog } from "@/lib/errorDiagnostic";
import { replaceListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { HOME_TAB } from "@/lib/receipt";

export const ORDER_FLOW_CRASH_TITLE = "Something went wrong";
export const ORDER_FLOW_CRASH_BODY =
  "GRIDGO hit a problem on this step. What is already in your order is still saved. Try again, or go back to Home.";

type Props = ErrorBoundaryProps & {
  /**
   * Runs just before the step is drawn again. The listing drops the cached
   * sheet that threw and starts reading it afresh, so the step opens on its
   * own loading state — then the fresh sheet, or its own error with a way
   * back — rather than throwing on the same answer again.
   */
  beforeRetry?: () => void;
};

/**
 * What an order-flow screen shows when it throws while drawing.
 *
 * Each `app/request/*` route exports this as its Expo Router `ErrorBoundary`,
 * so a render error on one step replaces that step with this screen instead
 * of closing the app — a phone build has no other boundary. It is
 * containment, not a fix, and only for errors React sees: a native crash
 * still closes the app. Under the copy, the error's type and the app
 * components it failed in (`diagnosticHeadline`), so a screenshot says where
 * it broke without carrying the message, which can hold a token. The
 * redacted message, stack and component stack go to `console.error`, which
 * lands in the Android device log. (React Native also reports every caught
 * render error to its own ExceptionsManager, unredacted; that log is the
 * platform's, not ours.)
 *
 * Nothing here touches the basket. It lives on GRIDGO and only its id is on
 * the phone, so "Go back to Home" leaves it exactly as it was. The listing's
 * unfinished answers live outside this subtree too (`store/listingDraft.ts`).
 */
export function OrderFlowErrorBoundary({ error, retry, beforeRetry }: Props) {
  const router = useRouter();
  const [headline, setHeadline] = useState(() => diagnosticHeadline(error));

  useEffect(() => {
    console.error(`[order-flow] a step crashed while drawing: ${diagnosticLog(error)}`);
    // React Native puts the component stack on the error in the commit after
    // this first draws; read the headline again once it is there.
    const reread = setTimeout(() => setHeadline(diagnosticHeadline(error)), 0);
    return () => clearTimeout(reread);
  }, [error]);

  return (
    <Screen edges={["bottom"]}>
      {/* Scrolls, so the two ways out stay reachable at any text size. */}
      <ScrollView
        testID="order-flow-crash"
        className="gg-screen"
        contentContainerClassName="gg-page gap-4 pb-8 pt-6"
      >
        <View className="gg-card gap-3" accessible accessibilityRole="alert">
          <StatusChip tone="error" label={ORDER_FLOW_CRASH_TITLE} icon="circle-x" />
          <Text className="text-body text-text-primary">{ORDER_FLOW_CRASH_BODY}</Text>
          <Text className="text-caption text-text-muted" selectable>
            {headline}
          </Text>
        </View>
        <PrimaryButton
          label="Try again"
          onPress={() => {
            beforeRetry?.();
            void retry();
          }}
        />
        <SecondaryButton label="Go back to Home" onPress={() => router.dismissTo(HOME_TAB)} />
      </ScrollView>
    </Screen>
  );
}

/**
 * The listing step's boundary: the cached sheet it was drawing is dropped and
 * read again as the step is drawn, so a bad answer the server has since
 * corrected does not throw again on every Try again. A failed read is the
 * sheet's own "This listing did not open", not this screen.
 */
export function ListingErrorBoundary(props: ErrorBoundaryProps) {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const reread = itemId ? () => void replaceListing(itemId).catch(() => undefined) : undefined;
  return <OrderFlowErrorBoundary {...props} beforeRetry={reread} />;
}

/**
 * The Artwork step's boundary: the listing its line was drawn from is dropped
 * and read again, then put on the line. Until it lands the step waits on its
 * own loading state (`listingTrusted`), so Try again no longer redraws the
 * same answer — the reported loop on a line still holding the add's stub.
 */
export function ArtworkErrorBoundary(props: ErrorBoundaryProps) {
  const { lineId } = useLocalSearchParams<{ lineId?: string }>();
  const reread = () => {
    const itemId = useCart.getState().cart?.lines.find((line) => line.id === lineId)?.catalogItemId;
    if (!itemId) return;
    void replaceListing(itemId)
      .then((listing) => useCart.getState().putListing(listing))
      .catch(() => undefined);
  };
  return <OrderFlowErrorBoundary {...props} beforeRetry={reread} />;
}
