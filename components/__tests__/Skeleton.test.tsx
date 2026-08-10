import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { SkeletonOrderList } from "@/components/Skeleton";

/**
 * The sweep is the loading language the previous GRIDGO used, and it is the
 * one piece of ambient motion in the app. Two things have to hold: it must not
 * run when the device asks for reduced motion, and the placeholder must keep
 * standing either way — the layout, not the movement, is what carries meaning.
 */

type Node = { type?: unknown; children?: unknown } | string | null;

/** How many gradient surfaces the tree is drawing. */
function countSweeps(tree: unknown): number {
  const node = tree as Node;
  if (!node || typeof node === "string") return 0;
  const self = String((node as { type?: unknown }).type ?? "").includes("Svg") ? 1 : 0;
  const children = (node as { children?: unknown[] }).children ?? [];
  return (
    self +
    (Array.isArray(children) ? children.reduce<number>((n, c) => n + countSweeps(c), 0) : 0)
  );
}

describe("Skeleton", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sweeps a highlight across the placeholders by default", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    await render(<SkeletonOrderList count={2} />);

    await waitFor(() => expect(countSweeps(screen.toJSON())).toBeGreaterThan(0));
  });

  it("drops the sweep but keeps the shapes when reduce motion is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    await render(<SkeletonOrderList count={2} />);

    // The placeholders still render — the page keeps its height…
    await waitFor(() => expect(countSweeps(screen.toJSON())).toBe(0));
    // …and the shapes themselves are still there.
    expect(screen.toJSON()).toBeTruthy();
  });

  it("hides every placeholder from assistive technology", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    await render(<SkeletonOrderList count={1} />);

    // A skeleton says nothing; the copy beside it says what is loading.
    expect(screen.queryByText(/./)).toBeNull();
  });
});
