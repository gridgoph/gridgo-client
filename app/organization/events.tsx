import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { EventRow, PACK_NOTE } from "@/components/organization/EventParts";
import { NotFresh, PartnerGate } from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/Skeleton";
import { EVENT_EDIT_ROUTE, eventRoute } from "@/lib/organizationMembers";
import { useOrganizationEvents } from "@/store/organizationEvents";

/** Partnership → All events: the organization's orders, grouped for liquidation. */
export default function EventsScreen() {
  const list = useOrganizationEvents((s) => s.list);
  const status = useOrganizationEvents((s) => s.status);
  const error = useOrganizationEvents((s) => s.error);
  const load = useCallback(() => useOrganizationEvents.getState().loadList(), []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const add = () => {
    useOrganizationEvents.getState().startForm(null);
    router.push(EVENT_EDIT_ROUTE);
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-4 pb-16 pt-4">
            {list.length ? (
              <>
                {error ? <NotFresh message={error} onRetry={() => void load()} /> : null}
                <View className="gg-card-flush">
                  {list.map((event, index) => (
                    <EventRow key={event.id} event={event} divided={index > 0} onOpen={() => router.push(eventRoute(event.id))} />
                  ))}
                </View>
                <Text className="text-caption text-text-muted">{PACK_NOTE}</Text>
                <PrimaryButton label="Add an event" onPress={add} />
              </>
            ) : status === "failed" ? (
              <ErrorState label="Events not loaded" body={error ?? "GRIDGO could not read your events."} onRetry={() => void load()} />
            ) : status === "ready" ? (
              <EmptyState
                title="No events yet"
                body="Group your organization's orders by event, then download one statement for each."
                actionLabel="Add an event"
                onAction={add}
              />
            ) : (
              <SkeletonList count={3} />
            )}
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}
