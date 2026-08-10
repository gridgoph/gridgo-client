import { render, screen, within } from "@testing-library/react-native";
import { Appearance, processColor } from "react-native";

import {
  GridgoLogo,
  GridgoMark,
  gridgoLockupMetrics,
  gridgoLogoAccessibilityLabel,
  logoRoleForClientAccount,
  type GridgoLogoRole,
} from "@/components/GridgoLogo";
import { colors } from "@/constants/theme";

/**
 * react-native-svg renders to host nodes named `RNSVGCircle`, and their `fill`
 * prop is a processed colour object rather than the hex string that was passed
 * in. So: find by host type name, read `fill.payload`, and compare against
 * `processColor(token)`.
 */
function circleFills(): unknown[] {
  const circles = screen.root?.queryAll((node) => node.type === "RNSVGCircle") ?? [];
  return circles.map((circle) => {
    const fill = circle.props.fill as unknown;
    if (fill != null && typeof fill === "object" && "payload" in fill) {
      return (fill as { payload: unknown }).payload;
    }
    if (typeof fill === "number" || typeof fill === "string") {
      return typeof fill === "string" ? processColor(fill) : fill;
    }
    return fill;
  });
}

/** The mark's rendered edge length. `Svg` lands as a single `RNSVGSvgView`. */
function renderedMarkSize(): number {
  const [svg] = screen.root?.queryAll((node) => node.type === "RNSVGSvgView") ?? [];
  return svg?.props.height as number;
}

/** The View holding the wordmark — in this layout, the whole text block. */
function textColumn() {
  return screen.getByText(/GRID/).parent!;
}

const hidden = { includeHiddenElements: true } as const;

describe("GridgoMark", () => {
  // Set the scheme while nothing is mounted, so no subscribed component
  // updates outside act().
  beforeEach(() => Appearance.setColorScheme("light"));
  afterAll(() => Appearance.setColorScheme(null));

  it("draws nine dots", async () => {
    await render(<GridgoMark />);

    expect(circleFills()).toHaveLength(9);
  });

  it("spends exactly one dot on the brand yellow", async () => {
    await render(<GridgoMark />);

    expect(
      circleFills().filter((f) => f === processColor(colors.light.brandLogo)),
    ).toHaveLength(1);
  });

  it("keeps six structural dots on the accent", async () => {
    await render(<GridgoMark />);

    expect(circleFills().filter((f) => f === processColor(colors.light.accent))).toHaveLength(6);
  });

  it("mutes the two dots below the brand dot", async () => {
    await render(<GridgoMark />);

    expect(
      circleFills().filter((f) => f === processColor(colors.light.textMuted)),
    ).toHaveLength(2);
  });

  it("inverts the structural dots in dark mode", async () => {
    const schemeSpy = jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    try {
      await render(<GridgoMark />);

      expect(circleFills().filter((f) => f === processColor(colors.dark.accent))).toHaveLength(6);
      expect(
        circleFills().filter((f) => f === processColor(colors.dark.brandLogo)),
      ).toHaveLength(1);
    } finally {
      schemeSpy.mockRestore();
    }
  });
});

describe("gridgoLogoAccessibilityLabel", () => {
  it("names plain GRIDGO with no role", () => {
    expect(gridgoLogoAccessibilityLabel()).toBe("GRIDGO");
    expect(gridgoLogoAccessibilityLabel(undefined)).toBe("GRIDGO");
  });

  it.each([
    ["business", "GRIDGO Business"],
    ["supplier", "GRIDGO Supplier"],
    ["rider", "GRIDGO Rider"],
    ["admin", "GRIDGO Admin"],
  ] as const)("names %s as %s", (role, spoken) => {
    expect(gridgoLogoAccessibilityLabel(role)).toBe(spoken);
  });
});

describe("logoRoleForClientAccount", () => {
  it("returns business only for the explicit business account type", () => {
    expect(logoRoleForClientAccount("business")).toBe("business");
  });

  it("returns no role for individual, missing, or null", () => {
    expect(logoRoleForClientAccount("individual")).toBeUndefined();
    expect(logoRoleForClientAccount(undefined)).toBeUndefined();
    expect(logoRoleForClientAccount(null)).toBeUndefined();
  });
});

describe("GridgoLogo", () => {
  beforeEach(() => Appearance.setColorScheme("light"));

  it("reads as a single GRIDGO element to a screen reader", async () => {
    await render(<GridgoLogo />);

    expect(screen.getByLabelText("GRIDGO")).toBeTruthy();
  });

  it("splits the wordmark so GO can carry the brand colour", async () => {
    await render(<GridgoLogo />);

    expect(screen.getByText(/GRID/)).toBeTruthy();
    expect(screen.getByText("GO")).toBeTruthy();
  });

  it("shows no role label for plain GRIDGO", async () => {
    await render(<GridgoLogo />);

    expect(screen.queryByText("Business", hidden)).toBeNull();
    expect(screen.queryByText("Supplier", hidden)).toBeNull();
    expect(screen.queryByText("Admin", hidden)).toBeNull();
    expect(screen.queryByText("RIDER", hidden)).toBeNull();
  });

  it.each([
    ["business", "Business", "GRIDGO Business"],
    ["supplier", "Supplier", "GRIDGO Supplier"],
    ["admin", "Admin", "GRIDGO Admin"],
  ] as const)(
    "renders the %s lockup as one accessible node",
    async (role: GridgoLogoRole, visible, spoken) => {
      await render(<GridgoLogo role={role} />);

      // Role text is painted but folded into the parent a11y node (hidden from
      // the accessibility tree on purpose).
      expect(screen.getByText(visible, hidden)).toBeTruthy();
      expect(screen.getByLabelText(spoken)).toBeTruthy();
      expect(screen.queryByLabelText(visible)).toBeNull();
      // Default queries exclude a11y-hidden descendants — role is not a focus target.
      expect(screen.queryByText(visible)).toBeNull();
    },
  );

  it("renders RIDER inside the yellow pill lockup as one accessible node", async () => {
    await render(<GridgoLogo role="rider" />);

    expect(screen.getByText("RIDER", hidden)).toBeTruthy();
    expect(screen.getByLabelText("GRIDGO Rider")).toBeTruthy();
    expect(screen.queryByLabelText("RIDER")).toBeNull();
    expect(screen.queryByText("RIDER")).toBeNull();
  });

  it("keeps the mark geometry unchanged when a role is present", async () => {
    await render(<GridgoLogo role="business" />);

    expect(circleFills()).toHaveLength(9);
    expect(
      circleFills().filter((f) => f === processColor(colors.light.brandLogo)),
    ).toHaveLength(1);
  });
});

/**
 * The lockup's one structural rule, pinned in both the arithmetic and the
 * rendered tree: **the mark stands as tall as the whole text block**. The
 * shape this replaced put the mark in a row with the wordmark and hung the
 * role underneath that row, which caps the mark at a single line.
 */
describe("lockup layout", () => {
  beforeEach(() => Appearance.setColorScheme("light"));

  it("lands on the type scale at the default size", () => {
    expect(gridgoLockupMetrics(28, true)).toMatchObject({
      // text-h3 over text-body-lg.
      wordmarkFontSize: 20,
      roleFontSize: 16,
      roleLineHeight: 21,
    });
  });

  it("sets the role type at the reference's cap ratio, not the round-G reading", () => {
    // Reference flat caps: GRIDGO R/I/D 27px, Business B 21px.
    const { wordmarkFontSize, roleFontSize } = gridgoLockupMetrics(28, true);

    expect(roleFontSize / wordmarkFontSize).toBeCloseTo(21 / 27, 1);
  });

  it.each([24, 28, 32, 48])("keeps the mark on the single wordmark line at %ip", (size) => {
    expect(gridgoLockupMetrics(size, false).markSize).toBe(size);
  });

  it.each([24, 28, 32, 48])("spans both text lines with the mark at %ip", (size) => {
    const { markSize, wordmarkLineHeight, roleLineHeight } = gridgoLockupMetrics(size, true);

    // The whole point: the mark's box *is* the two-line block's box.
    expect(markSize).toBe(wordmarkLineHeight + roleLineHeight);
  });

  it.each([24, 28, 32, 48])("makes the role lockup's mark the taller one at %ip", (size) => {
    expect(gridgoLockupMetrics(size, true).markSize).toBeGreaterThan(
      gridgoLockupMetrics(size, false).markSize,
    );
  });

  it("never sets the role word below the 12px floor", () => {
    expect(gridgoLockupMetrics(12, true).roleFontSize).toBe(12);
  });

  it("renders the plain mark at the wordmark's own height", async () => {
    await render(<GridgoLogo />);

    expect(renderedMarkSize()).toBe(gridgoLockupMetrics(28, false).markSize);
  });

  it("renders the role mark tall enough to span the two-line block", async () => {
    await render(<GridgoLogo role="business" />);
    const { markSize, wordmarkLineHeight, roleLineHeight } = gridgoLockupMetrics(28, true);

    expect(renderedMarkSize()).toBe(markSize);
    expect(renderedMarkSize()).toBe(wordmarkLineHeight + roleLineHeight);
  });

  it("stacks the role under the wordmark, beside the mark — not under the mark's row", async () => {
    await render(<GridgoLogo role="business" />);
    const column = textColumn();

    // Wordmark and role share one column…
    expect(within(column).getByText("Business", hidden)).toBeTruthy();
    // …and the mark is outside it, so the column's height is what the mark spans.
    expect(column.queryAll((node) => node.type === "RNSVGSvgView")).toHaveLength(0);
  });
});
