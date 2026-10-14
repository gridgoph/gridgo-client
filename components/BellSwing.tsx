import { useEffect, useRef, type ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { BELL_SWING_BEAT_MS, BELL_SWING_DEGREES } from "@/lib/notificationNudge";
import { useNotificationNudge } from "@/store/notificationNudge";

type Props = {
  /** The glyph's box. The swing pivots inside it, so the layout never moves. */
  size: number;
  children: ReactNode;
};

/**
 * A bell glyph that swings once on each new update (#230).
 *
 * It pivots from the crown, near the top of the box, the way a hung bell
 * moves — not from the centre, which reads as a spinner wobbling. Only the
 * glyph moves: the count plate stays where it is, so the number can be read
 * mid-swing.
 *
 * It answers `seq`, not mount: a screen opening onto an unread count is not
 * news. Reduce motion keeps the bell still; the count, the chime and the
 * spoken announcement still say it.
 */
export function BellSwing({ size, children }: Props) {
  const seq = useNotificationNudge((s) => s.seq);
  const reduced = useReducedMotion();
  const angle = useSharedValue(0);
  const lastSeq = useRef(seq);

  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;
    if (reduced) return;
    angle.value = 0;
    angle.value = withSequence(
      ...BELL_SWING_DEGREES.map((degrees) =>
        withTiming(degrees, { duration: BELL_SWING_BEAT_MS, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [seq, reduced, angle]);

  const swing = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  return (
    <Animated.View
      testID="bell-swing"
      style={[{ width: size, height: size, transformOrigin: "50% 12%" }, swing]}
    >
      {children}
    </Animated.View>
  );
}
