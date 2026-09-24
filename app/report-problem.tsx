import { usePreventRemove } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SpecRow } from "@/components/SpecRow";
import { FormField } from "@/components/form/FormField";
import { OptionPicker, type PickerOption } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import * as api from "@/lib/api";
import {
  EXPECTED_MAX,
  HAPPENED_MAX,
  bugReportProblem,
  composeBugReport,
  currentDevice,
  recentOrdersForReport,
} from "@/lib/bugReport";
import { chatThreadRoute } from "@/lib/chatThreads";
import { userFacingError } from "@/lib/copy";
import { orderReference } from "@/lib/orderReference";
import { getOrderStateMeta } from "@/lib/orderState";

const NO_ORDER = "";

/**
 * Report a problem with the app.
 *
 * It is a chat message to Operations, not a ticket: the report opens a new
 * conversation on the desk they already work, and the client lands in that
 * conversation, which is where the reply will appear. See `lib/bugReport.ts`
 * for what the message says and why there is no screenshot.
 *
 * The facts Operations would otherwise ask for — app version, phone, system,
 * the order — are shown before sending, not attached behind the client's back.
 */
export default function ReportProblemScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const device = useMemo(() => currentDevice(), []);

  const [happened, setHappened] = useState("");
  const [expected, setExpected] = useState("");
  const [chosenOrder, setChosenOrder] = useState(orderId ?? NO_ORDER);
  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [showProblem, setShowProblem] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // The order list is a convenience. A failed read hides the field rather than
  // standing between a client and a report about, quite possibly, that failure.
  useEffect(() => {
    let live = true;
    api
      .listOrders()
      .then((rows) => {
        if (live) setOrders(rows);
      })
      .catch(() => {
        if (live) setOrders([]);
      })
      .finally(() => {
        if (live) setOrdersLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const problem = bugReportProblem({ happened, expected });
  const order = orders?.find((row) => row.id === chosenOrder) ?? null;
  // An order opened into this screen stays on the list even when it is older
  // than the recent few.
  const recent = recentOrdersForReport(orders ?? []);
  const choices = order && !recent.includes(order) ? [order, ...recent] : recent;

  const orderOptions: PickerOption[] = [
    { value: NO_ORDER, label: "Not about an order" },
    ...choices.map((row) => ({
      value: row.id,
      label: row.title || (orderReference(row.id) ?? row.id),
      hint: `${orderReference(row.id) ?? row.id}, ${getOrderStateMeta(row.state, row.fulfillmentMode).label}`,
    })),
  ];

  const hasWork = !sent && !sending && (happened.trim().length > 0 || expected.trim().length > 0);
  usePreventRemove(hasWork, () => setConfirmDiscard(true));

  const send = useCallback(async () => {
    if (sending) return;
    if (problem) {
      setShowProblem(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const posted = await api.sendSupportChatMessage(
        composeBugReport({ happened, expected }, device, order),
        undefined,
        { newThread: true },
      );
      setSent(true);
      setSending(false);
      // Off the prevent-remove guard first, then into the conversation the
      // reply will arrive in. Replace, so Back from there is Account rather
      // than an emptied form.
      requestAnimationFrame(() => router.replace(chatThreadRoute(posted.thread.id)));
    } catch (err) {
      setError(
        userFacingError(
          err,
          "Your report did not reach Operations. Check this phone’s connection and send it again — what you wrote is still here.",
        ),
      );
      setSending(false);
    }
  }, [device, expected, happened, order, problem, router, sending]);

  const showOrders = ordersLoading || choices.length > 0;

  return (
    <FormScreen
      overlay={
        <>
          <LoadingOverlay
            visible={sending}
            label="Sending your report…"
            body="It goes to Operations as a chat message."
          />
          <ConfirmDialog
            visible={confirmDiscard}
            question="Discard this report?"
            body="Operations has not seen it yet. Leaving now throws away what you wrote."
            confirmLabel="Discard it"
            cancelLabel="Keep writing"
            tone="destructive"
            onConfirm={() => {
              setConfirmDiscard(false);
              setHappened("");
              setExpected("");
              requestAnimationFrame(() => router.back());
            }}
            onCancel={() => setConfirmDiscard(false)}
          />
        </>
      }
    >
      <View className="gg-page gap-6 pb-16 pt-4">
        <Text className="text-body text-text-secondary">
          Tell Operations what went wrong. It reaches them as a chat message, and they reply
          to you in Chat.
        </Text>

        <FormField
          label="What happened"
          helper="What you tapped, and what the screen did."
          error={showProblem ? problem : null}
        >
          <TextField
            value={happened}
            onChangeText={setHappened}
            placeholder="I tapped Pay the remaining 25% and the screen went blank."
            multiline
            multilineMinHeight={112}
            maxLength={HAPPENED_MAX}
            editable={!sending}
            accessibilityLabel="What happened"
          />
        </FormField>

        <FormField label="What you expected" optional>
          <TextField
            value={expected}
            onChangeText={setExpected}
            placeholder="The QR code to pay with."
            multiline
            multilineMinHeight={88}
            maxLength={EXPECTED_MAX}
            editable={!sending}
            accessibilityLabel="What you expected"
          />
        </FormField>

        {showOrders ? (
          <FormField
            label="Which order"
            optional
            helper="Pick one if the problem is about a job."
          >
            <OptionPicker
              title="Which order is it about?"
              value={chosenOrder}
              options={orderOptions}
              onChange={setChosenOrder}
              placeholder={ordersLoading ? "Loading your orders…" : "Not about an order"}
              disabled={ordersLoading || sending}
              accessibilityLabel="Which order"
            />
          </FormField>
        ) : null}

        <View className="gap-1">
          <Text className="text-overline text-text-muted">SENT WITH YOUR REPORT</Text>
          <View accessible accessibilityLabel={`Sent with your report: ${device.app}, ${device.phone ? `${device.phone}, ` : ""}${device.system}`}>
            <SpecRow label="App" value={device.app} />
            {device.phone ? <SpecRow label="Phone" value={device.phone} /> : null}
            <SpecRow label="System" value={device.system} />
          </View>
        </View>

        {error ? <ErrorState label="Not sent" body={error} /> : null}

        <PrimaryButton
          label={sending ? "Sending…" : "Send to Operations"}
          disabled={sending}
          onPress={() => void send()}
        />
      </View>
    </FormScreen>
  );
}
