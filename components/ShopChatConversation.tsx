import { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { AlertTriangle, EyeOff, FileText, Flag, Info, Lock, Paperclip, Store } from "lucide-react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { OrderChatBubble } from "@/components/OrderChatBubble";
import { OrderChatComposer } from "@/components/OrderChatComposer";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { useChatTranscriptEnd } from "@/hooks/useChatTranscriptEnd";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { getDocumentPickerNative } from "@/lib/nativeModules";
import {
  SHOP_CHAT_ATTACHMENT_PURPOSE,
  SHOP_CHAT_ATTACHMENT_TYPES,
  SHOP_CHAT_CHANGE_HELP,
  SHOP_CHAT_POLL_MS,
  SHOP_CHAT_REPORT_REASONS,
  SHOP_MESSAGE_MAX,
  addShopChatFiles,
  fileSizeLabel,
  firstUnreadId,
  hasHiddenContact,
  hiddenContactNote,
  isShopChatPdf,
  mergeMessages,
  messageCaption,
  shopChatNotice,
  shopChatSendError,
  shopChatUnavailable,
  unreadShopChatNoticeIds,
  type ShopChat,
  type ShopChatAttachment,
  type ShopChatMessage,
  type ShopChatUnavailable,
} from "@/lib/shopChat";
import { useNotifications } from "@/store/notifications";
import { useShopChatReports } from "@/store/shopChatReports";

/** A full first read stops here; a thread this long is read a page at a time on polls. */
const MAX_PAGES = 20;

/**
 * The client's side of one order's masked conversation with its print shop
 * (gridgo-client#246). The rider chat's layout and plumbing — bubbles,
 * composer, polling while in front, the live stream — with what this one adds:
 * the three fixed labels, the server's contact masking said out loud, PDF as
 * well as photos, a report on every message from someone else, and the
 * reminder that chat never changes the order.
 *
 * Reads page forward from the last message shown, so a poll costs one small
 * request and reading marks only what was returned.
 */
export function ShopChatConversation({ orderId, onOpenOrder }: { orderId: string; onOpenOrder: () => void }) {
  const colors = useThemeColors();
  const { listRef, trackEnd, keepEndInView, followNewMessages, jumpToEnd } = useChatTranscriptEnd();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const sequence = useRef(0);
  const lastId = useRef<string | null>(null);
  const [chat, setChat] = useState<ShopChat | null>(null);
  const [messages, setMessages] = useState<ShopChatMessage[]>([]);
  const [newFromId, setNewFromId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<ShopChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<api.UploadAsset[]>([]);

  const markNoticesRead = useCallback(() => {
    const { items, readIds, markManyRead } = useNotifications.getState();
    const ids = unreadShopChatNoticeIds(items, readIds, orderId);
    if (ids.length) void markManyRead(ids);
  }, [orderId]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    const first = lastId.current == null;
    try {
      let after = lastId.current;
      let latest: ShopChat | null = null;
      let unreadBefore: number | null = null;
      const page: ShopChatMessage[] = [];
      for (let count = 0; count < MAX_PAGES; count++) {
        const result = await api.getShopChat(orderId, { after });
        if (current !== sequence.current) return;
        latest = result.chat;
        unreadBefore ??= result.chat.unread;
        page.push(...result.messages);
        if (result.messages.length) after = result.messages[result.messages.length - 1].id;
        if (!result.nextAfter) break;
      }
      if (!latest) return;
      setChat(latest);
      setUnavailable(null);
      setLoadError(null);
      lastId.current = after;
      if (page.length) {
        setMessages((previous) => {
          const next = mergeMessages(previous, page);
          if (next.length !== previous.length) followNewMessages(previous.length > 0);
          return next;
        });
        // Said once, on opening: anything arriving while it is in front is read as it lands.
        if (first) setNewFromId(firstUnreadId(page, unreadBefore ?? 0));
        markNoticesRead();
      } else if (first) {
        markNoticesRead();
      }
    } catch (err) {
      if (current !== sequence.current) return;
      const code = (err as { body?: { error?: unknown } } | null)?.body?.error;
      if (code === "invalid_chat_cursor") {
        // The last message shown is no longer this client's to page from: read it all again.
        lastId.current = null;
        setMessages([]);
        return;
      }
      const closed = shopChatUnavailable(err);
      if (closed) {
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [followNewMessages, markNoticesRead, orderId]);

  // A message lands as an `orders` invalidate on the notification stream.
  useLiveRefresh(["notifications", "orders"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), SHOP_CHAT_POLL_MS);
      return () => {
        sequence.current++;
        clearInterval(timer);
      };
    }, [load]),
  );

  const pickFiles = useCallback(async () => {
    const picker = getDocumentPickerNative();
    if (!picker) {
      setSendError("This build cannot attach a file. Install the latest GRIDGO app to send one.");
      return;
    }
    const picked = await picker.getDocumentAsync({
      type: [...SHOP_CHAT_ATTACHMENT_TYPES],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const added = addShopChatFiles(pending, picked.assets, (asset) => asset);
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
        const stored = await api.uploadFile(asset, SHOP_CHAT_ATTACHMENT_PURPOSE).done;
        fileIds.push(stored.fileId);
      }
      const posted = await api.sendShopChatMessage(orderId, body, fileIds);
      setDraft("");
      setPending([]);
      setChat(posted.chat);
      const message = posted.message;
      if (message) {
        setMessages((current) => mergeMessages(current, [message]));
        lastId.current = message.id;
      }
      jumpToEnd();
    } catch (err) {
      setSendError(shopChatSendError(err));
      // A refusal can mean the window just closed; re-read to say so.
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
          <EmptyState title={unavailable.title} body={unavailable.body} actionLabel="Back to the order" onAction={onOpenOrder} />
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
              <Store size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">Print shop</Text>
              <Text className="text-caption text-text-muted">
                {!chat ? " " : open ? "Through GRIDGO" : chat.status === "read_only" ? "Closed" : "Not accepted yet"}
              </Text>
            </View>
          </View>

          {chat ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ backgroundColor: colors.surfaceVariant }}
              accessible
              accessibilityLabel={shopChatNotice(chat)}
            >
              <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-secondary">{shopChatNotice(chat)}</Text>
            </View>
          ) : null}

          {chat?.warning ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ borderWidth: 1, borderColor: colors.warning }}
              accessible
              accessibilityRole="alert"
              accessibilityLabel={chat.warning}
            >
              <AlertTriangle size={16} color={colors.warning} strokeWidth={2} style={{ marginTop: 2 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-primary">{chat.warning}</Text>
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
              testID="shop-chat-transcript"
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
                  title={chat?.status === "unavailable" ? "The print shop has not accepted yet" : "No messages yet"}
                  body={
                    chat?.status === "unavailable"
                      ? "You can message the print shop once it accepts this order."
                      : open
                        ? "Ask the print shop about your job: a colour, a finish, a file it needs. Names and contact details stay hidden on both sides."
                        : "Nobody wrote while this conversation was open."
                  }
                />
              ) : (
                messages.map((message) => (
                  <View key={message.id} className="gap-3">
                    {message.id === newFromId ? <NewMessagesLine /> : null}
                    <OrderChatBubble
                      mine={message.mine}
                      body={message.body}
                      attachments={message.attachments.map((attachment) => (
                        <ShopChatFile key={attachment.fileId} attachment={attachment} mine={message.mine} />
                      ))}
                      caption={messageCaption(message)}
                    >
                      {hasHiddenContact(message.body) ? (
                        <View className="mt-1 flex-row items-center gap-1">
                          <EyeOff size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
                          <Text className="text-caption text-text-muted">{hiddenContactNote(message)}</Text>
                        </View>
                      ) : null}
                      {message.mine ? null : <ReportControl orderId={orderId} messageId={message.id} />}
                    </OrderChatBubble>
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

          {open ? (
            <>
              <View className="flex-row items-start gap-2" accessible accessibilityLabel={`${chat.reminder} ${SHOP_CHAT_CHANGE_HELP}`}>
                <Info size={14} color={colors.info} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
                <Text className="flex-1 text-caption text-text-secondary">
                  {chat.reminder} {SHOP_CHAT_CHANGE_HELP}
                </Text>
              </View>
              <OrderChatComposer
                draft={draft}
                onChangeDraft={setDraft}
                onSend={() => void send()}
                onAttach={() => void pickFiles()}
                sending={sending}
                maxLength={SHOP_MESSAGE_MAX}
                placeholder="Write to the print shop"
                fieldLabel="Message the print shop"
                attachIcon={Paperclip}
                attachLabel="Attach photos or a PDF"
                pendingSummary={
                  pending.length === 0
                    ? null
                    : pending.length === 1
                      ? pending[0].name
                      : `${pending.length} files ready to send`
                }
                clearPendingLabel={pending.length === 1 ? "Remove the file" : "Remove the files"}
                onClearPending={() => setPending([])}
                pendingNote={
                  <WhyWeAsk>
                    The print shop and GRIDGO see these files. Location and device details are removed from photos
                    before they are sent.
                  </WhyWeAsk>
                }
              />
            </>
          ) : chat ? (
            <SecondaryButton label="Back to the order" onPress={onOpenOrder} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function NewMessagesLine() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-2" accessible accessibilityRole="text" accessibilityLabel="New messages">
      <View className="h-px flex-1" style={{ backgroundColor: colors.outline }} />
      <Text className="text-caption font-medium text-text-secondary">New messages</Text>
      <View className="h-px flex-1" style={{ backgroundColor: colors.outline }} />
    </View>
  );
}

/** A photo opens inline; a PDF is a row that opens it through a fresh signed link. */
function ShopChatFile({ attachment, mine }: { attachment: ShopChatAttachment; mine: boolean }) {
  const colors = useThemeColors();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!isShopChatPdf(attachment)) return <ChatPhoto attachment={attachment} />;

  const ink = mine ? colors.accentOn : colors.textPrimary;
  const size = fileSizeLabel(attachment.size);
  const openFile = async () => {
    if (opening) return;
    setOpening(true);
    setFailed(false);
    try {
      const link = await api.getFileDownloadUrl(attachment.fileId);
      await WebBrowser.openBrowserAsync(link.url);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  };
  return (
    <Pressable
      onPress={() => void openFile()}
      accessibilityRole="button"
      accessibilityLabel={`Open PDF${size ? `, ${size}` : ""}`}
      className="gg-touch min-h-11 flex-row items-center gap-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <FileText size={20} color={ink} strokeWidth={2} aria-hidden />
      <View className="min-w-0">
        <Text className="text-body font-medium" style={{ color: ink }}>
          {opening ? "Opening…" : "PDF document"}
        </Text>
        <Text className="text-caption" style={{ color: mine ? colors.accentOn : colors.textMuted }}>
          {failed ? "Could not open. Tap to try again." : (size ?? "Tap to open")}
        </Text>
      </View>
    </Pressable>
  );
}

/** "Report" under a message from the shop or GRIDGO, then the API's reasons in place. */
function ReportControl({ orderId, messageId }: { orderId: string; messageId: string }) {
  const colors = useThemeColors();
  const choosing = useShopChatReports((state) => state.choosingId === messageId);
  const sending = useShopChatReports((state) => state.sendingId === messageId);
  const reported = useShopChatReports((state) => state.reportedIds.includes(messageId));
  const error = useShopChatReports((state) => (state.error?.messageId === messageId ? state.error.message : null));
  const choose = useShopChatReports((state) => state.choose);
  const report = useShopChatReports((state) => state.report);

  if (reported) {
    return (
      <View className="mt-1 flex-row items-center gap-1" accessible accessibilityLabel="Reported to GRIDGO">
        <Flag size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
        <Text className="text-caption text-text-muted">Reported to GRIDGO</Text>
      </View>
    );
  }

  if (!choosing) {
    return (
      <Pressable
        onPress={() => choose(messageId)}
        accessibilityRole="button"
        accessibilityLabel="Report this message"
        hitSlop={8}
        className="gg-touch min-h-11 flex-row items-center gap-1"
      >
        <Flag size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
        <Text className="text-caption text-text-muted">Report</Text>
      </Pressable>
    );
  }

  return (
    <View className="mt-2 w-full gap-1 rounded-card p-3" style={{ borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface }}>
      <Text className="text-body font-medium text-text-primary">Why are you reporting this?</Text>
      <Text className="text-caption text-text-muted">Only GRIDGO sees your report.</Text>
      {SHOP_CHAT_REPORT_REASONS.map((reason) => (
        <Pressable
          key={reason.code}
          onPress={() => void report(orderId, messageId, reason.code)}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={reason.label}
          accessibilityHint={reason.detail}
          accessibilityState={{ disabled: sending }}
          className="gg-touch min-h-11 justify-center py-1"
          style={({ pressed }) => ({ opacity: sending ? 0.38 : pressed ? 0.7 : 1 })}
        >
          <Text className="text-body text-text-primary">{reason.label}</Text>
          <Text className="text-caption text-text-muted">{reason.detail}</Text>
        </Pressable>
      ))}
      {error ? (
        <Text className="text-caption text-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => choose(null)}
        accessibilityRole="button"
        accessibilityLabel="Cancel the report"
        className="gg-touch min-h-11 justify-center"
      >
        <Text className="text-body font-medium text-text-secondary">Cancel</Text>
      </Pressable>
    </View>
  );
}
