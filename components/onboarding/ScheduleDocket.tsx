import { CalendarCheck, Moon, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Onboarding's scheduling picture: a job placed late at night, ready on the day asked for.
 *
 * The one feature page with no artwork in the app, so it is drawn from tokens
 * rather than borrowed from another beat. It is set as a docket inside crop
 * marks — the trimmer's register marks the category board already uses — so it
 * reads as a print ticket, not a calendar widget. The times are an example and
 * the page says so to a screen reader; they are never a promise.
 */
export function ScheduleDocket() {
  const colors = useThemeColors();

  return (
    <View
      className="min-h-0 flex-1 items-center justify-center px-6"
      accessible
      accessibilityLabel="Example: a job placed on Sunday at 11:48 PM, ready by Thursday at 5:00 PM."
    >
      <View className="w-full" style={{ maxWidth: 320 }}>
        <CropMarkFrame>
          <View className="bg-surface px-5 py-5">
            <DocketRow icon={Moon} label="Placed" value="Sunday, 11:48 PM" color={colors.textPrimary} />
            {/* The thread between the two stamps: textMuted, never outline, so it survives Dark. */}
            <View
              className="ml-4 w-px"
              style={{ height: 22, backgroundColor: colors.textMuted, opacity: 0.4 }}
            />
            <DocketRow
              icon={CalendarCheck}
              label="Ready by"
              value="Thursday, 5:00 PM"
              color={colors.textPrimary}
            />
          </View>
        </CropMarkFrame>
      </View>
    </View>
  );
}

function DocketRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-8 w-8 items-center justify-center rounded-pill border border-outline bg-surface-variant">
        <Icon size={16} color={color} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-caption text-text-muted">{label}</Text>
        <Text className="text-h3 text-text-primary">{value}</Text>
      </View>
    </View>
  );
}
