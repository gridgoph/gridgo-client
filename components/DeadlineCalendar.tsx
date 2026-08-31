import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { choiceLabel, type CalendarDay, type DayChoice } from "@/lib/deadlineCalendar";

/**
 * The month a client picks their date from.
 *
 * The composition is the captain's reference and so is its density: seven
 * large discs to a row with only a hairline between them, so the grid reads as
 * one block of days rather than a scatter of dots. That density is the whole
 * design — a sparse grid of small circles says nothing at a glance, and this
 * screen exists to be understood at a glance.
 *
 * The three colours are the captain's own, adapted so each holds on both
 * grounds: a white disc is invisible on a white page and needs an edge, and
 * only there.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * The captain's indicators.
 *
 * Vacant is white, an ongoing queue is the platform yellow, and a full queue
 * is red. They are stated here rather than taken from the theme because they
 * are a fixed legend a shop and a client are both taught once — what changes
 * between themes is only what has to sit behind white to keep it visible.
 */
export const DAY_COLOURS = {
  vacant: "#FFFFFF",
  ongoing: "#FFDE59",
  full: "#FF3B3B",
} as const;

export function DeadlineCalendar({
  days,
  month,
  selectedDayKey,
  onSelectDay,
  onStepMonth,
  canStepBack,
  canStepForward,
}: {
  days: CalendarDay[];
  month: Date;
  selectedDayKey: string | null;
  onSelectDay: (day: CalendarDay) => void;
  onStepMonth: (step: number) => void;
  canStepBack: boolean;
  canStepForward: boolean;
}) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();

  // Seven to a row across the page, with a hairline of breathing room. The
  // reference's discs nearly touch, and that is what makes the month read as
  // one object instead of forty-two.
  const cell = Math.floor((width - 32) / 7);
  const disc = cell - 4;

  const headline = useMemo(() => {
    const selected = days.find((day) => day.dayKey === selectedDayKey);
    return selected ?? days.find((day) => day.isToday && day.inMonth) ?? null;
  }, [days, selectedDayKey]);

  const headlineDate = headline ? new Date(`${headline.dayKey}T12:00:00`) : month;

  return (
    <View>
      <View className="flex-row items-start justify-between">
        <View className="min-w-0 flex-1">
          <Text
            className="font-bold"
            // Larger than any step on the scale: the date is the whole
            // question. Gold rather than the primary yellow, which belongs to
            // the one control a screen is for and cannot be read at this size.
            style={{ fontSize: 72, lineHeight: 74, letterSpacing: -3, color: colors.brand }}
            accessibilityRole="header"
          >
            {String(headlineDate.getDate()).padStart(2, "0")}
          </Text>
          <Text className="text-h3 text-text-primary">{MONTHS[headlineDate.getMonth()]}</Text>
          <Text className="text-body-lg text-text-muted">{headlineDate.getFullYear()}</Text>
        </View>

        <View className="items-end gap-2 pt-2">
          <Text className="text-body-lg text-text-secondary">
            {WEEKDAY_NAMES[headlineDate.getDay()]}
          </Text>
          {/*
            Arrows rather than a swipe alone. A swipe is invisible until it is
            guessed at, and a month the client cannot reach is the difference
            between "GRIDGO cannot print this" and "not this month".
          */}
          <View className="flex-row items-center gap-1">
            <StepButton
              direction="back"
              disabled={!canStepBack}
              onPress={() => onStepMonth(-1)}
            />
            <StepButton
              direction="forward"
              disabled={!canStepForward}
              onPress={() => onStepMonth(1)}
            />
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row">
        {WEEKDAYS.map((letter, index) => (
          <Text
            key={`${letter}-${index}`}
            className="text-center text-caption text-text-muted"
            style={{ width: cell }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {letter}
          </Text>
        ))}
      </View>

      <View className="mt-1 flex-row flex-wrap">
        {days.map((day) => (
          <DayCell
            key={day.dayKey}
            day={day}
            cell={cell}
            disc={disc}
            selected={day.dayKey === selectedDayKey}
            onPress={() => onSelectDay(day)}
          />
        ))}
      </View>

      {/*
        The key. Without words this is a grid of coloured circles, which is
        the one thing a status in this product may never be.
      */}
      <View className="mt-4 flex-row flex-wrap gap-x-4 gap-y-1">
        {(["open", "tight", "cannot"] as DayChoice[]).map((choice) => (
          <View key={choice} className="flex-row items-center gap-2">
            <Disc choice={choice} size={10} />
            <Text className="text-caption text-text-secondary">{choiceLabel(choice)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepButton({
  direction,
  disabled,
  onPress,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === "back" ? "Previous month" : "Next month"}
      accessibilityState={{ disabled }}
      hitSlop={8}
      className="gg-touch items-center justify-center"
      style={({ pressed }) => ({ opacity: disabled ? 0.25 : pressed ? 0.6 : 1 })}
    >
      <Icon size={22} color={colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

function DayCell({
  day,
  cell,
  disc,
  selected,
  onPress,
}: {
  day: CalendarDay;
  cell: number;
  disc: number;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={!day.selectable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !day.selectable }}
      // The whole answer: a screen reader gets no colour and no shape.
      accessibilityLabel={`${day.day}: ${choiceLabel(day.choice)}`}
      style={({ pressed }) => ({
        width: cell,
        height: cell,
        alignItems: "center",
        justifyContent: "center",
        opacity: day.inMonth ? (pressed && day.selectable ? 0.7 : 1) : 0.12,
      })}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          // The chosen day keeps a ring in the page's own ink, so it reads as
          // chosen on top of whatever the day already meant.
          borderWidth: selected ? 3 : 0,
          borderColor: colors.textPrimary,
        }}
      >
        <Disc choice={day.choice} size={disc} today={day.isToday} />
      </View>
    </Pressable>
  );
}

/**
 * One day, in the captain's three colours.
 *
 * White reads as available, yellow as narrowing, red as out of reach. White is
 * the only one that needs help: on a light page it would vanish, so there it
 * carries an edge, and on a dark page it needs none.
 *
 * Colour is never the whole message — the disc for a day nobody can make is
 * struck through, so the month is still readable with no colour at all.
 */
function Disc({
  choice,
  size,
  today = false,
}: {
  choice: DayChoice;
  size: number;
  today?: boolean;
}) {
  const colors = useThemeColors();
  const light = useThemeName() !== "dark";

  const fill =
    choice === "open" ? DAY_COLOURS.vacant
    : choice === "tight" ? DAY_COLOURS.ongoing
    : DAY_COLOURS.full;

  // Past days are not a warning, they are simply gone — painting a fortnight
  // of them red makes the one colour that should mean "you cannot have this"
  // mean "the calendar has a past".
  if (choice === "past") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: colors.surfaceVariant,
          opacity: 0.6,
        }}
      />
    );
  }

  return (
    <View
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: fill,
        // White on a white page is not a disc. Everywhere else the colour
        // carries its own edge.
        borderWidth: choice === "open" && light ? 1 : today ? 2 : 0,
        borderColor: today ? colors.textPrimary : colors.outline,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {choice === "cannot" ? (
        <View
          style={{
            width: size * 1.4,
            height: Math.max(1.5, size * 0.06),
            backgroundColor: "#FFFFFF",
            opacity: 0.85,
            transform: [{ rotate: "-45deg" }],
          }}
        />
      ) : null}
    </View>
  );
}
