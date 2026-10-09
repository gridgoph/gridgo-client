import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { useVouchers } from "@/store/vouchers";

/**
 * GRIDGO's time now, redrawn every `tickMs`. The wallet's countdowns run on
 * this so a phone with a wrong clock still counts down to GRIDGO's expiry.
 */
export function useServerNow(tickMs: number): number {
  const offsetMs = useVouchers((state) => state.offsetMs);
  const [phoneNow, setPhoneNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setPhoneNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return phoneNow + offsetMs;
}

/**
 * Reads the wallet again when the app comes back to the foreground: a held
 * voucher may have been released, or one may have expired, while it was away.
 */
export function useWalletOnResume(read: () => void): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") read();
    });
    return () => subscription.remove();
  }, [read]);
}
