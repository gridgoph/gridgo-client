import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";

import { SeasonLevelTag, useSeasonTrackColour } from "@/components/SeasonLevelTag";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import {
  choiceLabel,
  monthKeyOf,
  shiftMonth,
  shopClock,
  type CalendarDay,
  type DayChoice,
} from "@/lib/deadlineCalendar";
import {
  SEASON_AWARENESS_NOTE,
  seasonAccessibilityText,
  seasonRange,
  seasonsInMonth,
  type SeasonWindow,
} from "@/lib/seasonWindows";

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
 * Two indicators, plus the earliest line on the screen above.
 *
 * White is vacant and yellow is a queue moving. A day nobody can make uses
 * the same quiet disc as a day already gone — a client being told a date is
 * too soon has done nothing wrong, so it must not look like an error. The
 * words that replace the old red live above the grid: "Earliest a printer
 * can have these ready: …" (or that nobody can, within the window).
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
    past: "#ECECEC",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onPast: "#B4B4B4",
  },
  dark: {
    open: "#FFFFFF",
    tight: "#FFDE59",
    past: "#1F1F1F",
    onOpen: "#1A1A1A",
    onTight: "#1A1A1A",
    onPast: "#585858",
  },
} as const;

function paletteFor(light: boolean) {
  return light ? PALETTE.light : PALETTE.dark;
}

/** Open and tight keep their own paint; cannot is drawn as past. */
function paintedChoice(choice: DayChoice): "open" | "tight" | "past" {
  return choice === "open" || choice === "tight" ? choice : "past";
}

/** What a day is painted. */
function discColour(choice: DayChoice, light: boolean): string {
  return paletteFor(light)[paintedChoice(choice)];
}

/** Ink that can be read on a given disc. */
function numeralColour(choice: DayChoice, light: boolean): string {
  const palette = paletteFor(light);
  const painted = paintedChoice(choice);
  if (painted === "open") return palette.onOpen;
  if (painted === "tight") return palette.onTight;
  return palette.onPast;
}

const MONTH_CACHE = new WeakMap<(month: Date) => CalendarDay[], Map<string, CalendarDay[]>>();

/** One month's cells, built at most once per availability. */
function monthDays(daysFor: (month: Date) => CalendarDay[], which: Date): CalendarDay[] {
  let cache = MONTH_CACHE.get(daysFor);
  if (!cache) {
    cache = new Map();
    MONTH_CACHE.set(daysFor, cache);
  }
  const key = `${which.getFullYear()}-${which.getMonth()}`;
  const held = cache.get(key);
  if (held) return held;
  const built = daysFor(which);
  cache.set(key, built);
  return built;
}

export function DeadlineCalendar({
  daysFor,
  month,
  selectedDayKey,
  onSelectDay,
  onStepMonth,
  canStepBack,
  canStepForward,
  seasons = [],
}: {
  /** Builds a month's cells. Called for the month either side as well. */
  daysFor: (month: Date) => CalendarDay[];
  month: Date;
  selectedDayKey: string | null;
  onSelectDay: (day: CalendarDay) => void;
  onStepMonth: (step: number) => void;
  canStepBack: boolean;
  canStepForward: boolean;
  /**
   * Season windows, for the list under the month. The cells carry their own
   * marks from `daysFor`; this is only what the list names.
   */
  seasons?: SeasonWindow[];
}) {
  const colors = useThemeColors();
  const light = useThemeName() !== "dark";
  const { width } = useWindowDimensions();

  // Seven across the page with a hairline between, so the month reads as one
  // block of days rather than forty-two separate marks.
  const cell = Math.floor((width - 32) / 7);
  // Four points of air round each disc, which is where a season's track shows.
  const disc = cell - DISC_INSET * 2;

  /*
    Cells cached by month, and the cache thrown away only when availability
    itself changes.

    This is what makes a month step cheap. Without it every step handed all
    three pages brand new arrays, so a hundred and twenty-six day cells
    re-rendered in the frame the swipe was trying to finish in — which is the
    stutter at the end of the gesture, not the animation. With it, the month
    being scrolled towards is the very array that was already on screen beside
    it, and two of the three pages skip re-rendering entirely.

    The cache lives outside the component, keyed by the `daysFor` function
    itself: a new availability means a new function from the parent and so a
    fresh cache, and the old one is collected with the old function.
  */
  const cachedDays = useCallback((which: Date) => monthDays(daysFor, which), [daysFor]);

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
    Which season messages are open. A chosen day opens the seasons it sits in,
    and a tap on a day nobody can make still opens its season — the message is
    worth reading whether or not that date is a choice. A row's own tap
    toggles it. Reset whenever the day changes, during render rather than in
    an effect, so the message lands in the same paint as the ring.
  */
  const [openSeasons, setOpenSeasons] = useState<{ day: string | null; ids: string[] }>({
    day: null,
    ids: [],
  });
  const [seasonDay, setSeasonDay] = useState<CalendarDay | null>(null);
  const seasonSource =
    seasonDay ?? days.find((day) => day.dayKey === selectedDayKey) ?? null;
  const seasonSourceKey = seasonSource?.dayKey ?? null;
  if (openSeasons.day !== seasonSourceKey) {
    setOpenSeasons({
      day: seasonSourceKey,
      ids: seasonSource?.season?.windows.map((window) => window.id) ?? [],
    });
  }
  const toggleSeason = useCallback((id: string) => {
    setOpenSeasons((current) => ({
      ...current,
      ids: current.ids.includes(id)
        ? current.ids.filter((entry) => entry !== id)
        : [...current.ids, id],
    }));
  }, []);
  const tapDay = useCallback(
    (day: CalendarDay) => {
      setSeasonDay(day.season ? day : null);
      if (day.selectable) onSelectDay(day);
    },
    [onSelectDay],
  );
  const monthSeasons = useMemo(
    () => seasonsInMonth(monthKeyOf(month), seasons),
    [month, seasons],
  );

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
  // A shared value rather than a ref, because the gesture reads it from the UI
  // thread and a React ref does not exist there.
  const settling = useSharedValue(0);
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const previousKey = useRef(monthKey);

  useLayoutEffect(() => {
    if (previousKey.current === monthKey) return;
    previousKey.current = monthKey;
    // Back to centre before this month is painted. The strip has already
    // travelled; the new middle page is the one the client is looking at.
    shift.set(0);
    settling.set(0);
  }, [monthKey, shift, settling]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: -page + shift.get() }],
  }));

  const commit = useCallback((direction: number) => onStepMonth(direction), [onStepMonth]);

  /*
    The drag, on the UI thread.

    Every frame of this runs as a worklet, so the strip tracks the finger even
    while React is busy — which is the whole reason for the gesture root. The
    same movement driven from JavaScript arrives a frame or two late under any
    load, and a calendar being dragged is exactly when the JavaScript thread is
    least free.

    `activeOffsetX` and `failOffsetY` are what keep the page scrolling: this
    claims the touch only once the movement is decidedly sideways, and gives it
    up the moment it is not.
  */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reducedMotion)
        .activeOffsetX([-12, 12])
        .failOffsetY([-18, 18])
        .onUpdate((event) => {
          "worklet";
          if (settling.get()) return;
          const blocked = event.translationX < 0 ? !canStepForward : !canStepBack;
          // A month that is not there still moves, but heavily, so the end of
          // the window is something the hand meets rather than something that
          // ignores it.
          shift.set(blocked ? event.translationX * 0.16 : event.translationX);
        })
        .onEnd((event) => {
          "worklet";
          if (settling.get()) return;
          // Distance or a flick. `velocityX` is points per second here, so a
          // deliberate flick clears 400 well before it has travelled far.
          const flung = Math.abs(event.velocityX) > 400;
          const far = Math.abs(event.translationX) > page * 0.28;
          const forward = event.translationX < 0;
          const allowed = forward ? canStepForward : canStepBack;

          if (!allowed || !(flung || far)) {
            shift.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }));
            return;
          }
          // Finish the throw near the speed it was thrown, floored so a slow
          // drag still lands rather than crawling.
          const remaining = page - Math.abs(event.translationX);
          const duration = Math.min(
            260,
            Math.max(120, (remaining / Math.max(600, Math.abs(event.velocityX))) * 1000),
          );
          settling.set(1);
          shift.set(
            withTiming(
              forward ? -page : page,
              { duration, easing: Easing.out(Easing.quad) },
              (finished) => {
                if (finished) runOnJS(commit)(forward ? 1 : -1);
              },
            ),
          );
        }),
    [reducedMotion, canStepBack, canStepForward, page, shift, settling, commit],
  );

  /** The arrows travel the same way, so both routes feel like one control. */
  const stepWithSlide = useCallback(
    (direction: number) => {
      if (reducedMotion || settling.get()) {
        commit(direction);
        return;
      }
      settling.set(1);
      shift.set(
        withTiming(
          direction > 0 ? -page : page,
          { duration: 220, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(commit)(direction);
          },
        ),
      );
    },
    [reducedMotion, page, shift, settling, commit],
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
            aria-hidden
          >
            {letter}
          </Text>
        ))}
      </View>

      {/*
        The grid answers a horizontal drag as well as the arrows. A swipe is
        what a calendar teaches people to expect and costs nothing to offer;
        the arrows stay because a swipe nobody guesses at is not an
        affordance. The drag is tracked on the UI thread, and claims the touch
        only once the movement is decidedly sideways, which is what keeps the
        page scrolling normally.
      */}
      {/*
        Three months in a row, and the viewport shows the middle one. The month
        either side is really there, so a drag reveals where it is going rather
        than sliding the current one out to nothing — which is what made the
        old version feel like a transition played at somebody rather than a
        page being turned by them.
      */}
      <GestureDetector gesture={pan}>
        <View style={{ width: page, overflow: "hidden" }}>
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
              onSelectDay={tapDay}
              interactive={entry.current}
            />
          ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {/*
        The key. Without words this is a grid of coloured circles, which is
        the one thing a status in this product may never be.
      */}
      <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2">
        {(["open", "tight"] as const).map((choice) => (
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

      {monthSeasons.length ? (
        <SeasonList
          seasons={monthSeasons}
          openIds={openSeasons.ids}
          onToggle={toggleSeason}
        />
      ) : null}
    </View>
  );
}

/** Space round each disc; the season track fills it. */
const DISC_INSET = 4;

/**
 * The seasons that touch the month on screen, each with its level in words.
 *
 * The track behind the discs says "something is happening on these days";
 * this says what. A row opens to the message Super Admin wrote for it, and a
 * chosen day inside a season opens that season's row by itself — the moment
 * a client picks graduation week is the moment the heads-up is worth reading.
 */
function SeasonList({
  seasons,
  openIds,
  onToggle,
}: {
  seasons: SeasonWindow[];
  openIds: string[];
  onToggle: (id: string) => void;
}) {
  const colors = useThemeColors();

  return (
    <View className="mt-5">
      <View className="gg-card-flush">
        {seasons.map((window, index) => {
          const open = openIds.includes(window.id);
          return (
            <View key={window.id}>
              {index > 0 ? <View className="gg-divider" /> : null}
              <Pressable
                onPress={() => onToggle(window.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${window.demandLevel} season, ${window.name}, ${seasonRange(window)}`}
                className="gg-touch px-4 py-3"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <View className="flex-row items-center gap-3">
                  <SeasonLevelTag level={window.demandLevel} />
                  <Text
                    className="min-w-0 flex-1 text-body font-medium text-text-primary"
                    numberOfLines={1}
                  >
                    {window.name}
                  </Text>
                  <Text className="text-caption text-text-muted">{seasonRange(window)}</Text>
                  <ChevronDown
                    size={16}
                    color={colors.textMuted}
                    strokeWidth={2}
                    style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
                  />
                </View>
                {open && window.message ? (
                  <Text className="mt-2 text-body text-text-secondary">{window.message}</Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text className="mt-2 text-caption text-text-muted">{SEASON_AWARENESS_NOTE}</Text>
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
      aria-hidden={!interactive}
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

  const track = useSeasonTrackColour();
  const fill = discColour(day.choice, light);
  const ink = numeralColour(day.choice, light);
  const seasonText = day.season ? seasonAccessibilityText(day.season.windows) : null;
  // A season day nobody can make still answers a tap — with its season's
  // message, never with a selection.
  const pressable = day.selectable || (day.inMonth && day.season !== null);
  // A white disc on a white page is not a disc. It becomes an outlined circle
  // there instead, which is what vacant looks like anyway.
  const needsEdge = day.choice === "open" && light;

  return (
    <Pressable
      onPress={() => onSelect(day)}
      disabled={!pressable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !day.selectable }}
      // The whole answer: a screen reader gets no colour and no shape.
      accessibilityLabel={`${day.day}: ${choiceLabel(day.choice)}${seasonText ? `. ${seasonText}` : ""}`}
      style={({ pressed }) => ({
        width: cell,
        height: cell,
        alignItems: "center",
        justifyContent: "center",
        opacity: day.inMonth ? (pressed && day.selectable ? 0.7 : 1) : 0.12,
      })}
    >
      {/*
        The season track, behind the disc. It runs edge to edge into a
        neighbour of the same level, so a season reads as one stroke across
        the week, and rounds off where the season (or the row) ends. A pixel
        short of the cell top and bottom keeps two weeks' tracks apart.
      */}
      {day.season ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            left: day.season.joinsPrevious ? 0 : 1,
            right: day.season.joinsNext ? 0 : 1,
            backgroundColor: track(day.season.level),
            borderTopLeftRadius: day.season.joinsPrevious ? 0 : 999,
            borderBottomLeftRadius: day.season.joinsPrevious ? 0 : 999,
            borderTopRightRadius: day.season.joinsNext ? 0 : 999,
            borderBottomRightRadius: day.season.joinsNext ? 0 : 999,
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
          opacity: paintedChoice(day.choice) === "past" ? 0.5 : 1,
        }}
      >
        {/*
          The date itself. The reference carries none, but a client picking a
          deadline has to name a day to somebody later, and counting rows to
          work out which disc is the twelfth is not a thing to ask of them.
        */}
        {/*
          The chosen day is ringed from the inside.

          It cannot grow: a disc bigger than its cell overlaps the days beside
          it, which is a calendar that looks broken at the one moment the
          client has just made a decision. It cannot take a new colour either —
          white and yellow are spoken for here, and a third would be
          read against two meanings that already exist.

          So the mark is drawn in the disc's own ink, inside its own edge. That
          ink is chosen to be legible on the fill by construction, which makes
          this the one treatment that reads identically on a white day and a
          yellow one.
        */}
        {selected ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              right: 3,
              bottom: 3,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: ink,
            }}
          />
        ) : null}
        <Text
          className={selected ? "font-bold" : undefined}
          style={{
            fontSize: Math.max(11, Math.round(disc * 0.34)),
            color: ink,
            fontVariant: ["tabular-nums"],
          }}
          allowFontScaling={false}
          aria-hidden
        >
          {day.day}
        </Text>
      </View>
    </Pressable>
  );
});


/**
 * The month before GRIDGO has answered for it.
 *
 * The screen used to paint every day as available and then repaint most of
 * them unavailable a moment later, which is a flicker on open and again on
 * every swipe past what has been answered for. Holding the shape still until
 * the answer lands is both calmer and more honest: GRIDGO does not yet know,
 * and a grid of grey discs says exactly that.
 *
 * The same geometry as the real month, so nothing moves when it arrives.
 */
export function DeadlineCalendarSkeleton() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 32) / 7);
  const disc = cell - DISC_INSET * 2;

  return (
    <View accessibilityLabel="Loading which dates are possible">
      <View
        style={{
          width: 150,
          height: 78,
          borderRadius: 12,
          backgroundColor: colors.surfaceVariant,
        }}
      />
      <View style={{ marginTop: 8, gap: 6 }}>
        <View style={{ width: 130, height: 20, borderRadius: 6, backgroundColor: colors.surfaceVariant }} />
        <View style={{ width: 70, height: 16, borderRadius: 6, backgroundColor: colors.surfaceVariant }} />
      </View>

      <View style={{ marginTop: 24, flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: 42 }, (_, index) => (
          <View key={index} style={{ width: cell, height: cell, alignItems: "center", justifyContent: "center" }}>
            <View
              style={{
                width: disc,
                height: disc,
                borderRadius: 999,
                backgroundColor: colors.surfaceVariant,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
