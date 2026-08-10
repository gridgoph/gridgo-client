import { useState } from "react";
import { Text, View } from "react-native";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ErrorState } from "@/components/ErrorState";
import { useArtworkUpload } from "@/hooks/useArtworkUpload";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { isArtworkBusy } from "@/lib/artworkUpload";
import { userFacingError } from "@/lib/copy";
import { latestNoteForState } from "@/lib/orderState";

type Props = {
  order: Order;
  onUpdated: (order: Order) => void;
};

/**
 * The QA correction loop.
 *
 * A rejection is a correction, never a dead end: the client sees exactly why
 * the file was turned back, replaces it, and the *same* order goes to QA
 * again — its history, quote and any payment untouched. A new job is never
 * started behind the client's back.
 */
export function CorrectionCard({ order, onUpdated }: Props) {
  const artwork = useArtworkUpload();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = latestNoteForState(order.timeline, "client_correction");
  const replacementReady = artwork.state.phase === "stored";
  const uploadBusy = isArtworkBusy(artwork.state);

  const resubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Attach first, then send — Operations must never reopen a job whose
      // artwork has not landed.
      await artwork.attachTo(order.id);
      const next = await api.transitionOrder(order.id, "submitted", {
        note: "Corrected artwork sent",
      });
      artwork.reset();
      onUpdated(next);
    } catch (e) {
      setError(
        userFacingError(
          e,
          "The corrected file did not go through. Your job is unchanged — try sending it again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="text-h2 text-text-primary">Replace the artwork</Text>
        <Text className="text-body text-text-secondary">
          This is the same job — its history, price and any payment stay exactly as they are.
          Send a corrected file and it goes back into the same queue.
        </Text>
      </View>

      <View className="gg-panel gap-2">
        <Text className="text-caption text-text-muted">What Operations found</Text>
        <Text className="text-body-lg text-text-primary">
          {reason ??
            "Operations did not leave a note with this one. Check the timeline below, or ask them what to change before you re-send."}
        </Text>
        {order.artworkName ? (
          <Text className="text-caption text-text-muted">
            File turned back: {order.artworkName}
          </Text>
        ) : null}
      </View>

      <ArtworkUploadCard
        state={artwork.state}
        onPick={() => void artwork.pick()}
        onRetry={() => void artwork.retry()}
        onCancel={artwork.cancel}
      />

      {error ? <ErrorState label="Not sent" body={error} /> : null}

      <PrimaryButton
        label={
          busy
            ? "Sending…"
            : replacementReady
              ? "Send back to Operations"
              : "Choose a corrected file"
        }
        disabled={busy || uploadBusy}
        onPress={() => {
          if (replacementReady) {
            void resubmit();
            return;
          }
          void artwork.pick();
        }}
      />
    </View>
  );
}
