import { useState } from "react";
import { Text, View } from "react-native";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { buildPreflightChecklist } from "@/lib/requestValidation";

type Props = {
  order: Order;
  onUpdated: (order: Order) => void;
};

/**
 * Client decisions at `proof_approval` and resubmit at `client_correction`.
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
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (order.state === "proof_approval") {
    return (
      <View className="gap-4">
        <View className="gg-card gap-3">
          <Text className="text-h3 text-text-primary">Proof approval</Text>
          <Text className="text-body text-text-secondary">
            Review the preflight results and any QA notes on the timeline, then approve
            for matching or request changes.
          </Text>
          <StatusChip tone="warning" label="Your decision is required" icon="triangle-alert" />
          {checklist.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between gap-2 py-1">
              <Text className="flex-1 text-body text-text-secondary">{item.label}</Text>
              <StatusChip
                tone={
                  item.status === "pass" ? "success" : item.status === "fail" ? "error" : "info"
                }
                label={item.status === "pass" ? "OK" : item.status === "fail" ? "Fail" : "Review"}
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
          label={busy ? "Working…" : "Approve & Continue"}
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
          label="Request Changes"
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
            Update the artwork file name if needed, then resubmit for QA. This demo still
            stores the name only.
          </Text>
        </View>
        <ArtworkUploadCard
          artworkName={order.artworkName ?? ""}
          onChangeName={() => {
            /* resubmit uses existing name; full re-upload would PATCH — not in API */
          }}
          readOnly
        />
        <PrimaryButton
          label={busy ? "Resubmitting…" : "Resubmit for QA"}
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
