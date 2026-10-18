import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { claimSlip } from "@/constants/theme";
import { SIGNATURE_STROKE_WIDTH, strokePath, type Signature } from "@/lib/signature";

/** A signature the client has drawn but not yet sent, on the same white paper as the pad. */
export function SignaturePreview({ signature, height = 96 }: { signature: Signature; height?: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Your signature"
      className="overflow-hidden rounded-card border border-slip-rule bg-slip-paper"
      style={{ height }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.max(1, signature.width)} ${Math.max(1, signature.height)}`}
        preserveAspectRatio="xMidYMid meet"
        pointerEvents="none"
      >
        {signature.strokes.map((stroke, index) => (
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
    </View>
  );
}
