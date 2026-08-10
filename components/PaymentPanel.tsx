import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { formatPhp, type InstallmentCode, type Order } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  afterPayCopy,
  BALANCE_PERCENT,
  checkPaymentReference,
  DIGITAL_ONLY_NOTICE,
  DOWNPAYMENT_PERCENT,
  installmentLabel,
  installmentSharePercent,
  isInstallmentConfirmed,
  MANUAL_CONFIRMATION_NOTICE,
  payInstruction,
} from "@/lib/payment";
import { orderTotalMinor } from "@/lib/orderState";

type Props = {
  order: Order;
  /** Which half is being asked for. Decided by the order, not the screen. */
  installment: InstallmentCode;
  onSubmitted: (order: Order) => void;
};

/**
 * Paying one half of an order.
 *
 * No money moves through GRIDGO. The client pays by QR from their own wallet
 * and hands over the reference; Operations matches it by hand. So the button
 * says what it does — sends a reference — and the screen never claims the
 * order is paid on the strength of a form submission.
 *
 * The client's breakdown is subtotal and delivery. GRIDGO's margin is already
 * inside the subtotal and the server never sends it; a line for it here would
 * be a misreading of the contract.
 */
export function PaymentPanel({ order, installment, onSubmitted }: Props) {
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = orderTotalMinor(order);
  const dueMinor = order.payments?.[installment].amountMinor ?? null;
  const check = checkPaymentReference(reference);
  const downpaymentPaid = isInstallmentConfirmed(order.payments?.downpayment);

  const submit = async () => {
    if (!check.ok) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSubmitted(await api.submitPayment(order.id, installment, reference.trim()));
    } catch (e) {
      setError(
        userFacingError(
          e,
          "Your reference did not reach Operations. Check your connection and send it again — paying twice is not needed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gg-card gap-5">
      <View className="gap-2">
        <Text className="text-h2 text-text-primary">
          Pay the {installmentSharePercent(installment)}%{" "}
          {installment === "downpayment" ? "downpayment" : "balance"}
        </Text>
        <Text className="text-body text-text-secondary">{payInstruction(installment)}</Text>
      </View>

      {/*
        Only what is due and what it is a share of. The full breakdown — print,
        delivery, both installments, total — is the money card further down the
        same screen, and stating it twice made the ask harder to find.
      */}
      <View className="gap-2">
        <View className="flex-row items-baseline justify-between gap-4">
          <Text className="text-body-lg font-medium text-text-primary">Due now</Text>
          <Text className="text-h2 text-text-primary">
            {dueMinor != null ? formatPhp(dueMinor) : "—"}
          </Text>
        </View>
        <Text className="text-caption text-text-muted">
          {installment === "downpayment"
            ? `${DOWNPAYMENT_PERCENT}% of your ${total != null ? formatPhp(total) : ""} total, and the last ${BALANCE_PERCENT}% before your order is delivered.`
            : `The last ${BALANCE_PERCENT}% of your ${total != null ? formatPhp(total) : ""} total. Your ${formatPhp(
                order.payments?.downpayment.amountMinor ?? 0,
              )} downpayment is already confirmed.`}
        </Text>
      </View>

      {installment === "balance" && !downpaymentPaid ? (
        <StatusChip
          tone="warning"
          label="Your downpayment is still being checked"
          icon="triangle-alert"
        />
      ) : null}

      <FormField
        label="Payment reference"
        helper="The reference number on the receipt from your wallet app."
        error={touched && !check.ok ? check.reason : null}
      >
        <TextField
          value={reference}
          onChangeText={(value) => {
            setReference(value);
            setError(null);
          }}
          onBlur={() => setTouched(true)}
          placeholder="0047 5518 2290"
          accessibilityLabel="Payment reference"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={64}
        />
      </FormField>

      {error ? <ErrorState label="Not sent" body={error} /> : null}

      <PrimaryButton
        label={busy ? "Sending your reference…" : "Send my payment reference"}
        disabled={busy}
        onPress={() => void submit()}
      />

      <View className="gap-1">
        <Text className="text-caption text-text-muted">{DIGITAL_ONLY_NOTICE}</Text>
        <Text className="text-caption text-text-muted">{MANUAL_CONFIRMATION_NOTICE}</Text>
        <Text className="text-caption text-text-muted">{afterPayCopy(installment)}</Text>
      </View>
    </View>
  );
}

/**
 * The wait between sending a reference and Operations confirming it.
 *
 * A real state a person sits in, so it gets a real card rather than silence —
 * what was sent, when, and what happens when it clears.
 */
export function PaymentUnderReviewCard({
  order,
  installment,
}: {
  order: Order;
  installment: InstallmentCode;
}) {
  const record = order.payments?.[installment];

  return (
    <View className="gg-card gap-4">
      {/* No status chip: the order header above already carries this state
          once, and a screen that says it twice reads as a draft. */}
      <View className="gap-2">
        <Text className="text-h3 text-text-primary">
          We are checking your {installment === "downpayment" ? "downpayment" : "balance payment"}.
        </Text>
        <Text className="text-body text-text-secondary">{MANUAL_CONFIRMATION_NOTICE}</Text>
      </View>

      <View className="gg-panel">
        <SpecRow label={installmentLabel(installment)} value={
          record?.amountMinor != null ? formatPhp(record.amountMinor) : "—"
        } />
        <SpecRow label="Reference you sent" value={record?.reference || "—"} />
      </View>

      <Text className="text-caption text-text-muted">
        {afterPayCopy(installment)} You get a notification either way, so there is nothing to
        watch here.
      </Text>
    </View>
  );
}
