import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { DropoffDetails } from "@/components/DropoffDetails";
import { DropoffLocator } from "@/components/DropoffLocator";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { isGeoPoint } from "@/lib/tracking";

type Props = {
  order: api.Order;
  onUpdated: (order: api.Order) => void;
  onRefresh: () => void;
};

/** The order screen's FormScreen owns keyboard scrolling for this inline editor. */
export function DropoffConfirmationCard({ order, onUpdated, onRefresh }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const editor = useDropoffEditor({ skipPrePin: true });
  const confirmation = order.dropoffConfirmation;
  if (order.state !== "out_for_delivery" || order.fulfillmentMode !== "delivery" || !confirmation) return null;

  const answer = async (input: api.DropoffAnswer) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.answerDropoffConfirmation(order.id, input);
      onUpdated({ ...order, dropoffConfirmation: saved, dropoff: saved.status === "confirmed" ? saved.point : order.dropoff });
      setEditing(false);
    } catch (caught) {
      setError(userFacingError(caught, "Your drop-off was not confirmed. Check your connection and try again."));
      if (caught instanceof api.ApiError && caught.status === 409) onRefresh();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (confirmation.status === "confirmed") {
    return (
      <View className="gg-card gap-3">
        <StatusChip tone="success" icon="circle-check" label="Drop-off confirmed" />
        <Text className="text-body text-text-primary">{confirmation.point.label}</Text>
        <Text className="text-body text-text-secondary">Your rider has this pin. Your delivery fee is unchanged.</Text>
      </View>
    );
  }
  if (confirmation.status === "needs_review") {
    return (
      <View className="gg-card gap-3">
        <StatusChip tone="warning" icon="triangle-alert" label="GRIDGO will contact you" />
        <Text className="text-h3 text-text-primary">Your change needs a check</Text>
        <Text className="text-body text-text-secondary">
          This spot changes the delivery fee. Your original drop-off and payment are unchanged. GRIDGO will contact you.
        </Text>
        <Text className="text-body text-text-primary">Current drop-off: {order.dropoff?.label || order.address}</Text>
        <Text className="text-body text-text-secondary">Requested: {confirmation.requestedPoint.label}</Text>
      </View>
    );
  }

  const changePin = () => {
    if (isGeoPoint(order.dropoff)) {
      editor.loadSaved({ label: "", line1: order.dropoff?.label || order.address, landmark: "", point: order.dropoff });
    }
    setError(null);
    setEditing(true);
  };
  const savePin = () => {
    editor.setTouched(true);
    if (!editor.ready || !editor.point || editor.reversing || editor.locating) return;
    if (editor.addressLine.length > 240) {
      setError("Keep the street and landmark to 240 characters or fewer.");
      return;
    }
    void answer({ action: "change", point: { ...editor.point, label: editor.addressLine } });
  };

  return (
    <View className="gg-card gap-4">
      <StatusChip tone="info" icon="clock" label="Your rider is on the way" />
      <Text accessibilityRole="header" className="text-h2 text-text-primary">
        {editing ? "Choose your drop-off" : "Is this still your drop-off?"}
      </Text>
      <Text className="text-body text-text-secondary">
        {editing
          ? "Choose the spot where you will meet your rider. A change is applied only if the delivery fee stays the same. Otherwise, GRIDGO will contact you and your current pin stays."
          : "Confirm the pin or choose a different spot. Until you answer, your rider follows the current pin."}
      </Text>
      <View className="rounded-card bg-surface-variant p-4 gap-1">
        <Text className="text-caption text-text-muted">Current drop-off</Text>
        <Text className="text-body-lg text-text-primary">{order.dropoff?.label || order.address}</Text>
      </View>
      {editing ? (
        <View pointerEvents={busy ? "none" : "auto"} className="gap-4">
          <DropoffLocator editor={editor} />
          <DropoffDetails editor={editor} labelLocked />
          {editor.notice ? <Text className="text-body text-text-secondary">{editor.notice}</Text> : null}
        </View>
      ) : null}
      {error ? <ErrorState label="Not confirmed" body={error} /> : null}
      <PrimaryButton
        label={busy ? "Sending…" : editing ? "Send this drop-off" : "Yes, deliver here"}
        disabled={busy || (editing && (editor.reversing || editor.locating))}
        onPress={editing ? savePin : () => void answer({ action: "confirm" })}
      />
      <SecondaryButton
        label={editing ? "Cancel change" : "Change the pin"}
        disabled={busy}
        onPress={editing ? () => { setEditing(false); setError(null); } : changePin}
      />
    </View>
  );
}
