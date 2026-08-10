import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { ProofSheet } from "@/components/ProofSheet";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import { isSupplierProofReviewState, orderGrandTotalMinor } from "@/lib/orderState";
import { describeQuantity } from "@/lib/quantity";

type Props = {
  order: Order;
  /** Catalog family, for the mockup template on an artwork proof. */
  family: string | null;
  unit: string;
  onUpdated: (order: Order) => void;
};

/**
 * The moment the client commits to a print run.
 *
 * Approving is not a row tap: the decision restates what is being committed
 * to, and the confirmation names the job and the money. Requesting changes
 * always carries a reason, because it sends someone back to the press.
 *
 * Verbs stay consistent through the flow — Approve leads to Approved, Request
 * changes leads to Changes requested.
 */
export function ProofDecision({ order, family, unit, onUpdated }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const isSupplierProof = isSupplierProofReviewState(order.state);
  const proofFileId = order.proofFileIds?.[order.proofFileIds.length - 1] ?? null;
  const artworkFileId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const total = orderGrandTotalMinor(order);

  const approveState = isSupplierProof ? "supplier_proof_approved" : "approved_for_matching";

  const run = async (fn: () => Promise<Order>) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await fn());
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
        <Text className="text-h2 text-text-primary">
          {isSupplierProof ? "Approve the print proof" : "Approve your artwork proof"}
        </Text>
        <Text className="text-body text-text-secondary">
          {isSupplierProof
            ? "This is what your supplier will put on the press. Approving commits you to this print run."
            : "Operations has checked your file against the print specification. Approving sends this job out for supplier matching."}
        </Text>
      </View>

      {isSupplierProof ? (
        <ProofSheet fileId={proofFileId} caption="Supplier print proof" />
      ) : (
        <ProductPreview
          family={family}
          artworkName={order.artworkName}
          productName={order.title}
          size={order.size}
          artworkFileId={artworkFileId}
        />
      )}

      <View className="gg-card">
        <SpecRow label="Quantity" value={describeQuantity(order.quantity, unit)} />
        <SpecRow label="Size" value={order.size || "—"} />
        <SpecRow label="Material" value={order.material || "—"} />
        {order.finish ? <SpecRow label="Finish" value={order.finish} /> : null}
        <SpecRow label="Deadline" value={formatDeadline(order.deadline)} />
        <View className="flex-row items-baseline justify-between gap-4 pt-3">
          <Text className="text-body-lg text-text-secondary">
            {isSupplierProof ? "You will pay" : "Estimated total"}
          </Text>
          <Text className="text-h3 text-text-primary">{formatPhp(total)}</Text>
        </View>
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
              params: { orderId: order.id, proof: isSupplierProof ? "print" : "artwork" },
            })
          }
        />
      </View>

      <ConfirmDialog
        visible={confirmApprove}
        question={`Approve "${order.title}" for printing?`}
        body={
          isSupplierProof
            ? `Your supplier prints ${describeQuantity(order.quantity, unit)} from this proof and you are committed to ${formatPhp(total)}. A print run cannot be recalled once it starts.`
            : `This artwork goes out for supplier matching as it is. Anything you want changed has to be raised before you approve.`
        }
        confirmLabel="Approve & continue"
        cancelLabel="Not yet"
        busy={busy}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() =>
          void run(() =>
            api.transitionOrder(order.id, approveState, { note: "Approved by client" }),
          )
        }
      />
    </View>
  );
}
