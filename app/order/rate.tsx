import { usePreventRemove } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StarRating } from "@/components/StarRating";
import { TextField } from "@/components/form/TextField";
import * as api from "@/lib/api";
import {
  COMMENT_MAX,
  NO_SCORES,
  RATED_FACTORS,
  factorBlurb,
  factorLabel,
  isAlreadyRated,
  isComplete,
  ratingErrorMessage,
  toRequest,
  type RatingScores,
} from "@/lib/rating";

/**
 * How did it go?
 *
 * Asked once, after the job is finished and the window to report a problem has
 * closed — deliberately not before. A rating collected while a job is still
 * running is a bargaining chip, and the platform refuses one, so an app that
 * asked early would only be walking somebody into a refusal.
 *
 * Three questions, not four. A client ranks quality, speed, cost and distance
 * when choosing a shop, but GRIDGO made the choice and they never saw where
 * the shop was — rating a decision you did not make and cannot see produces
 * noise, not evidence. Cost becomes "value", because what a client can judge
 * afterwards is whether it was worth the money, not whether the price was low.
 *
 * They are never told which shop ran the job, so this is not a public review
 * of a business. It is what tells matching to send the next job to somebody
 * who did this one well.
 *
 * A sheet rather than a screen: it is a short question over an order already
 * on display, and the platform's own form sheet brings the drag-to-dismiss,
 * back gesture, keyboard avoidance and scrim with it. What is added on top is
 * the one thing the platform cannot know — that half-written feedback is worth
 * asking about before it is thrown away.
 */
export default function RateOrderSheet() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [scores, setScores] = useState<RatingScores>(NO_SCORES);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const ready = isComplete(scores);
  // Stars alone are not worth guarding — they are five taps to redo. Something
  // typed is, and losing a written sentence to a stray back gesture is the
  // thing worth one question.
  const unsaved = Boolean(comment.trim()) && !busy;
  usePreventRemove(unsaved && !confirmDiscard, () => setConfirmDiscard(true));

  const send = useCallback(async () => {
    if (!ready || busy || !orderId) return;
    setBusy(true);
    setError(null);
    try {
      await api.rateOrder(orderId, toRequest(scores, comment));
      router.back();
    } catch (caught) {
      // Already rated is not a failure. Another device, or an earlier tap, got
      // there first; there is nothing left for this person to do and holding
      // them on a form to read an error would be the wrong ending.
      if (isAlreadyRated(caught)) {
        router.back();
        return;
      }
      setError(ratingErrorMessage(caught));
      setBusy(false);
    }
  }, [ready, busy, orderId, scores, comment, router]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ paddingBottom: insets.bottom }}>
      <View className="gap-6 px-4 pb-4 pt-5">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">How did it go?</Text>
          <Text className="text-body text-text-secondary">
            This decides who prints your next job. It is never shown to you as a shop name,
            and nobody sees who left it.
          </Text>
        </View>

        {RATED_FACTORS.map((factor) => (
          <View key={factor} className="gap-2">
            <Text className="text-body-lg text-text-primary">{factorLabel(factor)}</Text>
            <Text className="text-caption text-text-muted">{factorBlurb(factor)}</Text>
            <StarRating
              label={factorLabel(factor)}
              value={scores[factor]}
              onChange={(stars) => setScores((current) => ({ ...current, [factor]: stars }))}
            />
          </View>
        ))}

        {/*
          Optional, and said to be. A required comment box turns a five-tap
          answer into a writing task, and what comes back is "ok" from everyone
          who wanted to be finished.
        */}
        <View className="gap-2">
          <Text className="text-body-lg text-text-primary">
            Anything worth passing on?
          </Text>
          <Text className="text-caption text-text-muted">Optional.</Text>
          <TextField
            value={comment}
            onChangeText={setComment}
            maxLength={COMMENT_MAX}
            placeholder="What went well, or what would you change?"
            multiline
            accessibilityLabel="Anything worth passing on, optional"
          />
        </View>

        {error ? <Text className="text-body text-error">{error}</Text> : null}

        <View className="gap-3">
          <PrimaryButton
            label={busy ? "Sending…" : "Send rating"}
            onPress={() => void send()}
            disabled={!ready || busy}
          />
          <SecondaryButton
            label="Not now"
            onPress={() => (unsaved ? setConfirmDiscard(true) : router.back())}
            disabled={busy}
          />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDiscard}
        question="Discard what you wrote?"
        body="Your stars and your note will not be sent. You can rate this order later from the order screen."
        confirmLabel="Discard"
        cancelLabel="Keep writing"
        tone="destructive"
        onConfirm={() => {
          setConfirmDiscard(false);
          router.back();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </KeyboardAvoidingView>
  );
}
