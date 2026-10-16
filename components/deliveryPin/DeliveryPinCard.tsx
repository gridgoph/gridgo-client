import { MapPinned, Repeat2, UserRound } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DeliveryMap } from "@/components/DeliveryMap";
import { PinDetailsFields, pinDetailsFrom, pinDetailsProblem, receiverFor, type PinDetails } from "@/components/deliveryPin/PinDetailsFields";
import { PinPaymentForm } from "@/components/deliveryPin/PinPaymentForm";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  appliedChangeLine,
  changeAllowanceLine,
  deliveryPinView,
  feeDifferenceLine,
  pinZoneLabel,
  receiverLine,
  type DeliveryPinView,
} from "@/lib/deliveryPin";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { isGeoPoint } from "@/lib/tracking";
import { usePlatformSettings } from "@/store/platformSettings";

type Props = {
  order: api.Order;
  /** Holds the screen's one yellow control when nothing above it does. */
  primary: boolean;
  /** The tracking screen already draws the map above this card. */
  showMap?: boolean;
  onChangePin: () => void;
  onUpdated: (pin: api.DeliveryPin) => void;
  onRefresh: () => void;
};

const CHIP: Record<DeliveryPinView["kind"], { tone: StatusTone; icon: StatusIconName; label: string }> = {
  ask: { tone: "warning", icon: "map-pin", label: "Production finished" },
  pay: { tone: "warning", icon: "clock", label: "New pin not saved yet" },
  checking: { tone: "info", icon: "clock", label: "Payment being checked" },
  set: { tone: "success", icon: "circle-check", label: "You'll be there" },
};

/**
 * Where the rider is going, and whether the client will be there.
 *
 * Asked once production finishes (gridgo-api `docs/DELIVERY_PIN_API.md`). The
 * card always shows the pin in use — the address, its zone, the notes and who
 * receives it — and what the client may still do about it. A dearer change is
 * drawn as a proposal beside the pin in use, never as the pin, until
 * Operations confirms its payment.
 */
export function DeliveryPinCard({ order, primary, showMap = true, onChangePin, onUpdated, onRefresh }: Props) {
  const view = deliveryPinView(order);
  const settings = usePlatformSettings((state) => state.settings);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<PinDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  if (!view) return null;
  const { pin } = view;
  const current = details ?? pinDetailsFrom(pin);
  const confirmed = pin.status === "confirmed";
  const chip = view.kind === "set" && !confirmed
    ? { tone: "neutral" as const, icon: "clock" as const, label: "Not confirmed" }
    : CHIP[view.kind];

  const confirm = async (withDetails: boolean) => {
    if (sending.current) return;
    const problem = withDetails ? pinDetailsProblem(current) : null;
    if (problem) {
      setError(problem);
      return;
    }
    const input = withDetails
      ? { expectedVersion: pin.version, notes: current.notes.trim(), receiverName: receiverFor(current) }
      : { expectedVersion: pin.version };
    const body = JSON.stringify(input);
    if (attempt.current?.body !== body) attempt.current = { body, key: api.newIdempotencyKey() };
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.confirmDeliveryPin(order.id, input, attempt.current.key);
      attempt.current = null;
      setEditing(false);
      setDetails(null);
      onUpdated(saved);
    } catch (caught) {
      setError(userFacingError(caught, "Your answer did not reach GRIDGO. Check your connection and try again."));
      if (caught instanceof api.ApiError && caught.status === 409) onRefresh();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const heading =
    view.kind === "ask"
      ? "Will you be at this pin?"
      : view.kind === "pay"
        ? `Pay ${formatPhp(view.change.feeDifferenceMinor)} to save your new pin`
        : view.kind === "checking"
          ? "We are checking your pin payment"
          : "Your delivery pin";
  const intro =
    view.kind === "ask"
      ? pin.canChange
        ? "Your order is finished and leaves the shop next. Tell us you will be here to receive it, or move the pin."
        : "Your rider is bringing your order to this pin. Tell us you will be here to receive it."
      : view.kind === "pay"
        ? "Your new pin costs more to deliver to. Until Operations confirms this payment, your rider keeps the pin below."
        : view.kind === "checking"
          ? "Operations is matching your transfer against GRIDGO's wallet. Your rider keeps the pin below until they confirm it."
          : confirmed
            ? `${pin.receiverName.trim() ? `You confirmed ${pin.receiverName.trim()} will be here` : "You said you will be here"}${pin.confirmedAt ? ` (${formatTimelineStamp(pin.confirmedAt)})` : ""}. Your rider is given this pin with your notes.`
            : "Nobody confirmed this pin, so your rider goes to it as it was saved.";

  const MainButton = primary ? PrimaryButton : SecondaryButton;
  const applied = appliedChangeLine(pin.change);

  return (
    <View className="gg-card gap-4" testID="delivery-pin-card">
      <View className="gap-2">
        <View className="flex-row">
          <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
        </View>
        <Text accessibilityRole="header" className="text-h2 text-text-primary">{heading}</Text>
        <Text className="text-body text-text-secondary">{intro}</Text>
      </View>

      {showMap && isGeoPoint(pin.point) ? (
        <View className="overflow-hidden rounded-card">
          <DeliveryMap pickup={null} dropoff={pin.point} rider={null} stale={false} route={[]} routed={false} />
        </View>
      ) : null}

      <PinFacts pin={pin} zone={pinZoneLabel(pin.zone, settings)} title={view.kind === "pay" || view.kind === "checking" ? "Pin in use" : null} />

      {view.kind === "pay" || view.kind === "checking" ? (
        <View className="gg-panel gap-1">
          <Text className="text-caption text-text-muted">Your new pin</Text>
          <Text className="text-body-lg text-text-primary">{view.change.point.label}</Text>
          <Text className="text-caption text-text-muted">
            {[pinZoneLabel(view.change.zone, settings), feeDifferenceLine(view.change.feeDifferenceMinor)].filter(Boolean).join(" · ")}
          </Text>
          {view.kind === "checking" && view.change.payment ? (
            <View className="pt-2">
              <SpecRow label="Amount sent" value={formatPhp(view.change.feeDifferenceMinor)} />
              <SpecRow label="Reference you sent" value={view.change.payment.reference} />
            </View>
          ) : null}
        </View>
      ) : null}

      {(view.kind === "ask" || view.kind === "set") && view.lapsed ? (
        <Text className="text-body text-text-secondary">
          {pin.canChange
            ? "You kept this pin. The new pin you chose was not saved, and nothing was charged for it."
            : "A rider was assigned before your new pin was paid for, so your rider uses the pin above. Nothing was charged for it."}
        </Text>
      ) : null}

      {view.kind === "pay" ? (
        <PinPaymentForm
          orderId={order.id}
          pin={pin}
          change={view.change}
          primary={primary}
          onSaved={onUpdated}
          onConflict={onRefresh}
        />
      ) : null}

      {editing ? (
        <View pointerEvents={busy ? "none" : "auto"} className="gap-4">
          <PinDetailsFields value={current} onChange={setDetails} disabled={busy} />
        </View>
      ) : null}

      {error ? <ErrorState label="Not saved" body={error} /> : null}

      {view.kind === "ask" ? (
        <View className="gap-3">
          <MainButton
            label={busy ? "Sending…" : "Yes, I'll be here"}
            disabled={busy}
            onPress={() => void confirm(editing)}
          />
          {pin.canChange ? <SecondaryButton label="Change pin" disabled={busy} onPress={onChangePin} /> : null}
          {!editing ? (
            <QuietLink label="Add notes or someone else's name" onPress={() => { setError(null); setEditing(true); }} />
          ) : null}
        </View>
      ) : view.kind === "set" && editing ? (
        <View className="gap-3">
          <SecondaryButton label={busy ? "Saving…" : "Save these details"} disabled={busy} onPress={() => void confirm(true)} />
          <QuietLink label="Cancel" onPress={() => { setEditing(false); setDetails(null); setError(null); }} />
        </View>
      ) : view.kind === "set" ? (
        <View className="gap-3">
          {pin.canChange ? <SecondaryButton label="Change pin" onPress={onChangePin} /> : null}
          {pin.canConfirm && confirmed ? (
            <QuietLink label="Edit notes or receiver" onPress={() => { setError(null); setEditing(true); }} />
          ) : null}
        </View>
      ) : view.kind === "pay" ? (
        <SecondaryButton label="Choose a different pin" disabled={busy} onPress={onChangePin} />
      ) : null}

      {view.kind === "pay" && pin.canConfirm ? (
        <QuietLink label="Keep the pin in use instead" onPress={() => void confirm(false)} />
      ) : null}

      <AllowanceLine text={changeAllowanceLine(pin, view)} detail={applied} />
    </View>
  );
}

/** The pin in use: address, zone, notes and receiver. */
function PinFacts({ pin, zone, title }: { pin: api.DeliveryPin; zone: string | null; title: string | null }) {
  const colors = useThemeColors();
  return (
    <View className="gg-panel gap-3">
      <View className="flex-row gap-3">
        <MapPinned size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-1">
          {title ? <Text className="text-caption text-text-muted">{title}</Text> : null}
          <Text className="text-body-lg text-text-primary">{pin.point.label}</Text>
          {zone ? <Text className="text-caption text-text-muted">{zone}</Text> : null}
          {pin.notes.trim() ? <Text className="text-body text-text-secondary">{pin.notes}</Text> : null}
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <UserRound size={20} color={colors.textMuted} strokeWidth={2} aria-hidden />
        <Text className="min-w-0 flex-1 text-body text-text-secondary">{receiverLine(pin)}</Text>
      </View>
    </View>
  );
}

/** The one change, and whether it is still there to use. */
function AllowanceLine({ text, detail }: { text: string; detail: string | null }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row gap-3 border-t border-outline-subtle pt-3" accessible accessibilityRole="text">
      <Repeat2 size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-caption text-text-secondary">{text}</Text>
        {detail ? <Text className="text-caption text-text-muted">{detail}</Text> : null}
      </View>
    </View>
  );
}

function QuietLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="gg-touch items-center justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className="text-button text-text-primary underline">{label}</Text>
    </Pressable>
  );
}
