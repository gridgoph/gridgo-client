import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PRICE_FEELINGS, SURVEY_REQUIRED, tagLabel } from "@/lib/survey";

/**
 * The survey's own controls. Monochrome throughout: the stars are the
 * existing `StarRating`, and the one yellow thing on the survey is "Send".
 */

/* --------------------------------------------------------------------------
   Question number
   -------------------------------------------------------------------------- */

/**
 * The counted questions are numbered because they are a sequence of three,
 * the same three the reward meter counts. Answered, the numeral becomes a
 * tick, so a glance down the page says what is left.
 */
export function QuestionMark({ number, answered }: { number: number; answered: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      aria-hidden
      className={
        answered
          ? "h-7 w-7 items-center justify-center rounded-pill bg-accent"
          : "h-7 w-7 items-center justify-center rounded-pill border border-outline"
      }
    >
      {answered ? (
        <Check size={16} color={colors.accentOn} strokeWidth={2.5} />
      ) : (
        <Text className="text-caption font-bold text-text-secondary">{number}</Text>
      )}
    </View>
  );
}

/* --------------------------------------------------------------------------
   Tags
   -------------------------------------------------------------------------- */

/** Any number of tags, each a toggle that says it is on with a tick as well as a fill. */
export function TagPicker({
  tags,
  selected,
  onToggle,
  group,
  labelFor = tagLabel,
}: {
  tags: readonly string[];
  selected: readonly string[];
  onToggle: (code: string) => void;
  /** What the tags describe, for each toggle's accessible name. */
  group: string;
  /** A tag's words, when they are not the shared survey tags'. */
  labelFor?: (code: string) => string;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row flex-wrap gap-2">
      {tags.map((code) => {
        const on = selected.includes(code);
        const label = labelFor(code);
        return (
          <Pressable
            key={code}
            onPress={() => onToggle(code)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${group}: ${label}`}
            className={
              on
                ? "gg-chip gg-touch justify-center border-accent bg-accent"
                : "gg-chip gg-touch justify-center bg-surface"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
          >
            {on ? <Check size={14} color={colors.accentOn} strokeWidth={2.5} aria-hidden /> : null}
            <Text className={on ? "text-body text-accent-on" : "text-body text-text-secondary"}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------------------
   One choice
   -------------------------------------------------------------------------- */

/**
 * One answer from a short list. `row` sets the answers side by side in equal
 * cells (Yes / Maybe / No); `wrap` lets longer answers flow like the tags.
 * Every answer here is optional, so tapping the chosen one again takes it back.
 */
export function ChoicePicker({
  choices,
  value,
  onChange,
  group,
  labelFor,
  layout = "wrap",
}: {
  choices: readonly string[];
  value: string | null;
  onChange: (code: string) => void;
  /** The question, for each answer's accessible name. */
  group: string;
  labelFor: (code: string) => string;
  layout?: "wrap" | "row";
}) {
  const colors = useThemeColors();
  return (
    <View className={layout === "row" ? "flex-row gap-2" : "flex-row flex-wrap gap-2"} accessibilityRole="radiogroup">
      {choices.map((code) => {
        const on = code === value;
        const label = labelFor(code);
        const shape =
          layout === "row"
            ? "h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-field border"
            : "gg-chip gg-touch justify-center";
        return (
          <Pressable
            key={code}
            onPress={() => onChange(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${group} ${label}`}
            className={on ? `${shape} border-accent bg-accent` : `${shape} border-outline bg-surface`}
            style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
          >
            {on ? <Check size={14} color={colors.accentOn} strokeWidth={2.5} aria-hidden /> : null}
            <Text className={on ? "text-body text-accent-on" : "text-body text-text-secondary"}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------------------
   Price feeling
   -------------------------------------------------------------------------- */

/** Stop sizes grow with the price: the scale reads cheap to dear before a word is read. */
const STOP_SIZES = [14, 18, 22, 26, 30];

/**
 * Five stops on one line, cheapest on the left. A segmented control would
 * have to fit "Very expensive" into a fifth of a phone at large text, and
 * would not; the stops say the direction by size, the ends are named, and the
 * chosen word is set large underneath — the same shape as the stars' word.
 */
export function PriceScale({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const colors = useThemeColors();
  const chosen = value >= 1 ? PRICE_FEELINGS[value - 1] : null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center" accessibilityRole="radiogroup">
        <View
          aria-hidden
          pointerEvents="none"
          className="absolute h-px bg-outline"
          style={{ left: "10%", right: "10%", top: "50%" }}
        />
        {PRICE_FEELINGS.map((label, index) => {
          const step = index + 1;
          const on = step === value;
          const size = STOP_SIZES[index];
          return (
            <Pressable
              key={label}
              onPress={() => onChange(step)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Price felt ${label.toLowerCase()}`}
              className="gg-touch flex-1 items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: on ? 0 : 1.5,
                  borderColor: colors.textMuted,
                  backgroundColor: on ? colors.accent : colors.surface,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row justify-between" aria-hidden>
        <Text className="text-caption text-text-muted">{PRICE_FEELINGS[0]}</Text>
        <Text className="text-caption text-text-muted">{PRICE_FEELINGS[PRICE_FEELINGS.length - 1]}</Text>
      </View>
      <Text aria-hidden className={chosen ? "text-body text-text-primary" : "text-body text-text-muted"}>
        {chosen ?? "Not answered yet"}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------------------
   Recommendation, 0 to 10
   -------------------------------------------------------------------------- */

const ROWS = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
];

/**
 * Eleven numbers do not fit one row of 44-point targets on a phone, so they
 * sit in two rows of equal cells: 0–5, then 6–10 with the sixth slot left
 * empty, so every number keeps its column and the scale still reads left to
 * right, top to bottom.
 */
export function RecommendScale({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <View className="gap-2">
      <View className="gap-2" accessibilityRole="radiogroup">
        {ROWS.map((row) => (
          <View key={row[0]} className="flex-row gap-2">
            {row.map((score) => {
              const on = score === value;
              return (
                <Pressable
                  key={score}
                  onPress={() => onChange(score)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Recommend: ${score} out of 10`}
                  className={
                    on
                      ? "h-11 flex-1 items-center justify-center rounded-field border border-accent bg-accent"
                      : "h-11 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Text
                    className={on ? "text-button text-accent-on" : "text-button text-text-secondary"}
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {score}
                  </Text>
                </Pressable>
              );
            })}
            {row.length < 6 ? <View className="flex-1" aria-hidden /> : null}
          </View>
        ))}
      </View>
      <View className="flex-row justify-between" aria-hidden>
        <Text className="text-caption text-text-muted">0 is not likely</Text>
        <Text className="text-caption text-text-muted">10 is very likely</Text>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------------------
   Reward meter
   -------------------------------------------------------------------------- */

/**
 * Three bars for the three counted questions, filling as they are answered.
 * The words say the same thing — colour and fill never carry it alone — and
 * when this survey cannot earn a voucher the words count answers only.
 */
export function RewardMeter({ answered, reward }: { answered: number; reward: string | null }) {
  const line =
    answered >= SURVEY_REQUIRED
      ? reward
        ? `Ready to send. Your ${reward} voucher comes with it.`
        : "Ready to send."
      : reward
        ? `${answered} of ${SURVEY_REQUIRED} answered. ${SURVEY_REQUIRED - answered === 1 ? "One more" : `${SURVEY_REQUIRED - answered} more`} for your ${reward} voucher.`
        : `${answered} of ${SURVEY_REQUIRED} answered.`;
  return (
    <View className="gap-2" accessible accessibilityRole="progressbar" accessibilityLabel={line}
      accessibilityValue={{ min: 0, max: SURVEY_REQUIRED, now: answered }}>
      <View className="flex-row gap-1.5" aria-hidden>
        {Array.from({ length: SURVEY_REQUIRED }, (_, index) => (
          <View
            key={index}
            className={index < answered ? "h-1.5 flex-1 rounded-pill bg-accent" : "h-1.5 flex-1 rounded-pill bg-outline"}
          />
        ))}
      </View>
      <Text className="text-caption text-text-secondary">{line}</Text>
    </View>
  );
}
