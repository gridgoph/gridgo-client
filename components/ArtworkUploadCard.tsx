import { Upload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { PrintResolution } from "@/lib/printResolution";
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
  /**
   * `primary` when choosing a file is the one thing the screen is for.
   *
   * The artwork screen has nothing else a client can do until a file lands, so
   * there the empty card carries the screen's yellow and the card itself is the
   * button. Inside a longer form — the request stepper, a QA correction — the
   * card is one field among several and stays quiet.
   */
  emphasis?: "primary" | "quiet";
  /**
   * What this file will actually print at, at the size the client chose.
   *
   * Passed in rather than computed here, because it needs the chosen size and
   * this card only knows the file. Null where either number is unknown — a
   * custom size nobody has measured, or a file that stated no dimensions.
   */
  resolution?: PrintResolution | null;
};

/**
 * The real state of one artwork file.
 *
 * Progress is honest: the bar filling means the bytes left the phone, and the
 * card says so in words until the server confirms it holds the file. Nothing
 * here ever shows a tick before that.
 *
 * An empty card is a button. It used to be a paragraph explaining what to send
 * with no way to send it — the only control on the screen was a yellow
 * "Go to checkout" that stayed disabled until a file appeared, which is a
 * screen asking for something and offering no way to give it. So the empty
 * card takes the tap itself, and the yellow goes back to the checkout button
 * the moment the file is on the line.
 */
export function ArtworkUploadCard({
  state,
  onPick,
  onRetry,
  onCancel,
  readOnly,
  emphasis = "quiet",
  resolution = null,
}: Props) {
  const colors = useThemeColors();
  const chip = artworkChip(state);
  const busy = isArtworkBusy(state);
  const facts = describeArtworkFile({
    originalFilename: state.fileName || null,
    detectedContentType: state.contentType,
    size: state.size,
  });
  /*
    The byte count is a proxy, and only worth showing while there is nothing
    better. Once GRIDGO has read the real pixel dimensions and the client has
    chosen a size, the resolution is a measurement rather than a guess — and a
    measured warning beside a guessed one about the same file is one warning
    too many. So the guess stands down.
  */
  const thinFile =
    !resolution && facts.some((fact) => fact.id === "size" && fact.tone === "warn");
  const showFacts = facts.length > 0 || Boolean(resolution) || thinFile;

  // Empty and idle is the only state where tapping the card has one obvious
  // meaning. Once a file is on it the card is a report with its own controls,
  // and mid-transfer the only sensible action is Cancel.
  const pickable = !readOnly && !busy && state.phase === "empty";

  const body = (
    <>
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

      {showFacts ? (
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
          {resolution ? (
            <Text
              className={
                resolution.verdict === "low"
                  ? "text-caption text-warning"
                  : "text-caption text-text-muted"
              }
            >
              {resolution.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {pickable ? (
        /*
          The card is the control, so this is the plate that says so rather
          than a second button inside a button. Yellow only where choosing a
          file is the screen's whole job — see `emphasis`.
        */
        <View
          className={
            emphasis === "primary"
              ? "flex-row items-center justify-center gap-2 rounded-field bg-action-yellow px-4 py-3"
              : "flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface-variant px-4 py-3"
          }
        >
          <Upload
            size={16}
            color={emphasis === "primary" ? colors.actionYellowOn : colors.textPrimary}
            strokeWidth={2.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            className={
              emphasis === "primary"
                ? "text-button text-action-yellow-on"
                : "text-button text-text-primary"
            }
          >
            Choose a file
          </Text>
        </View>
      ) : null}

      {!readOnly && !pickable ? (
        <View className="gap-3">
          {busy ? (
            <SecondaryButton label="Cancel upload" onPress={onCancel} />
          ) : state.phase === "failed" ? (
            <>
              <SecondaryButton label="Try that file again" onPress={onRetry} />
              <SecondaryButton label="Choose a different file" onPress={onPick} />
            </>
          ) : (
            <SecondaryButton label="Replace file" onPress={onPick} />
          )}
        </View>
      ) : null}

      {state.phase === "stored" || state.phase === "attached" ? (
        <Text className="text-caption text-text-muted">{ARTWORK_REVIEW_NOTE}</Text>
      ) : null}
    </>
  );

  if (!pickable) {
    return <View className="gg-card gap-4">{body}</View>;
  }

  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="button"
      accessibilityLabel="Choose your artwork file"
      accessibilityHint={`${ARTWORK_ACCEPTED}, up to ${ARTWORK_MAX_MIB} MB`}
      className="gg-card gg-touch gap-4"
      style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
    >
      {body}
    </Pressable>
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
