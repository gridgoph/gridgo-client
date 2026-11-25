import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { CheckboxRow } from "@/components/form/CheckboxRow";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { FormScreen } from "@/components/FormScreen";
import { ErrorState } from "@/components/ErrorState";
import { PartnerGate, ProblemLine } from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { formatPhp } from "@/lib/api";
import { manilaDay } from "@/lib/organization";
import { countOf, eventRoute } from "@/lib/organizationMembers";
import { orderReference } from "@/lib/orderReference";
import { orderStateMeta } from "@/lib/orderState";
import { useOrganizationEvents } from "@/store/organizationEvents";

/** Naming an event and choosing which of the organization's own orders belong to it. */
export default function EventEditScreen() {
  const event = useOrganizationEvents((s) => s.event);
  const name = useOrganizationEvents((s) => s.name);
  const picked = useOrganizationEvents((s) => s.picked);
  const taken = useOrganizationEvents((s) => s.taken);
  const orders = useOrganizationEvents((s) => s.orders);
  const status = useOrganizationEvents((s) => s.ordersStatus);
  const ordersError = useOrganizationEvents((s) => s.ordersError);
  const saving = useOrganizationEvents((s) => s.saving);
  const saveError = useOrganizationEvents((s) => s.saveError);
  const [tried, setTried] = useState(false);
  const store = useOrganizationEvents.getState();
  const noName = tried && !name.trim();

  useFocusEffect(
    useCallback(() => {
      void useOrganizationEvents.getState().loadOrders();
    }, []),
  );

  const save = async () => {
    setTried(true);
    const editing = event !== null;
    const id = await store.save();
    if (!id) return;
    if (editing) router.back();
    else router.replace(eventRoute(id));
  };

  return (
    <FormScreen>
      <PartnerGate>
        <View className="gg-page gap-6 pb-16 pt-4">
          <FormField
            label="Event name"
            helper="What your organization calls it, such as Sports Day."
            error={noName ? "Give the event a name." : null}
          >
            <TextField
              value={name}
              onChangeText={store.setName}
              accessibilityLabel="Event name"
              maxLength={120}
              editable={!saving}
              invalid={noName}
            />
          </FormField>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">
              {`YOUR ORGANIZATION'S ORDERS${picked.length ? ` · ${picked.length} TICKED` : ""}`}
            </Text>
            {orders.length ? (
              <View className="gg-card-flush">
                {orders.map((order, index) => {
                  const elsewhere = taken.includes(order.id);
                  const line = [
                    manilaDay(order.createdAt),
                    order.totalMinor == null ? null : formatPhp(order.totalMinor),
                    orderReference(order.id),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <View key={order.id} className={index ? "border-t border-outline-subtle px-4 py-1" : "px-4 py-1"}>
                      <CheckboxRow
                        checked={picked.includes(order.id)}
                        onChange={() => store.togglePicked(order.id)}
                        disabled={saving || elsewhere}
                        label={order.title}
                        hint={elsewhere ? `${line}\nAlready in another event` : `${line}\n${orderStateMeta(order).label}`}
                      />
                    </View>
                  );
                })}
              </View>
            ) : status === "failed" ? (
              <ErrorState label="Orders not loaded" body={ordersError ?? "GRIDGO could not read your orders."} onRetry={() => void store.loadOrders()} />
            ) : status === "ready" ? (
              <View className="gg-panel">
                <Text className="text-body text-text-secondary">
                  Your organization has no orders yet. You can save the event now and add orders later.
                </Text>
              </View>
            ) : (
              <SkeletonList count={3} />
            )}
          </View>

          <View className="gap-3">
            {saveError ? <ProblemLine message={saveError} /> : null}
            <PrimaryButton
              label={saving ? "Saving…" : event ? "Save event" : picked.length ? `Save event with ${countOf(picked.length, "order", "orders")}` : "Save event"}
              disabled={saving}
              onPress={() => void save()}
            />
          </View>
        </View>
      </PartnerGate>
    </FormScreen>
  );
}
