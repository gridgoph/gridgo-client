import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DeadlineCalendar, DeadlineCalendarSkeleton } from "@/components/DeadlineCalendar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TourTarget } from "@/components/TourTarget";
import { findCategory } from "@/lib/productCategories";
import * as api from "@/lib/api";
import {
  basketDates,
  basketMatchContext,
  groupDateLabel,
  groupDateLine,
  SAME_DATE_NOTE,
  type BasketDate,
} from "@/lib/basketGroups";
import { clearMatchPrefetch, prefetchMatch } from "@/lib/matchPrefetch";
import { fulfilmentStepFor } from "@/lib/requestFulfilment";
import { userFacingError } from "@/lib/copy";
import { needsDropoffFirst } from "@/hooks/useStartPrintJob";
import { useTourScreen } from "@/hooks/useTourScreen";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useJobFulfilment, withJobFulfilment } from "@/store/jobFulfilment";
import { useSeasonWindows } from "@/store/seasonWindows";
import { withJobRanking } from "@/store/orderRanking";
import {
  canStep,
  deadlineFor,
  earliestReadyLine,
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
 *
 * Every product keeps its own date (gridgo-client#189): a second product is
 * asked afresh, with the dates already in the order offered first, because the
 * same date from the same shop rides in the same delivery. "Add more from
 * Shop A" is the one exception — that group is one shop on one date, so its
 * date is shown rather than asked.
 *
 * Checkout opens it in `mode=group` to move one group's products to another
 * date (or give them one: a basket in several groups needs a date on every
 * product). That writes the date to those lines and comes back.
 */
export default function WhenScreen() {
  const router = useRouter();
  const { subcategory, category, mode, lineIds, label, current } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
    /** `group`: checkout is moving one group's products to another date. */
    mode?: string;
    /** The group's line ids, comma-separated, in `mode=group`. */
    lineIds?: string;
    /** The group's label, in `mode=group`. */
    label?: string;
    /** The group's date now, in `mode=group`; absent while it has none. */
    current?: string;
  }>();
  const groupMode = mode === "group";
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setDeadline = useJobDeadline((state) => state.set);
  const setFulfilment = useJobFulfilment((state) => state.set);
  const cart = useCart((state) => state.cart);
  const dropoff = cart?.defaultDropoff ?? null;
  /*
    "Add more from Shop A": that group is one shop on one date, so the new
    product joins it on that date. Choosing another date lets go of the group
    — it becomes a product of its own, matched against every shop.
  */
  const targetGroupId = useBasketGroupTarget((state) => state.groupId);
  const targetLabel = useBasketGroupTarget((state) => state.label);
  const targetDeadline = useBasketGroupTarget((state) => state.deadline);
  const locked = !groupMode && targetGroupId != null;
  /** Dates other products in this order already have, soonest first. */
  const inOrder = useMemo(() => {
    const dates = basketDates(cart);
    // Moving a group: its own date is not "another" date to move it to.
    if (!groupMode || !cart) return dates;
    const own = new Set((lineIds ?? "").split(",").filter(Boolean));
    const others = cart.lines.filter((line) => !own.has(line.id));
    return basketDates({ ...cart, lines: others });
  }, [cart, groupMode, lineIds]);

  const [chosen, setChosen] = useState<string | null>(null);
  // Season windows shade the month as a heads-up. They never decide which
  // days can be picked — that is `availability` alone.
  const seasons = useSeasonWindows((state) => state.seasons.windows);
  const loadSeasons = useSeasonWindows((state) => state.load);
  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);
  useTourScreen("when");
  const [availability, setAvailability] = useState<api.DeadlineDay[] | null>(null);
  const [earliest, setEarliest] = useState<string | null>(null);
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
    if (!subcategory || locked) return;
    let alive = true;
    api
      .deadlineDays(subcategory)
      .then((answer) => {
        if (!alive) return;
        setAvailability(answer.days);
        setEarliest(answer.earliest);
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
  }, [subcategory, locked]);

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
        seasons,
      }),
    [availability, seasons],
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

  /** A day the availability answer allows; any day while there is no answer. */
  const pickable = (dayKey: string) =>
    !availability || availability.some((entry) => entry.day === dayKey && entry.state !== "cannot");

  /** A date already in the order: chosen, and its month brought into view. */
  const pickInOrder = (entry: BasketDate) => {
    setChosen(entry.dayKey);
    setMonthPinned(true);
    setMonth(new Date(`${entry.dayKey}T12:00:00`));
  };

  /**
   * Move a checkout group's products to the chosen date, one line at a time.
   * GRIDGO rechecks each against it; every answer is the basket as it now
   * stands, so a refusal halfway leaves the phone showing what really moved.
   */
  const moveGroup = async (by: string) => {
    const ids = (lineIds ?? "").split(",").filter(Boolean);
    const { run, adopt } = useCart.getState();
    setSaving(true);
    setSaveError(null);
    try {
      for (const lineId of ids) adopt(await run((cartId) => api.updateCartLine(cartId, lineId, { deadline: by })));
      router.back();
    } catch (e) {
      setSaveError(userFacingError(e, "GRIDGO could not move these items to that date. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const confirm = () => {
    if (!chosen || saving) return;
    if (groupMode) {
      void moveGroup(deadlineFor(chosen));
      return;
    }
    go(deadlineFor(chosen));
  };

  const go = (by: string | null) => {
    setDeadline(by);
    const params = { subcategory: subcategory ?? "", category: category ?? "" };
    // Delivery or pick-up comes next (#158), unless the basket has already
    // settled it: a job joining a basket travels the way that basket does.
    const step = fulfilmentStepFor(useCart.getState().cart);
    if (step === "ask") {
      router.push({ pathname: "/request/fulfilment", params });
      return;
    }
    setFulfilment(step === "locked" ? (useCart.getState().cart?.requestFulfillment ?? null) : null);
    // The match on the usual order starts now, while the client confirms or
    // re-ranks it on the next step: confirming or skipping — the common case —
    // then finds the answer already waiting. A re-rank asks again.
    if (!needsDropoffFirst(dropoff) && subcategory) {
      prefetchMatch(
        withJobRanking(
          withJobFulfilment(
            {
              subcategoryCode: subcategory,
              ...basketMatchContext(useCart.getState().cart, by, useBasketGroupTarget.getState().groupId),
            },
            dropoff,
          ),
        ),
      );
    }
    router.push({ pathname: "/request/rank", params });
  };

  if (locked) {
    return (
      <GroupDate
        thing={thing}
        label={targetLabel ?? "this shop"}
        deadline={targetDeadline}
        onContinue={() => go(targetDeadline)}
        onChange={() => {
          clearMatchPrefetch();
          useBasketGroupTarget.getState().clear();
        }}
      />
    );
  }

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
        <Text className="text-h2 text-text-primary">
          {groupMode ? `New date for ${label ?? "these items"}` : `When do you need your ${thing}?`}
        </Text>
        {groupMode ? (
          <Text className="mt-1 text-body text-text-secondary">
            {current ? `${groupDateLine(current)} now. ` : ""}Every item in this group moves to the
            date you pick, and GRIDGO checks the shop can still make it.
          </Text>
        ) : null}
        {/*
          One line, not three. The old paragraph explained the rule this
          calendar now simply shows — a day nobody can make sits quiet, like
          the past — and spent a third of the screen saying it. The earliest
          date is the line that replaced the red discs.
        */}
        <Text className="mt-1 text-body text-text-secondary">
          Only the days a printer can actually make.
        </Text>
        {availability && !availabilityFailed ? (
          <Text className="mt-1 text-body text-text-secondary">
            {earliestReadyLine(earliest)}
          </Text>
        ) : null}

        {inOrder.length > 0 ? (
          <DatesInOrder dates={inOrder} chosen={chosen} pickable={pickable} onPick={pickInOrder} />
        ) : null}

        <TourTarget step="when" className="mt-4">
          {/*
            Held until GRIDGO answers. Painting an optimistic month and then
            repainting most of it unavailable a moment later is a flicker on
            open, and again on every swipe past what has been answered for.
          */}
          {availability || availabilityFailed || !subcategory ? (
          <DeadlineCalendar
            daysFor={daysFor}
            month={month}
            selectedDayKey={chosen}
            onSelectDay={selectDay}
            onStepMonth={stepMonth}
            canStepBack={canStep(month, -1, availability ?? [], new Date())}
            canStepForward={canStep(month, 1, availability ?? [], new Date())}
            seasons={seasons}
          />
          ) : (
            <DeadlineCalendarSkeleton />
          )}
        </TourTarget>

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
            label={saving ? "Saving the date…" : chosen ? (groupMode ? "Use this date" : "Continue") : "Pick a date"}
            onPress={confirm}
            disabled={!chosen || saving}
          />
          {saveError ? (
            <Text className="text-center text-caption text-error" accessibilityLiveRegion="polite">
              {saveError}
            </Text>
          ) : null}
          {/*
            A second, quieter way through. A client with no deadline should not
            have to invent one, and inventing one would filter out shops that
            could have done the job.
          */}
          {groupMode ? null : (
            <SecondaryButton label="No rush — show me anyone" onPress={() => go(null)} />
          )}
      </View>
    </Screen>
  );
}

/**
 * The dates other products in this order already have, as one-tap choices.
 *
 * Every product keeps its own date, so nothing here is forced — but the same
 * date from the same shop is one delivery, so a client lining things up for
 * one day should not have to find it on the calendar again. A day this product
 * cannot make is shown and said, not hidden: "why is my date missing" is a
 * worse question than "why can't this one make it".
 */
function DatesInOrder({
  dates,
  chosen,
  pickable,
  onPick,
}: {
  dates: BasketDate[];
  chosen: string | null;
  pickable: (dayKey: string) => boolean;
  onPick: (entry: BasketDate) => void;
}) {
  return (
    <View className="mt-4 gap-2" testID="dates-in-order">
      <Text className="text-overline text-text-muted">ALREADY IN YOUR ORDER</Text>
      <View className="flex-row flex-wrap gap-2">
        {dates.map((entry) => {
          const can = pickable(entry.dayKey);
          const selected = chosen === entry.dayKey;
          const items = entry.itemCount === 1 ? "1 item" : `${entry.itemCount} items`;
          return (
            <Pressable
              key={entry.dayKey}
              onPress={() => onPick(entry)}
              disabled={!can}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !can }}
              accessibilityLabel={
                can
                  ? `${entry.label}, ${items} already on this date`
                  : `${entry.label}, ${items} already on this date. Not possible for this item.`
              }
              className={
                selected
                  ? "gg-touch rounded-field border border-accent bg-accent px-3 py-2"
                  : can
                    ? "gg-touch rounded-field border border-outline bg-surface px-3 py-2"
                    : "gg-touch gg-disabled rounded-field border border-outline-subtle bg-surface-variant px-3 py-2"
              }
              style={({ pressed }) => (pressed && can ? { opacity: 0.8 } : undefined)}
            >
              <Text className={selected ? "text-body font-medium text-accent-on" : "text-body font-medium text-text-primary"}>
                {entry.label}
              </Text>
              <Text className={selected ? "text-caption text-accent-on" : "text-caption text-text-muted"}>
                {can ? items : "Not possible for this"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-caption text-text-muted">{SAME_DATE_NOTE}</Text>
    </View>
  );
}

/**
 * "Add more from Shop A": the group is one shop on one date, so its date is
 * shown, not asked. Another date is a different delivery, which is what the
 * second button says.
 */
function GroupDate({
  thing,
  label,
  deadline,
  onContinue,
  onChange,
}: {
  thing: string;
  label: string;
  deadline: string | null;
  onContinue: () => void;
  onChange: () => void;
}) {
  const day = deadline ? groupDateLabel(deadline) : null;
  return (
    <Screen edges={["bottom"]}>
      <View className="gg-screen gg-page flex-1 pt-2">
        <Text className="text-h2 text-text-primary">When do you need your {thing}?</Text>
        <Text className="mt-1 text-body text-text-secondary">
          It joins {label}, so it comes on {label}&apos;s date, in the same delivery.
        </Text>
        <View
          className="gg-card mt-6 gap-1"
          accessible
          accessibilityLabel={`${label}'s date: ${day ?? "no set date"}. No extra delivery fee.`}
        >
          <Text className="text-overline text-text-muted">{label.toUpperCase()}&apos;S DATE</Text>
          <Text className="text-h3 text-text-primary">{day ?? "No set date"}</Text>
          <Text className="text-caption text-text-muted">
            Same shop, same date: no extra delivery fee.
          </Text>
        </View>
      </View>
      <View className="gg-page gap-3 pb-2 pt-2">
        <PrimaryButton label="Continue" onPress={onContinue} />
        <SecondaryButton label="Pick a different date" onPress={onChange} />
      </View>
    </Screen>
  );
}
