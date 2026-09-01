import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DeadlineCalendar, DeadlineCalendarSkeleton } from "@/components/DeadlineCalendar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { findCategory } from "@/lib/productCategories";
import * as api from "@/lib/api";
import { prefetchMatch } from "@/lib/matchPrefetch";
import { needsDropoffFirst } from "@/hooks/useStartPrintJob";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import {
  canStep,
  deadlineFor,
  monthGrid,
  monthName,
  nextMonthWithADay,
  openMonth,
  openingMonth,
  shiftMonth,
} from "@/lib/deadlineCalendar";

/**
 * When the client needs it.
 *
 * The one question worth asking before a shop is chosen, because a date means
 * the same thing at every shop whatever unit it sells in. Quantity cannot come
 * this early for the same reason in reverse: "how many" has no meaning until a
 * listing says what one of them is.
 *
 * It is a filter, not a preference. A shop that cannot finish by this is not
 * offered at all rather than ranked below one that can — "can you make Friday"
 * is not something to weigh against a price, and a marketplace that treats it
 * as one hands over the best shop that happens to miss the date and only admits
 * it at checkout.
 *
 * "No rush" is a real answer and the screen says so, because a client with no
 * deadline should not have to invent one to get past this.
 */
export default function WhenScreen() {
  const router = useRouter();
  const { subcategory, category } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
  }>();

  const setDeadline = useJobDeadline((state) => state.set);
  const cart = useCart((state) => state.cart);
  const cartId = useCart((state) => state.cartId);
  const dropoff = cart?.defaultDropoff ?? null;

  const [chosen, setChosen] = useState<string | null>(null);
  const [availability, setAvailability] = useState<api.DeadlineDay[] | null>(null);
  const [availabilityFailed, setAvailabilityFailed] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  // Opened on a month that has something in it. A job whose soonest date is
  // next month otherwise opens on a page of struck days, which reads as
  // "GRIDGO cannot print this" rather than "not this month".
  const [monthPinned, setMonthPinned] = useState(false);

  /*
    Which days GRIDGO could actually make. Asked of the platform because the
    queues behind the answer are the shops' own, and asked once for the whole
    month rather than per tap.

    A failure is not a dead end: the screen falls back to letting any future
    day be chosen, and the match is still the thing that decides. Better a
    client picks a date GRIDGO then cannot make than cannot pick at all.
  */
  useEffect(() => {
    if (!subcategory) return;
    let alive = true;
    api
      .deadlineDays(subcategory)
      .then((answer) => {
        if (!alive) return;
        setAvailability(answer.days);
        if (!monthPinned) setMonth(openingMonth(answer.days, new Date()));
      })
      .catch(() => {
        if (alive) setAvailabilityFailed(true);
      });
    return () => {
      alive = false;
    };
    // `monthPinned` is deliberately absent: it decides what to do with an
    // answer, not whether to ask for one, and including it would re-fetch
    // availability every time the client turned a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategory]);

  // Built per month rather than once, because the calendar draws the month
  // either side of this one as well: a drag has to reveal a real neighbour,
  // not slide the current month out to nothing.
  const daysFor = useCallback(
    (which: Date) =>
      monthGrid({
        month: which,
        // With no answer yet, every future day is offered rather than none:
        // an empty month reads as "GRIDGO cannot print this at all".
        availability: availability ?? openMonth(which),
        now: new Date(),
      }),
    [availability],
  );

  // Stable, so the calendar's day cells can skip re-rendering. An arrow made
  // in the render is a new function every time and defeats their memo, which
  // is what put a hundred and twenty-six cells through React on every swipe.
  // A month the client chose stays chosen: a late answer must not yank the
  // page out from under them.
  const stepMonth = useCallback((step: number) => {
    setMonthPinned(true);
    setMonth((current) => shiftMonth(current, step));
  }, []);

  const selectDay = useCallback((day: { dayKey: string; selectable: boolean }) => {
    if (day.selectable) setChosen(day.dayKey);
  }, []);

  const jumpTo = useMemo(
    () => nextMonthWithADay(month, availability ?? [], new Date()),
    [month, availability],
  );

  const thing = useMemo(() => {
    const found = findCategory(api.productCategoriesNow(), category ?? "")?.subcategories.find(
      (entry) => entry.code === subcategory,
    );
    return (found?.name ?? "this").toLowerCase();
  }, [category, subcategory]);

  const go = (by: string | null) => {
    setDeadline(by);
    const needsDropoff = needsDropoffFirst(dropoff);
    if (!needsDropoff && subcategory) {
      prefetchMatch({
        subcategoryCode: subcategory,
        dropoff,
        deadline: by,
        ...(cartId ? { cartId } : {}),
      });
    }
    router.push({
      pathname: needsDropoff ? "/request/where" : "/request/match",
      params: { subcategory: subcategory ?? "", category: category ?? "" },
    });
  };

  return (
    <Screen edges={["bottom"]}>
      {/*
        The month scrolls and the two actions do not. On a short phone six rows
        of days plus a legend runs past the fold, and a client who has to
        scroll to reach the control that finishes the screen will scroll back
        up to check the date and lose the button again.
      */}
      <ScrollView
        className="gg-screen flex-1"
        contentContainerClassName="gg-page pb-4 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-h2 text-text-primary">When do you need your {thing}?</Text>
        {/*
          One line, not three. The old paragraph explained the rule this
          calendar now simply shows -- a day GRIDGO cannot make is struck
          through -- and spent a third of the screen saying it.
        */}
        <Text className="mt-1 text-body text-text-secondary">
          Only the days a printer can actually make.
        </Text>

        <View className="mt-4">
          {/*
            Held until GRIDGO answers. Painting an optimistic month and then
            repainting most of it unavailable a moment later is a flicker on
            open, and again on every swipe past what has been answered for.
          */}
          {availability || availabilityFailed ? (
          <DeadlineCalendar
            daysFor={daysFor}
            month={month}
            selectedDayKey={chosen}
            onSelectDay={selectDay}
            onStepMonth={stepMonth}
            canStepBack={canStep(month, -1, availability ?? [], new Date())}
            canStepForward={canStep(month, 1, availability ?? [], new Date())}
          />
          ) : (
            <DeadlineCalendarSkeleton />
          )}
        </View>

        {/*
          A month with nothing in it is honest but unhelpful on its own: it
          says "not these days" without saying where to look. This is what the
          captain's screenshot was actually showing — a page of unavailable
          days with no clue that moving forward would help.
        */}
        {jumpTo ? (
          <Pressable
            onPress={() => {
              setMonthPinned(true);
              setMonth(jumpTo);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${monthName(jumpTo)}`}
            className="gg-panel mt-4 flex-row items-center justify-between gap-3 p-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="min-w-0 flex-1 text-body text-text-secondary">
              Nothing this month. The soonest is in {monthName(jumpTo)}.
            </Text>
            <Text className="text-body font-medium text-text-primary">Go there</Text>
          </Pressable>
        ) : null}

        {availabilityFailed ? (
          <Text className="mt-4 text-caption text-text-muted">
            GRIDGO could not check which dates are possible just now. Pick the date you
            want and we will tell you if nobody can make it.
          </Text>
        ) : null}

      </ScrollView>

      <View className="gg-page gap-3 pb-2 pt-2">
          <PrimaryButton
            // The date is already the largest thing on the screen. Repeating it
            // here wrapped the control onto two lines to say what the masthead
            // had just said.
            label={chosen ? "Continue" : "Pick a date"}
            onPress={() => go(chosen ? deadlineFor(chosen) : null)}
            disabled={!chosen}
          />
          {/*
            A second, quieter way through. A client with no deadline should not
            have to invent one, and inventing one would filter out shops that
            could have done the job.
          */}
        <SecondaryButton label="No rush — show me anyone" onPress={() => go(null)} />
      </View>
    </Screen>
  );
}
