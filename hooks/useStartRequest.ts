import { useCallback, useState } from "react";
import { useRouter } from "expo-router";

import { draftHasContent, useRequestDraft } from "@/store/requestDraft";

type Pending = {
  /** What the client asked to start, named in the confirmation. */
  label: string;
  seed: () => void;
};

/**
 * Starting a request, without silently throwing away the one in progress.
 *
 * A draft survives the app being killed, so replacing it is a real loss and is
 * always asked about first. Home (reorder) and the category screens both start
 * requests, and both have to ask the same question the same way.
 */
export function useStartRequest() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);

  const go = useCallback(() => {
    router.dismissTo("/(tabs)/new-request");
  }, [router]);

  const start = useCallback(
    (label: string, seed: () => void) => {
      if (draftHasContent(useRequestDraft.getState())) {
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
