import {
  Check,
  CircleAlert,
  FileCheck2,
  FilePlus2,
  FileWarning,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  DOCUMENTS,
  sentBackKeys,
  type ChecklistItem,
  type SentBack,
  type SentBackDocument,
  type UploadedDocument,
} from "@/lib/clientApplication";
import type { DocumentUpload } from "@/store/clientApplication";

/** One step: what it is asking, why, then the controls that answer it. */
export function StepShell({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          {heading}
        </Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
      {children}
    </View>
  );
}

/** A choice between a few answers, each with the line that tells them apart. */
export function ChoiceCard({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      className={
        selected
          ? "gg-touch flex-row items-center gap-3 rounded-card border border-accent bg-surface-high p-4"
          : "gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className={
          selected
            ? "h-5 w-5 items-center justify-center rounded-pill border-2 border-accent"
            : "h-5 w-5 items-center justify-center rounded-pill border-2 border-outline"
        }
      >
        {selected ? <View className="h-2.5 w-2.5 rounded-pill bg-accent" /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary">{label}</Text>
        {hint ? <Text className="text-caption text-text-secondary">{hint}</Text> : null}
      </View>
      {selected ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
    </Pressable>
  );
}

/** A small pill choice, for short answers that fit on one row (an ID type). */
export function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={
        selected
          ? "min-h-11 justify-center rounded-pill border border-accent bg-accent px-4"
          : "min-h-11 justify-center rounded-pill border border-outline bg-surface px-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className={selected ? "text-body font-medium text-accent-on" : "text-body text-text-primary"}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A statement the client confirms by ticking it. */
export function CheckRow({
  label,
  hint,
  checked,
  onPress,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="gg-touch flex-row items-start gap-3 py-1"
    >
      <View
        className={
          checked
            ? "mt-0.5 h-6 w-6 items-center justify-center rounded-sm bg-accent"
            : "mt-0.5 h-6 w-6 items-center justify-center rounded-sm border border-outline bg-surface"
        }
      >
        {checked ? <Check size={16} color={colors.accentOn} strokeWidth={2.5} /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body text-text-primary">{label}</Text>
        {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Who can see the documents, said once above the checklist. */
export function PrivacyNote({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-panel flex-row items-start gap-3">
      <LockKeyhole size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <Text className="min-w-0 flex-1 text-caption text-text-secondary">{children}</Text>
    </View>
  );
}

/** "2 of 3 required documents added", with a thin meter. */
export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  const fraction = total ? Math.min(1, done / total) : 1;
  return (
    <View className="gap-2" accessible accessibilityLabel={`${done} of ${total} required documents added`}>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-body font-medium text-text-primary">
          {done} of {total} required added
        </Text>
        {done >= total ? <Text className="text-caption text-success">Ready</Text> : null}
      </View>
      <View className="h-1.5 overflow-hidden rounded-pill bg-surface-variant">
        <View
          className={done >= total ? "h-full rounded-pill bg-success" : "h-full rounded-pill bg-accent"}
          style={{ width: `${fraction * 100}%` }}
        />
      </View>
    </View>
  );
}

/**
 * Operations sent the application back (gridgo-client#187). Says so in plain
 * words, lists the documents they asked for again with what they said about
 * each, and says the rest is kept — the client is correcting, not starting over.
 * Without named documents, Operations' own words are the whole message.
 */
export function SentBackCard({ sentBack }: { sentBack: SentBack }) {
  const keys = sentBackKeys(sentBack);
  return (
    <View className="gg-card gap-3" testID="sent-back-card">
      <StatusChip tone="error" label="Not approved" icon="circle-x" />
      <Text className="text-body-lg font-medium text-text-primary">
        {keys.length
          ? `Operations asked for ${keys.length === 1 ? "one document" : `${keys.length} documents`} again`
          : "Operations sent your application back"}
      </Text>
      {keys.length ? (
        <View className="gap-2">
          {keys.map((key) => (
            <View key={key} className="flex-row gap-2">
              <Text className="text-body text-text-primary" aria-hidden>
                •
              </Text>
              <Text className="min-w-0 flex-1 text-body text-text-primary">
                <Text className="font-medium">{DOCUMENTS[key].label}</Text>
                {sentBack.documents[key]?.note ? `: ${sentBack.documents[key]?.note}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-body text-text-primary">
          {sentBack.reason ? `Operations said: ${sentBack.reason}` : "Operations did not approve the last application."}
        </Text>
      )}
      <Text className="text-caption text-text-muted">
        {keys.length
          ? `Everything else you sent is kept and filled in. Upload ${keys.length === 1 ? "that one" : "those"} again, then send the application.`
          : "Everything you sent is filled in. Fix what they asked for, then send the application again."}
      </Text>
    </View>
  );
}

/**
 * One document on the checklist: what it is, whether it has arrived, and the
 * one thing to do about it. The state is said in words beside its icon, so
 * nothing depends on colour.
 */
export function DocumentRow({
  item,
  uploaded,
  upload,
  missing,
  sentBack = null,
  onAdd,
  onRemove,
}: {
  item: ChecklistItem;
  uploaded: UploadedDocument | undefined;
  upload: DocumentUpload | undefined;
  /** True once Continue was pressed with this one still missing. */
  missing: boolean;
  /** Operations asked for this one again. */
  sentBack?: SentBackDocument | null;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const sending = upload?.phase === "sending";
  const failed = upload?.phase === "failed";
  // Sent back and not yet replaced: the one row on the list that needs the client.
  const redo = Boolean(sentBack) && !uploaded && !sending;
  const status = sending
    ? upload.progress != null && upload.progress > 0
      ? `Uploading ${Math.round(upload.progress * 100)}%`
      : "Uploading…"
    : uploaded
      ? uploaded.kept
        ? "Kept"
        : sentBack
          ? "Replaced"
          : "Added"
      : redo
        ? "Sent back"
        : failed
          ? "Not added"
          : item.required
            ? "Required"
            : "Optional";

  const Icon = sending ? LoaderCircle : uploaded ? FileCheck2 : redo ? FileWarning : failed ? CircleAlert : FilePlus2;
  const iconColor = uploaded
    ? colors.success
    : redo || failed || (missing && !sending)
      ? colors.error
      : colors.textMuted;
  const fileLine = uploaded
    ? uploaded.kept
      ? `${uploaded.name} · sent before`
      : sentBack
        ? `${uploaded.name} · new file`
        : uploaded.name
    : upload?.name ?? (redo && sentBack?.previousName ? `Sent before: ${sentBack.previousName}` : null);

  return (
    <View
      className={
        (missing || redo) && !uploaded && !sending
          ? "gap-3 rounded-card border border-error bg-surface p-4"
          : "gap-3 rounded-card border border-outline bg-surface p-4"
      }
      testID={`document-${item.key}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5">
          <Icon size={20} color={iconColor} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-baseline justify-between gap-x-2">
            <Text className="text-body-lg font-medium text-text-primary">{item.label}</Text>
            <Text
              className={
                uploaded
                  ? "text-caption font-medium text-success"
                  : redo || failed || (missing && !sending)
                    ? "text-caption font-medium text-error"
                    : "text-caption text-text-muted"
              }
            >
              {status}
            </Text>
          </View>
          {sentBack ? (
            <Text className={redo ? "text-body text-text-primary" : "text-caption text-text-secondary"}>
              {sentBack.note ? `Operations: ${sentBack.note}` : "Operations asked for this one again."}
            </Text>
          ) : null}
          <Text className="text-caption text-text-secondary">{item.hint}</Text>
          {fileLine ? (
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {fileLine}
            </Text>
          ) : null}
          {failed ? <Text className="text-caption text-error">{upload.error}</Text> : null}
        </View>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          onPress={onAdd}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={
            uploaded ? `Replace ${item.label}` : redo ? `Upload ${item.label} again` : `Add ${item.label}`
          }
          className={sending ? "gg-btn-secondary gg-disabled min-h-11 flex-1" : "gg-btn-secondary min-h-11 flex-1"}
          style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
        >
          <Text className="text-button text-text-primary">
            {uploaded ? "Replace" : failed ? "Try again" : redo ? "Upload again" : "Add file"}
          </Text>
        </Pressable>
        {uploaded || sending ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={sending ? `Stop uploading ${item.label}` : `Remove ${item.label}`}
            className="gg-btn-secondary min-h-11 px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-button text-text-primary">{sending ? "Stop" : "Remove"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-caption text-text-muted">{label}</Text>
      <Text className="text-body-lg text-text-primary">{value}</Text>
    </View>
  );
}

/** A titled block on Review, with the way back to the step that answers it. */
export function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-h3 text-text-primary">{title}</Text>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Change ${title.toLowerCase()}`}
            className="gg-touch justify-center px-2"
          >
            <Text className="text-button text-text-primary underline">Change</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
