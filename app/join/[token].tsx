import { useLocalSearchParams, useRouter } from "expo-router";
import { BadgePercent, CalendarCheck, Link2Off, Lock, UserRoundCheck, type LucideIcon } from "lucide-react-native";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";

import { HomeEscape } from "@/components/HomeEscape";
import { OrgTile } from "@/components/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { MEMBER_PRIVACY_LINE, MY_ORGS_ROUTE, offerLine, orgFullName, orgName, readJoinText } from "@/lib/memberships";
import { manilaDay } from "@/lib/organization";
import { canJoinOrgs, useMemberships } from "@/store/memberships";
import { usePendingJoin } from "@/store/pendingJoin";
import { useSession } from "@/store/session";

/**
 * A member link or QR, opened (gridgo-client#475): which org it is, what it
 * gives, and one button. Asking does not make anyone a member; the officer
 * answers.
 */
export default function JoinOrgInviteScreen() {
  const router = useRouter();
  const { token, source } = useLocalSearchParams<{ token: string; source?: string }>();
  const person = useSession((state) => canJoinOrgs(state.user));
  const held = useMemberships((state) => (state.invite?.token === token ? state.invite : null));
  const busy = useMemberships((state) => state.busyId === "join");
  const error = useMemberships((state) => (state.actionError?.id === "join" ? state.actionError.message : null));
  // A malformed link never spends one of the look-ups GRIDGO allows.
  const valid = readJoinText(token ?? "").ok;

  useEffect(() => {
    if (token && valid && person) void useMemberships.getState().readInvite(token);
    return () => useMemberships.getState().clearActionError();
  }, [token, valid, person]);
  // This is the link a signed-out phone was holding; it has been opened.
  useEffect(() => {
    if (token && usePendingJoin.getState().token === token) usePendingJoin.getState().clear();
  }, [token]);

  const openMyOrgs = () => router.dismissTo(MY_ORGS_ROUTE);

  if (!person) {
    return (
      <Closed
        title="This link is for members"
        body="You are signed in with an organization account. Members join with their own account."
      />
    );
  }
  if (!valid) return <Closed title="Link not opened" body="That is not a member link. Ask your officer for the newest link or QR." />;

  const read = held ?? { status: "loading" as const };
  if (read.status === "loading") {
    return (
      <Screen edges={["bottom"]}>
        <HomeEscape />
        <View className="gg-page gap-3 pt-4" accessibilityRole="progressbar" accessibilityLabel="Opening the invite">
          <SkeletonBlock className="h-44" />
          <SkeletonLine width="w-2/3" height="h-6" />
          <SkeletonLine width="w-full" height="h-11" />
        </View>
      </Screen>
    );
  }
  if (read.status !== "ready") {
    return (
      <Closed
        title={read.status === "closed" ? "Link not opened" : "Could not open the link"}
        body={read.message}
        onRetry={read.status === "failed" ? () => void useMemberships.getState().readInvite(token) : undefined}
      />
    );
  }

  const { invite } = read;
  const name = orgName(invite);
  const full = orgFullName(invite);
  const offer = offerLine(invite.perk);
  const member = invite.membershipStatus === "active";
  const pending = invite.membershipStatus === "pending";
  const ends = manilaDay(invite.term.endsOn);

  const ask = async () => {
    const membership = await useMemberships.getState().join(token, source === "qr" ? "qr" : "link");
    if (membership) openMyOrgs();
  };

  return (
    <Screen edges={["bottom"]}>
      <HomeEscape />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View className="gg-card items-center gap-3 py-6">
          <OrgTile entry={invite} size={64} />
          <View className="items-center gap-1">
            <Text className="text-center text-h2 text-text-primary" accessibilityRole="header">
              {member ? `You’re already in ${name}` : `Join ${name}`}
            </Text>
            {full ? <Text className="text-center text-body text-text-secondary">{full}</Text> : null}
          </View>
          {member ? <StatusChip tone="success" label="Member" icon="circle-check" /> : null}
          {pending ? <StatusChip tone="warning" label="Waiting for approval" icon="clock" /> : null}
        </View>

        {member || pending ? (
          <Text className="px-1 text-body text-text-secondary">
            {member
              ? "Nothing to do here. Your membership and perk are in My orgs."
              : "You already asked. The officer has your request, and you get a notice when they answer."}
          </Text>
        ) : (
          <View className="gg-card-flush">
            {offer ? (
              <Row icon={BadgePercent} title={offer} detail="Comes off at checkout by itself once you are a member" />
            ) : null}
            <Row
              icon={UserRoundCheck}
              title="The officer approves you"
              detail="You get a notice when they answer. You can keep ordering meanwhile"
              divided={Boolean(offer)}
            />
            {ends ? <Row icon={CalendarCheck} title={`For ${invite.term.label}`} detail={`Until ${ends}`} divided /> : null}
            <Row icon={Lock} title={MEMBER_PRIVACY_LINE} divided />
          </View>
        )}
      </ScrollView>
      <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
        {error ? (
          <Text className="text-caption text-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {member || pending ? (
          <PrimaryButton label="See My orgs" onPress={openMyOrgs} />
        ) : (
          <PrimaryButton label={busy ? "Sending…" : "Request to join"} disabled={busy} onPress={() => void ask()} />
        )}
      </View>
    </Screen>
  );
}

/** A link with nothing behind it to act on, or one that could not be read. */
function Closed({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  const colors = useThemeColors();
  return (
    <Screen edges={["bottom"]}>
      <HomeEscape />
      <View className="gg-page gap-6 pt-10">
        <View className="items-center gap-3 px-4">
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-surface-variant">
            <Link2Off size={24} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          </View>
          <Text className="text-center text-h3 text-text-primary" accessibilityRole="header">
            {title}
          </Text>
          <Text className="text-center text-body text-text-secondary">{body}</Text>
        </View>
        {onRetry ? <SecondaryButton label="Try again" onPress={onRetry} /> : null}
      </View>
    </Screen>
  );
}

function Row({
  icon: Icon,
  title,
  detail,
  divided = false,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  divided?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View className={`min-h-12 flex-row items-center gap-3 px-4 py-3 ${divided ? "border-t border-outline-subtle" : ""}`} accessible>
      <Icon size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body text-text-primary">{title}</Text>
        {detail ? <Text className="text-caption text-text-secondary">{detail}</Text> : null}
      </View>
    </View>
  );
}
