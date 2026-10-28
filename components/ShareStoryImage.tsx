import type { Ref } from "react";
import { Platform } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText, TSpan } from "react-native-svg";

import { fontFamily } from "@/constants/fonts";
import { storyCard } from "@/constants/theme";
import type { OrderShare } from "@/lib/api";
import {
  STORY_CODE_HEADING,
  STORY_FOUNDING_TESTER,
  STORY_HEADLINE,
  STORY_HEIGHT,
  STORY_WIDTH,
  groupedCode,
  printedLink,
  storyGreeting,
} from "@/lib/orderShare";
import { encodeQr, qrPath, type QrMatrix } from "@/lib/qr";

/** Left and right margin, and the right edge everything lines up to. */
const MARGIN = 96;
const RIGHT = STORY_WIDTH - MARGIN;

/** The hero grid: the mark's own 3x3, with the job's route ending on the lit cell. */
const GRID_X = [560, 740, 920] as const;
const GRID_Y = [400, 580, 760] as const;
const GRID_R = 64;
/** Bottom-left to top-right along the grid, the way a job crosses the city. */
const ROUTE = `M${GRID_X[0]} ${GRID_Y[2]}H${GRID_X[1]}V${GRID_Y[1]}H${GRID_X[2]}V${GRID_Y[0]}`;

/** The logo mark's 100-unit geometry (components/GridgoLogo.tsx). */
const MARK_CENTRES = [15, 50, 85] as const;
const MARK_SIZE = 88;

/**
 * The Satoshi cut by name. On the web the shared picture is drawn from the SVG
 * as an image, which cannot reach the page's fonts, so it falls back to a
 * sans-serif rather than the browser's serif. Native draws with Satoshi.
 */
function face(name: string): string {
  return Platform.OS === "web" ? `${name}, "Helvetica Neue", Arial, sans-serif` : name;
}

const QR_PLATE = 304;
const QR_QUIET = 4;
/** Lines of link printed beside the QR; a longer link is left to the QR alone. */
const LINK_LINES_MAX = 3;

function qrFor(link: string | null): QrMatrix | null {
  if (!link) return null;
  try {
    return encodeQr(link, { ecl: "M" });
  } catch {
    return null;
  }
}

/** Spoken once for the whole picture. */
export function storyDescription(share: OrderShare): string {
  const parts = ["Story picture: Delivered by GRIDGO."];
  const greeting = storyGreeting(share);
  if (greeting) parts.push(`${greeting}.`);
  if (share.foundingTester) parts.push("Founding Tester.");
  if (share.inviteLink) parts.push("With a QR code for your invite link.");
  else if (share.inviteCode) parts.push(`With your invite code, ${groupedCode(share.inviteCode)}.`);
  return parts.join(" ");
}

/**
 * The 9:16 story picture: GRIDGO's design and the client's own invite, never a
 * photo. One SVG serves as the preview on the card and, through `toDataURL`,
 * as the picture that is shared, so what the client sees is what they post.
 */
export function ShareStoryImage({ share, width, ref }: { share: OrderShare; width: number; ref?: Ref<Svg> }) {
  const greeting = storyGreeting(share);
  const qr = qrFor(share.inviteLink);
  const linkLines = share.inviteLink ? printedLink(share.inviteLink, 32) : [];
  const codeLines = share.inviteCode ? codeRows(share.inviteCode) : [];

  return (
    <Svg
      ref={ref}
      width={width}
      height={(width * STORY_HEIGHT) / STORY_WIDTH}
      viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={storyDescription(share)}
    >
      <Rect x={0} y={0} width={STORY_WIDTH} height={STORY_HEIGHT} fill={storyCard.ground} />

      {/* The lockup: mark and wordmark, as on every GRIDGO surface. */}
      <G transform={`translate(${MARGIN} 112) scale(${MARK_SIZE / 100})`}>
        {MARK_CENTRES.map((cy, row) =>
          MARK_CENTRES.map((cx, column) => (
            <Circle
              key={`${row}-${column}`}
              cx={cx}
              cy={cy}
              r={13}
              fill={column < 2 ? storyCard.ink : row === 0 ? storyCard.yellow : storyCard.inkMuted}
            />
          )),
        )}
      </G>
      <SvgText x={MARGIN + MARK_SIZE + 32} y={180} fontFamily={face(fontFamily.black)} fontSize={64} fill={storyCard.ink}>
        GRID<TSpan fill={storyCard.yellow}>GO</TSpan>
      </SvgText>

      {/* The hero: the grid, a route across it, and the cell it arrived at. */}
      {GRID_Y.map((cy, row) =>
        GRID_X.map((cx, column) =>
          row === 0 && column === 2 ? null : (
            <Circle key={`grid-${row}-${column}`} cx={cx} cy={cy} r={GRID_R} fill={storyCard.quiet} />
          ),
        ),
      )}
      <Path d={ROUTE} stroke={storyCard.yellow} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={GRID_X[0]} cy={GRID_Y[2]} r={20} fill={storyCard.yellow} />
      <Circle cx={GRID_X[2]} cy={GRID_Y[0]} r={GRID_R + 30} stroke={storyCard.yellow} strokeOpacity={0.35} strokeWidth={6} fill="none" />
      <Circle cx={GRID_X[2]} cy={GRID_Y[0]} r={GRID_R} fill={storyCard.yellow} />

      <SvgText x={MARGIN} y={1040} fontFamily={face(fontFamily.black)} fontSize={148} fill={storyCard.ink}>
        {STORY_HEADLINE[0]}
      </SvgText>
      <SvgText x={MARGIN} y={1188} fontFamily={face(fontFamily.black)} fontSize={148} fill={storyCard.ink}>
        {STORY_HEADLINE[1]}
      </SvgText>

      {greeting ? (
        <SvgText x={MARGIN} y={1296} fontFamily={face(fontFamily.medium)} fontSize={56} fill={storyCard.inkSoft}>
          {greeting}
        </SvgText>
      ) : null}

      {share.foundingTester ? (
        <G>
          <Rect x={MARGIN} y={greeting ? 1344 : 1240} width={440} height={80} rx={40} stroke={storyCard.yellow} strokeWidth={4} fill="none" />
          <SvgText
            x={MARGIN + 220}
            y={greeting ? 1398 : 1294}
            textAnchor="middle"
            fontFamily={face(fontFamily.bold)}
            fontSize={40}
            fill={storyCard.yellow}
          >
            {STORY_FOUNDING_TESTER}
          </SvgText>
        </G>
      ) : null}

      <Rect x={MARGIN} y={1470} width={RIGHT - MARGIN} height={2} fill={storyCard.rule} />

      {qr ? (
        <G>
          <Rect x={MARGIN} y={1520} width={QR_PLATE} height={QR_PLATE} rx={24} fill={storyCard.yellow} />
          <G transform={`translate(${MARGIN} 1520) scale(${QR_PLATE / (qr.size + QR_QUIET * 2)})`}>
            <Path d={qrPath(qr, QR_QUIET)} fill={storyCard.onYellow} />
          </G>
          <SvgText x={MARGIN + QR_PLATE + 48} y={1580} fontFamily={face(fontFamily.bold)} fontSize={48} fill={storyCard.ink}>
            Scan to print
          </SvgText>
          <SvgText x={MARGIN + QR_PLATE + 48} y={1640} fontFamily={face(fontFamily.bold)} fontSize={48} fill={storyCard.ink}>
            with GRIDGO
          </SvgText>
          {(linkLines.length <= LINK_LINES_MAX ? linkLines : []).map((line, index) => (
            <SvgText
              key={`link-${index}`}
              x={MARGIN + QR_PLATE + 48}
              y={1716 + index * 40}
              fontFamily={face(fontFamily.medium)}
              fontSize={30}
              fill={storyCard.inkMuted}
            >
              {line}
            </SvgText>
          ))}
        </G>
      ) : codeLines.length ? (
        <G>
          <SvgText x={MARGIN} y={1580} fontFamily={face(fontFamily.bold)} fontSize={48} fill={storyCard.ink}>
            {STORY_CODE_HEADING}
          </SvgText>
          <Rect x={MARGIN} y={1630} width={RIGHT - MARGIN} height={60 + codeLines.length * 64} rx={24} stroke={storyCard.yellow} strokeWidth={4} fill="none" />
          {codeLines.map((line, index) => (
            <SvgText
              key={`code-${index}`}
              x={STORY_WIDTH / 2}
              y={1702 + index * 64}
              textAnchor="middle"
              fontFamily={face(fontFamily.bold)}
              fontSize={52}
              letterSpacing={4}
              fill={storyCard.ink}
            >
              {line}
            </SvgText>
          ))}
        </G>
      ) : null}
    </Svg>
  );
}

/** The invite code in fours, three groups to a line. */
function codeRows(code: string): string[] {
  const groups = groupedCode(code).split(" ");
  const rows: string[] = [];
  for (let start = 0; start < groups.length; start += 3) rows.push(groups.slice(start, start + 3).join(" "));
  return rows;
}
