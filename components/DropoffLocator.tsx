import { LocateFixed, MapPin } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { PinPicker } from "@/components/PinPicker";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import type { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { useThemeColors } from "@/hooks/useTheme";
import type { DropoffSuggestion } from "@/lib/geocode";

type Editor = ReturnType<typeof useDropoffEditor>;

/**
 * Search, Use my location, and the pin. Charcoal controls — the yellow is
 * the screen's continue, not this hunt.
 */
export function DropoffLocator({ editor }: { editor: Editor }) {
  const colors = useThemeColors();

  return (
    <View className="gap-5">
      <FormField
        label="Search location"
        helper="A street, a building, a place in Davao City."
      >
        <TextField
          value={editor.query}
          onChangeText={editor.onChangeQuery}
          placeholder="Quimpo Blvd, SM City…"
          accessibilityLabel="Search location"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
      </FormField>

      {editor.searching ? (
        <Text className="text-caption text-text-muted">Looking in Davao City…</Text>
      ) : null}

      {editor.results.length ? (
        <View className="gg-card-flush overflow-hidden">
          {editor.results.map((hit, index) => (
            <SearchHitRow
              key={hit.id}
              hit={hit}
              last={index === editor.results.length - 1}
              onPress={() => editor.pickSearch(hit)}
            />
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => void editor.useMyLocation()}
        disabled={editor.locating}
        accessibilityRole="button"
        accessibilityLabel="Use my location"
        accessibilityState={{ disabled: editor.locating, busy: editor.locating }}
        className={
          editor.locating
            ? "gg-card-flush gg-disabled flex-row items-center gap-3 p-4"
            : "gg-card-flush flex-row items-center gap-3 p-4"
        }
      >
        {({ pressed }) => (
          <>
            <LocateFixed
              size={18}
              color={colors.textPrimary}
              strokeWidth={2}
              aria-hidden
            />
            <View className="min-w-0 flex-1">
              <Text className="text-body-lg font-medium text-text-primary">
                {editor.locating ? "Finding you…" : "Use my location"}
              </Text>
              <Text className="text-caption text-text-muted">
                Pin where this phone is, and fill the street.
              </Text>
            </View>
            {pressed && !editor.locating ? (
              <View pointerEvents="none" className="gg-pressed absolute inset-0" />
            ) : null}
          </>
        )}
      </Pressable>

      <PinPicker
        point={editor.point}
        onPick={editor.pickPin}
        caption={editor.pinCaption}
      />
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use ${hit.label}`}
      className={`flex-row items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-outline-subtle"}`}
    >
      {({ pressed }) => (
        <>
          <MapPin
            size={18}
            color={colors.textMuted}
            strokeWidth={2}
            aria-hidden
          />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary">{hit.label}</Text>
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {hit.line1}
            </Text>
          </View>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}
