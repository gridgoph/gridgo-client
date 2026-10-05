import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { claimSlip } from "@/constants/theme";
import { formatHandoverCode, spokenHandoverCode } from "@/lib/handover";
import { encodeQr, qrPath } from "@/lib/qr";

const QUIET_ZONE = 4;

/**
 * The thing a client holds up: the hub QR (when there is one) over the
 * six-digit handover code.
 *
 * It is paper and ink in both themes — white, black, nothing else — because it
 * is read by a scanner and by a person standing in the sun, and an inverted QR
 * or a grey-on-charcoal code fails both. Only `qrToken` goes inside the QR;
 * the code is printed beside it, never encoded, because the staff check that
 * the two agree (gridgo-api `docs/HUB_HANDOVER_API.md`).
 */
export function ClaimSlip({
  otp,
  qrToken,
  qrSize = 224,
  codeLabel,
}: {
  otp: string;
  qrToken?: string;
  qrSize?: number;
  /** The words over the code: "Matching code" at the hub, "Handover code" at the door. */
  codeLabel: string;
}) {
  return (
    <View className="items-center gap-4 rounded-card border border-slip-rule bg-slip-paper px-4 py-4">
      {qrToken ? <ClaimQr token={qrToken} size={qrSize} /> : null}
      {qrToken ? <View className="h-px w-full bg-slip-rule" aria-hidden /> : null}
      <View
        accessible
        accessibilityLabel={`${codeLabel}: ${spokenHandoverCode(otp)}`}
        className="items-center gap-1"
      >
        <Text className="text-body font-medium text-slip-ink-muted">{codeLabel}</Text>
        <Text className="text-handover-code text-slip-ink" selectable>
          {formatHandoverCode(otp)}
        </Text>
      </View>
    </View>
  );
}

/** The claim token as a QR, with the four-module quiet zone scanners need. */
function ClaimQr({ token, size }: { token: string; size: number }) {
  const matrix = encodeQr(token, { ecl: "M" });
  const extent = matrix.size + QUIET_ZONE * 2;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Claim QR code for the hub staff to scan"
      testID="claim-qr"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${extent} ${extent}`}>
        <Rect x={0} y={0} width={extent} height={extent} fill={claimSlip.paper} />
        <Path d={qrPath(matrix, QUIET_ZONE)} fill={claimSlip.ink} />
      </Svg>
    </View>
  );
}
