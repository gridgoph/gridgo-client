import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Send } from "lucide-react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

const EMPTY_TITLE = "No messages yet";
const EMPTY_BODY =
  "Ask about a job, a payout, or anything GRIDGO needs to settle. Someone on the desk will write back here.";

export function SupportChatConversation({
  peerName = "Operations",
  peerRole = "GRIDGO operations",
}: {
  peerName?: string;
  peerRole?: string;
}) {
  const colors = useThemeColors();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const listRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<api.SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const adopt = useCallback((next: api.SupportChatMessage[]) => {
    setMessages(next);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await api.getSupportChatMe();
      adopt(me.messages);
      if (me.thread) {
        const read = await api.markSupportChatRead();
        setUnreadCount(read.thread?.unreadCount ?? 0);
      } else {
        setUnreadCount(0);
      }
    } catch (err) {
      setError(userFacingError(err, "Could not open Operations. Check this phone’s connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [adopt, setUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        setMessages((current) => {
          if (current.some((row) => row.id === event.message.id)) return current;
          return [...current, event.message];
        });
        setUnreadCount(event.message.mine ? 0 : event.thread.unreadCount ?? 0);
        if (event.message.mine) return;
        void api.markSupportChatRead().then((result) => {
          setUnreadCount(result.thread?.unreadCount ?? 0);
        }).catch(() => {});
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      },
    });
    return () => stream.close();
  }, [setUnreadCount]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const posted = await api.sendSupportChatMessage(body);
      setDraft("");
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      setUnreadCount(0);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(userFacingError(err, "That did not reach Operations. Try sending it again."));
    } finally {
      setSending(false);
    }
  }, [draft, sending, setUnreadCount]);

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="gg-page flex-1 gap-3 pb-3 pt-4">
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">{peerName}</Text>
            <Text className="text-body text-text-secondary">{peerRole}</Text>
          </View>

          {error && !loading ? (
            <ErrorState
              label="Could not load chat"
              body={error}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : (
            <ScrollView
              ref={listRef}
              className="flex-1"
              contentContainerClassName="grow justify-end gap-3 pb-2"
              keyboardShouldPersistTaps="handled"
            >
              {!loading && messages.length === 0 ? (
                <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} />
              ) : (
                messages.map((message) => (
                  <View
                    key={message.id}
                    className={message.mine ? "items-end" : "items-start"}
                  >
                    <View
                      className="max-w-[85%] rounded-field px-3 py-2"
                      style={{
                        backgroundColor: message.mine ? colors.surfaceVariant : colors.surface,
                        borderWidth: 1,
                        borderColor: colors.outline,
                      }}
                    >
                      <Text className="text-body text-text-primary">{message.body}</Text>
                    </View>
                    <Text className="mt-1 text-caption text-text-muted">
                      {message.mine ? "You" : peerName}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <View className="flex-row items-end gap-2">
            <View className="min-w-0 flex-1">
              <TextField
                value={draft}
                onChangeText={setDraft}
                placeholder="Write to Operations"
                accessibilityLabel="Message Operations"
                multiline
                maxLength={4000}
                multilineMinHeight={48}
                editable={!sending}
                returnKeyType="send"
                onSubmitEditing={() => void send()}
              />
            </View>
            <Pressable
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: sending || !draft.trim() }}
              className="gg-touch h-12 w-12 items-center justify-center rounded-field bg-accent"
              style={{ opacity: sending || !draft.trim() ? 0.38 : 1 }}
            >
              <Send
                size={18}
                color={colors.accentOn}
                strokeWidth={2}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
