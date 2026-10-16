import { router } from "expo-router";
import { Phone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AppState, BackHandler, Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallScreen } from "@/components/call/CallScreen";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useThemeColors } from "@/hooks/useTheme";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import type { CallSnapshot } from "@/lib/callEngine";
import { openPhoneSettings } from "@/lib/callMedia";
import { deliveryChatRoute } from "@/lib/deliveryChat";
import {
  CALL_MIC_BLOCKED,
  CALL_MIC_EXPLAINER,
  CALL_UNSUPPORTED,
  formatCallDuration,
  phaseLabel,
} from "@/lib/orderCalls";
import { useCall } from "@/store/call";
import { useSession } from "@/store/session";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** The full sentence, for the screen reader. */
function returnBarLine(session: CallSnapshot, now: number): string {
  if (session.phase === "incoming") return `${session.peerName} is calling`;
  if (session.phase === "connected" && session.connectedAt != null) {
    return `On call with ${session.peerName}, ${formatCallDuration(now - session.connectedAt)}`;
  }
  return `${session.peerName}: ${phaseLabel(session.phase)}`;
}

/** What fits in the pill: the timer once talking, else the phase. */
function returnBarShort(session: CallSnapshot, now: number): string {
  if (session.phase === "incoming") return `${session.peerName} calling`;
  if (session.phase === "connected" && session.connectedAt != null) return formatCallDuration(now - session.connectedAt);
  return phaseLabel(session.phase);
}

/**
 * The call, folded into a pill while the client reads the order or the
 * messages. Compact and centred, so it sits between a header's back control
 * and its actions rather than over them.
 */
function CallReturnBar({ session, onPress }: { session: CallSnapshot; onPress: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const lit = session.phase === "connected" || session.phase === "incoming";

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 0, right: 0, alignItems: "center" }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${returnBarLine(session, now)}. Return to the call.`}
        className="min-h-11 flex-row items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-4"
        style={{ backgroundColor: colors.accent, maxWidth: 240 }}
      >
        <View
          className="h-8 w-8 items-center justify-center rounded-pill"
          style={{ backgroundColor: lit ? colors.success : colors.surfaceVariant }}
        >
          <Phone size={15} color={lit ? colors.accentOn : colors.textPrimary} strokeWidth={2.2} aria-hidden />
        </View>
        <Text className="flex-shrink text-body font-bold" style={[{ color: colors.accentOn }, TABULAR]} numberOfLines={1}>
          {returnBarShort(session, now)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Every call surface, drawn once at the root over whatever screen is up.
 *
 * A call outlives the screen it started on: the client can fold it away to
 * read the order or send a photo, and come back from the bar. So it is not a
 * route. It also owns the questions asked before a call — this build cannot
 * call, the microphone needs a word, the microphone is off — and the
 * lifecycle hooks: a sign-out drops the call, a return to the app re-reads it.
 */
export function CallOverlay() {
  const session = useCall((s) => s.session);
  const expanded = useCall((s) => s.expanded);
  const prompt = useCall((s) => s.prompt);
  const micRefused = useCall((s) => s.micRefused);
  const owner = useSession((s) => s.user?.id ?? null);

  // A different account (or none) never inherits a call.
  useEffect(() => {
    useCall.getState().reset();
  }, [owner]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && useSession.getState().user) useCall.getState().resume();
    });
    return () => subscription.remove();
  }, []);

  // Android back folds a live call away rather than leaving it running unseen.
  useEffect(() => {
    if (!session || !expanded) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (session.phase === "ended") useCall.getState().dismiss();
      else useCall.getState().minimize();
      return true;
    });
    return () => subscription.remove();
  }, [session, expanded]);

  const openMessages = () => {
    if (!session) return;
    const orderId = session.orderId;
    if (session.phase === "incoming") void useCall.getState().decline();
    else if (session.phase === "ended") useCall.getState().dismiss();
    else useCall.getState().minimize();
    router.push(deliveryChatRoute(orderId));
  };

  return (
    <>
      {session && expanded ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 }}>
          <CallScreen
            session={session}
            micRefused={micRefused}
            canCallAgain
            onAccept={() => void useCall.getState().accept()}
            onDecline={() => void useCall.getState().decline()}
            onHangUp={() => void useCall.getState().hangUp()}
            onToggleMute={() => useCall.getState().toggleMute()}
            onToggleSpeaker={() => useCall.getState().toggleSpeaker()}
            onMinimize={() => useCall.getState().minimize()}
            onClose={() => useCall.getState().dismiss()}
            onCallAgain={() => {
              const orderId = session.orderId;
              useCall.getState().dismiss();
              void useCall.getState().startCall(orderId);
            }}
            onMessage={openMessages}
          />
        </View>
      ) : session && session.phase !== "ended" ? (
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000, elevation: 1000 }}>
          <CallReturnBar session={session} onPress={() => useCall.getState().expand()} />
        </View>
      ) : null}

      <ConfirmDialog
        visible={prompt?.kind === "mic-explainer"}
        question={CALL_MIC_EXPLAINER.title}
        body={CALL_MIC_EXPLAINER.body}
        confirmLabel={CALL_MIC_EXPLAINER.action}
        cancelLabel="Not now"
        onConfirm={() => void useCall.getState().confirmMic()}
        onCancel={() => useCall.getState().closePrompt()}
      />
      <ConfirmDialog
        visible={prompt?.kind === "mic-blocked"}
        question={CALL_MIC_BLOCKED.title}
        body={CALL_MIC_BLOCKED.body}
        confirmLabel={CALL_MIC_BLOCKED.action}
        cancelLabel="Not now"
        onConfirm={() => {
          useCall.getState().closePrompt();
          openPhoneSettings();
        }}
        onCancel={() => useCall.getState().closePrompt()}
      />
      <ConfirmDialog
        visible={prompt?.kind === "unsupported"}
        question={CALL_UNSUPPORTED.title}
        body={CALL_UNSUPPORTED.body}
        confirmLabel={CALL_UNSUPPORTED.action}
        cancelLabel="Not now"
        onConfirm={() => {
          useCall.getState().closePrompt();
          void Linking.openURL(`https://${APP_UPDATE_SOURCE.downloadPage}`).catch(() => undefined);
        }}
        onCancel={() => useCall.getState().closePrompt()}
      />
    </>
  );
}
