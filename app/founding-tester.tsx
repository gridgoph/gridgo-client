import { useFocusEffect, useRouter, type Href } from "expo-router";
import { ArrowRight, Award, Bug, Check, Copy, Lock, UserPlus, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SegmentBar } from "@/components/HomeSmartTile";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { copyText } from "@/lib/copyText";
import {
  canInvite,
  completeLine,
  FOUNDING_TESTER_LABEL,
  FOUNDING_TESTER_REWARD_DAYS,
  FOUNDING_TESTER_STEPS,
  foundingTesterView,
  INVITE_ROUTE,
  missionVoucher,
  stepAccessibilityLabel,
  stepAction,
  stepStatusLine,
  stepWaiting,
  type EarnedView,
  type MissionsView,
  type StepRow,
} from "@/lib/foundingTester";
import { bugRewardTag, VOUCHERS_ROUTE } from "@/lib/homeSummary";
import { REPORT_ROUTE } from "@/lib/quickActions";
import { startPrintHref } from "@/lib/startPrint";
import { exactTime, groupedCode, stubAmount } from "@/lib/vouchers";
import { cartIsOpen, useCart } from "@/store/cart";
import { useFoundingTester } from "@/store/foundingTester";
import { useHomeSummary, useOwnHomeSummary } from "@/store/homeSummary";
import { useSession } from "@/store/session";

/**
 * Founding Tester (client#335): the five mission steps, in order, on one
 * screen opened from Home's smart tile and the "+" sheet.
 *
 * Every tick is GRIDGO's (`foundingTesterView` reads the account's own
 * projection): this screen never marks a step done. Each step is Done,
 * Current with the one button that does it, or Locked until the step before
 * it counts. Once all five count and GRIDGO issues the reward, the voucher
 * appears here by itself — its code, Copy, and when it expires.
 */
export default function FoundingTesterScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const refreshAccount = useSession((s) => s.refresh);
  const summary = useOwnHomeSummary();
  const cartOpen = useCart(cartIsOpen);
  const openSurveys = useFoundingTester((s) => s.openSurveys);
  const [orders, setOrders] = useState<api.Order[] | undefined>(undefined);
  const view = foundingTesterView(user);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void refreshAccount();
      void useHomeSummary.getState().load(useSession.getState().user?.id ?? null);
      void useFoundingTester.getState().loadOpenSurveys();
      api
        .listOrders()
        .then((rows) => {
          if (live) setOrders(rows);
        })
        .catch(() => {
          // The step buttons fall back to the Orders tab.
        });
      return () => {
        live = false;
      };
    }, [refreshAccount]),
  );

  const go = (href: string) => router.push(href as Href);
  const bugTag = bugRewardTag(summary);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-8 pt-4">
          {view?.kind === "missions" ? (
            <MissionHero view={view} />
          ) : view?.kind === "earned" ? (
            <EarnedHero view={view} voucher={missionVoucher(summary?.testerVoucher)} onUse={() => go(startPrintHref())} onWallet={() => go(VOUCHERS_ROUTE)} />
          ) : (
            <EmptyState
              title="Not open for this account"
              body="The Founding Tester steps are for GRIDGO's first clients. You can still invite a friend."
            />
          )}

          {view?.kind === "missions" ? (
            <View>
              {view.steps.map((step, index) => (
                <StepItem
                  key={step.key}
                  step={step}
                  index={index}
                  total={view.steps.length}
                  last={index === view.steps.length - 1}
                  action={
                    step.status === "next"
                      ? stepAction(step.key, { orders, openSurveyOrderIds: openSurveys ?? undefined, cartOpen, startHref: startPrintHref() })
                      : null
                  }
                  onAction={go}
                />
              ))}
            </View>
          ) : view?.kind === "earned" ? (
            <View>
              {FOUNDING_TESTER_STEPS.map((_, index) => (
                <DoneRow key={index} index={index} />
              ))}
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <FooterTile
              icon={Bug}
              title="Report a bug"
              detail={bugTag ? `Earn ${bugTag} · once` : "Tell GRIDGO what broke"}
              tag={bugTag}
              onPress={() => go(REPORT_ROUTE)}
            />
            {canInvite(user) ? (
              <FooterTile icon={UserPlus} title="Invite a friend" detail="Share your tester link" onPress={() => go(INVITE_ROUTE)} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function YouEarn() {
  const colors = useThemeColors();
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="text-caption font-bold text-action-yellow-on">You earn:</Text>
      <View className="flex-row items-center gap-1 rounded-pill bg-accent px-2.5 py-1">
        <Award size={12} color={colors.accentOn} strokeWidth={2} />
        <Text className="text-caption font-bold text-accent-on">{FOUNDING_TESTER_LABEL} label</Text>
      </View>
      <View className="rounded-pill border border-action-yellow-on px-2.5 py-1">
        <Text className="text-caption font-bold text-action-yellow-on">Voucher · {FOUNDING_TESTER_REWARD_DAYS} days</Text>
      </View>
    </View>
  );
}

function HeroBadge() {
  const colors = useThemeColors();
  return (
    <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent">
      <Award size={26} color={colors.accentOn} strokeWidth={2} />
    </View>
  );
}

function MissionHero({ view }: { view: MissionsView }) {
  return (
    <View testID="mission-hero" className="gap-3 rounded-card bg-action-yellow p-4">
      <View className="flex-row items-center gap-3">
        <HeroBadge />
        <View className="min-w-0 flex-1">
          <Text className="text-overline text-action-yellow-on">MISSION</Text>
          <Text className="text-h2 text-action-yellow-on">Become a {FOUNDING_TESTER_LABEL}</Text>
          <Text className="text-caption text-action-yellow-on">
            {view.complete ? completeLine(view) : `${view.doneCount} of ${view.steps.length} done`}
          </Text>
        </View>
      </View>
      <SegmentBar done={view.doneCount} total={view.steps.length} tone="ink" />
      <YouEarn />
    </View>
  );
}

function EarnedHero({
  view,
  voucher,
  onUse,
  onWallet,
}: {
  view: EarnedView;
  voucher: api.HomeTesterVoucher | null;
  onUse: () => void;
  onWallet: () => void;
}) {
  const colors = useThemeColors();
  const [copied, setCopied] = useState(false);
  const amount = voucher ? stubAmount(voucher.valueMinor) : view.reward ? stubAmount(view.reward.valueMinor) : null;
  const expires = voucher?.expiresAt ?? view.reward?.expiresAt ?? null;
  return (
    <View testID="earned-hero" className="gap-3 rounded-card bg-action-yellow p-4">
      <View className="flex-row items-center gap-3">
        <HeroBadge />
        <View className="min-w-0 flex-1">
          <Text className="text-overline text-action-yellow-on">MISSION COMPLETE</Text>
          <Text className="text-h2 text-action-yellow-on">You&apos;re a {view.label}!</Text>
          <Text className="text-caption text-action-yellow-on">Your label is now on your account.</Text>
        </View>
      </View>
      {amount ? (
        <View className="gap-1 rounded-card border-2 border-dashed border-action-yellow-on p-3">
          <Text className="text-overline text-action-yellow-on">
            YOUR VOUCHER{expires ? ` · EXPIRES ${exactTime(expires).toUpperCase()}` : ""}
          </Text>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-h1 text-action-yellow-on">{amount} off</Text>
              {voucher ? (
                <Text selectable className="text-body font-medium text-action-yellow-on" style={{ letterSpacing: 1 }}>
                  {groupedCode(voucher.code)}
                </Text>
              ) : null}
            </View>
            {voucher ? (
              <Pressable
                onPress={() => {
                  void copyText(voucher.code).then(setCopied);
                }}
                accessibilityRole="button"
                accessibilityLabel={copied ? "Code copied" : "Copy voucher code"}
                className="h-11 w-11 items-center justify-center rounded-field bg-accent"
              >
                {copied ? <Check size={18} color={colors.accentOn} strokeWidth={2.5} /> : <Copy size={18} color={colors.accentOn} strokeWidth={2} />}
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Text className="text-body text-action-yellow-on">Your voucher shows in your wallet once GRIDGO has added it.</Text>
      )}
      <Pressable
        onPress={voucher ? onUse : onWallet}
        accessibilityRole="button"
        className="gg-btn bg-accent"
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        <Text className="text-button text-accent-on">{voucher ? "Use it on your next print" : "See my vouchers"}</Text>
        <ArrowRight size={16} color={colors.accentOn} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const DISC = 32;

function StepItem({
  step,
  index,
  total,
  last,
  action,
  onAction,
}: {
  step: StepRow;
  index: number;
  total: number;
  last: boolean;
  action: ReturnType<typeof stepAction>;
  onAction: (href: string) => void;
}) {
  const colors = useThemeColors();
  const current = step.status === "next";
  const waiting = current && !action ? stepWaiting(step.key) : null;
  return (
    <View className="flex-row gap-3" testID={`mission-step-${step.key}`}>
      <View className="items-center" style={{ width: DISC }}>
        <View
          className={
            step.status === "done"
              ? "items-center justify-center rounded-pill bg-brand"
              : current
                ? "items-center justify-center rounded-pill border-2 border-accent bg-surface"
                : "items-center justify-center rounded-pill bg-surface-variant"
          }
          style={{ width: DISC, height: DISC }}
        >
          {step.status === "done" ? (
            <Check size={16} color={colors.actionYellowOn} strokeWidth={3} />
          ) : current ? (
            <Text className="text-button text-text-primary">{index + 1}</Text>
          ) : (
            <Lock size={14} color={colors.textMuted} strokeWidth={2} />
          )}
        </View>
        {last ? null : <View className="w-0.5 flex-1 bg-outline" />}
      </View>
      <View
        accessible={!current}
        accessibilityLabel={stepAccessibilityLabel(step, index, total)}
        className={current ? "mb-3 flex-1 gap-2 rounded-card border border-outline bg-surface p-3" : "mb-3 min-h-11 flex-1 justify-center pb-1"}
      >
        <View>
          <Text className={step.status === "later" ? "text-body-lg font-bold text-text-muted" : "text-body-lg font-bold text-text-primary"}>
            {step.title}
          </Text>
          <Text className={step.status === "done" ? "text-caption font-medium text-brand" : "text-caption text-text-secondary"}>
            {stepStatusLine(step, index)}
          </Text>
        </View>
        {action ? (
          <Pressable
            onPress={() => onAction(action.href)}
            accessibilityRole="button"
            className="gg-btn self-start bg-accent"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-button text-accent-on">{action.label}</Text>
            <ArrowRight size={16} color={colors.accentOn} strokeWidth={2.25} />
          </Pressable>
        ) : waiting ? (
          <Text className="text-caption text-text-muted">{waiting}</Text>
        ) : null}
      </View>
    </View>
  );
}

function DoneRow({ index }: { index: number }) {
  const step = FOUNDING_TESTER_STEPS[index];
  return (
    <StepItem
      step={{ ...step, status: "done" }}
      index={index}
      total={FOUNDING_TESTER_STEPS.length}
      last={index === FOUNDING_TESTER_STEPS.length - 1}
      action={null}
      onAction={() => undefined}
    />
  );
}

function FooterTile({
  icon: Icon,
  title,
  detail,
  tag,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  tag?: string | null;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      className="min-h-16 flex-1 flex-row items-center gap-3 rounded-card border border-outline bg-surface p-3"
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : undefined)}
    >
      <View className={tag ? "h-9 w-9 items-center justify-center rounded-pill bg-brand" : "h-9 w-9 items-center justify-center rounded-pill bg-surface-variant"}>
        <Icon size={18} color={tag ? colors.actionYellowOn : colors.textPrimary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}
