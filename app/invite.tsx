import { useFocusEffect } from "expo-router";
import { Check, Link2, Ticket } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Share, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { copyText } from "@/lib/copyText";
import { INVITE_CONDITIONS, INVITE_TITLE, inviteCounts, inviteExplainer, shareMessage } from "@/lib/foundingTester";
import { useFoundingTester } from "@/store/foundingTester";

/**
 * Founding Tester → Invite a friend (client#323; gridgo-api
 * `docs/FOUNDING_TESTER_API.md#invite-links-form-ingestion-and-matching`).
 *
 * The personal link, Copy and Share, and what has come of it so far. Opening
 * the screen asks GRIDGO for the code, which makes it the first time and reads
 * the same one back after that. The link is GRIDGO's own, sent unchanged: the
 * sign-up form with the code filled in. Until Operations has set that form
 * there is a code and no link, and Copy and Share wait rather than hand out
 * something that leads nowhere.
 *
 * Only a current read is offered to share. While a refresh runs, or after
 * one fails, the counts held from before are said to be last known and the
 * link is not handed out: Operations may have changed the form since.
 *
 * Share is the one yellow control; Copy sits beside it in ink.
 */
export default function InviteScreen() {
  const colors = useThemeColors();
  const invites = useFoundingTester((s) => s.invites);
  const status = useFoundingTester((s) => s.inviteStatus);
  const error = useFoundingTester((s) => s.inviteError);
  const notice = useFoundingTester((s) => s.notice);
  const loadInvite = useFoundingTester((s) => s.loadInvite);
  const setNotice = useFoundingTester((s) => s.setNotice);

  useFocusEffect(
    useCallback(() => {
      setNotice(null);
      void loadInvite();
    }, [loadInvite, setNotice]),
  );

  const current = status === "ready";
  // Only GRIDGO's current answer is handed out.
  const link = current ? (invites?.link ?? null) : null;

  const copy = async () => {
    if (!link) return;
    setNotice((await copyText(link)) ? "copied" : "copy_failed");
  };

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({ message: shareMessage(link), url: link, title: INVITE_TITLE });
    } catch {
      // No share sheet here (a desktop browser): the link goes on the clipboard instead.
      setNotice((await copyText(link)) ? "copied" : "copy_failed");
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gap-2">
            <Text className="text-h2 font-bold text-text-primary">Bring a friend to GRIDGO</Text>
            <Text className="text-body-lg text-text-secondary">{inviteExplainer()}</Text>
          </View>

          {invites && status === "error" ? (
            <ErrorState
              label="Could not refresh your invite"
              body={`${error ?? "Try again."} The counts below are from before, and your link stays hidden until GRIDGO answers.`}
              onRetry={() => void loadInvite()}
            />
          ) : null}

          {!invites && status === "error" ? (
            <ErrorState label="Could not load your invite" body={error ?? "Try again."} onRetry={() => void loadInvite()} />
          ) : !invites ? (
            <View className="gap-3" testID="invite-loading">
              <SkeletonBlock className="h-28 w-full rounded-card" />
              <SkeletonBlock className="h-24 w-full rounded-card" />
            </View>
          ) : (
            <>
              <View className="gg-card gap-4">
                <View className="gap-1">
                  <Text className="text-overline text-text-muted">YOUR INVITE LINK</Text>
                  {!current ? (
                    <Text className="text-body text-text-secondary">
                      {status === "error" ? "Not shown until GRIDGO confirms your link." : "Checking your link…"}
                    </Text>
                  ) : link ? (
                    <View className="flex-row items-start gap-2">
                      <Link2 size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
                      <Text selectable testID="invite-link" className="min-w-0 flex-1 text-body text-text-primary">
                        {link}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-body text-text-secondary">
                      Your link is not ready yet. GRIDGO is still setting up the sign-up form, so check back soon.
                    </Text>
                  )}
                </View>
                <View className="gap-3">
                  <PrimaryButton label="Share" onPress={() => void share()} disabled={!link} />
                  <SecondaryButton label="Copy link" onPress={() => void copy()} disabled={!link} />
                </View>
                {notice ? (
                  <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
                    {notice === "copied" ? <Check size={16} color={colors.success} strokeWidth={2.5} aria-hidden /> : null}
                    <Text className={notice === "copied" ? "text-caption text-success" : "text-caption text-error"}>
                      {notice === "copied" ? "Link copied" : "Could not copy. Press and hold the link to copy it."}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View className="gap-2">
                <Text className="text-overline text-text-muted">{current ? "YOUR INVITES" : "YOUR INVITES · LAST KNOWN"}</Text>
                <View className="gg-card-flush">
                  {inviteCounts(invites).map((count, index) => (
                    <View
                      key={count.key}
                      accessible
                      accessibilityLabel={`${count.label}: ${count.value}. ${count.detail}`}
                      testID={`invite-count-${count.key}`}
                      className={index === 0 ? "flex-row items-center gap-3 px-4 py-3" : "flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"}
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="text-body font-medium text-text-primary">{count.label}</Text>
                        <Text className="text-caption text-text-muted">{count.detail}</Text>
                      </View>
                      <Text className="text-h3 font-bold text-text-primary">{count.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="flex-row items-start gap-2">
                <Ticket size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} aria-hidden />
                <Text className="min-w-0 flex-1 text-caption text-text-secondary">
                  Ask your friend to use the same email on the sign-up form and in the GRIDGO app, so GRIDGO can match
                  them to you. {INVITE_CONDITIONS}
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
