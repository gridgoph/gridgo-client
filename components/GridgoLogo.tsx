import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { AccountType } from "@/lib/api";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The GRIDGO mark: a 3x3 grid with one corner lit.
 *
 * The grid is the product — a marketplace that routes a print job across a
 * city — and the single yellow dot is the job moving through it. Six
 * structural dots, two muted, one brand.
 *
 * Drawn in SVG rather than nine Views so the same component can be exported
 * for the app icon and splash screen later. `react-native-svg` takes colours
 * as props, which classes cannot reach, so this file reads tokens directly.
 */

/** Circle centres on both axes. 26-unit diameter against a 9-unit gap. */
const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;

type MarkProps = {
  /** Rendered edge length in px. The grid scales with it. */
  size?: number;
};

/**
 * Role identity beside the wordmark across the product family.
 * Individual client has no role — plain GRIDGO. Typed so a free string
 * cannot ship a wrong lockup label.
 */
export type GridgoLogoRole = "business" | "supplier" | "rider" | "admin";

const ROLE_VISIBLE: Record<GridgoLogoRole, string> = {
  business: "Business",
  supplier: "Supplier",
  rider: "RIDER",
  admin: "Admin",
};

/** Spoken name for the whole lockup — screen reader says this once. */
export function gridgoLogoAccessibilityLabel(role?: GridgoLogoRole): string {
  switch (role) {
    case "business":
      return "GRIDGO Business";
    case "supplier":
      return "GRIDGO Supplier";
    case "rider":
      return "GRIDGO Rider";
    case "admin":
      return "GRIDGO Admin";
    default:
      return "GRIDGO";
  }
}

/**
 * Client binary only: Business lockup when `accountType` is explicitly
 * `"business"`. Missing, individual, or anything else → plain GRIDGO.
 * Do not call this with orgName.
 */
export function logoRoleForClientAccount(
  accountType: AccountType | null | undefined,
): GridgoLogoRole | undefined {
  return accountType === "business" ? "business" : undefined;
}

export function GridgoMark({ size = 28 }: MarkProps) {
  const colors = useThemeColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {CENTRES.map((cy, row) =>
        CENTRES.map((cx, column) => (
          <Circle
            key={`${row}-${column}`}
            cx={cx}
            cy={cy}
            r={RADIUS}
            // Columns 1-2 are structural, so they invert with the theme. Only
            // the top-right dot holds yellow, and it holds it in both themes.
            fill={
              column < 2
                ? colors.accent
                : row === 0
                  ? colors.brandLogo
                  : colors.textMuted
            }
          />
        )),
      )}
    </Svg>
  );
}

/* ---------------------------------------------------------------------------
   Lockup proportions

   All read off the family reference, and all derived from `size`, so one
   number scales mark and type together. At the default (28) the wordmark
   lands on the scale at 20 (text-h3) and the role at 16 (text-body-lg).
   --------------------------------------------------------------------------- */

/** Wordmark type against the plain mark. 28 → 20. */
const WORDMARK_FONT_RATIO = 20 / 28;
/** Tighter than h3's 26/20: the reference sets the two lines as one block. */
const WORDMARK_LEADING = 1.15;
/**
 * Role type against the wordmark. 20 → 16.
 *
 * Measured off the reference against its **flat-topped** caps — R/I/D are 27px
 * to Business's B at 21px. Comparing against the round `G` (29px, which
 * overshoots the cap line at both ends) reads ~0.62 and makes the role word a
 * footnote. It is not one: it is noticeably smaller than GRIDGO, in a lighter
 * cut, and unmistakably part of the lockup.
 */
const ROLE_FONT_RATIO = 21 / 27;
/** The design system's 12px floor. A small `size` shrinks the mark, not the word. */
const ROLE_FONT_MIN = 12;
/** Leading on the role line, matching the reference's baseline-to-baseline. */
const ROLE_LEADING = 4 / 3;
/** Mark → text gap. Reference: 18px against a 41px wordmark. */
const MARK_TEXT_GAP_RATIO = 0.4;

export type GridgoLockupMetrics = {
  /** Mark edge length. Spans the whole text block, however many lines it has. */
  markSize: number;
  wordmarkFontSize: number;
  wordmarkLineHeight: number;
  roleFontSize: number;
  /** Height of the role slot — the second line the mark has to cover. */
  roleLineHeight: number;
  /** Mark → text column gap. */
  gap: number;
};

/**
 * The one place the lockup's geometry is decided.
 *
 * The rule the layout exists to hold: **the mark spans the full height of the
 * text block beside it**. With a role that block is two lines, so the mark is
 * both line boxes tall — never a one-line mark with a caption hung underneath.
 */
export function gridgoLockupMetrics(size: number, hasRole: boolean): GridgoLockupMetrics {
  const wordmarkFontSize = Math.round(size * WORDMARK_FONT_RATIO);
  const roleFontSize = Math.max(
    ROLE_FONT_MIN,
    Math.round(wordmarkFontSize * ROLE_FONT_RATIO),
  );
  const roleLineHeight = Math.round(roleFontSize * ROLE_LEADING);

  const wordmarkLineHeight = Math.round(wordmarkFontSize * WORDMARK_LEADING);

  return {
    // With a role: exactly the two-line block. Without: `size`, which keeps
    // the single-line lockup at the height it has always had.
    markSize: hasRole ? wordmarkLineHeight + roleLineHeight : size,
    wordmarkFontSize,
    wordmarkLineHeight,
    roleFontSize,
    roleLineHeight,
    gap: Math.round(wordmarkFontSize * MARK_TEXT_GAP_RATIO),
  };
}

type LogoProps = {
  /**
   * Mark edge length in px for the **plain** lockup, and the unit the whole
   * lockup scales from — the wordmark and role type are derived from it.
   *
   * It is no longer the mark's height in every case: with a role the text
   * block gains a line, so the mark grows by that line to keep spanning it.
   * Use `gridgoLockupMetrics` if a caller needs the rendered height.
   */
  size?: number;
  /**
   * Optional role lockup beside the wordmark. Omit for plain GRIDGO
   * (individual client, signed-out, or product-agnostic surfaces).
   */
  role?: GridgoLogoRole;
};

/**
 * Mark plus wordmark, with optional role lockup.
 *
 * Layout from the family reference: the mark sits left and stands as tall as
 * the whole text block; the wordmark and the role stack in a column to its
 * right, sharing one left edge.
 *
 *   +------+  GRIDGO
 *   | mark |  Business
 *   +------+
 *
 * The mark is *not* a row-mate of the wordmark with the role hung underneath —
 * that caps the mark at a single line, which is the shape this replaced.
 *
 * `GO` uses `brand`, not `actionYellow`. `#FFDE58` on the light canvas is
 * illegible, and `brand` resolves to `#D4A017` in Light and `#FFDE58` in
 * Dark — yellow in both themes, without spending the screen's one CTA colour.
 *
 * Rider is the deliberate exception: uppercase `RIDER` in a filled yellow
 * pill with dark text (always dark — it sits on yellow, not the canvas).
 */
export function GridgoLogo({ size = 28, role }: LogoProps) {
  const visibleRole = role ? ROLE_VISIBLE[role] : null;
  const metrics = gridgoLockupMetrics(size, visibleRole != null);

  return (
    <View
      // Collapses the mark, wordmark, and role into one node, so a screen
      // reader says "GRIDGO Supplier" once rather than spelling out pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel={gridgoLogoAccessibilityLabel(role)}
      className="flex-row items-center self-start"
      style={{ gap: metrics.gap }}
    >
      <GridgoMark size={metrics.markSize} />
      {/* The text block the mark is measured against: wordmark over role. */}
      <View>
        <Text
          className="font-brand text-text-primary"
          style={{ fontSize: metrics.wordmarkFontSize, lineHeight: metrics.wordmarkLineHeight }}
        >
          GRID<Text className="text-brand">GO</Text>
        </Text>
        {visibleRole != null ? (
          <View
            // One fixed slot, so the mark's growth and the role's height are
            // the same number whether the role is a word or the rider pill.
            style={{ height: metrics.roleLineHeight }}
            className="justify-center self-start"
            aria-hidden
          >
            {role === "rider" ? (
              <View
                className="justify-center rounded-pill bg-action-yellow px-2"
                style={{ height: metrics.roleLineHeight }}
              >
                <Text
                  className="font-medium text-action-yellow-on"
                  style={{ fontSize: metrics.roleFontSize }}
                >
                  {visibleRole}
                </Text>
              </View>
            ) : (
              <Text
                className="font-normal text-text-primary"
                style={{ fontSize: metrics.roleFontSize, lineHeight: metrics.roleLineHeight }}
              >
                {visibleRole}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
