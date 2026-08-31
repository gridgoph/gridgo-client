import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  shiftMonth,
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

/**
 * The captain's three indicators.
 *
 * White is vacant and his yellow is a queue moving, both as given. For a queue
 * that is full the platform already has a red — the one every error in every
 * GRIDGO app is drawn in — and this uses that rather than inventing a brighter
 * one. It reads as a stop without the glare of a pure signal red, and it means
 * the same thing here as it does everywhere else in the product.
 *
 * What keeps a month of it from becoming a siren is not the shade but scope:
 * the month opens where there is something to book, and days already gone are
 * neutral rather than red, so the red marks the boundary of what is possible
 * instead of colouring in the past.
 *
 * White needs opposite handling on each ground. On black it fills and
 * dominates, which is right — an open day should be the loudest thing here. On
 * white it would disappear, so it becomes a crisp outlined circle, which is
 * what vacant looks like anyway.
 */
const PALETTE = {
  light: {
    open: "#FFFFFF",
    tight: "#FFDE59",
    cannot: "#C62828",
    past: "#ECECEC",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onCannot: "#FFFFFF",
    onPast: "#B4B4B4",
  },
  dark: {
    open: "#FFFFFF",
    tight: "#FFDE59",
    cannot: "#B33A3A",
    past: "#1F1F1F",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onCannot: "#FFE0E0",
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
  daysFor,
  month,
  selectedDayKey,
  onSelectDay,
  onStepMonth,
  canStepBack,
  canStepForward,
}: {
  /** Builds a month's cells. Called for the month either side as well. */
  daysFor: (month: Date) => CalendarDay[];
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

  /*
    Cells cached by month, and the cache thrown away only when availability
    itself changes.

    This is what makes a month step cheap. Without it every step handed all
    three pages brand new arrays, so a hundred and twenty-six day cells
    re-rendered in the frame the swipe was trying to finish in — which is the
    stutter at the end of the gesture, not the animation. With it, the month
    being scrolled towards is the very array that was already on screen beside
    it, and two of the three pages skip re-rendering entirely.
  */
  const cache = useRef(new Map<string, CalendarDay[]>());
  const cacheKey = useRef(daysFor);
  if (cacheKey.current !== daysFor) {
    cacheKey.current = daysFor;
    cache.current = new Map();
  }
  const cachedDays = useCallback(
    (which: Date) => {
      const key = `${which.getFullYear()}-${which.getMonth()}`;
      const held = cache.current.get(key);
      if (held) return held;
      const built = daysFor(which);
      cache.current.set(key, built);
      return built;
    },
    [daysFor],
  );

  const pages = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const which = shiftMonth(month, offset);
        return {
          key: `${which.getFullYear()}-${which.getMonth()}`,
          days: cachedDays(which),
          current: offset === 0,
        };
      }),
    [month, cachedDays],
  );
  const days = pages[1].days;

  const headline = useMemo(() => {
    const selected = days.find((day) => day.dayKey === selectedDayKey);
    return selected ?? days.find((day) => day.isToday && day.inMonth) ?? null;
  }, [days, selectedDayKey]);

  const headlineDate = headline ? new Date(`${headline.dayKey}T12:00:00`) : month;

  /*
    A carousel, anchored on the middle of a three-month strip.

    The strip sits at minus one page so the current month is what shows. A drag
    moves it with the finger and reveals a real neighbour; a release either
    carries it the rest of the way to that neighbour or returns it.

    The commit is the delicate part. Once the strip has travelled a whole page,
    the month either side of it becomes the new middle, so the offset has to
    return to centre in the same paint that the new month arrives in --
    otherwise there is one frame showing the month after next. A layout effect
    is what runs early enough to do that.

    Velocity counts as well as distance, which is the difference between a
    carousel and a threshold: a quick flick travels barely a third of the page
    and every other app on the phone turns on it.
  */
  const reducedMotion = useReducedMotion();
  const page = cell * 7;
  const shift = useSharedValue(0);
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const previousKey = useRef(monthKey);
  const settling = useRef(false);

  useLayoutEffect(() => {
    if (previousKey.current === monthKey) return;
    previousKey.current = monthKey;
    // Back to centre before this month is painted. The strip has already
    // travelled; the new middle page is the one the client is looking at.
    shift.value = 0;
    settling.current = false;
  }, [monthKey, shift]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: -page + shift.value }],
  }));

  const commit = (direction: number) => {
    settling.current = true;
    onStepMonth(direction);
  };

  const settle = (to: number, duration: number) => {
    shift.value = withTiming(to, { duration, easing: Easing.out(Easing.cubic) });
  };

  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Only once the drag is clearly sideways, so the page still scrolls.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
        onPanResponderMove: (_event, gesture) => {
          if (settling.current || reducedMotion) return;
          const blocked = gesture.dx < 0 ? !canStepForward : !canStepBack;
          // A month that is not there still moves, but heavily, so the end of
          // the window is something the hand meets rather than something that
          // ignores it.
          shift.value = blocked ? gesture.dx * 0.16 : gesture.dx;
        },
        onPanResponderRelease: (_event, gesture) => {
          if (settling.current) return;
          // Distance or a flick. `vx` is points per millisecond, so 0.3 is the
          // speed a deliberate flick reaches well before it has travelled far.
          const flung = Math.abs(gesture.vx) > 0.3;
          const far = Math.abs(gesture.dx) > page * 0.28;
          const wantsForward = gesture.dx < 0;
          const allowed = wantsForward ? canStepForward : canStepBack;

          if (!allowed || !(flung || far)) {
            if (!reducedMotion) settle(0, 200);
            return;
          }
          if (reducedMotion) {
            commit(wantsForward ? 1 : -1);
            return;
          }
          // Finish the throw at something close to the speed it was thrown,
          // floored so a slow drag still lands rather than crawling.
          const remaining = page - Math.abs(gesture.dx);
          const duration = Math.min(
            260,
            Math.max(120, Math.round(remaining / Math.max(0.6, Math.abs(gesture.vx)))),
          );
          shift.value = withTiming(
            wantsForward ? -page : page,
            { duration, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (finished) runOnJS(commit)(wantsForward ? 1 : -1);
            },
          );
        },
        onPanResponderTerminate: () => {
          if (!reducedMotion && !settling.current) settle(0, 200);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onStepMonth, canStepBack, canStepForward, reducedMotion, page],
  );

  /** The arrows travel the same way, so both routes feel like one control. */
  const stepWithSlide = (direction: number) => {
    if (reducedMotion || settling.current) {
      commit(direction);
      return;
    }
    shift.value = withTiming(
      direction > 0 ? -page : page,
      { duration: 220, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(commit)(direction);
      },
    );
  };

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
            <StepButton direction="back" disabled={!canStepBack} onPress={() => stepWithSlide(-1)} />
            <StepButton direction="forward" disabled={!canStepForward} onPress={() => stepWithSlide(1)} />
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
      {/*
        Three months in a row, and the viewport shows the middle one. The month
        either side is really there, so a drag reveals where it is going rather
        than sliding the current one out to nothing — which is what made the
        old version feel like a transition played at somebody rather than a
        page being turned by them.
      */}
      <View style={{ width: page, overflow: "hidden" }} {...swipe.panHandlers}>
        <Animated.View style={[{ flexDirection: "row", width: page * 3 }, slide]}>
          {/*
            Keyed by month, so React carries two of the three pages across a
            step instead of tearing all three down and building them again.
          */}
          {pages.map((entry) => (
            <MonthPage
              key={entry.key}
              days={entry.days}
              page={page}
              cell={cell}
              disc={disc}
              selectedDayKey={selectedDayKey}
              onSelectDay={onSelectDay}
              interactive={entry.current}
            />
          ))}
        </Animated.View>
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

/**
 * One month of the strip.
 *
 * Only the middle page takes taps. A day tapped on a neighbour would select a
 * date the masthead is not describing, which is a state nobody asked for.
 */
const MonthPage = memo(function MonthPage({
  days,
  page,
  cell,
  disc,
  selectedDayKey,
  onSelectDay,
  interactive,
}: {
  days: CalendarDay[];
  page: number;
  cell: number;
  disc: number;
  selectedDayKey: string | null;
  onSelectDay: (day: CalendarDay) => void;
  interactive: boolean;
}) {
  return (
    <View
      style={{ width: page, flexDirection: "row", flexWrap: "wrap" }}
      pointerEvents={interactive ? "auto" : "none"}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
    >
      {days.map((day) => (
        <DayCell
          key={day.dayKey}
          day={day}
          cell={cell}
          disc={disc}
          selected={day.dayKey === selectedDayKey}
          // The day itself, not a closure over it: an arrow made here is a new
          // function every render and would defeat the cell's own memo.
          onSelect={onSelectDay}
        />
      ))}
    </View>
  );
});

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

const DayCell = memo(function DayCell({
  day,
  cell,
  disc,
  selected,
  onSelect,
}: {
  day: CalendarDay;
  cell: number;
  disc: number;
  selected: boolean;
  onSelect: (day: CalendarDay) => void;
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
      onPress={() => onSelect(day)}
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
      {/*
        The chosen day wears a halo rather than a border.

        A border would have to sit on the disc, and on a yellow day a yellow
        border is nothing at all. Held off the edge it reads over every fill,
        and it is the screen's one spend of the primary yellow — which is what
        the colour is for: the single thing the client has decided.
      */}
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: cell,
            height: cell,
            borderRadius: 999,
            borderWidth: 2.5,
            borderColor: colors.actionYellow,
          }}
        />
      ) : null}
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: 999,
          backgroundColor: fill,
          alignItems: "center",
          justifyContent: "center",
          // Today wears the accent as a ring, the way the reference marks it.
          borderWidth: day.isToday ? 2 : needsEdge ? 1.5 : 0,
          borderColor: day.isToday ? colors.brand : colors.textPrimary,
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
});
