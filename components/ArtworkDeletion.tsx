import { CircleAlert, CircleCheck, Clock, Info, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  ARTWORK_RETENTION_NOTE,
  DELETE_ARTWORK_LABEL,
  artworkDeletionGate,
  deletionConfirmCopy,
  deletionOutcome,
  isOrderCompleted,
  type IssueRead,
} from "@/lib/artworkDeletion";
import { IDLE_DELETION, useArtworkDeletion } from "@/store/artworkDeletion";

type Props = {
  order: api.Order;
  /** Null when the refund list could not be read; the API still checks. */
  refunds?: api.Refund[] | null;
  /** The client's own files that still have bytes. */
  deletableIds: string[];
  /** Every file row has read itself, so the counts above are whole. */
  settled: boolean;
  /** At least one of the order's files is already deleted. */
  anyRemoved: boolean;
};

/**
 * The foot of the artwork section: the retention line on a completed job and
 * "Delete my artwork" (gridgo-api#131).
 *
 * Destructive and secondary, so it is outlined with the error colour on the
 * verb — never yellow; the order screen's one yellow belongs to its action
 * zone. When it cannot be used yet it stays visible and disabled with the
 * reason under it, so the client learns it exists and what it is waiting on.
 */
export function ArtworkDeletion({ order, refunds, deletableIds, settled, anyRemoved }: Props) {
  const colors = useThemeColors();
  const completed = isOrderCompleted(order);
  const [issues, setIssues] = useState<IssueRead>("loading");
  const entry = useArtworkDeletion((state) => state.byOrder[order.id] ?? IDLE_DELETION);
  const ask = useArtworkDeletion((state) => state.ask);
  const cancel = useArtworkDeletion((state) => state.cancel);
  const run = useArtworkDeletion((state) => state.run);

  useEffect(() => {
    if (!completed) return;
    let current = true;
    api.listIssues(order.id).then(
      (list) => { if (current) setIssues(list); },
      () => { if (current) setIssues("unavailable"); },
    );
    return () => { current = false; };
  }, [completed, order.id]);

  const gate = artworkDeletionGate(order, issues, refunds);
  if (gate.kind === "hidden") {
    return <Text className="pt-3 text-caption text-text-muted">{gate.reason}</Text>;
  }

  const outcome = entry.result ? deletionOutcome(entry.result) : null;
  const offer = deletableIds.length > 0 && (!entry.result || entry.result.error !== null);
  const blocked = gate.kind === "blocked" ? gate.reason : null;
  const confirm = deletionConfirmCopy(order.title, deletableIds.length);
  const OutcomeIcon = outcome?.tone === "success" ? CircleCheck : outcome?.tone === "info" ? Info : CircleAlert;
  const outcomeColor = outcome ? colors[outcome.tone] : colors.textMuted;

  return (
    <View className="gap-3 pt-3">
      <View className="flex-row items-start gap-2">
        <Clock size={14} color={colors.textMuted} style={{ marginTop: 1 }} aria-hidden />
        <Text className="flex-1 text-caption text-text-muted">{ARTWORK_RETENTION_NOTE}</Text>
      </View>

      {outcome ? (
        <View accessible accessibilityRole={outcome.tone === "error" ? "alert" : undefined} className="flex-row items-start gap-2">
          <OutcomeIcon size={16} color={outcomeColor} style={{ marginTop: 2 }} aria-hidden />
          <Text className={`flex-1 text-body ${outcome.tone === "error" ? "text-error" : "text-text-primary"}`}>
            {outcome.message}
          </Text>
        </View>
      ) : settled && !deletableIds.length && anyRemoved ? (
        <View className="flex-row items-start gap-2">
          <Trash2 size={16} color={colors.textMuted} style={{ marginTop: 2 }} aria-hidden />
          <Text className="flex-1 text-body text-text-secondary">
            Your artwork is deleted. To reorder this job, upload it again.
          </Text>
        </View>
      ) : null}

      {offer ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={DELETE_ARTWORK_LABEL}
            accessibilityHint={blocked ?? "Asks before anything is deleted"}
            accessibilityState={{ disabled: Boolean(blocked) }}
            disabled={Boolean(blocked)}
            onPress={() => ask(order.id)}
            className={`gg-btn-secondary self-start ${blocked ? "gg-disabled" : ""}`}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Trash2 size={16} color={colors.error} aria-hidden />
            <Text className="text-button text-error">{DELETE_ARTWORK_LABEL}</Text>
          </Pressable>
          {blocked ? <Text className="text-caption text-text-secondary">{blocked}</Text> : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={entry.phase !== "idle"}
        question={confirm.question}
        body={confirm.body}
        confirmLabel={entry.phase === "deleting" ? "Deleting…" : "Delete artwork"}
        cancelLabel="Keep it"
        tone="destructive"
        busy={entry.phase === "deleting"}
        leading={<Trash2 size={24} color={colors.error} aria-hidden />}
        onConfirm={() => void run(order.id, deletableIds)}
        onCancel={() => cancel(order.id)}
      />
    </View>
  );
}
