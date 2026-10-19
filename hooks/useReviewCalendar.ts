import { useEffect } from "react";

import { reviewHoursPhrase } from "@/lib/operatingHours";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * GRIDGO's review hours and dispatch cutoff, from `GET /settings`, for the
 * date step's header and the reason a too-late today is given
 * (gridgo-api#292). Neither decides a day — the platform's answer does — and
 * both are null until the settings arrive.
 */
export function useReviewCalendar(): { reviewHours: string | null; cutoffMinute: number | null } {
  const settings = usePlatformSettings((state) => state.settings);
  const load = usePlatformSettings((state) => state.load);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  return {
    reviewHours: reviewHoursPhrase(settings),
    cutoffMinute: settings?.operatingHours?.priorityDispatchCutoffMinute ?? null,
  };
}
