import { router, useFocusEffect } from "expo-router";
import { ChevronRight, QrCode, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, View, type TextStyle } from "react-native";

import { ClientMonogram } from "@/components/ClientMonogram";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { DoneLine, NotFresh, PartnerGate, ProblemLine, Segments } from "@/components/organization/MemberParts";
import { Pressable } from "@/components/Pressable";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonList } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import {
  approveRoute,
  askedLine,
  countOf,
  MEMBER_INVITE_ROUTE,
  MEMBER_RENEW_ROUTE,
  memberCountLine,
  memberRoute,
  memberSinceLine,
  ordersLine,
  returningLine,
  termEndsLine,
  termsLine,
} from "@/lib/organizationMembers";
import type { MemberFilter, MemberRequest, OrganizationMember } from "@/lib/organizationMembersApi";
import { useOrganizationMembers, type FilterCounts } from "@/store/organizationMembers";

type Tab = "requests" | "members";

/**
 * Account → Members (gridgo-client#474): who is asking to join, and who is in.
 *
 * It opens on whatever needs the officer: requests while there are any, the
 * list otherwise. Invite is the screen's one yellow control. Approving needs a
 * date only the officer knows, so Approve opens its own short screen instead
 * of answering with a guess.
 */
export default function MembersScreen() {
  const summary = useOrganizationMembers((s) => s.summary);
  const summaryStatus = useOrganizationMembers((s) => s.summaryStatus);
  const summaryError = useOrganizationMembers((s) => s.summaryError);
  const notice = useOrganizationMembers((s) => s.notice);
  const [picked, setPicked] = useState<Tab | null>(null);

  const load = useCallback(() => {
    const store = useOrganizationMembers.getState();
    return Promise.all([store.loadSummary(), store.loadRequests(), store.loadMembers(), store.loadCounts()]);
  }, []);

  useLiveRefresh(["identity"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => useOrganizationMembers.getState().clearNotice();
    }, [load]),
  );

  const tab: Tab = picked ?? (summary && !summary.requestCount ? "members" : "requests");

  return (
    <FormScreen>
      <PartnerGate>
        <View className="gg-page gap-4 pb-16 pt-4">
          {summary ? (
            <>
              <View className="gg-card flex-row items-center gap-3">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-caption text-text-muted" numberOfLines={2}>
                    {summary.label} · {summary.term.label}
                  </Text>
                  <Text className="text-h2 text-text-primary" accessibilityRole="header">
                    {memberCountLine(summary.memberCount)}
                  </Text>
                  <Text className="text-caption text-text-muted">{termEndsLine(summary.term)}</Text>
                </View>
                <InviteButton />
              </View>

              {summary.expiredCount ? (
                <View className="gg-card gap-3" testID="renew-card">
                  <View className="gap-1">
                    <Text className="text-body-lg font-medium text-text-primary">
                      {countOf(summary.expiredCount, "member", "members")} from an earlier term
                    </Text>
                    <Text className="text-body text-text-secondary">
                      Their label and perk have stopped. Renew the ones who are still members for {summary.term.label}.
                    </Text>
                  </View>
                  <SecondaryButton label="Renew members" onPress={() => router.push(MEMBER_RENEW_ROUTE)} />
                </View>
              ) : null}

              {notice ? <DoneLine message={notice} /> : null}
              {summaryStatus === "failed" && summaryError ? (
                <NotFresh message={summaryError} onRetry={() => void load()} />
              ) : null}

              <Segments<Tab>
                value={tab}
                onChange={setPicked}
                options={[
                  { value: "requests", label: `Requests · ${summary.requestCount.toLocaleString("en-PH")}` },
                  { value: "members", label: `Members · ${summary.memberCount.toLocaleString("en-PH")}` },
                ]}
              />
              {tab === "requests" ? <Requests label={summary.label} /> : <Members />}
            </>
          ) : summaryStatus === "failed" ? (
            <ErrorState
              label="Members not loaded"
              body={summaryError ?? "GRIDGO could not read your members."}
              onRetry={() => void load()}
            />
          ) : (
            <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading members">
              <SkeletonBlock className="h-28 w-full rounded-card" />
              <SkeletonBlock className="h-14 w-full rounded-field" />
              <SkeletonList count={3} />
            </View>
          )}
        </View>
      </PartnerGate>
    </FormScreen>
  );
}

function InviteButton() {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => router.push(MEMBER_INVITE_ROUTE)}
      accessibilityRole="button"
      accessibilityLabel="Invite members"
      className="gg-btn-primary"
      style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
    >
      <QrCode size={18} color={colors.actionYellowOn} strokeWidth={2} aria-hidden />
      <Text className="text-button text-action-yellow-on">Invite</Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------------------
   Requests
   -------------------------------------------------------------------------- */

function Requests({ label }: { label: string }) {
  const requests = useOrganizationMembers((s) => s.requests);
  const acting = useOrganizationMembers((s) => s.acting);
  const actionError = useOrganizationMembers((s) => s.actionError);
  const [declining, setDeclining] = useState<MemberRequest | null>(null);

  if (!requests.rows.length) {
    if (requests.status === "failed") {
      return (
        <ErrorState
          label="Requests not loaded"
          body={requests.error ?? "GRIDGO could not read the requests."}
          onRetry={() => void useOrganizationMembers.getState().loadRequests()}
        />
      );
    }
    if (requests.status !== "ready") return <SkeletonList count={2} />;
    return (
      <EmptyState
        title="No requests waiting"
        body="When someone asks to join with your link or QR, they show here for you to approve."
        actionLabel="Show your QR and link"
        onAction={() => router.push(MEMBER_INVITE_ROUTE)}
      />
    );
  }

  return (
    <View className="gap-3">
      {actionError ? <ProblemLine message={actionError} /> : null}
      {requests.error ? (
        <NotFresh message={requests.error} onRetry={() => void useOrganizationMembers.getState().loadRequests()} />
      ) : null}
      {requests.rows.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          busy={Boolean(acting)}
          onDecline={() => {
            useOrganizationMembers.getState().clearAction();
            setDeclining(request);
          }}
        />
      ))}
      {requests.nextCursor ? (
        <SecondaryButton
          label={requests.loadingMore ? "Loading…" : "Show more requests"}
          disabled={requests.loadingMore}
          onPress={() => void useOrganizationMembers.getState().moreRequests()}
        />
      ) : null}
      <Text className="text-center text-caption text-text-muted">
        Approve only people you know are members. They get the {label} member label on their GRIDGO account.
      </Text>
      <DeclineDialog request={declining} onClose={() => setDeclining(null)} />
    </View>
  );
}

function RequestCard({ request, busy, onDecline }: { request: MemberRequest; busy: boolean; onDecline: () => void }) {
  return (
    <View className="gg-card gap-3" testID={`request-${request.id}`}>
      <View className="flex-row items-center gap-3">
        <ClientMonogram name={request.name} size={44} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
            {request.name}
          </Text>
          <Text className="text-caption text-text-muted">{askedLine(request.requestedAt, request.source)}</Text>
          {request.memberSince ? (
            <Text className="text-caption text-text-secondary">{returningLine(request.memberSince)}</Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton label="Decline" name={request.name} disabled={busy} onPress={onDecline} />
        </View>
        <View className="flex-1">
          <ActionButton
            label="Approve"
            name={request.name}
            disabled={busy}
            strong
            onPress={() => {
              useOrganizationMembers.getState().clearAction();
              router.push(approveRoute(request.id));
            }}
          />
        </View>
      </View>
    </View>
  );
}

/** Two answers on many rows: ink, never yellow, and each named for whose row it is. */
function ActionButton({ label, name, onPress, disabled, strong = false }: {
  label: string;
  name: string;
  onPress: () => void;
  disabled: boolean;
  strong?: boolean;
}) {
  const shell = strong ? "gg-btn bg-accent" : "gg-btn-secondary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${name}`}
      accessibilityState={{ disabled }}
      className={disabled ? `${shell} gg-disabled` : shell}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className={strong ? "text-button text-accent-on" : "text-button text-text-primary"}>{label}</Text>
    </Pressable>
  );
}

function DeclineDialog({ request, onClose }: { request: MemberRequest | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      visible={Boolean(request)}
      question={`Decline ${request?.name ?? "this request"}?`}
      body="They are told it was not approved. They can ask again with your link if this was a mistake."
      confirmLabel="Decline request"
      cancelLabel="Keep request"
      onConfirm={() => {
        if (request) void useOrganizationMembers.getState().decline(request);
        onClose();
      }}
      onCancel={onClose}
    />
  );
}

/* --------------------------------------------------------------------------
   Members
   -------------------------------------------------------------------------- */

const SEARCH_WAIT_MS = 300;

function Members() {
  const list = useOrganizationMembers((s) => s.list);
  const query = useOrganizationMembers((s) => s.query);
  const filter = useOrganizationMembers((s) => s.filter);
  const counts = useOrganizationMembers((s) => s.counts);
  const asked = useRef(query);

  // One read once the typing settles, never one per letter.
  useEffect(() => {
    if (asked.current === query) return;
    const timer = setTimeout(() => {
      asked.current = query;
      void useOrganizationMembers.getState().loadMembers();
    }, SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const narrowed = Boolean(query.trim()) || filter !== "all";
  const store = useOrganizationMembers.getState();

  return (
    <View className="gap-3">
      <SearchField value={query} onChange={store.setQuery} />
      <Filters filter={filter} counts={query.trim() ? null : counts} onChange={store.setFilter} />
      {list.error && list.rows.length ? <NotFresh message={list.error} onRetry={() => void store.loadMembers()} /> : null}

      {list.rows.length ? (
        <>
          <View className="gg-card-flush">
            {list.rows.map((member, index) => (
              <MemberRow key={member.id} member={member} divided={index > 0} />
            ))}
          </View>
          {list.nextCursor ? (
            <SecondaryButton
              label={list.loadingMore ? "Loading…" : `Show more (${(list.total - list.rows.length).toLocaleString("en-PH")} left)`}
              disabled={list.loadingMore}
              onPress={() => void store.moreMembers()}
            />
          ) : null}
        </>
      ) : list.status === "failed" ? (
        <ErrorState
          label="Members not loaded"
          body={list.error ?? "GRIDGO could not read your members."}
          onRetry={() => void store.loadMembers()}
        />
      ) : list.status !== "ready" ? (
        <SkeletonList count={4} />
      ) : narrowed ? (
        <EmptyState
          title={query.trim() ? `Nobody matches “${query.trim()}”` : filter === "ordered" ? "No orders yet this term" : "Everyone has ordered"}
          body={
            query.trim()
              ? "Check the spelling, or go back to everyone."
              : filter === "ordered"
                ? "Members show here after their first paid order this term."
                : "Every member has at least one paid order this term."
          }
          actionLabel="Show all members"
          onAction={() => {
            store.setQuery("");
            store.setFilter("all");
            void store.loadMembers();
          }}
        />
      ) : (
        <EmptyState
          title="No members yet"
          body="Share your link or QR, or upload the member list you already have. People join only when they confirm."
          actionLabel="Invite members"
          onAction={() => router.push(MEMBER_INVITE_ROUTE)}
        />
      )}
    </View>
  );
}

const NO_NATIVE_OUTLINE = { outlineStyle: "none" } as unknown as TextStyle;

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  return (
    <View
      className={
        focused
          ? "flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface px-3"
          : "flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3"
      }
    >
      <Search size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      <TextInput
        className="h-12 flex-1 text-body text-text-primary"
        style={NO_NATIVE_OUTLINE}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        value={value}
        onChangeText={onChange}
        placeholder="Search members"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search members"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={120}
        returnKeyType="search"
      />
      {value ? (
        <Pressable
          onPress={() => onChange("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="gg-touch -mr-3 items-center justify-center"
        >
          <X size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
        </Pressable>
      ) : null}
    </View>
  );
}

const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ordered", label: "Ordered" },
  { value: "not_ordered", label: "Not yet" },
];

function Filters({ filter, counts, onChange }: { filter: MemberFilter; counts: FilterCounts | null; onChange: (filter: MemberFilter) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {FILTERS.map((option) => {
        const selected = option.value === filter;
        const label = counts ? `${option.label} ${counts[option.value].toLocaleString("en-PH")}` : option.label;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            className={
              selected
                ? "min-h-11 items-center justify-center rounded-pill bg-accent px-4"
                : "min-h-11 items-center justify-center rounded-pill border border-outline bg-surface px-4"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className={selected ? "text-button text-accent-on" : "text-body text-text-secondary"}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MemberRow({ member, divided }: { member: OrganizationMember; divided: boolean }) {
  const colors = useThemeColors();
  const since = member.termsCount > 1 ? `${memberSinceLine(member.memberSince)} · ${termsLine(member.termsCount)}` : memberSinceLine(member.memberSince);
  return (
    <Pressable
      onPress={() => router.push(memberRoute(member.id))}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}. ${since}. ${ordersLine(member)}`}
      accessibilityHint="Opens this member"
      className={divided ? "gg-touch flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3" : "gg-touch flex-row items-center gap-3 px-4 py-3"}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <ClientMonogram name={member.name} size={44} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
          {member.name}
        </Text>
        <Text className="text-caption text-text-muted">{since}</Text>
        <Text className={member.ordersThisTerm ? "text-caption text-text-secondary" : "text-caption text-text-muted"}>
          {ordersLine(member)}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
