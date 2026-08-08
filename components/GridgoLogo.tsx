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

/** Mark → wordmark gap (`gap-2` = 8). Used to left-align the role under the wordmark. */
const MARK_WORDMARK_GAP = 8;

type MarkProps = {
  /** Rendered edge length in px. The grid scales with it. */
  size?: number;
};

/**
 * Role identity under the wordmark across the product family.
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

type LogoProps = {
  /** Rendered mark edge length in px. */
  size?: number;
  /**
   * Optional role lockup under the wordmark. Omit for plain GRIDGO
   * (individual client, signed-out, or product-agnostic surfaces).
   */
  role?: GridgoLogoRole;
};

/**
 * Mark plus wordmark, with optional role lockup.
 *
 * Layout from the family reference: mark left, wordmark right, role label
 * *below the wordmark and left-aligned with it* — not beside the wordmark,
 * not centred under the whole lockup.
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

  return (
    <View
      // Collapses the mark, wordmark, and role into one node, so a screen
      // reader says "GRIDGO Supplier" once rather than spelling out pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel={gridgoLogoAccessibilityLabel(role)}
    >
      <View className="flex-row items-center" style={{ gap: MARK_WORDMARK_GAP }}>
        <GridgoMark size={size} />
        <Text className="font-brand text-h3 text-text-primary">
          GRID<Text className="text-brand">GO</Text>
        </Text>
      </View>
      {visibleRole != null ? (
        <View
          // Sit under the wordmark only: mark width + the mark→wordmark gap.
          style={{ marginLeft: size + MARK_WORDMARK_GAP, marginTop: 2 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {role === "rider" ? (
            <View className="self-start rounded-pill bg-action-yellow px-2 py-0.5">
              <Text className="font-medium text-caption text-action-yellow-on">
                {visibleRole}
              </Text>
            </View>
          ) : (
            <Text className="text-caption text-text-muted">{visibleRole}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
