import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { formatDeadline } from "@/lib/deadline";
import { issueWindowClock } from "@/lib/issueWindow";

type Props = {
  openedAt: string | null;
  expiresAt: string | null | undefined;
  /** `issueWindowHours` from `GET /settings`; only sizes the meter when the order has no opening stamp. */
  windowHours: number;
  /** "Delivered 2 hours ago", said under the clock when it is known. */
  elapsedLabel: string | null;
  /** Called once when the clock reaches zero, so the screen can read the closed order. */
  onElapsed?: () => void;
};

/**
 * The check window, counting down (report 5A28D524).
 *
 * The time left is the one number a client with a problem needs, so it is
 * the largest thing on the card: hours, minutes and seconds to the expiry the
 * platform enforces, over a meter of how much of the window is left. It ticks
 * every second in words a sighted client reads at a glance, and is announced
 * to a screen reader in minutes, never second by second.
 *
 * At zero it says the window is closing and asks the screen to read the order
 * again; the platform, not this clock, is what closes it.
 */
export function IssueWindowCountdown({ openedAt, expiresAt, windowHours, elapsedLabel, onElapsed }: Props) {
  const colors = useThemeColors();
  const now = useServerNow(1000);
  const clock = issueWindowClock({ openedAt, expiresAt, windowHours, now });
  const elapsed = clock != null && clock.remainingMs <= 0;

  const reported = useRef(false);
  useEffect(() => {
    if (!elapsed || reported.current) return;
    reported.current = true;
    onElapsed?.();
  }, [elapsed, onElapsed]);

  if (!clock) return null;
  const closes = `Closes ${formatDeadline(clock.closesAt)}`;

  return (
    <View
      className="gap-2"
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`Check window. ${clock.spoken}. ${closes}.`}
      testID="issue-window-countdown"
    >
      <Text className="text-caption font-medium text-text-secondary">
        {elapsed ? "Check window closing now" : "Check window closes in"}
      </Text>
      <Text
        className="text-display text-text-primary"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {clock.clock}
      </Text>
      <View className="h-1.5 overflow-hidden rounded-pill bg-surface-variant">
        <View
          className="h-full rounded-pill"
          style={{ width: `${clock.fraction * 100}%`, backgroundColor: colors.textPrimary }}
        />
      </View>
      {/* Two lines rather than one joined: at large text a joined line breaks mid-date. */}
      <View>
        <Text className="text-caption text-text-muted">{closes}</Text>
        {elapsedLabel ? <Text className="text-caption text-text-muted">{elapsedLabel}</Text> : null}
      </View>
    </View>
  );
}
