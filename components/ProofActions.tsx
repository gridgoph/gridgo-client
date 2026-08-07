import { useState } from "react";
import { Text, View } from "react-native";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { buildPreflightChecklist } from "@/lib/requestValidation";

type Props = {
  order: Order;
  onUpdated: (order: Order) => void;
};

/**
 * Client decisions at proof approval, and resubmit after correction.
 * Verbs stay consistent: Approve → Approved, Request changes → Needs correction.
 */
export function ProofActions({ order, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checklist = buildPreflightChecklist(order.artworkName);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(
        userFacingError(e, "That action did not complete. Check the order status and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (order.state === "proof_approval") {
    return (
      <View className="gap-4">
        <View className="gg-card gap-3">
          <Text className="text-h3 text-text-primary">Approve your proof</Text>
          <Text className="text-body text-text-secondary">
            Check the preflight list and any QA notes on the timeline. Approving
            sends this job to supplier matching; requesting changes returns it to you.
          </Text>
          <StatusChip tone="warning" label="Your decision is required" icon="triangle-alert" />
          {checklist.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between gap-2 py-1">
              <Text className="flex-1 text-body text-text-secondary">{item.label}</Text>
              <StatusChip
                tone={
                  item.status === "pass" ? "success" : item.status === "fail" ? "error" : "info"
                }
                label={item.status === "pass" ? "OK" : item.status === "fail" ? "Missing" : "Review"}
                icon={
                  item.status === "pass"
                    ? "circle-check"
                    : item.status === "fail"
                      ? "circle-x"
                      : "clock"
                }
              />
            </View>
          ))}
        </View>

        <PrimaryButton
          label={busy ? "Working…" : "Approve & continue"}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const next = await api.transitionOrder(order.id, "approved_for_matching", {
                note: "Client approved proof",
              });
              onUpdated(next);
            })
          }
        />
        <SecondaryButton
          label="Request changes"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const next = await api.transitionOrder(order.id, "client_correction", {
                note: "Client requested changes",
              });
              onUpdated(next);
            })
          }
        />
        {error ? <Text className="text-body text-error">{error}</Text> : null}
      </View>
    );
  }

  if (order.state === "client_correction") {
    return (
      <View className="gap-4">
        <View className="gg-card gap-2">
          <Text className="text-h3 text-text-primary">Needs correction</Text>
          <Text className="text-body text-text-secondary">
            Fix the artwork file name if Operations asked for a different file, then send
            the job back to QA. This pilot stores the file name only — no bytes are uploaded.
          </Text>
        </View>
        <ArtworkUploadCard
          artworkName={order.artworkName ?? ""}
          onChangeName={() => {
            /* resubmit uses existing name; PATCH not on API */
          }}
          readOnly
        />
        <PrimaryButton
          label={busy ? "Sending…" : "Send back to QA"}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const next = await api.transitionOrder(order.id, "submitted", {
                note: "Client resubmitted after correction",
              });
              onUpdated(next);
            })
          }
        />
        {error ? <Text className="text-body text-error">{error}</Text> : null}
      </View>
    );
  }

  return null;
}
