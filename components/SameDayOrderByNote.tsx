import { useEffect, useState } from "react";
import { Text } from "react-native";

import type { DeadlineDay, SameDayOrderBy } from "@/lib/api";
import { crossedSameDayOrderBy, sameDayOrderByLine } from "@/lib/deadlineCalendar";

/**
 * Today's last order time, under the earliest line on the date screen.
 *
 * It keeps its own clock so a tick redraws this line and not the month. When
 * the clock crosses the time it tells the screen, which asks GRIDGO again: the
 * dates and this line then change together.
 */
export function SameDayOrderByNote({
  orderBy,
  days,
  onCrossed,
}: {
  orderBy: SameDayOrderBy;
  days: readonly DeadlineDay[];
  onCrossed: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const { at, passed } = orderBy;

  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      const next = Date.now();
      if (crossedSameDayOrderBy({ at, passed }, last, next)) onCrossed();
      last = next;
      setNow(new Date(next));
    }, 1_000);
    return () => clearInterval(timer);
  }, [at, passed, onCrossed]);

  const line = sameDayOrderByLine(orderBy, days, now);
  if (!line) return null;
  return (
    <Text className="mt-1 text-body font-medium text-text-primary" accessibilityLiveRegion="polite">
      {line}
    </Text>
  );
}
