import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, FileText, House, Plus, User, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useUnreadCount } from "@/store/notifications";

/* ---------------------------------------------------------------------------
   Bar geometry

   Two platforms with two different published answers, and one rule they agree
   on. Getting either half wrong has been reported by the captain once each.

   **iOS.** The Human Interface Guidelines tab bar is a 49pt content row, and on
   a home-indicator iPhone the bar is 83pt overall — 49 of content plus the 34pt
   bottom safe-area inset. UIKit does not put design padding under the labels on
   top of that inset; the inset *is* the space. This bar did, and stacked an
   80dp column on top of it as well: 80 + 34 + 8 = 122pt against the platform's
   83. That is the "tab bar sits too high" report.

   **Android.** Material 3's navigation bar container is 80dp with 12dp above
   the item and 16dp below it, and the system navigation inset is added beneath
   that container. A bar that had only its 8pt design gap under the labels was
   the opposite report, which is why `Math.max(inset, pad)` alone was banned —
   it silently discarded the design gap.

   **The rule both follow.** Where the platform reserves a bottom inset, that
   inset is the breathing room and nothing is added to it. Where it reserves
   none — an iPhone SE, a phone with no gesture bar, Expo web — the design gap
   stands in, so labels are never flush against the physical edge.

   Resulting bar heights, content column plus whatever sits under it:
     iOS, home indicator     49 + 34 = 83pt   (UIKit exactly)
     iOS, no indicator       49 +  8 = 57pt
     Android, gesture nav    80 + 24 = 104dp
     Android, three-button   80 + 48 = 128dp
     Android/web, no inset   80 +  8 = 88dp
   --------------------------------------------------------------------------- */

/** Used only where the platform reserves no bottom inset of its own. */
export const TAB_BAR_MIN_BOTTOM_GAP = 8;

export type TabBarMetrics = {
  /** The content row, above whatever the platform reserves below it. */
  columnHeight: number;
  itemPaddingTop: number;
  itemGap: number;
  itemPaddingBottom: number;
  /** The yellow disc that starts a request. Never below the 44pt touch floor. */
  actionDiameter: number;
  /** How far that disc rises through the bar's top hairline. */
  actionRise: number;
};

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
      actionDiameter: 44,
      actionRise: 10,
    };
  }
  // Material 3: 80dp container, 12dp above the item, 16dp below it, 24dp icon.
  return {
    columnHeight: 80,
    itemPaddingTop: 12,
    itemGap: 4,
    itemPaddingBottom: 16,
    actionDiameter: 56,
    actionRise: 16,
  };
}

export const TAB_BAR_METRICS = tabBarMetrics(Platform.OS);

/**
 * What sits below the content row: the platform's own inset where there is
 * one, and the design gap only where there is not.
 *
 * Not `inset + gap`: on a home-indicator iPhone that added 8pt to a 34pt
 * keep-out zone the platform had already sized as the bar's breathing room.
 * Not a bare `Math.max` either — the intent is the reason, and a future reader
 * needs to see that the design gap is a floor for insetless devices, not an
 * alternative to the inset.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom : TAB_BAR_MIN_BOTTOM_GAP;
}

/**
 * Bottom padding a tab screen's scroll content needs so its last row clears
 * the bar instead of ending underneath it.
 *
 * The bar floats over the scene, so a screen that only pads by its own design
 * gap loses its final card. Derived from the bar's own metrics, so the two
 * cannot drift apart.
 */
export function tabScreenContentPadding(insetBottom: number): number {
  return tabBarPaddingBottom(insetBottom) + TAB_BAR_METRICS.columnHeight + 24;
}

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<TabName, LucideIcon> = {
  home: House,
  orders: FileText,
  "new-request": Plus,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO tab bar.
 *
 * Four labelled destinations and one unlabelled action. The column height and
 * the item padding come from `tabBarMetrics` — the HIG's 49pt row on iOS, and
 * Material 3's 80dp container on Android — with the note above this file's
 * metrics explaining why the two differ and why neither adds a design gap on
 * top of a platform inset.
 *
 * Each column is laid out with `justify-end`, so any slack a platform leaves
 * over its natural stack sits above the glyph and absorbs the badge's `-top-1`
 * overhang. No fixed `h-13` — a rigid 52 left zero top slack and put the badge
 * above the bar border.
 *
 * The action disc carries no label, because a filled yellow plus in the middle
 * of a tab bar needs no caption. It sits at the top of its column while the
 * bar surface starts `actionRise` below the row top, so the disc rises through
 * the hairline without drawing outside its parent. It stays at or above the
 * 44pt touch floor on both platforms.
 *
 * The surface and top border are absolute to the outer edges, so they fill the
 * inset region down to the physical edge whatever the padding is.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale. Yellow is spent in one
 * place only — the disc that starts a print request.
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
        style={{ top: TAB_BAR_METRICS.actionRise }}
      />

      <View className="flex-row items-end">
        {state.routes.map((route, index) => {
          const tab = TABS.find((entry) => entry.name === route.name);
          if (!tab) return null;

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
  name: TabName;
  label: string;
  focused: boolean;
  onPress: () => void;
  badge?: number;
};

function TabItem({ name, label, focused, onPress, badge = 0 }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];

  // The disc sits at the top of a column the same height as its labelled
  // neighbours; the surface starts `actionRise` below the row top, so the disc
  // breaks the hairline. Foot still lines up with the labelled row.
  if (name === ACTION_TAB) {
    const { actionDiameter } = TAB_BAR_METRICS;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        className="flex-1 items-center"
        style={{ height: TAB_BAR_METRICS.columnHeight }}
      >
        {({ pressed }) => (
          <View
            className="items-center justify-center rounded-pill bg-action-yellow"
            style={{ height: actionDiameter, width: actionDiameter }}
          >
            <Icon size={26} color={colors.actionYellowOn} strokeWidth={2.5} />
            {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-pill" /> : null}
          </View>
        )}
      </Pressable>
    );
  }

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
