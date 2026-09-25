import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SpecRow } from "@/components/SpecRow";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  EMPTY_PHYSICAL_INVOICE,
  PHYSICAL_INVOICE_ADDRESS_MAX,
  PHYSICAL_INVOICE_BLURB,
  PHYSICAL_INVOICE_CONTACT_MAX,
  PHYSICAL_INVOICE_HOURS_MAX,
  firstPhysicalInvoiceError,
  physicalInvoiceFieldError,
  physicalInvoiceReady,
  trimPhysicalInvoice,
  type PhysicalInvoiceDraft,
  type PhysicalInvoiceField,
  type PhysicalInvoiceRequest,
} from "@/lib/physicalInvoice";
import { formatTimelineStamp } from "@/lib/relativeTime";

/**
 * Ask GRIDGO for a printed invoice at an office.
 *
 * For when the rider is not there to hand one over at the door. The request
 * is the contact, the office address, and when someone is in — GRIDGO uses
 * those to send the copy later.
 */
export default function PhysicalInvoiceScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();

  const [draft, setDraft] = useState<PhysicalInvoiceDraft>(EMPTY_PHYSICAL_INVOICE);
  const [existing, setExisting] = useState<PhysicalInvoiceRequest | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!orderId) return;
    try {
      const request = await api.getPhysicalInvoice(orderId);
      if (sequence !== loadSequence.current) return;
      setExisting(request);
      setError(null);
    } catch (caught) {
      if (sequence !== loadSequence.current) return;
      setError(
        userFacingError(caught, "GRIDGO could not load this request. Try again in a moment."),
      );
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadSequence.current++;
      };
    }, [load]),
  );

  const setField = (field: PhysicalInvoiceField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const fieldError = (field: PhysicalInvoiceField): string | null => {
    if (!attempted) return null;
    return physicalInvoiceFieldError(field, draft[field]);
  };

  const send = async () => {
    if (!orderId || busy) return;
    setAttempted(true);
    if (!physicalInvoiceReady(draft)) return;
    setBusy(true);
    setError(null);
    try {
      const request = await api.requestPhysicalInvoice(orderId, trimPhysicalInvoice(draft));
      setExisting(request);
    } catch (caught) {
      if (caught instanceof api.ApiError && (caught.body as { error?: string } | null)?.error === "physical_invoice_already_requested") {
        await load();
        return;
      }
      setError(
        userFacingError(
          caught,
          "GRIDGO could not send that request. Nothing was filed — try again.",
        ),
      );
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  if (existing) {
    return (
      <FormScreen>
        <View className="gg-page gap-6 pb-16 pt-4">
          <View className="gap-2">
            <Text className="text-h1 text-text-primary">Physical invoice requested</Text>
            <Text className="text-body text-text-secondary">
              GRIDGO has this office on file. A printed copy will be sent here when
              nobody is at the drop-off to take one.
            </Text>
          </View>
          <View className="gg-card">
            <SpecRow label="Contact person" value={existing.contactPerson} />
            <SpecRow label="Office address" value={existing.officeAddress} />
            <SpecRow label="Operating hours" value={existing.operatingHours} />
            <SpecRow label="Requested" value={formatTimelineStamp(existing.requestedAt)} />
            <SpecRow
              label="Promised delivery"
              value={
                existing.promisedDeliveryAt
                  ? formatTimelineStamp(existing.promisedDeliveryAt)
                  : "GRIDGO has not set a delivery time yet."
              }
            />
          </View>
          <PrimaryButton label="Back to the order" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  const missing = attempted ? firstPhysicalInvoiceError(draft) : null;

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Request a physical invoice</Text>
          <Text className="text-body text-text-secondary">{PHYSICAL_INVOICE_BLURB}</Text>
        </View>

        <FormField
          label="Contact person"
          error={fieldError("contactPerson")}
          helper="Who GRIDGO should ask for at the office."
        >
          <TextField
            value={draft.contactPerson}
            onChangeText={(value) => setField("contactPerson", value)}
            accessibilityLabel="Contact person"
            autoCapitalize="words"
            maxLength={PHYSICAL_INVOICE_CONTACT_MAX}
            placeholder="Ana Reyes"
          />
        </FormField>

        <FormField
          label="Office address"
          error={fieldError("officeAddress")}
          helper="Street and building in Davao City."
        >
          <TextField
            value={draft.officeAddress}
            onChangeText={(value) => setField("officeAddress", value)}
            accessibilityLabel="Office address"
            autoCapitalize="words"
            multiline
            maxLength={PHYSICAL_INVOICE_ADDRESS_MAX}
            placeholder="7th floor, 12 J.P. Laurel Ave"
          />
        </FormField>

        <FormField
          label="Operating hours"
          error={fieldError("operatingHours")}
          helper="When someone is there to take the printed copy."
        >
          <TextField
            value={draft.operatingHours}
            onChangeText={(value) => setField("operatingHours", value)}
            accessibilityLabel="Operating hours"
            maxLength={PHYSICAL_INVOICE_HOURS_MAX}
            placeholder="Mon–Fri 9am–5pm"
          />
        </FormField>

        {error ? <Text className="text-body text-error">{error}</Text> : null}

        <PrimaryButton
          label={busy ? "Sending…" : "Send request"}
          onPress={() => void send()}
          disabled={busy}
        />
        {missing ? (
          <Text className="text-center text-caption text-error">{missing.message}</Text>
        ) : (
          <Text className="text-center text-caption text-text-muted">
            GRIDGO files this against the order. It does not change the delivery.
          </Text>
        )}
      </View>
    </FormScreen>
  );
}
