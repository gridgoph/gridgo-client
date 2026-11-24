import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, CircleX, MapPin, Store, UserMinus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeliveryMap } from "@/components/DeliveryMap";
import { ErrorState } from "@/components/ErrorState";
import { RatingCard } from "@/components/express/ExpressOrderCards";
import {
  arrivalLine,
  GroupCodeCard,
  GroupHeader,
  GroupRail,
  InviteRow,
  InviteSheet,
  ManageSheet,
  MembersCard,
  MyShareCard,
} from "@/components/express/GroupCards";
import { Screen } from "@/components/Screen";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import * as api from "@/lib/api";
import { distanceLabel } from "@/lib/express";
import {
  cancelReasonLine,
  firstName,
  groupPhase,
  isHost,
  riderPoint,
  timeLeft,
  trackingIndex,
  trackingLine,
} from "@/lib/expressGroup";
import { lastUpdatedLine, trackingRefreshMs } from "@/lib/tracking";
import { useExpress } from "@/store/express";
import { useExpressGroup } from "@/store/expressGroup";
import { useSession } from "@/store/session";

/** How often an open group is read again, so joins and files show up without a pull. */
const OPEN_REFRESH_MS = 15_000;

function PrimaryAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={disabled ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
    >
      <Text className="text-button text-action-yellow-on">{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      <Text className="text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}

function QuietLink({ label, onPress, tone = "default" }: { label: string; onPress: () => void; tone?: "default" | "danger" }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="min-h-11 items-center justify-center">
      <Text className={tone === "danger" ? "text-body font-medium text-error underline" : "text-body font-medium text-text-primary underline"}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The host's use-or-cancel on a same-zone replacement shop (gridgo-api#414).
 * Same price; no answer in time keeps the new shop.
 */
function ShopDecisionCard({ group, decision, now }: { group: api.ExpressGroup; decision: api.ExpressGroupShopDecision; now: number }) {
  const colors = useThemeColors();
  const busy = useExpressGroup((state) => state.busy === "decision");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const left = timeLeft(decision.deadlineAt, now);
  const pickup = group.fulfillmentMode === "pickup";
  return (
    <View className="gg-card gap-3" accessibilityLiveRegion="polite">
      <View className="gap-1">
        <Text className="text-body-lg font-bold text-text-primary">The shop changed</Text>
        <Text className="text-body text-text-secondary">
          The first shop could not take it. GRIDGO found another one nearby at the same price.
        </Text>
      </View>
      <View className="flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2.5">
        <Store size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1">
          <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
            {decision.shopName}
          </Text>
          <Text className="text-caption text-text-secondary">
            {distanceLabel(decision.distanceMeters)} {pickup ? "from you" : "from your address"} · same price
          </Text>
        </View>
      </View>
      {pickup && decision.location ? (
        <View className="overflow-hidden rounded-card">
          <DeliveryMap pickup={decision.location} pickupMark="Shop" dropoff={null} rider={null} stale={false} route={[]} routed={false} hideZoom />
          {decision.location.label ? (
            <View className="flex-row items-center gap-2 pt-2">
              <MapPin size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />
              <Text className="min-w-0 flex-1 text-caption text-text-muted">{decision.location.label}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text className="text-caption text-text-muted">
        {left ? `${left} to choose. If you do not, GRIDGO uses this shop.` : "Time is up. GRIDGO is using this shop."}
      </Text>
      <PrimaryAction label={busy ? "Saving…" : "Use this shop"} disabled={busy || !left} onPress={() => void useExpressGroup.getState().decide(group.id, "use")} />
      <SecondaryAction label="Cancel for free" disabled={busy || !left} onPress={() => setConfirmCancel(true)} />
      <ConfirmDialog
        visible={confirmCancel}
        question="Cancel the group order?"
        body="Nothing has been printed. Everyone is told, and anything you paid comes back to you through a refund."
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        tone="destructive"
        busy={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void useExpressGroup.getState().decide(group.id, "cancel");
        }}
      />
    </View>
  );
}

/**
 * One group order, for the host and for every member (gridgo-client#450–#452).
 * Open: who is in, how long is left, my share and my files. Checkout: the
 * host pays once; members wait. Ordered: the same tracker for everyone, the
 * code for the host only, and what each person owes the host.
 */
export default function GroupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  const group = useExpressGroup((state) => (id ? state.byId[id] : undefined));
  const tracking = useExpressGroup((state) => (id ? state.tracking[id] : undefined));
  const token = useExpressGroup((state) => (id ? (state.tokens[id] ?? null) : null));
  const loadError = useExpressGroup((state) => (id ? state.loadError[id] : undefined));
  const gone = useExpressGroup((state) => (id ? state.gone[id] : undefined));
  const busy = useExpressGroup((state) => state.busy);
  const actionError = useExpressGroup((state) => state.error);
  const userId = useSession((state) => state.user?.id ?? null);
  const now = useServerNow(1000);
  const [inviteOpen, setInviteOpen] = useState(invite === "1");
  const [managing, setManaging] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "cancel" | "remove" | null>(null);
  // Who "Remove" is about. The manage sheet closes under the question, so it
  // cannot be read back from the sheet.
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);

  const phase = group ? groupPhase(group) : null;
  const host = group ? isHost(group, userId) : false;

  const load = useCallback(async () => {
    if (!id) return;
    const fresh = await useExpressGroup.getState().load(id);
    if (fresh && fresh.tracking) await useExpressGroup.getState().loadTracking(id);
  }, [id]);

  useLiveRefresh(["orders", "notifications", "dispatch"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      useExpressGroup.getState().clearError();
      void load();
    }, [load]),
  );

  // Joins and files land without a pull while the group is open; the rider's
  // position at GRIDGO's own cadence while it is on the way. Once the timer
  // runs out, read again until GRIDGO has opened checkout.
  const closed = phase === "open" && group ? timeLeft(group.closesAt, now) == null : false;
  const refreshMs =
    phase === "open" ? (closed ? 4_000 : OPEN_REFRESH_MS) : phase === "checkout" ? OPEN_REFRESH_MS : phase === "ordered" ? trackingRefreshMs(tracking?.riderTracking ?? null, null) : null;
  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => void load(), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, load]);

  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Home</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (!group && gone) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-4 pt-10">
          <View className="items-center gap-3 px-4">
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-surface-variant">
              <UserMinus size={24} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            </View>
            <Text className="text-center text-h3 font-bold text-text-primary">Not in this group</Text>
            <Text className="text-center text-body text-text-secondary">{gone}</Text>
          </View>
          <Pressable onPress={() => router.replace("/express")} accessibilityRole="button" className="gg-btn-secondary">
            <Text className="text-button text-text-primary">Print on your own</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!group) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-3 pt-4">
          {loadError ? (
            <ErrorState label="Group not loaded" body={loadError} onRetry={() => void load()} />
          ) : (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading the group" className="gap-3">
              <SkeletonBlock className="h-40" />
              <SkeletonLine width="w-1/2" height="h-6" />
              <SkeletonBlock className="h-28" />
            </View>
          )}
        </View>
      </Screen>
    );
  }

  const hostName = firstName(group.host.name);
  const managed = group.members?.find((row) => row.userId === managing) ?? null;
  const myFiles = group.me.fileCount > 0;
  const hasFiles = group.printingPeople > 0;
  const index = trackingIndex(group.status, tracking?.state ?? group.tracking?.state, group.fulfillmentMode);
  const view = tracking ?? group.tracking ?? null;
  const rider = riderPoint(tracking ?? null);
  const delivery = group.fulfillmentMode === "delivery";
  const arrival = arrivalLine(view?.estimatedArrivalAt, now);
  const decision = host && view?.shopDecision?.status === "pending" ? view.shopDecision : null;
  const pickupCode = host && view?.pickupCode ? view.pickupCode : null;
  const deliveryCode = host && view?.deliveryCode && index != null && index >= 3 && index < 5 ? view.deliveryCode : null;
  const done = phase === "completed" || index === (delivery ? 5 : 4);

  const editFiles = async () => {
    setOpening(true);
    setOpenError(null);
    const failure = await useExpress.getState().startGroupFiles(group.id, group.me.files);
    setOpening(false);
    if (failure) {
      setOpenError(failure);
      return;
    }
    router.push("/express");
  };

  const checkout = () => router.push({ pathname: "/express/group/checkout", params: { id: group.id } });

  const fileAction = (
    <View className="gap-2 pt-1">
      {phase === "open" ? (
        host || myFiles ? (
          <SecondaryAction label={opening ? "Opening…" : myFiles ? "Edit my files" : "Add my files"} disabled={opening} onPress={() => void editFiles()} />
        ) : (
          <PrimaryAction label={opening ? "Opening…" : "Add your files"} disabled={opening} onPress={() => void editFiles()} />
        )
      ) : null}
      {openError ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {openError}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen edges={["bottom"]}>
      {headerEscape}
      <Stack.Screen options={{ title: "Group order" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        {phase === "cancelled" ? (
          <View className="gg-card gap-2" accessibilityLiveRegion="polite">
            <View className="flex-row items-center gap-2">
              <CircleX size={20} color={colors.error} strokeWidth={2} aria-hidden />
              <Text className="text-body-lg font-bold text-text-primary">Group cancelled</Text>
            </View>
            <Text className="text-body text-text-secondary">{cancelReasonLine(group.cancelReason)}</Text>
            {!host ? <Text className="text-body text-text-secondary">Nothing was printed, so you owe {hostName} nothing.</Text> : null}
            {host && view?.orderId ? (
              <SecondaryAction label="See your refund" onPress={() => router.push({ pathname: "/express/order/[id]", params: { id: view.orderId } })} />
            ) : null}
            <QuietLink label="Start a new Express order" onPress={() => router.replace("/express")} />
          </View>
        ) : phase === "open" || phase === "checkout" ? (
          <GroupHeader group={group} now={now} host={host} />
        ) : null}

        {phase === "open" && host ? <InviteRow onPress={() => setInviteOpen(true)} people={group.people} /> : null}

        {phase === "checkout" ? (
          <View className="gg-card gap-2">
            <Text className="text-body-lg font-bold text-text-primary">Files are locked</Text>
            <Text className="text-body text-text-secondary">
              {host
                ? "No more joins or changes. Pay once for everyone, and the order goes to the shop."
                : `${hostName} is checking out for everyone. You will see the order here once it is paid.`}
            </Text>
            {host ? (
              <PrimaryAction label={hasFiles ? "Check out" : "Nobody added files"} disabled={!hasFiles} onPress={checkout} />
            ) : null}
          </View>
        ) : null}

        {phase === "ordered" || phase === "completed" ? (
          <View className="gg-card gap-3" accessibilityLiveRegion="polite">
            <Text className="text-body-lg font-bold text-text-primary">
              {done ? (delivery ? "Delivered" : "Picked up") : index == null ? "Cancelled" : "Your group order"}
            </Text>
            {index != null ? <GroupRail index={index} mode={group.fulfillmentMode} /> : null}
            <Text className="text-body text-text-secondary">{trackingLine(index, group.fulfillmentMode, host, group.host.name)}</Text>
            {arrival ? <Text className="text-body text-text-primary">{arrival}</Text> : null}
          </View>
        ) : null}

        {decision ? <ShopDecisionCard group={group} decision={decision} now={now} /> : null}
        {pickupCode && index === 3 ? (
          <GroupCodeCard
            code={pickupCode}
            kind="pickup"
            // GRIDGO names the shop here only after a replacement; otherwise the order details have it.
            place={view?.shopDecision && view.shopDecision.status !== "cancel" ? `${view.shopDecision.shopName} · ${view.shopDecision.location?.label ?? ""}`.replace(/ · $/, "") : null}
          />
        ) : null}
        {deliveryCode ? <GroupCodeCard code={deliveryCode} kind="delivery" /> : null}

        {phase === "ordered" && delivery && index === 4 ? (
          <View className="gap-2">
            {rider ? (
              <View className="overflow-hidden rounded-card">
                <DeliveryMap
                  pickup={null}
                  dropoff={host ? (group.dropoff ?? null) : null}
                  rider={rider}
                  stale={tracking?.riderTracking?.stale === true}
                  route={[]}
                  routed={false}
                />
              </View>
            ) : null}
            <Text className="text-caption text-text-muted">
              {rider
                ? (lastUpdatedLine(tracking?.riderTracking?.ageSeconds ?? null) ?? "Rider location shared")
                : "The rider has not shared a location yet."}
            </Text>
          </View>
        ) : null}

        {/* A host who brought no files has nothing of their own to show once files lock. */}
        {phase !== "cancelled" && (phase === "open" || group.me.fileCount > 0) ? (
          <MyShareCard group={group} host={host}>
            {phase === "ordered" || phase === "completed" ? (
              !host && group.me.fileCount > 0 ? (
                <Text className={group.me.paidBack ? "text-caption font-bold text-success" : "text-caption text-text-secondary"}>
                  {group.me.paidBack ? `${hostName} marked you as paid back.` : `${hostName} has not marked you as paid back yet.`}
                </Text>
              ) : null
            ) : (
              fileAction
            )}
          </MyShareCard>
        ) : null}

        {host && group.members && phase !== "cancelled" ? (
          <MembersCard
            group={group}
            showPaidBack={phase !== "open"}
            onManage={(member) => {
              useExpressGroup.getState().clearError();
              setManaging(member.userId);
            }}
          />
        ) : null}

        {phase === "open" && host ? (
          <View className="gap-2">
            <PrimaryAction label={hasFiles ? "Close and check out" : "Waiting for files"} disabled={!hasFiles || busy === "close"} onPress={() => void useExpressGroup.getState().close(group.id)} />
            <Text className="text-center text-caption text-text-muted">
              Checkout opens by itself when the time is up. Closing now stops new files.
            </Text>
          </View>
        ) : null}

        {actionError && managing == null ? (
          <Text className="text-caption text-error" accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}

        {done && !group.me.review && !rated ? (
          <RatingCard
            orderId={view?.orderId ?? group.id}
            title={host ? "How was the group order?" : "How did your prints turn out?"}
            rate={(body) => api.reviewExpressGroup(group.id, body)}
            onRated={() => setRated(true)}
          />
        ) : null}
        {rated ? (
          <Text className="text-body text-text-secondary" accessibilityLiveRegion="polite">
            Thanks. Your rating is in.
          </Text>
        ) : null}

        {host && view?.orderId && phase !== "cancelled" ? (
          <QuietLink label={done ? "Rate the shop and see the receipt" : "Order and payment details"} onPress={() => router.push({ pathname: "/express/order/[id]", params: { id: view.orderId } })} />
        ) : null}
        {phase === "open" && !host ? <QuietLink label="Leave group" tone="danger" onPress={() => setConfirm("leave")} /> : null}
        {(phase === "open" || phase === "checkout") && host ? <QuietLink label="Cancel group" tone="danger" onPress={() => setConfirm("cancel")} /> : null}
      </ScrollView>

      {host ? <InviteSheet open={inviteOpen && phase === "open"} onClose={() => setInviteOpen(false)} group={group} token={token} /> : null}
      <ManageSheet
        member={managed}
        canRemove={phase === "open"}
        busy={busy === "paid_back" || busy === "remove"}
        error={actionError}
        onClose={() => setManaging(null)}
        onPaidBack={(paidBack) => managed && void useExpressGroup.getState().setPaidBack(group.id, managed.userId, paidBack)}
        onRemove={() => {
          if (managed) setRemoving({ userId: managed.userId, name: managed.name });
          setManaging(null);
          setConfirm("remove");
        }}
      />
      <ConfirmDialog
        visible={confirm != null}
        question={
          confirm === "leave" ? "Leave this group?" : confirm === "remove" ? `Remove ${removing ? firstName(removing.name) : "them"}?` : "Cancel the group?"
        }
        body={
          confirm === "leave"
            ? "Your files leave the order and you are not charged. You can join again while the group is open."
            : confirm === "remove"
              ? "Their files leave the order. They are told they were removed and nothing of theirs was ordered."
              : "Everyone is told. Nothing has been ordered or paid."
        }
        confirmLabel={confirm === "leave" ? "Leave group" : confirm === "remove" ? "Remove" : "Cancel group"}
        cancelLabel={confirm === "cancel" ? "Keep group" : "Cancel"}
        tone="destructive"
        busy={busy != null}
        onCancel={() => {
          setConfirm(null);
          setRemoving(null);
        }}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === "leave") {
            void useExpressGroup.getState().leave(group.id).then((left) => {
              if (left) router.replace("/express");
            });
          } else if (action === "remove" && removing) {
            void useExpressGroup.getState().remove(group.id, removing.userId);
            setRemoving(null);
          } else if (action === "cancel") {
            void useExpressGroup.getState().cancel(group.id);
          }
        }}
      />
    </Screen>
  );
}
