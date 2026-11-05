import { useEffect, useState } from "react";
import { Text } from "react-native";

import type { DeadlineDay, SameDayOrderBy } from "@/lib/api";
import { sameDayOrderByLine } from "@/lib/deadlineCalendar";

/**
 * Today's last order time, under the earliest line on the date screen. It keeps
 * its own clock so a tick redraws this line and not the month.
 */
export function SameDayOrderByNote({
  orderBy,
  days,
}: {
  orderBy: SameDayOrderBy;
  days: readonly DeadlineDay[];
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const line = sameDayOrderByLine(orderBy, days, now);
  if (!line) return null;
  return (
    <Text className="mt-1 text-body font-medium text-text-primary" accessibilityLiveRegion="polite">
      {line}
    </Text>
  );
}
