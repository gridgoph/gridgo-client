import { Download } from "lucide-react-native";
import { Text, View } from "react-native";

import { DoneLine, ProblemLine } from "@/components/organization/MemberParts";
import { Pressable } from "@/components/Pressable";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { eventLine } from "@/lib/organizationMembers";
import type { OrganizationEvent } from "@/lib/organizationMembersApi";
import { useOrganizationEvents, type PackFormat } from "@/store/organizationEvents";

/** Liquidation records, as the Partnership and events screens both draw them (gridgo-client#474). */

export const PACK_NOTE = "A statement for your liquidation, not a tax document. Official receipts are issued separately.";

export function EventStatusChip({ status }: { status: OrganizationEvent["status"] }) {
  return status === "complete" ? (
    <StatusChip tone="success" label="Complete" icon="circle-check" />
  ) : (
    <StatusChip tone="neutral" label="Open" icon="clock" />
  );
}

/** One event: its name leads to the orders, and its pack is one tap away. */
export function EventRow({ event, divided, onOpen }: { event: OrganizationEvent; divided: boolean; onOpen: () => void }) {
  return (
    <View className={divided ? "gap-1 border-t border-outline-subtle px-4 py-3" : "gap-1 px-4 py-3"} testID={`event-${event.id}`}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${event.name}. ${eventLine(event)}. ${event.status === "complete" ? "Complete" : "Open"}`}
        accessibilityHint="Opens this event"
        className="gg-touch flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
            {event.name}
          </Text>
          <Text className="text-caption text-text-muted">{eventLine(event)}</Text>
        </View>
        <EventStatusChip status={event.status} />
      </Pressable>
      {/* An open event may have nothing complete to list; its own screen says what is ready. */}
      {event.status === "complete" ? (
        <>
          <PackButton event={event} format="pdf" label="Download pack" />
          <PackNotice id={event.id} />
        </>
      ) : null}
    </View>
  );
}

export function PackButton({ event, format, label, boxed = false }: {
  event: Pick<OrganizationEvent, "id" | "name">;
  format: PackFormat;
  label: string;
  boxed?: boolean;
}) {
  const colors = useThemeColors();
  const packing = useOrganizationEvents((s) => s.packing);
  const mine = packing === `${event.id}:${format}`;
  const shell = boxed ? "gg-btn-secondary" : "gg-touch flex-row items-center gap-2 self-start pr-3";
  return (
    <Pressable
      onPress={() => void useOrganizationEvents.getState().pack(event, format)}
      disabled={packing !== null}
      accessibilityRole="button"
      accessibilityLabel={`${label} for ${event.name}`}
      accessibilityState={{ disabled: packing !== null, busy: mine }}
      className={packing !== null ? `${shell} gg-disabled` : shell}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Download size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      <Text className="text-button text-text-primary">{mine ? "Preparing…" : label}</Text>
    </Pressable>
  );
}

export function PackNotice({ id }: { id: string }) {
  const notice = useOrganizationEvents((s) => s.packNotice);
  if (notice?.id !== id) return null;
  return notice.tone === "error" ? <ProblemLine message={notice.message} /> : <DoneLine message={notice.message} />;
}
