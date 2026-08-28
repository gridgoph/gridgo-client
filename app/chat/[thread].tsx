import { ChevronLeft, MessageSquare } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";
import { useThemeColors } from "@/hooks/useTheme";
import { CHAT_LIST_ROUTE, CHAT_MEANWHILE, CHAT_NOT_LIVE, chatThread } from "@/lib/chatThreads";

/**
 * One conversation, before there is anything to say.
 *
 * No composer and no transcript. A disabled input would be a control that
 * cannot be used, and a seeded message would be a conversation that never
 * happened — both are worse than an empty screen that explains itself. What
 * this screen owes the client is the two facts they came for: what will land
 * here, and that nothing will land here yet.
 */
export default function ChatThreadScreen() {
  const { thread: peer } = useLocalSearchParams<{ thread?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const thread = chatThread(peer);

  /*
    A thread can be opened with nothing behind it — a deep link, a cold start
    on this route. The native stack hides its own back control when there is no
    history, and this is not a tab, so without this the client is left with
    only OS gestures. `replace` rather than `push`: there is no stack to grow.
  */
  const exitToChat = () => router.replace(CHAT_LIST_ROUTE);
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={exitToChat}
            accessibilityRole="button"
            accessibilityLabel="Back to chat"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Chat</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (!thread) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page pt-6">
          <EmptyState
            title="No such conversation"
            body="GRIDGO carries three: your supplier, your rider, and Gridbot."
            actionLabel="See all three"
            onAction={exitToChat}
          />
        </View>
      </Screen>
    );
  }

  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <Screen edges={["bottom"]}>
      {headerEscape}
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">{thread.name}</Text>
            <Text className="text-body text-text-secondary">{thread.role}</Text>
          </View>

          <View className="gg-panel items-center gap-3 py-8">
            <MessageSquare
              size={24}
              color={colors.textMuted}
              strokeWidth={2}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text className="text-body-lg font-medium text-text-primary">No messages yet</Text>
            <Text className="text-center text-body text-text-secondary">
              {thread.willCarry}
            </Text>
            <Text className="text-center text-body text-text-muted">{CHAT_NOT_LIVE}</Text>
          </View>

          <View className="gap-1">
            <Text className="text-caption text-text-muted">{thread.opensWhen}.</Text>
            <Text className="text-caption text-text-muted">{CHAT_MEANWHILE}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
