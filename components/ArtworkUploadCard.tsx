import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import {
  ARTWORK_ACCEPTED,
  ARTWORK_MAX_MIB,
  artworkChip,
  artworkStatusLine,
  isArtworkBusy,
  type ArtworkUploadState,
} from "@/lib/artworkUpload";
import {
  ARTWORK_REVIEW_NOTE,
  THIN_FILE_NOTE,
  describeArtworkFile,
} from "@/lib/requestValidation";

type Props = {
  state: ArtworkUploadState;
  onPick: () => void;
  onRetry: () => void;
  onCancel: () => void;
  /** Hidden on read-only surfaces such as the review step. */
  readOnly?: boolean;
};

/**
 * The real state of one artwork file.
 *
 * Progress is honest: the bar filling means the bytes left the phone, and the
 * card says so in words until the server confirms it holds the file. Nothing
 * here ever shows a tick before that.
 *
 * Choosing a file is the screen's primary action, so it lives on the screen's
 * one yellow button rather than inside this card.
 */
export function ArtworkUploadCard({ state, onPick, onRetry, onCancel, readOnly }: Props) {
  const chip = artworkChip(state);
  const busy = isArtworkBusy(state);
  const facts =
    state.size != null && state.contentType
      ? describeArtworkFile({
          originalFilename: state.fileName,
          detectedContentType: state.contentType,
          size: state.size,
        })
      : [];
  const thinFile = facts.some((fact) => fact.id === "size" && fact.tone === "warn");

  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="text-h3 text-text-primary">Artwork</Text>
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
      </View>

      {state.phase === "empty" ? (
        <Text className="text-body text-text-secondary">
          Send the file you want printed — {ARTWORK_ACCEPTED}, up to {ARTWORK_MAX_MIB} MB.
        </Text>
      ) : (
        <View className="gap-2">
          <Text className="text-body-lg text-text-primary" numberOfLines={2}>
            {state.fileName}
          </Text>
          <Text
            className={state.phase === "failed" ? "text-body text-error" : "text-body text-text-secondary"}
          >
            {artworkStatusLine(state)}
          </Text>
        </View>
      )}

      {state.phase === "sending" ? <ProgressBar fraction={state.progress} /> : null}

      {facts.length ? (
        <View className="gg-panel gap-2">
          {facts.map((fact) => (
            <View key={fact.id} className="flex-row items-baseline justify-between gap-4">
              <Text className="text-caption text-text-muted">{fact.label}</Text>
              <Text
                className={
                  fact.tone === "warn"
                    ? "shrink text-body text-warning"
                    : "shrink text-body text-text-primary"
                }
                numberOfLines={1}
              >
                {fact.value}
              </Text>
            </View>
          ))}
          {thinFile ? <Text className="text-caption text-warning">{THIN_FILE_NOTE}</Text> : null}
        </View>
      ) : null}

      {!readOnly ? (
        <View className="gap-3">
          {busy ? (
            <SecondaryButton label="Cancel upload" onPress={onCancel} />
          ) : state.phase === "failed" ? (
            <>
              <SecondaryButton label="Try that file again" onPress={onRetry} />
              <SecondaryButton label="Choose a different file" onPress={onPick} />
            </>
          ) : state.phase === "empty" ? null : (
            <SecondaryButton label="Replace file" onPress={onPick} />
          )}
        </View>
      ) : null}

      {state.phase === "stored" || state.phase === "attached" ? (
        <Text className="text-caption text-text-muted">{ARTWORK_REVIEW_NOTE}</Text>
      ) : null}
    </View>
  );
}

/**
 * Transfer progress only. Monochrome on purpose — yellow is reserved for the
 * action the client can take, and a progress bar is not one.
 */
function ProgressBar({ fraction }: { fraction: number | null }) {
  const percent = fraction == null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  return (
    <View
      className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-variant"
      accessibilityRole="progressbar"
      accessibilityValue={percent == null ? { text: "Sending" } : { now: percent, min: 0, max: 100 }}
    >
      <View
        className="h-full rounded-pill bg-accent"
        // Width is a runtime value, so it cannot be a class.
        style={{ width: `${percent ?? 15}%` }}
      />
    </View>
  );
}
