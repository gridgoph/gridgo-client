import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_DESIGN_BOTTOM_PAD,
  tabBarPaddingBottom,
  tabScreenContentPadding,
} from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useNotifications } from "@/store/notifications";

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
  it("adds design pad to the system inset instead of maxing them", () => {
    // Math.max would drop the design pad whenever inset > 8 — the Android bug.
    expect(tabBarPaddingBottom(0)).toBe(TAB_BAR_DESIGN_BOTTOM_PAD);
    expect(tabBarPaddingBottom(8)).toBe(8 + TAB_BAR_DESIGN_BOTTOM_PAD);
    expect(tabBarPaddingBottom(24)).toBe(24 + TAB_BAR_DESIGN_BOTTOM_PAD);
    expect(tabBarPaddingBottom(48)).toBe(48 + TAB_BAR_DESIGN_BOTTOM_PAD);
    expect(tabBarPaddingBottom(34)).toBe(34 + TAB_BAR_DESIGN_BOTTOM_PAD);

    // Explicit guard against the old composition.
    expect(tabBarPaddingBottom(24)).not.toBe(Math.max(24, TAB_BAR_DESIGN_BOTTOM_PAD));
    expect(tabBarPaddingBottom(48)).not.toBe(Math.max(48, TAB_BAR_DESIGN_BOTTOM_PAD));
  });
});

describe("GridgoTabBar", () => {
  beforeEach(() => {
    navigate.mockClear();
    emit.mockClear();
    useNotifications.setState({ unreadCount: 0 });
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS.filter((entry) => entry.name !== ACTION_TAB)) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("names the action tab for screen readers even though it draws no label", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.queryByText("New Request")).toBeNull();
    expect(screen.getByRole("tab", { name: "New Request" })).toBeTruthy();
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

    fireEvent.press(screen.getByRole("tab", { name: "New Request" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["zero inset", 0],
    ["gesture-sized inset", 24],
    ["three-button-sized inset", 48],
  ] as const)(
    "applies inset + design pad on the bar root (%s)",
    async (_label, inset) => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, inset);

      const root = screen.getByTestId("gridgo-tab-bar");
      const style = Array.isArray(root.props.style)
        ? Object.assign({}, ...root.props.style)
        : root.props.style;
      expect(style.paddingBottom).toBe(tabBarPaddingBottom(inset));
      // Old Math.max composition would equal the inset alone when inset > 8.
      if (inset > TAB_BAR_DESIGN_BOTTOM_PAD) {
        expect(style.paddingBottom).not.toBe(inset);
        expect(style.paddingBottom).not.toBe(
          Math.max(inset, TAB_BAR_DESIGN_BOTTOM_PAD),
        );
      }
    },
  );

  it("keeps destination columns on a growing min-height, not a rigid h-13", async () => {
    useNotifications.setState({ unreadCount: 12 });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.getByText("9+")).toBeTruthy();

    // Geometry regression guard: rigid h-13 left zero top slack for the
    // badge's -top-1 overhang. min-h-20 is MD3's 80dp icon+label bar.
    const notificationsTab = screen.getByRole("tab", { name: "Notifications" });
    const className = String(notificationsTab.props.className ?? "");
    expect(className).toContain("min-h-20");
    expect(className).toContain("pt-2");
    expect(className).not.toContain("h-13");
  });
});

describe("tabScreenContentPadding", () => {
  it("clears the whole bar, not just the design gap", () => {
    // inset + design pad (8) + MD3 column (80) + breathing room (24)
    expect(tabScreenContentPadding(0)).toBe(112);
    expect(tabScreenContentPadding(34)).toBe(146);
  });

  it("is always taller than the bar it has to clear", () => {
    for (const inset of [0, 12, 34, 48]) {
      expect(tabScreenContentPadding(inset)).toBeGreaterThan(tabBarPaddingBottom(inset));
    }
  });
});
