import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import { formatPriceRange } from "@/lib/orderState";
import { describeQuantity } from "@/lib/quantity";

type Props = {
  order: Order;
  /** Catalog family, for the mockup template on the artwork proof. */
  family: string | null;
  unit: string;
  /** Resolved through the taxonomy by the screen — never the stored code. */
  materialLabel: string;
  finishLabel: string | null;
  onUpdated: (order: Order) => void;
};

/**
 * The artwork proof Operations prepares before the job goes out for matching.
 *
 * This is the client's only proof decision now. The supplier print proof loop
 * was removed from the platform to simplify fulfilment — the client watches
 * the supplier's milestones instead of signing off their proof.
 *
 * Approving is not a row tap: the decision restates what is being committed
 * to. Requesting changes always carries a reason, because it sends the job
 * back to someone. Verbs stay consistent — Approve leads to Approved.
 */
export function ProofDecision({
  order,
  family,
  unit,
  materialLabel,
  finishLabel,
  onUpdated,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const artworkFileId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const range = order.priceRange;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(
        await api.transitionOrder(order.id, "approved_for_matching", {
          note: "Approved by client",
        }),
      );
      setConfirmApprove(false);
    } catch (e) {
      setError(
        userFacingError(
          e,
          "That decision did not go through. Check the timeline below and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-5">
      {/* No status chip here: the order header above already carries the
          state once, and a screen that says it twice reads as a draft. */}
      <View className="gap-2">
        <Text className="text-h2 text-text-primary">Approve your artwork proof</Text>
        <Text className="text-body text-text-secondary">
          Operations has checked your file against the print specification. Approving sends
          this job out for supplier matching.
        </Text>
      </View>

      <ProductPreview
        family={family}
        artworkName={order.artworkName}
        productName={order.title}
        size={order.size}
        artworkFileId={artworkFileId}
      />

      <View className="gg-card">
        <SpecRow label="Quantity" value={describeQuantity(order.quantity, unit)} />
        <SpecRow label="Size" value={order.size || "—"} />
        <SpecRow label="Material" value={materialLabel} />
        {finishLabel ? <SpecRow label="Finish" value={finishLabel} /> : null}
        <SpecRow label="Deadline" value={formatDeadline(order.deadline)} />
        {range ? (
          <View className="gap-1 pt-3">
            <View className="flex-row items-baseline justify-between gap-4">
              <Text className="text-body-lg text-text-secondary">Estimated print</Text>
              <Text className="text-h3 text-text-primary">
                {formatPriceRange(range.subtotalMinMinor, range.subtotalMaxMinor)}
              </Text>
            </View>
            <Text className="text-caption text-text-muted">
              Delivery is added once a supplier is assigned, and the exact price is set when
              they accept.
            </Text>
          </View>
        ) : null}
      </View>

      {error ? <ErrorState label="Not recorded" body={error} /> : null}

      <View className="gap-3">
        <PrimaryButton
          label="Approve & continue"
          disabled={busy}
          onPress={() => setConfirmApprove(true)}
        />
        <SecondaryButton
          label="Request changes"
          disabled={busy}
          onPress={() =>
            router.push({
              pathname: "/order/request-changes",
              params: { orderId: order.id },
            })
          }
        />
      </View>

      <ConfirmDialog
        visible={confirmApprove}
        question={`Approve "${order.title}" for printing?`}
        body="This artwork goes out for supplier matching as it is. Anything you want changed has to be raised before you approve."
        confirmLabel="Approve & continue"
        cancelLabel="Not yet"
        busy={busy}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => void approve()}
      />
    </View>
  );
}
