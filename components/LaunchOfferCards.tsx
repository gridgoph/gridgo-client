import { CircleAlert, CircleCheck, Info, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { TextField } from "@/components/form/TextField";
import { OfferTicket } from "@/components/OfferTicket";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  claimCopy,
  inviteStatus,
  inviteView,
  ONE_DISCOUNT_RULE,
  skippedLine,
  type ClaimOffer,
  type InviteStage,
} from "@/lib/promotions";
import type { PromotionInvite } from "@/lib/api";
import { usePromotions, type PromotionNotice } from "@/store/promotions";

/**
 * The Founding 30 or a waiting Friend Pass, ready to redeem — the same offer
 * as the sheet after sign-in, for a client who said "Not now" there.
 */
export function RedeemOfferCard({ offer }: { offer: ClaimOffer }) {
  const colors = useThemeColors();
  const busy = usePromotions((s) => s.busy);
  const notice = usePromotions((s) => s.claimNotice);
  const copy = claimCopy(offer);
  const pending = busy === offer.kind;

  return (
    <View className="gap-3" testID="redeem-offer">
      <OfferTicket offer={offer} notchColor={colors.canvas} />
      <Text className="text-body text-text-secondary">{copy.body}</Text>
      <PrimaryButton
        label={pending ? "Adding to your wallet…" : copy.action}
        disabled={busy != null}
        onPress={() => void usePromotions.getState().claim(offer.kind)}
      />
      {notice && !notice.ok ? <Notice notice={notice} /> : <Text className="text-caption text-text-muted">{ONE_DISCOUNT_RULE}</Text>}
    </View>
  );
}

/** Said once after a claim lands, above the wallet it landed in. */
export function ClaimedNotice() {
  const notice = usePromotions((s) => s.claimNotice);
  return notice?.ok ? <Notice notice={notice} /> : null;
}

/**
 * A Founder's one invite: a friend's email, then where their Friend Pass
 * stands. GRIDGO sends nothing by email — the friend sees it when they sign
 * in with that address — so the card says that rather than "sent".
 */
export function InviteFriendCard() {
  const colors = useThemeColors();
  const data = usePromotions((s) => s.data);
  const notice = usePromotions((s) => s.inviteNotice);
  const view = inviteView(data);
  if (view.kind === "none") return null;

  return (
    <View className="gg-card gap-3" testID="invite-friend">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant" aria-hidden>
          <UserPlus size={20} color={colors.textPrimary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary" accessibilityRole="header">
            Invite a friend
          </Text>
          <Text className="text-caption text-text-secondary">
            As a Founder you can name one friend. GRIDGO gives them a Friend Pass for their first order.
          </Text>
        </View>
      </View>

      {view.kind === "status" ? <InviteStatusRow invite={view.invite} /> : null}

      {view.kind === "form" && view.skipped ? (
        <View className="gg-panel flex-row items-start gap-2">
          <Info size={16} color={colors.info} strokeWidth={2} style={{ marginTop: 2 }} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">{skippedLine(view.skipped)}</Text>
        </View>
      ) : null}

      {view.kind === "form" || (view.kind === "status" && view.canInviteMore) ? <InviteForm /> : null}

      {view.kind === "closed" ? (
        <Text className="text-caption text-text-muted">
          Friend Pass invites are closed: every pass has been given out, or the launch offer has ended.
        </Text>
      ) : null}

      {notice ? <Notice notice={notice} /> : null}
    </View>
  );
}

const STAGE_CHIP: Record<InviteStage, { tone: StatusTone; icon: StatusIconName }> = {
  invited: { tone: "neutral", icon: "clock" },
  claimed: { tone: "info", icon: "circle-check" },
  used: { tone: "success", icon: "circle-check" },
  ended: { tone: "neutral", icon: "circle-x" },
  withdrawn: { tone: "neutral", icon: "circle-x" },
};

function InviteStatusRow({ invite }: { invite: PromotionInvite }) {
  const status = inviteStatus(invite);
  const chip = STAGE_CHIP[status.stage];
  return (
    <View className="gap-2 border-t border-outline-subtle pt-3" accessible accessibilityLabel={`${status.label}. ${status.line}`} testID="invite-status">
      <View className="flex-row">
        <StatusChip tone={chip.tone} icon={chip.icon} label={status.label} />
      </View>
      <Text className="text-body text-text-primary">{status.line}</Text>
    </View>
  );
}

function InviteForm() {
  const colors = useThemeColors();
  const [email, setEmail] = useState("");
  const busy = usePromotions((s) => s.busy);
  const sending = busy === "invite";
  const blocked = busy != null || !email.trim();

  const submit = async () => {
    if (blocked) return;
    if (await usePromotions.getState().invite(email)) setEmail("");
  };

  return (
    <View className="gap-2">
      <TextField
        value={email}
        onChangeText={setEmail}
        placeholder="friend@example.com"
        accessibilityLabel="Your friend's email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={254}
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <Pressable
        onPress={() => void submit()}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel="Send invite"
        accessibilityState={{ disabled: blocked, busy: sending }}
        className={blocked ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed && !blocked ? { opacity: 0.7 } : undefined)}
      >
        {sending ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
        <Text className="text-button text-text-primary">{sending ? "Sending" : "Send invite"}</Text>
      </Pressable>
      <Text className="text-caption text-text-muted">
        Use the email they sign in to GRIDGO with. {ONE_DISCOUNT_RULE}
      </Text>
    </View>
  );
}

function Notice({ notice }: { notice: PromotionNotice }) {
  const colors = useThemeColors();
  const Icon = notice.ok ? CircleCheck : CircleAlert;
  return (
    <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite" accessibilityRole={notice.ok ? "text" : "alert"}>
      <View className="pt-0.5">
        <Icon size={16} color={notice.ok ? colors.success : colors.error} strokeWidth={2} aria-hidden />
      </View>
      <Text className={`min-w-0 flex-1 text-caption ${notice.ok ? "text-success" : "text-error"}`}>{notice.text}</Text>
    </View>
  );
}
