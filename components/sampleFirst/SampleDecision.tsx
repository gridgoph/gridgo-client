import { Camera, ImageUp } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { DangerButton } from "@/components/DangerButton";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ChoiceList } from "@/components/sampleFirst/ChoiceList";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { SampleBatch } from "@/lib/api";
import { useApproval } from "@/store/approval";
import { useSampleBatches } from "@/store/sampleBatches";

const REASON_MAX = 500;

/** The phone's photo of this sample, kept apart from any order's approval photo. */
export function sampleDecisionScope(batchId: string): string {
  return `sample-batch:${batchId}`;
}

/**
 * The client's answer to a sample that has arrived (gridgo-api#222).
 *
 * Approve is a tick and a photo of the sample in hand: together they are the
 * standard the batch is held to if anything is disputed later. Rejecting asks
 * what is wrong and what happens next — a new sample with the changes, or no
 * batch at all — because the API needs both and the client should choose
 * knowingly. A faulty sample is still refunded through its own order.
 */
export function SampleDecision({
  batch,
  onOpenSampleOrder,
}: {
  batch: SampleBatch;
  onOpenSampleOrder: () => void;
}) {
  const colors = useThemeColors();
  const scope = sampleDecisionScope(batch.id);
  const photo = useApproval((state) => state.samplePhotos[scope]);
  const busy = useSampleBatches((state) => state.busy);
  const [ticked, setTicked] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [next, setNext] = useState<"resample" | "cancel" | null>(null);

  const photoReady = photo?.phase === "stored" && Boolean(photo.fileId);
  const canApprove = photoReady && ticked && busy == null;
  const canReject = reason.trim().length > 0 && next != null && busy == null;

  const approve = () => {
    if (!canApprove || !photo?.fileId) return;
    void useSampleBatches.getState().approve(batch.id, photo.fileId);
  };

  const reject = () => {
    if (!canReject || !next) return;
    void useSampleBatches.getState().reject(batch.id, reason.trim(), next);
  };

  if (rejecting) {
    return (
      <View className="gap-4">
        <Text className="text-overline text-text-muted">WHAT IS WRONG?</Text>
        <TextField
          value={reason}
          onChangeText={setReason}
          accessibilityLabel="What is wrong with the sample"
          placeholder="For example: the colours are too dark"
          multiline
          maxLength={REASON_MAX}
          editable={busy == null}
        />
        <Text className="text-overline text-text-muted">WHAT NEXT?</Text>
        <ChoiceList
          label="What next"
          selected={next}
          onSelect={setNext}
          disabled={busy != null}
          choices={[
            {
              value: "resample",
              label: "Order a new sample",
              note: "Change what you need and pay for another sample. Your batch waits.",
            },
            { value: "cancel", label: "Cancel the batch", note: "Nothing more is ordered from this sample." },
          ]}
        />
        {next === "cancel" ? (
          <DangerButton
            label={busy === "reject" ? "Sending…" : "Reject and cancel the batch"}
            disabled={!canReject}
            onPress={reject}
          />
        ) : (
          <SecondaryButton
            label={busy === "reject" ? "Sending…" : "Reject the sample"}
            disabled={!canReject}
            onPress={reject}
          />
        )}
        <Pressable
          onPress={() => setRejecting(false)}
          accessibilityRole="button"
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Back to approving</Text>
        </Pressable>
        <Text className="text-caption text-text-muted">
          A faulty sample can still be refunded. Report it on the sample order.
        </Text>
        <SecondaryButton label="Open the sample order" onPress={onOpenSampleOrder} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Text className="text-overline text-text-muted">IS THE SAMPLE RIGHT?</Text>
      <Text className="text-body text-text-secondary">
        Take a photo of the sample you received. Your approval and the photo are the standard your
        batch is made to.
      </Text>

      {photo?.localUri ? (
        <View className="flex-row items-center gap-3">
          <Image
            source={{ uri: photo.localUri }}
            accessibilityLabel="Photo of the sample you received"
            className="h-20 w-20 rounded-card bg-surface-variant"
            resizeMode="cover"
          />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body text-text-primary" numberOfLines={1}>
              {photo.fileName ?? "Sample photo"}
            </Text>
            {photo.phase === "sending" ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text className="text-caption text-text-muted">Sending to GRIDGO…</Text>
              </View>
            ) : photo.phase === "stored" ? (
              <Text className="text-caption text-success">Saved with GRIDGO</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {photo?.error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {photo.error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void useApproval.getState().pickSamplePhoto(scope)}
        disabled={busy != null || photo?.phase === "sending"}
        accessibilityRole="button"
        accessibilityLabel={photo?.localUri ? "Choose another photo" : "Add a photo of the sample"}
        accessibilityState={{ disabled: busy != null || photo?.phase === "sending" }}
        className={busy != null || photo?.phase === "sending" ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {photo?.localUri ? (
          <ImageUp size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
        ) : (
          <Camera size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
        )}
        <Text className="text-button text-text-primary">
          {photo?.localUri ? "Choose another photo" : "Add a photo of the sample"}
        </Text>
      </Pressable>

      <CheckboxRow
        checked={ticked}
        onChange={setTicked}
        label="This sample is right. Make my batch to match it."
        disabled={busy != null}
      />

      <View className="gap-2">
        <PrimaryButton
          label={busy === "approve" ? "Approving…" : "Approve the sample"}
          disabled={!canApprove}
          onPress={approve}
        />
        <Text className="text-center text-caption text-text-muted">
          {!photoReady ? "Add a photo of the sample to approve." : !ticked ? "Tick the box to approve." : "You can order the batch next."}
        </Text>
      </View>

      <SecondaryButton label="Something is wrong" disabled={busy != null} onPress={() => setRejecting(true)} />
    </View>
  );
}
