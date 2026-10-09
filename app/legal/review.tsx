import { router, type Href } from "expo-router";
import { ChevronRight, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { gateBody, gateHeading, joinTitles } from "@/lib/legal";
import { useLegalConsent } from "@/store/legalConsent";
import { useLegalNotices } from "@/store/legalNotices";
import { useSession } from "@/store/session";

const PRIVACY = "/privacy" as Href;

/**
 * Terms to agree to, before anything else in the app opens.
 *
 * Reached only through the landing ladder and the root stack's guard, which
 * close every ordinary screen while `GET /me/legal/pending` says `blocking`.
 * What stays open is what a person needs in order to decide: each document,
 * their privacy requests, and the way out — signing out is never behind the
 * checkbox.
 *
 * The box starts unticked and is drawn again unticked whenever the set of
 * versions on screen changes, so a version that took effect mid-read is never
 * agreed to by a tick given to the one before it.
 */
export default function LegalReviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const userId = useSession((state) => state.user?.id ?? null);
  const logout = useSession((state) => state.logout);
  const pending = useLegalConsent((state) => state.pending);
  const notices = useLegalConsent((state) => state.notices);
  const accepting = useLegalConsent((state) => state.accepting);
  const error = useLegalConsent((state) => state.error);

  const signature = pending.map((doc) => doc.id).join("|");
  const [agreedTo, setAgreedTo] = useState<string | null>(null);
  const agreed = agreedTo === signature;

  const agree = async () => {
    if (!agreed) return;
    const done = await useLegalConsent.getState().accept();
    // Editorial notices were on this screen too; they need no second showing.
    if (done && userId) {
      useLegalNotices.getState().markSeen(
        userId,
        useLegalConsent.getState().notices.map((doc) => doc.id),
      );
    }
  };

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        <View className="gg-page gap-7">
          <View className="gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-surface-variant">
              <ShieldCheck size={24} color={colors.textPrimary} aria-hidden />
            </View>
            <Text className="text-h1 text-text-primary" accessibilityRole="header">
              {gateHeading(pending)}
            </Text>
            <Text className="text-body-lg text-text-secondary">{gateBody(pending)}</Text>
          </View>

          <View className="gap-2">
            <Text className="text-caption text-text-muted">
              Needs your agreement
            </Text>
            <View className="gg-card-flush">
              {pending.map((doc, index) => (
                <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} showChange />
              ))}
            </View>
          </View>

          {notices.length ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">
                Also updated, to read when you like
              </Text>
              <View className="gg-card-flush">
                {notices.map((doc, index) => (
                  <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
                ))}
              </View>
            </View>
          ) : null}

          <View className="gap-4">
            <CheckboxRow
              checked={agreed}
              onChange={(next) => setAgreedTo(next ? signature : null)}
              disabled={accepting}
              label={`I have read and agree to the ${joinTitles(pending)}`}
            />
            {error ? <ErrorState label="Not agreed yet" body={error} /> : null}
            <PrimaryButton
              label={accepting ? "Saving your agreement…" : "Agree and continue"}
              disabled={!agreed || accepting || pending.length === 0}
              onPress={() => void agree()}
            />
            {!agreed ? (
              <Text className="text-caption text-text-muted">
                Tick the box to continue. GRIDGO records which versions you agreed to and when.
              </Text>
            ) : null}
          </View>

          <View className="gap-3">
            <Pressable
              onPress={() => router.push(PRIVACY)}
              accessibilityRole="button"
              accessibilityLabel="Your data"
              accessibilityHint="See, correct or delete the personal data GRIDGO holds"
              className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body-lg font-medium text-text-primary">Your data</Text>
                <Text className="text-caption text-text-muted">
                  See, correct or delete what GRIDGO holds, without agreeing first
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} aria-hidden />
            </Pressable>
            <SecondaryButton
              label="Sign out"
              disabled={accepting}
              onPress={() => {
                void logout();
                router.replace("/(auth)/welcome");
              }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
