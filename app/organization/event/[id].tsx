import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DangerButton } from "@/components/DangerButton";
import { ErrorState } from "@/components/ErrorState";
import { EventStatusChip, PACK_NOTE, PackButton, PackNotice } from "@/components/organization/EventParts";
import { NotFresh, PartnerGate, ProblemLine } from "@/components/organization/MemberParts";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { formatPhp } from "@/lib/api";
import { manilaDay } from "@/lib/organization";
import { countOf, EVENT_EDIT_ROUTE } from "@/lib/organizationMembers";
import type { OrganizationEventDetail } from "@/lib/organizationMembersApi";
import { orderReference } from "@/lib/orderReference";
import { useOrganizationEvents } from "@/store/organizationEvents";

/** One event's orders and its statement pack. The total is GRIDGO's own. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useOrganizationEvents((s) => (s.event?.id === id ? s.event : null));
  const status = useOrganizationEvents((s) => s.eventStatus);
  const error = useOrganizationEvents((s) => s.eventError);

  useFocusEffect(
    useCallback(() => {
      void useOrganizationEvents.getState().open(id);
    }, [id]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-6 pb-16 pt-4">
            {event ? (
              <>
                {status === "failed" && error ? (
                  <NotFresh message={error} onRetry={() => void useOrganizationEvents.getState().open(id)} />
                ) : null}
                <EventDetail event={event} />
              </>
            ) : status === "failed" ? (
              <ErrorState
                label="Event not loaded"
                body={error ?? "GRIDGO could not read this event."}
                onRetry={() => void useOrganizationEvents.getState().open(id)}
              />
            ) : (
              <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading event">
                <SkeletonBlock className="h-24 w-full rounded-card" />
                <SkeletonBlock className="h-36 w-full rounded-card" />
              </View>
            )}
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}

function EventDetail({ event }: { event: OrganizationEventDetail }) {
  const deleting = useOrganizationEvents((s) => s.deleting);
  const deleteError = useOrganizationEvents((s) => s.deleteError);
  const [asking, setAsking] = useState(false);
  const open = event.orders.filter((order) => !order.closed).length;
  const closed = event.orders.length - open;

  return (
    <>
      <View className="gap-2">
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          {event.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <EventStatusChip status={event.status} />
          <Text className="text-body text-text-secondary">
            {countOf(event.orderCount, "order", "orders")} · {formatPhp(event.totalMinor)}
          </Text>
        </View>
      </View>

      {event.orders.length ? (
        <View className="gg-card-flush">
          {event.orders.map((order, index) => (
            <View
              key={order.orderId}
              className={index ? "flex-row items-start gap-3 border-t border-outline-subtle px-4 py-3" : "flex-row items-start gap-3 px-4 py-3"}
              accessible
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
                  {order.product || "Print order"}
                </Text>
                <Text className="text-caption text-text-muted">
                  {[manilaDay(order.date) ?? order.date, orderReference(order.orderId)].filter(Boolean).join(" · ")}
                </Text>
                {order.closed ? null : <Text className="text-caption text-text-secondary">Still in progress</Text>}
              </View>
              <Text className="text-body font-medium text-text-primary">{formatPhp(order.amountMinor)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="gg-panel">
          <Text className="text-body text-text-secondary">No orders in this event yet. Edit it to choose them.</Text>
        </View>
      )}

      {event.orders.length ? (
        <View className="gap-3">
          <Text className="text-overline text-text-muted">STATEMENT PACK</Text>
          {closed ? (
            <>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <PackButton boxed event={event} format="pdf" label="PDF" />
                </View>
                <View className="flex-1">
                  <PackButton boxed event={event} format="csv" label="CSV" />
                </View>
              </View>
              <PackNotice id={event.id} />
            </>
          ) : null}
          <Text className="text-caption text-text-muted">
            {!closed
              ? "The pack is ready once an order in this event is complete. "
              : open
                ? `The pack lists complete orders only. ${countOf(open, "order is", "orders are")} still in progress. `
                : ""}
            {PACK_NOTE}
          </Text>
        </View>
      ) : null}

      <View className="gap-3">
        {deleteError ? <ProblemLine message={deleteError} /> : null}
        <SecondaryButton
          label="Edit event"
          disabled={deleting}
          onPress={() => {
            useOrganizationEvents.getState().startForm(event);
            router.push(EVENT_EDIT_ROUTE);
          }}
        />
        <DangerButton label={deleting ? "Deleting…" : "Delete event"} disabled={deleting} onPress={() => setAsking(true)} />
      </View>

      <ConfirmDialog
        visible={asking}
        question={`Delete ${event.name}?`}
        body="Only the grouping is deleted. The orders and their receipts stay, and you can put them in another event."
        confirmLabel="Delete event"
        cancelLabel="Keep event"
        tone="destructive"
        onConfirm={() => {
          setAsking(false);
          void useOrganizationEvents
            .getState()
            .remove()
            .then((removed) => {
              if (removed) router.back();
            });
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
