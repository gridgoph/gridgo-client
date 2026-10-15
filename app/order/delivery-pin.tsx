import { useLocalSearchParams, useRouter } from "expo-router";
import { TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PinDetailsFields, pinDetailsFrom, pinDetailsProblem, receiverFor, type PinDetails } from "@/components/deliveryPin/PinDetailsFields";
import { DropoffDetails } from "@/components/DropoffDetails";
import { DropoffLocator } from "@/components/DropoffLocator";
import { ErrorState } from "@/components/ErrorState";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { parseAddress } from "@/lib/address";
import { userFacingError } from "@/lib/copy";
import {
  feeDifferenceDetail,
  feeDifferenceLine,
  ONE_CHANGE_WARNING,
  PIN_LABEL_MAX,
  pinZoneLabel,
} from "@/lib/deliveryPin";
import { usePlatformSettings } from "@/store/platformSettings";

/** Long enough that a run of taps on the map asks for one price, not five. */
const PREVIEW_SETTLE_MS = 400;

type Preview =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; preview: api.DeliveryPinPreview }
  | { status: "failed"; key: string; message: string };

const pointKey = (point: { lat: number; lng: number }) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;

/**
 * The one delivery-pin change (gridgo-api `docs/DELIVERY_PIN_API.md`).
 *
 * Search, Use my location and the map set the new pin, the same editor as
 * checkout's drop-off. GRIDGO prices it from the shop before anything is
 * saved, and the difference is said in pesos with what it will do — a dearer
 * pin is paid for by QR before it moves, a cheaper one comes back as a
 * credit. The warning that this is the only change is a box to tick and then
 * a question to answer, because a client who skims past it has no second try.
 */
export default function DeliveryPinChangeScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const settings = usePlatformSettings((state) => state.settings);
  const [order, setOrder] = useState<api.Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<PinDetails | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<Preview>({ status: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const previewGen = useRef(0);
  const editor = useDropoffEditor({ skipPrePin: true });
  const { loadSaved } = editor;

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const current = await api.getOrder(orderId);
      setOrder(current);
      setLoadError(null);
      return current;
    } catch (caught) {
      setLoadError(userFacingError(caught, "GRIDGO could not open this order. Check your connection and try again."));
      return null;
    }
  }, [orderId]);

  // Start on the pin in use, so the map opens where the rider would go today.
  useEffect(() => {
    void (async () => {
      const pin = (await load())?.deliveryPin;
      if (!pin) return;
      const parts = parseAddress(pin.point.label);
      loadSaved({ label: "", line1: parts.line1, landmark: parts.landmark, point: pin.point });
      setDetails(pinDetailsFrom(pin));
    })();
  }, [load, loadSaved]);

  const pin = order?.deliveryPin ?? null;
  const point = editor.point;
  const label = editor.addressLine;
  const moved = Boolean(pin && point && pointKey(point) !== pointKey(pin.point));
  const key = point && editor.ready ? pointKey(point) : null;

  // Price the pin once it settles. The server's figure is the only one shown.
  useEffect(() => {
    if (!orderId || !key || !moved || !point) return;
    const gen = ++previewGen.current;
    const handle = setTimeout(() => {
      setPreview({ status: "loading", key });
      api
        .previewDeliveryPin(orderId, { lat: point.lat, lng: point.lng, label: label.slice(0, PIN_LABEL_MAX) })
        .then((result) => {
          if (gen === previewGen.current) setPreview({ status: "ready", key, preview: result });
        })
        .catch((caught) => {
          if (gen !== previewGen.current) return;
          setPreview({
            status: "failed",
            key,
            message: userFacingError(caught, "GRIDGO could not price this pin. Check your connection and try again."),
          });
        });
    }, PREVIEW_SETTLE_MS);
    return () => clearTimeout(handle);
    // `label` is sent but does not change the price; a new street alone does not re-ask.
  }, [orderId, key, moved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order || !pin) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4">
          {loadError ? (
            <ErrorState label="Could not open" body={loadError} onRetry={() => void load()} />
          ) : order ? (
            <Text className="text-body text-text-secondary">This order has no delivery pin to change.</Text>
          ) : (
            <SkeletonList count={2} />
          )}
          {order || loadError ? <SecondaryButton label="Back to the order" onPress={() => router.back()} /> : null}
        </View>
      </FormScreen>
    );
  }

  if (!pin.canChange) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4">
          <Text className="text-h2 text-text-primary">This pin can no longer change</Text>
          <Text className="text-body-lg text-text-secondary">
            {pin.changeUsed
              ? "You have already used your one pin change."
              : pin.change?.status === "pending_confirmation"
                ? "Operations is still checking the payment for your new pin. Wait for their answer first."
                : "A rider has been assigned to this order, so its pin is fixed. Message GRIDGO if it is wrong."}
          </Text>
          <SecondaryButton label="Back to the order" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  const current = details ?? pinDetailsFrom(pin);
  const priced = preview.status === "ready" && preview.key === key ? preview.preview : null;
  const difference = priced?.feeDifferenceMinor ?? 0;
  const detailsProblem = pinDetailsProblem(current);
  const missing = !point
    ? "Put the pin where the rider should go."
    : !editor.addressCheck.ok
      ? editor.addressCheck.reason
      : !moved
        ? "Move the pin to change it, or go back to keep it."
        : label.length > PIN_LABEL_MAX
          ? `Keep the street and landmark to ${PIN_LABEL_MAX} characters.`
          : !priced
            ? preview.status === "failed" ? preview.message : "Checking the delivery price for this pin…"
            : detailsProblem
              ? detailsProblem
              : !acknowledged
                ? "Tick the box to confirm this is your one pin change."
                : null;
  const replacing = pin.change?.status === "pending_payment";

  const save = async () => {
    if (!priced || !point || busy) return;
    const input = {
      expectedVersion: pin.version,
      point: { lat: point.lat, lng: point.lng, label: label.slice(0, PIN_LABEL_MAX) },
      notes: current.notes.trim(),
      receiverName: receiverFor(current),
      feeDifferenceMinor: priced.feeDifferenceMinor,
      acknowledgeOneChange: true as const,
    };
    const body = JSON.stringify(input);
    if (attempt.current?.body !== body) attempt.current = { body, key: api.newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      await api.changeDeliveryPin(order.id, input, attempt.current.key);
      attempt.current = null;
      setConfirming(false);
      router.back();
    } catch (caught) {
      setConfirming(false);
      setError(userFacingError(caught, "Your new pin was not saved. Check your connection and try again."));
      if (caught instanceof api.ApiError && caught.status === 409) {
        // A stale version or a moved price: reload and re-price before another try.
        void load();
        setPreview({ status: "idle" });
        previewGen.current++;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen
      overlay={
        <ConfirmDialog
          visible={confirming}
          question={difference > 0 ? `Save this pin and pay ${formatPhp(difference)}?` : "Save this as your new pin?"}
          body={`${ONE_CHANGE_WARNING} ${feeDifferenceDetail(difference)}`}
          confirmLabel={difference > 0 ? "Save and pay" : "Save new pin"}
          cancelLabel="Not yet"
          busy={busy}
          onConfirm={() => void save()}
          onCancel={() => { if (!busy) setConfirming(false); }}
        />
      }
      footer={
        <View className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
          {error ? <Text className="text-body text-error">{error}</Text> : null}
          {missing && !busy ? <Text className="text-caption text-text-muted">{missing}</Text> : null}
          <PrimaryButton
            label={busy ? "Saving…" : difference > 0 ? `Save and pay ${formatPhp(difference)}` : "Save new pin"}
            disabled={Boolean(missing) || busy}
            onPress={() => { setError(null); setConfirming(true); }}
          />
        </View>
      }
    >
      <View className="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Move your delivery pin</Text>
          <Text className="text-body text-text-secondary">
            Put the pin where you will meet the rider. Delivery is priced from the shop to this pin,
            and you see the difference before anything is saved.
          </Text>
        </View>

        <View className="flex-row gap-3 rounded-card border border-outline p-4" accessible accessibilityRole="text">
          <TriangleAlert size={20} color={colors.warning} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">You can change it once</Text>
            <Text className="text-body text-text-secondary">
              {replacing
                ? "This replaces the new pin you have not paid for yet. "
                : ""}
              After you save, the pin cannot move again, and changes close when a rider is assigned.
            </Text>
          </View>
        </View>

        <View className="gg-panel gap-1">
          <Text className="text-caption text-text-muted">Pin in use</Text>
          <Text className="text-body text-text-primary">{pin.point.label}</Text>
        </View>

        <DropoffLocator editor={editor} />
        <DropoffDetails editor={editor} labelLocked />
        {editor.notice ? <Text className="text-body text-text-secondary">{editor.notice}</Text> : null}

        <PricePanel
          moved={moved}
          preview={preview.status === "loading" && preview.key === key ? "loading" : priced}
          zone={priced ? pinZoneLabel(priced.zone, settings) : null}
        />

        <PinDetailsFields value={current} onChange={setDetails} disabled={busy} />

        <CheckboxRow
          checked={acknowledged}
          onChange={setAcknowledged}
          label="I understand this is my one pin change"
          hint="Saved means final. A higher fee is saved only after Operations confirms your payment."
          disabled={busy}
        />
      </View>
    </FormScreen>
  );
}

/** The server's price for the new pin, and what saving it does. */
function PricePanel({
  moved,
  preview,
  zone,
}: {
  moved: boolean;
  preview: api.DeliveryPinPreview | "loading" | null;
  zone: string | null;
}) {
  if (!moved) return null;
  if (preview === "loading" || preview == null) {
    return (
      <View className="gg-panel gap-1" accessibilityLiveRegion="polite">
        <Text className="text-caption text-text-muted">Delivery to this pin</Text>
        <Text className="text-body text-text-secondary">
          {preview === "loading" ? "Checking the price…" : "Finish the street and pin to see the price."}
        </Text>
      </View>
    );
  }
  return (
    <View className="gg-panel-high gap-2" accessibilityLiveRegion="polite">
      <View className="flex-row items-baseline justify-between gap-4">
        <Text className="text-caption text-text-muted">Delivery to this pin{zone ? ` · ${zone}` : ""}</Text>
        <Text className="text-body text-text-secondary">{formatPhp(preview.deliveryFeeMinor)}</Text>
      </View>
      <Text className="text-h3 text-text-primary">{feeDifferenceLine(preview.feeDifferenceMinor)}</Text>
      <Text className="text-body text-text-secondary">{feeDifferenceDetail(preview.feeDifferenceMinor)}</Text>
    </View>
  );
}
