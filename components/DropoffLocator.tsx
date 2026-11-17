import {
  CircleAlert,
  Flag,
  Hand,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  RotateCw,
  Route,
  SearchX,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { PinPicker } from "@/components/PinPicker";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import type { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { useThemeColors } from "@/hooks/useTheme";
import type { PinStatus } from "@/lib/dropoffPin";
import type { DropoffSuggestion } from "@/lib/geocode";

type Editor = ReturnType<typeof useDropoffEditor>;

/**
 * Search, the map, and the row that confirms what the pin says.
 *
 * One card holds the map and the confirmation under it, because they are
 * one thing: the pin, and the street GRIDGO will send the rider to. Use my
 * location sits on the map it moves. Charcoal controls throughout — the
 * yellow belongs to the screen's Save, not to this hunt.
 */
export function DropoffLocator({ editor }: { editor: Editor }) {
  return (
    <View className="gap-5">
      <View className="gap-3">
        <FormField
          label="Search location"
          helper={editor.searching || editor.searchNotice ? null : "A street, a building, a place in Davao City."}
        >
          <TextField
            value={editor.query}
            onChangeText={editor.onChangeQuery}
            placeholder="Quimpo Blvd, SM Lanang…"
            accessibilityLabel="Search location"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            // The keyboard's Search key asks again, even for the same words.
            onSubmitEditing={editor.retrySearch}
          />
        </FormField>
        <SearchState editor={editor} />
      </View>

      <View className="gg-card-flush">
        <PinPicker point={editor.point} accuracyMeters={editor.accuracyMeters} onPick={editor.pickPin}>
          <LocateButton editor={editor} />
        </PinPicker>
        <PinRow status={editor.pin} />
      </View>
    </View>
  );
}

function SearchState({ editor }: { editor: Editor }) {
  const colors = useThemeColors();

  if (editor.searching) {
    return (
      <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text className="text-caption text-text-muted">Looking in Davao City…</Text>
      </View>
    );
  }
  if (editor.searchNotice) {
    return (
      <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
        <SearchX size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        <Text className="min-w-0 flex-1 text-caption text-text-secondary">{editor.searchNotice}</Text>
        {editor.searchFailed ? (
          <Pressable
            onPress={editor.retrySearch}
            accessibilityRole="button"
            accessibilityLabel="Retry search"
            hitSlop={8}
            className="min-h-11 flex-row items-center gap-1.5 overflow-hidden rounded-pill border border-outline bg-surface px-3"
          >
            {({ pressed }) => (
              <>
                <RotateCw size={14} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                <Text className="text-caption font-medium text-text-primary">Retry</Text>
                {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (!editor.results.length) return null;
  return (
    <View className="gg-card-flush">
      {editor.results.map((hit, index) => (
        <SearchHitRow
          key={hit.id}
          hit={hit}
          last={index === editor.results.length - 1}
          onPress={() => editor.pickSearch(hit)}
        />
      ))}
    </View>
  );
}

/** Use my location, on the map it moves. A pill, so its label is never a guess. */
function LocateButton({ editor }: { editor: Editor }) {
  const colors = useThemeColors();
  return (
    <View pointerEvents="box-none" className="absolute left-3 top-3">
      <Pressable
        onPress={() => void editor.useMyLocation()}
        disabled={editor.locating}
        accessibilityRole="button"
        accessibilityLabel="Use my location"
        accessibilityState={{ disabled: editor.locating, busy: editor.locating }}
        className="min-h-11 flex-row items-center gap-2 overflow-hidden rounded-pill border border-outline bg-surface px-4"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      >
        {({ pressed }) => (
          <>
            {editor.locating ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <LocateFixed size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            )}
            <Text className="text-body font-medium text-text-primary">
              {editor.locating ? "Finding you…" : "Use my location"}
            </Text>
            {pressed && !editor.locating ? (
              <View pointerEvents="none" className="gg-pressed absolute inset-0" />
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

/** The confirmation: the street the rider is sent to, and whether the pin is on the door. */
function PinRow({ status }: { status: PinStatus }) {
  const colors = useThemeColors();
  const spoken = [status.title, status.detail, status.landmark ? `Landmark: ${status.landmark}` : "", status.hint]
    .filter(Boolean)
    .join(". ");

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      accessibilityLiveRegion="polite"
      className="gap-3 border-t border-outline p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-6 w-5 items-center justify-center">
          {status.tone === "busy" ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : status.tone === "error" ? (
            <CircleAlert size={20} color={colors.error} strokeWidth={2} aria-hidden />
          ) : (
            <MapPin
              size={20}
              color={status.tone === "set" ? colors.textPrimary : colors.textMuted}
              strokeWidth={2}
              aria-hidden
            />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className={
              status.tone === "error"
                ? "text-body-lg font-medium text-error"
                : status.tone === "set"
                  ? "text-body-lg font-medium text-text-primary"
                  : "text-body-lg text-text-secondary"
            }
          >
            {status.title}
          </Text>
          {status.detail ? <Text className="text-caption text-text-muted">{status.detail}</Text> : null}
          {status.landmark ? (
            <View className="flex-row items-center gap-1.5">
              <Flag size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
              <Text className="min-w-0 flex-1 text-caption text-text-secondary">{status.landmark}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {status.hint ? (
        <View className="flex-row items-start gap-3 rounded-field bg-surface-variant px-3 py-2">
          <Hand size={16} color={colors.info} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">{status.hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SearchHitRow({
  hit,
  last,
  onPress,
}: {
  hit: DropoffSuggestion;
  last: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  // The glyph says what the pin will land on: a door, a road, or an area.
  const Glyph = hit.precision === "street" ? Route : hit.precision === "area" ? MapIcon : MapPin;
  const area = hit.area || hit.line1;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={area ? `Use ${hit.label}, ${area}` : `Use ${hit.label}`}
      className={`min-h-11 flex-row items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-outline-subtle"}`}
    >
      {({ pressed }) => (
        <>
          <Glyph size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
              {hit.label}
            </Text>
            {area ? (
              <Text className="text-caption text-text-muted" numberOfLines={1}>
                {area}
              </Text>
            ) : null}
          </View>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}
