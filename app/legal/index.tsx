import { router, useFocusEffect, type Href } from "expo-router";
import { ChevronRight, LockKeyhole } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { Screen } from "@/components/Screen";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { libraryOrder } from "@/lib/legal";
import { useLegalLibrary } from "@/store/legalLibrary";

const PRIVACY = "/privacy" as Href;

/**
 * Account > Legal & Privacy: every document GRIDGO has in effect for clients,
 * read from the API so a newly published version is here without an update.
 *
 * Each row says its version and whether it is still placeholder text. Below
 * the documents is the way to the client's own data — the half of privacy that
 * is something they can do rather than something they can read.
 */
export default function LegalLibraryScreen() {
  const colors = useThemeColors();
  const documents = useLegalLibrary((state) => state.documents);
  const status = useLegalLibrary((state) => state.status);

  useFocusEffect(
    useCallback(() => {
      void useLegalLibrary.getState().load({ force: true });
    }, []),
  );

  const ordered = libraryOrder(documents);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-16 pt-4">
          <Text className="text-body text-text-secondary">
            The terms you agreed to and the policies GRIDGO works by. When a document changes in
            a way that matters, GRIDGO asks you to agree again before you carry on.
          </Text>

          <View className="gap-2">
            <Text className="text-caption text-text-muted" accessibilityRole="header">
              Documents
            </Text>
            {ordered.length ? (
              <View className="gg-card-flush">
                {ordered.map((doc, index) => (
                  <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
                ))}
              </View>
            ) : status === "failed" ? (
              <ErrorState
                label="Could not load the documents"
                body="Check this phone's connection and try again."
                onRetry={() => void useLegalLibrary.getState().load({ force: true })}
              />
            ) : status === "unsupported" ? (
              <View className="gg-card">
                <Text className="text-body text-text-secondary">
                  GRIDGO has not published its documents in the app yet.
                </Text>
              </View>
            ) : (
              <View accessibilityLabel="Loading the documents">
                <SkeletonBlock className="h-64 w-full" />
              </View>
            )}
          </View>

          <View className="gap-2">
            <Text className="text-caption text-text-muted" accessibilityRole="header">
              Your privacy
            </Text>
            <Pressable
              onPress={() => router.push(PRIVACY)}
              accessibilityRole="button"
              accessibilityLabel="Your data"
              accessibilityHint="See, correct or delete the personal data GRIDGO holds about you"
              className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
                <LockKeyhole size={20} color={colors.textPrimary} aria-hidden />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body-lg font-medium text-text-primary">Your data</Text>
                <Text className="text-caption text-text-muted">
                  See, correct or delete the personal data GRIDGO holds about you
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} aria-hidden />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
