import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
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
 * The captain's three indicators, and the one adjustment each ground needs.
 *
 * White is vacant, his yellow is a queue moving, his red is a queue full. The
 * red is carried to a pastel: at full strength forty-two of them is a siren,
 * and this screen is read all at once. The other two stand as given.
 *
 * White needs the opposite treatment on each page. On black it fills and
 * dominates, which is right — an open day should be the loudest thing here. On
 * white it would disappear, so it becomes a crisp outlined circle instead,
 * which is what vacant looks like anyway.
 */
const PALETTE = {
  light: {
    open: "#FFFFFF",
    tight: "#FFDE59",
    cannot: "#F2CFCF",
    past: "#ECECEC",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onCannot: "#A75E5E",
    onPast: "#B4B4B4",
  },
  dark: {
    open: "#FFFFFF",
    tight: "#FFDE59",
    cannot: "#D9A5A5",
    past: "#1F1F1F",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onCannot: "#5A2E2E",
    onPast: "#585858",
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
    The month is dragged, not merely replaced.

    A carousel: the grid follows the finger, and on release either carries on
    off the edge and brings the next month in from the other side, or returns
    to where it was. Nothing overshoots — a month is a page being turned, and a
    page that bounces at the end of the turn reads as a mistake.

    The whole width is the travel, so a month leaves completely before its
    replacement arrives. Half-measures here look like the grid stuttering.
  */
  const reducedMotion = useReducedMotion();
  const travel = cell * 7;
  const shift = useSharedValue(0);
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const previousKey = useRef(monthKey);
  const settling = useRef(false);

  useEffect(() => {
    if (previousKey.current === monthKey) return;
    const forward = monthKey > previousKey.current;
    previousKey.current = monthKey;
    settling.current = false;
    if (reducedMotion) {
      shift.value = 0;
      return;
    }
    // In from the far side, at the speed a turned page settles.
    shift.value = forward ? travel : -travel;
    shift.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
  }, [monthKey, reducedMotion, shift, travel]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  const step = (direction: number) => {
    settling.current = false;
    onStepMonth(direction);
  };

  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Only once the drag is clearly sideways, so the page still scrolls.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_event, gesture) => {
          if (settling.current || reducedMotion) return;
          const blocked = gesture.dx < 0 ? !canStepForward : !canStepBack;
          // A month that is not there still moves, but heavily, so the edge of
          // the window is something the hand meets rather than something that
          // simply ignores it.
          shift.value = blocked ? gesture.dx * 0.18 : gesture.dx;
        },
        onPanResponderRelease: (_event, gesture) => {
          const forward = gesture.dx <= -SWIPE_DISTANCE && canStepForward;
          const back = gesture.dx >= SWIPE_DISTANCE && canStepBack;
          if (!forward && !back) {
            if (!reducedMotion) {
              shift.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
            }
            return;
          }
          if (reducedMotion) {
            step(forward ? 1 : -1);
            return;
          }
          // Carry it the rest of the way off, then swap. The month arriving
          // handles its own entrance.
          settling.current = true;
          shift.value = withTiming(
            forward ? -travel : travel,
            { duration: 150, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (finished) runOnJS(step)(forward ? 1 : -1);
            },
          );
        },
        onPanResponderTerminate: () => {
          if (!reducedMotion) {
            shift.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onStepMonth, canStepBack, canStepForward, reducedMotion, travel],
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
                borderWidth: choice === "open" && light ? 1 : 0,
                borderColor: colors.textPrimary,
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
  // A white disc on a white page is not a disc. It becomes an outlined circle
  // there instead, which is what vacant looks like anyway.
  const needsEdge = day.choice === "open" && light;

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
          borderWidth: selected ? 3 : day.isToday ? 2 : needsEdge ? 1.5 : 0,
          borderColor: selected
            ? colors.textPrimary
            : day.isToday
              ? colors.brand
              : colors.textPrimary,
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
