import { Bike, Bot, ChevronRight, Store, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "@/hooks/useTheme";
import {
  CHAT_MEANWHILE,
  CHAT_NOT_LIVE,
  CHAT_THREAD_ROUTE,
  CHAT_THREADS,
  type ChatPeer,
} from "@/lib/chatThreads";

/**
 * Everyone attached to a job, in one place.
 *
 * There is no message backend, so this list has one job: say who the client
 * will end up talking to, and at which point of a job each conversation starts
 * carrying anything. That second line is the whole screen. Three identical
 * rows reading "no messages" would be a placeholder; three rows that between
 * them map a job from acceptance to the door is information the client cannot
 * get anywhere else.
 *
 * What is deliberately absent: unread dots (there is no count to be honest
 * about), previews (there are no messages to preview), and avatars. The glyph
 * on each row is a category mark, not a face.
 */
const PEER_ICONS: Record<ChatPeer, LucideIcon> = {
  supplier: Store,
  rider: Bike,
  gridbot: Bot,
};

export default function ChatListScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gap-2">
            <Text className="text-body-lg text-text-primary">
              Everyone attached to a job, in one place.
            </Text>
            <Text className="text-body text-text-secondary">{CHAT_NOT_LIVE}</Text>
          </View>

          <View className="gg-card-flush">
            {CHAT_THREADS.map((thread, index) => {
              const Icon = PEER_ICONS[thread.peer];
              return (
                <View key={thread.peer}>
                  {index > 0 ? <View className="gg-divider" /> : null}
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: CHAT_THREAD_ROUTE,
                        params: { thread: thread.peer },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={thread.name}
                    accessibilityHint={thread.role}
                    className="gg-touch flex-row items-center gap-3 px-4 py-3"
                    style={({ pressed }) =>
                      pressed ? { backgroundColor: colors.surfaceVariant } : undefined
                    }
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant">
                      <Icon
                        size={18}
                        color={colors.textSecondary}
                        strokeWidth={2}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-body-lg font-medium text-text-primary">
                        {thread.name}
                      </Text>
                      <Text className="mt-0.5 text-caption text-text-secondary">
                        {thread.role}
                      </Text>
                      <Text className="mt-1 text-caption text-text-muted">
                        {thread.opensWhen}
                      </Text>
                    </View>
                    <ChevronRight
                      size={18}
                      color={colors.textMuted}
                      strokeWidth={2}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <Text className="text-caption text-text-muted">{CHAT_MEANWHILE}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
