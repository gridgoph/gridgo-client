import { useEffect, useState } from "react";

import { parseDeadline } from "@/lib/deadline";

/**
 * Whether the clock has reached an instant. Checked straight away, so one
 * already behind the clock counts, then once a second until it is reached. Only
 * the change redraws the caller, never the ticks.
 */
export function useTimeReached(at: string | null): boolean {
  const [reached, setReached] = useState<string | null>(null);

  useEffect(() => {
    const ms = parseDeadline(at)?.getTime();
    if (ms == null) return;
    const check = () => {
      if (Date.now() < ms) return;
      clearInterval(timer);
      setReached(at);
    };
    const timer = setInterval(check, 1_000);
    const first = setTimeout(check, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [at]);

  return at != null && reached === at;
}
