import { useEffect } from "react";

import { accountHold } from "@/lib/accountHold";
import { subscribeLive } from "@/lib/live";
import { usePlatformSettings } from "@/store/platformSettings";
import { useSession } from "@/store/session";

/**
 * GRIDGO's charges, read for the signed-in client and kept current.
 *
 * Every price the app draws is the shop's figure plus GRIDGO's charge
 * (`lib/clientPrice.ts`), so the rate has to be known before the first match
 * row, not first at checkout. Mounted once above every route: it reads
 * `GET /settings` as soon as a session exists and again whenever GRIDGO says
 * its settings changed. A failed read keeps whatever the phone last held;
 * with nothing held, prices wait on their skeleton rather than showing the
 * shop's own number.
 */
export function useGridgoCharges(): void {
  const owner = useSession((s) => s.user?.id ?? null);
  const held = useSession((s) => accountHold(s.user) != null);
  const load = usePlatformSettings((s) => s.load);
  useEffect(() => {
    if (!owner || held) return;
    const read = () => {
      load({ refresh: true }).catch(() => {
        /* Last known rate stands; the screens draw nothing raw meanwhile. */
      });
    };
    read();
    return subscribeLive((resource) => {
      if (resource === "settings" || resource === "*") read();
    });
  }, [owner, held, load]);
}
