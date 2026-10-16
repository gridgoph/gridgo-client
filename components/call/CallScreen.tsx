import {
  ChevronDown,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  PhoneMissed,
  PhoneOff,
  ShieldCheck,
  Volume2,
  WifiOff,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallControl } from "@/components/call/CallControl";
import { ChatAvatar } from "@/components/ChatAvatar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { CallSnapshot } from "@/lib/callEngine";
import { openPhoneSettings } from "@/lib/callMedia";
import { orderReference } from "@/lib/orderReference";
import {
  CALL_PRIVACY_LINE,
  endCopy,
  formatCallDuration,
  phaseLabel,
  type CallEndCopy,
} from "@/lib/orderCalls";

type Props = {
  session: CallSnapshot;
  micRefused: boolean;
  /** Whether the order can still be called, for "Call again". */
  canCallAgain: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onCallAgain: () => void;
  onMessage: () => void;
};

const AVATAR = 112;
const TABULAR = { fontVariant: ["tabular-nums" as const] };

const END_ICONS = { "phone-off": PhoneOff, "phone-missed": PhoneMissed, "wifi-off": WifiOff };

/** The running talk time, ticking once a second while connected. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since == null ? 0 : Math.max(0, now - since);
}

/** One hairline ring leaving the avatar: what "it is ringing" looks like without sound. */
function RingWave({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 0.55 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

function Ringing({ active, color }: { active: boolean; color: string }) {
  const reduced = useReducedMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) {
      first.value = 0;
      second.value = 0;
      return;
    }
    const wave = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    first.value = wave;
    second.value = withDelay(800, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [active, reduced, first, second]);
  if (!active || reduced) return null;
  return (
    <>
      <RingWave progress={first} color={color} />
      <RingWave progress={second} color={color} />
    </>
  );
}

function EndingBlock({ copy }: { copy: CallEndCopy }) {
  const colors = useThemeColors();
  const Icon = END_ICONS[copy.icon];
  const tone = copy.icon === "phone-off" ? colors.textSecondary : copy.icon === "wifi-off" ? colors.error : colors.warning;
  return (
    <View className="items-center gap-2" accessibilityLiveRegion="assertive" accessible>
      <View className="flex-row items-center gap-2">
        <Icon size={22} color={tone} strokeWidth={2} aria-hidden />
        <Text className="text-h2 text-text-primary">{copy.title}</Text>
      </View>
      {copy.detail ? (
        <Text className="max-w-[320px] text-center text-body-lg text-text-secondary">{copy.detail}</Text>
      ) : null}
    </View>
  );
}

/**
 * A voice call with the rider, full screen.
 *
 * Read top to bottom, it answers what a person glances at a call screen to
 * know: who, whether it is ringing or talking (the timer is the one large
 * figure), and how to stop it. The controls sit where a thumb rests and
 * never move between phases, so End is always in the same place.
 *
 * It follows the theme like every other screen; a call is part of the order,
 * not a different product.
 */
export function CallScreen({
  session,
  micRefused,
  canCallAgain,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onToggleSpeaker,
  onMinimize,
  onClose,
  onCallAgain,
  onMessage,
}: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(session.phase === "connected" || session.phase === "reconnecting" ? session.connectedAt : null);
  const { phase, peerName, ending } = session;
  const incoming = phase === "incoming";
  const ended = phase === "ended";
  const ringing = phase === "preparing" || phase === "calling" || phase === "ringing" || incoming;
  const talking = phase === "connected" || phase === "reconnecting";
  const reference = orderReference(session.orderId);
  const endingCopy: CallEndCopy | null = ended && ending
    ? ending.problem
      ? { title: ending.problem.title, detail: ending.problem.body, icon: "phone-off", callAgain: false }
      : endCopy(ending.reason, peerName, ending.durationMs)
    : null;

  const status = talking && phase === "connected" ? formatCallDuration(elapsed) : phaseLabel(phase);

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      accessibilityViewIsModal
    >
      <View className="h-11 flex-row items-center px-4">
        {!ended ? (
          <Pressable
            onPress={onMinimize}
            accessibilityRole="button"
            accessibilityLabel="Hide the call screen"
            accessibilityHint="The call carries on. Tap the bar at the top to come back."
            hitSlop={8}
            className="gg-touch flex-row items-center gap-1 pr-3"
          >
            <ChevronDown size={24} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="text-body-lg text-text-primary">Hide</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1 items-center justify-center gap-5 px-4">
        <View className="items-center justify-center" style={{ width: AVATAR * 1.6, height: AVATAR * 1.6 }}>
          <Ringing active={ringing} color={incoming ? colors.success : colors.textMuted} />
          <ChatAvatar name={peerName} size={AVATAR} />
        </View>

        <View className="items-center gap-1">
          <Text className="text-display text-text-primary" numberOfLines={1} accessibilityRole="header">
            {peerName}
          </Text>
          <Text className="text-center text-body-lg text-text-secondary">
            {incoming ? "Your rider is calling" : "Your rider"}
            {reference ? ` for order ${reference}` : ""}
          </Text>
        </View>

        {endingCopy ? (
          <EndingBlock copy={endingCopy} />
        ) : (
          <View className="items-center gap-2" accessibilityLiveRegion="polite">
            <Text
              className={talking ? "text-h1 text-text-primary" : "text-h3 text-text-secondary"}
              style={TABULAR}
              accessibilityLabel={phase === "connected" ? `Connected, ${status}` : status}
            >
              {status}
            </Text>
            {phase === "reconnecting" ? (
              <View className="flex-row items-center gap-2">
                <WifiOff size={16} color={colors.warning} strokeWidth={2} aria-hidden />
                <Text className="text-body text-text-secondary">The connection dropped. Hold on.</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View className="gap-6 px-4">
        {micRefused && incoming ? (
          <View className="gg-card gap-3">
            <Text className="text-body font-medium text-text-primary">The microphone is off for GRIDGO</Text>
            <Text className="text-body text-text-secondary">
              Turn it on in your phone&apos;s settings, then tap Accept. Or decline and send a message.
            </Text>
            <SecondaryButton label="Open settings" onPress={openPhoneSettings} />
          </View>
        ) : null}

        {!ended ? (
          <View className="flex-row items-center justify-center gap-2">
            <ShieldCheck size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
            <Text className="flex-shrink text-center text-caption text-text-muted">{CALL_PRIVACY_LINE}</Text>
          </View>
        ) : null}

        {incoming ? (
          <View className="gap-4">
            <View className="flex-row items-start justify-around">
              <CallControl
                icon={PhoneOff}
                label="Decline"
                tone="danger"
                size={72}
                accessibilityLabel={`Decline the call from ${peerName}`}
                onPress={onDecline}
              />
              <CallControl
                icon={Phone}
                label="Accept"
                tone="success"
                size={72}
                accessibilityLabel={`Accept the call from ${peerName}`}
                onPress={onAccept}
              />
            </View>
            <Pressable
              onPress={onMessage}
              accessibilityRole="button"
              className="gg-touch flex-row items-center justify-center gap-2 self-center px-3"
            >
              <MessageCircle size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              <Text className="text-body font-medium text-text-secondary">Reply with a message</Text>
            </Pressable>
          </View>
        ) : ended ? (
          <View className="gap-3">
            {endingCopy?.callAgain && canCallAgain ? (
              <PrimaryButton label="Call again" onPress={onCallAgain} />
            ) : null}
            {endingCopy?.callAgain ? (
              <SecondaryButton label="Send a message" onPress={onMessage} />
            ) : null}
            <SecondaryButton label="Close" onPress={onClose} />
          </View>
        ) : (
          <View className="gap-6">
            <View className="flex-row items-start justify-center gap-10">
              <CallControl
                icon={session.muted ? MicOff : Mic}
                label={session.muted ? "Muted" : "Mute"}
                tone={session.muted ? "on" : "neutral"}
                checked={session.muted}
                accessibilityLabel="Mute"
                onPress={onToggleMute}
              />
              <CallControl
                icon={Volume2}
                label="Speaker"
                tone={session.speaker ? "on" : "neutral"}
                checked={session.speaker}
                onPress={onToggleSpeaker}
              />
            </View>
            <View className="items-center">
              <CallControl
                icon={PhoneOff}
                label={phase === "preparing" || phase === "calling" || phase === "ringing" ? "Cancel" : "End"}
                tone="danger"
                size={72}
                accessibilityLabel={
                  phase === "preparing" || phase === "calling" || phase === "ringing"
                    ? "Cancel the call"
                    : `End the call with ${peerName}`
                }
                onPress={onHangUp}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
