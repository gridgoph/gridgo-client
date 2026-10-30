import { Info, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ArtworkColorsList } from "@/components/ArtworkColorsList";
import { ColorChip } from "@/components/ColorChip";
import { ColorTargetList } from "@/components/ColorTargetList";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  COLOR_LABEL_MAX,
  EMPTY_DRAFT,
  FORMAT_LABELS,
  MAX_COLOR_TARGETS,
  SCREEN_PRINT_NOTE,
  checkDraft,
  checkValue,
  draftFromTarget,
  spreadCmyk,
  swatchNote,
  targetInput,
  type ArtworkColorsEntry,
  type ColorDraft,
  type ColorTarget,
  type ColorTargetFormat,
} from "@/lib/colorTargets";
import { useColorTargets } from "@/store/colorTargets";

type Props = {
  lineId: string;
  targets: ColorTarget[];
  artworkColors: ArtworkColorsEntry[];
  fileName: (fileId: string) => string;
  /** Leave out the EXACT COLOURS heading where a fold above already names it. */
  showHeading?: boolean;
};

const FORMATS: ColorTargetFormat[] = ["pantone", "cmyk", "hex"];
const CMYK_KEYS = ["c", "m", "y", "k"] as const;

/**
 * Exact colours on the artwork step (gridgo-client#249): optional brand or
 * school colours, each a Pantone code, CMYK values or a hex value with a
 * label, saved to the item as they are added. Under them, the colours GRIDGO
 * read from each uploaded file, so the client can see whether the file says
 * what they asked for before anything is printed.
 *
 * Colours are a brief for the shop and never a gate: nothing here holds up
 * checkout.
 */
export function ExactColoursSection({
  lineId,
  targets,
  artworkColors,
  fileName,
  showHeading = true,
}: Props) {
  const colors = useThemeColors();
  const saving = useColorTargets((state) => state.saving[lineId] === true);
  const error = useColorTargets((state) => state.error[lineId] ?? null);
  const save = useColorTargets((state) => state.save);

  /** `new`, the index being changed, or null with the editor closed. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<ColorDraft>(EMPTY_DRAFT);
  const [tried, setTried] = useState(false);

  const open = (at: number | "new") => {
    setEditing(at);
    setDraft(at === "new" ? EMPTY_DRAFT : draftFromTarget(targets[at]));
    setTried(false);
    useColorTargets.getState().clearError(lineId);
  };
  const close = () => {
    setEditing(null);
    setTried(false);
  };

  const commit = async () => {
    setTried(true);
    const check = checkDraft(draft);
    if (!check.ok || editing === null) return;
    const list = targets.map(targetInput);
    if (editing === "new") list.push(check.input);
    else list[editing] = check.input;
    if (await save(lineId, list)) close();
  };

  const remove = (index: number) => {
    if (editing !== null) close();
    void save(lineId, targets.filter((_, at) => at !== index).map(targetInput));
  };

  const full = targets.length >= MAX_COLOR_TARGETS;

  return (
    <View className="gap-3">
      {showHeading ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-overline text-text-muted">EXACT COLOURS</Text>
          <View className="rounded-pill border border-outline px-2 py-0.5">
            <Text className="text-caption text-text-secondary">Optional</Text>
          </View>
        </View>
      ) : null}
      <Text className="text-body text-text-secondary">
        Name the brand or school colours the print must match: a Pantone code, CMYK values or a
        hex value.
      </Text>

      {targets.length ? (
        <View className="gg-card-flush px-4">
          <ColorTargetList
            targets={targets}
            artworkColors={artworkColors}
            fileName={fileName}
            onEdit={open}
            onRemove={remove}
            disabled={saving}
          />
        </View>
      ) : null}

      {editing !== null ? (
        <ColorEditor
          draft={draft}
          onChange={setDraft}
          tried={tried}
          saving={saving}
          isNew={editing === "new"}
          onSave={() => void commit()}
          onCancel={close}
        />
      ) : full ? (
        <Text className="text-caption text-text-muted">
          {MAX_COLOR_TARGETS} of {MAX_COLOR_TARGETS} colours named. Remove one to add another.
        </Text>
      ) : (
        <AddColourButton
          label={targets.length ? "Add another colour" : "Add a colour"}
          disabled={saving}
          onPress={() => open("new")}
        />
      )}

      {error ? (
        <Text accessibilityRole="alert" className="text-body text-error">
          {error}
        </Text>
      ) : null}

      <View className="flex-row items-start gap-2" accessible accessibilityLabel={SCREEN_PRINT_NOTE}>
        <View className="pt-0.5">
          <Info size={14} color={colors.info} strokeWidth={2} aria-hidden />
        </View>
        <Text className="min-w-0 flex-1 text-caption text-text-secondary">{SCREEN_PRINT_NOTE}</Text>
      </View>

      {artworkColors.length ? (
        <View className="mt-3 gap-3">
          <Text className="text-overline text-text-muted">COLOURS IN YOUR FILES</Text>
          <Text className="text-caption text-text-muted">
            What GRIDGO read from each file you uploaded. Design links are not read.
          </Text>
          <ArtworkColorsList entries={artworkColors} fileName={fileName} />
        </View>
      ) : null}
    </View>
  );
}

function AddColourButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={disabled ? "gg-btn-secondary gg-disabled flex-row gap-2" : "gg-btn-secondary flex-row gap-2"}
    >
      {({ pressed }) => (
        <>
          <Plus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <Text className="text-button text-text-primary">{label}</Text>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}

function ColorEditor({
  draft,
  onChange,
  tried,
  saving,
  isNew,
  onSave,
  onCancel,
}: {
  draft: ColorDraft;
  onChange: (draft: ColorDraft) => void;
  tried: boolean;
  saving: boolean;
  isNew: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  const check = checkDraft(draft);
  const value = checkValue(draft);
  // A field's problem is said once the client tries to save, or once it is
  // filled in wrongly; an empty box mid-way through is not an error yet.
  const problem = !check.ok && (tried || !check.incomplete) ? check : null;
  const errorFor = (field: string) => (problem && problem.field === field ? problem.message : null);

  return (
    <View className="gg-card gap-4 p-4">
      <Text className="text-h3 text-text-primary">{isNew ? "Add a colour" : "Change this colour"}</Text>

      <FormField label="Label" error={errorFor("label")} helper={`What it is for, such as Logo red. Up to ${COLOR_LABEL_MAX} characters.`}>
        <TextField
          value={draft.label}
          onChangeText={(label) => onChange({ ...draft, label })}
          placeholder="School maroon"
          accessibilityLabel="Colour label"
          maxLength={COLOR_LABEL_MAX}
          editable={!saving}
        />
      </FormField>

      <View className="gap-2">
        <Text className="text-caption text-text-muted">Colour as</Text>
        <View
          className="flex-row rounded-field border border-outline bg-surface-variant p-1"
          accessibilityRole="radiogroup"
          accessibilityLabel="Colour as"
        >
          {FORMATS.map((format) => {
            const selected = draft.format === format;
            return (
              <Pressable
                key={format}
                onPress={() => onChange({ ...draft, format })}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: saving }}
                accessibilityLabel={FORMAT_LABELS[format]}
                className={
                  selected
                    ? "h-11 flex-1 items-center justify-center rounded-sm border border-outline bg-surface-high"
                    : "h-11 flex-1 items-center justify-center rounded-sm"
                }
              >
                <Text className={selected ? "text-button text-text-primary" : "text-body text-text-muted"}>
                  {FORMAT_LABELS[format]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {draft.format === "pantone" ? (
        <>
          <FormField label="Pantone code" error={errorFor("pantone")} helper="Such as 185 C, 201C or 18-1663 TPX.">
            <TextField
              value={draft.pantone}
              onChangeText={(pantone) => onChange({ ...draft, pantone })}
              placeholder="201 C"
              accessibilityLabel="Pantone code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={80}
              editable={!saving}
            />
          </FormField>
          <FormField
            label="Approximate hex"
            optional
            error={errorFor("approximateHex")}
            helper="Adds a rough swatch on screen. GRIDGO does not convert Pantone codes, so without it the code shows as text."
          >
            <TextField
              value={draft.approximateHex}
              onChangeText={(approximateHex) => onChange({ ...draft, approximateHex })}
              placeholder="#9D2235"
              accessibilityLabel="Approximate hex"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              editable={!saving}
            />
          </FormField>
        </>
      ) : draft.format === "cmyk" ? (
        <FormField label="CMYK, whole percentages" error={errorFor("cmyk")} helper="Each from 0 to 100. Pasting 0/100/65/34 into one box fills all four.">
          <View className="flex-row gap-2">
            {CMYK_KEYS.map((key) => (
              <View key={key} className="min-w-0 flex-1 gap-1">
                <Text className="text-center text-caption font-medium text-text-secondary">{key.toUpperCase()}</Text>
                <TextInput
                  value={draft.cmyk[key]}
                  onChangeText={(text) => {
                    const spread = spreadCmyk(text);
                    onChange({ ...draft, cmyk: spread ?? { ...draft.cmyk, [key]: text } });
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={`${{ c: "Cyan", m: "Magenta", y: "Yellow", k: "Black" }[key]} percent`}
                  keyboardType="number-pad"
                  editable={!saving}
                  className="gg-field text-center text-body-lg text-text-primary"
                  style={{ paddingStart: 4, paddingEnd: 4, includeFontPadding: false, textAlignVertical: "center" }}
                />
              </View>
            ))}
          </View>
        </FormField>
      ) : (
        <FormField label="Hex" error={errorFor("hex")} helper="Six or three digits, such as #1A5FB4.">
          <TextField
            value={draft.hex}
            onChangeText={(hex) => onChange({ ...draft, hex })}
            placeholder="#1A5FB4"
            accessibilityLabel="Hex colour"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            editable={!saving}
          />
        </FormField>
      )}

      {/* What GRIDGO will keep, as it will write it. */}
      {value.ok ? (
        <View
          className="flex-row items-center gap-3 rounded-field bg-surface-variant p-3"
          accessible
          accessibilityLabel={`Saved as ${value.target.value}. ${swatchNote(value.target)}`}
        >
          <ColorChip target={value.target} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-caption text-text-muted">Saved as</Text>
            <Text className="text-body font-medium text-text-primary">{value.target.value}</Text>
            <Text className="text-caption text-text-muted">{swatchNote(value.target)}</Text>
          </View>
        </View>
      ) : null}

      <View className="gap-3">
        <SecondaryButton
          label={saving ? "Saving…" : isNew ? "Add colour" : "Save colour"}
          disabled={saving}
          onPress={onSave}
        />
        <Pressable
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
          className="h-11 items-center justify-center"
        >
          <Text className="text-button text-text-secondary">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
