import { usePreventRemove } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";

/**
 * "What needs to change?" — the reason that goes back with the artwork proof.
 *
 * A route rather than a hand-rolled overlay, presented as the platform's own
 * form sheet (see the root layout): drag-to-dismiss, the Android back gesture,
 * keyboard avoidance, focus containment and the scrim all come from the
 * platform, with real physics that track the finger. What is added on top is
 * the one thing the platform cannot know — that a half-written reason is work
 * worth asking about before it is thrown away.
 *
 * There is one proof decision left in the product: Operations' artwork proof.
 * The supplier print proof loop was removed from the platform, so this sheet
 * has one destination and the state is decided here, never carried in the URL.
 */
export default function RequestChangesSheet() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  // Drag-to-dismiss, the back gesture and Android's back button all route
  // through here, so a typed reason is never lost to any of them silently.
  const hasWork = trimmed.length > 0 && !busy;
  usePreventRemove(hasWork, () => setConfirmDiscard(true));

  const send = useCallback(async () => {
    if (!orderId || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      await api.transitionOrder(orderId, "client_correction", {
        reason: trimmed,
        note: trimmed,
      });
      setReason("");
      router.back();
    } catch (e) {
      setError(
        userFacingError(
          e,
          "That did not reach them. Check your connection and send it again — nothing has changed on the job.",
        ),
      );
      setBusy(false);
    }
  }, [orderId, tooShort, trimmed, router]);

  return (
    /*
      Keyboard avoidance is split by platform here, and deliberately so.

      On Android the sheet lifts itself: react-native-screens watches the IME
      inset on a form sheet and re-runs the bottom-sheet behaviour to clear it
      (`SheetDelegate.onApplyWindowInsets`). Adding padding on top of that would
      lift the content twice and push the heading off the top of the sheet, so
      nothing is added — `behavior` is left off there.

      On iOS nothing lifts it. UIKit does not move a sheet with custom detents
      for the keyboard, and react-native-screens does not either. `padding` is
      what moves this one: the detent is `fitToContents`, so growing the content
      by the keyboard's height re-measures the sheet and raises its top edge by
      the same amount, which carries the field up with it.
    */
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ backgroundColor: colors.surface }}
    >
      <View
        className="gap-5 px-4 pt-5"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">What needs to change?</Text>
          <Text className="text-body text-text-secondary">
            Operations reads this and comes back to you with a corrected proof. Be specific
            about what is wrong and where.
          </Text>
        </View>

        <View className="gap-2">
          <TextField
            value={reason}
            onChangeText={setReason}
            placeholder="The logo is cropped on the right edge and the brand red has printed orange."
            multiline
            multilineMinHeight={112}
            maxLength={500}
            autoFocus
            editable={!busy}
            accessibilityLabel="What needs to change"
          />
          {tooShort ? (
            <Text className="text-caption text-text-muted">
              At least {MIN_REASON} characters — name what is wrong and where.
            </Text>
          ) : (
            <Text className="text-caption text-text-muted">
              {500 - trimmed.length} characters left.
            </Text>
          )}
        </View>

        {error ? <ErrorState label="Not sent" body={error} /> : null}

        <View className="gap-3">
          <PrimaryButton
            label={busy ? "Sending…" : "Send this back"}
            disabled={tooShort || busy}
            onPress={() => void send()}
          />
          <SecondaryButton
            label="Cancel"
            disabled={busy}
            onPress={() => router.back()}
          />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDiscard}
        question="Discard what you have written?"
        body="Operations has not seen this yet. Closing now throws away the reason you typed; the job itself is unchanged."
        confirmLabel="Discard it"
        cancelLabel="Keep writing"
        tone="destructive"
        onConfirm={() => {
          setConfirmDiscard(false);
          setReason("");
          // The prevent-remove guard is keyed off the text, so clearing it and
          // dismissing on the next tick lets the platform finish its own
          // gesture instead of fighting it.
          requestAnimationFrame(() => router.back());
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** Shortest reason that tells someone what to fix. */
const MIN_REASON = 10;
