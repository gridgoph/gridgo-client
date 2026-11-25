import { useSession } from "@/store/session";

/**
 * Reads that belong to one account and to the newest ask.
 *
 * `run` answers null when the account changed or a newer read of the same kind
 * started while this one was out, so a slow answer can never overwrite a newer
 * one or show one account's members to another.
 */
export function ownedReads() {
  const sequence = new Map<string, number>();
  return {
    /** Anything still out is dropped when it lands. */
    cancel: () => sequence.forEach((value, key) => sequence.set(key, value + 1)),
    run: async <T>(key: string, read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> => {
      const ownerId = useSession.getState().user?.id ?? null;
      if (!ownerId) return null;
      const mine = (sequence.get(key) ?? 0) + 1;
      sequence.set(key, mine);
      const current = () => sequence.get(key) === mine && useSession.getState().user?.id === ownerId;
      try {
        const value = await read();
        return current() ? { ok: true, value } : null;
      } catch (error) {
        return current() ? { ok: false, error } : null;
      }
    },
  };
}

/** Runs when somebody else, or nobody, is signed in. */
export function onAccountChange(reset: () => void): void {
  useSession.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id) reset();
  });
}
