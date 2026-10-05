import { router, useFocusEffect } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { OfficerCard, OfficerReminderCard } from "@/components/organization/OfficerCard";
import {
  PeriodSelector,
  StatementLedger,
  StatementSummary,
} from "@/components/organization/StatementParts";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { TabScreen } from "@/components/TabScreen";
import { useThemeColors } from "@/hooks/useTheme";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  isApprovedOrganization,
  officerState,
  ORGANIZATION_NOTICE_TYPE,
  periodRange,
} from "@/lib/organization";
import { useNotifications } from "@/store/notifications";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";
import { requestedPeriod, useStatements } from "@/store/statements";

/**
 * The Organizations tab (gridgo-client#160): everything that belongs to an
 * approved organization rather than to one order — the officer who answers
 * for it, the quarterly check, notices from Operations, and the spend
 * statement a treasurer takes to a meeting.
 *
 * The tab bar only offers it to approved organizations; this screen checks
 * again, because a deep link does not go through the tab bar.
 */
export default function OrganizationsScreen() {
  const user = useSession((s) => s.user);
  const organization = useOrganization((s) => s.organization);
  const orgStatus = useOrganization((s) => s.status);
  const orgError = useOrganization((s) => s.error);
  const confirming = useOrganization((s) => s.confirming);
  const confirmError = useOrganization((s) => s.confirmError);
  const justConfirmed = useOrganization((s) => s.justConfirmed);
  const statements = useStatements();
  const notices = useNotifications((s) => s.items).filter((item) => item.type === ORGANIZATION_NOTICE_TYPE);
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const approved = isApprovedOrganization(user, organization);

  useFocusEffect(
    useCallback(() => {
      void useOrganization.getState().load();
      // Statements answer 403 for anyone else; do not ask on their behalf.
      const { user: current } = useSession.getState();
      if (isApprovedOrganization(current, useOrganization.getState().organization)) {
        void useStatements.getState().load();
      }
    }, []),
  );

  if (!approved) {
    return (
      <TabScreen>
        <ScrollView className="gg-screen">
          <View className="gg-page gap-6 pt-4" style={{ paddingBottom: tabPad }}>
            <ScreenHeader title="Organizations" />
            <EmptyState
              title="For approved organizations"
              body="Statements, the officer of record and notices from Operations open here once Operations approves an organization account."
              actionLabel="Go to Account"
              onAction={() => router.navigate("/(tabs)/account")}
            />
          </View>
        </ScrollView>
      </TabScreen>
    );
  }

  const state = officerState(organization);
  const statement = statements.statement;
  const customLabel =
    statements.kind === "custom" && requestedPeriod(statements)
      ? periodRange(statements.customFrom, statements.customTo)
      : null;

  return (
    <TabScreen>
      <ScrollView className="gg-screen" showsVerticalScrollIndicator={false}>
        {/* A long screen: its last row must scroll clear of the floating plus. */}
        <View className="gg-page gap-6 pt-4" style={{ paddingBottom: tabPad + FAB_CLEARANCE }}>
          <ScreenHeader title="Organizations" />

          <View className="gap-1">
            <Text className="text-h2 text-text-primary" numberOfLines={2}>
              {organization?.name || user?.orgName || "Your organization"}
            </Text>
            {organization?.school ? (
              <Text className="text-body text-text-secondary">{organization.school}</Text>
            ) : null}
          </View>

          {state === "confirmation_due" ? (
            <OfficerReminderCard
              organization={organization}
              confirming={confirming}
              error={confirmError}
              onConfirm={() => void useOrganization.getState().confirm()}
            />
          ) : null}
          {justConfirmed && state === "verified" ? (
            <StatusChip
              tone="success"
              label={`${organization?.currentOfficer?.fullName ?? "Officer"} confirmed`}
              icon="circle-check"
            />
          ) : null}

          {orgStatus === "loading" && !organization ? (
            <SkeletonBlock className="h-40 w-full rounded-card" />
          ) : orgStatus === "failed" ? (
            <ErrorState
              label="Officer not loaded"
              body={orgError ?? "GRIDGO could not read your organization."}
              onRetry={() => void useOrganization.getState().load()}
            />
          ) : (
            <OfficerCard organization={organization} />
          )}

          {notices.length ? <Notices items={notices.slice(0, 3)} /> : null}

          <View className="gap-4">
            <View className="gap-1">
              <Text className="text-overline text-text-muted">STATEMENTS</Text>
              <Text className="text-body text-text-secondary">
                What the organization spent on closed orders, for your own budget records.
              </Text>
            </View>

            <PeriodSelector
              kind={statements.kind}
              customLabel={customLabel}
              onChange={(kind) => {
                if (kind === "custom") {
                  router.push("/statement-period");
                  return;
                }
                statements.setKind(kind);
              }}
            />

            {statements.status === "failed" ? (
              <ErrorState
                label="Statement not loaded"
                body={statements.error ?? "GRIDGO could not read this statement."}
                onRetry={() => void statements.load()}
              />
            ) : !statement ? (
              <View className="gap-3">
                <SkeletonBlock className="h-56 w-full rounded-card" />
                <SkeletonList count={2} />
              </View>
            ) : (
              <>
                <StatementSummary statement={statement} />
                {statement.orders.length ? (
                  <StatementLedger rows={statement.orders} />
                ) : (
                  <EmptyState
                    title="No closed orders in this period"
                    body="An order counts once it is completed. Pick another period to see earlier spend."
                  />
                )}
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <SecondaryButton
                      label={statements.exporting === "pdf" ? "Preparing…" : "Export PDF"}
                      disabled={Boolean(statements.exporting)}
                      onPress={() => void statements.exportAs("pdf")}
                    />
                  </View>
                  <View className="flex-1">
                    <SecondaryButton
                      label={statements.exporting === "csv" ? "Preparing…" : "Export CSV"}
                      disabled={Boolean(statements.exporting)}
                      onPress={() => void statements.exportAs("csv")}
                    />
                  </View>
                </View>
                {statements.exportNotice ? (
                  <Text
                    className={
                      statements.exportNotice.tone === "error"
                        ? "text-caption text-error"
                        : "text-caption text-success"
                    }
                  >
                    {statements.exportNotice.message}
                  </Text>
                ) : null}
                <Text className="text-caption text-text-muted">
                  Both exports carry the same &quot;Not a tax document&quot; line. Official
                  receipts for each order stay as they are.
                </Text>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </TabScreen>
  );
}

/** The floating plus (56) and its gap above the bar (16). */
const FAB_CLEARANCE = 72;

/** Notices Operations sent this organization, newest first. They also sit in Notifications. */
function Notices({ items }: { items: { id: string; title: string; body: string; at: string }[] }) {
  const colors = useThemeColors();
  return (
    <View className="gap-3">
      <Text className="text-overline text-text-muted">FROM OPERATIONS</Text>
      <View className="gg-card-flush">
        {items.map((item, index) => (
          <View
            key={item.id}
            className={
              index === items.length - 1
                ? "flex-row gap-3 px-4 py-3"
                : "flex-row gap-3 border-b border-outline-subtle px-4 py-3"
            }
          >
            <View className="mt-0.5">
              <Megaphone size={18} color={colors.info} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{item.title}</Text>
                <Text className="text-caption text-text-muted">{formatRelativeTime(item.at)}</Text>
              </View>
              <Text className="text-body text-text-secondary">{item.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
