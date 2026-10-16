import { CircleCheck, CircleHelp, Info, TriangleAlert } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { ClipPath, Defs, G, Image as SvgImage, Line, Pattern, Rect } from "react-native-svg";

import { SecondaryButton } from "@/components/SecondaryButton";
import { claimSlip } from "@/constants/theme";
import { useArtworkImage } from "@/hooks/useArtworkImage";
import { useThemeColors } from "@/hooks/useTheme";
import type { PrintLayoutCheck, PrintLayoutCode, PrintLayoutPaper } from "@/lib/api";
import {
  layoutLabel,
  layoutPreview,
  previewPageOf,
  sizeLine,
  type LayoutAdvice,
} from "@/lib/printLayout";

/** The drawing's tallest, so a long drawing does not push everything off the phone. */
const MAX_HEIGHT = 260;
/** Room round the drawing for the crop marks. */
const GUTTER = 14;

type Props = {
  check: PrintLayoutCheck | null;
  /** The layout on screen; it can run ahead of `check.layout` while a save is on its way. */
  layout: PrintLayoutCode | null;
  /** The rendered first page to draw on the paper; a plain page box without it. */
  previewFileId?: string | null;
  advice: LayoutAdvice;
  /** One tap to the paper that takes the whole page. Absent where the paper cannot change here. */
  onSwitchPaper?: (paper: PrintLayoutPaper) => void;
  switching?: boolean;
};

/**
 * The file on the chosen paper, to scale (gridgo-client#245).
 *
 * The paper is white in both themes — it is paper — with the trim marks a
 * printer cuts to at its corners. The file's first page sits on it the way the
 * layout places it: scaled to fit, centred at its real size, or from the
 * corner. Whatever runs past the paper is drawn outside it, faint under a
 * dashed hatch, and named underneath as the part that is cut off — so the
 * client sees which part of the drawing they would lose, and the picture and
 * the words say the same thing.
 *
 * Nothing here measures. Sizes are GRIDGO's, from the check; a page it could
 * not read is said to be unknown rather than drawn at a guessed size.
 */
export function PrintLayoutPreview({ check, layout, previewFileId, advice, onSwitchPaper, switching = false }: Props) {
  const paper = check?.paper ?? null;
  const page = previewPageOf(check);
  return (
    <View className="gap-3">
      {paper && layout ? (
        <PaperFigure paper={paper} page={page} layout={layout} previewFileId={previewFileId ?? null} />
      ) : null}
      <LayoutAdviceView advice={advice} onSwitchPaper={onSwitchPaper} switching={switching} />
    </View>
  );
}

function PaperFigure({
  paper,
  page,
  layout,
  previewFileId,
}: {
  paper: PrintLayoutPaper;
  page: ReturnType<typeof previewPageOf>;
  layout: PrintLayoutCode;
  previewFileId: string | null;
}) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const { view } = useArtworkImage(page ? previewFileId : null);
  const imageUri = view.kind === "image" ? view.uri : null;

  // No page size: the paper alone, and the words below say why.
  const shape = page ? layoutPreview(paper, page, layout) : layoutPreview(paper, paper, "fit_to_paper");
  if (!shape) return null;
  const bounds = shape.bounds;
  const room = Math.max(0, width - GUTTER * 2);
  const scale = room > 0 ? Math.min(room / bounds.width, (MAX_HEIGHT - GUTTER * 2) / bounds.height) : 0;
  // Everything inside the drawing is in thousandths of a millimetre; a pixel is this many.
  const px = scale > 0 ? 1 / scale : 1;
  const viewBox = [bounds.x - GUTTER * px, bounds.y - GUTTER * px, bounds.width + GUTTER * 2 * px, bounds.height + GUTTER * 2 * px];
  const drawnWidth = bounds.width * scale + GUTTER * 2;
  const drawnHeight = bounds.height * scale + GUTTER * 2;
  const p = shape.paper;
  const g = shape.page;
  const cut = Boolean(page) && shape.clipped;

  const spoken = page
    ? `${layoutLabel(layout)} on ${paper.label}. Your page is ${sizeLine(page)}, the paper ${sizeLine(paper)}.${cut ? " The hatched part outside the paper is cut off." : ""}`
    : `${paper.label} paper, ${sizeLine(paper)}. Your page size is not known.`;

  return (
    <View className="gap-2">
      <View
        className="items-center rounded-card bg-surface-variant py-2"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={spoken}
      >
        {scale > 0 ? (
          <Svg width={drawnWidth} height={drawnHeight} viewBox={viewBox.join(" ")}>
            <Defs>
              <ClipPath id="gg-paper">
                <Rect x={p.x} y={p.y} width={p.width} height={p.height} />
              </ClipPath>
              <Pattern id="gg-cut" patternUnits="userSpaceOnUse" width={7 * px} height={7 * px} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={7 * px} stroke={colors.warning} strokeWidth={2 * px} />
              </Pattern>
            </Defs>

            {/* The part of the page past the paper's edge: faint, hatched, dashed, cut off. */}
            {cut && imageUri ? (
              <SvgImage
                href={{ uri: imageUri }}
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                preserveAspectRatio="none"
                opacity={0.3}
              />
            ) : null}
            {cut ? (
              <Rect
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                fill="url(#gg-cut)"
                stroke={colors.warning}
                strokeWidth={1.5 * px}
                strokeDasharray={`${5 * px} ${4 * px}`}
              />
            ) : null}

            <Rect x={p.x} y={p.y} width={p.width} height={p.height} fill={claimSlip.paper} stroke={claimSlip.rule} strokeWidth={1 * px} />

            {page ? (
              <G clipPath="url(#gg-paper)">
                {imageUri ? (
                  <SvgImage
                    href={{ uri: imageUri }}
                    x={g.x}
                    y={g.y}
                    width={g.width}
                    height={g.height}
                    preserveAspectRatio="none"
                  />
                ) : (
                  <Rect x={g.x} y={g.y} width={g.width} height={g.height} fill={claimSlip.rule} opacity={0.5} />
                )}
                <Rect
                  x={g.x}
                  y={g.y}
                  width={g.width}
                  height={g.height}
                  fill="none"
                  stroke={claimSlip.inkMuted}
                  strokeWidth={1 * px}
                />
              </G>
            ) : null}

            {/* The trim marks, where nothing runs over them. */}
            {cut ? null : <CropMarks x={p.x} y={p.y} width={p.width} height={p.height} px={px} color={colors.textMuted} />}
          </Svg>
        ) : (
          <View style={{ height: MAX_HEIGHT / 2 }} />
        )}
      </View>
      <View className="gap-0.5">
        <Text className="text-caption text-text-secondary">
          Paper: {paper.label} ({sizeLine(paper)})
        </Text>
        <Text className="text-caption text-text-secondary">
          {page
            ? `Your page: ${page.pageSize ? `${page.pageSize} (${sizeLine(page)})` : sizeLine(page)}`
            : "Your page: size not known"}
        </Text>
        {cut ? (
          <View className="flex-row items-center gap-2 pt-1">
            <Svg width={14} height={10} aria-hidden>
              <Rect x={0.5} y={0.5} width={13} height={9} fill="none" stroke={colors.warning} strokeDasharray="3 2" />
              <Line x1={3} y1={9} x2={9} y2={1} stroke={colors.warning} strokeWidth={1.5} />
            </Svg>
            <Text className="text-caption text-text-secondary">Hatched: outside the paper, cut off</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A printer's trim marks: two short hairlines at each corner, stopping short of it. */
function CropMarks({ x, y, width, height, px, color }: { x: number; y: number; width: number; height: number; px: number; color: string }) {
  const gap = 3 * px;
  const long = 8 * px;
  const stroke = 1 * px;
  const corners: [number, number, number, number][] = [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ];
  return (
    <G>
      {corners.map(([cx, cy, dx, dy]) => (
        <G key={`${cx}:${cy}`}>
          <Line x1={cx + dx * gap} y1={cy} x2={cx + dx * (gap + long)} y2={cy} stroke={color} strokeWidth={stroke} />
          <Line x1={cx} y1={cy + dy * gap} x2={cx} y2={cy + dy * (gap + long)} stroke={color} strokeWidth={stroke} />
        </G>
      ))}
    </G>
  );
}

/**
 * What the check says, under the picture. A cut-off is a warning with the
 * paper that fixes it one tap away; everything else is a quiet line. None of
 * it blocks: the client may want exactly this.
 */
export function LayoutAdviceView({
  advice,
  onSwitchPaper,
  switching = false,
}: {
  advice: LayoutAdvice;
  onSwitchPaper?: (paper: PrintLayoutPaper) => void;
  switching?: boolean;
}) {
  const colors = useThemeColors();
  const { cutOff } = advice;
  return (
    <View className="gap-2">
      {cutOff ? (
        <View
          className="gap-3 rounded-field border border-warning bg-surface p-3"
          accessibilityRole="alert"
        >
          <View className="flex-row items-start gap-3" accessible accessibilityLabel={`${cutOff.title} ${cutOff.body}`}>
            <View className="pt-0.5">
              <TriangleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-medium text-text-primary">{cutOff.title}</Text>
              <Text className="text-caption text-text-secondary">{cutOff.body}</Text>
            </View>
          </View>
          {cutOff.switchTo && onSwitchPaper ? (
            <SecondaryButton
              label={switching ? "Changing the paper…" : `Print on ${cutOff.switchTo.label} instead`}
              disabled={switching}
              onPress={() => cutOff.switchTo && onSwitchPaper(cutOff.switchTo)}
            />
          ) : null}
        </View>
      ) : null}
      {advice.fits ? (
        <Note icon={<CircleCheck size={14} color={colors.success} strokeWidth={2} aria-hidden />} text={advice.fits} />
      ) : null}
      {advice.mixed ? (
        <Note icon={<Info size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />} text={advice.mixed} />
      ) : null}
      {advice.unknown.map((text) => (
        <Note key={text} icon={<CircleHelp size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />} text={text} />
      ))}
    </View>
  );
}

function Note({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View className="flex-row items-start gap-2" accessible accessibilityLabel={text}>
      <View className="pt-0.5">{icon}</View>
      <Text className="min-w-0 flex-1 text-caption text-text-secondary">{text}</Text>
    </View>
  );
}

