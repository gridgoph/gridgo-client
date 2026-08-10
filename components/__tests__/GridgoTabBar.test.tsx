import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_METRICS,
  TAB_BAR_MIN_BOTTOM_GAP,
  tabBarHeight,
  tabBarMetrics,
  tabBarPaddingBottom,
  tabScreenContentPadding,
} from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useNotifications } from "@/store/notifications";

/** Style props arrive as an object or an array of them. */
function flatten(style: unknown): Record<string, number | undefined> {
  return Array.isArray(style) ? Object.assign({}, ...style) : ((style ?? {}) as never);
}

/** Twelve unread updates, so the badge has to fall back to "9+". */
function unreadNotifications(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `ntf_${index}`,
    userId: "user_client",
    title: "Update",
    body: "Something changed on a job.",
    read: false,
    at: "2026-08-10T10:00:00.000Z",
  }));
}

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * The bar reads three things off the navigator: the route list, which index is
 * open, and the two navigation callbacks. Everything else in `BottomTabBarProps`
 * belongs to the navigator, so the cast keeps the fixture to what is actually
 * exercised rather than restating React Navigation's internals.
 */
function tabBarProps(openIndex: number): BottomTabBarProps {
  return {
    state: {
      index: openIndex,
      routes: TABS.map((tab) => ({ key: `${tab.name}-key`, name: tab.name })),
    },
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
}

function renderInSafeArea(ui: ReactElement, bottomInset = 34) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: bottomInset },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("tabBarPaddingBottom", () => {
  it("lets a platform inset be the whole breathing room", () => {
    // The captain bug: 34pt of home indicator plus a design pad on top of it
    // made an iOS bar 8pt taller than UIKit's own, on top of an already tall
    // column. Where the platform reserves space, nothing is added to it.
    expect(tabBarPaddingBottom(34)).toBe(34);
    expect(tabBarPaddingBottom(24)).toBe(24);
    expect(tabBarPaddingBottom(48)).toBe(48);
  });

  it("stands in with the design gap where there is no inset", () => {
    // The opposite Android report: labels flush against the physical edge.
    expect(tabBarPaddingBottom(0)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
  });

  it("floors at the design gap, not at zero", () => {
    // A `> 0` test reads like the rule but only floors at nothing, so an OEM
    // reporting a couple of dp got less breathing room than a device reserving
    // none at all. The gap is a floor under the inset, so anything below it is
    // lifted to it.
    for (const tiny of [1, 2, 4, 7]) {
      expect(tabBarPaddingBottom(tiny)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
    }
    expect(tabBarPaddingBottom(TAB_BAR_MIN_BOTTOM_GAP)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
  });

  it("never shrinks as the platform reserves more", () => {
    // The property the `> 0` floor broke: 2dp of inset produced a shorter bar
    // than 0dp did. Padding must rise monotonically with the inset.
    let previous = tabBarPaddingBottom(0);
    for (let inset = 1; inset <= 60; inset += 1) {
      const padding = tabBarPaddingBottom(inset);
      expect(padding).toBeGreaterThanOrEqual(previous);
      previous = padding;
    }
  });
});

describe("tabBarHeight", () => {
  // The table in the component's own header comment, asserted rather than
  // re-derived. These four rows are the devices the fix is reviewed against.
  it.each([
    ["Android, three-button", "android", 48, 128],
    ["Android, gesture nav", "android", 24, 104],
    ["iPhone, home indicator", "ios", 34, 83],
    ["iPhone, no home indicator", "ios", 0, 57],
    ["Android/web, no inset", "android", 0, 88],
  ] as const)("%s", (_label, os, inset, expected) => {
    expect(tabBarHeight(os, inset)).toBe(expected);
  });

  it("puts a home-indicator iPhone on UIKit's own 83pt", () => {
    // 49pt content row + the 34pt inset, with nothing added on top of it.
    expect(tabBarHeight("ios", 34)).toBe(tabBarMetrics("ios").columnHeight + 34);
  });

  it("keeps Material's 80dp container above the system inset, not inside it", () => {
    // androidx `NavigationBar` pads *outside* its 80dp min-height, so the inset
    // adds to the container rather than being absorbed by it.
    for (const inset of [24, 48]) {
      expect(tabBarHeight("android", inset)).toBe(80 + inset);
    }
  });
});

describe("tabBarMetrics", () => {
  it("gives iOS the Human Interface Guidelines 49pt row", () => {
    const ios = tabBarMetrics("ios");
    expect(ios.columnHeight).toBe(49);
    // 4 + 24 icon + 2 + 16 label + 3 fills it exactly.
    expect(
      ios.itemPaddingTop + 24 + ios.itemGap + 16 + ios.itemPaddingBottom,
    ).toBe(ios.columnHeight);
    // A home-indicator iPhone therefore lands on UIKit's own 83pt.
    expect(ios.columnHeight + tabBarPaddingBottom(34)).toBe(83);
  });

  it("gives Android the Material 3 80dp container", () => {
    const android = tabBarMetrics("android");
    expect(android.columnHeight).toBe(80);
    expect(android.itemPaddingTop).toBe(12);
    expect(android.itemPaddingBottom).toBe(16);
    // The natural stack fits inside the container, slack above the glyph.
    expect(
      android.itemPaddingTop + 24 + android.itemGap + 16 + android.itemPaddingBottom,
    ).toBeLessThanOrEqual(android.columnHeight);
    expect(android.columnHeight + tabBarPaddingBottom(24)).toBe(104);
    expect(android.columnHeight + tabBarPaddingBottom(48)).toBe(128);
  });

  it("keeps the action disc on the 44pt touch floor on both platforms", () => {
    for (const os of ["ios", "android", "web"]) {
      expect(tabBarMetrics(os).actionDiameter).toBeGreaterThanOrEqual(44);
    }
  });

  it("leaves the badge's overhang room above the glyph on both platforms", () => {
    // The badge is drawn at -top-1 (4). Less top padding than that on iOS,
    // where the column is pinned to 49, would clip it against the hairline.
    for (const os of ["ios", "android"]) {
      expect(tabBarMetrics(os).itemPaddingTop).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("GridgoTabBar", () => {
  beforeEach(() => {
    navigate.mockClear();
    emit.mockClear();
    useNotifications.setState({ items: [], readIds: [] });
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS.filter((entry) => entry.name !== ACTION_TAB)) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("names the action tab for screen readers even though it draws no label", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.queryByText("New request")).toBeNull();
    expect(screen.getByRole("tab", { name: "New request" })).toBeTruthy();
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(screen.getByRole("tab", { name: "Orders", selected: true })).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Notifications" }));

    expect(navigate).toHaveBeenCalledWith("notifications");
  });

  it("stays put when the open tab is pressed again", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Home" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("honours a tabPress handler that prevents the default", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "New request" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["zero inset", 0],
    ["gesture-sized inset", 24],
    ["home-indicator inset", 34],
    ["three-button-sized inset", 48],
  ] as const)("puts the platform's own space under the bar (%s)", async (_label, inset) => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, inset);

    const root = screen.getByTestId("gridgo-tab-bar");
    const style = flatten(root.props.style);
    expect(style.paddingBottom).toBe(tabBarPaddingBottom(inset));
    // The old composition stacked the design gap on top of a real inset.
    if (inset > 0) {
      expect(style.paddingBottom).toBe(inset);
    }
  });

  it("keeps destination columns on a growing min-height, not a rigid height", async () => {
    useNotifications.setState({ items: unreadNotifications(12), readIds: [] });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.getByText("9+")).toBeTruthy();

    // Geometry regression guard: a rigid height left zero top slack for the
    // badge's -top-1 overhang, and pinned the column against label scaling.
    const notificationsTab = screen.getByRole("tab", { name: "Notifications" });
    const style = flatten(notificationsTab.props.style);
    expect(style.minHeight).toBe(TAB_BAR_METRICS.columnHeight);
    expect(style.height).toBeUndefined();
    expect(style.paddingTop).toBe(TAB_BAR_METRICS.itemPaddingTop);
  });
});

describe("tabScreenContentPadding", () => {
  it("clears the whole bar, not just the design gap", () => {
    const column = TAB_BAR_METRICS.columnHeight;
    expect(tabScreenContentPadding(0)).toBe(TAB_BAR_MIN_BOTTOM_GAP + column + 24);
    expect(tabScreenContentPadding(34)).toBe(34 + column + 24);
  });

  it("is always taller than the bar it has to clear", () => {
    for (const inset of [0, 12, 34, 48]) {
      expect(tabScreenContentPadding(inset)).toBeGreaterThan(tabBarPaddingBottom(inset));
    }
  });
});
