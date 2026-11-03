import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Bell, FileText, House, Plus, User, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BellSwing } from "@/components/BellSwing";
import { QuickActionsSheet } from "@/components/QuickActionsSheet";
import { isBarTab, TABS, type BarTabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useUnreadCount } from "@/store/notifications";
import { useQuickActions } from "@/store/quickActions";

/* ---------------------------------------------------------------------------
   Bar geometry

   Two platforms publish two different content-row heights, and one rule governs
   what sits underneath both. Getting either half wrong has been reported by the
   captain once each, so both halves are cited rather than remembered.

   **iOS.** The UIKit tab bar is a 49pt content row, and on a home-indicator
   iPhone it is 83pt overall — 49 of content plus the 34pt bottom safe-area
   inset. UIKit does not put design padding under the labels on top of that
   inset; the inset *is* the space. This bar did, and stacked an 80dp column on
   top of it as well: 80 + 34 + 8 = 122pt against the platform's 83. That is the
   "tab bar sits too high" report.

   The exact 49pt row then drew the opposite report (16 Oct 2026, on an
   iPhone): with 4pt above the glyph, a list scrolled under the bar met the
   icons with no gap at all. A card's surface is the bar's surface, so the
   hairline alone cannot separate them in Dark — only air can, which is what
   Android's 20dp does. The iOS row is therefore 57pt: the same 12pt above the
   glyph that Android declares, still nothing added under the labels.

   **Android.** Material 3's navigation bar container is 80dp
   (`NavigationBarTokens.TallContainerHeight`; the 64dp `ContainerHeight` is the
   short/expressive variant, not this one), and the system navigation inset is
   added *beneath* that container rather than being absorbed into it. That is
   worth stating precisely, because it is the one thing about this file people
   keep guessing at. In androidx, `NavigationBar` lays its row out as

       Modifier.fillMaxWidth()
               .windowInsetsPadding(windowInsets)      // outer
               .defaultMinSize(minHeight = NavigationBarHeight)   // inner

   and `InsetsPaddingModifier.measure` ends `layout(width, height)` with
   `height = placeable.height + vertical` — it measures the child small and then
   reports itself *larger* by the inset. The 80dp minimum therefore applies to
   the content inside the padding, and the total is 80 + inset. So a
   three-button phone genuinely is 128dp, and that is Material's own answer, not
   a double-count. Under Expo's edge-to-edge Android (`edgeToEdgeEnabled`, and
   mandatory from SDK 54) the inset is real and non-zero on every phone: about
   48dp for three-button navigation and about 24dp for gesture navigation.

   **The rule both follow.** Whatever the platform reserves below the row is the
   breathing room, and nothing is added on top of it. The design gap is a *floor*
   under that, for the cases where the platform reserves less than it — an
   iPhone SE, Expo web, and any OEM that reports only a few dp. It is a floor
   and not an alternative: `Math.max(inset, gap)` used as the whole answer was
   banned once because it was reached for as a way of *replacing* the inset.
   `tabBarPaddingBottom` spells the floor out longhand so the intent survives.

   Resulting *painted* bar heights, content column plus whatever sits under it:
     iOS, home indicator     57 + 34 = 91pt
     iOS, no indicator       57 +  8 = 65pt
     Android, gesture nav    80 + 24 = 104dp
     Android, three-button   80 + 48 = 128dp
     Android/web, no inset   80 +  8 = 88dp
   `tabBarPaintedHeight` is that table as code, so the tests assert the totals
   rather than re-deriving them.

   **The strip above the paint, and the gap it used to eat.** This app has a
   raised action disc; gridgo-supplier does not. The disc overhangs the bar's
   top hairline, so the surface is painted `actionRise` below the top of the
   bar's own layout box and the disc breaks the hairline without drawing outside
   its parent. gridgo-supplier paints edge to edge, because it has nothing to
   overhang with.

   That strip is why the captain reported the items sitting too close to the top
   edge here and in gridgo-rider but not in gridgo-supplier. The item padding is
   the same number in all three, but it was measured from the *layout* top while
   the edge a person actually sees is the *painted* top, `actionRise` lower. The
   same 12dp therefore bought 16dp less room here. On iOS it was worse than
   tight: the 49pt stack filled its column exactly, so the icon sat 6pt *above*
   the paint.

   The fix is to hang the labelled columns off the painted edge and let only the
   action column reach up into the strip — not to shrink `actionRise`, which is
   the overhang itself. `tabBarTopGap` is the space above the icon measured from
   the painted edge:

     iOS     12pt   (itemPaddingTop 12, and the 57pt stack leaves no slack)
     Android 20dp   (itemPaddingTop 12, plus the 8dp M3 leaves over the stack)

   All three apps run this file. Android item padding is 12 above and 16 below
   in every one of them; the 12pt iOS gap is this app's, from the report above.
   --------------------------------------------------------------------------- */

/**
 * The least breathing room the bar will leave under its labels. A floor beneath
 * whatever the platform reserves, not an alternative to it.
 */
export const TAB_BAR_MIN_BOTTOM_GAP = 8;

export type TabBarMetrics = {
  /** The painted content row, above whatever the platform reserves below it. */
  columnHeight: number;
  itemPaddingTop: number;
  itemGap: number;
  itemPaddingBottom: number;
  /**
   * The raised yellow "+" in the centre. Never below the 44pt touch floor; 64
   * since the bar went to four tabs, so the one action reads as the one action.
   */
  actionDiameter: number;
  /**
   * How far the "+" rises through the bar's hairline (client#335). The bar's
   * layout box is this much taller than its paint, so the raised half stays
   * inside the bar's bounds and stays tappable on Android.
   */
  actionRise: number;
};

/**
 * How far the centre "+" stands above the painted bar. Raised with the disc
 * (56 → 64), so its centre still sits 8 below the hairline.
 */
const ACTION_RISE = 24;
const ACTION_DIAMETER = 64;
/** The "+" glyph, scaled with the disc. */
const ACTION_GLYPH = 30;

/** The glyph in a tab column. One size in both states, on both platforms. */
const TAB_ICON_SIZE = 24;

/** The label's line box — `h-4` on the Text, and the caption scale's 16px. */
const TAB_LABEL_HEIGHT = 16;

/**
 * Pure, so both platforms' geometry can be asserted in one test run rather
 * than only whichever one the suite happens to be executing on.
 */
export function tabBarMetrics(platformOS: string): TabBarMetrics {
  if (platformOS === "ios") {
    // 12 + 24 icon + 2 + 16 label + 3 = 57: the HIG's 49pt row with the air
    // above the glyph that keeps a scrolled list off the icons.
    return {
      columnHeight: 57,
      itemPaddingTop: 12,
      itemGap: 2,
      itemPaddingBottom: 3,
      actionDiameter: ACTION_DIAMETER,
      actionRise: ACTION_RISE,
    };
  }
  // Material 3: 80dp container, 12dp above the item, 16dp below it, 24dp icon.
  return {
    columnHeight: 80,
    itemPaddingTop: 12,
    itemGap: 4,
    itemPaddingBottom: 16,
    actionDiameter: ACTION_DIAMETER,
    actionRise: ACTION_RISE,
  };
}

export const TAB_BAR_METRICS = tabBarMetrics(Platform.OS);

/**
 * What sits below the content row: whatever the platform reserves, with the
 * design gap as a deliberate floor under it.
 *
 * Not `inset + gap`: on a home-indicator iPhone that added 8pt to a 34pt
 * keep-out zone the platform had already sized as the bar's breathing room.
 *
 * The floor is compared against the gap, not against zero. A `> 0` test reads
 * as if it says this, but it only floors at *nothing*: a device reporting a 2dp
 * inset got a 2dp gap and its labels sat closer to the physical edge than on a
 * phone reserving nothing at all — 82dp of bar against an insetless 88. That is
 * both the flush-to-the-edge bug this gap exists to prevent and a bar that gets
 * shorter as the device reserves more, which cannot be right in either
 * direction. Spelled longhand rather than as `Math.max` so it stays legible
 * that the gap is a floor and never a replacement for the inset.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom >= TAB_BAR_MIN_BOTTOM_GAP ? insetBottom : TAB_BAR_MIN_BOTTOM_GAP;
}

/**
 * The bar a person sees: the platform's content row plus whatever sits under
 * it. Pure arithmetic over a platform and an inset, so every device case in the
 * table above is one assertion rather than a re-derivation in the test.
 *
 * This is the number UIKit and Material 3 publish, and it is the same in all
 * three GRIDGO apps. The raised "+" sits in a strip above this, inside the
 * bar's layout box ({@link tabBarHeight}).
 */
export function tabBarPaintedHeight(platformOS: string, insetBottom: number): number {
  return tabBarMetrics(platformOS).columnHeight + tabBarPaddingBottom(insetBottom);
}

/**
 * The bar's layout box: the painted bar plus the strip the raised "+" stands
 * in. Only the centre column reaches into that strip.
 */
export function tabBarHeight(platformOS: string, insetBottom: number): number {
  return tabBarMetrics(platformOS).actionRise + tabBarPaintedHeight(platformOS, insetBottom);
}

/**
 * The space above a tab's glyph, measured from the edge a person can see.
 *
 * The column is laid out `justify-end` against a `columnHeight` minimum, so
 * whatever the platform leaves over the natural stack sits above the glyph and
 * adds to the declared top padding. Android's 80dp container holds a 72dp stack
 * and hands the other 8dp up; iOS's 57pt row is the stack exactly.
 *
 * This is the number that has to match gridgo-supplier, and the one the strip
 * above the paint was quietly taking `actionRise` out of.
 */
export function tabBarTopGap(platformOS: string): number {
  const metrics = tabBarMetrics(platformOS);
  const stack =
    metrics.itemPaddingTop +
    TAB_ICON_SIZE +
    metrics.itemGap +
    TAB_LABEL_HEIGHT +
    metrics.itemPaddingBottom;
  const slack = Math.max(0, metrics.columnHeight - stack);
  return metrics.itemPaddingTop + slack;
}

/**
 * Bottom padding on a main tab's scroll content.
 *
 * The scene already sits above the tab bar, and the plus floats over the
 * page rather than owning a well of empty canvas. A disc-sized pad here is
 * what made Account scroll when Sign out was already on screen, and what
 * opened the black gap under Home's last card. Keep a page gutter only.
 */
export function tabScreenContentPadding(_insetBottom: number): number {
  return 16;
}

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<BarTabName, LucideIcon> = {
  home: House,
  orders: FileText,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO tab bar.
 *
 * Four labelled destinations with the raised yellow "+" in the centre
 * (client#335): Home, Orders, "+", Alerts, Account — for every account. An
 * approved organization's fifth tab put the "+" third of six columns, so
 * Organizations now opens from Account and, while it is open, Account reads
 * as the open tab (`parent` in `constants/tabs.ts`). The "+" opens the quick
 * actions (`QuickActionsSheet`) — it is not a destination, so it carries no
 * label and is never "selected".
 *
 * The column height and the item padding come from `tabBarMetrics` — a 57pt
 * row on iOS, and Material 3's 80dp container on Android — with the note
 * above this file's metrics explaining why the two differ and why neither adds
 * a design gap on top of a platform inset.
 *
 * The layout box is `actionRise` taller than the paint: the surface and its
 * hairline start that far down, and only the "+" column reaches up into the
 * strip, so the raised half of the disc is inside the bar and tappable.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale. Yellow is spent in one
 * place only — the "+".
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadCount();
  const showActions = useQuickActions((s) => s.show);
  const openName = state.routes[state.index]?.name;
  // A route kept out of the bar lights the tab it lives under.
  const lit = TABS.find((entry) => entry.name === openName)?.parent ?? openName;

  const items = state.routes.flatMap((route, index) => {
    const tab = TABS.find((entry) => entry.name === route.name);
    if (!tab || !isBarTab(tab.name)) return [];
    const open = state.index === index;
    const focused = tab.name === lit;
    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      // Account lights while Organizations is open, and still takes you back.
      if (!open && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };
    return [
      <TabItem
        key={route.key}
        name={tab.name}
        label={tab.label}
        focused={focused}
        onPress={onPress}
        badge={tab.name === "notifications" && unreadCount > 0 ? unreadCount : 0}
      />,
    ];
  });
  // The "+" sits in the middle: two tabs either side of it.
  items.splice(Math.floor(items.length / 2), 0, <ActionColumn key="quick-actions" onPress={showActions} />);

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingTop: TAB_BAR_METRICS.actionRise, paddingBottom: tabBarPaddingBottom(insets.bottom) }}
    >
      {/*
        Drawn before the row, so the "+" paints over the top border and the
        hairline breaks around it with no cut-out to maintain. Spans down
        through the bottom inset region.
      */}
      <View
        className="absolute inset-x-0 bottom-0 border-t border-outline bg-surface"
        style={{ top: TAB_BAR_METRICS.actionRise }}
      />

      <View className="flex-row items-end">{items}</View>
      <QuickActionsSheet />
    </View>
  );
}

/** The raised yellow "+" that opens the quick actions. */
function ActionColumn({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const size = TAB_BAR_METRICS.actionDiameter;
  return (
    <View
      className="flex-1 items-center"
      style={{ marginTop: -TAB_BAR_METRICS.actionRise, minHeight: TAB_BAR_METRICS.columnHeight + TAB_BAR_METRICS.actionRise }}
    >
      <Pressable
        testID="quick-actions-open"
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        accessibilityHint="Start a print, chat with GRIDGO, track or reorder"
        onPress={onPress}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.actionYellow,
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.22,
              shadowRadius: 5,
            },
            default: { elevation: 4 },
          }),
        }}
      >
        {({ pressed }) => (
          <>
            <Plus size={ACTION_GLYPH} color={colors.actionYellowOn} strokeWidth={2.5} />
            {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-pill" /> : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

type TabItemProps = {
  name: BarTabName;
  label: string;
  focused: boolean;
  onPress: () => void;
  badge?: number;
};

function TabItem({ name, label, focused, onPress, badge = 0 }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];
  const glyph = (
    <Icon size={24} strokeWidth={2} color={focused ? colors.textPrimary : colors.textMuted} />
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      // Height and padding are the platform's, from `tabBarMetrics`. A minimum
      // rather than a fixed height, so the column still grows if the label
      // scales; never a rigid h-13, which left no slack for the badge.
      className="flex-1 items-center justify-end"
      style={{
        minHeight: TAB_BAR_METRICS.columnHeight,
        paddingTop: TAB_BAR_METRICS.itemPaddingTop,
        paddingBottom: TAB_BAR_METRICS.itemPaddingBottom,
        rowGap: TAB_BAR_METRICS.itemGap,
      }}
    >
      {({ pressed }) => (
        <>
          {/*
            One glyph, one size, one stroke weight, in both states. Only the
            colour moves — nothing is filled, swapped or rescaled when a tab
            opens, so the row never shifts under your thumb.
          */}
          <View className={pressed ? "opacity-60" : undefined}>
            <View className="relative">
              {name === "notifications" ? (
                // The bell on every tab screen, swung by each new update (#230).
                <BellSwing size={24}>{glyph}</BellSwing>
              ) : (
                glyph
              )}
              {badge > 0 ? (
                <View
                  className="absolute -right-2 -top-1 min-h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1"
                  accessibilityLabel={`${badge} unread`}
                >
                  <Text
                    className="text-caption text-accent-on"
                    style={{
                      includeFontPadding: false,
                      fontSize: 10,
                      lineHeight: 12,
                      color: colors.surface,
                    }}
                  >
                    {badge > 9 ? "9+" : String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text
            numberOfLines={1}
            /*
              The label still grows with the system font scale, but only to
              14px — the most a 16px line box holds. Left uncapped, a large
              accessibility scale clips the label against the pinned box below,
              and letting the box grow instead would hand the bar's height back
              to text metrics, which is the bug the next comment describes.
            */
            maxFontSizeMultiplier={1.4}
            /*
              Android pads a text box with the font's own ascent and descent on
              top of the line height. Left on, Satoshi's metrics make this label
              taller than the 16px the type scale promises, which pushes the
              glyph away from its icon and shoves the icon up into the hairline.
              Off, the box is the 16px it claims to be on every platform.
            */
            style={{ includeFontPadding: false, textAlignVertical: "center" }}
            className={
              focused ? "h-4 text-nav font-medium text-text-primary" : "h-4 text-nav text-text-muted"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
