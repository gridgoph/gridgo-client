import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Bell, FileText, House, User, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useUnreadCount } from "@/store/notifications";

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
     iOS, home indicator     49 + 34 = 83pt   (UIKit exactly)
     iOS, no indicator       49 +  8 = 57pt
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
   tight: the 49pt stack fills its column exactly, so the icon sat 6pt *above*
   the paint.

   The fix is to hang the labelled columns off the painted edge and let only the
   action column reach up into the strip — not to shrink `actionRise`, which is
   the overhang itself. `tabBarTopGap` is the space above the icon measured from
   the painted edge, and it is now what gridgo-supplier draws:

     iOS      4pt   (itemPaddingTop 4, and a 49pt stack leaves no slack)
     Android 20dp   (itemPaddingTop 12, plus the 8dp M3 leaves over the stack)

   All three apps run this file. Android item padding is 12 above and 16 below
   in every one of them.
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
  /** The floating yellow disc that starts a request. Never below the 44pt touch floor. */
  actionDiameter: number;
  /**
   * How far a disc used to rise through this bar's hairline. Always 0: the
   * plus floats over the scene now, so this bar paints edge to edge.
   */
  actionRise: number;
};

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
    // 4 + 24 icon + 2 + 16 label + 3 = 49, the HIG row exactly. The 4pt above
    // the icon is also precisely the badge's -top-1 overhang.
    return {
      columnHeight: 49,
      itemPaddingTop: 4,
      itemGap: 2,
      itemPaddingBottom: 3,
      actionDiameter: 56,
      actionRise: 0,
    };
  }
  // Material 3: 80dp container, 12dp above the item, 16dp below it, 24dp icon.
  return {
    columnHeight: 80,
    itemPaddingTop: 12,
    itemGap: 4,
    itemPaddingBottom: 16,
    actionDiameter: 56,
    actionRise: 0,
  };
}

export const TAB_BAR_METRICS = tabBarMetrics(Platform.OS);

/** Air between the floating plus and the tab bar — close, never touching. */
export const START_PRINT_FAB_GAP = 16;
/** Inset from the page edge. A hair more than the tab gap so it is not glued to the corner. */
export const START_PRINT_FAB_INSET_RIGHT = 20;

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
 * three GRIDGO apps. The plus floats over the scene rather than overhanging
 * this bar, so the layout box and the painted bar are the same height.
 */
export function tabBarPaintedHeight(platformOS: string, insetBottom: number): number {
  return tabBarMetrics(platformOS).columnHeight + tabBarPaddingBottom(insetBottom);
}

/**
 * The bar's layout box. Equals {@link tabBarPaintedHeight}: there is no
 * overhang strip now that the plus floats on the scene.
 */
export function tabBarHeight(platformOS: string, insetBottom: number): number {
  return tabBarMetrics(platformOS).actionRise + tabBarPaintedHeight(platformOS, insetBottom);
}

export function startPrintFabBottom(_insetBottom: number): number {
  // The tab scene already sits above the bar. Adding the bar's height here
  // parked the disc a whole row too high. This is only the air above the bar.
  return START_PRINT_FAB_GAP;
}

/**
 * The space above a tab's glyph, measured from the edge a person can see.
 *
 * The column is laid out `justify-end` against a `columnHeight` minimum, so
 * whatever the platform leaves over the natural stack sits above the glyph and
 * adds to the declared top padding. Android's 80dp container holds a 72dp stack
 * and hands the other 8dp up; iOS's 49pt row is the stack exactly.
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
const ICONS: Record<Exclude<TabName, typeof ACTION_TAB>, LucideIcon> = {
  home: House,
  orders: FileText,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO tab bar.
 *
 * Four labelled destinations. The yellow "+" floats over the scene (see
 * `StartPrintFab`) instead of living in this bar, so the row paints edge to
 * edge the way gridgo-supplier does.
 *
 * The column height and the item padding come from `tabBarMetrics` — the HIG's
 * 49pt row on iOS, and Material 3's 80dp container on Android — with the note
 * above this file's metrics explaining why the two differ and why neither adds
 * a design gap on top of a platform inset.
 *
 * Each column is laid out with `justify-end`, so any slack a platform leaves
 * over its natural stack sits above the glyph and absorbs the badge's `-top-1`
 * overhang. No fixed `h-13` — a rigid 52 left zero top slack and put the badge
 * above the bar border.
 *
 * The surface and top border are absolute to the outer edges, so they fill the
 * inset region down to the physical edge whatever the padding is.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale. Yellow is spent in one
 * place only — the floating disc that starts a print request.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadCount();

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingBottom: tabBarPaddingBottom(insets.bottom) }}
    >
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain. Spans the
        full outer height including the bottom inset region.
      */}
      <View
        className="absolute inset-x-0 bottom-0 border-t border-outline bg-surface"
        style={{ top: 0 }}
      />

      <View className="flex-row items-end">
        {state.routes.map((route, index) => {
          const tab = TABS.find((entry) => entry.name === route.name);
          if (!tab || tab.name === ACTION_TAB) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              name={tab.name}
              label={tab.label}
              focused={focused}
              onPress={onPress}
              badge={tab.name === "notifications" && unreadCount > 0 ? unreadCount : 0}
            />
          );
        })}
      </View>
    </View>
  );
}

type TabItemProps = {
  name: Exclude<TabName, typeof ACTION_TAB>;
  label: string;
  focused: boolean;
  onPress: () => void;
  badge?: number;
};

function TabItem({ name, label, focused, onPress, badge = 0 }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];

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
              <Icon
                size={24}
                strokeWidth={2}
                color={focused ? colors.textPrimary : colors.textMuted}
              />
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
