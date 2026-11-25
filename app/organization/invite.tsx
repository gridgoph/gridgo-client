import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import type Svg from "react-native-svg";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { DoneLine, LinkRow, PartnerGate, ProblemLine, TextButton } from "@/components/organization/MemberParts";
import { MemberQr } from "@/components/organization/MemberQr";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { copyText } from "@/lib/copyText";
import {
  countOf,
  MEMBER_LIST_ROUTE,
  MEMBER_WAITING_ROUTE,
  memberInviteLink,
  memberInviteMessage,
  termEndsLine,
} from "@/lib/organizationMembers";
import { saveMemberQr } from "@/lib/saveMemberQr";
import { useMemberInvite } from "@/store/memberInvite";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * Members → Invite: one link for the term, as a QR and as text, and the other
 * way in, the member list the organization already has.
 *
 * The link only ever asks to join. The officer approves, so handing it to a
 * whole group chat is safe, and the screen says so.
 */
export default function MemberInviteScreen() {
  const invite = useMemberInvite((s) => s.invite);
  const status = useMemberInvite((s) => s.status);
  const error = useMemberInvite((s) => s.error);
  const label = useOrganizationMembers((s) => s.summary?.label ?? null);
  const summaryStatus = useOrganizationMembers((s) => s.summaryStatus);
  const summaryError = useOrganizationMembers((s) => s.summaryError);
  const waiting = useMemberInvite((s) => s.entryCounts?.waiting ?? 0);

  const load = useCallback(() => {
    void useMemberInvite.getState().load();
    void useMemberInvite.getState().loadEntries();
    if (!useOrganizationMembers.getState().summary) void useOrganizationMembers.getState().loadSummary();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => useMemberInvite.getState().setNotice(null);
    }, [load]),
  );

  const failed = status === "failed" || (summaryStatus === "failed" && !label);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-6 pb-16 pt-4">
            {invite && label ? (
              <InviteCard
                label={label}
                term={invite.term}
                link={memberInviteLink(Linking.createURL("/"), invite.path)}
              />
            ) : failed ? (
              <ErrorState
                label="Invite link not loaded"
                body={error ?? summaryError ?? "GRIDGO could not read your invite link."}
                onRetry={load}
              />
            ) : (
              <View className="items-center gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading invite link">
                <SkeletonBlock className="h-80 w-64 rounded-card" />
                <SkeletonBlock className="h-12 w-full rounded-field" />
              </View>
            )}

            <View className="gap-2">
              <Text className="text-overline text-text-muted">ALREADY HAVE A LIST?</Text>
              <View className="gg-card-flush">
                <LinkRow
                  title="Upload member list"
                  detail="Invite everyone at once, or add people one by one"
                  onPress={() => router.push(MEMBER_LIST_ROUTE)}
                />
                <LinkRow
                  divided
                  title="Waiting to confirm"
                  detail={waiting ? `${countOf(waiting, "person", "people")} from your list not confirmed yet` : "People from your list who have not confirmed yet"}
                  onPress={() => router.push(MEMBER_WAITING_ROUTE)}
                />
              </View>
            </View>
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}

function InviteCard({ label, term, link }: { label: string; term: { label: string; code: string; endsOn: string }; link: string }) {
  const notice = useMemberInvite((s) => s.notice);
  const replacing = useMemberInvite((s) => s.replacing);
  const svg = useRef<Svg>(null);
  const [asking, setAsking] = useState(false);
  const setNotice = useMemberInvite.getState().setNotice;

  const copy = async () =>
    setNotice(
      (await copyText(link))
        ? { tone: "success", message: "Link copied" }
        : { tone: "error", message: "Could not copy. Press and hold the link to copy it." },
    );

  const share = async () => {
    const message = memberInviteMessage({ label, term, link, downloadUrl: APP_UPDATE_SOURCE.downloadUrl });
    try {
      await Share.share({ message, title: `Join ${label} on GRIDGO` });
    } catch {
      // No share panel here (a desktop browser): the whole message goes on the clipboard.
      setNotice(
        (await copyText(message))
          ? { tone: "success", message: "Invite copied. Paste it in your group chat." }
          : { tone: "error", message: "Could not share. Copy the link instead." },
      );
    }
  };

  const saveQr = async () => {
    const result = await saveMemberQr(svg.current, `${label.replace(/[^A-Za-z0-9]+/g, "-")}-${term.code}-join.png`);
    if (result) setNotice(result);
  };

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          Invite {label} members
        </Text>
        <Text className="text-body text-text-secondary">
          Post this anywhere your members are. Each person asks to join, and you approve them.
        </Text>
      </View>

      <View className="items-center gap-2">
        <MemberQr ref={svg} link={link} label={label} term={term.label} />
        <Text className="text-center text-caption text-text-muted">
          Members scan this with their phone camera. They need the GRIDGO app.
        </Text>
      </View>

      <View className="flex-row items-center gap-1 rounded-field border border-outline bg-surface pl-4">
        <Text selectable numberOfLines={1} ellipsizeMode="middle" testID="member-link" className="min-w-0 flex-1 text-body text-text-primary">
          {link}
        </Text>
        <TextButton label="Copy" onPress={() => void copy()} />
      </View>

      {notice ? (
        notice.tone === "error" ? <ProblemLine message={notice.message} /> : <DoneLine message={notice.message} />
      ) : null}

      <View className="gap-3">
        <PrimaryButton label="Share link" onPress={() => void share()} disabled={replacing} />
        <SecondaryButton label="Save QR" onPress={() => void saveQr()} disabled={replacing} />
      </View>

      <View className="items-center">
        <Text className="text-center text-caption text-text-muted">
          Works for {term.label}. {termEndsLine(term)}, then you get a new link.
        </Text>
        <TextButton
          label={replacing ? "Making a new link…" : "Make a new link"}
          disabled={replacing}
          onPress={() => {
            setNotice(null);
            setAsking(true);
          }}
        />
      </View>

      <ConfirmDialog
        visible={asking}
        question="Make a new link?"
        body="The current link and QR stop working right away, including ones you printed or posted. People who already asked or joined are not affected."
        confirmLabel="Make a new link"
        cancelLabel="Keep this link"
        tone="destructive"
        onConfirm={() => {
          setAsking(false);
          void useMemberInvite.getState().replace();
        }}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}
