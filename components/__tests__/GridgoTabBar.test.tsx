import type { BottomTabBarProps } from "expo-router/js-tabs";
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
  tabBarPaintedHeight,
  tabBarTopGap,
  tabScreenContentPadding,
} from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useNotifications } from "@/store/notifications";
import { useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() }),
}));

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

describe("tabBarPaintedHeight", () => {
  // The table in the component's own header comment, asserted rather than
  // re-derived. These five rows are the devices the fix is reviewed against.
  it.each([
    ["Android, three-button", "android", 48, 128],
    ["Android, gesture nav", "android", 24, 104],
    ["iPhone, home indicator", "ios", 34, 91],
    ["iPhone, no home indicator", "ios", 0, 65],
    ["Android/web, no inset", "android", 0, 88],
  ] as const)("%s", (_label, os, inset, expected) => {
    expect(tabBarPaintedHeight(os, inset)).toBe(expected);
  });

  it("adds nothing under the labels on a home-indicator iPhone", () => {
    // 57pt content row + the 34pt inset, with nothing added on top of it.
    expect(tabBarPaintedHeight("ios", 34)).toBe(tabBarMetrics("ios").columnHeight + 34);
  });

  it("keeps Material's 80dp container above the system inset, not inside it", () => {
    // androidx `NavigationBar` pads *outside* its 80dp min-height, so the inset
    // adds to the container rather than being absorbed by it.
    for (const inset of [24, 48]) {
      expect(tabBarPaintedHeight("android", inset)).toBe(80 + inset);
    }
  });
});

describe("tabBarHeight", () => {
  it("is the painted bar plus the strip the raised \"+\" stands in", () => {
    for (const os of ["ios", "android"]) {
      for (const inset of [0, 24, 34, 48]) {
        expect(tabBarMetrics(os).actionRise).toBe(24);
        expect(tabBarHeight(os, inset)).toBe(tabBarPaintedHeight(os, inset) + 24);
      }
    }
  });

  it("raises the bigger \"+\" with it, so the disc's centre stays 8 under the hairline", () => {
    for (const os of ["ios", "android"]) {
      const { actionDiameter, actionRise } = tabBarMetrics(os);
      // Mark's option 5: a bigger "+" than the 56 it was.
      expect(actionDiameter).toBe(64);
      expect(actionDiameter / 2 - actionRise).toBe(8);
    }
  });

  it("does not move the painted row itself", () => {
    // The strip is transparent. Growing the layout box must not have been done
    // by growing the content row, which is UIKit's and Material's number.
    expect(tabBarMetrics("ios").columnHeight).toBe(57);
    expect(tabBarMetrics("android").columnHeight).toBe(80);
  });
});

describe("tabBarTopGap", () => {
  /**
   * The captain report: items sitting closer to the top edge here and in
   * gridgo-rider than in gridgo-supplier, from the same padding numbers.
   *
   * gridgo-supplier paints its surface over the whole column, so its top gap is
   * the declared padding plus whatever slack the platform leaves. This app
   * paints `actionRise` lower so the action disc can overhang the hairline, and
   * the gap a person sees was that much smaller — on iOS the glyph sat above
   * the paint entirely. Android keeps gridgo-supplier's 20dp; iOS's 4pt left a
   * scrolled list touching the icons (16 Oct 2026), so it now has 12pt.
   */
  it("leaves air above the glyph from the painted edge", () => {
    expect(tabBarTopGap("ios")).toBe(12);
    expect(tabBarTopGap("android")).toBe(20);
  });

  it("hands the platform's leftover room to the space above the glyph", () => {
    // Android: 80dp container over a 72dp stack, so 8dp joins the 12dp padding.
    const android = tabBarMetrics("android");
    expect(tabBarTopGap("android")).toBe(android.itemPaddingTop + 8);
    // iOS: the 57pt stack fills the row exactly, so there is nothing to hand up.
    expect(tabBarTopGap("ios")).toBe(tabBarMetrics("ios").itemPaddingTop);
  });

  it("is measured from the paint, so the \"+\" strip never eats it", () => {
    for (const os of ["ios", "android"]) {
      expect(tabBarTopGap(os)).toBe(tabBarMetrics(os).itemPaddingTop + Math.max(0, tabBarMetrics(os).columnHeight - (tabBarMetrics(os).itemPaddingTop + 24 + tabBarMetrics(os).itemGap + 16 + tabBarMetrics(os).itemPaddingBottom)));
    }
  });
});

describe("tabBarMetrics", () => {
  it("gives iOS a 57pt row: the HIG's 49 plus air above the glyph", () => {
    const ios = tabBarMetrics("ios");
    expect(ios.columnHeight).toBe(57);
    // 12 + 24 icon + 2 + 16 label + 3 fills it exactly.
    expect(
      ios.itemPaddingTop + 24 + ios.itemGap + 16 + ios.itemPaddingBottom,
    ).toBe(ios.columnHeight);
    // A home-indicator iPhone is 91pt — nowhere near the 122pt "too high" bar.
    expect(ios.columnHeight + tabBarPaddingBottom(34)).toBe(91);
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

  it("keeps the raised plus on the 44pt touch floor on both platforms", () => {
    for (const os of ["ios", "android", "web"]) {
      expect(tabBarMetrics(os).actionDiameter).toBeGreaterThanOrEqual(44);
    }
  });

  it("leaves the badge's overhang room above the glyph on both platforms", () => {
    // The badge is drawn at -top-1 (4). Less top padding than that on iOS,
    // where the column is pinned to 57, would clip it against the hairline.
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
    useSession.setState({ user: null });
    useOrganization.getState().reset();
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS.filter((entry) => entry.name !== ACTION_TAB && entry.name !== "organizations")) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("puts the quick-actions \"+\" in the centre, not New request", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.queryByText("New request")).toBeNull();
    expect(screen.queryByRole("tab", { name: "New request" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    // Home, Orders, "+", Alerts, Account.
    const tree = JSON.stringify(screen.toJSON());
    const at = (label: string) => tree.indexOf(`"accessibilityLabel":"${label}"`);
    expect(screen.getByRole("button", { name: "Quick actions" })).toBeTruthy();
    expect(at("Orders")).toBeLessThan(at("Quick actions"));
    expect(at("Quick actions")).toBeLessThan(at("Alerts"));
  });

  it("never offers Organizations in the bar, even to an approved organization", async () => {
    useSession.setState({
      user: {
        id: "u1",
        email: "pta@school.edu.ph",
        name: "Ana",
        role: "client",
        accountType: "organization",
        approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
      },
    });
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    // Account is the way in now (Mark's option 5): a fifth tab put the "+"
    // third of six columns.
    const tabs = screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel);
    expect(tabs).toEqual(["Home", "Orders", "Alerts", "Account"]);
  });

  it("stands the \"+\" in the middle column, two tabs either side", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const plus = screen.getByRole("button", { name: "Quick actions" });
    const row = screen.getByRole("tab", { name: "Home" }).parent;
    const columns = row?.children ?? [];
    expect(columns).toHaveLength(5);
    expect(columns[2]).toContainElement(plus);
    expect(flatten(plus.props.style)).toMatchObject({ width: 64, height: 64 });
  });

  it("lights Account while Organizations, which lives under it, is open", async () => {
    const organizations = TABS.findIndex((tab) => tab.name === "organizations");
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(organizations)} />);

    expect(screen.getByRole("tab", { name: "Account", selected: true })).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("takes Account's tab back to Account from Organizations", async () => {
    const organizations = TABS.findIndex((tab) => tab.name === "organizations");
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(organizations)} />);

    await fireEvent.press(screen.getByRole("tab", { name: "Account" }));

    expect(navigate).toHaveBeenCalledWith("account");
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(screen.getByRole("tab", { name: "Orders", selected: true })).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    await fireEvent.press(screen.getByRole("tab", { name: "Alerts" }));

    expect(navigate).toHaveBeenCalledWith("notifications");
  });

  it("stays put when the open tab is pressed again", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    await fireEvent.press(screen.getByRole("tab", { name: "Home" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("honours a tabPress handler that prevents the default", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    await fireEvent.press(screen.getByRole("tab", { name: "Alerts" }));

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
    const notificationsTab = screen.getByRole("tab", { name: "Alerts" });
    const style = flatten(notificationsTab.props.style);
    expect(style.minHeight).toBe(TAB_BAR_METRICS.columnHeight);
    expect(style.height).toBeUndefined();
    expect(style.paddingTop).toBe(TAB_BAR_METRICS.itemPaddingTop);
  });

  it("keeps every destination column on the painted row", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const labelled = screen.getByRole("tab", { name: "Home" });
    expect(flatten(labelled.props.style).minHeight).toBe(TAB_BAR_METRICS.columnHeight);
    expect(flatten(labelled.props.style).height).toBeUndefined();
  });
});

describe("tabScreenContentPadding", () => {
  it("is a page gutter, not a well the size of the plus or the tab bar", () => {
    expect(tabScreenContentPadding(0)).toBe(16);
    expect(tabScreenContentPadding(34)).toBe(16);
    expect(tabScreenContentPadding(48)).toBe(16);
  });
});
