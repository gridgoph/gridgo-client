import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";

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

/** How far a drag has to travel before it counts as a month. */
const SWIPE_DISTANCE = 45;

/**
 * The month's palette.
 *
 * Pastels, because forty-two saturated discs is a lot of shouting for a screen
 * whose job is to be read calmly — and because a page of pure white circles on
 * black is a glare rather than an invitation. These are the same three
 * meanings the captain named, softened until the whole month can be looked at
 * at once.
 *
 * Sage carries the days you can have. It is the one hue on the page that is
 * not the brand gold, which is what lets an available day read as the offer
 * without competing with the numeral above it, and the two are a long-settled
 * pair. Butter is the captain's yellow, lifted off its full strength. Blush is
 * his red at the point where a month of it still reads as information.
 *
 * Each ground gets its own value, not its own hue: on white a pastel has to
 * come down to be seen, on black it has to come up.
 */
const PALETTE = {
  light: {
    open: "#8FA79B",
    tight: "#EFCE7C",
    cannot: "#EBD3D3",
    past: "#E7E7E7",
    onOpen: "#FFFFFF",
    onTight: "#1A1A1A",
    onCannot: "#9A5C5C",
    onPast: "#9A9A9A",
  },
  dark: {
    open: "#CBDED2",
    tight: "#E7CE85",
    cannot: "#553C3C",
    past: "#1F1F1F",
    onOpen: "#16211B",
    onTight: "#1A1A1A",
    onCannot: "#C79B9B",
    onPast: "#5A5A5A",
  },
} as const;

function paletteFor(light: boolean) {
  return light ? PALETTE.light : PALETTE.dark;
}

/** What a day is painted. */
function discColour(choice: DayChoice, light: boolean): string {
  return paletteFor(light)[choice];
}

/** Ink that can be read on a given disc. */
function numeralColour(choice: DayChoice, light: boolean): string {
  const palette = paletteFor(light);
  if (choice === "open") return palette.onOpen;
  if (choice === "tight") return palette.onTight;
  if (choice === "past") return palette.onPast;
  return palette.onCannot;
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
  const light = useThemeName() !== "dark";
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

  /*
    The month slides in from the side it came from.

    Without it a swipe changes forty-two discs in one frame and reads as a
    glitch rather than a movement — the hand has told the eye to expect travel
    and nothing travels. Short, because this is a transition and not an
    animation anybody should wait through.
  */
  const reducedMotion = useReducedMotion();
  const shift = useSharedValue(0);
  const fade = useSharedValue(1);
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const previousKey = useRef(monthKey);

  useEffect(() => {
    if (previousKey.current === monthKey) return;
    const forward = monthKey > previousKey.current;
    previousKey.current = monthKey;
    if (reducedMotion) return;
    shift.value = forward ? 28 : -28;
    fade.value = 0.4;
    shift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    fade.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [monthKey, reducedMotion, shift, fade]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
    opacity: fade.value,
  }));

  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Only once the drag is clearly sideways, so the page still scrolls.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -SWIPE_DISTANCE && canStepForward) onStepMonth(1);
          else if (gesture.dx >= SWIPE_DISTANCE && canStepBack) onStepMonth(-1);
        },
      }),
    [onStepMonth, canStepBack, canStepForward],
  );

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

      {/*
        The grid answers a horizontal drag as well as the arrows. A swipe is
        what a calendar teaches people to expect and costs nothing to offer;
        the arrows stay because a swipe nobody guesses at is not an
        affordance. PanResponder rather than a gesture library: this sits
        inside a scroll view, and claiming the touch only once the movement is
        clearly sideways is what keeps the page scrolling normally.
      */}
      <Animated.View className="mt-1 flex-row flex-wrap" style={slide} {...swipe.panHandlers}>
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
      </Animated.View>

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
                backgroundColor: discColour(choice, light),
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

  const fill = discColour(day.choice, light);
  const ink = numeralColour(day.choice, light);
  // A white disc on a black page needs no edge; on a light one the ink disc
  // needs none either. The edge is only for a fill that meets its own ground.
  const needsEdge = day.choice === "cannot" && light;

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
          backgroundColor: fill,
          alignItems: "center",
          justifyContent: "center",
          // Today wears the accent as a ring, the way the reference marks it,
          // and a chosen day wears the page's ink on top of whatever it means.
          borderWidth: selected ? 3 : day.isToday ? 2 : needsEdge ? 1 : 0,
          borderColor: selected
            ? colors.textPrimary
            : day.isToday
              ? colors.brand
              : colors.outline,
          opacity: day.choice === "past" ? 0.5 : 1,
        }}
      >
        {/*
          The date itself. The reference carries none, but a client picking a
          deadline has to name a day to somebody later, and counting rows to
          work out which disc is the twelfth is not a thing to ask of them.
        */}
        <Text
          style={{
            fontSize: Math.max(11, Math.round(disc * 0.34)),
            color: ink,
            fontVariant: ["tabular-nums"],
          }}
          allowFontScaling={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {day.day}
        </Text>
      </View>
    </Pressable>
  );
}
