import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useUser } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabScreen } from "@/components/TabScreen";
import { ClientMonogram } from "@/components/ClientMonogram";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  accountHeadline,
  accountSubName,
  businessApplicationPending,
  canApplyAsBusiness,
} from "@/lib/accountProfile";
import { PRIORITIES_ROUTE, priorityLabel } from "@/lib/priorities";
import { accountTypeOption } from "@/lib/signup";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";

/**
 * The client's own account.
 *
 * Deliberately short. A screen that lists every setting at once is a screen
 * people scan instead of read, so it leads with the one fact that changes what
 * this account can do — who GRIDGO thinks it is — and puts everything routine
 * one clear tap away, grouped by what it is about.
 *
 * Recognition over recall: every destination says what is behind it in a line,
 * so a client chooses from what they can see rather than remembering where a
 * setting lives. And the one action that undoes the session asks first — a
 * phone gets handed around, and signing out by accident on a Saturday means
 * finding a password on a Saturday.
 *
 * The connection this app is using is deliberately not here. It was a card
 * carrying a URL no client can act on, sitting in the same column as the
 * things they can — and reading as though the app might be pointed somewhere
 * else. The build knows its own API; a client does not need to.
 */
export default function AccountScreen() {
  const { user: clerkUser } = useUser();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const refresh = useSession((s) => s.refresh);
  const ranking = usePriorities((s) => s.ranking);
  const colors = useThemeColors();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  /*
   * Read the account again every time this screen comes back into view.
   *
   * The name on this card is GRIDGO's, and the two screens that change it are
   * one tap away — so the moment a client is most likely to look at this card
   * is the moment straight after changing it. Trusting whatever the session
   * held on the way out is how a client applies as a business, comes back, and
   * finds "Personal client" still sitting here.
   */
  useLiveRefresh(["identity", "approvals"], refresh, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const headline = accountHeadline(user);
  const subName = accountSubName(user);
  const typeLabel = accountTypeOption(user?.accountType ?? "individual").label;
  const applicationPending = businessApplicationPending(user);
  // Clerk always serves an imageUrl, including the generated initials avatar.
  // `hasImage` is what tells a real photo from that placeholder — same rule
  // as Your details. RN Image draws it; the picker is not on this screen.
  const photoUrl = clerkUser?.hasImage ? (clerkUser.imageUrl ?? null) : null;

  return (
    <TabScreen>
      <ScrollView className="gg-screen" showsVerticalScrollIndicator={false}>
        <View className="gg-page gap-6 pt-4" style={{ paddingBottom: tabPad }}>
          <ScreenHeader title="Account" />

          {/*
            Identity first, and the way into correcting it. This is where a
            client reads their own name, so it is where a wrong one is noticed,
            and a fact you can see but not reach is what sends someone to
            Operations for a typo. The chevron is the same one every
            destination below uses, so the card reads as a way through rather
            than a panel that happens to respond to a tap.
          */}
          <Pressable
            onPress={() => router.push("/account-details")}
            accessibilityRole="button"
            // Not "Your details": the row below leads to the same screen, and
            // two controls answering to one name is a screen reader offering a
            // choice that is not one. The card is the account; the row is the
            // form that changes it.
            accessibilityLabel="Your account"
            accessibilityHint="Opens your details — name, number and organisation name"
            className="gg-card gap-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="flex-row items-center gap-3">
              <ClientMonogram name={headline} size={56} imageUrl={photoUrl} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-h3 text-text-primary" numberOfLines={2}>
                  {headline}
                </Text>
                {subName ? (
                  <Text className="text-body text-text-secondary" numberOfLines={1}>
                    {subName}
                  </Text>
                ) : null}
                <Text className="text-caption text-text-muted" numberOfLines={1}>
                  {user?.email || "—"}
                </Text>
              </View>
              <ChevronRight
                size={20}
                color={colors.textMuted}
                aria-hidden
              />
            </View>
            {/*
              What kind of client this is, under the whole row rather than
              beside the name — it is the standing of the account, not a label
              on the monogram. Monochrome: it is a fact, not a status, and
              spending a colour on it would say something is wrong or right
              about being one kind rather than another.
            */}
            <View className="flex-row flex-wrap gap-2">
              <View className="gg-chip border-outline">
                <Text className="text-caption text-text-secondary">{typeLabel} client</Text>
              </View>
              {applicationPending ? (
                <View className="gg-chip border-outline">
                  <Text className="text-caption text-text-secondary">Application pending</Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">YOUR ACCOUNT</Text>
            <DestinationRow
              title="Your details"
              detail="Your name, number, and the email you sign in with"
              onPress={() => router.push("/account-details")}
            />
            <DestinationRow
              title="Saved Places"
              detail="Home, Work, and the spots you drop off to"
              onPress={() => router.push("/saved-places")}
            />
            {/*
              Offered only while the account is still personal. After the
              upgrade the row has nothing left to do, and the identity card
              above already says Business — leaving it up would invite a client
              to apply for what they already are.
            */}
            {applicationPending ? (
              <DestinationRow
                title="Business application"
                detail="Waiting for Operations to review. You stay a personal client until they approve it"
                onPress={() => router.push("/business-apply")}
              />
            ) : canApplyAsBusiness(user) ? (
              <DestinationRow
                title="Apply as a business"
                detail="Ask Operations to put your company or organization name on this account"
                onPress={() => router.push("/business-apply")}
              />
            ) : null}
            {/*
              What GRIDGO matches on lives here, with the account it belongs
              to, and nowhere else. It was on Settings; two homes for one
              setting is two places to look and one of them always out of date.
            */}
            <DestinationRow
              title="What GRIDGO matches on"
              detail={
                ranking
                  ? ranking.map((entry) => priorityLabel(entry)).join(" · ")
                  : "Put quality, speed and distance in your order"
              }
              onPress={() =>
                router.push({
                  pathname: PRIORITIES_ROUTE,
                  params: { returnTo: "account" },
                })
              }
            />
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">APP</Text>
            <DestinationRow
              title="Settings"
              detail="Theme, and the introduction to GRIDGO"
              onPress={() => router.push("/settings")}
            />
          </View>

          <View className="pt-2">
            <SecondaryButton label="Sign out" onPress={() => setConfirmingSignOut(true)} />
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmingSignOut}
        question="Sign out of GRIDGO on this phone?"
        body="Your orders and history stay with GRIDGO. You will need your email and password to get back in, and no updates about your jobs will reach this phone until you do."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="destructive"
        onConfirm={() => {
          setConfirmingSignOut(false);
          // `logout` drops the user synchronously. Replace immediately so the
          // ranking screen cannot paint while Clerk is still leaving.
          void logout();
          router.replace("/(auth)/welcome");
        }}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </TabScreen>
  );
}

/**
 * One destination, and a line saying what is behind it.
 *
 * The line is not decoration: it is what lets a client choose from the screen
 * instead of remembering the app. Where the row's content is a value they set
 * — the match ranking — the line is that value, so the setting can be read
 * without opening it.
 */
function DestinationRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ChevronRight
        size={20}
        color={colors.textMuted}
        aria-hidden
      />
    </Pressable>
  );
}
