import type { Ref } from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";

import { fontFamily } from "@/constants/fonts";
import { claimSlip } from "@/constants/theme";
import { encodeQr, qrPath } from "@/lib/qr";
import { QR_PICTURE } from "@/lib/saveMemberQr";

const QUIET_ZONE = 4;
const PLATE = 960;
/** A saved web picture cannot reach the app's own font, so it names one the browser has. */
const printed = (family: string) => (Platform.OS === "web" ? `${family}, Arial, sans-serif` : family);
const PLATE_X = (QR_PICTURE.width - PLATE) / 2;

/**
 * The join QR, drawn as the picture that is saved: black on white in both
 * themes so it always scans, with the organization and term printed under it.
 */
export function MemberQr({
  link,
  label,
  term,
  width = 264,
  ref,
}: {
  link: string;
  label: string;
  term: string;
  width?: number;
  ref?: Ref<Svg>;
}) {
  let path: string | null = null;
  let extent = 1;
  try {
    const matrix = encodeQr(link, { ecl: "M" });
    extent = matrix.size + QUIET_ZONE * 2;
    path = qrPath(matrix, QUIET_ZONE);
  } catch {
    path = null;
  }
  if (!path) {
    return <Text className="text-center text-body text-text-secondary">The QR could not be drawn. Share the link instead.</Text>;
  }
  const scale = PLATE / extent;
  return (
    <View
      className="overflow-hidden rounded-card border border-slip-rule bg-slip-paper"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code to join ${label}, ${term}`}
      testID="member-qr"
    >
      <Svg
        ref={ref}
        width={width}
        height={(width * QR_PICTURE.height) / QR_PICTURE.width}
        viewBox={`0 0 ${QR_PICTURE.width} ${QR_PICTURE.height}`}
      >
        <Rect x={0} y={0} width={QR_PICTURE.width} height={QR_PICTURE.height} fill={claimSlip.paper} />
        <Path d={path} fill={claimSlip.ink} transform={`translate(${PLATE_X} 40) scale(${scale})`} />
        <SvgText x={QR_PICTURE.width / 2} y={1112} textAnchor="middle" fontFamily={printed(fontFamily.bold)} fontSize={fitted(label)} fill={claimSlip.ink}>
          {label}
        </SvgText>
        <SvgText x={QR_PICTURE.width / 2} y={1192} textAnchor="middle" fontFamily={printed(fontFamily.medium)} fontSize={48} fill={claimSlip.inkMuted}>
          {`${term} · Join on GRIDGO`}
        </SvgText>
      </Svg>
    </View>
  );
}

/** A 40-character label still fits the picture. */
function fitted(label: string): number {
  return Math.min(72, Math.floor((QR_PICTURE.width - 120) / (Math.max(label.length, 1) * 0.58)));
}
