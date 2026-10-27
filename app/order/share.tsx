import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import type Svg from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ShareStoryImage } from "@/components/ShareStoryImage";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  LINK_COPIED,
  LINK_COPIED_ON_SHARE,
  MAYBE_LATER_LABEL,
  SEND_TO_FRIEND_LABEL,
  SHARE_CARD_BODY,
  SHARE_CARD_BODY_NO_LINK,
  SHARE_CARD_TITLE,
  SHARE_DONE_LABEL,
  SHARE_FAILED,
  SHARE_FAILED_COPIED,
  SHARE_LABEL,
  SHARE_LOAD_FAILED,
  SHARE_TEXT_ONLY,
  STORY_HEIGHT,
  STORY_WIDTH,
  isSharePresentation,
  recordsCard,
  shareText,
  type SharePresentation,
} from "@/lib/orderShare";
import { captureStory, shareLink, sharesPictureWithoutText, shareStory, type ShareOutcome } from "@/lib/shareStory";
import { useOrderShare, type ShareNotice } from "@/store/orderShare";

/** Asks GRIDGO to get the invite ready; the card is drawn from its answer only. */
async function prepareCard(orderId: string, liveRef: { current: boolean }) {
  const prepared = await useOrderShare.getState().prepare(orderId);
  if (!liveRef.current) return;
  useOrderShare.getState().setSheet(prepared ? { prepared: true } : { prepareFailed: true });
}

/** Room the title, the buttons and the margins need beside the picture. */
const CHROME_HEIGHT = 420;
const PREVIEW_MIN_WIDTH = 168;

function noticeFor(outcome: ShareOutcome): ShareNotice | null {
  switch (outcome.kind) {
    case "shared":
    case "opened":
      return outcome.linkCopied ? { tone: "ok", text: LINK_COPIED } : null;
    case "saved":
      return { tone: "ok", text: outcome.linkCopied ? `Story picture saved. ${LINK_COPIED}` : "Story picture saved." };
    case "text_only":
      return { tone: "ok", text: SHARE_TEXT_ONLY };
    case "failed":
      return { tone: "error", text: outcome.linkCopied ? SHARE_FAILED_COPIED : SHARE_FAILED };
    default:
      return null;
  }
}

/**
 * Whether the client is known to have sent it somewhere. Android's chooser
 * answers the same for a post and for Back, so an `opened` sheet leaves the
 * card as it was: closing it for good on a guess would spend the one repeat.
 */
function sentForSure(outcome: ShareOutcome): boolean {
  return outcome.kind === "shared" || outcome.kind === "saved" || (outcome.kind === "text_only" && outcome.confirmed);
}

/**
 * "Share your GRIDGO moment" (gridgo-client#341): the story picture, Share,
 * Send to a friend, and a way out that is always there.
 *
 * Three ways in. After a sent survey (`after_survey`) and once more from the
 * order (`order_repeat`) it is GRIDGO's card, and its showing, putting off
 * and closing are recorded. From a delivered order's own Share button
 * (`manual`) it is just the share, and nothing about the card changes.
 *
 * Every way out closes it: the cross, Maybe later, the back gesture. Leaving
 * an automatic card without choosing counts as Maybe later, so the one repeat
 * still comes; a share known to have gone out closes the card for good.
 * Nothing here is a reward, and nothing waits on GRIDGO to let the client go.
 *
 * The picture is drawn, and Share offered, only once this opening's
 * `prepare` has answered: before that a cached read may not carry the invite
 * code yet, and a story without the client's invite is not theirs to post.
 */
export default function OrderShareScreen() {
  const params = useLocalSearchParams<{ orderId: string; presentation?: string }>();
  const orderId = params.orderId ?? "";
  const presentation: SharePresentation = isSharePresentation(params.presentation) ? params.presentation : "manual";
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const share = useOrderShare((state) => state.shares[orderId]);
  const error = useOrderShare((state) => state.errors[orderId] ?? null);

  const svgRef = useRef<Svg>(null);
  /** The card's `shown` went to GRIDGO; leaving after that is an answer to it. */
  const shownRef = useRef(false);
  /** An answer (Maybe later, or a share that closed it) has gone already. */
  const settledRef = useRef(false);
  const { prepared, prepareFailed, busy, finished, notice } = useOrderShare((state) => state.sheet);
  /** This opening is still on screen: a late `prepare` answer for a closed card is ignored. */
  const liveRef = useRef(false);
  const setSheet = useOrderShare((state) => state.setSheet);

  const auto = recordsCard(presentation) ? presentation : null;

  // On screen: other moments wait. Off screen without an answer: Maybe later.
  useEffect(() => {
    const store = useOrderShare.getState();
    liveRef.current = true;
    store.setSheet(null);
    store.setPresenting({ orderId, presentation });
    void prepareCard(orderId, liveRef);
    return () => {
      liveRef.current = false;
      const current = useOrderShare.getState();
      if (current.presenting?.orderId === orderId) current.setPresenting(null);
      if (auto && shownRef.current && !settledRef.current) {
        settledRef.current = true;
        void current.recordCard(orderId, auto, "maybe_later");
      }
    };
  }, [orderId, presentation, auto]);

  const ready = prepared && Boolean(share?.available);
  useEffect(() => {
    if (!auto || !ready || shownRef.current) return;
    shownRef.current = true;
    void useOrderShare.getState().recordCard(orderId, auto, "shown");
  }, [auto, ready, orderId]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/order/${orderId}`);
  };

  const putOff = () => {
    if (auto && shownRef.current && !settledRef.current) {
      settledRef.current = true;
      void useOrderShare.getState().recordCard(orderId, auto, "maybe_later");
    }
    leave();
  };

  /** A share went out: the automatic card is answered for good. */
  const closeForGood = () => {
    setSheet({ finished: true });
    if (auto && shownRef.current && !settledRef.current) {
      settledRef.current = true;
      void useOrderShare.getState().recordCard(orderId, auto, "close");
    }
  };

  const run = async (action: "share" | "send_to_friend") => {
    if (!share || busy) return;
    setSheet({ busy: true, notice: null });
    let notice: ShareNotice | null = null;
    try {
      void useOrderShare.getState().tap(orderId, action);
      const outcome =
        action === "share"
          ? await shareStory({
              png: await captureStory(svgRef.current),
              text: shareText(share),
              link: share.inviteLink,
              fileName: `gridgo-story-${orderId}.png`,
            })
          : share.inviteLink
            ? await shareLink(share.inviteLink)
            : ({ kind: "failed", linkCopied: false } as const);
      notice = noticeFor(outcome);
      if (sentForSure(outcome)) closeForGood();
    } finally {
      setSheet({ busy: false, notice });
    }
  };

  const previewWidth = Math.max(
    PREVIEW_MIN_WIDTH,
    Math.min(width - 32, ((height - insets.top - insets.bottom - CHROME_HEIGHT) * STORY_WIDTH) / STORY_HEIGHT),
  );
  const previewHeight = (previewWidth * STORY_HEIGHT) / STORY_WIDTH;
  const androidCopies = Boolean(share?.inviteLink) && sharesPictureWithoutText();

  return (
    <Screen>
      <View className="flex-row items-center px-2">
        <Pressable
          onPress={finished || !auto ? leave : putOff}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <X size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-5 pb-6">
        <View className="gap-1">
          <Text className="text-h2 font-bold text-text-primary" accessibilityRole="header">
            {SHARE_CARD_TITLE}
          </Text>
          <Text className="text-body text-text-secondary">
            {share && !share.inviteLink ? SHARE_CARD_BODY_NO_LINK : SHARE_CARD_BODY}
          </Text>
        </View>

        <View className="items-center">
          {ready && share ? (
            <View className="overflow-hidden rounded-card border border-outline" testID="share-story">
              <ShareStoryImage ref={svgRef} share={share} width={previewWidth} />
            </View>
          ) : prepareFailed || (prepared && !share?.available) ? (
            <View className="w-full">
              <ErrorState
                label="Share card not ready"
                body={error ?? SHARE_LOAD_FAILED}
                onRetry={() => {
                  setSheet({ prepareFailed: false, prepared: false });
                  void prepareCard(orderId, liveRef);
                }}
              />
            </View>
          ) : (
            <View
              accessible
              accessibilityLabel="Getting your share card ready"
              testID="share-loading"
              style={{ width: previewWidth, height: previewHeight }}
            >
              <SkeletonBlock className="h-full w-full rounded-card" />
            </View>
          )}
        </View>

        <View className="gap-3">
          <PrimaryButton label={busy ? "Opening…" : SHARE_LABEL} onPress={() => void run("share")} disabled={!ready || busy} />
          {androidCopies ? <Text className="text-caption text-text-muted">{LINK_COPIED_ON_SHARE}</Text> : null}
          {share?.inviteLink ? (
            <SecondaryButton label={SEND_TO_FRIEND_LABEL} onPress={() => void run("send_to_friend")} disabled={!ready || busy} />
          ) : null}
          {notice ? (
            <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
              {notice.tone === "ok" ? <Check size={16} color={colors.success} strokeWidth={2.5} aria-hidden /> : null}
              <Text className={notice.tone === "ok" ? "flex-1 text-caption text-success" : "flex-1 text-caption text-error"}>
                {notice.text}
              </Text>
            </View>
          ) : null}
          {auto ? (
            <Pressable
              onPress={finished ? leave : putOff}
              accessibilityRole="button"
              className="gg-touch items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text className="text-button text-text-secondary">{finished ? SHARE_DONE_LABEL : MAYBE_LATER_LABEL}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
