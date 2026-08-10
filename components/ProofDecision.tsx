import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { ProofSheet } from "@/components/ProofSheet";
import { ReasonPrompt } from "@/components/ReasonPrompt";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [askReason, setAskReason] = useState(false);

  const isSupplierProof = isSupplierProofReviewState(order.state);
  const proofFileId = order.proofFileIds?.[order.proofFileIds.length - 1] ?? null;
  const artworkFileId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const total = orderGrandTotalMinor(order);

  const approveState = isSupplierProof ? "supplier_proof_approved" : "approved_for_matching";
  const changesState = isSupplierProof ? "supplier_proof_changes_requested" : "client_correction";

  const run = async (fn: () => Promise<Order>) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await fn());
      setConfirmApprove(false);
      setAskReason(false);
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
      <View className="gap-2">
        <StatusChip tone="warning" label="Waiting on your decision" icon="triangle-alert" />
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

      {error ? (
        <View className="gg-panel gap-2">
          <StatusChip tone="error" label="Not recorded" icon="circle-x" />
          <Text className="text-body text-text-primary">{error}</Text>
        </View>
      ) : null}

      <View className="gap-3">
        <PrimaryButton
          label="Approve & continue"
          disabled={busy}
          onPress={() => setConfirmApprove(true)}
        />
        <SecondaryButton
          label="Request changes"
          disabled={busy}
          onPress={() => setAskReason(true)}
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

      <ReasonPrompt
        visible={askReason}
        title="What needs to change?"
        body={
          isSupplierProof
            ? "Your supplier reads this and reworks the proof. Be specific about what is wrong and where."
            : "Operations reads this and comes back to you with a corrected proof. Be specific about what is wrong and where."
        }
        label="Reason"
        placeholder="The logo is cropped on the right edge and the brand red has printed orange."
        submitLabel="Send this back"
        busy={busy}
        onCancel={() => setAskReason(false)}
        onSubmit={(reason) =>
          void run(() => api.transitionOrder(order.id, changesState, { reason, note: reason }))
        }
      />
    </View>
  );
}
