import { Check, CircleCheck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { BookPreview } from "@/components/BookPreview";
import { FormField } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { CartLineRecord, CoverChoice, StoredFile } from "@/lib/api";
import { lineAttachments } from "@/lib/artworkAttachments";
import type { ArtworkFormatCheck } from "@/lib/artworkUpload";
import {
  COVER_CHOICES,
  MONTH_NAMES,
  SPINE_LIMITS,
  coverFileOnItem,
  coverSpineDirty,
  coverSpineProblem,
  spineFieldError,
  spineLines,
} from "@/lib/coverSpine";
import { coverSpineDraftOf, useCoverSpine } from "@/store/coverSpine";

type Props = {
  line: CartLineRecord;
  /** Each file's storage record, for the cover page's name. */
  files: Record<string, StoredFile | null>;
  /** The picker filter the item's other files use. */
  guard?: ArtworkFormatCheck & { accept: string[] };
  /** No room left on the item for one more file. */
  full: boolean;
};

const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name }));

/**
 * How a hardbound book's cover is made and what its spine says
 * (gridgo-client#247), on the item's Artwork.
 *
 * Three covers, then the spine's four lines with the book drawn beside them
 * as the client types. The shop sizes the cover and the spine to the page
 * count, so nothing here asks for a measurement.
 *
 * Saving is a quiet button: the screen's one yellow stays on "Go to
 * checkout", which also saves a finished form on the way out.
 */
export function CoverSpineSection({ line, files, guard, full }: Props) {
  const colors = useThemeColors();
  const typed = useCoverSpine((state) => state.drafts[line.id]);
  const draft = typed ?? coverSpineDraftOf({}, line);
  const attempted = useCoverSpine((state) => state.attempted[line.id] === true);
  const saving = useCoverSpine((state) => state.saving[line.id] === true);
  const saveError = useCoverSpine((state) => state.saveError[line.id] ?? null);
  const uploading = useCoverSpine((state) => state.uploading[line.id] === true);
  const { edit, save, uploadCover } = useCoverSpine.getState();

  const entries = lineAttachments(line);
  // A cover page goes after the book's own file, never in place of it: the
  // first file is the one GRIDGO prices pages from.
  const hasBookFile = entries.some((entry) => entry.kind === "file");
  const coverFileId = coverFileOnItem(entries, draft.coverFileId, line.coverSpine);
  const shown = { ...draft, coverFileId };
  const coverFileName = coverFileId ? files[coverFileId]?.originalFilename ?? "Your cover page" : null;
  const dirty = coverSpineDirty(shown, line.coverSpine);
  const held = line.coverSpine?.status === "given";
  const problem = coverSpineProblem(shown);
  const required = line.coverSpineRequired === true;
  const fieldError = (field: Parameters<typeof spineFieldError>[0]) =>
    spineFieldError(field, shown, { showRequired: attempted });

  const choose = (cover: CoverChoice) => {
    if (cover === draft.cover) return;
    edit(line.id, { cover, coverFileId: cover === "separate_file" ? coverFileId : null });
  };

  return (
    <View className="gap-4">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-overline text-text-muted">COVER AND SPINE</Text>
          <View className="rounded-pill border border-outline px-2 py-0.5">
            <Text className="text-caption text-text-secondary">{required ? "Needed to order" : "Optional"}</Text>
          </View>
        </View>
        <Text className="text-caption text-text-muted">
          How the cover is made and what is lettered on the spine. The shop sizes both to your book.
        </Text>
      </View>

      <View className="gg-card-flush" accessibilityRole="radiogroup" accessibilityLabel="Cover">
        {COVER_CHOICES.map((choice, index) => {
          const chosen = draft.cover === choice.code;
          return (
            <View key={choice.code} className={index === 0 ? undefined : "border-t border-outline-subtle"}>
              <Pressable
                onPress={() => choose(choice.code)}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen, disabled: saving }}
                accessibilityLabel={`${choice.label}. ${choice.hint}`}
                className="gg-touch flex-row items-center gap-3 px-4 py-3"
              >
                {({ pressed }) => (
                  <>
                    <Marker selected={chosen} />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-text-primary">{choice.label}</Text>
                      <Text className="text-caption text-text-muted">{choice.hint}</Text>
                    </View>
                    {pressed && !saving ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
                  </>
                )}
              </Pressable>
              {chosen && choice.code === "separate_file" ? (
                <View className="gap-3 px-4 pb-4">
                  {coverFileId ? (
                    <View className="flex-row items-center gap-2" accessible accessibilityLabel={`Cover page: ${coverFileName}`}>
                      <CircleCheck size={16} color={colors.success} strokeWidth={2} aria-hidden />
                      <Text className="min-w-0 flex-1 text-body text-text-primary" numberOfLines={1}>
                        {coverFileName}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text className="text-caption text-text-secondary">
                        {!hasBookFile
                          ? "Add your book's file above first, then its cover page."
                          : full
                            ? "This item has no room for another file. Remove one above to add the cover page."
                            : "It goes onto this item labelled Cover, after your book's file."}
                      </Text>
                      <SecondaryButton
                        label={uploading ? "Uploading the cover page…" : "Upload cover page"}
                        disabled={!hasBookFile || full || uploading || saving}
                        onPress={() => void uploadCover(line.id, guard)}
                      />
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View className="gap-4">
        <Text className="text-body font-medium text-text-primary">On the spine</Text>
        <FormField label="Institution code" optional error={fieldError("institutionCode")}>
          <TextField
            value={draft.institutionCode}
            onChangeText={(institutionCode) => edit(line.id, { institutionCode })}
            placeholder="For example ABC-CS"
            accessibilityLabel="Institution code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={SPINE_LIMITS.institutionCode}
            editable={!saving}
          />
        </FormField>
        <FormField label="Title" error={fieldError("title")}>
          <TextField
            value={draft.title}
            onChangeText={(title) => edit(line.id, { title })}
            placeholder="The title as it should read"
            accessibilityLabel="Title"
            autoCapitalize="words"
            maxLength={SPINE_LIMITS.title}
            editable={!saving}
          />
        </FormField>
        <FormField label="Author" error={fieldError("author")}>
          <TextField
            value={draft.author}
            onChangeText={(author) => edit(line.id, { author })}
            placeholder="Your name, or the authors'"
            accessibilityLabel="Author"
            autoCapitalize="words"
            maxLength={SPINE_LIMITS.author}
            editable={!saving}
          />
        </FormField>
        <View className="flex-row gap-3">
          <View className="min-w-0 flex-1">
            <FormField label="Month" error={fieldError("month")}>
              <OptionPicker
                title="Month on the spine"
                value={draft.month != null ? String(draft.month) : ""}
                options={MONTH_OPTIONS}
                onChange={(value) => edit(line.id, { month: Number(value) })}
                placeholder="Month"
                disabled={saving}
                accessibilityLabel="Month"
              />
            </FormField>
          </View>
          <View className="w-28">
            <FormField label="Year">
              <TextField
                value={draft.year}
                onChangeText={(year) => edit(line.id, { year: year.replace(/\D+/g, "") })}
                placeholder="2026"
                accessibilityLabel="Year"
                keyboardType="number-pad"
                maxLength={4}
                editable={!saving}
              />
            </FormField>
          </View>
        </View>
        {fieldError("year") ? (
          <Text accessibilityRole="alert" className="-mt-2 text-caption text-error">{fieldError("year")}</Text>
        ) : null}
      </View>

      <View className="gap-3">
        <Text className="text-body font-medium text-text-primary">Preview</Text>
        <BookPreview cover={draft.cover} lines={spineLines(draft)} coverFileName={coverFileName} />
        <Text className="text-caption text-text-muted">
          Not to scale. The spine reads top to bottom
          {draft.cover === "text_only" ? ", and the front carries the same details." : "."}
        </Text>
      </View>

      {saveError ? (
        <Text accessibilityRole="alert" className="text-body text-error">{saveError}</Text>
      ) : dirty ? (
        <Text className={attempted && problem ? "text-caption text-error" : "text-caption text-text-muted"}>
          {problem ?? "Not saved yet."}
        </Text>
      ) : held ? (
        <View className="flex-row items-center gap-2" accessible accessibilityLiveRegion="polite">
          <CircleCheck size={16} color={colors.success} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">Saved. The shop letters your book as shown.</Text>
        </View>
      ) : null}
      {dirty ? (
        <SecondaryButton
          label={saving ? "Saving…" : "Save cover and spine"}
          disabled={saving || uploading}
          onPress={() => void save(line.id)}
        />
      ) : null}
    </View>
  );
}

function Marker({ selected }: { selected: boolean }) {
  const colors = useThemeColors();
  if (!selected) {
    return <View className="h-[18px] w-[18px] rounded-pill border border-outline" aria-hidden />;
  }
  return (
    <View className="h-[18px] w-[18px] items-center justify-center rounded-pill border border-accent bg-accent" aria-hidden>
      <Check size={12} color={colors.accentOn} strokeWidth={3} />
    </View>
  );
}
