import { useCallback, useState } from "react";
import { useRouter } from "expo-router";

import type { RequestDraftFields } from "@/lib/requestValidation";
import { draftHasContent, draftHolds, useRequestDraft } from "@/store/requestDraft";

type Pending = {
  /** What the client asked to start, named in the confirmation. */
  label: string;
  seed: () => void;
};

/** The stepper is a hidden tab, so every caller of this hook sits beside it. */
export const REQUEST_STEPPER_HREF = "/(tabs)/new-request";

/**
 * Starting a request, without silently throwing away the one in progress.
 *
 * A draft survives the app being killed, so replacing it is a real loss and is
 * always asked about first — unless the draft already is the request being
 * started (`seeded`), when there is nothing to lose. Home, Orders and the
 * quick actions all reorder through here, so they ask the same question the
 * same way.
 *
 * The stepper is opened with `navigate`, never `dismissTo`: every caller is
 * inside the tab navigator, which ignores the `POP_TO` that `dismissTo` sends.
 * That is how a reorder used to fill the draft and leave the client on Home,
 * and how the next tap then asked to replace a draft they had never seen.
 */
export function useStartRequest() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);

  const go = useCallback(() => {
    router.navigate(REQUEST_STEPPER_HREF);
  }, [router]);

  const start = useCallback(
    (label: string, seed: () => void, seeded?: RequestDraftFields) => {
      const draft = useRequestDraft.getState();
      if (seeded && draftHolds(draft, seeded)) {
        go();
        return;
      }
      if (draftHasContent(draft)) {
        setPending({ label, seed });
        return;
      }
      seed();
      go();
    },
    [go],
  );

  const confirmReplace = useCallback(() => {
    pending?.seed();
    setPending(null);
    go();
  }, [pending, go]);

  const cancelReplace = useCallback(() => setPending(null), []);

  return { start, pendingLabel: pending?.label ?? null, confirmReplace, cancelReplace };
}
