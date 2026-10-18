import { Trash2 } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, Text } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useThemeColors } from "@/hooks/useTheme";
import type { ClientAddress } from "@/lib/api";
import { DELETE_CONFIRM_LABEL, deleteBody, deleteQuestion } from "@/lib/addressDeletion";
import { useAddressDeletion, type AddressListOwner } from "@/store/addressDeletion";

/**
 * The trash control at the end of a saved-address row. It only asks:
 * `AddressDeletion` on the same screen draws the question and runs the delete.
 */
export function DeleteAddressButton({
  owner,
  address,
  all,
  disabled,
}: {
  owner: AddressListOwner;
  address: ClientAddress;
  /** Every address on the list, so the result can say whether any are left. */
  all: ClientAddress[];
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const ask = useAddressDeletion((state) => state.ask);
  return (
    <Pressable
      onPress={() => ask(owner, address, all)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Delete ${address.label}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={4}
      className={disabled ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Trash2 size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}

/**
 * The confirmation, and one line saying what came of it. Placed where the
 * line should read — under the list it changed.
 */
export function AddressDeletion({ owner }: { owner: AddressListOwner }) {
  const mine = useAddressDeletion((state) => state.owner === owner);
  const phase = useAddressDeletion((state) => state.phase);
  const target = useAddressDeletion((state) => state.target);
  const error = useAddressDeletion((state) => state.error);
  const notice = useAddressDeletion((state) => state.notice);
  const cancel = useAddressDeletion((state) => state.cancel);
  const confirm = useAddressDeletion((state) => state.confirm);
  const clearNotice = useAddressDeletion((state) => state.clearNotice);

  // The line belongs to this visit; another screen must not open on it.
  useEffect(() => () => clearNotice(owner), [clearNotice, owner]);

  return (
    <>
      {mine && notice ? (
        <Text className="text-body text-text-secondary" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <ConfirmDialog
        visible={mine && phase !== "idle" && target !== null}
        question={target ? deleteQuestion(target) : ""}
        body={target ? `${deleteBody(target)}${error ? `\n\n${error}` : ""}` : ""}
        confirmLabel={phase === "deleting" ? "Deleting…" : DELETE_CONFIRM_LABEL}
        tone="destructive"
        busy={phase === "deleting"}
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />
    </>
  );
}
