import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import {
  MATCH_WAIT_RESTING_CELL,
  MATCH_WAIT_ROUTE,
  MatchingWait,
  matchWaitTokenOrigin,
} from "@/components/MatchingWait";

/**
 * The one animated moment in the buying flow.
 *
 * What has to hold: it says what is happening in words, so nothing is carried
 * by motion alone; the grid stands whether or not the token is moving; and it
 * never says whose press GRIDGO is about to pick — not in the copy and not in
 * an accessibility label, which is the quiet place a shop name would otherwise
 * survive.
 */

type Node = { type?: unknown; props?: unknown; children?: unknown } | string | null;

/** How many dots the tree is drawing — the nine cells, plus the token. */
function countDots(tree: unknown): number {
  const node = tree as Node;
  if (!node || typeof node === "string") return 0;
  const style = (node as { props?: { style?: unknown } }).props?.style;
  const flat = Array.isArray(style) ? style.flat() : [style];
  const self = flat.some(
    (entry) => entry && typeof entry === "object" && "borderRadius" in entry,
  )
    ? 1
    : 0;
  const children = (node as { children?: unknown[] }).children ?? [];
  return (
    self +
    (Array.isArray(children) ? children.reduce<number>((n, c) => n + countDots(c), 0) : 0)
  );
}

describe("the route", () => {
  it("walks every cell once, so the token is going through all GRIDGO has", () => {
    expect([...MATCH_WAIT_ROUTE].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps a pixel origin for every progress, including a wrapped or empty value", () => {
    // Reanimated 4 dropped the hop list on device and crashed on `.x`. The
    // origin must stay a real point for 0, 1, wrap-around, and garbage input.
    for (const progress of [0, 0.5, 1, 1.01, Number.NaN]) {
      const origin = matchWaitTokenOrigin(progress, 156);
      expect(Number.isFinite(origin.x)).toBe(true);
      expect(Number.isFinite(origin.y)).toBe(true);
    }
  });

  it("opens on the centre and closes on the cell the GRIDGO mark lights", () => {
    // Opening on the centre is what stops the walk reading as a spinner, and
    // closing top-right is the beat where the grid is the logo.
    expect(MATCH_WAIT_ROUTE[0]).toBe(4);
    expect(MATCH_WAIT_RESTING_CELL).toBe(2);
  });
});

describe("MatchingWait", () => {
  afterEach(() => jest.restoreAllMocks());

  it("says what GRIDGO is doing, rather than only moving", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    await render(<MatchingWait thing="Flyers" />);

    expect(screen.getByText("GRIDGO is finding a printer.")).toBeTruthy();
    expect(screen.getByLabelText("Finding a printer for flyers")).toBeTruthy();
    // No estimate: a wait that overruns its own copy reads as broken.
    expect(screen.queryByText(/second|minute|moment/i)).toBeNull();
  });

  it("draws the nine cells and one token", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    await render(<MatchingWait thing="Flyers" />);

    await waitFor(() => expect(countDots(screen.toJSON())).toBe(10));
  });

  it("keeps the grid, the token and the copy when reduce motion is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    await render(<MatchingWait thing="Flyers" />);

    // The same picture, simply stopped — nothing disappears with the movement.
    await waitFor(() => expect(countDots(screen.toJSON())).toBe(10));
    expect(screen.getByText("GRIDGO is finding a printer.")).toBeTruthy();
  });

  it("never names a shop, in copy or in a label", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    await render(<MatchingWait thing="Flyers" />);

    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\bshop\b/i);
  });
});
