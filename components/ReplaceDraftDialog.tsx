import { ConfirmDialog } from "@/components/ConfirmDialog";

type Props = {
  /** What the client asked to start. Null when nothing is pending. */
  label: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The one question asked before an in-progress request is overwritten.
 *
 * Worded identically wherever a new request can start, so a client learns the
 * answer once. Pairs with `useStartRequest`.
 */
export function ReplaceDraftDialog({ label, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      visible={label != null}
      question={`Replace your draft request with "${label ?? ""}"?`}
      body="You have a request in progress. Starting this one replaces it, including any artwork you have already uploaded to the draft."
      confirmLabel="Replace the draft"
      cancelLabel="Keep my draft"
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
