import * as Linking from "expo-linking";
import { Check, Copy, Link2, QrCode, Share2, Users } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { Sheet } from "@/components/Sheet";
import { claimSlip } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { copyText } from "@/lib/copyText";
import {
  clockTime,
  deliveryShareLine,
  firstName,
  initials,
  inviteLink,
  inviteMessage,
  pagesLine,
  peopleLine,
  shareView,
  timeLeft,
  trackingStops,
} from "@/lib/expressGroup";
import { encodeQr, qrPath } from "@/lib/qr";

const QUIET_ZONE = 4;

/**
 * The group's seats: one disc per person, ink once they have files in, an
 * outline while they have none. The host's own list carries initials; a
 * member sees the same seats without anyone's name.
 */
function Seats({ group }: { group: api.ExpressGroup }) {
  const rows = group.members ?? null;
  const seats = rows
    ? rows.map((row) => ({ key: row.userId, label: initials(row.name), filled: row.fileCount > 0 }))
    : Array.from({ length: group.people }, (_, index) => ({
        key: String(index),
        label: "",
        filled: index < group.printingPeople,
      }));
  return (
    <View className="flex-row flex-wrap gap-1.5" accessible accessibilityLabel={`${peopleLine(group.people)}, ${group.printingPeople} with files in`}>
      {seats.map((seat) => (
        <View
          key={seat.key}
          className={
            seat.filled
              ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
              : "h-8 w-8 items-center justify-center rounded-pill border border-dashed border-text-muted bg-surface"
          }
        >
          <Text className={seat.filled ? "text-caption font-bold text-accent-on" : "text-caption font-bold text-text-muted"}>
            {seat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The top of the group: whose it is, how long is left, who has files in, and
 * what delivery comes to each. The countdown is the one big thing on screen.
 */
export function GroupHeader({ group, now, host }: { group: api.ExpressGroup; now: number; host: boolean }) {
  const left = timeLeft(group.closesAt, now);
  const payLeft = group.state === "checkout_open" ? timeLeft(group.payBy, now) : null;
  const share = deliveryShareLine(group);
  const progress = group.people > 0 ? group.printingPeople / group.people : 0;
  const closing = clockTime(group.closesAt);
  const open = group.state === "open";
  return (
    <View className="gg-card gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-caption text-text-muted">{host ? "Your group" : `${firstName(group.host.name)}'s group`}</Text>
          <Text className="text-h3 font-bold text-text-primary">
            {group.fulfillmentMode === "delivery" ? "One delivery for everyone" : "One pickup for everyone"}
          </Text>
        </View>
        {open ? (
          <View className="items-end" accessible accessibilityLabel={left ? `${left} left to add files` : "Files are closing"}>
            <Text className="font-bold text-text-primary" style={{ fontSize: 28, lineHeight: 34, fontVariant: ["tabular-nums"] }}>
              {left ?? "0:00"}
            </Text>
            <Text className="text-caption text-text-muted">{closing ? `left · closes ${closing}` : "left"}</Text>
          </View>
        ) : payLeft ? (
          <View className="items-end" accessible accessibilityLabel={`${payLeft} left to pay`}>
            <Text className="font-bold text-text-primary" style={{ fontSize: 28, lineHeight: 34, fontVariant: ["tabular-nums"] }}>
              {payLeft}
            </Text>
            <Text className="text-caption text-text-muted">left to pay</Text>
          </View>
        ) : null}
      </View>
      <Seats group={group} />
      <View className="gap-1.5">
        <View className="h-1.5 overflow-hidden rounded-pill bg-surface-variant" accessibilityRole="progressbar" accessibilityLabel={`${group.printingPeople} of ${group.people} have added files`}>
          <View className="h-1.5 rounded-pill bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-caption text-text-secondary">
            {group.printingPeople} of {group.people} have files in
          </Text>
          {share ? (
            <Text className="text-caption text-text-secondary" accessibilityLabel={`Delivery ${api.formatPhp(share.shareMinor)} each${share.fareMinor != null ? ` instead of ${api.formatPhp(share.fareMinor)}` : ""}`}>
              Delivery <Text className="font-bold text-text-primary">{api.formatPhp(share.shareMinor)}</Text> each
              {share.fareMinor != null && share.fareMinor !== share.shareMinor ? (
                <>
                  {"  "}
                  <Text className="text-text-muted" style={{ textDecorationLine: "line-through" }}>
                    {api.formatPhp(share.fareMinor)}
                  </Text>
                </>
              ) : null}
            </Text>
          ) : group.fulfillmentMode === "pickup" ? (
            <Text className="text-caption text-text-muted">No delivery fee</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function MoneyRow({ label, value, strong = false, struck = null }: { label: string; value: string; strong?: boolean; struck?: string | null }) {
  return (
    <View className="flex-row items-center justify-between py-0.5">
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-secondary"}>{label}</Text>
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-primary"}>
        {struck ? (
          <>
            <Text className="text-text-muted" style={{ textDecorationLine: "line-through" }}>
              {struck}
            </Text>{" "}
          </>
        ) : null}
        {value}
      </Text>
    </View>
  );
}

/**
 * What this person owes the host and why: their pages, their prints, their
 * share of the one delivery fee. No page price, no fee breakdown.
 */
export function MyShareCard({
  group,
  host,
  children,
}: {
  group: api.ExpressGroup;
  host: boolean;
  /** The file action, under the breakdown. */
  children?: React.ReactNode;
}) {
  const view = shareView(group.me);
  const delivery = group.fulfillmentMode === "delivery";
  const fare = host ? (group.deliveryFeeMinor ?? null) : null;
  const hostName = firstName(group.host.name);
  return (
    <View className="gg-card gap-2">
      <Text className="text-body-lg font-bold text-text-primary">{host ? "Your prints" : group.me.paidBack ? "Your share" : "What you owe"}</Text>
      {view.kind === "none" ? (
        <Text className="text-body text-text-secondary">
          {host ? "Add your own files, or just collect everyone's." : "Add your files to see your share."}
        </Text>
      ) : view.kind === "pending" ? (
        <Text className="text-body text-text-secondary">
          {filesLineFor(group.me.fileCount)} · {pagesLine(view.pages)}. No shop can price it right now; your share shows once one can.
        </Text>
      ) : (
        <View className="gap-0.5">
          <MoneyRow label={`Prints · ${pagesLine(view.pages)}`} value={api.formatPhp(view.printsMinor)} />
          {delivery ? (
            <MoneyRow
              label={host ? "Delivery, after shares" : "Your delivery share"}
              value={api.formatPhp(view.deliveryMinor)}
              struck={fare != null && fare !== view.deliveryMinor ? api.formatPhp(fare) : null}
            />
          ) : null}
          <View className="my-1 h-px bg-outline-subtle" />
          {host ? (
            <MoneyRow label="Your part" value={api.formatPhp(view.owedMinor)} strong />
          ) : (
            <MoneyRow label={group.me.paidBack ? `You paid ${hostName}` : `You owe ${hostName}`} value={api.formatPhp(view.owedMinor)} strong />
          )}
        </View>
      )}
      {!host && !group.me.paidBack ? (
        <Text className="text-caption text-text-muted">
          {hostName} pays GRIDGO for everyone and receives all the prints. Pay {hostName} back in cash or by e-wallet.
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function filesLineFor(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

/** One person in the host's list: files, pages, and what they owe. */
export function MemberRow({
  member,
  isHostRow,
  divided,
  onManage,
  showPaidBack,
}: {
  member: api.ExpressGroupAmount;
  isHostRow: boolean;
  divided: boolean;
  onManage: (() => void) | null;
  showPaidBack: boolean;
}) {
  const colors = useThemeColors();
  const view = shareView(member);
  const facts =
    // Once files lock, "yet" promises something that cannot come.
    view.kind === "none" ? (showPaidBack ? "No files" : "No files yet") : `${filesLineFor(member.fileCount)} · ${pagesLine(member.pageCount ?? 0)}`;
  const owed = view.kind === "priced" ? api.formatPhp(view.owedMinor) : view.kind === "pending" ? "Not priced" : "—";
  const content = (
    <>
      <View className={member.fileCount > 0 ? "h-9 w-9 items-center justify-center rounded-pill bg-accent" : "h-9 w-9 items-center justify-center rounded-pill border border-dashed border-text-muted"}>
        <Text className={member.fileCount > 0 ? "text-caption font-bold text-accent-on" : "text-caption font-bold text-text-muted"}>
          {initials(member.name)}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {isHostRow ? `${member.name} (you)` : member.name}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {facts}
        </Text>
      </View>
      <View className="items-end gap-0.5">
        <Text className="text-body font-bold text-text-primary">{isHostRow ? (view.kind === "priced" ? api.formatPhp(view.owedMinor) : "—") : owed}</Text>
        {showPaidBack && !isHostRow ? (
          member.paidBack ? (
            <View className="flex-row items-center gap-1">
              <Check size={12} color={colors.success} strokeWidth={2.5} aria-hidden />
              <Text className="text-caption text-success">Paid back</Text>
            </View>
          ) : (
            <Text className="text-caption text-text-muted">Not paid back</Text>
          )
        ) : isHostRow ? (
          <Text className="text-caption text-text-muted">Your part</Text>
        ) : (
          <Text className="text-caption text-text-muted">Owes you</Text>
        )}
      </View>
    </>
  );
  const row = divided ? "min-h-14 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-2" : "min-h-14 flex-row items-center gap-3 px-4 py-2";
  return onManage ? (
    <Pressable
      onPress={onManage}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}. ${facts}. ${owed}. Manage`}
      className={row}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {content}
    </Pressable>
  ) : (
    <View className={row} accessible accessibilityLabel={`${member.name}. ${facts}. ${owed}`}>
      {content}
    </View>
  );
}

/** The host's list of everyone, with the whole total under it. */
export function MembersCard({
  group,
  onManage,
  showPaidBack,
}: {
  group: api.ExpressGroup;
  onManage: ((member: api.ExpressGroupAmount) => void) | null;
  showPaidBack: boolean;
}) {
  const members = group.members ?? [];
  return (
    <View className="gap-2">
      <View className="flex-row items-end justify-between">
        <Text className="text-body-lg font-bold text-text-primary">Everyone</Text>
        <Text className="text-caption text-text-muted">{peopleLine(group.people)}</Text>
      </View>
      <View className="gg-card-flush">
        {members.map((member, index) => (
          <MemberRow
            key={member.userId}
            member={member}
            isHostRow={member.userId === group.host.id}
            divided={index > 0}
            onManage={onManage && member.userId !== group.host.id ? () => onManage(member) : null}
            showPaidBack={showPaidBack}
          />
        ))}
        {group.totalMinor != null && group.printingPeople > 0 ? (
          <View className="flex-row items-center justify-between border-t border-outline-subtle px-4 py-3">
            <Text className="text-body font-bold text-text-primary">Group total</Text>
            <Text className="text-body font-bold text-text-primary">{api.formatPhp(group.totalMinor)}</Text>
          </View>
        ) : group.quoteStatus === "pending" && group.printingPeople > 0 ? (
          <Text className="border-t border-outline-subtle px-4 py-3 text-caption text-text-muted">
            No shop can price the group right now. Shares show once one can.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The host's Manage sheet for one person: the paid-back tick (tracking only,
 * GRIDGO never collects from members) and removal before checkout.
 */
export function ManageSheet({
  member,
  canRemove,
  busy,
  error,
  onClose,
  onPaidBack,
  onRemove,
}: {
  member: api.ExpressGroupAmount | null;
  canRemove: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPaidBack: (paidBack: boolean) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const view = shareView(member);
  return (
    <Sheet open={member != null} onClose={onClose} title={member?.name ?? ""} subtitle={view.kind === "priced" ? `Owes you ${api.formatPhp(view.owedMinor)}` : undefined}>
      <View className="gap-3 px-4 pb-2 pt-3">
        <Pressable
          onPress={() => member && onPaidBack(!member.paidBack)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: member?.paidBack === true, disabled: busy }}
          className="min-h-14 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2"
        >
          <View className={member?.paidBack ? "h-6 w-6 items-center justify-center rounded-md bg-accent" : "h-6 w-6 rounded-md border-2 border-outline"}>
            {member?.paidBack ? <Check size={16} color={colors.accentOn} strokeWidth={3} aria-hidden /> : null}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary">Paid me back</Text>
            <Text className="text-caption text-text-muted">For your own tracking. GRIDGO never collects from them.</Text>
          </View>
        </Pressable>
        {error ? (
          <Text className="text-caption text-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {canRemove ? (
          <Pressable onPress={onRemove} disabled={busy} accessibilityRole="button" className="gg-btn-secondary">
            <Text className="text-button text-error">Remove from group</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} accessibilityRole="button" className="min-h-11 items-center justify-center">
          <Text className="text-body font-medium text-text-primary underline">Done</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/** The invite as a QR code: black on white in both themes, so it always scans. */
function InviteQr({ link, size = 200 }: { link: string; size?: number }) {
  let path: string | null = null;
  let extent = 0;
  try {
    const matrix = encodeQr(link, { ecl: "L" });
    extent = matrix.size + QUIET_ZONE * 2;
    path = qrPath(matrix, QUIET_ZONE);
  } catch {
    path = null;
  }
  if (!path) return null;
  return (
    <View className="items-center justify-center rounded-card bg-slip-paper p-2" accessible accessibilityLabel="Invite QR code">
      <Svg width={size} height={size} viewBox={`0 0 ${extent} ${extent}`}>
        <Rect x={0} y={0} width={extent} height={extent} fill={claimSlip.paper} />
        <Path d={path} fill={claimSlip.ink} />
      </Svg>
    </View>
  );
}

/** The app's own link for an invite token: the scheme in a build, Expo Go's address in development. */
export function inviteUrl(token: string): string {
  return inviteLink(Linking.createURL("/"), token);
}

/**
 * Share the invite: the phone's share sheet, the link to copy, and a QR
 * code for someone standing beside you. The token is GRIDGO's, sent once at
 * create and held on this phone.
 */
export function InviteSheet({
  open,
  onClose,
  group,
  token,
}: {
  open: boolean;
  onClose: () => void;
  group: api.ExpressGroup;
  token: string | null;
}) {
  const colors = useThemeColors();
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const link = token ? inviteUrl(token) : null;
  const message = link
    ? inviteMessage({ hostName: group.host.name, link, closesAt: group.closesAt, mode: group.fulfillmentMode, downloadUrl: APP_UPDATE_SOURCE.downloadUrl })
    : null;

  const share = async () => {
    if (!message) return;
    try {
      await Share.share({ message });
    } catch {
      // The sheet was dismissed or is not available; Copy is right there.
    }
  };
  const copy = async () => {
    if (!link) return;
    setCopied((await copyText(link)) ? "copied" : "failed");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite your group" subtitle="They need the GRIDGO app. The link opens it on this group." maxHeightRatio={0.9}>
      <View className="items-center gap-4 px-4 pb-2 pt-3">
        {link ? (
          <>
            <InviteQr link={link} />
            <Text className="text-center text-caption text-text-muted">Scan with the phone camera</Text>
            <Pressable onPress={() => void share()} accessibilityRole="button" className="gg-btn-primary w-full">
              <Share2 size={18} color={colors.actionYellowOn} strokeWidth={2} aria-hidden />
              <Text className="text-button text-action-yellow-on">Share invite</Text>
            </Pressable>
            <Pressable onPress={() => void copy()} accessibilityRole="button" className="gg-btn-secondary w-full">
              {copied === "copied" ? (
                <Check size={18} color={colors.success} strokeWidth={2.5} aria-hidden />
              ) : (
                <Copy size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              )}
              <Text className="text-button text-text-primary">{copied === "copied" ? "Link copied" : "Copy link"}</Text>
            </Pressable>
            {copied === "failed" ? <Text className="text-caption text-error">Copy did not work. Use Share instead.</Text> : null}
          </>
        ) : (
          <View className="items-center gap-2 py-4">
            <Link2 size={28} color={colors.textMuted} strokeWidth={1.5} aria-hidden />
            <Text className="text-center text-body text-text-secondary">
              This invite was made on another phone. Share it from there.
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

/** The white invite row on the group screen: QR, link and Share live in its sheet. */
export function InviteRow({ onPress, people }: { onPress: () => void; people: number }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Invite people. Share a link or show a QR code"
      className="min-h-14 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <QrCode size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1">
        <Text className="text-body font-bold text-text-primary">Invite people</Text>
        <Text className="text-caption text-text-secondary">
          {people <= 1 ? "Share a link or show the QR code" : "Share the link again, or show the QR code"}
        </Text>
      </View>
      <Users size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}

/** Placed → Delivered, the same stops for everyone. The current stop is the one yellow. */
export function GroupRail({ index, mode }: { index: number; mode: string }) {
  const stops = trackingStops(mode);
  return (
    <View className="gap-2" accessible accessibilityLabel={`Step ${index + 1} of ${stops.length}: ${stops[index]}`}>
      <View className="flex-row gap-1">
        {stops.map((stop, stopIndex) => (
          <View
            key={stop}
            className={
              stopIndex === index ? "h-1.5 flex-1 rounded-pill bg-action-yellow" : stopIndex < index ? "h-1.5 flex-1 rounded-pill bg-accent" : "h-1.5 flex-1 rounded-pill bg-surface-variant"
            }
          />
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text className={index === 0 ? "text-caption font-bold text-text-primary" : "text-caption text-text-muted"}>{stops[0]}</Text>
        {index > 0 && index < stops.length - 1 ? <Text className="text-caption font-bold text-text-primary">{stops[index]}</Text> : null}
        <Text className={index === stops.length - 1 ? "text-caption font-bold text-text-primary" : "text-caption text-text-muted"}>
          {stops[stops.length - 1]}
        </Text>
      </View>
    </View>
  );
}

/** A six-digit handover code, host only. */
export function GroupCodeCard({ code, kind, place = null }: { code: string; kind: "pickup" | "delivery"; place?: string | null }) {
  const shown = /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <View className="gg-card items-center gap-1" accessible accessibilityLabel={`${kind === "pickup" ? "Pickup" : "Delivery"} code ${code.split("").join(" ")}`}>
      <Text className="text-body text-text-secondary">{kind === "pickup" ? "Your pickup code" : "Your delivery code"}</Text>
      <Text className="font-bold text-text-primary" style={{ fontSize: 44, lineHeight: 52, letterSpacing: 4 }}>
        {shown}
      </Text>
      <Text className="text-center text-caption text-text-muted">
        {kind === "pickup"
          ? `Show it at ${place ?? "the shop (see Order and payment details)"}. Only you can see it.`
          : "Give it to the rider at the door. Your backup receiver needs it too. Only you can see it."}
      </Text>
    </View>
  );
}

/** "Arrives about 2:40 PM" — the rider's own estimate, never a promise. */
export function arrivalLine(at: string | null | undefined, now: number): string | null {
  if (!at) return null;
  const time = clockTime(at);
  if (!time || Date.parse(at) < now - 10 * 60_000) return null;
  return `The rider expects to arrive about ${time}.`;
}
