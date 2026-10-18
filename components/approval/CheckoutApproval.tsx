import { PenLine } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { ApprovalReviewList } from "@/components/approval/ApprovalReviewList";
import { SignaturePreview } from "@/components/approval/SignaturePreview";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { useThemeColors } from "@/hooks/useTheme";
import type { ApprovalMethod, CartLineRecord } from "@/lib/api";
import {
  APPROVAL_MEANING,
  APPROVAL_STATEMENT,
  cartLineReview,
  DRAWN_REASON,
} from "@/lib/approvalProof";
import type { Signature } from "@/lib/signature";
import type { ApprovalStatus } from "@/store/approval";

type Props = {
  method: ApprovalMethod;
  lines: CartLineRecord[];
  status: ApprovalStatus;
  signature: Signature | null;
  /** One tap: tick or untick "I approve this order". */
  onTap: (approved: boolean) => void;
  /** Drawn: open the page the client signs on. */
  onSign: () => void;
  error: string | null;
  disabled?: boolean;
};

/**
 * The basket's approval, the last thing above Place order (gridgo-client#248).
 *
 * It restates what is being approved — every item's quantity, options,
 * artwork and accepted warnings — then asks for the approval GRIDGO requires:
 * one tap for a standard product, a hand-drawn signature for custom
 * merchandise. Neither control is yellow; the order's one primary action is
 * still Place order, which sends the approval with the payment.
 */
export function CheckoutApproval({ method, lines, status, signature, onTap, onSign, error, disabled = false }: Props) {
  const colors = useThemeColors();
  const given = status === "given";

  return (
    <View className="gap-3">
      <Text className="text-body text-text-secondary">{APPROVAL_MEANING}</Text>

      <View className="gg-card gap-2">
        <Text className="text-overline text-text-muted">WHAT YOU ARE APPROVING</Text>
        <ApprovalReviewList items={lines.map(cartLineReview)} />
      </View>

      {status === "stale" ? (
        <Text className="text-caption text-warning" accessibilityRole="alert">
          Your order changed after you approved it. Check it again and approve this version.
        </Text>
      ) : null}

      {method === "one_tap" ? (
        <CheckboxRow
          checked={given}
          onChange={onTap}
          disabled={disabled}
          label={APPROVAL_STATEMENT}
          hint="The items, options, artwork and accepted warnings above, as they are now."
        />
      ) : (
        <View className="gap-3">
          <Text className="text-caption text-text-muted">{DRAWN_REASON}</Text>
          {given && signature ? (
            <View className="gap-2">
              <SignaturePreview signature={signature} />
              <Text className="text-caption text-text-secondary">
                Signed: &quot;{APPROVAL_STATEMENT}&quot;. It is sent with your order.
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={onSign}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={given ? "Sign again" : "Sign to approve this order"}
            accessibilityState={{ disabled }}
            className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <PenLine size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
            <Text className="text-button text-text-primary">{given ? "Sign again" : "Sign to approve"}</Text>
          </Pressable>
        </View>
      )}

      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
