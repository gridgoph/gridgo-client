import { useSegments } from "expo-router";
import {
  BellRing,
  FileCheck2,
  Lock,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect } from "react";
import { Linking, Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import {
  PUSH_EXPLAINER_COPY,
  pushExplainerDue,
  type PushExplainerIcon,
  type PushExplainerMode,
} from "@/lib/push";
import { hasActiveSession } from "@/lib/sessionGuard";
import { useAppUpdate } from "@/store/appUpdate";
import { usePush } from "@/store/push";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

const ICONS = {
  artwork: FileCheck2,
  payment: Wallet,
  delivery: Truck,
  reminder: BellRing,
} satisfies Record<PushExplainerIcon, LucideIcon>;

type Props = {
  /** False while something owns the whole screen (the launch intro). */
  ready: boolean;
};

/**
 * The notification explainer: what arrives, then the one ask.
 *
 * Android 13+ raises its permission dialog once or twice and then never
 * again, so the dialog must not be spent on a stranger — and it must not be
 * left to a card on a secondary screen either, or almost nobody registers.
 * This is the middle: once a signed-in client has landed in the app, a sheet
 * says what GRIDGO will send and why, and only its "Turn on notifications"
 * raises the OS dialog. "Not now" (or any other way of putting it away) holds
 * it for `PUSH_EXPLAINER_INTERVAL_MS`; the card on Home stays meanwhile.
 *
 * Mounted once in the root layout, and drawn only over the tab shell: never
 * over sign-in, complete-profile or the ranking screen, never mid-checkout,
 * never under the launch intro, and never on top of the update prompt, which
 * is the more urgent sheet when both are due.
 */
export function PushExplainerSheet({ ready }: Props) {
  const segments = useSegments();
  const onTabs = segments[0] === "(tabs)";
  const signedIn = hasActiveSession(useSession((s) => s.user));
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const hydrated = usePushPrompt((s) => s.hydrated);
  const lastOfferedAt = usePushPrompt((s) => s.lastOfferedAt);
  const open = usePushPrompt((s) => s.open);
  const mode = usePushPrompt((s) => s.mode);
  const updateShowing = useAppUpdate((s) => s.available !== null || s.completed !== null);

  useEffect(() => {
    if (!ready || !hydrated || !onTabs || updateShowing) return;
    if (usePushPrompt.getState().open) return;
    const due = pushExplainerDue({ supported, signedIn, permission, lastOfferedAt, now: Date.now() });
    if (due) usePushPrompt.getState().offer(due);
  }, [ready, hydrated, onTabs, updateShowing, supported, signedIn, permission, lastOfferedAt]);

  // Signed out, or granted from the phone's settings while the sheet was up:
  // there is nothing left to ask.
  useEffect(() => {
    if (open && (!signedIn || permission === "granted")) usePushPrompt.getState().dismiss();
  }, [open, signedIn, permission]);

  return <ExplainerSheet open={open && ready} mode={mode} />;
}

function ExplainerSheet({ open, mode }: { open: boolean; mode: PushExplainerMode }) {
  const colors = useThemeColors();
  const dismiss = usePushPrompt((s) => s.dismiss);
  const copy = PUSH_EXPLAINER_COPY[mode];

  const act = () => {
    dismiss();
    if (mode === "settings") {
      // Only the OS can undo a blocked permission. Coming back to the app
      // re-reads it and registers (`usePush.resume`).
      void Linking.openSettings();
      return;
    }
    // Channel first, then the dialog, then the token — all inside `enable`.
    void usePush.getState().enable();
  };

  return (
    <Sheet open={open} title={copy.title} onClose={dismiss} maxHeightRatio={0.9}>
      <View className="gap-4 px-4 pt-4">
        <Text className="text-body-lg text-text-secondary">{copy.body}</Text>

        {mode === "ask" ? (
          <View
            accessible
            accessibilityLabel={`You will hear when: ${PUSH_EXPLAINER_COPY.points
              .map((point) => point.text)
              .join("; ")}.`}
          >
            {PUSH_EXPLAINER_COPY.points.map((point, index) => {
              const Icon = ICONS[point.icon];
              const last = index === PUSH_EXPLAINER_COPY.points.length - 1;
              return (
                <View key={point.icon} className="flex-row gap-3">
                  {/*
                    The moments a job meets, in order, on one thread: a job
                    moves through them and GRIDGO rings at each. The connector
                    is drawn against textMuted, never outline, which is within
                    a shade of the disc in Dark.
                  */}
                  <View className="items-center">
                    <View className="h-9 w-9 items-center justify-center rounded-pill border border-outline bg-surface-variant">
                      <Icon size={18} color={colors.textPrimary} strokeWidth={2} />
                    </View>
                    {last ? null : (
                      <View
                        className="w-px flex-1"
                        style={{ backgroundColor: colors.textMuted, opacity: 0.4, minHeight: 10 }}
                      />
                    )}
                  </View>
                  <Text
                    className={
                      last
                        ? "flex-1 pt-2 text-body text-text-primary"
                        : "flex-1 pb-3 pt-2 text-body text-text-primary"
                    }
                  >
                    {point.text}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View className="gg-panel flex-row items-start gap-3">
          <Lock size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-caption text-text-secondary">
            {PUSH_EXPLAINER_COPY.privacy}
          </Text>
        </View>

        <View className="gap-3 pb-2">
          <PrimaryButton label={copy.action} onPress={act} />
          <SecondaryButton label={PUSH_EXPLAINER_COPY.later} onPress={dismiss} />
          {mode === "ask" ? (
            <Text className="text-center text-caption text-text-muted">
              {PUSH_EXPLAINER_COPY.footnote}
            </Text>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
