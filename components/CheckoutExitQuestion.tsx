import { useSegments } from "expo-router";
import { ChevronLeft, CircleCheck } from "lucide-react-native";
import { useEffect } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";

import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Sheet } from "@/components/Sheet";
import { useVisibleTourStep } from "@/hooks/useTourStep";
import { useThemeColors } from "@/hooks/useTheme";
import {
  CHECKOUT_EXIT_OTHER,
  CHECKOUT_EXIT_OTHER_MAX,
  EXIT_QUESTION_SETTLE_MS,
  EXIT_THANKS,
  exitQuestionCanShow,
  offersOther,
  oneTapOptions,
  otherTextProblem,
} from "@/lib/checkoutExit";
import { hasActiveSession } from "@/lib/sessionGuard";
import { useAppUpdate } from "@/store/appUpdate";
import { useCall } from "@/store/call";
import { useCheckoutExit } from "@/store/checkoutExit";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

type Props = {
  /** False while something owns the whole screen (the launch intro). */
  ready: boolean;
};

/**
 * "What stopped you from ordering?" (gridgo-client#243): asked once, on a
 * later app open, of a client who reached checkout and left without paying.
 * GRIDGO decides when it is due (`lib/checkoutExit.ts`).
 *
 * Mounted once in the root layout and always the last prompt in line: it
 * waits for the intro, the update prompt, the notification explainer, the
 * tour and any call, and only asks GRIDGO once the screen has been clear for
 * a moment — the claim is the "once", so it is never spent on a question
 * nobody sees. Every answer but "Other" is one tap; skipping is as plain as
 * answering, and there is no reward.
 */
export function CheckoutExitQuestion({ ready }: Props) {
  const segments = useSegments();
  const user = useSession((s) => s.user);
  const signedIn = hasActiveSession(user);
  const legalClear = useLegalConsent((s) => legalGateFor(s, user?.id) === "clear");
  const updateShowing = useAppUpdate((s) => s.promptOpen || s.completed !== null);
  const pushExplainerOpen = usePushPrompt((s) => s.open);
  const tour = useVisibleTourStep();
  const callActive = useCall((s) => s.session != null);
  const held = useCheckoutExit((s) => s.prompt != null);
  const open = useCheckoutExit((s) => s.open);
  const foreground = useCheckoutExit((s) => s.foreground);
  const checked = useCheckoutExit((s) => s.checked);

  const clear = exitQuestionCanShow({
    ready,
    signedIn,
    onTabs: segments[0] === "(tabs)",
    legalClear,
    updateShowing,
    pushExplainerOpen,
    tourShowing: tour.step != null && tour.progress?.status === "active",
    callActive,
  });

  // A return to the front is a new app open.
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previous !== "active") useCheckoutExit.getState().resume();
      previous = next;
    });
    return () => subscription.remove();
  }, []);

  // Ask GRIDGO once per open, after the screen has stayed clear for a moment.
  useEffect(() => {
    if (!clear || held || checked === foreground) return;
    const timer = setTimeout(() => void useCheckoutExit.getState().claim(), EXIT_QUESTION_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [clear, held, checked, foreground]);

  // A claimed question waits for a clear screen, however long that takes.
  useEffect(() => {
    if (clear && held && !open) useCheckoutExit.getState().show();
  }, [clear, held, open]);

  return <ExitQuestionSheet open={open} />;
}

function ExitQuestionSheet({ open }: { open: boolean }) {
  const colors = useThemeColors();
  const question = useCheckoutExit((s) => s.question);
  const options = useCheckoutExit((s) => s.options);
  const sent = useCheckoutExit((s) => s.sent);
  const busy = useCheckoutExit((s) => s.busy);
  const error = useCheckoutExit((s) => s.error);
  const writingOther = useCheckoutExit((s) => s.writingOther);
  const otherText = useCheckoutExit((s) => s.otherText);
  const { answer, sendOther, skip, finish, setWritingOther, setOtherText } = useCheckoutExit.getState();

  const sending = busy === "sending";
  const close = sent ? finish : skip;

  return (
    <Sheet open={open} title={question} onClose={close} maxHeightRatio={0.9}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pb-2 pt-4"
        style={{ flexGrow: 0 }}
      >
        {sent ? (
          <View className="gap-4" testID="checkout-exit-thanks">
            <View className="flex-row items-center gap-3" accessible accessibilityRole="alert" accessibilityLabel={EXIT_THANKS}>
              <CircleCheck size={24} color={colors.success} strokeWidth={2} aria-hidden />
              <Text className="flex-1 text-body-lg text-text-primary">{EXIT_THANKS}</Text>
            </View>
            <PrimaryButton label="Done" onPress={finish} />
          </View>
        ) : writingOther ? (
          <View className="gap-3">
            <Pressable
              onPress={() => setWritingOther(false)}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Back to the answers"
              className="gg-touch -ml-2 flex-row items-center self-start pr-2"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              <Text className="text-button text-text-secondary">Back to the answers</Text>
            </Pressable>
            <TextField
              value={otherText}
              onChangeText={setOtherText}
              placeholder="What stopped you?"
              multiline
              autoFocus
              maxLength={CHECKOUT_EXIT_OTHER_MAX}
              accessibilityLabel="What stopped you from ordering, in your own words"
              multilineMinHeight={88}
            />
            <View className="flex-row justify-between gap-3">
              {error ? (
                <Text className="flex-1 text-caption text-error" accessibilityRole="alert">
                  {error}
                </Text>
              ) : (
                <View className="flex-1" />
              )}
              <Text className="text-caption text-text-muted" style={{ fontVariant: ["tabular-nums"] }}>
                {otherText.trim().length}/{CHECKOUT_EXIT_OTHER_MAX}
              </Text>
            </View>
            <PrimaryButton
              label={sending ? "Sending…" : "Send answer"}
              onPress={() => void sendOther()}
              disabled={sending || otherTextProblem(otherText) != null}
            />
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-body text-text-secondary">One tap sends your answer.</Text>
            <View className="gg-card-flush" accessibilityRole="list">
              {oneTapOptions(options).map((option, index) => (
                <AnswerRow
                  key={option.code}
                  label={option.label}
                  divided={index > 0}
                  disabled={sending}
                  onPress={() => void answer(option.code)}
                />
              ))}
              {offersOther(options) ? (
                <AnswerRow
                  label={options.find((option) => option.code === CHECKOUT_EXIT_OTHER)?.label || "Other"}
                  hint="Write your own answer"
                  divided
                  disabled={sending}
                  onPress={() => setWritingOther(true)}
                />
              ) : null}
            </View>
            {sending ? (
              <Text className="text-caption text-text-muted" accessibilityLiveRegion="polite">
                Sending…
              </Text>
            ) : error ? (
              <Text className="text-caption text-error" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>
        )}

        {sent ? null : (
          <Pressable
            onPress={skip}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Skip this question"
            accessibilityState={{ disabled: sending }}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : sending ? { opacity: 0.38 } : undefined)}
          >
            <Text className="text-button text-text-secondary">Skip</Text>
          </Pressable>
        )}
      </ScrollView>
    </Sheet>
  );
}

/** One answer: a full-width row, so the whole line is the target. */
function AnswerRow({
  label,
  hint,
  divided,
  disabled,
  onPress,
}: {
  label: string;
  hint?: string;
  divided: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? "Sends this answer"}
      accessibilityState={{ disabled }}
      className={
        divided
          ? "min-h-[52px] justify-center border-t border-outline-subtle px-4 py-3"
          : "min-h-[52px] justify-center px-4 py-3"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : disabled ? { opacity: 0.38 } : undefined)}
    >
      <Text className="text-body-lg text-text-primary">{label}</Text>
      {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </Pressable>
  );
}
