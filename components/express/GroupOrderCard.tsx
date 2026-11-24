import { useRouter } from "expo-router";
import { ChevronRight, Users } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { currentGroup, firstName, groupPhase, isHost, timeLeft } from "@/lib/expressGroup";
import { useExpress } from "@/store/express";
import { useExpressGroup } from "@/store/expressGroup";
import { useSession } from "@/store/session";

/**
 * The white "Group order" card under the Express files note (gridgo-client#450).
 * Drawn only where GRIDGO offers groups, never in How to order's sample or
 * while a member edits their own group files. Upload and Continue stay the
 * screen's only yellow.
 */
export function GroupOrderCard() {
  const router = useRouter();
  const colors = useThemeColors();
  const available = useExpressGroup((state) => state.available);
  const mine = useExpressGroup((state) => state.mine);
  const sample = useExpress((state) => state.sample);
  const editing = useExpress((state) => state.group != null);
  const userId = useSession((state) => state.user?.id ?? null);
  const now = useServerNow(1000);
  if (available !== "on" || sample || editing) return null;

  const group = currentGroup(mine ?? []);
  const phase = group ? groupPhase(group) : null;
  const left = group && phase === "open" ? timeLeft(group.closesAt, now) : null;
  const title = group ? (isHost(group, userId) ? "Your group order" : `${firstName(group.host.name)}'s group order`) : "Group order";
  const line = !group
    ? "Print with classmates. One delivery fee, split fairly."
    : phase === "open"
      ? left
        ? `${left} left to add files`
        : "Files are closing"
      : phase === "checkout"
        ? "Files are locked. Checkout is open."
        : "Follow the order together";

  return (
    <Pressable
      onPress={() =>
        group
          ? router.push({ pathname: "/express/group/[id]", params: { id: group.id } })
          : router.push("/express/group/new")
      }
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      className="min-h-16 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <Users size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-bold text-text-primary">{title}</Text>
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {line}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
