import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  choiceLabel,
  shopClock,
  type CalendarDay,
  type DayChoice,
} from "@/lib/deadlineCalendar";

/**
 * The month a client picks their date from.
 *
 * The composition is the captain's reference, and so is its language: a wall
 * of large discs where the ones you can have carry the ink and the ones you
 * cannot sit quiet. That inversion is the point. An earlier cut marked every
 * unavailable day in red with a line through it, which on a month whose dates
 * are all too soon painted the whole page as an error — when the honest
 * reading is simply "not these days, look further on".
 *
 * So nothing here is struck through and nothing that is merely unavailable is
 * alarming. Red is a shop's word for a full queue; a client being told a date
 * is too soon has done nothing wrong.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The captain's yellow, which means the same thing on both grounds. */
const TIGHT = "#FFDE59";

/**
 * What a day is painted.
 *
 * A day you can have is the page's own ink — near-black on a light page and
 * white on a dark one, which is the captain's `#FFFFFF` where a white disc can
 * actually be seen. A day you cannot is the quiet grey the reference uses for
 * the same thing, because unavailable is not a warning.
 */
function discColour(choice: DayChoice, colors: ReturnType<typeof useThemeColors>): string {
  if (choice === "open") return colors.textPrimary;
  if (choice === "tight") return TIGHT;
  return colors.surfaceVariant;
}

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

  // Seven across the page with a hairline between, so the month reads as one
  // block of days rather than forty-two separate marks.
  const cell = Math.floor((width - 32) / 7);
  const disc = cell - 3;

  const headline = useMemo(() => {
    const selected = days.find((day) => day.dayKey === selectedDayKey);
    return selected ?? days.find((day) => day.isToday && day.inMonth) ?? null;
  }, [days, selectedDayKey]);

  const headlineDate = headline ? new Date(`${headline.dayKey}T12:00:00`) : month;

  return (
    <View>
      {/*
        The masthead. The numeral, then the month with the year quieter under
        it, and the weekday off to the right on the month's own line — the
        reference's arrangement exactly.
      */}
      <Text
        className="font-bold"
        // Well past the top of the type scale, deliberately: the date is the
        // whole question this screen asks. Gold rather than the primary
        // yellow, which belongs to the one control a screen is for.
        style={{ fontSize: 88, lineHeight: 90, letterSpacing: -4, color: colors.brand }}
        accessibilityRole="header"
      >
        {String(headlineDate.getDate()).padStart(2, "0")}
      </Text>

      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-h2 text-text-primary">{MONTHS[headlineDate.getMonth()]}</Text>
          <Text className="text-h3 text-text-muted">{headlineDate.getFullYear()}</Text>
        </View>

        <View className="items-end">
          <Text className="text-h3 text-text-secondary">
            {WEEKDAY_NAMES[headlineDate.getDay()]}
          </Text>
          <ShopClock />
          {/*
            Arrows, not a swipe alone. A swipe is invisible until it is guessed
            at, and reaching another month is the difference between "GRIDGO
            cannot print this" and "not this month".
          */}
          <View className="mt-1 flex-row items-center">
            <StepButton direction="back" disabled={!canStepBack} onPress={() => onStepMonth(-1)} />
            <StepButton direction="forward" disabled={!canStepForward} onPress={() => onStepMonth(1)} />
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row">
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
      <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2">
        {(["open", "tight", "cannot"] as DayChoice[]).map((choice) => (
          <View key={choice} className="flex-row items-center gap-2">
            <View
              style={{
                width: 11,
                height: 11,
                borderRadius: 999,
                backgroundColor: discColour(choice, colors),
              }}
            />
            <Text className="text-caption text-text-secondary">{choiceLabel(choice)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The time in Davao, ticking.
 *
 * A deadline is a moment where the presses are, not where the phone is. It
 * ticks rather than sitting still because a still time is one a person has to
 * wonder about the freshness of.
 */
function ShopClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text
      className="text-caption text-text-muted"
      style={{ fontVariant: ["tabular-nums"] }}
      // Announced as what it is, since "10:04:33 pm" alone means nothing.
      accessibilityLabel={`Davao time, ${shopClock(now)}`}
    >
      {shopClock(now)} · Davao
    </Text>
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
      hitSlop={10}
      className="gg-touch items-center justify-center"
      style={({ pressed }) => ({ opacity: disabled ? 0.2 : pressed ? 0.6 : 1 })}
    >
      <Icon size={24} color={colors.textPrimary} strokeWidth={2} />
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
  const light = useThemeName() !== "dark";

  const fill = discColour(day.choice, colors);
  // A white disc on a white page is not a disc. Nowhere else needs an edge.
  const needsEdge = day.choice === "open" && !light;

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
        opacity: day.inMonth ? (pressed && day.selectable ? 0.7 : 1) : 0.1,
      })}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: 999,
          backgroundColor: fill,
          // Today wears the accent as a ring, the way the reference marks it,
          // and a chosen day wears the page's ink on top of whatever it means.
          borderWidth: selected ? 3 : day.isToday ? 2 : needsEdge ? 1 : 0,
          borderColor: selected
            ? colors.textPrimary
            : day.isToday
              ? colors.brand
              : colors.outline,
          // Past days recede rather than being marked. They are gone, which is
          // not a thing to warn somebody about.
          opacity: day.choice === "past" ? 0.45 : 1,
        }}
      />
    </Pressable>
  );
}
