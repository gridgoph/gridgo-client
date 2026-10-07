import { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Bike, ImagePlus, Lock, Send, X } from "lucide-react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { TextField } from "@/components/form/TextField";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { addChatPhotos } from "@/lib/chatImages";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
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
  const listRef = useRef<ScrollView>(null);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
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
        if (grew && followingEnd.current) {
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: previous.length > 0 }));
        }
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
  }, [orderId]);

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

  const trackEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    followingEnd.current = isAtChatEnd({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
  }, []);

  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

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
      followingEnd.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setSendError(deliverySendError(err));
      // A refusal can mean the delivery just finished; re-read to say so.
      void load();
    } finally {
      setSending(false);
    }
  }, [draft, load, orderId, pending, sending]);

  const canSend = !sending && Boolean(draft.trim() || pending.length);
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
                  <View
                    key={message.id}
                    className={message.mine ? "max-w-[80%] items-end self-end" : "max-w-[80%] items-start self-start"}
                  >
                    <View
                      className="rounded-card px-3 py-2"
                      style={{
                        backgroundColor: message.mine ? colors.accent : colors.surface,
                        borderWidth: message.mine ? 0 : 1,
                        borderColor: colors.outline,
                      }}
                    >
                      {message.body ? (
                        <Text
                          className="text-body"
                          style={{ color: message.mine ? colors.accentOn : colors.textPrimary }}
                        >
                          {message.body}
                        </Text>
                      ) : null}
                      {message.attachments?.map((attachment) => (
                        <View key={attachment.fileId} className={message.body ? "mt-2" : undefined}>
                          <ChatPhoto attachment={attachment} />
                        </View>
                      ))}
                    </View>
                    <Text className="mt-1 text-caption text-text-muted">
                      {senderLabel(message)} · {timeOf(message.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {sendError ? (
            <Text className="text-caption text-error" accessibilityLiveRegion="polite">
              {sendError}
            </Text>
          ) : null}

          {open && pending.length ? (
            <View className="flex-row items-center gap-2">
              <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1}>
                {pending.length === 1 ? pending[0].name : `${pending.length} photos ready to send`}
              </Text>
              <Pressable
                onPress={() => setPending([])}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel={pending.length === 1 ? "Remove the photo" : "Remove the photos"}
                className="gg-touch h-11 w-11 items-center justify-center"
              >
                <X size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
              </Pressable>
            </View>
          ) : null}

          {open ? (
            <View className="flex-row items-end gap-2">
              <Pressable
                onPress={() => void pickPhoto()}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                accessibilityState={{ disabled: sending }}
                className="gg-touch h-12 w-12 items-center justify-center rounded-field"
                style={{ borderWidth: 1, borderColor: colors.outline, opacity: sending ? 0.38 : 1 }}
              >
                <ImagePlus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              </Pressable>
              <View className="min-w-0 flex-1">
                <TextField
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Write to your rider"
                  accessibilityLabel="Message your rider"
                  multiline
                  maxLength={DELIVERY_MESSAGE_MAX}
                  multilineMinHeight={48}
                  editable={!sending}
                  returnKeyType="send"
                  onSubmitEditing={() => void send()}
                />
              </View>
              <Pressable
                onPress={() => void send()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend }}
                className="gg-touch h-12 w-12 items-center justify-center rounded-field bg-accent"
                style={{ opacity: canSend ? 1 : 0.38 }}
              >
                <Send size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
              </Pressable>
            </View>
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
