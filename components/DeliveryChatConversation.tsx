import { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { ScrollView, Text, View } from "react-native";
import { Bike, ImagePlus, Lock } from "lucide-react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { OrderChatBubble } from "@/components/OrderChatBubble";
import { OrderChatComposer } from "@/components/OrderChatComposer";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useChatTranscriptEnd } from "@/hooks/useChatTranscriptEnd";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { addChatPhotos } from "@/lib/chatImages";
import {
  DELIVERY_CHAT_IMAGE_PURPOSE,
  DELIVERY_CHAT_POLL_MS,
  DELIVERY_MESSAGE_MAX,
  deliveryChatNotice,
  deliveryChatUnavailable,
  deliverySendError,
  senderLabel,
  type DeliveryChatMessage,
  type DeliveryChatSummary,
  type DeliveryChatUnavailable,
} from "@/lib/deliveryChat";
import { getDocumentPickerNative } from "@/lib/nativeModules";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";

const EMPTY_TITLE = "No messages yet";
const EMPTY_BODY =
  "Tell your rider anything that helps them find you: a gate code, a landmark, a photo of your gate, or who will receive it.";

/**
 * The client's side of one delivery's conversation with its rider.
 *
 * Text and photos, and no call button: neither side ever sees the other's number.
 * New messages arrive by polling while the screen is in front — the rider's
 * first message also lands as a notification, but a burst rides on that one
 * notice, so the notice alone cannot keep a transcript current.
 */
export function DeliveryChatConversation({
  orderId,
  onOpenOrder,
}: {
  orderId: string;
  onOpenOrder: () => void;
}) {
  const colors = useThemeColors();
  const { listRef, trackEnd, keepEndInView, followNewMessages, jumpToEnd } = useChatTranscriptEnd();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const sequence = useRef(0);
  const [chat, setChat] = useState<DeliveryChatSummary | null>(null);
  const [messages, setMessages] = useState<DeliveryChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<DeliveryChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<api.UploadAsset[]>([]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.getDeliveryChat(orderId);
      if (current !== sequence.current) return;
      setChat(result.chat);
      setUnavailable(null);
      setLoadError(null);
      setMessages((previous) => {
        const grew = result.messages.length !== previous.length;
        if (grew) followNewMessages(previous.length > 0);
        return grew || result.messages.some((row, index) => row.id !== previous[index]?.id)
          ? result.messages
          : previous;
      });
    } catch (err) {
      if (current !== sequence.current) return;
      const closed = deliveryChatUnavailable(err);
      if (closed) {
        // The server has removed it, or it never opened: drop what was shown.
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [followNewMessages, orderId]);

  useLiveRefresh(["notifications", "orders"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), DELIVERY_CHAT_POLL_MS);
      return () => {
        sequence.current++;
        clearInterval(timer);
      };
    }, [load]),
  );

  const pickPhoto = useCallback(async () => {
    const picker = getDocumentPickerNative();
    if (!picker) {
      setSendError("This build cannot pick a photo. Install the latest GRIDGO app to send one.");
      return;
    }
    const picked = await picker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const added = addChatPhotos(pending, picked.assets, (asset) => asset);
    if (!added.ok) {
      setSendError(added.error);
      return;
    }
    setSendError(null);
    setPending(added.pending);
  }, [pending]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fileIds: string[] = [];
      for (const asset of pending) {
        const stored = await api.uploadFile(asset, DELIVERY_CHAT_IMAGE_PURPOSE).done;
        fileIds.push(stored.fileId);
      }
      const posted = fileIds.length
        ? await api.sendDeliveryMessage(orderId, body, { attachmentFileIds: fileIds })
        : await api.sendDeliveryMessage(orderId, body);
      setDraft("");
      setPending([]);
      setChat(posted.chat);
      setMessages((current) =>
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message],
      );
      jumpToEnd();
    } catch (err) {
      setSendError(deliverySendError(err));
      // A refusal can mean the delivery just finished; re-read to say so.
      void load();
    } finally {
      setSending(false);
    }
  }, [draft, jumpToEnd, load, orderId, pending, sending]);

  const open = chat?.status === "open";

  if (unavailable) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page pt-6">
          <EmptyState
            title={unavailable.title}
            body={unavailable.body}
            actionLabel="Back to the order"
            onAction={onOpenOrder}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <View className="gg-page flex-1 gap-3 pb-3 pt-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-pill"
              style={{ backgroundColor: colors.surfaceVariant }}
            >
              <Bike size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">Your rider</Text>
              <Text className="text-caption text-text-muted">
                {open ? "On this delivery now" : chat ? "Delivered" : " "}
              </Text>
            </View>
          </View>

          {chat ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ backgroundColor: colors.surfaceVariant }}
              accessible
              accessibilityLabel={deliveryChatNotice(chat)}
            >
              <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-secondary">{deliveryChatNotice(chat)}</Text>
            </View>
          ) : null}

          {loadError && !chat ? (
            <ErrorState
              label="Could not load messages"
              body={loadError}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : (
            <ScrollView
              ref={listRef}
              testID="delivery-chat-transcript"
              className="flex-1"
              contentContainerClassName="grow justify-end gap-3 pb-2"
              keyboardShouldPersistTaps="handled"
              onScroll={trackEnd}
              scrollEventThrottle={32}
              onLayout={keepEndInView}
            >
              {loading && !chat ? (
                <View className="gap-3">
                  <SkeletonBlock className="h-10 w-2/3 rounded-card" />
                  <SkeletonBlock className="h-10 w-1/2 self-end rounded-card" />
                </View>
              ) : messages.length === 0 ? (
                <EmptyState
                  title={EMPTY_TITLE}
                  body={open ? EMPTY_BODY : "Nobody wrote during this delivery."}
                />
              ) : (
                messages.map((message) => (
                  <OrderChatBubble
                    key={message.id}
                    mine={message.mine}
                    body={message.body}
                    attachments={message.attachments?.map((attachment) => (
                      <ChatPhoto key={attachment.fileId} attachment={attachment} />
                    ))}
                    caption={`${senderLabel(message)} · ${timeOf(message.createdAt)}`}
                  />
                ))
              )}
            </ScrollView>
          )}

          {sendError ? (
            <Text className="text-caption text-error" accessibilityLiveRegion="polite">
              {sendError}
            </Text>
          ) : null}

          {open ? (
            <OrderChatComposer
              draft={draft}
              onChangeDraft={setDraft}
              onSend={() => void send()}
              onAttach={() => void pickPhoto()}
              sending={sending}
              maxLength={DELIVERY_MESSAGE_MAX}
              placeholder="Write to your rider"
              fieldLabel="Message your rider"
              attachIcon={ImagePlus}
              attachLabel="Add photos"
              pendingSummary={
                pending.length === 0
                  ? null
                  : pending.length === 1
                    ? pending[0].name
                    : `${pending.length} photos ready to send`
              }
              clearPendingLabel={pending.length === 1 ? "Remove the photo" : "Remove the photos"}
              onClearPending={() => setPending([])}
              pendingNote={
                <WhyWeAsk>Your rider and GRIDGO Operations see these photos, to help with this delivery.</WhyWeAsk>
              }
            />
          ) : chat ? (
            <SecondaryButton label="Back to the order" onPress={onOpenOrder} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function timeOf(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}
