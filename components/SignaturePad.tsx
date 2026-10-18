import { useMemo, useState } from "react";
import { Platform, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";

import { claimSlip } from "@/constants/theme";
import {
  clampPoint,
  emptySignature,
  SIGNATURE_STROKE_WIDTH,
  strokePath,
  type Signature,
  type SignaturePoint,
} from "@/lib/signature";

type Props = {
  value: Signature | null;
  onChange: (signature: Signature) => void;
  disabled?: boolean;
  height?: number;
};

/** On web the pad also takes a mouse, and the page must not scroll or select under it. */
const WEB_SURFACE = Platform.OS === "web" ? ({ touchAction: "none", userSelect: "none", cursor: "crosshair" } as object) : null;

/**
 * Where the client signs by hand.
 *
 * Black ink on white paper in both themes, like the claim slip: the PNG GRIDGO
 * keeps is black on white, and the pad shows exactly that. The stroke is
 * tracked by react-native-gesture-handler, and the pad is drawn on a screen
 * of its own that does not scroll (`app/approval/sign.tsx`), so nothing
 * competes with a downstroke; on web the same gesture takes a mouse or a
 * finger. A drag that leaves the box keeps drawing on its edge.
 *
 * Clearing is the caller's control, outside the pad, so it can never be hit
 * by a stroke.
 */
export function SignaturePad({ value, onChange, disabled = false, height = 180 }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [live, setLive] = useState<SignaturePoint[] | null>(null);
  // The stroke under the pen, read by the gesture's callbacks between renders.
  const stroke = useSharedValue<SignaturePoint[]>([]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height: measured } = event.nativeEvent.layout;
    setSize({ width, height: measured });
  };

  const pan = useMemo(() => {
    const width = size?.width ?? 0;
    const tall = size?.height ?? height;
    const point = (x: number, y: number) => clampPoint({ x, y }, width, tall);
    const base = value ?? emptySignature(width, tall);
    const extend = (x: number, y: number) => {
      const next = point(x, y);
      const held = stroke.get();
      const last = held[held.length - 1];
      if (last && Math.hypot(next.x - last.x, next.y - last.y) < 1) return;
      const grown = [...held, next];
      stroke.set(grown);
      setLive(grown);
    };
    return Gesture.Pan()
      .withTestId("signature-pad")
      .enabled(!disabled && width > 0)
      .runOnJS(true)
      .minDistance(0)
      .shouldCancelWhenOutside(false)
      .onBegin((event) => {
        const first = [point(event.x, event.y)];
        stroke.set(first);
        setLive(first);
      })
      // The move that activates the pan arrives as `onStart`, every later one as `onUpdate`.
      .onStart((event) => extend(event.x, event.y))
      .onUpdate((event) => extend(event.x, event.y))
      .onFinalize(() => {
        const done = stroke.get();
        if (done.length) onChange({ width, height: tall, strokes: [...base.strokes, done] });
        stroke.set([]);
        setLive(null);
      });
  }, [disabled, height, onChange, size, stroke, value]);

  const strokes = [...(value?.strokes ?? []), ...(live ? [live] : [])];
  const blank = strokes.length === 0;

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={blank ? "Signature pad, empty" : "Signature pad, signed"}
        accessibilityHint="Draw your signature with one finger"
        className={
          disabled
            ? "gg-disabled overflow-hidden rounded-card border border-slip-rule bg-slip-paper"
            : "overflow-hidden rounded-card border border-slip-rule bg-slip-paper"
        }
        style={[{ height }, WEB_SURFACE]}
      >
        {size ? (
          <Svg width={size.width} height={size.height} pointerEvents="none">
            {/* The line to sign on: guidance, never part of the signature. */}
            <Line
              x1={20}
              x2={size.width - 20}
              y1={size.height - 40}
              y2={size.height - 40}
              stroke={claimSlip.rule}
              strokeWidth={1}
            />
            {strokes.map((stroke, index) => (
              <Path
                key={index}
                d={strokePath(stroke)}
                stroke={claimSlip.ink}
                strokeWidth={SIGNATURE_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        ) : null}
        {blank ? (
          <View pointerEvents="none" className="absolute bottom-3 left-5 right-5">
            <Text className="text-caption text-slip-ink-muted">
              {Platform.OS === "web" ? "Sign above the line with your finger or mouse" : "Sign above the line with your finger"}
            </Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
