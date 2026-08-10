import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, FileText, House, Plus, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * Design breathing room beneath the tab content, inside the bar surface.
 * Stacked on top of `insets.bottom` — never maxed with it. The inset is a
 * system keep-out zone; this is deliberate padding below the labels.
 */
export const TAB_BAR_DESIGN_BOTTOM_PAD = 8;

/**
 * Compose the bar's bottom padding: system inset + design pad.
 * Pure so tests can lock the add (not max) composition without a full render tree.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom + TAB_BAR_DESIGN_BOTTOM_PAD;
}

/** MD3 bottom navigation height for a labelled column. */
export const TAB_BAR_COLUMN_HEIGHT = 80;

/**
 * Bottom padding a tab screen's scroll content needs so its last row clears
 * the bar instead of ending underneath it.
 *
 * The bar floats over the scene, so a screen that only pads by its own design
 * gap loses its final card. Derived from the bar's own metrics, so the two
 * cannot drift apart.
 */
export function tabScreenContentPadding(insetBottom: number): number {
  return tabBarPaddingBottom(insetBottom) + TAB_BAR_COLUMN_HEIGHT + 24;
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
 * Four labelled destinations and one unlabelled action.
 *
 * Material Design 3 sizes an icon-plus-label bottom navigation at 80dp. Each
 * labelled column is therefore `min-h-20` (80) so it meets the platform height
 * and the 44dp touch floor with room to spare. Stack inside a column:
 *   pt-2 (8) + icon (24) + gap-1 (4) + label box (16) + pb-2 (8) = 60 natural
 * The min height lifts that to 80; with `justify-end` the extra 20 sits above
 * the glyph and absorbs the badge's `-top-1` overhang. No fixed `h-13` — a
 * rigid 52 left zero top slack and put the badge above the bar border (the
 * supplier app already fixed this; the raised action disc only hid it here).
 *
 * The action is a 56px disc in an 80-tall column — no label, because a filled
 * yellow plus in the middle of a tab bar needs no caption. The disc sits at
 * the top of that column while the bar surface starts 16px down (`top-4`), so
 * the disc rises through the hairline without drawing outside its parent.
 *
 * Bottom padding is `insets.bottom + TAB_BAR_DESIGN_BOTTOM_PAD`. The surface
 * and top border are absolute to the outer edges, so they still fill the inset
 * region down to the physical edge.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale. Yellow is spent in one
 * place only — the disc that starts a print request.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useNotifications((s) => s.unreadCount);

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
      <View className="absolute inset-x-0 bottom-0 top-4 border-t border-outline bg-surface" />

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

  // 80 tall, matching the destinations' MD3 height. The 56 disc sits at the
  // top of the column; the surface starts 16 below the row top, so the disc
  // breaks the hairline. Foot still lines up with the labelled row.
  if (name === ACTION_TAB) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        className="h-20 flex-1 items-center"
      >
        {({ pressed }) => (
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-action-yellow">
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
      // min-h-20 = MD3 80dp icon+label bar. pt-2 clears the badge overhang.
      // Grows with content if the label scales; never a rigid h-13.
      className="min-h-20 flex-1 items-center justify-end gap-1 pb-2 pt-2"
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
