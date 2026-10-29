import {
  ArrowDown,
  ArrowUp,
  Box,
  CircleAlert,
  CircleCheck,
  FileImage,
  FileText,
  FolderOpen,
  HardDrive,
  Link2,
  LoaderCircle,
  Palette,
  PenTool,
  Plus,
  Send,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ArtworkFileGuidance } from "@/components/ArtworkFileGuidance";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { AcceptedFiles, ProgressBar } from "@/components/ArtworkUploadCard";
import { useThemeColors } from "@/hooks/useTheme";
import type { AcceptedFormat, ArtworkAttachment, ArtworkGuidance, StoredFile } from "@/lib/api";
import {
  ATTACHMENT_LABEL_MAX,
  MAX_ARTWORK_ATTACHMENTS,
  attachmentCountLabel,
  attachmentKey,
  attachmentLimitLine,
  cleanLabel,
} from "@/lib/artworkAttachments";
import { fileGuidance } from "@/lib/artworkGuidance";
import { ARTWORK_ACCEPTED, ARTWORK_MAX_MIB, artworkCheckFailure, isWordDocument } from "@/lib/artworkUpload";
import {
  checkKey,
  linkDisplay,
  linkLabel,
  linkVerdict,
  providerOf,
  type LinkCheckState,
  type LinkProvider,
} from "@/lib/designLink";
import { uploadLimitLine } from "@/lib/listing";
import { SAVE_TO_MY_FILES_HINT, SAVE_TO_MY_FILES_LABEL, canSaveToMyFiles } from "@/lib/myFiles";
import { formatBytes } from "@/lib/requestValidation";
import type { PendingUpload } from "@/store/artworkAttachments";

const PROVIDER_ICONS: Record<LinkProvider, LucideIcon> = {
  canva: Palette,
  google_drive: HardDrive,
  dropbox: Box,
  we_transfer: Send,
  figma: PenTool,
  other: Link2,
};

type Props = {
  entries: ArtworkAttachment[];
  uploads: PendingUpload[];
  /** Each file's storage record; null when it could not be read, absent while reading. */
  files: Record<string, StoredFile | null>;
  linkChecks: Record<string, LinkCheckState>;
  /** Whether the item takes uploads at all (not one that takes links only). */
  takesFiles: boolean;
  /** The file types this listing names; empty where it names none. */
  formats: AcceptedFormat[];
  /** The Word note for this product, beside the accepted types. */
  wordNote: string | null;
  /** Whether this GRIDGO keeps labels and an order (gridgo-api#243). */
  ordered: boolean;
  /** A change to the list is on its way to GRIDGO. */
  saving: boolean;
  saveError: string | null;
  notice: string | null;
  onPick: () => void;
  onRemove: (entryKey: string) => void;
  onMove: (entryKey: string, by: -1 | 1) => void;
  onRelabel: (entryKey: string, label: string) => void;
  onRecheck: (entry: Extract<ArtworkAttachment, { kind: "link" }>) => void;
  onRetryUpload: (uploadKey: string) => void;
  onDismissUpload: (uploadKey: string) => void;
  /** GRIDGO's resolution and colour check of each file, at the size ordered. */
  guidance?: ArtworkGuidance | null;
  /** `fileId:code` of the warning whose answer is being saved. */
  accepting?: string | null;
  acceptError?: string | null;
  onAcceptWarning?: (fileId: string, code: string, accept: boolean) => void;
  onReplaceFile?: (fileId: string) => void;
  /**
   * "Save to My files" on each of the client's own files (gridgo-client#334).
   * Absent where the screen does not offer it.
   */
  myFiles?: SaveChoices;
  /** Opens My files to add a file saved there, with no upload. */
  onChooseSaved?: () => void;
};

/** The "Save to My files" ticks: each choice on its way, and each refusal. */
export type SaveChoices = {
  pending: Record<string, boolean>;
  errors: Record<string, string | null>;
  onToggle: (fileId: string, saved: boolean) => void;
};

/**
 * Everything on one item, in order: the files and design links GRIDGO holds,
 * then the uploads still on their way, then the way to add more.
 *
 * Order is the one thing in this list that means something beyond itself —
 * the first file is the main file, which GRIDGO prices pages from and draws
 * the preview from — so each row says its place to a screen reader and moves
 * with two plain buttons rather than a drag nobody can find. The meter in the
 * heading is the limit: ten cells, one per file or link the item can take, so
 * "how many more" is answered before anyone reads a sentence.
 */
export function ArtworkAttachmentList({
  entries,
  uploads,
  files,
  linkChecks,
  takesFiles,
  formats,
  wordNote,
  ordered,
  saving,
  saveError,
  notice,
  onPick,
  onRemove,
  onMove,
  onRelabel,
  onRecheck,
  onRetryUpload,
  onDismissUpload,
  guidance = null,
  accepting = null,
  acceptError = null,
  onAcceptWarning,
  onReplaceFile,
  myFiles,
  onChooseSaved,
}: Props) {
  const colors = useThemeColors();
  const inFlight = uploads.filter((upload) => upload.phase !== "failed").length;
  const used = entries.length + inFlight;
  const full = used >= MAX_ARTWORK_ATTACHMENTS;
  const empty = entries.length === 0 && uploads.length === 0;
  const fileCount = entries.filter((entry) => entry.kind === "file").length;
  const mainKey = entries.find((entry) => entry.kind === "file");
  const acceptLine = formats.length ? uploadLimitLine(formats) : `${ARTWORK_ACCEPTED}, up to ${ARTWORK_MAX_MIB} MB`;

  return (
    <View className="gg-card-flush">
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-4">
        <Text className="text-h3 text-text-primary">Files and links</Text>
        <SlotMeter used={entries.length} pending={inFlight} />
      </View>

      {entries.map((entry, index) => (
        <AttachmentRow
          key={attachmentKey(entry)}
          entry={entry}
          index={index}
          count={entries.length}
          main={fileCount > 1 && entry === mainKey}
          file={entry.kind === "file" ? files[entry.fileId] : undefined}
          check={entry.kind === "link" ? linkChecks[checkKey(entry)] : undefined}
          ordered={ordered}
          disabled={saving}
          canUpload={takesFiles}
          onRemove={onRemove}
          onMove={onMove}
          onRelabel={onRelabel}
          onRecheck={onRecheck}
          save={entry.kind === "file" && myFiles ? <SaveTick file={files[entry.fileId]} choices={myFiles} /> : null}
          guidance={
            entry.kind === "file" && guidance ? (
              <FileGuidanceSlot
                guidance={guidance}
                fileId={entry.fileId}
                accepting={accepting}
                disabled={saving || accepting != null}
                onAccept={onAcceptWarning}
                onReplace={takesFiles && onReplaceFile ? () => onReplaceFile(entry.fileId) : undefined}
              />
            ) : null
          }
        />
      ))}

      {acceptError ? (
        <View className="flex-row items-start gap-2 border-t border-outline-subtle px-4 py-3" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
          </View>
          <Text className="min-w-0 flex-1 text-body text-error">{acceptError}</Text>
        </View>
      ) : null}

      {uploads.map((upload) => (
        <UploadRow
          key={upload.key}
          upload={upload}
          onRetry={() => onRetryUpload(upload.key)}
          onDismiss={() => onDismissUpload(upload.key)}
        />
      ))}

      {saveError ? (
        <View className="flex-row items-start gap-2 border-t border-outline-subtle px-4 py-3" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
          </View>
          <Text className="min-w-0 flex-1 text-body text-error">{saveError}</Text>
        </View>
      ) : null}

      {fileCount > 1 && ordered ? (
        <Text className="border-t border-outline-subtle px-4 py-3 text-caption text-text-secondary">
          GRIDGO counts pages and draws the preview from the main file, the first file in the list.
          Move another file up to make it the main file.
        </Text>
      ) : null}

      <View className={empty ? "gap-4 p-4" : "gap-3 border-t border-outline-subtle p-4"}>
        {empty && takesFiles ? (
          formats.length ? (
            <AcceptedFiles formats={formats} note={wordNote} />
          ) : (
            <Text className="text-body text-text-secondary">
              Send the files you want printed — {ARTWORK_ACCEPTED}, up to {ARTWORK_MAX_MIB} MB each.
            </Text>
          )
        ) : null}
        {takesFiles ? (
          <Pressable
            onPress={onPick}
            disabled={full}
            accessibilityRole="button"
            accessibilityLabel={empty ? "Choose files" : "Add more files"}
            accessibilityHint={`${acceptLine}. ${wordNote ? `${wordNote} ` : ""}${attachmentLimitLine(used)}`}
            accessibilityState={{ disabled: full }}
            className={
              empty
                ? "flex-row items-center justify-center gap-2 rounded-field bg-action-yellow px-4 py-3"
                : full
                  ? "gg-disabled flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface-variant px-4 py-3"
                  : "flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface-variant px-4 py-3"
            }
            style={({ pressed }) => (pressed && !full ? { opacity: 0.9 } : undefined)}
          >
            {empty ? (
              <Upload size={16} color={colors.actionYellowOn} strokeWidth={2.5} aria-hidden />
            ) : (
              <Plus size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
            )}
            <Text className={empty ? "text-button text-action-yellow-on" : "text-button text-text-primary"}>
              {empty ? "Choose files" : "Add more files"}
            </Text>
          </Pressable>
        ) : null}
        {takesFiles && onChooseSaved ? (
          <Pressable
            onPress={onChooseSaved}
            disabled={full}
            accessibilityRole="button"
            accessibilityLabel="Choose from My files"
            accessibilityHint="Adds a file you saved before, without uploading it again"
            accessibilityState={{ disabled: full }}
            className={
              full
                ? "gg-disabled min-h-11 flex-row items-center justify-center gap-2 px-4"
                : "min-h-11 flex-row items-center justify-center gap-2 px-4"
            }
            style={({ pressed }) => (pressed && !full ? { opacity: 0.7 } : undefined)}
          >
            <FolderOpen size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="text-button text-text-primary underline">Choose from My files</Text>
          </Pressable>
        ) : null}
        {notice ? (
          <Text className="text-body text-warning" accessibilityRole="alert">
            {notice}
          </Text>
        ) : null}
        <Text className={full ? "text-caption text-text-secondary" : "text-caption text-text-muted"}>
          {attachmentLimitLine(used)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Ten cells, one per place on the item. Filled is on the item, faint is on its
 * way; the count beside it says the same in numbers.
 */
function SlotMeter({ used, pending }: { used: number; pending: number }) {
  const total = used + pending;
  return (
    <View
      className="flex-row items-center gap-2"
      accessible
      accessibilityRole="text"
      accessibilityLabel={attachmentCountLabel(total)}
    >
      <View className="flex-row gap-1" aria-hidden>
        {Array.from({ length: MAX_ARTWORK_ATTACHMENTS }, (_, index) => (
          <View
            key={index}
            className={index < total ? "h-3.5 w-1.5 rounded-pill bg-accent" : "h-3.5 w-1.5 rounded-pill bg-outline"}
            // A cell for an upload still in flight: the same ink, not yet solid.
            style={index >= used && index < total ? { opacity: 0.35 } : undefined}
          />
        ))}
      </View>
      <Text className="text-caption font-medium text-text-secondary" aria-hidden>
        {total} of {MAX_ARTWORK_ATTACHMENTS}
      </Text>
    </View>
  );
}

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  const colors = useThemeColors();
  return (
    <View aria-hidden className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant">
      <Icon size={20} color={colors.textPrimary} strokeWidth={2} />
    </View>
  );
}

function fileDetail(file: StoredFile | null | undefined): string | null {
  if (!file) return null;
  const mime = file.detectedContentType.toLowerCase();
  const type =
    mime === "application/pdf"
      ? "PDF"
      : mime === "image/vnd.adobe.photoshop"
        ? "Photoshop file"
        : isWordDocument(mime)
          ? "Word document"
          : mime.split("/")[1]?.toUpperCase() || "File";
  return `${type} · ${formatBytes(file.size)}`;
}

type StatusTone = "success" | "error" | "muted";

/** One line of status, always a mark and words — never colour alone. */
function Status({
  tone,
  title,
  body,
  busy,
  action,
}: {
  tone: StatusTone;
  title: string;
  body?: string | null;
  busy?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useThemeColors();
  const Icon = busy ? LoaderCircle : tone === "success" ? CircleCheck : tone === "error" ? CircleAlert : CircleCheck;
  const color = tone === "success" ? colors.success : tone === "error" ? colors.error : colors.textMuted;
  return (
    <View className="gap-1">
      <View
        className="flex-row items-start gap-2"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={[title, body].filter(Boolean).join(" ")}
      >
        <View className="pt-0.5">
          <Icon size={16} color={color} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={tone === "error" ? "text-body font-medium text-text-primary" : "text-body text-text-secondary"}>
            {title}
          </Text>
          {body ? <Text className="text-caption text-text-secondary">{body}</Text> : null}
        </View>
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="ms-6 min-h-11 justify-center self-start"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-body font-medium text-text-primary underline">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AttachmentRow({
  entry,
  index,
  count,
  main,
  file,
  check,
  ordered,
  disabled,
  canUpload,
  onRemove,
  onMove,
  onRelabel,
  onRecheck,
  save,
  guidance,
}: {
  entry: ArtworkAttachment;
  index: number;
  count: number;
  main: boolean;
  file: StoredFile | null | undefined;
  check: LinkCheckState | undefined;
  ordered: boolean;
  disabled: boolean;
  canUpload: boolean;
  onRemove: (entryKey: string) => void;
  onMove: (entryKey: string, by: -1 | 1) => void;
  onRelabel: (entryKey: string, label: string) => void;
  onRecheck: (entry: Extract<ArtworkAttachment, { kind: "link" }>) => void;
  /** "Save to My files", under the file's status. */
  save?: ReactNode;
  /** This file's resolution and colour check, drawn under its status. */
  guidance?: ReactNode;
}) {
  const key = attachmentKey(entry);
  const isFile = entry.kind === "file";
  const image = isFile && file ? file.detectedContentType.startsWith("image/") : false;
  const icon = isFile ? (image ? FileImage : FileText) : PROVIDER_ICONS[providerOf(entry.url)];
  const title = isFile ? file?.originalFilename || (file === null ? "Artwork file" : "Reading file…") : linkLabel(entry);
  const detail = isFile ? fileDetail(file) : linkDisplay(entry.url);
  const place = `${index + 1} of ${count}`;

  let status: ReactNode;
  if (isFile) {
    const failure = file ? artworkCheckFailure(file.artworkCheck) : null;
    status = failure ? (
      <Status tone="error" title="GRIDGO cannot print from this file" body={failure} />
    ) : file?.artworkCheck?.status === "passed" ? (
      <Status tone="success" title="Uploaded and checked" />
    ) : file === undefined ? null : (
      <Status tone="muted" title="Saved with this item" />
    );
  } else {
    const verdict = linkVerdict(check, { canUpload });
    status =
      check?.phase === "checking" ? (
        <Status tone="muted" busy title="Checking who can open this link…" />
      ) : verdict ? (
        <Status
          tone={verdict.tone === "success" ? "success" : "error"}
          title={verdict.title}
          body={verdict.blocks ? verdict.body : null}
          action={verdict.blocks ? { label: "Check again", onPress: () => onRecheck(entry) } : undefined}
        />
      ) : (
        <Status tone="muted" title="Saved with this item" action={{ label: "Check link", onPress: () => onRecheck(entry) }} />
      );
  }

  const name = cleanLabel(entry.label) ?? title;
  return (
    <View
      className="gap-3 border-t border-outline-subtle px-4 py-4"
      accessibilityLabel={`${name}, ${place}`}
    >
      <View className="flex-row items-start gap-3">
        <Tile icon={icon} />
        <View className="min-w-0 flex-1 gap-0.5 pt-0.5">
          <Text className="text-body-lg text-text-primary" numberOfLines={2}>
            {title}
          </Text>
          {detail ? (
            <Text className="text-caption text-text-muted" numberOfLines={1} ellipsizeMode="middle">
              {detail}
            </Text>
          ) : null}
          {main ? <Text className="text-caption font-medium text-text-primary">Main file</Text> : null}
        </View>
        <IconButton icon={Trash2} label={`Remove ${name}`} disabled={disabled} onPress={() => onRemove(key)} quiet />
      </View>

      {status}

      {save}

      {guidance}

      {/*
        The label and the two moves share a line: both are about this row's
        place in the list, and ten rows of three lines each was a long scroll.
      */}
      {ordered ? (
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <LabelField
              key={entry.label ?? ""}
              value={entry.label ?? ""}
              name={title}
              example={isFile ? "Front" : "Logo"}
              disabled={disabled}
              onCommit={(label) => {
                if (cleanLabel(label) !== cleanLabel(entry.label)) onRelabel(key, label);
              }}
            />
          </View>
          {count > 1 ? (
            <>
              <IconButton
                icon={ArrowUp}
                label={`Move ${name} up`}
                disabled={disabled || index === 0}
                onPress={() => onMove(key, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Move ${name} down`}
                disabled={disabled || index === count - 1}
                onPress={() => onMove(key, 1)}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Save to My files" for one file. Off until the client ticks it; the box shows
 * the choice while it travels and GRIDGO's answer after, so a refusal (a full
 * library, a dropped connection) leaves it as GRIDGO holds it, with the reason.
 */
function SaveTick({ file, choices }: { file: StoredFile | null | undefined; choices: SaveChoices }) {
  const colors = useThemeColors();
  if (!canSaveToMyFiles(file)) return null;
  const pending = choices.pending[file.fileId];
  const checked = pending ?? file.savedAt != null;
  const error = choices.errors[file.fileId] ?? null;
  return (
    <View className="gap-1">
      <CheckboxRow
        checked={checked}
        disabled={pending !== undefined}
        onChange={(next) => choices.onToggle(file.fileId, next)}
        label={SAVE_TO_MY_FILES_LABEL}
        hint={pending === undefined ? SAVE_TO_MY_FILES_HINT : pending ? "Saving to My files…" : "Taking it out of My files…"}
      />
      {error ? (
        <View className="flex-row items-start gap-2" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
          </View>
          <Text className="min-w-0 flex-1 text-body text-error">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FileGuidanceSlot({
  guidance,
  fileId,
  accepting,
  disabled,
  onAccept,
  onReplace,
}: {
  guidance: ArtworkGuidance;
  fileId: string;
  accepting: string | null;
  disabled: boolean;
  onAccept?: (fileId: string, code: string, accept: boolean) => void;
  onReplace?: () => void;
}) {
  const file = fileGuidance(guidance, fileId);
  if (!file) return null;
  return (
    <ArtworkFileGuidance
      file={file}
      guidance={guidance}
      accepting={accepting}
      disabled={disabled || !onAccept}
      onAccept={(code, accept) => onAccept?.(fileId, code, accept)}
      onReplace={onReplace}
    />
  );
}

/**
 * The optional label, saved when the field is left. Typed text stays local
 * until then, so one label is one write, not one per keystroke.
 */
function LabelField({
  value,
  name,
  example,
  disabled,
  onCommit,
}: {
  value: string;
  name: string;
  example: string;
  disabled: boolean;
  onCommit: (label: string) => void;
}) {
  const colors = useThemeColors();
  // Keyed on the saved label by its row, so GRIDGO's answer replaces the draft.
  const [draft, setDraft] = useState(value);
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={(event) => onCommit(event.nativeEvent.text ?? draft)}
      onBlur={() => onCommit(draft)}
      editable={!disabled}
      maxLength={ATTACHMENT_LABEL_MAX}
      placeholder={`Add a label, e.g. ${example}`}
      placeholderTextColor={colors.textMuted}
      accessibilityLabel={`Label for ${name}`}
      accessibilityHint="Optional. For example Front, Back or Logo PDF."
      returnKeyType="done"
      className="gg-field text-body text-text-primary"
      style={{ paddingStart: 16, paddingEnd: 16, includeFontPadding: false }}
    />
  );
}

function IconButton({
  icon: Icon,
  label,
  disabled,
  onPress,
  quiet,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onPress: () => void;
  /** No box: a row's remove sits beside its name, not among the controls. */
  quiet?: boolean;
}) {
  const colors = useThemeColors();
  const box = quiet
    ? "h-11 w-11 items-center justify-center rounded-field"
    : "h-12 w-11 items-center justify-center rounded-field border border-outline bg-surface";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={disabled ? `gg-disabled ${box}` : box}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
    >
      <Icon size={18} color={quiet ? colors.textSecondary : colors.textPrimary} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}

function RemoveButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-disabled min-h-11 flex-row items-center gap-2 px-2" : "min-h-11 flex-row items-center gap-2 px-2"}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
    >
      <Trash2 size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <Text className="text-body font-medium text-text-primary">Remove</Text>
    </Pressable>
  );
}

function UploadRow({
  upload,
  onRetry,
  onDismiss,
}: {
  upload: PendingUpload;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = upload.phase === "failed";
  const percent = upload.progress == null ? null : Math.round(upload.progress * 100);
  const line =
    upload.phase === "sending"
      ? percent == null
        ? "Uploading…"
        : `Uploading — ${percent}%`
      : upload.phase === "saving"
        ? "Sent. GRIDGO is still saving it — keep this screen open."
        : upload.phase === "attaching"
          ? "Saved. Adding it to this item…"
          : null;
  // The same bytes would meet the same refusal: only a different file helps.
  const retryable = failed && !upload.refusal;
  return (
    <View className="gap-3 border-t border-outline-subtle px-4 py-4" accessibilityLabel={`${upload.fileName}, ${line ?? "not added"}`}>
      <View className="flex-row items-start gap-3">
        <Tile icon={Upload} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg text-text-primary" numberOfLines={2}>
            {upload.fileName || "Your file"}
          </Text>
          {line ? (
            <Text className="text-caption text-text-secondary" accessibilityLiveRegion="polite">
              {line}
            </Text>
          ) : null}
        </View>
      </View>
      {upload.phase === "sending" ? <ProgressBar fraction={upload.progress} /> : null}
      {failed ? <Status tone="error" title="Not added to this item" body={upload.error} /> : null}
      <View className="flex-row items-center justify-end gap-2">
        {retryable ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Try ${upload.fileName} again`}
            className="min-h-11 justify-center px-2"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-body font-medium text-text-primary underline">Try again</Text>
          </Pressable>
        ) : null}
        {failed ? (
          <RemoveButton label={`Remove ${upload.fileName}`} onPress={onDismiss} />
        ) : upload.phase === "sending" ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={`Cancel uploading ${upload.fileName}`}
            className="min-h-11 justify-center px-2"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-body font-medium text-text-primary">Cancel upload</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
