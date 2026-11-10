import { Check, CircleAlert, Download, ExternalLink, Mail, Rocket, Users, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CheckboxRow } from "@/components/form/CheckboxRow";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import type { PlayOptinState } from "@/lib/api";
import {
  checkGmail,
  isGmail,
  optinStepLine,
  optinSteps,
  optinStepTitle,
  type OptinStep,
  type OptinStepKey,
} from "@/lib/playOptin";

const DISC = 32;

const STEP_ICONS: Record<OptinStepKey, LucideIcon> = {
  gmail: Mail,
  group: Users,
  optin: Rocket,
  install: Download,
};

type Actions = {
  busy: boolean;
  error: string | null;
  onConfirmGmail: (email: string, googleAccount: boolean) => Promise<boolean>;
  onOpenGroup: () => void;
  onOpenOptIn: () => void;
  onOpenPlayStore: () => void;
};

/**
 * The four opt-in steps as one rail, the Founding Tester screen's grammar:
 * done steps tick, the current one opens into a card with its one action, the
 * rest wait. The current step's button is the screen's one yellow.
 */
export function PlayOptinSteps({ state, ...actions }: { state: PlayOptinState } & Actions) {
  const [editingGmail, setEditingGmail] = useState(false);
  const steps = optinSteps(state).map((step): OptinStep =>
    editingGmail ? { ...step, status: step.key === "gmail" ? "current" : "ahead" } : step,
  );
  return (
    <View>
      {steps.map((step, index) => (
        <StepRow
          key={step.key}
          step={step}
          last={index === steps.length - 1}
          state={state}
          {...actions}
          onEditGmail={() => setEditingGmail(true)}
          onGmailConfirmed={() => setEditingGmail(false)}
        />
      ))}
    </View>
  );
}

function StepRow({
  step,
  last,
  state,
  onEditGmail,
  onGmailConfirmed,
  ...actions
}: {
  step: OptinStep;
  last: boolean;
  state: PlayOptinState;
  onEditGmail: () => void;
  onGmailConfirmed: () => void;
} & Actions) {
  const colors = useThemeColors();
  const Icon = STEP_ICONS[step.key];
  const current = step.status === "current";
  const done = step.status === "done";
  const title = optinStepTitle(step.key);
  const line = optinStepLine(step.key, step.status, state);
  // A link step can be opened again: opening is not proof it was finished.
  const again =
    done && step.key === "group" && state.groupMode !== "automatic"
      ? { label: "Open again", run: actions.onOpenGroup }
      : done && step.key === "optin"
        ? { label: "Open again", run: actions.onOpenOptIn }
        : done && step.key === "gmail"
          ? { label: "Change", run: onEditGmail }
          : null;

  return (
    <View className="flex-row gap-3" testID={`optin-step-${step.key}`}>
      <View className="items-center" style={{ width: DISC }}>
        <View
          className={
            done
              ? "items-center justify-center rounded-pill bg-accent"
              : current
                ? "items-center justify-center rounded-pill border-2 border-accent bg-surface"
                : "items-center justify-center rounded-pill bg-surface-variant"
          }
          style={{ width: DISC, height: DISC }}
        >
          {done ? (
            <Check size={16} color={colors.accentOn} strokeWidth={3} />
          ) : (
            <Icon size={15} color={current ? colors.textPrimary : colors.textMuted} strokeWidth={2} />
          )}
        </View>
        {last ? null : <View className="w-0.5 flex-1 bg-outline" />}
      </View>
      <View
        className={current ? "mb-3 flex-1 gap-3 rounded-card border border-outline bg-surface p-3" : "mb-3 min-h-11 flex-1 flex-row items-center gap-2 pb-1"}
      >
        <View className="min-w-0 flex-1" accessible={!current} accessibilityLabel={`${title}. ${done ? "Done" : current ? "Now" : "Next"}.${line ? ` ${line}` : ""}`}>
          <Text className={step.status === "ahead" ? "text-body-lg font-bold text-text-muted" : "text-body-lg font-bold text-text-primary"}>
            {title}
          </Text>
          {line && step.status !== "ahead" ? (
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
        {again ? (
          <Pressable
            onPress={again.run}
            disabled={actions.busy}
            accessibilityRole="button"
            accessibilityLabel={`${again.label}: ${title}`}
            className="gg-touch justify-center px-2"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-caption font-bold text-text-primary underline">{again.label}</Text>
          </Pressable>
        ) : null}
        {current ? <CurrentAction step={step.key} state={state} {...actions} onGmailConfirmed={onGmailConfirmed} /> : null}
      </View>
    </View>
  );
}

function CurrentAction({
  step,
  state,
  busy,
  error,
  onConfirmGmail,
  onOpenGroup,
  onOpenOptIn,
  onOpenPlayStore,
  onGmailConfirmed,
}: { step: OptinStepKey; state: PlayOptinState; onGmailConfirmed: () => void } & Actions) {
  if (step === "gmail") {
    return (
      <GmailForm
        suggestion={state.gmailSuggestion}
        busy={busy}
        error={error}
        onConfirm={async (email, googleAccount) => {
          if (await onConfirmGmail(email, googleAccount)) onGmailConfirmed();
        }}
      />
    );
  }
  const action =
    step === "group"
      ? { label: "Join group", icon: ExternalLink, run: onOpenGroup }
      : step === "optin"
        ? { label: "Become a tester", icon: ExternalLink, run: onOpenOptIn }
        : { label: "Install from Play", icon: Download, run: onOpenPlayStore };
  return (
    <>
      <PrimaryAction label={action.label} icon={action.icon} busy={busy} onPress={action.run} />
      {error ? <ErrorLine text={error} /> : null}
    </>
  );
}

function GmailForm({
  suggestion,
  busy,
  error,
  onConfirm,
}: {
  suggestion: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: (email: string, googleAccount: boolean) => void;
}) {
  const [email, setEmail] = useState(suggestion ?? "");
  const [googleAccount, setGoogleAccount] = useState(false);
  const [touched, setTouched] = useState(false);
  const check = checkGmail(email, googleAccount);
  // A custom address can be a Google account; the person says so, GRIDGO cannot check.
  const address = checkGmail(email, true) === "ok";
  const askGoogle = address && !isGmail(email);
  const invalid = touched && !address;
  return (
    <>
      <TextField
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setTouched(false);
        }}
        onBlur={() => setTouched(true)}
        placeholder="you@gmail.com"
        accessibilityLabel="Gmail address"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        invalid={invalid}
      />
      {askGoogle ? (
        <CheckboxRow checked={googleAccount} onChange={setGoogleAccount} label="This is my Google account" />
      ) : null}
      <PrimaryAction
        label={busy ? "Confirming…" : "Confirm"}
        icon={Check}
        busy={busy}
        disabled={check !== "ok"}
        onPress={() => onConfirm(email, googleAccount)}
      />
      {invalid ? <ErrorLine text="Enter a Gmail address." /> : error ? <ErrorLine text={error} /> : null}
    </>
  );
}

function PrimaryAction({
  label,
  icon: Icon,
  busy,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      className={off ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <Text className="text-button text-action-yellow-on">{label}</Text>
      <Icon size={16} color={colors.actionYellowOn} strokeWidth={2.25} />
    </Pressable>
  );
}

function ErrorLine({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
      <CircleAlert size={14} color={colors.error} strokeWidth={2} />
      <Text className="min-w-0 flex-1 text-caption text-error">{text}</Text>
    </View>
  );
}
